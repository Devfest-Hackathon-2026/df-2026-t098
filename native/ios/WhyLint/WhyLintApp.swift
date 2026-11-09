import GoogleSignIn
import SwiftUI

@main struct WhyLintApp: App {
    @State private var store = AppStore()
    var body: some Scene {
        WindowGroup {
            ReadingScaleRoot().environment(store).onOpenURL {
                _ = GIDSignIn.sharedInstance.handle($0)
            }
            .preferredColorScheme(
                store.hasThemePreference ? (store.theme == "light" ? .light : .dark) : nil
            )
            .tint(store.palette.accent)
            .font(.custom("DMSans-9ptRegular", size: 15, relativeTo: .body))
        }
    }
}

struct Palette {
    let light: Bool
    var canvas: Color { Color(hex: light ? 0xf3f5f0 : 0x080808) }
    var surface: Color { Color(hex: light ? 0xffffff : 0x151515) }
    var text: Color { Color(hex: light ? 0x20251f : 0xf5f5f2) }
    var muted: Color { Color(hex: light ? 0x555e53 : 0xb4b4ac) }
    var accent: Color { Color(hex: light ? 0x4b6c08 : 0xc6f24e) }
    var border: Color { Color(hex: light ? 0xd2d9cf : 0x333333) }
    var control: Color { Color(hex: light ? 0xf1f3ed : 0x222222) }
    var code: Color { Color(hex: light ? 0xf1f3ed : 0x090909) }
    var button: Color { Color(hex: light ? 0x22291f : 0xf3f3eb) }
    var buttonText: Color { Color(hex: light ? 0xffffff : 0x111111) }
    var danger: Color { Color(hex: light ? 0xc2362f : 0xff6b6b) }
    var success: Color { Color(hex: light ? 0x2e7d16 : 0x8ee05a) }
}
extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255,
            blue: Double(hex & 255) / 255)
    }
}
struct PrimaryButton: ButtonStyle {
    @Environment(AppStore.self) private var store
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(store.palette.buttonText).background(
                store.palette.button, in: RoundedRectangle(cornerRadius: 10)
            )
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}
struct OutlineButton: ButtonStyle {
    @Environment(AppStore.self) private var store
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.frame(minHeight: 44).padding(.horizontal, 12)
            .foregroundStyle(store.palette.text).background(
                configuration.isPressed ? store.palette.control : .clear,
                in: RoundedRectangle(cornerRadius: 10)
            )
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(store.palette.border))
    }
}
struct Surface<Content: View>: View {
    @Environment(AppStore.self) private var store
    @ViewBuilder var content: Content
    var body: some View {
        content.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12).padding(
            .bottom, 16
        )
        .overlay(alignment: .bottom) { Rectangle().fill(store.palette.border).frame(height: 1) }
    }
}
struct ErrorNotice: View {
    @Environment(AppStore.self) private var store
    let message: String
    var body: some View {
        Text(message).font(.custom("DMSans-9ptRegular", size: 15, relativeTo: .subheadline))
            .foregroundStyle(store.palette.danger)
            .frame(maxWidth: .infinity, alignment: .leading).accessibilityAddTraits(
                .updatesFrequently)
    }
}
struct AppRoot: View {
    @Environment(\.colorScheme) private var systemTheme
    @Environment(AppStore.self) private var store
    private let tabs = [
        ("feed", "text.rectangle", "フィード", "Feed"),
        ("review", "arrow.counterclockwise", "復習", "Practice"),
        ("rank", "trophy", "ランキング", "Ranking"), ("publish", "plus", "投稿", "Post"),
        ("profile", "person", "プロフィール", "Profile"),
    ]
    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            topbar
            Rectangle().fill(store.palette.border).frame(height: 1)
            if store.sessionUnavailable {
                HStack {
                    Text(store.text("アカウントを確認できませんでした。", "Could not check your account.")).font(
                        .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                    Button(store.text("再試行", "Retry")) { Task { await store.restoreSession() } }
                        .frame(minHeight: 44)
                }.padding(.horizontal, 16)
            }
            Group {
                switch store.tab {
                case "review": CollectionView(kind: "reviews")
                case "rank": RankingView()
                case "publish": PublishView().id(store.user?.text("id") ?? "guest")
                case "profile": ProfileView()
                case "settings": SettingsView()
                default: FeedView()
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
            Rectangle().fill(store.palette.border).frame(height: 1)
            HStack(spacing: 0) {
                ForEach(tabs, id: \.0) { tab in
                    let selected = store.tab == tab.0 || (store.tab == "settings" && tab.0 == "profile")
                    Button {
                        store.tab = tab.0
                    } label: {
                        VStack(spacing: 5) {
                            Image("web-" + tab.0).renderingMode(.template).resizable().scaledToFit()
                                .frame(width: 20, height: 20).accessibilityHidden(true)
                            Text(store.text(tab.2, tab.3)).font(
                                .custom("DMSans-9ptRegular", size: 11))
                        }.frame(maxWidth: .infinity, minHeight: 56)
                            .foregroundStyle(
                                selected ? store.palette.accent : store.palette.muted)
                    }.accessibilityIdentifier("tab-" + tab.0)
                        .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
            }.padding(.horizontal, 8)
        }
        .background(store.palette.canvas).foregroundStyle(store.palette.text)
        .sheet(isPresented: $store.showingLogin) { AuthView().environment(store) }
        .sheet(isPresented: $store.showingOnboarding) { OnboardingView().environment(store) }
        .sheet(item: $store.selectedQuestion) { question in
            NavigationStack {
                QuestionCard(question: question).padding(16).background(store.palette.canvas)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(store.text("閉じる", "Close")) { store.selectedQuestion = nil }
                        }
                    }
            }.environment(store)
        }
        .sheet(item: $store.creator) { creator in
            NavigationStack {
                CreatorView(creator: creator).toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(store.text("閉じる", "Close")) { store.creator = nil }
                    }
                }
            }
        }
        .task {
            store.followSystemTheme(systemTheme)
            await store.start()
        }
        .onChange(of: systemTheme) { _, scheme in store.followSystemTheme(scheme) }
    }
    private var topbar: some View {
        HStack(spacing: 10) {
            BrandWordmark(compact: true, size: 20)
            Spacer()
            if store.signedIn {
                Label("\(store.progress.number("streak"))", systemImage: "flame").foregroundStyle(
                    .orange)
                Text(
                    "\(store.progress.number("dailyCompleted"))/\(max(5, store.progress.number("dailyGoal")))"
                )
                Text("Lv \(max(1, store.progress.number("level")))").foregroundStyle(
                    store.palette.accent)
            } else {
                HStack(spacing: 5) {
                    Image("web-check").renderingMode(.template).resizable().frame(
                        width: 14, height: 14
                    ).accessibilityHidden(true)
                    Text("\(store.guestCorrect)/\(store.guestAnswered)")
                }
                .padding(8).background(store.palette.control, in: Capsule())
                Button(store.text("ログインして記録", "Save progress")) { store.showingLogin = true }
                    .fontWeight(.semibold).foregroundStyle(store.palette.accent).padding(
                        .horizontal, 10
                    ).frame(minHeight: 44)
                    .background(store.palette.control, in: Capsule())
                    .accessibilityIdentifier("login-topbar")
            }
        }.font(.custom("DMSans-9ptRegular", size: 12)).padding(.horizontal, 12).frame(minHeight: 56)
    }
}

