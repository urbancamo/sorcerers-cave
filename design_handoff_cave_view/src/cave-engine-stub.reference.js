/* ============================================================
   Sorcerer's Cave — ENGINE STUB
   A minimal headless stand-in for the real game engine.
   Same shape the real engine should expose: a state block +
   methods that return EVENTS the UI choreographs. No DOM here.

   Swap your real engine in behind this interface:
     engine.state                      -> snapshot {level,col,row,turn,placed,deckLeft,party}
     engine.openMoves()                -> [{dir, kind:'known'|'undrawn'|'stair', target}]
     engine.tryMove(dir)               -> event (see below)
   Movement events:
     {moved:false, deadEnd:true}
     {moved:true, area, placed?:{...}, descended?:dir, chamber?:{draws:[cards]}}
   ============================================================ */
import { TILES, CARDS, LAYOUT } from './cave-data.js';

const ROT = ['N','E','S','W'];
const OPP = { N:'S', S:'N', E:'W', W:'E' };
const DC  = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] };

export function rotateExits(ex, rot){
  const k = ((rot/90)|0) % 4;
  return ex.split('').map(d=>{const i=ROT.indexOf(d);return i<0?d:ROT[(i+k)%4];}).sort().join('');
}
const key = (lvl,col,row) => lvl+','+col+','+row;

/* classify a small card into the persistent-content lane it occupies on the chamber floor */
export function cardLane(card){
  if(!card) return 'treasure';
  if(card.category==='creature') return 'stranger';
  if(card.category==='hazard')  return 'hazard';
  return 'treasure'; // treasure + artifact
}

/* deterministic-ish shuffle (Fisher–Yates w/ Math.random; engine uses seeded LCG) */
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];} return a; }

export class CaveEngine {
  constructor(){
    this.placed = new Map();          // key -> area
    this.areas = [];                  // in placement order
    this.turn = 1;
    this.tileDeck = shuffle(Object.keys(TILES).filter(id=>{
      // exclude the 5 special/named one-offs from the random deck; they’re seeded by layout
      return !TILES[id].special;
    }));
    this.deckPos = 0;
    this.smallDeck = shuffle(Object.keys(CARDS));
    this.smallPos = 0;
    this._seedFromLayout();
  }

  /* ---- seed the starting dungeon from the authored, validated layout ---- */
  _seedFromLayout(){
    const levels = Object.keys(LAYOUT).map(Number).sort((a,b)=>a-b);
    levels.forEach((lvl)=>{
      LAYOUT[lvl].forEach(t=>{
        const meta = TILES[t.tile];
        const area = {
          tileId:t.tile, rot:t.rot||0, level:lvl, col:t.col, row:t.row,
          exits: rotateExits(meta.exits, t.rot||0),
          type: meta.type, up: meta.up, down: meta.down, special: meta.special,
          name: t.name, note:t.note||null,
          cardId: t.cardId||null, party: !!t.party,
          stairDownTo: t.stairDown||null, stairUpTo: t.stairUp||null,
          visited: true, faceDown:false,
          strangers:[], treasure:[], hazards:[],   // persistent chamber contents (AC[area])
        };
        // an authored, already-discovered chamber lays its card on the floor from the start
        if(t.cardId && CARDS[t.cardId]){
          const c={...CARDS[t.cardId], id:t.cardId};
          (cardLane(c)==='stranger'?area.strangers:cardLane(c)==='hazard'?area.hazards:area.treasure).push(c);
        }
        this.placed.set(key(lvl,t.col,t.row), area);
        this.areas.push(area);
        if (t.party){ this.level=lvl; this.col=t.col; this.row=t.row; }
      });
    });
    this.startLevel = levels[0];
  }

  get current(){ return this.placed.get(key(this.level,this.col,this.row)); }

  state(){
    return {
      level:this.level, col:this.col, row:this.row, turn:this.turn,
      placed:this.areas.length, deckLeft:this.tileDeck.length-this.deckPos,
      current:this.current,
    };
  }

