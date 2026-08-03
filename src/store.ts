import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Category, ClaimKey, FlagKey, Place } from "./types";
import type { ChatMessage } from "./lib/brain";
import { loadPlaces, savePlace } from "./lib/places";
import { addReview, loadReviews, type Review } from "./lib/reviews";
import { loadSubmissions, type Submission } from "./lib/submissions";
import { addFavorite, loadFavorites, removeFavorite } from "./lib/favorites";
import { EMPTY_FILTERS, type ClaimStrictness, type Filters } from "./lib/filters";
import { checkIsEditor, getSession, isSupabaseConfigured, onAuthChange } from "./lib/auth";
import { initialLang, persistLang, type Lang } from "./lib/i18n";
import { applyTheme, initialTheme, type Theme } from "./lib/theme";
import { readPlaceParam, writePlaceParam } from "./lib/placeUrl";

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
  /** "Where to buy beans" — roasters who sell, and where. */
  beansOpen: boolean;

  // --- the brain ---
  /** The editor's chat with the local brain bridge. */
  brainOpen: boolean;
  /** Kept here, not in the panel, so closing the chat to review a draft in the
   *  editor doesn't throw away the conversation that produced it. */
  brainThread: ChatMessage[];
  brainSession?: string;
  /** Remaining cafés in a multi-place review, after the one in the editor. */
  draftQueue: Place[];
  draftBatchTotal: number;
  /** Bumped on every setEditing so the editor remounts — two drafts in a row
   *  would otherwise share a mount and the second one's fields never appear. */
  editSeq: number;

  init: () => Promise<void>;
  setClaim: (key: ClaimKey, value: ClaimStrictness) => void;
  toggleFlag: (flag: FlagKey) => void;
  toggleCategory: (category: Category) => void;
  toggleItem: (itemId: string) => void;
  setQuery: (query: string) => void;
  setVerifiedOnly: (value: boolean) => void;
  setSavedOnly: (value: boolean) => void;
  setCountry: (countryCode: string | null) => void;
  setCity: (city: string | null) => void;
  toggleComuna: (comuna: string) => void;
  resetFilters: () => void;
  select: (id: string | null) => void;
  syncFromUrl: () => void;
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
  setBeansOpen: (open: boolean) => void;
  refreshSubmissions: () => Promise<void>;
  toggleFavorite: (placeId: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;

  setBrainOpen: (open: boolean) => void;
  addBrainTurn: (turn: ChatMessage, sessionId?: string) => void;
  clearBrainThread: () => void;
  startDraftBatch: (places: Place[]) => void;
  skipDraft: () => void;

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
  beansOpen: false,
  brainOpen: false,
  brainThread: [],
  brainSession: undefined,
  draftQueue: [],
  draftBatchTotal: 0,
  editSeq: 0,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const places = await loadPlaces();
      // A shared link names a place we only just learned about, so the id is
      // resolved here rather than at startup. An id that no longer exists is
      // ignored: a café that closed should open the map, not an error.
      const shared = readPlaceParam();
      const selectedId = shared && places.some((p) => p.id === shared) ? shared : null;
      set({ places, status: "ready", selectedId });
      if (shared && !selectedId) writePlaceParam(null);
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

  setEditing: (editing) =>
    set((s) => ({
      editing,
      editSeq: s.editSeq + 1,
      // A direct edit or cancel leaves any prior batch behind deliberately.
      draftQueue: [],
      draftBatchTotal: 0,
    })),

  setBrainOpen: (brainOpen) => set({ brainOpen }),

  addBrainTurn: (turn, sessionId) =>
    set((s) => ({
      brainThread: [...s.brainThread, turn],
      // Keep the previous session when a turn carries none: a brain without
      // sessions echoes nothing back, and dropping it would restart the thread.
      brainSession: sessionId ?? s.brainSession,
    })),

  clearBrainThread: () => set({ brainThread: [], brainSession: undefined }),

  startDraftBatch: (places) => {
    const [first, ...rest] = places;
    if (!first) return;
    set((s) => ({
      editing: first,
      editSeq: s.editSeq + 1,
      draftQueue: rest,
      draftBatchTotal: places.length,
      brainOpen: false,
    }));
  },

  skipDraft: () =>
    set((s) => {
      const [next, ...remaining] = s.draftQueue;
      return {
        editing: next ?? null,
        draftQueue: remaining,
        draftBatchTotal: next ? s.draftBatchTotal : 0,
        editSeq: next ? s.editSeq + 1 : s.editSeq,
      };
    }),

  persistPlace: async (place) => {
    const res = await savePlace(place);
    if (!res.error) {
      // Re-read rather than patch in memory: the database applies triggers and
      // constraints, so what it stored is the truth, not what we sent.
      let freshPlaces: Place[] | undefined;
      try {
        freshPlaces = await loadPlaces();
      } catch {
        // The write succeeded. A refresh failure must not trap the editor on a
        // form that would create the same record again.
      }
      set((s) => {
        const [next, ...remaining] = s.draftQueue;
        return {
          ...(freshPlaces ? { places: freshPlaces } : {}),
          editing: next ?? null,
          draftQueue: remaining,
          draftBatchTotal: next ? s.draftBatchTotal : 0,
          editSeq: next ? s.editSeq + 1 : s.editSeq,
        };
      });
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

  setCountry: (countryCode) =>
    set((s) => ({ filters: { ...s.filters, countryCode, city: null, comunas: [] } })),

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
  select: (selectedId) => {
    writePlaceParam(selectedId);
    set({ selectedId });
  },

  /**
   * Back/forward moved us — adopt whatever the URL now says WITHOUT writing to
   * history again, or the two would push each other in a loop.
   */
  syncFromUrl: () => {
    const shared = readPlaceParam();
    const { places } = get();
    set({ selectedId: shared && places.some((p) => p.id === shared) ? shared : null });
  },

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

  setBeansOpen: (beansOpen) => set({ beansOpen }),

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
