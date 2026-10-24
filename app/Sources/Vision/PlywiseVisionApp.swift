import ARKit
import RealityKit
import SwiftUI

// Plywise on Vision Pro. The same engine (JavaScriptCore), models, textures and design language as
// the iPhone app (Sources/Shared):
//   main window   glass: pick a build, flick through styles, grain and finishes, read the plan
//   "piece"       a volume with the design at true scale (or scaled to fit), floating caption;
//                 look at a drawer or door and pinch to open it
//   "room"        an immersive space: Vision Pro finds your walls, pinch one, and the planner sizes
//                 the piece to it and stands it there, with its catalogue plate floating above

@main
struct PlywiseVisionApp: App {
    @State private var model = VisionModel()

    var body: some SwiftUI.Scene {
        WindowGroup(id: "main") {
            VisionHome().environment(model).tint(Theme.brass)
        }
        .defaultSize(width: 780, height: 700)

        WindowGroup(id: "piece") {
            PieceVolume().environment(model)
        }
        .windowStyle(.volumetric)
        .defaultSize(width: 1.5, height: 1.1, depth: 0.8, in: .meters)

        ImmersiveSpace(id: "room") {
            RoomSpace().environment(model)
        }
    }
}

/// What's being designed. Plans with the same engine call as the iPhone; until a wall is picked in
/// the room, it plans for a typical 8' wall.
@MainActor @Observable
final class VisionModel {
    var project = "dresser"
    var stylePreset = "classic-euro"
    var grain: String?
    var plan: PlanResult?
    var design: Design?
    var choice: FinishChoice?
    var error: String?
    var wallLength = 2440.0   // mm
    var wallHeight = 2440.0
    var version = 0           // bumps on every change, so the 3D views rebuild
    var assembleToken = 0     // bumps for "Watch it build"

    var current: Builds.Kind { Builds.projects.first { $0.id == project } ?? Builds.projects[0] }

    func replan() {
        var style = ["preset": stylePreset]
        if let grain { style["grainMatch"] = grain }
        let input = PlanInput(project: project, wallLength: wallLength, wallHeight: wallHeight, obstacles: [], sinkAt: nil, width: nil, style: style)
        do {
            let (p, d) = try Engine.shared.plan(input)
            plan = p
            design = d
            if choice == nil { choice = FinishChoice(design: d) }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        version += 1
    }

    func setFinish(_ slot: FinishSlot, _ id: String) {
        guard var c = choice else { return }
        switch slot {
        case .fronts: c.fronts = id
        case .cabinet: c.cabinet = id
        case .top: c.top = id
        case .fixedBirch: return
        }
        choice = c
        version += 1
    }

    /// The piece as an entity: built, lit by the room, casting a soft grounding shadow, touchable.
    func buildPiece(lib: MaterialLibrary) -> Entity? {
        guard let design, let choice else { return nil }
        let e = CabinetBuilder.build(design, choice: choice, lib: lib)
        e.name = "piece"
        for case let m as ModelEntity in e.descendants { m.components.set(GroundingShadowComponent(castsShadow: true)) }
        e.generateCollisionShapes(recursive: true)
        e.components.set(InputTargetComponent())
        return e
    }

    func finishItems() -> [RollPicker.Item] {
        guard let design else { return [] }
        return design.finishes.keys.sorted().map { id in
            let name = design.finishes[id]?.name.components(separatedBy: " (").first?.replacingOccurrences(of: " veneer", with: "") ?? id
            return .init(id: id, title: name.replacingOccurrences(of: "Painted ", with: "").replacingOccurrences(of: "Natural Baltic birch", with: "Birch"),
                         detail: design.finishes[id]?.paint != nil ? "paint" : "veneer")
        }
    }
}

extension Entity {
    /// Every entity below this one.
    var descendants: [Entity] { children.flatMap { [$0] + $0.descendants } }
}

// MARK: - the main window

struct VisionHome: View {
    @Environment(VisionModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace
    @State private var inRoom = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("Plywise").font(Theme.serif(56))
                    Circle().fill(Theme.brass).frame(width: 9, height: 9)
                    Spacer()
                    Text("Built for your walls.").font(Theme.serif(22, italic: true)).foregroundStyle(.secondary)
                }
                Caps("What are you building?")
                RollPicker(items: Builds.projects.map { .init(id: $0.id, title: $0.name, detail: $0.ready ? $0.room : "Coming soon", icon: $0.icon, enabled: $0.ready) },
                           selected: model.project, large: true) { id in
                    guard Builds.projects.first(where: { $0.id == id })?.ready == true else { return }
                    model.project = id
                    model.replan()
                }
                Caps("Style")
                RollPicker(items: Builds.styles.map { .init(id: $0.preset, title: $0.name, detail: $0.hint) }, selected: model.stylePreset) {
                    model.stylePreset = $0
                    model.replan()
                }
                Caps("Grain")
                RollPicker(items: Builds.grains.map { .init(id: $0.id, title: $0.name, detail: $0.hint) }, selected: model.plan?.grainMatch ?? "across") {
                    model.grain = $0
                    model.replan()
                }
                if let c = model.choice {
                    Caps("Fronts")
                    RollPicker(items: model.finishItems(), selected: c.fronts) { model.setFinish(.fronts, $0) }
                }
                if let p = model.plan {
                    Divider()
                    Text(p.name.capitalizingFirst).font(Theme.serif(34))
                    ForEach(Array(p.notes.prefix(3).enumerated()), id: \.offset) { _, note in
                        Text(note).font(.callout).foregroundStyle(.secondary)
                    }
                }
                if let e = model.error { Text(e).font(.callout).foregroundStyle(Theme.signal) }
                HStack(spacing: 14) {
                    Button { openWindow(id: "piece") } label: { Label("See it in 3D", systemImage: "cube.transparent") }
                    Button { model.assembleToken += 1 } label: { Label("Watch it build", systemImage: "hammer") }
                    Button {
                        Task {
                            if inRoom { await dismissImmersiveSpace(); inRoom = false }
                            else if case .opened = await openImmersiveSpace(id: "room") { inRoom = true }
                        }
                    } label: { Label(inRoom ? "Leave your room" : "Place it in your room", systemImage: inRoom ? "xmark" : "square.split.bottomrightquarter") }
                        .buttonStyle(.borderedProminent)
                }
                .padding(.top, 6)
            }
            .padding(40)
        }
        .task { if model.plan == nil { model.replan() } }
    }
}

