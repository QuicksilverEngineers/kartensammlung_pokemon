// Holt für alle Karten aus data/data.json die Cardmarket-Preise über die tcgdex-API
// und schreibt eine Momentaufnahme nach data/prices.json.
// Aufruf: node scripts/update-prices.mjs
import { readFile, writeFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/data.json', import.meta.url)));
const ids = data.cards.map(c => [data.sets[c[2]][0], c[3]]);
const out = {};
let done = 0, priced = 0, missing = 0;

async function getCard(set, local) {
  for (const lang of ['de', 'en']) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(set + '-' + local)}`);
        if (r.status === 404) break;
        if (r.ok) return await r.json();
      } catch { /* erneut versuchen */ }
      await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
    }
  }
  return null;
}

let next = 0;
async function worker() {
  while (next < ids.length) {
    const [set, local] = ids[next++];
    const card = await getCard(set, local);
    const cm = card && card.pricing && card.pricing.cardmarket;
    if (cm && (cm.low != null || cm.trend != null)) {
      out[set + '/' + local] = [cm.low ?? null, cm.trend ?? null];
      priced++;
    } else missing++;
    if (++done % 1000 === 0) console.log(`${done}/${ids.length} …`);
  }
}
await Promise.all(Array.from({ length: 16 }, worker));

const stand = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
await writeFile(new URL('../data/prices.json', import.meta.url),
  JSON.stringify({ stand, quelle: 'Cardmarket-Preisdaten über tcgdex.net (low = Tiefstpreis, trend = Trendpreis, EUR)', p: out }));
console.log(`Fertig: ${priced} Karten mit Preis, ${missing} ohne Preis. Stand ${stand}.`);
