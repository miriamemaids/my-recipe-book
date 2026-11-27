import { json, store } from "../lib/shared.mjs";
import { loadBook, putRecipe, cleanNote } from "../lib/book.mjs";

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
    // Notes, the first-saved date and the credit line survive an edit.
    if (!putRecipe(book, body.recipe)) return json({ error: "That recipe is missing a name." }, 400);
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