/// The floating catalogue plate: number, name, the spec line.
struct PlateLabel: View {
    let plan: PlanResult?
    let style: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Caps("Plywise · \(style)")
            Text(plan?.name.capitalizingFirst ?? "").font(Theme.serif(30))
            if let price = plan?.notes.first(where: { $0.hasPrefix("About $") }) {
                Text(price.components(separatedBy: " (").first ?? price).font(.callout).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 26).padding(.vertical, 18)
        .glassBackgroundEffect()
    }
}

// MARK: - the volume

struct PieceVolume: View {
    @Environment(VisionModel.self) private var model
    @State private var lib = MaterialLibrary()
    @State private var stage = Entity()
    @State private var opened: Set<String> = []
    @State private var built = Built()

    private var styleName: String { Builds.styles.first { $0.preset == model.stylePreset }?.name ?? "" }

    var body: some View {
        RealityView { content, attachments in
            content.add(stage)
            if let plate = attachments.entity(for: "plate") {
                plate.name = "plate"
                content.add(plate)
                built.plate = plate
            }
            rebuild(plate: attachments.entity(for: "plate"))
        } update: { _, attachments in
            _ = model.version   // observe: rebuild when the design changes
            rebuild(plate: attachments.entity(for: "plate"))
        } attachments: {
            Attachment(id: "plate") { PlateLabel(plan: model.plan, style: styleName) }
        }
        .gesture(SpatialTapGesture().targetedToAnyEntity().onEnded { value in
            guard let design = model.design, let body = stage.children.first?.children.first?.children.first else { return }
            CabinetBuilder.toggleFront(value.entity, design: design, body: body, opened: &opened)
        })
        .onChange(of: model.version) { _, _ in   // a fresh build starts closed
            opened = []
            rebuild(plate: built.plate)
        }
        .onChange(of: model.assembleToken) { _, _ in
            opened = []
            built.version = -1
            rebuild(plate: nil)
            if let design = model.design, let body = stage.children.first?.children.first?.children.first {
                CabinetBuilder.assemble(body, design: design)
            }
        }
    }

