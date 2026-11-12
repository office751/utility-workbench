/**
 * receipt-upload — the "send" behind the receipt page (public/receipt).
 *
 * Josh, Pam (Iron Shield) and Dylan (Stonebridge) each open their own link,
 * snap or upload a receipt, say what it was for, and tap Send. We:
 *   1. check the secret key from their link,
 *   2. check what they filled in (Iron Shield: which house / gas / shop;
 *      Stonebridge: customer, category, store, amount, card),
 *   3. email the photos from office@ to THEIR accounting inbox (receipt_people.send_to),
 *   4. log it in receipt_uploads (no photos stored — the Sent Items copy is the record).
 *
 * Setup: supabase/setup-receipts.sql. Houses come from sub_invoice_houses (synced daily
 * from Monday) and the mail sign-in from the vault, same as the sub invoice page.
 * Deployed with verify_jwt = false: the link key is the lock.
 */
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "office@ironshieldconstruction.com";
const DAILY_LIMIT = 40;              // receipts per person per day — a runaway/abuse stop
const MAX_FILES = 6;
const MAX_TOTAL_B64 = 3_600_000;     // Microsoft's send limit is ~4 MB per email; stay under it

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const str = (x: unknown, min: number, max: number) => typeof x === "string" && x.trim().length >= min && x.trim().length <= max;
const clean = (x: unknown) => String(x ?? "").trim().replace(/\s+/g, " ");

// What kind of file is it? Judge by its first bytes, not by what the phone claims.
const kindOf = (b64: string) =>
  b64.startsWith("/9j/") ? { ext: "jpg", type: "image/jpeg" } :
  b64.startsWith("iVBOR") ? { ext: "png", type: "image/png" } :
  b64.startsWith("JVBERi") ? { ext: "pdf", type: "application/pdf" } : null;

async function recent(person: string) {
  const rows = await (await db(`receipt_uploads?person=eq.${person}&emailed_at=not.is.null&select=created_at,subject,photo_count&order=id.desc&limit=10`)).json();
  return rows.map((r: any) => ({ at: r.created_at, subject: r.subject, photos: r.photo_count }));
}

