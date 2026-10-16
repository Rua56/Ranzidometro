// Ranzidometro: notifiche (promemoria della sera e coccole del partner).
// Tutte le iscrizioni stanno in un solo file privato, così il controllo periodico costa una lettura.
import { readJson, write, ownOf, clip, body, vapidKeys, validSub, sendPush, verifyGithubOidc, PUSH_INDEX } from "./_shared.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REMIND = [
  "Ranzi ti aspetta: com'è andata oggi?",
  "Due minuti per il check-in? Il termometro è già caldo.",
  "Quanto pepe hai in corpo oggi? Vieni a misurarlo.",
  "Il tuo giardino aspetta la pianta di oggi.",
  "Check-in della sera: Ranzi ha preparato le domande."
];
const validTz = tz => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      if (req.query.kind === "key") return res.status(200).json({ key: vapidKeys().publicKey });
      return res.status(400).json({ error: "kind" });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });

    // controllo periodico lanciato da GitHub Actions
    if (req.query.kind === "cron") {
      const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!(await verifyGithubOidc(tok, "Rua56/ranzidometro", "ranzidometro"))) return res.status(401).json({ error: "auth" });
      const idx = (await readJson(PUSH_INDEX, true)) || {};
      let changed = false, sent = 0;
      for (const [own, s] of Object.entries(idx)) {
        if (!s || !TIME.test(s.t || "")) continue;
        const { date, min } = localNow(s.tz || "Europe/Rome");
        const [hh, mm] = s.t.split(":").map(Number); const due = hh * 60 + mm;
        if (min < due || min - due > 180 || s.last === date || s.done === date) continue;
        const r = await sendPush(s.sub, { title: "Ranzidometro", body: REMIND[(new Date().getDate() + own.charCodeAt(0)) % REMIND.length], tag: "promemoria", url: "/?azione=checkin" });
        if (r === "gone") delete idx[own]; else if (r === "ok") { s.last = date; sent++; }
        changed = true;
      }
      if (changed) await write(PUSH_INDEX, idx, 0);
      return res.status(200).json({ ok: true, sent });
    }

    const b = body(req);
    if (JSON.stringify(b).length > 4000) return res.status(413).json({ error: "size" });
    const secret = clip(b.secret, 100); if (secret.length < 20) return res.status(400).json({ error: "secret" });
    const own = ownOf(secret);
    const idx = (await readJson(PUSH_INDEX, true)) || {};
    if (b.op === "sub") {
      if (!validSub(b.sub)) return res.status(400).json({ error: "sub" });
      const prev = idx[own] || {};
      idx[own] = { sub: { endpoint: b.sub.endpoint, keys: { p256dh: clip(b.sub.keys.p256dh, 200), auth: clip(b.sub.keys.auth, 100) } }, t: TIME.test(b.t || "") ? b.t : "", tz: validTz(b.tz) ? clip(b.tz, 60) : "Europe/Rome", done: DATE.test(b.done || "") ? b.done : (prev.done || ""), last: prev.last || "" };
    } else if (b.op === "set") {
      if (!idx[own]) return res.status(404).json({ error: "nosub" });
      if (b.t !== undefined) idx[own].t = TIME.test(b.t || "") ? b.t : "";
      if (b.tz !== undefined && validTz(b.tz)) idx[own].tz = clip(b.tz, 60);
      if (b.done !== undefined && DATE.test(b.done)) idx[own].done = b.done;
    } else if (b.op === "unsub") {
      if (!idx[own]) return res.status(200).json({ ok: true });
      delete idx[own];
    } else if (b.op === "test") {
      if (!idx[own]) return res.status(404).json({ error: "nosub" });
      const r = await sendPush(idx[own].sub, { title: "Ranzidometro", body: "Le notifiche funzionano! Ci sentiamo stasera 🌶️", tag: "prova", url: "/" });
      return res.status(r === "ok" ? 200 : 502).json({ ok: r === "ok" });
    } else return res.status(400).json({ error: "op" });
    await write(PUSH_INDEX, idx, 0);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server" });
  }
}
