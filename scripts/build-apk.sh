#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "Android SDK not found at $ANDROID_HOME"
  exit 1
fi

ANDROID_DIR="$ROOT/android"
if [ ! -d "$ANDROID_DIR" ]; then
  echo "android/ missing. Run: npm run prebuild:android"
  exit 1
fi

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ANDROID_DIR/local.properties"
rm -rf "$ANDROID_DIR/app/.cxx" "$ANDROID_DIR/app/build/intermediates/cxx"
cd "$ANDROID_DIR"
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a

APK_SRC="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
APK_DST="$ROOT/60s-$(date +%Y%m%d%H%M%S).apk"
if [ ! -f "$APK_SRC" ]; then
  echo "APK not found: $APK_SRC"
  exit 1
fi
cp -f "$APK_SRC" "$APK_DST"
ls -lh "$APK_DST"
echo "APK ready: $APK_DST"
