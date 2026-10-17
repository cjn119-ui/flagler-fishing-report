import Capacitor
import MapKit
import UIKit

private final class FishingSpotAnnotation: NSObject, MKAnnotation {
    let id: String
    let name: String
    let verdict: String
    let favorite: Bool
    let closureBadge: String?
    dynamic var coordinate: CLLocationCoordinate2D
    var title: String? { name }
    var subtitle: String? { closureBadge }

    init(_ value: JSObject) {
        id = value["id"] as? String ?? ""
        name = value["name"] as? String ?? "Fishing spot"
        verdict = (value["verdict"] as? String ?? "").uppercased()
        favorite = value["favorite"] as? Bool ?? false
        closureBadge = value["closureBadge"] as? String
        coordinate = CLLocationCoordinate2D(latitude: value["lat"] as? CLLocationDegrees ?? 0,
                                             longitude: value["lon"] as? CLLocationDegrees ?? 0)
        super.init()
    }

    init(copying other: FishingSpotAnnotation) {
        id = other.id; name = other.name; verdict = other.verdict; favorite = other.favorite
        closureBadge = other.closureBadge; coordinate = other.coordinate
        super.init()
    }
}

// Card map: everything except its controls lets touches fall through to the page (tab swipes, scrolling, tap to expand).
private final class PassThroughMapView: MKMapView {
    var controls: [UIView] = []
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        return controls.contains { hit.isDescendant(of: $0) } ? hit : nil
    }
}

