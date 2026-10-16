// Funzioni comuni alle API del Ranzidometro (i file che iniziano con _ non diventano endpoint).
import { put, get } from "@vercel/blob";
import { createHash, createECDH, createPublicKey, verify } from "node:crypto";
import webpush from "web-push";

export const SALT = process.env.RANZI_SALT || createHash("sha256").update("ranzi|" + (process.env.BLOB_READ_WRITE_TOKEN || "")).digest("hex");
export const h = s => createHash("sha256").update(SALT + "|" + s).digest("hex").slice(0, 40);
export const ownOf = secret => h("own|" + String(secret ?? "").slice(0, 100));
export const clip = (s, n) => String(s ?? "").slice(0, n);
export const body = req => { try { return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch { return {}; } };

// fresh: true legge sempre dallo store (serve quando subito dopo si riscrive);
// altrimenti usa la cache della CDN, che non consuma operazioni.
export async function readJson(path, fresh = false) {
  try {
    const r = await get(path, { access: "private", useCache: !fresh });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch { return null; }
}
export const write = (path, obj, maxAge = 60) => put(path, typeof obj === "string" ? obj : JSON.stringify(obj), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: maxAge });

// --- notifiche push: chiavi VAPID ricavate dal segreto dello store, nessuna chiave da custodire a parte ---
const b64u = buf => Buffer.from(buf).toString("base64url");
let vapid = null;
export function vapidKeys() {
  if (vapid) return vapid;
  const d = createHash("sha256").update("vapid|" + SALT).digest();
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(d);
  vapid = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(d) };
  webpush.setVapidDetails("https://ranzidometro.vercel.app", vapid.publicKey, vapid.privateKey);
  return vapid;
}
export const PUSH_INDEX = "push/index.json";
export const validSub = s => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
// Manda una notifica; restituisce "gone" se l'iscrizione non esiste più.
export async function sendPush(sub, payload) {
  vapidKeys();
  try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" }); return "ok"; }
  catch (e) { return e && (e.statusCode === 404 || e.statusCode === 410) ? "gone" : "error"; }
}

// --- verifica del token OIDC di GitHub Actions (il promemoria parte da un workflow pianificato) ---
let jwks = null, jwksAt = 0;
export async function verifyGithubOidc(token, repo, audience) {
  try { return await checkOidc(token, repo, audience); } catch { return false; }
}
async function checkOidc(token, repo, audience) {
  const [hd, pl, sg] = String(token || "").split(".");
  if (!hd || !pl || !sg) return false;
  const header = JSON.parse(Buffer.from(hd, "base64url").toString());
  const claims = JSON.parse(Buffer.from(pl, "base64url").toString());
  if (header.alg !== "RS256") return false;
  if (!jwks || Date.now() - jwksAt > 3600e3) { const r = await fetch("https://token.actions.githubusercontent.com/.well-known/jwks"); jwks = (await r.json()).keys || []; jwksAt = Date.now(); }
  const jwk = jwks.find(k => k.kid === header.kid); if (!jwk) return false;
  const ok = verify("RSA-SHA256", Buffer.from(hd + "." + pl), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(sg, "base64url"));
  const now = Date.now() / 1000;
  return ok && claims.iss === "https://token.actions.githubusercontent.com" && claims.aud === audience
    && String(claims.repository).toLowerCase() === repo.toLowerCase() && claims.exp > now && (claims.nbf || 0) <= now + 60;
}
