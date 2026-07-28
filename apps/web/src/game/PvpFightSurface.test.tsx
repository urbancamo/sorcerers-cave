import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DIR_N, newGame, type PvpSession, type PvpView } from "@sorcerers-cave/engine";
import { PvpFightSurface } from "./PvpFightSurface";

// Card art in jsdom: resolve every creature to a stub file so the art-chip test can assert real
// <img> rendering (the other tests exercise the no-art text fallback via the loadManifest catch).
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ cards: [] }),
  resolveCardVariant: (cat: string, id: number, copy: number) =>
    cat === "creature" ? { file: `/c${id}-${copy}.png` } : null,
}));

// Two seats: Green Wyrms (seat 0) vs Red Talons (seat 1). The viewing seat's party is a
// newGame(1, [6, 4]) — Woman (idx 0, a fighter) + Priest (idx 1, a caster), as in FightSurface tests.
const parties = [
  { seat: 0, name: "Green Wyrms", color: "green" },
  { seat: 1, name: "Red Talons", color: "red" },
];

const session = (over: Partial<PvpSession> = {}): PvpSession => ({
  kind: "pvp", area: 0, attacker: [1], defender: [0],
  round: 1, activeSide: "attacker", surprise: 0,
  stage: "defenderLine", defenderLine: [], engagements: [], attackerBackers: [], defenderBackers: [],
  window: { seat: 0, deadline: Date.now() + 45_000, kind: "pvpLayout" },
  stopProposedBy: null, ...over,
});

describe("PvpFightSurface (spec I-10)", () => {
  it("defender lays the line: every member by default, casters may be held back", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface session={session()} pvp={null} youSeat={0} parties={parties}
        yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    expect(screen.getByText(/you are the defender/i)).toBeInTheDocument();
    // The Woman (a fighter) is locked into the line; only the ✦ Priest can be toggled out.
    expect(screen.getByTestId("pvp-line-0:0")).toBeDisabled();

    fireEvent.click(screen.getByTestId("pvp-submit"));
    expect(dispatch).toHaveBeenCalledWith({ type: "pvpLine", line: ["0:0", "0:1"] });

    // Hold the Priest back — the submitted line shrinks to the fighters, with the outnumber caveat shown.
    fireEvent.click(screen.getByTestId("pvp-line-0:1"));
    expect(screen.getByText(/only while your command outnumbers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pvp-submit"));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "pvpLine", line: ["0:0"] });
  });

  it("attacker builds a 1v1 engagement by tapping a fighter onto a line member and submits", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface
        session={session({ attacker: [0], defender: [1], stage: "attackerEngage", defenderLine: ["1:0"],
          window: { seat: 0, deadline: Date.now() + 45_000, kind: "pvpLayout" } })}
        pvp={null} youSeat={0} parties={parties} yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    expect(screen.getByText(/you are the attacker/i)).toBeInTheDocument();
    const submit = screen.getByTestId("pvp-submit");
    expect(submit).toBeDisabled(); // nothing engaged yet

    fireEvent.click(screen.getByTestId("pvp-tray-0:0"));  // pick the Woman
    fireEvent.click(screen.getByTestId("pvp-front-0"));   // send her against the line member
    expect(within(screen.getByTestId("pvp-front-0")).getByTestId("pvp-set-0:0")).toBeInTheDocument();

    expect(submit).not.toBeDisabled(); // the whole line is engaged — spare fighters may stand down
    fireEvent.click(submit);
    expect(dispatch).toHaveBeenCalledWith({
      type: "pvpEngage",
      engagements: [{ attackers: ["0:0"], defenders: ["1:0"] }],
      backers: [],
    });
  });

  it("attacker with the advantage can back the engagement with a caster", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface
        session={session({ attacker: [0], defender: [1], stage: "attackerEngage", defenderLine: ["1:0"],
          window: { seat: 0, deadline: Date.now() + 45_000, kind: "pvpLayout" } })}
        pvp={null} youSeat={0} parties={parties} yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    fireEvent.click(screen.getByTestId("pvp-tray-0:0")); // the Woman fights
    fireEvent.click(screen.getByTestId("pvp-front-0"));
    fireEvent.click(screen.getByTestId("pvp-tray-0:1")); // the Priest backs from behind (2 vs 1 line)
    fireEvent.click(screen.getByTestId("pvp-back-0"));
    fireEvent.click(screen.getByTestId("pvp-submit"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "pvpEngage",
      engagements: [{ attackers: ["0:0"], defenders: ["1:0"] }],
      backers: [{ caster: "0:1", at: 0 }],
    });
  });

  it("defender assigns a background caster to an engagement (step 3)", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface
        session={session({ stage: "defenderCasters", defenderLine: ["0:0"],
          engagements: [{ attackers: ["1:0"], defenders: ["0:0"] }],
          window: { seat: 0, deadline: Date.now() + 45_000, kind: "pvpCasters" } })}
        pvp={null} youSeat={0} parties={parties} yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    fireEvent.click(screen.getByTestId("pvp-cast-0:1")); // the held-back Priest
    fireEvent.click(screen.getByTestId("pvp-eng-0"));    // → the only clash
    fireEvent.click(screen.getByTestId("pvp-submit"));
    expect(dispatch).toHaveBeenCalledWith({ type: "pvpCasters", backers: [{ caster: "0:1", at: 0 }] });
  });

  it("waiting on the other side shows their name, a countdown, and no live controls", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface session={session({ surprise: 1 })} pvp={null} youSeat={1} parties={parties}
        yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    const wait = screen.getByTestId("pvp-wait");
    expect(wait.textContent).toMatch(/«Green Wyrms» is deploying…/);
    expect(wait.textContent).toMatch(/\d+s/); // live countdown from session.window.deadline
    expect(screen.getByText(/you took them by surprise/i)).toBeInTheDocument(); // round-1 banner
    expect(screen.queryByTestId("pvp-submit")).toBeNull();  // your side is read-only
    expect(screen.queryByTestId("pvp-retreat")).toBeNull(); // no retreat in round 1
  });

  it("offers retreat (open exits) and truce at a fresh round boundary", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface session={session({ round: 2 })} pvp={null} youSeat={1} parties={parties}
        yourState={newGame(1, [6, 4])} dispatch={dispatch} />, // the gateway has all four doorways
    );
    fireEvent.click(screen.getByTestId("pvp-retreat"));
    fireEvent.click(within(screen.getByTestId("pvp-retreat-menu")).getByRole("button", { name: /north/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "pvpRetreat", dir: DIR_N });

    fireEvent.click(screen.getByTestId("pvp-truce"));
    expect(dispatch).toHaveBeenCalledWith({ type: "pvpProposeStop" });
  });

  it("shows Accept truce when the other side proposed the stop", () => {
    const dispatch = vi.fn();
    render(
      <PvpFightSurface session={session({ round: 2, stopProposedBy: 0 })} pvp={null} youSeat={1}
        parties={parties} yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    const truce = screen.getByTestId("pvp-truce");
    expect(truce.textContent).toMatch(/accept truce/i);
    fireEvent.click(truce);
    expect(dispatch).toHaveBeenCalledWith({ type: "pvpAcceptStop" });
  });
});

