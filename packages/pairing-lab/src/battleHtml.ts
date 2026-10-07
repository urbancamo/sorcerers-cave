// The standalone battle viewer: ONE self-contained HTML file (no network, no external files) that replays a battle round by round
// on a card table, using the game's own card art. `renderBattleHtml(battle, art)` returns the page as a string.
import type { Battle } from "./battle";
import type { CardArt } from "./cards";

const CSS = String.raw`
:root{
  --baize:#17342d; --baize-deep:#0f261f; --baize-lift:#21463c; --felt-line:#2f5c4f;
  --brass:#d1a54f; --brass-deep:#8d6a26; --oxblood:#a33a41; --oxblood-deep:#5e1d22;
  --ivory:#f4ecd6; --ivory-dim:#cdc4a9; --ash:#8a948d;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:"Avenir Next","Segoe UI",system-ui,-apple-system,sans-serif;
}
*{box-sizing:border-box}
html{background:var(--baize-deep)}
body{margin:0;color:var(--ivory);font:16px/1.5 var(--sans);
  background:radial-gradient(1200px 700px at 30% -10%,var(--baize-lift),var(--baize) 55%,var(--baize-deep));min-height:100vh}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
.wrap{max-width:1500px;margin:0 auto;padding:18px 22px 40px}

/* header */
.bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px 28px;padding-bottom:14px;border-bottom:1px solid var(--felt-line)}
.title h1{margin:0;font:700 34px/1.1 var(--serif);letter-spacing:.2px}
.title p{margin:4px 0 0;color:var(--ivory-dim)}
.verdict{font:600 20px/1.25 var(--serif);text-align:right}
.verdict small{display:block;font:400 14px/1.4 var(--sans);color:var(--ivory-dim)}
.verdict.party{color:var(--brass)} .verdict.strangers{color:#e08a90} .verdict.retreat{color:#e6c27a}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}
.chips li{border:1px solid var(--felt-line);border-radius:999px;padding:3px 12px;font-size:14px;color:var(--ivory-dim);background:rgba(0,0,0,.15)}
.chips li.on{color:var(--ivory);border-color:var(--brass-deep)}

/* controls */
.controls{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:16px 0 12px}
.tabs{display:flex;flex-wrap:wrap;gap:6px}
.tab{border:1px solid var(--felt-line);background:transparent;border-radius:6px;padding:6px 14px}
.tab:hover{background:var(--baize-lift)}
.tab[aria-current="step"]{background:var(--brass);color:#2a1d05;border-color:var(--brass);font-weight:700}
.transport{display:flex;gap:8px;align-items:center;margin-left:auto}
.btn{border:1px solid var(--brass-deep);background:rgba(0,0,0,.2);border-radius:6px;padding:6px 16px}
.btn:hover:not(:disabled){background:var(--brass-deep)}
.btn:disabled{opacity:.4;cursor:default}
.btn.primary{background:var(--brass);color:#2a1d05;border-color:var(--brass);font-weight:700}
.btn.primary:hover:not(:disabled){background:#e2b966}
select.btn{padding:6px 10px;color:var(--ivory);background:var(--baize-deep)} select.btn option{color:#1b1a14;background:var(--ivory)}

/* layout */
.stage{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:22px;align-items:start}
@media (max-width:1050px){.stage{grid-template-columns:minmax(0,1fr)}}

/* armies */
.army{border:1px solid var(--felt-line);border-radius:10px;padding:10px 12px 12px;background:rgba(0,0,0,.18)}
.army h2{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px;font:600 18px/1.2 var(--serif)}
.army h2 span{font:400 14px var(--sans);color:var(--ivory-dim)}
.army.strangers{border-top:3px solid var(--oxblood)} .army.party{border-top:3px solid var(--brass)}
.grid{display:flex;flex-wrap:wrap;gap:6px;--aw:60px}
.card{position:relative;width:var(--aw);aspect-ratio:7/10;padding:0;border:0;border-radius:5px;background:#222;overflow:hidden;
  box-shadow:0 2px 5px rgba(0,0,0,.5);transition:transform .35s ease,filter .35s ease,opacity .35s ease,box-shadow .25s ease}
.card img{display:block;width:100%;height:100%;object-fit:cover}
.card .face{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:6px;background:linear-gradient(160deg,#efe3c3,#cdbb8c);color:#2b2112;text-align:left}
.card .face b{font:700 12px/1.1 var(--serif)} .card .face i{font:700 20px/1 var(--serif);font-style:normal}
.card .gear{position:absolute;left:2px;right:2px;bottom:2px;display:flex;flex-wrap:wrap;gap:2px;pointer-events:none}
.card .gear em{font:700 9px/1 var(--sans);font-style:normal;background:rgba(15,38,31,.92);color:var(--brass);border:1px solid var(--brass-deep);border-radius:3px;padding:1px 3px}
.card .cross{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:700 calc(var(--aw)*.7)/1 var(--serif);color:rgba(214,70,78,.9);text-shadow:0 1px 4px #000}
.card.is-reserve{opacity:.6}
.card.is-fighting{box-shadow:0 0 0 2px var(--felt-line),0 2px 6px rgba(0,0,0,.6);opacity:1}
.card.is-fallen{filter:grayscale(1) brightness(.5);transform:rotate(-4deg) translateY(3px);opacity:.85}
.card.is-fallen .cross{display:flex}
.card.is-focus{transform:translateY(-6px);box-shadow:0 0 0 3px var(--ivory),0 8px 16px rgba(0,0,0,.65);opacity:1;z-index:2}
.card.is-picked{box-shadow:0 0 0 3px var(--brass),0 6px 14px rgba(0,0,0,.6)}
.card:hover{transform:translateY(-3px)} .card.is-fallen:hover{transform:rotate(-4deg) translateY(1px)}

/* the duel mat */
.mat{position:relative;margin:16px 0;border:2px solid var(--brass-deep);border-radius:14px;padding:16px 18px 18px;min-height:360px;
  background:radial-gradient(ellipse at 50% 40%,#27564a,#1a3f35 70%);box-shadow:inset 0 0 40px rgba(0,0,0,.45),0 6px 18px rgba(0,0,0,.35)}
.mat::before{content:"";position:absolute;inset:7px;border:1px solid rgba(209,165,79,.35);border-radius:9px;pointer-events:none}
.mat-head{display:flex;justify-content:space-between;color:var(--ivory-dim);font-size:14px;min-height:22px}
.duel{display:grid;grid-template-columns:minmax(0,1fr) 190px minmax(0,1fr);gap:10px;align-items:center;margin-top:6px}
.side{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:250px;justify-content:center}
.fronts{display:flex;justify-content:center;gap:0;padding:0 14px}
.fronts .big{--mw:124px;width:var(--mw);aspect-ratio:7/10;border-radius:7px;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.6);position:relative;background:#222;border:0;padding:0;
  transition:transform .4s ease,filter .4s ease}
.fronts .big+.big{margin-left:-34px}
.fronts .big img{width:100%;height:100%;object-fit:cover;display:block}
.fronts .big.is-fallen{filter:grayscale(1) brightness(.5);transform:rotate(-5deg) translateY(10px)}
.fronts .big .tuck{position:absolute;right:-1px;bottom:-1px;width:38%;aspect-ratio:7/10;border-radius:4px;overflow:hidden;box-shadow:-2px -2px 6px rgba(0,0,0,.6);border:1px solid var(--brass)}
.fronts .big .tuck img{width:100%;height:100%;object-fit:cover}
.fronts .big .tuck.plain{background:#14291f;color:var(--brass);font:700 10px/1.1 var(--sans);display:flex;align-items:center;justify-content:center;text-align:center;padding:2px}
.fronts .big .face{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:10px;background:linear-gradient(160deg,#efe3c3,#cdbb8c);color:#2b2112;text-align:left}
.fronts .big .face b{font:700 17px/1.1 var(--serif)} .fronts .big .face i{font:700 34px/1 var(--serif);font-style:normal}
.backers{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:300px}
.backers .small{--sw:52px;width:var(--sw);aspect-ratio:7/10;border-radius:4px;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,.55);position:relative;background:#222;border:0;padding:0}
.backers .small img{width:100%;height:100%;object-fit:cover}
.backers .small .face{position:absolute;inset:0;background:linear-gradient(160deg,#efe3c3,#cdbb8c);color:#2b2112;font:700 9px/1.1 var(--serif);padding:3px}
.backers-label{font-size:12px;color:var(--ivory-dim);width:100%;text-align:center}
.caption-name{font:600 15px/1.2 var(--serif);text-align:center}
.caption-name small{display:block;font:400 12px var(--sans);color:var(--ivory-dim)}
.centre{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.dice{display:flex;gap:18px;align-items:flex-end}
.die{width:54px;height:54px;border-radius:11px;position:relative;box-shadow:0 5px 10px rgba(0,0,0,.55),inset 0 -3px 0 rgba(0,0,0,.18);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:8px;gap:2px}
.die.white{background:#f6f1e1} .die.red{background:#b3262e}
.die i{border-radius:50%;background:transparent;align-self:center;justify-self:center;width:9px;height:9px}
.die.white i.on{background:#1d1a14} .die.red i.on{background:#f6ecd8}
.die.rolling{animation:tumble .6s ease-out}
@keyframes tumble{0%{transform:translateY(-26px) rotate(-200deg) scale(.7);opacity:.2}60%{transform:translateY(2px) rotate(20deg) scale(1.08);opacity:1}100%{transform:none}}
.sum{font:600 14px/1.3 var(--sans);display:grid;grid-template-columns:auto auto;gap:2px 14px;justify-content:center;color:var(--ivory-dim)}
.sum b{font:700 22px/1 var(--serif);color:var(--ivory)}
.sum .p b{color:var(--brass)} .sum .s b{color:#e58a91}
.verdictbox{font:700 20px/1.2 var(--serif);padding:6px 14px;border-radius:8px;border:1px solid transparent}
.verdictbox.P{color:#2a1d05;background:var(--brass)} .verdictbox.S{color:#fff;background:var(--oxblood)} .verdictbox.T{color:var(--ivory);border-color:var(--ash)}
.mat-note{margin:10px 0 0;text-align:center;color:var(--ivory-dim);font-size:15px}
.hero{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;text-align:center;gap:6px}
.mat>.hero{min-height:300px}
.hero .vs{font:700 52px/1 var(--serif)} .hero .vs span{color:var(--brass)} .hero .vs em{color:var(--ivory-dim);font-size:30px;font-style:normal;padding:0 14px}
.hero .vs span+em+span{color:#e58a91}
.hero p{margin:0;color:var(--ivory-dim);max-width:60ch}

/* sidebar */
.side-panel{display:flex;flex-direction:column;gap:14px}
.panel{border:1px solid var(--felt-line);border-radius:10px;padding:12px 14px;background:rgba(0,0,0,.18)}
.panel h3{margin:0 0 6px;font:600 17px/1.2 var(--serif)}
.story{font:17px/1.55 var(--serif)} .story p{margin:0 0 .6em} .story p:last-child{margin:0}
.story .P{color:var(--brass)} .story .S{color:#e58a91}
.mlist{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none}
.mlist button{width:34px;height:30px;border-radius:5px;border:1px solid var(--felt-line);background:rgba(0,0,0,.2);font:600 13px var(--sans)}
.mlist button.P{border-color:var(--brass-deep);color:var(--brass)} .mlist button.S{border-color:var(--oxblood);color:#e58a91} .mlist button.T{color:var(--ash)}
.mlist button.future{opacity:.35} .mlist button.now{background:var(--ivory);color:#1b1a14;border-color:var(--ivory)}
.insp{display:grid;grid-template-columns:96px 1fr;gap:12px}
.insp img,.insp .plain{width:96px;aspect-ratio:7/10;border-radius:5px;box-shadow:0 3px 8px rgba(0,0,0,.5);object-fit:cover;background:#cdbb8c;color:#2b2112;font:700 12px var(--serif);padding:6px}
.insp dl{margin:0;font-size:14px} .insp dt{font:600 16px var(--serif);margin-bottom:2px} .insp dd{margin:0 0 3px;color:var(--ivory-dim)}
.insp ul{margin:6px 0 0;padding-left:18px;color:var(--ivory-dim);font-size:13px}
.empty{color:var(--ivory-dim);margin:0}
details.rules summary{cursor:pointer;font:600 15px var(--serif)} details.rules ul{margin:8px 0 0;padding-left:18px;color:var(--ivory-dim);font-size:14px}
.foot{margin-top:26px;color:var(--ash);font-size:13px}
.result-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px;width:100%}
.result-grid div{border:1px solid var(--felt-line);border-radius:8px;padding:8px 10px;background:rgba(0,0,0,.2)}
.result-grid b{display:block;font:700 26px/1.1 var(--serif)} .result-grid span{color:var(--ivory-dim);font-size:13px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media (max-width:760px){.duel{grid-template-columns:minmax(0,1fr)}.centre{order:-1}.wrap{padding:12px}.title h1{font-size:27px}.verdict{text-align:left}.transport{margin-left:0}}
`;

