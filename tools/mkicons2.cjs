// Icone per le scorciatoie e per la barra delle notifiche. Uso: node tools/mkicons2.cjs dalla cartella del repository.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 96, height: 96 } });
  const check = '<path d="M20 6 9 17l-5-5"/>';
  const heart = '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>';
  const shot = async (name, bg, glyph, fill) => {
    await p.setContent(`<html><body style="margin:0;width:96px;height:96px;overflow:hidden"><div style="width:96px;height:96px;border-radius:50%;background:${bg};display:grid;place-items:center"><svg width="54" height="54" viewBox="0 0 24 24" fill="${fill}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></div></body></html>`);
    await p.screenshot({ path: `icons/${name}.png`, omitBackground: true });
  };
  await shot('sc-checkin', 'radial-gradient(circle at 30% 20%, hsl(48 96% 70%), hsl(28 92% 56%) 75%)', check, 'none');
  await shot('sc-coccola', 'radial-gradient(circle at 30% 20%, hsl(345 90% 76%), hsl(345 75% 52%) 75%)', heart, '#fff');
  // badge: solo la sagoma bianca, Android la colora da sé
  await p.setContent(`<html><body style="margin:0;width:96px;height:96px;overflow:hidden;background:transparent"><svg width="96" height="96" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5c-1.6 0-2.8 1.3-2.8 2.9v8.3a4.6 4.6 0 1 0 5.6 0V5.4c0-1.6-1.2-2.9-2.8-2.9Z"/></svg></body></html>`);
  await p.screenshot({ path: 'icons/badge-96.png', omitBackground: true });
  await b.close();
})();
