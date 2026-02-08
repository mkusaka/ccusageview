import { Hono } from "hono";
import { nanoid } from "nanoid";

// Minimal types — no @cloudflare/workers-types needed
interface KVStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

type Bindings = {
  CCUSAGEVIEW_SHORT_URLS: KVStore;
  ASSETS: { fetch(request: Request): Promise<Response> };
};

// API routes — chained for RPC type inference
const api = new Hono<{ Bindings: Bindings }>().post("/s", async (c) => {
  const body = await c.req.json<{ data?: unknown }>();
  if (!body.data || typeof body.data !== "string") {
    return c.json({ error: "data is required" }, 400);
  }
  const id = nanoid(10);
  await c.env.CCUSAGEVIEW_SHORT_URLS.put(id, body.data);
  return c.json({ id }, 201);
});

// Main app — mount API, then add non-RPC routes
const app = new Hono<{ Bindings: Bindings }>().route("/api", api);

// Short URL redirect (not part of RPC type)
app.get("/s/:id", async (c) => {
  const id = c.req.param("id");
  const data = await c.env.CCUSAGEVIEW_SHORT_URLS.get(id);
  if (!data) return c.notFound();
  return c.redirect(`/#data=${data}`);
});

// SPA fallback (not part of RPC type)
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
  }
  return res;
});

export type AppType = typeof app;
export default app;
