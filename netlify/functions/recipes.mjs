import { json, store } from "../lib/shared.mjs";

// Your two recipes from the old app, brought over the first time the book opens.
const SEED = [
  {
    id: "leah-ramekins", title: "Chocolate Ramekins – Leah", category: "Desserts", tags: ["chocolate", "pareve"],
    servings: 6, yieldLabel: "ramekins", time: "25 min",
    ingredients: "4 oz baking chocolate\n1 stick margarine\n1 cup confectioners sugar\n2 eggs\n2 egg yolks\n6 tablespoons flour\n6 pieces pareve eating chocolate\n1 tablespoon confectioners sugar, for topping",
    steps: "Preheat oven to 425°F.\nMelt chocolate and margarine in the microwave for about 1 minute.\nMix in confectioners sugar until smooth.\nAdd eggs, yolks and flour; mix well.\nFill ramekins two-thirds full. Press a piece of chocolate into the center of each.\nBake 10–14 minutes, until the center is still soft. Sprinkle with confectioners sugar.",
    notes: "", source: "", photo: "", createdAt: 1, updatedAt: 1,
  },
  {
    id: "sufganiyot-idan", title: "Sufganiyot – Chef Idan Hadad", category: "Desserts", tags: ["chanukah", "fried", "yeast dough"],
    servings: 16, yieldLabel: "donuts", time: "3 hr",
    ingredients: "3 1/4 cups bread flour\n3 tablespoons + 1/2 teaspoon sugar\n3/4 teaspoon fine salt\n1/2 cup + 1 1/2 tablespoons ice-cold water\n2 tablespoons + 2 teaspoons beaten egg\n2 teaspoons egg yolk\n1 1/2 tablespoons oil\n1 1/2 tablespoons margarine\n2 1/4 teaspoons instant yeast\n1 teaspoon vanilla pudding powder\n1 teaspoon vanilla extract\n1 teaspoon brandy",
    steps: "Mix everything except the brandy on low speed.\nKnead until the gluten develops, about 20 minutes total; add the brandy near the end.\nDivide into 16 small or 11 large balls. Rest 5–10 minutes.\nFlatten slightly, cover and proof until doubled.\nFry at 340°F, about 1 1/2 minutes per side.\nRoll in sugar and fill once cool.",
    notes: "Home adaptation: the specialty dough improvers are left out, and volume measurements are approximate.",
    source: "https://inspiring-yeot-13b1ae.netlify.app/", photo: "", createdAt: 2, updatedAt: 2,
  },
];

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

function clean(r) {
  if (!r || typeof r !== "object") return null;
  if (typeof r.id !== "string" || !/^[a-z0-9-]{3,60}$/.test(r.id)) return null;
  const title = str(r.title, 200).trim();
  if (!title) return null;
  const servings = Number(r.servings);
  const photo = str(r.photo, 200);
  const source = str(r.source, 1000).trim();
  return {
    id: r.id,
    title,
    category: str(r.category, 60).trim() || "Other",
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string").map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [],
    servings: servings > 0 && servings < 1000 ? servings : 4,
    yieldLabel: str(r.yieldLabel, 40).trim() || "servings",
    time: str(r.time, 40).trim(),
    ingredients: str(r.ingredients, 20000),
    steps: str(r.steps, 40000),
    notes: str(r.notes, 10000),
    source: /^https?:\/\//.test(source) ? source : "",
    photo: /^\/api\/photo\/[a-z0-9-]+$/.test(photo) ? photo : "",
    createdAt: Number(r.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
}

const TAGS = ["loved", "again", "tweak", "never"];
function cleanNote(n) {
  if (!n || typeof n !== "object") return null;
  const text = str(n.text, 4000).trim();
  const audio = str(n.audio, 200);
  const tag = TAGS.includes(n.tag) ? n.tag : "";
  const note = {
    id: /^[a-z0-9-]{3,60}$/.test(n.id || "") ? n.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: Number(n.at) || Date.now(),
    tag, text,
    audio: /^\/api\/photo\/[a-z0-9-]+$/.test(audio) ? audio : "",
    secs: Math.max(0, Math.min(3600, Math.round(Number(n.secs) || 0))),
  };
  return note.text || note.audio || note.tag ? note : null;
}

async function loadBook(s) {
  let book = await s.get("book", { type: "json" });
  if (!book || !Array.isArray(book.recipes)) {
    book = { recipes: SEED };
    await s.setJSON("book", book);
  }
  return book;
}

export default async (req) => {
  const s = store("recipes");

  if (req.method === "GET") {
    const book = await loadBook(s);
    return json({ recipes: book.recipes });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Bad request" }, 400);

  const book = await loadBook(s);
  if (body.action === "save") {
    const r = clean(body.recipe);
    if (!r) return json({ error: "That recipe is missing a name." }, 400);
    const i = book.recipes.findIndex((x) => x.id === r.id);
    // Notes are added and removed on their own, so an edit never wipes them.
    const keepLog = i >= 0 ? book.recipes[i].log : Array.isArray(body.recipe.log) ? body.recipe.log.map(cleanNote).filter(Boolean) : [];
    r.log = keepLog || [];
    if (i >= 0) { r.createdAt = book.recipes[i].createdAt; book.recipes[i] = r; } else book.recipes.push(r);
  } else if (body.action === "add-note" || body.action === "delete-note") {
    const r = book.recipes.find((x) => x.id === body.id);
    if (!r) return json({ error: "That recipe is gone." }, 404);
    r.log = Array.isArray(r.log) ? r.log : [];
    if (body.action === "add-note") {
      const n = cleanNote(body.note);
      if (!n) return json({ error: "Add a few words, a voice note, or pick a label first." }, 400);
      r.log.unshift(n);
      r.log = r.log.slice(0, 200);
    } else r.log = r.log.filter((n) => n.id !== body.noteId);
  } else if (body.action === "delete") {
    book.recipes = book.recipes.filter((x) => x.id !== body.id);
  } else {
    return json({ error: "Unknown action" }, 400);
  }
  await s.setJSON("book", book);
  return json({ ok: true, recipes: book.recipes });
};

export const config = { path: "/api/recipes" };
