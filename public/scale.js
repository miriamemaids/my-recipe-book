/* Recipe scaling: reads amounts at the start of an ingredient line,
   multiplies them, and writes them back as kitchen-friendly fractions,
   switching tsp ⇄ tbsp ⇄ cups, g ⇄ kg, ml ⇄ l and oz ⇄ lb when it reads better. */
(function (root) {
  const GLYPH = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8, "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6 };
  const G = "[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]";
  const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d{1,3},\\d{3}|\\d+(?:[.,]\\d+)?\\s*${G}?|${G})`;
  const LINE = new RegExp(`^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(.*)$`, "i");
  const END = "(?![a-z])\\.?";
  const UNITS = [
    [new RegExp("^(teaspoons?|tsps?)" + END, "i"), "tsp", "vol", 1],
    [new RegExp("^(tablespoons?|tbsps?|tbs|tbl)" + END, "i"), "tbsp", "vol", 3],
    [new RegExp("^(cups?)" + END, "i"), "cup", "vol", 48],
    [new RegExp("^(fluid ounces?|fl\\.? ?oz)" + END, "i"), "fl oz", "floz", 1],
    [new RegExp("^(ounces?|oz)" + END, "i"), "oz", "wt", 1],
    [new RegExp("^(pounds?|lbs?)" + END, "i"), "lb", "wt", 16],
    [new RegExp("^(kilograms?|kilos?|kg)" + END, "i"), "kg", "g", 1000],
    [new RegExp("^(grams?|gr|g)" + END, "i"), "g", "g", 1],
    [new RegExp("^(milliliters?|millilitres?|ml)" + END, "i"), "ml", "ml", 1],
    [new RegExp("^(liters?|litres?|l)" + END, "i"), "l", "ml", 1000],
  ];
  const PLURAL = { egg: "eggs", yolk: "yolks", white: "whites", clove: "cloves", stick: "sticks", can: "cans", package: "packages", packet: "packets", slice: "slices", piece: "pieces", onion: "onions", lemon: "lemons", lime: "limes", orange: "oranges", potato: "potatoes", tomato: "tomatoes", carrot: "carrots", apple: "apples", banana: "bananas", sheet: "sheets", bag: "bags", jar: "jars", bunch: "bunches", sprig: "sprigs", head: "heads", handful: "handfuls", pinch: "pinches", dash: "dashes", bottle: "bottles", box: "boxes", container: "containers", envelope: "envelopes", cube: "cubes", leaf: "leaves", fillet: "fillets", breast: "breasts", thigh: "thighs", zucchini: "zucchini", pepper: "peppers", tortilla: "tortillas", cookie: "cookies" };
  const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([s, p]) => [p, s]));
  const ADJ = ["large", "medium", "small", "whole", "big", "ripe", "extra-large", "jumbo", "heaping", "level", "scant"];
  const NICE = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];

  function val(s) {
    s = String(s).trim();
    let m;
    if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return +m[2] > 0 ? m[1] / m[2] : NaN;
    if (/^\d{1,3},\d{3}$/.test(s)) return +s.replace(",", "");
    if ((m = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)?\\s*(${G})?$`))) && (m[1] || m[2]))
      return (m[1] ? parseFloat(m[1].replace(",", ".")) : 0) + (m[2] ? GLYPH[m[2]] : 0);
    return NaN;
  }

  function frac(n) {
    if (!(n > 0)) return "0";
    if (n >= 10) { const r = Math.round(n * 2) / 2; return r % 1 ? Math.floor(r) + "½" : String(r); }
    let w = Math.floor(n), f = n - w, best = NICE[0];
    for (const c of NICE) if (Math.abs(f - c[0]) < Math.abs(f - best[0])) best = c;
    if (best[0] === 1) { w += 1; best = NICE[0]; }
    if (!w && !best[1]) return "⅛";
    return (w ? String(w) : "") + best[1];
  }
  function metric(n) {
    if (n < 10) return String(Math.round(n * 10) / 10);
    if (n < 100) return String(Math.round(n));
    if (n < 1000) return String(Math.round(n / 5) * 5);
    return String(Math.round(n / 10) * 10);
  }
  const near = (x, list) => { const f = x - Math.floor(x); return list.some((c) => Math.abs(f - c) < 0.02); };
  const isNice = (x) => near(x, NICE.map((c) => c[0]));

  // Pick the friendliest unit for an amount, given in the unit family's base (tsp, oz, g, ml).
  function pick(kind, base) {
    if (kind === "vol") {
      const cups = base / 48, tbsp = base / 3;
      if (cups >= 1 && isNice(cups)) return ["cup", 48];
      if (base >= 12 && near(cups, [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1])) return ["cup", 48];
      if (base >= 3 && near(tbsp, [0, 1 / 2, 1])) return ["tbsp", 3];
      if (base >= 12 && base < 48) return ["tbsp", 3];
      if (base >= 12) return ["cup", 48];
      return ["tsp", 1];
    }
    if (kind === "wt") return base >= 16 ? ["lb", 16] : ["oz", 1];
    if (kind === "g") return base >= 1000 ? ["kg", 1000] : ["g", 1];
    if (kind === "ml") return base >= 1000 ? ["l", 1000] : ["ml", 1];
    return null;
  }
  const unitName = (u, n) => (u === "cup" ? (n > 1 ? "cups" : "cup") : u);
  const fmt = (kind, n) => (kind === "g" || kind === "ml" ? metric(n) : frac(n));

  function fixPlural(rest, n) {
    const words = rest.split(" ");
    let i = 0;
    while (i < words.length - 1 && ADJ.includes(words[i].toLowerCase())) i++;
    const m = (words[i] || "").match(/^([A-Za-z]+)(.*)$/);
    if (!m) return rest;
    const w = m[1].toLowerCase();
    const next = (words[i + 1] || "").toLowerCase().replace(/[^a-z]/g, "");
    if (PLURAL[next] || SINGULAR[next]) return rest; // "egg yolks", "egg whites": leave the first word alone
    if (n > 1 && PLURAL[w] && PLURAL[w] !== w) words[i] = PLURAL[w] + m[2];
    else if (n <= 1 && SINGULAR[w] && SINGULAR[w] !== w) words[i] = SINGULAR[w] + m[2];
    return words.join(" ");
  }

  // Returns {header} for section titles, otherwise {amount, rest}. amount is "" when the line has none.
  function scaleLine(line, mult) {
    const raw = String(line).trim();
    if (!raw) return null;
    if (/^#+\s*/.test(raw)) return { header: raw.replace(/^#+\s*/, "") };
    if (/:$/.test(raw) && !/^\d/.test(raw) && raw.length < 60) return { header: raw.replace(/:$/, "") };
    const m = raw.match(LINE);
    if (!m) return { amount: "", rest: raw };
    const q1 = val(m[1]), q2 = m[2] ? val(m[2]) : null;
    if (isNaN(q1) || (q2 !== null && isNaN(q2))) return { amount: "", rest: raw };
    let rest = m[3];
    let unit = null;
    for (const u of UNITS) {
      const um = rest.match(u[0]);
      if (um) { unit = u; rest = rest.slice(um[0].length).trimStart(); break; }
    }
    // "3 tablespoons + 1/2 teaspoon sugar": scale the second amount too.
    let extra = null;
    const plus = rest.match(/^\+\s*(.*)$/);
    if (plus && LINE.test(plus[1])) { extra = scaleLine(plus[1], mult); if (extra && !extra.header) rest = extra.rest; else extra = null; }

    let amount;
    if (mult === 1) {
      const typed = raw.slice(0, raw.length - m[3].length).trim();
      amount = unit ? (typed + " " + m[3].match(unit[0])[0]).trim() : typed;
      if (extra) amount += " + " + extra.amount;
      return { amount, rest, cups: unit && unit[2] === "vol" && !extra ? (q1 * unit[3]) / 48 : null };
    }
    const a = q1 * mult, b = q2 !== null ? q2 * mult : null;
    if (unit && unit[2] !== "floz") {
      const kind = unit[2], base = a * unit[3];
      const [u, f] = pick(kind, base);
      const v1 = base / f, v2 = b !== null ? (b * unit[3]) / f : null;
      if (kind === "vol" && u === "tsp" && base >= 3 && v2 === null) {
        const t = Math.floor(base / 3 + 0.01), r = base - t * 3; // e.g. 8 tsp → 2 tbsp + 2 tsp
        amount = t + " tbsp" + (r > 0.06 ? " + " + frac(r) + " tsp" : "");
      } else amount =fmt(kind, v1) + (v2 !== null ? "–" + fmt(kind, v2) : "") + " " + unitName(u, v2 ?? v1);
    } else if (unit) {
      amount = frac(a) + (b !== null ? "–" + frac(b) : "") + " fl oz";
    } else {
      amount = frac(a) + (b !== null ? "–" + frac(b) : "");
      rest = fixPlural(rest, b ?? a);
    }
    if (extra) amount += " + " + extra.amount;
    return { amount, rest, cups: unit && unit[2] === "vol" && !extra ? (a * unit[3]) / 48 : null };
  }

  root.Scale = { scaleLine, frac, val };
  if (typeof module !== "undefined") module.exports = root.Scale;
})(typeof window !== "undefined" ? window : globalThis);
