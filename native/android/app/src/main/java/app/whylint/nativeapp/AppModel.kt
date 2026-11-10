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

    var language by
        mutableStateOf(
            storage.getString("language", null)
                ?: storage.getString("locationLanguage", null)
                ?: if (java.util.Locale.getDefault().language == "ja") "ja" else "en"
        )
        private set

    var readingSize by mutableFloatStateOf(storage.getFloat("readingSize", 1f))
        private set

    var screen by
        mutableStateOf(if (storage.getBoolean("onboarded", false)) "home" else "onboarding")
    var tab by mutableIntStateOf(0)
    var user by mutableStateOf<JSONObject?>(null)
    var sessionLoading by mutableStateOf(true)
    var localeLoading by mutableStateOf(needsLocationLanguage())
        private set

    private var localeLookupAttempted = false
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
    /** What the sign-in screen says signing in unlocks; set by whatever sent the learner there. */
    var loginReason by mutableStateOf<String?>(null)
    private var refreshedAt = 0L
    private val inFlight = mutableSetOf<String>()
    private var identity = 0
    private var batchId = UUID.randomUUID().toString()
    private var seen = linkedSetOf<String>()
    private var feedEpoch = 0

    fun text(ja: String, en: String) = if (language == "ja") ja else en

    fun loginReasonText(): String? =
        when (loginReason) {
            "explain" ->
                text(
                    "ログインすると、あなたの説明をGeminiが採点し、+15 XPを獲得できます。",
                    "Sign in to get your explanation graded by Gemini and earn +15 XP.",
                )
            "ask" -> text("ログインすると、Geminiに質問できます。", "Sign in to ask Gemini a follow-up question.")
            "save" ->
                text(
                    "ログインすると、問題を保存して、プロフィールからいつでも見返せます。",
                    "Sign in to save this question and find it again in your Profile.",
                )
            "like" -> text("ログインすると、問題にいいねできます。", "Sign in to like questions.")
            "comment" -> text("ログインすると、コメントできます。", "Sign in to join the discussion.")
            "practice" ->
                text(
                    "ログインすると、間違えた問題を毎朝復習できます。",
                    "Sign in to review the questions you missed every morning.",
                )
            "post" -> text("ログインすると、あなたの問題を投稿できます。", "Sign in to post a question of your own.")
            "progress" ->
                text(
                    "ログインすると、進捗・XP・連続記録をすべての端末で保存できます。",
                    "Sign in to keep your progress, XP and streak on every device.",
                )
            else -> null
        }

    fun openLogin(reason: String? = "progress", signup: Boolean = false) {
        loginReason = reason
        error = ""
        sheet = ""
        screen = if (signup) "signup" else "login"
    }

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
        if (busy) return
        if (value == language) {
            applyLanguage(value)
            return
        }
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

    private fun needsLocationLanguage(): Boolean =
        api.token == null && !storage.contains("language") && !storage.contains("locationLanguage")

    private suspend fun resolveDefaultLanguage() {
        if (localeLookupAttempted) return
        if (!needsLocationLanguage()) {
            localeLoading = false
            return
        }
        localeLookupAttempted = true
        try {
            val detected = api.request("/config/locale", timeoutMs = 1_200).text("defaultLanguage")
            if ((detected == "ja" || detected == "en") && needsLocationLanguage()) {
                storage.edit().putString("locationLanguage", detected).apply()
                language = detected
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // The device language is already available.
        } finally {
            localeLoading = false
        }
    }

    fun message(e: Exception): String {
        val a = e as? ApiError
        return when {
            a?.status == 401 ->
                text("ログインを確認できませんでした。もう一度ログインしてください。", "Sign in again to continue.")
            a?.status == 409 ->
                text("このメールアドレスまたはユーザー名は利用できません。", "This email or username is unavailable.")
            a?.status == 404 ->
                text(
                    "見つかりませんでした。すでに削除または非表示になっている可能性があります。",
                    "Not found. It may have been removed or hidden.",
                )
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

    /**
     * Runs one request at a time. A like or save passes its own [key], so it never blocks, or is
     * silently dropped behind, an answer in flight; it only waits for itself.
     */
    fun action(key: String = "", block: suspend () -> Unit) {
        if (key.isEmpty()) {
            if (busy) return
            busy = true
        } else if (!inFlight.add(key)) return
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
                if (key.isEmpty()) busy = false else inFlight.remove(key)
            }
        }
    }

    /** Refreshes when the app returns from the background, but not on every quick switch. */
    fun refreshIfStale() {
        if (System.currentTimeMillis() - refreshedAt > 60_000) refreshSession()
    }

    fun refreshSession() {
        refreshedAt = System.currentTimeMillis()
        sessionLoading = true
        sessionError = false
        val previousUser = user?.text("id")
        val previousLanguage = language
        val hadToken = api.token != null
        viewModelScope.launch {
            try {
                resolveDefaultLanguage()
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
        val token = api.token ?: return
        val importedProgress = importGuestAnswers()
        if (api.token != token) return
        val result = api.request("/learning/preferences")
        if (api.token != token) return
        val prefs = result.optJSONObject("preferences")
        preferences = prefs ?: JSONObject()
        if (prefs != null) {
            preferences = prefs
            applyLanguage(prefs.optString("language", language))
            storage.edit().putString("preferences", prefs.toString()).apply()
        }
        if (!importedProgress) {
            val refreshed = api.request("/learning/progress")
            if (api.token != token) return
            progress = refreshed
        }
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
        val guestChoices = preferences
        api.signIn(token)
        accountDeleted = false
        user = api.request("/auth/me")
        loadAccount()
        adoptGuestPreferences(guestChoices)
        identity++
        loginReason = null
        tab = 0
        screen = if (preferences.strings("interests").isEmpty()) "onboarding" else "home"
        resetFeed()
    }

    fun googleLogin(idToken: String) = action {
        val result = api.request("/auth/mobile/google", "POST", json("idToken" to idToken))
        val token = result.text("token")
        check(token.isNotBlank())
        val guestChoices = preferences
        api.signIn(token)
        accountDeleted = false
        user = api.request("/auth/me")
        loadAccount()
        adoptGuestPreferences(guestChoices)
        identity++
        loginReason = null
        tab = 0
        screen = if (preferences.strings("interests").isEmpty()) "onboarding" else "home"
        resetFeed()
    }

    /**
     * What a guest picked in onboarding becomes the new account's choices, so they are not asked
     * again. An account that already has choices keeps them.
     */
    private suspend fun adoptGuestPreferences(guest: JSONObject) {
        if (preferences.strings("interests").isNotEmpty() || guest.strings("interests").isEmpty())
            return
        try {
            api.request("/learning/preferences", "PUT", guest)
            preferences = guest
            storage.edit().putString("preferences", guest.toString()).apply()
        } catch (e: ApiError) {
            // Onboarding asks again if the account could not take them.
        }
    }

    private fun guestAnswerQueue(): JSONObject {
        val saved = storage.getString("guestAnswerQueue", null)
        if (saved != null) return JSONObject(saved)
        val legacy = JSONArray(storage.getString("guestAnswers", "[]") ?: "[]")
        return json("answers" to legacy, "pending" to JSONObject())
    }

    private fun rememberGuestAnswer(questionId: String, choice: Int) {
        val queue = guestAnswerQueue()
        val kept = queue.optJSONArray("answers") ?: JSONArray()
        kept.put(json("questionId" to questionId, "choice" to choice))
        val recent = JSONArray()
        for (index in maxOf(0, kept.length() - 200) until kept.length()) recent.put(kept.get(index))
        queue.put("answers", recent)
        storage
            .edit()
            .putString("guestAnswerQueue", queue.toString())
            .remove("guestAnswers")
            .apply()
    }

    @Suppress("ApplySharedPref")
    private fun saveGuestAnswerQueue(queue: JSONObject) {
        check(
            storage
                .edit()
                .putString("guestAnswerQueue", queue.toString())
                .remove("guestAnswers")
                .commit()
        )
    }

    var guestImportFailed by mutableStateOf(false)
        private set

    var guestImportSkipped by mutableIntStateOf(0)
        private set

    fun retryGuestAnswers() {
        viewModelScope.launch { importGuestAnswers() }
    }

    private suspend fun importGuestAnswers(): Boolean {
        val accountId = user?.text("id").orEmpty()
        val token = api.token ?: return false
        val key = "guest-import:$accountId"
        if (accountId.isBlank() || !inFlight.add(key)) return false
        var updated = false
        try {
            while (api.token == token && user?.text("id") == accountId) {
                val queue = guestAnswerQueue()
                val pending = queue.getJSONObject("pending")
                val unassigned = queue.optJSONArray("answers") ?: JSONArray()
                if (!pending.has(accountId) && unassigned.length() > 0) {
                    pending.put(
                        accountId,
                        json("requestId" to UUID.randomUUID().toString(), "answers" to unassigned),
                    )
                    queue.put("answers", JSONArray())
                    saveGuestAnswerQueue(queue)
                }
                val batch = pending.optJSONObject(accountId) ?: break
                val requestId = batch.text("requestId")
                val answers = batch.getJSONArray("answers")
                val result =
                    api.request(
                        "/learning/guest-answers",
                        "POST",
                        json(
                            "accountId" to accountId,
                            "requestId" to requestId,
                            "answers" to answers,
                        ),
                    )
                if (api.token != token || user?.text("id") != accountId) break
                val imported = result.optInt("imported", -1)
                val skipped = result.optInt("skipped", -1)
                val refreshed = result.getJSONObject("progress")
                check(imported in 0..answers.length() && skipped == answers.length() - imported)
                check(refreshed.has("answeredTaps") && refreshed.has("totalXp"))
                val current = guestAnswerQueue()
                val currentPending = current.getJSONObject("pending")
                if (currentPending.optJSONObject(accountId)?.text("requestId") != requestId) break
                currentPending.remove(accountId)
                saveGuestAnswerQueue(current)
                progress = refreshed
                guestImportSkipped += skipped
                guestImportFailed = false
                updated = true
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            if (api.token == token && user?.text("id") == accountId) guestImportFailed = true
        } finally {
            inFlight.remove(key)
        }
        return updated
    }

    private fun invalidateSession() {
        identity++
        user = null
        guestImportFailed = false
        guestImportSkipped = 0
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
     * Permanently deletes the account. The token is forgotten only after the server confirms with
     * 204; on any failure the account and the session stay as they were.
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
        guestImportFailed = false
        guestImportSkipped = 0
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
        tab = 0
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
                rememberGuestAnswer(q.id, choice)
            }
    }

    fun requireLogin(reason: String = "progress"): Boolean {
        if (user == null) {
            openLogin(reason)
            return false
        }
        return true
    }

    fun like(q: Question) {
        if (!requireLogin("like")) return
        action("like:${q.id}") {
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
        if (!requireLogin("save")) return
        action("save:${q.id}") {
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
        if (!requireLogin("comment")) return
        action {
            val body = json("text" to text, "kind" to kind, "requestId" to requestId)
            parent?.let { body.put("parentId", it) }
            api.request("/learning/questions/${q.id}/comments", "POST", body)
            comments = api.request("/learning/questions/${q.id}/comments").objects("comments")
            onSuccess()
        }
    }

    fun helpful(q: Question, c: JSONObject) {
        if (!requireLogin("comment")) return
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
        if (!requireLogin("comment")) return
        action {
            val id = c.text("id")
            api.request(
                "/learning/questions/${q.id}/comments/$id/reports",
                "POST",
                json("reason" to reason, "details" to details.trim()),
            )
            // The server hides a reported comment (and its replies) from the reporter.
            comments = comments.filter { it.text("id") != id && it.text("parentId") != id }
            notice =
                text(
                    "報告を受け付けました。このコメントは非表示になりました。",
                    "Report received. This comment is now hidden for you.",
                )
            onDone()
        }
    }

    /**
     * Blocks a learner: their questions leave this device's lists and the server hides their
     * comments.
     */
    fun blockUser(id: String, name: String, reload: Question? = null) {
        if (!requireLogin("comment")) return
        action {
            api.request("/learning/blocks/$id", "PUT")
            blocked =
                listOf(json("id" to id, "displayName" to name)) +
                    blocked.filter { it.text("id") != id }
            val hidden = { q: Question -> q.author?.text("id") == id }
            questions = questions.filterNot(hidden)
            collection = collection.filterNot(hidden)
            if (focused?.let(hidden) == true) {
                focused = null
                sheet = ""
                if (screen == "question") screen = "home"
            }
            reload?.let {
                comments = api.request("/learning/questions/${it.id}/comments").objects("comments")
            }
            notice = text("${name}さんをブロックしました。", "You blocked $name.")
        }
    }

    fun unblockUser(id: String) = action {
        api.request("/learning/blocks/$id", "DELETE")
        blocked = blocked.filter { it.text("id") != id }
        resetFeed()
    }

    fun assess(q: Question, answer: String, requestId: String) {
        if (!requireLogin("explain")) return
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
        if (!requireLogin("ask")) return
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
        if (!requireLogin("comment")) return
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
