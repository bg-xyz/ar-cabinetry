import ARKit
import Combine
import RealityKit
import RoomPlan
import UIKit

/// Owns the AR view and the whole flow: scan the room (RoomPlan) -> tap a wall -> the cabinet
/// locks onto that wall -> look at it from every angle, swap designs and finishes, nudge it.
/// RoomPlan scans on the AR view's own session, so the walls it measures and the cabinet we draw
/// share one coordinate system: nothing has to be re-aligned after the scan.
@MainActor
final class ARController: ObservableObject {
    enum Phase { case start, scanning, processing, pickWall, placed, unsupported }

    @Published var phase: Phase = .start
    @Published var designIndex = 0 { didSet { if oldValue != designIndex { choice = FinishChoice(design: design); rebuild() } } }
    @Published var choice: FinishChoice
    @Published var status = ""

    let arView = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
    let designs = DesignLibrary.load()
    var design: Design { designs[designIndex] }

    private let lib = MaterialLibrary()
    private let scanDelegate = ScanDelegate()
    private var captureView: RoomCaptureView?
    private var room: CapturedRoom?
    private var walls: [String: CapturedRoom.Surface] = [:]
    private var wallsAnchor: AnchorEntity?
    private let cabinetAnchor = AnchorEntity(world: matrix_identity_float4x4)
    private var cabinet: Entity?
    private var wall: CapturedRoom.Surface?
    private var along: Float = 0      // m, cabinet centre from wall centre
    private var out: Float = 0        // m, gap between wall and cabinet back
    private var flip = false          // wall normal points away from the room

