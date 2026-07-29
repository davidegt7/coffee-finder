/**
 * Two-language UI strings, no dependencies.
 *
 * Spanish is the source of truth (Santiago app first), and `EN` is typed as
 * `Record<keyof typeof ES, string>` so the compiler refuses to build if a key
 * exists in one language and not the other. You cannot ship a half-translated
 * string by accident.
 *
 * Attribute and category labels are NOT here — they carry { es, en } on the data
 * itself. This file is only UI chrome.
 */

export type Lang = "es" | "en";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "es", label: "ES" },
  { id: "en", label: "EN" },
];

const ES = {
  "app.tagline": "Café de verdad en Santiago. Gratis, siempre.",
  "app.loading": "Cargando cafés…",
  "app.loadError": "No se pudieron cargar los cafés.",

  "search.placeholder": "Buscar café, comuna o preparación…",
  "search.label": "Buscar",
  "filter.clear": "Limpiar ({n})",

  "menu.item": "Qué buscas",
  "menu.attrs": "Características",
  "menu.category": "Tipo de lugar",

  "item.emptyTitle": "Nadie ha registrado esto todavía",
  "item.countTitle": "{n} lugares",
  "item.pickIntent": "Elige qué andas buscando.",
  "item.hintA": "Combínalo con",
  "item.hintB": "— filtrado + tuesta acá. Los",
  "item.hintC": "son lo que nadie ha registrado todavía.",

  "attrs.claimHintA": "Toca una vez para",
  "attrs.claimHintOptions": "hay opciones",
  "attrs.claimHintB": ", otra vez para",
  "attrs.claimHint100": "100%",
  "attrs.flagNote": "Lo de abajo son datos simples: o están o no se sabe.",

  "verified.label": "Solo comprobado",
  "verified.desc": "Esconde lo que solo dice el local. Mapa mucho más chico, pero confiable.",

  "strictness.some": "hay opciones",
  "strictness.all": "100%",

  "map.locate": "Dónde estoy",
  "map.place": "lugar",
  "map.places": "lugares",
  "map.ofTotal": "de {n}",

  "list.emptyTitle": "Ningún café cumple con esto.",
  "list.emptyVerified":
    "«Solo comprobado» es un filtro duro — casi nada está comprobado todavía. Prueba apagarlo.",
  "list.emptyHint": "Prueba con menos filtros, o cuéntanos de un café que conozcas.",
  "list.clearFilters": "Limpiar filtros",

  "sheet.directions": "Cómo llegar",
  "sheet.website": "Sitio web",
  "sheet.whatYouFind": "Qué encuentras",
  "sheet.whatWeKnow": "Lo que sabemos",
  "sheet.amenities": "Datos del local",
  "sheet.edit": "✎ Editar",
  "sheet.gapNote":
    "{n} de 4 sin comprobar. Nadie publica si tuesta de verdad ni con qué aceite cocina — esa respuesta solo la trae alguien que pregunta en el local.",
  "sheet.reviews": "Reseñas",
  "sheet.noReviews": "Nadie ha reseñado este café todavía.",
  "sheet.writeReview": "Escribir reseña",
  "sheet.speaksOf": "Habla de:",
  "sheet.sources": "Fuentes de esta ficha",
  "sheet.caveat": "Ojo:",
  "common.close": "Cerrar",
  "common.anon": "Anónimo",

  "review.bodyPlaceholder":
    "¿Cómo estuvo el café? Sé específico: qué pediste, cómo lo prepararon, qué preguntaste.",
  "review.namePlaceholder": "Tu nombre (opcional)",
  "review.speaksLegend": "¿De qué puedes hablar con conocimiento?",
  "review.publish": "Publicar reseña",
  "review.localNote": "Por ahora las reseñas se guardan solo en este teléfono.",
  "review.ratingLabel": "{n} de 5",

  "claim.uncheckedStatus": "Nadie ha comprobado",
  "claim.no": "No",
  "claim.scopeAll": "Todo el local",
  "claim.scopeSome": "Hay opciones",
  "claim.confVerified": "comprobado en terreno",
  "claim.confClaimed": "lo dice el local",
  "claim.confUnverified": "sin comprobar",
  "claim.gap": "¿Sabes la respuesta? Esto es justo lo que falta.",
  "claim.source": "Fuente:",

  "badge.scope100": "· 100%",
  "badge.scopeOptions": "· opciones",
  "badge.scopeNone": "Sin {label}",
  "badge.titleVerified": "Alguien lo comprobó en terreno.",
  "badge.titleClaimed": "Lo dice el local o una fuente publicada. Nadie lo ha comprobado.",
  "badge.srVerified": " (comprobado)",
  "badge.srUnverified": " (sin comprobar)",

  "admin.notConfigured":
    "Falta crear el proyecto de Supabase y setear VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Ver README.",
  "admin.notConfiguredLead": "Admin sin configurar.",
  "admin.checking": "Revisando sesión…",
  "admin.linkSentA": "Te mandamos un link a",
  "admin.linkSentB": ". Ábrelo en este mismo teléfono.",
  "admin.emailPlaceholder": "tu@email.com",
  "admin.enter": "Entrar",
  "admin.notEditor": "no está en la lista de editores.",
  "admin.signOut": "Salir",
  "admin.addPlace": "+ Agregar café",

  "editor.dialogLabel": "Editar café",
  "editor.new": "Nuevo café",
  "editor.editing": "Editando",
  "editor.noName": "Sin nombre",
  "editor.basics": "Lo básico",
  "editor.name": "Nombre",
  "editor.type": "Tipo",
  "editor.where": "Dónde queda",
  "editor.geoPlaceholder": "Dirección o nombre, ej: Merced 838",
  "editor.search": "Buscar",
  "editor.searching": "Buscando…",
  "editor.geoNoResults": "Sin resultados dentro de Santiago. Prueba con la dirección.",
  "editor.noStreet": "sin calle",
  "editor.geoHint": "Busca la dirección — las coordenadas no se escriben a mano.",
  "editor.scopeUnknown": "Nadie ha comprobado",
  "editor.scopeAll": "Todo el local",
  "editor.scopeSome": "Hay opciones",
  "editor.scopeNone": "No",
  "editor.confUnverified": "Sin comprobar",
  "editor.confClaimed": "Lo dice el local",
  "editor.confVerified": "Lo comprobé en terreno",
  "editor.sourcePlaceholder": "Fuente — URL, o «pregunté en la barra»",
  "editor.notePlaceholder": "Detalle: «tuestan el 70%, el resto lo compran»",
  "editor.amenities": "Datos del local",
  "editor.sourcesAndCaveats": "Fuentes y avisos",
  "editor.sourcesLabel": "Fuentes (una por línea)",
  "editor.caveatLabel": "Aviso (opcional)",
  "editor.caveatPlaceholder": "Ej: cambiaron de dirección hace poco",
  "editor.saveHint":
    "Falta: nombre, ubicación buscada, al menos una fuente, y una fuente por cada dato que no esté «sin comprobar».",
  "editor.cancel": "Cancelar",
  "editor.save": "Guardar",
  "editor.saving": "Guardando…",
  "editor.verifiedBy": "Comprobado por {who}, {date}",

  "review.teamBadge": "Equipo",
  "review.fromEveryone": "De la comunidad",
  "review.willBePinned": "Tu reseña se marcará como del equipo y quedará fijada arriba.",
  "review.signInWhy": "Para reseñar necesitas entrar con tu email. Sin cuenta, sin contraseña — te llega un link.",
  "review.signInCta": "Entrar",
  "review.signedInAs": "Estás como",

  "fav.save": "Guardar",
  "fav.saved": "Guardado",
  "fav.onlySaved": "Solo mis guardados",
  "fav.onlySavedDesc": "Tienes {n} guardados.",
  "fav.signInToSave": "Entra para guardar cafés.",

  "auth.or": "o",
  "auth.google": "Continuar con Google",
  "auth.apple": "Continuar con Apple",

  "submit.cta": "¿Tienes una cafetería?",
  "submit.eyebrow": "Para dueños",
  "submit.title": "Súmate al mapa",
  "submit.intro": "Cuéntanos de tu cafetería. Revisamos cada solicitud a mano antes de publicarla.",
  "submit.aboutPlace": "Sobre el local",
  "submit.address": "Dirección",
  "submit.addressPlaceholder": "Calle y número, ej: Merced 838",
  "submit.comuna": "Comuna",
  "submit.whatApplies": "Qué aplica en tu local",
  "submit.assertsNote": "Esto queda registrado como lo que declara el local, no como algo comprobado. Si vamos y lo confirmamos, ahí cambia.",
  "submit.contact": "Contacto",
  "submit.contactEmail": "Email de contacto",
  "submit.contactName": "Tu nombre",
  "submit.note": "Algo más que debamos saber",
  "submit.notePlaceholder": "Horarios, qué tuestan, algo que nos ayude a revisar…",
  "submit.required": "Faltan: nombre, dirección y un email de contacto válido.",
  "submit.send": "Enviar solicitud",
  "submit.thanksTitle": "¡Gracias!",
  "submit.thanksBody": "Recibimos tu solicitud. La revisamos a mano y te escribimos si necesitamos algo más.",

  "queue.title": "Solicitudes",
  "queue.claims": "Declara:",
  "queue.review": "Revisar y publicar",
  "queue.reject": "Descartar",
  "queue.note": "«Revisar y publicar» abre el editor con los datos del local. Igual hay que buscar la dirección — las coordenadas nunca se escriben a mano.",
} as const;

