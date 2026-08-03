import { isSupabaseConfigured, supabase } from "./auth";
import { placeHasItem } from "./items";
import type { Place } from "../types";

/**
 * Where to buy the beans, and the one number we can honestly measure about it.
 *
 * We link people to a roaster's own shop and then go blind — nothing here can
 * see whether anyone bought. So this counts the only thing that is actually
 * ours to count: how many people we sent. No user id, no session, no per-click
 * row; see supabase/10-bean-clicks.sql for why the increment is an RPC rather
 * than an update policy.
 */

/** Item ids that mean "you can walk out with beans". */
const BEAN_ITEMS = ["grano-entero", "grano-molido"];

/**
 * A place belongs in the beans list when it sells beans AND we can say where.
 *
 * The link requirement is not a detail — this section exists to send someone
 * somewhere. A roaster with no site and no Instagram has nowhere to send them,
 * so listing it would be a row that looks like an answer and isn't. Those
 * places still appear on the map, which is where they're useful.
 */
export function sellsBeans(place: Place): boolean {
  return (
    place.flags.includes("sellsBeans") ||
    place.category === "roastery" ||
    BEAN_ITEMS.some((id) => placeHasItem(place, id))
  );
}

export function beanShopUrl(place: Place): string | undefined {
  const site = place.website?.trim();
  const instagram = place.instagram?.trim();
  return site || instagram || undefined;
}

export interface BeanSeller {
  place: Place;
  url: string;
  /** Instagram is a fallback, and the UI says so rather than implying a shop. */
  viaInstagram: boolean;
}

/**
 * Ordered by name, deliberately.
 *
 * Not by rating, not by who paid, not by anything we could later be accused of
 * selling. If placement is ever sold it has to be labelled as placement — an
 * unmarked paid ordering is the same category of small lie as a stock photo on
 * a real business, which this app already refuses to tell.
 */
export function beanSellers(places: Place[]): BeanSeller[] {
  return places
    .filter(sellsBeans)
    .map((place) => {
      const url = beanShopUrl(place);
      if (!url) return null;
      return { place, url, viaInstagram: !place.website?.trim() };
    })
    .filter((s): s is BeanSeller => s !== null)
    .sort((a, b) => a.place.name.localeCompare(b.place.name));
}

/**
 * Count one outbound click. Never blocks or delays the navigation.
 *
 * Fired and forgotten: the person clicked "buy coffee", and no analytics call
 * is worth making them wait or, worse, failing their click if Supabase is
 * unreachable. A lost tally is a rounding error; a lost sale is the feature
 * not working.
 */
export function recordBeanClick(placeId: string): void {
  if (!isSupabaseConfigured()) return;
  void (async () => {
    try {
      const sb = await supabase();
      await sb?.rpc("record_bean_click", { p_place_id: placeId });
    } catch {
      // Telemetry is never worth surfacing to someone who just wanted beans.
    }
  })();
}
