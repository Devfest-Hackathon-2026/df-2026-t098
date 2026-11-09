package app.whylint.nativeapp

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.net.URLEncoder
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

internal class AppModel(app: Application) : AndroidViewModel(app) {
    private val storage = app.getSharedPreferences("display", 0)
    val api = Api(app)
    var dark by
        mutableStateOf(
            storage.getBoolean(
                "dark",
                (app.resources.configuration.uiMode and
                    android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                    android.content.res.Configuration.UI_MODE_NIGHT_YES,
            )
        )
        private set

    var language by mutableStateOf(storage.getString("language", "ja") ?: "ja")
        private set

    var readingSize by mutableFloatStateOf(storage.getFloat("readingSize", 1f))
        private set

    var screen by
        mutableStateOf(if (storage.getBoolean("onboarded", false)) "home" else "onboarding")
    var tab by mutableIntStateOf(0)
    var user by mutableStateOf<JSONObject?>(null)
    var sessionLoading by mutableStateOf(true)
    var sessionError by mutableStateOf(false)
    var questions by mutableStateOf<List<Question>>(emptyList())
    var collection by mutableStateOf<List<Question>>(emptyList())
    var guestCorrect by mutableIntStateOf(0)
    var guestAnswered by mutableIntStateOf(0)
    var progress by mutableStateOf(JSONObject())
    var catalog by mutableStateOf(JSONObject())
    var leaderboard by mutableStateOf(JSONObject())
    var preferences by mutableStateOf(JSONObject(storage.getString("preferences", "{}") ?: "{}"))
    var loading by mutableStateOf(false)
    var generating by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf("")
    var notice by mutableStateOf("")
    var daily by mutableStateOf<JSONObject?>(null)
    var focused by mutableStateOf<Question?>(null)
    var sheet by mutableStateOf("")
    var comments by mutableStateOf<List<JSONObject>>(emptyList())
    var assessment by mutableStateOf<JSONObject?>(null)
    var followUp by mutableStateOf<JSONObject?>(null)
    var creator by mutableStateOf<JSONObject?>(null)
    var publishedQuestion by mutableStateOf<Question?>(null)
    var publishDraft by mutableStateOf(JSONObject())
    var blocked by mutableStateOf<List<JSONObject>>(emptyList())
    var accountDeleted by mutableStateOf(false)
    private var identity = 0
    private var batchId = UUID.randomUUID().toString()
    private var seen = linkedSetOf<String>()
    private var feedEpoch = 0

    fun text(ja: String, en: String) = if (language == "ja") ja else en

    init {
        refreshSession()
    }

    fun theme(value: Boolean) {
        dark = value
        storage.edit().putBoolean("dark", value).apply()
    }

    fun size(value: Float) {
        readingSize = value
        storage.edit().putFloat("readingSize", value).apply()
    }

    fun changeLanguage(value: String) {
        if (busy || value == language) return
        if (user == null) {
            applyLanguage(value)
            resetFeed()
            return
        }
        action {
            api.request("/learning/preferences/language", "PATCH", json("language" to value))
            applyLanguage(value)
            resetFeed()
        }
    }

    private fun applyLanguage(value: String) {
        language = value
        storage.edit().putString("language", value).apply()
    }

    fun message(e: Exception): String {
        val a = e as? ApiError
        return when {
            a?.status == 401 ->
                text("ログインを確認できませんでした。もう一度ログインしてください。", "Sign in again to continue.")
            a?.status == 409 ->
                text("このメールアドレスまたはユーザー名は利用できません。", "This email or username is unavailable.")
            a?.status == 429 ->
                text(
                    "リクエストが多いため、少し待ってから再試行してください。",
                    "Too many requests. Wait a moment, then retry.",
                )
            a?.code == "AI_NOT_CONFIGURED" ->
                text(
                    "AI学習の準備中です。厳選問題で続けましょう。",
                    "AI learning is being connected. Keep going with curated questions.",
                )
            a?.status == 400 || a?.status == 422 ->
                text("入力内容を確認して、もう一度お試しください。", "Check your input and try again.")
            else ->
                text(
                    "接続できませんでした。入力は保存されています。もう一度お試しください。",
                    "Could not connect. Your input is preserved. Please try again.",
                )
        }
    }

    fun action(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = ""
        notice = ""
        val owner = identity
        viewModelScope.launch {
            try {
                block()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (owner == identity) {
                    error = message(e)
                    if (api.token == null && user != null) invalidateSession()
                }
            } finally {
                busy = false
            }
        }
    }

    fun refreshSession() {
        sessionLoading = true
        sessionError = false
        val previousUser = user?.text("id")
        val previousLanguage = language
        val hadToken = api.token != null
        viewModelScope.launch {
            try {
                catalog = api.request("/learning/catalog")
                if (api.token != null) {
                    user = api.request("/auth/me")
                    loadAccount()
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (hadToken && api.token == null) invalidateSession()
                else if (api.token != null) sessionError = true
            } finally {
                sessionLoading = false
                if (
                    !sessionError &&
                        (questions.isEmpty() ||
                            previousUser != user?.text("id") ||
                            previousLanguage != language)
                )
                    resetFeed()
            }
        }
    }

    suspend fun loadAccount() {
        val result = api.request("/learning/preferences")
        val prefs = result.optJSONObject("preferences")
        preferences = prefs ?: JSONObject()
        if (prefs != null) {
            preferences = prefs
            applyLanguage(prefs.optString("language", language))
            storage.edit().putString("preferences", prefs.toString()).apply()
        }
        progress = api.request("/learning/progress")
        try {
            blocked = api.request("/learning/blocks").objects("users")
        } catch (_: ApiError) {
            // The list is only for Profile; the server hides blocked content either way.
        }
    }

    fun login(
        identifier: String,
        password: String,
        signup: Boolean = false,
        email: String = "",
        username: String = "",
    ) = action {
        val body =
            if (signup)
                json("email" to email.trim(), "username" to username.trim(), "password" to password)
            else json("identifier" to identifier.trim(), "password" to password)
        val result =
            api.request(
                if (signup) "/auth/mobile/signup" else "/auth/mobile/password/login",
                "POST",
                body,
            )
        val token = result.text("token")
        check(token.isNotBlank())
        api.signIn(token)
        accountDeleted = false
        user = api.request("/auth/me")
        loadAccount()
        identity++
        screen = if (preferences.strings("interests").isEmpty()) "onboarding" else "home"
        resetFeed()
    }

    fun googleLogin(idToken: String) = action {
        val result = api.request("/auth/mobile/google", "POST", json("idToken" to idToken))
        val token = result.text("token")
        check(token.isNotBlank())
        api.signIn(token)
        accountDeleted = false
        user = api.request("/auth/me")
        loadAccount()
        identity++
        screen = if (preferences.strings("interests").isEmpty()) "onboarding" else "home"
        resetFeed()
    }

    private fun invalidateSession() {
        identity++
        user = null
        guestCorrect = 0
        guestAnswered = 0
        progress = JSONObject()
        preferences = JSONObject()
        publishDraft = JSONObject()
        collection = emptyList()
        blocked = emptyList()
        focused = null
        comments = emptyList()
        assessment = null
        followUp = null
        creator = null
        storage.edit().remove("preferences").apply()
        tab = 4
        sheet = ""
        screen = "home"
        resetFeed()
    }

    fun logout() = action {
        // Revoke on the server when it is reachable, but never keep the token on this device
        // because that request failed. An unrevoked session still expires on its own.
        try {
            api.request("/auth/logout", "POST")
        } catch (_: ApiError) {}
        endLocalSession()
    }

    /**
     * Permanently deletes the account. The token is forgotten only after the server confirms
     * with 204; on any failure the account and the session stay as they were.
     */
    fun deleteAccount() = action {
        api.request("/auth/me", "DELETE")
        endLocalSession()
        accountDeleted = true
    }

    private fun endLocalSession() {
        api.forget()
        identity++
        user = null
        guestCorrect = 0
        guestAnswered = 0
        progress = JSONObject()
        preferences = JSONObject()
        publishDraft = JSONObject()
        publishedQuestion = null
        collection = emptyList()
        blocked = emptyList()
        focused = null
        comments = emptyList()
        assessment = null
        followUp = null
        creator = null
        storage.edit().remove("preferences").apply()
        tab = 4
        sheet = ""
        screen = "home"
        resetFeed()
    }

    fun savePreferences(interests: List<String>, technologies: List<String>, difficulty: String) =
        action {
            val p =
                json(
                    "interests" to JSONArray(interests),
                    "technologies" to JSONArray(technologies),
                    "difficulty" to difficulty,
                    "language" to language,
                )
            if (user != null) api.request("/learning/preferences", "PUT", p)
            preferences = p
            storage
                .edit()
                .putString("preferences", p.toString())
                .putBoolean("onboarded", true)
                .apply()
            screen = "home"
            tab = 0
            resetFeed()
        }

    fun skipOnboarding() {
        storage.edit().putBoolean("onboarded", true).apply()
        screen = "home"
    }

    fun resetFeed() {
        feedEpoch++
        loading = false
        generating = false
        seen.clear()
        questions = emptyList()
        batchId = UUID.randomUUID().toString()
        loadFeed()
    }

    fun loadFeed() {
        if (loading) return
        loading = true
        error = ""
        val epoch = feedEpoch
        val lang = language
        viewModelScope.launch {
            try {
                if (questions.isEmpty()) {
                    val loadedDaily = api.request("/learning/daily?language=$lang")
                    if (epoch == feedEpoch) daily = loadedDaily
                    loadedDaily.optJSONObject("question")?.let { q ->
                        if (epoch == feedEpoch) {
                            val item = Question.parse(q, true)
                            questions = listOf(item)
                            seen.add(item.id)
                        }
                    }
                }
                val exclude =
                    URLEncoder.encode(seen.toList().takeLast(300).joinToString(","), "UTF-8")
                val result = api.request("/learning/feed/pool?language=$lang&exclude=$exclude")
                if (epoch == feedEpoch)
                    append(result.objects("questions") + result.objects("reviewQuestions"))
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (epoch == feedEpoch) error = message(e)
            } finally {
                if (epoch == feedEpoch) loading = false
            }
        }
    }

    private fun isBlockedAuthor(q: Question) =
        q.author?.text("id")?.let { id -> blocked.any { it.text("id") == id } } == true

    private fun append(items: List<JSONObject>) {
        val added = items.map(Question::parse).filter { !isBlockedAuthor(it) && seen.add(it.id) }
        questions = (questions + added).takeLast(100)
    }

    fun generate() {
        if (generating || user == null || preferences.strings("interests").isEmpty()) return
        generating = true
        val epoch = feedEpoch
        val lang = language
        viewModelScope.launch {
            try {
                val result =
                    api.request(
                        "/learning/feed/batches",
                        "POST",
                        json(
                            "requestId" to batchId,
                            "language" to lang,
                            "excludeQuestionIds" to JSONArray(seen.toList().takeLast(300)),
                        ),
                    )
                if (epoch == feedEpoch) {
                    append(
                        result.objects("questions") +
                            result.objects("reviewQuestions") +
                            listOfNotNull(result.optJSONObject("communityQuestion"))
                    )
                    batchId = UUID.randomUUID().toString()
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (epoch == feedEpoch) {
                    notice = message(e)
                    loadFeed()
                }
            } finally {
                if (epoch == feedEpoch) generating = false
            }
        }
    }

    fun nearEnd() {
        if (user != null && preferences.strings("interests").isNotEmpty()) generate()
        else loadFeed()
    }

    private fun update(q: Question) {
        questions = questions.map { if (it.id == q.id) q else it }
        collection = collection.map { if (it.id == q.id) q else it }
        if (focused?.id == q.id) focused = q
    }

    fun answer(q: Question, choice: Int) = action {
        val result =
            api.request("/learning/questions/${q.id}/taps", "POST", json("choice" to choice))
        update(q.copy(tap = QuizAnswer.parse(result)))
        result.optJSONObject("progress")?.let { progress = it }
            ?: run {
                guestAnswered++
                if (result.optBoolean("correct")) guestCorrect++
            }
    }

    fun requireLogin(): Boolean {
        if (user == null) {
            screen = "login"
            sheet = ""
            return false
        }
        return true
    }

    fun like(q: Question) {
        if (!requireLogin()) return
        action {
            val result =
                api.request("/learning/questions/${q.id}/like", "PUT", json("liked" to !q.liked))
            update(
                q.copy(
                    liked = result.optBoolean("liked", !q.liked),
                    likes = result.optInt("likes", q.likes + if (q.liked) -1 else 1),
                )
            )
        }
    }

    fun save(q: Question) {
        if (!requireLogin()) return
        action {
            api.request("/learning/questions/${q.id}/save", "PUT", json("saved" to !q.saved))
            update(q.copy(saved = !q.saved))
        }
    }

    fun open(q: Question, kind: String) {
        focused = q
        sheet = kind
        error = ""
        assessment = null
        followUp = null
        if (kind == "comments") loadComments(q)
    }

    fun loadComments(q: Question) {
        action {
            comments = api.request("/learning/questions/${q.id}/comments").objects("comments")
        }
    }

    fun postComment(
        q: Question,
        text: String,
        kind: String = "comment",
        parent: String? = null,
        requestId: String = UUID.randomUUID().toString(),
        onSuccess: () -> Unit = {},
    ) {
        if (!requireLogin()) return
        action {
            val body = json("text" to text, "kind" to kind, "requestId" to requestId)
            parent?.let { body.put("parentId", it) }
            api.request("/learning/questions/${q.id}/comments", "POST", body)
            comments = api.request("/learning/questions/${q.id}/comments").objects("comments")
            onSuccess()
        }
    }

    fun helpful(q: Question, c: JSONObject) {
        if (!requireLogin()) return
        action {
            api.request(
                "/learning/questions/${q.id}/comments/${c.text("id")}/helpful",
                "PUT",
                json("helpful" to !c.optBoolean("helpful")),
            )
            comments = api.request("/learning/questions/${q.id}/comments").objects("comments")
        }
    }

    fun deleteComment(q: Question, c: JSONObject) = action {
        api.request("/learning/questions/${q.id}/comments/${c.text("id")}", "DELETE")
        comments = api.request("/learning/questions/${q.id}/comments").objects("comments")
    }

    fun reportComment(
        q: Question,
        c: JSONObject,
        reason: String,
        details: String,
        onDone: () -> Unit = {},
    ) {
        if (!requireLogin()) return
        action {
            val id = c.text("id")
            api.request(
                "/learning/questions/${q.id}/comments/$id/reports",
                "POST",
                json("reason" to reason, "details" to details.trim()),
            )
            // The server hides a reported comment (and its replies) from the reporter.
            comments = comments.filter { it.text("id") != id && it.text("parentId") != id }
            notice = text("報告を受け付けました。このコメントは非表示になりました。", "Report received. This comment is now hidden for you.")
            onDone()
        }
    }

    /** Blocks a learner: their questions leave this device's lists and the server hides their comments. */
    fun blockUser(id: String, name: String, reload: Question? = null) {
        if (!requireLogin()) return
        action {
            api.request("/learning/blocks/$id", "PUT")
            blocked = listOf(json("id" to id, "displayName" to name)) + blocked.filter { it.text("id") != id }
            val hidden = { q: Question -> q.author?.text("id") == id }
            questions = questions.filterNot(hidden)
            collection = collection.filterNot(hidden)
            if (focused?.let(hidden) == true) {
                focused = null
                sheet = ""
                if (screen == "question") screen = "home"
            }
            reload?.let { comments = api.request("/learning/questions/${it.id}/comments").objects("comments") }
            notice = text("${name}さんをブロックしました。", "You blocked $name.")
        }
    }

    fun unblockUser(id: String) = action {
        api.request("/learning/blocks/$id", "DELETE")
        blocked = blocked.filter { it.text("id") != id }
        resetFeed()
    }

    fun assess(q: Question, answer: String, requestId: String) {
        if (!requireLogin()) return
        action {
            assessment =
                api.request(
                    "/learning/questions/${q.id}/attempts",
                    "POST",
                    json("requestId" to requestId, "answer" to answer),
                )
            progress = api.request("/learning/progress")
        }
    }

    fun ask(q: Question, question: String, requestId: String) {
        if (!requireLogin()) return
        action {
            followUp =
                api.request(
                    "/learning/questions/${q.id}/follow-ups",
                    "POST",
                    json("requestId" to requestId, "question" to question),
                )
        }
    }

    fun report(q: Question, reason: String, details: String) {
        if (!requireLogin()) return
        action {
            api.request(
                "/learning/questions/${q.id}/reports",
                "POST",
                json("reason" to reason, "details" to details),
            )
            notice = text("報告を送信しました。", "Report submitted.")
            sheet = ""
        }
    }

    fun changeTab(value: Int) {
        tab = value
        error = ""
        if (value == 1) loadCollection(false)
        if (value == 2) loadRanking()
        if (value == 4 && user != null) action { loadAccount() }
    }

    fun loadCollection(saved: Boolean) {
        if (user == null) return
        action {
            collection =
                api.request(if (saved) "/learning/saved" else "/learning/reviews")
                    .objects("questions")
                    .map(Question::parse)
        }
    }

    fun loadRanking() = action { leaderboard = api.request("/learning/leaderboard") }

    fun openCreator(id: String) = action {
        creator = api.request("/learning/creators/$id")
        screen = "creator"
        sheet = ""
    }

    fun publish(body: JSONObject) = action {
        val result = api.request("/learning/questions", "POST", body)
        publishDraft = JSONObject()
        publishedQuestion = null
        notice = text("問題を公開しました。", "Question published.")
        result.optJSONObject("question")?.let { publishedQuestion = Question.parse(it) }
    }

    fun setUsername(value: String) = action {
        api.request("/auth/me/username", "PATCH", json("username" to value.trim()))
        user = api.request("/auth/me")
    }

    fun deepLink(id: String) {
        if (!Regex("[a-fA-F0-9-]{36}").matches(id)) return
        action {
            focused =
                api.request("/learning/questions/$id").optJSONObject("question")?.let {
                    Question.parse(it)
                }
            screen = "question"
        }
    }
}
