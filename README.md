# 60s — 英语听读学习 App

一个用 React Native 编写的英语学习 App：65 篇约一分钟的短文，每篇带美式女声朗读、逐句跟读高亮、词汇/词块发音、收藏复习等功能。目前主要面向 Android 打包发布。

本文档面向**懂 JavaScript / TypeScript、但没有移动端开发经验**的读者，从技术层面讲清楚这个项目是怎么搭起来的。

---

## 1. 技术选型：React Native + Expo

### React Native 是什么

React Native（下面简称 RN）让你用 React 的写法（组件、JSX、hooks、state）开发手机 App。和网页开发的核心区别：

- 网页里 `<div>`、`<span>` 最终渲染成浏览器 DOM；RN 里你写 `<View>`、`<Text>`，最终渲染成**手机系统的原生控件**（Android 上是 Android View，iOS 上是 UIView）。所以它不是"套壳浏览器"，滑动、动画都是原生级别的。
- 你写的 JS/TS 代码由打包进 App 的一个 JS 引擎（Hermes）执行，通过一层"桥"去指挥原生控件。**一份代码，Android 和 iOS 都能跑**。
- 样式用 `StyleSheet.create({...})` 写，语法非常像 CSS（camelCase 版），布局默认就是 flexbox。

### Expo 是什么

裸 RN 项目要自己配置很多原生工程细节。Expo 是官方推荐的 RN 开发框架，它提供：

- **一套配好的脚手架**：`app.json` 里声明 App 名称、图标、版本、权限，Expo 负责翻译成 Android/iOS 的原生配置；
- **一批官方维护的原生功能库**：本项目用了 `expo-audio`（音频播放）等；
- **`expo prebuild` 命令**：根据 `app.json` 自动生成 `android/`（和 `ios/`）原生工程目录，你不需要手写原生配置就能得到一个可编译的原生项目。

### 本项目的主要依赖

| 依赖 | 作用 |
|---|---|
| `expo` (SDK 57) + `react-native` 0.86 | 框架本体 |
| `expo-audio` | 音频播放，并对接 Android 系统媒体会话（通知栏播放卡片、后台播放） |
| `@react-native-async-storage/async-storage` | 手机本地键值存储（类似浏览器 localStorage），存"已学"和"收藏" |
| `react-native-svg` | 画自定义播放按钮（表盘样式的进度环） |
| `typescript` | 全项目用 TS 编写 |

没有引入 react-navigation 等路由库——App 只有 3 个页面，用一个 `useState<Route>` 自己管理路由就够了（见 `App.tsx`）。

---

## 2. 项目结构

```
60seconds/
├── index.ts                 # 入口：把 App 组件注册给 RN 运行时
├── App.tsx                  # 根组件：路由切换、全局状态（已学/收藏）、安卓返回键处理
├── app.json                 # Expo 配置：App 名、图标、版本、Android 包名、权限、插件
├── package.json             # npm 依赖和脚本命令
├── tsconfig.json            # TypeScript 配置
│
├── src/                     # 全部业务代码
│   ├── types.ts             # 核心类型：Article / VocabItem / ChunkItem / Sentence / Route
│   ├── articles.ts          # 读取 articles.json，提供查找、搜索、编号格式化
│   ├── theme.ts             # 全局配色和间距常量
│   ├── storage.ts           # AsyncStorage 封装：已学列表、上次阅读、收藏列表的存取
│   ├── player.ts            # 全局音频播放器（单例），保证同时只播一个音频
│   ├── usePlayer.ts         # React hook，让组件订阅播放器状态变化
│   ├── json.d.ts            # 类型声明，让 TS 允许 import .json 文件
│   ├── components/
│   │   └── TickPlayButton.tsx   # 表盘样式的播放/暂停按钮（SVG 进度环）
│   └── screens/
│       ├── HomeScreen.tsx       # 首页：文章列表、搜索、学习进度、复习入口
│       ├── ArticleScreen.tsx    # 文章页：听读（逐句高亮）/词汇/词块/译文 四个 tab
│       └── ReviewScreen.tsx     # 复习页：收藏的单词词块列表、筛选、跳回原文
│
├── assets/                  # 静态资源（打包进 App）
│   ├── articles.json        # 全部 65 篇文章数据：正文、译文、词汇、词块、逐句时间轴
│   ├── audio/               # 约 39MB 音频，65 个子目录，每篇一个
│   │   └── 01-The-Lost-Key/
│   │       ├── 01-The-Lost-Key.mp3   # 正文朗读
│   │       ├── vocab-01-*.mp3        # 每个词汇的发音
│   │       └── chunk-01-*.mp3        # 每个词块的发音
│   ├── icon.png / android-icon-*.png / splash-icon.png   # App 图标和启动图
│   └── favicon.png
│
├── scripts/                 # 构建和数据生成脚本
│   ├── gen-body-timings.py  # 用 edge-tts 生成正文音频 + 逐词时间戳 → 聚合成句子时间轴
│   ├── sync-android-audio.js# prebuild 后把 assets/audio 复制进安卓工程的 assets 目录
│   ├── build-apk.sh         # 一键打 Android 安装包（APK）
│   └── run-android.sh       # 连真机/模拟器调试运行
│
└── android/                 # 安卓原生工程（由 expo prebuild 生成，可再生成）
    ├── app/build.gradle     # 版本号 versionCode/versionName、签名配置
    ├── app/src/main/AndroidManifest.xml  # 权限、前台服务（媒体播放）声明
    └── gradlew              # Gradle 构建工具（安卓界的 webpack + npm scripts）
```

