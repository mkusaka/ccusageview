import { describe, it, expect, vi, beforeEach } from "vitest";
// react-doctor-disable-next-line react-doctor/no-barrel-import
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
    AI_SUGGEST_LIMIT: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    AI: {
      run: vi.fn().mockResolvedValue({
        state: "Completed",
        result: {
          model: "jev-1.13.0",
          answers: {
            chart: { type: "choice", choice: "tokens" },
            range: { type: "choice", choice: "last_7_days" },
          },
          usage: {},
        },
      }),
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

describe("POST /api/charts/suggest", () => {
  const validRequest = {
    prompt: "Show token usage for the past week",
    reportType: "daily",
    granularity: "daily",
    hasMultipleEntries: true,
  };
  let env = createMockEnv();

  beforeEach(() => {
    env = createMockEnv();
  });

  function request(body: unknown) {
    return app.request(
      "/api/charts/suggest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  }

  it.each([
    [{ ...validRequest, prompt: "" }],
    [{ ...validRequest, prompt: "a".repeat(2001) }],
    [{ ...validRequest, reportType: "unknown" }],
    [{ ...validRequest, granularity: "yearly" }],
    [{ ...validRequest, hasMultipleEntries: "true" }],
    [{ ...validRequest, hasMultipleEntries: undefined }],
    [{ ...validRequest, reportType: undefined }],
    [{ ...validRequest, granularity: undefined }],
    [{ ...validRequest, charts: ["tokens", "cost"] }],
    [{ ...validRequest, ranges: ["dashboard", "last_7_days"] }],
    [{ ...validRequest, usage: [{ cost: 42 }] }],
    [{ ...validRequest, prompt: { text: "tokens", data: [{ cost: 42 }] } }],
  ])("rejects an invalid or data-bearing request without invoking Jev", async (body) => {
    const res = await request(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without invoking Jev", async () => {
    const res = await app.request(
      "/api/charts/suggest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("accepts known choices from a completed Jev result", async () => {
    const res = await request(validRequest);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chart: "tokens", range: "last_7_days" });
  });

  it.each([
    [
      {
        answers: {
          chart: { type: "choice", choice: "tokens" },
          range: { type: "choice", choice: "all" },
        },
      },
    ],
    [
      {
        state: "Failed",
        result: {
          answers: {
            chart: { type: "choice", choice: "tokens" },
            range: { type: "choice", choice: "all" },
          },
        },
      },
    ],
    [
      {
        state: "Completed",
        result: {
          answers: {
            chart: { type: "choice", choice: "custom" },
            range: { type: "choice", choice: "all" },
          },
        },
      },
    ],
    [
      {
        state: "Completed",
        result: {
          answers: {
            chart: { type: "choice", choice: "tokens" },
            range: { type: "choice", choice: "last_decade" },
          },
        },
      },
    ],
    [
      {
        state: "Completed",
        result: {
          answers: {
            chart: { type: "text", choice: "tokens" },
            range: { type: "choice", choice: "all" },
          },
        },
      },
    ],
    [{ state: "Completed", result: { answers: { chart: { type: "choice", choice: "tokens" } } } }],
  ])("fails closed on malformed provider responses", async (answer) => {
    env.AI.run.mockResolvedValueOnce(answer);
    const res = await request(validRequest);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Chart suggestion provider returned invalid choices",
    });
  });

  it("rate limits without invoking the paid model", async () => {
    env.AI_SUGGEST_LIMIT.limit.mockResolvedValueOnce({ success: false });
    const res = await request(validRequest);

    expect(res.status).toBe(429);
    expect(await res.json()).toHaveProperty("error");
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("reports provider failures instead of inventing a suggestion", async () => {
    env.AI.run.mockRejectedValueOnce(new Error("AI unavailable"));
    const res = await request(validRequest);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Chart suggestion provider failed" });
  });

  it("explains an account without credits rather than exposing the provider error", async () => {
    env.AI.run.mockRejectedValueOnce(new Error("2021: Insufficient AI Gateway credits"));
    const res = await request(validRequest);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Workers AI requires AI Gateway credits for Jev in this Cloudflare account.",
    });
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
