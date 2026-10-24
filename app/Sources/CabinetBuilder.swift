import Metal
import RealityKit
import UIKit

// Turns a Design into RealityKit entities. This is a port of engine/viewer/preview.html, the
// reference renderer: same world-space UVs (veneer grain along each part's grain, plies through
// the thickness at true scale), same finishes, same textures.

/// Collects triangles for one mesh. Material index 0 = veneer face, 1 = edge.
struct MeshBuilder {
    var positions: [SIMD3<Float>] = []
    var normals: [SIMD3<Float>] = []
    var uvs: [SIMD2<Float>] = []
    var indices: [UInt32] = []
    var faceMaterials: [UInt32] = []

    /// Adds a quad; corners are re-ordered if needed so the front face looks along `normal`.
    mutating func quad(_ p: [SIMD3<Float>], normal: SIMD3<Float>, uv: [SIMD2<Float>], material: UInt32) {
        var order = [0, 1, 2, 3]
        if simd_dot(simd_cross(p[1] - p[0], p[2] - p[0]), normal) < 0 { order = [0, 3, 2, 1] }
        let base = UInt32(positions.count)
        for i in order {
            positions.append(p[i])
            normals.append(normal)
            uvs.append(uv[i])
        }
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]
        faceMaterials += [material, material]
    }

    var isEmpty: Bool { positions.isEmpty }

    func resource() throws -> MeshResource {
        var d = MeshDescriptor()
        d.positions = MeshBuffers.Positions(positions)
        d.normals = MeshBuffers.Normals(normals)
        d.textureCoordinates = MeshBuffers.TextureCoordinates(uvs)
        d.primitives = .triangles(indices)
        d.materials = .perFace(faceMaterials)
        return try MeshResource.generate(from: [d])
    }

    /// Axis-aligned box in millimetres. `uv` maps a corner (mm) and the face axis to texture coordinates.
    mutating func box(_ lo: SIMD3<Double>, _ hi: SIMD3<Double>,
                      uv: (SIMD3<Double>, Int) -> SIMD2<Float> = { _, _ in .zero },
                      material: (Int) -> UInt32 = { _ in 0 }) {
        for m in 0..<3 {
            for s in [-1.0, 1.0] {
                let a = (m + 1) % 3, b = (m + 2) % 3
                let corners: [(Double, Double)] = [(lo[a], lo[b]), (hi[a], lo[b]), (hi[a], hi[b]), (lo[a], hi[b])]
                let pts: [SIMD3<Double>] = corners.map { c in
                    var p = SIMD3<Double>(0, 0, 0)
                    p[m] = s > 0 ? hi[m] : lo[m]
                    p[a] = c.0
                    p[b] = c.1
                    return p
                }
                var n = SIMD3<Float>(0, 0, 0)
                n[m] = Float(s)
                quad(pts.map { SIMD3<Float>($0 * 0.001) }, normal: n, uv: pts.map { uv($0, m) }, material: material(m))
            }
        }
    }

    /// Surface of revolution around a vertical axis through `center` (mm). Profile = (radius, height).
    /// `uv` maps (height, arc length) to texture coordinates; without it the surface is untextured.
    mutating func lathe(_ profile: [(Double, Double)], center: SIMD3<Double>, segments: Int = 48,
                        uv: ((Double, Double) -> SIMD2<Float>)? = nil) {
        for i in 0..<(profile.count - 1) {
            let (r0, y0) = profile[i], (r1, y1) = profile[i + 1]
            let dr = r1 - r0, dy = y1 - y0
            let len = max((dr * dr + dy * dy).squareRoot(), 1e-9)
            for k in 0..<segments {
                let t0 = Double(k) / Double(segments) * 2 * .pi, t1 = Double(k + 1) / Double(segments) * 2 * .pi
                let tm = (t0 + t1) / 2
                let ring = { (r: Double, y: Double, t: Double) -> SIMD3<Float> in
                    SIMD3<Float>((center + SIMD3(r * cos(t), y, r * sin(t))) * 0.001)
                }
                // outward normal of the profile segment, swept around
                let n = simd_normalize(SIMD3<Float>(Float(dy / len * cos(tm)), Float(-dr / len), Float(dy / len * sin(tm))))
                let tex = uv.map { f in [f(y0, r0 * t0), f(y0, r0 * t1), f(y1, r1 * t1), f(y1, r1 * t0)] } ?? Array(repeating: .zero, count: 4)
                quad([ring(r0, y0, t0), ring(r0, y0, t1), ring(r1, y1, t1), ring(r1, y1, t0)],
                     normal: n, uv: tex, material: 0)
            }
        }
    }
}

