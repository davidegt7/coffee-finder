import { isSupabaseConfigured, supabase } from "./auth";
import type { Lang } from "./i18n";
import type { Place } from "../types";

export const PHOTO_PERMISSION_STATUSES = [
  "not_contacted",
  "sent",
  "follow_up",
  "approved",
  "declined",
  "no_response",
] as const;

export type PhotoPermissionStatus = (typeof PHOTO_PERMISSION_STATUSES)[number];
export type PhotoPermissionScope = "specific" | "general";

export interface PhotoPermission {
  placeId: string;
  contactName?: string;
  contactEmail?: string;
  status: PhotoPermissionStatus;
  photoUrls: string[];
  permissionScope: PhotoPermissionScope;
  evidence?: string;
  notes?: string;
  lastContactedAt?: string;
  followUpDueAt?: string;
  respondedAt?: string;
  updatedAt?: string;
}

interface PhotoPermissionRow {
  place_id: string;
  contact_name: string | null;
  contact_email: string | null;
  status: PhotoPermissionStatus;
  photo_urls: string[] | null;
  permission_scope: PhotoPermissionScope;
  evidence: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  follow_up_due_at: string | null;
  responded_at: string | null;
  updated_at: string;
}

const fromRow = (row: PhotoPermissionRow): PhotoPermission => ({
  placeId: row.place_id,
  contactName: row.contact_name ?? undefined,
  contactEmail: row.contact_email ?? undefined,
  status: row.status,
  photoUrls: row.photo_urls ?? [],
  permissionScope: row.permission_scope,
  evidence: row.evidence ?? undefined,
  notes: row.notes ?? undefined,
  lastContactedAt: row.last_contacted_at ?? undefined,
  followUpDueAt: row.follow_up_due_at ?? undefined,
  respondedAt: row.responded_at ?? undefined,
  updatedAt: row.updated_at,
});

export function blankPhotoPermission(placeId: string): PhotoPermission {
  return {
    placeId,
    status: "not_contacted",
    photoUrls: [],
    permissionScope: "specific",
  };
}

export async function loadPhotoPermissions(): Promise<{
  records: PhotoPermission[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) return { records: [], error: "Supabase is not configured." };
  const sb = await supabase();
  if (!sb) return { records: [], error: "Supabase is not configured." };
  const { data, error } = await sb
    .from("photo_permissions")
    .select("*")
    .order("updated_at", { ascending: false });
  return {
    records: error ? [] : (data as PhotoPermissionRow[]).map(fromRow),
    error: error?.message ?? null,
  };
}

export async function savePhotoPermission(
  record: PhotoPermission,
): Promise<{ record: PhotoPermission | null; error: string | null }> {
  if (!isSupabaseConfigured()) return { record: null, error: "Supabase is not configured." };
  const sb = await supabase();
  if (!sb) return { record: null, error: "Supabase is not configured." };
  const { data, error } = await sb
    .from("photo_permissions")
    .upsert(
      {
        place_id: record.placeId,
        contact_name: record.contactName?.trim() || null,
        contact_email: record.contactEmail?.trim().toLowerCase() || null,
        status: record.status,
        photo_urls: record.photoUrls.map((url) => url.trim()).filter(Boolean),
        permission_scope: record.permissionScope,
        evidence: record.evidence?.trim() || null,
        notes: record.notes?.trim() || null,
        last_contacted_at: record.lastContactedAt || null,
        follow_up_due_at: record.followUpDueAt || null,
        responded_at: record.respondedAt || null,
      },
      { onConflict: "place_id" },
    )
    .select("*")
    .single();
  return {
    record: error || !data ? null : fromRow(data as PhotoPermissionRow),
    error: error?.message ?? null,
  };
}

const productionPlaceUrl = (placeId: string) =>
  `https://davidegt7.github.io/coffee-finder/?place=${encodeURIComponent(placeId)}`;

/** A ready-to-send draft. The café still has to confirm it owns or can license the photos. */
export function photoPermissionEmail(
  place: Place,
  record: PhotoPermission,
  lang: Lang,
): { subject: string; body: string; mailto: string } {
  const name = record.contactName?.trim();
  const greeting = lang === "es" ? `Hola${name ? ` ${name}` : ""},` : `Hi${name ? ` ${name}` : ""},`;
  const urls = record.photoUrls.map((url) => url.trim()).filter(Boolean);
  const photoList = urls.length ? `\n\n${urls.map((url) => `- ${url}`).join("\n")}` : "";
  const body =
    lang === "es"
      ? `${greeting}\n\nSoy David y estoy construyendo Coffee Finder, un mapa gratuito para ayudar a la gente a descubrir cafeterías y tostadores de especialidad.\n\nMe encantaría destacar ${place.name}. ¿Nos autorizan a usar en su ficha las fotos indicadas abajo que el local posee o tiene derecho a licenciar? Las usaríamos únicamente dentro de Coffee Finder y mantendríamos el crédito que nos indiquen.${photoList}\n\nPueden ver la ficha aquí: ${productionPlaceUrl(place.id)}\n\nSi prefieren, también pueden enviarnos una foto específica y el crédito exacto. La autorización se puede retirar en cualquier momento y quitaremos la imagen.\n\nGracias,\nDavid\nCoffee Finder`
      : `${greeting}\n\nI'm David, building Coffee Finder, a free map that helps people discover specialty cafés and roasters.\n\nI'd love to feature ${place.name}. May we use the photos listed below that the business owns or has the right to license on its Coffee Finder listing? We would use them only within Coffee Finder and keep whatever credit you provide.${photoList}\n\nYou can view the listing here: ${productionPlaceUrl(place.id)}\n\nIf you prefer, you can send a specific photo and the exact credit. Permission can be withdrawn at any time and we'll remove the image.\n\nThanks,\nDavid\nCoffee Finder`;
  const subject =
    lang === "es"
      ? `¿Podemos destacar ${place.name} en Coffee Finder?`
      : `Can we feature ${place.name} on Coffee Finder?`;
  const mailto = `mailto:${encodeURIComponent(record.contactEmail?.trim() ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, mailto };
}

export function followUpDate(from = new Date()): string {
  return new Date(from.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
}
