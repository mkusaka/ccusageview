import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index";

function createMockEnv() {
  const store = new Map<string, string>();
  return {
    CCUSAGEVIEW_SHORT_URLS: {
      put: vi.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    },
    ASSETS: {
      fetch: vi.fn((_req: Request) =>
        Promise.resolve(new Response("<html>index</html>", { status: 200 })),
      ),
    },
  };
}

describe("POST /api/s", () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  it("creates a short URL and returns an id", async () => {
    const res = await app.request(
      "/api/s",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "compressed-payload" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBe(10);
    expect(env.CCUSAGEVIEW_SHORT_URLS.put).toHaveBeenCalledWith(body.id, "compressed-payload");
  });

  it("returns 400 when data is missing", async () => {
    const res = await app.request(
      "/api/s",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "data is required" });
  });

  it("returns 400 when data is not a string", async () => {
    const res = await app.request(
      "/api/s",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: 123 }),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "data is required" });
  });
});

describe("GET /s/:id", () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  it("redirects to /#data=... when id exists in KV", async () => {
    env.CCUSAGEVIEW_SHORT_URLS.get.mockResolvedValueOnce("some-compressed-data");

    const res = await app.request("/s/abc1234567", { method: "GET" }, env);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/#data=some-compressed-data");
    expect(env.CCUSAGEVIEW_SHORT_URLS.get).toHaveBeenCalledWith("abc1234567");
  });

  it("returns 404 when id does not exist in KV", async () => {
    env.CCUSAGEVIEW_SHORT_URLS.get.mockResolvedValueOnce(null);

    const res = await app.request("/s/nonexistent", { method: "GET" }, env);

    expect(res.status).toBe(404);
  });
});

describe("SPA fallback", () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  it("forwards unknown paths to ASSETS.fetch", async () => {
    const res = await app.request("/some-unknown-page", { method: "GET" }, env);

    expect(env.ASSETS.fetch).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("serves index.html when ASSETS returns 404", async () => {
    env.ASSETS.fetch
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(new Response("<html>SPA</html>", { status: 200 }));

    const res = await app.request("/nonexistent-path", { method: "GET" }, env);

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(2);
    // Second call should be for /index.html
    const secondCall = env.ASSETS.fetch.mock.calls[1]?.[0] as unknown as Request;
    expect(new URL(secondCall.url).pathname).toBe("/index.html");
    expect(res.status).toBe(200);
  });
});
