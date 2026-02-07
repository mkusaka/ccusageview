import { describe, it, expect } from "vitest";
import { buildViewerUrl } from "../main.ts";
import { loadFromHash } from "../../utils/compression.ts";

const SAMPLE_JSON = JSON.stringify({
  daily: [
    {
      date: "2025-07-01",
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 1500,
      totalCost: 0.01,
      modelsUsed: ["claude-sonnet-4-20250514"],
      modelBreakdowns: [],
    },
  ],
  totals: {
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 1500,
    totalCost: 0.01,
  },
});

describe("buildViewerUrl", () => {
  it("produces a URL with #data= hash", () => {
    const url = buildViewerUrl(SAMPLE_JSON, "https://example.com");
    expect(url).toMatch(/^https:\/\/example\.com\/#data=.+/);
  });

  it("round-trips: hash can be decoded back to original JSON", () => {
    const url = buildViewerUrl(SAMPLE_JSON, "https://example.com");
    const hash = url.slice(url.indexOf("#"));
    const decoded = loadFromHash(hash);
    expect(decoded).not.toBeNull();
    expect(JSON.parse(decoded!)).toEqual(JSON.parse(SAMPLE_JSON));
  });

  it("strips trailing slashes from base URL", () => {
    const url1 = buildViewerUrl(SAMPLE_JSON, "https://example.com/");
    const url2 = buildViewerUrl(SAMPLE_JSON, "https://example.com");
    expect(url1).toBe(url2);
  });

  it("strips multiple trailing slashes", () => {
    const url = buildViewerUrl(SAMPLE_JSON, "https://example.com///");
    expect(url).toMatch(/^https:\/\/example\.com\/#data=/);
  });

  it("works with pretty-printed JSON (minifies before encoding)", () => {
    const pretty = JSON.stringify(JSON.parse(SAMPLE_JSON), null, 2);
    const url1 = buildViewerUrl(SAMPLE_JSON, "https://example.com");
    const url2 = buildViewerUrl(pretty, "https://example.com");
    expect(url1).toBe(url2);
  });

  it("throws on invalid JSON input", () => {
    expect(() => buildViewerUrl("not json", "https://example.com")).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => buildViewerUrl("", "https://example.com")).toThrow();
  });
});
