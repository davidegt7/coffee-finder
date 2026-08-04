import { useCallback, useRef, useState } from "react";

/**
 * Swipe a sheet down to close it, the way every app on the phone already works.
 *
 * The X in the corner is a target the size of a fingernail in the hardest place
 * on a big screen to reach. Dragging the sheet away is the gesture people
 * already have, so this makes the X the fallback rather than the only way out.
 *
 * The hard part is that the sheet is ALSO the scroll container, so a downward
 * drag is ambiguous: it means "scroll up through the content" almost always,
 * and "close this" only when there is nothing above to scroll to. The gesture
 * therefore decides once, on the first few pixels of movement, and then commits
 * — taking over only when the content is already at its top and the finger is
 * heading down. Anything else is left to the browser as an ordinary scroll,
 * untouched, because a sheet that fights scrolling is worse than one that
 * cannot be swiped at all.
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
      // Downward, and nothing above to scroll to. Either test failing means
      // this is a scroll and we never touch it.
      s.active = dy > 0 && (ref.current?.scrollTop ?? 0) <= 0;
      if (!s.active) {
        s.tracking = false;
        return;
      }
      setDragging(true);
      try {
        ref.current?.setPointerCapture(e.pointerId);
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
