import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reveal } from './reveal.js';
import { spriteRotationForScreenVector } from './billboard.js';
import { fitDistance } from './camera-fit.js';
import { carryRowHtml, escAttr } from './rosterCarry';

/* ============================================================
   Sorcerer's Cave — 3D viewer + interactive navigation
   Renders engine state; turns engine events into motion.
   ============================================================ */
const COLOR={void:0x070709,brass:0xc9a14e,brassBright:0xe6c578,crimson:0xa8443a,arcane:0x5f8f8a,stone:0xb8b1a2};
const CAT_COLOR={creature:'#a8443a',treasure:'#c9a14e',artifact:'#c9a14e',hazard:'#5f8f8a'};
const TILE_W=4.3, LEVEL_GAP=5.2; let TILE_D;
const DESTROYED_TINT=0x4a4036; // earthquake-collapsed tile: darkened rubble tone
const DIRV={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};

let engine, startLevel, tiles, deadEndArt=()=>null, PARTY=[], partyColorHex, isMultiplayer=false;
const lvlIndex=l=>l-startLevel;
function worldPos(a){ return new THREE.Vector3(a.col*TILE_W, -lvlIndex(a.level)*LEVEL_GAP, a.row*TILE_D); }
// Precise Locations (engine SC-10.5): offset toward the doorway a sub-location names, reusing the
// same edge geometry refreshExitMarkers already computes for exit chevrons (just short of the
// tile edge, not hugging it). "island"/"centre"/no-direction all resolve to worldPos unchanged —
// an island has no bespoke geometry yet (a later art pass, MSW 2026-07-30).
const DOORWAY_TOKEN_FRAC=0.62;
function subOffsetPos(a,dir){
  const p=worldPos(a);
  if(!dir||dir==='island') return p;
  const off={N:[0,0,-(TILE_D/2)*DOORWAY_TOKEN_FRAC],S:[0,0,(TILE_D/2)*DOORWAY_TOKEN_FRAC],E:[(TILE_W/2)*DOORWAY_TOKEN_FRAC,0,0],W:[-(TILE_W/2)*DOORWAY_TOKEN_FRAC,0,0]}[dir];
  return new THREE.Vector3(p.x+off[0], p.y, p.z+off[2]);
}
// The party's OWN token position, from the current area's `subLocation` (engine SC-10.5).
function partyTokenPos(a){
  return subOffsetPos(a, a.subLocation&&a.subLocation.at==='doorway'?a.subLocation.dir:null);
}
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
/* The fog dead-end cards, loaded before they are shown: unlike a tile, nothing is cut away — the dark vignette is part of the card. */
const fogCache=new Map();
function loadFogTexture(src,maxW=1024){
  if(fogCache.has(src))return fogCache.get(src);
  const p=new Promise(res=>{
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{
      const sc=Math.min(1,maxW/img.width),w=Math.round(img.width*sc),h=Math.round(img.height*sc);
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=maxAniso;res(tex);
    };
    img.onerror=()=>res(null); img.src=src;
  });
  fogCache.set(src,p); return p;
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
// Extension kit (SC-EXT-10, design US-06): a small "STONE" marker for a Gallery statue — a stone
// stranger laid on the chamber floor, distinct from `zzzTexture`'s Lotus-Dust sleep glyph (different
// cause, different overlay). Mirrors `zzzTexture`'s own cached-canvas-texture pattern.
let _stoneTex=null;
function stoneTexture(){
  if(_stoneTex) return _stoneTex;
  const s=128,cv=document.createElement('canvas');cv.width=cv.height=s;
  const cx=cv.getContext('2d');
  cx.font='bold 22px Georgia, serif';cx.textAlign='center';cx.textBaseline='middle';
  cx.fillStyle='#b8b1a2';cx.shadowColor='rgba(0,0,0,0.8)';cx.shadowBlur=6;
  cx.fillText('STONE',64,64);
  _stoneTex=new THREE.CanvasTexture(cv);_stoneTex.colorSpace=THREE.SRGBColorSpace;return _stoneTex;
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
      secretGroup=new THREE.Group(),otherGroup=new THREE.Group(), // otherGroup: other parties' tokens (multiplayer)
      petrifiedGroup=new THREE.Group(); // members turned to stone, laid greyed-out on the party's tile
const tileMeshes=[]; const exitMarkers=[]; const spawnAnims=[]; const despawnAnims=[]; const stairDashes=[];
const pendingTiles=new Set(); // coords whose mesh is mid-build (guards against duplicate laying)
let lastStairSig=''; // last-rendered stair/secret-door topology (see reconcileTiles) — '' forces a rebuild
// A tile whose IDENTITY changed in place at an already-meshed coord (the Spell hazard remaps the
// tunnel the party just left, SC-EXT-28 — same coord, different card) — akey() alone can't see
// this, since add/remove diffing only tracks coords. Queued rather than swapped on sight: the
// swap animation (see reconcileTiles/animate) plays once the "Aftermath" notice explaining it is
// dismissed (canAct back true), so the player reads why before watching the tunnel change.
const pendingRemaps=new Map(); // akey -> replacement Area
const contentMeshes=[]; const cardAnims=[];
let partyToken=null, selectRing=null, tokenMove=null;

/* ---- build a single area's tile ---- */
/** The back of an area card: what a dead-end (or Spell-unresolved) tile shows once it is face down. Drawn, not an asset. */
let cardBackTex=null;
function cardBackTexture(){
  if(cardBackTex) return cardBackTex;
  const w=640,h=Math.round(w*TILE_D/TILE_W),cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const c=cv.getContext('2d'),r=h*0.07,m=h*0.03;
  const rr=(x,y,ww,hh,rad)=>{c.beginPath();c.moveTo(x+rad,y);c.arcTo(x+ww,y,x+ww,y+hh,rad);c.arcTo(x+ww,y+hh,x,y+hh,rad);c.arcTo(x,y+hh,x,y,rad);c.arcTo(x,y,x+ww,y,rad);c.closePath();};
  rr(m,m,w-2*m,h-2*m,r);c.fillStyle='#1d1812';c.fill();
  c.lineWidth=h*0.02;c.strokeStyle='#8a6d3b';c.stroke();
  rr(m*3.2,m*3.2,w-6.4*m,h-6.4*m,r*0.6);c.lineWidth=h*0.008;c.strokeStyle='rgba(201,161,78,.55)';c.stroke();
  c.fillStyle='rgba(201,161,78,.6)';c.font=Math.round(h*0.42)+'px serif';c.textAlign='center';c.textBaseline='middle';c.fillText('\u2726',w/2,h/2+h*0.02);
  cardBackTex=new THREE.CanvasTexture(cv);cardBackTex.colorSpace=THREE.SRGBColorSpace;cardBackTex.anisotropy=maxAniso;
  return cardBackTex;
}
/** What a face-down area shows: the fog dead-end card with a stub on each side the party tried it from (the drawn card back if the manifest has none). */
async function faceDownTexture(area){
  const file=deadEndArt(area.fogStubs||'');
  return (file && await loadFogTexture(file)) || cardBackTexture();
}
/** Lay an area's mesh. A face-down area is drawn as its fog card; `revealFirst` (a dead end just tried) shows its real face for a
 *  few seconds so the player can read it, then fades it to the fog card — as at the table, they must remember it from then on. */
async function buildAreaMesh(area, spawn, revealFirst){
  const k=akey(area); // never lay two meshes for the same coord (optimistic + reconcile can race)
  if(pendingTiles.has(k) || tileMeshes.some(m=>m.userData.area&&akey(m.userData.area)===k)) return;
  pendingTiles.add(k);
  const down=!!area.faceDown && !revealFirst;
  const tex=down? await faceDownTexture(area) : await loadAlphaTexture(area.tileId? (tiles.get(area.tileId)?.file ?? ''):'');
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:0.03,side:THREE.DoubleSide,depthWrite:true});
  if(area.destroyed) mat.color.setHex(DESTROYED_TINT); // earthquake rubble — darkened so it reads as collapsed
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(TILE_W,TILE_D),mat);
  mesh.rotation.x=-Math.PI/2;
  if(area.rot) mesh.rotation.z=THREE.MathUtils.degToRad(-area.rot);
  const p=worldPos(area); mesh.position.copy(p); mesh.renderOrder=2;
  mesh.userData.area=area; mesh.userData.lvl=area.level; mesh.userData.down=down; mesh.userData.fogStubs=down?(area.fogStubs||''):null; mesh.userData.basePos=p.clone();
  regMat(mat); area._mesh=mesh; tileGroup.add(mesh); tileMeshes.push(mesh);
  pendingTiles.delete(k);
  if(spawn){ mat.opacity=0; mesh.position.y=p.y+1.4; spawnAnims.push({mesh,p,t0:clock.elapsedTime}); }
  if(area.cardId){ addCardGlow(area); }
  if(revealFirst && area.faceDown) setTimeout(()=>{ if(tileMeshes.includes(mesh)) fadeToFog(mesh, engine.areas.find(x=>akey(x)===k)||area); }, 3600); // (by then another doorway into it may have been tried)
}
/* Flip a tile over: it rises, turns edge-on (the texture swaps at the half-way point), and settles. */
const flipAnims=[];
/* Fades between a tile's faces: the new face is laid over the tile and fades in, then takes the tile's place. A dead end, once read,
   fades to its fog card; run again for a tile already face down when another doorway into it is tried (a new stub), the fresh card
   fades in over the old one; and a face-down tile the party enters fades to the real tile. */
