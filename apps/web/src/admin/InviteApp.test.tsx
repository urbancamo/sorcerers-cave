import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let who: { username: string } | null | undefined;
const redeem = vi.fn();
vi.mock("convex/react", () => ({ useQuery: () => who, useAction: () => redeem }));
vi.mock("../../convex/_generated/api", () => ({ api: { invites: { check: "check", redeem: "redeem" } } }));

import InviteApp from "./InviteApp";

beforeEach(() => { redeem.mockReset(); who = { username: "newbie" }; });
const type = (pass: string, confirm = pass) => {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: pass } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirm } });
};

describe("InviteApp", () => {
  it("says who the link is for", () => {
    render(<InviteApp token="t" />);
    expect(screen.getByText("newbie")).toBeInTheDocument();
  });

  it("explains a link that is invalid, expired or used, with no form", () => {
    who = null;
    render(<InviteApp token="t" />);
    expect(screen.getByText(/invalid, has expired, or has already been used/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("waits while the link is being checked", () => {
    who = undefined;
    render(<InviteApp token="t" />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("keeps the button off until the password is long enough and confirmed", () => {
    render(<InviteApp token="t" />);
    const go = screen.getByRole("button", { name: "Set password" });
    type("short", "short");
    expect(go).toBeDisabled();
    type("a-long-password", "");
    expect(go).toBeDisabled();
    type("a-long-password");
    expect(go).toBeEnabled();
  });

  it("will not send two different passwords", () => {
    render(<InviteApp token="t" />);
    type("a-long-password", "a-long-passwore");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(redeem).not.toHaveBeenCalled();
  });

  it("sets the password with the token, then points to the sign-in page", async () => {
    redeem.mockResolvedValue({ username: "newbie" });
    render(<InviteApp token="the-token" />);
    type("a-long-password");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(redeem).toHaveBeenCalledWith({ token: "the-token", password: "a-long-password" }));
    expect(await screen.findByText("Password set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows the server's reason when it refuses", async () => {
    redeem.mockRejectedValue(new Error("Uncaught Error: This link is invalid or has expired. Ask for a new one.\n at x"));
    render(<InviteApp token="t" />);
    type("a-long-password");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
  });
});
