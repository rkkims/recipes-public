# The iOS share extension

The reason the iOS app is worth installing, and the reason it clears App Store
guideline 4.2. Everything else in the Capacitor build is the website in a
window; this is the thing the website cannot do for itself.

WebKit has never shipped Web Share Target ([bug 194593][bug]), so on iOS there
is no declarative way into the system share sheet. An app gets in only by
shipping a share extension: a separate binary target, its own process, its own
sandbox.

[bug]: https://bugs.webkit.org/show_bug.cgi?id=194593

## What is already written

| file | state |
|---|---|
| `ShareViewController.swift` | done — extracts the URL, hands it to the app, dismisses |
| `Info.plist` | done — accepts one web URL or one piece of text |
| `App/App/AppDelegate.swift` | done — `handleSharedLink` navigates the web view |
| `App/App/Info.plist` | done — registers the `jipbap` scheme |
| **the Xcode target** | **not done — see below** |

The target is the only missing piece, and it is missing because creating one
means editing `project.pbxproj`, which is a generated file that Xcode rewrites
and that hand-editing corrupts in ways that surface days later. Four minutes in
the GUI is the honest way to do it.

## Creating the target

On a Mac, with the repo checked out:

    cd mobile && npm install && npx cap sync ios && open ios/App/App.xcworkspace

1. **File → New → Target… → Share Extension.** Name it `ShareExtension`,
   product name `JipBap`. Decline the "Activate scheme?" prompt.
2. Xcode generates its own `ShareViewController.swift`, `Info.plist` and a
   `MainInterface.storyboard`. **Delete all three** ("Move to Trash").
3. Drag the two files from this directory into the new target. Tick
   *ShareExtension* and only that in "Add to targets".
4. In the target's **General** tab set the bundle identifier to
   `app.jipbap.share`, and set **Deployment Target** to match the App target.
5. Build and run the *ShareExtension* scheme, choosing Safari as the host app.

Nothing here needs an App Group. The extension does not write anything — it
passes the URL through a custom scheme and closes — so there is no shared
container to configure and no entitlement to request. That is deliberate: an
App Group is the usual pattern and it exists to move data, and there is no data
here beyond one string that fits in a URL.

## Testing it

In Safari on a device or simulator, open any YouTube or TikTok recipe, tap
Share, then JipBap. The app should open on `/my-recipes` with the link already
in the add form and the lookup already run.

Both halves of the flow can be tested before the target exists:

    # the receiving half, which is live and already verified
    open "https://jipbap.com/my-recipes?text=look%20at%20this%20https://youtu.be/xyz"

    # the deep link the extension will send
    xcrun simctl openurl booted "jipbap://share?url=https%3A%2F%2Fyoutu.be%2Fxyz"

## Why Android is not here

Android already has this and it cost no native code: `share_target` in
`app/src/app/manifest.ts` puts the installed PWA in the system share sheet, and
`/my-recipes` reads the link out of `url` or `text`.

**That only works for the PWA and the TWA, not for a Capacitor Android app** —
a Capacitor app is a WebView, and a WebView does not inherit the manifest's
share target. Building the Android app in Capacitor would mean writing an
intent filter and a bridge plugin to reimplement something the TWA gets free.

Which is the argument for the split: **TWA on Android, Capacitor on iOS.**
