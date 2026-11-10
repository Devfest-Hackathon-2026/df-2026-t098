import SwiftUI

struct AuthView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var signup = false
    @State private var identifier = ""
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var pending = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    BrandWordmark()
                    Text(
                        store.text(
                            signup ? "アカウントを作成" : "ログイン", signup ? "Create an account" : "Sign in")
                    ).font(.custom("DMSans-9ptRegular", size: 34, relativeTo: .largeTitle)).bold()
                    Text(
                        store.loginReasonText(store.loginReason)
                            ?? (signup
                                ? store.text(
                                    "進捗やXPを保存して、学習を続けましょう。",
                                    "Create an account to keep your progress and XP.")
                                : store.text(
                                    "ログインして、学習を続けましょう。",
                                    "Sign in and continue learning with WhyLint."))
                    ).foregroundStyle(store.palette.muted).accessibilityIdentifier("auth-reason")
                    VStack(alignment: .leading, spacing: 16) {
                        if signup {
                            field(
                                store.text("メールアドレス", "Email"), text: $email, id: "auth-email",
                                email: true)
                            field(
                                store.text("ユーザー名", "Username"), text: $username,
                                id: "auth-username")
                        } else {
                            field(
                                store.text("メールアドレスまたはユーザー名", "Email or username"),
                                text: $identifier, id: "auth-identifier")
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text(store.text("パスワード", "Password")).fontWeight(.medium)
                            SecureField(store.text("パスワード", "Password"), text: $password)
                                .textContentType(.password).keyboardType(.asciiCapable)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .padding(14)
                                .background(
                                    store.palette.control, in: RoundedRectangle(cornerRadius: 8)
                                ).accessibilityIdentifier("auth-password")
                        }
                        if signup {
                            Text(store.text("15〜128文字で入力してください。", "Use 15–128 characters.")).font(
                                .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption)
                            ).foregroundStyle(store.palette.muted)
                        } else if let recovery = SiteLinks.forgotPassword {
                            Link(store.text("パスワードをお忘れですか？", "Forgot your password?"), destination: recovery)
                                .frame(minHeight: 44)
                                .disabled(pending)
                                .accessibilityIdentifier("auth-forgot-password")
                        }
                    }
                    if let error { ErrorNotice(message: error) }
                    Button {
                        error = nil
                        if signup, email.trimmingCharacters(in: .whitespaces).isEmpty {
                            error = store.text("メールアドレスを入力してください。", "Enter your email address.")
                            return
                        }
                        if signup, username.trimmingCharacters(in: .whitespaces).isEmpty {
                            error = store.text("ユーザー名を入力してください。", "Enter a username.")
                            return
                        }
                        if !signup, identifier.trimmingCharacters(in: .whitespaces).isEmpty {
                            error = store.text(
                                "メールアドレスまたはユーザー名を入力してください。", "Enter your email or username.")
                            return
                        }
                        if password.isEmpty {
                            error = store.text("パスワードを入力してください。", "Enter your password.")
                            return
                        }
                        guard !signup || password.count >= 15, password.count <= 128 else {
                            error = store.text("パスワードの長さを確認してください。", "Check the password length.")
                            return
                        }
                        pending = true
                        Task {
                            defer { pending = false }
                            do {
                                try await store.signIn(
                                    identifier: identifier.trimmingCharacters(in: .whitespaces),
                                    password: password,
                                    email: signup
                                        ? email.trimmingCharacters(in: .whitespaces) : nil,
                                    username: signup
                                        ? username.trimmingCharacters(in: .whitespaces) : nil)
                                password = ""
                                dismiss()
                            } catch { self.error = store.errorMessage(error) }
                        }
                    } label: {
                        Text(
                            pending
                                ? store.text("ログイン中…", "Signing in…")
                                : store.text(
                                    signup ? "アカウントを作成" : "ログイン",
                                    signup ? "Create account" : "Sign in"))
                    }
                    .buttonStyle(AccentButton()).disabled(pending).accessibilityIdentifier(
                        "auth-submit")
                    if signup { ConsentNotice(signup: true) }
                    Button(
                        store.text(
                            signup ? "アカウントをお持ちですか？ログイン" : "アカウントを作成",
                            signup ? "Already have an account? Sign in" : "Create an account")
                    ) {
                        signup.toggle()
                        error = nil
                    }.buttonStyle(OutlineButton()).accessibilityIdentifier("auth-switch")
                    HStack {
                        Rectangle().frame(height: 1)
                        Text(store.text("または", "or"))
                        Rectangle().frame(height: 1)
                    }.foregroundStyle(store.palette.muted)
                    Button {
                        pending = true
                        Task {
                            defer { pending = false }
                            do {
                                try await store.googleSignIn()
                                dismiss()
                            } catch { self.error = store.errorMessage(error) }
                        }
                    } label: {
                        HStack {
                            Image("GoogleSignInLogo").renderingMode(.original).resizable()
                                .scaledToFit().frame(width: 20, height: 20).accessibilityHidden(
                                    true)
                            Text(store.text("Googleで続ける", "Continue with Google"))
                        }.frame(maxWidth: .infinity)
                    }.buttonStyle(PrimaryButton()).disabled(pending)
                    if !signup { ConsentNotice(signup: false) }
                    LegalLinksView()
                }.padding(28).frame(maxWidth: 520)
            }.frame(maxWidth: .infinity).background(store.palette.canvas).foregroundStyle(
                store.palette.text
            )
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(store.text("学習に戻る", "Back to learning")) { dismiss() }
                }
            }
        }
    }
    private func field(_ title: String, text: Binding<String>, id: String, email: Bool = false)
        -> some View
    {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).fontWeight(.medium)
            TextField(title, text: text).textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(email ? .emailAddress : .default).textContentType(
                    email ? .emailAddress : .username
                )
                .padding(14).background(
                    store.palette.control, in: RoundedRectangle(cornerRadius: 8)
                ).accessibilityIdentifier(id)
        }
    }
}

