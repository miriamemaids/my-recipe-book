import { store } from "./shared.mjs";

// Your two recipes from the old app, brought over the first time the book opens.
export const SEED = [
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

export const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

export function clean(r) {
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
    credit: str(r.credit, 200).trim(),
    photo: /^\/api\/photo\/[a-z0-9-]+$/.test(photo) ? photo : "",
    createdAt: Number(r.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
}

const TAGS = ["loved", "again", "tweak", "never"];
export function cleanNote(n) {
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

export async function loadBook(s) {
  let book = await s.get("book", { type: "json" });
  if (!book || !Array.isArray(book.recipes)) {
    book = { recipes: SEED };
    await s.setJSON("book", book);
  }
  return book;
}


// Add or replace one recipe, keeping its notes, first-saved date and credit line.
export function putRecipe(book, incoming) {
  const r = clean(incoming);
  if (!r) return null;
  const i = book.recipes.findIndex((x) => x.id === r.id);
  const old = i >= 0 ? book.recipes[i] : null;
  r.log = old ? old.log || [] : Array.isArray(incoming.log) ? incoming.log.map(cleanNote).filter(Boolean) : [];
  if (old) { r.createdAt = old.createdAt; if (!r.credit && old.credit) r.credit = old.credit; book.recipes[i] = r; } else book.recipes.push(r);
  return r;
}

export async function saveRecipe(incoming) {
  const s = store("recipes");
  const book = await loadBook(s);
  const r = putRecipe(book, incoming);
  if (r) await s.setJSON("book", book);
  return r;
}
