/* Ranzidometro: versione installabile (fuori da Claude). */
(() => {
  if (window.claude) return;
  // --- dispositivo: id e chiave segreta per la modalità coppia ---
  let dev = null; try { dev = JSON.parse(localStorage.getItem("ranzi-device") || "null"); } catch {}
  if (!dev || !dev.secret) {
    const r = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
    dev = { id: "d" + r(8), secret: r(24) }; try { localStorage.setItem("ranzi-device", JSON.stringify(dev)); } catch {}
  }
  const API = "/api/couple";
  const call = async body => {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, secret: dev.secret }) });
    if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({}));
  };
  const fetchKind = async (kind, code) => {
    const r = await fetch(`${API}?kind=${kind}&code=${encodeURIComponent(code || "")}${kind === "hugs" ? "&secret=" + dev.secret : ""}`, { cache: "no-store" });
    if (r.status === 404) return null; if (!r.ok) throw new Error(String(r.status)); return r.json();
  };
  const remote = {
    doc: path => { const kind = path.split("/")[0]; return { set: v => call({ op: "set", kind, data: v }), delete: () => call({ op: "del", kind }) }; },
    collection: kind => {
      const filt = {};
      const q = {
        where(f, op, v) { filt[f] = v; return q; }, limit() { return q; },
        onSnapshot(next) {
          const code = filt.code || filt.to; let alive = true, t = 0, last;
          const run = async () => {
            if (!alive) return;
            if (navigator.onLine !== false && document.visibilityState !== "hidden") {
              try { const v = await fetchKind(kind, code); const sig = JSON.stringify(v); if (sig !== last) { last = sig; next({ empty: !v, size: v ? 1 : 0, docs: v ? [{ id: "x", exists: true, data: () => v }] : [] }); } } catch {}
            }
            if (alive) t = setTimeout(run, kind === "hugs" ? 90000 : 120000);
          };
          run(); const vis = () => { if (document.visibilityState === "visible") { clearTimeout(t); run(); } };
          document.addEventListener("visibilitychange", vis);
          return () => { alive = false; clearTimeout(t); document.removeEventListener("visibilitychange", vis); };
        }
      };
      return q;
    }
  };
  DB = remote; UID = dev.id;
  const params = new URLSearchParams(location.search);
  listenPartner(); listenHugs(); publishShare();
  if (!state.calc && !state.busy) render(false);

  // --- colore della barra di stato che segue l'umore ---
  const meta = document.querySelector('meta[name="theme-color"]');
  const syncBar = () => { try { meta.content = getComputedStyle(document.body).backgroundColor || getComputedStyle(document.documentElement).getPropertyValue("--bg"); } catch {} };
  new MutationObserver(() => setTimeout(syncBar, 50)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-mood", "data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncBar); syncBar();

  // --- promemoria nel calendario del telefono (notifica anche ad app chiusa) ---
  window.ranziIcs = () => {
    const r = state.profile.remind; if (!r) return;
    const [hh, mm] = r.split(":").map(Number); const d = new Date(); if (d.getHours() * 60 + d.getMinutes() >= hh * 60 + mm) d.setDate(d.getDate() + 1);
    const p = n => String(n).padStart(2, "0"); const ds = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(hh)}${p(mm)}00`;
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ranzidometro//IT", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:promemoria-${dev.id}@ranzidometro`, `DTSTAMP:${now}`, `DTSTART:${ds}`, "DURATION:PT5M", "RRULE:FREQ=DAILY", "SUMMARY:Check-in del Ranzidometro", "DESCRIPTION:Ranzi ti aspetta: com'è andata oggi?", `URL:${location.origin}/`, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Ranzi ti aspetta!", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "promemoria-ranzidometro.ics";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Apri il file per aggiungere il promemoria al calendario");
  };
  document.addEventListener("click", ev => { if (ev.target.closest("#remindics")) window.ranziIcs(); });

  // --- installazione ---
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let deferred = null;
  const seen = () => { try { return localStorage.getItem("ranzi-install-hide") === "1"; } catch { return false; } };
  const hide = () => { try { localStorage.setItem("ranzi-install-hide", "1"); } catch {} document.getElementById("installbar")?.remove(); };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function showBar(html) {
    if (standalone || seen() || document.getElementById("installbar")) return;
    const el = document.createElement("div"); el.id = "installbar"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Installa l'app");
    el.innerHTML = html; document.body.appendChild(el);
    el.addEventListener("click", async ev => {
      if (ev.target.closest("#instno")) hide();
      if (ev.target.closest("#instyes") && deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r && r.outcome === "accepted") { hide(); confetti(); } }
    });
  }
  const logo = `<img src="/icons/icon-192.png" alt="" width="44" height="44">`;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; setTimeout(() => showBar(`${logo}<div><b>Installa Ranzidometro</b><span>Lo apri dalla schermata Home, anche senza internet.</span></div><button class="btn" id="instyes">Installa</button><button class="iconbtn sm" id="instno" aria-label="Chiudi">×</button>`), 2500); });
  if (ios && !standalone) setTimeout(() => showBar(`${logo}<div><b>Mettilo nella schermata Home</b><span>Tocca <b>Condividi</b> <span aria-hidden="true">⎋</span> e poi <b>Aggiungi alla schermata Home</b>.</span></div><button class="iconbtn sm" id="instno" aria-label="Chiudi">×</button>`), 3500);
  addEventListener("appinstalled", () => { hide(); toast("Ranzidometro installato!"); });


  // =====================================================================
  // Novità della versione installabile: notifiche, backup nel cloud,
  // invito di coppia con un link, scorciatoie dall'icona.
  // =====================================================================
  const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
  const post = async (url, b) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(String(r.status)); return r.json().catch(() => ({})); };
  const rerenderTu = () => { if (state.tab === "tu" && !state.busy && !state.calc) render(false); };
  const rel = ts => { if (!ts) return "mai"; const m = Math.round((Date.now() - ts) / 60000); if (m < 2) return "adesso"; if (m < 60) return `${m} minuti fa`; const h = Math.round(m / 60); if (h < 24) return h === 1 ? "un'ora fa" : `${h} ore fa`; const d = Math.round(h / 24); return d === 1 ? "ieri" : `${d} giorni fa`; };
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome"; } catch { return "Europe/Rome"; } };

  // ---------------- notifiche ----------------
  const PUSH = "/api/push";
  const pushOk = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let push = LS("ranzi-push") || { on: false };
  const b64uBytes = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  async function subscribe(quiet) {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await (await fetch(PUSH + "?kind=key", { cache: "no-store" })).json();
    let sub = await reg.pushManager.getSubscription();
    if (sub && push.key && push.key !== key) { try { await sub.unsubscribe(); } catch {} sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(key) });
    await post(PUSH, { op: "sub", secret: dev.secret, sub: sub.toJSON(), t: state.profile.remind || "", tz: tz(), done: state.entries[todayKey()] ? todayKey() : "" });
    push = { on: true, key, t: state.profile.remind || "", done: state.entries[todayKey()] ? todayKey() : "", at: Date.now() }; LS("ranzi-push", push);
    if (!quiet) { toast(state.profile.remind ? `Notifiche attive: promemoria alle ${state.profile.remind}` : "Notifiche attive: scegli l'ora del promemoria"); confetti(); }
  }
  async function pushOn() {
    if (!pushOk) { toast(ios && !standalone ? "Prima aggiungi l'app alla schermata Home, poi attiva le notifiche da lì" : "Questo telefono non supporta le notifiche dal sito"); return; }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    if (p !== "granted") { toast("Notifiche bloccate: puoi riattivarle dalle impostazioni del telefono"); rerenderTu(); return; }
    try { await subscribe(false); } catch (e) { console.warn("push", e); toast("Non riesco ad attivare le notifiche adesso, riprova più tardi"); }
    rerenderTu();
  }
  async function pushOff() {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch {}
    try { await post(PUSH, { op: "unsub", secret: dev.secret }); } catch {}
    push = { on: false }; LS("ranzi-push", push); toast("Notifiche spente"); rerenderTu();
  }
  async function pushSync() {
    if (!push.on || !pushOk || Notification.permission !== "granted") return;
    const t = state.profile.remind || "", done = state.entries[todayKey()] ? todayKey() : push.done || "";
    if (t === push.t && done === push.done) return;
    try { await post(PUSH, { op: "set", secret: dev.secret, t, tz: tz(), done }); push.t = t; push.done = done; LS("ranzi-push", push); }
    catch (e) { if (String(e.message) === "404") subscribe(true).catch(() => {}); }
  }
  // all'apertura: se le notifiche erano attive, controllo che l'iscrizione sia ancora valida
  if (push.on && pushOk && Notification.permission === "granted") {
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
      if (!sub || Date.now() - (push.at || 0) > 7 * 864e5) return subscribe(true);
      return fetch(PUSH + "?kind=key", { cache: "no-store" }).then(r => r.json()).then(({ key }) => { if (key !== push.key) return subscribe(true); });
    }).catch(() => {});
  } else if (push.on && pushOk && Notification.permission === "denied") { push = { on: false }; LS("ranzi-push", push); }
  navigator.serviceWorker?.addEventListener?.("message", ev => {
    if (!ev.data || ev.data.type !== "ranzi-open") return;
    const u = new URL(ev.data.url); handleParams(u.searchParams);
  });

  // ---------------- backup nel cloud ----------------
  const BK = "/api/backup";
  const WORDS = "acqua alba albero ananas ape arancia arco aria bacio balena banana barca basilico biscotto bosco bottone brezza bussola cactus caffe camino candela capra carota castagna cavallo cielo ciliegia cioccolata cometa coniglio conchiglia corallo cuscino delfino drago duna fagiolo falco farfalla faro fiamma fico fiore fiume foglia formica fragola fungo gabbiano gatto gelato geco giardino ginepro girasole gomitolo grillo gufo isola koala lampone lanterna lavanda leone lepre limone lucciola luna lupo mandorla mango mare margherita marmotta mela melograno menta miele mirtillo montagna muschio nebbia neve nocciola nuvola oliva onda orso ortensia ostrica pane panda papavero passero pepe peperoncino pera pesca pigna pinguino pino pioggia pirata pistacchio polpo pomodoro ponte prato quercia radice ragno rana razzo riccio rondine rosa rosmarino rugiada salvia sasso scoiattolo sedano sentiero sole spiga stella sughero tartaruga tazza tigre timo topo torta treno trifoglio tromba tulipano uva vaniglia vela ventaglio vento violetta volpe zafferano zebra zucca".split(" ");
  const te = new TextEncoder(), td = new TextDecoder();
  const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64uBig = bytes => { const u = new Uint8Array(bytes); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const normPhrase = p => String(p || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/).filter(Boolean).join("-");
  const newPhrase = () => Array.from(crypto.getRandomValues(new Uint32Array(5)), x => WORDS[x % WORDS.length]).join("-");
  let cloud = LS("ranzi-cloud"), keyCache = null;
  async function keysFor(phrase) {
    const norm = normPhrase(phrase); if (keyCache && keyCache.p === norm) return keyCache;
    const base = await crypto.subtle.importKey("raw", te.encode(norm), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode("ranzidometro-backup-v1"), iterations: 210000 }, base, 512));
    const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
    keyCache = { p: norm, key, id: Array.from(bits.slice(32), b => b.toString(16).padStart(2, "0")).join("") };
    return keyCache;
  }
  async function seal(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(obj))); return b64u(iv) + "." + b64uBig(ct); }
  async function open(key, s) { const [iv, ct] = s.split("."); const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64uBytes(iv) }, key, b64uBytes(ct)); return JSON.parse(td.decode(dec)); }
  let bkTimer = 0, bkBusy = false;
  async function backupNow(force) {
    if (!cloud || bkBusy || navigator.onLine === false) return false;
    if (!force && (!cloud.dirty || Date.now() - (cloud.last || 0) < 4 * 3600e3)) return false;
    bkBusy = true;
    try {
      const { key, id } = await keysFor(cloud.phrase);
      const photos = Object.keys(state.entries).filter(k => state.entries[k] && state.entries[k].photo).sort();
      const sent = cloud.photos || {};
      for (const k of photos) {
        const d = await getPhoto(k); if (!d) continue;
        const sig = d.length + ":" + d.slice(-24);
        if (sent[k] === sig) continue;
        await post(BK, { id, part: "p", date: k, data: await seal(key, { d }) }); sent[k] = sig;
      }
      for (const k of Object.keys(sent)) if (!photos.includes(k)) { try { await post(BK, { id, part: "p", date: k, op: "del" }); } catch {} delete sent[k]; }
      await post(BK, { id, data: await seal(key, { app: "ranzidometro", v: 2, saved: new Date().toISOString(), profile: state.profile, entries: state.entries, device: dev, photos: Object.keys(sent) }) });
      cloud = { ...cloud, photos: sent, last: Date.now(), dirty: false }; LS("ranzi-cloud", cloud);
      if (state.tab === "tu") { const el = document.getElementById("cblast"); if (el) el.textContent = rel(cloud.last); }
      return true;
    } catch (e) { console.warn("backup", e); return false; }
    finally { bkBusy = false; }
  }
  const markDirty = () => { if (!cloud) return; cloud.dirty = true; LS("ranzi-cloud", cloud); clearTimeout(bkTimer); bkTimer = setTimeout(() => backupNow(false), 15000); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") backupNow(false); });
  setTimeout(() => backupNow(false), 8000);
  async function cloudOn() {
    const phrase = newPhrase();
    cloud = { phrase, last: 0, dirty: true, photos: {}, fresh: true }; LS("ranzi-cloud", cloud);
    rerenderTu(); toast("Sto salvando il primo backup…");
    const ok = await backupNow(true);
    toast(ok ? "Backup attivo! Segnati la parola segreta" : "Backup attivato: lo salvo appena c'è connessione");
    rerenderTu();
  }
  async function restore(phrase) {
    const norm = normPhrase(phrase);
    if (norm.split("-").length < 3) { toast("La parola segreta è di 5 parole, tipo luna-pepe-gatto-treno-mela"); return; }
    const btn = document.getElementById("cbgo"); if (btn) { btn.disabled = true; btn.textContent = "Cerco il backup…"; }
    try {
      const { key, id } = await keysFor(norm);
      const r = await (await fetch(`${BK}?id=${id}`, { cache: "no-store" })).json();
      if (!r || !r.data) { toast("Non trovo nessun backup con questa parola segreta"); return; }
      const d = await open(key, r.data);
      if (!d || d.app !== "ranzidometro") throw new Error("formato");
      let n = 0;
      for (const [k, e] of Object.entries(d.entries || {})) { const cur = state.entries[k]; if (!cur || (cur.ts || 0) < (e.ts || 0)) { state.entries[k] = e; n++; } }
      const mine = state.profile; state.profile = { ...(d.profile || {}), ...Object.fromEntries(Object.entries(mine).filter(([, v]) => v !== "" && v != null && v !== false)) };
      // su un telefono nuovo riprendo anche l'identità per la coppia, così il codice condiviso resta lo stesso
      if (d.device && d.device.secret && !mine.share && !mine.partner) { LS("ranzi-device", d.device); state.profile.share = (d.profile || {}).share || null; state.profile.partner = (d.profile || {}).partner || null; }
      const sent = {};
      for (const k of d.photos || []) {
        try { const pr = await (await fetch(`${BK}?id=${id}&part=p&date=${k}`, { cache: "no-store" })).json(); if (pr && pr.data) { const { d: img } = await open(key, pr.data); await IDB.set(k, img); sent[k] = img.length + ":" + img.slice(-24); } } catch {}
      }
      lsSet();
      cloud = { phrase: norm, last: Date.now(), dirty: false, photos: sent }; LS("ranzi-cloud", cloud);
      toast(n ? `Ripristinat${n === 1 ? "o 1 giorno" : "i " + n + " giorni"} dal cloud` : "Backup trovato: era già tutto qui");
      setTimeout(() => location.replace("/?da=ripristino"), 1200);
    } catch (e) { console.warn("restore", e); toast("Parola segreta sbagliata o backup illeggibile"); }
    finally { const b = document.getElementById("cbgo"); if (b) { b.disabled = false; b.textContent = "Ripristina"; } }
  }

  // ---------------- invito di coppia con un link ----------------
  const inviteUrl = () => `${location.origin}/?coppia=${state.profile.share}${state.profile.name ? "&da=" + encodeURIComponent(state.profile.name) : ""}`;
  async function shareInvite() {
    const url = inviteUrl(); const who = state.profile.name || "Io";
    const text = `${who} ti invita a seguire il suo umore sul Ranzidometro 🌶️ Apri il link e siete collegati.`;
    try { if (navigator.share) { await navigator.share({ title: "Ranzidometro", text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Link copiato: mandalo dove vuoi"); } catch { toast(url); }
  }
  function bar(id, html, onClick) {
    document.getElementById(id)?.remove();
    const el = document.createElement("div"); el.id = id; el.className = "ranzibar"; el.setAttribute("role", "dialog"); el.innerHTML = html;
    document.body.appendChild(el); el.addEventListener("click", ev => { const b = ev.target.closest("button"); if (b) onClick(b.id, el); });
    return el;
  }
  async function acceptInvite(code, from) {
    state.profile.partner = code; await saveProfile(); listenPartner(); checkTrophies();
    if (ios && !standalone) { try { await navigator.clipboard.writeText(code); } catch {} }
    confetti(); toast(`Collegat${state.profile.gen === "o" ? "o" : "a"} a ${from || "il tuo partner"}!`);
    state.tab = "oggi"; render();
    if (!state.profile.share) setTimeout(() => bar("invitebar", `<span class="big" aria-hidden="true">💞</span><div><b>Vuoi che anche ${esc(from || "il partner")} veda il tuo umore?</b><span>Ti creo un invito da mandare indietro.</span></div><button class="btn" id="invback">Sì</button><button class="iconbtn sm" id="invno" aria-label="Chiudi">×</button>`, async (id, el) => {
      if (id === "invno") el.remove();
      if (id === "invback") { el.remove(); state.profile.share = genCode(); await saveProfile(); await publishShare(); listenHugs(); checkTrophies(); rerenderTu(); shareInvite(); }
    }), 1600);
  }
  function inviteFromUrl(code, from) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6 || code === state.profile.share) return;
    if (state.profile.partner === code) { toast("Siete già collegati"); return; }
    const already = state.profile.partner ? `<span>Adesso sei collegat${state.profile.gen === "o" ? "o" : "a"} a un altro codice: lo sostituisco.</span>` : `<span>Vedrai il suo meteo del giorno e potrai mandare coccole.</span>`;
    bar("invitebar", `<span class="big" aria-hidden="true">💌</span><div><b>${esc(from || "Qualcuno")} ti ha invitato!</b>${already}</div><button class="btn" id="invyes">Collega</button><button class="iconbtn sm" id="invno" aria-label="No grazie">×</button>`, (id, el) => {
      if (id === "invno") el.remove();
      if (id === "invyes") { el.remove(); acceptInvite(code, from); }
    });
  }
  async function pasteCode() {
    try { const t = (await navigator.clipboard.readText() || "").toUpperCase(); const m = t.match(/coppia=([A-Z0-9]{6})/i) || t.match(/\b([A-HJ-NP-Z2-9]{6})\b/); if (!m) { toast("Negli appunti non c'è un codice"); return; } const inp = document.getElementById("pcode"); if (inp) inp.value = m[1].toUpperCase(); toast("Codice incollato: tocca Collega"); }
    catch { toast("Tieni premuto nel campo e scegli Incolla"); }
  }

  // ---------------- scorciatoie e link speciali ----------------
  function handleParams(p) {
    const az = p.get("azione"), cp = p.get("coppia"), da = p.get("da");
    if (az === "checkin") { state.tab = "oggi"; state.selDay = null; render(); window.scrollTo(0, 0); if (state.entries[todayKey()]) toast("Il check-in di oggi è già fatto!"); else setTimeout(() => document.querySelector(".qcard")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }
    if (az === "coccola") {
      if (!state.profile.partner) { state.tab = "tu"; render(); toast("Prima collega il partner qui sotto"); setTimeout(() => document.getElementById("pcode")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }
      else { state.tab = "oggi"; render(); sendHug(0).then(() => { confetti(); buzz([40, 40, 40]); }); }
    }
    if (da === "coccola") { state.tab = "oggi"; render(); }
    if (cp) inviteFromUrl(cp, da);
    if (az || cp || da) history.replaceState(null, "", "/");
  }
  setTimeout(() => handleParams(new URLSearchParams(location.search)), 400);

  // ---------------- agganci per l'app ----------------
  window.ranziExt = {
    changed(kind, k) { if (kind === "entry" && k === todayKey()) pushSync(); if (kind === "profile") pushSync(); markDirty(); },
    pushActive: () => push.on && pushOk && Notification.permission === "granted",
    invite: () => `<button class="btn" id="invite">${icon("heart")} Invita con un link</button>`,
    pasteBtn: () => navigator.clipboard && navigator.clipboard.readText ? `<button class="btn ghost" id="pastecode">Incolla</button>` : "",
    settings() {
      const perm = pushOk ? Notification.permission : "no";
      const on = push.on && perm === "granted";
      const why = !pushOk ? (ios && !standalone ? "Per riceverle aggiungi l'app alla schermata Home e aprila da lì." : "Questo telefono non le supporta: usa il calendario.") : perm === "denied" ? "Le hai bloccate: riattivale dalle impostazioni del telefono." : "Il promemoria all'ora scelta e le coccole del partner, anche ad app chiusa.";
      const notif = `<div class="setrow"><span><b>Notifiche</b><small>${why}</small></span><button class="switch" id="pushtgl" role="switch" aria-checked="${on}" aria-label="Notifiche" ${!pushOk || perm === "denied" ? "disabled" : ""}></button></div>
        ${on ? `<button class="btn ghost" id="pushtest" style="align-self:flex-start">${icon("bell")} Manda una notifica di prova</button>` : ""}`;
      const cb = cloud ? `<div class="sub cloudbox"><b>${icon("shield")} Backup nel cloud attivo</b>
          <span class="muted">Ultimo salvataggio: <b id="cblast">${rel(cloud.last)}</b>. Si aggiorna da solo quando aggiungi check-in, note o foto. È cifrato: senza la parola segreta nessuno può leggerlo, nemmeno chi gestisce il sito.</span>
          ${cloud.fresh || state.showPhrase ? `<div class="phrase" id="cbphrase">${esc(cloud.phrase)}</div><span class="muted">Scrivila da qualche parte: serve per ritrovare tutto su un altro telefono.</span>` : ""}
          <div class="btnrow"><button class="btn ghost" id="cbnow">Salva adesso</button>${cloud.fresh || state.showPhrase ? `<button class="btn ghost" id="cbcopy">Copia la parola</button>` : `<button class="btn ghost" id="cbshow">Mostra la parola segreta</button>`}<button class="btn ghost" id="cboff">Disattiva</button></div></div>`
        : `<div class="sub cloudbox"><b>${icon("shield")} Backup nel cloud</b><span class="muted">Salvo in automatico check-in, note e foto, cifrati con una parola segreta. Se cambi telefono, la inserisci e ritrovi tutto.</span>
          <div class="btnrow"><button class="btn" id="cbon">Attiva il backup</button><button class="btn ghost" id="cbask">Ho già un backup</button></div>
          ${state.cbAsk ? `<label class="field" for="cbin">La tua parola segreta<input type="text" id="cbin" placeholder="es. luna-pepe-gatto-treno-mela" autocomplete="off" autocapitalize="none" spellcheck="false"></label><button class="btn" id="cbgo" style="align-self:flex-start">Ripristina</button>` : ""}</div>`;
      return notif + cb;
    }
  };
  document.addEventListener("click", async ev => {
    const b = ev.target.closest("button"); if (!b) return;
    switch (b.id) {
      case "pushtgl": if (push.on) pushOff(); else pushOn(); break;
      case "pushtest": try { await post(PUSH, { op: "test", secret: dev.secret }); toast("Notifica in arrivo…"); } catch { toast("La prova non è partita: riattiva le notifiche"); } break;
      case "invite": shareInvite(); break;
      case "pastecode": pasteCode(); break;
      case "cbon": cloudOn(); break;
      case "cbnow": b.disabled = true; toast((await backupNow(true)) ? "Backup salvato" : "Non riesco a salvare adesso, riprovo più tardi"); b.disabled = false; break;
      case "cbshow": state.showPhrase = true; rerenderTu(); break;
      case "cbcopy": try { await navigator.clipboard.writeText(cloud.phrase); toast("Parola segreta copiata"); } catch { toast(cloud.phrase); } if (cloud.fresh) { cloud.fresh = false; LS("ranzi-cloud", cloud); } break;
      case "cboff": cloud = null; LS("ranzi-cloud", null); state.showPhrase = false; toast("Backup nel cloud disattivato su questo telefono"); rerenderTu(); break;
      case "cbask": state.cbAsk = !state.cbAsk; rerenderTu(); setTimeout(() => document.getElementById("cbin")?.focus(), 50); break;
      case "cbgo": restore(document.getElementById("cbin")?.value); break;
    }
  });
  if (cloud && cloud.fresh) addEventListener("pagehide", () => { if (cloud) { cloud.fresh = false; LS("ranzi-cloud", cloud); } });

  // --- service worker ---
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