/// PBR materials from the bundled textures, cached.
final class MaterialLibrary {
    private var cache: [String: RealityKit.Material] = [:]
    private var textures: [String: TextureResource] = [:]
    private let sampler: MaterialParameters.Texture.Sampler = {
        let d = MTLSamplerDescriptor()
        d.sAddressMode = .repeat
        d.tAddressMode = .repeat
        d.minFilter = .linear
        d.magFilter = .linear
        d.mipFilter = .linear
        d.maxAnisotropy = 8
        return MaterialParameters.Texture.Sampler(d)
    }()

    private func texture(_ key: String, _ map: String, _ semantic: TextureResource.Semantic) -> MaterialParameters.Texture? {
        let id = "\(key)/\(map)"
        if textures[id] == nil,
           let url = Bundle.main.url(forResource: map, withExtension: "jpg", subdirectory: "Textures/\(key)") {
            textures[id] = try? TextureResource.load(contentsOf: url, withName: id, options: .init(semantic: semantic))
        }
        guard let t = textures[id] else { return nil }
        return MaterialParameters.Texture(t, sampler: sampler)
    }

    func wood(_ finish: Design.Finish, id: String, edge: Bool) -> RealityKit.Material {
        let cacheKey = "\(id)|\(edge)"
        if let m = cache[cacheKey] { return m }
        var m = PhysicallyBasedMaterial()
        m.roughness = .init(floatLiteral: Float(finish.roughness))
        m.clearcoat = .init(floatLiteral: Float(finish.clearcoat))
        m.clearcoatRoughness = .init(floatLiteral: 0.55)
        if let paint = finish.paint {
            m.baseColor = .init(tint: UIColor(hex: paint))
        } else if let key = edge ? finish.edge : finish.texture {
            m.baseColor = .init(tint: UIColor(hex: finish.tint ?? "#ffffff"), texture: texture(key, "color", .color))
            m.normal = .init(texture: texture(key, "normal", .normal))
            m.roughness = .init(scale: Float(finish.roughness) * 1.6, texture: texture(key, "roughness", .raw))
        }
        cache[cacheKey] = m
        return m
    }

    lazy var ceramic: RealityKit.Material = {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: UIColor(white: 0.97, alpha: 1))
        m.roughness = .init(floatLiteral: 0.12)
        m.clearcoat = .init(floatLiteral: 1)
        m.clearcoatRoughness = .init(floatLiteral: 0.05)
        return m
    }()

    lazy var brass: RealityKit.Material = {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: UIColor(red: 0.79, green: 0.64, blue: 0.37, alpha: 1))
        m.roughness = .init(floatLiteral: 0.32)
        m.metallic = .init(floatLiteral: 1)
        return m
    }()

    lazy var blackMetal: RealityKit.Material = {
        var m = PhysicallyBasedMaterial()
        m.baseColor = .init(tint: UIColor(white: 0.11, alpha: 1))
        m.roughness = .init(floatLiteral: 0.38)
        m.metallic = .init(floatLiteral: 0.65)
        return m
    }()
}

/// Which finish each slot shows right now (the finish menus).
struct FinishChoice: Equatable {
    var fronts: String
    var cabinet: String
    var top: String

    init(design: Design) {
        fronts = design.initialFinish(.fronts)
        cabinet = design.initialFinish(.cabinet)
        top = design.initialFinish(.top)
    }

    func finish(for part: Design.Part) -> String {
        switch part.slot {
        case .fronts: return fronts
        case .cabinet: return cabinet
        case .top: return top
        case .fixedBirch: return "birch"
        }
    }
}

enum CabinetBuilder {
    static let veneerTile = 900.0   // mm of veneer per texture tile
    static let plyPairs = 64.0      // light/dark ply pairs in one tile of the edge texture

