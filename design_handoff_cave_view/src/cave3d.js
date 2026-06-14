import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TILE_AR } from './cave-data.js';
import { CaveEngine } from './cave-engine-stub.js';
import { Reveal } from './reveal.js';
import { CREATURE_STATS } from './encounter-data.js';

/* ============================================================
   Sorcerer's Cave — 3D viewer + interactive navigation
   Renders engine state; turns engine events into motion.
   ============================================================ */
const COLOR={void:0x070709,brass:0xc9a14e,brassBright:0xe6c578,crimson:0xa8443a,arcane:0x5f8f8a,stone:0xb8b1a2};
const CAT_COLOR={creature:'#a8443a',treasure:'#c9a14e',artifact:'#c9a14e',hazard:'#5f8f8a'};
const TILE_W=4.3, TILE_D=TILE_W/TILE_AR, LEVEL_GAP=5.2;
const DIRV={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};

const engine=new CaveEngine();
const startLevel=engine.startLevel;
const lvlIndex=l=>l-startLevel;
function worldPos(a){ return new THREE.Vector3(a.col*TILE_W, -lvlIndex(a.level)*LEVEL_GAP, a.row*TILE_D); }

/* demo party (party-selection UI is out of scope of this pass) */
const PARTY=[{sig:'H',name:'Hero',lead:true,items:[]},{sig:'D',name:'Dwarf',items:[]},{sig:'W',name:'Woman',items:[]}];

/* ---- renderer / scene / camera ---- */
const mount=document.getElementById('scene');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
mount.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(COLOR.void,0.015);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,500);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.08;
controls.minDistance=4; controls.maxDistance=95; controls.maxPolarAngle=Math.PI*0.97;
const maxAniso=renderer.capabilities.getMaxAnisotropy();

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

/* ---- groups ---- */
const platformGroup=new THREE.Group(),tileGroup=new THREE.Group(),stairGroup=new THREE.Group(),
      fxGroup=new THREE.Group(),exitGroup=new THREE.Group(),contentGroup=new THREE.Group();
scene.add(platformGroup,tileGroup,stairGroup,fxGroup,exitGroup,contentGroup);
const tileMeshes=[]; const exitMarkers=[]; const spawnAnims=[]; const stairDashes=[];
const contentMeshes=[]; const cardAnims=[];
let partyToken=null, selectRing=null, tokenMove=null;

/* ---- build a single area's tile ---- */
async function buildAreaMesh(area, spawn){
  const tex=await loadAlphaTexture(area.tileId? ('uploads/sorcerers-cave-assets-min/tiles/area-tile-'+area.tileId+'.png'):'');
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:0.03,side:THREE.DoubleSide,depthWrite:true});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(TILE_W,TILE_D),mat);
  mesh.rotation.x=-Math.PI/2;
  if(area.rot) mesh.rotation.z=THREE.MathUtils.degToRad(-area.rot);
  const p=worldPos(area); mesh.position.copy(p); mesh.renderOrder=2;
  mesh.userData.area=area; mesh.userData.lvl=area.level; regMat(mat); area._mesh=mesh; tileGroup.add(mesh); tileMeshes.push(mesh);
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
  contentGroup.children.forEach(applyFadeObj);
}