  /* ---- which directions are legal to attempt from the current area ---- */
  openMoves(){
    const a = this.current; const out = [];
    ['N','E','S','W'].forEach(d=>{
      if(!a.exits.includes(d)) return;
      const [dx,dy]=DC[d]; const tk=key(a.level,a.col+dx,a.row+dy);
      const nb=this.placed.get(tk);
      if(nb && !nb.faceDown) out.push({dir:d, kind:'known', target:{level:a.level,col:a.col+dx,row:a.row+dy}});
      else if(!nb) out.push({dir:d, kind:'undrawn', target:{level:a.level,col:a.col+dx,row:a.row+dy}});
    });
    if(a.down) out.push({dir:'D', kind:'stair', target:{level:a.level+1,col:a.col,row:a.row}});
    if(a.up && a.level>this.startLevel) out.push({dir:'U', kind:'stair', target:{level:a.level-1,col:a.col,row:a.row}});
    return out;
  }

  canEscape(){ const a=this.current; return a.up && a.level===this.startLevel; }

  /* ---- draw a tile that fits the required edges (corridors always connect) ---- */
  _drawFittingTile(level, col, row, requiredOpen){
    // requiredOpen: dir that MUST be open (the side we entered from)
    // also respect already-placed orthogonal neighbours
    const neighbours = {};
    ['N','E','S','W'].forEach(d=>{
      const [dx,dy]=DC[d]; const nb=this.placed.get(key(level,col+dx,row+dy));
      if(nb && !nb.faceDown) neighbours[d]=nb.exits.includes(OPP[d]); // true=must open, false=must closed
    });
    neighbours[requiredOpen]=true;
    // try deck tiles in order, each in 4 rotations, find first satisfying all constraints
    for(let scan=0; scan<this.tileDeck.length; scan++){
      const idx=(this.deckPos+scan)%this.tileDeck.length;
      const id=this.tileDeck[idx]; const meta=TILES[id];
      for(const rot of [0,90,180,270]){
        const ex=rotateExits(meta.exits,rot);
        let ok=true;
        for(const d in neighbours){ if(neighbours[d]!==ex.includes(d)){ ok=false; break; } }
        if(ok){
          // consume: move chosen to deckPos, advance
          [this.tileDeck[idx],this.tileDeck[this.deckPos]]=[this.tileDeck[this.deckPos],this.tileDeck[idx]];
          this.deckPos++;
          return {id, rot, meta, ex};
        }
      }
    }
    return null; // pack exhausted / no fit
  }

  _newArea(id, rot, meta, ex, level, col, row, faceDown){
    const a = {
      tileId:id, rot, level, col, row, exits:ex,
      type:meta.type, up: level===this.startLevel?false:meta.up, down:meta.down, special:meta.special,
      name: this._areaName(meta), note:null, cardId:null, party:false,
      visited:false, faceDown:!!faceDown,
      strangers:[], treasure:[], hazards:[],
    };
    this.placed.set(key(level,col,row), a);
    this.areas.push(a);
    return a;
  }
  _areaName(meta){
    if(meta.special) return ({gateway:'The Gateway','deep-pool':'Deep Pool','viper-pit':'Viper Pit',
      'tomb-of-kings':'Tomb of Kings','great-hall':'Great Hall'})[meta.special]||'Chamber';
    return meta.type==='chamber' ? 'Chamber' : 'Tunnel';
  }

