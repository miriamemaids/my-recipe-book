# My Recipe Book

A shared recipe book at https://my-personal-recipe-book.netlify.app

- Add recipes from a photo (cookbook page, handwritten card, screenshot), pasted text, or by typing.
- Scale any recipe (½×, 1½×, 2×, 3× or an exact number of servings) with kitchen-friendly fractions.
- Share a link anyone can open, or copy the recipe as text.

## How it's hosted

Netlify deploys this repository automatically whenever `main` changes.

- `public/`: the app (index.html, scale.js for scaling)
- `netlify/functions/`: recipes (saving), photo (pictures), extract (reads recipes using Netlify's AI Gateway)

Recipes and photos live in Netlify Blobs, separate from the code, so updates never touch them.

Paste a recipe link (kosher.com and most recipe sites) in Add recipe to import it with credit to the original.
