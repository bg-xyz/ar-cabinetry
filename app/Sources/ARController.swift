import ARKit
import Combine
import RealityKit
import RoomPlan
import UIKit

/// Owns the AR view and the whole flow: pick what you're building -> scan the room (RoomPlan, drawn
/// live as it's measured) -> tap a wall -> the engine plans that build for the wall's clear space and
/// ceiling height -> it locks onto the wall ->
/// look at it from every angle, change style, width and finishes, nudge it.
/// RoomPlan scans on the AR view's own session, so the walls it measures and the cabinet we draw
/// share one coordinate system: nothing has to be re-aligned after the scan.
@MainActor
final class ARController: ObservableObject {
    enum Phase { case start, scanning, processing, pickWall, placed, unsupported }

    /// What you can build. The planner knows the rules for each; the rest are on the way.
    struct Project: Identifiable {
        let id: String
        let name: String
        let noun: String
        let room: String
        let icon: String
        let ready: Bool
    }
    static let projects: [Project] = [
        .init(id: "vanity", name: "Bathroom vanity", noun: "vanity", room: "Bathroom", icon: "drop.fill", ready: true),
        .init(id: "bookcase", name: "Built-in bookcase", noun: "bookcase", room: "Living room, office", icon: "books.vertical.fill", ready: true),
        .init(id: "console", name: "Media console", noun: "console", room: "Living room", icon: "tv.fill", ready: true),
        .init(id: "dresser", name: "Dresser", noun: "dresser", room: "Bedroom", icon: "cabinet.fill", ready: true),
        .init(id: "closet", name: "Closet system", noun: "closet", room: "Bedroom", icon: "hanger", ready: false),
        .init(id: "kitchen", name: "Kitchen", noun: "kitchen", room: "Kitchen", icon: "refrigerator.fill", ready: false),
    ]

    /// Grain matching: fronts cut in sequence from one panel so the veneer flows across the face.
    static let grains: [(name: String, id: String, hint: String)] = [
        ("Across", "across", "Grain flows sideways across every front"),
        ("Waterfall", "waterfall", "Vertical grain flowing down each stack"),
        ("Off", "off", "Best yield, no matching"),
    ]

    /// The four presets (DESIGN.md: plain descriptive names), with what each one is.
    static let styles: [(name: String, preset: String, hint: String)] = [
        ("Slab", "classic-euro", "Full-overlay slab fronts"), ("Frame", "ply-inset", "The plywood box frames each front"),
        ("Shadow", "recessed-inset", "Fronts set back, a shadow line"), ("Flush", "milan-flush", "Flush ends, push to open"),
    ]

    @Published var phase: Phase = .start
    @Published var status = ""
    @Published var scanSummary = ""
    @Published var coaching = ""
    @Published var notes: [String] = []
    @Published var design: Design?
    @Published var plan: PlanResult?
    @Published var choice: FinishChoice?
    @Published var project = UserDefaults.standard.string(forKey: "project") ?? "vanity" {
        didSet { UserDefaults.standard.set(project, forKey: "project") }
    }
    @Published var stylePreset = "classic-euro"
    @Published var widthChoice: Double?   // mm; nil = best fit
    @Published var grainChoice: String?   // nil = the planner's default for the build

    var current: Project { Self.projects.first { $0.id == project } ?? Self.projects[0] }

