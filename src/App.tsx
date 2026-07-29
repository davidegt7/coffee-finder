import { useEffect } from "react";
import { useStore } from "./store";
import { MapView } from "./components/MapView";
import { FilterBar } from "./components/FilterBar";
import { PlaceList } from "./components/PlaceList";
import { PlaceSheet } from "./components/PlaceSheet";
import { AdminBar } from "./components/AdminBar";
import { PlaceEditor } from "./components/PlaceEditor";
import { LangToggle } from "./components/LangToggle";
import { SubmitPlace } from "./components/SubmitPlace";
import { SubmissionsQueue } from "./components/SubmissionsQueue";
import { useT } from "./lib/useT";
import "./App.css";

export default function App() {
  const { status, error, init, selectedId, select, editing, submitOpen, setSubmitOpen, isEditor } =
    useStore();
  const { t } = useT();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

  return (
    <div className="app">
      <header className="app__head">
        <div className="app__title">
          <h1>
            Coffee<span>Finder</span>
          </h1>
          <LangToggle />
        </div>
        <p>{t("app.tagline")}</p>
      </header>

      {status === "loading" && <div className="app__state">{t("app.loading")}</div>}
      {status === "error" && (
        <div className="app__state app__state--error">
          <p>{t("app.loadError")}</p>
          <code>{error}</code>
        </div>
      )}

      <AdminBar />
      {isEditor && <SubmissionsQueue />}

      {status === "ready" && (
        <>
          <FilterBar />
          <main className="app__body">
            <MapView />
            <PlaceList />
          </main>
        </>
      )}

      {selectedId && !editing && (
        <>
          <div className="scrim" onClick={() => select(null)} />
          <PlaceSheet />
        </>
      )}

      {submitOpen && (
        <>
          <div className="scrim" onClick={() => setSubmitOpen(false)} />
          <SubmitPlace />
        </>
      )}

      {editing && (
        <>
          <div className="scrim" />
          <PlaceEditor key={editing === "new" ? "new" : editing.id} />
        </>
      )}
    </div>
  );
}