### 数据从哪来

文章内容源自 `60pieces` 的 Markdown 文件。音频和时间轴由 `scripts/gen-body-timings.py` 生成：它调用微软 Edge TTS（`edge-tts` Python 库，美式女声 `en-US-JennyNeural`）合成语音，同时接收 TTS 返回的 **WordBoundary 事件**（每个单词在音频里的精确毫秒位置），再把逐词时间聚合成逐句的 `{text, start, end}` 写进 `articles.json`。这就是"听读页音频播到哪句、哪句就高亮"的数据基础——App 运行时只是拿播放进度和句子时间轴做对比，不需要任何在线服务。

### 几个关键实现

- **音频播放（`src/player.ts`）**：全局单例。切换音频时先 `pause()` 再释放旧播放器，避免两段声音同时响；通过 `setActiveForLockScreen` 注册到 Android 媒体会话，实现通知栏播放卡片和后台播放；`playFrom()` 支持从指定毫秒开始播（点句跳转用）。
- **状态订阅（`src/usePlayer.ts`）**：用 React 的 `useSyncExternalStore` 把播放器这个"外部对象"接进 React 的渲染体系，播放进度每 100ms 更新一次，界面自动跟着刷新。
- **本地持久化（`src/storage.ts`）**：已学文章、收藏的词汇/词块都是 `Set<string>` 序列化成 JSON 存进 AsyncStorage，App 重启后还在。收藏项的 key 形如 `vocab:01-The-Lost-Key:3`（类型:文章id:序号）。
- **音频资源的加载方式**：音频通过 `scripts/sync-android-audio.js` 复制进安卓工程，运行时用 `file:///android_asset/audio/...` 这种 Android 专属 URI 直接读取，不走网络、不解压，App 秒开。

---

## 3. 如何构建 Android 安装包（APK）

### 需要先装什么

1. **Node.js**（18+）— 运行 JS 工具链；
2. **JDK 17** — 安卓构建工具 Gradle 跑在 Java 上；
3. **Android SDK** — 谷歌官方的安卓编译工具集。本机装在 `/opt/homebrew/share/android-commandlinetools`（用 Homebrew：`brew install android-commandlinetools`，再用 `sdkmanager` 装 platform 和 build-tools）。不需要装 Android Studio，命令行工具就够。

### 构建流程（已封装成两条命令）

```bash
npm install               # 装 JS 依赖（首次）
npm run prebuild:android  # ① 生成安卓原生工程
npm run apk               # ② 编译出 APK
```

**① `prebuild:android` 做了什么：**

- `expo prebuild -p android --clean`：读取 `app.json`，生成整个 `android/` 目录——包名、图标、权限、启动屏全部翻译成原生配置；
- `node scripts/sync-android-audio.js`：把 `assets/audio/` 的 39MB 音频复制进 `android/app/src/main/assets/`，让它们被打进 APK。

一般只在 `app.json` 变了、或删过 `android/` 目录时才需要重跑；日常改 TS 代码直接执行 ②。

**② `apk`（即 `scripts/build-apk.sh`）做了什么：**

1. 设置 `JAVA_HOME`、`ANDROID_HOME` 环境变量，把 SDK 路径写进 `android/local.properties`；
2. 执行 `./gradlew assembleRelease`——Gradle 会：用 Metro（RN 的打包器，相当于 webpack）把所有 TS 编译打包成一个 JS bundle → 编译原生代码 → 把 JS bundle、音频、图标、原生库全部装进一个 APK → 用密钥签名（安卓要求所有 APK 必须签名才能安装）；
3. 把产物复制到项目根目录，命名成 `60s-年月日时分秒.apk`。

把这个 APK 传到手机上点击安装即可。只编译了 `arm64-v8a` 一种 CPU 架构（近几年的手机全是这个），所以包体更小。

**改版本号**：发新包前把 `app.json` 的 `version` 和 `android/app/build.gradle` 里的 `versionCode`（整数，必须递增）、`versionName`（展示用字符串）一起改掉，否则手机会因版本相同拒绝覆盖安装。

### 连手机调试（可选）

```bash
npm run android   # 手机开 USB 调试并连电脑，直接装 debug 版并支持热更新
```

---

## 4. 如何构建 iOS 包（IPA）

iOS 目前**还没有构建过**，但代码是跨平台的，流程如下。

### 硬性前提

