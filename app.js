(function(){
'use strict';
const KEY='pkmn-sammlung-v1';
const PAGE=60;
let D=null;                // data
let ST={p:{},c:{}};        // state: p = Pokémon (dex -> 1/0), c = cards ("set/local" -> count)
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&s.p&&s.c)ST=s}catch(e){}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(ST))}catch(e){}}

// card helpers: [dex,name,setIdx,local,nr,rarIdx,ausf,cmId,img,trainerType]
const cid=c=>D.sets[c[2]][0]+'/'+c[3];
const cnt=c=>ST.c[cid(c)]||0;
function imgUrls(c){
  if(!c[8])return [];
  const s=D.sets[c[2]],p=`https://assets.tcgdex.net/{l}/${s[3]}/${s[0]}/${encodeURIComponent(c[3])}/low.webp`;
  return c[8]===1?[p.replace('{l}','de')]:[p.replace('{l}','de'),p.replace('{l}','en')];
}
function cmUrl(c){
  if(c[7])return 'https://www.cardmarket.com/de/Pokemon/Products?idProduct='+c[7];
  return 'https://www.cardmarket.com/de/Pokemon/Products/Search?category=-1&searchMode=v2&searchString='+encodeURIComponent(c[1]+' '+c[4]+' '+D.sets[c[2]][1]);
}
const cmSearch=name=>'https://www.cardmarket.com/de/Pokemon/Products/Search?category=-1&searchMode=v2&searchString='+encodeURIComponent(name);
const sprite=d=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${d}.png`;
const rarHtml=i=>{const r=D.rarities[i];return `<span class="sym" style="color:${r[1]}" title="${esc(r[2])}">${esc(r[0])}</span>`};

// ---------- routing ----------
function route(){
  const h=(location.hash||'#uebersicht').slice(1); const [tab,qs]=h.split('?');
  const t=['uebersicht','sammlung','karten','trainer','fehlend','scan'].includes(tab)?tab:'uebersicht';
  document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('active',a.dataset.tab===t));
  document.querySelectorAll('.view').forEach(v=>v.hidden=true);
  const params=new URLSearchParams(qs||'');
  if(t==='uebersicht'){$('#view-uebersicht').hidden=false;renderStats()}
  if(t==='sammlung'){$('#view-sammlung').hidden=false;renderSammlung()}
  if(t==='karten'||t==='trainer'){$('#view-karten').hidden=false;openCards(t,params)}
  if(t==='fehlend'){$('#view-fehlend').hidden=false;renderFehlend()}
  if(t==='scan'){$('#view-scan').hidden=false}
  window.scrollTo(0,0);
}

// ---------- Übersicht ----------
function renderStats(){
  const pk=D.cards.filter(c=>c[0]>0), tr=D.cards.filter(c=>c[0]===0);
  const pOwn=D.pokemon.filter(p=>owned(p[0])).length;
  const kOwn=pk.filter(c=>cnt(c)>0).length, tOwn=tr.filter(c=>cnt(c)>0).length;
  const total=Object.values(ST.c).reduce((a,b)=>a+b,0);
  const box=(lbl,a,b)=>`<div class="stat"><div class="lbl">${lbl}</div><div class="val">${a.toLocaleString('de-DE')} <span class="muted" style="font-size:15px">von ${b.toLocaleString('de-DE')}</span></div><div class="bar"><i style="width:${b?(a/b*100).toFixed(1):0}%"></i></div></div>`;
  $('#stats').innerHTML=box('Pokémon vorhanden',pOwn,D.pokemon.length)+box('Pokémon-Karten vorhanden',kOwn,pk.length)+box('Trainerkarten vorhanden',tOwn,tr.length)
    +`<div class="stat"><div class="lbl">Karten insgesamt (inkl. Dubletten)</div><div class="val">${total.toLocaleString('de-DE')}</div><div class="muted" style="font-size:13px">Fehlende Pokémon: ${(D.pokemon.length-pOwn).toLocaleString('de-DE')}</div></div>`;
}
function renderLegend(){
  const seen=new Set();let h='';
  D.rarities.forEach(r=>{const k=r[0]+r[1]+r[2];if(seen.has(k))return;seen.add(k);h+=`<div><span class="sym" style="color:${r[1]}">${esc(r[0])}</span>${esc(r[2])}</div>`});
  $('#legend').innerHTML=h;
}

// ---------- Sammlung ----------
const cardsPerDex={}, cardsByDex={};
// Pokémon gilt als vorhanden, wenn eine seiner Karten eingetragen ist oder es manuell auf Ja steht.
// ST.p enthält nur die manuelle Auswahl – so fällt der Status zurück, wenn alle Karten wieder auf 0 stehen.
const hasCards=d=>(cardsByDex[d]||[]).some(c=>cnt(c)>0);
const owned=d=>!!ST.p[d]||hasCards(d);
function renderSammlung(){
  const q=$('#s-q').value.trim().toLowerCase(), st=$('#s-status').value;
  const rows=D.pokemon.filter(p=>{
    if(q&&!(p[1].toLowerCase().includes(q)||String(p[0])===q.replace(/^#?0*/,'')))return false;
    if(st==='ja'&&!owned(p[0]))return false; if(st==='nein'&&owned(p[0]))return false; return true});
  $('#s-count').textContent=rows.length.toLocaleString('de-DE')+' Pokémon';
  $('#s-table tbody').innerHTML=rows.map(p=>{const d=p[0],on=owned(d),byCard=hasCards(d),n=cardsPerDex[d]||0;
    return `<tr><td>${String(d).padStart(4,'0')}</td><td><img loading="lazy" alt="" src="${sprite(d)}"></td><td class="name">${esc(p[1])}</td>
    <td><span class="yn" data-dex="${d}"><button class="${on?'on-ja':''}" data-v="1">Ja</button><button class="${on?'':'on-nein'}" data-v="0">Nein</button></span>${byCard?'<div class="muted" style="font-size:11px">durch Karte</div>':''}</td>
    <td><a href="#karten?dex=${d}">${n} Karte${n===1?'':'n'}</a></td><td><a class="cm" target="_blank" rel="noopener" href="${cmSearch(p[1])}">Cardmarket</a></td></tr>`}).join('');
}
$('#s-table').addEventListener('click',e=>{const b=e.target.closest('.yn button');if(!b)return;const d=b.parentNode.dataset.dex;
  if(b.dataset.v==='1')ST.p[d]=1;else delete ST.p[d];save();
  if(b.dataset.v==='0'&&hasCards(d))alertMsg('Für dieses Pokémon sind Karten eingetragen – es bleibt vorhanden. Setze die Karten auf 0, um es zu entfernen.');
  const on=owned(d);b.parentNode.children[0].className=on?'on-ja':'';b.parentNode.children[1].className=on?'':'on-nein'});

// ---------- Karten / Trainer ----------
let KV={mode:'karten',page:1,dex:null,list:[]};
function openCards(mode,params){
  if(KV.mode!==mode){$('#k-q').value='';$('#k-set').value='';$('#k-rar').value='';$('#k-type').value='';$('#k-status').value=''}
  KV.mode=mode;KV.page=1;KV.dex=params.get('dex')?+params.get('dex'):null;
  if(KV.dex){const p=D.pokemon.find(x=>x[0]===KV.dex);$('#k-q').value=p?p[1]:''}
  $('#k-type').hidden=mode!=='trainer';
  $('#k-q').placeholder=mode==='trainer'?'Name der Trainerkarte …':'Name oder Pokédex-Nr. …';
  filterCards();
}
function filterCards(){
  const tr=KV.mode==='trainer', q=$('#k-q').value.trim().toLowerCase(), s=$('#k-set').value, r=$('#k-rar').value, ty=$('#k-type').value, st=$('#k-status').value;
  const qn=/^#?\d+$/.test(q)?+q.replace('#',''):null;
  const qnr=/^\d+\s*\//.test(q)?q.replace(/\s/g,'').replace(/^0+/,''):null;
  const rset=r?new Set(r.split(',').map(Number)):null;
  KV.list=D.cards.filter(c=>{
    if(tr?c[0]!==0:c[0]===0)return false;
    if(KV.dex&&c[0]!==KV.dex)return false;
    if(q&&!KV.dex){if(qnr){if(!c[4].replace(/^0+/,'').startsWith(qnr))return false}else if(qn!==null&&!tr){if(c[0]!==qn)return false}else if(!c[1].toLowerCase().includes(q))return false}
    if(s!==''&&c[2]!==+s)return false;
    if(rset&&!rset.has(c[5]))return false;
    if(ty&&c[9]!==ty)return false;
    if(st==='ja'&&!cnt(c))return false; if(st==='nein'&&cnt(c))return false;
    return true});
  renderCards();
}
function renderCards(){
  const L=KV.list,pages=Math.max(1,Math.ceil(L.length/PAGE));KV.page=Math.min(KV.page,pages);
  const part=L.slice((KV.page-1)*PAGE,KV.page*PAGE);
  $('#k-count').textContent=L.length.toLocaleString('de-DE')+' Karten'+(KV.dex?' · Filter Pokédex-Nr. '+KV.dex:'');
  $('#k-grid').innerHTML=part.map(c=>{const n=cnt(c),u=imgUrls(c),s=D.sets[c[2]];
    const im=u.length?`<img loading="lazy" alt="${esc(c[1])}" src="${u[0]}" data-alt="${u[1]||''}">`:'Kein Bild verfügbar';
    const title=c[0]?`<a href="#sammlung" data-goto="${c[0]}">${esc(c[1])}</a><span class="kdex">#${String(c[0]).padStart(4,'0')}</span>`:`<span>${esc(c[1])}</span>`;
    return `<div class="kc${n?' owned':''}" data-id="${esc(cid(c))}" data-dex="${c[0]}">
      <div class="kimg">${im}</div>
      <div class="kname">${title}</div>
      <div class="kmeta"><b>${esc(s[1])}</b> · ${esc(c[4])}<br>${c[9]?esc(c[9])+' · ':''}${esc(c[6])}</div>
      <div class="krow">${rarHtml(c[5])}<a class="cm" target="_blank" rel="noopener" href="${cmUrl(c)}">Cardmarket</a></div>
      <div class="krow"><span class="muted" style="font-size:12px">Anzahl</span><span class="cnt"><button data-d="-1" aria-label="weniger">−</button><span>${n}</span><button data-d="1" aria-label="mehr">+</button></span></div>
    </div>`}).join('')||'<p class="muted">Keine Karten gefunden.</p>';
  $('#k-grid').querySelectorAll('img').forEach(img=>img.addEventListener('error',function(){
    if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else{this.parentNode.textContent='Kein Bild verfügbar'}},{once:false}));
  // pager
  const btn=(p,l,dis,cur)=>`<button data-p="${p}" ${dis?'disabled':''} class="${cur?'cur':''}">${l}</button>`;
  let h=btn(KV.page-1,'‹ Zurück',KV.page===1);
  const win=[...new Set([1,KV.page-2,KV.page-1,KV.page,KV.page+1,KV.page+2,pages])].filter(p=>p>=1&&p<=pages).sort((a,b)=>a-b);
  let last=0;win.forEach(p=>{if(p-last>1)h+='<span class="muted">…</span>';h+=btn(p,p,false,p===KV.page);last=p});
  h+=btn(KV.page+1,'Weiter ›',KV.page===pages);
  $('#k-pager').innerHTML=pages>1?h:'';
}
$('#k-pager').addEventListener('click',e=>{const b=e.target.closest('button[data-p]');if(!b||b.disabled)return;KV.page=+b.dataset.p;renderCards();$('#view-karten').scrollIntoView()});
$('#k-grid').addEventListener('click',e=>{
  const g=e.target.closest('[data-goto]');
  if(g){e.preventDefault();location.hash='#sammlung';setTimeout(()=>{$('#s-q').value=String(g.dataset.goto);renderSammlung()},0);return}
  const b=e.target.closest('.cnt button');if(!b)return;
  const card=b.closest('.kc'),id=card.dataset.id,n=Math.max(0,Math.min(99,(ST.c[id]||0)+ +b.dataset.d));
  const dex=+card.dataset.dex, before=dex>0&&owned(dex);
  if(n)ST.c[id]=n;else delete ST.c[id];
  save();
  // Sammlung folgt den Karten: erste Karte -> vorhanden, letzte Karte auf 0 -> wieder fehlend (außer manuell Ja)
  if(dex>0){const after=owned(dex),name=card.querySelector('.kname a,.kname span').textContent;
    if(!before&&after)alertMsg(name+' ist jetzt in der Sammlung als vorhanden markiert.');
    if(before&&!after)alertMsg(name+' ist in der Sammlung wieder als fehlend markiert.')}
  b.parentNode.querySelector('span').textContent=n;card.classList.toggle('owned',n>0);
});
['#k-set','#k-rar','#k-type','#k-status'].forEach(s=>$(s).addEventListener('change',()=>{KV.page=1;filterCards()}));
let tq;$('#k-q').addEventListener('input',()=>{clearTimeout(tq);tq=setTimeout(()=>{if(KV.dex){KV.dex=null;history.replaceState(null,'','#'+KV.mode)}KV.page=1;filterCards()},200)});
let ts;$('#s-q').addEventListener('input',()=>{clearTimeout(ts);ts=setTimeout(renderSammlung,150)});
$('#s-status').addEventListener('change',renderSammlung);

