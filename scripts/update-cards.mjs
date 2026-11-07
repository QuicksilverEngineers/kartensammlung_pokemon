// Baut data/data.json (Kartenliste der Website) neu aus der tcgdex-Kartendatenbank
// und erzeugt scripts/cm-match.json für das Preis-Skript.
//
// Aufruf: node scripts/update-cards.mjs <Pfad zu cards-database/data> [--offline]
//   --offline  Bilder nicht online prüfen, sondern Angaben aus der bisherigen data.json übernehmen
//
// Übernommen werden nur Pokémon- und Trainerkarten mit deutschem Namen (ohne Pokémon TCG Pocket).
// Kartenschlüssel bleiben „Set-ID/Kartennummer“, damit gespeicherte Sammlungen erhalten bleiben.
import { readFile, writeFile, readdir, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.argv[2];
const OFFLINE = process.argv.includes('--offline');
if (!ROOT) { console.error('Pfad zu cards-database/data fehlt'); process.exit(1); }
const DATA = new URL('../data/data.json', import.meta.url);
const old = JSON.parse(await readFile(DATA, 'utf8'));

// ---------- Übersetzungen (wie bisher) ----------
const SERIE = { 'Base': 'Basis', 'Black & White': 'Schwarz & Weiß', 'Call of Legends': 'Ruf der Legenden', 'Diamond & Pearl': 'Diamant & Perl', 'E-Card': 'E-Card', 'EX': 'EX', 'Gym': 'Arena', 'HeartGold & SoulSilver': 'HeartGold & SoulSilver', 'Legendary Collection': 'Legendäre Sammlung', "McDonald's Collection": 'McDonald’s Kollektion', 'Mega Evolution': 'Mega-Entwicklung', 'Miscellaneous': 'Sonstige', 'Neo': 'Neo', 'POP': 'POP', 'Platinum': 'Platin', 'Scarlet & Violet': 'Karmesin & Purpur', 'Sun & Moon': 'Sonne & Mond', 'Sword & Shield': 'Schwert & Schild', 'Trainer kits': 'Trainer-Kits', 'XY': 'XY' };
const RAR = { 'Common': 'Häufig', 'Uncommon': 'Nicht so häufig', 'Rare': 'Selten', 'Holo Rare': 'Holo-Selten', 'Rare Holo': 'Holo-Selten', 'Ultra Rare': 'Ultra-Selten', 'Secret Rare': 'Geheim-Selten', 'Rare Holo LV.X': 'Holo-Selten LV.X', 'None': 'Ohne Angabe', 'Promo': 'Promo', 'Rare PRIME': 'Selten PRIME', 'LEGEND': 'LEGENDE', 'Double rare': 'Doppelselten', 'Pikachu Rare': 'Pikachu-Selten', 'Illustration rare': 'Illustration Rare', 'Special illustration rare': 'Special Illustration Rare', 'Futuristic Rare': 'Futuristisch-Selten', 'RGB Rare': 'RGB-Selten', 'Mega Attack Rare': 'Mega-Attacke-Selten', 'Mega Hyper Rare': 'Mega-Hyper-Selten', 'Crown': 'Krone', 'Hyper rare': 'Hyper-Selten', 'Black White Rare': 'Schwarz-Weiß-Selten', 'Shiny rare': 'Shiny Rare', 'Shiny Ultra Rare': 'Shiny Ultra Rare', 'ACE SPEC Rare': 'ACE SPEC Rare', 'Holo Rare V': 'Holo-Selten V', 'Holo Rare VSTAR': 'Holo-Selten VSTAR', 'Holo Rare VMAX': 'Holo-Selten VMAX', 'Radiant Rare': 'Strahlend-Selten', 'Classic Collection': 'Klassische Sammlung', 'Amazing Rare': 'Amazing Rare', 'Shiny rare V': 'Shiny Rare V', 'Shiny rare VMAX': 'Shiny Rare VMAX', 'Full Art Trainer': 'Full-Art-Trainer' };
const TT = { 'Supporter': 'Unterstützer', 'Stadium': 'Stadion', 'Item': 'Item', 'Tool': 'Pokémon-Ausrüstung', 'Technical Machine': 'Technische Maschine', "Rocket's Secret Machine": 'Rockets Geheimmaschine' };
const BLK = '#1D2939', SIL = '#8C96A3', GLD = '#C9A227', PNK = '#D6338A';
const SYM = { 'Häufig': ['●', BLK], 'Nicht so häufig': ['◆', BLK], 'Selten': ['★', BLK], 'Holo-Selten': ['★ H', BLK], 'Holo-Selten V': ['★', BLK], 'Holo-Selten VMAX': ['★', BLK], 'Holo-Selten VSTAR': ['★', BLK], 'Holo-Selten LV.X': ['★', BLK], 'Selten PRIME': ['★', BLK], 'LEGENDE': ['★', BLK], 'Amazing Rare': ['★', BLK], 'Strahlend-Selten': ['✦', BLK], 'Doppelselten': ['★★', BLK], 'Ultra-Selten': ['☆', SIL], 'Geheim-Selten': ['☆', GLD], 'Illustration Rare': ['★', GLD], 'Special Illustration Rare': ['★★', GLD], 'Hyper-Selten': ['★★★', GLD], 'Mega-Hyper-Selten': ['★★★', GLD], 'Mega-Attacke-Selten': ['★★', SIL], 'Shiny Rare': ['✦', GLD], 'Shiny Rare V': ['✦', GLD], 'Shiny Rare VMAX': ['✦', GLD], 'Shiny Ultra Rare': ['✦✦', GLD], 'ACE SPEC Rare': ['★', PNK], 'Promo': ['★ PROMO', BLK], 'Ohne Angabe': ['–', SIL], 'Schwarz-Weiß-Selten': ['★', SIL], 'Pikachu-Selten': ['★', GLD], 'Futuristisch-Selten': ['★', SIL], 'RGB-Selten': ['★', GLD], 'Klassische Sammlung': ['★', BLK], 'Krone': ['♛', GLD], 'Full-Art-Trainer': ['☆', SIL] };
const NEWSV = ['sv', 'me', '30th', 'mep', 'svp'];
const TYP = { normal: 'Standard', holo: 'Holo', reverse: 'Reverse Holo', firstEdition: '1st Edition' };
// Für Sets ohne deutschen Namen in der Datenbank den bisherigen (eingedeutschten) Namen behalten
const oldSetName = Object.fromEntries(old.sets.map(s => [s[0], s[1]]));

// ---------- tcgdex-Dateien lesen ----------
async function load(file) {
  let s = await readFile(file, 'utf8');
  s = s.replace(/^\s*import .*$/mg, '').replace(/const (\w+)\s*:\s*\w+\s*=/, 'const $1 =').replace(/export default (\w+)/, 'return $1');
  return new Function('Set', 'serie', s)({}, {});
}
const isDir = async p => (await stat(p)).isDirectory();
const sets = {}, cards = [];
for (const serie of await readdir(ROOT)) {
  const sp = path.join(ROOT, serie);
  if (!(await isDir(sp))) continue;
  const serieFile = await readFile(sp + '.ts', 'utf8').catch(() => '');
  const serieId = (serieFile.match(/id:\s*["']([^"']+)["']/) || [])[1] || serie;
  for (const setName of await readdir(sp)) {
    const dir = path.join(sp, setName);
    if (!(await isDir(dir))) continue;
    let set; try { set = await load(dir + '.ts'); } catch { continue; }
    sets[set.id] = { id: set.id, serie, serieId, name: set.name || {}, release: set.releaseDate || '', cm: set.thirdParty && set.thirdParty.cardmarket, official: set.cardCount && set.cardCount.official };
    for (const f of await readdir(dir)) {
      if (!f.endsWith('.ts')) continue;
      let c; try { c = await load(path.join(dir, f)); } catch { continue; }
      const V = Array.isArray(c.variants) ? c.variants : [];
      cards.push({
        set: set.id, local: f.slice(0, -3), name: c.name || {}, rarity: c.rarity, category: c.category, trainerType: c.trainerType, dexId: c.dexId,
        cm: [c.thirdParty && c.thirdParty.cardmarket, ...V.map(v => v.thirdParty && v.thirdParty.cardmarket)].filter(Boolean),
        vobj: Array.isArray(c.variants) ? null : c.variants, variants: V,
      });
    }
  }
}

// ---------- Filtern und umwandeln ----------
const keep = cards.filter(c => (c.category === 'Pokemon' || c.category === 'Trainer') && sets[c.set].serie !== 'Pokémon TCG Pocket' && c.name.de
  && (c.category !== 'Pokemon' || (c.dexId && c.dexId.length)));
const pyCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // Sortierung wie bisher (Unicode-Reihenfolge)
const numKey = l => { const m = String(l).match(/^(\D*)(\d+)(.*)$/s); return m ? [m[1], +m[2], m[3]] : [l, 0, '']; };
const cmpNum = (a, b) => { const x = numKey(a), y = numKey(b); return pyCmp(x[0], y[0]) || x[1] - y[1] || pyCmp(x[2], y[2]); };
const nr = c => {
  const off = sets[c.set].official, l = c.local;
  if (/^\d+$/.test(l) && off && !c.set.endsWith('p')) return `${l}/${l.startsWith('0') ? String(off).padStart(l.length, '0') : off}`;
  return l;
};
const ausf = c => {
  const t = [];
  c.variants.forEach(v => { t.push(v.type); if (v.stamp && v.stamp.includes('1st-edition')) t.push('firstEdition'); });
  if (c.vobj) Object.entries(c.vobj).forEach(([k, v]) => { if (v) t.push(k); });
  return ['normal', 'holo', 'reverse', 'firstEdition'].filter(k => t.includes(k)).map(k => TYP[k]).join(' / ') || 'Im Angebot prüfen';
};
const rarName = c => RAR[c.rarity] ?? c.rarity;
const rarSym = c => {
  const n = rarName(c);
  if (n === 'Ultra-Selten' && NEWSV.some(p => c.set.startsWith(p))) return ['★★', SIL];
  return SYM[n] || ['★', BLK];
};

const setIds = [...new Set(keep.map(c => c.set))].sort((a, b) => pyCmp(sets[a].release, sets[b].release) || pyCmp(a, b));
const SI = Object.fromEntries(setIds.map((s, i) => [s, i]));
const setName = s => { const n = sets[s].name; return ((!n.de || n.de === n.en) && oldSetName[s]) || n.de || n.en || s; };
const setsOut = setIds.map(s => [s, setName(s), sets[s].release, sets[s].serieId, SERIE[sets[s].serie] || sets[s].serie]);

keep.sort((a, b) => {
  const ka = a.category === 'Pokemon' ? a.dexId[0] : 9999, kb = b.category === 'Pokemon' ? b.dexId[0] : 9999;
  if (ka !== kb) return ka - kb;
  const na = a.category !== 'Pokemon' ? a.name.de.toLowerCase() : '', nb = b.category !== 'Pokemon' ? b.name.de.toLowerCase() : '';
  return pyCmp(na, nb) || pyCmp(sets[a.set].release, sets[b.set].release) || pyCmp(a.set, b.set) || cmpNum(a.local, b.local);
});

// ---------- Bilder: deutsch (1), nur englisch (2) oder keins (0) ----------
const oldImg = {};
old.cards.forEach(c => { oldImg[old.sets[c[2]][0] + '/' + c[3]] = c[8]; });
const img = {};
async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.status === 404) return null; if (r.ok) return await r.json(); } catch { }
    await new Promise(res => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}
