import { isSupabaseConfigured, supabase } from "./auth";

/**
 * Saved places, per account.
 *
 * Deliberately server-side rather than localStorage: the whole point of saving
 * a café is that it's still there on the phone you're holding when you're
 * actually near it. A device-local list fails exactly when it matters.
 *
 * `user_id` is never sent from here — Postgres defaults it from the JWT and RLS
 * checks it again on the way in. The client couldn't write into someone else's
 * list even if this file tried.
 */

export async function loadFavorites(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = await supabase();
  const { data, error } = await sb!.from("favorites").select("place_id");
  if (error) {
    // Signed-out users get an empty list, not an error — RLS returning nothing
    // is the correct answer to "what has this anonymous visitor saved".
    return [];
  }
  return (data as { place_id: string }[]).map((r) => r.place_id);
}

export async function addFavorite(placeId: string): Promise<{ error: string | null }> {
  const sb = await supabase();
  if (!sb) return { error: "Supabase no está configurado." };
  const { error } = await sb.from("favorites").insert({ place_id: placeId });
  return { error: error?.message ?? null };
}

export async function removeFavorite(placeId: string): Promise<{ error: string | null }> {
  const sb = await supabase();
  if (!sb) return { error: "Supabase no está configurado." };
  const { error } = await sb.from("favorites").delete().eq("place_id", placeId);
  return { error: error?.message ?? null };
}
