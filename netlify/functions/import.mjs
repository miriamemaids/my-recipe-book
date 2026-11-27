import { json, store } from "../lib/shared.mjs";
import { saveRecipe } from "../lib/book.mjs";

// Imports a recipe from a web page that publishes standard recipe data
// (schema.org "Recipe", used by kosher.com and most recipe sites).
// The recipe keeps a link to the original page and credits the site and author.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", frac12: "½", frac14: "¼", frac34: "¾", deg: "°" };
const decode = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

function findRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const x = stack.pop();
      if (!x || typeof x !== "object") continue;
      if (Array.isArray(x)) { stack.push(...x); continue; }
      if ([].concat(x["@type"]).includes("Recipe")) return x;
      if (x["@graph"]) stack.push(x["@graph"]);
    }
  }
  return null;
}

function duration(iso) {
  const m = String(iso || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return "";
  const h = (+m[1] || 0) * 24 + (+m[2] || 0), min = +m[3] || 0;
  return [h ? h + " hr" : "", min ? min + " min" : ""].filter(Boolean).join(" ");
}

function steps(ins) {
  const out = [];
  const walk = (s) => {
    if (!s) return;
    if (typeof s === "string") { decode(s).split(/\n+/).forEach((t) => t && out.push(t)); return; }
    if (Array.isArray(s)) { s.forEach(walk); return; }
    if ([].concat(s["@type"]).includes("HowToSection")) { if (s.name) out.push("## " + decode(s.name)); walk(s.itemListElement); return; }
    const t = decode(s.text || s.name || "");
    if (t) out.push(t);
  };
  walk(ins);
  // "## Section" lines aren't steps in the app, so turn them into plain labels.
  return out.map((l) => (l.startsWith("## ") ? l.slice(3) + ":" : l));
}

function siteName(url, rec) {
  const pub = rec.publisher && (rec.publisher.name || (Array.isArray(rec.publisher) && rec.publisher[0]?.name));
  if (pub) return decode(pub);
  const host = new URL(url).hostname.replace(/^www\./, "");
  return host === "kosher.com" ? "Kosher.com" : host;
}

async function savePhoto(imgUrl) {
  try {
    const res = await fetch(imgUrl, { headers: { "user-agent": "Mozilla/5.0 (recipe book import)" } });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) return "";
    const data = await res.arrayBuffer();
    if (data.byteLength > 4 * 1024 * 1024) return "";
    const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    await store("photos").set(id, data, { metadata: { type } });
    return "/api/photo/" + id;
  } catch { return ""; }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => null);
  let url;
  try { url = new URL(String(body?.url || "").trim()); } catch { return json({ error: "That doesn't look like a link." }, 400); }
  if (!/^https?:$/.test(url.protocol)) return json({ error: "That doesn't look like a link." }, 400);
  url.hash = "";

  // Already imported? Don't make a second copy.
  const existing = ((await store("recipes").get("book", { type: "json" }))?.recipes || []).find((r) => r.source && r.source.replace(/\/$/, "") === url.href.replace(/\/$/, ""));
  if (existing) return json({ ok: true, id: existing.id, duplicate: true });

  let html;
  try {
    const res = await fetch(url.href, { headers: { "user-agent": "Mozilla/5.0 (compatible; MyRecipeBook/1.0)", accept: "text/html" } });
    if (!res.ok) return json({ error: "That page couldn't be opened (" + res.status + "). Try a screenshot instead." }, 422);
    html = await res.text();
  } catch { return json({ error: "That page couldn't be opened. Try a screenshot instead." }, 422); }

  const rec = findRecipe(html);
  if (!rec) return json({ error: "No recipe found on that page. Copy the recipe text, or use a screenshot." }, 422);

  const site = siteName(url.href, rec);
  const author = decode([].concat(rec.author || []).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean).join(", "));
  const yieldText = decode([].concat(rec.recipeYield || [])[0] || "");
  const servings = parseFloat(yieldText) || 4;
  const yieldLabel = (yieldText.replace(/^[\d.\s-–]+/, "").trim() || "servings").slice(0, 40);
  const cat = decode([].concat(rec.recipeCategory || [])[0] || "Other");
  const keywords = decode(Array.isArray(rec.keywords) ? rec.keywords.join(",") : rec.keywords || "").split(",").map((k) => k.trim().toLowerCase()).filter((k) => k && k.length < 25);
  const img = [].concat(rec.image || [])[0];
  const imgUrl = typeof img === "string" ? img : img?.url;
  const photo = imgUrl && /^https:\/\//.test(imgUrl) ? await savePhoto(imgUrl) : "";

  const recipe = {
    id: (decode(rec.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "recipe") + "-" + Math.random().toString(36).slice(2, 6),
    title: decode(rec.name) || "Untitled recipe",
    category: cat === "Mains" ? "Main dishes" : cat,
    tags: [site.toLowerCase(), ...keywords.filter((k) => k !== site.toLowerCase()).slice(0, 3)],
    servings, yieldLabel,
    time: duration(rec.totalTime || rec.cookTime || rec.prepTime),
    ingredients: (rec.recipeIngredient || rec.ingredients || []).map(decode).filter(Boolean).join("\n"),
    steps: steps(rec.recipeInstructions).join("\n"),
    notes: "",
    source: url.href,
    credit: "From " + site + (author ? ", by " + author : ""),
    photo,
  };
  const saved = await saveRecipe(recipe);
  if (!saved) return json({ error: "Couldn't save that recipe." }, 500);
  return json({ ok: true, id: saved.id, title: saved.title });
};

export const config = { path: "/api/import" };