const JS = String.raw`
(function () {
  var B = JSON.parse(document.getElementById("battle-data").textContent);
  var ART = JSON.parse(document.getElementById("art-data").textContent);
  var R = B.rounds.length;
  var state = { r: 0, k: 0, pick: null, playing: false, speed: 1 };
  var timer = null;
  var $ = function (id) { return document.getElementById(id); };
  var UNITS = { party: B.party, strangers: B.strangers };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function join(a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function unit(side, i) { return UNITS[side][i]; }
  function the(side, i) { return "the " + unit(side, i).name; }
  var NUMW = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  // "the Wizard", "the two Wizards": repeated creature types are grouped so the story does not say "the Wizard, the Wizard and the Wizard"
  function names(side, ids) {
    var order = [], count = {};
    ids.forEach(function (i) { var n = unit(side, i).name; if (!count[n]) { count[n] = 0; order.push(n); } count[n]++; });
    return order.map(function (n) { var c = count[n]; return c === 1 ? "the " + n : "the " + (NUMW[c] || String(c)) + " " + (/(ch|sh|s|x)$/.test(n) ? n + "es" : /[^aeiou]y$/.test(n) ? n.slice(0, -1) + "ies" : n + "s"); });
  }

  /* ----- who is standing at (round r, step k) ----- */
  function fallenSet(r, k) {
    var f = { party: {}, strangers: {} };
    for (var ri = 1; ri <= R; ri++) {
      if (ri > r) break;
      var ms = B.rounds[ri - 1].matches;
      var upto = ri < r ? ms.length : k;
      for (var m = 0; m < upto && m < ms.length; m++) ms[m].fallen.forEach(function (x) { f[x.side][x.idx] = { round: ri, match: m + 1 }; });
    }
    return f;
  }
  function engagedSet(r) {
    var e = { party: {}, strangers: {} };
    if (r < 1 || r > R) return e;
    B.rounds[r - 1].matches.forEach(function (m) {
      m.partyIdx.concat(m.partyBackIdx).forEach(function (i) { e.party[i] = 1; });
      m.strangersIdx.concat(m.strangersBackIdx).forEach(function (i) { e.strangers[i] = 1; });
    });
    return e;
  }
  function currentMatch() {
    if (state.r < 1 || state.r > R || state.k < 1) return null;
    return B.rounds[state.r - 1].matches[state.k - 1];
  }

  /* ----- cards ----- */
  function artFor(side, u, kind) {
    return kind === "t" ? ART.treasure[u.tid] : ART.creature[u.cid];
  }
  function faceEl(u) {
    var f = el("div", "face"); f.appendChild(el("b", null, u.name)); f.appendChild(el("i", null, String(u.total))); return f;
  }
  function cardImg(u, alt) {
    var src = ART.creature[u.cid];
    if (src) { var im = new Image(); im.src = src; im.alt = alt || u.name; return im; }
    return faceEl(u);
  }
  function smallCard(side, i, fallen, engaged, focus) {
    var u = unit(side, i);
    var b = el("button", "card");
    b.type = "button"; b.setAttribute("data-side", side); b.setAttribute("data-idx", String(i));
    b.setAttribute("aria-label", u.name + ", strength " + u.total + (u.gear.length ? ", carrying " + u.gear.map(function (g) { return g.name; }).join(" and ") : "") + (fallen ? ", fallen" : ""));
    b.title = u.name + " (" + u.total + ")" + (u.gear.length ? " - " + u.gear.map(function (g) { return g.name; }).join(", ") : "");
    b.appendChild(cardImg(u));
    if (u.gear.length || u.potion || u.elixir) {
      var g = el("span", "gear");
      u.gear.forEach(function (x) { g.appendChild(el("em", null, x.code)); });
      if (u.potion) g.appendChild(el("em", null, "POT"));
      if (u.elixir) g.appendChild(el("em", null, "ELX"));
      b.appendChild(g);
    }
    b.appendChild(el("span", "cross", "✕"));
    if (fallen) b.classList.add("is-fallen");
    else if (engaged === true) b.classList.add("is-fighting");
    else if (engaged === false) b.classList.add("is-reserve");
    if (focus) b.classList.add("is-focus");
    if (state.pick && state.pick.side === side && state.pick.idx === i) b.classList.add("is-picked");
    return b;
  }
  function armySize(n) { return n <= 8 ? 92 : n <= 14 ? 76 : n <= 22 ? 64 : n <= 32 ? 56 : 48; }

  function renderArmies() {
    var f = fallenSet(state.r, state.k);
    var eng = engagedSet(state.r);
    var m = currentMatch();
    var inRound = state.r >= 1 && state.r <= R;
    ["strangers", "party"].forEach(function (side) {
      var host = $(side + "-grid"); host.textContent = "";
      var list = UNITS[side];
      host.style.setProperty("--aw", armySize(list.length) + "px");
      var down = 0;
      list.forEach(function (u) {
        var fallen = !!f[side][u.idx]; if (fallen) down++;
        var engaged = inRound ? !!eng[side][u.idx] : null;
        var focus = !!m && (side === "party" ? m.partyIdx.concat(m.partyBackIdx) : m.strangersIdx.concat(m.strangersBackIdx)).indexOf(u.idx) >= 0;
        host.appendChild(smallCard(side, u.idx, fallen, engaged, focus));
      });
      $(side + "-count").textContent = (list.length - down) + " standing of " + list.length;
    });
  }

  /* ----- dice ----- */
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function die(n, colour, roll) {
    var d = el("div", "die " + colour + (roll ? " rolling" : ""));
    d.setAttribute("role", "img"); d.setAttribute("aria-label", colour === "white" ? "party die: " + n : "strangers die: " + n);
    for (var i = 0; i < 9; i++) { var p = el("i"); if (PIPS[n].indexOf(i) >= 0) p.className = "on"; d.appendChild(p); }
    return d;
  }

  /* ----- plain-English text ----- */
  function bonusParts(side, m, round) {
    var parts = [];
    if (side === "party") {
      if (B.meta.partyRing) parts.push({ n: 1, why: "the Ring" });
      if (B.meta.curses) parts.push({ n: -B.meta.curses, why: B.meta.curses > 1 ? "the curses" : "the curse" });
      return { parts: parts, total: m.partyBonus };
    }
    if (B.meta.strangerRing) parts.push({ n: 1, why: "the Ring" });
    if (round === 1 && B.meta.strangerSurprise) parts.push({ n: 1, why: "surprise" });
    return { parts: parts, total: m.strangerBonus };
  }
  function bonusText(side, m, round) {
    var b = bonusParts(side, m, round);
    var sum = b.parts.reduce(function (a, p) { return a + p.n; }, 0);
    if (b.total === 0) return "";
    if (sum !== b.total) return " and adds " + b.total;
    return (b.total > 0 ? " and adds " : " and takes off ") + Math.abs(b.total) + " for " + join(b.parts.map(function (p) { return p.why; }));
  }
  function roleText(side, m) {
    var fr = side === "party" ? m.partyIdx : m.strangersIdx, bk = side === "party" ? m.partyBackIdx : m.strangersBackIdx;
    var t = join(names(side, fr));
    if (bk.length) t += ", with " + join(names(side, bk)) + " behind the line";
    return t;
  }
  function fallText(f, m) {
    var who = the(f.side, f.idx), mine = f.side === "party" ? "party" : "strangers";
    if (f.nominated) {
      var nom = f.nominated;
      return "Two creatures lost together, so one falls. " + cap(mine) + "'s " + nom + " was nominated and the roll was " + f.roll + ", so " + who + " falls.";
    }
    return cap(who) + " falls.";
  }
  /* a paragraph is a list of segments: plain text, {b: bold text} or {c: class, t: text}; built with DOM nodes, never HTML strings */
  function seg(parent, x) {
    if (typeof x === "string") parent.appendChild(document.createTextNode(x));
    else if (x.b !== undefined) parent.appendChild(el("b", null, x.b));
    else parent.appendChild(el("span", x.c, x.t));
  }
  function fillStory(paras) {
    var host = $("story"); host.textContent = "";
    paras.forEach(function (segs) { var p = document.createElement("p"); segs.forEach(function (x) { seg(p, x); }); host.appendChild(p); });
  }
  function matchStory(m, round) {
    var res = m.result === "P" ? "The party wins the match." : m.result === "S" ? "The strangers win the match." : "A tie: nobody falls, and the match carries on next round.";
    var extra = m.fallen.map(function (f) { return fallText(f, m); }).concat(m.saved.map(function (s) { return cap(the(s.side, s.idx)) + " wears the Ring on level 4 or deeper, so it cannot be killed."; }));
    return [
      ["Match " + m.n + " of " + B.rounds[round - 1].matches.length + ". ", { b: cap(roleText("party", m)) }, " (strength " + m.partyStrength + ") against ", { b: roleText("strangers", m) }, " (strength " + m.strangerStrength + ")."],
      ["The party rolls a " + m.partyDie + bonusText("party", m, round) + ", making ", { c: "P", t: String(m.partyTotal) }, ". The strangers roll a " + m.strangerDie + bonusText("strangers", m, round) + ", making ", { c: "S", t: String(m.strangerTotal) }, "."],
      [res + (extra.length ? " " + extra.join(" ") : "")]
    ];
  }

  function roundSummary(r) {
    var rd = B.rounds[r - 1];
    var pf = 0, sf = 0;
    for (var i = 0; i < r; i++) B.rounds[i].matches.forEach(function (m) { m.fallen.forEach(function (x) { if (x.side === "party") pf++; else sf++; }); });
    return "End of round " + r + ": " + plural(rd.partyAlive.length, "party creature stands", "party creatures stand") + " (" + pf + " fallen so far) against " + plural(rd.strangersAlive.length, "stranger", "strangers") + " (" + sf + " fallen so far).";
  }
  function roundIntro(r) {
    var rd = B.rounds[r - 1];
    var prevP = r === 1 ? B.party.length : B.rounds[r - 2].partyAlive.length;
    var prevS = r === 1 ? B.strangers.length : B.rounds[r - 2].strangersAlive.length;
    var two = rd.matches.filter(function (m) { return m.partyIdx.length + m.strangersIdx.length > 2; }).length;
    var backed = rd.matches.filter(function (m) { return m.partyBackIdx.length + m.strangersBackIdx.length > 0; }).length;
    var surprise = rd.attacker === "strangers" && r === 1 && B.meta.strangerSurprise ? ", with the advantage of surprise: +1 to each of their rolls this round." : ".";
    var counts = plural(prevP, "party creature", "party creatures") + " face " + plural(prevS, "stranger", "strangers") + ". There are " + plural(rd.matches.length, "match", "matches") +
      (two ? ": " + plural(two, "match has", "matches have") + " a second fighter on one side" : "") +
      (backed ? (two ? ", and " : ": ") + plural(backed, "has", "have") + " casters behind the line adding their magic" : "") + ".";
    return [[{ b: "Round " + r + "." }, " The " + rd.attacker + " attack" + surprise], [counts], ["Press Next to play the matches one at a time."]];
  }
  function setupStory() {
    var cond = ["level " + B.meta.level];
    if (B.meta.curses) cond.push(plural(B.meta.curses, "curse", "curses") + " on the party");
    if (B.meta.eye) cond.push("the Eye of God in the area (it switches off magic and artefacts)");
    var bits = [];
    if (B.meta.partyRing) bits.push("The party carries the Ring: +1 to each of its rolls.");
    if (B.meta.strangerSurprise) bits.push("The strangers have surprise: +1 to each of their rolls in round 1 only.");
    return [
      [{ b: "The set-up." }, " " + plural(B.party.length, "party creature", "party creatures") + " meet " + plural(B.strangers.length, "stranger", "strangers") + " on " + join(cond) + "."],
      [bits.join(" ") || "Neither side has a bonus to its rolls."],
      ["Each match, both sides add their strength to a die roll; the higher total wins. Press Next to begin round 1, or click any card to see what it carries."]
    ];
  }
  function resultStory() {
    var m = B.meta;
    var head = m.end === "partyWin" ? "The party wins." : m.end === "strangersWin" ? "The strangers win." : m.end === "retreat" ? "The party retreats." : "The fight reaches the round limit.";
    var why = m.end === "partyWin" ? "Every stranger has fallen." : m.end === "strangersWin" ? "Every party creature has fallen." : m.end === "retreat" ? "Its strength fell below the retreat point, so it withdrew and the strangers hold the chamber." : "Neither side was wiped out.";
    return [[{ b: head }, " " + why], [plural(m.rounds, "round", "rounds") + " were fought. " + m.partyAlive + " of " + B.party.length + " party creatures and " + m.strangersAlive + " of " + B.strangers.length + " strangers are left. The party lost " + m.partyValueLost + " points of value; the strangers lost " + m.strangerValueLost + "."]];
  }

  /* ----- the duel mat ----- */
  function bigCard(side, i, fallen) {
    var u = unit(side, i);
    var b = el("button", "big" + (fallen ? " is-fallen" : ""));
    b.type = "button"; b.setAttribute("data-side", side); b.setAttribute("data-idx", String(i));
    b.setAttribute("aria-label", u.name + ", strength " + u.total);
    var src = ART.creature[u.cid];
    if (src) { var im = new Image(); im.src = src; im.alt = u.name; b.appendChild(im); } else b.appendChild(faceEl(u));
    u.gear.forEach(function (g, gi) {
      var t = el("span", "tuck"); t.title = g.name;
      t.style.right = (gi * 22 - 1) + "px"; t.style.bottom = (gi * 8 - 1) + "px";
      var ts = ART.treasure[g.tid];
      if (ts) { var ti = new Image(); ti.src = ts; ti.alt = g.name; t.appendChild(ti); } else { t.className += " plain"; t.textContent = g.code; }
      b.appendChild(t);
    });
    return b;
  }
  function smallBacker(side, i) {
    var u = unit(side, i);
    var b = el("button", "small"); b.type = "button"; b.title = u.name + " (magic " + u.mp + ")";
    b.setAttribute("data-side", side); b.setAttribute("data-idx", String(i));
    var src = ART.creature[u.cid];
    if (src) { var im = new Image(); im.src = src; im.alt = u.name; b.appendChild(im); } else { var f = el("div", "face", u.name); b.appendChild(f); }
    return b;
  }
  function sideEl(side, m, fallenNow, resultClass) {
    var fr = side === "party" ? m.partyIdx : m.strangersIdx, bk = side === "party" ? m.partyBackIdx : m.strangersBackIdx;
    var s = el("div", "side");
    var fronts = el("div", "fronts");
    fr.forEach(function (i) { fronts.appendChild(bigCard(side, i, !!fallenNow[side][i])); });
    s.appendChild(fronts);
    var nm = el("div", "caption-name", join(fr.map(function (i) { return unit(side, i).name; })));
    nm.appendChild(el("small", null, "strength " + (side === "party" ? m.partyStrength : m.strangerStrength)));
    s.appendChild(nm);
    if (bk.length) {
      var bkw = el("div", "backers");
      bkw.appendChild(el("div", "backers-label", "Casters behind the line"));
      bk.forEach(function (i) { bkw.appendChild(smallBacker(side, i)); });
      s.appendChild(bkw);
    }
    return s;
  }
  function renderMat() {
    var mat = $("mat"); mat.textContent = "";
    var head = el("div", "mat-head");
    var m = currentMatch();
    if (state.r === 0) {
      var duel0 = el("div", "duel");
      var topSide = function (side) {
        var s0 = el("div", "side"), fr = el("div", "fronts");
        UNITS[side].slice().sort(function (a, b) { return b.total - a.total || a.idx - b.idx; }).slice(0, 3).forEach(function (u) { fr.appendChild(bigCard(side, u.idx, false)); });
        s0.appendChild(fr);
        var cn = el("div", "caption-name", side === "party" ? "The party's strongest" : "The strangers' strongest");
        cn.appendChild(el("small", null, "total strength " + sumTotal(UNITS[side])));
        s0.appendChild(cn);
        return s0;
      };
      var mid = el("div", "centre hero");
      var vs = el("div", "vs"); vs.appendChild(el("span", null, String(B.party.length))); vs.appendChild(el("em", null, "against")); vs.appendChild(el("span", null, String(B.strangers.length)));
      mid.appendChild(vs);
      mid.appendChild(el("p", null, "Total strength " + sumTotal(B.party) + " against " + sumTotal(B.strangers) + "."));
      duel0.appendChild(topSide("party")); duel0.appendChild(mid); duel0.appendChild(topSide("strangers"));
      mat.appendChild(head); mat.appendChild(duel0); return;
    }
    if (state.r === R + 1) {
      var hh = el("div", "hero");
      hh.appendChild(el("div", "vs", B.meta.end === "partyWin" ? "Party wins" : B.meta.end === "strangersWin" ? "Strangers win" : B.meta.end === "retreat" ? "Party retreats" : "Round limit"));
      var grid = el("div", "result-grid");
      [[String(B.meta.rounds), "rounds fought"], [B.meta.partyAlive + " / " + B.party.length, "party standing"], [B.meta.strangersAlive + " / " + B.strangers.length, "strangers standing"],
       [String(B.meta.partyValueLost), "party value lost"], [String(B.meta.strangerValueLost), "strangers' value lost"], [B.meta.r1.toFixed(3), "strangers' share of round 1 matches"]].forEach(function (p) {
        var d = el("div"); d.appendChild(el("b", null, p[0])); d.appendChild(el("span", null, p[1])); grid.appendChild(d);
      });
      hh.appendChild(grid); mat.appendChild(head); mat.appendChild(hh); return;
    }
    var rd = B.rounds[state.r - 1];
    head.appendChild(el("span", null, "Round " + state.r + ": the " + rd.attacker + " attack"));
    head.appendChild(el("span", null, m ? "Match " + m.n + " of " + rd.matches.length : plural(rd.matches.length, "match", "matches") + " this round"));
    mat.appendChild(head);
    if (!m) {
      var h2 = el("div", "hero");
      h2.appendChild(el("div", "vs", "Round " + state.r));
      h2.appendChild(el("p", null, "The " + rd.attacker + " attack. " + plural(rd.matches.length, "match", "matches") + " are about to be fought. Press Next, or pick a match number on the right."));
      mat.appendChild(h2); return;
    }
    var fallenNow = fallenSet(state.r, state.k);
    // creatures that fell in THIS match are shown as fallen on the mat
    var duel = el("div", "duel");
    duel.appendChild(sideEl("party", m, fallenNow));
    var c = el("div", "centre");
    var dice = el("div", "dice"); dice.id = "dice";
    dice.appendChild(die(m.partyDie, "white", state.animate)); dice.appendChild(die(m.strangerDie, "red", state.animate));
    c.appendChild(dice);
    var sum = el("div", "sum");
    var p = el("div", "p"); p.appendChild(document.createTextNode(m.partyStrength + " + " + m.partyDie + (m.partyBonus ? " " + (m.partyBonus > 0 ? "+ " : "- ") + Math.abs(m.partyBonus) : "") + " = ")); p.appendChild(el("b", null, String(m.partyTotal)));
    var s = el("div", "s"); s.appendChild(document.createTextNode(m.strangerStrength + " + " + m.strangerDie + (m.strangerBonus ? " " + (m.strangerBonus > 0 ? "+ " : "- ") + Math.abs(m.strangerBonus) : "") + " = ")); s.appendChild(el("b", null, String(m.strangerTotal)));
    sum.appendChild(p); sum.appendChild(s); c.appendChild(sum);
    c.appendChild(el("div", "verdictbox " + m.result, m.result === "P" ? "Party wins" : m.result === "S" ? "Strangers win" : "Tie"));
    duel.appendChild(c);
    duel.appendChild(sideEl("strangers", m, fallenNow));
    mat.appendChild(duel);
    mat.appendChild(el("p", "mat-note", "strength + die + bonus = total; the higher total wins"));
  }
  function sumTotal(list) { return list.reduce(function (a, u) { return a + u.total; }, 0); }

  /* ----- sidebar ----- */
  function renderStory() {
    var paras;
    if (state.r === 0) paras = setupStory();
    else if (state.r === R + 1) paras = resultStory();
    else {
      var m = currentMatch();
      if (!m) paras = roundIntro(state.r);
      else {
        paras = matchStory(m, state.r);
        if (state.k === B.rounds[state.r - 1].matches.length) paras.push([roundSummary(state.r)]);
      }
    }
    fillStory(paras);
  }
  function renderList() {
    var host = $("mlist"); host.textContent = "";
    var title = $("mlist-title");
    if (state.r < 1 || state.r > R) { $("matches-panel").hidden = true; return; }
    $("matches-panel").hidden = false;
    var rd = B.rounds[state.r - 1];
    title.textContent = "Round " + state.r + " matches";
    rd.matches.forEach(function (m) {
      var li = document.createElement("li");
      var b = el("button", m.result + (m.n > state.k ? " future" : "") + (m.n === state.k ? " now" : ""), String(m.n));
      b.type = "button"; b.setAttribute("data-match", String(m.n));
      b.title = "Match " + m.n + ": " + (m.result === "P" ? "party won" : m.result === "S" ? "strangers won" : "tie");
      b.setAttribute("aria-label", b.title);
      li.appendChild(b); host.appendChild(li);
    });
  }
  function renderInspector() {
    var host = $("insp"); host.textContent = "";
    if (!state.pick) { host.appendChild(el("p", "empty", "Click any card to see its strength, what it carries, and what happened to it.")); return; }
    var u = unit(state.pick.side, state.pick.idx);
    var w = el("div", "insp");
    var src = ART.creature[u.cid];
    if (src) { var im = new Image(); im.src = src; im.alt = u.name; w.appendChild(im); } else w.appendChild(el("div", "plain", u.name));
    var dl = el("dl");
    dl.appendChild(el("dt", null, u.name + (state.pick.side === "party" ? " (party)" : " (stranger)")));
    dl.appendChild(el("dd", null, "Strength " + u.total + (u.mp ? ": " + u.fs + " fighting + " + u.mp + " magic" : "") + "; worth " + u.points + (u.points === 1 ? " point" : " points") + "."));
    var carry = u.gear.map(function (g) { return g.name; });
    if (u.potion) carry.push("a Strength Potion"); if (u.elixir) carry.push("the Elixir (+2)"); if (u.dragonKills) carry.push(plural(u.dragonKills, "dragon slain", "dragons slain"));
    dl.appendChild(el("dd", null, carry.length ? "Carries: " + join(carry) + "." : "Carries nothing that matters in a fight."));
    w.appendChild(dl);
    host.appendChild(w);
    var hist = el("ul");
    B.rounds.forEach(function (rd) {
      rd.matches.forEach(function (m) {
        var mine = state.pick.side === "party" ? m.partyIdx.concat(m.partyBackIdx) : m.strangersIdx.concat(m.strangersBackIdx);
        if (mine.indexOf(state.pick.idx) < 0) return;
        var won = (state.pick.side === "party" && m.result === "P") || (state.pick.side === "strangers" && m.result === "S");
        var fell = m.fallen.some(function (f) { return f.side === state.pick.side && f.idx === state.pick.idx; });
        var li = el("li", null, "Round " + rd.n + ", match " + m.n + ": " + (m.result === "T" ? "tied" : won ? "won" : "lost") + (fell ? " and fell" : ""));
        hist.appendChild(li);
      });
    });
    if (!hist.childNodes.length) hist.appendChild(el("li", null, "Did not fight."));
    host.appendChild(hist);
  }

  /* ----- header and controls ----- */
  function renderTabs() {
    var host = $("tabs"); host.textContent = "";
    var mk = function (label, r) {
      var b = el("button", "tab", label); b.type = "button"; b.setAttribute("data-r", String(r));
      if (state.r === r) b.setAttribute("aria-current", "step");
      host.appendChild(b);
    };
    mk("Set-up", 0);
    for (var r = 1; r <= R; r++) mk("Round " + r, r);
    mk("Result", R + 1);
  }
  function maxStep(r) { return r >= 1 && r <= R ? B.rounds[r - 1].matches.length : 0; }
  function renderControls() {
    $("back").disabled = state.r === 0;
    $("next").disabled = state.r === R + 1;
    $("play").textContent = state.playing ? "Pause" : "Play";
    $("play").classList.toggle("primary", !state.playing);
  }
  function renderAll() { renderTabs(); renderArmies(); renderMat(); renderStory(); renderList(); renderInspector(); renderControls(); state.animate = false; }

  function go(r, k, animate) { state.r = r; state.k = k; state.animate = !!animate; renderAll(); }
  function next() {
    if (state.r === 0) return go(1, 0, false);
    if (state.r === R + 1) return stop();
    if (state.k < maxStep(state.r)) return go(state.r, state.k + 1, true);
    if (state.r < R) return go(state.r + 1, 0, false);
    go(R + 1, 0, false);
  }
  function back() {
    if (state.r === 0) return;
    if (state.r === R + 1) return go(R, maxStep(R), false);
    if (state.k > 0) return go(state.r, state.k - 1, false);
    if (state.r === 1) return go(0, 0, false);
    go(state.r - 1, maxStep(state.r - 1), false);
  }
  function stop() { state.playing = false; if (timer) { clearTimeout(timer); timer = null; } renderControls(); }
  function tick() {
    if (!state.playing) return;
    next();
    if (state.r === R + 1) return stop();
    var delay = (state.k === 0 ? 1600 : 2200) / state.speed;
    timer = setTimeout(tick, delay);
  }
  function play() {
    if (state.playing) return stop();
    if (state.r === R + 1) go(0, 0, false);
    state.playing = true; renderControls();
    timer = setTimeout(tick, 400);
  }

  /* ----- wiring ----- */
  document.addEventListener("click", function (e) {
    var t = e.target; while (t && t !== document && !(t.getAttribute && (t.getAttribute("data-r") !== null || t.getAttribute("data-match") !== null || t.getAttribute("data-idx") !== null))) t = t.parentNode;
    if (!t || t === document) return;
    if (t.getAttribute("data-r") !== null) { stop(); return go(Number(t.getAttribute("data-r")), 0, false); }
    if (t.getAttribute("data-match") !== null) { stop(); return go(state.r, Number(t.getAttribute("data-match")), true); }
    if (t.getAttribute("data-idx") !== null) { state.pick = { side: t.getAttribute("data-side"), idx: Number(t.getAttribute("data-idx")) }; renderArmies(); renderInspector(); }
  });
  $("next").addEventListener("click", function () { stop(); next(); });
  $("back").addEventListener("click", function () { stop(); back(); });
  $("play").addEventListener("click", play);
  $("speed").addEventListener("change", function (e) { state.speed = Number(e.target.value); });
  document.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "SELECT" || e.target.tagName === "INPUT")) return;
    if (e.key === "ArrowRight") { stop(); next(); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { stop(); back(); e.preventDefault(); }
    else if (e.key === "Home") { stop(); go(0, 0, false); e.preventDefault(); }
    else if (e.key === "End") { stop(); go(R + 1, 0, false); e.preventDefault(); }
    else if (e.key === " " && !(e.target && e.target.tagName === "BUTTON")) { play(); e.preventDefault(); }
  });
  var hover = function (e) {
    var t = e.target; if (!t.getAttribute || t.getAttribute("data-match") === null) return;
    var rd = B.rounds[state.r - 1]; if (!rd) return;
    var m = rd.matches[Number(t.getAttribute("data-match")) - 1]; if (!m) return;
    var on = e.type === "mouseover";
    var set = function (side, ids) { ids.forEach(function (i) { var c = document.querySelector('#' + side + '-grid .card[data-idx="' + i + '"]'); if (c) c.classList.toggle("is-focus", on); }); };
    set("party", m.partyIdx.concat(m.partyBackIdx)); set("strangers", m.strangersIdx.concat(m.strangersBackIdx));
    if (!on) renderArmies();
  };
  document.addEventListener("mouseover", hover); document.addEventListener("mouseout", hover);

  window.__battle = { go: go, next: next, back: back, state: state };
  renderAll();
})();
`;

