import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reveal } from './reveal.js';

/* ============================================================
   Sorcerer's Cave — 3D viewer + interactive navigation
   Renders engine state; turns engine events into motion.
   ============================================================ */
const COLOR={void:0x070709,brass:0xc9a14e,brassBright:0xe6c578,crimson:0xa8443a,arcane:0x5f8f8a,stone:0xb8b1a2};
const CAT_COLOR={creature:'#a8443a',treasure:'#c9a14e',artifact:'#c9a14e',hazard:'#5f8f8a'};
const TILE_W=4.3, LEVEL_GAP=5.2; let TILE_D;
const DESTROYED_TINT=0x4a4036; // earthquake-collapsed tile: darkened rubble tone
const DIRV={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};

let engine, startLevel, tiles, PARTY=[], partyColorHex;
const lvlIndex=l=>l-startLevel;
function worldPos(a){ return new THREE.Vector3(a.col*TILE_W, -lvlIndex(a.level)*LEVEL_GAP, a.row*TILE_D); }
const akey=a=>a.level+','+a.col+','+a.row; // one tile per (level,col,row)

/* ---- renderer / scene / camera ---- */
let renderer, scene, camera, controls, maxAniso;

/* ---- alpha-cut textures ---- */
const texCache=new Map();
const smooth=(e0,e1,x)=>{const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
function loadAlphaTexture(src,maxW=1024){
  if(texCache.has(src))return texCache.get(src);
  const p=new Promise(res=>{
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{
      const sc=Math.min(1,maxW/img.width),w=Math.round(img.width*sc),h=Math.round(img.height*sc);
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      const cx=cv.getContext('2d');cx.drawImage(img,0,0,w,h);
      const im=cx.getImageData(0,0,w,h),d=im.data;
      for(let i=0;i<d.length;i+=4){const lum=0.3*d[i]+0.59*d[i+1]+0.11*d[i+2];d[i+3]=Math.round(255*smooth(12,48,lum));}
      cx.putImageData(im,0,0);
      const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=maxAniso;res(tex);
    };
    img.onerror=()=>res(null); img.src=src;
  });
  texCache.set(src,p); return p;
}
function makeGridTexture(){
  const s=128,cv=document.createElement('canvas');cv.width=cv.height=s;
  const cx=cv.getContext('2d');cx.strokeStyle='rgba(232,219,187,0.14)';cx.lineWidth=2;cx.strokeRect(1,1,s-2,s-2);
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// "Zzz" sleep marker for a creature put to sleep by Lotus Dust.
let _zzzTex=null;
function zzzTexture(){
  if(_zzzTex) return _zzzTex;
  const s=128,cv=document.createElement('canvas');cv.width=cv.height=s;
  const cx=cv.getContext('2d');
  cx.font='bold 40px Georgia, serif';cx.textAlign='center';cx.textBaseline='middle';
  cx.fillStyle='#e6c578';cx.shadowColor='rgba(0,0,0,0.8)';cx.shadowBlur=6;
  cx.fillText('Z',44,86);cx.font='bold 30px Georgia, serif';cx.fillText('z',74,62);cx.font='bold 22px Georgia, serif';cx.fillText('z',96,42);
  _zzzTex=new THREE.CanvasTexture(cv);_zzzTex.colorSpace=THREE.SRGBColorSpace;return _zzzTex;
}
// Secret-door card art (door-01.png = "A", door-02 = "B", …), cached and shared across rebuilds.
const _texLoader=new THREE.TextureLoader();
const doorTexCache=new Map();
function doorTexture(idx){
  const n=String(Math.min(idx,25)+1).padStart(2,'0');
  let t=doorTexCache.get(n);
  if(!t){ t=_texLoader.load('/assets/tokens/secret-doors-large/door-'+n+'.png'); t.colorSpace=THREE.SRGBColorSpace; doorTexCache.set(n,t); }
  return t;
}

/* ---- groups ---- */
const platformGroup=new THREE.Group(),tileGroup=new THREE.Group(),stairGroup=new THREE.Group(),
      fxGroup=new THREE.Group(),exitGroup=new THREE.Group(),contentGroup=new THREE.Group(),
      secretGroup=new THREE.Group(),otherGroup=new THREE.Group(); // otherGroup: other parties' tokens (multiplayer)
const tileMeshes=[]; const exitMarkers=[]; const spawnAnims=[]; const stairDashes=[];
const pendingTiles=new Set(); // coords whose mesh is mid-build (guards against duplicate laying)
const contentMeshes=[]; const cardAnims=[];
let partyToken=null, selectRing=null, tokenMove=null;

/* ---- build a single area's tile ---- */
async function buildAreaMesh(area, spawn){
  const k=akey(area); // never lay two meshes for the same coord (optimistic + reconcile can race)
  if(pendingTiles.has(k) || tileMeshes.some(m=>m.userData.area&&akey(m.userData.area)===k)) return;
  pendingTiles.add(k);
  const tex=await loadAlphaTexture(area.tileId? (tiles.get(area.tileId)?.file ?? ''):'');
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:0.03,side:THREE.DoubleSide,depthWrite:true});
  if(area.destroyed) mat.color.setHex(DESTROYED_TINT); // earthquake rubble — darkened so it reads as collapsed
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(TILE_W,TILE_D),mat);
  mesh.rotation.x=-Math.PI/2;
  if(area.rot) mesh.rotation.z=THREE.MathUtils.degToRad(-area.rot);
  const p=worldPos(area); mesh.position.copy(p); mesh.renderOrder=2;
  mesh.userData.area=area; mesh.userData.lvl=area.level; regMat(mat); area._mesh=mesh; tileGroup.add(mesh); tileMeshes.push(mesh);
  pendingTiles.delete(k);
  if(spawn){ mat.opacity=0; mesh.position.y=p.y+1.4; spawnAnims.push({mesh,p,t0:clock.elapsedTime}); }
  if(area.cardId){ addCardGlow(area); }
}
function addCardGlow(area){
  const c=engine; const card=area.cardId;
  const col=new THREE.Color(CAT_COLOR[(window.__cardCat&&window.__cardCat[card])||'treasure']||'#c9a14e');
  const ring=new THREE.Mesh(new THREE.RingGeometry(TILE_D*0.2,TILE_D*0.3,40),
    new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  ring.rotation.x=-Math.PI/2; ring.position.copy(worldPos(area)); ring.position.y+=0.03;
  ring.userData.cardGlow=true; fxGroup.add(ring);
}

/* ---- platforms (rebuilt as levels grow) ---- */
const levelBounds={};

/* ---- level isolation: fade levels stacked ABOVE the focused one so they
        never occlude an overhead / tile-level / reveal view ---- */
let isoFocus=null, isoHinted=false;      // focused level, or null = whole cave
const isoAlpha={};                        // level -> current (lerped) alpha
function regMat(m){ if(m && m.userData.b===undefined) m.userData.b=m.opacity; }
function setIsolation(focus){
  if(focus!=null && isoFocus==null && !isoHinted){ isoHinted=true;
    showToast('Levels above hidden — <b>Free orbit</b> shows the whole cave'); }
  isoFocus=focus;
}
function isoTargetFor(lvl){ return isoFocus==null ? 1 : (lvlIndex(lvl)<lvlIndex(isoFocus) ? 0 : 1); }
function applyFadeObj(o){
  const lvl=o.userData.lvl; if(lvl==null) return;
  const a=isoAlpha[lvl]!==undefined?isoAlpha[lvl]:1;
  const vis=a>0.02; o.visible=vis; if(!vis) return;
  o.traverse(c=>{ const m=c.material; if(m && m.userData.b!==undefined) m.opacity=m.userData.b*a; });
}
function updateIsolation(){
  Object.keys(levelBounds).forEach(k=>{ const lvl=+k, t=isoTargetFor(lvl);
    const cur=isoAlpha[lvl]!==undefined?isoAlpha[lvl]:1; isoAlpha[lvl]=cur+(t-cur)*0.14; });
  tileMeshes.forEach(applyFadeObj);
  platformGroup.children.forEach(applyFadeObj);
  stairGroup.children.forEach(applyFadeObj);
  secretGroup.children.forEach(applyFadeObj);
  contentGroup.children.forEach(applyFadeObj);
  otherGroup.children.forEach(applyFadeObj);
}

function rebuildPlatforms(){
  [...platformGroup.children].forEach(o=>{o.geometry?.dispose?.();platformGroup.remove(o);});
  const levels=[...new Set(engine.areas.map(a=>a.level))].sort((a,b)=>a-b);
  levels.forEach(lvl=>{
    const ts=engine.areas.filter(a=>a.level===lvl);
    let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
    ts.forEach(a=>{const p=worldPos(a);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
    // size the platform to exactly cover the tile footprint, with the grid aligned one cell per tile
    const cols=Math.max(1,Math.round((maxX-minX)/TILE_W)+1);
    const rows=Math.max(1,Math.round((maxZ-minZ)/TILE_D)+1);
    const w=cols*TILE_W,d=rows*TILE_D;
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,y=-lvlIndex(lvl)*LEVEL_GAP;
    const grid=makeGridTexture();grid.wrapS=grid.wrapT=THREE.RepeatWrapping;grid.repeat.set(cols,rows);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:grid,transparent:true,opacity:0.4,depthWrite:false}));
    plane.rotation.x=-Math.PI/2;plane.position.set(cx,y-0.08,cz);plane.userData.lvl=lvl;regMat(plane.material);platformGroup.add(plane);
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w,d)),
      new THREE.LineBasicMaterial({color:COLOR.brass,transparent:true,opacity:0.2}));
    edge.rotation.x=-Math.PI/2;edge.position.set(cx,y-0.07,cz);edge.userData.lvl=lvl;regMat(edge.material);platformGroup.add(edge);
    levelBounds[lvl]={cx,cz,w,d,y};
  });
}

