// Erstellt eine Momentaufnahme der Cardmarket-Preise für alle Karten in data/data.json
// und schreibt sie nach data/prices.json: p["set/lokaleNr"] = [Tiefstpreis, Trendpreis, idProduct].
//
// Quellen (in dieser Reihenfolge):
//  1. Offizielle Cardmarket-Preisliste (price_guide_6.json) über die Cardmarket-Produkt-ID der Karte
//  2. Karten ohne bekannte Produkt-ID: Zuordnung über Cardmarket-Produktliste (Erweiterung + englischer Name)
//  3. Rest: Preisangaben der tcgdex-API
// Aufruf: node scripts/update-prices.mjs
import { readFile, writeFile } from 'node:fs/promises';

const CM = 'https://downloads.s3.cardmarket.com/productCatalog';
const data = JSON.parse(await readFile(new URL('../data/data.json', import.meta.url)));
const match = JSON.parse(await readFile(new URL('./cm-match.json', import.meta.url)));

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
      console.log(`HTTP ${r.status} für ${url}`);
    } catch (e) { console.log(`Fehler bei ${url}: ${e.message}`); }
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
  }
  return null;
}

// ---- 1) Cardmarket-Preisliste und Produktliste laden ----
const guide = await getJson(`${CM}/priceGuide/price_guide_6.json`);
const plist = await getJson(`${CM}/productList/products_singles_6.json`);
const guideList = (guide && (guide.priceGuides || guide.priceguides)) || [];
const prodList = (plist && plist.products) || [];
console.log(`Cardmarket-Preisliste: ${guideList.length} Einträge${guide && guide.createdAt ? ' vom ' + guide.createdAt : ''}; Produktliste: ${prodList.length} Einzelkarten`);
const G = new Map(guideList.map(g => [g.idProduct, g]));
const P = new Map(prodList.map(p => [p.idProduct, p]));
const pick = (a, b) => (a != null && a > 0 ? a : (b != null && b > 0 ? b : null));
const fromGuide = id => {
  const g = G.get(id);
  if (!g) return null;
  const low = pick(g.low, g['low-holo']), trend = pick(g.trend, g['trend-holo']);
  return low == null && trend == null ? null : [low, trend, id];
};

// ---- 2) Karten ohne Produkt-ID über die Produktliste zuordnen ----
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\[[^\]]*\]/g, '') // Cardmarket hängt Attacken in [eckigen Klammern] an
  .replace(/\((v\.?\s*\d+|[^)]*version[^)]*)\)/g, '').replace(/[^a-z0-9]/g, '');
const setExp = {}; // Erweiterungs-IDs je Set: aus Set-Daten + aus Karten des Sets mit bekannter Produkt-ID
for (const [sid, info] of Object.entries(match.sets)) setExp[sid] = new Set(info.exp);
data.cards.forEach(c => {
  const sid = data.sets[c[2]][0];
  if (setExp[sid] && c[7] && P.has(c[7])) setExp[sid].add(P.get(c[7]).idExpansion);
});
for (const [sid, info] of Object.entries(match.sets)) {
  if (info.parent && setExp[info.parent]) setExp[info.parent].forEach(e => setExp[sid].add(e));
}
const byExpName = new Map();
prodList.forEach(p => {
  const k = p.idExpansion + '|' + norm(p.name);
  if (!byExpName.has(k)) byExpName.set(k, []);
  byExpName.get(k).push(p.idProduct);
});
const numKey = l => { const m = String(l).match(/^(\D*)(\d+)(.*)$/); return m ? [m[1], +m[2], m[3]] : [l, 0, '']; };
const cmp = (a, b) => { const x = numKey(a), y = numKey(b); return x[0].localeCompare(y[0]) || x[1] - y[1] || x[2].localeCompare(y[2]); };
const groups = new Map(); // gleiche Erweiterung + gleicher Name -> nach Nummer sortiert zuordnen
for (const [key, en] of Object.entries(match.cards)) {
  const [sid, local] = key.split('/');
  const g = sid + '|' + norm(en);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(local);
}
const matchedId = {};
for (const [g, locals] of groups) {
  const [sid, n] = g.split('|');
  if (!n) continue;
  let cands = [];
  (setExp[sid] || new Set()).forEach(e => { cands = cands.concat(byExpName.get(e + '|' + n) || []); });
  cands = [...new Set(cands)].sort((a, b) => a - b);
  locals.sort(cmp);
  if (cands.length === 1 && locals.length === 1) matchedId[sid + '/' + locals[0]] = cands[0];
  else if (cands.length && cands.length === locals.length) locals.forEach((l, i) => { matchedId[sid + '/' + l] = cands[i]; });
}
// Diagnose: einige nicht zugeordnete Karten mit ähnlichen Produktnamen ausgeben
let shown = 0;
for (const [g, locals] of groups) {
  const [sid, n] = g.split('|');
  if (locals.some(l => matchedId[sid + '/' + l]) || shown >= 12) continue;
  const exps = [...(setExp[sid] || [])];
  const sim = prodList.filter(p => exps.includes(p.idExpansion) && norm(p.name).startsWith(n.slice(0, 4))).slice(0, 4).map(p => p.name + ' #' + p.idProduct);
  console.log(`  offen: ${sid} ${locals.join(',')} „${n}“ Erw. ${exps.join('/') || '–'} → ${sim.join(' | ') || 'kein ähnliches Produkt'}`);
  shown++;
}
console.log(`Produkt-IDs über die Produktliste zugeordnet: ${Object.keys(matchedId).length} von ${Object.keys(match.cards).length}`);

// ---- 3) Preise zusammenstellen ----
const out = {};
const rest = [];
let viaGuide = 0;
data.cards.forEach(c => {
  const key = data.sets[c[2]][0] + '/' + c[3];
  const id = c[7] || matchedId[key];
  const pr = id ? fromGuide(id) : null;
  if (pr) { out[key] = pr; viaGuide++; } else rest.push([key, id || null]);
});
console.log(`Preise aus der Cardmarket-Preisliste: ${viaGuide}; über tcgdex nachschlagen: ${rest.length}`);

let next = 0, viaTcgdex = 0;
async function worker() {
  while (next < rest.length) {
    const [key, id] = rest[next++];
    const [set, local] = key.split('/');
    let card = await getJson(`https://api.tcgdex.net/v2/de/cards/${encodeURIComponent(set + '-' + local)}`);
    if (!card) card = await getJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(set + '-' + local)}`);
    const cm = card && card.pricing && card.pricing.cardmarket;
    if (cm && (cm.low != null || cm.trend != null)) {
      out[key] = [cm.low ?? null, cm.trend ?? null, cm.idProduct ?? id];
      viaTcgdex++;
    } else if (id) out[key] = [null, null, id]; // Produkt bekannt, aber aktuell ohne Preis
  }
}
await Promise.all(Array.from({ length: 16 }, worker));

const priced = Object.values(out).filter(v => v[0] != null || v[1] != null).length;
const stand = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
await writeFile(new URL('../data/prices.json', import.meta.url), JSON.stringify({
  stand,
  quelle: 'Cardmarket-Preisliste (low = Tiefstpreis, trend = Trendpreis, EUR), ergänzend tcgdex.net',
  p: out,
}));
console.log(`Fertig: ${priced} von ${data.cards.length} Karten mit Preis (Cardmarket ${viaGuide}, tcgdex ${viaTcgdex}). Stand ${stand}.`);
