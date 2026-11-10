import XCTest

@MainActor private func signOutIfNeeded(in app: XCUIApplication) {
    if app.buttons["public-profile"].waitForExistence(timeout: 3) {
        app.buttons["open-settings"].tap()
        app.buttons["account-settings"].tap()
        app.buttons["logout"].tap()
        app.buttons["tab-profile"].tap()
    }
}

final class WhyLintUITests: XCTestCase {
    @MainActor private func launch(_ tab: String = "feed", readingSize: String = "0") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--tab", "profile", "--theme", "dark", "--reading-size", readingSize,
            "--language", "ja",
        ]
        app.launchEnvironment["WHYLINT_API_URL"] = "http://127.0.0.1:3130"
        app.launch()
        signOutIfNeeded(in: app)
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        app.buttons["tab-" + tab].tap()
        return app
    }

    @MainActor private func revealOnCard(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 where !element.isHittable {
            guard let scroll = app.scrollViews.matching(identifier: "question-card-scroll")
                .allElementsBoundByIndex.first(where: { $0.isHittable })
            else { break }
            scroll.swipeUp(velocity: .slow)
        }
    }
    @MainActor func testFeedAndSettingsAppearance() {
        let app = launch()
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 20))
        app.buttons["tab-profile"].tap()
        XCTAssertFalse(app.buttons["theme-light"].exists)
        app.buttons["open-settings"].tap()
        XCTAssertTrue(app.buttons["theme-light"].waitForExistence(timeout: 5))
        app.buttons["theme-light"].tap()
        app.buttons["theme-dark"].tap()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "ios-profile-settings-dark"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
    @MainActor func testLandscapeFeedHasReachableControls() {
        let app = launch()
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 20))
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        Thread.sleep(forTimeInterval: 2)  // Let OS rotation settle before hit-testing.
        XCTAssertTrue(app.buttons["tab-profile"].isHittable)
        let explain = app.buttons["explain-open"].firstMatch
        XCTAssertTrue(explain.waitForExistence(timeout: 10))
        revealOnCard(explain, in: app)
        XCTAssertTrue(explain.isHittable)
        Thread.sleep(forTimeInterval: 2)  // Let the OS rotation finish before capturing pixels.
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "ios-feed-landscape"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
    @MainActor func testLargeReadingSizeKeepsInlineQuestionActionsReachable() {
        let app = launch(readingSize: "2")
        XCTAssertTrue(app.staticTexts["question-format"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["question-metadata"].firstMatch.exists)
        let explain = app.buttons["explain-open"].firstMatch
        revealOnCard(explain, in: app)
        XCTAssertTrue(explain.isHittable)
        let reference = app.staticTexts["question-further-reading"].firstMatch
        revealOnCard(reference, in: app)
        XCTAssertTrue(reference.isHittable)
        let report = app.buttons["report-question-open"].firstMatch
        revealOnCard(report, in: app)
        XCTAssertTrue(report.isHittable)
        report.tap()
        XCTAssertTrue(app.staticTexts["ログインすると、問題を報告できます。"].waitForExistence(timeout: 5))
    }
    @MainActor func testLanguageSettingAndEnglishLayouts() {
        let app = launch("profile")
        app.buttons["open-settings"].tap()
        let english = app.buttons["English"]
        for _ in 0..<4 {
            if english.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(english.exists)
        english.tap()
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["tab-profile"].label, "Profile")
        app.swipeDown()
        let settings = XCTAttachment(screenshot: app.screenshot())
        settings.name = "ios-settings-english"
        settings.lifetime = .keepAlways
        add(settings)
        app.buttons["tab-feed"].tap()
        let answer = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'answer-'"))
            .firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 15))
        let feed = XCTAttachment(screenshot: app.screenshot())
        feed.name = "ios-feed-english"
        feed.lifetime = .keepAlways
        add(feed)
        app.buttons["tab-profile"].tap()
        app.buttons["open-settings"].tap()
        let japanese = app.buttons["日本語"]
        for _ in 0..<4 {
            if japanese.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(japanese.exists)
        japanese.tap()
        XCTAssertEqual(app.buttons["tab-profile"].label, "プロフィール")
    }
    @MainActor func testFinalCardVisualStates() {
        let app = launch()
        let candidates = app.buttons.matching(identifier: "answer-2")
        XCTAssertTrue(candidates.firstMatch.waitForExistence(timeout: 15))
        let answer =
            candidates.allElementsBoundByIndex.first(where: { $0.isHittable })
            ?? candidates.firstMatch
        func capture(_ name: String) {
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        capture("ios-final-feed-before")
        answer.tap()
        XCTAssertTrue(app.buttons["解説を読む"].firstMatch.waitForExistence(timeout: 10))
        capture("ios-final-feed-answered")
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        Thread.sleep(forTimeInterval: 2)
        XCTAssertTrue(app.buttons["tab-profile"].isHittable)
        capture("ios-final-feed-landscape")
    }
    @MainActor func testLargerTextAppliesAcrossSettings() {
        let app = launch("profile")
        let heading = app.staticTexts["profile-heading"]
        XCTAssertTrue(heading.waitForExistence(timeout: 5))
        let initialHeight = heading.frame.height
        app.buttons["open-settings"].tap()
        let larger = app.buttons["reading-size-2"]
        for _ in 0..<5 {
            if larger.isHittable { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(larger.isHittable)
        larger.tap()
        XCTAssertTrue(app.buttons["tab-profile"].isHittable)
        app.buttons["tab-profile"].tap()
        for _ in 0..<5 {
            if heading.isHittable { break }
            app.scrollViews.firstMatch.swipeDown()
        }
        XCTAssertTrue(heading.isHittable)
        XCTAssertGreaterThan(
            heading.frame.height, initialHeight * 1.1,
            "The app preference must enlarge general Profile text, not only lesson cards.")
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "ios-settings-larger"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        // Reset with launch arguments after the grid relayout.
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["profile-heading"].waitForExistence(timeout: 10))
        XCTAssertLessThanOrEqual(app.staticTexts["profile-heading"].frame.height, initialHeight + 1)
    }
    @MainActor func testGuestQuizAndLoginValidation() {
        let app = launch()
        let answer = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'answer-'"))
            .firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 20))
        answer.tap()
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format:
                        "label CONTAINS '正解' OR label CONTAINS 'おしい' OR label CONTAINS 'Correct' OR label CONTAINS 'Not quite'"
                )
            ).firstMatch.waitForExistence(timeout: 10))
        // The learner's own answer is exposed to VoiceOver, not only drawn in color.
        let own = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'answer-' AND value CONTAINS 'あなたの回答'")
        ).firstMatch
        XCTAssertTrue(own.waitForExistence(timeout: 5))
        app.buttons["login-topbar"].tap()
        XCTAssertTrue(app.buttons["auth-submit"].waitForExistence(timeout: 5))
        app.buttons["auth-submit"].tap()
        // Each missing field is named, not reported as a password-length problem.
        XCTAssertTrue(app.staticTexts["メールアドレスまたはユーザー名を入力してください。"].exists)
        // The sign-in screen says what the locked action unlocks.
        XCTAssertTrue(app.staticTexts["auth-reason"].exists)
    }
}

