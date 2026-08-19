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
  icon: string;
  claims: ClaimKey[];
  flags: FlagKey[];
}[] = [
  {
    id: "coffee",
    label: { es: "El café", en: "The coffee" },
    icon: "☕",
    // `specialty` is deliberately NOT filterable. Every place on this map is
    // specialty coffee — that is the entry requirement, not a distinguishing
    // feature — so the filter matched everything and told nobody anything. The
    // claim itself stays on the Place: it still carries its source, and a
    // reader deciding whether to trust the entry should still see it.
    claims: ["roastsOnSite"],
    flags: ["filterMethods", "sellsBeans", "grindsBeans"],
  },
  {
    id: "food",
    label: { es: "La comida", en: "The food" },
    icon: "🥐",
    claims: ["glutenFree", "seedOilFree"],
    flags: ["breakfast", "brunch", "lunch"],
  },
  {
    id: "work",
    label: { es: "Para trabajar", en: "For working" },
    icon: "💻",
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
  shop: { es: "Tienda de café", en: "Coffee Store", icon: "🛍️" },
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
  /** Human-readable country plus its ISO 3166-1 alpha-2 code. */
  country: string;
  countryCode: string;
  website?: string;
  instagram?: string;
  /** Searchable menu items: "flat white", "V60", "cold brew", "grano para llevar". */
  items: string[];
  /** The two coffee programs visitors can explicitly search for. */
  drinkStyles?: DrinkStyle[];
  /** Structured coffee-bar details, shared by owner intake and the team editor. */
  coffeeBrand?: string;
  espressoMachineBrand?: string;
  espressoGrinderBrand?: string;
  filterGrinderBrand?: string;
  filterMethods?: FilterMethod[];
  /** Bean offering. A place can carry several roast profiles and scores. */
  roastLevels?: RoastLevel[];
  cuppingScoreMin?: number;
  cuppingScoreMax?: number;
  /** Roastery-only sourcing model, recorded as what the roaster declares. */
  sourcingModel?: SourcingModel;
  claims: Record<ClaimKey, Claim>;
  /** Only what's true. Absent ≠ false, it means nobody has said. */
  flags: FlagKey[];
  /**
   * Absolute https URL. Absent is normal and renders a designed placeholder —
   * never a stock image. A generic latte on a real café is a small lie about a
   * specific business, and this app's whole claim is that it doesn't do that.
   */
  photoUrl?: string;
  photoCredit?: string;
  /** True only after the photo-permission workflow records approval. */
  photoApproved?: boolean;
  /** A known problem the reader deserves to see — usually sources disagreeing. */
  caveat?: string;
  /** Where this record came from. Every place must cite at least one. */
  sources: string[];
  addedAt: string;
}

export type DrinkStyle = "espresso" | "filter";
export type RoastLevel = "light" | "medium" | "dark";
export type SourcingModel = "direct" | "third-party" | "both";
export type FilterMethod =
  | "v60"
  | "chemex"
  | "aeropress"
  | "kalita"
  | "origami"
  | "batch-brew"
  | "french-press"
  | "siphon";

// ---------------------------------------------------------------- app section

/**
 * Two products share one brand: a map of places you can visit and a directory
 * of roaster brands you can buy beans from online or in person.
 */
export type AppSection = "cafes" | "roasters";

// ---------------------------------------------------------------- roasters

/**
 * A specialty coffee roaster in the global directory.
 *
 * Not a Place. Places are cafés you walk into; a roaster here is a brand you
 * discover so you can buy from *their* store. We never take payment or place
 * orders — the only outbound action is a link to their website or shop.
 *
 * Coordinates mark the HQ / primary roast location for the map pin. Additional
 * retail sites live in `physicalLocations` and are listed on the profile, not
 * plotted as separate pins (that would turn one brand into a cluster of noise).
 */
export interface RoasterLocation {
  /** Optional label: "Roastery", "Café Italia", "Warehouse". */
  name?: string;
  address?: string;
  city: string;
  country: string;
  countryCode: string;
  lat?: number;
  lng?: number;
}

export interface Roaster {
  id: string;
  name: string;
  /** Short blurb — what makes them worth knowing, not marketing fluff. */
  description?: string;
  lat: number;
  lng: number;
  address?: string;
  city: string;
  /** Free-text region within a country when useful: "Patagonia", "California". */
  region?: string;
  country: string;
  countryCode: string;
  /** Brand / about site. */
  website?: string;
  /**
   * Where you actually buy beans online. Often the same host as `website`,
   * sometimes a shop subdomain or Shopify store. Prefer this for the buy CTA.
   */
  onlineStore?: string;
  instagram?: string;
  /** Ships within their home country / region. */
  shipsLocally: boolean;
  /** Ships outside their home country. */
  shipsInternationally: boolean;
  /** Offers a bean subscription / club. */
  hasSubscription: boolean;
  /** Human note: "EU only", "free over $40", "weekly roast club". */
  shippingNotes?: string;
  /** Cafés, tasting rooms, or retail sites under the same brand. */
  physicalLocations?: RoasterLocation[];
  photoUrl?: string;
  photoCredit?: string;
  sources: string[];
  addedAt: string;
}