    /// Fit the piece in the 1.5 x 1.1 x 0.8 m volume (true scale when it fits), standing on its floor.
    private func rebuild(plate: Entity?) {
        guard built.version != model.version, let piece = model.buildPiece(lib: lib), let ov = model.design?.overall else { return }
        built.version = model.version
        stage.children.removeAll()
        let w = Float(ov.width / 1000), h = Float((ov.height + ov.elevation) / 1000), d = Float(ov.depth / 1000)
        let s = min(1, 1.35 / w, 0.9 / h, 0.7 / d)
        let holder = Entity()
        holder.addChild(piece)
        piece.position = SIMD3(-w / 2, 0, -d / 2)
        holder.scale = SIMD3(repeating: s)
        holder.position = SIMD3(0, -0.53, 0)
        stage.addChild(holder)
        plate?.position = SIMD3(0, -0.53 + h * s + 0.12, 0.05)
    }
}

/// Which design version the volume was built for (so updates rebuild only when something changed).
final class Built {
    var version = -1
    var plate: Entity?
}

// MARK: - the room

struct RoomSpace: View {
    @Environment(VisionModel.self) private var model
    @State private var lib = MaterialLibrary()
    @State private var session = ARKitSession()
    @State private var planes = PlaneDetectionProvider(alignments: [.vertical])
    @State private var world = Entity()
    @State private var walls: [UUID: Wall] = [:]
    @State private var placedOn: UUID?
    @State private var opened: Set<String> = []
    @State private var status = "Look at the wall where it goes, then pinch it."

    /// A detected wall, seen from inside the room: x runs left to right as you face it, z points
    /// into the room, centre and size in metres.
    struct Wall {
        var center: SIMD3<Float>
        var x: SIMD3<Float>
        var up: SIMD3<Float>
        var z: SIMD3<Float>
        var width: Float
        var height: Float
        var matrix: simd_float4x4 { simd_float4x4(SIMD4(x, 0), SIMD4(up, 0), SIMD4(z, 0), SIMD4(center, 1)) }
    }

    private var styleName: String { Builds.styles.first { $0.preset == model.stylePreset }?.name ?? "" }

    var body: some View {
        RealityView { content, attachments in
            content.add(world)
            if let hint = attachments.entity(for: "hint") {
                hint.position = SIMD3(0, 1.45, -1.1)
                content.add(hint)
            }
        } update: { content, attachments in
            _ = model.version
            if let plate = attachments.entity(for: "plate") {
                if plate.parent == nil { content.add(plate) }
                plate.isEnabled = placedOn != nil
                if let id = placedOn, let wall = walls[id], let ov = model.design?.overall, let plan = model.plan {
                    // float above the piece's centre, facing the room
                    let along = Float(plan.x0 + ov.width / 2) / 1000 - wall.width / 2
                    let top = Float(ov.height + ov.elevation) / 1000
                    let p = SIMD3<Float>(wall.center.x, 0, wall.center.z) + wall.x * along + wall.z * 0.35 + SIMD3(0, top + 0.28, 0)
                    plate.transform = Transform(matrix: simd_float4x4(SIMD4(wall.x, 0), SIMD4(wall.up, 0), SIMD4(wall.z, 0), SIMD4(p, 1)))
                }
            }
        } attachments: {
            Attachment(id: "hint") {
                Text(status).font(Theme.serif(26, italic: true)).padding(.horizontal, 28).padding(.vertical, 14).glassBackgroundEffect()
            }
            Attachment(id: "plate") { PlateLabel(plan: model.plan, style: styleName) }
        }
        .gesture(SpatialTapGesture().targetedToAnyEntity().onEnded { value in tapped(value.entity) })
        .task { await findWalls() }
        .onChange(of: model.version) { _, _ in if let id = placedOn { place(on: id, replan: false) } }
        .onChange(of: model.assembleToken) { _, _ in
            guard let id = placedOn else { return }
            place(on: id, replan: false)
            if let design = model.design, let body = world.findEntity(named: "piece")?.children.first {
                CabinetBuilder.assemble(body, design: design)
            }
        }
    }

