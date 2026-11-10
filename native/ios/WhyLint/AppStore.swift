import Observation
import SwiftUI

/// Privacy policy, terms and support contact. The owner publishes the documents; the app only
/// links to them, so each value comes from a build setting and is left out when it is not set.
enum SiteLinks {
    private static func setting(_ key: String) -> String {
        let value = (Bundle.main.object(forInfoDictionaryKey: key) as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return value.contains("$(") ? "" : value
    }
    static var base: URL? {
        guard let url = URL(string: setting("WhyLintLegalURL")), url.scheme == "https",
            url.user == nil, url.host?.isEmpty == false
        else { return nil }
        return url
    }
    static var privacy: URL? { base?.appendingPathComponent("privacy") }
    static var terms: URL? { base?.appendingPathComponent("terms") }
    static var support: String { setting("WhyLintSupportContact") }
    static var supportURL: URL? {
        let contact = support
        if contact.range(of: "^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$", options: .regularExpression)
            != nil
        {
            return URL(string: "mailto:" + contact)
        }
        if let url = URL(string: contact), url.scheme == "https" { return url }
        return nil
    }
}

struct BlockedUser: Identifiable, Hashable {
    let id: String
    let name: String
}

@Observable @MainActor final class AppStore {
    let api = API()
    private var applyingLocationLanguage = false
    private var localeLookupAttempted = false
    var language: String {
        didSet {
            if !applyingLocationLanguage { UserDefaults.standard.set(language, forKey: "language") }
        }
    }
    /// Why the sign-in screen is showing, so it can say what signing in unlocks.
    var loginReason: String?
    func promptSignIn(_ reason: String) {
        loginReason = reason
        showingLogin = true
    }
    private var applyingSystemTheme = false
    var hasThemePreference = UserDefaults.standard.string(forKey: "theme") != nil
    var theme: String {
        didSet {
            if !applyingSystemTheme {
                hasThemePreference = true
                UserDefaults.standard.set(theme, forKey: "theme")
            }
        }
    }
    func followSystemTheme(_ scheme: ColorScheme) {
        guard !hasThemePreference else { return }
        applyingSystemTheme = true
        theme = scheme == .light ? "light" : "dark"
        applyingSystemTheme = false
    }
    var readingSize: Int {
        didSet { UserDefaults.standard.set(readingSize, forKey: "readingSize") }
    }
    var didOnboard: Bool { didSet { UserDefaults.standard.set(didOnboard, forKey: "didOnboard") } }
    var user: [String: Any]?
    var sessionUnavailable = false
    var questions: [Question] = []
    var progress: [String: Any] = [:]
    var preferences: [String: Any] = [:]
    var catalog: [String: Any] = [:]
    var dailyID: String?
    var dailySolved = 0
    var guestAnswered = 0
    var guestCorrect = 0
    var loading = false
    var generating = false
    var message: String?
    var tab = "feed"
    var showingLogin = false
    var showingOnboarding = false
    var creator: CreatorLink?
    var publishDraft: [String: String] = [:]
    var blocked: [BlockedUser] = []
    var selectedQuestion: Question?
    private var generationVersion = 0
    private var pendingBatchID: String?

