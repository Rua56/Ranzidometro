// Ranzidometro: modalità coppia per la versione installabile.
// Conserva solo il "meteo" condiviso (livello e ranzidità) e l'ultima coccola ricevuta, in un Blob store privato.
import { del } from "@vercel/blob";
import { h, ownOf, clip, readJson, write, sendPush, PUSH_INDEX } from "./_shared.js";

const CODE = /^[A-Z2-9]{6}$/;
const num = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const c = String(req.query.code || "").toUpperCase();
      if (!CODE.test(c)) return res.status(400).json({ error: "code" });
      const share = await readJson(`couples/${h(c)}.json`);
      if (req.query.kind === "couples") {
        if (!share) return res.status(200).json(null);
        const { own, ...pub } = share; return res.status(200).json(pub);
      }
      if (req.query.kind === "hugs") {
        if (!share || share.own !== ownOf(req.query.secret)) return res.status(200).json(null);
        const hug = await readJson(`hugs/${h(c)}.json`);
        return res.status(200).json(hug || null);
      }
      return res.status(400).json({ error: "kind" });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (JSON.stringify(b).length > 8000) return res.status(413).json({ error: "size" });
    const secret = clip(b.secret, 100); if (secret.length < 20) return res.status(400).json({ error: "secret" });
    const own = ownOf(secret);

    if (b.kind === "couples" && b.op === "set") {
      const d = b.data || {}; const c = String(d.code || "").toUpperCase();
      if (!CODE.test(c)) return res.status(400).json({ error: "code" });
      const path = `couples/${h(c)}.json`; const cur = await readJson(path, true);
      if (cur && cur.own !== own) return res.status(409).json({ error: "taken" });
      const week = Array.isArray(d.week) ? d.week.slice(0, 7).filter(x => x && typeof x === "object").map(x => ({ d: clip(x.d, 10), m: num(x.m), r: num(x.r) })) : [];
      await write(path, { own, code: c, name: clip(d.name, 30), gen: d.gen === "o" ? "o" : "a", date: clip(d.date, 10), mood: num(d.mood), ranz: num(d.ranz), week, chal: clip(d.chal, 10), updated: Date.now() });
      const prev = await readJson(`owners/${own}.json`, true);
      if (prev && prev.code && prev.code !== c) { await del(`couples/${h(prev.code)}.json`).catch(() => {}); await del(`hugs/${h(prev.code)}.json`).catch(() => {}); }
      if (!prev || prev.code !== c) await write(`owners/${own}.json`, { code: c });
      return res.status(200).json({ ok: true });
    }
    if (b.kind === "couples" && b.op === "del") {
      const o = await readJson(`owners/${own}.json`, true);
      if (o && o.code) { await del(`couples/${h(o.code)}.json`).catch(() => {}); await del(`hugs/${h(o.code)}.json`).catch(() => {}); }
      await del(`owners/${own}.json`).catch(() => {});
      return res.status(200).json({ ok: true });
    }
    if (b.kind === "hugs" && b.op === "set") {
      const d = b.data || {}; const to = String(d.to || "").toUpperCase();
      if (!CODE.test(to)) return res.status(400).json({ error: "code" });
      const dest = await readJson(`couples/${h(to)}.json`);
      if (!dest) return res.status(404).json({ error: "nocode" });
      const hug = { to, from: clip(d.from, 30), kind: clip(d.kind, 40), e: clip(d.e, 8), ts: Date.now() };
      await write(`hugs/${h(to)}.json`, hug, 15);
      // se chi la riceve ha le notifiche attive, gliela mandiamo anche sul telefono
      const idx = await readJson(PUSH_INDEX, true); const s = idx && idx[dest.own];
      if (s && s.sub) await sendPush(s.sub, { title: `${hug.from || "Il tuo partner"} ti ha mandato ${hug.kind} ${hug.e}`, body: "Apri il Ranzidometro per ricambiare.", tag: "coccola", url: "/?da=coccola" });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "bad" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server" });
  }
}
