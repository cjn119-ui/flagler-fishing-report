import UIKit
import Capacitor
import WebKit

final class FlaglerBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var debugLaunchHandled = false
    private let debugStartUptime = ProcessInfo.processInfo.systemUptime

    private var loadingOverlay: UIView?
    private var pageLoadObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        let overlay = UIView()
        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = UIColor(red: 11 / 255, green: 17 / 255, blue: 23 / 255, alpha: 1)
        overlay.isAccessibilityElement = true
        overlay.accessibilityLabel = "Flagler Fishing. Opening current conditions."

        let title = UILabel()
        title.translatesAutoresizingMaskIntoConstraints = false
        title.text = "Flagler Fishing\nOpening current conditions…"
        title.textAlignment = .center
        title.numberOfLines = 0
        title.font = .systemFont(ofSize: 20, weight: .medium)
        title.textColor = UIColor(red: 233 / 255, green: 239 / 255, blue: 244 / 255, alpha: 1)

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = title.textColor
        spinner.startAnimating()

        overlay.addSubview(title)
        overlay.addSubview(spinner)
        view.addSubview(overlay)
        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            title.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: overlay.centerYAnchor, constant: -18),
            title.leadingAnchor.constraint(greaterThanOrEqualTo: overlay.leadingAnchor, constant: 24),
            title.trailingAnchor.constraint(lessThanOrEqualTo: overlay.trailingAnchor, constant: -24),
            spinner.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 20),
        ])
        loadingOverlay = overlay
        if let webView {
#if DEBUG
            let debugScript = """
            (() => {
              const send = (kind, value) => { try { window.webkit.messageHandlers.flaglerDebug.postMessage({kind, value: String(value)}); } catch {} };
              addEventListener('error', (event) => send('error', `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`));
              addEventListener('unhandledrejection', (event) => send('rejection', event.reason?.stack || event.reason));
              const originalError = console.error.bind(console);
              console.error = (...args) => { send('console.error', args.join(' ')); originalError(...args); };
              const originalInfo = console.info.bind(console);
              console.info = (...args) => { if (String(args[0]).startsWith('FLAGLER_PERF')) send('perf', args.join(' ')); originalInfo(...args); };
            })();
            """
            let contentController = webView.configuration.userContentController
            contentController.add(self, name: "flaglerDebug")
            contentController.addUserScript(WKUserScript(source: debugScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
            if ProcessInfo.processInfo.arguments.contains("--flagler-clear-run-cache") {
                let clearRunCache = "localStorage.removeItem('v5proto.live.today');localStorage.removeItem('v5proto.live.tomorrow');console.info('FLAGLER_PERF run_cache_cleared=true');"
                contentController.addUserScript(WKUserScript(source: clearRunCache, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
            webView.evaluateJavaScript(debugScript)
#endif
            pageLoadObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
                guard !webView.isLoading else { return }
                DispatchQueue.main.async { self?.dismissLoadingOverlay() }
            }
        }

        // WKWebView can stay in its loading state while its first data requests settle.
        // Keep the launch state visible briefly, but never leave it covering the app.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.dismissLoadingOverlay()
        }
    }

    private func dismissLoadingOverlay() {
        loadingOverlay?.removeFromSuperview()
        loadingOverlay = nil
        pageLoadObservation = nil
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FFMapPlugin())
    }

#if DEBUG
    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "flaglerDebug")
    }
#endif

#if DEBUG
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "flaglerDebug" else { return }
        NSLog("FLAGLER_JS_%@ native_elapsed_s=%.3f %@", String(describing: (message.body as? [String: Any])?["kind"] ?? "message"), ProcessInfo.processInfo.systemUptime - debugStartUptime, String(describing: (message.body as? [String: Any])?["value"] ?? message.body))
    }
#endif

    #if DEBUG
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !debugLaunchHandled, let webView else { return }
        let args = ProcessInfo.processInfo.arguments
        let debugCommand = ProcessInfo.processInfo.environment["FLAGLER_IOS_DEBUG"] ?? args.first(where: { $0.hasPrefix("--flagler-") })
        guard debugCommand != nil else { return }
        debugLaunchHandled = true
        let runCycles = debugCommand == "cycles" || debugCommand == "--flagler-map-cycles"
        let openSheet = debugCommand == "sheet" || debugCommand == "--flagler-sheet"
        let scrollUnderHeader = debugCommand == "under-header" || debugCommand == "--flagler-map-under-header"
        let targetTab = ["--flagler-spots": "spots", "--flagler-species": "species", "--flagler-plan": "plan", "--flagler-log": "log"][debugCommand ?? ""]
        let openMapTab = debugCommand == "--flagler-spots" || scrollUnderHeader || openSheet || runCycles
        let targetTabScript = targetTab.map { "location.hash='#tab=\($0)';" } ?? ""
        let goToSpotsScript = openMapTab && targetTab != "spots" ? "document.querySelector('.tab[data-tab=spots]')?.click();" : ""
        let mapPositionScript = scrollUnderHeader || openSheet || runCycles ? "if(slot)slot.scrollIntoView({block:'start',behavior:'instant'});" : ""
        let afterTabScript = """
        setTimeout(()=>{const slot=document.querySelector('#spots-map');\(mapPositionScript)\(scrollUnderHeader ? "setTimeout(()=>{const s=document.querySelector('#spots-map');if(s)window.scrollBy(0,s.getBoundingClientRect().top-80);},350);" : "")\(openSheet ? "setTimeout(()=>document.querySelector('#more')?.click(),450);" : "")\(runCycles ? "void (async()=>{const m=window.FFNativeMap,p={spots:[{id:'debug-spot',name:'Map lifecycle check',lat:29.901,lon:-81.312,verdict:'GO',favorite:true,closureBadge:null}],selectedId:'debug-spot',mode:'surf'};for(let i=0;i<30;i++){await m.show(p);await new Promise(r=>setTimeout(r,180));await m.hide();await new Promise(r=>setTimeout(r,180));}console.info('FLAGLER_PERF map_cycles=30');document.querySelector('.tab[data-tab=spots]')?.click();})()" : "")},700);
        """
        let script = """
        \(targetTabScript)\(goToSpotsScript)\(openMapTab ? afterTabScript : "")console.info('FLAGLER_PERF debug_hook_ready tab='+document.querySelector('.tab[aria-current]')?.dataset.tab);void 0;
        """
        NSLog("FLAGLER_IOS_DEBUG command=%@ arguments=%@", String(describing: debugCommand), String(describing: args))
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { [weak webView] in
            webView?.evaluateJavaScript(script) { _, error in
                if let error { NSLog("FLAGLER_IOS_DEBUG hook_error=%@", error.localizedDescription) }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak webView] in
            webView?.evaluateJavaScript("JSON.stringify({url:location.href,tab:document.querySelector('.tab[aria-current]')?.dataset.tab,nativeMap:!!window.FFNativeMap,plugin:window.Capacitor?.isPluginAvailable?.('FFMap'),slot:!!document.querySelector('#spots-map'),slotRect:(()=>{const r=document.querySelector('#spots-map')?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height}})(),body:document.body.innerText.slice(0,240)})") { result, error in
                NSLog("FLAGLER_IOS_DEBUG state=%@ error=%@", String(describing: result), String(describing: error))
            }
        }
    }
    #endif
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = FlaglerBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