    init() {
        language =
            UserDefaults.standard.string(forKey: "language")
            ?? UserDefaults.standard.string(forKey: "locationLanguage")
            ?? (Locale.preferredLanguages.first?.lowercased().hasPrefix("ja") == true ? "ja" : "en")
        theme =
            UserDefaults.standard.string(forKey: "theme")
            ?? (UITraitCollection.current.userInterfaceStyle == .light ? "light" : "dark")
        readingSize = UserDefaults.standard.integer(forKey: "readingSize")
        didOnboard = UserDefaults.standard.bool(forKey: "didOnboard")
        #if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--ui-testing") { didOnboard = true }
            // A test that signs up as a brand-new guest starts without choices left by another.
            if arguments.contains("--reset-guest") {
                UserDefaults.standard.removeObject(forKey: "guestPreferences")
                UserDefaults.standard.removeObject(forKey: "guestAnswers")
                UserDefaults.standard.removeObject(forKey: "guestAnswerQueue")
            }
            if let i = arguments.firstIndex(of: "--tab"), arguments.indices.contains(i + 1) {
                tab = arguments[i + 1]
            }
            if let i = arguments.firstIndex(of: "--theme"), arguments.indices.contains(i + 1) {
                theme = arguments[i + 1]
            }
            // In memory only (init does not fire didSet), so a test never leaks its language.
            if let i = arguments.firstIndex(of: "--language"), arguments.indices.contains(i + 1),
                ["ja", "en"].contains(arguments[i + 1])
            {
                language = arguments[i + 1]
            }
            if let i = arguments.firstIndex(of: "--reading-size"),
                arguments.indices.contains(i + 1), let size = Int(arguments[i + 1]),
                (0...2).contains(size)
            {
                readingSize = size
            }
        #endif
        api.onUnauthorized = { [weak self] in
            guard let self else { return }
            self.clearSession()
            Task { await self.loadFeed() }
        }
    }
    var signedIn: Bool { user != nil }
    var palette: Palette { Palette(light: theme == "light") }
    func text(_ ja: String, _ en: String) -> String { language == "ja" ? ja : en }
    /// What signing in unlocks, shown on the sign-in screen when it was opened by a locked action.
    func loginReasonText(_ key: String?) -> String? {
        switch key {
        case "explain":
            return text(
                "ログインすると、あなたの説明をGeminiが採点し、+15 XPを獲得できます。",
                "Sign in to get your explanation graded by Gemini and earn +15 XP.")
        case "ask":
            return text("ログインすると、Geminiに質問できます。", "Sign in to ask Gemini a follow-up question.")
        case "save":
            return text(
                "ログインすると、問題を保存して、プロフィールからいつでも見返せます。",
                "Sign in to save this question and find it again in your Profile.")
        case "like": return text("ログインすると、問題にいいねできます。", "Sign in to like questions.")
        case "comment":
            return text("ログインすると、コメントできます。", "Sign in to join the discussion.")
        case "report":
            return text("ログインすると、問題を報告できます。", "Sign in to report a problem.")
        case "practice":
            return text(
                "ログインすると、間違えた問題を毎朝復習できます。",
                "Sign in to review the questions you missed every morning.")
        case "post":
            return text("ログインすると、あなたの問題を投稿できます。", "Sign in to post a question of your own.")
        case "progress":
            return text(
                "ログインすると、進捗・XP・連続記録をすべての端末で保存できます。",
                "Sign in to keep your progress, XP and streak on every device.")
        default: return nil
        }
    }
    func errorMessage(_ error: Error) -> String {
        let providerError = error as NSError
        if providerError.domain == "com.google.GIDSignIn" && providerError.code == -5 {
            return text("Googleログインがキャンセルされました。", "Google sign-in was cancelled.")
        }
        if let error = error as? APIError {
            switch error.status {
            case 401:
                return text("ログイン情報を確認して、もう一度お試しください。", "Check your sign-in details and try again.")
            case 409:
                return text("このメールアドレスまたはユーザー名は使用できません。", "This email or username is unavailable.")
            case 429: return text("少し待ってから、もう一度お試しください。", "Please wait a moment and try again.")
            default: break
            }
            if error.code == "GOOGLE_CONFIGURATION" {
                return text(
                    "Googleログインは現在利用できません。メールアドレスまたはユーザー名でログインしてください。",
                    "Google sign-in is currently unavailable. Sign in with your email or username.")
            }
            if error.code == "MOBILE_SIGN_IN_UNAVAILABLE" {
                return text(
                    "アプリでのログインは現在利用できません。時間をおいてお試しください。",
                    "App sign-in is currently unavailable. Please try again later.")
            }
            if error.status == 404, error.code != "MOBILE_SIGN_IN_UNAVAILABLE" {
                return text(
                    "見つかりませんでした。すでに削除または非表示になっている可能性があります。",
                    "Not found. It may have been removed or hidden.")
            }
            if error.code == "AI_NOT_CONFIGURED" {
                return text(
                    "AI学習の準備中です。厳選問題で続けましょう。",
                    "AI learning is being connected. Continue with curated questions.")
            }
            if error.code == "SESSION_STORAGE" {
                return text("ログイン情報を安全に保存できませんでした。", "Could not securely save your session.")
            }
        }
        return text(
            "接続を確認して、もう一度お試しください。入力はそのままです。",
            "Check your connection and try again. Your input is still here.")
    }
    func start() async {
        await restoreSession()
        await resolveDefaultLanguage()
        await loadFeed()
        if !didOnboard { showingOnboarding = true }
        #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--screen-login") { showingLogin = true }
            if ProcessInfo.processInfo.arguments.contains("--screen-onboarding") {
                showingOnboarding = true
            }
        #endif
    }
    private func resolveDefaultLanguage() async {
        let defaults = UserDefaults.standard
        guard !localeLookupAttempted, api.token == nil,
            defaults.string(forKey: "language") == nil,
            defaults.string(forKey: "locationLanguage") == nil
        else { return }
        #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing") { return }
        #endif
        localeLookupAttempted = true
        guard let response = try? await api.request("/config/locale", timeout: 1.2),
            let detected = response["defaultLanguage"] as? String,
            ["ja", "en"].contains(detected),
            api.token == nil, defaults.string(forKey: "language") == nil
        else { return }
        defaults.set(detected, forKey: "locationLanguage")
        applyingLocationLanguage = true
        language = detected
        applyingLocationLanguage = false
    }
    func restoreSession() async {
        guard let sessionToken = api.token else {
            clearSession()
            return
        }
        do {
            let restoredUser = try await api.request("/auth/me")
            guard api.token == sessionToken else { return }
            if user?["id"] as? String != restoredUser["id"] as? String {
                guestImportFailed = false
                guestImportSkipped = 0
            }
            user = restoredUser
            sessionUnavailable = false
            let importedProgress = await importGuestAnswers()
            guard api.token == sessionToken else { return }
            let result = try await api.request("/learning/preferences")
            guard api.token == sessionToken else { return }
            preferences = result["preferences"] as? [String: Any] ?? [:]
            if let lang = preferences["language"] as? String { language = lang }
            if !importedProgress {
                let restoredProgress = try await api.request("/learning/progress")
                guard api.token == sessionToken else { return }
                progress = restoredProgress
            }
            await loadBlocked()
        } catch {
            if api.token == nil { user = nil } else { sessionUnavailable = true }
        }
    }
    func signIn(identifier: String, password: String, email: String?, username: String?)
        async throws
    {
        let payload: [String: Any]
        let route: String
        if let email, let username {
            payload = ["email": email, "username": username, "password": password]
            route = "/auth/mobile/signup"
        } else {
            payload = ["identifier": identifier, "password": password]
            route = "/auth/mobile/password/login"
        }
        let result = try await api.request(route, method: "POST", body: payload)
        guard let token = result["token"] as? String, !token.isEmpty else {
            throw APIError(status: 0, code: "SESSION_MISSING")
        }
        try api.accept(token: token)
        try await finishSignIn()
    }
    /// Everything that follows a successful password or Google sign-in.
    func finishSignIn() async throws {
        let guestChoices = guestPreferences()
        await restoreSession()
        guard signedIn else { throw APIError(status: 0, code: "SESSION_UNAVAILABLE") }
        showingLogin = false
        // What a guest picked in onboarding becomes the new account's choices, so they are not
        // asked again; the account's own choices win when it already has them.
        if preferences.isEmpty, !guestChoices.isEmpty,
            let saved = try? await api.request(
                "/learning/preferences", method: "PUT", body: guestChoices)
        {
            preferences = saved["preferences"] as? [String: Any] ?? guestChoices
        }
        if preferences.isEmpty { showingOnboarding = true }
        await loadFeed()
    }
    private struct GuestAnswer: Codable {
        let questionId: String
        let choice: Int

