import type { Lang } from "./i18n";

export const DEFAULT_COUNTRY = "Chile";
export const DEFAULT_COUNTRY_CODE = "cl";

export function normalizeCountryCode(value?: string | null): string {
  const clean = value?.trim().toLowerCase();
  return clean && /^[a-z]{2}$/.test(clean) ? clean : "";
}

export function countryName(code: string, fallback: string, lang: Lang): string {
  const normalized = normalizeCountryCode(code);
  if (!normalized || typeof Intl.DisplayNames !== "function") return fallback;
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(normalized.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}


/**
 * Which continent a country sits on.
 *
 * The country list is derived from the data and sorted by how many places each
 * holds, so Denmark landed between Chile and Canada and the list read as a pile
 * rather than a map. Grouping is the only thing that makes a worldwide list
 * scannable — you know which continent you want before you know which country.
 *
 * Five continents, as taught in Chile, rather than the seven-way split: the
 * app's Spanish is the source of truth, and "América" is one place there.
 *
 * The table is full ISO-3166-alpha-2 rather than only the countries currently
 * on the map. A country added tomorrow has to land somewhere, and a lookup that
 * misses would silently drop it into "Otros".
 */
const BY_CONTINENT: Record<string, string> = {};
const REGISTER = (continent: string, codes: string) => {
  for (const code of codes.split(" ")) BY_CONTINENT[code] = continent;
};

REGISTER(
  "europe",
  "ad al at ax ba be bg by ch cy cz de dk ee es fi fo fr gb gg gi gr hr hu ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sk sm ua va xk",
);
REGISTER(
  "americas",
  "ag ai ar aw bb bl bm bo bq br bs bz ca cl co cr cu cw dm do ec fk gd gf gl gp gt gy hn ht jm kn ky lc mf mq ms mx ni pa pe pm pr py sr sv sx tc tt uy us ve vc vg vi bv gs",
);
REGISTER(
  "asia",
  "ae af am az bd bh bn bt cc cn cx ge hk id il in io iq ir jo jp kg kh kp kr kw kz la lb lk mm mn mo mv my np om ph pk ps qa sa sg sy th tj tl tm tr tw uz vn ye",
);
REGISTER(
  "africa",
  "ao bf bi bj bw cd cf cg ci cm cv dj dz eg eh er et ga gh gm gn gq gw ke km lr ls ly ma mg ml mr mu mw mz na ne ng re rw sc sd sh sl sn so ss st sz td tg tn tz ug yt za zm zw",
);
REGISTER(
  "oceania",
  "as au ck fj fm gu hm ki mh mp nc nf nr nu nz pf pg pn pw sb tk to tv um vu wf ws",
);

export type ContinentId = "americas" | "europe" | "asia" | "africa" | "oceania" | "other";

export const CONTINENT_LABELS: Record<ContinentId, { es: string; en: string }> = {
  americas: { es: "América", en: "Americas" },
  europe: { es: "Europa", en: "Europe" },
  asia: { es: "Asia", en: "Asia" },
  africa: { es: "África", en: "Africa" },
  oceania: { es: "Oceanía", en: "Oceania" },
  other: { es: "Otros", en: "Other" },
};

export function continentOf(countryCode: string): ContinentId {
  return (BY_CONTINENT[normalizeCountryCode(countryCode)] as ContinentId) ?? "other";
}
