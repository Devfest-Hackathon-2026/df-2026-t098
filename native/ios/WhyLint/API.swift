import Foundation
import Security

struct APIError: LocalizedError {
    let status: Int
    let code: String
    var errorDescription: String? { code }
}

final class SessionVault {
    private let service: String
    init(origin: String) { service = "app.whylint.native.session." + origin }
    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: "session",
        ]
    }
    func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
            let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func write(_ value: String?) throws {
        SecItemDelete(query as CFDictionary)
        guard let value else { return }
        var q = query
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else {
            throw APIError(status: 0, code: "SESSION_STORAGE")
        }
    }
}

@MainActor final class API {
    let origin: String
    private let session: URLSession
    private let vault: SessionVault
    private(set) var token: String?
    var onUnauthorized: (() -> Void)?

    init() {
        var configured = Bundle.main.object(forInfoDictionaryKey: "WhyLintAPIURL") as? String ?? ""
        #if DEBUG
            if let local = ProcessInfo.processInfo.environment["WHYLINT_API_URL"], !local.isEmpty {
                configured = local
            }
        #endif
        if configured.isEmpty || configured.contains("$(") {
            configured = "https://whylint-8715935974.asia-northeast1.run.app"
        }
        origin = configured.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        vault = SessionVault(origin: origin)
        token = vault.read()
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        session = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }

    func accept(token: String?) throws {
        try vault.write(token)
        self.token = token
    }

    func request(
        _ path: String, method: String = "GET", body: [String: Any]? = nil,
        timeout: TimeInterval? = nil
    ) async throws -> [String: Any]
    {
        guard let url = URL(string: origin + "/api/v1" + path),
            url.scheme == "https" || debugLocal(url)
        else { throw APIError(status: 0, code: "API_CONFIGURATION") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval =
            path.contains("batches") || path.contains("attempts") || path.contains("follow-ups")
                || (path == "/learning/questions" && method == "POST") ? 75 : 15
        if let timeout { request.timeoutInterval = timeout }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let sentToken = token
        if let sentToken {
            request.setValue("Bearer " + sentToken, forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw APIError(status: 0, code: "UNAVAILABLE")
        }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 404, path.hasPrefix("/auth/mobile/") {
                throw APIError(status: 404, code: "MOBILE_SIGN_IN_UNAVAILABLE")
            }
            // A late 401 must leave a newer session alone.
            if response.statusCode == 401, let sentToken, token == sentToken,
                !path.contains("/mobile/")
            {
                try? accept(token: nil)
                onUnauthorized?()
            }
            throw APIError(
                status: response.statusCode, code: object["code"] as? String ?? "REQUEST_FAILED")
        }
        return object
    }

    private func debugLocal(_ url: URL) -> Bool {
        #if DEBUG
            return url.scheme == "http"
                && ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")
        #else
            return false
        #endif
    }
}

struct Question: Identifiable, Hashable {
    struct Reason: Hashable {
        let kind: String
        let topic: String?
    }

    let id: String
    let title: String
    let prompt: String
    let code: String?
    let codeLanguage: String
    let format: String
    let difficulty: String
    let topics: [String]
    let options: [String]
    let source: String
    let authorName: String
    let authorID: String?
    var likes: Int
    var liked: Bool
    var saved: Bool
    let references: [Reference]
    let reason: Reason?
    var tap: Tap?
    init?(_ json: [String: Any]) {
        guard let id = json["id"] as? String, let prompt = json["prompt"] as? String else {
            return nil
        }
        self.id = id
        self.prompt = prompt
        title = json["title"] as? String ?? prompt
        code = json["code"] as? String
        codeLanguage = json["codeLanguage"] as? String ?? ""
        format = json["format"] as? String ?? "explain"
        difficulty = json["difficulty"] as? String ?? "beginner"
        topics = json["topics"] as? [String] ?? []
        options = json["options"] as? [String] ?? []
        source = json["source"] as? String ?? "ai"
        let author = json["author"] as? [String: Any]
        authorName = author?["displayName"] as? String ?? "WhyLint AI"
        authorID = author?["id"] as? String
        likes = json["likes"] as? Int ?? 0
        liked = json["liked"] as? Bool ?? false
        saved = json["saved"] as? Bool ?? false
        references = (json["references"] as? [[String: Any]] ?? []).compactMap { r in
            guard let title = r["title"] as? String, let value = r["url"] as? String,
                let url = URL(string: value), url.scheme == "https"
            else { return nil }
            return Reference(title: title, url: url)
        }
        if let data = json["reason"] as? [String: Any], let kind = data["kind"] as? String {
            reason = Reason(kind: kind, topic: data["topic"] as? String)
        } else {
            reason = nil
        }
        tap = (json["tap"] as? [String: Any]).map(Tap.init)
    }
}
struct Reference: Hashable {
    let title: String
    let url: URL
}
struct Tap: Hashable {
    let choice: Int
    let correct: Bool
    let correctOption: Int
    let explanation: String
    init(_ json: [String: Any]) {
        choice = json["choice"] as? Int ?? -1
        correct = json["correct"] as? Bool ?? false
        correctOption = json["correctOption"] as? Int ?? -1
        explanation = json["quickExplanation"] as? String ?? ""
    }
}
extension Dictionary where Key == String, Value == Any {
    func text(_ key: String) -> String { self[key] as? String ?? "" }
    func number(_ key: String) -> Int { (self[key] as? NSNumber)?.intValue ?? 0 }
    func objects(_ key: String) -> [[String: Any]] { self[key] as? [[String: Any]] ?? [] }
}

nonisolated final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) { completionHandler(nil) }
}
