/**
 * sub-invoice — the "send" behind the subs' invoice page (public/factura).
 *
 * The page (Jose's or Aldali's phone) POSTs here. We:
 *   1. check the secret key from their link,
 *   2. hand out the next invoice number (kept HERE, so a new phone can't reset it),
 *   3. email the PDF from office@ to data@ through the Iron Shield mail app,
 *   4. record the invoice in the sub_invoices table.
 * If a line looks like something the sub already billed (same house + same job), the
 * email to the office says POSSIBLE DUPLICATE. The sub is never told.
 *
 * Setup lives in supabase/setup-sub-invoices.sql. The mail-app sign-in is in
 * the Supabase vault (names sub_invoice_graph_*), never in this file.
 * Deployed with verify_jwt = false: the link key is the lock.
 */
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "office@ironshieldconstruction.com";
const DAILY_LIMIT = 25; // invoices per sub per day — a runaway/abuse stop

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Talk to the database as the service role (the tables are locked to everyone else).
const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sameText = (a: string, b: string) => { // compare without leaking where they differ
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function nextAndSent(vendor: string, startN: number) {
  const rows = await (await db(`sub_invoices?vendor=eq.${vendor}&select=n,invoice_date,total,lines,emailed_at&order=n.desc&limit=15`)).json();
  return {
    next: rows.length ? rows[0].n + 1 : startN,
    sent: rows.filter((r: any) => r.emailed_at).map((r: any) => ({ n: r.n, date: r.invoice_date, total: Number(r.total), lines: r.lines })),
  };
}

// Boil a job description down to one label so "2nd Rough", "Rough 2nd Plumbing" and "2do Rough" all match.
// KEEP IN STEP with job_cat() in Invoice Red Flags/sub_invoice_prior.py.
const jobCat = (text: string) => {
  const t = text.toUpperCase();
  if (/2ND|2DO|SECOND/.test(t)) return "2nd rough";
  if (/TRIM|FINAL/.test(t)) return "trim";
  if (/1ST|1ER|FIRST|ROUGH/.test(t)) return "1st rough";
  if (/FLOOR|PISO|LVP|LAMINATE/.test(t)) return "flooring";
  return t.replace(/\s+/g, " ").trim().slice(0, 60);
};
const houseNo = (h: string) => (h.match(/^\d+/) || [""])[0];                               // "888 NE 95TH ST…" -> "888"
const parcelOf = (h: string) => (h.match(/\(([^)]+)\)\s*$/) || ["", ""])[1].toUpperCase();  // "… (14101-000-01)" -> parcel

