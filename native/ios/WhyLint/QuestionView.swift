import SwiftUI

struct QuestionCard: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let question: Question
    var onNext: (() -> Void)? = nil
    @State private var tap: Tap?
    @State private var pending = false
    @State private var selected: Int?
    @State private var error: String?
    @State private var liked = false
    @State private var saved = false
    @State private var likes = 0
    @State private var sheet: QuestionSheet?
    enum QuestionSheet: String, Identifiable {
        case details, explain, ask, comments
        var id: String { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { geometry in
                ViewThatFits(in: .vertical) {
                    stage(promptSize: 20, codeSize: 16).frame(width: geometry.size.width).fixedSize(
                        horizontal: false, vertical: true)
                    stage(promptSize: 18, codeSize: 14).frame(width: geometry.size.width).fixedSize(
                        horizontal: false, vertical: true)
                    stage(promptSize: 16, codeSize: 12).frame(width: geometry.size.width).fixedSize(
                        horizontal: false, vertical: true)
                    stage(promptSize: 13, codeSize: 11).frame(width: geometry.size.width).fixedSize(
                        horizontal: false, vertical: true)
                    ScrollView { stage(promptSize: 13, codeSize: 11) }.scrollIndicators(.hidden)
                }.frame(
                    width: geometry.size.width, height: geometry.size.height, alignment: .topLeading
                )
            }
            HStack(spacing: 0) {
                socialButton(
                    "heart" + (liked ? ".fill" : ""), label: "\(likes)",
                    accessibility: store.text("いいね", "Like")
                ) { toggle("like") }
                socialButton(
                    "bubble", label: store.text("コメント", "Comments"),
                    accessibility: store.text("コメント", "Comments")
                ) { sheet = .comments }
                ShareLink(
                    item: URL(
                        string: "https://whylint-8715935974.asia-northeast1.run.app/questions/"
                            + question.id)!
                ) {
                    HStack(spacing: 5) {
                        Image("web-share").renderingMode(.template).resizable().frame(
                            width: 20, height: 20)
                        Text(store.text("共有", "Share"))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                socialButton(
                    saved ? "bookmark.fill" : "bookmark",
                    label: store.text(saved ? "保存済み" : "保存", saved ? "Saved" : "Save"),
                    accessibility: store.text("保存", "Save")
                ) { toggle("save") }
            }.font(.custom("DMSans-9ptRegular", size: 12, relativeTo: .body)).foregroundStyle(
                store.palette.muted)
            HStack(spacing: 8) {
                Button {
                    if store.signedIn { sheet = .explain } else { store.promptSignIn("explain") }
                } label: {
                    HStack {
                        Image("web-pencil").renderingMode(.template).resizable().frame(
                            width: 20, height: 20
                        ).foregroundStyle(store.palette.accent)
                        Text(store.text("なぜ？", "Explain why"))
                    }.frame(maxWidth: .infinity)
                }.buttonStyle(OutlineButton()).overlay(
                    RoundedRectangle(cornerRadius: 10).stroke(store.palette.accent.opacity(0.7))
                ).accessibilityIdentifier("explain-open")
                if tap != nil {
                    Button {
                        if store.signedIn { sheet = .ask } else { store.promptSignIn("ask") }
                    } label: {
                        HStack(spacing: 5) {
                            Image("web-comment").renderingMode(.template).resizable().frame(
                                width: 18, height: 18)
                            Text(store.text("質問する", "Ask Gemini"))
                        }
                    }.buttonStyle(OutlineButton()).accessibilityLabel(
                        store.text("質問する", "Ask Gemini"))
                }
                Button(store.text("詳細", "Details")) { sheet = .details }.buttonStyle(
                    OutlineButton())
            }.font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .body)).fontWeight(.semibold)
        }
        .padding(9).background {
            RoundedRectangle(cornerRadius: 16).fill(store.palette.surface).shadow(
                color: store.palette.light ? Color(hex: 0x131811).opacity(0.16) : .clear,
                radius: 12, y: 5)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 16).stroke(
                store.palette.accent.opacity(0.9), lineWidth: store.palette.light ? 1.5 : 1)
        )
        .onAppear {
            tap = question.tap
            liked = question.liked
            saved = question.saved
            likes = question.likes
        }
        .sheet(item: $sheet) { item in
            NavigationStack {
                Group {
                    switch item {
                    case .comments: CommentsView(question: question)
                    case .explain: ExplanationView(question: question, asking: false)
                    case .ask: ExplanationView(question: question, asking: true)
                    case .details: QuestionDetails(question: question, answer: tap)
                    }
                }.background(store.palette.canvas).foregroundStyle(store.palette.text)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(store.text("閉じる", "Close")) { sheet = nil }
                        }
                    }
            }.environment(store).preferredColorScheme(store.theme == "light" ? .light : .dark)
        }
    }
    private func stage(promptSize: CGFloat, codeSize: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(question.prompt).font(
                .custom("DMSans-9ptRegular", size: promptSize, relativeTo: .headline)
            ).fontWeight(.bold)
                .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
            if let code = question.code {
                if question.format == "spot_bug", tap == nil {
                    // The lines are the answers, so say so: nothing else on the card is tappable
                    // before the answer.
                    Label(
                        store.text("バグのある行をタップ", "Tap the buggy line"), systemImage: "hand.tap"
                    ).font(.custom("DMSans-9ptRegular", size: 14, relativeTo: .subheadline))
                        .fontWeight(.semibold).foregroundStyle(store.palette.accent)
                        .accessibilityIdentifier("spot-bug-hint")
                }
                codeView(code, fontSize: codeSize)
            }
            if question.format != "spot_bug" {
                ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                    choice(index, title: option, fontSize: max(13, promptSize - 3))
                }
            }
            answerOutcome(correct: tap?.correct ?? false)
                .opacity(tap == nil ? 0 : 1)
                .animation(reveal, value: tap)
                .allowsHitTesting(tap != nil)
                .accessibilityHidden(tap == nil)
            if let error {
                ErrorNotice(message: error)
                if let selected {
                    Button(store.text("回答を再試行", "Retry answer")) { answer(selected) }.buttonStyle(
                        OutlineButton())
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func answerOutcome(correct: Bool) -> some View {
        let color = correct ? store.palette.success : store.palette.danger
        let result = ZStack(alignment: .leading) {
            outcomeLabel(correct: false).hidden()
            outcomeLabel(correct: true).hidden()
            outcomeLabel(correct: correct)
        }.foregroundStyle(color).fixedSize(horizontal: true, vertical: false)

        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                result
                Spacer(minLength: 0)
                feedbackAction
                nextAction
            }
            VStack(alignment: .leading, spacing: 8) {
                result
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        feedbackAction
                        Spacer(minLength: 0)
                        nextAction
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        feedbackAction
                        nextAction
                    }
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }

    private func outcomeLabel(correct: Bool) -> some View {
        Label(
            store.text(correct ? "正解！" : "おしい！", correct ? "Correct!" : "Not quite"),
            systemImage: correct ? "checkmark.circle" : "xmark.circle"
        )
        .font(.custom("DMSans-9ptRegular", size: 14, relativeTo: .body))
        .fontWeight(.bold)
    }

    private var feedbackAction: some View {
        Button {
            sheet = .details
        } label: {
            Text(store.text("解説を読む", "Read feedback"))
                .font(.custom("DMSans-9ptRegular", size: 13, relativeTo: .body))
                .fontWeight(.semibold)
                .fixedSize(horizontal: true, vertical: false)
        }
        .buttonStyle(AccentOutlineButton())
        .background(store.palette.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder private var nextAction: some View {
        if let onNext {
            Button(action: onNext) {
                HStack(spacing: 5) {
                    Text(store.text("次へ", "Next"))
                    Image(systemName: "arrow.down")
                }.fixedSize(horizontal: true, vertical: false)
            }.buttonStyle(NextButton())
        }
    }

    private func socialButton(
        _ icon: String, label: String, accessibility: String, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(
                    icon.hasPrefix("heart")
                        ? (liked ? "web-like-filled" : "web-like")
                        : icon.hasPrefix("bookmark")
                            ? (saved ? "web-save-filled" : "web-save") : "web-comment"
                ).renderingMode(.template).resizable().frame(width: 20, height: 20)
                Text(label).lineLimit(1).minimumScaleFactor(0.8)
            }.frame(maxWidth: .infinity, minHeight: 44)
        }.accessibilityLabel(accessibility)
    }
    private func codeView(_ code: String, fontSize: CGFloat) -> some View {
        ScrollView(.horizontal) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(code.components(separatedBy: "\n").enumerated()), id: \.offset) {
                    index, line in
                    let option = question.options.firstIndex(of: String(index + 1))
                    let mark = mark(option)
                    let row = HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)").foregroundStyle(store.palette.muted).frame(
                            width: 22, alignment: .trailing)
                        Text(highlight(line))
                        Spacer(minLength: 0)
                    }.font(.custom("DMMono-Regular", size: fontSize, relativeTo: .body))
                        .padding(.horizontal, 12).frame(
                            minHeight: question.format == "spot_bug" && option != nil ? 44 : 22,
                            alignment: .leading
                        )
                        .background(markTint(mark))
                        .overlay(alignment: .leading) {
                            if question.format == "spot_bug", option != nil, tap == nil {
                                Rectangle().fill(store.palette.accent.opacity(0.55)).frame(width: 3)
                            }
                        }
                        // The glyph keeps the result readable without color. It sits in the row's
                        // leading padding, so code does not shift when it appears.
                        .overlay(alignment: .leading) {
                            if let symbol = markSymbol(mark) {
                                Image(systemName: symbol)
                                    .font(.system(size: 10, weight: .heavy))
                                    .foregroundStyle(markColor(mark))
                                    .frame(width: 12)
                                    .accessibilityHidden(true)
                            }
                        }
                        .animation(reveal, value: tap)
                    if question.format == "spot_bug", let option {
                        Button {
                            answer(option)
                        } label: {
                            row
                        }.disabled(pending || tap != nil)
                            .accessibilityLabel(
                                store.text("\(index + 1)行目: ", "Line \(index + 1): ") + line
                            )
                            .accessibilityValue(markDescription(option) ?? "")
                            .accessibilityIdentifier("answer-\(option)")
                    } else {
                        row
                    }
                }
            }.padding(.vertical, 6).frame(minWidth: 300, alignment: .leading)
        }.background(store.palette.code, in: RoundedRectangle(cornerRadius: 12)).fixedSize(
            horizontal: false, vertical: true)
    }
    private func highlight(_ line: String) -> AttributedString {
        var result = AttributedString(line)
        result.foregroundColor = store.palette.text
        for pattern in [
            "\\b(const|let|var|function|return|if|else|SELECT|FROM|WHERE|WHER|import|class|def|true|false|null)\\b",
            "\"[^\"]*\"|'[^']*'",
        ] {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            for match in regex.matches(in: line, range: NSRange(line.startIndex..., in: line)) {
                if let range = Range(match.range, in: line),
                    let a = AttributedString.Index(range.lowerBound, within: result),
                    let b = AttributedString.Index(range.upperBound, within: result)
                {
                    result[a..<b].foregroundColor =
                        pattern.hasPrefix("\\b")
                        ? Color(hex: store.theme == "light" ? 0x6d328e : 0xd7b9f4)
                        : Color(hex: store.theme == "light" ? 0x416813 : 0xc5dd9a)
                }
            }
        }
        return result
    }
    private func choice(_ index: Int, title: String, fontSize: CGFloat) -> some View {
        let mark = mark(index)
        return Button {
            answer(index)
        } label: {
            HStack(spacing: 12) {
                Group {
                    if question.format == "true_false" {
                        Image(systemName: index == 0 ? "circle" : "xmark")
                    } else {
                        Text(String(UnicodeScalar(65 + index)!))
                    }
                }.font(.custom("DMMono-Regular", size: 13)).foregroundStyle(store.palette.accent)
                Text(title).font(.custom("DMSans-9ptRegular", size: fontSize, relativeTo: .body))
                    .frame(maxWidth: .infinity, alignment: .leading)
                // Fixed slot so the text does not re-wrap when the result arrives.
                ZStack {
                    if pending && selected == index {
                        ProgressView()
                    } else if let symbol = markSymbol(mark, filled: true) {
                        Image(systemName: symbol).foregroundStyle(markColor(mark))
                            .accessibilityHidden(true)
                    }
                }.frame(width: 20, height: 20)
            }.padding(12).frame(minHeight: 48).background {
                ZStack {
                    RoundedRectangle(cornerRadius: 10).fill(store.palette.control)
                    RoundedRectangle(cornerRadius: 10).fill(markTint(mark))
                }
            }
            .overlay(
                RoundedRectangle(cornerRadius: 10).stroke(
                    mark == .unmarked ? store.palette.border : markColor(mark),
                    lineWidth: mark == .unmarked ? 1 : 2)
            )
            .animation(reveal, value: tap)
        }.buttonStyle(.plain).disabled(pending || tap != nil)
            .accessibilityValue(markDescription(index) ?? "")
            .accessibilityIdentifier("answer-\(index)")
    }

    private enum AnswerMark { case unmarked, correct, wrong }

    /// The correct option is marked; so is the learner's own pick when it was wrong.
    /// `tap.choice` comes back from the server, so this also holds for restored answers.
    private func mark(_ option: Int?) -> AnswerMark {
        guard let tap, let option else { return .unmarked }
        if option == tap.correctOption { return .correct }
        if option == tap.choice { return .wrong }
        return .unmarked
    }
    private func markColor(_ mark: AnswerMark) -> Color {
        mark == .wrong ? store.palette.danger : store.palette.success
    }
    private func markTint(_ mark: AnswerMark) -> Color {
        mark == .unmarked ? .clear : markColor(mark).opacity(mark == .wrong ? 0.16 : 0.18)
    }
    private func markSymbol(_ mark: AnswerMark, filled: Bool = false) -> String? {
        switch mark {
        case .unmarked: nil
        case .correct: filled ? "checkmark.circle.fill" : "checkmark"
        case .wrong: filled ? "xmark.circle.fill" : "xmark"
        }
    }
    private func markDescription(_ option: Int?) -> String? {
        guard let tap, let option else { return nil }
        if option == tap.correctOption {
            return tap.choice == option
                ? store.text("あなたの回答・正解", "Your answer, correct")
                : store.text("正解", "Correct answer")
        }
        return option == tap.choice ? store.text("あなたの回答・不正解", "Your answer, incorrect") : nil
    }
    private var reveal: Animation? { reduceMotion ? nil : .easeOut(duration: 0.18) }

    private func answer(_ index: Int) {
        guard !pending, tap == nil else { return }
        selected = index
        pending = true
        error = nil
        let haptic = UINotificationFeedbackGenerator()
        haptic.prepare()
        Task {
            defer { pending = false }
            do {
                let result = try await store.tap(question, choice: index)
                tap = result
                haptic.notificationOccurred(result.correct ? .success : .error)
                AccessibilityNotification.Announcement(
                    store.text(
                        result.correct ? "正解！" : "おしい！", result.correct ? "Correct!" : "Not quite")
                ).post()
            } catch { self.error = store.errorMessage(error) }
        }
    }
    private func toggle(_ action: String) {
        guard store.signedIn else {
            store.promptSignIn(action == "save" ? "save" : "like")
            return
        }
        Task {
            do {
                let key = action == "like" ? "liked" : "saved"
                let value = action == "like" ? !liked : !saved
                let response = try await store.api.request(
                    "/learning/questions/\(question.id)/\(action)", method: "PUT",
                    body: [key: value])
                if action == "like" {
                    liked = response["liked"] as? Bool ?? value
                    likes = response.number("likes")
                } else {
                    saved = response["saved"] as? Bool ?? value
                }
            } catch { self.error = store.errorMessage(error) }
        }
    }
}

