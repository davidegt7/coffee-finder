import type { Place } from "../types";

/**
 * The item taxonomy: WHAT you can order. Never a property of the place.
 *
 * The rule inherited from this app's dietary ancestor, and still load-bearing:
 * **items are plain nouns, never claims.** There is no "pastelería sin gluten"
 * item — there is `pastelería`, and the Características menu supplies "sin
 * gluten". Composing the two is the whole design; duplicating a claim into an
 * item name would let a café listing plain "pastelería" match a gluten-free
 * filter it never claimed.
 *
 * Grouped by what you're doing — drinking here, eating here, taking home —
 * rather than by place type. Unlike a food map (where chucrut is a shop question
 * and brunch is a restaurant question), every café plausibly does all three, so
 * all groups always show.
 */
export type ItemGroup = "drink" | "eat" | "take";

export interface ItemDef {
  id: string;
  label: { es: string; en: string };
  group: ItemGroup;
  /** Extra spellings found in free-text Place.items. Never the bare noun of a
   *  more specific item — that's how false positives get in. */
  aliases?: string[];
}

export const GROUP_LABELS: Record<ItemGroup, { es: string; en: string }> = {
  drink: { es: "Para tomar", en: "To drink" },
  eat: { es: "Para comer", en: "To eat" },
  take: { es: "Para llevar", en: "To take home" },
};

export const ITEMS: ItemDef[] = [
  // ---- para tomar ----
  { id: "espresso", label: { es: "Espresso", en: "Espresso" }, group: "drink", aliases: ["expreso"] },
  { id: "cortado", label: { es: "Cortado", en: "Cortado" }, group: "drink" },
  { id: "flat-white", label: { es: "Flat white", en: "Flat white" }, group: "drink" },
  { id: "cappuccino", label: { es: "Cappuccino", en: "Cappuccino" }, group: "drink", aliases: ["capuchino"] },
  { id: "latte", label: { es: "Latte", en: "Latte" }, group: "drink" },
  { id: "americano", label: { es: "Americano", en: "Americano" }, group: "drink" },
  { id: "filtrado", label: { es: "Filtrado / V60", en: "Pour over / V60" }, group: "drink", aliases: ["v60", "chemex", "pour over", "filtro"] },
  { id: "aeropress", label: { es: "Aeropress", en: "Aeropress" }, group: "drink" },
  { id: "cold-brew", label: { es: "Cold brew", en: "Cold brew" }, group: "drink", aliases: ["frio", "iced"] },
  { id: "matcha", label: { es: "Matcha", en: "Matcha" }, group: "drink" },
  { id: "chai", label: { es: "Chai", en: "Chai" }, group: "drink" },
  { id: "te", label: { es: "Té", en: "Tea" }, group: "drink" },
  { id: "leches-vegetales", label: { es: "Leches vegetales", en: "Plant milks" }, group: "drink", aliases: ["leche de almendra", "avena", "oat"] },

  // ---- para comer ----
  { id: "pasteleria", label: { es: "Pastelería", en: "Pastries" }, group: "eat", aliases: ["reposteria", "pasteles"] },
  { id: "croissant", label: { es: "Croissant", en: "Croissant" }, group: "eat" },
  { id: "sandwiches", label: { es: "Sándwiches", en: "Sandwiches" }, group: "eat", aliases: ["sandwich", "sanguche"] },
  { id: "tostadas", label: { es: "Tostadas", en: "Toast" }, group: "eat", aliases: ["avocado toast"] },
  { id: "huevos", label: { es: "Huevos", en: "Eggs" }, group: "eat" },
  { id: "torta", label: { es: "Torta / kuchen", en: "Cake" }, group: "eat", aliases: ["kuchen", "pie"] },
  { id: "granola", label: { es: "Granola / yogurt", en: "Granola / yoghurt" }, group: "eat", aliases: ["yoghurt", "yogur"] },
  { id: "ensaladas", label: { es: "Ensaladas", en: "Salads" }, group: "eat", aliases: ["ensalada"] },

  // ---- para llevar ----
  { id: "grano", label: { es: "Grano", en: "Whole beans" }, group: "take", aliases: ["granos", "beans", "en grano"] },
  { id: "molido", label: { es: "Café molido", en: "Ground coffee" }, group: "take", aliases: ["molienda"] },
  { id: "equipamiento", label: { es: "Equipamiento", en: "Brew gear" }, group: "take", aliases: ["cafeteras", "prensa", "molinillo"] },
];

const ITEMS_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

/** Accent- and case-insensitive: Place.items is hand-written, "Té" must match "te". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // combining diacritics

/**
 * One-directional on purpose: the place's text must CONTAIN the item, never the
 * reverse. "flat white de especialidad" contains "flat white" → match. But a
 * place listing plain "café" must not match every coffee drink just because the
 * needle contains the haystack. That direction invents claims.
 */
export function placeHasItem(place: Place, itemId: string): boolean {
  const def = ITEMS_BY_ID.get(itemId);
  if (!def) return false;
  const needles = [
    def.id.replace(/-/g, " "),
    def.label.es,
    def.label.en,
    ...(def.aliases ?? []),
  ].map(norm);
  return place.items.some((raw) => {
    const hay = norm(raw);
    return needles.some((n) => hay.includes(n));
  });
}

export function itemsForGroup(group: ItemGroup): ItemDef[] {
  return ITEMS.filter((i) => i.group === group);
}

export function itemLabel(id: string, lang: "es" | "en" = "es"): string {
  return ITEMS_BY_ID.get(id)?.label[lang] ?? id;
}
