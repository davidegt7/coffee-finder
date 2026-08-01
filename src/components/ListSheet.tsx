import { useCallback, useEffect, useRef, useState } from "react";
import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters } from "../lib/filters";
import { useT } from "../lib/useT";
import { PlaceList } from "./PlaceList";

/**
 * The results list, as a sheet you drag over a full-bleed map.
 *
 * This is the structural half of "make it feel like an app". The previous
 * layout stacked header → filters → map → list in fixed bands, which is how a
 * web page is built; every map app people actually like — Maps, Airbnb, Uber —
 * puts the map edge to edge and floats everything else on top of it, so the
 * content you're choosing between and the space it lives in are visible at once.
 *
 * Three snap points rather than free positioning: a sheet that stops wherever
 * your thumb left it feels broken, and the useful states really are "show me the
 * map", "show me both", and "show me the list".
 */
type Snap = "peek" | "half" | "full";

/** Distance the sheet is pushed down, as a fraction of its own height. */
const OFFSET: Record<Snap, number> = { peek: 0.86, half: 0.44, full: 0 };

export function ListSheet() {
  const places = useStore((s) => s.places);
  const filters = useStore((s) => s.filters);
  const favorites = useStore((s) => s.favorites);
  const { t } = useT();

  const [snap, setSnap] = useState<Snap>("half");
  // The controls change height as admin rows appear, so measure rather than
  // guess. Without this the sheet at full snap reaches up over the filters.
  const [topbarH, setTopbarH] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ y: 0, offset: 0 });

  const visible = useMemo(
    () => applyFilters(places, filters, favorites),
    [places, filters, favorites],
  );

  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    const measure = () => setTopbarH(bar.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const height = () => sheetRef.current?.offsetHeight ?? 1;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startRef.current = { y: e.clientY, offset: OFFSET[snap] * height() };
      setDrag(OFFSET[snap] * height());
    },
    [snap],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (drag === null) return;
      const next = startRef.current.offset + (e.clientY - startRef.current.y);
      // Clamped so the sheet can't be flung off-screen or above its full height.
      setDrag(Math.max(0, Math.min(next, OFFSET.peek * height())));
    },
    [drag],
  );

  const onPointerUp = useCallback(() => {
    if (drag === null) return;
    const fraction = drag / height();
    // Snap to whichever point is nearest where the thumb let go.
    const nearest = (["peek", "half", "full"] as Snap[]).reduce((best, s) =>
      Math.abs(OFFSET[s] - fraction) < Math.abs(OFFSET[best] - fraction) ? s : best,
    );
    setSnap(nearest);
    setDrag(null);
  }, [drag]);

  // Results changing under a collapsed sheet is invisible — lift it so the
  // answer to a filter is on screen.
  const count = visible.length;
  useEffect(() => {
    setSnap((cur) => (cur === "peek" ? "half" : cur));
  }, [count]);

  const offsetPx = drag ?? OFFSET[snap] * height();

  return (
    <div
      ref={sheetRef}
      className={`list-sheet is-${snap} ${drag !== null ? "is-dragging" : ""}`}
      style={
        {
          transform: `translateY(${offsetPx}px)`,
          // 18px of overlap with the gradient's transparent tail, so the sheet
          // tucks under the fade instead of leaving a visible seam.
          "--sheet-h": topbarH ? `calc(100% - ${Math.max(0, topbarH - 18)}px)` : undefined,
          // Desktop uses a docked list instead of the draggable sheet. Measure
          // the real controls so translated labels and active filters can never
          // leave results hidden underneath them.
          "--topbar-h": topbarH ? `${topbarH}px` : undefined,
        } as React.CSSProperties
      }
    >
      <div
        className="list-sheet__grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Tapping the grip cycles rather than requiring a drag — a handle that
        // only responds to dragging is a handle half of people never use.
        onClick={() => setSnap(snap === "full" ? "peek" : snap === "half" ? "full" : "half")}
        role="button"
        tabIndex={0}
        aria-label={t("sheet.dragHandle")}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") setSnap(snap === "peek" ? "half" : "full");
          if (e.key === "ArrowDown") setSnap(snap === "full" ? "half" : "peek");
        }}
      >
        <span className="list-sheet__bar" aria-hidden="true" />
        <span className="list-sheet__count">
          {count} {count === 1 ? t("map.place") : t("map.places")}
        </span>
      </div>

      <div className="list-sheet__body">
        <PlaceList />
      </div>
    </div>
  );
}
