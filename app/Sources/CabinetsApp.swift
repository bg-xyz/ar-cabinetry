import RealityKit
import SwiftUI

@main
struct CabinetsApp: App {
    var body: some SwiftUI.Scene {
        WindowGroup { ContentView().tint(Theme.brass) }
    }
}

/// The design language (DESIGN.md): a 1960s European furniture catalogue, set in 2026. Warm paper,
/// one serif (New York), tracked small caps, brass accents, squared corners.
enum Theme {
    static let brass = Color(red: 0.706, green: 0.584, blue: 0.353)
    static let walnut = Color(red: 0.243, green: 0.165, blue: 0.118)
    static let signal = Color(red: 0.847, green: 0.341, blue: 0.165)
    static let onWalnut = Color(red: 0.945, green: 0.902, blue: 0.839)
    static let paper = Color(UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0.082, green: 0.071, blue: 0.059, alpha: 1) : UIColor(red: 0.953, green: 0.933, blue: 0.902, alpha: 1) })
    static let rule = Color.primary.opacity(0.14)

    static func serif(_ size: CGFloat, italic: Bool = false) -> Font {
        let f = Font.system(size: size, weight: .regular, design: .serif)
        return italic ? f.italic() : f
    }
}

/// Small caps label: "WHAT ARE YOU BUILDING?"
struct Caps: View {
    let text: String
    var color: Color = .secondary
    init(_ text: String, color: Color = .secondary) { self.text = text; self.color = color }
    var body: some View {
        Text(text).font(.system(size: 11, weight: .medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(color)
    }
}

struct ContentView: View {
    @StateObject private var ar = ARController()
    @State private var showDetails = false

    var body: some View {
        ZStack {
            ARViewContainer(arView: ar.arView).ignoresSafeArea()
            VStack(spacing: 10) {
                topBanner
                Spacer()
                controls
            }
            .padding()
        }
    }

    @ViewBuilder private var topBanner: some View {
        switch ar.phase {
        case .scanning:
            VStack(spacing: 6) {
                Pill(text: ar.scanSummary, bold: true)
                if !ar.coaching.isEmpty { Pill(text: ar.coaching, bold: false) }
            }
        case .placed:
            EmptyView()   // the panel carries the title
        default:
            if !ar.status.isEmpty { Pill(text: ar.status, bold: ar.phase != .start) }
        }
    }

    @ViewBuilder private var controls: some View {
        switch ar.phase {
        case .start:
            Panel {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("Plywise").font(Theme.serif(40))
                    Circle().fill(Theme.brass).frame(width: 7, height: 7)
                    Spacer()
                    Text("Make room.").font(Theme.serif(20, italic: true)).foregroundStyle(.secondary)
                }
                Divider().overlay(Theme.rule)
                Caps("What are you building?")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(ARController.projects) { p in
                        ProjectTile(project: p, selected: p.id == ar.project) { ar.project = p.id }
                    }
                }
                Button { ar.startScan() } label: { BigButtonLabel(text: "Scan the room") }
                    .buttonStyle(.plain)
            }
        case .scanning:
            Panel {
                Caps("Scanning for your \(ar.current.noun)")
                Text("Walk slowly around the room. Walls light up teal as they're measured; doors orange, windows blue.")
                    .font(.callout)
                Button { ar.finishScan() } label: { BigButtonLabel(text: "Done scanning") }
                    .buttonStyle(.plain)
            }
        case .processing:
            Panel {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Measuring your walls").font(Theme.serif(20, italic: true))
                }
            }
        case .pickWall:
            Panel {
                Caps(ar.current.name)
                Text(pickWallHint).font(.callout)
                Button("Scan again") { ar.startScan() }.font(.footnote.weight(.medium))
            }
        case .placed:
            placedControls
        case .unsupported:
            Panel {
                Text("This iPhone has no LiDAR scanner").font(Theme.serif(24))
                Text("Room scanning needs an iPhone Pro (12 Pro or newer) or an iPad Pro.").font(.callout)
            }
        }
    }

    private var pickWallHint: String {
        let around: String
        switch ar.project {
        case "vanity": around = "around doors and the toilet, centred on your old sink"
        case "bookcase": around = "wall to wall and up to the ceiling, around doors and windows"
        default: around = "around doors, and under windows when the sill is high enough"
        }
        return "Tap the wall where the \(ar.current.noun) goes. Plywise sizes it to the clear space, \(around)."
    }

    private var styleName: String { ARController.styles.first { $0.preset == ar.stylePreset }?.name ?? "" }
    private var grainName: String { ARController.grains.first { $0.id == ar.plan?.grainMatch }?.name ?? "" }

    private var placedControls: some View {
        Panel {
            // title + spec line, like a catalogue plate
            HStack(alignment: .firstTextBaseline) {
                Text(ar.plan?.name.capitalizingFirst ?? ar.current.name).font(Theme.serif(26)).lineLimit(1).minimumScaleFactor(0.7)
                Spacer()
                if ar.notes.count > 1 {
                    Button(showDetails ? "Less" : "Details") { withAnimation(.easeOut(duration: 0.25)) { showDetails.toggle() } }
                        .font(.footnote.weight(.medium))
                }
            }
            Caps("\(styleName) · \(grainName == "Off" ? "unmatched" : "grain \(grainName.lowercased())")")
            ForEach(Array((showDetails ? ar.notes : Array(ar.notes.prefix(1))).enumerated()), id: \.offset) { _, note in
                Text(note).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Divider().overlay(Theme.rule)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                Menu {
                    ForEach(ARController.projects.filter(\.ready)) { p in
                        Button { ar.setProject(p.id) } label: { checkLabel(p.name, p.id == ar.project) }
                    }
                } label: { MenuChip(title: "Build", value: ar.current.name.components(separatedBy: " ").last?.capitalized ?? "") }
                Menu {
                    ForEach(ARController.styles, id: \.preset) { s in
                        Button { ar.setStyle(s.preset) } label: { checkLabel("\(s.name): \(s.hint)", s.preset == ar.stylePreset) }
                    }
                } label: { MenuChip(title: "Style", value: styleName) }
                Menu {
                    Button { ar.setWidth(nil) } label: { checkLabel(ar.project == "bookcase" ? "Fill the wall" : "Best fit", ar.widthChoice == nil) }
                    ForEach(ar.widthOptions, id: \.self) { w in
                        Button { ar.setWidth(w) } label: { checkLabel("\(Int((w / 25.4).rounded()))\"", ar.widthChoice == w) }
                    }
                } label: { MenuChip(title: "Width", value: ar.plan.map { "\(Int(($0.width / 25.4).rounded()))\"" } ?? "") }
                Menu {
                    ForEach(ARController.grains, id: \.id) { g in
                        Button { ar.setGrain(g.id) } label: { checkLabel("\(g.name): \(g.hint)", g.id == ar.plan?.grainMatch) }
                    }
                } label: { MenuChip(title: "Grain", value: grainName) }
                if let design = ar.design, let choice = ar.choice {
                    finishMenu("Fronts", .fronts, choice.fronts, design)
                    finishMenu("Cabinet", .cabinet, choice.cabinet, design)
                    if design.parts.contains(where: { $0.role == "top" }) { finishMenu("Top", .top, choice.top, design) }
                }
            }
            HStack(spacing: 8) {
                nudge("arrow.left") { ar.nudge(along: -1) }
                nudge("arrow.right") { ar.nudge(along: 1) }
                nudge("arrow.down.to.line") { ar.nudge(out: -0.5) }
                nudge("arrow.up.to.line") { ar.nudge(out: 0.5) }
                Spacer()
                Button("Other wall") { ar.pickAnotherWall() }.font(.footnote.weight(.medium))
            }
        }
    }

    @ViewBuilder private func checkLabel(_ text: String, _ on: Bool) -> some View {
        if on { Label(text, systemImage: "checkmark") } else { Text(text) }
    }

    private func finishMenu(_ title: String, _ slot: FinishSlot, _ current: String, _ design: Design) -> some View {
        Menu {
            ForEach(design.finishes.keys.sorted(), id: \.self) { id in
                Button { ar.setFinish(slot, id) } label: { checkLabel(design.finishes[id]?.name ?? id, id == current) }
            }
        } label: {
            MenuChip(title: title, value: design.finishes[current]?.name.components(separatedBy: " (").first?
                .replacingOccurrences(of: " veneer", with: "") ?? current)
        }
    }

    private func nudge(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.footnote.weight(.medium)).frame(width: 38, height: 32)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.rule))
        }
        .buttonStyle(.plain)
    }
}

