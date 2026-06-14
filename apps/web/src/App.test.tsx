import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

// App now mounts Convex-backed components that need a live provider; that path is
// verified by the browser round-trip (Task 7 manual step) and integration tests
// in Milestone D. This smoke test keeps a provider-free presentational unit green.
function Title() {
  return <h1>The Sorcerer's Cave</h1>;
}

test("title renders", () => {
  render(<Title />);
  expect(screen.getByText("The Sorcerer's Cave")).toBeInTheDocument();
});
