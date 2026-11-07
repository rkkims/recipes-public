import UIKit
import Social
import UniformTypeIdentifiers

///
/// The iOS share sheet entry — the one thing a website cannot do for itself.
///
/// ── Why this file has to exist ───────────────────────────────────────────
///
/// Android gets this free: `share_target` in the web manifest puts the installed
/// PWA in the system share sheet, and `/my-recipes` already receives the link.
/// WebKit has never shipped Web Share Target (webkit.org bug 194593), so on iOS
/// there is no declarative way in — an app appears in that sheet only by
/// shipping a share extension, which is a separate binary target with its own
/// process and its own sandbox.
///
/// It is also the feature that makes the iOS app defensible under App Store
/// guideline 4.2, which rejects a repackaged website. This is the thing the
/// website cannot do.
///
/// ── What it deliberately does not do ─────────────────────────────────────
///
/// No UI. `SLComposeServiceViewController` gives a compose sheet with a text box
/// and a Post button, which is right for posting a message and wrong here: there
/// is nothing to write. The user already said everything by choosing JipBap —
/// they want this link in their recipes. So the extension takes the URL, hands
/// it to the app and dismisses. What the app then shows is the add form with the
/// link already looked up, which is the same screen the Android share produces.
///
/// A silent extension also cannot half-fail: there is no state in it to leave
/// inconsistent, and every path below ends in `complete` or `cancel`.
///
class ShareViewController: UIViewController {

    /// The scheme the host app registers. Must match `CFBundleURLSchemes` in
    /// the app target's Info.plist, and the handler in AppDelegate.
    private let scheme = "jipbap"

    override func viewDidLoad() {
        super.viewDidLoad()
        // No view is ever presented, so nothing is drawn. Doing the work here
        // rather than in `viewDidAppear` means the sheet never flashes empty.
        handleShare()
    }

    private func handleShare() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let providers = item.attachments
        else { return cancel() }

        // A URL attachment if there is one; otherwise the text, because most
        // apps share a caption with the link inside it rather than a bare URL.
        // Same order of preference the Android receiver uses, for the same
        // reason — see the `share_target` block in app/src/app/manifest.ts.
        if let urlProvider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
        }) {
            urlProvider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] value, _ in
                if let url = value as? URL {
                    self?.open(shared: url.absoluteString)
                } else {
                    self?.cancel()
                }
            }
            return
        }

        if let textProvider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        }) {
            textProvider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] value, _ in
                guard let text = value as? String else { return self?.cancel() ?? () }
                self?.open(shared: self?.firstURL(in: text) ?? text)
            }
            return
        }

        cancel()
    }

    /// The first http(s) run in a caption. A shared TikTok is a sentence with a
    /// link in it, and the link is the only part we can do anything with.
    private func firstURL(in text: String) -> String? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector.firstMatch(in: text, range: range)?.url?.absoluteString
    }

    ///
    /// Hand it to the app and get out of the way.
    ///
    /// An extension cannot call `UIApplication.shared.open` — there is no shared
    /// application in this process. Walking the responder chain to find the real
    /// `UIApplication` is the long-standing way around it: not private API, and
    /// what every share-to-app extension on the platform does. It is guarded, so
    /// if a future iOS breaks the walk the extension simply closes instead of
    /// crashing on someone's phone.
    ///
    private func open(shared: String?) {
        guard
            let shared,
            let encoded = shared.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
            let url = URL(string: "\(scheme)://share?url=\(encoded)")
        else { return cancel() }

        DispatchQueue.main.async { [weak self] in
            var responder: UIResponder? = self
            while let r = responder {
                if let app = r as? UIApplication {
                    app.open(url, options: [:], completionHandler: nil)
                    break
                }
                responder = r.next
            }
            self?.complete()
        }
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(
            domain: "app.jipbap.share", code: 0,
            userInfo: [NSLocalizedDescriptionKey: "Nothing shareable was attached."]))
    }
}
