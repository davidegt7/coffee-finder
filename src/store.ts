import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { AppSection, Category, ClaimKey, FlagKey, Place, Roaster } from "./types";
import type { ChatMessage } from "./lib/brain";
import { deletePlace, loadPlaces, savePlace } from "./lib/places";
import { addReview, loadReviews, type Review } from "./lib/reviews";
import { loadSubmissions, setSubmissionStatus, type Submission } from "./lib/submissions";
import { addFavorite, loadFavorites, removeFavorite } from "./lib/favorites";
import { EMPTY_FILTERS, type ClaimStrictness, type Filters } from "./lib/filters";
import {
  EMPTY_ROASTER_FILTERS,
  loadRoasters,
  type RoasterFilters,
} from "./lib/roasters";
import { checkIsEditor, getSession, isSupabaseConfigured, onAuthChange } from "./lib/auth";
import { initialLang, persistLang, type Lang } from "./lib/i18n";
import { applyTheme, initialTheme, type Theme } from "./lib/theme";
import { readPlaceParam, writePlaceParam } from "./lib/placeUrl";
import {
  readRoasterParam,
  readSectionParam,
  writeRoasterParam,
  writeSectionParam,
} from "./lib/roasterUrl";
import { getPosition, type Coords, type NearStatus } from "./lib/geo";

