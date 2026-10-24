import RealityKit
import SwiftUI

@main
struct CabinetsApp: App {
    var body: some SwiftUI.Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var ar = ARController()

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
        case .start:
            if !ar.status.isEmpty { Pill(text: ar.status, bold: false) }
        default:
            if !ar.status.isEmpty { Pill(text: ar.status, bold: true) }
        }
    }

    @ViewBuilder private var controls: some View {
        switch ar.phase {
        case .start:
            Panel {
                Text("Plywise").font(.largeTitle.bold())
                Text("Make room.").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                Text("What are you building?").font(.headline)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(ARController.projects) { p in
                        ProjectTile(project: p, selected: p.id == ar.project) { ar.project = p.id }
                    }
                }
                Button { ar.startScan() } label: {
                    Label("Scan the room", systemImage: "viewfinder").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
            }
        case .scanning:
            Panel {
                Text("Walk slowly around the room. Walls light up teal as they're measured; doors orange, windows blue.")
                    .font(.callout)
                Button { ar.finishScan() } label: { Text("Done scanning").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large)
            }
        case .processing:
            Panel { ProgressView("Measuring your walls...") }
        case .pickWall:
            Panel {
                Text(pickWallHint).font(.callout)
                Button("Scan again") { ar.startScan() }
            }
        case .placed:
            placedControls
        case .unsupported:
            Panel {
                Text("This iPhone has no LiDAR scanner").font(.headline)
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

    private var placedControls: some View {
        Panel {
            ForEach(ar.notes, id: \.self) { note in
                Label(note, systemImage: "ruler").font(.footnote).labelStyle(.titleAndIcon)
            }
            HStack {
                Menu {
                    ForEach(ARController.projects.filter(\.ready)) { p in
                        Button { ar.setProject(p.id) } label: { checkLabel(p.name, p.id == ar.project) }
                    }
                } label: { MenuChip(title: "Build", value: ar.current.name.components(separatedBy: " ").last?.capitalized ?? "") }
                Menu {
                    ForEach(ARController.styles, id: \.preset) { s in
                        Button { ar.setStyle(s.preset) } label: { checkLabel(s.name, s.preset == ar.stylePreset) }
                    }
                } label: { MenuChip(title: "Style", value: ARController.styles.first { $0.preset == ar.stylePreset }?.name ?? "") }
                Menu {
                    Button { ar.setWidth(nil) } label: { checkLabel(ar.project == "bookcase" ? "Fill the wall" : "Best fit", ar.widthChoice == nil) }
                    ForEach(ar.widthOptions, id: \.self) { w in
                        Button { ar.setWidth(w) } label: { checkLabel("\(Int((w / 25.4).rounded()))\"", ar.widthChoice == w) }
                    }
                } label: { MenuChip(title: "Width", value: ar.plan.map { "\(Int(($0.width / 25.4).rounded()))\"" } ?? "") }
            }
            if let design = ar.design, let choice = ar.choice {
                HStack {
                    finishMenu("Fronts", .fronts, choice.fronts, design)
                    finishMenu("Cabinet", .cabinet, choice.cabinet, design)
                    if design.parts.contains(where: { $0.role == "top" }) { finishMenu("Top", .top, choice.top, design) }
                }
            }
            HStack(spacing: 10) {
                nudge("arrow.left") { ar.nudge(along: -1) }
                nudge("arrow.right") { ar.nudge(along: 1) }
                nudge("arrow.down.to.line") { ar.nudge(out: -0.5) }
                nudge("arrow.up.to.line") { ar.nudge(out: 0.5) }
                Spacer()
                Button("Other wall") { ar.pickAnotherWall() }.font(.footnote)
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
            MenuChip(title: title, value: design.finishes[current]?.name.components(separatedBy: " (").first ?? current)
        }
    }

    private func nudge(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).frame(width: 36, height: 30) }
            .buttonStyle(.bordered)
    }
}

/// One choice in "What are you building?"; builds that aren't ready yet show as coming soon.
struct ProjectTile: View {
    let project: ARController.Project
    let selected: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: project.icon).font(.title3).frame(width: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text(project.name).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                    Text(project.ready ? project.room : "Coming soon").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(selected ? Color.accentColor.opacity(0.18) : Color.clear, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: selected ? 2 : 1))
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
        VStack(spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.footnote.weight(.semibold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct Pill: View {
    let text: String
    let bold: Bool
    var body: some View {
        Text(text)
            .font(bold ? .subheadline.weight(.semibold) : .footnote)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
    }
}

/// Rounded panel at the bottom of the screen.
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct ARViewContainer: UIViewRepresentable {
    let arView: ARView
    func makeUIView(context: Context) -> ARView { arView }
    func updateUIView(_ uiView: ARView, context: Context) {}
}
