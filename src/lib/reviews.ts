import type { ClaimKey } from "../types";
import { isSupabaseConfigured, supabase } from "./auth";

/**
 * Reviews live in Supabase, not localStorage.
 *
 * They used to be device-local, which was fine as a sketch but makes "pin the
 * team's reviews above everyone else's" meaningless — nobody else could ever
 * see them. Sharing reviews forces the question of who may write one, and the
 * answer here is: anyone signed in.
 *
 * That's friction, and it's deliberate. An open write endpoint on a public map
 * is a spam magnet, and an unattributable review is worth little to a reader
 * anyway. Magic-link sign-in is the cheapest real identity there is and it was
 * already built for editors.
 *
 * `isTeam` is set by a database trigger from the editors allowlist — never sent
 * by this client. A badge you can award yourself isn't a badge.
 */
export interface Review {
  id: string;
  placeId: string;
  rating: number;
  body: string;
  author: string;
  speaksTo: ClaimKey[];
  isTeam: boolean;
  createdAt: string;
}

interface ReviewRow {
  id: string;
  place_id: string;
  rating: number;
  body: string;
  author: string;
  speaks_to: string[] | null;
  is_team: boolean;
  created_at: string;
}

const rowToReview = (r: ReviewRow): Review => ({
  id: r.id,
  placeId: r.place_id,
  rating: r.rating,
  body: r.body,
  author: r.author,
  speaksTo: (r.speaks_to ?? []) as ClaimKey[],
  isTeam: Boolean(r.is_team),
  createdAt: r.created_at,
});

export async function loadReviews(): Promise<Review[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = await supabase();
  const { data, error } = await sb!
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Could not load reviews:", error.message);
    return [];
  }
  return (data as ReviewRow[]).map(rowToReview);
}

export async function addReview(input: {
  placeId: string;
  rating: number;
  body: string;
  author: string;
  speaksTo: ClaimKey[];
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase no está configurado." };
  const sb = await supabase();
  // No is_team here on purpose — the trigger decides, from the allowlist.
  const { error } = await sb!.from("reviews").insert({
    place_id: input.placeId,
    rating: input.rating,
    body: input.body.trim(),
    author: input.author.trim() || "Anónimo",
    speaks_to: input.speaksTo,
  });
  return { error: error?.message ?? null };
}

export async function deleteReview(id: string): Promise<{ error: string | null }> {
  const sb = await supabase();
  if (!sb) return { error: "Supabase no está configurado." };
  const { error } = await sb.from("reviews").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/**
 * Team reviews first, then everyone else, each newest-first.
 *
 * Not a blunt `sort by isTeam` — the two groups are conceptually separate lists
 * that happen to render together, and keeping the comparison explicit stops a
 * future "sort by rating" from quietly unpinning the team.
 */
export function reviewsFor(placeId: string, all: Review[]): Review[] {
  const mine = all.filter((r) => r.placeId === placeId);
  const byDate = (a: Review, b: Review) => b.createdAt.localeCompare(a.createdAt);
  return [...mine.filter((r) => r.isTeam).sort(byDate), ...mine.filter((r) => !r.isTeam).sort(byDate)];
}