/* ---- stairs (vertical connectors where a down-stair sits above an area) ---- */
function rebuildStairs(){
  [...stairGroup.children].forEach(o=>{o.geometry?.dispose?.();stairGroup.remove(o);});
  stairDashes.length=0;
  engine.areas.forEach(a=>{
    if(!a.down) return;
    const below=engine.placed.get((a.level+1)+','+a.col+','+a.row);
    if(!below) return;
    const A=worldPos(a),B=worldPos(below);
    const objs=[];
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([A,B]),
      new THREE.LineDashedMaterial({color:COLOR.brassBright,dashSize:0.3,gapSize:0.24,transparent:true,opacity:0.9}));
    line.computeLineDistances();stairDashes.push(line);objs.push(line);
    const mid=A.clone().lerp(B,0.5),len=A.distanceTo(B);
    const ribbon=new THREE.Mesh(new THREE.PlaneGeometry(1.4,len),
      new THREE.MeshBasicMaterial({color:COLOR.brass,transparent:true,opacity:0.1,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    ribbon.position.copy(mid);ribbon.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());objs.push(ribbon);
    for(let i=1;i<7;i++){const p=A.clone().lerp(B,i/7);
      const r=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.04,0.42),new THREE.MeshBasicMaterial({color:COLOR.stone,transparent:true,opacity:0.5}));r.position.copy(p);objs.push(r);}
    [A,B].forEach(pt=>{const m=new THREE.Mesh(new THREE.RingGeometry(0.42,0.56,28),
      new THREE.MeshBasicMaterial({color:COLOR.brass,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
      m.rotation.x=-Math.PI/2;m.position.copy(pt);m.position.y+=0.04;objs.push(m);});
    objs.forEach(o=>{o.userData.lvl=a.level;regMat(o.material);stairGroup.add(o);});
  });
}
// Persistent secret-door card markers, laid flat on each area the party reached by a secret stair.
const DOOR_AR=195/157; // door card art aspect (h/w)
function rebuildSecretDoors(){
  // Dispose geometry/material but keep the shared, cached door textures.
  [...secretGroup.children].forEach(o=>{o.geometry?.dispose?.();o.material?.dispose?.();secretGroup.remove(o);});
  engine.areas.forEach(a=>{
    if(a.secretDoor==null) return;
    const w=1.15/3, h=w*DOOR_AR;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:doorTexture(a.secretDoor),transparent:true,depthWrite:false,alphaTest:0.02}));
    m.rotation.x=-Math.PI/2; // flat to the floor
    // A free corner (the up/down stair markers sit at the other corners) so the animated up marker stays visible.
    const p=worldPos(a); m.position.set(p.x-TILE_W*0.30, p.y+0.03, p.z+TILE_D*0.30);
    m.renderOrder=3; m.userData.lvl=a.level; regMat(m.material); secretGroup.add(m);
  });
}