async function graphToken() {
  const keys: Record<string, string> = {};
  for (const r of await (await db("rpc/sub_invoice_mail_keys", { method: "POST", body: "{}" })).json()) keys[r.name] = r.secret;
  const res = await fetch(`https://login.microsoftonline.com/${keys.sub_invoice_graph_tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default",
      client_id: keys.sub_invoice_graph_client, client_secret: keys.sub_invoice_graph_secret,
    }),
  });
  if (!res.ok) throw new Error("mail sign-in failed " + res.status);
  return (await res.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return reply({ error: "bad request" }, 400); }

  // 1. Who is this? Person + key come from their personal link.
  if (!/^[a-z]{2,20}$/.test(String(b.p || ""))) return reply({ error: "bad link" }, 403);
  const p = (await (await db(`receipt_people?person=eq.${b.p}&active=eq.true&select=*`)).json())[0];
  if (!p || !sameText(String(b.k || ""), p.link_key)) return reply({ error: "bad link" }, 403);
  const isTest = p.person.startsWith("test");
  const mode = p.config?.mode === "stonebridge" ? "stonebridge" : "house";

  if (b.action === "open") {
    // The page asks this when it opens: who they are, what to ask, and (Iron Shield) the houses.
    const houses = mode === "house"
      ? await (await db("sub_invoice_houses?active=eq.true&select=address,parcel&order=address")).json()
      : [];
    return reply({ ok: true, name: p.name, company: p.company, config: p.config, houses, recent: await recent(p.person) });
  }
  if (b.action !== "send") return reply({ error: "bad request" }, 400);

  // 2. Check the photos.
  const files = Array.isArray(b.files) ? b.files : [];
  if (files.length < 1 || files.length > MAX_FILES) return reply({ error: "bad receipt" }, 400);
  let totalLen = 0;
  const atts: { name: string; ext: string; type: string; data: string }[] = [];
  for (const f of files) {
    const data = typeof f?.data === "string" ? f.data : "";
    const k = kindOf(data);
    if (!k) return reply({ error: "bad file" }, 400);
    totalLen += data.length;
    atts.push({ name: "", ...k, data });
  }
  if (totalLen > MAX_TOTAL_B64) return reply({ error: "too big" }, 413);

  // 3. Check what they filled in, and build the email subject + table.
  const note = clean(b.note).slice(0, 500);
  const amount = b.amount === "" || b.amount == null ? null : Number(b.amount);
  if (amount != null && !(amount > 0 && amount < 1_000_000)) return reply({ error: "bad receipt" }, 400);
  let details: Record<string, unknown>, label: string, rows: [string, string][];

  if (mode === "house") {
    const kind = String(b.kind || "");
    if (!["house", "gas", "general"].includes(kind)) return reply({ error: "bad receipt" }, 400);
    const houses = Array.isArray(b.houses) ? b.houses.map(clean) : [];
    if (kind === "house" && (houses.length < 1 || houses.length > 10 || !houses.every((h: string) => h.length >= 4 && h.length <= 200)))
      return reply({ error: "bad receipt" }, 400);
    const forWhat = kind === "gas" ? "GAS" : kind === "general" ? "Shop / general" : houses[0] + (houses.length > 1 ? ` + ${houses.length - 1} more` : "");
    label = forWhat + (amount ? " - " + money(amount) : "");
    details = { kind, houses: kind === "house" ? houses : [], amount, note };
    rows = [["For", kind === "house" ? houses.map(esc).join("<br>") : esc(forWhat)]];
  } else {
    const cats: string[] = p.config.categories || [];
    const customer = clean(b.customer), category = clean(b.category), store = clean(b.store), card = clean(b.card);
    if (!str(customer, 1, 120) || !cats.includes(category) || !str(store, 1, 80) || !str(card, 1, 40) || amount == null)
      return reply({ error: "bad receipt" }, 400);
    label = `${customer} - ${category} - ${money(amount)} - ${store}`;
    details = { customer, category, store, amount, card, note };
    rows = [["Customer / job", esc(customer)], ["Category", esc(category)], ["Store", esc(store)], ["Card used", esc(card)]];
  }
  if (amount != null) rows.push(["Amount", money(amount)]);
  if (note) rows.push(["Note", esc(note)]);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const today = await (await db(`receipt_uploads?person=eq.${p.person}&created_at=gte.${since}&select=id`)).json();
  if (today.length >= DAILY_LIMIT) return reply({ error: "too many today" }, 429);

  const subject = (isTest ? "TEST - " : "") + `Receipt - ${p.name} - ${label}`.slice(0, 220);
  const sentAt = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
  const html =
    `<p><b>${esc(p.name)}</b> (${esc(p.company)}) sent ${atts.length === 1 ? "a receipt" : atts.length + " receipt photos"} from the receipt page on ${esc(sentAt)}. ` +
    `${atts.length === 1 ? "It is" : "They are"} attached.</p>` +
    `<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ccc">` +
    rows.map(([k, v]) => `<tr><td style="background:#f0ece6"><b>${esc(k)}</b></td><td>${v}</td></tr>`).join("") + `</table>`;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // 2026-11-12
  atts.forEach((a, i) => { a.name = `Receipt-${p.name.replace(/[^A-Za-z]/g, "")}-${day}${atts.length > 1 ? "-" + (i + 1) : ""}.${a.ext}`; });

  // Practice links can ask for a dry run: everything above is checked, nothing is sent.
  if (isTest && b.dry) return reply({ ok: true, dry: true, subject, to: p.send_to, files: atts.map((a) => a.name), html });

  const ins = await db("receipt_uploads", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ person: p.person, details, photo_count: atts.length, subject }),
  });
  if (!ins.ok) return reply({ error: "could not save" }, 500);
  const row = (await ins.json())[0];

  // 4. Email it. If the email fails, drop the log row so it doesn't look sent.
  try {
    const mail = await fetch(`https://graph.microsoft.com/v1.0/users/${FROM}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        saveToSentItems: true,
        message: {
          subject, body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: p.send_to } }],
          attachments: atts.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment", contentType: a.type, name: a.name, contentBytes: a.data,
          })),
        },
      }),
    });
    if (!mail.ok) throw new Error("send failed " + mail.status + " " + (await mail.text()).slice(0, 200));
  } catch (e) {
    console.error(String(e));
    await db(`receipt_uploads?id=eq.${row.id}`, { method: "DELETE" });
    return reply({ error: "email failed" }, 502);
  }
  await db(`receipt_uploads?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ emailed_at: new Date().toISOString() }) });
  return reply({ ok: true, recent: await recent(p.person) });
});
