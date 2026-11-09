import SwiftUI

struct CommentsView: View {
    @Environment(AppStore.self) private var store
    let question: Question
    @State private var comments: [[String: Any]] = []
    @State private var draft = ""
    @State private var loading = true
    @State private var pending = false
    @State private var error: String?
    @State private var kind = "comment"
    @State private var replyID: String?
    @State private var requestID = UUID().uuidString
    @State private var submittedDraft = ""
    @State private var reportTarget: CommentTarget?
    @State private var blockTarget: CommentTarget?
    @State private var notice: String?
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(question.title).font(
                        .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                    ).fontWeight(.semibold)
                    if loading { ProgressView() }
                    if let error {
                        ErrorNotice(message: error)
                        Button(store.text("再試行", "Retry")) { Task { await load() } }.buttonStyle(
                            OutlineButton())
                    }
                    if let notice {
                        Text(notice).foregroundStyle(store.palette.muted).accessibilityIdentifier(
                            "comment-notice")
                    }
                    ForEach(comments, id: \.idValue) { comment in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(
                                    (comment["author"] as? [String: Any])?.text("displayName") ?? ""
                                ).fontWeight(.semibold)
                                Spacer()
                                Text(comment.text("kind")).font(
                                    .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption)
                                ).foregroundStyle(store.palette.muted)
                            }
                            Text(
                                comment["deleted"] as? Bool == true
                                    ? store.text("削除されたコメント", "Comment deleted")
                                    : comment.text("text")
                            ).textSelection(.enabled)
                            if store.signedIn && comment["deleted"] as? Bool != true {
                                HStack(spacing: 20) {
                                    Button {
                                        mutate(comment, delete: false)
                                    } label: {
                                        Label(
                                            "\(comment.number("helpfulCount"))",
                                            systemImage: "hand.thumbsup")
                                    }.frame(minHeight: 44).accessibilityLabel(
                                        store.text("役に立った", "Helpful"))
                                    Button(store.text("返信", "Reply")) {
                                        replyID = comment.text("id")
                                    }.frame(minHeight: 44)
                                    if (comment["author"] as? [String: Any])?.text("id")
                                        == store.user?.text("id")
                                    {
                                        Button(role: .destructive) {
                                            mutate(comment, delete: true)
                                        } label: {
                                            Image(systemName: "trash")
                                        }.frame(minHeight: 44).accessibilityLabel(
                                            store.text("削除", "Delete"))
                                    } else if let target = commentTarget(comment) {
                                        Menu {
                                            Button {
                                                reportTarget = target
                                            } label: {
                                                Label(store.text("報告", "Report"), systemImage: "flag")
                                            }
                                            Button(role: .destructive) {
                                                blockTarget = target
                                            } label: {
                                                Label(
                                                    store.text("ユーザーをブロック", "Block user"),
                                                    systemImage: "hand.raised")
                                            }
                                        } label: {
                                            Image(systemName: "ellipsis").frame(
                                                minWidth: 44, minHeight: 44)
                                        }.accessibilityLabel(
                                            store.text("その他の操作", "More actions")
                                        ).accessibilityIdentifier("comment-more-" + target.commentID)
                                    }
                                }.font(.custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                            }
                        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(
                            store.palette.surface, in: RoundedRectangle(cornerRadius: 12))
                    }
                    if !loading && comments.isEmpty {
                        Text(store.text("まだコメントはありません。", "No comments yet.")).foregroundStyle(
                            store.palette.muted)
                    }
                }.padding(20)
            }
            VStack(spacing: 10) {
                if store.signedIn {
                    if replyID != nil {
                        Button(store.text("返信をキャンセル", "Cancel reply")) { replyID = nil }.frame(
                            minHeight: 44)
                    }
                    Picker(store.text("種類", "Kind"), selection: $kind) {
                        Text(store.text("コメント", "Comment")).tag("comment")
                        Text(store.text("説明", "Explanation")).tag("explanation")
                        Text(store.text("質問", "Question")).tag("question")
                        Text(store.text("修正", "Correction")).tag("correction")
                    }.pickerStyle(.segmented).disabled(pending)
                    HStack(alignment: .bottom) {
                        TextField(
                            store.text("コメントを書く", "Write a comment"), text: $draft, axis: .vertical
                        ).lineLimit(2...5).padding(12).background(
                            store.palette.control, in: RoundedRectangle(cornerRadius: 10)
                        ).accessibilityIdentifier("comment-input").disabled(pending)
                        Button {
                            send()
                        } label: {
                            Image(systemName: "arrow.up").frame(width: 48, height: 48).background(
                                store.palette.accent, in: RoundedRectangle(cornerRadius: 10)
                            ).foregroundStyle(store.palette.canvas)
                        }.disabled(
                            pending || draft.count > 5000
                                || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ).accessibilityLabel(store.text("送信", "Send"))
                    }
                } else {
                    Button(store.text("ログインしてコメント", "Sign in to comment")) {
                        store.showingLogin = true
                    }.buttonStyle(PrimaryButton())
                }
            }.padding(16).background(store.palette.canvas)
        }.navigationTitle(store.text("コメント", "Comments")).navigationBarTitleDisplayMode(.inline)
            .task { await load() }
            .sheet(item: $reportTarget) { target in
                NavigationStack {
                    CommentReportSheet(questionID: question.id, target: target) {
                        // The server hides a reported comment (and its replies) from the reporter.
                        comments.removeAll {
                            $0.text("id") == target.commentID || $0.text("parentId") == target.commentID
                        }
                        notice = store.text(
                            "報告を受け付けました。このコメントは非表示になりました。",
                            "Report received. This comment is now hidden for you.")
                    }
                }.environment(store).preferredColorScheme(store.theme == "light" ? .light : .dark)
            }
            .confirmationDialog(
                store.text("このユーザーをブロックしますか？", "Block this user?"),
                isPresented: Binding(
                    get: { blockTarget != nil }, set: { if !$0 { blockTarget = nil } }),
                titleVisibility: .visible, presenting: blockTarget
            ) { target in
                Button(store.text("ブロック", "Block"), role: .destructive) { block(target) }
                Button(store.text("キャンセル", "Cancel"), role: .cancel) {}
            } message: { target in
                Text(
                    store.text(
                        "\(target.author)さんのコメントと質問は表示されなくなります。設定の「アカウント設定」から解除できます。",
                        "Comments and questions from \(target.author) will be hidden. You can unblock them in Account settings."
                    ))
            }
    }
    private func commentTarget(_ comment: [String: Any]) -> CommentTarget? {
        guard let author = comment["author"] as? [String: Any], !author.text("id").isEmpty else {
            return nil
        }
        return CommentTarget(
            commentID: comment.text("id"), authorID: author.text("id"),
            author: author.text("displayName"))
    }
    private func block(_ target: CommentTarget) {
        Task {
            do {
                try await store.block(target.authorID, name: target.author)
                notice = store.text(
                    "\(target.author)さんをブロックしました。", "You blocked \(target.author).")
                await load()
            } catch { self.error = store.errorMessage(error) }
        }
    }
    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            comments = try await store.api.request("/learning/questions/\(question.id)/comments")
                .objects("comments")
        } catch { self.error = store.errorMessage(error) }
    }
    private func send() {
        guard !pending else { return }
        let snapshot = draft + "|" + kind + "|" + (replyID ?? "")
        if snapshot != submittedDraft {
            requestID = UUID().uuidString
            submittedDraft = snapshot
        }
        pending = true
        Task {
            defer { pending = false }
            do {
                var body: [String: Any] = [
                    "text": draft.trimmingCharacters(in: .whitespacesAndNewlines), "kind": kind,
                    "requestId": requestID,
                ]
                if let replyID { body["parentId"] = replyID }
                _ = try await store.api.request(
                    "/learning/questions/\(question.id)/comments", method: "POST", body: body)
                draft = ""
                replyID = nil
                requestID = UUID().uuidString
                await load()
            } catch { self.error = store.errorMessage(error) }
        }
    }
    private func mutate(_ comment: [String: Any], delete: Bool) {
        Task {
            do {
                let path = "/learning/questions/\(question.id)/comments/\(comment.text("id"))"
                _ = try await store.api.request(
                    path + (delete ? "" : "/helpful"), method: delete ? "DELETE" : "PUT",
                    body: delete ? nil : ["helpful": !(comment["helpful"] as? Bool ?? false)])
                await load()
            } catch { self.error = store.errorMessage(error) }
        }
    }
}