    let arView = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)

    private let lib = MaterialLibrary()
    private let scanDelegate = ScanDelegate()
    private var session: RoomCaptureSession?
    private var lastDraw = Date.distantPast
    private var room: CapturedRoom?
    private var walls: [String: CapturedRoom.Surface] = [:]
    private let roomAnchor = AnchorEntity(world: matrix_identity_float4x4)
    private let cabinetAnchor = AnchorEntity(world: matrix_identity_float4x4)
    private var cabinet: Entity?
    private var wall: CapturedRoom.Surface?
    private var frame: WallFrame?
    private var along: Float = 0      // m, user nudge along the wall
    private var out: Float = 0        // m, gap between wall and cabinet back

    init() {
        arView.scene.addAnchor(roomAnchor)
        arView.scene.addAnchor(cabinetAnchor)
        arView.addGestureRecognizer(UITapGestureRecognizer(target: TapTarget.shared, action: #selector(TapTarget.tapped(_:))))
        TapTarget.shared.onTap = { [weak self] point in self?.tapped(at: point) }
        scanDelegate.onUpdate = { [weak self] room in Task { @MainActor in self?.scanUpdated(room) } }
        scanDelegate.onInstruction = { [weak self] i in Task { @MainActor in self?.coaching = Self.coachingText(i) } }
        scanDelegate.onEnd = { [weak self] data, error in Task { @MainActor in await self?.scanEnded(data, error) } }
        let config = ARWorldTrackingConfiguration()
        config.environmentTexturing = .automatic
        arView.session.run(config)
    }

    // MARK: scan

    func startScan() {
        guard RoomCaptureSession.isSupported else { phase = .unsupported; return }
        cabinet?.removeFromParent()
        cabinet = nil
        roomAnchor.children.removeAll()
        notes = []
        let s = RoomCaptureSession(arSession: arView.session)
        s.delegate = scanDelegate
        s.run(configuration: RoomCaptureSession.Configuration())
        session = s
        scanSummary = "Point at a wall to start"
        coaching = ""
        phase = .scanning
    }

    func finishScan() {
        session?.stop(pauseARSession: false)
        phase = .processing
    }

    /// Live: redraw what RoomPlan has found so far (a few times a second).
    private func scanUpdated(_ room: CapturedRoom) {
        guard phase == .scanning, Date().timeIntervalSince(lastDraw) > 0.35 else { return }
        lastDraw = Date()
        draw(room, labels: true)
        scanSummary = Self.summary(room)
    }

    private func scanEnded(_ data: CapturedRoomData?, _ error: Error?) async {
        guard let data else { status = error?.localizedDescription ?? "The scan didn't finish. Try again."; phase = .start; return }
        do {
            let room = try await RoomBuilder(options: [.beautifyObjects]).capturedRoom(from: data)
            scanFinished(room)
        } catch {
            status = "Couldn't finish the room: \(error.localizedDescription)"
            phase = .start
        }
    }

    private func scanFinished(_ room: CapturedRoom) {
        self.room = room
        session = nil
        // keep tracking in the same world space, and let real things hide the cabinet (LiDAR mesh)
        let config = ARWorldTrackingConfiguration()
        config.environmentTexturing = .automatic
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { config.sceneReconstruction = .mesh }
        arView.session.run(config)
        arView.environment.sceneUnderstanding.options.insert(.occlusion)
        showWalls()
    }

    static func summary(_ room: CapturedRoom) -> String {
        func n(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }
        var parts = [n(room.walls.count, "wall")]
        if !room.doors.isEmpty { parts.append(n(room.doors.count, "door")) }
        if !room.windows.isEmpty { parts.append(n(room.windows.count, "window")) }
        let found = room.objects.compactMap { o -> String? in
            switch o.category {
            case .sink: return "sink"
            case .toilet: return "toilet"
            case .bathtub: return "tub"
            default: return nil
            }
        }
        for f in Set(found).sorted() { parts.append("\(f) \u{2713}") }
        return parts.joined(separator: " \u{00B7} ")
    }

    static func coachingText(_ i: RoomCaptureSession.Instruction) -> String {
        switch i {
        case .moveCloseToWall: return "Move a little closer to the wall"
        case .moveAwayFromWall: return "Step back from the wall"
        case .slowDown: return "Slow down"
        case .turnOnLight: return "Turn on more light"
        case .lowTexture: return "Point at walls with more detail"
        default: return ""
        }
    }

    // MARK: drawing the measured room

    /// Walls teal, doors orange, windows blue, openings yellow, fixtures as boxes; wall lengths written on the walls.
    private func draw(_ room: CapturedRoom, labels: Bool) {
        roomAnchor.children.removeAll()
        walls = [:]
        let cam = arView.cameraTransform.translation
        for w in room.walls {
            let plane = Self.plane(w, color: UIColor.systemTeal.withAlphaComponent(0.32), towards: cam, lift: 0)
            plane.name = w.identifier.uuidString
            plane.generateCollisionShapes(recursive: false)
            roomAnchor.addChild(plane)
            walls[plane.name] = w
            if labels {
                let p = RoomAnalysis.position(w.transform) + SIMD3<Float>(0, min(w.dimensions.y / 2 - 0.25, 0.4), 0)
                roomAnchor.addChild(Self.label(RoomAnalysis.feetInches(w.dimensions.x), at: p, facing: cam, size: 0.09))
            }
        }
        for (list, color) in [(room.doors, UIColor.systemOrange), (room.windows, UIColor.systemBlue), (room.openings, UIColor.systemYellow)] {
            for s in list { roomAnchor.addChild(Self.plane(s, color: color.withAlphaComponent(0.45), towards: cam, lift: 0.012)) }
        }
        for o in room.objects {
            let box = ModelEntity(mesh: .generateBox(size: o.dimensions), materials: [SimpleMaterial(color: UIColor.white.withAlphaComponent(0.28), isMetallic: false)])
            box.transform = Transform(matrix: o.transform)
            roomAnchor.addChild(box)
            let name: String?
            switch o.category {
            case .sink: name = "Sink"
            case .toilet: name = "Toilet"
            case .bathtub: name = "Tub"
            case .storage: name = "Cabinet"
            default: name = nil
            }
            if let name, labels {
                let top = RoomAnalysis.position(o.transform) + SIMD3<Float>(0, o.dimensions.y / 2 + 0.08, 0)
                roomAnchor.addChild(Self.label(name, at: top, facing: cam, size: 0.06))
            }
        }
    }

    private static func plane(_ s: CapturedRoom.Surface, color: UIColor, towards cam: SIMD3<Float>, lift: Float) -> ModelEntity {
        let e = ModelEntity(mesh: .generatePlane(width: s.dimensions.x, height: s.dimensions.y),
                            materials: [SimpleMaterial(color: color, isMetallic: false)])
        e.transform = Transform(matrix: s.transform)
        if lift > 0 {   // float doors/windows just in front of their wall so they don't flicker
            var n = SIMD3<Float>(s.transform.columns.2.x, s.transform.columns.2.y, s.transform.columns.2.z)
            if simd_dot(n, cam - RoomAnalysis.position(s.transform)) < 0 { n = -n }
            e.position += n * lift
        }
        return e
    }

    /// Flat text that faces the camera.
    private static func label(_ text: String, at p: SIMD3<Float>, facing cam: SIMD3<Float>, size: CGFloat) -> Entity {
        let mesh = MeshResource.generateText(text, extrusionDepth: 0.002, font: .systemFont(ofSize: size, weight: .bold),
                                             containerFrame: .zero, alignment: .center, lineBreakMode: .byWordWrapping)
        let text = ModelEntity(mesh: mesh, materials: [UnlitMaterial(color: .white)])
        text.position = SIMD3<Float>(-mesh.bounds.center.x, -mesh.bounds.center.y, 0)
        let holder = Entity()
        holder.addChild(text)
        // look(at:) points -z at the target; the text's front is +z, so look away from the camera
        holder.look(at: p + (p - cam), from: p, relativeTo: nil)
        return holder
    }

    // MARK: pick a wall

    func showWalls() {
        guard let room else { return }
        cabinet?.removeFromParent()
        cabinet = nil
        draw(room, labels: true)
        roomAnchor.isEnabled = true
        notes = []
        phase = .pickWall
        status = room.walls.isEmpty ? "No walls found. Try scanning again." : "Tap the wall for your \(current.noun)"
    }

    private func tapped(at point: CGPoint) {
        guard phase == .pickWall, let hit = arView.entity(at: point), let w = walls[hit.name] else { return }
        place(on: w)
    }

    private func wallFrame(_ w: CapturedRoom.Surface) -> WallFrame {
        let c = RoomAnalysis.position(w.transform)
        let y = SIMD3<Float>(0, 1, 0)
        let along = simd_normalize(SIMD3<Float>(w.transform.columns.0.x, 0, w.transform.columns.0.z))
        var z = simd_cross(along, y)
        if simd_dot(z, arView.cameraTransform.translation - c) < 0 { z = -z }   // into the room, toward you
        return WallFrame(x: simd_cross(y, z), z: z, c: c, length: w.dimensions.x, floorY: c.y - w.dimensions.y / 2, height: w.dimensions.y)
    }

    private func place(on w: CapturedRoom.Surface) {
        wall = w
        frame = wallFrame(w)
        along = 0
        out = 0
        widthChoice = nil
        replan()
    }

    /// Ask the engine for the best build for this wall's clear space and height, then show it.
    func replan() {
        guard let w = wall, let f = frame, let room else { return }
        let (obstacles, sinkAt) = RoomAnalysis.obstacles(on: w, frame: f, room: room)
        let input = PlanInput(project: project, wallLength: Double(f.length * 1000), wallHeight: Double(f.height * 1000),
                              obstacles: obstacles, sinkAt: project == "vanity" ? sinkAt : nil,
                              width: widthChoice, style: style)
        do {
            let (p, d) = try Engine.shared.plan(input)
            plan = p
            if choice == nil { choice = FinishChoice(design: d) }
            design = d
            notes = p.notes
            roomAnchor.isEnabled = false
            rebuild()
            phase = .placed
            status = "\(p.name) \u{00B7} \(d.style)"
        } catch {
            status = error.localizedDescription
            notes = []
            phase = .pickWall
        }
    }

    // MARK: the cabinet

    func rebuild() {
        guard let design, let choice else { return }
        cabinet?.removeFromParent()
        let e = CabinetBuilder.build(design, choice: choice, lib: lib)
        let light = DirectionalLight()
        light.light.intensity = 900
        light.shadow = DirectionalLightComponent.Shadow(maximumDistance: 4, depthBias: 2)
        e.addChild(light)
        light.look(at: SIMD3<Float>(0.6, 0.4, 0.3), from: SIMD3<Float>(-0.3, 2.4, 1.6), relativeTo: e)
        cabinetAnchor.addChild(e)
        cabinet = e
        position()
    }

    private func position() {
        guard let cabinet, let f = frame, let plan else { return }
        let left = Float(plan.x0 / 1000) - f.length / 2 + along
        let origin = SIMD3<Float>(f.c.x, f.floorY, f.c.z) + f.x * left + f.z * out
        cabinet.transform = Transform(matrix: simd_float4x4(SIMD4(f.x, 0), SIMD4(0, 1, 0, 0), SIMD4(f.z, 0), SIMD4(origin, 1)))
    }

    /// Slide along the wall (right +) or away from it, in inches.
    func nudge(along dx: Float = 0, out dz: Float = 0) {
        along += dx * 0.0254
        out = max(0, out + dz * 0.0254)
        position()
    }

    func setStyle(_ preset: String) {
        stylePreset = preset
        replan()
    }

    private var style: [String: String] {
        var s = ["preset": stylePreset]
        if let g = grainChoice { s["grainMatch"] = g }
        return s
    }

    func setGrain(_ id: String) {
        grainChoice = id
        replan()
    }

    /// Switch what's being built on the same wall, no rescan.
    func setProject(_ id: String) {
        project = id
        widthChoice = nil
        along = 0
        replan()
    }

    func setWidth(_ mm: Double?) {
        widthChoice = mm
        along = 0
        replan()
    }

    /// Other widths that fit the clear stretch (from the planner).
    var widthOptions: [Double] { plan?.widthOptions ?? [] }

    func setFinish(_ slot: FinishSlot, _ id: String) {
        guard var c = choice else { return }
        switch slot {
        case .fronts: c.fronts = id
        case .cabinet: c.cabinet = id
        case .top: c.top = id
        case .fixedBirch: return
        }
        choice = c
        rebuild()
    }

    func pickAnotherWall() {
        showWalls()
    }
}

/// RoomPlan session callbacks, forwarded as closures.
final class ScanDelegate: NSObject, RoomCaptureSessionDelegate, NSCoding {
    var onUpdate: ((CapturedRoom) -> Void)?
    var onInstruction: ((RoomCaptureSession.Instruction) -> Void)?
    var onEnd: ((CapturedRoomData?, Error?) -> Void)?

    override init() { super.init() }
    required init?(coder: NSCoder) { super.init() }
    func encode(with coder: NSCoder) {}

    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) { onUpdate?(room) }
    func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) { onInstruction?(instruction) }
    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) { onEnd?(data, error) }
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
