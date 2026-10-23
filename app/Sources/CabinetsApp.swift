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
            VStack(spacing: 12) {
                if !ar.status.isEmpty && ar.phase != .start {
                    Text(ar.status)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                Spacer()
                controls
            }
            .padding()
        }
    }

    @ViewBuilder private var controls: some View {
        switch ar.phase {
        case .start:
            Panel {
                Text("Plywise").font(.largeTitle.bold())
                Text("Make room.").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                Text("Scan your room, tap a wall, and see a real cabinet built for that space, life-size, in the room.")
                    .font(.callout).foregroundStyle(.secondary)
                Button { ar.startScan() } label: {
                    Label("Scan the room", systemImage: "viewfinder").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
            }
        case .scanning:
            Panel {
                Text("Walk slowly around the room. Point at every wall, top to bottom.")
                    .font(.callout)
                Button { ar.finishScan() } label: { Text("Done scanning").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large)
            }
        case .processing:
            Panel { ProgressView("Measuring your walls...") }
        case .pickWall:
            Panel {
                Text("Tap a highlighted wall.").font(.callout)
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

    private var placedControls: some View {
        Panel {
            Menu {
                ForEach(Array(ar.designs.enumerated()), id: \.offset) { i, d in
                    Button(d.name) { ar.designIndex = i }
                }
            } label: {
                Label(ar.design.name, systemImage: "cabinet").font(.subheadline.weight(.semibold)).lineLimit(2)
            }
            HStack {
                finishMenu("Fronts", .fronts, ar.choice.fronts)
                finishMenu("Cabinet", .cabinet, ar.choice.cabinet)
                if ar.design.parts.contains(where: { $0.role == "top" }) { finishMenu("Top", .top, ar.choice.top) }
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

    private func finishMenu(_ title: String, _ slot: FinishSlot, _ current: String) -> some View {
        Menu {
            ForEach(ar.design.finishes.keys.sorted(), id: \.self) { id in
                Button { ar.setFinish(slot, id) } label: {
                    if id == current { Label(ar.design.finishes[id]?.name ?? id, systemImage: "checkmark") }
                    else { Text(ar.design.finishes[id]?.name ?? id) }
                }
            }
        } label: {
            VStack(spacing: 2) {
                Text(title).font(.caption2).foregroundStyle(.secondary)
                Text(shortName(current)).font(.footnote.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func shortName(_ id: String) -> String {
        ar.design.finishes[id]?.name.components(separatedBy: " (").first ?? id
    }

    private func nudge(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).frame(width: 36, height: 30) }
            .buttonStyle(.bordered)
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
