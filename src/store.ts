import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Category, ClaimKey, FlagKey, Place } from "./types";
import { loadPlaces, savePlace } from "./lib/places";
import { addReview, loadReviews, type Review } from "./lib/reviews";
import { loadSubmissions, type Submission } from "./lib/submissions";
import { addFavorite, loadFavorites, removeFavorite } from "./lib/favorites";
import { EMPTY_FILTERS, type ClaimStrictness, type Filters } from "./lib/filters";
import { checkIsEditor, getSession, isSupabaseConfigured, onAuthChange } from "./lib/auth";
import { initialLang, persistLang, type Lang } from "./lib/i18n";
import { applyTheme, initialTheme, type Theme } from "./lib/theme";

interface State {
  places: Place[];
  reviews: Review[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  filters: Filters;
  selectedId: string | null;
  lang: Lang;
  theme: Theme;

  // --- admin ---
  /** Admin mode is a URL flag (?admin=1), NOT a secret. It reveals a form; the
   *  database decides whether anything it produces is allowed to land. */
  adminMode: boolean;
  session: Session | null;
  isEditor: boolean;
  authReady: boolean;
  editing: Place | "new" | null;
  /** Place ids the signed-in user has saved. Empty when signed out. */
  favorites: string[];
  submissions: Submission[];
  /** The public "list your café" form. */
  submitOpen: boolean;

  init: () => Promise<void>;
  setClaim: (key: ClaimKey, value: ClaimStrictness) => void;
  toggleFlag: (flag: FlagKey) => void;
  toggleCategory: (category: Category) => void;
  toggleItem: (itemId: string) => void;
  setQuery: (query: string) => void;
  setVerifiedOnly: (value: boolean) => void;
  setSavedOnly: (value: boolean) => void;
  setCity: (city: string | null) => void;
  toggleComuna: (comuna: string) => void;
  resetFilters: () => void;
  select: (id: string | null) => void;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  submitReview: (review: {
    placeId: string;
    rating: number;
    body: string;
    author: string;
    speaksTo: ClaimKey[];
  }) => Promise<{ error: string | null }>;
  refreshReviews: () => Promise<void>;
  setSubmitOpen: (open: boolean) => void;
  refreshSubmissions: () => Promise<void>;
  toggleFavorite: (placeId: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;

  refreshAuth: () => Promise<void>;
  setEditing: (p: Place | "new" | null) => void;
  persistPlace: (p: Place) => Promise<{ error: string | null }>;
}

export const useStore = create<State>((set, get) => ({
  places: [],
  reviews: [],
  status: "idle",
  error: null,
  filters: EMPTY_FILTERS,
  selectedId: null,
  lang: initialLang(),
  theme: initialTheme(),

  adminMode: new URLSearchParams(window.location.search).has("admin"),
  session: null,
  isEditor: false,
  authReady: false,
  editing: null,
  favorites: [],
  submissions: [],
  submitOpen: false,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const places = await loadPlaces();
      set({ places, status: "ready" });
      // Reviews are secondary — never let them delay or break the map.
      void loadReviews().then((reviews) => set({ reviews })).catch(() => {});
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
    // Auth is no longer admin-only: anyone signed in can leave a review, so the
    // session has to be resolved on the public site too. Non-editors simply get
    // isEditor:false and see no admin chrome.
    if (isSupabaseConfigured()) {
      await get().refreshAuth();
      void onAuthChange(() => void get().refreshAuth());
    } else {
      set({ authReady: true });
    }
  },

  refreshAuth: async () => {
    const session = await getSession();
    const isEditor = session ? await checkIsEditor() : false;
    set({ session, isEditor, authReady: true });
    // RLS returns nothing to non-editors, so this is safe to call regardless.
    if (isEditor) void get().refreshSubmissions();
    // Favorites follow the session: signing out must empty the list rather than
    // leave the previous account's saves on screen.
    if (session) void get().refreshFavorites();
    else set({ favorites: [] });
  },

  setEditing: (editing) => set({ editing }),

  persistPlace: async (place) => {
    const res = await savePlace(place);
    if (!res.error) {
      // Re-read rather than patch in memory: the database applies triggers and
      // constraints, so what it stored is the truth, not what we sent.
      try {
        const places = await loadPlaces();
        set({ places, editing: null });
      } catch {
        set({ editing: null });
      }
    }
    return res;
  },

  setClaim: (key, value) =>
    set((s) => ({ filters: { ...s.filters, claims: { ...s.filters.claims, [key]: value } } })),

  toggleFlag: (flag) =>
    set((s) => ({
      filters: {
        ...s.filters,
        flags: s.filters.flags.includes(flag)
          ? s.filters.flags.filter((f) => f !== flag)
          : [...s.filters.flags, flag],
      },
    })),

  toggleCategory: (category) =>
    set((s) => ({
      filters: {
        ...s.filters,
        categories: s.filters.categories.includes(category)
          ? s.filters.categories.filter((c) => c !== category)
          : [...s.filters.categories, category],
      },
    })),

  toggleItem: (itemId) =>
    set((s) => ({
      filters: {
        ...s.filters,
        items: s.filters.items.includes(itemId)
          ? s.filters.items.filter((i) => i !== itemId)
          : [...s.filters.items, itemId],
      },
    })),

  setQuery: (query) => set((s) => ({ filters: { ...s.filters, query } })),
  setVerifiedOnly: (verifiedOnly) => set((s) => ({ filters: { ...s.filters, verifiedOnly } })),
  setSavedOnly: (savedOnly) => set((s) => ({ filters: { ...s.filters, savedOnly } })),

  // Changing city clears comunas: a comuna from the previous city would filter
  // everything to nothing, from a control the user can no longer see.
  setCity: (city) => set((s) => ({ filters: { ...s.filters, city, comunas: [] } })),

  toggleComuna: (comuna) =>
    set((s) => ({
      filters: {
        ...s.filters,
        comunas: s.filters.comunas.includes(comuna)
          ? s.filters.comunas.filter((c) => c !== comuna)
          : [...s.filters.comunas, comuna],
      },
    })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  select: (selectedId) => set({ selectedId }),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  setLang: (lang) => {
    persistLang(lang);
    document.documentElement.lang = lang;
    set({ lang });
  },

  submitReview: async (review) => {
    const res = await addReview(review);
    // Re-read rather than patch: is_team is decided by the database, so the
    // stored row is the truth and the optimistic version would be a guess.
    if (!res.error) await get().refreshReviews();
    return res;
  },

  refreshReviews: async () => {
    try {
      set({ reviews: await loadReviews() });
    } catch {
      /* reviews are secondary; never break the map over them */
    }
  },

  setSubmitOpen: (submitOpen) => set({ submitOpen }),

  refreshFavorites: async () => {
    try {
      set({ favorites: await loadFavorites() });
    } catch {
      /* ignore */
    }
  },

  toggleFavorite: async (placeId) => {
    const on = get().favorites.includes(placeId);
    // Optimistic: a heart that waits on a round-trip feels broken. Reverted
    // below if the write actually fails.
    set((s) => ({
      favorites: on ? s.favorites.filter((p) => p !== placeId) : [...s.favorites, placeId],
    }));
    const { error } = on ? await removeFavorite(placeId) : await addFavorite(placeId);
    if (error) {
      set((s) => ({
        favorites: on ? [...s.favorites, placeId] : s.favorites.filter((p) => p !== placeId),
      }));
    }
  },

  refreshSubmissions: async () => {
    try {
      set({ submissions: await loadSubmissions() });
    } catch {
      /* ignore */
    }
  },
}));
