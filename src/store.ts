import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Category, ClaimKey, FlagKey, Place, Review } from "./types";
import { addReview, loadPlaces, loadReviews, savePlace } from "./lib/places";
import { EMPTY_FILTERS, type ClaimStrictness, type Filters } from "./lib/filters";
import { checkIsEditor, getSession, isSupabaseConfigured, onAuthChange } from "./lib/auth";
import { initialLang, persistLang, type Lang } from "./lib/i18n";

interface State {
  places: Place[];
  reviews: Review[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  filters: Filters;
  selectedId: string | null;
  lang: Lang;

  // --- admin ---
  /** Admin mode is a URL flag (?admin=1), NOT a secret. It reveals a form; the
   *  database decides whether anything it produces is allowed to land. */
  adminMode: boolean;
  session: Session | null;
  isEditor: boolean;
  authReady: boolean;
  editing: Place | "new" | null;

  init: () => Promise<void>;
  setClaim: (key: ClaimKey, value: ClaimStrictness) => void;
  toggleFlag: (flag: FlagKey) => void;
  toggleCategory: (category: Category) => void;
  toggleItem: (itemId: string) => void;
  setQuery: (query: string) => void;
  setVerifiedOnly: (value: boolean) => void;
  resetFilters: () => void;
  select: (id: string | null) => void;
  setLang: (lang: Lang) => void;
  submitReview: (review: Omit<Review, "id" | "createdAt">) => void;

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

  adminMode: new URLSearchParams(window.location.search).has("admin"),
  session: null,
  isEditor: false,
  authReady: false,
  editing: null,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const places = await loadPlaces();
      set({ places, reviews: loadReviews(), status: "ready" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
    if (get().adminMode && isSupabaseConfigured()) {
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
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  select: (selectedId) => set({ selectedId }),

  setLang: (lang) => {
    persistLang(lang);
    document.documentElement.lang = lang;
    set({ lang });
  },

  submitReview: (review) => {
    const saved = addReview(review);
    set((s) => ({ reviews: [...s.reviews, saved] }));
  },
}));
