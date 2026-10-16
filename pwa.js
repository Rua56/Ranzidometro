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
            if (alive) t = setTimeout(run, kind === "hugs" ? 20000 : 40000);
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

  // --- service worker ---
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