function rebuildPlatforms(){
  [...platformGroup.children].forEach(o=>{o.geometry?.dispose?.();platformGroup.remove(o);});
  const levels=[...new Set(engine.areas.map(a=>a.level))].sort((a,b)=>a-b);
  levels.forEach(lvl=>{
    const ts=engine.areas.filter(a=>a.level===lvl);
    let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
    ts.forEach(a=>{const p=worldPos(a);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);});
    const w=(maxX-minX)+TILE_W+TILE_W*0.62,d=(maxZ-minZ)+TILE_D+TILE_D*0.62;
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,y=-lvlIndex(lvl)*LEVEL_GAP;
    const grid=makeGridTexture();grid.wrapS=grid.wrapT=THREE.RepeatWrapping;grid.repeat.set(Math.round(w/TILE_W),Math.round(d/TILE_D));
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

/* ---- party token + selection ring ---- */
function buildPartyToken(){
  const g=new THREE.Group();
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.42,0.1,28),new THREE.MeshBasicMaterial({color:COLOR.brass}));disc.position.y=0.16;
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,0.74,14),new THREE.MeshBasicMaterial({color:COLOR.brassBright}));pillar.position.y=0.58;
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(0.22),new THREE.MeshBasicMaterial({color:COLOR.brassBright}));gem.position.y=1.12;
  const halo=new THREE.Mesh(new THREE.RingGeometry(0.5,0.8,40),new THREE.MeshBasicMaterial({color:COLOR.brass,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.rotation.x=-Math.PI/2;halo.position.y=0.05;
  g.add(disc,pillar,gem,halo);g.userData={gem,halo};g.position.copy(worldPos(engine.current));fxGroup.add(g);partyToken=g;
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
    const col=m.kind==='stair'?COLOR.brassBright:(known?COLOR.stone:COLOR.brass);
    if(m.dir==='N'||m.dir==='S'||m.dir==='E'||m.dir==='W'){
      const off={N:[0,0,-(TILE_D/2+0.55)],S:[0,0,TILE_D/2+0.55],E:[TILE_W/2+0.55,0,0],W:[-(TILE_W/2+0.55),0,0]}[m.dir];
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
    grp.userData.base=grp.position.y; grp.userData.kind=m.kind;
    exitGroup.add(grp); exitMarkers.push(grp);
  });
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
  face.rotation.x=-Math.PI/2; face.position.y=0.001; face.renderOrder=6;
  face.userData.card=card;
  regMat(mat.material);regMat(edge.material);regMat(face.material);
  g.add(mat,edge,face); g.rotation.y=yaw||0;
  g.userData.face=face;
  contentMeshes.push(face);
  return g;
}
function layContents(area, animated){
  if(area._contentGroup) return;                       // already laid (persistent)
  const lanes=[
    {list:area.strangers, ax:-TILE_W*0.14, az:-TILE_D*0.17},   // creatures: upper-left, inward
    {list:area.treasure,  ax:-TILE_W*0.14, az: TILE_D*0.19},   // treasure: lower-left, inward
  ];
  const grp=new THREE.Group(); grp.position.copy(worldPos(area));
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
      o.userData.face.userData.area=area;
      const ty=0.07 + dealIdx*0.016;                    // later cards stack on top
      o.position.set(x,ty,z);
      if(animated){ o.position.y=ty+1.5; o.userData.fade=[o.children[0].material,o.children[1].material,o.userData.face.material];
        o.userData.fade.forEach(m=>m.opacity=0);
        cardAnims.push({obj:o, ty, t0:clock.elapsedTime, delay:dealIdx*0.10}); }
      grp.add(o); dealIdx++;
    });
  });
  grp.userData.lvl=area.level; area._contentGroup=grp; contentGroup.add(grp);
}
const goal={pos:new THREE.Vector3(),target:new THREE.Vector3(),fov:45,active:false};
function flyTo(pos,target,fov){goal.pos.copy(pos);goal.target.copy(target);goal.fov=fov??camera.fov;goal.active=true;controls.enabled=false;}
function flyFollow(newTarget){ // keep relative view, shift to new target
  const delta=newTarget.clone().sub(controls.target);
  flyTo(camera.position.clone().add(delta),newTarget,camera.fov);
}
function sceneCenter(){const c=new THREE.Vector3();engine.areas.forEach(a=>c.add(worldPos(a)));return c.multiplyScalar(1/engine.areas.length);}
function viewFreeOrbit(){setMode('orbit','Free orbit');setIsolation(null);const c=sceneCenter();flyTo(c.clone().add(new THREE.Vector3(TILE_W*2.4,13,16)),c,45);}
function viewSnapTile(){const a=engine.current;setMode('snap','Overhead · '+a.name);setIsolation(a.level);flyTo(worldPos(a).clone().add(new THREE.Vector3(0.2,9.5,2.6)),worldPos(a),30);}
let activeLevel=null;
function viewLevel(lvl){activeLevel=lvl;setMode('level','Level '+lvl);setIsolation(lvl);const b=levelBounds[lvl];const c=new THREE.Vector3(b.cx,b.y,b.cz);flyTo(c.clone().add(new THREE.Vector3(TILE_W*1.4,10,12)),c,40);}

/* ============================================================
   navigation
   ============================================================ */
