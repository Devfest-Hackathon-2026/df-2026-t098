package app.whylint.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider

class MainActivity : ComponentActivity() {
    private lateinit var model: AppModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        model = ViewModelProvider(this)[AppModel::class.java]
        intent.data
            ?.takeIf { it.scheme == "whylint" && it.host == "questions" }
            ?.lastPathSegment
            ?.let(model::deepLink)
        setContent { WhyLint(model) }
    }

    private var resumed = false

    override fun onResume() {
        super.onResume()
        if (resumed && ::model.isInitialized) model.refreshSession()
        resumed = true
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        intent.data
            ?.takeIf { it.scheme == "whylint" && it.host == "questions" }
            ?.lastPathSegment
            ?.let(model::deepLink)
    }
}
