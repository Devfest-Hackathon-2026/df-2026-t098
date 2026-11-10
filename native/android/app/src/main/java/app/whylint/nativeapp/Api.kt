package app.whylint.nativeapp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URI
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

internal fun json(vararg values: Pair<String, Any?>) =
    JSONObject().apply { values.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }

internal fun JSONObject.objects(key: String): List<JSONObject> =
    optJSONArray(key)
        ?.let { array -> (0 until array.length()).mapNotNull { array.optJSONObject(it) } }
        .orEmpty()

internal fun JSONObject.strings(key: String): List<String> =
    optJSONArray(key)?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()

internal fun JSONObject.text(key: String): String = if (isNull(key)) "" else optString(key, "")

internal class TokenVault(context: Context) {
    private val scope =
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(BuildConfig.API_URL.toByteArray())
            .joinToString("") { "%02x".format(it) }
    private val preferences = context.getSharedPreferences("session.$scope", Context.MODE_PRIVATE)
    private val alias = "whylint.session.v1.$scope"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let {
            return it
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                            alias,
                            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                        )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build()
                )
            }
            .generateKey()
    }

    fun read(): String? =
        try {
            preferences.getString("token", null)?.let {
                val data = Base64.decode(it, Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, data.copyOfRange(0, 12)),
                )
                String(cipher.doFinal(data.copyOfRange(12, data.size)), Charsets.UTF_8)
            }
        } catch (_: java.security.GeneralSecurityException) {
            // The stored token can no longer be decrypted (the key was reset or the data is
            // damaged), so it is useless and removed.
            clear()
            null
        } catch (_: Exception) {
            // A temporary storage failure must not sign the learner out; the next launch retries.
            null
        }

    fun write(token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        check(
            preferences
                .edit()
                .putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit()
        )
    }

    @Suppress("ApplySharedPref")
    fun clear() {
        preferences.edit().remove("token").commit()
    }
}

internal class ApiError(val status: Int, val code: String) : Exception(code)

internal class Api(context: Context) {
    private val vault = TokenVault(context)
    @Volatile
    var token: String? = vault.read()
        private set

    fun signIn(value: String) {
        vault.write(value)
        token = value
    }

    fun forget() {
        token = null
        vault.clear()
    }

    suspend fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
    ): JSONObject =
        withContext(Dispatchers.IO) {
            val session = if (path.startsWith("/auth/mobile/")) null else token
            val connection =
                URI(BuildConfig.API_URL + "/api/v1" + path).toURL().openConnection()
                    as HttpURLConnection
            try {
                connection.requestMethod = method
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 10_000
                connection.readTimeout =
                    if (
                        path.contains("/batches") ||
                            path.endsWith("/attempts") ||
                            path.endsWith("/follow-ups") ||
                            (path == "/learning/questions" && method == "POST")
                    )
                        75_000
                    else if (path == "/learning/guest-answers") 30_000 else 15_000
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("Cache-Control", "no-store")
                session?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
                body?.let {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { output ->
                        output.write(it.toString().toByteArray(Charsets.UTF_8))
                    }
                }
                val status = connection.responseCode
                if (status == 204) return@withContext JSONObject()
                val raw =
                    (if (status in 200..299) connection.inputStream else connection.errorStream)
                        ?.bufferedReader()
                        ?.use { it.readText() }
                        .orEmpty()
                val result =
                    try {
                        JSONObject(raw)
                    } catch (_: Exception) {
                        JSONObject()
                    }
                if (status !in 200..299) {
                    if (status == 401 && session != null && token == session) forget()
                    throw ApiError(status, result.optString("code", "REQUEST_FAILED"))
                }
                result
            } catch (e: ApiError) {
                throw e
            } catch (_: Exception) {
                throw ApiError(0, "UNAVAILABLE")
            } finally {
                connection.disconnect()
            }
        }
}

internal data class QuizAnswer(
    val choice: Int,
    val correct: Boolean,
    val correctOption: Int,
    val explanation: String,
) {
    companion object {
        fun parse(j: JSONObject) =
            QuizAnswer(
                j.optInt("choice"),
                j.optBoolean("correct"),
                j.optInt("correctOption"),
                j.text("quickExplanation"),
            )
    }
}

internal data class Question(
    val id: String,
    val title: String,
    val prompt: String,
    val code: String,
    val codeLanguage: String,
    val topics: List<String>,
    val difficulty: String,
    val format: String,
    val options: List<String>,
    val likes: Int,
    val liked: Boolean,
    val saved: Boolean,
    val author: JSONObject?,
    val references: List<JSONObject>,
    val tap: QuizAnswer?,
    val daily: Boolean = false,
) {
    companion object {
        fun parse(j: JSONObject, daily: Boolean = false) =
            Question(
                j.text("id"),
                j.text("title"),
                j.text("prompt"),
                j.text("code"),
                j.text("codeLanguage"),
                j.strings("topics"),
                j.text("difficulty"),
                j.text("format"),
                j.strings("options"),
                j.optInt("likes"),
                j.optBoolean("liked"),
                j.optBoolean("saved"),
                j.optJSONObject("author"),
                j.objects("references"),
                j.optJSONObject("tap")?.let(QuizAnswer::parse),
                daily,
            )
    }
}
