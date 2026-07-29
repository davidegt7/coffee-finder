/**
 * Coffee Finder's data model.
 *
 * A place carries two different KINDS of fact, and conflating them would be a
 * mistake in both directions:
 *
 *   CLAIMS  — contested or consequential. Carry `scope` + `confidence` + a
 *             source, exactly as in the dietary model this app grew out of.
 *   FLAGS   — plain amenities. A power outlet either exists or it doesn't;
 *             nobody exaggerates it and nobody gets hurt if it's wrong.
 *
 * Building provenance for "has wifi" would be theatre. *Not* building it for
 * "sin gluten" would be dangerous — a coeliac ordering a sandwich runs the same
 * risk here as anywhere. And "tuesta acá" is the coffee-world equivalent of a
 * stretched claim: plenty of cafés say they roast when they buy wholesale.
 */

// ---------------------------------------------------------------- claims

export type ClaimScope = "all" | "some" | "none" | "unknown";
export type ClaimConfidence = "verified" | "claimed" | "unverified";

export interface Claim {
  scope: ClaimScope;
  confidence: ClaimConfidence;
  /** URL, or a human note like "David, visited 2026-07-20". Required above 'unverified'. */
  source?: string;
  /** Nuance the axes can't carry: "tuestan el 70%, el resto lo compran". */
  note?: string;
  /** ISO date last checked. Claims rot — a 2023 menu proves nothing about today. */
  checkedAt?: string;
}

export const UNKNOWN_CLAIM: Claim = { scope: "unknown", confidence: "unverified" };

export const CLAIM_KEYS = ["roastsOnSite", "specialty", "glutenFree", "seedOilFree"] as const;
export type ClaimKey = (typeof CLAIM_KEYS)[number];

export const CLAIM_LABELS: Record<ClaimKey, { es: string; en: string }> = {
  roastsOnSite: { es: "Tuesta acá", en: "Roasts on-site" },
  specialty: { es: "Café de especialidad", en: "Specialty coffee" },
  glutenFree: { es: "Sin gluten", en: "Gluten free" },
  seedOilFree: { es: "Sin aceites de semillas", en: "Seed oil free" },
};

// ---------------------------------------------------------------- flags

/**
 * Stored as a list of what's TRUE. An absent flag means "nobody has said", not
 * "no" — same honesty rule as an `unknown` claim, just without the ceremony.
 * Nobody filters for "cafés without wifi", so the third state isn't worth it.
 */
export const FLAG_KEYS = [
  "filterMethods",
  "sellsBeans",
  "grindsBeans",
  "breakfast",
  "brunch",
  "lunch",
  "wifi",
  "outlets",
  "laptopFriendly",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export const FLAG_LABELS: Record<FlagKey, { es: string; en: string }> = {
  filterMethods: { es: "Métodos filtrados", en: "Filter methods" },
  sellsBeans: { es: "Venden grano", en: "Sells beans" },
  grindsBeans: { es: "Muelen grano", en: "Grinds beans" },
  breakfast: { es: "Desayuno", en: "Breakfast" },
  brunch: { es: "Brunch", en: "Brunch" },
  lunch: { es: "Almuerzo", en: "Lunch" },
  wifi: { es: "Wifi", en: "Wifi" },
  outlets: { es: "Enchufes", en: "Power outlets" },
  laptopFriendly: { es: "Apto laptop", en: "Laptop friendly" },
};

/**
 * How the Características menu is grouped. Claims and flags are interleaved by
 * SUBJECT rather than by mechanism — a visitor thinks "what about the coffee?",
 * not "which of these carries provenance metadata?".
 */
export const ATTR_GROUPS: {
  id: "coffee" | "food" | "work";
  label: { es: string; en: string };
  claims: ClaimKey[];
  flags: FlagKey[];
}[] = [
  {
    id: "coffee",
    label: { es: "El café", en: "The coffee" },
    claims: ["roastsOnSite", "specialty"],
    flags: ["filterMethods", "sellsBeans", "grindsBeans"],
  },
  {
    id: "food",
    label: { es: "La comida", en: "The food" },
    claims: ["glutenFree", "seedOilFree"],
    flags: ["breakfast", "brunch", "lunch"],
  },
  {
    id: "work",
    label: { es: "Para trabajar", en: "For working" },
    claims: [],
    flags: ["wifi", "outlets", "laptopFriendly"],
  },
];

// ---------------------------------------------------------------- categories

export const CATEGORIES = ["cafe", "roastery", "bakery", "shop", "cart"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, { es: string; en: string; icon: string }> = {
  cafe: { es: "Cafetería", en: "Café", icon: "☕" },
  roastery: { es: "Tostaduría", en: "Roastery", icon: "🔥" },
  bakery: { es: "Café y panadería", en: "Café & bakery", icon: "🥐" },
  shop: { es: "Tienda de café", en: "Coffee shop", icon: "🛍️" },
  cart: { es: "Carrito", en: "Coffee cart", icon: "🛺" },
};

// ---------------------------------------------------------------- place

export interface Place {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address?: string;
  comuna?: string;
  city: string;
  website?: string;
  instagram?: string;
  /** Searchable menu items: "flat white", "V60", "cold brew", "grano para llevar". */
  items: string[];
  claims: Record<ClaimKey, Claim>;
  /** Only what's true. Absent ≠ false, it means nobody has said. */
  flags: FlagKey[];
  /** A known problem the reader deserves to see — usually sources disagreeing. */
  caveat?: string;
  /** Where this record came from. Every place must cite at least one. */
  sources: string[];
  addedAt: string;
}

