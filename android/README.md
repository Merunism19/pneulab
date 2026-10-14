# PneuLab for Android

The Android app is the PneuLab web app packed into an APK and shown in a full-screen WebView.
There is one copy of the workshop: the files in the project root (`index.html`, `view3d.html`, `css/`, `js/`, `icons/`).
The build copies them into the app, so a change to the web app reaches the phone with the next build.

## Install on a phone

1. Copy `PneuLab.apk` (in the project root) to the phone, or send it to yourself.
2. Open it on the phone. Android asks once whether this source may install apps; allow it.
3. PneuLab appears in the app drawer. It needs no account and no connection.

The APK is a debug build signed with a local debug key. It installs on any phone with Android 8 or later,
but a store such as Google Play needs a release build signed with your own key (see below).

## Build

Double-click `build-apk.bat`, or from a terminal in this folder:

```
.\build-apk.bat
```

It runs `gradlew assembleDebug` and copies the result to `..\PneuLab.apk`.
It expects Java 17 and the Android SDK in `%USERPROFILE%\android-build-tools`; if `JAVA_HOME` and `ANDROID_HOME`
are already set, those are used instead. The folder also opens in Android Studio as a normal project.

## What the app adds to the web app

`app/src/main/java/com/pneulab/app/MainActivity.java` is the whole native side. The page reaches it as
`window.PneuLabNative`:

| Call | What it does |
| --- | --- |
| `saveFile(name, mime, base64)` | Writes a circuit file or a picture to `Downloads/PneuLab` |
| `share(text)` | Opens the Android share sheet with a circuit code |
| `copy(text)` | Puts a circuit code on the clipboard |
| `print()` | Sends the exam certificate to the system print dialog |
| `keepAwake(on)` | Keeps the screen on while a machine is running |
| `theme(dark, color)` | Colours the area behind the status and navigation bars |

The app also handles the back gesture (it calls `EP.back()` in the page), the file picker for "Load from file",
and `pneulab://c/...` links, which open a shared circuit.

It requests one permission, `VIBRATE`. It has no network permission: every request to the app's own address is
answered from the packed files, and requests to any other address are refused.

## A release build for a store

1. Create a keystore: `keytool -genkeypair -v -keystore pneulab.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pneulab`
2. Add a `signingConfigs` block for it to `app/build.gradle` and point `buildTypes.release.signingConfig` at it.
3. Run `gradlew bundleRelease` for an `.aab`, or `gradlew assembleRelease` for an APK.
4. Change `applicationId` in `app/build.gradle` to a name you own before publishing; it cannot be changed afterwards.