struct CommentTarget: Identifiable {
    let commentID: String
    let authorID: String
    let author: String
    var id: String { commentID }
}

/// Report one comment: the reason and optional details go to the moderators.
struct CommentReportSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let questionID: String
    let target: CommentTarget
    let onReported: () -> Void
    @State private var reason = "spam"
    @State private var details = ""
    @State private var pending = false
    @State private var error: String?
    private let reasons: [(String, String, String)] = [
        ("spam", "スパム・宣伝", "Spam or advertising"),
        ("harassment", "嫌がらせ・攻撃的", "Harassment or abuse"),
        ("inappropriate", "不適切な内容", "Inappropriate content"),
        ("other", "その他", "Something else"),
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(store.text("コメントを報告", "Report comment")).font(
                    .custom("DMSans-9ptRegular", size: 22, relativeTo: .title2)
                ).bold()
                ForEach(reasons, id: \.0) { item in
                    Button {
                        reason = item.0
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: reason == item.0 ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(
                                    reason == item.0 ? store.palette.accent : store.palette.muted)
                            Text(store.text(item.1, item.2))
                            Spacer(minLength: 0)
                        }.frame(minHeight: 44)
                    }.buttonStyle(.plain).accessibilityIdentifier("report-reason-" + item.0)
                        .accessibilityAddTraits(reason == item.0 ? [.isSelected] : [])
                }
                TextField(
                    store.text("詳細（任意）", "Details (optional)"), text: $details, axis: .vertical
                ).lineLimit(2...5).padding(12).background(
                    store.palette.control, in: RoundedRectangle(cornerRadius: 10)
                ).accessibilityIdentifier("report-details").disabled(pending)
                if let error { ErrorNotice(message: error) }
                Button {
                    send()
                } label: {
                    Text(
                        pending
                            ? store.text("送信中…", "Sending…") : store.text("報告を送信", "Send report"))
                }.buttonStyle(AccentButton()).disabled(pending || details.count > 1000)
                    .accessibilityIdentifier("report-submit")
            }.padding(24)
        }.background(store.palette.canvas).foregroundStyle(store.palette.text)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(store.text("閉じる", "Close")) { dismiss() }
                }
            }
    }
    private func send() {
        pending = true
        error = nil
        Task {
            defer { pending = false }
            do {
                _ = try await store.api.request(
                    "/learning/questions/\(questionID)/comments/\(target.commentID)/reports",
                    method: "POST",
                    body: [
                        "reason": reason,
                        "details": details.trimmingCharacters(in: .whitespacesAndNewlines),
                    ])
                onReported()
                dismiss()
            } catch { self.error = store.errorMessage(error) }
        }
    }
}