// ---------- Fehlend ----------
function renderFehlend(){
  const m=D.pokemon.filter(p=>!owned(p[0]));
  $('#f-count').textContent=`Noch fehlend: ${m.length.toLocaleString('de-DE')} von ${D.pokemon.length.toLocaleString('de-DE')}`;
  $('#f-list').innerHTML=m.map(p=>`<div><span>${String(p[0]).padStart(4,'0')}</span>${esc(p[1])}</div>`).join('')||'<p>Alle Pokémon vorhanden – Glückwunsch!</p>';
}

// ---------- Karten scannen (kostenlos, Texterkennung im Browser mit Tesseract.js) ----------
const TESS_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let SCAN={file:null,img:null,rot:0,mode:'nine',results:[]},IX=null,worker=null;
try{SCAN.mode=localStorage.getItem('pkmn-scan-mode')||'nine'}catch(e){}
const setMode=m=>{SCAN.mode=m;document.querySelectorAll('#scan-mode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));try{localStorage.setItem('pkmn-scan-mode',m)}catch(e){}};
setMode(SCAN.mode);
$('#scan-mode').addEventListener('click',e=>{const b=e.target.closest('button[data-m]');if(b)setMode(b.dataset.m)});
function loadScript(src){return new Promise((ok,err)=>{if(window.Tesseract)return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>err(new Error('Texterkennung konnte nicht geladen werden (Internetverbindung?).'));document.head.appendChild(s)})}
async function getWorker(){
  if(worker)return worker;
  await loadScript(TESS_URL);
  worker=await Tesseract.createWorker('deu',1,{logger:m=>{if(m.status==='recognizing text')scanStatus(`Text wird gelesen … ${Math.round(m.progress*100)} %`);else if(/load|init/.test(m.status))scanStatus('Texterkennung wird vorbereitet … (beim ersten Mal ca. 10 MB)')}});
  await worker.setParameters({tessedit_pageseg_mode:'11'});
  return worker;
}
const scanStatus=t=>{$('#scan-status').textContent=t};
function drawPreview(){
  if(!SCAN.img){$('#scan-preview').innerHTML='';return}
  const cv=prepCanvas(SCAN.rot,600,false);cv.style.maxWidth='100%';cv.style.maxHeight='320px';cv.style.borderRadius='8px';
  $('#scan-preview').innerHTML='';$('#scan-preview').appendChild(cv);
}
// Bild drehen, skalieren und in Graustufen umwandeln
function prepCanvas(rot,target,gray=true){
  const im=SCAN.img,sw=im.naturalWidth,sh=im.naturalHeight,f=Math.min(3,target/Math.max(sw,sh));
  const w=Math.round(sw*f),h=Math.round(sh*f),r=((rot%360)+360)%360,cv=document.createElement('canvas');
  cv.width=r%180?h:w;cv.height=r%180?w:h;const g=cv.getContext('2d');
  if(gray)g.filter='grayscale(1) contrast(1.2)';
  g.translate(cv.width/2,cv.height/2);g.rotate(r*Math.PI/180);g.drawImage(im,-w/2,-h/2,w,h);return cv;
}
$('#scan-file').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;SCAN.file=f;SCAN.rot=0;
  const img=new Image();img.onload=()=>{SCAN.img=img;drawPreview();$('#scan-go').disabled=false;$('#scan-rot').hidden=false};img.src=URL.createObjectURL(f);
  $('#scan-results').innerHTML='';scanStatus('')});