const fogFades=[];
const settleFogFade=f=>{ f.mesh.material.map=f.tex; f.mesh.material.needsUpdate=true; f.mesh.remove(f.over); f.over.material.dispose(); };
function startFade(mesh, tex, dur=0.9){
  const busy=fogFades.findIndex(f=>f.mesh===mesh); if(busy>=0){ settleFogFade(fogFades[busy]); fogFades.splice(busy,1); } // an earlier fade is cut short
  const over=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  over.position.z=0.02; over.renderOrder=3; mesh.add(over); // z is the tile's own up: a hair above its face
  fogFades.push({mesh,over,tex,dur,t0:clock.elapsedTime});
}
async function fadeToFog(mesh, area, dur){
  const stubs=area.fogStubs||'';
  if(mesh.userData.down && mesh.userData.fogStubs===stubs) return;
  mesh.userData.down=true; mesh.userData.fogStubs=stubs;
  const tex=await faceDownTexture(area);
  if(tileMeshes.includes(mesh)) startFade(mesh,tex,dur);
}
async function fadeToFace(mesh, area, dur){
  if(!mesh.userData.down) return;
  mesh.userData.down=false; mesh.userData.fogStubs=null;
  const tex=await loadAlphaTexture(area.tileId? (tiles.get(area.tileId)?.file ?? ''):'');
  if(tileMeshes.includes(mesh)) startFade(mesh,tex,dur);
}
async function flipTile(mesh, toDown, area){
  if(!!mesh.userData.down===toDown) return;
  mesh.userData.down=toDown; mesh.userData.fogStubs=toDown?(area.fogStubs||''):null;
  const tex=toDown? await faceDownTexture(area) : await loadAlphaTexture(area.tileId? (tiles.get(area.tileId)?.file ?? ''):'');
  if(!tileMeshes.includes(mesh)) return;
  flipAnims.push({mesh,tex,t0:clock.elapsedTime,swapped:false});
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
let isoFocus=null, isoDir='above', isoHinted=false; // focused level (null = whole cave); dir = which side to hide
const isoAlpha={};                        // level -> current (lerped) alpha
function regMat(m){ if(m && m.userData.b===undefined) m.userData.b=m.opacity; }
// dir 'above' hides shallower levels (overhead views); 'below' hides deeper levels (after climbing up);
// 'only' hides every level except the focused one (the Home / snap-to-tile view).
function setIsolation(focus, dir){
  if(focus!=null && isoFocus==null && !isoHinted){ isoHinted=true;
    showToast('Some levels hidden — <b>Free orbit</b> shows the whole cave'); }
  isoFocus=focus; isoDir=dir||'above';
}
function isoTargetFor(lvl){
  if(isoFocus==null) return 1;
  const a=lvlIndex(lvl), f=lvlIndex(isoFocus);
  if(isoDir==='only') return a===f ? 1 : 0;
  return (isoDir==='below' ? a>f : a<f) ? 0 : 1;
}
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
  petrifiedGroup.children.forEach(applyFadeObj);
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
    const mat=new THREE.MeshBasicMaterial({map:doorTexture(a.secretDoor),transparent:true,depthWrite:false,alphaTest:0.02});
    // Multiplayer: wash the marker in the viewing party's colour (kept light so the door art stays legible).
    if(isMultiplayer) mat.color=new THREE.Color(partyColorHex||COLOR.brass).lerp(new THREE.Color(0xffffff),0.5);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
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
  g.userData={gem,halo};g.position.copy(partyTokenPos(engine.current));fxGroup.add(g);partyToken=g;
}
function buildSelectRing(){
  selectRing=new THREE.Mesh(new THREE.RingGeometry(TILE_D*0.4,TILE_D*0.45,56),
    new THREE.MeshBasicMaterial({color:COLOR.brassBright,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  selectRing.rotation.x=-Math.PI/2;fxGroup.add(selectRing);
}

/* ---- exit markers (the navigation affordance) ---- */
// Camera-facing chevron sprite: never goes edge-on (the old cone did in portrait),
// and its glyph is rotated each frame to point screen-outward through the doorway.
let _chevTex=null;
function chevronTexture(){
  if(_chevTex) return _chevTex;
  const s=128, cv=document.createElement('canvas'); cv.width=cv.height=s;
  const cx=cv.getContext('2d');
  // Dark "coin" backing so the marker reads against light stone from ANY angle — including the
  // near-overhead default view, where a bare gold chevron washed out on the corridor floor between
  // two laid tiles. The SpriteMaterial tint multiplies RGB, so this black disc stays neutral-dark
  // (0 × tint = 0) while the white chevron below picks up the brass tint.
  cx.beginPath(); cx.arc(64,64,52,0,Math.PI*2); cx.fillStyle='rgba(0,0,0,0.62)'; cx.fill();
  // chevron points UP; the transparent padding around the coin widens the tap target
  cx.strokeStyle='#ffffff'; cx.lineWidth=13; cx.lineCap='round'; cx.lineJoin='round';
  cx.shadowColor='rgba(0,0,0,0.6)'; cx.shadowBlur=6;
  cx.beginPath(); cx.moveTo(36,76); cx.lineTo(64,46); cx.lineTo(92,76); cx.stroke();
  _chevTex=new THREE.CanvasTexture(cv); _chevTex.colorSpace=THREE.SRGBColorSpace; return _chevTex;
}
function chevronSprite(color){
  const m=new THREE.SpriteMaterial({map:chevronTexture(),color,transparent:true,opacity:0.95,depthTest:false,depthWrite:false});
  const s=new THREE.Sprite(m); s.scale.set(1.1,1.1,1); // big quad = big tap target; glyph sits in the centre
  // Draw markers ON TOP of the tiles/content (which have renderOrder 2-7). Without this the floor
  // tile is drawn after the depthWrite:false sprite and paints over it — the marker then only shows
  // when the camera tilts enough for parallax to lift it off the floor beneath it.
  s.renderOrder=20;
  return s;
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
    // Explored ("known") doorways still read as gold (brass) — the old muted stone-grey vanished
    // between already-laid stone tiles; new frontiers + stairs get the brighter brass to stand out more.
    const col=known?COLOR.brass:COLOR.brassBright;
    if(m.dir==='N'||m.dir==='S'||m.dir==='E'||m.dir==='W'){
      const edge=0.15; // gap beyond the tile edge — markers hug the doorway tightly
      const off={N:[0,0,-(TILE_D/2+edge)],S:[0,0,TILE_D/2+edge],E:[TILE_W/2+edge,0,0],W:[-(TILE_W/2+edge),0,0]}[m.dir];
      const ring=ringFlat(col,0.34,0.46);ring.rotation.x=-Math.PI/2;ring.position.set(0,0.06,0);ring.material.depthTest=false;ring.renderOrder=19;
      const spr=chevronSprite(col); spr.position.set(0,0.5,0);
      grp.add(ring,spr);
      grp.position.set(p.x+off[0],p.y,p.z+off[2]);
      grp.userData.spr=spr; grp.userData.outward=true; grp.userData.center=p.clone();
    } else {
      // stair marker near a corner of the tile
      const corner=m.dir==='D'?[TILE_W*0.30,TILE_D*0.30]:[-TILE_W*0.30,-TILE_D*0.30];
      const ring=ringFlat(col,0.3,0.44);ring.rotation.x=-Math.PI/2;ring.position.y=0.06;ring.material.depthTest=false;ring.renderOrder=19;
      const spr=chevronSprite(col); spr.position.y=0.5;
      grp.add(ring,spr);
      grp.position.set(p.x+corner[0],p.y+0.02,p.z+corner[1]);
      grp.userData.spr=spr; grp.userData.outward=false; grp.userData.stairDir=m.dir; // U up, D down (screen-space)
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
  i=flipAnims.findIndex(f=>f.mesh===mesh); if(i>=0) flipAnims.splice(i,1);
  i=fogFades.findIndex(f=>f.mesh===mesh); if(i>=0){ fogFades[i].over.material.dispose(); fogFades.splice(i,1); }
  i=peekGlows.findIndex(p=>p.mesh===mesh); if(i>=0){ peekGlows[i].g.material.dispose(); peekGlows[i].g.geometry.dispose(); peekGlows.splice(i,1); }
}
// Like disposeTileMesh, but the mesh fades/sinks out over time (animate()'s despawnAnims tick)
// instead of vanishing on the spot — the visible half of a remap swap. Freed from `tileMeshes`
// immediately so buildAreaMesh can lay the replacement at the same coord without waiting.
function despawnTileMesh(mesh){
  let i=tileMeshes.indexOf(mesh); if(i>=0) tileMeshes.splice(i,1);
  i=spawnAnims.findIndex(s=>s.mesh===mesh); if(i>=0) spawnAnims.splice(i,1);
  despawnAnims.push({mesh,p:mesh.position.clone(),t0:clock.elapsedTime});
}
/* Reconcile tile meshes to the authoritative area set. Optimistic doMove laying can drift
   from the synced state: a racing move may leave an area with no mesh, or strand a mesh at a
   phantom coord (e.g. one computed while the party was briefly on another level — the
   "tile on the level below, offset" bug). Drop unbacked meshes; lay any area that lacks one.
   `canAct` (from CaveCanvas's own prop, undefined when the caller — replay/spectate/multiplayer
   — doesn't gate on it) mirrors refreshExitMarkers' own gate: an in-place tile swap only reveals
   once true, i.e. once any "Aftermath" notice explaining it has been dismissed. */
function reconcileTiles(canAct){
  const want=new Map(); engine.areas.forEach(a=>want.set(akey(a),a));
  let changed=false;
  for(const m of [...tileMeshes]){ const ua=m.userData.area; if(!ua||!want.has(akey(ua))){ disposeTileMesh(m); changed=true; } }
  const have=new Set(tileMeshes.map(m=>m.userData.area?akey(m.userData.area):''));
  for(const [k,a] of want){ if(!have.has(k)){ buildAreaMesh(a,true); changed=true; } }
  // Detect an already-meshed coord whose tile IDENTITY changed (Spell's tunnel remap) — queue it;
  // the add/remove diffing above never sees this since the coord itself didn't change. Gated on
  // `a.faceDown` (AF_UNRESOLVED, the Spell replacement's own signature — a wholesale new
  // PlacedArea) so a dead end's closed doorway is never mistaken for one. A placed card is no longer
  // rewritten (map.ts records a dead doorway in `deadDoors`), so the tile identity cannot shift that way
  // any more; the gate is kept as a belt-and-braces guard.
  for(const m of tileMeshes){
    const ua=m.userData.area; if(!ua) continue;
    const a=want.get(akey(ua)); if(!a) continue;
    if(a.faceDown && (a.tileId!==ua.tileId||a.rot!==ua.rot) && !pendingRemaps.has(akey(a))) pendingRemaps.set(akey(a),a);
  }
  // A face-down tile the party has now entered (or a Spell tile resolved) fades to its real face.
  for(const m of tileMeshes){
    const ua=m.userData.area; if(!ua) continue;
    const a=want.get(akey(ua)); if(a && m.userData.down && !a.faceDown) fadeToFace(m,a);
    else if(a && m.userData.down && a.faceDown) fadeToFog(m,a); // another doorway into it was tried: its fog card gains a stub
  }
  if(pendingRemaps.size && canAct!==false){
    for(const [k,a] of [...pendingRemaps]){
      const old=tileMeshes.find(m=>m.userData.area&&akey(m.userData.area)===k);
      if(old) despawnTileMesh(old);
      buildAreaMesh(a,true);
      pendingRemaps.delete(k);
    }
    changed=true;
  }
  // Re-tint tiles whose destroyed state flipped (an earthquake collapses an already-placed area).
  for(const m of tileMeshes){ const a=m.userData.area&&want.get(akey(m.userData.area)); if(a&&m.material&&m.material.color) m.material.color.setHex(a.destroyed?DESTROYED_TINT:0xffffff); }
  // A vertical move into an ALREADY-PLACED area can add a mirrored return-stair + secret-door marker
  // to that existing tile (no new mesh), which the mesh reconciliation above won't notice. Track the
  // stair/door topology so those connectors and markers rebuild when it changes.
  const stairSig=engine.areas.map(a=>`${a.level},${a.col},${a.row},${a.down?1:0},${a.up?1:0},${a.secretDoor??'-'}`).join('|');
  if(stairSig!==lastStairSig){ lastStairSig=stairSig; changed=true; }
  if(changed){ rebuildPlatforms(); rebuildStairs(); rebuildSecretDoors(); rebuildLevelButtons(); }
}
function refresh(canAct){
  updateHUD(); selectCurrent(); refreshExitMarkers(); reconcileTiles(canAct); layPetrified();
  // Re-lay every chamber whose on-floor cards changed (e.g. a treasure was picked up);
  // layContents is a no-op when an area's contents are unchanged.
  engine.areas.forEach(a=>{ layContents(a,false); laySunkTreasure(a); });
  // Move the party token + camera to the current tile after a panel-driven move
  // (withdraw/retreat send the party back to the previous tile, outside doMove's animation).
  if(partyToken){
    const to=partyTokenPos(engine.current);
    // A sync can land while a previous token move is still animating (rapid panel moves, replay
    // auto-play): retarget from wherever the token is instead of dropping the move — dropping it
    // left the token a tile behind (it "skipped" locations) until a later sync caught up.
    const retarget = tokenMove && tokenMove.to.distanceTo(to)>0.01;
    if((!tokenMove || retarget) && partyToken.position.distanceTo(to)>0.01){
      tokenMove={from:partyToken.position.clone(), to, t0:clock.elapsedTime, dur:0.55};
      if(homeOnArrival){ homeOnArrival=false; viewSnapTile(); } // same as the Home button, on the new tile
      else{
        flyFollow(to);
        if(isoFocus!=null) setIsolation(engine.current.level, isoDir);
      }
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
  // Extension kit (SC-EXT-10): a Gallery statue reuses the SAME "greyed = stone" tint token
  // `makeStoneCard` already established for petrified party members (below), just applied to the
  // ordinary floor-card face instead of a dedicated overlay group.
  if(card.asleep) face.material.color.setHex(0x8a8aa6); // a sleeping creature: cool, dimmed
  else if(card.stone) face.material.color.setHex(0x6a6a72); // a Gallery statue: stone-grey
  face.rotation.x=-Math.PI/2; face.position.y=0.001; face.renderOrder=6;
  face.userData.card=card;
  regMat(mat.material);regMat(edge.material);regMat(face.material);
  g.add(mat,edge,face); g.rotation.y=yaw||0;
  if(card.asleep){ // "Zzz" marker so it reads as asleep, not a threat
    const zzz=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*0.55,CARD_W*0.55),
      new THREE.MeshBasicMaterial({map:zzzTexture(),transparent:true,depthWrite:false}));
    zzz.rotation.x=-Math.PI/2; zzz.position.set(CARD_W*0.24,0.02,-CARD_H*0.30); zzz.renderOrder=7;
    regMat(zzz.material); g.add(zzz);
  } else if(card.stone){ // "STONE" marker so it reads as scenery, not a threat (design US-06)
    const stone=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*0.7,CARD_W*0.7),
      new THREE.MeshBasicMaterial({map:stoneTexture(),transparent:true,depthWrite:false}));
    stone.rotation.x=-Math.PI/2; stone.position.set(0,0.02,-CARD_H*0.30); stone.renderOrder=7;
    regMat(stone.material); g.add(stone);
  }
  g.userData.face=face;
  contentMeshes.push(face);
  return g;
}
// laid card-groups keyed by area coord (stable across re-projection), with a
// content signature so we only rebuild when the chamber's cards actually change.
const contentGroups=new Map();                          // "lvl,col,row" -> {group,sig,faces}
function contentSig(area){
  return area.strangers.map(c=>c.id).join(',')+'|'+area.treasure.map(c=>c.id).join(',')+'|'+area.hazards.map(c=>c.id).join(',');
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
  if(!area.strangers.length && !area.treasure.length && !area.hazards.length) return; // nothing to show
  const lanes=[
    {list:area.strangers, ax:-TILE_W*0.14, az:-TILE_D*0.17},   // creatures: upper-left, inward
    {list:area.treasure,  ax:-TILE_W*0.14, az: TILE_D*0.19},   // treasure: lower-left, inward
    {list:area.hazards,   ax: TILE_W*0.16, az:-TILE_D*0.17},   // hazards (permanent: Medusa, earthquake scar): upper-right
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

// Precise Locations (engine SC-10.5-9): treasure sunk at a specific sub-location (a doorway or the
// island) — laid at that doorway's own offset (subOffsetPos), NOT the generic treasure lane, so it
// reads as precisely placed rather than lumped into the tile-wide floor. Same cache/dispose
// pattern as layContents, keyed separately since the two signatures change independently.
const sunkGroups=new Map();                              // "lvl,col,row" -> {group,sig,faces}
function sunkSig(area){
  return (area.sunkTreasure||[]).map(b=>`${b.at}:${b.items.map(c=>c.id).join(',')}`).join('|');
}
function laySunkTreasure(area){
  const key=area.level+','+area.col+','+area.row;
  const sig=sunkSig(area);
  const existing=sunkGroups.get(key);
  if(existing){
    if(existing.sig===sig) return;
    disposeContentGroup(existing); sunkGroups.delete(key);
  }
  if(!area.sunkTreasure||!area.sunkTreasure.length) return;
  const base=worldPos(area);
  const grp=new THREE.Group(); grp.position.copy(base);
  const faces=[];
  area.sunkTreasure.forEach(bucket=>{
    const pos=subOffsetPos(area,bucket.at);
    const lx=pos.x-base.x, lz=pos.z-base.z;
    const n=bucket.items.length, center=(n-1)/2, dx=0.2, fanStep=n>1?Math.min(0.15,0.5/(n-1)):0;
    bucket.items.forEach((card,i)=>{
      const off=i-center;
      const o=makeCardObject(card,-off*fanStep);
      faces.push(o.userData.face);
      o.userData.face.userData.area=area;
      o.position.set(lx+off*dx, 0.07+i*0.014, lz);
      grp.add(o);
    });
  });
  grp.userData.lvl=area.level; contentGroup.add(grp);
  sunkGroups.set(key,{group:grp,sig,faces});
}

/* Members turned to stone by Medusa: their creature card laid greyed-out on the party's tile with the
   stone marker card on top (docs/assets/tokens/markers/marker-02.png). Rebuilt whenever the party or
   its position changes; they remain until cured by the Magic Staff. */
const STONE_MARKER='/assets/tokens/markers/marker-02.png';
function makeStoneCard(file){
  const g=new THREE.Group();
  const mat=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*1.16,CARD_H*1.12),
    new THREE.MeshBasicMaterial({color:0x05050a,transparent:true,opacity:0.55,depthWrite:false}));
  mat.rotation.x=-Math.PI/2; mat.position.y=-0.012; mat.renderOrder=4;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W,CARD_H),
    new THREE.MeshBasicMaterial({map:loadPlainTexture(file),color:0x6a6a72,transparent:true,depthWrite:false})); // greyed = stone
  face.rotation.x=-Math.PI/2; face.position.y=0.001; face.renderOrder=6;
  const marker=new THREE.Mesh(new THREE.PlaneGeometry(CARD_W*0.92,CARD_H*0.92),
    new THREE.MeshBasicMaterial({map:loadPlainTexture(STONE_MARKER),transparent:true,opacity:0.5,depthWrite:false})); // half-transparent so the member shows through
  marker.rotation.x=-Math.PI/2; marker.position.y=0.02; marker.renderOrder=8;
  regMat(mat.material);regMat(face.material);regMat(marker.material);
  g.add(mat,face,marker);
  return g;
}
function layPetrified(){
  if(!petrifiedGroup) return;
  for(let i=petrifiedGroup.children.length-1;i>=0;i--){const o=petrifiedGroup.children[i];o.traverse?.(x=>{x.geometry?.dispose?.();x.material?.dispose?.();});petrifiedGroup.remove(o);}
  const stoned=PARTY.filter(m=>m.petrified&&m.card&&m.stoneArea!=null);
  if(!stoned.length||!engine) return;
  const areas=engine.areas;
  // Group the stoned by the chamber they were left in, and lay each group on that tile.
  const byArea=new Map();
  stoned.forEach(m=>{ const a=byArea.get(m.stoneArea)||[]; a.push(m); byArea.set(m.stoneArea,a); });
  byArea.forEach((members,ai)=>{
    const area=areas[ai]; if(!area) return;
    const grp=new THREE.Group(); grp.position.copy(worldPos(area)); grp.userData.lvl=area.level;
    const n=members.length, center=(n-1)/2, dx=0.27, fanStep=n>1?Math.min(0.17,0.62/(n-1)):0;
    members.forEach((m,i)=>{
      const off=i-center;
      const o=makeStoneCard(m.card); o.rotation.y=-off*fanStep;
      o.position.set(TILE_W*0.16 + off*dx, 0.07 + i*0.016, TILE_D*0.19 + Math.abs(off)*0.045); // lower-right, clear of the content lanes
      grp.add(o);
    });
    petrifiedGroup.add(grp);
  });
}
const goal={pos:new THREE.Vector3(),target:new THREE.Vector3(),fov:45,active:false};
function flyTo(pos,target,fov){goal.pos.copy(pos);goal.target.copy(target);goal.fov=fov??camera.fov;goal.active=true;controls.enabled=false;}
function flyFollow(newTarget){ // keep relative view, shift to new target
  const delta=newTarget.clone().sub(controls.target);
  flyTo(camera.position.clone().add(delta),newTarget,camera.fov);
}
function sceneCenter(){const c=new THREE.Vector3();engine.areas.forEach(a=>c.add(worldPos(a)));return c.multiplyScalar(1/engine.areas.length);}
function viewFreeOrbit(){lastSnapArea=null;setMode('orbit','Free orbit');setIsolation(null);const c=sceneCenter();flyTo(c.clone().add(new THREE.Vector3(TILE_W*2.4,13,16)),c,45);}
// Snap (overhead) view: fit the chamber + its doorway markers to the viewport, so all exits stay framed
// in portrait or landscape. SNAP_RADIUS covers the tile half-width plus a one-tile doorway margin.
const SNAP_RADIUS=TILE_W*0.78;
let lastSnapArea=null; // remembered so onResize can re-fit on a portrait/landscape flip
function frameSnap(area){
  lastSnapArea=area;
  const fov=30, dist=fitDistance(SNAP_RADIUS,fov,camera.aspect);
  const wp=worldPos(area);
  // look slightly from the south so North reads "up" the screen; height ≈ dist, small forward bias
  flyTo(wp.clone().add(new THREE.Vector3(0,dist*0.96,dist*0.27)),wp,fov);
}
function viewSnapTile(){const a=engine.current;setMode('snap','Overhead · '+a.name);setIsolation(a.level,'only');frameSnap(a);}
function frameArea(a,instant){ // a: {col,row,level} — frame that chamber overhead, as the Home button does; `instant` cuts there with no flight
  if(a==null) return;
  setMode('snap','Overhead'); setIsolation(a.level,'only'); frameSnap(a);
  if(instant){camera.position.copy(goal.pos);controls.target.copy(goal.target);camera.fov=goal.fov;camera.updateProjectionMatrix();goal.active=false;controls.enabled=true;}
}
function focusArea(a){ // a: {col,row,level} — fly the camera to that area (free-roam spectating)
  if(a==null) return;
  setMode('orbit','Spectating'); setIsolation(a.level);
  const wp=worldPos(a);
  flyTo(wp.clone().add(new THREE.Vector3(TILE_W*1.6,11,12)),wp,40);
}
let activeLevel=null;
function viewLevel(lvl){lastSnapArea=null;activeLevel=lvl;setMode('level','Level '+lvl);setIsolation(lvl);const b=levelBounds[lvl];const c=new THREE.Vector3(b.cx,b.y,b.cz);flyTo(c.clone().add(new THREE.Vector3(TILE_W*1.4,10,12)),c,40);}

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
    if(ev.placed){ // a tile was drawn onto a dead-end frontier — show it face up for a few seconds, then flip it face down
      buildAreaMesh(ev.placed,true,true).then(()=>{rebuildPlatforms();rebuildStairs();rebuildSecretDoors();rebuildLevelButtons();});
      refreshExitMarkers(); // the attempted exit was pruned
    }
    else if(ev.deadEnd) reconcileTiles(); // a tile already laid: if it is face down, its fog card gains the stub for this doorway
    setPrompt(ev.deadEnd?'That way is a dead end.':'No exit that way.','danger'); flashMarker(dir,true); return;
  }
  busy=true;
  if(ev.placed){ buildAreaMesh(ev.area,true).then(()=>{rebuildPlatforms();rebuildStairs();rebuildSecretDoors();rebuildLevelButtons();}); }
  // move token (a sprung trap drops the party a level, animated like a descent)
  const drop = ev.descended||ev.ascended||ev.fell;
  const from=partyToken.position.clone(), to=partyTokenPos(ev.area);
  tokenMove={from,to,t0:clock.elapsedTime,dur: drop?0.9:0.55};
  // camera follow
  if(drop) setTimeout(()=>flyFollow(to),120); else flyFollow(to);
  // HUD
  setTimeout(()=>{
    updateHUD(); selectCurrent();
    // Descending (or falling) auto-hides the level above so it never occludes the new one.
    // Climbing UP a level hides the lower (deeper) levels left behind — they only clutter the view.
    // Otherwise just keep an existing isolated view focused on the current level.
    if(ev.descended||ev.fell) setIsolation(engine.current.level, 'above');
    else if(ev.ascended) setIsolation(engine.current.level, 'below');
    else if(isoFocus!=null) setIsolation(engine.current.level, isoDir);
    if(ev.chamber) onChamber(ev.area,ev.chamber); else {
      const n=ev.area.name;
      setPrompt(ev.descended?('You descend to <b>'+n+'</b> on level '+ev.area.level+'.')
        :ev.ascended?('You climb to <b>'+n+'</b>.')
        :('You enter <b>'+n+'</b>.'), 'event');
    }
    refreshExitMarkers();
    // Bug fix: ev.notices used to show its OWN "Aftermath" confirm here, from this adapter's local
    // (optimistic) reduce() result — duplicating the SAME notices a beat later when the Convex
    // round-trip resolves and GameScreen's onMoveResolved/holdMove surfaces them again via
    // NoticeModal (added for SC-4-43's mid-relocation backdrop fix, which also needed to reach
    // dice rolls this local path never showed). holdMove's is the snapshot-correct one (it
    // presents against the room events actually happened in, not the post-relocation landing
    // tile) — this local echo was the redundant one. The trap modal isn't duplicated anywhere
    // else, so it stays.
    const showTrap = ev.trap
      ? () => {
          // The trap itself is one-way, but if the chamber below happens to have its own ascending
          // staircase the party can still climb back out — so only warn of no return when there isn't one.
          const noWayBack = ev.area.up ? '' : ' There is no way back up.';
          const c = ev.trap==='sprung'
            ? ['Trap sprung!','The floor gives way — the party plunges to <b>'+ev.area.name+'</b> on level '+ev.area.level+'.'+noWayBack,'bad']
            : ['Trap avoided','Your dwarf spots a hidden trap and guides the party safely across.','good'];
          return showConfirm(c[0],c[1],c[2]);
        }
      : null;
    (showTrap ? showTrap() : Promise.resolve())
      .then(()=>{ busy=false; });
  }, drop?620:420);
}
function onChamber(area,chamber){
  layContents(area, chamber.firstVisit);           // lay the cards on the chamber floor (persists)
  laySunkTreasure(area);                           // Precise Locations: any per-doorway/island stash
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
function areaPanel(area){
  // Highlight the selected tile and show the focused card; the text readout panel was removed as clutter.
  selectRing.position.copy(worldPos(area));selectRing.position.y+=0.02;selectRing.visible=true;
  const focus=area.strangers[0]||area.treasure[0];
  if(focus) showCard(focus,area.name); else hideCard();
}
function selectCurrent(){ areaPanel(engine.current); }
function inspectArea(a){ areaPanel(a); }
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
function updateHUD(){
  // The HUD is React-owned and may be absent for a moment between games (unmount/remount) or when a
  // delayed timer (e.g. the roster animation) fires after this renderer's DOM is gone. Bail out
  // rather than throw — a thrown error here used to abort doMove's chain and strand `busy=true`,
  // which then blocked all movement in the next game.
  const depth=document.getElementById('st-depth');
  if(!depth) return;
  const s=engine.state();
  depth.textContent='Level '+s.level;
  const turn=document.getElementById('st-turn'); if(turn) turn.textContent=s.turn;
  const party=document.getElementById('st-party'); if(party) party.textContent=PARTY.length;
  const tilesEl=document.getElementById('st-tiles'); if(!tilesEl) return;
  tilesEl.textContent=s.deckLeft+' / '+s.deckTotal;
  const low=s.deckLeft<10; // running out of area cards to explore
  tilesEl.classList.toggle('danger',low);
  if(low){ if(!deckWarned){ showToast('Only <b>'+s.deckLeft+'</b> tile cards left!'); deckWarned=true; } }
  else deckWarned=false;}
function renderRoster(){const b=document.getElementById('rosterBody');b.innerHTML='';
  PARTY.forEach(m=>{const row=document.createElement('div');row.className='mbr'+(m.lead?' lead':'')+(m.petrified?' petrified':'');
    const carry=m.carry||0, load=m.load||0, free=Math.max(0,carry-load);
    const pct=carry>0?Math.min(100,Math.round((load/carry)*100)):0;
    const cap=m.sibyl ? '<div class="cap"><span class="cap-tx none">cannot fight or be harmed</span></div>' : carry>0
      ? '<div class="cap"><div class="cap-bar"><i style="width:'+pct+'%"></i></div><span class="cap-tx">'+load+'/'+carry+' kg · '+free+' free</span></div>'
      : '<div class="cap"><span class="cap-tx none">no carry capacity</span></div>';
    const carryRow=carryRowHtml({items:Array.isArray(m.items)?m.items:[],awards:Array.isArray(m.awards)?m.awards:[],dragonCard:m.dragonCard||null});
    const badge=m.petrified?'<span class="badge stone" title="Turned to stone — cure with a Magic Staff">stone</span>'
      :m.sibyl?'<span class="badge ally" title="Travels with the party — she cannot fight or be harmed">guide</span>'
      :m.ally?'<span class="badge ally" title="Befriended ally">ally</span>':'';
    row.innerHTML='<div class="sig">'+escAttr(m.sig)+'</div><div class="who"><div class="nm-line"><span class="nm">'+escAttr(m.label||m.name)+'</span>'+badge+'</div>'+cap+carryRow+'</div>';
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
    rosterAnimTimer=setTimeout(()=>{ rosterAnimTimer=null; PARTY=p; renderRoster(); updateHUD(); layPetrified(); }, 520);
  } else {
    PARTY=p; renderRoster(); updateHUD(); layPetrified();
  }
}
/* ---- other parties' tokens (multiplayer): small coloured pins at each party's tile ---- */
function setOtherParties(list){
  [...otherGroup.children].forEach(o=>{o.traverse?.(c=>{c.geometry?.dispose?.();c.material?.dispose?.();});otherGroup.remove(o);});
  const seen=new Map(); // tile key -> how many other parties already placed there (to fan them)
  (list||[]).forEach(p=>{
    const base=new THREE.Color(p.color||COLOR.brass);
    const g=new THREE.Group();
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.32,0.08,22),new THREE.MeshBasicMaterial({color:base}));disc.position.y=0.1;
    const pin=new THREE.Mesh(new THREE.ConeGeometry(0.17,0.52,14),new THREE.MeshBasicMaterial({color:base.clone().lerp(new THREE.Color(0xffffff),0.3)}));pin.position.y=0.5;
    g.add(disc,pin); g.scale.setScalar(0.5);
    const tile={col:p.col,row:p.row,level:p.level};
    // Precise Locations (engine SC-10.5): a doorway sub-location places this pin exactly, no fan
    // needed. Without one (today's only caller — the generic same-tile fan is the pre-existing
    // fallback, kept for when several rivals share a tile with no positional info to tell them apart).
    const dir=p.subLocation&&p.subLocation.at==='doorway'?p.subLocation.dir:null;
    if(dir){
      const wp=subOffsetPos(tile,dir);
      g.position.set(wp.x,wp.y,wp.z);
    } else {
      const wp=worldPos(tile);
      const key=p.level+','+p.col+','+p.row, n=seen.get(key)??0; seen.set(key,n+1);
      const r=n===0?0:TILE_W*0.13, ang=(n-1)*(Math.PI*2/3);
      g.position.set(wp.x+Math.cos(ang)*r, wp.y, wp.z+Math.sin(ang)*r);
    }
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
const _v0=new THREE.Vector3(), _v1=new THREE.Vector3(); // scratch for billboard outward-angle projection

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
  // flip anims — a dead end turned face down (or a face-down tile turned up): rise, edge-on, swap the face, settle
  for(let i=flipAnims.length-1;i>=0;i--){const f=flipAnims[i],k=Math.min(1,(tt-f.t0)/0.7),m=f.mesh,b=m.userData.basePos;
    m.scale.x=Math.max(0.03,Math.abs(Math.cos(Math.PI*k)));
    if(b) m.position.y=b.y+0.7*Math.sin(Math.PI*k);
    if(!f.swapped&&k>=0.5){f.swapped=true;if(f.tex){m.material.map=f.tex;m.material.needsUpdate=true;}}
    if(k>=1){m.scale.x=1;if(b)m.position.y=b.y;flipAnims.splice(i,1);}}
  // the Sibyl's glow — the card's own envelope: in, hold, out
  for(let i=peekGlows.length-1;i>=0;i--){const p=peekGlows[i],u=(tt-p.t0)/PEEK_S;
    if(u>=1||!tileMeshes.includes(p.mesh)){p.mesh.remove(p.g);p.g.material.dispose();p.g.geometry.dispose();peekGlows.splice(i,1);continue;}
    p.g.material.opacity=0.8*(u<0.2?u/0.2:u<0.7?1:(1-u)/0.3);}
  // fog fades — a dead end read, then crossfaded to its fog card (laid over it), which finally replaces the face
  for(let i=fogFades.length-1;i>=0;i--){const f=fogFades[i],k=Math.min(1,(tt-f.t0)/f.dur);
    f.over.material.opacity=k;
    if(k>=1){settleFogFade(f);fogFades.splice(i,1);}}
  // despawn anims — the outgoing half of a tile swap (e.g. Spell's tunnel remap): mirrors spawn's
  // fade-in-and-drop with a fade-out-and-sink, then frees the mesh for good.
  for(let i=despawnAnims.length-1;i>=0;i--){const s=despawnAnims[i],k=Math.min(1,(tt-s.t0)/0.5);
    s.mesh.material.opacity=1-k;s.mesh.position.y=s.p.y-k*1.4;
    if(k>=1){tileGroup.remove(s.mesh);s.mesh.geometry?.dispose?.();if(s.mesh.material){s.mesh.material.map?.dispose?.();s.mesh.material.dispose();}despawnAnims.splice(i,1);}}
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
  if(picker)picker.rings.forEach((r,i)=>{r.material.opacity=0.4+Math.sin(tt*3+i*0.8)*0.3;});
  // exit markers pulse + hover bob + billboard the chevron to point screen-outward
  exitMarkers.forEach(g=>{const f=g.userData.flash;let amp=0.07;
    if(f){const kk=(tt-f.t0);if(kk>0.6){g.userData.flash=null;}amp=0.18;}
    g.position.y=g.userData.base+Math.sin(tt*3+g.position.x)*amp;
    g.children.forEach(c=>{if(c.material)c.material.opacity=0.7+Math.sin(tt*3)*0.25;});
    const spr=g.userData.spr;
    if(spr){
      if(g.userData.outward){
        _v0.copy(g.userData.center).project(camera);                 // tile centre → NDC
        _v1.copy(g.position).project(camera);                        // marker → NDC
        spr.material.rotation=spriteRotationForScreenVector(_v1.x-_v0.x, _v1.y-_v0.y);
      } else {
        spr.material.rotation = g.userData.stairDir==='D' ? Math.PI : 0; // stairs: down / up
      }
    }});
  const az=controls.getAzimuthalAngle();needle.style.transform='translate(-50%,-100%) rotate('+(-az)+'rad)';
  controls.update();renderer.render(scene,camera);
}

/* ============================================================
   boot
   ============================================================ */
/* ---- destination picker (Sorcerer's teleport) ----
   Free-orbit the whole cave, ring every area the party may be sent to, and report the one the player
   clicks. The React dialog owns the confirm/back buttons; this only does the choosing. */
let picker=null; // {byKey: akey -> area index, onPick, rings, hover}
let homeOnArrival=false; // snap the camera 'home' to the party's tile once the teleport lands (see refresh)
function pickerHover(e){
  if(!picker) return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;ray.setFromCamera(mouse,camera);
  const hit=ray.intersectObjects(tileMeshes,false)[0];
  const a=hit&&hit.object.userData.area;
  const ok=!!a&&picker.byKey.has(akey(a));
  picker.hover.visible=ok;
  if(ok){picker.hover.position.copy(worldPos(a));picker.hover.position.y+=0.025;}
  renderer.domElement.style.cursor=ok?'pointer':'';
}
function clearPicker(){
  if(!picker) return;
  renderer.domElement.removeEventListener('pointermove',pickerHover);
  renderer.domElement.style.cursor='';
  [...picker.rings,picker.hover].forEach(r=>{fxGroup.remove(r);r.geometry.dispose();r.material.dispose();});
  picker=null;
  if(selectRing) selectRing.material.color.setHex(COLOR.brassBright);
  selectCurrent(); // put the inspect ring back on the party's tile
}
function setPicker(opts){
  clearPicker();
  if(!opts) return;
  const byKey=new Map(), rings=[];
  for(const d of opts.destinations){
    byKey.set(akey(d),d.idx);
    const r=ringFlat(COLOR.brassBright,TILE_D*0.36,TILE_D*0.42);
    r.rotation.x=-Math.PI/2; r.position.copy(worldPos(d)); r.position.y+=0.03;
    fxGroup.add(r); rings.push(r);
  }
  // the tile under the cursor, if it can be chosen: a bright wash over the whole card
  const hover=new THREE.Mesh(new THREE.PlaneGeometry(TILE_W*0.97,TILE_D*0.97),
    new THREE.MeshBasicMaterial({color:COLOR.brassBright,transparent:true,opacity:0.42,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  hover.rotation.x=-Math.PI/2; hover.visible=false; fxGroup.add(hover);
  picker={byKey,onPick:opts.onPick,rings,hover};
  renderer.domElement.addEventListener('pointermove',pickerHover);
  selectRing.visible=false; selectRing.material.color.setHex(0xc79bff);
  viewFreeOrbit();
  setPrompt(opts.prompt||'Choose where the Sorcerer will send you — click a <b>ringed area</b>.','event');
}
/* The Sibyl's glow: the soft violet frame the top-of-the-pack card wears (styles.css .scv-sibyl-peek), laid round a tile she is showing. */
let peekGlowTex=null;
function peekGlowTexture(){
  if(peekGlowTex) return peekGlowTex;
  const w=640,h=Math.round(w*TILE_D/TILE_W),pad=0.12,cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const c=cv.getContext('2d'),x=w*pad/(1+2*pad),y=h*pad/(1+2*pad),rw=w-2*x,rh=h-2*y;
  c.shadowColor='rgba(186,156,255,0.9)';c.shadowBlur=w*0.05;c.fillStyle='#bc9cff';c.fillRect(x,y,rw,rh);
  c.shadowColor='transparent';c.globalCompositeOperation='destination-out';c.fillRect(x,y,rw,rh); // the tile itself stays clear: only the frame shows
  peekGlowTex=new THREE.CanvasTexture(cv);peekGlowTex.colorSpace=THREE.SRGBColorSpace;
  return peekGlowTex;
}
const peekGlows=[];
const PEEK_S=3.4;   // the same breath as the card: in over the first fifth, held to 70%, out by the end
function addPeekGlow(mesh){
  const g=new THREE.Mesh(new THREE.PlaneGeometry(TILE_W*1.24,TILE_D*1.24),new THREE.MeshBasicMaterial({map:peekGlowTexture(),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  g.position.z=0.03; g.renderOrder=3; mesh.add(g);
  peekGlows.push({mesh,g,t0:clock.elapsedTime});
}
/** The Sibyl's look at a face-down tile: its fog card fades to the real card and back, in the violet frame of her top-of-the-pack
 *  card — the player must remember what they saw. */
function peekTile(d){
  const k=akey(d), m=tileMeshes.find(x=>x.userData.area&&akey(x.userData.area)===k);
  if(!m||!m.userData.down) return;
  const a=m.userData.area;
  addPeekGlow(m);
  fadeToFace(m,a,PEEK_S*0.2);
  setTimeout(()=>{
    const cur=engine.areas.find(x=>akey(x)===k);
    if(tileMeshes.includes(m) && cur && cur.faceDown) fadeToFog(m,cur,PEEK_S*0.3);   // unless a party has entered it meanwhile
    setTimeout(viewSnapTile,PEEK_S*0.3*1000+800);   // once it has faded back, go 'home': back to the party's own tile
  },PEEK_S*0.7*1000);
}
function pickAt(){ // ray already aimed; returns true when the click was consumed by the picker
  if(!picker) return false;
  const hit=ray.intersectObjects(tileMeshes,false)[0];
  const a=hit&&hit.object.userData.area;
  const idx=a?picker.byKey.get(akey(a)):undefined;
  if(idx===undefined) return true; // ignore clicks on tiles that can't be chosen
  selectRing.position.copy(worldPos(a));selectRing.position.y+=0.04;selectRing.visible=true;
  picker.onPick(idx);
  return true;
}

let needle;
function onPointerDown(e){ downXY=[e.clientX,e.clientY]; }
function onPointerUp(e){
  if(!downXY)return;const moved=Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1]);downXY=null;if(moved>6)return;
  if(Reveal.active())return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;ray.setFromCamera(mouse,camera);
  if(pickAt())return;
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
function onResize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
  // Re-fit the snap view to the new aspect so a portrait/landscape flip keeps the chamber + exits framed.
  // Orbit/level views are user-controlled; leave them be.
  const orbitBtn=document.getElementById('orbitBtn');
  if(lastSnapArea && orbitBtn && !orbitBtn.classList.contains('active')) frameSnap(lastSnapArea);
}

export async function boot({ mount, engine: eng, tiles: tileMap, deadEnd, party: partyArr, tileAR, partyColor, onQuit, multiplayer }){
  engine=eng; startLevel=eng.startLevel; tiles=tileMap; deadEndArt=deadEnd||(()=>null); PARTY=partyArr; TILE_D=TILE_W/tileAR; partyColorHex=partyColor; isMultiplayer=!!multiplayer;

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
  scene.add(platformGroup,tileGroup,stairGroup,fxGroup,exitGroup,contentGroup,secretGroup,otherGroup,petrifiedGroup);

  // reset accumulated scene state so a new game (boot re-runs after dispose) starts from a clean map
  [platformGroup,tileGroup,stairGroup,fxGroup,exitGroup,contentGroup,secretGroup,otherGroup,petrifiedGroup].forEach(g=>{
    for(let i=g.children.length-1;i>=0;i--){const o=g.children[i];o.traverse?.(x=>{x.geometry?.dispose?.();x.material?.dispose?.();});g.remove(o);}
  });
  tileMeshes.length=0;exitMarkers.length=0;spawnAnims.length=0;despawnAnims.length=0;stairDashes.length=0;contentMeshes.length=0;cardAnims.length=0;pendingTiles.clear();pendingRemaps.clear();lastStairSig='';
  contentGroups.clear();
  for(const k of Object.keys(levelBounds)) delete levelBounds[k];
  for(const k of Object.keys(isoAlpha)) delete isoAlpha[k];
  isoFocus=null;isoHinted=false;picker=null;homeOnArrival=false;partyToken=null;selectRing=null;tokenMove=null;goal.active=false;
  // Clear transient interaction state that lives at module scope, so a new game never inherits it from
  // however the previous one ended. In particular `busy` is left true when a game ends by leaving the
  // Cave (the exit-confirm path), which would otherwise block every move on the next game's gateway.
  busy=false;
  if(rosterAnimTimer){clearTimeout(rosterAnimTimer);rosterAnimTimer=null;}

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
    showChoice('Abandon the expedition?','You forsake your party to the Cave — they do not escape. Your final score is tallied.','Abandon','Keep playing')
      .then(ok=>{ if(ok) engine.quit(); });
  });
  needle=document.querySelector('#rose .needle');
  addEventListener('resize',onResize);

  buildSelectRing();buildPartyToken();

  const revealParty=PARTY.filter(p=>!p.sibyl).map(p=>({name:p.name,fs:p.fs,mp:p.mp,charisma:!!p.charisma}));
  Reveal.init({
    party:revealParty,
    focusCard:(card)=>showCard(card, engine.current.name),
    snapToTile:(area)=>{ setIsolation(area.level); frameSnap(area); setMode('snap','Overhead · '+area.name); },
    markStrangers:()=>{},
    markTreasure:()=>{},
    onResolved:(a)=>{ setPrompt('You finish exploring <b>'+a.name+'</b>. Choose a doorway to continue.','event'); refreshExitMarkers(); },
  });
  for(const a of engine.areas) await buildAreaMesh(a,false);
  engine.areas.forEach(a=>{ if(a.strangers.length||a.treasure.length) layContents(a,false); laySunkTreasure(a); });
  rebuildPlatforms();rebuildStairs();rebuildSecretDoors();rebuildLevelButtons();refreshExitMarkers();
  renderRoster();updateHUD();selectCurrent();
  // default to an overhead 'snap to tile' view of the start tile, North up the screen
  setMode('snap','Overhead · '+engine.current.name);
  camera.up.set(0,1,0); camera.updateProjectionMatrix();
  frameSnap(engine.current); // fit the start chamber + its exits to the viewport
  controls.update();
  setPrompt('Your party stands in <b>'+engine.current.name+'</b>. Click a glowing doorway, or press N/E/S/W.','event');
  window.__cave={scene,camera,controls,renderer,THREE,engine,tileMeshes,exitMarkers,doMove,worldPos,layContents,contentGroup,setParty,setOtherParties,focusArea,frameArea};
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
  return { dispose, refresh, setParty, setOtherParties, focusArea, frameArea, setPicker, peekTile, snapOnArrival:()=>{homeOnArrival=true;} };
}
