/**
 * What you get with no signal — UX-SPEC §12.
 *
 * Only ever reached by the service worker, when a navigation fails and there is
 * no cached copy of that page. It is deliberately plain: no pantry, no counts,
 * nothing computed, because everything this product computes lives on the server
 * and any number here would be a number we cannot stand behind.
 *
 * The copy says what is true rather than apologising. §12's rule is that a
 * cached surface leading to a dead tap is worse than showing nothing — this is
 * the page that refuses to pretend.
 *
 * ── It used to have no way off it ─────────────────────────────────────────
 *
 * A heading and two paragraphs, and nothing to press: the only genuine dead end
 * in the product, on the one occasion the user is least able to type their way
 * out. Two exits now, and both stay honest about a dead connection:
 *
 *   - **Try again** reloads the address that failed. With the signal back that
 *     is the shortest path to what they wanted; without it they land here
 *     again, which is not a lie.
 *   - **Back to the pantry** goes home, which the worker precaches at install
 *     (`sw.js`), so unlike an arbitrary page it is genuinely there offline.
 *
 * A server component with an inline script rather than a client component: the
 * reason anyone is on this page is that a fetch failed, and hanging the only
 * exit on a JS chunk that also has to load would be the same mistake one layer
 * down. The link needs no script at all; the button needs one line.
 */
export default function Offline() {
  return (
    <main className="page offline-page" id="main">
      <h1>No connection</h1>
      <p className="note">
        Your pantry and your list are kept on the server, so they need a signal
        to read or change. Nothing has been lost.
      </p>
      <p className="note">
        Pages you have already opened may still work. This one had not been
        opened yet.
      </p>
      <p className="cook-line">
        {/* Filled: it changes what is on screen. The link beside it is
            outlined, per the button scheme in globals.css. */}
        <button type="button" className="btn btn-primary" data-reload>Try again</button>
        <a className="btn" href="/">Back to the pantry</a>
      </p>
      <script dangerouslySetInnerHTML={{ __html:
        "document.querySelector('[data-reload]')" +
        ".addEventListener('click',function(){location.reload()})" }} />
    </main>
  );
}
