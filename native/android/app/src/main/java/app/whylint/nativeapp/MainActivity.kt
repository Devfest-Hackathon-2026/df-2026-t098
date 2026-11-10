package app.whylint.nativeapp

import android.content.Intent
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
        openQuestionLink(intent)
        setContent { WhyLint(model) }
    }

    private var resumed = false

    override fun onResume() {
        super.onResume()
        if (resumed && ::model.isInitialized) model.refreshIfStale()
        resumed = true
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openQuestionLink(intent)
    }

    private fun openQuestionLink(intent: Intent) {
        val link = intent.data ?: return
        if (link.scheme == "whylint" && link.host == "questions")
            model.deepLink(link.pathSegments.singleOrNull().orEmpty())
    }
}
