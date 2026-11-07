import type { MetadataRoute } from "next";

/**
 * The web app manifest — UX-SPEC §12.
 *
 * *"A PWA is the constraint kept rather than abandoned: the same Next app,
 * deployed the same way, that a user can put on their home screen. No store, no
 * review queue, no second codebase."*
 *
 * `standalone` is the whole point of the file: launched from the home screen the
 * app fills the screen with no address bar, which is what makes the bottom tab
 * bar sit where a native one would instead of above browser chrome.
 *
 * `start_url` is the Cook page rather than the grocery list, even though the
 * list is the one you open in a shop. Launching is the ambient case — most
 * opens are "what can I cook" — and the list is one tap away in the bar. A
 * start_url chosen for the rarer case would make the common one cost a
 * navigation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JipBap",
    short_name: "JipBap",
    description:
      "Asian home cooking: what you can cook right now, from what's already in your kitchen.",
    start_url: "/",
    /*
      The app's identity, stated rather than inferred.

      Without `id`, Chrome derives identity from `start_url` — so changing that
      later would read as a DIFFERENT app: a second icon on the home screen and
      a Play listing that no longer matches the installed PWA. Pinning it costs
      nothing now and makes `start_url` a decision we are still allowed to
      change.
    */
    id: "/",
    /*
      Everything is in scope, and a TWA needs this said out loud.

      Chrome checks each navigation against the scope to decide what stays in
      the app window and what is handed to a browser. Left unset it defaults to
      the start_url's directory, which is the same "/" today — but it is the
      kind of default that silently becomes wrong the day start_url moves, and
      the symptom is the app opening a browser bar on its own pages.
    */
    scope: "/",
    display: "standalone",
    /* Matches the dark shell the icon is drawn on, so the splash and the status
       bar do not flash white on launch for a dark-mode user. */
    background_color: "#0f1a14",
    theme_color: "#0f1a14",
    orientation: "portrait",
    categories: ["food", "lifestyle", "shopping"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      /* `maskable` so Android can crop to its own shape without clipping the
         mark — the icon is drawn with room around it for exactly this. */
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    /* The grocery list earns a long-press shortcut for the reason §4d made it a
       page: it is the thing you open with a purpose.

       The meal plan had one and lost it at v1 — `lib/surface` unlists the
       calendar, and a shortcut is a listing. Leaving it would have been the one
       route back to a hidden place that survives a reinstall, baked into the
       home screen icon where no code change can reach it. */
    shortcuts: [
      { name: "Grocery list", url: "/list" },
    ],
    /*
      Share a recipe INTO jipbap — the one thing an installed app can do that a
      tab cannot.

      The whole add-a-recipe flow starts with pasting a link, and the place
      people find those links is inside Instagram, YouTube and TikTok. Pasting
      means leaving the app you are in, finding this one, and getting the URL
      across by hand; a share target puts jipbap in the system share sheet, so
      it is two taps from the video.

      GET rather than POST, which keeps the target an ordinary page load with
      the value in the query. A POST target must be handled by the service
      worker, and a share that fails because the worker was mid-update is a
      worse failure than any convenience it buys.

      `text` is listed as well as `url` because Android is inconsistent about
      which one it fills: many apps put the link in `text`, some send both, and
      `/my-recipes` reads whichever arrived.

      TypeScript's MetadataRoute.Manifest has no `share_target` field — the
      spec is not part of the W3C manifest — so this is cast rather than typed.
      Next serves the object verbatim, which is what matters.
    */
    ...({
      share_target: {
        action: "/my-recipes",
        method: "GET",
        params: { title: "title", text: "text", url: "url" },
      },
    } as object),
  };
}