/* ---- party token + selection ring ---- */
function buildPartyToken(){
  const g=new THREE.Group();
  const base=new THREE.Color(partyColorHex||COLOR.brass);
  const bright=base.clone().lerp(new THREE.Color(0xffffff),0.42); // lighter accent for the pillar/gem
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.42,0.1,28),new THREE.MeshBasicMaterial({color:base}));disc.position.y=0.16;
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,0.74,14),new THREE.MeshBasicMaterial({color:bright}));pillar.position.y=0.58;
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(0.22),new THREE.MeshBasicMaterial({color:bright}));gem.position.y=1.12;
  const halo=new THREE.Mesh(new THREE.RingGeometry(0.5,0.8,40),new THREE.MeshBasicMaterial({color:base,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.rotation.x=-Math.PI/2;halo.position.y=0.05;
  g.add(disc,pillar,gem,halo);g.scale.setScalar(0.5); // party marker reduced by 50%
  g.userData={gem,halo};g.position.copy(worldPos(engine.current));fxGroup.add(g);partyToken=g;
}
function buildSelectRing(){
  selectRing=new THREE.Mesh(new THREE.RingGeometry(TILE_D*0.4,TILE_D*0.45,56),
    new THREE.MeshBasicMaterial({color:COLOR.brassBright,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  selectRing.rotation.x=-Math.PI/2;fxGroup.add(selectRing);
}

/* ---- exit markers (the navigation affordance) ---- */
function chevron(color){
  const c=new THREE.Mesh(new THREE.ConeGeometry(0.26,0.5,4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.95}));
  return c;
}
function ringFlat(color,r0,r1){
  return new THREE.Mesh(new THREE.RingGeometry(r0,r1,32),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
}
function refreshExitMarkers(){
  [...exitGroup.children].forEach(o=>{o.traverse?.(c=>c.geometry?.dispose?.());exitGroup.remove(o);});
  exitMarkers.length=0;
  const a=engine.current; const p=worldPos(a);
  engine.openMoves().forEach(m=>{
    const grp=new THREE.Group(); grp.userData.move=m.dir;
    const known=m.kind==='known';
    const col=(m.kind==='stair'||m.kind==='exit')?COLOR.brassBright:(known?COLOR.stone:COLOR.brass);
    if(m.dir==='N'||m.dir==='S'||m.dir==='E'||m.dir==='W'){
      const edge=0.15; // gap beyond the tile edge — markers hug the doorway tightly
      const off={N:[0,0,-(TILE_D/2+edge)],S:[0,0,TILE_D/2+edge],E:[TILE_W/2+edge,0,0],W:[-(TILE_W/2+edge),0,0]}[m.dir];
      const ring=ringFlat(col,0.34,0.46);ring.rotation.x=-Math.PI/2;ring.position.set(0,0.06,0);
      const ch=chevron(col);ch.position.set(0,0.32,0);
      // point chevron outward (flat, lying down toward dir)
      if(m.dir==='N')ch.rotation.x=-Math.PI/2;
      if(m.dir==='S')ch.rotation.x=Math.PI/2;
      if(m.dir==='E')ch.rotation.z=-Math.PI/2;
      if(m.dir==='W')ch.rotation.z=Math.PI/2;
      grp.add(ring,ch);
      grp.position.set(p.x+off[0],p.y,p.z+off[2]);
    } else {
      // stair marker near a corner of the tile
      const corner=m.dir==='D'?[TILE_W*0.30,TILE_D*0.30]:[-TILE_W*0.30,-TILE_D*0.30];
      const ring=ringFlat(col,0.3,0.44);ring.rotation.x=-Math.PI/2;ring.position.y=0.06;
      const ch=chevron(col);ch.position.y=0.42; if(m.dir==='D')ch.rotation.x=Math.PI; // point down
      grp.add(ring,ch);
      grp.position.set(p.x+corner[0],p.y+0.02,p.z+corner[1]);
    }
    grp.scale.setScalar(0.5); // direction markers reduced by 50% (bob/flash animate position only)
    grp.userData.base=grp.position.y; grp.userData.kind=m.kind;
    exitGroup.add(grp); exitMarkers.push(grp);
  });
}

/* ---- re-sync the scene to engine state changed outside of doMove
        (panel-driven encounter/fight/pickup resolution) ---- */
function disposeTileMesh(mesh){
  tileGroup.remove(mesh);
  mesh.geometry?.dispose?.();
  if(mesh.material){ mesh.material.map?.dispose?.(); mesh.material.dispose(); }
  let i=tileMeshes.indexOf(mesh); if(i>=0) tileMeshes.splice(i,1);
  i=spawnAnims.findIndex(s=>s.mesh===mesh); if(i>=0) spawnAnims.splice(i,1);
}
/* Reconcile tile meshes to the authoritative area set. Optimistic doMove laying can drift
   from the synced state: a racing move may leave an area with no mesh, or strand a mesh at a
   phantom coord (e.g. one computed while the party was briefly on another level — the
   "tile on the level below, offset" bug). Drop unbacked meshes; lay any area that lacks one. */
function reconcileTiles(){
  const want=new Map(); engine.areas.forEach(a=>want.set(akey(a),a));
  let changed=false;
  for(const m of [...tileMeshes]){ const ua=m.userData.area; if(!ua||!want.has(akey(ua))){ disposeTileMesh(m); changed=true; } }
  const have=new Set(tileMeshes.map(m=>m.userData.area?akey(m.userData.area):''));
  for(const [k,a] of want){ if(!have.has(k)){ buildAreaMesh(a,true); changed=true; } }
  // Re-tint tiles whose destroyed state flipped (an earthquake collapses an already-placed area).
  for(const m of tileMeshes){ const a=m.userData.area&&want.get(akey(m.userData.area)); if(a&&m.material&&m.material.color) m.material.color.setHex(a.destroyed?DESTROYED_TINT:0xffffff); }
  if(changed){ rebuildPlatforms(); rebuildStairs(); rebuildSecretDoors(); rebuildLevelButtons(); }
}
function refresh(){
  updateHUD(); selectCurrent(); refreshExitMarkers(); reconcileTiles();
  // Re-lay every chamber whose on-floor cards changed (e.g. a treasure was picked up);
  // layContents is a no-op when an area's contents are unchanged.
  engine.areas.forEach(a=>layContents(a,false));
  // Move the party token + camera to the current tile after a panel-driven move
  // (withdraw/retreat send the party back to the previous tile, outside doMove's animation).
  if(partyToken){
    const to=worldPos(engine.current);
    if(!tokenMove && partyToken.position.distanceTo(to)>0.01){
      tokenMove={from:partyToken.position.clone(), to, t0:clock.elapsedTime, dur:0.55};
      flyFollow(to);
      if(isoFocus!=null) setIsolation(engine.current.level);
    }
  }
}

/* ============================================================
   chamber contents — cards laid flat on the chamber floor,
   grouped spatially (creatures top-left, treasure bottom-left),
   persistent for the whole game (engine's AC[area]).
   ============================================================ */
const CARD_W=0.62, CARD_H=0.88;          // laid-flat card footprint
const plainTexCache=new Map();
function loadPlainTexture(src){
  if(plainTexCache.has(src)) return plainTexCache.get(src);
  const t=new THREE.TextureLoader().load(src);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=maxAniso;
  plainTexCache.set(src,t); return t;
}
function makeCardObject(card, yaw){
  const g=new THREE.Group();
  // dark mat / soft shadow behind the card so parchment pops on the stone
  const mat=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*1.16,CARD_H*1.12),
    new THREE.MeshBasicMaterial({color:0x05050a,transparent:true,opacity:0.55,depthWrite:false}));
  mat.rotation.x=-Math.PI/2; mat.position.y=-0.012; mat.renderOrder=4;
  // category edge glow
  const col=new THREE.Color(CAT_COLOR[card.category]||'#c9a14e');
  const edge=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*1.05,CARD_H*1.04),
    new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  edge.rotation.x=-Math.PI/2; edge.position.y=-0.006; edge.renderOrder=5;
  // the card face
  const face=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W,CARD_H),
    new THREE.MeshBasicMaterial({map:loadPlainTexture(card.file),transparent:true,depthWrite:false}));
  if(card.asleep) face.material.color.setHex(0x8a8aa6); // a sleeping creature: cool, dimmed
  face.rotation.x=-Math.PI/2; face.position.y=0.001; face.renderOrder=6;
  face.userData.card=card;
  regMat(mat.material);regMat(edge.material);regMat(face.material);
  g.add(mat,edge,face); g.rotation.y=yaw||0;
  if(card.asleep){ // "Zzz" marker so it reads as asleep, not a threat
    const zzz=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*0.55,CARD_W*0.55),
      new THREE.MeshBasicMaterial({map:zzzTexture(),transparent:true,depthWrite:false}));
    zzz.rotation.x=-Math.PI/2; zzz.position.set(CARD_W*0.24,0.02,-CARD_H*0.30); zzz.renderOrder=7;
    regMat(zzz.material); g.add(zzz);
  }
  g.userData.face=face;
  contentMeshes.push(face);
  return g;
}
// laid card-groups keyed by area coord (stable across re-projection), with a
// content signature so we only rebuild when the chamber's cards actually change.
const contentGroups=new Map();                          // "lvl,col,row" -> {group,sig,faces}
function contentSig(area){
  return area.strangers.map(c=>c.id).join(',')+'|'+area.treasure.map(c=>c.id).join(',');
}
function disposeContentGroup(entry){
  contentGroup.remove(entry.group);
  entry.group.traverse(o=>{ o.geometry?.dispose?.(); o.material?.dispose?.(); });
  for(const f of entry.faces){ const i=contentMeshes.indexOf(f); if(i>=0) contentMeshes.splice(i,1); }
}
function layContents(area, animated){
  const key=area.level+','+area.col+','+area.row;
  const sig=contentSig(area);
  const existing=contentGroups.get(key);
  if(existing){
    if(existing.sig===sig) return;                      // unchanged — keep the laid cards
    disposeContentGroup(existing); contentGroups.delete(key); // contents changed — rebuild
  }
  if(!area.strangers.length && !area.treasure.length) return; // nothing (or everything taken) — show no cards
  const lanes=[
    {list:area.strangers, ax:-TILE_W*0.14, az:-TILE_D*0.17},   // creatures: upper-left, inward
    {list:area.treasure,  ax:-TILE_W*0.14, az: TILE_D*0.19},   // treasure: lower-left, inward
  ];
  const grp=new THREE.Group(); grp.position.copy(worldPos(area));
  const faces=[];
  let dealIdx=0;
  lanes.forEach(lane=>{
    const n=lane.list.length;
    const center=(n-1)/2;
    const dx=0.27;                                      // overlap step (card is 0.62 wide → ~56% overlap)
    const fanStep=n>1 ? Math.min(0.17, 0.62/(n-1)) : 0; // splay, capped so a big hand doesn't over-rotate
    lane.list.forEach((card,i)=>{
      const off=i-center;
      const yaw=-off*fanStep;                           // fan like a held hand
      const x=lane.ax + off*dx;
      const z=lane.az + Math.abs(off)*0.045;            // gentle arc bow
      const o=makeCardObject(card,yaw);
      faces.push(o.userData.face);
      o.userData.face.userData.area=area;
      const ty=0.07 + dealIdx*0.016;                    // later cards stack on top
      o.position.set(x,ty,z);
      if(animated){ o.position.y=ty+1.5; o.userData.fade=[o.children[0].material,o.children[1].material,o.userData.face.material];
        o.userData.fade.forEach(m=>m.opacity=0);
        cardAnims.push({obj:o, ty, t0:clock.elapsedTime, delay:dealIdx*0.10}); }
      grp.add(o); dealIdx++;
    });
  });
  grp.userData.lvl=area.level; contentGroup.add(grp);
  contentGroups.set(key,{group:grp,sig,faces});
}
const goal={pos:new THREE.Vector3(),target:new THREE.Vector3(),fov:45,active:false};
function flyTo(pos,target,fov){goal.pos.copy(pos);goal.target.copy(target);goal.fov=fov??camera.fov;goal.active=true;controls.enabled=false;}
function flyFollow(newTarget){ // keep relative view, shift to new target
  const delta=newTarget.clone().sub(controls.target);
  flyTo(camera.position.clone().add(delta),newTarget,camera.fov);
}
function sceneCenter(){const c=new THREE.Vector3();engine.areas.forEach(a=>c.add(worldPos(a)));return c.multiplyScalar(1/engine.areas.length);}
function viewFreeOrbit(){setMode('orbit','Free orbit');setIsolation(null);const c=sceneCenter();flyTo(c.clone().add(new THREE.Vector3(TILE_W*2.4,13,16)),c,45);}
function viewSnapTile(){const a=engine.current;setMode('snap','Overhead · '+a.name);setIsolation(a.level);flyTo(worldPos(a).clone().add(new THREE.Vector3(0,9.5,2.6)),worldPos(a),30);}
function focusArea(a){ // a: {col,row,level} — fly the camera to that area (free-roam spectating)
  if(a==null) return;
  setMode('orbit','Spectating'); setIsolation(a.level);
  const wp=worldPos(a);
  flyTo(wp.clone().add(new THREE.Vector3(TILE_W*1.6,11,12)),wp,40);
}
let activeLevel=null;
function viewLevel(lvl){activeLevel=lvl;setMode('level','Level '+lvl);setIsolation(lvl);const b=levelBounds[lvl];const c=new THREE.Vector3(b.cx,b.y,b.cz);flyTo(c.clone().add(new THREE.Vector3(TILE_W*1.4,10,12)),c,40);}