1. **一台 Mac + Xcode**（App Store 免费下载）——苹果只允许在 macOS 上编译 iOS 应用；
2. **CocoaPods**（iOS 界的 npm，管理原生依赖）：`sudo gem install cocoapods`；
3. **Apple 开发者账号**：
   - 免费账号：能把 App 装到自己的 iPhone 上真机调试（7 天有效期，过期重装）；
   - 99 美元/年的付费账号：才能上架 App Store 或用 TestFlight 分发给别人。

### 构建步骤

```bash
# ① 生成 ios/ 原生工程（对应安卓的 prebuild）
npx expo prebuild -p ios --clean

# ② 装 iOS 原生依赖
cd ios && pod install && cd ..

# ③ 用 Xcode 打开工程
open ios/sixtyseconds.xcworkspace
```

然后在 Xcode 里：**Signing & Capabilities** 页签选择你的 Apple ID 作为签名团队 → 顶部选择目标设备 → 菜单 **Product → Archive** 归档 → 导出 IPA 或直接安装到连接的 iPhone。

### 两个需要注意的适配点

1. **音频路径是 Android 专用的**：`src/player.ts` 里 `assetToUri()` 返回 `file:///android_asset/...`，这个 URI 只有安卓认识。iOS 版需要改成把音频注册为 bundle 资源（或用 `expo-asset` 的 `Asset.fromModule` 方式加载），并写一个对应 `sync-android-audio.js` 的 iOS 资源复制脚本。这是 iOS 化的主要工作量，其余业务代码可以原样复用。
2. **AndroidManifest 里手动加的媒体前台服务**是安卓概念，iOS 的后台音频对应做法是在 Xcode 里勾选 **Background Modes → Audio**（Expo 可通过 `app.json` 的 `ios.infoPlist.UIBackgroundModes: ["audio"]` 声明）。

### 不想配环境？用 EAS Build

Expo 官方提供云构建服务 [EAS Build](https://docs.expo.dev/build/introduction/)：`npx eas build -p ios`，它在 Expo 的服务器上帮你编译（连 Mac 都不需要），免费档每月有一定构建额度，签名证书也可以托管给它管理。安卓同理 `npx eas build -p android`。

---

## 5. GitHub Actions 自动构建

仓库配置了 tag 触发的自动打包（`.github/workflows/release.yml`）：推送 `v` 开头的 tag（如 `v0.0.1`）时，GitHub 的服务器会自动构建 **Android APK** 和 **iOS 未签名 IPA**，并附加到对应的 GitHub Release 页面。

```bash
git tag v0.0.1
git push origin v0.0.1   # 推送 tag 即触发构建
```

要点：

- `android/` 原生工程已提交进仓库（因为里面有手工改过的媒体服务、折叠屏适配、签名配置），CI 直接用它编译；`ios/` 则由 CI 现场 `expo prebuild` 生成；
- 音频不重复入库，CI 构建前用 `scripts/sync-android-audio.js` 从 `assets/audio/` 复制；
- **Android 签名**：把本地密钥转成 base64（`base64 -i android/app/sixty-release.keystore | pbcopy`），配置到仓库 Settings → Secrets and variables → Actions，名称 `ANDROID_RELEASE_KEYSTORE_BASE64`。不配也能构建（CI 会临时生成密钥），但签名和本地包不一致，手机上覆盖安装时需先卸载；
- **iOS 产物是未签名的**：没有付费开发者证书时无法直接安装，需要用自己的 Apple ID 重签名（Xcode、Sideloadly、AltStore 等工具）后装机。

---

## 6. 常用命令速查

| 命令 | 作用 |
|---|---|
| `npm start` | 启动 Metro 开发服务器 |
| `npm run android` | 真机/模拟器调试运行（debug 版，支持热更新） |
| `npm run prebuild:android` | 重新生成安卓原生工程 + 同步音频资源 |
| `npm run apk` | 打正式 APK，输出到项目根目录（带时间戳文件名） |
| `npx tsc --noEmit` | 只做 TypeScript 类型检查，不产出文件 |
| `/tmp/tts-venv/bin/python scripts/gen-body-timings.py` | 重新生成正文音频和逐句时间轴 |

---

## 7. 踩过的坑（真实记录）

- **App 在折叠屏（OPPO Find N5）外屏闪退**：原因之一是老库 `expo-av` 与 RN 新架构不兼容（`UnsatisfiedLinkError`），换成 `expo-audio` 解决；另外去掉了 `screenOrientation="portrait"` 强制竖屏、声明 `resizeableActivity="true"`，折叠屏/小窗才不会崩。
- **两段音频同时响**：`expo-audio` 只调 `remove()` 释放播放器时底层可能还在出声，必须先 `pause()` 再 `remove()`。
- **通知栏没有播放卡片**：需要三件套齐活——`setAudioModeAsync({shouldPlayInBackground: true})`、播放时调 `setActiveForLockScreen(...)`、AndroidManifest 里声明 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限和媒体服务。
- **TTS 拿不到逐词时间戳**：`edge-tts` 7.x 必须显式传 `boundary="WordBoundary"` 才会推送单词边界事件。