@objc(FFMapPlugin)
final class FFMapPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FFMapPlugin"
    let jsName = "FFMap"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackgroundColor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "expand", returnType: CAPPluginReturnPromise),
    ]

    private weak var pageWebView: WKWebView?
    private var mapView: MKMapView?
    private var annotations: [String: FishingSpotAnnotation] = [:]
    private var selectedID: String?
    private var lastSpots: String?
    private var lastFitKey: String?
    private var compactRegionWasManuallyAdjusted = false
    private var offsetObservation: NSKeyValueObservation?
    private var generation = 0
    private var headerBottom: CGFloat = 0
    private var tabBarTop: CGFloat = 0
    private var snapshotWork: DispatchWorkItem?
    private weak var expandedMap: MKMapView?
    private static let mapTypeKey = "ffmap.mapType"
    private static var preferredMapType: MKMapType {
        get { UserDefaults.standard.string(forKey: mapTypeKey) == "road" ? .standard : .hybrid }
        set { UserDefaults.standard.set(newValue == .standard ? "road" : "satellite", forKey: mapTypeKey) }
    }
    private let expandBadge: UIView = {
        // Corner cue that the map opens full screen (the whole card is the button; web content can't draw over the native map).
        let badge = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark))
        badge.frame = CGRect(x: 0, y: 0, width: 34, height: 34)
        badge.layer.cornerRadius = 17
        badge.clipsToBounds = true
        let icon = UIImageView(image: UIImage(systemName: "arrow.up.left.and.arrow.down.right",
                                              withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)))
        icon.tintColor = .white
        icon.frame = badge.bounds
        icon.contentMode = .center
        badge.contentView.addSubview(icon)
        badge.isAccessibilityElement = false
        return badge
    }()

    override func load() {
        // Tab swipes are handled by the page: keep the web view from rubber-banding sideways or drifting vertically
        // during a mostly-horizontal drag (both read as a bounce under the swipe).
        DispatchQueue.main.async { [weak self] in
            guard let scroll = self?.bridge?.webView?.scrollView else { return }
            scroll.isDirectionalLockEnabled = true
            scroll.alwaysBounceHorizontal = false
            if #available(iOS 17.4, *) { scroll.bouncesHorizontally = false }
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView,
                  let x = call.getDouble("x"), let y = call.getDouble("y"),
                  let width = call.getDouble("width"), let height = call.getDouble("height") else {
                call.reject("Map slot geometry is missing")
                return
            }
            self.generation += 1
            self.pageWebView = webView
            self.headerBottom = CGFloat(call.getDouble("headerBottom") ?? 0)
            self.tabBarTop = CGFloat(call.getDouble("tabBarTop") ?? Double(webView.bounds.height))
            let scrollView = webView.scrollView
            let map = self.mapView ?? self.makeMapView()
            self.mapView = map
            let frame = CGRect(x: x, y: y, width: width, height: height)
            let previousMapSize = map.bounds.size
            if map.superview !== scrollView { scrollView.addSubview(map) }
            map.frame = frame
            map.setNeedsLayout()
            map.layoutIfNeeded()
            if self.expandBadge.superview !== map { map.addSubview(self.expandBadge) }
            self.expandBadge.frame.origin = CGPoint(x: frame.width - 34 - 12, y: 12)
            map.alpha = 1
            map.isHidden = false
            map.layer.cornerRadius = 22
            map.layer.masksToBounds = true
            map.overrideUserInterfaceStyle = call.getString("theme") == "light" ? .light : .dark
            let values = call.getArray("spots", JSObject.self) ?? []
            let encodedSpots = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
            let fingerprint = (encodedSpots.flatMap { String(data: $0, encoding: .utf8) } ?? "") + "|\(call.getString("selectedId") ?? "")"
            let previousRegion = map.region
            let spotsChanged = fingerprint != self.lastSpots
            if spotsChanged {
                self.lastSpots = fingerprint
                self.updateSpots(values, selectedID: call.getString("selectedId"))
            }
            self.selectedID = call.getString("selectedId")
            let fitKey = self.mapFitKey(values, selectedID: self.selectedID)
            let focusChanged = fitKey != self.lastFitKey
            let sizeChanged = abs(previousMapSize.width - map.bounds.width) > 0.5
                || abs(previousMapSize.height - map.bounds.height) > 0.5
            if focusChanged {
                self.lastFitKey = fitKey
                self.compactRegionWasManuallyAdjusted = false
            } else if spotsChanged && !(sizeChanged && !self.compactRegionWasManuallyAdjusted) {
                // Annotation metadata can change without changing the geographic focus.
                // Keep MapKit's selection refresh from nudging a user-adjusted camera.
                map.setRegion(previousRegion, animated: false)
            }
            if focusChanged || (sizeChanged && !self.compactRegionWasManuallyAdjusted) {
                self.fitMap()
            }
            self.updateMask()
            self.installOffsetObservation(on: scrollView)
            self.scheduleSnapshot()
            call.resolve()
        }
    }

    @objc func setBackgroundColor(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(); return }
            let color = UIColor.capacitor.color(fromHex: call.getString("color") ?? "#0B1117")
            let webView = self.pageWebView ?? self.bridge?.webView
            webView?.isOpaque = false
            webView?.backgroundColor = color
            webView?.scrollView.backgroundColor = color
            call.resolve()
        }
    }

    // Full-screen interactive map in a sheet; picking a pin selects that spot and closes it.
    @objc func expand(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController, self.expandedMap == nil else { call.resolve(); return }
            let map = MKMapView(frame: .zero)
            map.delegate = self
            map.mapType = Self.preferredMapType
            map.isRotateEnabled = false
            map.isPitchEnabled = false
            map.overrideUserInterfaceStyle = self.mapView?.overrideUserInterfaceStyle ?? .dark
            map.addAnnotations(self.annotations.values.map { FishingSpotAnnotation(copying: $0) })
            if let region = self.mapView?.region { map.setRegion(region, animated: false) }
            let controller = UIViewController()
            controller.view = self.makeExpandedContainer(map: map)
            controller.modalPresentationStyle = .pageSheet
            if let sheet = controller.sheetPresentationController {
                sheet.detents = [.large()]
                sheet.prefersGrabberVisible = true
                sheet.preferredCornerRadius = 28
            }
            self.expandedMap = map
            self.snapshotWork?.cancel()
            presenter.present(controller, animated: true) {
                // Frame the spots in the taller sheet (the card's region shows far more coastline than needed).
                let points = map.annotations.map { MKMapPoint($0.coordinate) }
                guard let first = points.first else { return }
                let rect = points.dropFirst().reduce(MKMapRect(origin: first, size: MKMapSize(width: 0, height: 0))) {
                    $0.union(MKMapRect(origin: $1, size: MKMapSize(width: 0, height: 0)))
                }
                map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 80, left: 48, bottom: 80, right: 48), animated: true)
            }
            call.resolve()
        }
    }

    private func makeExpandedContainer(map: MKMapView) -> UIView {
        let container = UIView()
        container.overrideUserInterfaceStyle = map.overrideUserInterfaceStyle
        map.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(map)
        NSLayoutConstraint.activate([
            map.topAnchor.constraint(equalTo: container.topAnchor),
            map.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            map.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            map.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])
        addControls(to: container, tag: 1, compact: false, map: map)
        return container
    }

    // Road/Satellite switch (top-left on the card, top-centre in the sheet) and +/- zoom (bottom-right).
    // tag 0 = card map, 1 = expanded map.
    @discardableResult
    private func addControls(to host: UIView, tag: Int, compact: Bool, map: MKMapView? = nil) -> [UIView] {
        let style = UISegmentedControl(items: ["Road", "Satellite"])
        style.tag = tag
        style.selectedSegmentIndex = Self.preferredMapType == .standard ? 0 : 1
        style.addTarget(self, action: #selector(mapStyleChanged(_:)), for: .valueChanged)
        style.translatesAutoresizingMaskIntoConstraints = false
        style.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.6)
        if compact { style.setTitleTextAttributes([.font: UIFont.systemFont(ofSize: 12, weight: .semibold)], for: .normal) }
        host.addSubview(style)

        let size: CGFloat = compact ? 34 : 46
        let zoom = UIStackView(arrangedSubviews: [zoomButton("plus", tag: tag, size: size), zoomButton("minus", tag: tag, size: size)])
        zoom.axis = .vertical
        zoom.spacing = 1
        zoom.backgroundColor = UIColor.separator
        zoom.layer.cornerRadius = compact ? 10 : 12
        zoom.clipsToBounds = true
        zoom.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(zoom)

        let guide = compact ? host.layoutMarginsGuide : host.safeAreaLayoutGuide
        if compact { host.layoutMargins = UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10) }
        NSLayoutConstraint.activate([
            style.topAnchor.constraint(equalTo: guide.topAnchor, constant: compact ? 0 : 22),
            compact ? style.leadingAnchor.constraint(equalTo: guide.leadingAnchor) : style.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            zoom.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: compact ? 0 : -14),
            zoom.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: compact ? 0 : -28),
        ])
        return [style, zoom]
    }

    private func zoomButton(_ symbol: String, tag: Int, size: CGFloat) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: size > 40 ? 17 : 14, weight: .semibold))
        config.baseForegroundColor = .label
        let button = UIButton(configuration: config)
        button.tag = tag
        button.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.85)
        button.addTarget(self, action: symbol == "plus" ? #selector(zoomIn(_:)) : #selector(zoomOut(_:)), for: .touchUpInside)
        button.accessibilityLabel = symbol == "plus" ? "Zoom in" : "Zoom out"
        button.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([button.widthAnchor.constraint(equalToConstant: size), button.heightAnchor.constraint(equalToConstant: size)])
        return button
    }

    @objc private func mapStyleChanged(_ control: UISegmentedControl) {
        let type: MKMapType = control.selectedSegmentIndex == 0 ? .standard : .hybrid
        Self.preferredMapType = type
        expandedMap?.mapType = type
        mapView?.mapType = type
        // keep the other map's switch in step
        for host in [mapView, expandedMap?.superview].compactMap({ $0 }) {
            for case let other as UISegmentedControl in host.subviews where other !== control { other.selectedSegmentIndex = control.selectedSegmentIndex }
        }
    }

    @objc private func zoomIn(_ sender: UIButton) {
        if sender.tag == 0 { compactRegionWasManuallyAdjusted = true }
        zoom(sender.tag == 0 ? mapView : expandedMap, by: 0.5)
    }
    @objc private func zoomOut(_ sender: UIButton) {
        if sender.tag == 0 { compactRegionWasManuallyAdjusted = true }
        zoom(sender.tag == 0 ? mapView : expandedMap, by: 2)
    }

    private func zoom(_ map: MKMapView?, by factor: Double) {
        guard let map else { return }
        var region = map.region
        region.span.latitudeDelta = min(90, max(0.002, region.span.latitudeDelta * factor))
        region.span.longitudeDelta = min(180, max(0.002, region.span.longitudeDelta * factor))
        map.setRegion(region, animated: true)
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let map = self.mapView else { call.resolve(); return }
            self.generation += 1
            let token = self.generation
            self.snapshotWork?.cancel()
            // Gestures hide the map instantly: the page's snapshot underneath then moves with the content.
            let duration = call.getBool("immediate") == true ? 0 : 0.15
            UIView.animate(withDuration: duration, animations: { map.alpha = 0 }) { _ in
                guard self.generation == token else { return }
                map.removeFromSuperview()
                map.layer.mask = nil
                self.offsetObservation = nil
                self.pageWebView = nil
            }
            call.resolve()
        }
    }

    private func makeMapView() -> MKMapView {
        let map = PassThroughMapView(frame: .zero)
        map.delegate = self
        map.mapType = Self.preferredMapType
        map.showsUserLocation = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.layer.cornerRadius = 22
        // The card map is a preview: panning/zooming by touch is off and touches fall through to the page so tab swipes
        // and scrolling work over it; tapping the card opens the interactive map. Only the style switch and zoom buttons respond.
        map.isScrollEnabled = false
        map.isZoomEnabled = false
        let controls = addControls(to: map, tag: 0, compact: true)
        map.controls = controls
        return map
    }

    private func updateSpots(_ values: [JSObject], selectedID: String?) {
        guard let map = mapView else { return }
        self.selectedID = selectedID
        var next: [String: FishingSpotAnnotation] = [:]
        for value in values {
            guard let id = value["id"] as? String,
                  let lat = value["lat"] as? Double, let lon = value["lon"] as? Double,
                  CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: lat, longitude: lon)) else { continue }
            let annotation = FishingSpotAnnotation(value)
            next[id] = annotation
        }
        map.removeAnnotations(Array(annotations.values))
        annotations = next
        map.addAnnotations(Array(next.values))
        if let selectedID, let annotation = next[selectedID] {
            map.selectAnnotation(annotation, animated: true)
        }
        map.accessibilityLabel = "Fishing spots map"
    }

    private func fitMap() {
        guard let map = mapView, !annotations.isEmpty else { return }
        if let selectedID, let spot = annotations[selectedID] {
            var region = MKCoordinateRegion(center: spot.coordinate, latitudinalMeters: 2_400, longitudinalMeters: 2_400)
            // Place the selected pin a little below center so its callout clears the top-left map control.
            region.center.latitude += region.span.latitudeDelta * 0.12
            map.setRegion(region, animated: true)
            return
        }
        if annotations.count == 1, let spot = annotations.values.first {
            map.setRegion(MKCoordinateRegion(center: spot.coordinate, latitudinalMeters: 3_500, longitudinalMeters: 3_500), animated: true)
            return
        }
        let points = annotations.values.map { MKMapPoint($0.coordinate) }
        let rect = points.dropFirst().reduce(MKMapRect(origin: points[0], size: MKMapSize(width: 0, height: 0))) { current, point in
            current.union(MKMapRect(origin: point, size: MKMapSize(width: 0, height: 0)))
        }
        // Keep the northern pin heads and labels below Road/Satellite and the expand badge.
        // The asymmetric top/right inset reserves those controls without hiding any spots.
        map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 62, left: 16, bottom: 18, right: 54), animated: true)
    }

    private func mapFitKey(_ values: [JSObject], selectedID: String?) -> String {
        let coordinates = values.compactMap { value -> String? in
            guard let id = value["id"] as? String,
                  let lat = value["lat"] as? Double,
                  let lon = value["lon"] as? Double,
                  CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: lat, longitude: lon)) else { return nil }
            return "\(id):\(lat),\(lon)"
        }.sorted()
        return "\(selectedID ?? "")|\(coordinates.joined(separator: ";"))"
    }

    private func installOffsetObservation(on scrollView: UIScrollView) {
        guard offsetObservation == nil else { return }
        offsetObservation = scrollView.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.updateMask() }
        }
    }

    // Send the page a picture of the map so its slot can stand in for the native view while it is hidden (swipes, sheets).
    private func scheduleSnapshot() {
        snapshotWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.sendSnapshot() }
        snapshotWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }

    private func sendSnapshot() {
        guard let map = mapView, map.superview != nil, map.alpha > 0.99, map.bounds.width > 1, map.bounds.height > 1,
              let scroll = pageWebView?.scrollView else { return }
        // Capture exactly what is on screen (MapKit's overlap-hidden pins stay hidden), and only while the map is fully
        // visible, so the header/tab-bar mask can't clip the picture. Otherwise keep the previous snapshot.
        let fullyVisible = map.frame.minY >= scroll.contentOffset.y + headerBottom && map.frame.maxY <= scroll.contentOffset.y + tabBarTop
        guard fullyVisible else { return }
        let image = UIGraphicsImageRenderer(bounds: map.bounds).image { _ in
            map.drawHierarchy(in: map.bounds, afterScreenUpdates: false)
        }
        guard let jpeg = image.jpegData(compressionQuality: 0.72),
              let data = try? JSONSerialization.data(withJSONObject: ["image": "data:image/jpeg;base64," + jpeg.base64EncodedString()]),
              let json = String(data: data, encoding: .utf8) else { return }
        bridge?.triggerJSEvent(eventName: "ffmap:snapshot", target: "document", data: json)
    }

    private func updateMask() {
        guard let map = mapView, let scroll = pageWebView?.scrollView else { return }
        let mapTop = map.frame.minY
        let mapBottom = map.frame.maxY
        let visibleTop = max(mapTop, scroll.contentOffset.y + headerBottom)
        let visibleBottom = min(mapBottom, scroll.contentOffset.y + tabBarTop)
        let path = UIBezierPath(rect: CGRect(x: 0, y: max(0, visibleTop - mapTop), width: map.bounds.width,
                                             height: max(0, visibleBottom - visibleTop)))
        let mask = CAShapeLayer()
        mask.frame = map.bounds
        mask.path = path.cgPath
        map.layer.mask = mask
    }
}