struct OnboardingView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var step = 1
    @State private var interests: Set<String> = []
    @State private var technologies: Set<String> = []
    @State private var difficulty = "beginner"
    @State private var query = ""
    @State private var pending = false
    @State private var error: String?
    var body: some View {
        @Bindable var store = store
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    BrandWordmark(size: 20)
                    HStack {
                        Text(store.text("ステップ", "Step") + " \(step) / 2").foregroundStyle(
                            store.palette.muted)
                        Spacer()
                        Button(store.text("スキップしてすぐ始める →", "Skip, just start →")) {
                            store.didOnboard = true
                            dismiss()
                        }.font(.custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                            .buttonStyle(AccentOutlineButton())
                    }
                    if step == 1 {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(store.text("表示言語", "Display language")).fontWeight(.semibold)
                            Text(
                                store.text(
                                    "画面と新しい問題に使う言語を選んでください。",
                                    "Choose the language for the interface and new questions.")
                            ).font(.custom("DMSans-9ptRegular", size: 15, relativeTo: .subheadline))
                                .foregroundStyle(store.palette.muted)
                            HStack(spacing: 10) {
                                ForEach(["ja", "en"], id: \.self) { language in
                                    Button {
                                        store.language = language
                                    } label: {
                                        HStack {
                                            Image(
                                                systemName: store.language == language
                                                    ? "largecircle.fill.circle" : "circle"
                                            ).foregroundStyle(
                                                store.language == language
                                                    ? store.palette.accent : store.palette.muted)
                                            Text(language == "ja" ? "日本語" : "English")
                                            Spacer()
                                        }.frame(maxWidth: .infinity, minHeight: 44)
                                    }.buttonStyle(OutlineButton()).overlay(
                                        RoundedRectangle(cornerRadius: 10).stroke(
                                            store.language == language
                                                ? store.palette.accent : store.palette.border))
                                }
                            }
                        }
                        Text(store.text("何を学びたいですか？", "What would you like to learn?")).font(
                            .custom("DMSans-9ptRegular", size: 26, relativeTo: .title)
                        ).bold()
                        Text(
                            store.text(
                                "興味のある分野を選びましょう。いくつでも選べます。",
                                "Choose the areas you’re curious about. Pick more than one.")
                        ).foregroundStyle(store.palette.muted)
                        ForEach(store.catalog.objects("interests"), id: \.idValue) { interest in
                            let id = interest.text("id")
                            let label =
                                (interest["label"] as? [String: String])?[store.language] ?? id
                            Button {
                                if interests.contains(id) {
                                    interests.remove(id)
                                } else if interests.count < 6 {
                                    interests.insert(id)
                                }
                            } label: {
                                HStack {
                                    Text(label).fontWeight(.semibold)
                                    Spacer()
                                    Image(
                                        systemName: interests.contains(id)
                                            ? "checkmark.circle.fill" : "circle")
                                }
                                .padding(18).frame(minHeight: 58).background(
                                    store.palette.control, in: RoundedRectangle(cornerRadius: 12)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12).stroke(
                                        interests.contains(id)
                                            ? store.palette.accent : store.palette.border))
                            }.buttonStyle(.plain).accessibilityAddTraits(
                                interests.contains(id) ? [.isSelected] : [])
                        }
                        if store.catalog.isEmpty {
                            Button(store.text("分野を再読み込み", "Reload interests")) {
                                Task { await store.loadCatalog() }
                            }.buttonStyle(OutlineButton())
                        }
                        if interests.isEmpty {
                            Text(
                                store.text(
                                    "続けるには、分野を1つ以上選んでください。", "Pick at least one area to continue.")
                            ).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .footnote))
                                .foregroundStyle(store.palette.muted)
                        }
                        Button(store.text("次へ", "Continue")) { step = 2 }.buttonStyle(
                            PrimaryButton()
                        ).disabled(interests.isEmpty)
                    } else {
                        Text(store.text("好きな技術から始めよう", "Start with your technologies")).font(
                            .custom("DMSans-9ptRegular", size: 26, relativeTo: .title)
                        ).bold()
                        TextField(store.text("言語・技術を検索", "Search technologies"), text: $query)
                            .padding(14).background(
                                store.palette.control, in: RoundedRectangle(cornerRadius: 10))
                        ScrollView {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], spacing: 10) {
                                ForEach(
                                    (store.catalog["technologies"] as? [String] ?? []).filter {
                                        query.isEmpty || $0.localizedCaseInsensitiveContains(query)
                                    }, id: \.self
                                ) { technology in
                                    Button {
                                        if technologies.contains(technology) {
                                            technologies.remove(technology)
                                        } else if technologies.count < 40 {
                                            technologies.insert(technology)
                                        }
                                    } label: {
                                        Text(technology).font(
                                            .custom(
                                                "DMSans-9ptRegular", size: 15,
                                                relativeTo: .subheadline)
                                        ).frame(maxWidth: .infinity, minHeight: 44).padding(
                                            .horizontal, 8
                                        )
                                        .background(
                                            technologies.contains(technology)
                                                ? store.palette.accent.opacity(0.15)
                                                : store.palette.control,
                                            in: RoundedRectangle(cornerRadius: 8)
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8).stroke(
                                                technologies.contains(technology)
                                                    ? store.palette.accent : store.palette.border))
                                    }.buttonStyle(.plain).accessibilityAddTraits(
                                        technologies.contains(technology) ? [.isSelected] : [])
                                }
                            }
                        }.frame(maxHeight: 250)
                        Picker(store.text("難易度", "Difficulty"), selection: $difficulty) {
                            Text(store.text("初級", "Beginner")).tag("beginner")
                            Text(store.text("中級", "Intermediate")).tag("intermediate")
                            Text(store.text("上級", "Advanced")).tag("advanced")
                        }.pickerStyle(.segmented)
                        if let error { ErrorNotice(message: error) }
                        Button(
                            pending
                                ? store.text("保存中…", "Saving…")
                                : store.text("学習を始める", "Start learning")
                        ) {
                            pending = true
                            Task {
                                defer { pending = false }
                                do {
                                    try await store.savePreferences([
                                        "interests": Array(interests).sorted(),
                                        "technologies": Array(technologies).sorted(),
                                        "difficulty": difficulty, "language": store.language,
                                    ])
                                    dismiss()
                                } catch { self.error = store.errorMessage(error) }
                            }
                        }.buttonStyle(PrimaryButton()).disabled(pending)
                        Button(store.text("戻る", "Back")) { step = 1 }.frame(minHeight: 44)
                    }
                }.padding(24).frame(maxWidth: 600)
            }.frame(maxWidth: .infinity).background(store.palette.canvas).foregroundStyle(
                store.palette.text
            )
            .toolbar(.hidden, for: .navigationBar)
            .task {
                interests = Set(store.preferences["interests"] as? [String] ?? [])
                technologies = Set(store.preferences["technologies"] as? [String] ?? [])
                difficulty = store.preferences["difficulty"] as? String ?? "beginner"
                await store.loadCatalog()
            }
        }.interactiveDismissDisabled(pending)
    }
}
extension Dictionary where Key == String, Value == Any { var idValue: String { text("id") } }

