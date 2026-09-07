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

DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [ -z "$DEVICES" ]; then
  cat <<'EOF'
expo run:android 需要电脑上已经连着一台安卓手机（或模拟器）。

现在 adb 看不到任何设备。请先：
1. 用数据线把手机接到这台 Mac
2. 手机上打开「开发者选项 → USB 调试」，并点允许
3. 终端执行：adb devices
   看到 device 而不是 unauthorized 之后，再运行 npm run android

如果只是想装到手机上用，不必走这条命令。直接安装：
  /Users/billy/Downloads/60s.apk
或重新出包：
  npm run apk
EOF
  exit 1
fi

cd "$ROOT"
exec npx expo run:android "$@"
