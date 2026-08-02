import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTestSecret } from "./testMode";

const setUrl = (search: string) => {
  window.history.replaceState({}, "", `/${search}`);
};

describe("getTestSecret", () => {
  beforeEach(() => { sessionStorage.clear(); setUrl(""); });
  afterEach(() => { sessionStorage.clear(); setUrl(""); });

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
});
