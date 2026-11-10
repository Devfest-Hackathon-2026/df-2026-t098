@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    androidx.compose.foundation.layout.ExperimentalLayoutApi::class,
)

package app.whylint.nativeapp

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.input.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.*
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import coil.compose.AsyncImage
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.util.UUID
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private val Sans = FontFamily(Font(R.font.dm_sans))
private val Mono = FontFamily(Font(R.font.dm_mono))
private val Dark =
    darkColorScheme(
        secondaryContainer = Color(0xff292929),
        onSecondaryContainer = Color(0xfff5f5f2),
        surfaceVariant = Color(0xff222222),
        outlineVariant = Color(0xff333333),
        primary = Color(0xffc6f24e),
        onPrimary = Color(0xff111111),
        background = Color(0xff080808),
        surface = Color(0xff151515),
        onBackground = Color(0xfff5f5f2),
        onSurface = Color(0xfff5f5f2),
        onSurfaceVariant = Color(0xffb4b4ac),
        outline = Color(0xff333333),
        secondary = Color(0xffc6f24e),
        error = Color(0xffff6b6b),
    )
private val Light =
    lightColorScheme(
        secondaryContainer = Color(0xffd3e3b4),
        onSecondaryContainer = Color(0xff131811),
        surfaceVariant = Color(0xffe3e9d8),
        outlineVariant = Color(0xffaab6a2),
        primary = Color(0xff3d5d00),
        onPrimary = Color.White,
        background = Color(0xffe9eee1),
        surface = Color.White,
        onBackground = Color(0xff131811),
        onSurface = Color(0xff131811),
        onSurfaceVariant = Color(0xff465142),
        outline = Color(0xffaab6a2),
        secondary = Color(0xff3d5d00),
        error = Color(0xffc2362f),
    )
private val typography =
    Typography().let { t ->
        t.copy(
            bodyLarge = t.bodyLarge.copy(fontFamily = Sans, fontSize = 16.sp),
            bodyMedium = t.bodyMedium.copy(fontFamily = Sans, fontSize = 14.sp),
            bodySmall = t.bodySmall.copy(fontFamily = Sans, fontSize = 12.sp),
            titleLarge = t.titleLarge.copy(fontFamily = Sans, fontWeight = FontWeight.Bold),
            titleMedium = t.titleMedium.copy(fontFamily = Sans, fontWeight = FontWeight.SemiBold),
            labelLarge = t.labelLarge.copy(fontFamily = Sans, fontWeight = FontWeight.SemiBold),
            headlineMedium = t.headlineMedium.copy(fontFamily = Sans, fontWeight = FontWeight.Bold),
        )
    }

@Composable
internal fun WhyLint(m: AppModel) {
    val density = LocalDensity.current
    val activity = androidx.activity.compose.LocalActivity.current
    SideEffect {
        activity?.window?.let { window ->
            androidx.core.view.WindowCompat.getInsetsController(window, window.decorView).apply {
                isAppearanceLightStatusBars = !m.dark
                isAppearanceLightNavigationBars = !m.dark
            }
        }
    }
    MaterialTheme(colorScheme = if (m.dark) Dark else Light, typography = typography) {
        CompositionLocalProvider(
            LocalDensity provides Density(density.density, density.fontScale * m.readingSize)
        ) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                    when {
                        m.localeLoading -> Loading(m.text("画面を読み込み中…", "Loading WhyLint…"))
                        m.screen == "login" || m.screen == "signup" -> AuthScreen(m)
                        m.screen == "onboarding" -> Onboarding(m)
                        m.screen == "creator" -> Creator(m)
                        m.screen == "question" ->
                            Column {
                                BackRow(m, onBack = m::closeQuestion)
                                val question = m.focused
                                val error = m.sharedQuestionError
                                when {
                                    question != null ->
                                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                                            QuestionCard(
                                                m,
                                                question,
                                                Modifier.widthIn(max = 760.dp).fillMaxWidth()
                                                    .fillMaxHeight().padding(16.dp),
                                            )
                                        }
                                    error != null -> Empty(
                                        error,
                                        if (m.canRetrySharedQuestion) m.text("再試行", "Retry")
                                        else m.text("フィードに戻る", "Back to feed"),
                                        action = {
                                            if (m.canRetrySharedQuestion) m.retrySharedQuestion()
                                            else {
                                                m.closeQuestion()
                                                m.changeTab(0)
                                            }
                                        },
                                    )
                                    else -> Loading(m.text("問題を読み込み中…", "Loading question…"))
                                }
                            }
                        else -> Home(m)
                    }
                }
                if (m.sheet.isNotEmpty() && m.focused != null) {
                    ModalBottomSheet(
                        onDismissRequest = { m.sheet = "" },
                        containerColor = MaterialTheme.colorScheme.surface,
                        contentWindowInsets = { WindowInsets.safeDrawing },
                    ) {
                        QuestionSheet(m, m.focused!!)
                    }
                }
            }
            BackHandler(m.screen != "home") {
                when (m.screen) {
                    "question" -> m.closeQuestion()
                    "login", "signup" -> m.closeLogin()
                    else -> m.screen = "home"
                }
            }
            var splash by rememberSaveable { mutableStateOf(true) }
            if (splash) Splash(m.dark) { splash = false }
        }
    }
}

@Composable
private fun Brand(compact: Boolean = true, size: Int = if (compact) 20 else 18) {
    val dark = MaterialTheme.colorScheme.background == Dark.background
    val resource =
        when {
            compact && dark -> R.drawable.brand_mark_dark
            compact -> R.drawable.brand_mark_light
            dark -> R.drawable.brand_wordmark_dark
            else -> R.drawable.brand_wordmark_light
        }
    val painter = painterResource(resource)
    val width = with(LocalDensity.current) { painter.intrinsicSize.width.toDp() }
    Image(
        painter = painter,
        contentDescription = "WhyLint",
        modifier =
            Modifier.width(width * (size / 18f))
                .aspectRatio(painter.intrinsicSize.width / painter.intrinsicSize.height),
    )
}

