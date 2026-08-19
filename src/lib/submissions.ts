import type { Category } from "../types";
import { isSupabaseConfigured, supabase } from "./auth";

/**
 * Owner submissions: the one open write in the app.
 *
 * A café owner shouldn't need an account to ask to be listed, so this accepts
 * anonymous inserts. That's safe only because it's a dead end — submissions
 * render nowhere public. The worst a spammer achieves is noise in a queue that
 * only editors ever open.
 *
 * Nothing here becomes a place automatically. What an owner asserts about their
 * own café is, by definition, a `claimed` fact with the owner as its source —
 * promoting it is an editor's judgement call, and the resulting claims carry
 * that provenance rather than arriving pre-blessed.
 */
export interface Submission {
  id: string;
  name: string;
  category: Category;
  address: string;
  comuna?: string;
  city: string;
  country: string;
  countryCode?: string;
  website?: string;
  instagram?: string;
  contactEmail: string;
  contactName?: string;
  /** Claim/flag keys the owner says apply. Their word, recorded as their word. */
  asserts: string[];
  /** Broad public-search intents: drink here, buy beans, or buy equipment. */
  items: string[];
  coffeeBrand: string;
  specialtyCoffee?: boolean;
  coffeePhotoUrl?: string;
  photoUrls: string[];
  /** First photo retained for compatibility with older editor builds. */
  photoUrl?: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface SubmissionRow {
  id: string;
  name: string;
  category: string;
  address: string;
  comuna: string | null;
  city: string;
  country: string;
  country_code: string | null;
  website: string | null;
  instagram: string | null;
  contact_email: string;
  contact_name: string | null;
  asserts: string[] | null;
  items: string[] | null;
  coffee_brand: string | null;
  specialty_coffee: boolean | null;
  coffee_photo_url: string | null;
  photo_urls: string[] | null;
  photo_url: string | null;
  note: string | null;
  status: Submission["status"];
  created_at: string;
}

const rowToSubmission = (r: SubmissionRow): Submission => ({
  id: r.id,
  name: r.name,
  category: r.category as Category,
  address: r.address,
  comuna: r.comuna ?? undefined,
  city: r.city,
  country: r.country,
  countryCode: r.country_code ?? undefined,
  website: r.website ?? undefined,
  instagram: r.instagram ?? undefined,
  contactEmail: r.contact_email,
  contactName: r.contact_name ?? undefined,
  asserts: r.asserts ?? [],
  items: r.items ?? [],
  coffeeBrand: r.coffee_brand ?? "",
  specialtyCoffee: r.specialty_coffee ?? undefined,
  coffeePhotoUrl: r.coffee_photo_url ?? undefined,
  photoUrls: r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : [],
  photoUrl: r.photo_url ?? undefined,
  note: r.note ?? undefined,
  status: r.status,
  createdAt: r.created_at,
});

export async function submitPlace(input: {
  name: string;
  category: Category;
  address: string;
  comuna?: string;
  city: string;
  country: string;
  countryCode?: string;
  website?: string;
  instagram?: string;
  contactEmail: string;
  contactName?: string;
  asserts: string[];
  items: string[];
  coffeeBrand: string;
  specialtyCoffee: boolean;
  coffeePhotoUrl?: string;
  photoUrls: string[];
  note?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase no está configurado." };
  const sb = await supabase();
  const { error } = await sb!.from("submissions").insert({
    name: input.name.trim(),
    category: input.category,
    address: input.address.trim(),
    comuna: input.comuna?.trim() || null,
    city: input.city.trim(),
    country: input.country.trim(),
    country_code: input.countryCode?.trim().toLowerCase() || null,
    website: input.website?.trim() || null,
    instagram: input.instagram?.trim() || null,
    contact_email: input.contactEmail.trim(),
    contact_name: input.contactName?.trim() || null,
    asserts: input.asserts,
    items: input.items,
    coffee_brand: input.coffeeBrand.trim(),
    specialty_coffee: input.specialtyCoffee,
    coffee_photo_url: input.coffeePhotoUrl || null,
    photo_urls: input.photoUrls,
    photo_url: input.photoUrls[0] ?? null,
    note: input.note?.trim() || null,
  });
  return { error: error?.message ?? null };
}

/** Editors only — RLS returns nothing for anyone else. */
export async function loadSubmissions(): Promise<Submission[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = await supabase();
  const { data, error } = await sb!
    .from("submissions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as SubmissionRow[]).map(rowToSubmission);
}

export async function setSubmissionStatus(
  id: string,
  status: "approved" | "rejected",
  reviewer: string,
): Promise<{ error: string | null }> {
  const sb = await supabase();
  if (!sb) return { error: "Supabase no está configurado." };
  const { error } = await sb
    .from("submissions")
    .update({ status, reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}