struct FeedView: View {
    @Environment(AppStore.self) private var store
    @State private var currentID: String?
    var body: some View {
        GeometryReader { geometry in
            if store.loading && store.questions.isEmpty {
                VStack(spacing: 18) {
                    ProgressView().tint(store.palette.accent)
                    Text(store.text("問題を読み込み中…", "Loading questions…")).foregroundStyle(
                        store.palette.muted)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.questions.isEmpty {
                VStack(spacing: 20) {
                    Text(store.message ?? store.text("問題を準備しています。", "Preparing your questions."))
                    Button(store.text("再試行", "Try again")) { Task { await store.loadFeed() } }
                        .buttonStyle(OutlineButton())
                }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView(.vertical) {
                    LazyVStack(spacing: 0) {
                        ForEach(store.questions) { question in
                            QuestionCard(
                                question: question,
                                onNext: {
                                    if let index = store.questions.firstIndex(where: {
                                        $0.id == question.id
                                    }), store.questions.indices.contains(index + 1) {
                                        withAnimation(.easeOut(duration: 0.2)) {
                                            currentID = store.questions[index + 1].id
                                        }
                                    } else {
                                        Task { await store.loadMore() }
                                    }
                                }
                            ).frame(maxWidth: 760)
                                .padding(.horizontal, 16).padding(.vertical, 8)
                                .frame(width: geometry.size.width, height: geometry.size.height)
                                .id(question.id)
                        }
                        VStack(spacing: 16) {
                            if store.generating { ProgressView() }
                            Text(
                                store.message
                                    ?? store.text("次の問題に挑戦しましょう。", "Ready for your next question?"))
                            Button(store.text("次の問題", "More questions")) {
                                Task {
                                    if store.signedIn {
                                        await store.loadMore()
                                    } else {
                                        await store.loadFeed()
                                    }
                                }
                            }.buttonStyle(OutlineButton())
                        }.padding(24).frame(
                            width: geometry.size.width, height: geometry.size.height)
                    }.scrollTargetLayout()
                }.scrollTargetBehavior(.paging).scrollPosition(id: $currentID).scrollIndicators(
                    .hidden
                )
                .onChange(of: currentID) { _, value in
                    if let value, let index = store.questions.firstIndex(where: { $0.id == value }),
                        index >= store.questions.count - 3
                    {
                        Task { await store.loadMore() }
                    }
                }
            }
        }
    }
}

struct BrandWordmark: View {
    @Environment(AppStore.self) private var store
    var compact = false
    var size: CGFloat = 18

    var body: some View {
        let name = compact ? "mark" : "wordmark"
        let width = (compact ? 20.526 : 93.882) * size / 18
        Image("brand-\(name)-\(store.theme)")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: width)
            .accessibilityLabel("WhyLint")
    }
}
struct AccentButton: ButtonStyle {
    @Environment(AppStore.self) private var store
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(store.theme == "light" ? Color.white : Color(hex: 0x111111))
            .background(store.palette.accent, in: RoundedRectangle(cornerRadius: 8)).opacity(
                configuration.isPressed ? 0.8 : 1)
    }
}
struct CompactPrimaryButton: ButtonStyle {
    @Environment(AppStore.self) private var store
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.fontWeight(.semibold).padding(.horizontal, 20).frame(minHeight: 48)
            .foregroundStyle(store.palette.buttonText).background(
                store.palette.button, in: RoundedRectangle(cornerRadius: 10)
            )
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct AccentOutlineButton: ButtonStyle {
    @Environment(AppStore.self) private var store
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(store.palette.accent).padding(.horizontal, 12).frame(
            minHeight: 44
        )
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(store.palette.accent))
        .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct NextButton: ButtonStyle {
    @Environment(AppStore.self) private var store
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .body))
            .fontWeight(.semibold)
            .foregroundStyle(store.palette.buttonText).padding(.horizontal, 12).frame(minHeight: 44)
            .background(store.palette.button, in: Capsule()).opacity(
                configuration.isPressed ? 0.8 : 1)
    }
}

// Respect a larger system text size.
struct ReadingScaleRoot: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dynamicTypeSize) private var systemTextSize
    var body: some View {
        let preference: DynamicTypeSize =
            store.readingSize == 2 ? .xxxLarge : store.readingSize == 1 ? .xLarge : .large
        AppRoot().dynamicTypeSize(max(systemTextSize, preference))
    }
}
