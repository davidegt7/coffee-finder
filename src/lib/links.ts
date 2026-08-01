/**
 * Normalising the outward links on a listing.
 *
 * `instagram` has been filled by three different hands — an owner typing
 * "@cafealtura" into the submission form, an editor pasting a full URL, and now
 * the brain, which reads a café's own site and returns whatever that site
 * links to. The sheet used to build its href as
 * `https://instagram.com/${value}`, which is correct for the first two and
 * produces `https://www.instagram.com/https://www.instagram.com/cafealtura/`
 * for the third.
 *
 * Rather than police what gets stored — which would mean a migration, and would
 * still not cover the next hand that writes to it — accept all of the shapes at
 * the point of rendering.
 */

/** `@handle`, `handle`, `instagram.com/handle`, or a full URL — all fine. */
export function instagramUrl(raw: string): string {
  const value = raw.trim().replace(/^@+/, "");
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?instagram\.com\//i.test(value)) {
    return `https://${value.replace(/^www\./i, "")}`;
  }
  return `https://instagram.com/${value.replace(/^\/+/, "")}`;
}
