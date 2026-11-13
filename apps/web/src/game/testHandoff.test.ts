import { beforeEach, describe, expect, it } from "vitest";
import { clearTestGameHandoff, peekTestGameHandoff, setTestGameHandoff } from "./testHandoff";

describe("testHandoff", () => {
  beforeEach(() => sessionStorage.clear());
  it("is empty until set, survives repeated peeks, and clears", () => {
    expect(peekTestGameHandoff()).toBeNull();
    setTestGameHandoff("game123");
    expect(peekTestGameHandoff()).toBe("game123");
    expect(peekTestGameHandoff()).toBe("game123");
    clearTestGameHandoff();
    expect(peekTestGameHandoff()).toBeNull();
  });
});
