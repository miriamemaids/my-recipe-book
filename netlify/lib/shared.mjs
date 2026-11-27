import { getStore } from "@netlify/blobs";

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const store = (name) => getStore({ name, consistency: "strong" });
