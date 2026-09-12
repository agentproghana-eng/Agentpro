# AgentPro ProGuard Rules

# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.embedding.** { *; }

# Firebase
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Kotlin
-dontwarn kotlin.**

# Security: ensure sensitive class names are not removed
-keep class com.agentpro.ghana.** { *; }

# Keep USSD and telephony classes

# OkHttp (used by Dio)
-dontwarn okhttp3.**
-dontwarn okio.**

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Google Play Core deferred components - app does not use dynamic
# feature delivery, but the Flutter engine references these classes
# optionally. Safe to ignore since they are never actually called.
-dontwarn com.google.android.play.core.splitcompat.**
-dontwarn com.google.android.play.core.splitinstall.**
-dontwarn com.google.android.play.core.tasks.**