extension String {
    var capitalizingFirst: String { prefix(1).uppercased() + dropFirst() }
}

/// The one strong button: walnut, squared, with an arrow.
struct BigButtonLabel: View {
    let text: String
    var body: some View {
        HStack {
            Text(text).font(.body.weight(.medium)).tracking(0.3)
            Spacer()
            Image(systemName: "arrow.right")
        }
        .foregroundStyle(Theme.onWalnut)
        .padding(.horizontal, 18).padding(.vertical, 15)
        .background(Theme.walnut, in: RoundedRectangle(cornerRadius: 4))
    }
}

/// One choice in "What are you building?"; builds that aren't ready yet show as coming soon.
struct ProjectTile: View {
    let project: ARController.Project
    let selected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: project.icon).font(.body).foregroundStyle(selected ? Theme.brass : .secondary).frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.name).font(Theme.serif(16)).lineLimit(1).minimumScaleFactor(0.8)
                    Text(project.ready ? project.room : "Coming soon")
                        .font(.system(size: 9.5, weight: .medium)).tracking(1.1).textCase(.uppercase)
                        .foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(selected ? Theme.brass.opacity(0.14) : Color.clear, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(selected ? Theme.brass : Theme.rule, lineWidth: selected ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .disabled(!project.ready)
        .opacity(project.ready ? 1 : 0.45)
    }
}

struct MenuChip: View {
    let title: String
    let value: String
    var body: some View {
        VStack(spacing: 3) {
            Text(title).font(.system(size: 9, weight: .medium)).tracking(1.2).textCase(.uppercase).foregroundStyle(.secondary)
            Text(value).font(Theme.serif(15)).lineLimit(1).minimumScaleFactor(0.75).foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 7).padding(.horizontal, 4)
        .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.rule))
    }
}

struct Pill: View {
    let text: String
    let bold: Bool
    var body: some View {
        Text(text)
            .font(bold ? .system(size: 12, weight: .semibold) : .footnote)
            .tracking(bold ? 1.2 : 0)
            .textCase(bold ? .uppercase : nil)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 6))
    }
}

/// The panel at the bottom of the screen: frosted, warmed with paper, hairline edge.
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 14).fill(.regularMaterial)
                    RoundedRectangle(cornerRadius: 14).fill(Theme.paper.opacity(0.55))
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.rule))
    }
}

struct ARViewContainer: UIViewRepresentable {
    let arView: ARView
    func makeUIView(context: Context) -> ARView { arView }
    func updateUIView(_ uiView: ARView, context: Context) {}
}