struct PublishView: View {
    @Environment(AppStore.self) private var store
    @State private var title = ""
    @State private var prompt = ""
    @State private var code = ""
    @State private var codeLanguage = ""
    @State private var topic = "general"
    @State private var options = ["", "", "", ""]
    @State private var correctOption = 0
    @State private var reference = ""
    @State private var difficulty = "beginner"
    @State private var pending = false
    @State private var error: String?
    @State private var published: Question?
    @State private var requestID = UUID().uuidString
    @State private var lastPayload: Data?
    @State private var draftOwner: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text(store.text("あなたの「なぜ」を共有しよう", "Share a question worth understanding")).font(
                    .custom("DMSans-9ptRegular", size: 28, relativeTo: .title)
                ).bold()
                Text(
                    store.text(
                        "気づきや疑問を、誰かの学びに。Geminiが質問と説明を確認してから公開します。",
                        "Turn something you’ve learned into someone else’s next discovery. Gemini reviews your question and explanation before publication."
                    )
                ).foregroundStyle(store.palette.muted)
                if !store.signedIn {
                    Button(store.text("ログインして質問を投稿", "Sign in to post a question")) {
                        store.showingLogin = true
                    }.buttonStyle(CompactPrimaryButton())
                } else if let published {
                    Label(store.text("公開しました", "Published"), systemImage: "checkmark.circle")
                        .foregroundStyle(store.palette.success)
                    Button(published.title) { store.selectedQuestion = published }.buttonStyle(
                        OutlineButton())
                    Button(store.text("別の問題を投稿", "Post another question")) {
                        self.published = nil
                        title = ""
                        prompt = ""
                        code = ""
                        reference = ""
                        requestID = UUID().uuidString
                    }.buttonStyle(PrimaryButton())
                } else {
                    Text(
                        store.text(
                            "編集中の内容は、アプリを開いている間、タブを切り替えても保持されます。",
                            "Your draft stays here when you change tabs while this app is open.")
                    ).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .caption))
                        .foregroundStyle(store.palette.muted)
                    entry(store.text("タイトル", "Title"), text: $title)
                    entry(store.text("質問", "Question"), text: $prompt, multiline: true)
                    Picker(store.text("分野", "Area"), selection: $topic) {
                        ForEach(
                            [
                                ("general", "共通知識", "General technology"),
                                ("frontend", "フロントエンド", "Frontend"),
                                ("backend", "バックエンド・API", "Backend & APIs"),
                                ("database", "データベース", "Databases"),
                                ("security", "セキュリティ", "Security"),
                                ("networking", "ネットワーク", "Networking"),
                                ("cloud", "クラウド・DevOps", "Cloud & DevOps"),
                            ], id: \.0
                        ) { area in Text(store.text(area.1, area.2)).tag(area.0) }
                    }
                    Picker(store.text("難易度", "Difficulty"), selection: $difficulty) {
                        Text(store.text("初級", "Beginner")).tag("beginner")
                        Text(store.text("中級", "Intermediate")).tag("intermediate")
                        Text(store.text("上級", "Advanced")).tag("advanced")
                    }.pickerStyle(.segmented)
                    DisclosureGroup(store.text("コードを追加（任意）", "Add code (optional)")) {
                        Text(
                            store.text(
                                "コードと言語はセットで入力してください。コードのない質問では、どちらも空欄で構いません。",
                                "Include both the code and its language. You can leave both empty for a conceptual question."
                            )
                        ).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .caption))
                            .foregroundStyle(store.palette.muted)
                        entry(store.text("コードの言語", "Code language"), text: $codeLanguage)
                        entry(store.text("コード", "Code"), text: $code, multiline: true)
                    }
                    entry(
                        store.text("お手本の説明", "Reference explanation"), text: $reference,
                        multiline: true)
                    Text(
                        store.text(
                            "正しい考え方と理由を書いてください。この説明をもとに理解度を確認します。",
                            "Explain the correct reasoning. This helps us assess learners’ understanding."
                        )
                    ).font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .caption))
                        .foregroundStyle(store.palette.muted)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(store.text("タップクイズ（おすすめ）", "Tap quiz (recommended)")).fontWeight(
                            .semibold)
                        VStack(alignment: .leading, spacing: 12) {
                            Text(
                                store.text(
                                    "選択肢を入力して、正解を選んでください。",
                                    "Enter choices and mark the correct answer.")
                            ).font(.subheadline)
                            ForEach(0..<4) { index in
                                HStack {
                                    Button {
                                        correctOption = index
                                    } label: {
                                        Image(
                                            systemName: correctOption == index
                                                ? "largecircle.fill.circle" : "circle"
                                        ).frame(width: 44, height: 44)
                                    }.accessibilityLabel(
                                        store.text("正解", "Correct option") + " \(index + 1)")
                                    TextField(
                                        store.text("選択肢", "Option") + " \(index + 1)",
                                        text: $options[index]
                                    ).padding(12).background(
                                        store.palette.control, in: RoundedRectangle(cornerRadius: 8)
                                    )
                                }
                            }
                        }.padding(.top, 12)
                    }
                    if let error { ErrorNotice(message: error) }
                    Button(
                        pending
                            ? store.text("質問を確認中…", "Reviewing your question…")
                            : store.text("質問を投稿", "Publish question")
                    ) { publish() }.buttonStyle(PrimaryButton()).disabled(pending)
                }
            }.padding(24).frame(maxWidth: 760).disabled(pending)
        }.frame(maxWidth: .infinity)
            .onAppear {
                draftOwner = store.user?.text("id")
                title = store.publishDraft["title"] ?? title
                prompt = store.publishDraft["prompt"] ?? prompt
                code = store.publishDraft["code"] ?? code
                codeLanguage = store.publishDraft["codeLanguage"] ?? codeLanguage
                topic = store.publishDraft["topic"] ?? topic
                reference = store.publishDraft["reference"] ?? reference
                difficulty = store.publishDraft["difficulty"] ?? difficulty
                correctOption = Int(store.publishDraft["correctOption"] ?? "") ?? 0
                if let data = store.publishDraft["options"]?.data(using: .utf8),
                    let saved = try? JSONSerialization.jsonObject(with: data) as? [String],
                    saved.count == 4
                {
                    options = saved
                }
                requestID = store.publishDraft["requestID"] ?? requestID
                lastPayload = store.publishDraft["payload"].flatMap { Data(base64Encoded: $0) }
            }
            .onDisappear {
                guard draftOwner == store.user?.text("id") else { return }
                let optionsJSON =
                    (try? JSONSerialization.data(withJSONObject: options)).flatMap {
                        String(data: $0, encoding: .utf8)
                    } ?? "[]"
                store.publishDraft = [
                    "title": title, "prompt": prompt, "code": code, "codeLanguage": codeLanguage,
                    "topic": topic, "reference": reference, "difficulty": difficulty,
                    "correctOption": String(correctOption), "options": optionsJSON,
                    "requestID": requestID, "payload": lastPayload?.base64EncodedString() ?? "",
                ]
            }
    }
    private func entry(_ label: String, text: Binding<String>, multiline: Bool = false) -> some View
    {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).fontWeight(.semibold)
            if multiline {
                TextEditor(text: text).frame(minHeight: 120).scrollContentBackground(.hidden)
                    .padding(10).background(
                        store.palette.control, in: RoundedRectangle(cornerRadius: 10)
                    ).accessibilityLabel(label)
            } else {
                TextField(label, text: text).padding(14).background(
                    store.palette.control, in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }
    private func publish() {
        guard !pending else { return }
        guard (3...160).contains(title.count), (10...3000).contains(prompt.count),
            (10...6000).contains(reference.count), code.count <= 8000, codeLanguage.count <= 60,
            !topic.isEmpty, code.isEmpty == codeLanguage.isEmpty
        else {
            error = store.text(
                "タイトルは3文字以上、質問と説明は10文字以上。コードには言語も指定してください。",
                "Use 3+ characters for the title, 10+ for the question and explanation, and a language for code."
            )
            return
        }
        var body: [String: Any] = [
            "title": title, "prompt": prompt, "referenceAnswer": reference, "topics": [topic],
            "difficulty": difficulty, "language": store.language,
        ]
        let quizOptions = options.enumerated().filter {
            !$0.element.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        if !quizOptions.isEmpty {
            guard quizOptions.count >= 2, quizOptions.allSatisfy({ $0.element.count <= 200 }),
                let correct = quizOptions.firstIndex(where: { $0.offset == correctOption })
            else {
                error = store.text(
                    "選択肢を2つ以上入力して、入力済みの正解を選んでください。",
                    "Enter at least two options and select a completed correct option.")
                return
            }
            body["format"] = "choice"
            body["options"] = quizOptions.map {
                $0.element.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            body["correctOption"] = correct
        }
        if !code.isEmpty {
            body["code"] = code
            body["codeLanguage"] = codeLanguage
        }
        let payload = try? JSONSerialization.data(withJSONObject: body, options: .sortedKeys)
        if payload != lastPayload {
            requestID = UUID().uuidString
            lastPayload = payload
        }
        body["requestId"] = requestID
        pending = true
        error = nil
        let owner = store.api.token
        Task {
            defer { pending = false }
            do {
                let result = try await store.api.request(
                    "/learning/questions", method: "POST", body: body)
                guard owner == store.api.token else { return }
                published = (result["question"] as? [String: Any]).flatMap(Question.init)
            } catch { self.error = store.errorMessage(error) }
        }
    }
}

struct CreatorLink: Identifiable { let id: String }
struct CreatorView: View {
    @Environment(AppStore.self) private var store
    let creator: CreatorLink
    @State private var profile: [String: Any] = [:]
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(
                    (profile["creator"] as? [String: Any])?.text("displayName")
                        ?? store.text("公開プロフィール", "Public profile")
                ).font(.custom("DMSans-9ptRegular", size: 28, relativeTo: .title)).bold()
                if let counts = profile["counts"] as? [String: Any] {
                    HStack {
                        Text("\(counts.number("questions")) " + store.text("問題", "questions"))
                        Text("\(counts.number("explanations")) " + store.text("説明", "explanations"))
                        Text("\(counts.number("helpful")) " + store.text("役に立った", "helpful"))
                    }.font(.custom("DMSans-9ptRegular", size: 12, relativeTo: .caption))
                        .foregroundStyle(store.palette.muted)
                }
                if let error { ErrorNotice(message: error) }
                ForEach(profile.objects("questions").compactMap(Question.init)) { question in
                    Button {
                        store.creator = nil
                        store.selectedQuestion = question
                    } label: {
                        Text(question.title).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16).background(
                                store.palette.surface, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.plain)
                }
                ForEach(profile.objects("explanations"), id: \.idValue) { explanation in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(explanation.text("questionTitle")).font(
                            .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                        ).fontWeight(.semibold)
                        Text(explanation.text("text"))
                    }.padding(16).background(
                        store.palette.surface, in: RoundedRectangle(cornerRadius: 12))
                }
            }.padding(24)
        }.background(store.palette.canvas).foregroundStyle(store.palette.text)
            .task {
                do {
                    profile = try await store.api.request("/learning/creators/" + creator.id)
                } catch { self.error = store.errorMessage(error) }
            }
    }
}