struct QuestionDetails: View {
    @Environment(AppStore.self) private var store
    let question: Question
    var answer: Tap? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var reason = "incorrect"
    @State private var details = ""
    @State private var notice: String?
    @State private var confirmingBlock = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let answer { Text(answer.explanation).textSelection(.enabled) }
                Text(question.title).font(
                    .custom("DMSans-9ptRegular", size: 22, relativeTo: .title2)
                ).bold()
                Text(question.topics.joined(separator: " · ")).foregroundStyle(store.palette.accent)
                Text(question.authorName + " · " + question.difficulty).foregroundStyle(
                    store.palette.muted)
                ForEach(question.references, id: \.url) { reference in
                    Link(reference.title, destination: reference.url).frame(minHeight: 44)
                }
                if store.signedIn {
                    Divider()
                    Text(store.text("問題を報告", "Report question")).font(
                        .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                    ).fontWeight(.semibold)
                    Picker(store.text("理由", "Reason"), selection: $reason) {
                        Text(store.text("誤りがある", "Incorrect")).tag("incorrect")
                        Text(store.text("わかりにくい", "Unclear")).tag("unclear")
                        Text(store.text("情報が古い", "Outdated")).tag("outdated")
                        Text(store.text("不適切・攻撃的", "Offensive or inappropriate")).tag(
                            "inappropriate")
                    }.pickerStyle(.menu).accessibilityIdentifier("question-report-reason")
                    TextField(
                        store.text("詳細（任意）", "Details (optional)"), text: $details, axis: .vertical
                    ).textFieldStyle(.roundedBorder)
                    Button(store.text("報告を送信", "Send report")) {
                        Task {
                            do {
                                _ = try await store.api.request(
                                    "/learning/questions/\(question.id)/reports", method: "POST",
                                    body: ["reason": reason, "details": details])
                                notice = store.text("報告を受け付けました。", "Report received.")
                            } catch { notice = store.errorMessage(error) }
                        }
                    }.buttonStyle(OutlineButton())
                    if let notice { Text(notice) }
                    if question.source == "community", let authorID = question.authorID,
                        authorID != store.user?.text("id"),
                        !store.blocked.contains(where: { $0.id == authorID })
                    {
                        Button(
                            store.text(
                                question.authorName + "をブロック", "Block " + question.authorName)
                        ) { confirmingBlock = true }.buttonStyle(OutlineButton())
                            .accessibilityIdentifier("block-author")
                            .confirmationDialog(
                                store.text("このユーザーをブロックしますか？", "Block this user?"),
                                isPresented: $confirmingBlock, titleVisibility: .visible
                            ) {
                                Button(store.text("ブロック", "Block"), role: .destructive) {
                                    Task {
                                        do {
                                            try await store.block(
                                                authorID, name: question.authorName)
                                            dismiss()
                                        } catch { notice = store.errorMessage(error) }
                                    }
                                }
                                Button(store.text("キャンセル", "Cancel"), role: .cancel) {}
                            } message: {
                                Text(
                                    store.text(
                                        "\(question.authorName)さんのコメントと質問は表示されなくなります。設定の「アカウント設定」から解除できます。",
                                        "Comments and questions from \(question.authorName) will be hidden. You can unblock them in Account settings."
                                    ))
                            }
                    }
                }
            }.padding(24)
        }.navigationTitle(store.text("問題の詳細", "Question details")).navigationBarTitleDisplayMode(
            .inline)
    }
}

