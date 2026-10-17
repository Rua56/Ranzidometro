// Ranzidometro: backup nel cloud. Il telefono cifra tutto con la parola segreta prima di mandarlo:
// qui arrivano solo dati illeggibili, salvati sotto un nome ricavato anch'esso dalla parola segreta.
import { del, list } from "@vercel/blob";
import { readJson, write, h, body } from "./_shared.js";

const ID = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BLOB = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const pathOf = (id, part, date) => `backup/${h("bk|" + id)}/${part === "p" ? "p/" + date : "main"}.json`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const { id, part = "main", date } = req.query;
      if (!ID.test(id || "") || (part === "p" && !DATE.test(date || ""))) return res.status(400).json({ error: "bad" });
      const v = await readJson(pathOf(id, part, date), true);
      return res.status(200).json(v && v.data ? { data: v.data, saved: v.saved } : null);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const b = body(req);
    const { id, part = "main", date } = b;
    if (!ID.test(id || "") || (part === "p" && !DATE.test(date || ""))) return res.status(400).json({ error: "bad" });
    // cancellazione completa: il backup e tutte le sue foto
    if (b.op === "wipe") {
      const prefix = `backup/${h("bk|" + id)}/`; let cursor;
      do { const r = await list({ prefix, cursor, limit: 1000 }); if (r.blobs.length) await del(r.blobs.map(x => x.url)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
      return res.status(200).json({ ok: true });
    }
    if (b.op === "del") { if (part === "p") await del(pathOf(id, part, date)).catch(() => {}); return res.status(200).json({ ok: true }); }
    const data = String(b.data || "");
    if (!BLOB.test(data) || data.length > (part === "p" ? 600000 : 1500000)) return res.status(413).json({ error: "size" });
    await write(pathOf(id, part, date), { data, saved: Date.now() }, 0);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server" });
  }
}

