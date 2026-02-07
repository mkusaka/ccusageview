import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

const HASH_PREFIX = "#data=";

// Minify JSON and compress to URL-safe string
export function encodePayload(jsonString: string): string {
  const parsed = JSON.parse(jsonString);
  const minified = JSON.stringify(parsed);
  return compressToEncodedURIComponent(minified);
}

// Decompress URL-safe string back to JSON
export function decodePayload(encoded: string): string | null {
  return decompressFromEncodedURIComponent(encoded);
}

// Build a full hash string from JSON input
export function buildHash(jsonString: string): string {
  return HASH_PREFIX + encodePayload(jsonString);
}

// Extract and decompress JSON from the current URL hash
export function loadFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const encoded = hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;
  return decodePayload(encoded);
}