final class WhyLintAccountUITests: XCTestCase {
    @MainActor func testGuestChoicesAndProgressCarryIntoANewAccount() async throws {
        try await checkGuestProgress(signup: true)
    }

    @MainActor func testGuestProgressCarriesIntoAnExistingAccount() async throws {
        try await checkGuestProgress(signup: false)
    }

    @MainActor private func checkGuestProgress(signup: Bool) async throws {
        let base = "http://127.0.0.1:3130/api/v1/learning"
        let dailyURL = try XCTUnwrap(URL(string: base + "/daily?language=ja"))
        let (dailyData, _) = try await URLSession.shared.data(from: dailyURL)
        let daily = try XCTUnwrap(JSONSerialization.jsonObject(with: dailyData) as? [String: Any])
        let question = try XCTUnwrap(daily["question"] as? [String: Any])
        let questionID = try XCTUnwrap(question["id"] as? String)
        var grade = URLRequest(
            url: try XCTUnwrap(URL(string: base + "/questions/" + questionID + "/taps")))
        grade.httpMethod = "POST"
        grade.setValue("application/json", forHTTPHeaderField: "Content-Type")
        grade.httpBody = Data("{\"choice\":0}".utf8)
        let (gradeData, _) = try await URLSession.shared.data(for: grade)
        let graded = try XCTUnwrap(JSONSerialization.jsonObject(with: gradeData) as? [String: Any])
        let choice = try XCTUnwrap(graded["correctOption"] as? Int)
        let unique = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10))
            .lowercased()
        let email = "ios-carry-\(unique)@example.test"
        let username = "carry_\(unique)"
        let password = "FixtureOnly-Password-7130"
        if !signup {
            var create = URLRequest(
                url: try XCTUnwrap(URL(string: "http://127.0.0.1:3130/api/v1/auth/mobile/signup")))
            create.httpMethod = "POST"
            create.setValue("application/json", forHTTPHeaderField: "Content-Type")
            create.httpBody = try JSONEncoder().encode([
                "email": email, "username": username, "password": password,
            ])
            let (_, response) = try await URLSession.shared.data(for: create)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 201)
        }

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--tab", "profile", "--theme", "dark", "--language", "ja",
            "--reset-guest", "--screen-onboarding",
        ]
        app.launchEnvironment["WHYLINT_API_URL"] = "http://127.0.0.1:3130"
        app.launch()
        signOutIfNeeded(in: app)
        // As a guest, pick an area and start learning.
        let next = app.buttons["次へ"]
        XCTAssertTrue(next.waitForExistence(timeout: 20))
        let interest = app.buttons.matching(
            NSPredicate(
                format:
                    "label CONTAINS 'フロント' OR label CONTAINS 'Frontend' OR label CONTAINS 'バック'")
        ).firstMatch
        XCTAssertTrue(interest.waitForExistence(timeout: 5))
        interest.tap()
        next.tap()
        let start = app.buttons["学習を始める"]
        for _ in 0..<5 {
            if start.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        app.buttons["tab-feed"].tap()
        let answers = app.buttons.matching(identifier: "answer-\(choice)")
        XCTAssertTrue(answers.firstMatch.waitForExistence(timeout: 15))
        let answer = answers.allElementsBoundByIndex.first { $0.isHittable } ?? answers.firstMatch
        answer.tap()
        XCTAssertTrue(app.staticTexts["正解！"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 15))
        app.buttons["login-topbar"].tap()
        if signup {
            app.buttons["auth-switch"].tap()
            app.textFields["auth-email"].tap()
            app.textFields["auth-email"].typeText(email)
            app.textFields["auth-username"].tap()
            app.textFields["auth-username"].typeText(username)
        } else {
            app.textFields["auth-identifier"].tap()
            app.textFields["auth-identifier"].typeText(email)
        }
        app.secureTextFields["auth-password"].tap()
        app.secureTextFields["auth-password"].typeText(password)
        app.buttons["auth-submit"].tap()
        XCTAssertTrue(app.buttons["auth-submit"].waitForNonExistence(timeout: 20))
        app.buttons["tab-profile"].tap()
        XCTAssertTrue(app.buttons["public-profile"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["次へ"].exists)
        let dailyGoal = app.staticTexts["profile-daily-goal"]
        XCTAssertTrue(dailyGoal.waitForExistence(timeout: 10))
        XCTAssertEqual(dailyGoal.label, "1 / 5")
        let xp = app.staticTexts["profile-total-xp"]
        let correct = app.staticTexts["profile-correct-answers"]
        for _ in 0..<4 where !correct.isHittable { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertEqual(xp.label, "5")
        XCTAssertEqual(correct.label, "1 / 1")
    }

    @MainActor func testSignupPreferencesSessionPersistenceAndLogout() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--tab", "profile", "--theme", "dark", "--language", "ja",
            "--reset-guest",
        ]
        app.launchEnvironment["WHYLINT_API_URL"] = "http://127.0.0.1:3130"
        app.launch()
        signOutIfNeeded(in: app)
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        app.buttons["login-topbar"].tap()
        app.buttons["auth-switch"].tap()
        let unique = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10))
            .lowercased()
        app.textFields["auth-email"].tap()
        app.textFields["auth-email"].typeText("ios-\(unique)@example.test")
        app.textFields["auth-username"].tap()
        app.textFields["auth-username"].typeText("ios_\(unique)")
        app.secureTextFields["auth-password"].tap()
        app.secureTextFields["auth-password"].typeText("FixtureOnly-Password-7130")
        app.buttons["auth-submit"].tap()
        let next = app.buttons["次へ"]
        XCTAssertTrue(next.waitForExistence(timeout: 20))
        let interest = app.buttons.matching(
            NSPredicate(
                format:
                    "label CONTAINS 'Web' OR label CONTAINS 'ウェブ' OR label CONTAINS 'フロント' OR label CONTAINS 'Backend' OR label CONTAINS 'バック' "
            )
        ).firstMatch
        XCTAssertTrue(interest.waitForExistence(timeout: 5))
        interest.tap()
        next.tap()
        app.swipeUp()
        let start = app.buttons["学習を始める"]
        for _ in 0..<5 {
            if start.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        XCTAssertTrue(app.buttons["public-profile"].waitForExistence(timeout: 15))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["public-profile"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["login-topbar"].exists)
        app.buttons["open-settings"].tap()
        app.buttons["account-settings"].tap()
        app.buttons["logout"].tap()
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
    }
}

