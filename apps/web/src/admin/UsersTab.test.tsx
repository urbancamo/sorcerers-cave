import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type U = { id: string; username: string; roles: string[]; createdAt: number };
type P = { id: string; username: string; roles: string[]; createdAt: number; expiresAt: number };
let data: { users: U[]; pending: P[] } | undefined;
const fns = { create: vi.fn(), setRoles: vi.fn(), remove: vi.fn(), reissue: vi.fn(), removeInvite: vi.fn() };

vi.mock("convex/react", () => ({
  useQuery: () => data,
  useMutation: (ref: string) => fns[ref as keyof typeof fns],
}));
vi.mock("../../convex/_generated/api", () => ({
  api: { adminUsers: { list: "list", create: "create", setRoles: "setRoles", remove: "remove", reissue: "reissue", removeInvite: "removeInvite" } },
}));

import { UsersTab } from "./UsersTab";

const day = 86_400_000;
beforeEach(() => {
  Object.values(fns).forEach((f) => f.mockReset().mockResolvedValue(undefined));
  data = {
    users: [
      { id: "me", username: "boss", roles: ["USER"], createdAt: 0 },
      { id: "t1", username: "tess", roles: ["TEST"], createdAt: 0 },
      { id: "root", username: "root", roles: ["SYSTEM"], createdAt: 0 },
    ],
    pending: [{ id: "p1", username: "newbie", roles: ["ANALYTICS"], createdAt: 0, expiresAt: Date.now() + 3 * day }],
  };
});

const row = (name: string) => screen.getByText(name, { selector: "td" }).closest("tr")!;

describe("the user list", () => {
  it("lists users with their roles in words and marks you", () => {
    render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(row("boss")).toHaveTextContent("you");
    expect(row("tess")).toHaveTextContent("Testing");
    expect(row("root")).toHaveTextContent("System");
  });

  it("offers no edit or delete on your own row", () => {
    render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(within(row("boss")).queryByRole("button")).toBeNull();
  });

  it("a USER admin gets no controls on a SYSTEM user; a SYSTEM admin does", () => {
    const { unmount } = render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(within(row("root")).queryByRole("button")).toBeNull();
    unmount();
    render(<UsersTab roles={["SYSTEM", "USER"]} selfId="me" />);
    expect(within(row("root")).getByRole("button", { name: "Edit roles of root" })).toBeInTheDocument();
  });
});

describe("add a user", () => {
  const fill = (name: string) => fireEvent.change(screen.getByLabelText("Username"), { target: { value: name } });

  it("creates the user with the ticked roles and shows the one-time link built from this site's address", async () => {
    fns.create.mockResolvedValue({ token: "11111111-2222-4333-8444-555555555555", expiresAt: 1 });
    render(<UsersTab roles={["USER"]} selfId="me" />);
    fill("Zed");
    fireEvent.click(screen.getByLabelText("Analytics"));
    fireEvent.click(screen.getByRole("button", { name: "Create user and link" }));
    await waitFor(() => expect(fns.create).toHaveBeenCalledWith({ username: "Zed", roles: ["TEST", "ANALYTICS"] }));
    const link = (await screen.findByLabelText("Invite link", { selector: "input" })) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/invite/11111111-2222-4333-8444-555555555555`);
    expect(screen.getByText(/shown only now/i)).toBeInTheDocument();
  });

  it("only a SYSTEM admin can tick SYSTEM", () => {
    const { unmount } = render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(within(screen.getByRole("form", { name: "Add a user" })).getByLabelText("System")).toBeDisabled();
    unmount();
    render(<UsersTab roles={["SYSTEM", "USER"]} selfId="me" />);
    expect(within(screen.getByRole("form", { name: "Add a user" })).getByLabelText("System")).toBeEnabled();
  });

  it("shows the server's reason when it refuses", async () => {
    fns.create.mockRejectedValue(new Error("[CONVEX M(adminUsers:create)] Server Error Uncaught Error: That username is already taken.\n  at handler"));
    render(<UsersTab roles={["USER"]} selfId="me" />);
    fill("tess");
    fireEvent.click(screen.getByRole("button", { name: "Create user and link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is already taken.");
  });

  it("cannot be submitted without a username", () => {
    render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(screen.getByRole("button", { name: "Create user and link" })).toBeDisabled();
  });
});

describe("edit roles and delete", () => {
  it("edits a user's roles inline and saves them", async () => {
    render(<UsersTab roles={["USER"]} selfId="me" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit roles of tess" }));
    fireEvent.click(within(row("tess")).getByLabelText("Analytics"));
    fireEvent.click(within(row("tess")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fns.setRoles).toHaveBeenCalledWith({ userId: "t1", roles: ["TEST", "ANALYTICS"] }));
  });

  it("deleting takes two presses, so one slip does nothing", async () => {
    render(<UsersTab roles={["USER"]} selfId="me" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete tess" }));
    expect(fns.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm tess" }));
    await waitFor(() => expect(fns.remove).toHaveBeenCalledWith({ userId: "t1" }));
  });

  it("cancelling the confirmation deletes nothing", () => {
    render(<UsersTab roles={["USER"]} selfId="me" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete tess" }));
    fireEvent.click(within(row("tess")).getByRole("button", { name: "Cancel" }));
    expect(fns.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete tess" })).toBeInTheDocument();
  });
});

describe("pending invitations", () => {
  it("lists them, and a new link replaces the old one", async () => {
    fns.reissue.mockResolvedValue({ token: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", expiresAt: 1 });
    render(<UsersTab roles={["USER"]} selfId="me" />);
    const pending = within(screen.getByTestId("pending"));
    expect(pending.getByText("newbie")).toBeInTheDocument();
    fireEvent.click(pending.getByRole("button", { name: "New link for newbie" }));
    await waitFor(() => expect(fns.reissue).toHaveBeenCalledWith({ inviteId: "p1" }));
    expect(((await screen.findByLabelText("Invite link", { selector: "input" })) as HTMLInputElement).value).toMatch(/\/invite\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee$/);
  });

  it("flags an expired one and cancels with a confirmation", async () => {
    data!.pending[0]!.expiresAt = Date.now() - 1000;
    render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(within(screen.getByTestId("pending")).getByText("Expired")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel invite newbie" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm newbie" }));
    await waitFor(() => expect(fns.removeInvite).toHaveBeenCalledWith({ inviteId: "p1" }));
  });

  it("shows no pending table when there are none", () => {
    data!.pending = [];
    render(<UsersTab roles={["USER"]} selfId="me" />);
    expect(screen.queryByTestId("pending")).toBeNull();
  });
});