  /* ---- attempt a move; returns an event the UI animates ---- */
  tryMove(dir){
    const a=this.current;
    if(dir==='U' || dir==='D'){
      if(dir==='D' && !a.down) return {moved:false, deadEnd:true};
      if(dir==='U' && !(a.up && a.level>this.startLevel)) return {moved:false, deadEnd:true};
      const nl=a.level+(dir==='D'?1:-1);
      let dest=this.placed.get(key(nl,a.col,a.row));
      let placed=null;
      if(!dest){
        // draw a tile with the matching stair to land on
        const need = dir==='D'?'up':'down';
        const found=this._drawFittingTileStair(nl,a.col,a.row,need);
        if(!found) return {moved:false, deadEnd:true};
        dest=this._newArea(found.id,found.rot,found.meta,found.ex,nl,a.col,a.row,false);
        if(dir==='D'){ dest.up=true; a.stairDownTo=nl; } else { dest.down=true; }
        placed={...dest};
      }
      this.level=nl; this.col=a.col; this.row=a.row; this.turn++;
      return this._arriveEvent(dest, placed, dir);
    }
    // lateral
    if(!a.exits.includes(dir)) return {moved:false, deadEnd:true};
    const [dx,dy]=DC[dir]; const ncol=a.col+dx, nrow=a.row+dy;
    let dest=this.placed.get(key(a.level,ncol,nrow)); let placed=null;
    if(dest && !dest.faceDown){
      if(!dest.exits.includes(OPP[dir])){ return {moved:false, deadEnd:true}; }
    } else if(!dest){
      const found=this._drawFittingTile(a.level,ncol,nrow,OPP[dir]);
      if(!found){ return {moved:false, deadEnd:true}; }
      dest=this._newArea(found.id,found.rot,found.meta,found.ex,a.level,ncol,nrow,false);
      placed={...dest};
    } else { return {moved:false, deadEnd:true}; }
    this.level=a.level; this.col=ncol; this.row=nrow; this.turn++;
    return this._arriveEvent(dest, placed, dir);
  }
  _drawFittingTileStair(level,col,row,needStair){
    for(let scan=0; scan<this.tileDeck.length; scan++){
      const idx=(this.deckPos+scan)%this.tileDeck.length;
      const id=this.tileDeck[idx]; const meta=TILES[id];
      if(needStair==='up' && !meta.up) continue;
      if(needStair==='down' && !meta.down) continue;
      // respect lateral neighbours on the new level
      const neighbours={};
      ['N','E','S','W'].forEach(d=>{const [dx,dy]=DC[d];const nb=this.placed.get(key(level,col+dx,row+dy));
        if(nb&&!nb.faceDown)neighbours[d]=nb.exits.includes(OPP[d]);});
      for(const rot of [0,90,180,270]){
        const ex=rotateExits(meta.exits,rot); let ok=true;
        for(const d in neighbours){ if(neighbours[d]!==ex.includes(d)){ok=false;break;} }
        if(ok){ [this.tileDeck[idx],this.tileDeck[this.deckPos]]=[this.tileDeck[this.deckPos],this.tileDeck[idx]]; this.deckPos++; return {id,rot,meta,ex}; }
      }
    }
    return null;
  }

  _arriveEvent(dest, placed, dir){
    const ev={ moved:true, area:dest, placed, dir };
    if(dir==='D') ev.descended=dir; if(dir==='U') ev.ascended=dir;
    // chamber draw on first visit
    if((dest.type==='chamber'||dest.special) && dest.special!=='gateway' && !dest.visited){
      dest.visited=true;
      ev.chamber={ draws:this._chamberDraw(dest), firstVisit:true };
    } else {
      dest.visited=true;
      // revisit: hand back the persisted contents so the UI can show them
      if(dest.strangers.length||dest.treasure.length)
        ev.chamber={ draws:[...dest.strangers,...dest.treasure], firstVisit:false };
    }
    return ev;
  }

  /* ---- small-pack draw: count by depth (+ Tomb/Hall bonus), classified ---- */
  _chamberDraw(area){
    let count=Math.min(area.level,4);
    if(area.special==='tomb-of-kings') count+=1;
    if(area.special==='great-hall') count+=2;
    count=Math.min(count,8);
    const out=[];
    // an authored area may already carry a hand-set card (added at seed time); surface it first
    if(area.cardId && CARDS[area.cardId]) out.push({...CARDS[area.cardId], id:area.cardId});
    for(let i=out.length;i<count;i++){
      if(this.smallPos>=this.smallDeck.length) break;
      const id=this.smallDeck[this.smallPos++];
      out.push({...CARDS[id], id});
    }
    // persist creatures + treasure onto the chamber (hazards resolve & don't persist)
    out.forEach(c=>{
      const lane=cardLane(c);
      if(lane==='stranger'){ if(!area.strangers.some(s=>s.id===c.id)) area.strangers.push(c); }
      else if(lane==='treasure'){ if(!area.treasure.some(s=>s.id===c.id)) area.treasure.push(c); }
      else area.hazards.push(c);
    });
    return out;
  }
}
