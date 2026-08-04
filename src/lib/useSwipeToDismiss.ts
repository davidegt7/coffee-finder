import { useCallback, useRef, useState } from "react";

/**
 * Swipe a sheet down to close it, the way every app on the phone already works.
 *
 * The X in the corner is a target the size of a fingernail in the hardest place
 * on a big screen to reach. Dragging the sheet away is the gesture people
 * already have, so this makes the X the fallback rather than the only way out.
 *
 * `handlers` belong on a DEDICATED strip across the top of the sheet, not on
 * the sheet itself, and that strip must carry `touch-action: none`.
 *
 * The first version listened on the whole sheet and engaged only when the
 * content was scrolled to its top. That works with a mouse and fails on a
 * phone: the sheet is also the scroll container, so the moment a finger moves
 * on it iOS claims the gesture for scrolling and fires pointercancel, and the
 * drag never accumulates. Hence the strip — the same reason every native sheet
 * has a grab handle. Dragging there is unambiguous, so there is no scroll
 * position to check and no gesture to arbitrate: the body below scrolls
 * normally, and the top drags.
 */

/** Far enough that resting a thumb and shifting slightly never closes it. */
const DISMISS_PX = 96;
/** px/ms downward. A deliberate flick closes even if it barely moved. */
const FLICK = 0.45;
/** Movement before the gesture commits either way. */
const SLOP = 6;

export function useSwipeToDismiss(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef({
    startY: 0,
    prevY: 0,
    prevT: 0,
    tracking: false,
    decided: false,
    active: false,
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    g.current = {
      startY: e.clientY,
      prevY: e.clientY,
      prevT: performance.now(),
      tracking: true,
      decided: false,
      active: false,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = g.current;
    if (!s.tracking) return;
    const dy = e.clientY - s.startY;

    if (!s.decided) {
      if (Math.abs(dy) < SLOP) return;
      s.decided = true;
      // Downward only. Dragging up on the handle does nothing rather than
      // stretching a sheet that is already against the top of the screen.
      s.active = dy > 0;
      if (!s.active) {
        s.tracking = false;
        return;
      }
      setDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Capture is an optimisation; the drag still tracks without it.
      }
    }

    // Velocity from the LAST sample, not the whole gesture: someone who drags
    // slowly down and then flicks has flicked, and averaging hides that.
    s.prevY = e.clientY;
    s.prevT = performance.now();
    setY(Math.max(0, dy));
  }, []);

  const end = useCallback(
    (e: React.PointerEvent) => {
      const s = g.current;
      if (!s.tracking || !s.active) {
        s.tracking = false;
        return;
      }
      s.tracking = false;
      s.active = false;
      setDragging(false);
      const dy = e.clientY - s.startY;
      const velocity = (e.clientY - s.prevY) / Math.max(1, performance.now() - s.prevT);
      if (dy > DISMISS_PX || velocity > FLICK) {
        onDismiss();
        // Left translated: the sheet unmounts, and resetting first would show a
        // frame of it snapping back before it disappears.
      } else {
        setY(0);
      }
    },
    [onDismiss],
  );

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
    },
    style: {
      transform: y ? `translateY(${y}px)` : undefined,
      transition: dragging ? "none" : undefined,
      // While dragging the entry animation would fight the finger.
      animation: dragging || y ? "none" : undefined,
    } as React.CSSProperties,
    dragging,
  };
}