// Has this sub already billed the same job on the same house? Looks in two places:
// bills already in QuickBooks (table sub_invoice_prior, refreshed daily) and invoices
// sent earlier from this page. Returns one entry per suspicious line.
async function findDuplicates(v: any, lines: any[]) {
  const who = v.history_of || v.vendor;                       // practice links use the real sub's history
  const nos = [...new Set(lines.map((l) => houseNo(l.house)).filter((n) => /^\d+$/.test(n)))];
  if (!nos.length) return [];
  const prior = await (await db(`sub_invoice_prior?vendor=eq.${who}&house_no=in.(${nos.join(",")})&select=house_no,parcel,job,cat,txn_date,amount,doc`)).json();
  const earlier = await (await db(`sub_invoices?vendor=in.(${v.vendor},${who})&emailed_at=not.is.null&select=n,invoice_date,lines`)).json();
  const same = (no: string, p: string, c: string, no2: string, p2: string, c2: string) => no === no2 && c === c2 && (!p || !p2 || p === p2);
  const out: { house: string; text: string; hits: string[] }[] = [];
  lines.forEach((l, i) => {
    const no = houseNo(l.house), p = parcelOf(l.house), c = jobCat(l.text), hits: string[] = [];
    if (!no) return;
    for (const r of prior) if (same(no, p, c, r.house_no, r.parcel, r.cat))
      hits.push(`QuickBooks bill ${r.doc || "(no number)"} dated ${r.txn_date}, ${money(Number(r.amount))} ("${r.job}")`);
    for (const inv of earlier) for (const el of inv.lines) if (same(no, p, c, houseNo(el.house), parcelOf(el.house), jobCat(el.text)))
      hits.push(`invoice ${v.prefix}-${String(inv.n).padStart(3, "0")} dated ${inv.invoice_date}, ${money(Number(el.amount))}`);
    if (lines.some((o, j) => j < i && same(no, p, c, houseNo(o.house), parcelOf(o.house), jobCat(o.text)))) hits.push("another line on this same invoice");
    if (hits.length) out.push({ house: l.house, text: l.text, hits: hits.slice(0, 5) });
  });
  return out;
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

  // 1. Who is this? The vendor + key come from their personal link.
  if (!/^[a-z]{2,20}$/.test(String(b.v || ""))) return reply({ error: "bad link" }, 403);
  const v = (await (await db(`sub_invoice_vendors?vendor=eq.${b.v}&select=*`)).json())[0];
  if (!v || !sameText(String(b.k || ""), v.link_key)) return reply({ error: "bad link" }, 403);

  const state = await nextAndSent(v.vendor, v.start_n);
  if (b.action === "next") {
    // The page asks this when it opens: what to show for THIS sub, and the houses to pick from.
    const houses = await (await db("sub_invoice_houses?active=eq.true&select=address,parcel&order=address")).json();
    return reply({ ok: true, prefix: v.prefix, config: v.config, houses, ...state });
  }
  if (b.action !== "send") return reply({ error: "bad request" }, 400);

  // 2. Check the invoice.
  const lines = Array.isArray(b.lines) ? b.lines : [];
  const okLines = lines.length >= 1 && lines.length <= 30 && lines.every((l: any) =>
    typeof l.house === "string" && l.house.length >= 4 && l.house.length <= 200 &&
    typeof l.text === "string" && l.text.length >= 1 && l.text.length <= 400 &&
    typeof l.amount === "number" && l.amount > 0 && l.amount < 1_000_000);
  if (!okLines || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ||
      typeof b.pdf !== "string" || !b.pdf.startsWith("JVBERi") || b.pdf.length > 900_000) {
    return reply({ error: "bad invoice" }, 400);
  }
  const total = Math.round(lines.reduce((s: number, l: any) => s + l.amount, 0) * 100) / 100;

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const today = await (await db(`sub_invoices?vendor=eq.${v.vendor}&created_at=gte.${since}&select=id`)).json();
  if (today.length >= DAILY_LIMIT) return reply({ error: "too many today" }, 429);

  // Look for possible duplicates BEFORE saving this invoice (so it can't match itself).
  let dupes: { house: string; text: string; hits: string[] }[] = [];
  try { dupes = await findDuplicates(v, lines); } catch (e) { console.error("duplicate check failed: " + String(e)); }

  // 3. Claim the number. If the page's number is stale (or two phones race), tell it the right one.
  if (b.n !== state.next) return reply({ conflict: true, next: state.next });
  const clean = lines.map((l: any) => ({ house: l.house, text: l.text, amount: l.amount }));
  const ins = await db("sub_invoices", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ vendor: v.vendor, n: b.n, invoice_date: b.date, total, lines: clean }),
  });
  if (ins.status === 409) return reply({ conflict: true, next: (await nextAndSent(v.vendor, v.start_n)).next });
  if (!ins.ok) return reply({ error: "could not save" }, 500);
  const row = (await ins.json())[0];

  // 4. Email it. If the email fails, give the number back so nothing is skipped.
  const no = `${v.prefix}-${String(b.n).padStart(3, "0")}`;
  const subject = `Invoice ${no} - ${v.name} - ${money(total)}` + (dupes.length ? " - POSSIBLE DUPLICATE" : "");
  const warn = !dupes.length ? "" :
    `<div style="border:2px solid #c0392b;background:#fdf1ef;padding:10px 12px;margin-bottom:12px"><b>POSSIBLE DUPLICATE - please check before entering.</b> ` +
    `The sub was not told.<ul style="margin:6px 0 0">` +
    dupes.map((d) => `<li><b>${esc(d.house)}</b> - ${esc(d.text)}<br>Already billed on: ${d.hits.map(esc).join("; ")}</li>`).join("") + `</ul></div>`;
  const html = warn +
    `<p><b>${esc(v.name)}</b> sent invoice <b>${no}</b> dated ${esc(b.date)} from the sub invoice page. The PDF is attached.</p>` +
    `<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ccc">` +
    `<tr style="background:#f0ece6"><th align="left">House</th><th align="left">Work</th><th align="right">Amount</th></tr>` +
    clean.map((l: any) => `<tr><td>${esc(l.house)}</td><td>${esc(l.text)}</td><td align="right">${money(l.amount)}</td></tr>`).join("") +
    `<tr><td colspan="2" align="right"><b>Total</b></td><td align="right"><b>${money(total)}</b></td></tr></table>`;
  try {
    const mail = await fetch(`https://graph.microsoft.com/v1.0/users/${FROM}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        saveToSentItems: true,
        message: {
          subject, body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: v.send_to } }],
          ...(v.reply_to ? { replyTo: [{ emailAddress: { address: v.reply_to, name: v.name } }] } : {}),
          attachments: [{
            "@odata.type": "#microsoft.graph.fileAttachment", contentType: "application/pdf",
            name: `Invoice-${no}-${v.name.split(" ")[0]}-${b.date}.pdf`, contentBytes: b.pdf,
          }],
        },
      }),
    });
    if (!mail.ok) throw new Error("send failed " + mail.status + " " + (await mail.text()).slice(0, 200));
  } catch (e) {
    console.error(String(e));
    await db(`sub_invoices?id=eq.${row.id}`, { method: "DELETE" });
    return reply({ error: "email failed" }, 502);
  }
  await db(`sub_invoices?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ emailed_at: new Date().toISOString() }) });
  return reply({ ok: true, sentNo: no, prefix: v.prefix, ...(await nextAndSent(v.vendor, v.start_n)) });
});