describe("extension kit (SC-EXT-29): kit fighters render by name, not the base-only '?' fallback", () => {
  it("shows a kit creature's real name for both the rival card and your own kit member — no crash", () => {
    const dispatch = vi.fn();
    const pvp: PvpView = {
      round: 1, activeSide: "attacker", stage: "attackerEngage", surprise: 0,
      attackerName: "Green Wyrms", defenderName: "Red Talons",
      engagements: [], window: null, stopProposedBy: null,
      cards: { "1:0": { creatureId: 18, copy: 0, alive: true } }, // the rival's Witch (kit id 18)
    };
    render(
      <PvpFightSurface
        session={session({ attacker: [0], defender: [1], stage: "attackerEngage", defenderLine: ["1:0"],
          window: { seat: 0, deadline: Date.now() + 45_000, kind: "pvpLayout" } })}
        pvp={pvp} youSeat={0} parties={parties}
        yourState={newGame(1, [20, 6], { extensionKit: true })} // your own Wolf (kit id 20) + Woman
        dispatch={dispatch} />,
    );
    // The rival's Witch card names correctly (base CREATURES[18] is undefined — a kit-safe lookup
    // is required or this falls back to "?").
    expect(screen.getAllByText("Witch").length).toBeGreaterThanOrEqual(1);
    // Your own kit member (Wolf) also names correctly in the "Your command" roster.
    expect(screen.getAllByText(/Wolf/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("?")).toBeNull(); // never the base-only-lookup placeholder
  });
});

describe("card art on the fight chips (rulebook §Hidden Cards — creature cards are displayed)", () => {
  it("renders both sides' creature card images: yours from your state, the rival's from pvp.cards", async () => {
    const dispatch = vi.fn();
    const pvp: PvpView = {
      round: 1, activeSide: "attacker", stage: "attackerEngage", surprise: 0,
      attackerName: "Green Wyrms", defenderName: "Red Talons",
      engagements: [], window: null, stopProposedBy: null,
      cards: { "1:0": { creatureId: 12, copy: 0, alive: true } }, // the rival line's Giant
    };
    render(
      <PvpFightSurface
        session={session({ attacker: [0], defender: [1], stage: "attackerEngage", defenderLine: ["1:0"],
          window: { seat: 0, deadline: Date.now() + 45_000, kind: "pvpLayout" } })}
        pvp={pvp} youSeat={0} parties={parties} yourState={newGame(1, [6, 4])} dispatch={dispatch} />,
    );
    // The manifest mock resolves async — the thumbs appear once card art lands. The rival chip is
    // now NAMED by its card (it may appear in both the roster and the engagement builder).
    const giants = await screen.findAllByText("Giant");
    expect(giants.length).toBeGreaterThanOrEqual(1);
    const imgs = document.querySelectorAll(".scv-pvp-thumb img");
    expect(imgs.length).toBeGreaterThanOrEqual(2); // your Woman + Priest and/or the rival Giant
    expect([...imgs].some((i) => i.getAttribute("src") === "/c12-0.png")).toBe(true); // the Giant's card
    expect([...imgs].some((i) => i.getAttribute("src") === "/c6-0.png")).toBe(true);  // your Woman's card
  });
});