const EN: Record<keyof typeof ES, string> = {
  "app.tagline": "Real coffee in Santiago. Free, always.",
  "app.loading": "Loading cafés…",
  "app.loadError": "Couldn't load cafés.",

  "search.placeholder": "Search café, neighborhood or brew…",
  "search.label": "Search",
  "filter.clear": "Clear ({n})",

  "menu.item": "What you want",
  "menu.attrs": "Characteristics",
  "menu.category": "Place type",

  "item.emptyTitle": "Nobody has logged this yet",
  "item.countTitle": "{n} places",
  "item.pickIntent": "Pick what you\u2019re after.",
  "item.hintA": "Combine it with",
  "item.hintB": "— pour over + roasts on-site. The",
  "item.hintC": "are what nobody has logged yet.",

  "attrs.claimHintA": "Tap once for",
  "attrs.claimHintOptions": "has options",
  "attrs.claimHintB": ", again for",
  "attrs.claimHint100": "100%",
  "attrs.flagNote": "Below are plain facts: either they're there or nobody has said.",

  "verified.label": "Verified only",
  "verified.desc": "Hides what the place merely claims. A much smaller map, but a trustworthy one.",

  "strictness.some": "has options",
  "strictness.all": "100%",

  "map.locate": "Where am I",
  "map.place": "place",
  "map.places": "places",
  "map.ofTotal": "of {n}",

  "list.emptyTitle": "No café matches this.",
  "list.emptyVerified":
    "“Verified only” is a hard filter — almost nothing is verified yet. Try turning it off.",
  "list.emptyHint": "Try fewer filters, or tell us about a café you know.",
  "list.clearFilters": "Clear filters",

  "sheet.directions": "Directions",
  "sheet.website": "Website",
  "sheet.whatYouFind": "What you'll find",
  "sheet.whatWeKnow": "What we know",
  "sheet.amenities": "About the place",
  "sheet.edit": "✎ Edit",
  "sheet.gapNote":
    "{n} of 4 unchecked. Nobody publishes whether they really roast, or what oil they cook with — that answer only comes from someone who asks in person.",
  "sheet.reviews": "Reviews",
  "sheet.noReviews": "Nobody has reviewed this café yet.",
  "sheet.writeReview": "Write a review",
  "sheet.speaksOf": "Speaks to:",
  "sheet.sources": "Sources for this entry",
  "sheet.caveat": "Heads up:",
  "common.close": "Close",
  "common.anon": "Anonymous",

  "review.bodyPlaceholder":
    "How was the coffee? Be specific: what you ordered, how they brewed it, what you asked.",
  "review.namePlaceholder": "Your name (optional)",
  "review.speaksLegend": "What can you speak to from experience?",
  "review.publish": "Post review",
  "review.localNote": "For now reviews are saved only on this phone.",
  "review.ratingLabel": "{n} of 5",

  "claim.uncheckedStatus": "Nobody has checked",
  "claim.no": "No",
  "claim.scopeAll": "Whole place",
  "claim.scopeSome": "Has options",
  "claim.confVerified": "checked in person",
  "claim.confClaimed": "the place says so",
  "claim.confUnverified": "unchecked",
  "claim.gap": "Know the answer? This is exactly what's missing.",
  "claim.source": "Source:",

  "badge.scope100": "· 100%",
  "badge.scopeOptions": "· options",
  "badge.scopeNone": "No {label}",
  "badge.titleVerified": "Someone checked this in person.",
  "badge.titleClaimed": "The place or a published source says so. Nobody has checked.",
  "badge.srVerified": " (verified)",
  "badge.srUnverified": " (unchecked)",

  "admin.notConfigured":
    "The Supabase project still needs creating and VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY setting. See README.",
  "admin.notConfiguredLead": "Admin not configured.",
  "admin.checking": "Checking session…",
  "admin.linkSentA": "We sent a link to",
  "admin.linkSentB": ". Open it on this same phone.",
  "admin.emailPlaceholder": "you@email.com",
  "admin.enter": "Sign in",
  "admin.notEditor": "isn't on the editors list.",
  "admin.signOut": "Sign out",
  "admin.addPlace": "+ Add café",

  "editor.dialogLabel": "Edit café",
  "editor.new": "New café",
  "editor.editing": "Editing",
  "editor.noName": "No name",
  "editor.basics": "The basics",
  "editor.name": "Name",
  "editor.type": "Type",
  "editor.where": "Where it is",
  "editor.geoPlaceholder": "Address or name, e.g. Merced 838",
  "editor.search": "Search",
  "editor.searching": "Searching…",
  "editor.geoNoResults": "No results inside Santiago. Try the address.",
  "editor.noStreet": "no street",
  "editor.geoHint": "Search the address — coordinates are never typed by hand.",
  "editor.scopeUnknown": "Nobody has checked",
  "editor.scopeAll": "Whole place",
  "editor.scopeSome": "Has options",
  "editor.scopeNone": "No",
  "editor.confUnverified": "Unchecked",
  "editor.confClaimed": "The place says so",
  "editor.confVerified": "I checked in person",
  "editor.sourcePlaceholder": "Source — URL, or “asked at the bar”",
  "editor.notePlaceholder": "Detail: “they roast 70%, buy the rest”",
  "editor.amenities": "About the place",
  "editor.sourcesAndCaveats": "Sources & caveats",
  "editor.sourcesLabel": "Sources (one per line)",
  "editor.caveatLabel": "Caveat (optional)",
  "editor.caveatPlaceholder": "E.g. they moved address recently",
  "editor.saveHint":
    "Missing: a name, a searched location, at least one source, and a source for every fact that isn't “unchecked”.",
  "editor.cancel": "Cancel",
  "editor.save": "Save",
  "editor.saving": "Saving…",
  "editor.verifiedBy": "Checked by {who}, {date}",

  "review.teamBadge": "Team",
  "review.fromEveryone": "From the community",
  "review.willBePinned": "Your review will be marked as the team's and pinned to the top.",
  "review.signInWhy": "To review, sign in with your email. No account, no password — we send you a link.",
  "review.signInCta": "Sign in",
  "review.signedInAs": "Signed in as",

  "fav.save": "Save",
  "fav.saved": "Saved",
  "fav.onlySaved": "Only my saved",
  "fav.onlySavedDesc": "You have {n} saved.",
  "fav.signInToSave": "Sign in to save cafés.",

  "auth.or": "or",
  "auth.google": "Continue with Google",
  "auth.apple": "Continue with Apple",

  "submit.cta": "Own a café?",
  "submit.eyebrow": "For owners",
  "submit.title": "Get on the map",
  "submit.intro": "Tell us about your café. We review every request by hand before publishing it.",
  "submit.aboutPlace": "About the place",
  "submit.address": "Address",
  "submit.addressPlaceholder": "Street and number, e.g. Merced 838",
  "submit.comuna": "Neighborhood",
  "submit.whatApplies": "What applies at your place",
  "submit.assertsNote": "This is recorded as what the place states, not as something checked. If we visit and confirm it, that changes.",
  "submit.contact": "Contact",
  "submit.contactEmail": "Contact email",
  "submit.contactName": "Your name",
  "submit.note": "Anything else we should know",
  "submit.notePlaceholder": "Hours, what you roast, anything that helps us review…",
  "submit.required": "Missing: a name, an address, and a valid contact email.",
  "submit.send": "Send request",
  "submit.thanksTitle": "Thank you!",
  "submit.thanksBody": "We got your request. We review these by hand and will email if we need anything else.",

  "queue.title": "Requests",
  "queue.claims": "States:",
  "queue.review": "Review & publish",
  "queue.reject": "Dismiss",
  "queue.note": "“Review & publish” opens the editor with the owner's details. You still have to search the address — coordinates are never typed by hand.",
};

const STRINGS: Record<Lang, Record<keyof typeof ES, string>> = { es: ES, en: EN };

export type StringKey = keyof typeof ES;

export function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[lang][key] ?? STRINGS.es[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  return s;
}

const STORAGE_KEY = "coffeefinder.lang";

/** Persisted choice, else the browser's, else Spanish (this is a Santiago app). */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")
    ? "en"
    : "es";
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