$('#scan-rot').addEventListener('click',e=>{const b=e.target.closest('button[data-r]');if(!b)return;SCAN.rot=(SCAN.rot+ +b.dataset.r+360)%360;drawPreview()});
const quality=r=>r.items.reduce((a,it)=>a+it.score,0);
$('#scan-go').addEventListener('click',async()=>{
  $('#scan-go').disabled=true;$('#scan-results').innerHTML='';
  try{
    const w=await getWorker();if(!IX)IX=ScanMatch.buildIndex(D);
    const one=SCAN.mode==='one',target=one?2200:4000,need=one?1:3;
    // Zuerst wie angezeigt lesen; wenn kaum etwas erkannt wird, automatisch gedreht versuchen
    let best=null;
    for(const extra of [0,90,270,180]){
      const rot=(SCAN.rot+extra)%360;
      scanStatus(extra?`Wenig erkannt – versuche das Bild um ${extra}° gedreht …`:'Text wird gelesen …');
      const {data}=await w.recognize(prepCanvas(rot,target));
      const r=ScanMatch.analyze(data.text,IX,{mode:SCAN.mode});r.rot=rot;
      if(!best||quality(r)>quality(best))best=r;
      if(r.items.filter(i=>i.score>=3).length>=need)break;
    }
    if(best.rot!==SCAN.rot){SCAN.rot=best.rot;drawPreview()}
    SCAN.results=best.items;
    const sure=best.items.filter(i=>i.sicher).length;
    scanStatus(best.items.length?`${best.items.length} Karte${best.items.length===1?'':'n'} gefunden, ${sure} davon sicher (angehakt). Bitte prüfen und hinzufügen.`:'Keine Karte erkannt. Tipp: näher heran, gerade von oben, ohne Spiegelung – oder den Modus „1 Karte“ nutzen.');
    renderScan();
  }catch(e){scanStatus(e.message||String(e))}
  $('#scan-go').disabled=false;
});
function renderScan(){
  if(!SCAN.results.length){$('#scan-results').innerHTML='';return}
  $('#scan-results').innerHTML=SCAN.results.map((r,i)=>{
    const c=D.cards[r.cand[0]],u=imgUrls(c);
    const opts=r.cand.map(ci=>{const cc=D.cards[ci];return `<option value="${ci}">${esc(cc[1])} · ${esc(D.sets[cc[2]][1])} · ${esc(cc[4])}</option>`}).join('');
    return `<div class="sr" data-i="${i}">
      <input type="checkbox" ${r.sicher?'checked':''} aria-label="Hinzufügen">
      ${u.length?`<img loading="lazy" alt="" src="${u[0]}" data-alt="${u[1]||''}">`:'<div class="ph"></div>'}
      <div><div><b>${esc(c[1])}</b> <span class="muted">(${cnt(c)}× vorhanden)</span></div>
        <div class="det">${esc(D.sets[c[2]][1])} · ${esc(c[4])} · erkannt über ${esc(r.how)}${r.sicher?'':' – bitte prüfen'}</div>
        ${r.cand.length>1?`<select>${opts}</select>`:''}
      </div></div>`}).join('')+`<div class="scan-actions"><button class="btn" id="scan-add">Ausgewählte hinzufügen (+1)</button><span class="muted">Nur angehakte Karten werden hinzugefügt. Fehlt eine Karte, trage sie in „Kartenversionen“ ein (Suche nach Name oder Nummer, z. B. 123/131).</span></div>`;
  $('#scan-results').querySelectorAll('img').forEach(img=>img.addEventListener('error',function(){if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}}));
}
$('#scan-results').addEventListener('change',e=>{const s=e.target.closest('select');if(!s)return;const el=s.closest('.sr'),i=+el.dataset.i;
  const r=SCAN.results[i],ci=+s.value,chk=el.querySelector('input').checked;r.cand=[ci,...r.cand.filter(x=>x!==ci)];
  renderScan();const n=$(`.sr[data-i="${i}"]`);n.querySelector('input').checked=true;n.querySelector('select').value=ci});
