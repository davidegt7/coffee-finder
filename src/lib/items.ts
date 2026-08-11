import type { Place } from "../types";
import { fold } from "./text";

/**
 * The item taxonomy, two levels deep.
 *
 * The top level is an *intent* — am I drinking here, buying beans, or buying
 * gear? Those are three different errands, and someone after a bag of beans has
 * no use for a list of espresso drinks. The old flat list put all of it on one
 * screen and made you read past most of it.
 *
 * The rule inherited from this app's dietary ancestor is unchanged and still
 * load-bearing: **items are plain nouns, never claims.** There is no "pastelería
 * sin gluten" item — there is `pastelería`, and the Características menu supplies
 * "sin gluten". Duplicating a claim into an item name would let a café listing
 * plain "pastelería" match a gluten-free filter it never made.
 */

export interface ItemDef {
  id: string;
  label: { es: string; en: string };
  /** Extra spellings found in free-text Place.items. Never the bare noun of a
   *  more specific item — that's how false positives get in. */
  aliases?: string[];
}

export interface ItemSection {
  id: string;
  /** Omitted when the intent has a single, self-evident section. */
  label?: { es: string; en: string };
  items: ItemDef[];
}

export interface ItemIntent {
  id: "drink" | "beans" | "gear";
  label: { es: string; en: string };
  icon: string;
  sections: ItemSection[];
}

export const INTENTS: ItemIntent[] = [
  {
    id: "drink",
    label: { es: "Café para tomar", en: "Coffee to drink" },
    icon: "☕",
    sections: [
      {
        id: "coffee",
        label: { es: "El café", en: "The coffee" },
        items: [
          { id: "espresso", label: { es: "Espresso", en: "Espresso" }, aliases: ["expreso"] },
          { id: "cortado", label: { es: "Cortado", en: "Cortado" } },
          { id: "flat-white", label: { es: "Flat white", en: "Flat white" } },
          {
            id: "cappuccino",
            label: { es: "Cappuccino", en: "Cappuccino" },
            aliases: ["capuchino"],
          },
          { id: "latte", label: { es: "Latte", en: "Latte" } },
          { id: "americano", label: { es: "Americano", en: "Americano" } },
          {
            id: "filtrado",
            label: { es: "Filtrado / V60", en: "Pour over / V60" },
            aliases: ["v60", "chemex", "pour over", "filtro"],
          },
          { id: "aeropress", label: { es: "Aeropress", en: "Aeropress" } },
          {
            id: "cold-brew",
            label: { es: "Cold brew", en: "Cold brew" },
            aliases: ["frio", "iced"],
          },
          { id: "matcha", label: { es: "Matcha", en: "Matcha" } },
          { id: "chai", label: { es: "Chai", en: "Chai" } },
          { id: "te", label: { es: "Té", en: "Tea" } },
          {
            id: "leches-vegetales",
            label: { es: "Leches vegetales", en: "Plant milks" },
            aliases: ["leche de almendra", "avena", "oat"],
          },
        ],
      },
      {
        // Food sits under "to drink" because that's when it's relevant: you're
        // sitting down and the question is whether there's something to eat with
        // the coffee. It isn't a separate errand.
        id: "food",
        label: { es: "Para comer", en: "To eat" },
        items: [
          {
            id: "pasteleria",
            label: { es: "Pastelería", en: "Pastries" },
            aliases: ["reposteria", "pasteles"],
          },
          { id: "croissant", label: { es: "Croissant", en: "Croissant" } },
          {
            id: "sandwiches",
            label: { es: "Sándwiches", en: "Sandwiches" },
            aliases: ["sandwich", "sanguche"],
          },
          { id: "tostadas", label: { es: "Tostadas", en: "Toast" }, aliases: ["avocado toast"] },
          { id: "huevos", label: { es: "Huevos", en: "Eggs" } },
          { id: "torta", label: { es: "Torta / kuchen", en: "Cake" }, aliases: ["kuchen", "pie"] },
          {
            id: "granola",
            label: { es: "Granola / yogurt", en: "Granola / yoghurt" },
            aliases: ["yoghurt", "yogur"],
          },
          { id: "ensaladas", label: { es: "Ensaladas", en: "Salads" }, aliases: ["ensalada"] },
        ],
      },
    ],
  },
  {
    id: "beans",
    label: { es: "Café en grano", en: "Coffee beans" },
    icon: "🫘",
    sections: [
      {
        id: "grind",
        items: [
          {
            id: "grano-entero",
            label: { es: "Entero", en: "Whole bean" },
            // "grano" alone denotes whole bean — that's what "café en grano"
            // means — so it belongs here rather than on molido.
            aliases: ["grano", "en grano", "granos", "beans", "whole bean"],
          },
          {
            id: "grano-molido",
            label: { es: "Molido", en: "Ground" },
            aliases: ["molienda", "ground"],
          },
        ],
      },
    ],
  },
  {
    id: "gear",
    label: { es: "Equipamiento", en: "Brew gear" },
    icon: "⚙️",
    sections: [
      {
        id: "gear",
        items: [
          {
            id: "equipo-cafeteras",
            label: { es: "Cafeteras / drippers", en: "Brewers / drippers" },
            aliases: ["cafetera", "dripper"],
          },
          {
            id: "equipo-prensa",
            label: { es: "Prensa francesa", en: "French press" },
            aliases: ["prensa"],
          },
          {
            id: "equipo-molinillo",
            label: { es: "Molinillo", en: "Grinder" },
            aliases: ["molino", "grinder"],
          },
          {
            id: "equipo-filtros",
            label: { es: "Filtros", en: "Filter papers" },
            aliases: ["filtros de papel"],
          },
          { id: "equipo-balanza", label: { es: "Balanza", en: "Scale" }, aliases: ["pesa"] },
          {
            id: "equipo-hervidor",
            label: { es: "Hervidor", en: "Kettle" },
            aliases: ["pava", "kettle"],
          },
        ],
      },
    ],
  },
];

