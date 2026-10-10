import UIKit
import Capacitor

final class FlaglerBridgeViewController: CAPBridgeViewController {
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
