@echo off
rem Builds the PneuLab Android app and puts it in the project folder as PneuLab.apk.
rem It uses the Java and Android SDK in %USERPROFILE%\android-build-tools unless JAVA_HOME / ANDROID_HOME already point elsewhere.
setlocal
set "TOOLS=%USERPROFILE%\android-build-tools"
if not defined JAVA_HOME for /d %%D in ("%TOOLS%\jdk-17*") do set "JAVA_HOME=%%D"
if not defined ANDROID_HOME if exist "%TOOLS%\sdk" set "ANDROID_HOME=%TOOLS%\sdk"
if not defined JAVA_HOME (
  echo Java 17 was not found. Install a JDK 17 and set JAVA_HOME, or open this folder in Android Studio.
  exit /b 1
)
cd /d "%~dp0"
call "%~dp0gradlew.bat" assembleDebug
if errorlevel 1 exit /b 1
copy /y "app\build\outputs\apk\debug\app-debug.apk" "..\PneuLab.apk" >nul
echo.
echo Built: %~dp0..\PneuLab.apk
