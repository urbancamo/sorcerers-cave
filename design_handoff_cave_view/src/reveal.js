// reveal.js — the chamber "discovery beat": hazard banners + stranger encounter + dice.
// Layered over the engine's on-floor card laying. Driven purely by engine events;
// no engine mutation here — it only narrates ev.chamber and reports the player's choice.
import { HAZARD_ORDER, HAZARD_INFO, CREATURE_STATS } from './encounter-data.js';

let ctx = null, active = false;
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r=>setTimeout(r,ms));

export const Reveal = {
  init(c){ ctx = c; document.addEventListener('keydown', onKey, true); },
  active(){ return active; },
  run,
};

function onKey(e){
  if (!active) return;
  const k = e.key.toLowerCase();
  const btn = [...document.querySelectorAll('#rv-actions .reveal-btn')]
    .find(b=>b.dataset.key===k);
  if (btn){ e.preventDefault(); e.stopPropagation(); btn.click(); }
  if (k==='escape') close();
}

async function run(area, chamber){
  const draws = chamber.draws || [];
  if (!draws.length){ return; }
  active = true;
  ctx.snapToTile && ctx.snapToTile(area);

  const hazards   = draws.filter(c=>c.category==='hazard');
  const strangers = draws.filter(c=>c.category==='creature');
  const treasure  = draws.filter(c=>c.category==='treasure');

  show();
  setHead(area.name, chamber.firstVisit
    ? 'Drew '+draws.length+' card'+(draws.length>1?'s':'')
    : 'You return — '+(strangers.length?'strangers still guard it':'as you left it'));
  await wait(420);

  // 1) hazards in fixed resolution order
  const sorted = hazards.slice().sort((a,b)=>HAZARD_ORDER.indexOf(a.name)-HAZARD_ORDER.indexOf(b.name));
  for (const h of sorted){ await resolveHazard(h); }
  if (sorted.some(h=>h.name==='Trap')){
    await banner('trap','▽','Trap!','The floor gives way — the party plunges a level.');
    await wait(900); return close(area);
  }

  // 2) strangers → encounter
  if (strangers.length){ await encounter(area, strangers, treasure); }
  else if (treasure.length){ await gather(treasure); }
  else { await note('·','The chamber is quiet','Nothing of note remains here.'); }

  close(area);
}

/* ---------------- hazards ---------------- */
async function resolveHazard(h){
  const info = HAZARD_INFO[h.name] || {glyph:'!',line:'',kind:'quake'};
  ctx.focusCard && ctx.focusCard(h);
  setBanner(info.kind, info.glyph, h.name+'!', info.line);
  await wait(560);
  if (info.roll){
    const tray = rollTray();
    for (const p of ctx.party){
      if (info.roll==='medusa'){
        const r = await rollDie(tray, p.name);
        mark(tray, r<=2 ? p.name+' → STONE' : p.name+' resists', r<=2);
      } else { // ghouls: 1d6+fs vs 1d6+2
        const a = await rollDie(tray, p.name+' +'+p.fs);
        const b = await rollDie(tray, 'Ghoul +2', true);
        mark(tray, (a+p.fs)>=(b+2) ? p.name+' holds' : p.name+' falls', (a+p.fs)<(b+2));
      }
      await wait(220);
    }
    await wait(500);
  } else { await wait(950); }
  clearBanner();
}

/* ---------------- stranger encounter ---------------- */
async function encounter(area, strangers, treasure){
  const leader = strangers.slice().sort((a,b)=>
    (CREATURE_STATS[b.name]?.leader||0)-(CREATURE_STATS[a.name]?.leader||0))[0];
  const ln = leader.name; ctx.focusCard && ctx.focusCard(leader);
  const charisma = ctx.party.some(p=>p.charisma);

  await new Promise(resolve=>{
    setBanner('encounter','⚔','Strangers — '+ln+' leads',
      (CREATURE_STATS[ln]?.note||'')+' What does the party do?');
    actions([
      ['Withdraw','w','ghost', async()=>{ await outcome('withdraw',strangers,treasure); resolve(); }],
      ['Test reaction','t','', async()=>{
        clearActions(); const tray=rollTray();
        const raw = await rollDie(tray,'reaction');
        const nat1 = raw===1;
        let v = nat1 ? 1 : raw + (charisma?1:0);
        const st = CREATURE_STATS[ln]||{hostile:3,indiff:4};
        const res = v<=st.hostile ? 'hostile' : v<=st.indiff ? 'indifferent' : 'friendly';
        mark(tray, 'roll '+raw+(charisma&&!nat1?' +1 charisma':'')+' → '+res.toUpperCase(), res==='hostile');
        await wait(750); await outcome(res,strangers,treasure); resolve();
      }],
      ['Attack','a','danger', async()=>{ clearActions(); await outcome('hostile',strangers,treasure,true); resolve(); }],
    ]);
  });
}

