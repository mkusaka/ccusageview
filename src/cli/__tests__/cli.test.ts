import { describe, it, expect } from "vitest";
import { buildViewerUrl, buildPayload } from "../main.ts";
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

describe("buildPayload", () => {
  it("returns raw data for single unlabeled input", () => {
    const result = buildPayload([{ label: "", data: SAMPLE_JSON }]);
    expect(result).toBe(SAMPLE_JSON);
  });

  it("returns sources format for labeled input", () => {
    const result = buildPayload([{ label: "Claude Code", data: SAMPLE_JSON }]);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("sources");
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0].label).toBe("Claude Code");
    expect(parsed.sources[0].data).toEqual(JSON.parse(SAMPLE_JSON));
  });

  it("returns array format for multiple unlabeled inputs", () => {
    const result = buildPayload([
      { label: "", data: SAMPLE_JSON },
      { label: "", data: SAMPLE_JSON },
    ]);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it("returns sources format when any input has a label", () => {
    const result = buildPayload([
      { label: "Claude Code", data: SAMPLE_JSON },
      { label: "", data: SAMPLE_JSON },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("sources");
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].label).toBe("Claude Code");
    expect(parsed.sources[1].label).toBe("");
  });
});