@Composable
private fun Header(m: AppModel) {
    Row(
        Modifier.fillMaxWidth().height(54.dp).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Brand()
        Spacer(Modifier.weight(1f))
        val colors = MaterialTheme.colorScheme
        if (m.user != null)
            Row(
                Modifier.background(
                        colors.outline.copy(alpha = if (m.dark) .55f else .35f),
                        RoundedCornerShape(24.dp),
                    )
                    .padding(9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    androidx.compose.ui.res.painterResource(R.drawable.web_flame),
                    m.text("連続学習日数", "Day streak"),
                    Modifier.size(16.dp),
                    tint = Color(0xffff9f43),
                )
                Text(" " + m.progress.optInt("streak"), fontSize = 12.sp)
            }
        Spacer(Modifier.width(6.dp))
        Row(
            Modifier.background(
                    colors.outline.copy(alpha = if (m.dark) .55f else .35f),
                    RoundedCornerShape(24.dp),
                )
                .padding(9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (m.user == null)
                Icon(
                    androidx.compose.ui.res.painterResource(R.drawable.web_check),
                    null,
                    Modifier.size(15.dp),
                )
            else
                CircularProgressIndicator(
                    progress = {
                        (m.progress.optDouble("dailyCompleted") /
                                m.progress.optInt("dailyGoal", 5).coerceAtLeast(1))
                            .toFloat()
                            .coerceIn(0f, 1f)
                    },
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = colors.primary,
                )
            Text(
                if (m.user == null) " " + m.guestCorrect + "/" + m.guestAnswered
                else
                    " " +
                        m.progress.optInt("dailyCompleted") +
                        "/" +
                        m.progress.optInt("dailyGoal"),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(6.dp))
        if (m.user == null)
            TextButton(
                onClick = { m.openLogin("progress") },
                colors =
                    ButtonDefaults.textButtonColors(
                        containerColor = colors.outline.copy(alpha = if (m.dark) .55f else .35f)
                    ),
                shape = RoundedCornerShape(24.dp),
            ) {
                Text(m.text("ログインして記録", "Save progress"), fontSize = 12.sp)
            }
        else
            Row(
                Modifier.background(
                        colors.outline.copy(alpha = if (m.dark) .55f else .35f),
                        RoundedCornerShape(24.dp),
                    )
                    .padding(9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Lv " + m.progress.optInt("level", 1), fontSize = 12.sp)
                Spacer(Modifier.width(6.dp))
                LinearProgressIndicator(
                    progress = { (m.progress.optInt("totalXp") % 100) / 100f },
                    modifier = Modifier.width(28.dp),
                    color = colors.primary,
                )
            }
    }
}

private val tabIcons =
    listOf(
        R.drawable.web_feed,
        R.drawable.web_review,
        R.drawable.web_rank,
        R.drawable.web_publish,
        R.drawable.web_profile,
    )

@Composable
private fun Home(m: AppModel) {
    var showingSettings by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        Header(m)
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        if (m.tab == 0 && m.error.isNotBlank() && m.questions.isNotEmpty())
            Row(
                Modifier.padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    m.error,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                )
                IconButton(onClick = { m.error = "" }) {
                    Icon(Icons.Outlined.Close, m.text("閉じる", "Dismiss"))
                }
            }
        Box(Modifier.weight(1f)) {
            when (m.tab) {
                0 -> Feed(m)
                1 -> Collection(m)
                2 -> Ranking(m)
                3 -> Publish(m)
                4 ->
                    if (showingSettings) Settings(m) { showingSettings = false }
                    else Profile(m) { showingSettings = true }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            listOf(
                    m.text("フィード", "Feed"),
                    m.text("復習", "Practice"),
                    m.text("ランキング", "Ranking"),
                    m.text("投稿", "Post"),
                    m.text("プロフィール", "Profile"),
                )
                .forEachIndexed { i, label ->
                    Column(
                        Modifier.weight(1f)
                            .heightIn(min = 48.dp)
                            .selectable(
                                m.tab == i,
                                role = Role.Tab,
                                onClick = {
                                    showingSettings = false
                                    m.changeTab(i)
                                },
                            )
                            .padding(vertical = 7.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        val color =
                            if (m.tab == i) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        Icon(
                            androidx.compose.ui.res.painterResource(tabIcons[i]),
                            null,
                            Modifier.size(22.dp),
                            tint = color,
                        )
                        Text(
                            label,
                            fontSize = 10.sp,
                            color = color,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 3.dp),
                        )
                    }
                }
        }
    }
}

@Composable
private fun Feed(m: AppModel) {
    if (m.sessionError) {
        Empty(
            m.text(
                "接続できませんでした。ログインは維持されています。通信状況を確認して、もう一度お試しください。",
                "Could not connect. You are still signed in; check your connection and try again.",
            ),
            m.text("再試行", "Retry"),
            m::refreshSession,
        )
        return
    }
    if (m.questions.isEmpty()) {
        if (m.loading || m.sessionLoading) Loading(m.text("問題を読み込み中…", "Loading questions…"))
        else
            Empty(
                m.error.ifBlank { m.text("問題の準備ができていません。", "Questions are not ready yet.") },
                m.text("再試行", "Retry"),
                m::loadFeed,
            )
        return
    }
    val pager = rememberPagerState(pageCount = { m.questions.size })
    val pagerScope = rememberCoroutineScope()
    LaunchedEffect(pager.currentPage, m.questions.size) {
        if (pager.currentPage >= m.questions.size - 3) m.nearEnd()
    }
    Column {
        if (m.generating)
            Text(
                m.text("Geminiがあなた向けの問題を作成中…", "Gemini is writing your next questions…"),
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        if (!m.generating && m.generationError.isNotBlank())
            Row(
                Modifier.padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    m.generationError,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                )
                TextButton(onClick = m::generate) { Text(m.text("再試行", "Retry")) }
            }
        VerticalPager(pager, modifier = Modifier.weight(1f), key = { m.questions[it].id }) { index
            ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                QuestionCard(
                    m,
                    m.questions[index],
                    Modifier.widthIn(max = 760.dp)
                        .fillMaxWidth()
                        .fillMaxHeight()
                        .padding(horizontal = 16.dp, vertical = 7.dp),
                    onNext = {
                        pagerScope.launch {
                            if (pager.currentPage + 1 < pager.pageCount)
                                pager.animateScrollToPage(pager.currentPage + 1)
                            else m.nearEnd()
                        }
                    },
                )
            }
        }
    }
}

private fun syntax(code: String, dark: Boolean): AnnotatedString {
    val regex =
        Regex(
            "(//[^\\n]*|#[^\\n]*|\"[^\"]*\"|'[^']*'|\\b(?:const|let|var|function|return|if|else|class|import|from|SELECT|FROM|WHERE|WHER|public|static|void|fun|val|def|print|console|true|false|null)\\b|\\b[0-9]+\\b)"
        )
    return buildAnnotatedString {
        var last = 0
        regex.findAll(code).forEach { match ->
            append(code.substring(last, match.range.first))
            val s = match.value
            val color =
                when {
                    s.startsWith("//") || s.startsWith("#") ->
                        if (dark) Color(0xffa0aaa0) else Color(0xff556254)
                    s.startsWith("\"") || s.startsWith("'") ->
                        if (dark) Color(0xffc5dd9a) else Color(0xff416813)
                    s.first().isDigit() -> if (dark) Color(0xfff0c48f) else Color(0xff895214)
                    else -> if (dark) Color(0xffd7b9f4) else Color(0xff6d328e)
                }
            withStyle(SpanStyle(color = color)) { append(s) }
            last = match.range.last + 1
        }
        append(code.substring(last))
    }
}

@Composable
private fun QuestionCard(
    m: AppModel,
    q: Question,
    modifier: Modifier = Modifier,
    onNext: (() -> Unit)? = null,
) {
    val colors = MaterialTheme.colorScheme
    var picked by remember(q.id) { mutableIntStateOf(-1) }
    val choose: (Int) -> Unit = { option ->
        picked = option
        m.answer(q, option)
    }
    BoxWithConstraints(modifier) {
        val fontScale = LocalDensity.current.fontScale
        val width = maxWidth
        val wide = width >= 620.dp && maxHeight >= 300.dp && fontScale <= 1.25f
        val binaryFits =
            q.format == "true_false" && q.options.size == 2 &&
                width.value >= 310 * fontScale && q.options.all { it.length <= 8 }
        val shape = RoundedCornerShape(16.dp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState())
                    .background(colors.surface, shape)
                    .border(1.dp, colors.outline, shape)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                QuestionHeading(m, q)
                if (q.code.isNotBlank()) QuestionCode(m, q, picked, choose)
                if (q.format != "spot_bug" && q.options.isNotEmpty()) {
                    if (binaryFits) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            q.options.forEachIndexed { index, option ->
                                QuestionOption(m, q, index, option, Modifier.weight(1f), choose)
                            }
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            q.options.forEachIndexed { index, option ->
                                QuestionOption(m, q, index, option, Modifier.fillMaxWidth(), choose)
                            }
                        }
                    }
                }
                q.tap?.let { QuestionFeedback(m, q, it, onNext) }
                if (m.pendingAnswerId == q.id)
                    LinearProgressIndicator(Modifier.fillMaxWidth(), color = colors.primary)
                if (picked >= 0 && q.tap == null)
                    m.answerFailure?.takeIf { it.first == q.id }?.let { (_, error) ->
                        ErrorText(error)
                        TextButton(onClick = { m.answer(q, picked) }, enabled = !m.busy) {
                            Text(m.text("回答を再試行", "Retry answer"))
                        }
                    }
                OutlinedButton(
                    onClick = { if (m.requireLogin("explain")) m.open(q, "explain") },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, colors.primary.copy(alpha = .6f)),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Icon(painterResource(R.drawable.web_pencil), null, Modifier.size(20.dp), tint = colors.primary)
                    Column(Modifier.weight(1f).padding(start = 10.dp)) {
                        Text(m.text("なぜ？", "Explain why"), color = colors.onSurface, fontWeight = FontWeight.Bold)
                        Text(
                            m.text("Geminiが採点 · +15 XP", "Graded by Gemini · +15 XP"),
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
                if (q.tap != null)
                    TextButton(onClick = { if (m.requireLogin("ask")) m.open(q, "ask") }) {
                        Icon(painterResource(R.drawable.web_comment), null, Modifier.size(18.dp))
                        Text(m.text("質問する", "Ask Gemini"), Modifier.padding(start = 8.dp))
                    }
                if (!wide) QuestionActions(m, q, columns = if (width.value >= 355 * fontScale) 4 else 2)
                if (q.references.isNotEmpty()) {
                    HorizontalDivider(color = colors.outline)
                    Column {
                        Text(
                            m.text("さらに学ぶ", "Further reading"),
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.semantics { heading() },
                        )
                        QuestionReferences(q)
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = { if (m.requireLogin("report")) m.open(q, "report") },
                        contentPadding = PaddingValues(horizontal = 0.dp),
                    ) {
                        Icon(Icons.Outlined.Flag, null, Modifier.size(18.dp), tint = colors.onSurfaceVariant)
                        Text(
                            m.text("問題を報告", "Report a problem"),
                            Modifier.padding(start = 6.dp),
                            color = colors.onSurfaceVariant,
                        )
                    }
                    if (q.author != null)
                        TextButton(onClick = { m.open(q, "details") }) {
                            Text(m.text("詳細", "Details"))
                        }
                }
                if (m.reportedQuestionId == q.id && m.notice.isNotBlank())
                    Text(
                        m.notice,
                        color = colors.onSurfaceVariant,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
            }
            if (wide) Box(Modifier.width(76.dp)) { QuestionActions(m, q, columns = 1) }
        }
    }
}

@Composable
private fun QuestionHeading(m: AppModel, q: Question) {
    val colors = MaterialTheme.colorScheme
    val format =
        when (q.format) {
            "true_false" -> m.text("○か×か", "True or false")
            "predict_output" -> m.text("出力を予想", "Predict the output")
            "spot_bug" -> m.text("バグを探せ", "Spot the bug")
            "choice" -> m.text("選んで答える", "Pick one")
            else -> m.text("説明してみよう", "Explain it")
        }
    val topic = q.reasonTopic
    val reason =
        when {
            q.daily -> R.drawable.web_bug to m.text("今日のバグ", "Bug of the Day")
            q.reasonKind == "review" -> R.drawable.web_review to m.text("復習", "Review")
            q.reasonKind == "interest" && topic.isNotBlank() ->
                R.drawable.web_sparkle to m.text("${topic}に興味があるから", "Because you like $topic")
            q.reasonKind == "weak" && topic.isNotBlank() ->
                R.drawable.web_target to m.text("${topic}を克服しよう", "Because you missed $topic")
            q.reasonKind == "challenge" && topic.isNotBlank() ->
                R.drawable.web_bolt to m.text("${topic}の応用に挑戦", "Level up: $topic")
            q.source == "community" ->
                R.drawable.web_users to m.text("コミュニティの問題", "From the community")
            q.reasonKind == "general" ->
                R.drawable.web_book to m.text("みんなが知っておきたい基礎", "Core concept everyone needs")
            else -> null
        }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        reason?.let { (icon, label) ->
            Row(
                Modifier.background(colors.primary.copy(alpha = .14f), RoundedCornerShape(24.dp))
                    .padding(horizontal = 9.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(painterResource(icon), null, Modifier.size(14.dp), tint = colors.onSurface)
                Text(label, Modifier.padding(start = 5.dp), style = MaterialTheme.typography.bodySmall)
            }
        }
        Text(
            format,
            Modifier.border(1.dp, colors.outline, RoundedCornerShape(24.dp))
                .padding(horizontal = 9.dp, vertical = 5.dp),
            style = MaterialTheme.typography.bodySmall,
            color = colors.onSurfaceVariant,
        )
    }
    Text(
        q.prompt.ifBlank { q.title },
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().semantics { heading() },
    )
    val metadata = listOfNotNull(
        q.title.takeIf { it.isNotBlank() && it != q.prompt },
        if (q.source == "ai") m.text("Gemini が作成", "Created by Gemini")
        else q.author?.text("displayName")?.takeIf { it.isNotBlank() },
        q.difficulty.takeIf { it.isNotBlank() }?.let { difficultyLabel(m, it) },
        q.topics.filter { it.isNotBlank() && it != "general" }.take(3).joinToString(" · ").takeIf { it.isNotBlank() },
    )
    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        metadata.forEach { label ->
            Text(label, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        }
    }
}

@Composable
private fun QuestionCode(m: AppModel, q: Question, picked: Int, onChoose: (Int) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val codeSize = 13f
    val lines = remember(q.code) { q.code.lines() }
    val highlighted = remember(lines, m.dark) { lines.map { syntax(it, m.dark) } }
    val bugOptions = remember(q.options) {
        val digits = Regex("\\d+")
        q.options.map { digits.find(it)?.value?.toIntOrNull() }
    }
    Column(
        Modifier.fillMaxWidth()
            .background(if (m.dark) Color(0xff090909) else Color(0xffe0e7d4), RoundedCornerShape(12.dp)),
    ) {
        FlowRow(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                q.codeLanguage.ifBlank { m.text("コード", "Code") },
                fontFamily = Mono,
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
            )
            if (q.format == "spot_bug" && q.tap == null)
                Text(
                    m.text("バグのある行をタップ", "Tap the buggy line"),
                    color = colors.primary,
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.bodySmall,
                )
        }
        HorizontalDivider(color = colors.outline)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val viewport = maxWidth
            Column(
                Modifier.horizontalScroll(rememberScrollState())
                    .widthIn(min = viewport)
                    .width(IntrinsicSize.Max)
                    .padding(vertical = 5.dp)
            ) {
                lines.forEachIndexed { index, line ->
                    val option = if (q.format == "spot_bug") bugOptions.indexOf(index + 1) else -1
                    val isCorrect = q.tap?.correctOption == option && option >= 0
                    val isMissed = !isCorrect && q.tap?.choice == option && option >= 0
                    val state =
                        when {
                            isCorrect -> colors.primary.copy(alpha = .16f)
                            isMissed -> colors.error.copy(alpha = .16f)
                            picked == option && option >= 0 -> colors.primary.copy(alpha = .12f)
                            else -> Color.Transparent
                        }
                    Row(
                        Modifier.fillMaxWidth()
                            .heightIn(min = if (option >= 0) 48.dp else 22.dp)
                            .background(state)
                            .then(
                                if (option >= 0 && q.tap == null)
                                    Modifier.drawBehind {
                                        drawRect(colors.primary.copy(alpha = .55f), size = Size(3.dp.toPx(), size.height))
                                    }
                                else Modifier
                            )
                            .then(
                                if (option >= 0)
                                    Modifier.clickable(enabled = q.tap == null && !m.busy, role = Role.Button) {
                                        onChoose(option)
                                    }.semantics {
                                        contentDescription = m.text("${index + 1}行目: $line", "Line ${index + 1}: $line")
                                        answerState(m, q, option)?.let { stateDescription = it }
                                    }
                                else Modifier
                            )
                            .padding(horizontal = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (q.format == "spot_bug") {
                            Box(Modifier.width(16.dp), Alignment.Center) {
                                if (isCorrect || isMissed)
                                    Icon(
                                        if (isCorrect) Icons.Outlined.Check else Icons.Outlined.Close,
                                        null,
                                        Modifier.size(12.dp),
                                        tint = if (isCorrect) colors.primary else colors.error,
                                    )
                            }
                        }
                        Text(
                            (index + 1).toString(),
                            fontFamily = Mono,
                            fontSize = codeSize.sp,
                            color = colors.onSurfaceVariant,
                            modifier = Modifier.widthIn(min = 25.dp).padding(end = 4.dp),
                        )
                        Text(highlighted[index], fontFamily = Mono, fontSize = codeSize.sp, softWrap = false)
                    }
                }
            }
        }
    }
}