struct CollectionView: View {
    @Environment(AppStore.self) private var store
    let kind: String
    @State private var questions: [Question] = []
    @State private var loading = true
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text(
                    store.text(
                        kind == "reviews" ? "理解するまで、もう一度。" : "保存した問題",
                        kind == "reviews"
                            ? "Come back with a fresh perspective." : "Saved questions")
                ).font(.custom("DMSans-9ptRegular", size: 28, relativeTo: .title)).bold()
                if kind == "reviews" {
                    Text(
                        store.text(
                            "間違えた問題はここに保存され、正解するまで毎朝9時（日本時間）にフィードへ戻ってきます。",
                            "Missed questions return to your feed every morning at 9:00 (Japan time) until you get them right."
                        )
                    ).foregroundStyle(store.palette.muted)
                }
                if !store.signedIn {
                    Button(store.text("ログインして復習", "Sign in to practice")) {
                        store.promptSignIn("practice")
                    }.buttonStyle(PrimaryButton())
                    StepsList(items: [
                        store.text("フィードで問題に間違える", "You miss a question in the feed."),
                        store.text(
                            "翌朝9時（日本時間）に、もう一度フィードに出てきます。",
                            "It returns the next morning at 9:00 (Japan time)."),
                        store.text("正解すると、復習は完了です。", "Get it right and it is cleared."),
                    ])
                } else if loading {
                    ProgressView()
                } else if let error {
                    ErrorNotice(message: error)
                    Button(store.text("再試行", "Retry")) { Task { await load() } }.buttonStyle(
                        OutlineButton())
                } else if questions.isEmpty {
                    Text(
                        store.text(
                            "問題はありません。フィードで次の問いに挑戦しましょう。",
                            "You’re caught up. Find your next question in the feed.")
                    ).foregroundStyle(store.palette.muted)
                }
                ForEach(questions) { question in
                    Button {
                        store.selectedQuestion = question
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(question.topics.joined(separator: " · ")).font(
                                .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption)
                            ).foregroundStyle(store.palette.accent)
                            Text(question.prompt).fontWeight(.semibold)
                            Text(store.text("もう一度解く →", "Try again →")).font(
                                .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption)
                            ).foregroundStyle(store.palette.muted)
                        }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(
                            store.palette.surface, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.plain)
                }
            }.padding(.horizontal, 16).padding(.vertical, 28).frame(maxWidth: 760)
        }.frame(maxWidth: .infinity).task(id: store.user?.text("id")) { await load() }
    }
    private func load() async {
        guard store.signedIn else {
            loading = false
            return
        }
        loading = true
        error = nil
        defer { loading = false }
        do {
            questions = try await store.api.request("/learning/" + kind).objects("questions")
                .compactMap(Question.init)
        } catch { self.error = store.errorMessage(error) }
    }
}

struct ProfileView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Text(store.text("プロフィール", "Profile")).font(
                        .custom("DMSans-9ptRegular", size: 28, relativeTo: .title)
                    ).bold().accessibilityIdentifier("profile-heading")
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Button {
                        store.tab = "settings"
                    } label: {
                        Image(systemName: "gearshape").frame(width: 44, height: 44)
                            .background(
                                store.palette.control, in: RoundedRectangle(cornerRadius: 10))
                    }.buttonStyle(.plain)
                        .accessibilityLabel(store.text("設定", "Settings"))
                        .accessibilityIdentifier("open-settings")
                }
                Surface {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(store.text("アカウント", "Account")).font(
                            .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                        ).fontWeight(.semibold)
                        if let user = store.user {
                            ProfileIdentity(user: user)
                            if user["emailVerified"] as? Bool == false {
                                ProfileEmailVerification().id(user.text("id"))
                            }
                            Button(store.text("公開プロフィールを見る", "View public profile")) {
                                store.creator = CreatorLink(id: user.text("id"))
                            }.frame(minHeight: 44).accessibilityIdentifier("public-profile")
                        } else {
                            Text(
                                store.text(
                                    "ログインすると学習の進み具合を保存できます。",
                                    "Sign in to keep your progress across devices.")
                            ).foregroundStyle(store.palette.muted)
                            Button(store.text("ログイン", "Sign in")) { store.promptSignIn("progress") }
                                .buttonStyle(CompactPrimaryButton())
                        }
                    }
                }
                if store.signedIn { AccountLearningView() }
            }.padding(.horizontal, 16).padding(.vertical, 28).frame(maxWidth: 760)
        }.frame(maxWidth: .infinity)
    }
}

