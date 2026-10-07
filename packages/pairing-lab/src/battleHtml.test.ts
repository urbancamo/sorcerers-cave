// @vitest-environment node
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { simulateRun, type Run } from "./runlog";
import { buildBattle, type Battle } from "./battle";
import { renderBattleHtml } from "./battleHtml";
import type { CardArt } from "./cards";

const run = simulateRun({ id: "viewer", deck: "kit", generator: "balanced", seed: 900, count: 40, partyStyle: "GRD", strangerStyle: "GRD" });
const multi = run.scenarios.find((r) => r.outcome.rounds >= 3 && r.scenario.party.length + r.scenario.strangers.length >= 12)!;
const battle: Battle = buildBattle(run, multi.id);
const noArt: CardArt = { creature: {}, treasure: {} };
const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const art: CardArt = { creature: Object.fromEntries([...battle.party, ...battle.strangers].map((u) => [u.cid, PIXEL])), treasure: Object.fromEntries([...battle.party, ...battle.strangers].flatMap((u) => u.gear.map((g) => [g.tid, PIXEL]))) };

const open = (b: Battle, a: CardArt) => new JSDOM(renderBattleHtml(b, a), { runScripts: "dangerously", pretendToBeVisual: true });
const text = (d: JSDOM, sel: string) => d.window.document.querySelector(sel)?.textContent ?? "";
const click = (d: JSDOM, el: Element | null) => { expect(el).not.toBeNull(); el!.dispatchEvent(new d.window.MouseEvent("click", { bubbles: true })); };
const fallenCount = (d: JSDOM, side: string) => d.window.document.querySelectorAll(`#${side}-grid .card.is-fallen`).length;
const stepsIn = (b: Battle) => b.rounds.reduce((n, r) => n + r.matches.length, 0);

describe("the page is a single self-contained file", () => {
  const html = renderBattleHtml(battle, art);
  it("is a complete HTML document with no external requests", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<link\b(?![^>]*href="data:)/i);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/(src|href)=["']https?:/i);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/i);
    expect(html).toContain("<title>Scenario " + multi.id + " - battle replay</title>");
  });
  it("embeds the battle and the art as JSON that round-trips exactly", () => {
    const dom = new JSDOM(html);
    const d = dom.window.document;
    expect(JSON.parse(d.getElementById("battle-data")!.textContent!)).toEqual(battle);
    expect(JSON.parse(d.getElementById("art-data")!.textContent!)).toEqual(art);
  });
  it("cannot be broken out of by hostile text in the data", () => {
    const evil: Run = JSON.parse(JSON.stringify(run));
    evil.run.id = `x</script><img src=x onerror=alert(1)><script>`;
    const b = buildBattle(evil, multi.id);
    const h = renderBattleHtml(b, noArt);
    expect(h).not.toContain("</script><img");
    const dom = new JSDOM(h, { runScripts: "dangerously" });
    expect(dom.window.document.querySelectorAll("img[onerror]").length).toBe(0);
    expect(JSON.parse(dom.window.document.getElementById("battle-data")!.textContent!).meta.runId).toBe(evil.run.id);
    expect(dom.window.document.querySelector(".title p")!.textContent).toContain("</script>");   // shown as text, not parsed as markup
  });
});

