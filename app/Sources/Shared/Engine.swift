import Foundation
import JavaScriptCore

// Runs the cabinet engine (engine/, bundled by `npm run bundle` into plywise-engine.js) inside the
// app with JavaScriptCore. Same code as the web preview and the CNC job files, so what you see in
// AR is exactly what gets cut. JSON in, JSON out.

struct PlanInput: Codable {
    struct Obstacle: Codable {
        let kind: String
        let x0: Double
        let x1: Double
        var bottom: Double? = nil        // windows: sill height above the floor, mm
    }
    var project: String                  // vanity, bookcase, console, dresser
    var wallLength: Double               // mm
    var wallHeight: Double?              // floor to ceiling, mm
    var obstacles: [Obstacle] = []
    var sinkAt: Double?                  // mm from the wall's left end
    var width: Double?                   // mm; nil = largest that fits
    var style: [String: String]?
}

struct PlanResult: Decodable {
    let project: String
    let x0: Double
    let width: Double
    let sinks: Int
    let span: [Double]
    let widthOptions: [Double]
    let notes: [String]
    let name: String
    let grainMatch: String       // across, waterfall, off
    let sheets: Double           // plywood, in 4x8 sheet equivalents
    let sheetsUnmatched: Double  // the same design with grain matching off
    let specJSON: String?        // the design (RunSpec JSON), for share links
    let standoff: Double?        // islands: their fronts face the wall this far (mm) from it
    let faceWall: Bool?
    let proportion: String?      // the golden-ratio line + design checks passed (engine/src/critic.ts)

    /// plywise.xyz/d/#<base64url design>: opens this design in any browser (3D, finishes, AR Quick Look).
    func shareLink(fronts: String?, cabinet: String?, top: String?) -> URL? {
        guard let data = specJSON?.data(using: .utf8),
              var spec = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        var style = spec["style"] as? [String: Any] ?? [:]
        if let fronts { style["frontFinish"] = fronts }
        if let cabinet { style["carcassFinish"] = cabinet }
        if let top { style["topFinish"] = top }
        spec["style"] = style
        guard let json = try? JSONSerialization.data(withJSONObject: spec, options: [.sortedKeys]) else { return nil }
        let b64 = json.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))
        return URL(string: "https://plywise.xyz/d/#\(b64)")
    }
}

enum EngineError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let m): return m }
    }
}

final class Engine {
    static let shared = Engine()
    private let context = JSContext()!

    private init() {
        context.exceptionHandler = { _, exception in
            print("engine JS error:", exception?.toString() ?? "?")
        }
        if let url = Bundle.main.url(forResource: "plywise-engine", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            context.evaluateScript(source)
        }
    }

    private struct Reply: Decodable {
        let plan: PlanResult
        let model: Design
    }

    private struct ErrorReply: Decodable {
        let error: String?
    }

    /// Plan the chosen build for a measured wall and build its 3D model.
    func plan(_ input: PlanInput) throws -> (PlanResult, Design) {
        let json = String(data: try JSONEncoder().encode(input), encoding: .utf8) ?? "{}"
        guard let fn = context.objectForKeyedSubscript("Plywise")?.objectForKeyedSubscript("plan"),
              let out = fn.call(withArguments: [json])?.toString(),
              let data = out.data(using: .utf8) else {
            throw EngineError.message("The design engine didn't load.")
        }
        if let e = try? JSONDecoder().decode(ErrorReply.self, from: data), let message = e.error {
            throw EngineError.message(message)
        }
        let reply = try JSONDecoder().decode(Reply.self, from: data)
        return (reply.plan, reply.model)
    }
}