async function outcome(type, strangers, treasure, surprise){
  if (type==='withdraw'){ await banner('encounter','↩','Withdraw','The party falls back; the strangers keep their hoard.'); await wait(950); clearBanner(); return; }
  if (type==='indifferent'){ await banner('encounter','≈','Indifferent','They ignore you and guard the treasure. (3 tests → permanent.)'); await wait(1100); clearBanner(); return; }
  if (type==='friendly'){
    await banner('friendly','✦','Friendly!','The strangers join your party as allies.');
    ctx.markStrangers && ctx.markStrangers('join');
    await wait(1000); clearBanner();
    if (treasure.length) await gather(treasure);
    return;
  }
  // hostile / attack → one abstracted combat round (engine drives real rounds)
  const tray = rollTray();
  const pStr = ctx.party.reduce((s,p)=>s+p.fs+p.mp,0) + (surprise?1:0);
  const sStr = strangers.reduce((s,c)=>{const k=CREATURE_STATS[c.name]||{fs:3,mp:0};return s+k.fs+k.mp;},0);
  setBanner('combat','⚔','Combat — round 1','Party '+pStr+' vs '+strangers.map(s=>s.name).join(', ')+' '+sStr);
  const pr = await rollDie(tray,'party +'+pStr);
  const sr = await rollDie(tray,'foe +'+sStr,true);
  await wait(450);
  const pTot=pr+pStr, sTot=sr+sStr;
  if (pTot>=sTot){
    mark(tray, pTot+' vs '+sTot+' — strangers slain', false);
    ctx.markStrangers && ctx.markStrangers('slain');
    await wait(1100); clearBanner();
    if (treasure.length) await gather(treasure);
  } else {
    mark(tray, pTot+' vs '+sTot+' — the party retreats', true);
    await wait(1100); clearBanner();
  }
}

/* ---------------- treasure ---------------- */
async function gather(treasure){
  await new Promise(resolve=>{
    setBanner('treasure','◈','Treasure unguarded', treasure.map(t=>t.name).join(' · '));
    actions([
      ['Gather','g','gold', async()=>{ ctx.markTreasure && ctx.markTreasure('take'); await wait(600); clearBanner(); resolve(); }],
      ['Leave','l','ghost', async()=>{ clearBanner(); resolve(); }],
    ]);
  });
}
async function note(glyph,title,line){
  await new Promise(resolve=>{
    setBanner('encounter',glyph,title,line);
    actions([['Continue','enter','', async()=>{ clearBanner(); resolve(); }]]);
  });
}

/* ---------------- ribbon + dice helpers ---------------- */
function show(){ $('reveal').classList.add('show'); }
function setHead(name, sub){ $('rv-name').textContent=name; $('rv-sub').textContent=sub; }
function setBanner(kind,glyph,title,line){
  const b=$('rv-banner'); b.className='disco-banner show '+kind;
  b.innerHTML='<span class="db-glyph">'+glyph+'</span><span class="db-text"><b>'+title+'</b>'+(line?'<i>'+line+'</i>':'')+'</span><span class="db-roll"></span>';
}
async function banner(kind,glyph,title,line){ setBanner(kind,glyph,title,line); await wait(500); }
function clearBanner(){ const b=$('rv-banner'); b.className='disco-banner'; b.innerHTML=''; clearActions(); }
function rollTray(){ const r=$('rv-banner').querySelector('.db-roll'); if(r) r.innerHTML=''; return r; }
function actions(list){
  const a=$('rv-actions'); a.innerHTML='';
  list.forEach(([label,key,variant,onClick])=>{
    const b=document.createElement('button'); b.className='btn reveal-btn '+(variant||''); b.dataset.key=key;
    b.innerHTML='<kbd>'+(key==='enter'?'↵':key.toUpperCase())+'</kbd> '+label;
    b.addEventListener('click',()=>{ if(!b.disabled){ [...a.children].forEach(c=>c.disabled=true); onClick(); } });
    a.appendChild(b);
  });
}
function clearActions(){ $('rv-actions').innerHTML=''; }

async function rollDie(tray, label, foe){
  const die=document.createElement('span'); die.className='die'+(foe?' foe':'');
  const lab=label?'<span class="die-lbl">'+label+'</span>':'';
  tray && tray.appendChild(die);
  const t0=performance.now();
  while(performance.now()-t0<520){ die.innerHTML=(1+Math.floor(Math.random()*6))+lab; await wait(70); }
  const v=1+Math.floor(Math.random()*6); die.innerHTML=v+lab; die.classList.add('settled');
  return v;
}
function mark(tray,msg,bad){ if(!tray)return; const m=document.createElement('span'); m.className='roll-res'+(bad?' bad':''); m.textContent=msg; tray.appendChild(m); }

function close(area){ $('reveal').classList.remove('show'); clearBanner(); active=false; if(area && ctx.onResolved) ctx.onResolved(area); }