struct ExplanationView: View {
    @Environment(AppStore.self) private var store
    let question: Question
    let asking: Bool
    @State private var answer = ""
    @State private var result: [String: Any]?
    @State private var pending = false
    @State private var error: String?
    @State private var requestID = UUID().uuidString
    @State private var submittedAnswer = ""
    @State private var sharedText = ""
    @State private var publicationMessage: String?
    @State private var publishing = false
    @State private var publicationID = UUID().uuidString
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(question.prompt).font(
                    .custom("DMSans-9ptRegular", size: 17, relativeTo: .headline)
                ).fontWeight(.semibold)
                Text(
                    store.text(
                        asking ? "まだモヤモヤ？Geminiに質問しましょう。" : "自分の言葉で、なぜそうなるか説明しましょう。",
                        asking ? "Still confused? Ask Gemini." : "Explain why in your own words.")
                ).foregroundStyle(store.palette.muted)
                TextEditor(text: $answer).frame(minHeight: 160).padding(10).scrollContentBackground(
                    .hidden
                )
                .background(store.palette.control, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel(store.text("説明", "Explanation")).disabled(pending)
                Text("\(answer.count) / \(asking ? 500 : 6000)").font(
                    .custom("DMSans-9ptRegular", size: 12, relativeTo: .caption)
                ).foregroundStyle(
                    answer.count > (asking ? 500 : 6000)
                        ? store.palette.danger : store.palette.muted)
                if let error { ErrorNotice(message: error) }
                Button {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    if submittedAnswer != answer {
                        requestID = UUID().uuidString
                        submittedAnswer = answer
                    }
                    pending = true
                    error = nil
                    let owner = store.api.token
                    Task {
                        defer { pending = false }
                        do {
                            let response = try await store.api.request(
                                "/learning/questions/\(question.id)/"
                                    + (asking ? "follow-ups" : "attempts"), method: "POST",
                                body: [
                                    "requestId": requestID,
                                    asking ? "question" : "answer": answer.trimmingCharacters(
                                        in: .whitespacesAndNewlines),
                                ])
                            guard owner == store.api.token else { return }
                            result = response
                            if !asking { sharedText = answer }
                            if !asking {
                                store.progress =
                                    (try? await store.api.request("/learning/progress"))
                                    ?? store.progress
                            }
                        } catch { self.error = store.errorMessage(error) }
                    }
                } label: {
                    Text(
                        pending
                            ? store.text("確認しています…", "Working…")
                            : store.text(
                                asking ? "質問する" : "理解度をチェック",
                                asking ? "Ask Gemini" : "Check understanding"))
                }
                .buttonStyle(PrimaryButton()).disabled(
                    pending || answer.count > (asking ? 500 : 6000)
                        || answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let result {
                    if !asking {
                        Text("\(result.number("score")) / 10").font(
                            .custom("DMSans-9ptRegular", size: 34, relativeTo: .largeTitle)
                        ).bold().foregroundStyle(store.palette.accent)
                    }
                    Text(result.text(asking ? "answer" : "feedback")).textSelection(.enabled)
                    ForEach(result["improvements"] as? [String] ?? [], id: \.self) {
                        Text("• " + $0)
                    }
                    if !asking {
                        Text(result.text("explanation")).textSelection(.enabled)
                        Text(
                            store.text(
                                "回答とAIフィードバックはあなたにだけ表示されます。共有する説明を編集して公開できます。",
                                "Your answer and AI feedback are private. Edit the explanation you want to share before publishing."
                            )
                        ).font(.custom("DMSans-9ptRegular", size: 15, relativeTo: .subheadline))
                            .foregroundStyle(store.palette.muted)
                        TextEditor(text: $sharedText).frame(minHeight: 120).scrollContentBackground(
                            .hidden
                        ).padding(10).background(
                            store.palette.control, in: RoundedRectangle(cornerRadius: 10)
                        ).disabled(publishing).accessibilityLabel(
                            store.text("公開する説明", "Explanation to publish"))
                        Button(
                            publishing
                                ? store.text("公開中…", "Publishing…")
                                : store.text("説明を公開", "Publish explanation")
                        ) {
                            UIApplication.shared.sendAction(
                                #selector(UIResponder.resignFirstResponder), to: nil, from: nil,
                                for: nil)
                            publishing = true
                            let owner = store.api.token
                            Task {
                                defer { publishing = false }
                                do {
                                    _ = try await store.api.request(
                                        "/learning/questions/\(question.id)/comments",
                                        method: "POST",
                                        body: [
                                            "text": sharedText, "kind": "explanation",
                                            "requestId": publicationID,
                                        ])
                                    guard owner == store.api.token else { return }
                                    publicationMessage = store.text(
                                        "説明を公開しました。", "Explanation published.")
                                } catch { publicationMessage = store.errorMessage(error) }
                            }
                        }.buttonStyle(OutlineButton()).disabled(
                            publishing || sharedText.isEmpty || sharedText.count > 5000)
                        if let publicationMessage { Text(publicationMessage) }
                    }
                }
            }.padding(24)
        }.navigationTitle(
            store.text(asking ? "質問する" : "なぜ？を説明する", asking ? "Ask Gemini" : "Explain why")
        )
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: sharedText) { _, _ in
            publicationID = UUID().uuidString
            publicationMessage = nil
        }
        .onChange(of: answer) { _, _ in
            if result != nil {
                result = nil
                requestID = UUID().uuidString
            }
        }
    }
}