async function head(url) {
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { }
  }
  return false;
}
async function pool(items, n, fn) { let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) await fn(items[k++]); })); }
if (OFFLINE) {
  keep.forEach(c => { const k = c.set + '/' + c.local; img[k] = oldImg[k] ?? 0; });
} else {
  await pool(setIds, 6, async sid => {
    const m = {};
    for (const lang of ['de', 'en']) {
      const j = await getJson(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(sid)}`);
      ((j && j.cards) || []).forEach(c => { if (c.image) (m[c.localId] = m[c.localId] || {})[lang] = true; });
    }
    const mine = keep.filter(c => c.set === sid);
    if (Object.keys(m).length) {
      mine.forEach(c => { const v = m[c.local] || {}; img[sid + '/' + c.local] = v.de ? 1 : v.en ? 2 : 0; });
    } else {
      // Set ohne Bildangaben in der API: Bilddateien direkt prüfen
      await pool(mine, 8, async c => {
        const b = `https://assets.tcgdex.net/{l}/${sets[sid].serieId}/${sid}/${encodeURIComponent(c.local)}/low.webp`;
        img[sid + '/' + c.local] = (await head(b.replace('{l}', 'de'))) ? 1 : (await head(b.replace('{l}', 'en'))) ? 2 : 0;
      });
    }
  });
}