    private func findWalls() async {
        guard PlaneDetectionProvider.isSupported else { status = "Wall detection needs a Vision Pro."; return }
        do { try await session.run([planes]) } catch { status = "Couldn't start wall detection: \(error.localizedDescription)"; return }
        for await update in planes.anchorUpdates {
            let anchor = update.anchor
            guard anchor.classification == .wall else { continue }
            switch update.event {
            case .added, .updated: show(anchor)
            case .removed:
                world.findEntity(named: "wall-\(anchor.id)")?.removeFromParent()
                walls[anchor.id] = nil
            }
        }
    }

    /// A detected wall as a faint, pinchable panel.
    private func show(_ anchor: PlaneAnchor) {
        let extent = anchor.geometry.extent
        let t = anchor.originFromAnchorTransform * extent.anchorFromExtentTransform
        let c0 = simd_normalize(SIMD3(t.columns.0.x, t.columns.0.y, t.columns.0.z))
        let c1 = simd_normalize(SIMD3(t.columns.1.x, t.columns.1.y, t.columns.1.z))
        let c2 = simd_normalize(SIMD3(t.columns.2.x, t.columns.2.y, t.columns.2.z))
        // the in-plane axis closest to vertical is "up"; the other one is the wall's normal
        var up = abs(c1.y) >= abs(c2.y) ? c1 : c2
        var z = abs(c1.y) >= abs(c2.y) ? c2 : c1
        let center = SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
        if up.y < 0 { up = -up }
        if simd_dot(z, -center) < 0 { z = -z }            // into the room, toward where you started
        let x = simd_normalize(simd_cross(up, z))
        let wall = Wall(center: center, x: x, up: up, z: z, width: extent.width, height: extent.height)
        walls[anchor.id] = wall
        let name = "wall-\(anchor.id)"
        let panel = (world.findEntity(named: name) as? ModelEntity) ?? {
            let e = ModelEntity()
            e.name = name
            e.components.set(InputTargetComponent())
            e.components.set(HoverEffectComponent())
            world.addChild(e)
            return e
        }()
        panel.model = ModelComponent(mesh: .generatePlane(width: wall.width, height: wall.height),
                                     materials: [UnlitMaterial(color: UIColor(red: 0.72, green: 0.6, blue: 0.36, alpha: placedOn == anchor.id ? 0.0 : 0.16))])
        panel.collision = CollisionComponent(shapes: [.generateBox(width: wall.width, height: wall.height, depth: 0.02)])
        var m = wall.matrix
        m.columns.3 += SIMD4(z * 0.01, 0)
        panel.transform = Transform(matrix: m)
    }

    private func tapped(_ entity: Entity) {
        if let piece = world.findEntity(named: "piece"), entity.isDescendant(of: piece), let design = model.design,
           let body = piece.children.first {
            CabinetBuilder.toggleFront(entity, design: design, body: body, opened: &opened)
            return
        }
        guard entity.name.hasPrefix("wall-"), let id = walls.first(where: { "wall-\($0.key)" == entity.name })?.key else { return }
        place(on: id, replan: true)
    }

    /// Plan for this wall (its measured width and height) and stand the piece on the floor against it.
    private func place(on id: UUID, replan: Bool) {
        guard let wall = walls[id] else { return }
        if replan {
            model.wallLength = Double(wall.width) * 1000
            model.wallHeight = wall.height > 2.0 ? Double(wall.height) * 1000 : 2440
            placedOn = id
            model.replan()   // bumps the version; onChange comes back here to build
            return
        }
        world.findEntity(named: "piece")?.removeFromParent()
        opened = []
        guard let piece = model.buildPiece(lib: lib), let plan = model.plan else {
            status = model.error ?? "That wall is too short for this piece."
            return
        }
        guard let design = model.design else { return }
        let leftEnd = SIMD3<Float>(wall.center.x, 0, wall.center.z) - wall.x * (wall.width / 2)   // the floor is y = 0 in the room
        piece.transform = Transform(matrix: CabinetBuilder.placement(design: design, plan: plan, wallX: wall.x, wallZ: wall.z, leftEnd: leftEnd, out: 0))
        world.addChild(piece)
        status = "\(plan.name.capitalizingFirst). Pinch a drawer or door to open it."
    }
}

extension Entity {
    func isDescendant(of other: Entity) -> Bool {
        var e: Entity? = self
        while let cur = e { if cur === other { return true }; e = cur.parent }
        return false
    }
}