$('#scan-results').addEventListener('click',e=>{if(!e.target.closest('#scan-add'))return;
  let added=0;const newly=[];
  document.querySelectorAll('#scan-results .sr').forEach(el=>{const cb=el.querySelector('input');if(!cb.checked)return;
    const c=D.cards[SCAN.results[+el.dataset.i].cand[0]],id=cid(c),before=c[0]>0&&owned(c[0]);
    ST.c[id]=Math.min(99,(ST.c[id]||0)+1);added++;if(c[0]>0&&!before)newly.push(c[1])});
  save();SCAN.results=[];$('#scan-results').innerHTML='';
  scanStatus(`${added} Karte${added===1?'':'n'} hinzugefügt.`+(newly.length?` Neu in der Sammlung: ${newly.join(', ')}.`:''));
  alertMsg(`${added} Karte${added===1?'':'n'} hinzugefügt.`)});

// ---------- Backup ----------
$('#btn-export').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({app:'pkmn-sammlung',version:1,datum:new Date().toISOString(),...ST},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pokemon-sammlung-sicherung.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
$('#file-import').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{
  try{const j=JSON.parse(t);if(!j.p||!j.c)throw 0;ST={p:j.p,c:j.c};save();renderStats();alertMsg('Sicherung geladen.')}catch(x){alertMsg('Die Datei ist keine gültige Sicherung.')}});e.target.value=''});