interface State {
  places: Place[];
  roasters: Roaster[];
  reviews: Review[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** Which directory the map + list are showing. */
  section: AppSection;
  filters: Filters;
  roasterFilters: RoasterFilters;
  selectedId: string | null;
  selectedRoasterId: string | null;
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
  /**
   * The submission being published, if the editor was opened from the queue.
   * Without it a successful publish left the request sitting in the inbox as
   * though nothing had happened, and the only way to clear it was "Descartar"
   * — the button that means the opposite.
   */
  reviewingSubmissionId: string | null;
  /** The public "list your café" form. */
  submitOpen: boolean;
  /** "Where to buy beans" — roasters who sell, and where. */
  beansOpen: boolean;
  /** A newer build is installed and waiting for a reload. */
  updateReady: boolean;

  /** Where the visitor is, once they've asked to sort by distance. */
  near: Coords | null;
  nearStatus: NearStatus;

  // --- the brain ---
  /** The editor's chat with the local brain bridge. */
  brainOpen: boolean;
  /** Kept here, not in the panel, so closing the chat to review a draft in the
   *  editor doesn't throw away the conversation that produced it. */
  brainThread: ChatMessage[];
  brainSession?: string;
  /** The unsent message in the Brain composer. */
  brainInput: string;
  /** Remaining cafés in a multi-place review, after the one in the editor. */
  draftQueue: Place[];
  draftBatchTotal: number;
  /** Bumped on every setEditing so the editor remounts — two drafts in a row
   *  would otherwise share a mount and the second one's fields never appear. */
  editSeq: number;

  init: () => Promise<void>;
  setSection: (section: AppSection) => void;
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
  setRoasterCountry: (countryCode: string | null) => void;
  setRoasterCity: (city: string | null) => void;
  setRoasterRegion: (region: string | null) => void;
  setRoasterQuery: (query: string) => void;
  toggleRoasterShipLocal: () => void;
  toggleRoasterShipIntl: () => void;
  toggleRoasterSubscription: () => void;
  resetRoasterFilters: () => void;
  select: (id: string | null) => void;
  selectRoaster: (id: string | null) => void;
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
  setUpdateReady: (ready: boolean) => void;
  findNearMe: () => Promise<void>;
  clearNear: () => void;
  refreshSubmissions: () => Promise<void>;
  toggleFavorite: (placeId: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;

  setBrainOpen: (open: boolean) => void;
  setBrainInput: (input: string) => void;
  addBrainTurn: (turn: ChatMessage, sessionId?: string) => void;
  clearBrainThread: () => void;
  startDraftBatch: (places: Place[]) => void;
  skipDraft: () => void;

  refreshAuth: () => Promise<void>;
  setEditing: (p: Place | "new" | null) => void;
  /** Update the open form without treating it as a newly opened editor. */
  saveEditingDraft: (p: Place) => void;
  reviewSubmission: (submissionId: string, p: Place) => void;
  persistPlace: (p: Place) => Promise<{ error: string | null }>;
  removePlace: (id: string) => Promise<{ error: string | null }>;
}

type SavedAdminWork = Pick<
  State,
  | "brainOpen"
  | "brainThread"
  | "brainSession"
  | "brainInput"
  | "editing"
  | "draftQueue"
  | "draftBatchTotal"
  | "reviewingSubmissionId"
>;

const ADMIN_WORK_KEY = "coffee-finder-admin-work-v1";
const hasAdminFlag = () => new URLSearchParams(window.location.search).has("admin");

/**
 * Brain research and a café form can represent a long session. Keep that work
 * on this device so a reload, closed tab, or browser restart is not a discard.
 * Public visits deliberately neither read nor overwrite the private admin
 * snapshot; returning to ?admin=1 is what resumes it.
 */
const readSavedAdminWork = (): Partial<SavedAdminWork> => {
  if (!hasAdminFlag()) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_WORK_KEY) ?? "null") as
      | Partial<SavedAdminWork>
      | null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const savedAdminWork = readSavedAdminWork();

const writeSavedAdminWork = (state: State) => {
  if (!state.adminMode || !hasAdminFlag()) return;
  const work: SavedAdminWork = {
    brainOpen: state.brainOpen,
    brainThread: state.brainThread,
    brainSession: state.brainSession,
    brainInput: state.brainInput,
    editing: state.editing,
    draftQueue: state.draftQueue,
    draftBatchTotal: state.draftBatchTotal,
    reviewingSubmissionId: state.reviewingSubmissionId,
  };
  try {
    localStorage.setItem(ADMIN_WORK_KEY, JSON.stringify(work));
  } catch {
    // Storage can be disabled or full. The editor still works for this tab;
    // it simply cannot promise a resume after the tab closes.
  }
};

export const useStore = create<State>((set, get) => ({
  places: [],
  roasters: [],
  reviews: [],
  status: "idle",
  error: null,
  section: readSectionParam(),
  filters: EMPTY_FILTERS,
  roasterFilters: { ...EMPTY_ROASTER_FILTERS },
  selectedId: null,
  selectedRoasterId: null,
  lang: initialLang(),
  theme: initialTheme(),

  adminMode: hasAdminFlag(),
  session: null,
  isEditor: false,
  authReady: false,
  editing: savedAdminWork.editing ?? null,
  favorites: [],
  submissions: [],
  reviewingSubmissionId: savedAdminWork.reviewingSubmissionId ?? null,
  submitOpen: false,
  beansOpen: false,
  updateReady: false,
  near: null,
  nearStatus: "idle",
  brainOpen: savedAdminWork.brainOpen ?? false,
  brainThread: Array.isArray(savedAdminWork.brainThread) ? savedAdminWork.brainThread : [],
  brainSession: savedAdminWork.brainSession,
  brainInput: savedAdminWork.brainInput ?? "",
  draftQueue: Array.isArray(savedAdminWork.draftQueue) ? savedAdminWork.draftQueue : [],
  draftBatchTotal: savedAdminWork.draftBatchTotal ?? 0,
  editSeq: 0,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      // Places are required for the café map. Roasters fail soft: a missing
      // directory file must not take the café map down with it.
      const places = await loadPlaces();
      let roasters: Roaster[] = [];
      try {
        roasters = await loadRoasters();
      } catch (err) {
        console.warn("Coffee Finder roasters:", err);
      }
      // A shared link names a place/roaster we only just learned about, so the
      // id is resolved here rather than at startup. An id that no longer
      // exists is ignored: a closed café should open the map, not an error.
      const sharedPlace = readPlaceParam();
      const sharedRoaster = readRoasterParam();
      const section = readSectionParam();
      const selectedId =
        section === "cafes" && sharedPlace && places.some((p) => p.id === sharedPlace)
          ? sharedPlace
          : null;
      const selectedRoasterId =
        section === "roasters" &&
        sharedRoaster &&
        roasters.some((r) => r.id === sharedRoaster)
          ? sharedRoaster
          : null;
      set({ places, roasters, status: "ready", selectedId, selectedRoasterId, section });
      if (sharedPlace && !selectedId) writePlaceParam(null);
      if (sharedRoaster && !selectedRoasterId) writeRoasterParam(null);
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

  setEditing: (editing) => {
    set((s) => ({
      editing,
      editSeq: s.editSeq + 1,
      // A direct edit or cancel leaves any prior batch behind deliberately.
      draftQueue: [],
      draftBatchTotal: 0,
      // Opening the editor any other way ends the review it was opened for,
      // or cancelling one request would approve it on the next unrelated save.
      reviewingSubmissionId: null,
    }));
    writeSavedAdminWork(get());
  },

  saveEditingDraft: (editing) => {
    set({ editing });
    writeSavedAdminWork(get());
  },

  reviewSubmission: (reviewingSubmissionId, place) => {
    set((s) => ({
      editing: place,
      editSeq: s.editSeq + 1,
      draftQueue: [],
      draftBatchTotal: 0,
      reviewingSubmissionId,
    }));
    writeSavedAdminWork(get());
  },

  setBrainOpen: (brainOpen) => {
    set({ brainOpen });
    writeSavedAdminWork(get());
  },

  setBrainInput: (brainInput) => {
    set({ brainInput });
    writeSavedAdminWork(get());
  },

  addBrainTurn: (turn, sessionId) => {
    set((s) => ({
      brainThread: [...s.brainThread, turn],
      // Keep the previous session when a turn carries none: a brain without
      // sessions echoes nothing back, and dropping it would restart the thread.
      brainSession: sessionId ?? s.brainSession,
    }));
    writeSavedAdminWork(get());
  },

  clearBrainThread: () => {
    set({ brainThread: [], brainSession: undefined, brainInput: "" });
    writeSavedAdminWork(get());
  },

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
    writeSavedAdminWork(get());
  },

  skipDraft: () => {
    set((s) => {
      const [next, ...remaining] = s.draftQueue;
      return {
        editing: next ?? null,
        draftQueue: remaining,
        draftBatchTotal: next ? s.draftBatchTotal : 0,
        editSeq: next ? s.editSeq + 1 : s.editSeq,
      };
    });
    writeSavedAdminWork(get());
  },

  removePlace: async (id) => {
    const res = await deletePlace(id);
    if (!res.error) {
      let freshPlaces: Place[] | undefined;
      try {
        freshPlaces = await loadPlaces();
      } catch {
        // The delete landed; a failed refresh must not strand the editor.
      }
      set((s) => ({
        ...(freshPlaces ? { places: freshPlaces } : { places: s.places.filter((p) => p.id !== id) }),
        editing: null,
        // The place is gone, so a link to it is too.
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
      if (get().selectedId === null) writePlaceParam(null);
      writeSavedAdminWork(get());
    }
    return res;
  },

  persistPlace: async (place) => {
    const res = await savePlace(place);
    if (!res.error) {
      /**
       * Publishing IS the approval. The request stayed pending after a
       * successful save, so the only way to clear the inbox was "Descartar" —
       * which records a rejection, the opposite of what just happened.
       *
       * Deliberately after the write and never blocking it: the café is
       * public either way, and a failed status update is a stale inbox row,
       * not a lost café.
       */
      const submissionId = get().reviewingSubmissionId;
      if (submissionId) {
        void setSubmissionStatus(submissionId, "approved", get().session?.user?.email ?? "editor")
          .then(() => get().refreshSubmissions())
          .catch(() => {});
      }
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
          reviewingSubmissionId: null,
        };
      });
      writeSavedAdminWork(get());
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

  setSection: (section) => {
    const prev = get().section;
    if (prev === section) return;
    writeSectionParam(section);
    // Switching directories closes the other sheet and clears its selection
    // from the URL so back doesn't resurrect the wrong product.
    if (section === "roasters") {
      writePlaceParam(null);
      set({ section, selectedId: null, selectedRoasterId: null });
    } else {
      writeRoasterParam(null);
      set({ section, selectedRoasterId: null, selectedId: null });
    }
  },

  setRoasterCountry: (countryCode) =>
    set((s) => ({
      roasterFilters: { ...s.roasterFilters, countryCode, city: null, region: null },
    })),

  setRoasterCity: (city) => set((s) => ({ roasterFilters: { ...s.roasterFilters, city } })),

  setRoasterRegion: (region) =>
    set((s) => ({ roasterFilters: { ...s.roasterFilters, region, city: null } })),

  setRoasterQuery: (query) => set((s) => ({ roasterFilters: { ...s.roasterFilters, query } })),

  toggleRoasterShipLocal: () =>
    set((s) => ({
      roasterFilters: { ...s.roasterFilters, shipsLocally: !s.roasterFilters.shipsLocally },
    })),

  toggleRoasterShipIntl: () =>
    set((s) => ({
      roasterFilters: {
        ...s.roasterFilters,
        shipsInternationally: !s.roasterFilters.shipsInternationally,
      },
    })),

  toggleRoasterSubscription: () =>
    set((s) => ({
      roasterFilters: {
        ...s.roasterFilters,
        hasSubscription: !s.roasterFilters.hasSubscription,
      },
    })),

  resetRoasterFilters: () => set({ roasterFilters: { ...EMPTY_ROASTER_FILTERS } }),

  select: (selectedId) => {
    writePlaceParam(selectedId);
    set({ selectedId, selectedRoasterId: null });
  },

  selectRoaster: (selectedRoasterId) => {
    writeRoasterParam(selectedRoasterId);
    set({ selectedRoasterId, selectedId: null });
  },

  /**
   * Back/forward moved us — adopt whatever the URL now says WITHOUT writing to
   * history again, or the two would push each other in a loop.
   */
  syncFromUrl: () => {
    const section = readSectionParam();
    const sharedPlace = readPlaceParam();
    const sharedRoaster = readRoasterParam();
    const { places, roasters } = get();
    set({
      section,
      selectedId:
        section === "cafes" && sharedPlace && places.some((p) => p.id === sharedPlace)
          ? sharedPlace
          : null,
      selectedRoasterId:
        section === "roasters" &&
        sharedRoaster &&
        roasters.some((r) => r.id === sharedRoaster)
          ? sharedRoaster
          : null,
    });
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

  setUpdateReady: (updateReady) => set({ updateReady }),

  /**
   * "Cerca de mí" is an answer to "where are you going", so it replaces the
   * country/city/barrio you had picked rather than narrowing inside it —
   * nearest café within Ñuñoa when you are in Berlin is not what anyone means.
   */
  findNearMe: async () => {
    set({ nearStatus: "locating" });
    const { coords, status } = await getPosition();
    set((s) => ({
      near: coords ?? null,
      nearStatus: status,
      filters: coords
        ? { ...s.filters, countryCode: null, city: null, comunas: [] }
        : s.filters,
    }));
  },

  clearNear: () => set({ near: null, nearStatus: "idle" }),

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
