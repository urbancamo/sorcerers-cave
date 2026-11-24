import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("convex/react", () => ({ useQuery: () => [], useMutation: () => send }));
vi.mock("../../convex/_generated/api", () => ({ api: { multiplayer: { messages: "messages", sendMessage: "sendMessage" } } }));

import { ChatPanel } from "./ChatPanel";

const input = () => screen.getByLabelText("chat message");
const sendBtn = () => screen.getByRole("button", { name: "Send" });
const gameId = "g1" as never;

beforeEach(() => {
  send.mockReset().mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn(); // not in jsdom
});

describe("ChatPanel", () => {
  it("sends the message and clears the box", async () => {
    render(<ChatPanel gameId={gameId} />);
    fireEvent.change(input(), { target: { value: "hello" } });
    fireEvent.click(sendBtn());
    await waitFor(() => expect(send).toHaveBeenCalledWith({ gameId, text: "hello" }));
    expect(input()).toHaveValue("");
  });

  it("when a message is refused for sending too fast, shows why and puts the text back", async () => {
    send.mockRejectedValue(new ConvexError("Too many chat messages. Please try again in about 30 seconds."));
    render(<ChatPanel gameId={gameId} />);
    fireEvent.change(input(), { target: { value: "hello" } });
    fireEvent.click(sendBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many chat messages. Please try again in about 30 seconds.");
    expect(input()).toHaveValue("hello");
    fireEvent.change(input(), { target: { value: "hello again" } });
    expect(screen.queryByRole("alert")).toBeNull(); // typing clears it
  });

  it("does not overwrite what was typed meanwhile when a send fails", async () => {
    send.mockRejectedValue(new Error("network"));
    render(<ChatPanel gameId={gameId} />);
    fireEvent.change(input(), { target: { value: "first" } });
    fireEvent.click(sendBtn());
    fireEvent.change(input(), { target: { value: "second" } });
    await screen.findByRole("alert");
    expect(input()).toHaveValue("second");
  });
});
