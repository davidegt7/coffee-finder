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
  website?: string;
  instagram?: string;
  contactEmail: string;
  contactName?: string;
  /** Claim/flag keys the owner says apply. Their word, recorded as their word. */
  asserts: string[];
  items: string[];
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
  website: string | null;
  instagram: string | null;
  contact_email: string;
  contact_name: string | null;
  asserts: string[] | null;
  items: string[] | null;
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
  website: r.website ?? undefined,
  instagram: r.instagram ?? undefined,
  contactEmail: r.contact_email,
  contactName: r.contact_name ?? undefined,
  asserts: r.asserts ?? [],
  items: r.items ?? [],
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
  website?: string;
  instagram?: string;
  contactEmail: string;
  contactName?: string;
  asserts: string[];
  items: string[];
  photoUrl?: string;
  note?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase no está configurado." };
  const sb = await supabase();
  const { error } = await sb!.from("submissions").insert({
    name: input.name.trim(),
    category: input.category,
    address: input.address.trim(),
    comuna: input.comuna?.trim() || null,
    website: input.website?.trim() || null,
    instagram: input.instagram?.trim() || null,
    contact_email: input.contactEmail.trim(),
    contact_name: input.contactName?.trim() || null,
    asserts: input.asserts,
    items: input.items,
    photo_url: input.photoUrl?.trim() || null,
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
