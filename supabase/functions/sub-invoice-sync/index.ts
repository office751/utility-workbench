// sub-invoice-sync — the cloud copy of scanner/sub-invoice-sync.mjs.
//
// A daily timer inside Supabase (pg_cron job "sub-invoice-daily-sync") calls this
// function, so the subs' invoice page (/factura) house list stays in step with
// Monday even when Adam's Mac is off.
//
// What it does (same rules as the Mac script — KEEP THE TWO IN STEP):
//   1. Reads every house on the Construction Job List in Permitting, Active or Completed
//      (lots with no street number yet, and Dead Lots, are skipped).
//   2. Writes them to sub_invoice_houses as source='monday'.
//   3. Hides Monday-sourced houses that left the board.
//   4. Removes hand-added rows that are the same house as a Monday row.
//
// Lock: the caller must send the header  x-cron-key  matching the vault secret
// sub_invoice_cron_key. The Monday token is read from the vault (sub_invoice_monday_token).
// Reads only from Monday. Writes only to sub_invoice_houses + sub_invoice_sync_log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CJL_BOARD_ID = 18429393869;
const KEEP_GROUPS = ["Permitting", "Active - Under Construction", "Completed Jobs"];

type House = { address: string; parcel: string; active: boolean; source: string };

// Small helper for the database's REST API (service role = full access to our locked tables).
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Database ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// "same house" key: street number + parcel (two houses can share a parcel, so both are needed)
const houseKey = (address: string, parcel: string) => (address.match(/^\d+/) || [""])[0] + "|" + parcel;
const inList = (rows: { address: string }[]) => encodeURIComponent("(" + rows.map((r) => '"' + r.address.replace(/"/g, "") + '"').join(",") + ")");

async function sync(mondayToken: string) {
  // 1. Monday
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: mondayToken, "API-Version": "2025-01" },
    body: JSON.stringify({
      query: `query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 500) { items {
        name group { title } column_values(ids: ["text_mm6ts07h", "color_mm6tst06"]) { id text } } } } }`,
      variables: { b: [CJL_BOARD_ID] },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error("Monday: " + JSON.stringify(body.errors || res.status).slice(0, 200));
  const houses: House[] = [];
  for (const it of body.data.boards[0].items_page.items) {
    const name = String(it.name).replace(/\s+/g, " ").trim().toUpperCase();
    if (!KEEP_GROUPS.includes(it.group.title) || !/^\d+ /.test(name)) continue;
    const col = (id: string) => (it.column_values.find((c: { id: string }) => c.id === id)?.text || "").trim();
    const city = col("color_mm6tst06").toUpperCase();
    houses.push({ address: name + (city ? ", " + city : ""), parcel: col("text_mm6ts07h").toUpperCase(), active: true, source: "monday" });
  }
  // Safety: a short list means Monday answered oddly — do nothing rather than hide real houses.
  if (houses.length < 20) throw new Error(`Only ${houses.length} houses came back from Monday - refusing to sync.`);

  // 2-4. Supabase
  const existing: House[] = await (await db("sub_invoice_houses?select=address,parcel,source,active")).json();
  const mondayAddrs = new Set(houses.map((h) => h.address));
  const mondayKeys = new Set(houses.map((h) => houseKey(h.address, h.parcel)));
  const gone = existing.filter((r) => r.source === "monday" && r.active && !mondayAddrs.has(r.address));
  const dupes = existing.filter((r) => r.source !== "monday" && !mondayAddrs.has(r.address) && mondayKeys.has(houseKey(r.address, r.parcel)));
  const added = houses.filter((h) => !existing.some((r) => r.address === h.address));

  await db("sub_invoice_houses?on_conflict=address", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(houses) });
  if (gone.length) await db("sub_invoice_houses?address=in." + inList(gone), { method: "PATCH", body: JSON.stringify({ active: false }) });
  if (dupes.length) await db("sub_invoice_houses?address=in." + inList(dupes), { method: "DELETE" });
  return { monday: houses.length, added: added.map((h) => h.address), hidden: gone.map((r) => r.address), duplicatesRemoved: dupes.length };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const keys: Record<string, string> = {};
  for (const r of await (await db("rpc/sub_invoice_sync_keys", { method: "POST", body: "{}" })).json()) keys[r.name] = r.secret;
  const sent = req.headers.get("x-cron-key") || "";
  if (!keys.sub_invoice_cron_key || sent !== keys.sub_invoice_cron_key) return json({ ok: false, error: "not allowed" }, 401);

  let ok = true, note = "";
  let result: unknown = null;
  try {
    result = await sync(keys.sub_invoice_monday_token || "");
    const r = result as { monday: number; added: string[]; hidden: string[]; duplicatesRemoved: number };
    note = `monday ${r.monday} | new ${r.added.length} | hidden ${r.hidden.length} | dupes ${r.duplicatesRemoved}` + (r.added.length ? " | + " + r.added.join("; ") : "");
  } catch (e) {
    ok = false;
    note = String((e as Error).message || e).slice(0, 400);
  }
  await db("sub_invoice_sync_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ok, note: note.slice(0, 1000) }) });
  return json({ ok, note, result }, ok ? 200 : 500);
});