$('#btn-reset').addEventListener('click',()=>{if(confirm('Wirklich alle Einträge in diesem Browser löschen?')){ST={p:{},c:{}};save();renderStats()}});
function alertMsg(t){const d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#17365D;color:#fff;padding:10px 16px;border-radius:8px;z-index:99';document.body.appendChild(d);setTimeout(()=>d.remove(),2500)}

// ---------- init ----------
load();
fetch('data/data.json').then(r=>r.json()).then(j=>{
  D=j;$('#loading').remove();$('#stand').textContent=D.stand;
  D.cards.forEach(c=>{if(c[0]){cardsPerDex[c[0]]=(cardsPerDex[c[0]]||0)+1;(cardsByDex[c[0]]=cardsByDex[c[0]]||[]).push(c)}});
  // set filter (newest first)
  const used=new Set(D.cards.map(c=>c[2]));
  $('#k-set').innerHTML+=D.sets.map((s,i)=>used.has(i)?`<option value="${i}">${esc(s[1])} (${s[2].slice(0,4)})</option>`:'').reverse().join('');
  // rarity filter grouped by name
  const byName={};D.rarities.forEach((r,i)=>{const k=r[0]+' '+r[2];(byName[k]=byName[k]||[]).push(i)});
  $('#k-rar').innerHTML+=Object.entries(byName).map(([k,v])=>`<option value="${v.join(',')}">${esc(k)}</option>`).join('');
  const types=[...new Set(D.cards.filter(c=>c[9]).map(c=>c[9]))].sort();
  $('#k-type').innerHTML+=types.map(t=>`<option>${esc(t)}</option>`).join('');
  renderLegend();route();
  window.addEventListener('hashchange',route);
}).catch(()=>{$('#loading').textContent='Die Daten konnten nicht geladen werden. Bitte die Seite über einen Webserver (z. B. Vercel) öffnen, nicht als lokale Datei.'});
})();
