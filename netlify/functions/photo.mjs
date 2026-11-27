import { json, store } from "../lib/shared.mjs";

const TYPES = ["image/jpeg", "image/png", "image/webp", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"];

export default async (req, context) => {
  const s = store("photos");

  if (req.method === "GET") {
    const id = context.params.id || "";
    if (!/^[a-z0-9-]+$/.test(id)) return new Response("Not found", { status: 404 });
    const hit = await s.getWithMetadata(id, { type: "arrayBuffer" });
    if (!hit) return new Response("Not found", { status: 404 });
    return new Response(hit.data, {
      headers: {
        "content-type": hit.metadata?.type || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (req.method === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0];
    if (!TYPES.includes(type)) return json({ error: "That file type isn't supported." }, 400);
    const data = await req.arrayBuffer();
    if (data.byteLength > 5.5 * 1024 * 1024) return json({ error: "That file is too large. Keep voice notes under about 5 minutes." }, 413);
    const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    await s.set(id, data, { metadata: { type } });
    return json({ url: "/api/photo/" + id });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/photo", "/api/photo/:id"] };