let busy=false;
const revealed=new Set();
function doMove(dir){
  if(busy||Reveal.active()) return;
  const ev=engine.tryMove(dir);
  if(!ev.moved){ setPrompt(ev.deadEnd?'That way is a dead end.':'No exit that way.','danger'); flashMarker(dir,true); return; }
  busy=true;
  if(ev.placed){ buildAreaMesh(ev.area,true).then(()=>{rebuildPlatforms();rebuildStairs();rebuildLevelButtons();}); }
  // move token
  const from=partyToken.position.clone(), to=worldPos(ev.area);
  tokenMove={from,to,t0:clock.elapsedTime,dur: (ev.descended||ev.ascended)?0.9:0.55};
  // camera follow
  if(ev.descended||ev.ascended) setTimeout(()=>flyFollow(to),120); else flyFollow(to);
  // HUD
  setTimeout(()=>{
    updateHUD(); selectCurrent();
    if(isoFocus!=null) setIsolation(engine.current.level);
    if(ev.chamber) onChamber(ev.area,ev.chamber); else {
      const n=ev.area.name;
      setPrompt(ev.descended?('You descend to <b>'+n+'</b> on level '+ev.area.level+'.')
        :ev.ascended?('You climb to <b>'+n+'</b>.')
        :('You enter <b>'+n+'</b>.'), 'event');
    }
    refreshExitMarkers(); busy=false;
  }, (ev.descended||ev.ascended)?620:420);
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
  const ak=area.level+','+area.col+','+area.row;
  if(draws.length && !revealed.has(ak)){ revealed.add(ak); Reveal.run(area, chamber); }
}
function flashMarker(dir,bad){ const m=exitMarkers.find(x=>x.userData.move===dir); if(m) m.userData.flash={t0:clock.elapsedTime,bad}; }

/* ============================================================
   selection / inspect + card panel
   ============================================================ */
const cardPanel=document.getElementById('cardpanel'),cardImg=document.getElementById('cardimg'),emptyBox=cardPanel.querySelector('.emptybox');
window.__cardCat={};
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
function showEmpty(area){
  cardPanel.classList.add('empty','show');cardImg.style.display='none';emptyBox.style.display='grid';
  document.getElementById('cardwhere').textContent=area.name;
  document.getElementById('cardname').textContent= area.type==='chamber'?'Empty chamber':'Tunnel';
  document.getElementById('cardkind').innerHTML='<span style="font-style:italic;color:#9a9281">'+
    (area.note||(area.type==='chamber'?'Nothing stirs in the dark.':'A passage winds onward.'))+'</span>';
}
function areaPanel(area, useLevel){
  selectRing.position.copy(worldPos(area));selectRing.position.y+=0.02;selectRing.visible=true;
  document.getElementById('sel-nm').textContent=area.name;
  const stair=area.up&&area.down?' · stairs up & down':area.down?' · stair down':area.up?' · stair up':'';
  const counts=[]; if(area.strangers.length)counts.push(area.strangers.length+' stranger'+(area.strangers.length>1?'s':''));
  if(area.treasure.length)counts.push(area.treasure.length+' treasure');
  const base=useLevel?('Level '+area.level):(area.type[0].toUpperCase()+area.type.slice(1));
  document.getElementById('sel-sub').textContent= base+' · '+(counts.length?counts.join(' · '):('exits '+(area.exits||'—')))+stair;
  const focus=area.strangers[0]||area.treasure[0];
  if(focus) showCard(focus,area.name); else showEmpty(area);
}
function selectCurrent(){ areaPanel(engine.current,false); }
function inspectArea(a){ areaPanel(a,true); }
function hexA(hex,a){const n=parseInt(hex.replace('#',''),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}

/* ============================================================
   HUD
   ============================================================ */
function setMode(mode,label){document.getElementById('modelabel').textContent=label;
  document.getElementById('orbitBtn').classList.toggle('active',mode==='orbit');
  [...document.querySelectorAll('.lvlbtn')].forEach(b=>b.classList.toggle('active',mode==='level'&&+b.dataset.lvl===activeLevel));}
let promptT;
function setPrompt(html,cls){const el=document.getElementById('prompt');el.className='prompt'+(cls?' '+cls:'');
  document.getElementById('promptText').innerHTML=html;el.style.opacity='1';
  clearTimeout(promptT);promptT=setTimeout(()=>{el.style.opacity='0.86';},2600);}
let toastT;function showToast(html){const el=document.getElementById('toast');el.innerHTML=html;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),1600);}
function updateHUD(){const s=engine.state();
  document.getElementById('st-depth').textContent='Level '+s.level;
  document.getElementById('st-turn').textContent=s.turn;
  document.getElementById('st-party').textContent=PARTY.length;
  document.getElementById('st-tiles').textContent=s.deckLeft;}