const RULES = [
  "Each side adds up its strength, rolls one die, and adds its bonus. The higher total wins.",
  "A lone loser dies. If two creatures lost together, one of them falls: the loser's nominated creature on a roll of 4 to 6 (for the strangers, as Peter's text is written, the nominated one is spared on 4 to 6).",
  "A tie changes nothing: the match carries on next round.",
  "The side with more creatures can send its spares in as second fighters (never two against two), or stand casters behind the line to add their magic.",
  "The roles alternate: the strangers attack in round 1 and the party in round 2.",
];

const json = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");

export function renderBattleHtml(battle: Battle, art: CardArt): string {
  const m = battle.meta;
  const who = m.end === "partyWin" ? "party" : m.end === "strangersWin" ? "strangers" : m.end === "retreat" ? "retreat" : "cap";
  const verdict = m.end === "partyWin" ? "The party wins" : m.end === "strangersWin" ? "The strangers win" : m.end === "retreat" ? "The party retreats" : "Round limit reached";
  const chips: [string, boolean][] = [
    [`Level ${m.level}`, false],
    [`${battle.party.length} party against ${battle.strangers.length} strangers`, false],
    ...(m.strangerSurprise ? [["Strangers have surprise (+1, round 1)", true] as [string, boolean]] : []),
    ...(m.partyRing ? [["Party wears the Ring (+1)", true] as [string, boolean]] : []),
    ...(m.strangerRing ? [["Strangers wear the Ring (+1)", true] as [string, boolean]] : []),
    ...(m.curses ? [[`${m.curses} curse${m.curses > 1 ? "s" : ""} on the party`, true] as [string, boolean]] : []),
    ...(m.eye ? [["Eye of God present", true] as [string, boolean]] : []),
  ];
  const deck = m.deck === "kit" ? "extension kit" : "base deck";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>Scenario ${m.scenarioId} - battle replay</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="bar">
    <div class="title">
      <h1>Scenario ${m.scenarioId}</h1>
      <p>From run ${esc(m.runId)}, ${deck}, seed ${m.seed}. The party plays ${esc(m.partyStyle)}, the strangers ${esc(m.strangerStyle)}.</p>
    </div>
    <div class="verdict ${who}">${verdict}<small>${m.rounds} round${m.rounds === 1 ? "" : "s"}; ${m.partyAlive} of ${battle.party.length} party creatures left</small></div>
  </header>
  <ul class="chips">${chips.map(([t, on]) => `<li${on ? ' class="on"' : ""}>${esc(t)}</li>`).join("")}</ul>

  <div class="controls">
    <nav class="tabs" id="tabs" aria-label="Rounds"></nav>
    <div class="transport">
      <button class="btn" id="back" type="button">Back</button>
      <button class="btn primary" id="play" type="button">Play</button>
      <button class="btn" id="next" type="button">Next</button>
      <select class="btn" id="speed" aria-label="Play speed"><option value="0.6">Slow</option><option value="1" selected>Normal</option><option value="2">Fast</option></select>
    </div>
  </div>

  <div class="stage">
    <div>
      <section class="army strangers"><h2>Strangers <span id="strangers-count"></span></h2><div class="grid" id="strangers-grid"></div></section>
      <section class="mat" id="mat" aria-live="polite"></section>
      <section class="army party"><h2>The party <span id="party-count"></span></h2><div class="grid" id="party-grid"></div></section>
    </div>
    <aside class="side-panel">
      <section class="panel"><h3>What happens</h3><div class="story" id="story" aria-live="polite"></div></section>
      <section class="panel" id="matches-panel"><h3 id="mlist-title">Matches</h3><ul class="mlist" id="mlist"></ul></section>
      <section class="panel"><h3>Card</h3><div id="insp"></div></section>
      <section class="panel"><details class="rules"><summary>How a match works</summary><ul>${RULES.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details></section>
    </aside>
  </div>
  <p class="foot">A simulated battle under the pairing lab's default rules, not a recorded game. Arrow keys step, space plays, Home and End jump to the start and the result.</p>
  <noscript><p>This page needs JavaScript to step through the battle.</p></noscript>
</div>
<script type="application/json" id="battle-data">${json(battle)}</script>
<script type="application/json" id="art-data">${json(art)}</script>
<script>${JS}</script>
</body>
</html>
`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
