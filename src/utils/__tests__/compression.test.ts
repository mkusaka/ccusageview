import { describe, it, expect } from "vitest";
import { encodePayload, decodePayload, buildHash, loadFromHash } from "../compression";

describe("encodePayload / decodePayload", () => {
  it("round-trips JSON through compression", () => {
    const input = JSON.stringify({ daily: [{ date: "2025-07-01" }], totals: {} });
    const encoded = encodePayload(input);
    const decoded = decodePayload(encoded);
    expect(decoded).toBe(input);
  });

  it("minifies indented JSON before compression", () => {
    const pretty = JSON.stringify({ a: 1, b: [1, 2, 3] }, null, 2);
    const minified = JSON.stringify({ a: 1, b: [1, 2, 3] });
    const encoded = encodePayload(pretty);
    const decoded = decodePayload(encoded);
    expect(decoded).toBe(minified);
  });

  it("produces URL-safe encoded string", () => {
    const encoded = encodePayload('{"x":1}');
    // lz-string compressToEncodedURIComponent uses only [A-Za-z0-9+/=-]
    expect(encoded).toMatch(/^[A-Za-z0-9+/=$-]+$/);
  });

  it("throws on invalid JSON input", () => {
    expect(() => encodePayload("not json")).toThrow();
  });
});

describe("buildHash / loadFromHash", () => {
  it("round-trips through hash format", () => {
    const json = '{"hello":"world"}';
    const hash = buildHash(json);
    expect(hash).toMatch(/^#data=.+/);
    const recovered = loadFromHash(hash);
    expect(recovered).toBe(json);
  });

  it("returns null for non-matching hash prefix", () => {
    expect(loadFromHash("#other=abc")).toBeNull();
    expect(loadFromHash("")).toBeNull();
  });

  it("returns null for empty data after prefix", () => {
    expect(loadFromHash("#data=")).toBeNull();
  });

  it("snapshot: hash structure for simple input", () => {
    const hash = buildHash('{"test":true}');
    expect(hash).toMatchSnapshot();
  });
});