    /// Root origin = floor directly under the back-left corner of the carcass.
    static func build(_ design: Design, choice: FinishChoice, lib: MaterialLibrary) -> Entity {
        let root = Entity()
        let body = Entity()
        body.position.y = Float(design.overall.elevation / 1000)
        root.addChild(body)

        for part in design.parts {
            var mesh = MeshBuilder()
            for piece in pieces(part) { addPart(part, piece: piece, to: &mesh) }
            guard !mesh.isEmpty, let resource = try? mesh.resource() else { continue }
            let id = choice.finish(for: part)
            guard let finish = design.finishes[id] else { continue }
            // banded edges wear the face veneer; raw ones show the plies
            let model = ModelEntity(mesh: resource, materials: [lib.wood(finish, id: id, edge: false), lib.wood(finish, id: id, edge: part.banded != true)])
            model.name = part.id
            body.addChild(model)
        }

        var ceramic = MeshBuilder(), metal = MeshBuilder()
        for f in design.fixtures {
            if let spec = f.leg { body.addChild(leg(spec, design: design, lib: lib)); continue }
            addFixture(f, ceramic: &ceramic, metal: &metal)
        }
        if let r = try? ceramic.resource(), !ceramic.isEmpty { body.addChild(ModelEntity(mesh: r, materials: [lib.ceramic])) }
        if let r = try? metal.resource(), !metal.isEmpty { body.addChild(ModelEntity(mesh: r, materials: [lib.blackMetal])) }
        return root
    }

    /// A mid-century tapered leg: turned around its own axis (grain along the leg), tilted to its
    /// splay, solid wood (the finish's veneer texture) or black metal, with a brass ferrule.
    static func leg(_ l: Design.LegSpec, design: Design, lib: MaterialLibrary) -> Entity {
        let top = SIMD3(l.top[0], l.top[1], l.top[2]), foot = SIMD3(l.foot[0], l.foot[1], l.foot[2])
        let len = simd_length(top - foot)
        let r0 = l.bottomDia / 2, r1 = l.topDia / 2
        var wood = MeshBuilder(), tip = MeshBuilder()
        let uv: (Double, Double) -> SIMD2<Float> = { h, s in SIMD2(Float(h / veneerTile), Float(s / veneerTile)) }
        wood.lathe([(0, l.ferrule), (r0 + (r1 - r0) * l.ferrule / len, l.ferrule), (r1, len), (0, len)], center: .zero, uv: uv)
        if l.ferrule > 0 {
            let rf = r0 + (r1 - r0) * l.ferrule / len + 0.6
            tip.lathe([(0, 0), (r0 + 0.6, 0), (rf, l.ferrule), (0, l.ferrule)], center: .zero)
        }
        let e = Entity()
        let woodMaterial: RealityKit.Material = l.finish.flatMap { design.finishes[$0] }.map { lib.wood($0, id: l.finish!, edge: false) } ?? lib.blackMetal
        if let r = try? wood.resource() { e.addChild(ModelEntity(mesh: r, materials: [woodMaterial])) }
        if l.ferrule > 0, let r = try? tip.resource() { e.addChild(ModelEntity(mesh: r, materials: [lib.brass])) }
        e.position = SIMD3<Float>(foot * 0.001)
        e.orientation = simd_quatf(from: SIMD3<Float>(0, 1, 0), to: simd_normalize(SIMD3<Float>(top - foot)))
        return e
    }

    /// The part's box minus its through-cuts (drawer notches, plumbing holes), as boxes.
    static func pieces(_ p: Design.Part) -> [(SIMD3<Double>, SIMD3<Double>)] {
        var boxes = [(p.box.lo, p.box.hi)]
        for c in p.cuts {
            let cl = SIMD3(c.min[0], c.min[1], c.min[2]), ch = SIMD3(c.max[0], c.max[1], c.max[2])
            var out: [(SIMD3<Double>, SIMD3<Double>)] = []
            for (lo, hi) in boxes {
                if (0..<3).contains(where: { ch[$0] <= lo[$0] || cl[$0] >= hi[$0] }) { out.append((lo, hi)); continue }
                var restLo = lo, restHi = hi
                for a in 0..<3 {
                    let c0 = max(cl[a], lo[a]), c1 = min(ch[a], hi[a])
                    if c0 > restLo[a] { var h = restHi; h[a] = c0; out.append((restLo, h)); restLo[a] = c0 }
                    if c1 < restHi[a] { var l = restLo; l[a] = c1; out.append((l, restHi)); restHi[a] = c1 }
                }
            }
            boxes = out.filter { b in (0..<3).allSatisfy { b.1[$0] - b.0[$0] > 0.01 } }
        }
        return boxes
    }

