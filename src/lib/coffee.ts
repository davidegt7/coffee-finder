import type {
  DrinkStyle,
  FilterMethod,
  Place,
  RoastLevel,
  SourcingModel,
} from "../types";
import { placeHasItem } from "./items";

export const DRINK_STYLES: {
  id: DrinkStyle;
  icon: string;
  label: { es: string; en: string };
}[] = [
  { id: "espresso", icon: "☕", label: { es: "Espresso", en: "Espresso" } },
  { id: "filter", icon: "🫗", label: { es: "Café filtrado", en: "Filter coffee" } },
];

export const FILTER_METHODS: {
  id: FilterMethod;
  label: { es: string; en: string };
}[] = [
  { id: "v60", label: { es: "V60", en: "V60" } },
  { id: "chemex", label: { es: "Chemex", en: "Chemex" } },
  { id: "aeropress", label: { es: "Aeropress", en: "Aeropress" } },
  { id: "kalita", label: { es: "Kalita Wave", en: "Kalita Wave" } },
  { id: "origami", label: { es: "Origami", en: "Origami" } },
  { id: "batch-brew", label: { es: "Batch brew", en: "Batch brew" } },
  { id: "french-press", label: { es: "Prensa francesa", en: "French press" } },
  { id: "siphon", label: { es: "Sifón", en: "Siphon" } },
];

export const ROAST_LEVELS: {
  id: RoastLevel;
  icon: string;
  label: { es: string; en: string };
}[] = [
  { id: "light", icon: "◌", label: { es: "Tueste claro", en: "Light roast" } },
  { id: "medium", icon: "◐", label: { es: "Tueste medio", en: "Medium roast" } },
  { id: "dark", icon: "●", label: { es: "Tueste oscuro", en: "Dark roast" } },
];

export const CUPPING_THRESHOLDS = [80, 85, 88] as const;

export const SOURCING_MODELS: {
  id: SourcingModel;
  label: { es: string; en: string };
}[] = [
  { id: "direct", label: { es: "Compra directa", en: "Direct trade" } },
  { id: "third-party", label: { es: "Vía importador", en: "Third-party importer" } },
  { id: "both", label: { es: "Ambas", en: "Both" } },
];

export type SourcingFilter = Exclude<SourcingModel, "both">;

export const SOURCING_FILTERS = SOURCING_MODELS.filter(
  (model): model is (typeof SOURCING_MODELS)[number] & { id: SourcingFilter } =>
    model.id !== "both",
);

export function placeHasRoastLevel(place: Place, level: RoastLevel): boolean {
  return place.roastLevels?.includes(level) ?? false;
}

export function placeMeetsCuppingScore(place: Place, minimum: number): boolean {
  const highest = place.cuppingScoreMax ?? place.cuppingScoreMin;
  return typeof highest === "number" && highest >= minimum;
}

export function placeMatchesSourcing(place: Place, wanted: SourcingFilter): boolean {
  if (place.category !== "roastery" || !place.sourcingModel) return false;
  return place.sourcingModel === wanted || place.sourcingModel === "both";
}

/**
 * New listings carry an explicit program. Older listings still work: their
 * detailed menu items are enough to infer the same answer until the team edits
 * them. This avoids making the new filter look empty on launch day.
 */
export function placeHasDrinkStyle(place: Place, style: DrinkStyle): boolean {
  if (place.drinkStyles?.includes(style)) return true;

  if (style === "espresso") {
    return ["espresso", "cortado", "flat-white", "cappuccino", "latte", "americano"].some(
      (item) => placeHasItem(place, item),
    );
  }

  return (
    Boolean(place.filterMethods?.length) ||
    place.flags.includes("filterMethods") ||
    ["filtrado", "aeropress"].some((item) => placeHasItem(place, item))
  );
}
