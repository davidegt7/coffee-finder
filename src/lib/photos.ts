import { supabase } from "./auth";

/**
 * Photo upload, for someone standing in the café holding a phone.
 *
 * Two things happen before the bytes leave the device, and both matter more than
 * they look:
 *
 * 1. **Downscale and re-encode.** A modern phone photo is 3–6 MB and 4000px
 *    wide. The card shows it at 56px and the sheet at ~800px, so uploading the
 *    original wastes the free tier's 1 GB about 200 photos in, and makes the
 *    list crawl on Santiago mobile data. 1600px at JPEG 0.82 is
 *    indistinguishable here and lands around 200–400 KB.
 *
 * 2. **Strip EXIF, including GPS.** Canvas re-encoding drops the metadata as a
 *    side effect, which is the point: phone photos carry the coordinates of
 *    wherever they were taken, and quietly publishing an editor's location
 *    history along with their café photos would be a real privacy leak from a
 *    feature nobody would expect to have one.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas 2d context");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

export interface UploadResult {
  url: string | null;
  error: string | null;
}

async function uploadPhoto(
  file: File,
  bucket: "place-photos" | "submission-photos",
  key: string,
): Promise<UploadResult> {
  const sb = await supabase();
  if (!sb) return { url: null, error: "Supabase no está configurado." };

  if (!file.type.startsWith("image/")) {
    return { url: null, error: "Ese archivo no es una imagen." };
  }

  let blob: Blob;
  try {
    blob = await compress(file);
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : String(e) };
  }

  const { error } = await sb.storage
    .from(bucket)
    .upload(key, blob, { contentType: "image/jpeg", upsert: true });

  if (error) return { url: null, error: error.message };

  const { data } = sb.storage.from(bucket).getPublicUrl(key);
  return { url: data.publicUrl, error: null };
}

export async function uploadPlacePhoto(file: File, placeId: string): Promise<UploadResult> {
  // Keyed by place, with a timestamp so replacing a photo busts the CDN cache
  // rather than serving the old one from an unchanged URL.
  const key = `${placeId || "new"}/${Date.now()}.jpg`;
  return uploadPhoto(file, "place-photos", key);
}

/** Anonymous owner uploads go to their own tightly limited bucket. */
export async function uploadSubmissionPhoto(file: File): Promise<UploadResult> {
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return uploadPhoto(file, "submission-photos", `submissions/${id}.jpg`);
}