    init() {
        choice = FinishChoice(design: DesignLibrary.load().first ?? Design.empty)
        arView.scene.addAnchor(cabinetAnchor)
        arView.addGestureRecognizer(UITapGestureRecognizer(target: TapTarget.shared, action: #selector(TapTarget.tapped(_:))))
        TapTarget.shared.onTap = { [weak self] point in self?.tapped(at: point) }
        scanDelegate.onResult = { [weak self] room in Task { @MainActor in self?.scanFinished(room) } }
        let config = ARWorldTrackingConfiguration()
        config.environmentTexturing = .automatic
        arView.session.run(config)
    }

    // MARK: scan

    func startScan() {
        guard RoomCaptureSession.isSupported else { phase = .unsupported; return }
        cabinet?.removeFromParent()
        cabinet = nil
        wallsAnchor?.removeFromParent()
        let view = RoomCaptureView(frame: arView.bounds, arSession: arView.session)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.delegate = scanDelegate
        arView.addSubview(view)
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        captureView = view
        phase = .scanning
    }

    func finishScan() {
        captureView?.captureSession.stop(pauseARSession: false)
        phase = .processing
    }

    private func scanFinished(_ room: CapturedRoom) {
        self.room = room
        captureView?.removeFromSuperview()
        captureView = nil
        // keep tracking in the same world space, and let real things hide the cabinet (LiDAR mesh)
        let config = ARWorldTrackingConfiguration()
        config.environmentTexturing = .automatic
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { config.sceneReconstruction = .mesh }
        arView.session.run(config)
        arView.environment.sceneUnderstanding.options.insert(.occlusion)
        showWalls()
    }

    // MARK: pick a wall

    func showWalls() {
        guard let room else { return }
        wallsAnchor?.removeFromParent()
        let anchor = AnchorEntity(world: matrix_identity_float4x4)
        walls = [:]
        for w in room.walls {
            let plane = ModelEntity(mesh: .generatePlane(width: w.dimensions.x, height: w.dimensions.y),
                                    materials: [SimpleMaterial(color: UIColor.systemTeal.withAlphaComponent(0.35), isMetallic: false)])
            plane.transform = Transform(matrix: w.transform)
            plane.name = w.identifier.uuidString
            plane.generateCollisionShapes(recursive: false)
            anchor.addChild(plane)
            walls[plane.name] = w
        }
        arView.scene.addAnchor(anchor)
        wallsAnchor = anchor
        phase = .pickWall
        status = room.walls.isEmpty ? "No walls found. Try scanning again." : "Tap the wall for your cabinet"
    }

    private func tapped(at point: CGPoint) {
        guard phase == .pickWall, let hit = arView.entity(at: point), let w = walls[hit.name] else { return }
        place(on: w)
    }

    private func place(on w: CapturedRoom.Surface) {
        wall = w
        wallsAnchor?.isEnabled = false
        let c = SIMD3<Float>(w.transform.columns.3.x, w.transform.columns.3.y, w.transform.columns.3.z)
        flip = simd_dot(normalOf(w), arView.cameraTransform.translation - c) < 0
        out = 0
        along = sinkOffset(on: w) ?? 0
        rebuild()
        phase = .placed
    }

    /// If RoomPlan found a sink against this wall, centre the new vanity on it (that's where the plumbing is).
    private func sinkOffset(on w: CapturedRoom.Surface) -> Float? {
        guard let room else { return nil }
        let (x, _, z, c) = basis(w)
        let sinks = room.objects.filter { $0.category == .sink }.map { o -> SIMD3<Float> in
            SIMD3(o.transform.columns.3.x, o.transform.columns.3.y, o.transform.columns.3.z) - c
        }
        guard let s = sinks.filter({ abs(simd_dot($0, z)) < 0.8 && abs(simd_dot($0, x)) < w.dimensions.x / 2 })
            .min(by: { abs(simd_dot($0, z)) < abs(simd_dot($1, z)) }) else { return nil }
        return simd_dot(s, x)
    }

    private func normalOf(_ w: CapturedRoom.Surface) -> SIMD3<Float> {
        let x = simd_normalize(SIMD3<Float>(w.transform.columns.0.x, 0, w.transform.columns.0.z))
        return simd_cross(x, SIMD3<Float>(0, 1, 0))
    }

    /// Wall frame: x along the wall, y up, z out of the wall into the room, c = wall centre.
    private func basis(_ w: CapturedRoom.Surface) -> (SIMD3<Float>, SIMD3<Float>, SIMD3<Float>, SIMD3<Float>) {
        let y = SIMD3<Float>(0, 1, 0)
        var z = normalOf(w)
        if flip { z = -z }
        let x = simd_cross(y, z)
        let c = SIMD3<Float>(w.transform.columns.3.x, w.transform.columns.3.y, w.transform.columns.3.z)
        return (x, y, z, c)
    }

    // MARK: the cabinet

    func rebuild() {
        guard let w = wall, !designs.isEmpty else { return }
        cabinet?.removeFromParent()
        let e = CabinetBuilder.build(design, choice: choice, lib: lib)
        let light = DirectionalLight()
        light.light.intensity = 900
        light.shadow = DirectionalLightComponent.Shadow(maximumDistance: 4, depthBias: 2)
        e.addChild(light)
        light.look(at: SIMD3<Float>(0.6, 0.4, 0.3), from: SIMD3<Float>(-0.3, 2.4, 1.6), relativeTo: e)
        cabinetAnchor.addChild(e)
        cabinet = e
        position(on: w)
        status = "\(design.overall.width.inchesText) wide \u{00B7} \(design.style)"
    }

    private func position(on w: CapturedRoom.Surface) {
        guard let cabinet else { return }
        let (x, y, z, c) = basis(w)
        let width = Float(design.overall.width / 1000)
        let floorY = c.y - w.dimensions.y / 2
        let origin = SIMD3<Float>(c.x, floorY, c.z) + x * (along - width / 2) + z * out
        cabinet.transform = Transform(matrix: simd_float4x4(SIMD4(x, 0), SIMD4(y, 0), SIMD4(z, 0), SIMD4(origin, 1)))
    }

    /// Slide along the wall (right +) or away from it, in inches.
    func nudge(along dx: Float = 0, out dz: Float = 0) {
        guard let w = wall else { return }
        along += dx * 0.0254
        out = max(0, out + dz * 0.0254)
        position(on: w)
    }

    func setFinish(_ slot: FinishSlot, _ id: String) {
        switch slot {
        case .fronts: choice.fronts = id
        case .cabinet: choice.cabinet = id
        case .top: choice.top = id
        case .fixedBirch: return
        }
        rebuild()
    }

    func pickAnotherWall() {
        cabinet?.removeFromParent()
        cabinet = nil
        wallsAnchor?.isEnabled = true
        phase = .pickWall
        status = "Tap the wall for your cabinet"
    }
}

/// RoomPlan's delegate protocol requires NSCoding, so it lives in its own small class.
final class ScanDelegate: NSObject, RoomCaptureViewDelegate {
    var onResult: ((CapturedRoom) -> Void)?

    override init() { super.init() }
    required init?(coder: NSCoder) { super.init() }
    func encode(with coder: NSCoder) {}

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) { onResult?(processedResult) }
}

/// Target for the AR view's tap gesture (selectors need an NSObject).
@MainActor
final class TapTarget: NSObject {
    static let shared = TapTarget()
    var onTap: ((CGPoint) -> Void)?
    @objc func tapped(_ g: UITapGestureRecognizer) {
        guard let view = g.view else { return }
        onTap?(g.location(in: view))
    }
}

extension Design {
    static let empty = Design(name: "", style: "", overall: .init(width: 0, height: 0, depth: 0, elevation: 0),
                              parts: [], fixtures: [], finishes: [:], order: 0)
}
