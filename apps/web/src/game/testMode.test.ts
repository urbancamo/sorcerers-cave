import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestSecret } from "./testMode";

const setUrl = (search: string) => {
  window.history.replaceState({}, "", `/${search}`);
};

describe("getTestSecret", () => {
  beforeEach(() => { sessionStorage.clear(); setUrl(""); });
  afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); setUrl(""); });

  it("returns null when no ?test= param and nothing remembered", () => {
    expect(getTestSecret()).toBeNull();
  });

  it("reads ?test= from the URL and remembers it in sessionStorage", () => {
    setUrl("?test=abcd-1234");
    expect(getTestSecret()).toBe("abcd-1234");
    expect(sessionStorage.getItem("scv-test-secret")).toBe("abcd-1234");
  });

  it("falls back to the remembered value once the URL param is gone (e.g. after navigation)", () => {
    setUrl("?test=abcd-1234");
    getTestSecret(); // first call remembers it
    setUrl(""); // URL param gone
    expect(getTestSecret()).toBe("abcd-1234");
  });

  it("still returns the URL value when sessionStorage.setItem throws (e.g. blocked storage)", () => {
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => { throw new DOMException("blocked"); });
    setUrl("?test=abcd-1234");
    expect(getTestSecret()).toBe("abcd-1234");
  });

  it("returns null (not throw) when no ?test= param and sessionStorage.getItem throws", () => {
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => { throw new DOMException("blocked"); });
    expect(getTestSecret()).toBeNull();
  });
});