private struct ProfileEmailVerification: View {
    @Environment(AppStore.self) private var store
    @State private var pending = false
    @State private var status: String?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(store.text("メールアドレスは未確認です", "Email not verified"))
                .fontWeight(.semibold)
                .accessibilityIdentifier("email-not-verified")
            Text(store.text(
                "確認メールのリンクを開き、ここで確認状況を更新してください。",
                "Open the link in your email, then check your status here."
            )).foregroundStyle(store.palette.muted)
            Button(store.text("確認メールを再送", "Resend verification email")) {
                update(resend: true)
            }.frame(minHeight: 44).accessibilityIdentifier("resend-verification")
            Button(store.text("確認状況を更新", "Check verification status")) {
                update(resend: false)
            }.frame(minHeight: 44).accessibilityIdentifier("check-verification")
            if let status {
                Text(status).foregroundStyle(store.palette.muted)
                    .accessibilityIdentifier("verification-status")
            }
            if let error { ErrorNotice(message: error) }
        }.disabled(pending)
    }

    private func update(resend: Bool) {
        guard !pending else { return }
        pending = true
        status = nil
        error = nil
        Task {
            defer { pending = false }
            do {
                switch try await store.updateEmailVerification(resend: resend) {
                case .verified:
                    break
                case .unverified:
                    status = store.text(
                        "メールはまだ確認されていません。受信箱をご確認ください。",
                        "Email is still unverified. Check your inbox."
                    )
                case .sent:
                    status = store.text("確認メールを送信しました。", "Verification email sent.")
                case .cooldown:
                    status = store.text("1分ほど待ってから再送してください。", "Wait a minute before requesting another email.")
                }
            } catch is CancellationError {
                return
            } catch {
                self.error = store.errorMessage(error)
            }
        }
    }
}

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var showingAccountSettings = false
    @State private var error: String?
    @State private var languagePending = false
    @State private var deleted = false

    var body: some View {
        NavigationStack {
            settings
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(isPresented: $showingAccountSettings) {
                    AccountSettingsView(onDeleted: { deleted = true })
                }
        }
        .onChange(of: store.user?.text("id")) { _, _ in
            showingAccountSettings = false
        }

    }

    private var settings: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Button {
                    store.tab = "profile"
                } label: {
                    Label(store.text("プロフィールに戻る", "Back to profile"), systemImage: "chevron.left")
                }.buttonStyle(OutlineButton())
                Text(store.text("設定", "Settings")).font(
                    .custom("DMSans-9ptRegular", size: 28, relativeTo: .title)
                ).bold().accessibilityAddTraits(.isHeader)
                if store.signedIn {
                    Button {
                        showingAccountSettings = true
                    } label: {
                        HStack(spacing: 12) {
                            Text(store.text("アカウント設定", "Account settings"))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(store.palette.accent)
                                .accessibilityHidden(true)
                        }
                    }.buttonStyle(OutlineButton()).accessibilityIdentifier("account-settings")
                } else if deleted {
                    Text(store.text("アカウントを削除しました。", "Your account was deleted."))
                        .fontWeight(.semibold).accessibilityIdentifier("account-deleted")
                }
                Surface {
                    VStack(alignment: .leading, spacing: 20) {
                        Text(store.text("アプリ設定", "App settings")).font(
                            .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                        ).fontWeight(.semibold)
                        Text(store.text("外観", "Appearance")).fontWeight(.semibold)
                        Text(
                            store.text(
                                "この端末の表示テーマを選べます。", "Choose the display theme for this device.")
                        ).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .body))
                            .foregroundStyle(store.palette.muted)
                        HStack(spacing: 10) {
                            themeOption("dark", title: store.text("ダーク", "Dark"), icon: "moon")
                            themeOption("light", title: store.text("ライト", "Light"), icon: "sun.max")
                        }
                        Text(store.text("文字の大きさ", "Text size")).fontWeight(.semibold)
                        Text(
                            store.text(
                                "読みやすい大きさを選べます。この端末に保存されます。",
                                "Choose a comfortable reading size. Saved on this device.")
                        ).font(.custom("DMSans-9ptRegular", size: 15, relativeTo: .subheadline))
                            .foregroundStyle(store.palette.muted)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 145))], spacing: 8) {
                            ForEach(0..<3) { size in
                                Button {
                                    store.readingSize = size
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(
                                            systemName: store.readingSize == size
                                                ? "largecircle.fill.circle" : "circle"
                                        ).foregroundStyle(
                                            store.readingSize == size
                                                ? store.palette.accent : store.palette.muted)
                                        Text(
                                            store.text(
                                                ["標準", "大きい", "さらに大きい"][size],
                                                ["Standard", "Large", "Larger"][size]))
                                        Spacer(minLength: 0)
                                    }.font(
                                        .custom("DMSans-9ptRegular", size: 14, relativeTo: .body)
                                    ).padding(.horizontal, 12).frame(
                                        maxWidth: .infinity, minHeight: 48
                                    )
                                    .background(
                                        store.palette.control, in: RoundedRectangle(cornerRadius: 8)
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8).stroke(
                                            store.readingSize == size
                                                ? store.palette.accent : store.palette.border))
                                }.buttonStyle(.plain).accessibilityIdentifier(
                                    "reading-size-\(size)"
                                ).accessibilityAddTraits(
                                    store.readingSize == size ? [.isSelected] : [])
                            }
                        }
                        Text(store.text("言語", "Language")).fontWeight(.semibold)
                        Picker(
                            "Language",
                            selection: Binding(
                                get: { store.language },
                                set: { language in
                                    guard !languagePending, language != store.language else {
                                        return
                                    }
                                    if !store.signedIn {
                                        store.language = language
                                        Task { await store.loadFeed() }
                                        return
                                    }
                                    languagePending = true
                                    let owner = store.api.token
                                    Task {
                                        defer { languagePending = false }
                                        do {
                                            _ = try await store.api.request(
                                                "/learning/preferences/language", method: "PATCH",
                                                body: ["language": language])
                                            guard owner == store.api.token else { return }
                                            store.language = language
                                            await store.loadFeed()
                                        } catch { self.error = store.errorMessage(error) }
                                    }
                                })
                        ) {
                            Text("日本語").tag("ja")
                            Text("English").tag("en")
                        }.pickerStyle(.segmented).disabled(languagePending)
                        if let error { ErrorNotice(message: error) }
                        if !store.signedIn {
                            Button(store.text("興味を変更", "Edit interests")) {
                                store.showingOnboarding = true
                            }.buttonStyle(OutlineButton())
                        }
                    }
                }
                LegalLinksView(showSupport: true)
            }.padding(.horizontal, 16).padding(.vertical, 28).frame(maxWidth: 760)
        }.frame(maxWidth: .infinity)
    }

    private func themeOption(_ value: String, title: String, icon: String) -> some View {
        Button {
            store.theme = value
        } label: {
            HStack(spacing: 8) {
                Image(systemName: store.theme == value ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(
                        store.theme == value ? store.palette.accent : store.palette.muted)
                Text(title)
                Spacer(minLength: 0)
            }.font(.custom("DMSans-9ptRegular", size: 14, relativeTo: .body)).padding(
                .horizontal, 12
            ).frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(store.palette.text).background(
                    store.palette.control, in: RoundedRectangle(cornerRadius: 10)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10).stroke(
                        store.theme == value ? store.palette.accent : store.palette.border))
        }.buttonStyle(.plain).accessibilityAddTraits(store.theme == value ? [.isSelected] : [])
            .accessibilityIdentifier("theme-" + value)
    }

}