/* ============================================================
   navigation
   ============================================================ */
let busy=false;
function doMove(dir){
  if(busy||Reveal.active()) return;
  // Leaving the Cave: a level-1 up-stair exits instead of climbing (spec §"Movement"). Confirm
  // first — it's one-way. On confirm the engine ends the game; React swaps in the score screen.
  if(dir==='U' && engine.canExit && engine.canExit()){
    busy=true;
    showChoice('Leave the Cave?','Your party climbs the stairway to the surface. <b>Once you leave, you cannot return.</b>','Leave the Cave','Stay')
      .then(ok=>{ if(ok) engine.exit(); else busy=false; });
    return;
  }
  const ev=engine.tryMove(dir);
  if(!ev.moved){
    if(ev.placed){ // a tile was drawn onto a dead-end frontier — lay it down even though we can't enter
      buildAreaMesh(ev.placed,true).then(()=>{rebuildPlatforms();rebuildStairs();rebuildSecretDoors();rebuildLevelButtons();});
      refreshExitMarkers(); // the attempted exit was pruned
    }
    setPrompt(ev.deadEnd?'That way is a dead end.':'No exit that way.','danger'); flashMarker(dir,true); return;
  }
  busy=true;
  if(ev.placed){ buildAreaMesh(ev.area,true).then(()=>{rebuildPlatforms();rebuildStairs();rebuildSecretDoors();rebuildLevelButtons();}); }
  // move token (a sprung trap drops the party a level, animated like a descent)
  const drop = ev.descended||ev.ascended||ev.fell;
  const from=partyToken.position.clone(), to=worldPos(ev.area);
  tokenMove={from,to,t0:clock.elapsedTime,dur: drop?0.9:0.55};
  // camera follow
  if(drop) setTimeout(()=>flyFollow(to),120); else flyFollow(to);
  // HUD
  setTimeout(()=>{
    updateHUD(); selectCurrent();
    // Descending (or falling) auto-hides the level above so it never occludes the new one;
    // otherwise just keep an existing isolated view focused on the current level.
    if(ev.descended||ev.fell) setIsolation(engine.current.level);
    else if(isoFocus!=null) setIsolation(engine.current.level);
    if(ev.chamber) onChamber(ev.area,ev.chamber); else {
      const n=ev.area.name;
      setPrompt(ev.descended?('You descend to <b>'+n+'</b> on level '+ev.area.level+'.')
        :ev.ascended?('You climb to <b>'+n+'</b>.')
        :('You enter <b>'+n+'</b>.'), 'event');
    }
    refreshExitMarkers();
    // Surface otherwise-silent outcomes (viper deaths, hazards, Deep Pool, effects) first,
    // then the trap modal if the move sprung one. Chain so the player acks each in turn.
    const notices = ev.notices || [];
    const showNotices = notices.length
      ? () => {
          const tone = notices.some(n=>n.tone==='bad')?'bad':notices.some(n=>n.tone==='good')?'good':'';
          return showConfirm('Aftermath', notices.map(n=>n.text).join('<br>'), tone);
        }
      : null;
    const showTrap = ev.trap
      ? () => {
          const c = ev.trap==='sprung'
            ? ['Trap sprung!','The floor gives way — the party plunges to <b>'+ev.area.name+'</b> on level '+ev.area.level+'. There is no way back up.','bad']
            : ['Trap avoided','Your dwarf spots a hidden trap and guides the party safely across.','good'];
          return showConfirm(c[0],c[1],c[2]);
        }
      : null;
    (showNotices ? showNotices() : Promise.resolve())
      .then(()=> showTrap ? showTrap() : null)
      .then(()=>{ busy=false; });
  }, drop?620:420);
}
function onChamber(area,chamber){
  layContents(area, chamber.firstVisit);           // lay the cards on the chamber floor (persists)
  const draws=chamber.draws;
  const strangers=draws.filter(c=>c.category==='creature');
  const haz=draws.filter(c=>c.category==='hazard');
  let msg='<b>'+area.name+'</b> — '+(chamber.firstVisit?('drew '+draws.length+' card'+(draws.length>1?'s':'')):'you return here')+'.';
  if(haz.length) msg+=' Hazard: '+haz.map(h=>h.name).join(', ')+'!';
  else if(strangers.length) msg+=' Strangers: '+strangers.map(s=>s.name).join(', ')+'.';
  else if(area.treasure.length) msg+=' Treasure lies here.';
  setPrompt(msg, haz.length?'danger':'event');
  const focus=haz[0]||strangers[0]||area.treasure[0]||draws[0];
  if(focus) showCard(focus,area.name);
  // Resolution is now driven by the React EncounterPanel (engine-authoritative);
  // reveal.js's self-contained abstract rolls are no longer invoked here.
}
function flashMarker(dir,bad){ const m=exitMarkers.find(x=>x.userData.move===dir); if(m) m.userData.flash={t0:clock.elapsedTime,bad}; }