// ---------- data.json schreiben ----------
const rarities = [], RI = new Map();
const rk = c => {
  const [sym, col] = rarSym(c), n = rarName(c), key = sym + '|' + col + '|' + n;
  if (!RI.has(key)) { RI.set(key, rarities.length); rarities.push([sym, col, n]); }
  return RI.get(key);
};
const out = keep.map(c => {
  const ids = [...new Set(c.cm)];
  return [c.category === 'Pokemon' ? c.dexId[0] : 0, c.name.de, SI[c.set], c.local, nr(c), rk(c), ausf(c), ids[0] || 0,
    img[c.set + '/' + c.local] ?? 0, c.category === 'Pokemon' ? '' : (TT[c.trainerType] || c.trainerType || 'Trainer (ältere Karte)')];
});
// Pokémon-Liste der Sammlung: bisherige Liste, ergänzt um neue Pokédex-Nummern
const pokemon = old.pokemon.slice();
const known = new Set(pokemon.map(p => p[0]));
keep.filter(c => c.category === 'Pokemon').forEach(c => {
  const d = c.dexId[0];
  if (!known.has(d)) { known.add(d); pokemon.push([d, c.name.de.replace(/^Mega-|-?(ex|EX|GX|V|VMAX|VSTAR)$/g, '').trim()]); }
});
pokemon.sort((a, b) => a[0] - b[0]);
const stand = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
await writeFile(DATA, JSON.stringify({ pokemon, sets: setsOut, rarities, cards: out, stand }));