final class WhyLintLearningUITests: XCTestCase {
    @MainActor func testAssessmentPublicationAndSavedQuestion() async throws {
        let unique = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10))
            .lowercased()
        let email = "ios-learning-\(unique)@example.test"
        let password = "FixtureOnly-Password-7130"
        // Keep test accounts on the disposable API.
        let base = "http://127.0.0.1:3130/api/v1"
        var signup = URLRequest(url: URL(string: base + "/auth/mobile/signup")!)
        signup.httpMethod = "POST"
        signup.setValue("application/json", forHTTPHeaderField: "Content-Type")
        signup.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email, "username": "learn_\(unique)", "password": password,
        ])
        let (data, response) = try await URLSession.shared.data(for: signup)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 201)
        let token = try XCTUnwrap(
            (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["token"] as? String)
        var preferences = URLRequest(url: URL(string: base + "/learning/preferences")!)
        preferences.httpMethod = "PUT"
        preferences.setValue("application/json", forHTTPHeaderField: "Content-Type")
        preferences.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        preferences.httpBody = try JSONSerialization.data(withJSONObject: [
            "interests": ["frontend"], "technologies": ["JavaScript"], "difficulty": "beginner",
            "language": "ja",
        ])
        let (_, preferenceResponse) = try await URLSession.shared.data(for: preferences)
        XCTAssertEqual((preferenceResponse as? HTTPURLResponse)?.statusCode, 200)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--tab", "profile", "--theme", "dark", "--language", "ja",
        ]
        app.launchEnvironment["WHYLINT_API_URL"] = "http://127.0.0.1:3130"
        app.launch()
        signOutIfNeeded(in: app)
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        app.buttons["login-topbar"].tap()
        app.textFields["auth-identifier"].tap()
        app.textFields["auth-identifier"].typeText(email)
        app.secureTextFields["auth-password"].tap()
        app.secureTextFields["auth-password"].typeText(password)
        app.buttons["auth-submit"].tap()
        XCTAssertTrue(app.buttons["public-profile"].waitForExistence(timeout: 15))
        let profile = XCTAttachment(screenshot: app.screenshot())
        profile.name = "ios-profile-authenticated"
        profile.lifetime = .keepAlways
        add(profile)
        app.buttons["tab-feed"].tap()
        let answer = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'answer-'"))
            .firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 15))
        answer.tap()
        app.buttons["explain-open"].firstMatch.tap()
        let editor = app.textViews["説明"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText(
            "The statement has an invalid expression because the plus operator needs an operand on each side. Remove the comma and provide a valid expression."
        )
        app.buttons["理解度をチェック"].tap()
        let score = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '/ 10'"))
            .firstMatch
        XCTAssertTrue(score.waitForExistence(timeout: 25))
        let publish = app.buttons["説明を公開"]
        for _ in 0..<5 {
            if publish.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(publish.exists)
        publish.tap()
        XCTAssertTrue(app.staticTexts["説明を公開しました。"].waitForExistence(timeout: 10))
        let explanation = XCTAttachment(screenshot: app.screenshot())
        explanation.name = "ios-assessment-shared"
        explanation.lifetime = .keepAlways
        add(explanation)
        app.buttons["閉じる"].tap()
        app.buttons["保存"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["保存済み"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["tab-profile"].tap()
        let saved = app.buttons["保存した問題"]
        XCTAssertFalse(app.staticTexts["アプリ設定"].exists)
        XCTAssertTrue(app.staticTexts["今日の目標"].exists)
        XCTAssertTrue(app.staticTexts["分野ごとの理解度"].exists)
        XCTAssertTrue(app.staticTexts["実績"].exists)
        for _ in 0..<6 {
            if saved.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(saved.exists)
        saved.tap()
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format:
                        "label CONTAINS 'Node.js' OR label CONTAINS '構文' OR label CONTAINS 'JavaScript'"
                )
            ).firstMatch.waitForExistence(timeout: 10))
        let collection = XCTAttachment(screenshot: app.screenshot())
        collection.name = "ios-saved-question"
        collection.lifetime = .keepAlways
        add(collection)
        app.buttons["閉じる"].tap()
        app.buttons["tab-publish"].tap()
        XCTAssertTrue(app.textFields["タイトル"].waitForExistence(timeout: 5))
        app.textFields["タイトル"].tap()
        app.textFields["タイトル"].typeText("Native fixture ownership check")
        app.textViews["質問"].tap()
        app.textViews["質問"].typeText(
            "Why must an API verify ownership before returning a private record?")
        let reference = app.textViews["お手本の説明"]
        for _ in 0..<5 {
            if reference.isHittable { break }
            app.swipeUp()
        }
        reference.tap()
        reference.typeText(
            "The server must identify the caller and verify ownership of the requested record before returning any private data."
        )
        let publication = app.buttons["質問を投稿"]
        for _ in 0..<5 {
            if publication.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(publication.exists)
        publication.tap()
        XCTAssertTrue(app.staticTexts["公開しました"].waitForExistence(timeout: 25))
        let published = XCTAttachment(screenshot: app.screenshot())
        published.name = "ios-published-question"
        published.lifetime = .keepAlways
        add(published)
    }
}

/// Store-policy requirements: legal links, account deletion, comment reports and blocking.
final class WhyLintSafetyUITests: XCTestCase {
    private let base = "http://127.0.0.1:3130/api/v1"
    private let password = "FixtureOnly-Password-7130"

    private struct Learner {
        let email: String
        let username: String
        let token: String
        let id: String
    }

    private func api(
        _ path: String, method: String = "GET", token: String? = nil, body: [String: Any]? = nil
    ) async throws -> (Int, [String: Any]) {
        var request = URLRequest(url: URL(string: base + path)!)
        request.httpMethod = method
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        return ((response as? HTTPURLResponse)?.statusCode ?? 0, object)
    }

    private func signup(_ label: String) async throws -> Learner {
        let unique = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10))
            .lowercased()
        let email = "ios-\(label)-\(unique)@example.test"
        let username = "\(label)_\(unique)"
        let (status, created) = try await api(
            "/auth/mobile/signup", method: "POST",
            body: ["email": email, "username": username, "password": password])
        XCTAssertEqual(status, 201)
        let token = try XCTUnwrap(created["token"] as? String)
        let (_, me) = try await api("/auth/me", token: token)
        let (prefs, _) = try await api(
            "/learning/preferences", method: "PUT", token: token,
            body: [
                "interests": ["frontend"], "technologies": ["JavaScript"],
                "difficulty": "beginner", "language": "ja",
            ])
        XCTAssertEqual(prefs, 200)
        return Learner(
            email: email, username: username, token: token, id: me["id"] as? String ?? "")
    }

    @MainActor private func launchSignedIn(as learner: Learner) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--tab", "profile", "--theme", "dark", "--language", "ja",
        ]
        app.launchEnvironment["WHYLINT_API_URL"] = "http://127.0.0.1:3130"
        app.launch()
        signOutIfNeeded(in: app)
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        app.buttons["login-topbar"].tap()
        app.textFields["auth-identifier"].tap()
        app.textFields["auth-identifier"].typeText(learner.email)
        app.secureTextFields["auth-password"].tap()
        app.secureTextFields["auth-password"].typeText(password)
        app.buttons["auth-submit"].tap()
        XCTAssertTrue(app.buttons["public-profile"].waitForExistence(timeout: 15))
        return app
    }

    @MainActor private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    @MainActor private func scrollTo(_ target: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if target.exists && target.isHittable { return }
            app.scrollViews.firstMatch.swipeUp()
        }
    }

    @MainActor func testLegalLinksAndSupportContactAreVisible() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--tab", "profile", "--theme", "dark", "--language", "ja",
        ]
        app.launchEnvironment["WHYLINT_API_URL"] = "http://127.0.0.1:3130"
        app.launch()
        signOutIfNeeded(in: app)
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        app.buttons["open-settings"].tap()
        let privacy = element(app, "legal-privacy")
        scrollTo(privacy, in: app)
        XCTAssertTrue(privacy.exists)
        XCTAssertEqual(privacy.label, "プライバシーポリシー")
        XCTAssertTrue(element(app, "legal-terms").exists)
        XCTAssertTrue(element(app, "support-contact").exists)
        let profile = XCTAttachment(screenshot: app.screenshot())
        profile.name = "ios-profile-legal-links"
        profile.lifetime = .keepAlways
        add(profile)
        // Sign-in screen
        app.buttons["login-topbar"].tap()
        let signInPrivacy = element(app, "legal-privacy")
        for _ in 0..<4 where !signInPrivacy.isHittable { app.swipeUp() }
        XCTAssertTrue(signInPrivacy.waitForExistence(timeout: 5))
        XCTAssertTrue(element(app, "legal-terms").exists)
        let signIn = XCTAttachment(screenshot: app.screenshot())
        signIn.name = "ios-signin-legal-links"
        signIn.lifetime = .keepAlways
        add(signIn)
    }

    @MainActor func testDeleteAccountNeedsConfirmationAndRemovesTheAccount() async throws {
        let learner = try await signup("delete")
        let app = launchSignedIn(as: learner)
        XCTAssertFalse(app.staticTexts["アプリ設定"].exists)
        XCTAssertTrue(app.staticTexts["今日の目標"].exists)
        app.buttons["open-settings"].tap()
        XCTAssertTrue(app.staticTexts["アプリ設定"].exists)
        XCTAssertFalse(app.staticTexts["今日の目標"].exists)
        XCTAssertFalse(app.buttons["delete-account"].exists)
        app.buttons["account-settings"].tap()
        XCTAssertTrue(app.navigationBars["アカウント設定"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["アプリ設定"].exists)
        let delete = app.buttons["delete-account"]
        scrollTo(delete, in: app)
        XCTAssertTrue(delete.exists)
        // Cancelling keeps the account signed in.
        delete.tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        let alert = XCTAttachment(screenshot: app.screenshot())
        alert.name = "ios-delete-account-confirmation"
        alert.lifetime = .keepAlways
        add(alert)
        app.alerts.buttons["キャンセル"].tap()
        XCTAssertTrue(app.buttons["logout"].exists)
        let (stillThere, _) = try await api("/auth/me", token: learner.token)
        XCTAssertEqual(stillThere, 200)
        // Confirming deletes the account and signs the app out.
        scrollTo(delete, in: app)
        delete.tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["完全に削除"].tap()
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 15))
        XCTAssertTrue(element(app, "account-deleted").waitForExistence(timeout: 5))
        let (gone, _) = try await api("/auth/me", token: learner.token)
        XCTAssertEqual(gone, 401)
        let (login, _) = try await api(
            "/auth/mobile/password/login", method: "POST",
            body: ["identifier": learner.email, "password": password])
        XCTAssertEqual(login, 401)
        // The deletion survives a relaunch: no session is restored.
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["login-topbar"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["logout"].exists)
    }

    @MainActor func testReportACommentBlockItsAuthorAndUnblock() async throws {
        let author = try await signup("author")
        let reader = try await signup("reader")
        // The first card in the feed is the shared daily question.
        let (_, daily) = try await api("/learning/daily?language=ja", token: reader.token)
        let question = try XCTUnwrap((daily["question"] as? [String: Any])?["id"] as? String)
        let tag = String(UUID().uuidString.prefix(6))
        let first = "fixture-first-\(tag)"
        let second = "fixture-second-\(tag)"
        // The daily question is shared by every run, so address these two comments by id.
        var ids: [String] = []
        for text in [first, second] {
            let (status, comment) = try await api(
                "/learning/questions/\(question)/comments", method: "POST", token: author.token,
                body: ["text": text])
            XCTAssertEqual(status, 201)
            ids.append(try XCTUnwrap(comment["id"] as? String))
        }
        let app = launchSignedIn(as: reader)
        app.buttons["tab-feed"].tap()
        let comments = app.buttons["コメント"].firstMatch
        XCTAssertTrue(comments.waitForExistence(timeout: 20))
        comments.tap()
        XCTAssertTrue(app.staticTexts[first].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[second].exists)

        // Report the first comment.
        let firstMenu = app.buttons["comment-more-" + ids[0]]
        for _ in 0..<8 where !(firstMenu.exists && firstMenu.isHittable) { app.swipeUp() }
        firstMenu.tap()
        app.buttons["報告"].tap()
        let reason = app.buttons["report-reason-harassment"]
        XCTAssertTrue(reason.waitForExistence(timeout: 5))
        reason.tap()
        let sheet = XCTAttachment(screenshot: app.screenshot())
        sheet.name = "ios-report-comment-sheet"
        sheet.lifetime = .keepAlways
        add(sheet)
        app.buttons["report-submit"].tap()
        XCTAssertTrue(element(app, "comment-notice").waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts[first].exists)
        XCTAssertTrue(app.staticTexts[second].exists)

        // Block the author from the remaining comment.
        let secondMenu = app.buttons["comment-more-" + ids[1]]
        for _ in 0..<8 where !(secondMenu.exists && secondMenu.isHittable) { app.swipeUp() }
        secondMenu.tap()
        app.buttons["ユーザーをブロック"].tap()
        let confirm = XCTAttachment(screenshot: app.screenshot())
        confirm.name = "ios-block-user-confirmation"
        confirm.lifetime = .keepAlways
        add(confirm)
        app.buttons["ブロック"].tap()
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'ブロックしました'")).firstMatch
                .waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts[second].exists)
        let (status, listed) = try await api("/learning/blocks", token: reader.token)
        XCTAssertEqual(status, 200)
        XCTAssertEqual((listed["users"] as? [[String: Any]])?.count, 1)

        // The block is listed in Profile and can be lifted.
        app.buttons["閉じる"].firstMatch.tap()
        app.buttons["tab-profile"].tap()
        app.buttons["open-settings"].tap()
        app.buttons["account-settings"].tap()
        let unblock = app.buttons["unblock-" + author.id]
        scrollTo(unblock, in: app)
        XCTAssertTrue(unblock.exists)
        unblock.tap()
        XCTAssertTrue(element(app, "blocked-empty").waitForExistence(timeout: 10))
        let (_, after) = try await api("/learning/blocks", token: reader.token)
        XCTAssertEqual((after["users"] as? [[String: Any]])?.count, 0)
    }
}