extension FFMapPlugin: MKMapViewDelegate {
    func mapViewDidFinishRenderingMap(_ mapView: MKMapView, fullyRendered: Bool) {
        if fullyRendered, mapView === self.mapView { scheduleSnapshot() }
    }

    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        if mapView === self.mapView { scheduleSnapshot() }
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let spot = annotation as? FishingSpotAnnotation else { return nil }
        let reuseID = "flagler-spot"
        let marker = (mapView.dequeueReusableAnnotationView(withIdentifier: reuseID) as? MKMarkerAnnotationView) ?? MKMarkerAnnotationView(annotation: spot, reuseIdentifier: reuseID)
        marker.annotation = spot
        marker.canShowCallout = true
        marker.glyphImage = spot.favorite ? UIImage(systemName: "star.fill") : nil
        marker.markerTintColor = spot.closureBadge != nil ? .systemGray : color(for: spot.verdict)
        marker.titleVisibility = .adaptive
        marker.subtitleVisibility = .adaptive
        marker.transform = spot.id == selectedID ? CGAffineTransform(scaleX: 1.08, y: 1.08) : .identity
        marker.displayPriority = spot.id == selectedID ? .required : .defaultHigh
        return marker
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        guard let spot = view.annotation as? FishingSpotAnnotation,
              let data = try? JSONSerialization.data(withJSONObject: ["id": spot.id]),
              let json = String(data: data, encoding: .utf8) else { return }
        guard mapView === expandedMap else { return }  // the card map is a preview; selection happens in the expanded map
        // Let the callout show briefly, then close the sheet and select the spot.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            mapView.window?.rootViewController?.presentedViewController?.dismiss(animated: true)
            self?.bridge?.triggerJSEvent(eventName: "ffmap:select", target: "document", data: json)
        }
    }

    private func color(for verdict: String) -> UIColor {
        switch verdict {
        case "GO": return UIColor(red: 52 / 255, green: 211 / 255, blue: 153 / 255, alpha: 1)
        case "MAYBE": return UIColor(red: 251 / 255, green: 191 / 255, blue: 36 / 255, alpha: 1)
        case "SKIP": return UIColor(red: 248 / 255, green: 113 / 255, blue: 113 / 255, alpha: 1)
        default: return .systemGray
        }
    }
}
