import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    ///
    /// A link arriving from the share extension.
    ///
    /// The extension opens `jipbap://share?url=...` and this is where that
    /// lands. All it does is send the web app to the page that already knows
    /// what to do with a shared link — `/my-recipes` reads `?url=` and opens
    /// the add form with the lookup already run, which is exactly what the
    /// Android share target produces. One receiving path, two ways in.
    ///
    /// Loading the URL into the bridge's web view rather than posting a
    /// JavaScript event: the app points at the live site (see
    /// capacitor.config.ts), so a navigation IS the mechanism, and it works
    /// identically whether the app was already running or cold-launched by
    /// the share.
    ///
    private func handleSharedLink(_ url: URL) -> Bool {
        guard url.scheme == "jipbap", url.host == "share" else { return false }
        guard
            let shared = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "url" })?.value,
            let encoded = shared.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
            let target = URL(string: "https://jipbap.app/my-recipes?url=\(encoded)")
        else { return false }

        // The bridge may not exist yet on a cold launch. Deferring to the main
        // queue is enough in practice: the root view controller is set during
        // launch, before the URL is delivered.
        DispatchQueue.main.async {
            let root = self.window?.rootViewController as? CAPBridgeViewController
            root?.bridge?.webView?.load(URLRequest(url: target))
        }
        return true
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Ours first: a share is not something Capacitor's plugin layer needs
        // to see, and letting it through would fire an appUrlOpen event that
        // nothing listens for.
        if handleSharedLink(url) { return true }
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