// ---------- cm-match.json für das Preis-Skript ----------
const PARENT = { 'sma': 'sm115', 'swsh4.5sv': 'swsh4.5', 'swsh9tg': 'swsh9', 'swsh10tg': 'swsh10', 'swsh11tg': 'swsh11', 'swsh12tg': 'swsh12', 'swsh12.5gg': 'swsh12.5', '30th-c': '30th', 'exu': 'ex10', 'g1': 'g1' };
const need = {}, setinfo = {};
keep.forEach(c => {
  if (c.cm.length) return;
  need[c.set + '/' + c.local] = c.name.en || '';
  if (!setinfo[c.set]) {
    const p = PARENT[c.set];
    setinfo[c.set] = { exp: [sets[c.set].cm, p && sets[p] && sets[p].cm].filter(Boolean), parent: p || null };
  }
});
await writeFile(new URL('./cm-match.json', import.meta.url), JSON.stringify({ cards: need, sets: setinfo }, null, 0));

// ---------- Zusammenfassung ----------
const oldKeys = new Set(old.cards.map(c => old.sets[c[2]][0] + '/' + c[3]));
const newKeys = new Set(out.map(c => setsOut[c[2]][0] + '/' + c[3]));
const added = [...newKeys].filter(k => !oldKeys.has(k)), removed = [...oldKeys].filter(k => !newKeys.has(k));
const oldSets = new Set(old.sets.map(s => s[0]));
const newSets = setsOut.filter(s => !oldSets.has(s[0]));
const perSet = {}; added.forEach(k => { const s = k.split('/')[0]; perSet[s] = (perSet[s] || 0) + 1; });
const lines = [
  `## Kartendaten aktualisiert (${stand})`,
  `- Karten gesamt: **${out.length}** (vorher ${old.cards.length})`,
  `- Neue Karten: **${added.length}**, entfernt: ${removed.length}`,
  `- Neue Erweiterungen: ${newSets.length ? newSets.map(s => `${s[1]} (${s[0]}, ${s[2]})`).join(', ') : 'keine'}`,
  ...Object.entries(perSet).map(([s, n]) => `  - ${setsOut[SI[s]][1]}: ${n} neue Karten`),
  `- Bilder: ${out.filter(c => c[8] === 1).length} deutsch, ${out.filter(c => c[8] === 2).length} englisch, ${out.filter(c => !c[8]).length} ohne${OFFLINE ? ' (offline übernommen)' : ''}`,
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
