/**
 * Ad slots, stubbed.
 *
 * No network calls, no third-party script, no tracker — this renders a labelled
 * placeholder and nothing else. That's deliberate: ad code is the one dependency
 * that can quietly change what your users see and what gets collected about them,
 * so it doesn't go in until you've picked a network and read what it does.
 *
 * When it does go in: the honest version of this business is a *sponsored place*
 * — a local shop paying to be featured — not a display banner. Banners on a map
 * with 30 places earn cents. The slot below is where either would live, and
 * `sponsored` records that a listing was paid for, which is a disclosure you owe
 * the reader regardless of the format.
 */
export function AdSlot({ where }: { where: "list" | "detail" }) {
  return (
    <aside className={`ad ad--${where}`} aria-label="Espacio publicitario">
      <span className="ad__tag">Publicidad</span>
      <p className="ad__body">
        Este espacio es para un local de Santiago.
        <br />
        <small>Gratis para siempre para quien busca. Los locales pagan por aparecer destacados.</small>
      </p>
    </aside>
  );
}