/* ============================================================
   selection / inspect + card panel
   ============================================================ */
let cardPanel, cardImg, emptyBox;
function showCard(card,where){
  cardPanel.classList.remove('empty');cardImg.style.display='block';emptyBox.style.display='none';
  cardImg.src=card.file;
  document.getElementById('cardwhere').textContent=where;
  document.getElementById('cardname').textContent=card.name;
  const col=CAT_COLOR[card.category]||'#c9a14e';
  document.getElementById('cardkind').innerHTML=
    '<span class="kindtag" id="cardtag" style="color:'+col+';background:'+hexA(col,0.16)+'">'+
    '<span class="d" style="background:'+col+';box-shadow:0 0 7px '+col+'"></span>'+
    '<span id="cardtaglabel">'+card.category+'</span></span>';
  cardPanel.classList.add('show');
}
function hideCard(){ cardPanel.classList.remove('show'); } // nothing on the floor → no card at all
function areaPanel(area, useLevel){
  selectRing.position.copy(worldPos(area));selectRing.position.y+=0.02;selectRing.visible=true;
  document.getElementById('sel-nm').textContent=area.name;
  const stair=area.up&&area.down?' · stairs up & down':area.down?' · stair down':area.up?' · stair up':'';
  const counts=[]; if(area.strangers.length)counts.push(area.strangers.length+' stranger'+(area.strangers.length>1?'s':''));
  if(area.treasure.length)counts.push(area.treasure.length+' treasure');
  const base=useLevel?('Level '+area.level):(area.type[0].toUpperCase()+area.type.slice(1));
  document.getElementById('sel-sub').textContent= base+' · '+(counts.length?counts.join(' · '):('exits '+(area.exits||'—')))+stair;
  const focus=area.strangers[0]||area.treasure[0];
  if(focus) showCard(focus,area.name); else hideCard();
}
function selectCurrent(){ areaPanel(engine.current,false); }
function inspectArea(a){ areaPanel(a,true); }
function hexA(hex,a){const n=parseInt(hex.replace('#',''),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}

/* ============================================================
   HUD
   ============================================================ */
function setMode(mode,label){document.getElementById('modelabel').textContent=label;
  document.getElementById('orbitBtn').classList.toggle('active',mode==='orbit');
  document.querySelector('.compass')?.classList.toggle('hidden',mode!=='orbit'); // compass: free-orbit only
  [...document.querySelectorAll('.lvlbtn')].forEach(b=>b.classList.toggle('active',mode==='level'&&+b.dataset.lvl===activeLevel));}
let promptT;
function setPrompt(html,cls){const el=document.getElementById('prompt');el.className='prompt'+(cls?' '+cls:'');
  document.getElementById('promptText').innerHTML=html;el.style.opacity='1';
  clearTimeout(promptT);promptT=setTimeout(()=>{el.style.opacity='0.86';},2600);}
let toastT;function showToast(html){const el=document.getElementById('toast');el.innerHTML=html;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),1600);}
/** A blocking acknowledgement modal (e.g. a sprung trap). Resolves when the player dismisses it. */
function showConfirm(title,body,tone){
  return new Promise(res=>{
    const ov=document.createElement('div'); ov.className='scv-dice-overlay';
    const card=document.createElement('div'); card.className='scv-dice-card';
    card.innerHTML='<div class="scv-dice-title">'+title+'</div><p class="scv-dice-msg '+(tone||'')+'">'+body+'</p>';
    const btn=document.createElement('button'); btn.className='scv-primary'; btn.textContent='Continue';
    btn.addEventListener('click',()=>{ ov.remove(); res(); });
    card.appendChild(btn); ov.appendChild(card); document.body.appendChild(ov); btn.focus();
  });
}
// A two-button confirm — resolves true on the primary action, false on cancel.
function showChoice(title,body,okLabel,cancelLabel,tone){
  return new Promise(res=>{
    const ov=document.createElement('div'); ov.className='scv-dice-overlay';
    const card=document.createElement('div'); card.className='scv-dice-card';
    card.innerHTML='<div class="scv-dice-title">'+title+'</div><p class="scv-dice-msg '+(tone||'')+'">'+body+'</p>';
    const row=document.createElement('div'); row.className='scv-dice-actions';
    const cancel=document.createElement('button'); cancel.className='scv-ghost'; cancel.textContent=cancelLabel||'Cancel';
    const ok=document.createElement('button'); ok.className='scv-primary'; ok.textContent=okLabel||'OK';
    cancel.addEventListener('click',()=>{ ov.remove(); res(false); });
    ok.addEventListener('click',()=>{ ov.remove(); res(true); });
    row.appendChild(cancel); row.appendChild(ok); card.appendChild(row);
    ov.appendChild(card); document.body.appendChild(ov); ok.focus();
  });
}
let deckWarned=false; // one-shot toast when the area deck first runs low
function updateHUD(){const s=engine.state();
  document.getElementById('st-depth').textContent='Level '+s.level;
  document.getElementById('st-turn').textContent=s.turn;
  document.getElementById('st-party').textContent=PARTY.length;
  const tilesEl=document.getElementById('st-tiles');
  tilesEl.textContent=s.deckLeft+' / '+s.deckTotal;
  const low=s.deckLeft<10; // running out of area cards to explore
  tilesEl.classList.toggle('danger',low);
  if(low){ if(!deckWarned){ showToast('Only <b>'+s.deckLeft+'</b> tile cards left!'); deckWarned=true; } }
  else deckWarned=false;}
