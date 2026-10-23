import Foundation

// One design exported by the engine (`npm run app-assets`): the same shape as a job's parts.json.
// All lengths are millimetres; x = right along the wall, y = up, z = out from the wall.
struct Design: Decodable, Identifiable {
    let name: String
    let style: String
    let overall: Overall
    let parts: [Part]
    let fixtures: [Fixture]
    let finishes: [String: Finish]
    let order: Int?

    var id: String { name }

    struct Overall: Decodable {
        let width: Double
        let height: Double
        let depth: Double
        let elevation: Double
    }

    struct Box: Decodable {
        let min: [Double]
        let size: [Double]
        var lo: SIMD3<Double> { SIMD3(min[0], min[1], min[2]) }
        var hi: SIMD3<Double> { SIMD3(min[0] + size[0], min[1] + size[1], min[2] + size[2]) }
    }

    struct Cut: Decodable {
        let min: [Double]
        let max: [Double]
    }

    struct Part: Decodable {
        let id: String
        let name: String
        let role: String
        let box: Box
        let finish: String
        let grainAxis: Int?
        let thicknessAxis: Int
        let plies: Int
        let cuts: [Cut]
    }

    struct Fixture: Decodable {
        let kind: String
        let shape: String
        let name: String
        let box: Box
    }

    struct Finish: Decodable {
        let name: String
        let texture: String?
        let edge: String?
        let paint: String?
        let tint: String?
        let roughness: Double
        let clearcoat: Double
    }

    /// The finish this design starts with for a slot (fronts / cabinet / top).
    func initialFinish(_ slot: FinishSlot) -> String {
        parts.first { FinishSlot(role: $0.role) == slot }?.finish ?? "birch"
    }
}

/// Which finish menu controls a part. Drawer boxes and backs stay natural birch
/// (mirrors finishFor() in engine/src/job.ts).
enum FinishSlot: Equatable {
    case fronts, cabinet, top, fixedBirch

    init(role: String) {
        switch role {
        case "door", "drawerFront", "endPanel": self = .fronts
        case "top": self = .top
        case "back": self = .fixedBirch
        default: self = role.hasPrefix("drawer") ? .fixedBirch : .cabinet
        }
    }
}

enum DesignLibrary {
    static func load() -> [Design] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "Designs") ?? []
        return urls.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? JSONDecoder().decode(Design.self, from: data)
        }
        .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
    }
}

extension Double {
    /// 1219.2 mm -> 48"
    var inchesText: String {
        let inches = self / 25.4
        return inches.rounded() == inches ? "\(Int(inches))\"" : String(format: "%.1f\"", inches)
    }
}