private struct ProfileIdentity: View {
    @Environment(AppStore.self) private var store
    let user: [String: Any]

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: URL(string: user.text("avatarUrl"))) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Image(systemName: "person.crop.circle").resizable().scaledToFit()
                        .foregroundStyle(store.palette.muted)
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(Circle())
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                let name = user.text("name")
                let email = user.text("email")
                Text(name.isEmpty ? email : name).fontWeight(.semibold)
                if !name.isEmpty {
                    Text(email).foregroundStyle(store.palette.muted)
                }
                let username = user.text("username")
                if !username.isEmpty {
                    Text("@" + username).foregroundStyle(store.palette.muted)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct AccountSettingsView: View {
    @Environment(AppStore.self) private var store
    let onDeleted: () -> Void
    @State private var error: String?
    @State private var loggingOut = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var unblocking: String?

    var body: some View {
        ScrollView {
            if let user = store.user {
                VStack(alignment: .leading, spacing: 18) {
                    ProfileIdentity(user: user)
                    Button(store.text("興味を変更", "Edit interests")) {
                        store.showingOnboarding = true
                    }.buttonStyle(OutlineButton())
                    if user.text("username").isEmpty { UsernameSetup() }
                    Button(
                        loggingOut
                            ? store.text("ログアウト中…", "Signing out…")
                            : store.text("ログアウト", "Sign out")
                    ) {
                        loggingOut = true
                        Task {
                            defer { loggingOut = false }
                            do { try await store.logout() } catch {
                                self.error = store.errorMessage(error)
                            }
                        }
                    }.buttonStyle(OutlineButton()).disabled(loggingOut)
                        .accessibilityIdentifier("logout")
                    Button {
                        error = nil
                        confirmingDelete = true
                    } label: {
                        Text(
                            deleting
                                ? store.text("削除中…", "Deleting…")
                                : store.text("アカウントを削除", "Delete account"))
                    }.buttonStyle(OutlineButton()).foregroundStyle(store.palette.danger)
                        .disabled(deleting || loggingOut)
                        .accessibilityIdentifier("delete-account")
                    Text(
                        store.text(
                            "アカウントと学習の記録を完全に削除します。",
                            "Permanently deletes your account and learning data.")
                    ).font(.custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                        .foregroundStyle(store.palette.muted)
                    Surface {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(store.text("ブロックしたユーザー", "Blocked learners")).font(
                                .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                            ).fontWeight(.semibold)
                            Text(
                                store.text(
                                    "ブロックしたユーザーのコメントと投稿した問題は表示されません。",
                                    "Comments and questions from blocked learners are hidden from you."
                                )
                            ).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .body))
                                .foregroundStyle(store.palette.muted)
                            if store.blocked.isEmpty {
                                Text(
                                    store.text(
                                        "ブロックしているユーザーはいません。", "You haven’t blocked anyone.")
                                ).foregroundStyle(store.palette.muted).accessibilityIdentifier(
                                    "blocked-empty")
                            }
                            ForEach(store.blocked) { user in
                                HStack {
                                    Text(user.name).fontWeight(.semibold)
                                    Spacer()
                                    Button(store.text("ブロックを解除", "Unblock")) {
                                        unblock(user)
                                    }.buttonStyle(OutlineButton()).disabled(unblocking != nil)
                                        .accessibilityLabel(
                                            store.text(
                                                user.name + "のブロックを解除", "Unblock " + user.name)
                                        ).accessibilityIdentifier("unblock-" + user.id)
                                }
                            }
                        }
                    }
                    if let error { ErrorNotice(message: error) }
                }
                .padding(20)
                .frame(maxWidth: 760, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity)
        .background(store.palette.canvas)
        .navigationTitle(store.text("アカウント設定", "Account settings"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .alert(
            store.text("アカウントを削除しますか？", "Delete your account?"),
            isPresented: $confirmingDelete
        ) {
            Button(store.text("完全に削除", "Delete permanently"), role: .destructive) {
                deleteAccount()
            }
            Button(store.text("キャンセル", "Cancel"), role: .cancel) {}
        } message: {
            Text(
                store.text(
                    "アカウントと学習の記録（回答、XP、コメント、保存した問題、報告、ブロックなど）がすべて削除され、元に戻せません。あなたが投稿した問題は、名前を外した状態でコミュニティに残ります。",
                    "This permanently deletes your account and your learning data: answers, XP, comments, saved questions, reports and blocks. It cannot be undone. Questions you published stay in the community without your name."
                ))
        }
    }

    private func deleteAccount() {
        deleting = true
        error = nil
        Task {
            defer { deleting = false }
            do {
                try await store.deleteAccount()
                onDeleted()
            } catch {
                let expired = (error as? APIError)?.status == 401
                self.error =
                    expired
                    ? store.text(
                        "ログインの有効期限が切れました。もう一度ログインしてから削除してください。",
                        "Your session has expired. Sign in again to delete your account.")
                    : store.text(
                        "アカウントを削除できませんでした。接続を確認して、もう一度お試しください。",
                        "Could not delete your account. Check your connection and try again.")
            }
        }
    }
    private func unblock(_ user: BlockedUser) {
        unblocking = user.id
        Task {
            defer { unblocking = nil }
            do { try await store.unblock(user.id) } catch { self.error = store.errorMessage(error) }
        }
    }
}

struct RankingView: View {
    @Environment(AppStore.self) private var store
    @State private var data: [String: Any] = [:]
    @State private var loading = true
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(store.text("今週のランキング", "This week’s ranking")).font(
                    .custom("DMSans-9ptRegular", size: 28, relativeTo: .title)
                ).bold()
                Text(
                    store.text(
                        "理解を深めた分だけ、XPに。日本時間で毎週更新。",
                        "Earn XP by deepening your understanding. Updated weekly in Japan time.")
                ).foregroundStyle(store.palette.muted)
                if loading { ProgressView() }
                if let error {
                    ErrorNotice(message: error)
                    Button(store.text("再試行", "Retry")) { Task { await load() } }.buttonStyle(
                        OutlineButton())
                }
                ForEach(Array(data.objects("entries").enumerated()), id: \.offset) { _, entry in
                    HStack(spacing: 16) {
                        Text("\(entry.number("rank"))").font(
                            .custom("DMSans-9ptRegular", size: 20, relativeTo: .title3)
                        ).bold().foregroundStyle(store.palette.accent).frame(width: 30)
                        Image(systemName: "person.crop.circle").font(
                            .custom("DMSans-9ptRegular", size: 28, relativeTo: .title))
                        Text((entry["user"] as? [String: Any])?.text("displayName") ?? "")
                        Spacer()
                        Text("\(entry.number("xp")) XP").font(.custom("DMMono-Regular", size: 13))
                    }.padding(18).background(
                        store.palette.surface, in: RoundedRectangle(cornerRadius: 12)
                    )
                    .contentShape(Rectangle()).onTapGesture {
                        if let user = entry["user"] as? [String: Any] {
                            store.creator = CreatorLink(id: user.text("id"))
                        }
                    }
                    .accessibilityAddTraits(.isButton)
                }
                if !loading && error == nil && data.objects("entries").isEmpty {
                    Text(store.text("今週の学習を始めましょう。", "Start learning this week.")).foregroundStyle(
                        store.palette.muted)
                    Button(store.text("学習を始める", "Start learning")) { store.tab = "feed" }
                        .buttonStyle(PrimaryButton())
                }
            }.padding(.horizontal, 16).padding(.vertical, 28).frame(maxWidth: 760)
        }.frame(maxWidth: .infinity).task { await load() }
    }
    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do { data = try await store.api.request("/learning/leaderboard") } catch {
            self.error = store.errorMessage(error)
        }
    }
}

