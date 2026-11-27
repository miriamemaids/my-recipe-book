import { json } from "../lib/shared.mjs";

// Reads a recipe from photos (cookbook pages, handwritten cards, screenshots)
// or pasted text, using Claude through Netlify's built-in AI Gateway.
// No API key needed: Netlify sets ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL itself.
const MODEL = process.env.RECIPE_MODEL || "claude-sonnet-5-5";
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const instructions = (categories, hasImages) => `You are reading a recipe ${hasImages ? "from the attached photo(s). They may be a cookbook page, a handwritten recipe card, or a screenshot of a website or message" : "from the text below"}.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{"title": string, "category": string, "tags": [string], "servings": number, "yieldLabel": string, "time": string, "ingredients": [string], "steps": [string], "notes": string, "unclear": [string]}

Rules:
- Copy the recipe faithfully. Never invent ingredients, amounts or steps.
- ingredients: one item per array entry, amount first, then unit, then the ingredient, e.g. "1 1/2 cups flour", "2 eggs", "1 can (14 oz) crushed tomatoes", "salt to taste". Write fractions like 1/2 or 1 1/2, never decimals. If the recipe has parts, add a header entry such as "## For the glaze" before that part's ingredients.
- steps: one step per entry, without numbers at the start.
- servings: the number of servings or pieces it makes. If not stated, make a sensible estimate and say "Servings estimated." in notes. yieldLabel: what the number counts, e.g. "servings", "cookies", "loaves" (plural).
- time: total time if stated, short like "45 min" or "1 hr 30 min", else "".
- category: choose the best fit from [${categories.join(", ")}], or give a short new one.
- tags: up to 4 short lowercase tags (cuisine, holiday, key ingredient, diet).
- Handwriting: if you are not sure of a word or number, write your best guess followed by [?] and also list it in "unclear".
- Keep the recipe's original language.
- If there is no recipe here, reply {"error": "No recipe found"}.`;

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  const images = Array.isArray(body?.images) ? body.images.slice(0, 4) : [];
  const text = typeof body?.text === "string" ? body.text.slice(0, 60000) : "";
  const categories = Array.isArray(body?.categories) ? body.categories.map(String).slice(0, 40) : [];
  if (!images.length && !text.trim()) return json({ error: "Add a photo or some text first." }, 400);
  for (const im of images) {
    if (!TYPES.includes(im?.type) || typeof im?.data !== "string") return json({ error: "Unsupported photo type." }, 400);
  }

  const key = process.env.ANTHROPIC_API_KEY, base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  if (!key) return json({ error: "Photo reading isn't switched on yet. Check that AI features are enabled in your Netlify team settings." }, 503);

  const cats = categories.length ? categories : ["Breakfast", "Main dishes", "Sides", "Soups", "Salads", "Breads", "Desserts", "Drinks"];
  const content = [
    ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } })),
    { type: "text", text: instructions(cats, images.length > 0) + (text ? "\n\nRECIPE TEXT:\n" + text : "") },
  ];

  // Try the stronger model first; if Netlify turns it down (some plans limit
  // which models or how much per minute), fall back to the smaller, cheaper one.
  const models = [...new Set([MODEL, "claude-haiku-5-5"])];
  let res, out, why = "";
  for (const model of models) {
    try {
      res = await fetch(base.replace(/\/$/, "") + "/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 3000, messages: [{ role: "user", content }] }),
      });
    } catch (e) {
      console.error("recipe reader: network error", model, String(e));
      return json({ error: "Couldn't reach the recipe reader. Try again in a moment." }, 502);
    }
    out = await res.json().catch(() => null);
    if (res.ok) break;
    why = (out?.error?.message || out?.message || JSON.stringify(out) || "").slice(0, 300);
    console.error("recipe reader: refused", model, res.status, why);
  }
  if (!res.ok) {
    const busy = res.status === 429;
    return json({
      error: (busy ? "The recipe reader is busy. Wait a minute and try again." : "The recipe reader couldn't take this one.") +
        (why ? " (Netlify says: " + why + ")" : ""),
    }, busy ? 429 : 502);
  }
  const reply = (out?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const recipe = parseJson(reply);
  if (!recipe) return json({ error: "Couldn't make sense of that. Try a clearer photo." }, 422);
  if (recipe.error) return json({ error: "I couldn't find a recipe in that. Try another photo or paste the text." }, 422);
  return json({ recipe });
};

export const config = { path: "/api/extract" };
