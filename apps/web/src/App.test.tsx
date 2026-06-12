import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders the game title", () => {
  render(<App />);
  expect(screen.getByText("The Sorcerer's Cave")).toBeInTheDocument();
});