private fun answerState(m: AppModel, q: Question, option: Int): String? =
    when {
        q.tap?.correctOption == option && q.tap.choice == option ->
            m.text("あなたの回答・正解", "Your answer, correct")
        q.tap?.correctOption == option -> m.text("正解", "Correct answer")
        q.tap?.choice == option -> m.text("あなたの回答・不正解", "Your answer, incorrect")
        else -> null
    }

@Composable
private fun QuestionOption(
    m: AppModel, q: Question, index: Int, option: String, modifier: Modifier, onChoose: (Int) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val correct = q.tap?.correctOption == index
    val missed = !correct && q.tap?.choice == index
    val border = if (correct) colors.primary else if (missed) colors.error else colors.outline
    val label = if (q.format == "true_false") (if (index == 0) "○" else "×") else ('A' + index).toString()
    OutlinedButton(
        onClick = { onChoose(index) },
        enabled = q.tap == null && !m.busy,
        modifier = modifier.heightIn(min = 48.dp).semantics {
            answerState(m, q, index)?.let { stateDescription = it }
        },
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = colors.surfaceVariant,
            disabledContainerColor = border.copy(alpha = .12f),
        ),
        border = BorderStroke(if (correct || missed) 2.dp else 1.dp, border),
        contentPadding = PaddingValues(horizontal = 9.dp, vertical = 7.dp),
    ) {
        Box(
            Modifier.background(colors.background, RoundedCornerShape(6.dp))
                .padding(horizontal = 6.dp, vertical = 3.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label,
                color = colors.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        Text(
            option,
            Modifier.weight(1f).padding(start = 8.dp),
            color = colors.onSurface,
            fontFamily = if (q.format == "predict_output") Mono else Sans,
            style = MaterialTheme.typography.bodyMedium,
        )
        Box(Modifier.size(18.dp), Alignment.Center) {
            if (correct || missed)
                Icon(
                    if (correct) Icons.Outlined.Check else Icons.Outlined.Close,
                    null,
                    Modifier.fillMaxSize(),
                    tint = border,
                )
        }
    }
}

@Composable
private fun QuestionFeedback(m: AppModel, q: Question, answer: QuizAnswer, onNext: (() -> Unit)?) {
    val colors = MaterialTheme.colorScheme
    val tint = if (answer.correct) colors.primary else colors.error
    FlowRow(
        Modifier.fillMaxWidth()
            .background(tint.copy(alpha = .10f), RoundedCornerShape(10.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 4.dp).semantics { liveRegion = LiveRegionMode.Polite },
        ) {
            Icon(if (answer.correct) Icons.Outlined.Check else Icons.Outlined.Close, null, Modifier.size(18.dp), tint)
            Text(
                if (answer.correct) m.text("正解！", "Correct!") else m.text("おしい！", "Not quite"),
                Modifier.padding(start = 6.dp),
                fontWeight = FontWeight.Bold,
                color = tint,
            )
        }
        TextButton(onClick = { m.open(q, "details") }, contentPadding = PaddingValues(horizontal = 8.dp)) {
            Text(m.text("解説を読む", "Read feedback"))
        }
        onNext?.let { next ->
            Button(onClick = next, contentPadding = PaddingValues(horizontal = 12.dp)) {
                Text(m.text("次へ", "Next"))
            }
        }
    }
}

@Composable
private fun QuestionReferences(q: Question) {
    val uri = LocalUriHandler.current
    q.references.forEach { ref ->
        val title = ref.text("title")
        val url = ref.text("url")
        if (title.isNotBlank() && url.startsWith("https://"))
            TextButton(
                onClick = { openLink(uri, url) },
                contentPadding = PaddingValues(horizontal = 0.dp),
            ) {
                Text(title, textDecoration = TextDecoration.Underline)
            }
    }
}

@Composable
private fun QuestionActions(m: AppModel, q: Question, columns: Int) {
    val context = LocalContext.current
    FlowRow(
        Modifier.fillMaxWidth(),
        maxItemsInEachRow = columns,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        QuestionAction(
            if (q.liked) R.drawable.web_like_filled else R.drawable.web_like, q.likes.toString(),
            m.text("いいね ${q.likes}件", "Like, ${q.likes} likes"), Modifier.weight(1f), q.liked,
        ) { m.like(q) }
        QuestionAction(
            R.drawable.web_comment, m.text("コメント", "Comments"), null, Modifier.weight(1f),
            enabled = !m.busy,
        ) { m.open(q, "comments") }
        QuestionAction(
            R.drawable.web_share, m.text("共有", "Share"), null, Modifier.weight(1f),
        ) {
            context.startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, q.title + "\nhttps://whylint.com/questions/${q.id}")
                    },
                    m.text("共有", "Share"),
                )
            )
        }
        QuestionAction(
            if (q.saved) R.drawable.web_save_filled else R.drawable.web_save,
            m.text("保存", "Save"), null, Modifier.weight(1f), q.saved,
        ) { m.save(q) }
    }
}

@Composable
private fun QuestionAction(
    icon: Int, label: String, description: String?, modifier: Modifier,
    selected: Boolean? = null, enabled: Boolean = true, onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val tint = if (selected == true) colors.primary else colors.onSurfaceVariant
    Column(
        modifier.heightIn(min = 48.dp).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics {
                description?.let { contentDescription = it }
                selected?.let { this.selected = it }
            }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Box(Modifier.size(34.dp).background(colors.surfaceVariant, CircleShape), Alignment.Center) {
            Icon(painterResource(icon), null, Modifier.size(19.dp), tint)
        }
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = tint,
            textAlign = TextAlign.Center,
            modifier = if (description != null) Modifier.clearAndSetSemantics {} else Modifier,
        )
    }
}

@Composable
private fun BackRow(m: AppModel, title: String = "", onBack: () -> Unit = { m.screen = "home" }) {
    Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, m.text("戻る", "Back"))
        }
        Text(title, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Box(Modifier.padding(end = 16.dp)) { Brand() }
    }
}

@Composable
private fun Loading(label: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(Modifier.size(26.dp), strokeWidth = 2.dp)
            Text(
                label,
                modifier = Modifier.padding(top = 16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Empty(message: String, button: String = "", action: () -> Unit = {}) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, lineHeight = 25.sp)
        if (button.isNotBlank())
            Button(
                onClick = action,
                modifier = Modifier.padding(top = 20.dp),
                shape = RoundedCornerShape(10.dp),
            ) {
                Text(button)
            }
    }
}

@Composable
private fun ErrorText(message: String) {
    if (message.isNotBlank())
        Text(
            message,
            color = MaterialTheme.colorScheme.error,
            fontSize = 14.sp,
            modifier =
                Modifier.padding(vertical = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
        )
}

@Composable
private fun Field(
    value: String,
    onValue: (String) -> Unit,
    label: String,
    password: Boolean = false,
    multiline: Boolean = false,
    enabled: Boolean = true,
) {
    Text(
        label,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        modifier = Modifier.padding(top = 10.dp, bottom = 4.dp),
    )
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        modifier =
            Modifier.fillMaxWidth().padding(vertical = 5.dp).semantics {
                contentDescription = label
            },
        singleLine = !multiline,
        minLines = if (multiline) 3 else 1,
        enabled = enabled,
        shape = RoundedCornerShape(10.dp),
        visualTransformation =
            if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions =
            KeyboardOptions(
                keyboardType = if (password) KeyboardType.Password else KeyboardType.Text
            ),
        textStyle = MaterialTheme.typography.bodyLarge,
        colors =
            OutlinedTextFieldDefaults.colors(
                unfocusedContainerColor =
                    if (MaterialTheme.colorScheme.background == Dark.background) Color(0xff1c1c1c)
                    else Color.White
            ),
    )
}

@Composable
private fun Primary(
    label: String,
    enabled: Boolean = true,
    accent: Boolean = false,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 4.dp),
        shape = RoundedCornerShape(10.dp),
        colors =
            ButtonDefaults.buttonColors(
                containerColor =
                    if (accent) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurface,
                contentColor =
                    if (accent) MaterialTheme.colorScheme.onPrimary
                    else MaterialTheme.colorScheme.surface,
                disabledContainerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = .12f),
                disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = .38f),
            ),
    ) {
        Text(label)
    }
}

