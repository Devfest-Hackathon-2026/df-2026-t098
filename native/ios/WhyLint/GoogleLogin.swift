import GoogleSignIn
import SwiftUI

extension AppStore {
    func googleSignIn() async throws {
        let info = Bundle.main.infoDictionary ?? [:]
        guard let clientID = info["GIDClientID"] as? String,
            clientID.hasSuffix(".apps.googleusercontent.com"),
            let serverID = info["GIDServerClientID"] as? String,
            serverID.hasSuffix(".apps.googleusercontent.com")
        else {
            throw APIError(status: 0, code: "GOOGLE_CONFIGURATION")
        }

        let expectedScheme = clientID.split(separator: ".").reversed().joined(separator: ".")
        let urlTypes = info["CFBundleURLTypes"] as? [[String: Any]] ?? []
        let schemes = urlTypes.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        guard schemes.contains(expectedScheme) else {
            throw APIError(status: 0, code: "GOOGLE_CONFIGURATION")
        }

        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive && $0.keyWindow != nil }
        guard var presenter = scene?.keyWindow?.rootViewController else {
            throw APIError(status: 0, code: "UNAVAILABLE")
        }
        while let presented = presenter.presentedViewController {
            presenter = presented
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID, serverClientID: serverID)
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw APIError(status: 401, code: "GOOGLE_TOKEN_MISSING")
        }
        let response = try await api.request(
            "/auth/mobile/google", method: "POST", body: ["idToken": idToken])
        guard let token = response["token"] as? String, !token.isEmpty else {
            throw APIError(status: 401, code: "SESSION_MISSING")
        }

        try api.accept(token: token)
        await restoreSession()
        guard signedIn else { throw APIError(status: 0, code: "SESSION_UNAVAILABLE") }
        showingLogin = false
        if preferences.isEmpty { showingOnboarding = true }
        await loadFeed()
    }
}