        var payload: [String: Any] { ["questionId": questionId, "choice": choice] }
    }

    private struct GuestBatch: Codable {
        let requestId: String
        let answers: [GuestAnswer]
    }

    private struct GuestQueue: Codable {
        var answers: [GuestAnswer] = []
        var pending: [String: GuestBatch] = [:]
    }

    private func guestQueue() -> GuestQueue {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: "guestAnswerQueue"),
            let saved = try? JSONDecoder().decode(GuestQueue.self, from: data)
        {
            return saved
        }
        let legacy = defaults.array(forKey: "guestAnswers") as? [[String: Any]] ?? []
        return GuestQueue(
            answers: legacy.compactMap { answer in
                guard let id = answer["questionId"] as? String,
                    let choice = answer["choice"] as? Int
                else { return nil }
                return GuestAnswer(questionId: id, choice: choice)
            })
    }

    private func saveGuestQueue(_ queue: GuestQueue) throws {
        let defaults = UserDefaults.standard
        defaults.set(try JSONEncoder().encode(queue), forKey: "guestAnswerQueue")
        defaults.removeObject(forKey: "guestAnswers")
    }

    private func rememberGuestAnswer(_ questionID: String, choice: Int) {
        var queue = guestQueue()
        queue.answers = Array(
            (queue.answers + [GuestAnswer(questionId: questionID, choice: choice)]).suffix(200))
        try? saveGuestQueue(queue)
    }