/** A short numbered "how it works" for tabs a guest cannot use yet, so they are not empty. */
@Composable
private fun Steps(items: List<String>) {
    Column(
        Modifier.fillMaxWidth().padding(top = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items.forEachIndexed { index, item ->
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    (index + 1).toString(),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.width(28.dp),
                )
                Text(
                    item,
                    lineHeight = 22.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(label: String) {
    Text(
        label,
        fontSize = 22.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 20.dp, bottom = 12.dp).semantics { heading() },
    )
}

private fun openLink(uri: androidx.compose.ui.platform.UriHandler, url: String) {
    try {
        uri.openUri(url)
    } catch (_: Exception) {
        // No browser or mail app on this device; the text stays readable.
    }
}

/** Privacy policy and terms (and optionally the support contact), shown when configured. */
@Composable
private fun LegalLinks(m: AppModel, support: Boolean = false) {
    val uri = LocalUriHandler.current
    val base = BuildConfig.LEGAL_URL.takeIf { it.startsWith("https://") }
    val contact = BuildConfig.SUPPORT_CONTACT
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            if (base != null) {
                TextButton(
                    onClick = { openLink(uri, "$base/privacy") },
                    modifier = Modifier.heightIn(min = 48.dp).testTag("legal-privacy"),
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Text(
                        m.text("プライバシーポリシー", "Privacy policy"),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textDecoration = TextDecoration.Underline,
                    )
                }
                TextButton(
                    onClick = { openLink(uri, "$base/terms") },
                    modifier = Modifier.heightIn(min = 48.dp).testTag("legal-terms"),
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Text(
                        m.text("利用規約", "Terms of service"),
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textDecoration = TextDecoration.Underline,
                    )
                }
            }
        }
        if (support && contact.isNotBlank()) {
            val email = Regex("[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+").matches(contact)
            val web = contact.startsWith("https://")
            Row(
                Modifier.heightIn(min = 48.dp).testTag("support-contact"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    m.text("サポート: ", "Support: "),
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (email || web)
                    TextButton(
                        onClick = { openLink(uri, if (email) "mailto:$contact" else contact) },
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text(contact, fontSize = 13.sp, textDecoration = TextDecoration.Underline)
                    }
                else Text(contact, fontSize = 13.sp)
            }
        }
    }
}

/** Confirms blocking a learner; their comments and questions are hidden afterwards. */
@Composable
private fun BlockDialog(
    m: AppModel,
    id: String,
    name: String,
    reload: Question?,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(m.text("このユーザーをブロックしますか？", "Block this user?")) },
        text = {
            Text(
                m.text(
                    "${name}さんのコメントと質問は表示されなくなります。設定の「アカウント設定」から解除できます。",
                    "Comments and questions from $name will be hidden. You can unblock them in Account settings.",
                )
            )
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onDismiss()
                    m.blockUser(id, name, reload)
                },
                modifier = Modifier.testTag("confirm-block"),
            ) {
                Text(m.text("ブロック", "Block"), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(m.text("キャンセル", "Cancel")) } },
    )
}

@Composable
private fun AuthScreen(m: AppModel) {
    val signup = m.screen == "signup"
    var identifier by rememberSaveable(signup) { mutableStateOf("") }
    var email by rememberSaveable(signup) { mutableStateOf("") }
    var username by rememberSaveable(signup) { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var validation by remember { mutableStateOf("") }
    var googleBusy by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp)
    ) {
        Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
            Brand(compact = false, size = 18)
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        TextButton(
            onClick = m::closeLogin,
            contentPadding = PaddingValues(0.dp),
            modifier = Modifier.padding(top = 28.dp, bottom = 22.dp),
        ) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, Modifier.size(18.dp))
            Text(
                "  " + m.text("学習に戻る", "Back to learning"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            m.text(
                if (signup) "アカウントを作成" else "ログイン",
                if (signup) "Create an account" else "Sign in",
            ),
            fontSize = 30.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            m.loginReasonText()
                ?: if (signup)
                    m.text(
                        "進捗やXPを保存して、学習を続けましょう。",
                        "Create an account to keep your progress and XP.",
                    )
                else m.text("ログインして、学習を続けましょう。", "Sign in and continue learning with WhyLint."),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp, bottom = 24.dp).testTag("auth-reason"),
        )
        if (!signup)
            Text(
                m.text("メールアドレスまたはユーザー名でログインできます。", "Sign in with your email address or username."),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp),
            )
        if (signup) {
            Field(email, { email = it }, m.text("メールアドレス", "Email"))
            Field(username, { username = it }, m.text("ユーザー名", "Username"))
        } else
            Field(identifier, { identifier = it }, m.text("メールアドレスまたはユーザー名", "Email or username"))
        Field(password, { password = it }, m.text("パスワード", "Password"), password = true)
        if (signup)
            Text(
                m.text("15〜128文字で入力してください。", "Use 15–128 characters."),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        ErrorText(validation.ifBlank { m.error })
        Primary(
            if (m.busy) m.text("ログイン中…", "Signing in…")
            else
                m.text(
                    if (signup) "アカウントを作成" else "ログイン",
                    if (signup) "Create account" else "Sign in",
                ),
            !m.busy && !googleBusy,
            accent = true,
        ) {
            validation =
                when {
                    signup && email.isBlank() ->
                        m.text("メールアドレスを入力してください。", "Enter your email address.")
                    signup && username.isBlank() -> m.text("ユーザー名を入力してください。", "Enter a username.")
                    !signup && identifier.isBlank() ->
                        m.text("メールアドレスまたはユーザー名を入力してください。", "Enter your email or username.")
                    password.isBlank() -> m.text("パスワードを入力してください。", "Enter your password.")
                    password.isBlank() ||
                        password.length > 128 ||
                        (signup && password.length < 15) ->
                        m.text("パスワードの長さを確認してください。", "Check the password length.")
                    else -> ""
                }
            if (validation.isEmpty()) m.login(identifier, password, signup, email, username)
        }
        if (signup) ConsentNotice(m, signup = true)
        OutlinedButton(
            onClick = {
                m.screen = if (signup) "login" else "signup"
                m.error = ""
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 8.dp),
            shape = RoundedCornerShape(10.dp),
        ) {
            Text(
                m.text(
                    if (signup) "アカウントをお持ちですか？ ログイン" else "アカウントを作成",
                    if (signup) "Already have an account? Sign in" else "Create an account",
                )
            )
        }
        Row(
            Modifier.fillMaxWidth().padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HorizontalDivider(Modifier.weight(1f))
            Text(
                m.text(" または ", " or "),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            HorizontalDivider(Modifier.weight(1f))
        }
        OutlinedButton(
            onClick = {
                googleBusy = true
                m.error = ""
                scope.launch {
                    try {
                        val option =
                            GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_SERVER_CLIENT_ID)
                                .build()
                        val result =
                            CredentialManager.create(context)
                                .getCredential(
                                    context,
                                    GetCredentialRequest.Builder()
                                        .addCredentialOption(option)
                                        .build(),
                                )
                        val credential =
                            result.credential as? CustomCredential
                                ?: error("Unsupported credential")
                        val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
                        m.googleLogin(token)
                    } catch (_: GetCredentialCancellationException) {} catch (
                        _: androidx.credentials.exceptions.NoCredentialException) {
                        m.error =
                            m.text(
                                "端末にGoogleアカウントを追加するか、メールでログインしてください。",
                                "Add a Google account on this device, or sign in with email.",
                            )
                    } catch (_: Exception) {
                        m.error =
                            m.text(
                                "Googleログインを開始できませんでした。再試行するか、メールアドレスまたはユーザー名でログインしてください。",
                                "Google sign-in could not start. Try again or sign in with your email or username.",
                            )
                    } finally {
                        googleBusy = false
                    }
                }
            },
            enabled = !m.busy && !googleBusy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            shape = RoundedCornerShape(10.dp),
            colors =
                ButtonDefaults.outlinedButtonColors(
                    containerColor = Color.White,
                    contentColor = Color(0xff202124),
                ),
        ) {
            Icon(
                androidx.compose.ui.res.painterResource(R.drawable.google_g),
                null,
                Modifier.size(20.dp),
                tint = Color.Unspecified,
            )
            Spacer(Modifier.width(10.dp))
            Text(
                if (googleBusy) m.text("確認中…", "Checking…")
                else m.text("Googleで続ける", "Continue with Google"),
                color = Color(0xff202124),
            )
        }
        if (!signup) ConsentNotice(m, signup = false)
        LegalLinks(m)
        Spacer(Modifier.height(24.dp))
    }
}

/** "By continuing you agree to the Terms and Privacy Policy" with working links. */
@Composable
private fun ConsentNotice(m: AppModel, signup: Boolean) {
    val uri = LocalUriHandler.current
    val base = BuildConfig.LEGAL_URL.takeIf { it.startsWith("https://") }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val linked =
        SpanStyle(
            color = MaterialTheme.colorScheme.onSurface,
            textDecoration = TextDecoration.Underline,
        )
    fun AnnotatedString.Builder.link(title: String, path: String) {
        if (base == null) append(title)
        else
            withLink(
                LinkAnnotation.Url("$base/$path", TextLinkStyles(linked)) {
                    openLink(uri, "$base/$path")
                }
            ) {
                append(title)
            }
    }
    val terms = m.text("利用規約", "Terms of Service")
    val privacy = m.text("プライバシーポリシー", "Privacy Policy")
    Text(
        buildAnnotatedString {
            if (m.language == "ja") {
                link(terms, "terms")
                append("と")
                link(privacy, "privacy")
                append(if (signup) "に同意のうえ、アカウントを作成します。" else "に同意のうえ、続けます。")
            } else {
                append(
                    if (signup) "By creating an account, you agree to the "
                    else "By continuing, you agree to the "
                )
                link(terms, "terms")
                append(" and ")
                link(privacy, "privacy")
                append(".")
            }
        },
        fontSize = 13.sp,
        lineHeight = 20.sp,
        color = muted,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("auth-consent"),
    )
}