function renderRoster(){const b=document.getElementById('rosterBody');b.innerHTML='';
  PARTY.forEach(m=>{const row=document.createElement('div');row.className='mbr'+(m.lead?' lead':'');
    row.innerHTML='<div class="sig">'+m.sig+'</div><div class="who"><span class="nm">'+m.name+'</span><span class="it">'+(m.items.length?m.items.join(', '):'—')+'</span></div>';
    b.appendChild(row);});}
function rebuildLevelButtons(){const grp=document.getElementById('levelGrp');const levels=[...new Set(engine.areas.map(a=>a.level))].sort((a,b)=>a-b);
  grp.innerHTML='';levels.forEach(lvl=>{const btn=document.createElement('button');btn.className='btn lvlbtn';btn.dataset.lvl=lvl;btn.textContent=lvl;btn.title='Focus level '+lvl;
    btn.addEventListener('click',()=>viewLevel(lvl));grp.appendChild(btn);});}

/* ============================================================
   input
   ============================================================ */
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let downXY=null;
renderer.domElement.addEventListener('pointerdown',e=>downXY=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointerup',e=>{
  if(!downXY)return;const moved=Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1]);downXY=null;if(moved>6)return;
  if(Reveal.active())return;
  mouse.x=(e.clientX/innerWidth)*2-1;mouse.y=-(e.clientY/innerHeight)*2+1;ray.setFromCamera(mouse,camera);
  const hitE=ray.intersectObjects(exitGroup.children,true)[0];
  if(hitE){let g=hitE.object;while(g&&!g.userData.move)g=g.parent;if(g){doMove(g.userData.move);return;}}
  const hitC=ray.intersectObjects(contentMeshes,false)[0];
  if(hitC){const f=hitC.object;showCard(f.userData.card, f.userData.area?f.userData.area.name:engine.current.name);return;}
  const hitT=ray.intersectObjects(tileMeshes,false)[0];
  if(hitT){const a=hitT.object.userData.area; if(a===engine.current){viewSnapTile();selectCurrent();} else inspectArea(a);}
});
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  const map={arrowup:'N',arrowright:'E',arrowdown:'S',arrowleft:'W',n:'N',e:'E',s:'S',w:'W',u:'U',d:'D'};
  if(map[k]){e.preventDefault();doMove(map[k]);}
});

/* dock buttons */
document.getElementById('snapBtn').addEventListener('click',viewSnapTile);
document.getElementById('orbitBtn').addEventListener('click',viewFreeOrbit);
document.getElementById('resetBtn').addEventListener('click',()=>location.reload());
const needle=document.querySelector('#rose .needle');
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

/* ============================================================
   loop
   ============================================================ */
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);const tt=clock.elapsedTime;
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
async function boot(){
  // card metadata for glow colours + inspect
  const {CARDS}=await import('./cave-data.js');
  window.__cardData=CARDS; window.__cardCat={};Object.keys(CARDS).forEach(id=>window.__cardCat[id]=CARDS[id].category);
  buildSelectRing();buildPartyToken();

  const revealParty=PARTY.map(m=>{const s=CREATURE_STATS[m.name]||{fs:3,mp:0};
    return {name:m.name, fs:s.fs, mp:s.mp, charisma:(m.name==='Hero'||m.name==='W-Hero')};});
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
  rebuildPlatforms();rebuildStairs();rebuildLevelButtons();refreshExitMarkers();
  renderRoster();updateHUD();selectCurrent();setMode('orbit','Free orbit');
  const c=sceneCenter();
  camera.position.copy(c.clone().add(new THREE.Vector3(TILE_W*2.4,13,16)));controls.target.copy(c);controls.update();
  flyTo(c.clone().add(new THREE.Vector3(TILE_W*2,12,15)),c,45);
  setPrompt('Your party stands in <b>'+engine.current.name+'</b>. Click a glowing doorway, or press N/E/S/W.','event');
  window.__cave={scene,camera,controls,renderer,THREE,engine,tileMeshes,exitMarkers,doMove,worldPos,layContents,contentGroup};
  document.getElementById('loader').classList.add('hide');animate();
}
boot();