function escAttr(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderRoster(){const b=document.getElementById('rosterBody');b.innerHTML='';
  PARTY.forEach(m=>{const row=document.createElement('div');row.className='mbr'+(m.lead?' lead':'')+(m.petrified?' petrified':'');
    const carry=m.carry||0, load=m.load||0, free=Math.max(0,carry-load);
    const pct=carry>0?Math.min(100,Math.round((load/carry)*100)):0;
    const cap=carry>0
      ? '<div class="cap"><div class="cap-bar"><i style="width:'+pct+'%"></i></div><span class="cap-tx">'+load+'/'+carry+' kg · '+free+' free</span></div>'
      : '<div class="cap"><span class="cap-tx none">no carry capacity</span></div>';
    const items=Array.isArray(m.items)?m.items:[];
    const carryRow=items.length
      ? '<div class="carry">'+items.map(it=>{
          const t=escAttr(it.name+(it.artifact?' · artifact':' · '+it.weight+'kg'));
          return it.file
            ? '<img class="tre'+(it.artifact?' art':'')+'" src="'+escAttr(it.file)+'" alt="'+escAttr(it.name)+'" title="'+t+'">'
            : '<span class="tre ph'+(it.artifact?' art':'')+'" title="'+t+'">'+escAttr((it.name[0]||'?'))+'</span>';
        }).join('')+'</div>'
      : '<div class="carry"><span class="empty">empty-handed</span></div>';
    const badge=m.petrified?'<span class="badge stone" title="Turned to stone — cure with a Magic Staff">stone</span>'
      :m.ally?'<span class="badge ally" title="Befriended ally">ally</span>':'';
    row.innerHTML='<div class="sig">'+escAttr(m.sig)+'</div><div class="who"><div class="nm-line"><span class="nm">'+escAttr(m.name)+'</span>'+badge+'</div>'+cap+carryRow+'</div>';
    b.appendChild(row);});}
let rosterAnimTimer=null;
/** Indices in `oldP` whose members are gone from `newP` (matched greedily by name). */
function partyRemovedIdx(oldP,newP){
  const left={}; for(const m of newP) left[m.name]=(left[m.name]||0)+1;
  const out=[];
  for(let i=0;i<oldP.length;i++){ const n=oldP[i].name; if(left[n]>0) left[n]--; else out.push(i); }
  return out;
}
/** Replace the party and refresh the roster + HUD. Members who left (e.g. mutineers
 *  deserting back into the chamber) first animate out of the roster. */
function setParty(p){
  p=p||[];
  if(rosterAnimTimer){ clearTimeout(rosterAnimTimer); rosterAnimTimer=null; }
  const removed=partyRemovedIdx(PARTY,p);
  const rows=[...document.querySelectorAll('#rosterBody .mbr')];
  const leaving=removed.map(i=>rows[i]).filter(Boolean);
  if(leaving.length){
    leaving.forEach(r=>r.classList.add('mbr-leaving'));
    rosterAnimTimer=setTimeout(()=>{ rosterAnimTimer=null; PARTY=p; renderRoster(); updateHUD(); }, 520);
  } else {
    PARTY=p; renderRoster(); updateHUD();
  }
}
/* ---- other parties' tokens (multiplayer): small coloured pins at each party's tile ---- */
function setOtherParties(list){
  [...otherGroup.children].forEach(o=>{o.traverse?.(c=>{c.geometry?.dispose?.();c.material?.dispose?.();});otherGroup.remove(o);});
  (list||[]).forEach(p=>{
    const base=new THREE.Color(p.color||COLOR.brass);
    const g=new THREE.Group();
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.32,0.08,22),new THREE.MeshBasicMaterial({color:base}));disc.position.y=0.1;
    const pin=new THREE.Mesh(new THREE.ConeGeometry(0.17,0.52,14),new THREE.MeshBasicMaterial({color:base.clone().lerp(new THREE.Color(0xffffff),0.3)}));pin.position.y=0.5;
    g.add(disc,pin); g.scale.setScalar(0.5);
    const wp=worldPos({col:p.col,row:p.row,level:p.level});
    // offset to a tile corner so it never sits under the viewing party's centre token
    g.position.set(wp.x+TILE_W*0.26, wp.y, wp.z-TILE_D*0.26);
    g.userData.lvl=p.level;
    otherGroup.add(g);
  });
  otherGroup.children.forEach(applyFadeObj);
}
function rebuildLevelButtons(){const grp=document.getElementById('levelGrp');const levels=[...new Set(engine.areas.map(a=>a.level))].sort((a,b)=>a-b);
  grp.innerHTML='';levels.forEach(lvl=>{const btn=document.createElement('button');btn.className='btn lvlbtn';btn.dataset.lvl=lvl;btn.textContent=lvl;btn.title='Focus level '+lvl;
    btn.addEventListener('click',()=>viewLevel(lvl));grp.appendChild(btn);});}

