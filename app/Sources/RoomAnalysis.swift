import RoomPlan
import simd

/// A wall seen from inside the room: x runs left to right as you face it, z points into the room,
/// c is the wall's centre, length in metres.
struct WallFrame {
    let x: SIMD3<Float>
    let z: SIMD3<Float>
    let c: SIMD3<Float>
    let length: Float
    let floorY: Float
    let height: Float   // floor to ceiling, metres

    /// Position along the wall in mm from its left end.
    func along(_ p: SIMD3<Float>) -> Double { Double((simd_dot(p - c, x) + length / 2) * 1000) }
    /// Distance in front of the wall (into the room), metres.
    func out(_ p: SIMD3<Float>) -> Float { simd_dot(p - c, z) }
}

enum RoomAnalysis {
    static func position(_ m: simd_float4x4) -> SIMD3<Float> { SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z) }

    /// What stands along this wall, as intervals the planner understands, plus the old sink's centre.
    static func obstacles(on wall: CapturedRoom.Surface, frame f: WallFrame, room: CapturedRoom) -> ([PlanInput.Obstacle], Double?) {
        var out: [PlanInput.Obstacle] = []

        // doors, windows and openings that sit in this wall
        let inWall: [(CapturedRoom.Surface, String)] =
            room.doors.map { ($0, "door") } + room.openings.map { ($0, "opening") } + room.windows.map { ($0, "window") }
        for (s, kind) in inWall {
            let p = position(s.transform)
            guard abs(f.out(p)) < 0.3, abs(simd_dot(p - f.c, f.x)) < f.length / 2 + 0.1 else { continue }
            let mid = f.along(p), half = Double(s.dimensions.x) * 500
            let sill = kind == "window" ? Double((p.y - s.dimensions.y / 2 - f.floorY) * 1000) : nil
            out.append(.init(kind: kind, x0: mid - half, x1: mid + half, bottom: sill))
        }

        // fixtures standing against this wall
        var sinkAt: Double?
        for o in room.objects {
            let kind: String
            switch o.category {
            case .toilet: kind = "toilet"
            case .bathtub: kind = "tub"
            case .sink: kind = "sink"
            case .storage: kind = "storage"
            case .washerDryer, .refrigerator, .stove, .oven, .dishwasher, .fireplace, .stairs: kind = "other"
            default: continue   // furniture moves; it doesn't block a built-in
            }
            let p = position(o.transform)
            let ax = SIMD3<Float>(o.transform.columns.0.x, o.transform.columns.0.y, o.transform.columns.0.z)
            let az = SIMD3<Float>(o.transform.columns.2.x, o.transform.columns.2.y, o.transform.columns.2.z)
            // half-extents of the object's footprint along the wall and out from it
            let halfAlong = abs(simd_dot(ax, f.x)) * o.dimensions.x / 2 + abs(simd_dot(az, f.x)) * o.dimensions.z / 2
            let halfOut = abs(simd_dot(ax, f.z)) * o.dimensions.x / 2 + abs(simd_dot(az, f.z)) * o.dimensions.z / 2
            let d = f.out(p)
            guard d > -0.3, d - halfOut < 0.45, abs(simd_dot(p - f.c, f.x)) < f.length / 2 + halfAlong else { continue }
            let mid = f.along(p), half = Double(halfAlong) * 1000
            if kind == "sink" { sinkAt = mid }
            out.append(.init(kind: kind, x0: mid - half, x1: mid + half))
        }
        return (out, sinkAt)
    }

    /// "9' 4"" for a length in metres.
    static func feetInches(_ metres: Float) -> String {
        let inches = Int((metres / 0.0254).rounded())
        return "\(inches / 12)' \(inches % 12)\""
    }
}
