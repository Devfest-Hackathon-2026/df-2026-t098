plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
val googleClientId = providers.gradleProperty("GOOGLE_SERVER_CLIENT_ID").orElse("8715935974-egdfj9tf8e1p71jjr2befadf47cne86l.apps.googleusercontent.com").get()
require(Regex("[A-Za-z0-9.-]+\\.apps\\.googleusercontent\\.com").matches(googleClientId)) { "Invalid public Google server client ID" }
val apiUrl = providers.gradleProperty("WHYLINT_API_URL").orElse("https://whylint-8715935974.asia-northeast1.run.app").get()
require(apiUrl.startsWith("https://") || apiUrl.startsWith("http://10.0.2.2:") || apiUrl.startsWith("http://localhost:")) { "Use HTTPS or an emulator-local backend" }
// The owner publishes the privacy policy and terms; the app links to `/privacy` and `/terms` under
// this base URL. The support contact is shown when set (debug builds show a reserved example).
val legalUrl = providers.gradleProperty("WHYLINT_LEGAL_URL").orElse("https://whylint-8715935974.asia-northeast1.run.app").get()
require(legalUrl.isEmpty() || legalUrl.startsWith("https://")) { "The legal URL must use HTTPS" }
val supportContact = providers.gradleProperty("WHYLINT_SUPPORT_CONTACT").orNull
require(supportContact == null || supportContact.length <= 120 && supportContact.none { it.isISOControl() }) { "Invalid support contact" }
android {
    namespace = "app.whylint.nativeapp"
    compileSdk = 36
    defaultConfig {
        applicationId = "app.whylint.nativeapp"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "GOOGLE_SERVER_CLIENT_ID", "\"$googleClientId\"")
        buildConfigField("String", "API_URL", "\"${apiUrl.trimEnd('/')}\"")
        buildConfigField("String", "LEGAL_URL", "\"${legalUrl.trimEnd('/')}\"")
    }
    buildTypes {
        debug {
            buildConfigField("String", "SUPPORT_CONTACT", "\"${supportContact ?: "support@example.test"}\"")
        }
        release {
            buildConfigField("String", "SUPPORT_CONTACT", "\"${supportContact ?: ""}\"")
            require(apiUrl.startsWith("https://") || gradle.startParameter.taskNames.none { it.contains("Release", true) }) { "Release requires HTTPS" }
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.10.00"))
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
dependencies {
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