/* ============================================================
   input
   ============================================================ */
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let downXY=null;

/* ============================================================
   loop
   ============================================================ */
const clock=new THREE.Clock();
let rafId;
function animate(){
  rafId=requestAnimationFrame(animate);const tt=clock.getElapsedTime();
  if(goal.active){camera.position.lerp(goal.pos,0.085);controls.target.lerp(goal.target,0.085);
    camera.fov+=(goal.fov-camera.fov)*0.085;camera.updateProjectionMatrix();
    if(camera.position.distanceTo(goal.pos)<0.1&&controls.target.distanceTo(goal.target)<0.1){goal.active=false;controls.enabled=true;}}
  updateIsolation();
  // spawn anims
  for(let i=spawnAnims.length-1;i>=0;i--){const s=spawnAnims[i],k=Math.min(1,(tt-s.t0)/0.5);
    s.mesh.material.opacity=k;s.mesh.position.y=s.p.y+(1-k)*1.4;if(k>=1)spawnAnims.splice(i,1);}
  // card deal anims
  for(let i=cardAnims.length-1;i>=0;i--){const a=cardAnims[i];const k=Math.min(1,Math.max(0,(tt-a.t0-a.delay)/0.45));
    if(k<=0)continue; const e=1-Math.pow(1-k,3);
    a.obj.position.y=a.ty+(1-k)*1.5;
    a.obj.userData.fade.forEach((m,idx)=>m.opacity=(idx===0?0.55:idx===1?0.5:1)*e);
    if(k>=1)cardAnims.splice(i,1);}
  // token move
  if(tokenMove){const k=Math.min(1,(tt-tokenMove.t0)/tokenMove.dur);const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    partyToken.position.lerpVectors(tokenMove.from,tokenMove.to,e);if(k>=1)tokenMove=null;}
  stairDashes.forEach(l=>l.material.dashOffset=-tt*1.2);
  fxGroup.children.forEach(o=>{if(o.userData.cardGlow)o.material.opacity=0.26+Math.sin(tt*2)*0.16;});
  if(partyToken){partyToken.userData.gem.rotation.y=tt*1.1;partyToken.userData.gem.position.y=1.12+Math.sin(tt*2)*0.05;
    const sc=1+Math.sin(tt*2.4)*0.06;partyToken.userData.halo.scale.set(sc,sc,sc);partyToken.userData.halo.material.opacity=0.4+Math.sin(tt*2.4)*0.18;}
  if(selectRing&&selectRing.visible)selectRing.material.opacity=0.55+Math.sin(tt*3)*0.25;
  // exit markers pulse + hover bob
  exitMarkers.forEach(g=>{const f=g.userData.flash;let amp=0.07;
    if(f){const kk=(tt-f.t0);if(kk>0.6){g.userData.flash=null;}amp=0.18;}
    g.position.y=g.userData.base+Math.sin(tt*3+g.position.x)*amp;
    g.children.forEach(c=>{if(c.material)c.material.opacity=0.7+Math.sin(tt*3)*0.25;});});
  const az=controls.getAzimuthalAngle();needle.style.transform='translate(-50%,-100%) rotate('+(-az)+'rad)';
  controls.update();renderer.render(scene,camera);
}

