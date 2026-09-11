import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  newGame, SPECIAL_WHIRLPOOL, SPECIAL_DEEP_POOL, DIR_N, DIR_UP, DIR_DOWN,
  CREATURES, TREASURES, HAZARD_NAMES, ALL_CREATURES, ALL_TREASURES, ALL_HAZARD_NAMES,
  TILE_CHAMBER, TILE_TUNNEL_NS, TILE_TUNNEL_ES, TILE_TUNNEL_NESW_UD,
  type GameState,
} from "@sorcerers-cave/engine";
import { TestControlsPanel } from "./TestControlsPanel";

const testState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0], undefined, true), ...over });
const kitOnState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0], { extensionKit: true }, true), ...over });

describe("TestControlsPanel", () => {
  it("renders nothing when state.testMode is not true", () => {
    render(<TestControlsPanel state={newGame(1, [0])} dispatch={() => {}} />);
    expect(screen.queryByTestId("test-controls")).toBeNull();
  });

  it("queues testPlaceArea with the chosen direction and special (kit-on game)", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={kitOnState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_WHIRLPOOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL });
  });

  // Bug fix 2026-08-09 (QOTO-01): Up/Down were missing from the direction picker, so a tester could
  // never queue a special for a vertical move at all — e.g. to confirm the Whirlpool's own
  // no-stairway-connects block (SC-EXT-6) fires instead of silently connecting.
  it("offers Up/Down direction options", () => {
    render(<TestControlsPanel state={kitOnState()} dispatch={() => {}} />);
    const dirSelect = screen.getByLabelText(/next area — direction/i);
    expect(dirSelect.querySelector(`option[value="${DIR_UP}"]`)).not.toBeNull();
    expect(dirSelect.querySelector(`option[value="${DIR_DOWN}"]`)).not.toBeNull();
  });

  it("queues testPlaceArea with a vertical direction", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={kitOnState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_DOWN) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_WHIRLPOOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_DOWN, special: SPECIAL_WHIRLPOOL });
  });

  it("queues testPlaceArea with a base special on a kit-off game", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_DEEP_POOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: SPECIAL_DEEP_POOL });
  });

  // Kit gating (SC-Test-6, review fix): the picker shouldn't even offer content the engine would
  // reject — a kit-off game's option lists exclude every kit-only special/creature/treasure/hazard.
  it("omits kit-only specials/creatures/treasures/hazards from the pickers on a kit-off game", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    const specialSelect = screen.getByLabelText(/next area — special/i);
    expect(specialSelect.querySelector(`option[value="${SPECIAL_WHIRLPOOL}"]`)).toBeNull();
    const creatureSelect = screen.getByLabelText(/add a creature/i);
    expect(creatureSelect.querySelectorAll("option")).toHaveLength(CREATURES.length + 1); // +1 placeholder
    const treasureSelect = screen.getByLabelText(/add a treasure/i);
    expect(treasureSelect.querySelectorAll("option")).toHaveLength(TREASURES.length + 1);
    const hazardSelect = screen.getByLabelText(/add a hazard/i);
    expect(hazardSelect.querySelectorAll("option")).toHaveLength(HAZARD_NAMES.length + 1);
  });

  it("offers every kit-only special/creature/treasure/hazard on a kit-on game", () => {
    render(<TestControlsPanel state={kitOnState()} dispatch={() => {}} />);
    const specialSelect = screen.getByLabelText(/next area — special/i);
    expect(specialSelect.querySelector(`option[value="${SPECIAL_WHIRLPOOL}"]`)).not.toBeNull();
    const creatureSelect = screen.getByLabelText(/add a creature/i);
    expect(creatureSelect.querySelectorAll("option")).toHaveLength(ALL_CREATURES.length + 1);
    const treasureSelect = screen.getByLabelText(/add a treasure/i);
    expect(treasureSelect.querySelectorAll("option")).toHaveLength(ALL_TREASURES.length + 1);
    const hazardSelect = screen.getByLabelText(/add a hazard/i);
    expect(hazardSelect.querySelectorAll("option")).toHaveLength(ALL_HAZARD_NAMES.length + 1);
  });

  // Select any area tile (2026-09-11, SC-Test-8): the special picker also offers a normal chamber
  // and one tunnel per exit shape, not just the rulebook specials.
  it("queues testPlaceArea with a plain chamber tile", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(TILE_CHAMBER) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: TILE_CHAMBER });
  });

  it("queues testPlaceArea with a tunnel exit shape", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(TILE_TUNNEL_NS) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: TILE_TUNNEL_NS });
  });

  // Select any area tile — up/down variants (2026-09-11, SC-Test-9): a stair-variant option is
  // available (and not kit-gated) on a kit-off game, just like the plain shapes.
  it("queues testPlaceArea with an up/down variant of a tunnel shape", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(TILE_TUNNEL_NESW_UD) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: TILE_TUNNEL_NESW_UD });
  });

  it("offers up/down tunnel variants on a kit-off game (none of them are kit-only)", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    expect(screen.getByLabelText(/next area — special/i).querySelector(`option[value="${TILE_TUNNEL_NESW_UD}"]`)).not.toBeNull();
  });

  it("omits the kit-only ES tunnel shape on a kit-off game, but offers it on a kit-on game", () => {
    const { unmount } = render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    expect(screen.getByLabelText(/next area — special/i).querySelector(`option[value="${TILE_TUNNEL_ES}"]`)).toBeNull();
    unmount();
    render(<TestControlsPanel state={kitOnState()} dispatch={() => {}} />);
    expect(screen.getByLabelText(/next area — special/i).querySelector(`option[value="${TILE_TUNNEL_ES}"]`)).not.toBeNull();
  });

  it("shows the currently armed plain-tile override", () => {
    const s = testState({ testNextArea: { dir: DIR_N, special: TILE_TUNNEL_NS } });
    render(<TestControlsPanel state={s} dispatch={() => {}} />);
    expect(screen.getByTestId("test-controls")).toHaveTextContent(/tunnel ns/i);
  });

  it("shows the currently armed area override", () => {
    const s = testState({ testNextArea: { dir: DIR_N, special: SPECIAL_WHIRLPOOL } });
    render(<TestControlsPanel state={s} dispatch={() => {}} />);
    expect(screen.getByTestId("test-controls")).toHaveTextContent(/whirlpool/i);
  });

  it("adds a creature to the chamber picker and queues testSetChamber with it", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/add a creature/i), { target: { value: "10" } }); // Dragon
    fireEvent.click(screen.getByRole("button", { name: /queue next chamber/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testSetChamber", strangers: [10], treasures: [], hazards: [] });
  });

  it("queues testForceReaction with the clicked outcome", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /^hostile$/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceReaction", outcome: "hostile" });
    fireEvent.click(screen.getByRole("button", { name: /^friendly$/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceReaction", outcome: "friendly" });
  });

  // Next Roll Selector (2026-09-11, SC-Test-10): a toggle between reaction/die/allDice — only the
  // reaction buttons show by default; switching modes swaps in a die-value picker instead.
  it("defaults to the reaction mode's friendly/indifferent/hostile buttons", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    expect(screen.getByRole("button", { name: /^hostile$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /queue next die/i })).toBeNull();
  });

  it("switches to a die-value picker and queues testForceDie", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next roll selector/i), { target: { value: "die" } });
    expect(screen.queryByRole("button", { name: /^hostile$/i })).toBeNull();
    fireEvent.change(screen.getByLabelText(/die value/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /queue next die/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceDie", value: 5 });
  });

  it("switches to the all-dice mode and queues testForceAllDice", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next roll selector/i), { target: { value: "allDice" } });
    fireEvent.change(screen.getByLabelText(/die value/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /queue for rest of turn/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceAllDice", value: 2 });
  });

  it("shows the currently armed die/all-dice override", () => {
    render(<TestControlsPanel state={testState({ testNextDie: 4 })} dispatch={() => {}} />);
    expect(screen.getByTestId("test-controls")).toHaveTextContent(/next die = 4/i);
  });

  it("shows the currently armed all-dice override", () => {
    render(<TestControlsPanel state={testState({ testAllDiceRoll: 6 })} dispatch={() => {}} />);
    expect(screen.getByTestId("test-controls")).toHaveTextContent(/all dice = 6 until end of turn/i);
  });

  // Save/restore a test scenario (2026-09-11): the panel's own "Save scenario" button reuses the
  // caller-supplied onSave handler (the same one wired to the HUD's save icon) — no new mutation.
  it("does not show a Save scenario button unless onSave is supplied", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    expect(screen.queryByRole("button", { name: /save scenario/i })).toBeNull();
  });

  it("calls onSave when Save scenario is clicked", () => {
    const onSave = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /save scenario/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("dispatches testClearOverrides from the clear button", () => {
    const dispatch = vi.fn();
    const s = testState({ testNextReaction: "hostile" });
    render(<TestControlsPanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testClearOverrides" });
  });

  // Repositionable/minimizable panel (2026-09-11): dragging the header updates the panel's inline
  // position; minimizing hides the body while leaving the header (and its own toggle) visible.
  it("drags the panel via the header, offsetting its position by the pointer delta", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    const handle = screen.getByTestId("test-controls-drag");
    const panel = screen.getByTestId("test-controls");
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 130, pointerId: 1 });
    expect(panel.style.left).toBe("50px");
    expect(panel.style.top).toBe("30px");
    expect(panel.style.right).toBe("auto");
    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  it("does not move before a pointerdown starts the drag", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    const handle = screen.getByTestId("test-controls-drag");
    const panel = screen.getByTestId("test-controls");
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 130, pointerId: 1 });
    expect(panel.style.left).toBe("");
  });

  it("minimizes and expands the panel, hiding the body's controls while minimized", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    expect(screen.getByRole("button", { name: /queue next area/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /minimize test mode panel/i }));
    expect(screen.queryByRole("button", { name: /queue next area/i })).toBeNull();
    expect(screen.getByText("Test Mode")).toBeTruthy(); // header stays visible while minimized
    fireEvent.click(screen.getByRole("button", { name: /expand test mode panel/i }));
    expect(screen.getByRole("button", { name: /queue next area/i })).toBeTruthy();
  });

  // Bug fix (2026-09-11): a pointerdown on the minimize button bubbles to the drag handle's own
  // onPointerDown (startDrag), which calls setPointerCapture on the PARENT — in a real browser this
  // retargets the pointer's subsequent events and can suppress the click the button would otherwise
  // receive (jsdom's simpler event model doesn't reproduce that suppression, which is why the plain
  // fireEvent.click test above kept passing even with the bug present). What jsdom CAN verify is the
  // actual fix: the button stops the pointerdown from propagating, so it never reaches startDrag in
  // the first place — pinned here by confirming a drag never arms from a button-originated pointerdown.
  it("does not arm a drag when the pointerdown originates on the minimize button", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    const minBtn = screen.getByRole("button", { name: /minimize test mode panel/i });
    const handle = screen.getByTestId("test-controls-drag");
    const panel = screen.getByTestId("test-controls");
    fireEvent.pointerDown(minBtn, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 130, pointerId: 1 });
    expect(panel.style.left).toBe(""); // never armed — the button's pointerdown never reached startDrag
  });
});