    static func addPart(_ p: Design.Part, piece: (SIMD3<Double>, SIMD3<Double>), to mesh: inout MeshBuilder) {
        let n = p.thicknessAxis
        let size = p.box.size
        let inPlane = (0..<3).filter { $0 != n }
        let grain: Int
        if let g = p.grainAxis, g != n { grain = g } else { grain = size[inPlane[0]] >= size[inPlane[1]] ? inPlane[0] : inPlane[1] }
        let across = inPlane.first { $0 != grain } ?? inPlane[1]
        let plyTile = p.banded == true ? veneerTile : plyPairs * 2 * size[n] / Double(max(p.plies, 1))
        var h: UInt32 = 0
        for c in (p.texSeed ?? p.id).unicodeScalars { h = h &* 31 &+ c.value }   // stable offset, shared by a grain-matched group
        let ou = Double(h % 997) / 997, ov = Double((h >> 10) % 991) / 991
        let minN = p.box.min[n]
        mesh.box(piece.0, piece.1, uv: { w, m in
            if m == n, let s = p.sheet { return sheetUV(p, s, w) }
            if m == n { return SIMD2(Float(w[grain] / veneerTile + ou), Float(w[across] / veneerTile + ov)) }
            let along = 3 - m - n
            return SIMD2(Float(w[along] / veneerTile + ou), Float((w[n] - minN) / plyTile + ov))
        }, material: { m in m == n ? 0 : 1 })
    }

    /// True-to-life grain: the veneer at a point of a face is the veneer at that point of the sheet
    /// the part was cut from. Grain runs along the sheet's length; face B is the sheet's other side.
    static func sheetUV(_ p: Design.Part, _ s: Design.SheetSpot, _ w: SIMD3<Double>) -> SIMD2<Float> {
        let lo = p.box.min, size = p.box.size, n = p.thicknessAxis
        let u = s.uSign > 0 ? w[s.u] - lo[s.u] : lo[s.u] + size[s.u] - w[s.u]
        let v = w[s.v] - lo[s.v]
        let x = s.rot ? s.x + (s.w - v) : s.x + u, y = s.rot ? s.y + u : s.y + v
        let faceA = abs(w[n] - (s.faceA > 0 ? lo[n] + size[n] : lo[n])) < 0.5
        let i = Double(s.i)
        let ox = (i * 0.618).truncatingRemainder(dividingBy: 1) + (faceA ? 0 : 0.43)
        let oy = (i * 0.381).truncatingRemainder(dividingBy: 1) + (faceA ? 0 : 0.29)
        return SIMD2(Float(x / veneerTile + ox), Float(y / veneerTile + oy))
    }

    static func addFixture(_ f: Design.Fixture, ceramic: inout MeshBuilder, metal: inout MeshBuilder) {
        let lo = f.box.lo, s = f.box.size
        let c = SIMD3(lo.x + s[0] / 2, lo.y, lo.z + s[2] / 2)
        switch f.kind {
        case "sink":
            if f.shape == "round" {
                let r = s[0] / 2, t = 9.0, ht = s[1]
                ceramic.lathe([(0, 0), (r * 0.6, 0), (r * 0.9, ht * 0.45), (r, ht), (r - t, ht), (r * 0.9 - t, ht * 0.45), (r * 0.6 - t, t), (0, t)], center: c)
            } else {
                let w = 11.0, hi = f.box.hi
                ceramic.box(lo, SIMD3(hi.x, lo.y + 14, hi.z))                       // floor
                ceramic.box(lo, SIMD3(lo.x + w, hi.y, hi.z))                        // left wall
                ceramic.box(SIMD3(hi.x - w, lo.y, lo.z), hi)                        // right wall
                ceramic.box(lo, SIMD3(hi.x, hi.y, lo.z + w))                        // back wall
                ceramic.box(SIMD3(lo.x, lo.y, hi.z - w), hi)                        // front wall
            }
            metal.lathe([(22, 15), (0, 15)], center: c)                            // drain cap (profile inward so it faces up)
        case "faucet":
            metal.lathe([(0, 0), (17, 0), (14, s[1]), (0, s[1])], center: c)
            let top = lo.y + s[1] - 24
            metal.box(SIMD3(c.x - 10, top, c.z), SIMD3(c.x + 10, top + 20, c.z + 175))   // spout
        case "leg":
            metal.lathe([(0, 0), (s[0] / 2, 0), (s[0] / 2 - 3, s[1]), (0, s[1])], center: c)
        default: // pull
            metal.box(lo, f.box.hi)
        }
    }
}

extension UIColor {
    convenience init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }
}
