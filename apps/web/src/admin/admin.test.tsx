import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
const signOut = vi.fn();
const auth = { isLoading: false, isAuthenticated: true };
let me: { roles: string[]; username: string | null } | undefined;

vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signIn, signOut }) }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => auth,
  useQuery: (ref: unknown, args: unknown) => (args === "skip" || ref !== "roles.me" ? undefined : me),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("../../convex/_generated/api", () => ({ api: { roles: { me: "roles.me" }, analytics: { summary: "a.summary", history: "a.history", liveGames: "a.live" }, game: { startTestGame: "s", restoreTestScenario: "r", replayByCode: "p" } } }));
vi.mock("../game/PartySelect", () => ({ PartySelect: () => <div>party select</div> }));
vi.mock("../game/ScenarioBrowser", () => ({ ScenarioBrowserModal: () => <div>scenario browser</div> }));
vi.mock("../game/ReplayView", () => ({ ReplayView: () => <div>replay</div> }));
vi.mock("../game/goldenGame", () => ({ goldenBundle: vi.fn() }));

import AdminApp from "./AdminApp";

const assign = vi.fn();
beforeEach(() => {
  vi.stubGlobal("location", { ...window.location, assign });
  assign.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  auth.isLoading = false;
  auth.isAuthenticated = true;
  me = { roles: [], username: null };
});

describe("AdminApp gating", () => {
  it("shows the login form to a signed-out visitor", () => {
    auth.isAuthenticated = false;
    render(<AdminApp />);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("shows the login form to an anonymous player (authenticated, no roles, no username)", () => {
    render(<AdminApp />);
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("tells a named account with no roles it has no access", () => {
    me = { roles: [], username: "pat" };
    render(<AdminApp />);
    expect(screen.getByText(/no admin roles/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows only the tabs for the roles held", () => {
    me = { roles: ["ANALYTICS"], username: "ann" };
    render(<AdminApp />);
    expect(screen.getByRole("tab", { name: "Game Analytics" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Testing" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "System" })).toBeNull();
  });

  it("a TEST-only user lands on the Testing tab", () => {
    me = { roles: ["TEST"], username: "tess" };
    render(<AdminApp />);
    expect(screen.getByRole("tab", { name: "Testing" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("start-test-game")).toBeInTheDocument();
  });

  it("SYSTEM (expanded by the server to all four roles) sees every tab", () => {
    me = { roles: ["SYSTEM", "USER", "ANALYTICS", "TEST"], username: "root" };
    render(<AdminApp />);
    expect(within(screen.getByRole("tablist", { name: "Admin sections" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Game Analytics", "Testing", "Users", "System"]);
  });
});

describe("LoginForm", () => {
  beforeEach(() => { auth.isAuthenticated = false; });

  it("signs in with the password flow, the username riding in `email`", async () => {
    signIn.mockResolvedValue({ signingIn: true });
    render(<AdminApp />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "mark" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("password", { flow: "signIn", email: "mark", password: "hunter22" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin")); // a fresh load, so the roles query starts clean
  });

  it("shows one generic message on any failure", async () => {
    signIn.mockRejectedValue(new Error("InvalidAccountId"));
    render(<AdminApp />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "mark" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in failed");
  });

  it("offers no sign-up or recovery", () => {
    render(<AdminApp />);
    expect(screen.queryByText(/sign up|forgot|reset|create account/i)).toBeNull();
  });

  it("keeps Sign in disabled until both fields are filled", () => {
    render(<AdminApp />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
