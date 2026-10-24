import RealityKit
import SwiftUI

@main
struct CabinetsApp: App {
    var body: some SwiftUI.Scene {
        WindowGroup { ContentView().tint(Theme.brass) }
    }
}

/// The options under a placed design: one tab row, one finger-roll slider.
enum OptionTab: String, CaseIterable, Identifiable {
    case build = "Build", style = "Style", width = "Width", grain = "Grain", fronts = "Fronts", cabinet = "Cabinet", top = "Top"
    var id: String { rawValue }
}

struct ContentView: View {
    @StateObject private var ar = ARController()
    @State private var showDetails = false
    @State private var shareItem: ShareItem?
    @State private var tab: OptionTab = .style
    @State private var naming = false
    @State private var roomName = ""
    @State private var toast: String?

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
        .sheet(item: $shareItem) { item in ShareSheet(items: item.items) }
        .alert("Save it here", isPresented: $naming) {
            TextField("Room", text: $roomName)
            Button("Save") { ar.saveHere(room: roomName) { message in show(message) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Plywise remembers this room. Come back, open it from the home screen, look at the wall and it's there again.")
        }
        .overlay(alignment: .top) {
            if let toast {
                Pill(text: toast, bold: false).padding(.top, 60).padding(.horizontal)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private func show(_ message: String) {
        withAnimation(.snappy) { toast = message }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { withAnimation(.easeOut) { if toast == message { toast = nil } } }
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
            // glass over the live camera: the room is already the backdrop
            Panel(glass: true) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("Plywise").font(Theme.serif(40))
                    Circle().fill(Theme.brass).frame(width: 7, height: 7)
                    Spacer()
                    Text("Built for your walls.").font(Theme.serif(16, italic: true)).foregroundStyle(.secondary)
                }
                Caps("What are you building?")
                RollPicker(items: ARController.projects.map { .init(id: $0.id, title: $0.name, detail: $0.ready ? $0.room : "Coming soon", icon: $0.icon, enabled: $0.ready) },
                           selected: ar.project, large: true) { ar.project = $0 }
                    .padding(.horizontal, -16)
                Button { ar.startScan() } label: {
                    BigButtonLabel(text: !ar.current.ready ? "\(ar.current.name) is coming soon" : ARController.hasLiDAR ? "Scan the room" : "Place it on a wall", enabled: ar.current.ready)
                }
                .buttonStyle(.plain)
                .disabled(!ar.current.ready)
                if ARController.hasLiDAR && ar.current.ready {
                    Button("No scan: tap a wall instead") { ar.startQuickPlace() }
                        .font(.footnote.weight(.medium)).frame(maxWidth: .infinity)
                }
                if !ar.saved.isEmpty { savedRooms }
            }
        case .finding:
            Panel(glass: true) {
                Caps("Finding \(ar.finding?.room ?? "the room")")
                HStack(alignment: .top, spacing: 12) {
                    if let id = ar.finding?.id, let photo = SavedRooms.photo(for: id) {
                        Image(uiImage: photo).resizable().scaledToFill().frame(width: 84, height: 112).clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(ar.finding?.name ?? "").font(Theme.serif(22))
                        Text(ar.findingSlow ? "Still looking. Stand about where you took this photo, turn on the lights, and sweep slowly across the wall."
                             : "Stand about where you saved it and look slowly around the wall. It appears as soon as Plywise recognises the room.")
                            .font(.callout).fixedSize(horizontal: false, vertical: true)
                    }
                }
                HStack {
                    ProgressView()
                    Spacer()
                    Button("Cancel") { ar.cancelFinding() }.font(.footnote.weight(.medium))
                }
            }
        case .quickPlace:
            Panel(glass: true) {
                Caps("\(ar.current.name) · quick place")
                Text("Tap the wall where it goes. How much of the wall is free there?").font(.callout)
                RollPicker(items: stride(from: 30, through: 168, by: 6).map { .init(id: String($0), title: "\($0 / 12)' \($0 % 12)\"", detail: "free wall") },
                           selected: String(Int((ar.quickWidth / 25.4).rounded()))) { ar.setQuick(width: (Double($0) ?? 72) * 25.4) }
                    .padding(.horizontal, -16)
                Button("Scan the room instead") { ar.startScan() }.font(.footnote.weight(.medium))
                    .opacity(ARController.hasLiDAR ? 1 : 0)
            }
        case .scanning:
            Panel(glass: true) {
                Caps("Scanning for your \(ar.current.noun)")
                Text("Walk slowly around the room. Walls light up teal as they're measured; doors orange, windows blue.")
                    .font(.callout)
                Button { ar.finishScan() } label: { BigButtonLabel(text: "Done scanning") }
                    .buttonStyle(.plain)
            }
        case .processing:
            Panel(glass: true) {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Measuring your walls").font(Theme.serif(20, italic: true))
                }
            }
        case .pickWall:
            Panel(glass: true) {
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

    /// Designs saved where they stand, newest first: tap to find the room again.
    private var savedRooms: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().overlay(Theme.rule)
            Caps("Your rooms")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(ar.saved) { piece in
                        Button { ar.open(piece) } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                ZStack {
                                    Rectangle().fill(Theme.rule)
                                    if let photo = SavedRooms.photo(for: piece.id) { Image(uiImage: photo).resizable().scaledToFill() }
                                }
                                .frame(width: 104, height: 78).clipShape(RoundedRectangle(cornerRadius: 6))
                                Text(piece.room).font(.system(size: 11, weight: .semibold)).tracking(1.2).textCase(.uppercase)
                                Text(piece.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                            .frame(width: 104)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(role: .destructive) { ar.deleteSaved(piece) } label: { Label("Forget this room", systemImage: "trash") }
                        }
                    }
                }
            }
        }
    }

    private var pickWallHint: String {
        let around: String
        switch ar.project {
        case "vanity": around = "around doors and the toilet, centred on your old sink"
        case "bookcase": around = "wall to wall and up to the ceiling, around doors and windows"
        case "desk": around = "with file pedestals and a knee space at least 30\" wide, around doors and under high windows"
        case "bar": around = "wall to wall at counter height, around doors and under high windows"
        case "island": return "Tap the wall your counters are on. The island stands 42\" in front of them, facing them, with room to walk round each end."
        default: around = "around doors, and under windows when the sill is high enough"
        }
        return "Tap the wall where the \(ar.current.noun) goes. Plywise sizes it to the clear space, \(around)."
    }

    private var styleName: String { ARController.styles.first { $0.preset == ar.stylePreset }?.name ?? "" }
    private var grainName: String { ARController.grains.first { $0.id == ar.plan?.grainMatch }?.name ?? "" }
    private var hasTop: Bool { ar.design?.parts.contains { $0.role == "top" } ?? false }

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
            Caps("\(styleName) · \(grainName == "Off" ? "unmatched" : "grain \(grainName.lowercased())") · tap a drawer to open it")
            if let line = ar.plan?.proportion {
                // tap to see the ratios on the piece itself
                Button { ar.toggleMath() } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("\u{03C6}").font(Theme.serif(17, italic: true)).foregroundStyle(Theme.brass)
                        Text(line + (ar.showMath ? "" : " Tap to see it on the piece."))
                            .font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shows each drawer's height as a multiple of the top drawer")
            }
            ForEach(Array((showDetails ? ar.notes : Array(ar.notes.prefix(2))).enumerated()), id: \.offset) { _, note in
                Text(note).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if ar.builtInsOnWall { builtInsRow }
            Divider().overlay(Theme.rule)
            tabRow
            RollPicker(items: items(for: tab), selected: selected(for: tab)) { pick(tab, $0) }
                .id(tab)   // a fresh strip per tab
                .padding(.horizontal, -16)
            if ar.quick {
                HStack {
                    Text("Free wall").font(.footnote)
                    Spacer()
                    Stepper("\(Int((ar.quickWidth / 25.4).rounded()))\"", value: Binding(get: { ar.quickWidth / 25.4 }, set: { ar.setQuick(width: $0 * 25.4) }), in: 24...168, step: 6)
                        .font(.footnote.weight(.medium)).fixedSize()
                }
            }
            HStack(spacing: 8) {
                nudge("arrow.left") { ar.nudge(along: -1) }
                nudge("arrow.right") { ar.nudge(along: 1) }
                nudge("arrow.down.to.line") { ar.nudge(out: -0.5) }
                nudge("arrow.up.to.line") { ar.nudge(out: 0.5) }
                Spacer()
                Button { ar.pickAnotherWall() } label: {
                    Image(systemName: "arrow.triangle.swap").font(.footnote.weight(.semibold)).frame(width: 38, height: 32)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.rule))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Other wall")
                Button { roomName = ar.suggestedRoom; naming = true } label: {
                    Image(systemName: "mappin.and.ellipse").font(.footnote.weight(.semibold)).frame(width: 38, height: 32)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.rule))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Save it here")
                Button { ar.watchItBuild() } label: {
                    Image(systemName: "hammer").font(.footnote.weight(.semibold)).frame(width: 38, height: 32)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.rule))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Watch it build")
                shareMenu
            }
        }
    }

    /// The scan found existing cabinets on this wall: do they stay (and block) or go (plan over them)?
    private var builtInsRow: some View {
        HStack {
            Text("Existing cabinets on this wall").font(.footnote)
            Spacer()
            Picker("Existing cabinets", selection: Binding(get: { ar.replaceBuiltIns }, set: { ar.setReplaceBuiltIns($0) })) {
                Text("Keep").tag(false)
                Text("Replace").tag(true)
            }
            .pickerStyle(.segmented)
            .frame(width: 160)
        }
    }

    private var tabRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                ForEach(OptionTab.allCases.filter { $0 != .top || hasTop }) { t in
                    Button { withAnimation(.snappy) { tab = t } } label: {
                        VStack(spacing: 4) {
                            Text(t.rawValue).font(.system(size: 11, weight: .semibold)).tracking(1.4).textCase(.uppercase)
                                .foregroundStyle(t == tab ? Color.primary : Color.secondary)
                            Rectangle().fill(t == tab ? Theme.brass : .clear).frame(height: 2)
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sensoryFeedback(.selection, trigger: tab)
    }

    private func finishItems(_ design: Design) -> [RollPicker.Item] {
        design.finishes.keys.sorted().map { id in
            let name = design.finishes[id]?.name.components(separatedBy: " (").first?.replacingOccurrences(of: " veneer", with: "") ?? id
            let words = name.components(separatedBy: " ")
            return .init(id: id, title: words.last == "birch" ? "Birch" : name.replacingOccurrences(of: "Painted ", with: ""),
                         detail: design.finishes[id]?.paint != nil ? "paint" : "veneer")
        }
    }

    private func items(for tab: OptionTab) -> [RollPicker.Item] {
        switch tab {
        case .build: return ARController.projects.filter(\.ready).map { .init(id: $0.id, title: $0.name.components(separatedBy: " ").last?.capitalized ?? $0.name, detail: $0.room) }
        case .style: return ARController.styles.map { .init(id: $0.preset, title: $0.name, detail: $0.hint) }
        case .width:
            let fit = RollPicker.Item(id: "fit", title: ar.project == "bookcase" || ar.project == "bar" ? "Fill" : "Best fit", detail: "planned")
            return [fit] + ar.widthOptions.map { .init(id: String(Int($0)), title: "\(Int(($0 / 25.4).rounded()))\"", detail: "\(Int($0)) mm") }
        case .grain: return ARController.grains.map { .init(id: $0.id, title: $0.name, detail: $0.hint) }
        case .fronts, .cabinet, .top: return ar.design.map(finishItems) ?? []
        }
    }

    private func selected(for tab: OptionTab) -> String {
        switch tab {
        case .build: return ar.project
        case .style: return ar.stylePreset
        case .width: return ar.widthChoice.map { String(Int($0)) } ?? "fit"
        case .grain: return ar.plan?.grainMatch ?? "across"
        case .fronts: return ar.choice?.fronts ?? ""
        case .cabinet: return ar.choice?.cabinet ?? ""
        case .top: return ar.choice?.top ?? ""
        }
    }

    private func pick(_ tab: OptionTab, _ id: String) {
        switch tab {
        case .build: ar.setProject(id)
        case .style: ar.setStyle(id)
        case .width: ar.setWidth(id == "fit" ? nil : ar.widthOptions.first { String(Int($0)) == id })
        case .grain: ar.setGrain(id)
        case .fronts: ar.setFinish(.fronts, id)
        case .cabinet: ar.setFinish(.cabinet, id)
        case .top: ar.setFinish(.top, id)
        }
    }

    /// Share: a captioned photo, or the raw frame plus a prompt for any image AI (no AI in the app).
    private var shareMenu: some View {
        Menu {
            Button { ar.snapshot { image in if let image { shareItem = ShareItem(items: [image, ar.shareLink ?? URL(string: "https://plywise.xyz")!]) } } } label: {
                Label("Share a photo", systemImage: "photo")
            }
            if let link = ar.shareLink {
                Button { shareItem = ShareItem(items: [link]) } label: { Label("Share the design (3D link)", systemImage: "link") }
                Button { UIApplication.shared.open(link) } label: { Label("Edit in Blender or any AI", systemImage: "cube.transparent") }
            }
            Button {
                ar.photoKit { image, prompt in
                    UIPasteboard.general.string = prompt
                    if let image { shareItem = ShareItem(items: [image, prompt]) }
                }
            } label: { Label("Make it a photo (copy prompt)", systemImage: "wand.and.stars") }
        } label: {
            Image(systemName: "square.and.arrow.up").font(.footnote.weight(.semibold)).frame(width: 38, height: 32)
                .foregroundStyle(Theme.onWalnut).background(Theme.walnut, in: RoundedRectangle(cornerRadius: 4))
        }
        .accessibilityLabel("Share")
    }

    private func nudge(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.footnote.weight(.medium)).frame(width: 34, height: 32)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.rule))
        }
        .buttonStyle(.plain)
    }
}

struct ARViewContainer: UIViewRepresentable {
    let arView: ARView
    func makeUIView(context: Context) -> ARView { arView }
    func updateUIView(_ uiView: ARView, context: Context) {}
}