/** Flattened, for lookups. */
export const ITEMS: ItemDef[] = INTENTS.flatMap((i) => i.sections.flatMap((s) => s.items));

const ITEMS_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export type ItemDisplayGroup = "coffee" | "food" | "beans" | "gear" | "other";

const DISPLAY_GROUP_BY_ID = new Map<string, ItemDisplayGroup>(
  INTENTS.flatMap((intent) =>
    intent.sections.flatMap((section) =>
      section.items.map((item) => [
        item.id,
        intent.id === "drink" ? (section.id === "food" ? "food" : "coffee") : intent.id,
      ] as const),
    ),
  ),
);

/** Every item id under an intent — used to select or clear it wholesale. */
export function itemIdsForIntent(intentId: ItemIntent["id"]): string[] {
  const intent = INTENTS.find((i) => i.id === intentId);
  return intent ? intent.sections.flatMap((s) => s.items.map((it) => it.id)) : [];
}

/** Accent- and case-insensitive: Place.items is hand-written, "Té" must match "te". */
const norm = fold;

const itemNeedles = (def: ItemDef) => [
  def.id.replace(/-/g, " "),
  def.label.es,
  def.label.en,
  ...(def.aliases ?? []),
].map(norm);

const containsItemNeedle = (hay: string, needle: string) => {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(hay);
};

/** The same taxonomy used by the filter, exposed for listing presentation. */
export function itemDisplayGroup(rawItem: string): ItemDisplayGroup {
  const hay = norm(rawItem);
  // Stored items are normally canonical labels. Exact matches first prevent a
  // short label such as "Té" from claiming "Entero" before beans are reached.
  for (const def of ITEMS) {
    if (itemNeedles(def).includes(hay)) {
      return DISPLAY_GROUP_BY_ID.get(def.id) ?? "other";
    }
  }
  for (const def of ITEMS) {
    if (itemNeedles(def).some((needle) => containsItemNeedle(hay, needle))) {
      return DISPLAY_GROUP_BY_ID.get(def.id) ?? "other";
    }
  }
  return "other";
}

/**
 * One-directional on purpose: the place's text must CONTAIN the item, never the
 * reverse. "flat white de especialidad" contains "flat white" → match. But a
 * place listing plain "café" must not match every drink just because the needle
 * contains the haystack. That direction invents claims.
 */
export function placeHasItem(place: Place, itemId: string): boolean {
  const def = ITEMS_BY_ID.get(itemId);
  if (!def) return false;
  const needles = itemNeedles(def);
  return place.items.some((raw) => {
    const hay = norm(raw);
    return needles.some((n) => containsItemNeedle(hay, n));
  });
}

export function itemLabel(id: string, lang: "es" | "en" = "es"): string {
  return ITEMS_BY_ID.get(id)?.label[lang] ?? id;
}
