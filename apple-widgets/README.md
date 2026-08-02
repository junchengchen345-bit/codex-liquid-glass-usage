# Codex 用量 · 原生桌面与 iPhone 小组件

这是现有 Tauri 液态玻璃用量面板的原生 WidgetKit 伴侣工程。构建并安装后，它会以 **“Codex 用量”** 出现在 macOS 和 iPhone 的小组件库中，提供小号和中号两种尺寸。

> 平台限制：第三方应用无法把自己的 WidgetKit 小组件插入官方 ChatGPT App 的小组件分类。系统小组件库中应搜索“Codex 用量”，而不是“ChatGPT”。

## 数据边界

- macOS 宿主 App 调用本机已登录的 “codex app-server --stdio”，读取额度、重置时间和 Token 统计。
- Widget 扩展只读 App Group 中已准备好的快照，绝不启动 CLI。
- iPhone 不能直接读取 Mac 上的 Codex 登录态；它从 iCloud Key-Value Store 读取由 Mac 同步的脱敏快照。
- 不会同步 “auth.json”、cookie、访问令牌、账号 ID 或原始 RPC 响应。

因此，Mac 可通过“立即刷新”更新本机额度；iPhone 显示的是最近一次 Mac 同步的快照，并会注明同步时间。iCloud KVS 的送达不是实时通道。

## 首次配置

需要完整 Xcode 才能签名、安装并在 Widget Gallery 中验证。每位贡献者都应选择自己的 Apple Developer Team；仓库不包含个人 Team ID。

1. 在 Xcode 打开 [CodexUsage.xcodeproj](CodexUsage.xcodeproj)。
2. 在 **Signing & Capabilities** 中，为 “CodexUsage” 和 “CodexUsageWidgets” 选择同一个 Apple Developer Team，并保持 Automatic Signing。
3. 给两个 target 都添加 **App Groups**，启用：

   “group.io.github.junchengchen345bit.CodexUsage”

4. 给两个 target 都添加 **iCloud** capability，并启用 **Key-value storage**。Xcode 应保留：

   “$(TeamIdentifierPrefix)io.github.junchengchen345bit.CodexUsage”

5. 分别选择 **My Mac** 和你的 iPhone 作为运行目标，构建并启动 “CodexUsage” 宿主 App 一次。
6. 在 Mac 的宿主 App 内点“刷新并更新桌面组件”。如找不到 CLI，点“选择 Codex CLI”，选择 ChatGPT/Codex App 内的 “codex” 可执行文件。

App Groups 与 iCloud capabilities 必须由同一个 Team 的 provisioning profile 授权；仅编辑 .entitlements 文件不够。若你使用的开发 Team 不提供这些 capability，需要换用具备它们的 Team。

## 添加小组件

### macOS

启动过 “CodexUsage” 后，在桌面空白处右键 → **编辑小组件** → 搜索 **Codex 用量** → 选“小号”或“中号” → 添加。

### iPhone

在同一个 Apple ID 下启动过 iPhone 版 “CodexUsage” 后，长按主屏幕 → **编辑主屏幕** → **添加小组件** → 搜索 **Codex 用量** → 选尺寸 → 添加。

## 工程结构

~~~
apple-widgets/
├── App/                 # macOS + iPhone 宿主 App
├── Shared/              # 脱敏快照、App Group / iCloud KVS 存储、视觉组件
├── WidgetExtension/     # WidgetKit extension（小号 + 中号）
├── Config/              # App Group 与 iCloud KVS entitlements
└── CodexUsage.xcodeproj
~~~

## 视觉与交互范围

小组件保留液态玻璃的渐变、细边高光、额度圆环和 Token 活动条；它由 macOS/iOS 系统渲染。WidgetKit 不允许持续读取桌面壁纸、自由拖动窗体或保留高频鼠标悬停粒子动画。那些实时玻璃和粒子效果继续由现有 Tauri 桌面面板承担。

## 当前验证状态

- 已完成 Swift 源码语法检查、Info.plist / entitlements / Xcode project 格式检查。
- `CodexUsage` scheme 已在关闭代码签名时通过 `xcodebuild`。
- 尚未完成签名、真机安装、iCloud KVS 送达和分发验证。