struct UsernameSetup: View {
    @Environment(AppStore.self) private var store
    @State private var name = ""
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField(store.text("ユーザー名", "Username"), text: $name).textInputAutocapitalization(
                .never
            ).autocorrectionDisabled().padding(12).background(
                store.palette.control, in: RoundedRectangle(cornerRadius: 8))
            Button(store.text("ユーザー名を保存", "Save username")) {
                Task {
                    do {
                        _ = try await store.api.request(
                            "/auth/me/username", method: "PATCH", body: ["username": name])
                        await store.restoreSession()
                    } catch { self.error = store.errorMessage(error) }
                }
            }.buttonStyle(OutlineButton()).disabled(name.count < 3)
            if let error { ErrorNotice(message: error) }
        }
    }
}
private struct AccountLearningView: View {
    @Environment(AppStore.self) private var store
    @State private var saved = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if store.guestImportFailed {
                ErrorNotice(
                    message: store.text(
                        "ゲストの回答を保存できませんでした。この端末に残っています。",
                        "We couldn’t save your guest answers. They’re still on this device."))
                Button(store.text("再試行", "Try again")) {
                    Task { await store.retryGuestAnswers() }
                }.buttonStyle(OutlineButton())
            }
            if store.guestImportSkipped > 0 {
                Text(
                    store.text(
                        "一部のゲスト回答は保存済みか、取り込めませんでした。",
                        "Some guest answers were already saved or couldn’t be imported.")
                )
                .foregroundStyle(store.palette.muted)
            }
            Surface {
                VStack(alignment: .leading, spacing: 16) {
                    Text(store.text("今日の目標", "Today’s goal")).font(
                        .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                    ).fontWeight(.semibold)
                    Text(store.text("問題に取り組む", "Work through questions"))
                    ProgressView(
                        value: Double(store.progress.number("dailyCompleted")),
                        total: Double(max(1, store.progress.number("dailyGoal")))
                    ).tint(store.palette.accent)
                    Text(
                        "\(store.progress.number("dailyCompleted")) / \(store.progress.number("dailyGoal"))"
                    ).accessibilityIdentifier("profile-daily-goal")
                    Text(store.text("日本時間で毎日更新されます。", "A new day starts at midnight in Japan."))
                        .foregroundStyle(store.palette.muted)
                    LazyVGrid(
                        columns: [GridItem(.flexible()), GridItem(.flexible())],
                        alignment: .leading, spacing: 20
                    ) {
                        stat(store.text("レベル", "Level"), "\(store.progress.number("level"))")
                        stat(
                            store.text("累計XP", "Total XP"), "\(store.progress.number("totalXp"))",
                            id: "profile-total-xp")
                        stat(store.text("連続日数", "Day streak"), "\(store.progress.number("streak"))")
                        stat(
                            store.text("最高コンボ", "Best combo"),
                            "×\(store.progress.number("bestCombo"))")
                        stat(
                            store.text("正解した問題", "Correct answers"),
                            "\(store.progress.number("correctTaps")) / \(store.progress.number("answeredTaps"))",
                            id: "profile-correct-answers"
                        )
                        stat(
                            store.text("説明で合格", "Explained"),
                            "\(store.progress.number("passedQuestions"))")
                    }
                    if let highlight = store.progress["weeklyHighlight"] as? [String: Any] {
                        let topic = highlight.text("topic")
                        let correct = highlight.number("correct")
                        Text(
                            store.text(
                                "今週は「\(topic)」で\(correct)問正解。成長しています！",
                                "This week you got \(correct) right in \(topic). You’re improving!"
                            )
                        ).foregroundStyle(store.palette.muted)
                    }
                }
            }
            MasteryView()
            Button(store.text("保存した問題", "Saved questions")) { saved = true }.buttonStyle(
                OutlineButton())
        }
        .sheet(isPresented: $saved) {
            NavigationStack {
                CollectionView(kind: "saved").background(store.palette.canvas).toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(store.text("閉じる", "Close")) { saved = false }
                    }
                }
            }
        }
    }

    private func stat(_ title: String, _ value: String, id: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                .foregroundStyle(store.palette.muted)
            Text(value).font(
                .custom("DMSans-9ptRegular", size: 22, relativeTo: .title2)
            ).bold().accessibilityIdentifier(id ?? title)
        }
    }
}

