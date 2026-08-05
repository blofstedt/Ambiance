# BUILD-02: R8 is now enabled for release builds. Capacitor relies on
# reflection to find plugins and on the @JavascriptInterface bridge, both of
# which R8 will strip or rename without these rules.

-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }

# AND-06: the AmbientNative bridge is only reachable by name from JavaScript.
-keepclassmembers class com.ambient.canvas.overlay.MainActivity$AmbientNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep class com.ambient.canvas.overlay.MainActivity { *; }
-keep class com.ambient.canvas.overlay.AmbientDreamService { *; }

# Cordova plugin shims bridged by Capacitor
-keep class org.apache.cordova.** { *; }

-keepattributes JavascriptInterface, Signature, *Annotation*, SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
