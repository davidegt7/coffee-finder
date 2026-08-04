/**
 * Noticing that a new build has shipped.
 *
 * The service worker keeps the app usable on bad signal, and the cost is that
 * an installed PWA can go on running the JavaScript it started with long after
 * a deploy — the page never navigates again, so it never asks for new HTML.
 * From the outside that is indistinguishable from "the change didn't work",
 * and it cost several rounds of exactly that confusion.
 *
 * So the app now watches for a replacement worker and says so. Deliberately a
 * prompt rather than an automatic reload: reloading underneath someone who is
 * halfway through writing a review would be a worse bug than the stale build.
 */

let waiting: ServiceWorker | null = null;

export function watchForUpdate(onReady: () => void): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((reg) => {
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // `controller` is null on the very first install — there is no old
          // version to replace, so there is nothing worth interrupting for.
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            waiting = sw;
            onReady();
          }
        });
      };

      track(reg.waiting);
      reg.addEventListener("updatefound", () => track(reg.installing));

      // An installed app can sit in the background for days. Checking each time
      // it comes back to the foreground is what makes the prompt show up
      // shortly after a deploy rather than whenever the OS decides.
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void reg.update().catch(() => {});
      });
    })
    .catch(() => {
      // A failed registration must never take the app down with it.
    });
}

export function applyUpdate(): void {
  // Ask the waiting worker to take over, then reload onto it. Without the
  // message it would sit waiting until every tab of the app was closed.
  waiting?.postMessage({ type: "SKIP_WAITING" });
  window.location.reload();
}