@Composable
private fun Onboarding(m: AppModel) {
    var step by rememberSaveable { mutableIntStateOf(1) }
    var interests by remember { mutableStateOf(m.preferences.strings("interests")) }
    var technologies by remember { mutableStateOf(m.preferences.strings("technologies")) }
    var difficulty by remember { mutableStateOf(m.preferences.optString("difficulty", "beginner")) }
    var search by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(24.dp)
    ) {
        Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
            Brand(compact = false, size = 20)
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                m.text("ステップ", "Step") + " $step / 2",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            OutlinedButton(
                onClick = m::skipOnboarding,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
                shape = RoundedCornerShape(24.dp),
                contentPadding = PaddingValues(horizontal = 10.dp),
            ) {
                Text(
                    m.text("スキップしてすぐ始める →", "Skip, just start →"),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
        if (step == 1) {
            Text(
                m.text("表示言語", "Language"),
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 14.dp),
            )
            Text(
                m.text(
                    "画面と新しい問題に使う言語を選んでください。",
                    "Used for questions and the interface. You can change it later in settings.",
                ),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LanguagePicker(m)
            SectionTitle(m.text("何を学びたいですか？", "What would you like to learn?"))
            Text(
                m.text(
                    "興味のある分野を選びましょう。いくつでも選べます。",
                    "Choose the areas you’re curious about. Pick more than one.",
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 24.sp,
            )
            if (m.catalog.objects("interests").isEmpty()) {
                ErrorText(m.error)
                TextButton(onClick = m::refreshSession) {
                    Text(m.text("分野を再読み込み", "Reload interests"))
                }
            }
            m.catalog.objects("interests").forEach { interest ->
                val id = interest.text("id")
                val selected = interests.contains(id)
                OutlinedButton(
                    onClick = {
                        interests = if (selected) interests - id else (interests + id).take(6)
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp).heightIn(min = 60.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors =
                        ButtonDefaults.outlinedButtonColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        ),
                    border =
                        BorderStroke(
                            1.dp,
                            if (selected) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outline,
                        ),
                ) {
                    Text(
                        interest.optJSONObject("label")?.text(m.language) ?: id,
                        Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 17.sp,
                    )
                    Icon(
                        if (selected) Icons.Outlined.CheckCircle
                        else Icons.Outlined.RadioButtonUnchecked,
                        null,
                        Modifier.size(20.dp),
                    )
                }
            }
            Text(
                m.text(
                    "JWT、HTTP、マイクロサービスなど、技術の共通知識もフィードに登場します。",
                    "Your feed also includes shared foundations such as JWT, HTTP, and microservices.",
                ),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 20.dp),
            )
            if (interests.isEmpty())
                Text(
                    m.text("続けるには、分野を1つ以上選んでください。", "Pick at least one area to continue."),
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            Primary(m.text("次へ", "Continue"), interests.isNotEmpty()) { step = 2 }
        } else {
            SectionTitle(m.text("好きな技術から始めよう", "Start with your technologies"))
            Text(
                m.text(
                    "言語やフレームワークを選択できます。選ばずに始めても大丈夫です。",
                    "Choose languages and frameworks, or start with general technology questions.",
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Field(search, { search = it }, m.text("言語・技術を検索", "Search languages and technologies"))
            Column(Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    m.catalog
                        .strings("technologies")
                        .filter { it.contains(search, true) }
                        .forEach { tech ->
                            FilterChip(
                                selected = technologies.contains(tech),
                                onClick = {
                                    technologies =
                                        if (technologies.contains(tech)) technologies - tech
                                        else (technologies + tech).take(40)
                                },
                                label = { Text(tech) },
                            )
                        }
                }
            }
            SectionTitle(m.text("難易度", "Difficulty"))
            listOf("beginner", "intermediate", "advanced").forEach { level ->
                ChoiceRow(level == difficulty, difficultyLabel(m, level)) { difficulty = level }
            }
            ErrorText(m.error)
            Primary(
                if (m.busy) m.text("保存中…", "Saving…") else m.text("学習を始める", "Start learning"),
                !m.busy,
            ) {
                m.savePreferences(interests, technologies, difficulty)
            }
            TextButton(onClick = { step = 1 }) { Text(m.text("戻る", "Back")) }
        }
        Spacer(Modifier.height(24.dp))
    }
}

private fun difficultyLabel(m: AppModel, value: String) =
    when (value) {
        "advanced" -> m.text("上級", "Advanced")
        "intermediate" -> m.text("中級", "Intermediate")
        else -> m.text("初級", "Beginner")
    }

@Composable
private fun ChoiceRow(selected: Boolean, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected, role = Role.RadioButton, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected, onClick = null)
        Text(label, Modifier.padding(start = 10.dp))
    }
}

@Composable
private fun LanguagePicker(m: AppModel) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(vertical = 8.dp),
    ) {
        RadioCard(m.language == "ja", "日本語", Modifier.weight(1f)) { m.changeLanguage("ja") }
        RadioCard(m.language == "en", "English", Modifier.weight(1f)) { m.changeLanguage("en") }
    }
}

