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
}

@objc(FFMapPlugin)
final class FFMapPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FFMapPlugin"
    let jsName = "FFMap"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackgroundColor", returnType: CAPPluginReturnPromise),
    ]

    private weak var pageWebView: WKWebView?
    private var mapView: MKMapView?
    private var annotations: [String: FishingSpotAnnotation] = [:]
    private var selectedID: String?
    private var lastSpots: String?
    private var offsetObservation: NSKeyValueObservation?
    private var generation = 0
    private var headerBottom: CGFloat = 0
    private var tabBarTop: CGFloat = 0
    private var snapshotWork: DispatchWorkItem?

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
            if map.superview !== scrollView { scrollView.addSubview(map) }
            map.frame = frame
            map.alpha = 1
            map.isHidden = false
            map.layer.cornerRadius = 22
            map.layer.masksToBounds = true
            map.overrideUserInterfaceStyle = call.getString("theme") == "light" ? .light : .dark
            let values = call.getArray("spots", JSObject.self) ?? []
            let encodedSpots = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
            let fingerprint = (encodedSpots.flatMap { String(data: $0, encoding: .utf8) } ?? "") + "|\(call.getString("selectedId") ?? "")"
            if fingerprint != self.lastSpots {
                self.lastSpots = fingerprint
                self.updateSpots(values, selectedID: call.getString("selectedId"))
                self.fitMap()
            }
            self.selectedID = call.getString("selectedId")
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
        let map = MKMapView(frame: .zero)
        map.delegate = self
        map.mapType = .hybrid
        map.showsUserLocation = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.layer.cornerRadius = 22
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
            map.setRegion(MKCoordinateRegion(center: spot.coordinate, latitudinalMeters: 2_400, longitudinalMeters: 2_400), animated: true)
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
        map.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 24, left: 28, bottom: 24, right: 28), animated: true)
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
        if fullyRendered { scheduleSnapshot() }
    }

    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        scheduleSnapshot()
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
        bridge?.triggerJSEvent(eventName: "ffmap:select", target: "document", data: json)
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
