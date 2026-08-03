/**
 * Accent- and case-folding for search and matching.
 *
 * Nobody types "Ñuñoa" with the tilde on a hurry, and a visitor searching
 * "cafe" means "Café". Treating those as different strings makes the search
 * look broken while the place is sitting right there in the list.
 *
 * NFD splits a letter into its base plus its combining marks, so stripping the
 * combining range turns é→e, ñ→n, ö→o, å→a. But a handful of letters are NOT
 * accented forms of anything — ø, æ, ß, ð, þ, ł are letters in their own right
 * and decompose to themselves. Those need saying explicitly, and they matter
 * here: this app has Copenhagen places in Nørrebro and Vesterbro that a search
 * for "norrebro" would otherwise never find.
 */

const STANDALONE: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ð: "d",
  þ: "th",
  đ: "d",
  ł: "l",
  ħ: "h",
  ı: "i",
};

export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics
    .replace(/[øæœßðþđłħı]/g, (ch) => STANDALONE[ch] ?? ch);
}
