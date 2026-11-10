package app.whylint.nativeapp

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val MARK_WIDTH = 20.526f
private const val MARK_HEIGHT = 11.638f
private val MARK_W =
    listOf(
        2.444f to 9.428f, 0.5f to 0.5f, 2.372f to 0.5f, 3.452f to 6.764f, 4.73f to 0.5f,
        6.782f to 0.5f, 8.06f to 6.764f, 9.14f to 0.5f, 11.012f to 0.5f, 9.068f to 9.428f,
        7.106f to 9.428f, 5.756f to 2.984f, 4.406f to 9.428f,
    )

/**
 * Plays once per launch: the W settles in, the cursor underline types across and blinks once, then
 * the screen dissolves into the app. With animations turned off in system settings it shows the
 * finished mark briefly and fades.
 */
@Composable
internal fun Splash(dark: Boolean, onDone: () -> Unit) {
    val background = if (dark) Color(0xff080808) else Color(0xffe9eee1)
    val accent = if (dark) Color(0xffc6f24e) else Color(0xff3d5d00)
    val ink = if (dark) Color(0xfff5f5f2) else Color(0xff131811)
    val context = LocalContext.current
    val reduce = remember {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    }
    val letter = remember { Animatable(0f) }
    val bar = remember { Animatable(0f) }
    val cursor = remember { Animatable(1f) }
    val exit = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        if (reduce) {
            letter.snapTo(1f)
            bar.snapTo(1f)
            delay(450)
        } else {
            launch {
                letter.animateTo(
                    1f,
                    spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow),
                )
            }
            delay(250)
            bar.animateTo(1f, tween(350, easing = FastOutSlowInEasing))
            delay(70)
            cursor.animateTo(0f, tween(100))
            cursor.animateTo(1f, tween(100))
            delay(200)
        }
        exit.animateTo(1f, tween(if (reduce) 1 else 260))
        onDone()
    }

    Box(
        Modifier.fillMaxSize()
            .graphicsLayer {
                alpha = 1f - exit.value
                scaleX = 1f + .06f * exit.value
                scaleY = 1f + .06f * exit.value
            }
            .background(background)
            .pointerInput(Unit) { detectTapGestures { } }
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(112.dp, 112.dp * MARK_HEIGHT / MARK_WIDTH)) {
            val k = size.width / MARK_WIDTH
            val appear = letter.value
            val path = Path()
            MARK_W.forEachIndexed { i, (x, y) ->
                if (i == 0) path.moveTo(x * k, y * k) else path.lineTo(x * k, y * k)
            }
            path.close()
            val lift = (1f - appear) * 10.dp.toPx()
            val grow = 0.82f + 0.18f * appear
            withTransform({
                translate(0f, lift)
                scale(grow, grow, pivot = Offset(size.width * .28f, size.height * .5f))
            }) {
                drawPath(path, accent.copy(alpha = appear.coerceIn(0f, 1f)))
            }
            drawRect(
                color = ink.copy(alpha = cursor.value),
                topLeft = Offset(11.674f * k, 9.428f * k),
                size = Size(8.352f * k * bar.value, 1.71f * k),
            )
        }
    }
}