describe("the interactive viewer", () => {
  it("opens on the set-up, with a tab for the set-up, each round and the result", () => {
    const d = open(battle, art);
    expect(d.window.document.querySelectorAll("#tabs .tab").length).toBe(battle.rounds.length + 2);
    expect(d.window.document.querySelector('#tabs .tab[aria-current="step"]')!.textContent).toBe("Set-up");
    expect(text(d, "#story")).toContain("The set-up.");
    expect(d.window.document.querySelectorAll("#party-grid .card").length).toBe(battle.party.length);
    expect(d.window.document.querySelectorAll("#strangers-grid .card").length).toBe(battle.strangers.length);
    expect(fallenCount(d, "party") + fallenCount(d, "strangers")).toBe(0);
    expect((d.window.document.getElementById("back") as HTMLButtonElement).disabled).toBe(true);
  });
  it("the set-up shows each side's three strongest cards, and the total strengths", () => {
    const d = open(battle, art);
    const mat = d.window.document.getElementById("mat")!;
    const shown = [...mat.querySelectorAll(".big")].map((b) => Number(b.getAttribute("data-idx")));
    expect(shown.length).toBe(6);
    const top = (list: typeof battle.party) => list.slice().sort((a, b) => b.total - a.total).slice(0, 3).map((u) => u.idx).sort((a, b) => a - b);
    const side = (s: string) => [...mat.querySelectorAll(`.big[data-side="${s}"]`)].map((b) => Number(b.getAttribute("data-idx"))).sort((a, b) => a - b);
    expect(side("party")).toEqual(top(battle.party));
    expect(side("strangers")).toEqual(top(battle.strangers));
    expect(mat.textContent).toContain(String(battle.party.reduce((a, u) => a + u.total, 0)));
  });
  it("Next steps through every match, then the result; Back undoes it", () => {
    const d = open(battle, art), w = d.window as unknown as { __battle: { next(): void; back(): void; state: { r: number; k: number } } };
    const seen: string[] = [];
    for (let i = 0; i < stepsIn(battle) + battle.rounds.length + 5; i++) {
      click(d, d.window.document.getElementById("next"));
      seen.push(`${w.__battle.state.r}.${w.__battle.state.k}`);
      if (w.__battle.state.r === battle.rounds.length + 1) break;
    }
    expect(w.__battle.state.r).toBe(battle.rounds.length + 1);
    expect(text(d, "#story")).toMatch(/wins\.|retreats\.|round limit/);
    // every match was visited, in order
    for (const r of battle.rounds) for (const m of r.matches) expect(seen).toContain(`${r.n}.${m.n}`);
    click(d, d.window.document.getElementById("back"));
    expect(w.__battle.state.r).toBe(battle.rounds.length);
    expect(w.__battle.state.k).toBe(battle.rounds[battle.rounds.length - 1]!.matches.length);
  });
  it("the cards that have fallen match the battle at every step, and at the end the recorded survivors", () => {
    const d = open(battle, art), w = d.window as unknown as { __battle: { go(r: number, k: number): void } };
    let party = 0, strangers = 0;
    for (const r of battle.rounds) {
      for (const m of r.matches) {
        for (const f of m.fallen) f.side === "party" ? party++ : strangers++;
        w.__battle.go(r.n, m.n);
        expect(fallenCount(d, "party")).toBe(party);
        expect(fallenCount(d, "strangers")).toBe(strangers);
      }
    }
    expect(battle.party.length - party).toBe(battle.meta.partyAlive);
    expect(battle.strangers.length - strangers).toBe(battle.meta.strangersAlive);
  });
  it("shows the match on the mat: the dice, the totals, the verdict, and the story in plain English", () => {
    const d = open(battle, art), w = d.window as unknown as { __battle: { go(r: number, k: number): void } };
    const m = battle.rounds[0]!.matches[0]!;
    w.__battle.go(1, 1);
    expect(d.window.document.querySelectorAll("#mat .die").length).toBe(2);
    expect(d.window.document.querySelectorAll("#mat .die.white i.on").length).toBe(m.partyDie);
    expect(d.window.document.querySelectorAll("#mat .die.red i.on").length).toBe(m.strangerDie);
    expect(text(d, "#mat .sum")).toContain(String(m.partyTotal));
    expect(text(d, "#mat .sum")).toContain(String(m.strangerTotal));
    expect(text(d, "#mat .verdictbox")).toBe(m.result === "P" ? "Party wins" : m.result === "S" ? "Strangers win" : "Tie");
    expect(text(d, "#story")).toContain(`Match 1 of ${battle.rounds[0]!.matches.length}.`);
    expect(text(d, "#story")).toContain(`making ${m.partyTotal}`);
  });
  it("a tab or a match number jumps straight there", () => {
    const d = open(battle, art), w = d.window as unknown as { __battle: { state: { r: number; k: number } } };
    click(d, d.window.document.querySelector(`#tabs .tab[data-r="2"]`));
    expect(w.__battle.state).toMatchObject({ r: 2, k: 0 });
    expect(text(d, "#story")).toContain("Round 2.");
    click(d, d.window.document.querySelector('#mlist button[data-match="2"]'));
    expect(w.__battle.state).toMatchObject({ r: 2, k: 2 });
  });
  it("clicking a card shows what it is, what it carries and what happened to it", () => {
    const d = open(battle, art);
    const first = d.window.document.querySelector("#strangers-grid .card");
    click(d, first);
    const u = battle.strangers[0]!;
    expect(text(d, "#insp dt")).toContain(u.name);
    expect(text(d, "#insp")).toMatch(/Strength \d+/);
    expect(d.window.document.querySelector("#strangers-grid .card.is-picked")).not.toBeNull();
  });
  it("arrow keys step, Home and End jump", () => {
    const d = open(battle, art), w = d.window as unknown as { __battle: { state: { r: number; k: number } } };
    const key = (k: string) => d.window.document.dispatchEvent(new d.window.KeyboardEvent("keydown", { key: k, bubbles: true }));
    key("ArrowRight"); expect(w.__battle.state.r).toBe(1);
    key("End"); expect(w.__battle.state.r).toBe(battle.rounds.length + 1);
    key("ArrowLeft"); expect(w.__battle.state.r).toBe(battle.rounds.length);
    key("Home"); expect(w.__battle.state.r).toBe(0);
  });
  it("uses the card pictures when it has them, and draws plain cards when it has not", () => {
    const withArt = open(battle, art), without = open(battle, noArt);
    expect(withArt.window.document.querySelectorAll("#party-grid .card img").length).toBe(battle.party.length);
    expect(without.window.document.querySelectorAll("#party-grid .card img").length).toBe(0);
    expect(without.window.document.querySelectorAll("#party-grid .card .face").length).toBe(battle.party.length);
    click(without, without.window.document.getElementById("next"));
    click(without, without.window.document.getElementById("next"));
    expect(without.window.document.querySelectorAll("#mat .big").length).toBeGreaterThan(0);
  });
  it("describes the conditions (surprise, the Ring, curses) that applied", () => {
    const d = open(battle, art);
    const chips = [...d.window.document.querySelectorAll(".chips li")].map((x) => x.textContent!);
    expect(chips.some((c) => c.startsWith("Level "))).toBe(true);
    if (battle.meta.strangerSurprise) expect(chips.some((c) => c.includes("surprise"))).toBe(true);
    if (battle.meta.partyRing) expect(chips.some((c) => c.includes("Ring"))).toBe(true);
  });
  it("groups repeated creatures in the story ('three Wizards') instead of repeating them", () => {
    // find a battle in the run whose matches have the same creature type more than once on a side
    const dup = (b: Battle) => b.rounds.some((r) => r.matches.some((m) => {
      const names = (side: "party" | "strangers", ids: number[]) => ids.map((i) => (side === "party" ? b.party : b.strangers)[i]!.name);
      return [names("party", m.partyIdx), names("party", m.partyBackIdx), names("strangers", m.strangersIdx), names("strangers", m.strangersBackIdx)].some((l) => new Set(l).size < l.length);
    }));
    const found = run.scenarios.map((r) => buildBattle(run, r.id)).find(dup);
    expect(found, "a battle with repeated creatures on one side").toBeDefined();
    const d = open(found!, art), w = d.window as unknown as { __battle: { go(r: number, k: number): void } };
    for (const r of found!.rounds) for (const m of r.matches) {
      w.__battle.go(r.n, m.n);
      const story = text(d, "#story");
      expect(story).not.toMatch(/\bthe (\w+)(?:, the \1\b| and the \1\b)/);
    }
    // somewhere the grouped form appears
    let grouped = false;
    for (const r of found!.rounds) for (const m of r.matches) { w.__battle.go(r.n, m.n); if (/\b(two|three|four|five|six|seven|eight|nine) [A-Z][a-z]+s\b/.test(text(d, "#story"))) grouped = true; }
    expect(grouped).toBe(true);
  });
  it("never writes HTML from data (no innerHTML)", () => {
    expect(renderBattleHtml(battle, art)).not.toContain("innerHTML");
  });
});
