import Foundation

/// What Plywise can build, the four styles and the grain choices: one list for iPhone and Vision Pro.
enum Builds {
    /// What you can build. The planner knows the rules for each; the rest are on the way.
    struct Kind: Identifiable {
        let id: String
        let name: String
        let noun: String
        let room: String
        let icon: String
        let ready: Bool
    }
    static let projects: [Kind] = [
        .init(id: "vanity", name: "Bathroom vanity", noun: "vanity", room: "Bathroom", icon: "drop.fill", ready: true),
        .init(id: "bookcase", name: "Built-in bookcase", noun: "bookcase", room: "Living room, office", icon: "books.vertical.fill", ready: true),
        .init(id: "console", name: "Media console", noun: "console", room: "Living room", icon: "tv.fill", ready: true),
        .init(id: "dresser", name: "Dresser", noun: "dresser", room: "Bedroom", icon: "cabinet.fill", ready: true),
        .init(id: "desk", name: "Built-in desk", noun: "desk", room: "Office, study", icon: "desktopcomputer", ready: true),
        .init(id: "bar", name: "Coffee bar", noun: "coffee bar", room: "Café, kitchen, office", icon: "cup.and.saucer.fill", ready: true),
        .init(id: "closet", name: "Closet system", noun: "closet", room: "Bedroom", icon: "hanger", ready: false),
        .init(id: "kitchen", name: "Kitchen", noun: "kitchen", room: "Kitchen", icon: "refrigerator.fill", ready: false),
        .init(id: "island", name: "Kitchen island", noun: "island", room: "Kitchen", icon: "square.split.bottomrightquarter.fill", ready: true),
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
}
