import hashlib, re, shutil, os
SRC = "ranzidometro.html"; OUT = "pwa"
s = open(SRC, encoding="utf-8").read()
def rep(old, new):
    global s
    assert s.count(old) == 1, ("pwa build: missing", old[:80]); s = s.replace(old, new)
rep("I tuoi check-in sono salvati su questo dispositivo.", "I tuoi check-in sono salvati su questo telefono: ogni tanto fai un backup.")
rep("Non riesco a condividere: serve il permesso di contribuire all'app", "Non riesco a condividere: controlla la connessione")
rep("Coccola non partita: serve il permesso di contribuire all'app", "Coccola non partita: controlla la connessione")
rep("le vedi soltanto tu, anche da un altro dispositivo con lo stesso account.", "restano solo su questo telefono, non vengono mandate a nessuno.")
rep("Le notifiche sul telefono arrivano con l'app installata.", "Aggiungilo al calendario per avere la notifica anche ad app chiusa.")
rep("""      ${state.profile.remind ? `<button class="btn ghost" id="remindoff" style="align-self:flex-start">Togli il promemoria</button>` : ""}""",
    """      ${state.profile.remind ? `<div class="btnrow"><button class="btn" id="remindics">${icon("bell")} Aggiungi al calendario</button><button class="btn ghost" id="remindoff">Togli il promemoria</button></div>` : ""}""")
rep('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
i = s.index("</style>") + len("</style>")
head, body = s[:i], s[i:]
extra_css = """<style>
*, *::before, *::after { box-sizing: border-box; } body { margin: 0; -webkit-tap-highlight-color: transparent; }
#installbar { position: fixed; left: 12px; right: 12px; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 35; max-width: 460px; margin: 0 auto; display: flex; align-items: center; gap: 12px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 20px; padding: 12px; box-shadow: 0 18px 40px -14px hsl(var(--h) 45% 15% / .5); animation: rise-in .5s cubic-bezier(.34, 1.56, .64, 1) both; }
#installbar img { border-radius: 12px; flex: none; }
#installbar div { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: .88rem; }
#installbar span { color: var(--muted); font-weight: 600; }
#installbar .btn { padding: 10px 14px; }
</style>"""
v = hashlib.sha1(s.encode()).hexdigest()[:10]
html = f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Il check-in quotidiano dell'umore: quanto sei up, quanto sei down e quanto pepe hai in corpo.">
<meta name="theme-color" content="#eef3f4">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Ranzidometro">
{head}
{extra_css}
</head>
<body>
{body}
<script src="/pwa.js?v={v}"></script>
</body>
</html>
"""
open(f"{OUT}/index.html", "w", encoding="utf-8").write(html)
open(f"{OUT}/sw.js", "w").write(open(f"{OUT}/sw.tpl.js").read().replace("__VERSION__", v))
print("built", v, len(html))
