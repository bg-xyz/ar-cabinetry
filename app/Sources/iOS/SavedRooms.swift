import ARKit
import UIKit
import simd

/// A design saved where it stands: everything needed to plan it again, plus the ARKit world map of
/// the room with an anchor where the piece was. Open it in that room later, look around, and ARKit
/// recognises the space and puts the piece back on the same wall. Each piece keeps its own map, so
/// only the room you open is loaded: walk a whole house room by room without carrying the rest.
struct SavedPiece: Codable, Identifiable {
    let id: UUID
    var room: String             // "Bathroom", "Kitchen", whatever the user called it
    var name: String             // the plan's name, e.g. 48" single vanity
    var project: String
    var saved: Date
    var input: PlanInput         // the wall as planned (length, height, obstacles, width, style)
    var stylePreset: String
    var grainChoice: String?
    var widthChoice: Double?
    var replaceBuiltIns: Bool
    var fronts: String
    var cabinet: String
    var top: String
    var frame: WallFrame
    var anchor: [Float]          // the anchor's world transform when saved (column major)
    var along: Float
    var out: Float
    var quick: Bool

    var anchorName: String { "plywise-\(id.uuidString)" }
}

enum SavedRooms {
    private static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Rooms", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }
    private static var index: URL { dir.appendingPathComponent("index.json") }
    static func mapURL(_ id: UUID) -> URL { dir.appendingPathComponent("\(id.uuidString).worldmap") }
    static func photoURL(_ id: UUID) -> URL { dir.appendingPathComponent("\(id.uuidString).jpg") }

    static func load() -> [SavedPiece] {
        guard let data = try? Data(contentsOf: index) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([SavedPiece].self, from: data)) ?? []
    }

    static func store(_ pieces: [SavedPiece]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(pieces) { try? data.write(to: index, options: .atomic) }
    }

    static func write(map: ARWorldMap, photo: UIImage?, for id: UUID) throws {
        let data = try NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
        try data.write(to: mapURL(id), options: .atomic)
        if let photo, let jpg = photo.scaled(toWidth: 640).jpegData(compressionQuality: 0.7) { try? jpg.write(to: photoURL(id)) }
    }

    static func map(for id: UUID) -> ARWorldMap? {
        guard let data = try? Data(contentsOf: mapURL(id)) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data)
    }

    static func photo(for id: UUID) -> UIImage? { UIImage(contentsOfFile: photoURL(id).path) }

    static func remove(_ id: UUID) {
        try? FileManager.default.removeItem(at: mapURL(id))
        try? FileManager.default.removeItem(at: photoURL(id))
    }
}

extension simd_float4x4 {
    var floats: [Float] { [columns.0, columns.1, columns.2, columns.3].flatMap { [$0.x, $0.y, $0.z, $0.w] } }
    init?(floats f: [Float]) {
        guard f.count == 16 else { return nil }
        self.init(SIMD4(f[0], f[1], f[2], f[3]), SIMD4(f[4], f[5], f[6], f[7]), SIMD4(f[8], f[9], f[10], f[11]), SIMD4(f[12], f[13], f[14], f[15]))
    }
}

extension UIImage {
    func scaled(toWidth w: CGFloat) -> UIImage {
        guard size.width > w else { return self }
        let s = CGSize(width: w, height: size.height * w / size.width)
        return UIGraphicsImageRenderer(size: s).image { _ in draw(in: CGRect(origin: .zero, size: s)) }
    }
}
