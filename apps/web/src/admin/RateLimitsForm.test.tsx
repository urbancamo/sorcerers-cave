import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

type L = { name: string; label: string; note: string; scope: "user" | "game" | "site"; defaultMax: number; defaultWindowSec: number; max: number; windowSec: number };
const limit = (over: Partial<L> = {}): L => ({
  name: "chatUser", label: "Chat messages", note: "Per player.", scope: "user", defaultMax: 20, defaultWindowSec: 60, max: 20, windowSec: 60, ...over,
});
let data: L[] | undefined;
const setLimits = vi.fn();

vi.mock("convex/react", () => ({ useQuery: () => data, useMutation: () => setLimits }));
vi.mock("../../convex/_generated/api", () => ({ api: { settings: { rateLimits: "rateLimits", setRateLimits: "setRateLimits" } } }));

import { RateLimitsForm } from "./RateLimitsForm";

const save = () => screen.getByRole("button", { name: "Save rate limits" });
const cancel = () => screen.getByRole("button", { name: "Cancel" });

beforeEach(() => {
  setLimits.mockReset().mockResolvedValue(null);
  data = [
    limit(),
    limit({ name: "bugReportSite", label: "Bug reports, whole site", scope: "site", defaultMax: 30, defaultWindowSec: 3600, max: 30, windowSec: 3600 }),
    limit({ name: "joinAttempt", label: "Join a multiplayer game by code", defaultMax: 30, defaultWindowSec: 600, max: 12, windowSec: 7200 }), // changed from its default
  ];
});

describe("RateLimitsForm", () => {
  it("shows each limit with its figure, period in the largest whole unit, scope and default", () => {
    render(<RateLimitsForm />);
    expect(screen.getByLabelText("Chat messages: number allowed")).toHaveValue(20);
    expect(screen.getByLabelText("Chat messages: period")).toHaveValue(1);
    expect(screen.getByLabelText("Chat messages: period unit")).toHaveValue("minutes");
    expect(screen.getByLabelText("Join a multiplayer game by code: period")).toHaveValue(2);
    expect(screen.getByLabelText("Join a multiplayer game by code: period unit")).toHaveValue("hours");
    expect(screen.getByText("whole site")).toBeInTheDocument();
    expect(screen.getByText(/Default: 20 per minute\./)).toBeInTheDocument();
    expect(screen.getByText(/Default: 30 per 10 minutes\./)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(cancel()).toBeDisabled();
  });

  it("waits for the data", () => {
    data = undefined;
    render(<RateLimitsForm />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("saves every limit, with the edited one converted to seconds", async () => {
    render(<RateLimitsForm />);
    fireEvent.change(screen.getByLabelText("Chat messages: number allowed"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Chat messages: period"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Chat messages: period unit"), { target: { value: "hours" } });
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(setLimits).toHaveBeenCalledTimes(1));
    expect(setLimits).toHaveBeenCalledWith({ limits: [
      { name: "chatUser", max: 5, windowSec: 7200 },
      { name: "bugReportSite", max: 30, windowSec: 3600 },
      { name: "joinAttempt", max: 12, windowSec: 7200 },
    ] });
    expect(await screen.findByRole("status")).toHaveTextContent("Rate limits saved.");
  });

  it("Cancel throws the draft away", () => {
    render(<RateLimitsForm />);
    fireEvent.change(screen.getByLabelText("Chat messages: number allowed"), { target: { value: "5" } });
    fireEvent.click(cancel());
    expect(screen.getByLabelText("Chat messages: number allowed")).toHaveValue(20);
    expect(save()).toBeDisabled();
  });

  it("'Default' puts a limit back to its default (and is off when it already is)", () => {
    render(<RateLimitsForm />);
    expect(screen.getByRole("button", { name: "Reset Chat messages to its default" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset Join a multiplayer game by code to its default" }));
    expect(screen.getByLabelText("Join a multiplayer game by code: number allowed")).toHaveValue(30);
    expect(screen.getByLabelText("Join a multiplayer game by code: period unit")).toHaveValue("minutes");
    expect(save()).toBeEnabled(); // it differs from what is saved until the admin saves
  });

  it("shows the server's reason when a value is refused, and keeps the draft", async () => {
    setLimits.mockRejectedValue(new ConvexError("Chat messages: the period must be from 10 seconds to 7 days."));
    render(<RateLimitsForm />);
    fireEvent.change(screen.getByLabelText("Chat messages: period"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Chat messages: period unit"), { target: { value: "seconds" } });
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("the period must be from 10 seconds to 7 days");
    expect(screen.getByLabelText("Chat messages: period")).toHaveValue(5);
  });
});