struct MasteryView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(store.text("分野ごとの理解度", "Mastery by area")).font(
                .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
            ).fontWeight(.semibold)
            MasteryRadar()
            ForEach(store.progress.objects("topics"), id: \.topicValue) { topic in
                HStack {
                    Text(topic.text("topic")).frame(width: 95, alignment: .leading)
                    ProgressView(value: topic["mastery"] as? Double ?? 0).tint(store.palette.accent)
                    Text("\(topic.number("correct"))/\(topic.number("answered"))").font(
                        .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                }
            }
            let badges = store.progress.objects("achievements")
            HStack {
                Text(store.text("実績", "Achievements")).font(
                    .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                ).fontWeight(.semibold)
                Text("\(badges.filter { $0["earned"] as? Bool == true }.count) / \(badges.count)")
                    .foregroundStyle(store.palette.muted)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140))]) {
                ForEach(badges, id: \.idValue) { badge in
                    HStack {
                        Image(systemName: "medal").foregroundStyle(
                            badge["earned"] as? Bool == true
                                ? store.palette.accent : store.palette.muted)
                        VStack(alignment: .leading) {
                            Text(badgeName(badge.text("id"))).font(
                                .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                            Text(
                                store.text(
                                    badge["earned"] as? Bool == true ? "獲得済み" : "挑戦中",
                                    badge["earned"] as? Bool == true ? "Earned" : "In progress")
                            ).font(.custom("DMSans-9ptRegular", size: 11, relativeTo: .caption2))
                                .foregroundStyle(store.palette.muted)
                        }
                    }.padding(12)
                }
            }
        }
    }
    private func badgeName(_ id: String) -> String {
        let names: [String: (String, String)] = [
            "first-correct-tap": ("はじめての正解", "First correct answer"),
            "first-pass": ("はじめての合格", "First understanding"),
            "combo-five": ("5連続正解", "Five in a row"), "combo-ten": ("10連続正解", "Ten in a row"),
            "ten-passes": ("10問を理解", "Ten questions understood"),
            "fifty-correct": ("50問正解", "Fifty correct answers"),
            "three-day-streak": ("3日連続で学習", "Three-day learner"),
            "seven-day-streak": ("7日連続で学習", "Seven-day learner"),
            "daily-solver": ("今日のバグを解決", "Bug of the Day solver"),
            "first-post": ("はじめての投稿", "First community question"),
        ]
        guard let name = names[id] else { return id }
        return store.text(name.0, name.1)
    }

}
extension Dictionary where Key == String, Value == Any { var topicValue: String { text("topic") } }

