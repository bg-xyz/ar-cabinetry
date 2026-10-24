import SwiftUI

/// The design language (DESIGN.md): a 1960s European furniture catalogue, set in 2026. Warm paper,
/// one serif (New York), tracked small caps, brass accents, squared corners. Shared by iPhone and
/// Vision Pro.
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

/// The finger-roll slider: choices on a strip you flick through; the one that settles in the
/// middle is the pick (with a selection tick). Tapping a card scrolls it to the middle.
struct RollPicker: View {
    struct Item: Identifiable, Equatable {
        let id: String
        let title: String
        var detail: String = ""
        var icon: String? = nil
        var enabled: Bool = true
    }
    let items: [Item]
    let selected: String
    var large = false
    let onPick: (String) -> Void
    @State private var position: String?

    private var cardWidth: CGFloat { large ? 150 : 108 }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 8) {
                    ForEach(items) { item in card(item).id(item.id) }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, max(0, (geo.size.width - cardWidth) / 2), for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $position, anchor: .center)
        }
        .frame(height: large ? 92 : 56)
        .sensoryFeedback(.selection, trigger: position)
        .onAppear { position = selected }
        .onChange(of: selected) { _, new in if position != new { withAnimation(.snappy) { position = new } } }
        // commit once the strip settles, not for every card that flies past
        .task(id: position) {
            try? await Task.sleep(for: .milliseconds(260))
            if let p = position, p != selected { onPick(p) }
        }
    }

    private func card(_ item: Item) -> some View {
        let on = item.id == position
        return VStack(spacing: large ? 6 : 2) {
            if let icon = item.icon { Image(systemName: icon).font(large ? .title3 : .body).foregroundStyle(on ? Theme.brass : .secondary) }
            Text(item.title).font(Theme.serif(large ? 17 : 15)).lineLimit(1).minimumScaleFactor(0.7)
            if !item.detail.isEmpty {
                Text(item.detail).font(.system(size: 9, weight: .medium)).tracking(1.1).textCase(.uppercase)
                    .foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .frame(width: cardWidth, height: large ? 88 : 52)
        .background(on ? Theme.brass.opacity(0.16) : Color.clear, in: RoundedRectangle(cornerRadius: 7))
        .overlay(RoundedRectangle(cornerRadius: 7).stroke(on ? Theme.brass : Theme.rule, lineWidth: on ? 1.5 : 1))
        .opacity(item.enabled ? 1 : 0.5)
        .contentShape(Rectangle())
        .onTapGesture { withAnimation(.snappy) { position = item.id } }
        .scrollTransition(.interactive, axis: .horizontal) { content, phase in
            content.scaleEffect(phase.isIdentity ? 1 : 0.9).opacity(phase.isIdentity ? 1 : 0.6)
        }
    }
}

/// The one strong button: walnut, squared, with an arrow.
struct BigButtonLabel: View {
    let text: String
    var enabled = true
    var body: some View {
        HStack {
            Text(text).font(.body.weight(.medium)).tracking(0.3)
            Spacer()
            Image(systemName: enabled ? "arrow.right" : "clock")
        }
        .foregroundStyle(Theme.onWalnut)
        .padding(.horizontal, 18).padding(.vertical, 15)
        .background(Theme.walnut.opacity(enabled ? 1 : 0.45), in: RoundedRectangle(cornerRadius: 4))
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

/// The panel at the bottom of the screen. `glass` lets the room show through (the home screen);
/// otherwise frosted and warmed with paper so text stays readable over a busy room.
struct Panel<Content: View>: View {
    var glass = false
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 18).fill(glass ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(.regularMaterial))
                    RoundedRectangle(cornerRadius: 18).fill(Theme.paper.opacity(glass ? 0.12 : 0.5))
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(glass ? 0.35 : 0.0)).blendMode(.overlay))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.rule))
            .shadow(color: .black.opacity(glass ? 0.12 : 0.08), radius: 20, y: 8)
    }
}

/// Things on their way to the share sheet (a captioned photo, or a raw frame plus a prompt).
struct ShareItem: Identifiable {
    let id = UUID()
    let items: [Any]
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

extension String {
    var capitalizingFirst: String { prefix(1).uppercased() + dropFirst() }
}