@Composable
private fun Profile(m: AppModel, onSettings: () -> Unit) {
    val user = m.user
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SectionTitle(m.text("プロフィール", "Profile")) }
            IconButton(onClick = onSettings, modifier = Modifier.testTag("open-settings")) {
                Icon(Icons.Outlined.Settings, m.text("設定", "Settings"))
            }
        }
        Text(
            m.text("アカウント", "Account"),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 15.dp),
        )
        if (user == null) {
            Text(
                m.text("ログインすると学習の進み具合を保存できます。", "Sign in to keep your progress across devices."),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = { m.openLogin("progress") },
                modifier = Modifier.padding(top = 8.dp).heightIn(min = 48.dp),
                shape = RoundedCornerShape(10.dp),
                colors =
                    ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.onSurface,
                        contentColor = MaterialTheme.colorScheme.surface,
                    ),
            ) {
                Text(m.text("ログイン", "Sign in"))
            }
        } else {
            ProfileIdentity(user)
            TextButton(onClick = { m.openCreator(user.text("id")) }) {
                Text(m.text("公開プロフィールを見る", "View public profile"))
            }
            HorizontalDivider(
                Modifier.padding(top = 20.dp),
                color = MaterialTheme.colorScheme.outline,
            )
            AccountLearning(m)
        }
        ErrorText(m.error)
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun Settings(m: AppModel, onBack: () -> Unit) {
    val user = m.user
    var showingAccountSettings by remember(user?.text("id")) { mutableStateOf(false) }
    if (showingAccountSettings && user != null) {
        BackHandler { showingAccountSettings = false }
        AccountSettings(m, user) { showingAccountSettings = false }
        return
    }
    BackHandler(onBack = onBack)
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)
    ) {
        TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(m.text("プロフィールに戻る", "Back to profile"))
        }
        SectionTitle(m.text("設定", "Settings"))
        if (user != null) {
            OutlinedButton(
                onClick = { showingAccountSettings = true },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("account-settings"),
            ) {
                Text(m.text("アカウント設定", "Account settings"), Modifier.weight(1f))
                Icon(
                    painterResource(R.drawable.web_next),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp).rotate(-90f),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        } else {
            OutlinedButton(
                onClick = { m.openLogin("progress") },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(10.dp),
            ) {
                Text(m.text("ログインして進捗を保存", "Sign in to keep your progress"))
            }
        }
        if (user == null && m.accountDeleted)
            Text(
                m.text("アカウントを削除しました。", "Your account was deleted."),
                fontWeight = FontWeight.SemiBold,
                modifier =
                    Modifier.padding(top = 12.dp).testTag("account-deleted").semantics {
                        liveRegion = LiveRegionMode.Polite
                    },
            )
        ErrorText(m.error)
        HorizontalDivider(Modifier.padding(top = 20.dp), color = MaterialTheme.colorScheme.outline)
        Text(
            m.text("この端末の設定", "On this device"),
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 20.dp, bottom = 8.dp).semantics { heading() },
        )
        Text(m.text("外観", "Appearance"), fontWeight = FontWeight.SemiBold)
        Text(
            m.text("この端末の表示テーマを選べます。", "Choose the appearance on this device."),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 5.dp, bottom = 8.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RadioCard(m.dark, m.text("ダーク", "Dark"), Modifier.weight(1f)) { m.theme(true) }
            RadioCard(!m.dark, m.text("ライト", "Light"), Modifier.weight(1f)) { m.theme(false) }
        }
        Text(
            m.text("文字の大きさ", "Text size"),
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 14.dp),
        )
        Text(
            m.text(
                "読みやすい大きさを選べます。この端末に保存されます。",
                "Choose a comfortable reading size. Saved on this device.",
            ),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(top = 8.dp),
        ) {
            listOf(
                    1f to m.text("標準", "Standard"),
                    1.15f to m.text("大きい", "Large"),
                    1.3f to m.text("さらに大きい", "Larger"),
                )
                .forEach { (size, label) ->
                    RadioCard(m.readingSize == size, label) { m.size(size) }
                }
        }
        Text(
            m.text("表示言語", "Language"),
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 14.dp),
        )
        LanguagePicker(m)
        if (user == null) {
            TextButton(onClick = { m.screen = "onboarding" }) {
                Text(m.text("興味・技術を変更", "Edit interests and technologies"))
            }
        }
        LegalLinks(m, support = true)
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun ProfileIdentity(user: JSONObject) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        val name = user.text("name")
        val email = user.text("email")
        Avatar(user.text("avatarUrl"), name.ifBlank { email })
        Column(Modifier.padding(start = 12.dp)) {
            Text(name.ifBlank { email }, fontWeight = FontWeight.Bold)
            if (name.isNotBlank()) {
                Text(email, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val username = user.text("username")
            if (username.isNotBlank()) {
                Text(
                    "@" + username,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AccountSettings(m: AppModel, user: JSONObject, onBack: () -> Unit) {
    var newUsername by rememberSaveable(user.text("id")) { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)
    ) {
        TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(m.text("設定に戻る", "Back to settings"))
        }
        SectionTitle(m.text("アカウント設定", "Account settings"))
        ProfileIdentity(user)
        TextButton(onClick = { m.screen = "onboarding" }) {
            Text(m.text("興味・技術を変更", "Edit interests and technologies"))
        }
        if (user.text("username").isBlank()) {
            Field(newUsername, { newUsername = it }, m.text("ユーザー名", "Username"))
            Primary(m.text("ユーザー名を保存", "Save username"), newUsername.isNotBlank() && !m.busy) {
                m.setUsername(newUsername)
            }
        }
        OutlinedButton(onClick = m::logout, enabled = !m.busy, shape = RoundedCornerShape(10.dp)) {
            Text(m.text("ログアウト", "Sign out"))
        }
        OutlinedButton(
            onClick = { confirmDelete = true },
            enabled = !m.busy,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.padding(top = 8.dp).testTag("delete-account"),
            colors =
                ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
            Text(m.text("アカウントを削除", "Delete account"))
        }
        Text(
            m.text("アカウントと学習の記録を完全に削除します。", "Permanently deletes your account and learning data."),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
        SectionTitle(m.text("ブロックしたユーザー", "Blocked learners"))
        Text(
            m.text(
                "ブロックしたユーザーのコメントと投稿した問題は表示されません。",
                "Comments and questions from blocked learners are hidden from you.",
            ),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (m.blocked.isEmpty())
            Text(
                m.text("ブロックしているユーザーはいません。", "You haven’t blocked anyone."),
                modifier = Modifier.padding(vertical = 12.dp).testTag("blocked-empty"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        m.blocked.forEach { person ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    person.text("displayName"),
                    Modifier.weight(1f),
                    fontWeight = FontWeight.SemiBold,
                )
                TextButton(
                    onClick = { m.unblockUser(person.text("id")) },
                    enabled = !m.busy,
                    modifier =
                        Modifier.testTag("unblock-" + person.text("id")).semantics {
                            contentDescription =
                                m.text(
                                    person.text("displayName") + "のブロックを解除",
                                    "Unblock " + person.text("displayName"),
                                )
                        },
                ) {
                    Text(m.text("ブロックを解除", "Unblock"))
                }
            }
        }
        if (confirmDelete)
            AlertDialog(
                onDismissRequest = { confirmDelete = false },
                title = { Text(m.text("アカウントを削除しますか？", "Delete your account?")) },
                text = {
                    Text(
                        m.text(
                            "アカウントと学習の記録（回答、XP、コメント、保存した問題、報告、ブロックなど）がすべて削除され、元に戻せません。あなたが投稿した問題は、名前を外した状態でコミュニティに残ります。",
                            "This permanently deletes your account and your learning data: answers, XP, comments, saved questions, reports and blocks. It cannot be undone. Questions you published stay in the community without your name.",
                        )
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            confirmDelete = false
                            m.deleteAccount()
                        },
                        modifier = Modifier.testTag("confirm-delete-account"),
                    ) {
                        Text(
                            m.text("完全に削除", "Delete permanently"),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = { confirmDelete = false }) {
                        Text(m.text("キャンセル", "Cancel"))
                    }
                },
            )
        ErrorText(m.error)
        Spacer(Modifier.height(32.dp))
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun AccountLearning(m: AppModel) {
    var saved by remember { mutableStateOf(false) }
    if (m.guestImportFailed) {
        ErrorText(
            m.text(
                "ゲストの回答を保存できませんでした。この端末に残っています。",
                "We couldn’t save your guest answers. They’re still on this device.",
            )
        )
        TextButton(onClick = m::retryGuestAnswers) { Text(m.text("再試行", "Try again")) }
    }
    if (m.guestImportSkipped > 0) {
        Text(
            m.text(
                "一部のゲスト回答は保存済みか、取り込めませんでした。",
                "Some guest answers were already saved or couldn’t be imported.",
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    SectionTitle(m.text("今日の目標", "Today’s goal"))
    Text(m.text("問題に取り組む", "Work through questions"))
    Text("${m.progress.optInt("dailyCompleted")} / ${m.progress.optInt("dailyGoal",5)}")
    LinearProgressIndicator(
        progress = {
            (m.progress.optDouble("dailyCompleted") /
                    m.progress.optInt("dailyGoal", 5).coerceAtLeast(1))
                .toFloat()
                .coerceIn(0f, 1f)
        },
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
    )
    Text(
        m.text("日本時間で毎日更新されます。", "A new day starts at midnight in Japan."),
        modifier = Modifier.padding(bottom = 12.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        listOf(
                "level" to m.text("レベル", "Level"),
                "totalXp" to m.text("累計XP", "Total XP"),
                "streak" to m.text("連続日数", "Day streak"),
                "bestCombo" to m.text("最高コンボ", "Best combo"),
                "correctTaps" to m.text("正解した問題", "Correct answers"),
                "passedQuestions" to m.text("説明で合格", "Explained"),
            )
            .forEach { (key, label) ->
                Column(Modifier.widthIn(min = 90.dp)) {
                    Text(
                        label,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        when (key) {
                            "bestCombo" -> "×${m.progress.optInt(key)}"
                            "correctTaps" ->
                                "${m.progress.optInt(key)} / ${m.progress.optInt("answeredTaps")}"
                            else -> m.progress.optInt(key).toString()
                        },
                        modifier =
                            Modifier.testTag("profile-" + key).semantics {
                                testTagsAsResourceId = true
                            },
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
    }
    m.progress.optJSONObject("weeklyHighlight")?.let { highlight ->
        val topic = highlight.text("topic")
        val correct = highlight.optInt("correct")
        Text(
            m.text(
                "今週は「${topic}」で${correct}問正解。成長しています！",
                "This week you got $correct right in $topic. You’re improving!",
            ),
            modifier = Modifier.padding(top = 12.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    SectionTitle(m.text("分野ごとの理解度", "Mastery by area"))
    MasteryRadar(m)
    m.progress.objects("topics").forEach { topic ->
        Row(
            Modifier.fillMaxWidth().padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(topic.text("topic"), Modifier.weight(1f), fontSize = 14.sp)
            Text("${topic.optInt("correct")}/${topic.optInt("answered")}", fontSize = 12.sp)
        }
        LinearProgressIndicator(
            progress = { topic.optDouble("mastery", 0.0).toFloat().coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    val badges = m.progress.objects("achievements")
    val earnedCount = badges.count { it.optBoolean("earned") }
    SectionTitle(m.text("実績", "Achievements") + "  $earnedCount / ${badges.size}")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        badges.forEach { badge ->
            val earned = badge.optBoolean("earned")
            Row(
                Modifier.padding(vertical = 6.dp)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (earned) Icons.Outlined.EmojiEvents else Icons.Outlined.Lock,
                    null,
                    Modifier.size(18.dp),
                    tint =
                        if (earned) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column(Modifier.padding(start = 6.dp)) {
                    Text(badgeName(m, badge.text("id")), fontSize = 12.sp)
                    Text(
                        if (earned) m.text("獲得済み", "Earned") else m.text("挑戦中", "In progress"),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
    TextButton(
        onClick = {
            saved = !saved
            if (saved) m.loadCollection(true)
        }
    ) {
        Text(m.text("保存した問題", "Saved questions"))
    }
    if (saved) m.collection.forEach { q -> QuestionLink(m, q) }
}

@Composable
private fun Avatar(url: String, label: String) {
    if (url.startsWith("https://"))
        AsyncImage(
            model = url,
            contentDescription = null,
            modifier =
                Modifier.size(48.dp).background(MaterialTheme.colorScheme.outline, CircleShape),
        )
    else
        Box(
            Modifier.size(48.dp).background(MaterialTheme.colorScheme.outline, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.PersonOutline, null)
        }
}

@Composable
private fun QuestionLink(m: AppModel, q: Question) {
    TextButton(
        onClick = { m.openQuestion(q) },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(q.title, Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun Collection(m: AppModel) {
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        SectionTitle(m.text("理解するまで、もう一度。", "Come back with a fresh perspective."))
        Text(
            m.text(
                "間違えた問題はここに保存され、正解するまで毎朝9時（日本時間）にフィードへ戻ってきます。",
                "Missed questions return to your feed every morning at 9:00 (Japan time) until you get them right.",
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            lineHeight = 23.sp,
        )
        if (m.user == null)
            Column {
                Primary(m.text("ログインして復習する", "Sign in to practice")) { m.openLogin("practice") }
                Steps(
                    listOf(
                        m.text("フィードで問題に間違える", "You miss a question in the feed."),
                        m.text(
                            "翌朝9時（日本時間）に、もう一度フィードに出てきます。",
                            "It returns the next morning at 9:00 (Japan time).",
                        ),
                        m.text("正解すると、復習は完了です。", "Get it right and it is cleared."),
                    )
                )
            }
        else if (m.busy) Loading(m.text("復習を読み込み中…", "Loading practice…"))
        else if (m.error.isNotBlank())
            Empty(m.error, m.text("再試行", "Retry"), { m.loadCollection(false) })
        else if (m.collection.isEmpty())
            Empty(
                m.text(
                    "復習する問題はありません。フィードで学習を続けましょう。",
                    "You're all caught up. Keep learning in the feed.",
                ),
                m.text("フィードへ", "Go to feed"),
                { m.changeTab(0) },
            )
        else LazyColumn { items(m.collection, key = { it.id }) { QuestionLink(m, it) } }
    }
}

@Composable
private fun Ranking(m: AppModel) {
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        SectionTitle(m.text("今週のランキング", "This week's ranking"))
        Text(
            m.text(
                "理解を深めて、XPを獲得しよう。毎週、日本時間で更新されます。",
                "Build understanding and earn XP. A new week starts in Japan time.",
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            lineHeight = 23.sp,
        )
        ErrorText(m.error)
        if (m.busy) Loading(m.text("ランキングを読み込み中…", "Loading rankings…"))
        else
            LazyColumn(Modifier.padding(top = 20.dp)) {
                items(m.leaderboard.objects("entries")) { entry ->
                    val user = entry.optJSONObject("user") ?: JSONObject()
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { m.openCreator(user.text("id")) }
                            .padding(vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            entry.optInt("rank").toString(),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.width(28.dp),
                        )
                        Avatar(user.text("avatarUrl"), user.text("displayName"))
                        Text(
                            user.text("displayName"),
                            Modifier.weight(1f).padding(horizontal = 12.dp),
                            fontWeight = FontWeight.Bold,
                        )
                        Text("${entry.optInt("xp")} XP", fontFamily = Mono, fontSize = 13.sp)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                }
                if (m.leaderboard.objects("entries").isEmpty())
                    item { Text(m.text("今週の最初の学習者になろう。", "Be the first learner this week.")) }
            }
    }
}

@Composable
private fun QuestionSheet(m: AppModel, q: Question) {
    var input by rememberSaveable(q.id, m.sheet) { mutableStateOf("") }
    var requestId by
        rememberSaveable(q.id, m.sheet) { mutableStateOf(UUID.randomUUID().toString()) }
    var reason by rememberSaveable(q.id) { mutableStateOf("incorrect") }
    var reply by remember { mutableStateOf<JSONObject?>(null) }
    var reporting by remember { mutableStateOf<JSONObject?>(null) }
    var commentReason by rememberSaveable(q.id) { mutableStateOf("spam") }
    var blocking by remember { mutableStateOf<Pair<String, String>?>(null) }
    val uri = LocalUriHandler.current
    Column(
        Modifier.fillMaxWidth()
            .fillMaxHeight(.88f)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp)
    ) {
        Text(
            when (m.sheet) {
                "comments" -> m.text("コメント", "Comments")
                "explain" -> m.text("なぜ？を説明する", "Explain why")
                "ask" -> m.text("まだモヤモヤ？", "Still confused?")
                "report" -> m.text("問題を報告", "Report question")
                else -> m.text("問題の詳細", "Question details")
            },
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            q.title,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(vertical = 10.dp),
        )
        blocking?.let { (id, name) ->
            BlockDialog(m, id, name, if (m.sheet == "comments") q else null) { blocking = null }
        }
        when (m.sheet) {
            "comments" ->
                if (reporting != null) {
                    Text(
                        m.text("コメントを報告", "Report comment"),
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    listOf(
                            "spam" to m.text("スパム・宣伝", "Spam or advertising"),
                            "harassment" to m.text("嫌がらせ・攻撃的", "Harassment or abuse"),
                            "inappropriate" to m.text("不適切な内容", "Inappropriate content"),
                            "other" to m.text("その他", "Something else"),
                        )
                        .forEach { (value, label) ->
                            ChoiceRow(commentReason == value, label) { commentReason = value }
                        }
                    Field(
                        input,
                        { input = it },
                        m.text("詳細（任意）", "Details (optional)"),
                        multiline = true,
                    )
                    Primary(m.text("報告を送信", "Submit report"), !m.busy && input.length <= 1000) {
                        m.reportComment(q, reporting!!, commentReason, input) {
                            reporting = null
                            input = ""
                        }
                    }
                    TextButton(onClick = { reporting = null }, enabled = !m.busy) {
                        Text(m.text("キャンセル", "Cancel"))
                    }
                } else {
                    if (m.notice.isNotBlank())
                        Text(
                            m.notice,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier =
                                Modifier.padding(bottom = 8.dp).semantics {
                                    liveRegion = LiveRegionMode.Polite
                                },
                        )
                    if (m.busy && m.comments.isEmpty())
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (m.comments.isEmpty() && !m.busy && m.error.isBlank())
                        Text(
                            m.text("まだコメントはありません。", "No comments yet."),
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                    if (m.comments.isEmpty() && !m.busy && m.error.isNotBlank())
                        TextButton(onClick = { m.loadComments(q) }) {
                            Text(m.text("コメントを再読み込み", "Retry comments"))
                        }
                    m.comments.forEach { comment ->
                        val author = comment.optJSONObject("author") ?: JSONObject()
                        Column(
                            Modifier.fillMaxWidth()
                                .padding(vertical = 12.dp)
                                .then(
                                    if (comment.text("parentId").isNotBlank())
                                        Modifier.padding(start = 18.dp)
                                    else Modifier
                                )
                        ) {
                            TextButton(
                                onClick = { m.openCreator(author.text("id")) },
                                contentPadding = PaddingValues(0.dp),
                            ) {
                                Text(author.text("displayName"), fontWeight = FontWeight.Bold)
                            }
                            Text(
                                if (comment.optBoolean("deleted"))
                                    m.text("削除されたコメント", "Deleted comment")
                                else comment.text("text"),
                                lineHeight = 23.sp,
                            )
                            if (!comment.optBoolean("deleted"))
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    TextButton(
                                        onClick = { m.helpful(q, comment) },
                                        enabled =
                                            !m.busy && author.text("id") != m.user?.text("id"),
                                        modifier =
                                            Modifier.semantics {
                                                contentDescription = m.text("役に立った", "Helpful")
                                                selected = comment.optBoolean("helpful")
                                            },
                                    ) {
                                        Icon(
                                            Icons.Outlined.ThumbUpOffAlt,
                                            null,
                                            Modifier.size(16.dp),
                                        )
                                        Text(" " + comment.optInt("helpfulCount"), fontSize = 12.sp)
                                    }
                                    TextButton(onClick = { reply = comment }) {
                                        Text(m.text("返信", "Reply"), fontSize = 12.sp)
                                    }
                                    if (author.text("id") == m.user?.text("id"))
                                        TextButton(
                                            onClick = { m.deleteComment(q, comment) },
                                            enabled = !m.busy,
                                        ) {
                                            Text(
                                                m.text("削除", "Delete"),
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        }
                                    else if (m.user != null && author.text("id").isNotBlank()) {
                                        TextButton(
                                            onClick = {
                                                input = ""
                                                commentReason = "spam"
                                                reporting = comment
                                            },
                                            enabled = !m.busy,
                                            modifier = Modifier.testTag("report-comment"),
                                        ) {
                                            Text(m.text("報告", "Report"), fontSize = 12.sp)
                                        }
                                        TextButton(
                                            onClick = {
                                                blocking =
                                                    author.text("id") to author.text("displayName")
                                            },
                                            enabled = !m.busy,
                                            modifier = Modifier.testTag("block-user"),
                                        ) {
                                            Text(m.text("ブロック", "Block"), fontSize = 12.sp)
                                        }
                                    }
                                }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    }
                    if (m.user == null)
                        Primary(m.text("ログインしてコメント", "Sign in to comment")) {
                            m.openLogin("comment")
                        }
                    else {
                        reply?.let {
                            TextButton(onClick = { reply = null }) {
                                Text(m.text("返信をキャンセル", "Cancel reply"))
                            }
                        }
                        Field(
                            input,
                            {
                                input = it
                                requestId = UUID.randomUUID().toString()
                            },
                            m.text("コメントを書く", "Write a comment"),
                            multiline = true,
                            enabled = !m.busy,
                        )
                        Primary(
                            m.text("投稿する", "Post comment"),
                            input.isNotBlank() && input.length <= 5000 && !m.busy,
                        ) {
                            m.postComment(
                                q,
                                input,
                                parent = reply?.text("id"),
                                requestId = requestId,
                            ) {
                                input = ""
                                reply = null
                                requestId = UUID.randomUUID().toString()
                            }
                        }
                    }
                }
            "explain" -> {
                Text(
                    m.text(
                        "なぜその答えになるのか、自分の言葉で説明してみましょう。",
                        "Explain why in your own words. Gemini checks your understanding.",
                    ),
                    lineHeight = 24.sp,
                )
                Field(
                    input,
                    {
                        input = it
                        requestId = UUID.randomUUID().toString()
                        m.assessment = null
                    },
                    m.text("あなたの説明", "Your explanation"),
                    multiline = true,
                    enabled = !m.busy,
                )
                Primary(
                    if (m.busy) m.text("確認中…", "Assessing…")
                    else m.text("理解度をチェック", "Check understanding"),
                    input.isNotBlank() && input.length <= 6000 && !m.busy,
                ) {
                    m.assess(q, input, requestId)
                }
                m.assessment?.let { a ->
                    SectionTitle("${a.optInt("score")} / 10")
                    Text(a.text("feedback"), lineHeight = 24.sp)
                    a.strings("improvements").forEach {
                        Text("• $it", modifier = Modifier.padding(vertical = 5.dp))
                    }
                    Text(
                        a.text("explanation"),
                        lineHeight = 24.sp,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    Text(
                        m.text("この回答と評価は本人だけが閲覧できます。", "Your answer and assessment are private."),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    OutlinedButton(
                        onClick = {
                            m.postComment(q, input, "explanation", requestId = requestId) {
                                m.sheet = "comments"
                                input = ""
                                requestId = UUID.randomUUID().toString()
                            }
                        },
                        enabled = input.isNotBlank() && !m.busy,
                    ) {
                        Text(m.text("この説明を公開", "Publish this explanation"))
                    }
                }
            }
            "ask" -> {
                Text(
                    m.text(
                        "理解を深めるために、Geminiに質問できます。",
                        "Ask Gemini a follow-up to deepen your understanding.",
                    ),
                    lineHeight = 24.sp,
                )
                Field(
                    input,
                    {
                        input = it
                        requestId = UUID.randomUUID().toString()
                        m.followUp = null
                    },
                    m.text("質問を書く", "Ask a question"),
                    multiline = true,
                    enabled = !m.busy,
                )
                Primary(
                    m.text("Geminiに質問", "Ask Gemini"),
                    input.isNotBlank() && input.length <= 500 && !m.busy,
                ) {
                    m.ask(q, input, requestId)
                }
                m.followUp?.let {
                    Text(
                        it.optJSONObject("followUp")?.text("answer") ?: it.text("answer"),
                        lineHeight = 25.sp,
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                }
            }
            "report" -> {
                listOf(
                        "incorrect" to m.text("内容が正しくない", "Incorrect"),
                        "unclear" to m.text("説明がわかりにくい", "Unclear"),
                        "outdated" to m.text("情報が古い", "Outdated"),
                        "inappropriate" to m.text("不適切・攻撃的な内容", "Offensive or inappropriate"),
                    )
                    .forEach { (value, label) ->
                        ChoiceRow(reason == value, label) { reason = value }
                    }
                Field(
                    input,
                    { input = it },
                    m.text("詳細（任意）", "Details (optional)"),
                    multiline = true,
                )
                Primary(m.text("報告を送信", "Submit report"), !m.busy && input.length <= 1000) {
                    m.report(q, reason, input)
                }
            }
            else -> {
                q.tap?.let { answer ->
                    Text(
                        answer.explanation,
                        lineHeight = 24.sp,
                        modifier = Modifier.padding(vertical = 12.dp),
                    )
                }
                Text(q.prompt, lineHeight = 25.sp)
                Text(
                    q.topics.joinToString(" · ") + " · " + difficultyLabel(m, q.difficulty),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 16.dp),
                )
                q.author?.let { author ->
                    TextButton(onClick = { m.openCreator(author.text("id")) }) {
                        Text(author.text("displayName"))
                    }
                }
                    ?: Text(
                        m.text("Gemini が作成", "Created by Gemini"),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                if (q.references.isNotEmpty()) SectionTitle(m.text("さらに学ぶ", "Further reading"))
                q.references.forEach { ref ->
                    TextButton(
                        onClick = {
                            val url = ref.text("url")
                            if (url.startsWith("https://")) uri.openUri(url)
                        }
                    ) {
                        Text(ref.text("title"))
                    }
                }
                TextButton(onClick = { if (m.requireLogin("comment")) m.sheet = "report" }) {
                    Icon(Icons.Outlined.Flag, null, Modifier.size(18.dp))
                    Text(" " + m.text("問題を報告", "Report question"))
                }
                q.author?.let { author ->
                    if (m.user != null && author.text("id") != m.user?.text("id"))
                        TextButton(
                            onClick = {
                                blocking = author.text("id") to author.text("displayName")
                            },
                            modifier = Modifier.testTag("block-author"),
                        ) {
                            Icon(Icons.Outlined.Block, null, Modifier.size(18.dp))
                            Text(
                                " " +
                                    m.text(
                                        "${author.text("displayName")}をブロック",
                                        "Block ${author.text("displayName")}",
                                    )
                            )
                        }
                }
            }
        }
        ErrorText(m.error)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun Publish(m: AppModel) {
    var title by rememberSaveable { mutableStateOf(m.publishDraft.text("title")) }
    var prompt by rememberSaveable { mutableStateOf(m.publishDraft.text("prompt")) }
    var code by rememberSaveable { mutableStateOf(m.publishDraft.text("code")) }
    var codeLanguage by rememberSaveable { mutableStateOf(m.publishDraft.text("codeLanguage")) }
    var topic by rememberSaveable { mutableStateOf(m.publishDraft.optString("topic", "general")) }
    var answer by rememberSaveable { mutableStateOf(m.publishDraft.text("referenceAnswer")) }
    var difficulty by rememberSaveable {
        mutableStateOf(m.publishDraft.optString("difficulty", "beginner"))
    }
    var options by rememberSaveable {
        mutableStateOf(m.publishDraft.strings("options").takeIf { it.size == 4 } ?: List(4) { "" })
    }
    var correct by rememberSaveable {
        mutableIntStateOf(m.publishDraft.optInt("correctOption", -1))
    }
    var codeOpen by rememberSaveable {
        mutableStateOf(code.isNotBlank() || codeLanguage.isNotBlank())
    }
    var requestId by rememberSaveable {
        mutableStateOf(m.publishDraft.optString("requestId", UUID.randomUUID().toString()))
    }
    LaunchedEffect(title, prompt, code, codeLanguage, topic, answer, difficulty, options, correct) {
        val next =
            json(
                "title" to title,
                "prompt" to prompt,
                "code" to code,
                "codeLanguage" to codeLanguage,
                "topic" to topic,
                "referenceAnswer" to answer,
                "difficulty" to difficulty,
                "options" to JSONArray(options),
                "correctOption" to correct,
            )
        val old = JSONObject(m.publishDraft.toString()).apply { remove("requestId") }
        if (next.toString() != old.toString()) requestId = UUID.randomUUID().toString()
        m.publishDraft = next.put("requestId", requestId)
    }
    Column(
        Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(20.dp)
    ) {
        SectionTitle(m.text("あなたの「なぜ」を共有しよう", "Share a question worth understanding"))
        Text(
            m.text(
                "気づきや疑問を、誰かの学びに。Geminiが質問と説明を確認してから公開します。",
                "Turn something you’ve learned into someone else’s next discovery. Gemini reviews your question and explanation before publication.",
            ),
            lineHeight = 24.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (m.user == null) {
            Primary(m.text("ログインして質問を投稿", "Sign in to post a question")) { m.openLogin("post") }
            Steps(
                listOf(
                    m.text("質問と説明を書く", "Write a question and its explanation."),
                    m.text("Geminiが内容を確認してから公開します。", "Gemini reviews it before it is published."),
                    m.text(
                        "ほかの学習者が解き、いいねやコメントをくれます。",
                        "Other learners answer it, like it and comment.",
                    ),
                )
            )
            return@Column
        }
        m.publishedQuestion?.let { published ->
            SectionTitle(m.text("質問を公開しました", "Your question is published"))
            Text(published.prompt, lineHeight = 24.sp)
            TextButton(onClick = { m.openQuestion(published) }) {
                Text(m.text("公開した質問を開く", "Open your question"))
            }
            OutlinedButton(
                onClick = {
                    m.publishedQuestion = null
                    m.publishDraft = JSONObject()
                    title = ""
                    prompt = ""
                    code = ""
                    codeLanguage = ""
                    topic = "general"
                    answer = ""
                    options = List(4) { "" }
                    correct = -1
                    requestId = UUID.randomUUID().toString()
                }
            ) {
                Text(m.text("次の質問を書く", "Write another question"))
            }
            return@Column
        }
        Text(
            m.text(
                "編集中の内容は、アプリを開いている間、タブを切り替えても保持されます。",
                "Your draft stays here when you change tabs while this app is open.",
            ),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(vertical = 16.dp),
        )
        Field(title, { title = it }, m.text("タイトル", "Title"), enabled = !m.busy)
        Field(
            prompt,
            { prompt = it },
            m.text("質問", "Question"),
            multiline = true,
            enabled = !m.busy,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                SelectField(
                    m.text("分野", "Topic"),
                    topic,
                    listOf("general" to m.text("共通知識", "General technology")) +
                        m.catalog.objects("interests").map {
                            it.text("id") to
                                (it.optJSONObject("label")?.text(m.language) ?: it.text("id"))
                        },
                    !m.busy,
                ) {
                    topic = it
                }
            }
            Column(Modifier.weight(1f)) {
                SelectField(
                    m.text("難易度", "Difficulty"),
                    difficulty,
                    listOf("beginner", "intermediate", "advanced").map {
                        it to difficultyLabel(m, it)
                    },
                    !m.busy,
                ) {
                    difficulty = it
                }
            }
        }
        TextButton(
            onClick = { codeOpen = !codeOpen },
            enabled = !m.busy,
            contentPadding = PaddingValues(0.dp),
            modifier = Modifier.padding(top = 12.dp),
        ) {
            Icon(
                if (codeOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                null,
                Modifier.size(20.dp),
            )
            Text(m.text("コードを追加（任意）", "Add code (optional)"))
        }
        if (codeOpen) {
            Text(
                m.text(
                    "コードと言語はセットで入力してください。コードのない質問では、どちらも空欄で構いません。",
                    "Include both the code and its language. You can leave both empty for a conceptual question.",
                ),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Field(
                codeLanguage,
                { codeLanguage = it },
                m.text("コードの言語", "Code language"),
                enabled = !m.busy,
            )
            Field(code, { code = it }, m.text("コード", "Code"), multiline = true, enabled = !m.busy)
        }
        Field(
            answer,
            { answer = it },
            m.text("お手本の説明", "Reference explanation"),
            multiline = true,
            enabled = !m.busy,
        )
        Text(
            m.text(
                "正しい考え方と理由を書いてください。この説明をもとに理解度を確認します。",
                "Explain the correct reasoning. This helps us assess learners’ understanding.",
            ),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            m.text("タップクイズ（おすすめ）", "Tap quiz (recommended)"),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
        )
        Text(
            m.text(
                "選択肢を入れると、フィードで数秒で答えられる問題になります。正解を選んでください。",
                "Add options so learners can answer in seconds in the feed. Mark the correct one.",
            ),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        options.forEachIndexed { i, option ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                RadioButton(
                    selected = correct == i,
                    onClick = { correct = i },
                    enabled = !m.busy,
                    modifier =
                        Modifier.semantics {
                            contentDescription = m.text("${'A'+i}を正解にする", "Mark ${'A'+i} correct")
                        },
                )
                OutlinedTextField(
                    value = option,
                    onValueChange = { value ->
                        options = options.mapIndexed { j, old -> if (j == i) value else old }
                    },
                    placeholder = { Text(m.text("選択肢", "Option") + " ${'A'+i}") },
                    enabled = !m.busy,
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    modifier =
                        Modifier.weight(1f).semantics {
                            contentDescription = m.text("選択肢", "Option") + " ${'A'+i}"
                        },
                )
            }
        }
        ErrorText(m.error)
        val quizOptions = options.filter { it.isNotBlank() }
        val validQuiz =
            quizOptions.isEmpty() ||
                (quizOptions.size >= 2 &&
                    correct in options.indices &&
                    options[correct].isNotBlank())
        Primary(
            if (m.busy) m.text("質問を確認中…", "Reviewing your question…")
            else m.text("質問を投稿", "Publish question"),
            !m.busy &&
                title.trim().length in 3..160 &&
                prompt.trim().length in 10..3000 &&
                answer.trim().length in 10..6000 &&
                (code.isBlank() == codeLanguage.isBlank()) &&
                validQuiz,
        ) {
            val body =
                json(
                    "requestId" to requestId,
                    "title" to title.trim(),
                    "prompt" to prompt.trim(),
                    "topics" to JSONArray(listOf(topic)),
                    "difficulty" to difficulty,
                    "language" to m.language,
                    "referenceAnswer" to answer.trim(),
                )
            if (code.isNotBlank()) {
                body.put("code", code)
                body.put("codeLanguage", codeLanguage)
            }
            if (quizOptions.isNotEmpty()) {
                body.put("format", "choice")
                body.put("options", JSONArray(quizOptions))
                body.put("correctOption", options.take(correct).count { it.isNotBlank() })
            }
            m.publish(body)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SelectField(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Text(
        label,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 10.dp, bottom = 6.dp),
    )
    Box {
        OutlinedButton(
            onClick = { open = true },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            contentPadding = PaddingValues(10.dp),
        ) {
            Text(
                options.firstOrNull { it.first == value }?.second ?: value,
                Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
            )
            Icon(Icons.Outlined.ExpandMore, null, Modifier.size(18.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (key, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        onSelect(key)
                        open = false
                    },
                )
            }
        }
    }
}

@Composable
private fun Creator(m: AppModel) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        BackRow(m, m.text("公開プロフィール", "Public profile"))
        m.creator?.let { profile ->
            val creator = profile.optJSONObject("creator") ?: JSONObject()
            Avatar(creator.text("avatarUrl"), creator.text("displayName"))
            SectionTitle(creator.text("displayName"))
            val counts = profile.optJSONObject("counts") ?: JSONObject()
            Text(
                m.text("問題", "Questions") +
                    " ${counts.optInt("questions")} · " +
                    m.text("説明", "Explanations") +
                    " ${counts.optInt("explanations")} · Helpful ${counts.optInt("helpful")}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SectionTitle(m.text("公開した問題", "Published questions"))
            profile.objects("questions").forEach { QuestionLink(m, Question.parse(it)) }
            SectionTitle(m.text("公開した説明", "Published explanations"))
            profile.objects("explanations").forEach { explanation ->
                Text(explanation.text("questionTitle"), fontWeight = FontWeight.Bold)
                Text(explanation.text("text"), modifier = Modifier.padding(vertical = 12.dp))
                TextButton(onClick = { m.deepLink(explanation.text("questionId")) }) {
                    Text(m.text("問題を見る", "View question"))
                }
            }
        }
        ErrorText(m.error)
    }
}

private fun badgeName(m: AppModel, id: String): String {
    val labels =
        mapOf(
            "first-correct-tap" to ("はじめての正解" to "First correct answer"),
            "first-pass" to ("はじめての合格" to "First understanding"),
            "combo-five" to ("5連続正解" to "Five in a row"),
            "combo-ten" to ("10連続正解" to "Ten in a row"),
            "ten-passes" to ("10問を理解" to "Ten questions understood"),
            "fifty-correct" to ("50問正解" to "Fifty correct answers"),
            "three-day-streak" to ("3日連続で学習" to "Three-day learner"),
            "seven-day-streak" to ("7日連続で学習" to "Seven-day learner"),
            "daily-solver" to ("今日のバグを解決" to "Bug of the Day solver"),
            "first-post" to ("はじめての投稿" to "First community question"),
        )
    return labels[id]?.let { m.text(it.first, it.second) } ?: id
}

@Composable
private fun MasteryRadar(m: AppModel) {
    val interests = m.progress.objects("interests")
    if (interests.isEmpty()) return
    val accent = MaterialTheme.colorScheme.primary
    val border = MaterialTheme.colorScheme.outline
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val labels =
        interests.map { row ->
            m.catalog
                .objects("interests")
                .firstOrNull { it.text("id") == row.text("topic") }
                ?.optJSONObject("label")
                ?.text(m.language) ?: row.text("topic")
        }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Canvas(
            Modifier.size(280.dp).semantics {
                contentDescription =
                    interests
                        .mapIndexed { i, it ->
                            labels[i] +
                                ": " +
                                if (it.optInt("answered") == 0) "—"
                                else "${(it.optDouble("mastery",0.0)*100).toInt()}%"
                        }
                        .joinToString(", ")
            }
        ) {
            val cx = size.width / 2
            val cy = size.height / 2
            val radius = size.width * .30f
            fun point(index: Int, scale: Float): androidx.compose.ui.geometry.Offset {
                val angle = 2 * Math.PI * index / interests.size - Math.PI / 2
                return androidx.compose.ui.geometry.Offset(
                    cx + radius * scale * kotlin.math.cos(angle).toFloat(),
                    cy + radius * scale * kotlin.math.sin(angle).toFloat(),
                )
            }
            fun polygon(scales: List<Float>) =
                androidx.compose.ui.graphics.Path().apply {
                    scales.forEachIndexed { i, scale ->
                        val p = point(i, scale)
                        if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                    }
                    close()
                }
            listOf(.25f, .5f, .75f, 1f).forEach { r ->
                drawPath(
                    polygon(List(interests.size) { r }),
                    border,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()),
                )
            }
            interests.indices.forEach { i ->
                drawLine(
                    border,
                    androidx.compose.ui.geometry.Offset(cx, cy),
                    point(i, 1f),
                    1.dp.toPx(),
                )
            }
            val values =
                interests.map {
                    if (it.optInt("answered") == 0) .04f
                    else it.optDouble("mastery", 0.0).toFloat().coerceIn(.08f, 1f)
                }
            val shape = polygon(values)
            drawPath(shape, accent.copy(alpha = .28f))
            drawPath(
                shape,
                accent,
                style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()),
            )
            interests.indices.forEach { i ->
                if (interests[i].optInt("answered") > 0)
                    drawCircle(accent, 3.5.dp.toPx(), point(i, values[i]))
            }
        }
    }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        interests.forEachIndexed { i, row ->
            Text(
                labels[i] +
                    "  " +
                    if (row.optInt("answered") == 0) "—"
                    else
                        "${(row.optDouble("mastery",0.0)*100).toInt()}%  ${row.optInt("correct")}/${row.optInt("answered")}",
                fontSize = 12.sp,
                color = labelColor,
            )
        }
    }
}

@Composable
private fun RadioCard(
    selected: Boolean,
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier
            .heightIn(min = 48.dp)
            .border(
                1.dp,
                if (selected) colors.primary else colors.outline,
                RoundedCornerShape(10.dp),
            )
            .background(
                if (selected) colors.secondaryContainer else colors.surface,
                RoundedCornerShape(10.dp),
            )
            .selectable(selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (selected) Icons.Outlined.RadioButtonChecked
            else Icons.Outlined.RadioButtonUnchecked,
            null,
            Modifier.size(18.dp),
            tint = if (selected) colors.primary else colors.onSurfaceVariant,
        )
        Text(label, fontSize = 14.sp, modifier = Modifier.padding(start = 9.dp))
    }
}