nonisolated struct RadarPolygon: Shape {
    let values: [Double]
    func path(in rect: CGRect) -> Path {
        guard values.count >= 3 else { return Path() }
        let radius = min(rect.width, rect.height) / 2
        let center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path()
        for (index, value) in values.enumerated() {
            let angle = Double(index) * 2 * .pi / Double(values.count) - .pi / 2
            let point = CGPoint(
                x: center.x + radius * max(0, min(1, value)) * cos(angle),
                y: center.y + radius * max(0, min(1, value)) * sin(angle))
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}
struct MasteryRadar: View {
    @Environment(AppStore.self) private var store
    private let areas = [
        ("frontend", "フロントエンド", "Frontend"), ("backend", "バックエンド", "Backend"),
        ("database", "データベース", "Database"), ("security", "セキュリティ", "Security"),
        ("networking", "ネットワーク", "Network"), ("cloud", "クラウド", "Cloud"),
    ]
    var body: some View {
        GeometryReader { geometry in
            let radius = min(geometry.size.width * 0.30, 80)
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            let values = areas.map { area in
                store.progress.objects("interests").first { $0.text("topic") == area.0 }?["mastery"]
                    as? Double ?? 0
            }
            ZStack {
                ForEach(1...4, id: \.self) { ring in
                    RadarPolygon(values: Array(repeating: Double(ring) / 4, count: 6)).stroke(
                        store.palette.border, lineWidth: 1)
                }
                RadarPolygon(values: values).fill(store.palette.accent.opacity(0.16))
                RadarPolygon(values: values).stroke(store.palette.accent, lineWidth: 2)
            }.frame(width: radius * 2, height: radius * 2).position(center)
            ForEach(Array(areas.enumerated()), id: \.offset) { index, area in
                let angle = Double(index) * 2 * .pi / 6 - .pi / 2
                Text(store.text(area.1, area.2)).font(
                    .custom("DMSans-9ptRegular", size: 11, relativeTo: .caption2)
                ).foregroundStyle(store.palette.muted)
                    .position(
                        x: center.x + (radius + 34) * cos(angle),
                        y: center.y + (radius + 25) * sin(angle))
            }
        }.frame(height: 240).accessibilityElement(children: .ignore)
            .accessibilityLabel(
                store.text(
                    "分野ごとの理解度。詳しい数値は下のリストで確認できます。", "Mastery by area. Details are listed below."))
    }
}

/// Privacy policy and terms (and optionally the support contact) when they are configured.
/// A short numbered "how it works" for tabs a guest cannot use yet, so they are not empty.
struct StepsList: View {
    @Environment(AppStore.self) private var store
    let items: [String]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: 10) {
                    Text("\(index + 1)").fontWeight(.bold).foregroundStyle(store.palette.accent)
                        .frame(width: 20, alignment: .leading)
                    Text(item).foregroundStyle(store.palette.muted)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
    }
}

/// "By continuing you agree to the Terms and Privacy Policy" with working links.
struct ConsentNotice: View {
    @Environment(AppStore.self) private var store
    let signup: Bool
    var body: some View {
        Text(message).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .footnote))
            .foregroundStyle(store.palette.muted).tint(store.palette.text)
            .frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("auth-consent")
    }
    private var message: AttributedString {
        func link(_ title: String, _ url: URL?) -> String {
            guard let url else { return title }
            return "[\(title)](\(url.absoluteString))"
        }
        let terms = link(store.text("利用規約", "Terms of Service"), SiteLinks.terms)
        let privacy = link(store.text("プライバシーポリシー", "Privacy Policy"), SiteLinks.privacy)
        let sentence =
            store.language == "ja"
            ? "\(terms)と\(privacy)に同意のうえ、\(signup ? "アカウントを作成します" : "続けます")。"
            : "By \(signup ? "creating an account" : "continuing"), you agree to the \(terms) and \(privacy)."
        return (try? AttributedString(markdown: sentence)) ?? AttributedString(sentence)
    }
}

struct LegalLinksView: View {
    @Environment(AppStore.self) private var store
    var showSupport = false
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 20) {
                if let privacy = SiteLinks.privacy {
                    Link(store.text("プライバシーポリシー", "Privacy policy"), destination: privacy)
                        .frame(minHeight: 44).accessibilityIdentifier("legal-privacy")
                }
                if let terms = SiteLinks.terms {
                    Link(store.text("利用規約", "Terms of service"), destination: terms)
                        .frame(minHeight: 44).accessibilityIdentifier("legal-terms")
                }
            }
            if showSupport, !SiteLinks.support.isEmpty {
                HStack(spacing: 4) {
                    Text(store.text("サポート: ", "Support: "))
                    if let url = SiteLinks.supportURL {
                        Link(SiteLinks.support, destination: url)
                    } else {
                        Text(SiteLinks.support)
                    }
                }.frame(minHeight: 44).accessibilityIdentifier("support-contact")
            }
        }.font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .footnote))
            .foregroundStyle(store.palette.muted).frame(maxWidth: .infinity, alignment: .leading)
    }
}