/* ============================================================
   boot
   ============================================================ */
let needle;
function onPointerDown(e){ downXY=[e.clientX,e.clientY]; }
function onPointerUp(e){
  if(!downXY)return;const moved=Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1]);downXY=null;if(moved>6)return;
  if(Reveal.active())return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;ray.setFromCamera(mouse,camera);
  const hitE=ray.intersectObjects(exitGroup.children,true)[0];
  if(hitE){let g=hitE.object;while(g&&!g.userData.move)g=g.parent;if(g){doMove(g.userData.move);return;}}
  const hitC=ray.intersectObjects(contentMeshes,false)[0];
  if(hitC){const f=hitC.object;showCard(f.userData.card, f.userData.area?f.userData.area.name:engine.current.name);return;}
  const hitT=ray.intersectObjects(tileMeshes,false)[0];
  if(hitT){const a=hitT.object.userData.area; if(a===engine.current){viewSnapTile();selectCurrent();} else inspectArea(a);}
}
function onKeyDown(e){
  // Don't treat typing in a text field (e.g. the chat box) as movement commands.
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  const k=e.key.toLowerCase();
  const map={arrowup:'N',arrowright:'E',arrowdown:'S',arrowleft:'W',n:'N',e:'E',s:'S',w:'W',u:'U',d:'D'};
  if(map[k]){e.preventDefault();doMove(map[k]);}
}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}

export async function boot({ mount, engine: eng, tiles: tileMap, party: partyArr, tileAR, partyColor, onQuit }){
  engine=eng; startLevel=eng.startLevel; tiles=tileMap; PARTY=partyArr; TILE_D=TILE_W/tileAR; partyColorHex=partyColor;

  /* ---- renderer / scene / camera ---- */
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(COLOR.void,0.015);
  camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,500);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.08;
  controls.zoomSpeed=1.7; controls.zoomToCursor=true; // snappier wheel zoom, toward the pointer
  controls.minDistance=4; controls.maxDistance=95; controls.maxPolarAngle=Math.PI*0.97;
  maxAniso=renderer.capabilities.getMaxAnisotropy();
  scene.add(platformGroup,tileGroup,stairGroup,fxGroup,exitGroup,contentGroup,secretGroup,otherGroup);

  // reset accumulated scene state so a new game (boot re-runs after dispose) starts from a clean map
  [platformGroup,tileGroup,stairGroup,fxGroup,exitGroup,contentGroup,secretGroup,otherGroup].forEach(g=>{
    for(let i=g.children.length-1;i>=0;i--){const o=g.children[i];o.traverse?.(x=>{x.geometry?.dispose?.();x.material?.dispose?.();});g.remove(o);}
  });
  tileMeshes.length=0;exitMarkers.length=0;spawnAnims.length=0;stairDashes.length=0;contentMeshes.length=0;cardAnims.length=0;pendingTiles.clear();
  contentGroups.clear();
  for(const k of Object.keys(levelBounds)) delete levelBounds[k];
  for(const k of Object.keys(isoAlpha)) delete isoAlpha[k];
  isoFocus=null;isoHinted=false;partyToken=null;selectRing=null;tokenMove=null;goal.active=false;

  /* card-panel refs (the HUD exists by now) */
  cardPanel=document.getElementById('cardpanel');cardImg=document.getElementById('cardimg');emptyBox=cardPanel.querySelector('.emptybox');
  window.__cardCat={};

  /* input + dock listeners */
  renderer.domElement.addEventListener('pointerdown',onPointerDown);
  renderer.domElement.addEventListener('pointerup',onPointerUp);
  addEventListener('keydown',onKeyDown);
  document.getElementById('snapBtn').addEventListener('click',viewSnapTile);
  document.getElementById('orbitBtn').addEventListener('click',viewFreeOrbit);
  document.getElementById('resetBtn').addEventListener('click',()=>{
    // Multiplayer injects its own quit flow (leave-to-menu vs abandon, in a popup); solo uses the
    // built-in confirm that ends the game (GS_QUIT) → the score screen.
    if(onQuit){ onQuit(); return; }
    showChoice('Quit the expedition?','Your party leaves the Cave and your final score is tallied.','Quit','Keep playing')
      .then(ok=>{ if(ok) engine.quit(); });
  });
  needle=document.querySelector('#rose .needle');
  addEventListener('resize',onResize);

  buildSelectRing();buildPartyToken();

  const revealParty=PARTY.map(p=>({name:p.name,fs:p.fs,mp:p.mp,charisma:!!p.charisma}));
  Reveal.init({
    party:revealParty,
    focusCard:(card)=>showCard(card, engine.current.name),
    snapToTile:(area)=>{ setIsolation(area.level);
      flyTo(worldPos(area).clone().add(new THREE.Vector3(0.2,9.0,2.4)), worldPos(area), 30);
      setMode('snap','Overhead · '+area.name); },
    markStrangers:()=>{},
    markTreasure:()=>{},
    onResolved:(a)=>{ setPrompt('You finish exploring <b>'+a.name+'</b>. Choose a doorway to continue.','event'); refreshExitMarkers(); },
  });
  for(const a of engine.areas) await buildAreaMesh(a,false);
  engine.areas.forEach(a=>{ if(a.strangers.length||a.treasure.length) layContents(a,false); });
  rebuildPlatforms();rebuildStairs();rebuildSecretDoors();rebuildLevelButtons();refreshExitMarkers();
  renderRoster();updateHUD();selectCurrent();
  // default to an overhead 'snap to tile' view of the start tile, North up the screen
  setMode('snap','Overhead · '+engine.current.name);
  const ap=worldPos(engine.current);
  camera.up.set(0,1,0); camera.fov=30; camera.updateProjectionMatrix();
  camera.position.copy(ap.clone().add(new THREE.Vector3(0,9.5,2.6)));
  controls.target.copy(ap); controls.update();
  setPrompt('Your party stands in <b>'+engine.current.name+'</b>. Click a glowing doorway, or press N/E/S/W.','event');
  window.__cave={scene,camera,controls,renderer,THREE,engine,tileMeshes,exitMarkers,doMove,worldPos,layContents,contentGroup,setParty,setOtherParties,focusArea};
  document.getElementById('loader').classList.add('hide');animate();

  function dispose(){
    cancelAnimationFrame(rafId);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('resize', onResize);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.dispose();
    renderer.domElement.remove();
  }
  return { dispose, refresh, setParty, setOtherParties, focusArea };
}