    private(set) var guestImportFailed = false
    private(set) var guestImportSkipped = 0
    private var guestImports: Set<String> = []

    func retryGuestAnswers() async {
        _ = await importGuestAnswers()
    }

    private func importGuestAnswers() async -> Bool {
        guard let accountID = user?["id"] as? String, let token = api.token,
            guestImports.insert(accountID).inserted
        else { return false }
        defer { guestImports.remove(accountID) }
        var updated = false
        do {
            while api.token == token && user?["id"] as? String == accountID {
                var queue = guestQueue()
                if queue.pending[accountID] == nil && !queue.answers.isEmpty {
                    queue.pending[accountID] = GuestBatch(
                        requestId: UUID().uuidString.lowercased(), answers: queue.answers)
                    queue.answers = []
                    try saveGuestQueue(queue)
                }
                guard let batch = queue.pending[accountID] else { break }
                let response = try await api.request(
                    "/learning/guest-answers", method: "POST",
                    body: [
                        "accountId": accountID, "requestId": batch.requestId,
                        "answers": batch.answers.map(\.payload),
                    ], timeout: 30)
                guard api.token == token && user?["id"] as? String == accountID else { break }
                guard let imported = response["imported"] as? Int,
                    let skipped = response["skipped"] as? Int,
                    (0...batch.answers.count).contains(imported),
                    skipped == batch.answers.count - imported,
                    let refreshed = response["progress"] as? [String: Any],
                    refreshed["answeredTaps"] is Int, refreshed["totalXp"] is Int
                else { throw APIError(status: 0, code: "GUEST_IMPORT_RECEIPT") }
                queue = guestQueue()
                guard queue.pending[accountID]?.requestId == batch.requestId else { break }
                queue.pending.removeValue(forKey: accountID)
                try saveGuestQueue(queue)
                progress = refreshed
                guestImportSkipped += skipped
                guestImportFailed = false
                updated = true
            }
        } catch {
            if api.token == token && user?["id"] as? String == accountID {
                guestImportFailed = true
            }
        }
        return updated
    }
    private func clearSession() {
        user = nil
        guestImportFailed = false
        guestImportSkipped = 0
        progress = [:]
        preferences = guestPreferences()
        publishDraft = [:]
        blocked = []
        selectedQuestion = nil
        creator = nil
        generationVersion += 1
        pendingBatchID = nil
        questions = []
        loading = false
        sessionUnavailable = false
    }
    func logout() async throws {
        // Revoke on the server when it is reachable, but never keep the token on this device
        // because that request failed. An unrevoked session still expires on its own.
        _ = try? await api.request("/auth/logout", method: "POST")
        try api.accept(token: nil)
        clearSession()
        await loadFeed()
    }
    /// Permanently deletes the account. The device forgets the session only after the server
    /// confirms with 204; on any failure the account and the session stay as they were.
    func deleteAccount() async throws {
        _ = try await api.request("/auth/me", method: "DELETE")
        try api.accept(token: nil)
        clearSession()
        await loadFeed()
    }
    func loadBlocked() async {
        guard signedIn else {
            blocked = []
            return
        }
        let owner = api.token
        guard let result = try? await api.request("/learning/blocks"), owner == api.token else {
            return
        }
        blocked = result.objects("users").map {
            BlockedUser(id: $0.text("id"), name: $0.text("displayName"))
        }
    }
    /// Blocks a learner; their questions leave this device's lists at once and the server hides
    /// their comments and questions from now on.
    func block(_ id: String, name: String) async throws {
        let owner = api.token
        _ = try await api.request("/learning/blocks/\(id)", method: "PUT")
        guard owner == api.token else { throw CancellationError() }
        if !blocked.contains(where: { $0.id == id }) {
            blocked.insert(BlockedUser(id: id, name: name), at: 0)
        }
        questions.removeAll { $0.authorID == id }
        if selectedQuestion?.authorID == id { selectedQuestion = nil }
    }
    func unblock(_ id: String) async throws {
        let owner = api.token
        _ = try await api.request("/learning/blocks/\(id)", method: "DELETE")
        guard owner == api.token else { throw CancellationError() }
        blocked.removeAll { $0.id == id }
        await loadFeed()
    }
    private func isVisible(_ question: Question) -> Bool {
        guard let author = question.authorID else { return true }
        return !blocked.contains { $0.id == author }
    }
    func loadFeed() async {
        loading = true
        message = nil
        pendingBatchID = nil
        generationVersion += 1
        let version = generationVersion
        defer { if version == generationVersion { loading = false } }
        do {
            var query = URLComponents()
            query.queryItems = [URLQueryItem(name: "language", value: language)]
            let topics =
                (preferences["interests"] as? [String] ?? [])
                + (preferences["technologies"] as? [String] ?? [])
            if !topics.isEmpty {
                query.queryItems?.append(
                    URLQueryItem(name: "topics", value: topics.joined(separator: ",")))
            }
            if let difficulty = preferences["difficulty"] as? String {
                query.queryItems?.append(URLQueryItem(name: "difficulty", value: difficulty))
            }
            let pool = try await api.request(
                "/learning/feed/pool?" + (query.percentEncodedQuery ?? ""))
            guard version == generationVersion else { return }
            questions = (pool.objects("reviewQuestions") + pool.objects("questions")).compactMap(
                Question.init
            ).filter(isVisible)
            dailyID = nil
            dailySolved = 0
            let daily = try? await api.request("/learning/daily?language=" + language)
            guard version == generationVersion else { return }
            if let object = daily?["question"] as? [String: Any], let question = Question(object) {
                dailyID = question.id
                dailySolved = daily?.number("solved") ?? 0
                questions.removeAll { $0.id == question.id }
                questions.insert(question, at: 0)
            }
            if signedIn && !preferences.isEmpty { await loadMore() }
        } catch {
            if version == generationVersion { message = errorMessage(error) }
        }
    }
    func loadMore() async {
        guard signedIn, !generating, !preferences.isEmpty else { return }
        generating = true
        let version = generationVersion
        let requestID = pendingBatchID ?? UUID().uuidString
        pendingBatchID = requestID
        defer { generating = false }
        do {
            let batch = try await api.request(
                "/learning/feed/batches", method: "POST",
                body: [
                    "requestId": requestID, "language": language,
                    "excludeQuestionIds": Array(questions.map(\.id).suffix(100)),
                ])
            guard version == generationVersion else { return }
            pendingBatchID = nil
            var added = batch.objects("questions") + batch.objects("reviewQuestions")
            if let community = batch["communityQuestion"] as? [String: Any] {
                added.append(community)
            }
            for q in added.compactMap(Question.init)
            where isVisible(q) && !questions.contains(where: { $0.id == q.id }) {
                questions.append(q)
            }
            if questions.count > 100 { questions.removeFirst(questions.count - 100) }
        } catch { if version == generationVersion { message = errorMessage(error) } }
    }
    func tap(_ question: Question, choice: Int) async throws -> Tap {
        let owner = api.token
        let result = try await api.request(
            "/learning/questions/\(question.id)/taps", method: "POST", body: ["choice": choice])
        guard api.token == owner else { throw CancellationError() }
        let tap = Tap(result)
        if let i = questions.firstIndex(where: { $0.id == question.id }) { questions[i].tap = tap }
        if let stats = result["progress"] as? [String: Any] { progress = stats }
        if !signedIn {
            guestAnswered += 1
            if tap.correct { guestCorrect += 1 }
            rememberGuestAnswer(question.id, choice: choice)
        }
        return tap
    }
    func savePreferences(_ payload: [String: Any]) async throws {
        let owner = api.token
        if signedIn {
            let result = try await api.request(
                "/learning/preferences", method: "PUT", body: payload)
            guard owner == api.token else { throw CancellationError() }
            preferences = result["preferences"] as? [String: Any] ?? payload
        } else {
            preferences = payload
            UserDefaults.standard.set(
                try JSONSerialization.data(withJSONObject: payload), forKey: "guestPreferences")
        }
        language = payload["language"] as? String ?? language
        didOnboard = true
        showingOnboarding = false
        await loadFeed()
    }
    func loadCatalog() async {
        do { catalog = try await api.request("/learning/catalog") } catch {
            message = errorMessage(error)
        }
    }
    private func guestPreferences() -> [String: Any] {
        guard let data = UserDefaults.standard.data(forKey: "guestPreferences") else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }

}
