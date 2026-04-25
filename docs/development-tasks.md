# NRDC 开发任务文档

> Network Remote Desktop Control - 基于Spring Boot的浏览器远程桌面控制工具

## 1. 项目概述

| 项目 | 说明 |
|------|------|
| 项目名称 | NRDC (Network Remote Desktop Control) |
| 项目版本 | 1.0.0-SNAPSHOT |
| 服务端框架 | Spring Boot 4.0.5 |
| JDK | OpenJDK 25 |
| 构建工具 | Maven（阿里云镜像） |
| 通信协议 | WebSocket (原生) |
| 前端技术 | HTML5 Canvas + 原生 JavaScript |

## 2. 核心功能

1. **实时屏幕捕获与推送** - 服务端通过 AWT Robot 定时采集屏幕，JPEG/PNG 压缩后通过 WebSocket 推送至浏览器
2. **远程键鼠操控** - 浏览器端捕获鼠标/键盘事件，JSON 序列化后发送至服务端，通过 Robot 模拟执行
3. **跨平台支持** - 兼容 Windows 和 Linux（X11）环境，Windows 高 DPI 感知（Java FFM API）
4. **WebSocket 全双工通信** - 支持二进制帧传输屏幕数据，JSON 传输控制指令
5. **用户名密码鉴权** - Challenge-Response 机制，密码 SHA-256 摘要传输，一次性 challenge 防重放
6. **多用户与角色管理** - admin/user 角色体系，JSON 文件持久化（`users.json`），支持 CRUD 操作
7. **互斥操作权控制** - 多客户端同时观看时，仅一人拥有操作权，支持请求/释放/自动释放
8. **会话 Token 管理** - 内存 Token 存储，24 小时有效期，支持验证和主动注销
9. **帧率与画质调节** - 可配置 FPS（5-30）、JPEG 质量（10%-100%）、图像格式（jpg/png）
10. **块级差分编码** - 全帧/差分帧二进制协议，块级变化检测，采样对比减少计算量，跳帧/关键帧机制
11. **缩放编码** - 可配置缩放比例（0.25-1.0），降低编码分辨率节省带宽
12. **自动重连** - 客户端缓存 Token 到 sessionStorage，页面刷新后自动恢复连接
13. **截图保存** - 从离屏 Canvas 导出 PNG 截图
14. **会话管理** - 支持多客户端同时连接观看
15. **移动端全面响应式支持** - 底部工具栏、虚拟键盘、触摸手势、iOS 适配、弹窗底部滑入

## 3. 技术架构

```
┌───────────────────────────────────────┐     WebSocket      ┌──────────────────────────────────────────┐
│           浏览器客户端                   │◄──────────────────►│            Spring Boot 服务端              │
│                                       │                    │                                          │
│  Canvas 渲染器 (离屏合成)               │    二进制帧(JPEG/PNG)│  ScreenBroadcaster (定时调度)            │
│  差分帧解码器                           │                    │    ↓                                    │
│  鼠标坐标映射 (letterbox 适配)           │                    │  ScreenCaptureService (Robot + 可复用Buffer)│
│  操作权 UI                             │    JSON 输入事件    │    ↓                                    │
│  用户管理 UI (admin)                   │◄──────────────────│  FrameEncoderService (全帧/差分/跳帧)      │
│  自动重连 (sessionStorage)              │    JSON 控制消息    │    ↓                                    │
└───────────────────────────────────────┘                    │  SessionManager (异步广播 + 操作权互斥)    │
                                                           │                                          │
                                                           │  ScreenWebSocketHandler                  │
                                                           │    ↓                                    │
                                                           │  InputEventDispatcher ←── 输入事件        │
                                                           │    ↓                                    │
                                                           │  AWT Robot (鼠标/键盘模拟)                │
                                                           │                                          │
                                                           │  LoginController → ChallengeStore        │
                                                           │                    → TokenStore (24h TTL) │
                                                           │                    → UserService          │
                                                           │                                          │
                                                           │  UserController (admin 专属)             │
                                                           │    ↓                                    │
                                                           │  UserService → users.json                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 4. 目录结构

```
nrdc/
├── pom.xml                                    # Maven 项目配置
├── .mvn/
│   └── maven.config                           # Maven 自定义 settings 路径
├── docs/
│   └── development-tasks.md                   # 本文档
├── src/main/java/com/nrdc/
│   ├── NrDcApplication.java                   # 启动类（含 Windows DPI 感知初始化）
│   ├── controller/
│   │   ├── LoginController.java               # 登录/挑战/Token验证 REST 接口
│   │   └── UserController.java                # 用户管理 REST 接口 (admin 专属)
│   ├── config/
│   │   ├── AppProperties.java                 # 配置属性绑定
│   │   ├── WebSocketConfig.java               # WebSocket 配置
│   │   └── WebConfig.java                     # CORS 配置
│   ├── websocket/
│   │   ├── ScreenWebSocketHandler.java        # WebSocket 消息处理 + 操作权控制
│   │   └── SessionManager.java                # 会话管理 + 帧广播 + 操作权互斥
│   ├── service/
│   │   ├── ScreenCaptureService.java          # 屏幕捕获 (可复用 Buffer)
│   │   ├── FrameEncoderService.java           # 帧编码 (全帧/差分/缩放/关键帧)
│   │   ├── ScreenBroadcaster.java             # 定时广播调度 (异步广播)
│   │   ├── InputEventDispatcher.java          # 输入事件分发
│   │   └── PlatformService.java               # 平台检测
│   ├── dto/
│   │   └── InputEvent.java                    # 输入事件 DTO
│   └── auth/
│       ├── AuthHandshakeInterceptor.java      # 握手鉴权
│       ├── ChallengeStore.java                # 登录 Challenge 生成与验证
│       ├── TokenStore.java                    # 会话 Token 管理 (24h TTL)
│       ├── User.java                          # 用户实体类
│       └── UserService.java                   # 用户 CRUD 服务 (JSON 持久化)
├── src/main/resources/
│   ├── application.yml                        # 应用配置
│   └── static/                                # 前端静态资源
│       ├── index.html                         # 主页面 (连接面板、用户管理面板)
│       ├── css/style.css                      # Cyberpunk Neon 暗色主题
│       ├── js/client.js                       # 客户端核心逻辑 (1483 行)
│       └── js/sha256.min.js                    # SHA-256 纯 JS 实现（HTTP 环境备用）
├── users.json                                 # 用户数据持久化 (运行时生成)
└── src/test/java/com/nrdc/                     # 单元测试
```

## 5. 模块说明

### 5.1 启动类 (`NrDcApplication`)

| 功能 | 说明 |
|------|------|
| Spring Boot 启动 | `@SpringBootApplication` + `@ConfigurationPropertiesScan` + `@EnableScheduling` |
| Windows DPI 感知 | 通过 Java FFM API 调用 `shcore.dll::SetProcessDpiAwareness` 或 `user32.dll::SetProcessDPIAware`，确保高 DPI 屏幕下截屏使用物理分辨率 |

### 5.2 配置模块 (`config`)

| 类名 | 职责 |
|------|------|
| `AppProperties` | 绑定 `nrdc.*` 配置前缀，包含 Capture（fps/quality/scaleFactor/imageFormat/blockSize/keyframeInterval/maxDiffRatio）、Auth（token/username/password）、WebSocket（endpoint/destinationPrefix） |
| `WebSocketConfig` | 注册 WebSocket 端点 `/ws`，配置握手拦截器，允许所有来源 |
| `WebConfig` | CORS 全局配置，允许所有来源和方法 |

### 5.3 控制器模块 (`controller`)

| 类名 | 职责 |
|------|------|
| `LoginController` | `GET /api/challenge` 获取登录 nonce；`POST /api/login` Challenge-Response 登录返回 Token+角色；`GET /api/token/verify` 验证 Token 有效性 |
| `UserController` | `GET /api/users` 列出用户；`POST /api/users` 新增用户；`PUT /api/users/{username}/password` 重置密码；`PUT /api/users/{username}/role` 切换角色；`DELETE /api/users/{username}` 删除用户。所有接口通过 `X-Session-Id` 请求头鉴权，仅 admin 可访问 |

### 5.4 WebSocket 模块 (`websocket`)

| 类名 | 职责 |
|------|------|
| `ScreenWebSocketHandler` | 处理 WebSocket 连接/断开事件；连接建立时发送 `SCREEN_INFO`（分辨率、格式、sessionId、角色）和 `CONTROL_CHANGED`；接收文本消息分发：`REQUEST_CONTROL`/`RELEASE_CONTROL` 操作权控制，其他消息视为输入事件（需操作权）；非控制输入事件转发到 `InputEventDispatcher` |
| `SessionManager` | 维护 `CopyOnWriteArraySet<WebSocketSession>` 会话集合；异步广播二进制帧数据（`broadcastScreenFrame`）；操作权互斥控制（`requestOperator`/`releaseOperator`/`isOperator`）；操作者断开自动释放操作权；支持定向消息（`sendToSession`）和广播文本消息（`broadcastTextMessage`） |

### 5.5 服务模块 (`service`)

| 类名 | 职责 |
|------|------|
| `ScreenCaptureService` | 使用 `Robot.createScreenCapture()` 捕获全屏；可复用 `BufferedImage` 避免每帧分配内存；管理 Robot 生命周期 |
| `FrameEncoderService` | 核心编码器：支持全帧（`FULL_FRAME 0x01`）和差分帧（`DIFF_FRAME 0x02`）二进制协议；块级差分检测（采样对比，每块约 50 采样点）；缩放编码（双线性插值）；可复用 ImageWriter；关键帧周期（可配置间隔）；变化比例超阈值自动退回全帧；跳帧（无变化时不发送） |
| `ScreenBroadcaster` | `@Scheduled(fixedRateString="${nrdc.capture.interval-ms:33}")` 定时调度；异步广播（单线程 `ExecutorService`）避免网络 IO 阻塞调度线程；无活跃会话时自动暂停捕获 |
| `InputEventDispatcher` | 解析 JSON 输入事件，通过 Robot 执行鼠标移动/点击/滚轮/键盘按键 |
| `PlatformService` | 检测 OS 类型、headless 模式、X11 可用性 |

### 5.6 DTO 模块 (`dto`)

| 类名 | 职责 |
|------|------|
| `InputEvent` | 输入事件数据传输对象，包含类型枚举和坐标/按键参数 |

**事件类型枚举：**
- `MOUSE_MOVE` - 鼠标移动（x, y）
- `MOUSE_PRESS` - 鼠标按下（x, y, button）
- `MOUSE_RELEASE` - 鼠标释放（x, y, button）
- `MOUSE_WHEEL` - 滚轮滚动（wheelDelta）
- `KEY_PRESS` - 键盘按下（keyCode）
- `KEY_RELEASE` - 键盘释放（keyCode）

### 5.7 鉴权与用户模块 (`auth`)

| 类名 | 职责 |
|------|------|
| `ChallengeStore` | 生成 32 字节安全随机 nonce（Hex 格式）；验证 `SHA-256(challenge + storedPasswordHash) == response`；一次性 challenge（验证后立即移除） |
| `TokenStore` | 内存中存储 `Token -> TokenInfo(username, role, expireAt)` 映射，默认 24 小时有效期，支持主动注销（`removeToken`） |
| `User` | 用户实体类，包含 username/passwordHash/role/createdAt；提供 `createAdmin()` 和 `createUser()` 工厂方法 |
| `UserService` | 基于 `users.json` 文件的持久化用户管理，支持 CRUD；首次启动自动创建默认管理员 `admin/admin`；使用 `ReentrantReadWriteLock` 保证线程安全 |
| `AuthHandshakeInterceptor` | WebSocket 握手拦截器，从 URL query 参数提取 `token`，通过 `TokenStore` 验证后将 sessionId/username/role 注入 WebSocket session attributes |

## 6. 接口定义

### 6.1 REST 接口

| 端点 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/challenge` | GET | 获取登录挑战 nonce（64 字符十六进制字符串） | 无 |
| `/api/login` | POST | Challenge-Response 登录，返回 session Token + 角色 | 无 |
| `/api/token/verify` | GET | 验证 Token 有效性，返回 username + role | Token（Header `X-Auth-Token`） |
| `/api/users` | GET | 获取用户列表 | Admin（Header `X-Session-Id`） |
| `/api/users` | POST | 新增用户 | Admin |
| `/api/users/{username}/password` | PUT | 重置用户密码 | Admin |
| `/api/users/{username}/role` | PUT | 切换用户角色 | Admin |
| `/api/users/{username}` | DELETE | 删除用户 | Admin |

**登录流程（密码不离开客户端）：**

1. 客户端请求 `GET /api/challenge` 获取随机 nonce
2. 客户端计算 `SHA-256(SHA-256(plainPassword))` 得到 pwHash
3. 客户端计算 `SHA-256(challenge + pwHash)` 作为 response
4. 服务端验证 `SHA-256(challenge + storedPasswordHash) == response`

**`GET /api/challenge` 响应：**
```json
{
    "challenge": "a1b2c3d4e5f6..."
}
```

**`POST /api/login` 请求体：**
```json
{
    "username": "admin",
    "challenge": "a1b2c3d4e5f6...",
    "response": "sha256hexdigest..."
}
```

**成功响应：**
```json
{
    "token": "sessiontoken...",
    "role": "admin",
    "username": "admin"
}
```

**失败响应 (401)：**
```json
{
    "error": "用户名或密码错误"
}
```

### 6.2 WebSocket 端点

| 端点 | 协议 | 说明 |
|------|------|------|
| `ws://host:port/ws?token=xxx` | WebSocket | 主连接端点（token 由登录接口获取） |

### 6.3 WebSocket 消息格式

**服务端 → 客户端（二进制帧）：**

全帧：
```
[1 byte] FULL_FRAME (0x01)
[N bytes] 完整 JPEG/PNG 图像数据
```

差分帧：
```
[1 byte]  DIFF_FRAME (0x02)
[2 bytes] blockWidth
[2 bytes] blockHeight
[2 bytes] gridCols
[2 bytes] gridRows
[2 bytes] changedCount
Per changed block:
  [2 bytes] colIndex
  [2 bytes] rowIndex
  [4 bytes] dataLength
  [dataLength bytes] JPEG/PNG 块数据
```

**服务端 → 客户端（文本帧）：**

```json
{ "type": "SCREEN_INFO", "width": 1920, "height": 1080, "imageFormat": "png", "sessionId": "abc12345", "role": "admin" }
{ "type": "CONTROL_CHANGED", "operatorId": "abc12345", "operator": "admin" }
{ "type": "CONTROL_GRANTED" }
{ "type": "CONTROL_RELEASED", "reason": "你已主动释放操作权" }
{ "type": "CONTROL_DENIED", "operator": "someone" }
```

**客户端 → 服务端（文本帧）：**

输入事件：
```json
{ "type": "MOUSE_MOVE", "x": 1920, "y": 1080, "timestamp": 1713859200000 }
```
```json
{ "type": "KEY_PRESS", "keyCode": 65, "timestamp": 1713859200000 }
```

控制消息：
```json
{ "type": "REQUEST_CONTROL" }
{ "type": "RELEASE_CONTROL" }
```

## 7. 配置说明

### 7.1 application.yml

```yaml
server:
  port: 8080                        # 服务端口

nrdc:
  capture:
    fps: 30                         # 屏幕捕获帧率 (5-30)
    interval-ms: 33                 # 广播间隔（毫秒），由 fps 推导
    quality: 0.6                    # JPEG 压缩质量 (0.1-1.0)
    image-format: png               # 编码格式: jpg（有损）或 png（无损）
    scale-factor: 1.0               # 缩放比例 (0.25-1.0)
    block-size: 128                 # 差分编码块大小（像素），范围 32-512
    keyframe-interval: 60           # 每 N 帧强制发送关键帧
    max-diff-ratio: 0.5             # 超过此比例块变化时退回全帧 (0.1-0.9)
  auth:
    token: nrdc-default-token       # 保留配置项（兼容），实际使用 users.json 管理
  websocket:
    endpoint: /ws                   # WebSocket 端点路径
    destination-prefix: /topic      # 消息前缀（保留）
```

### 7.2 用户数据

用户数据存储在工作目录下的 `users.json`，格式示例：

```json
[ {
  "username" : "admin",
  "passwordHash" : "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
  "role" : "admin",
  "createdAt" : 1713859200000
} ]
```

### 7.3 环境要求

| 组件 | 版本要求 |
|------|----------|
| JDK | OpenJDK 25+ |
| Maven | 3.9+ |
| Windows | 需图形界面环境（自动 DPI 感知） |
| Linux | 需 X11 或 Xvfb（headless: `Xvfb :99 -screen 0 1920x1080x24 &` + `DISPLAY=:99`） |

## 8. 开发任务清单

### 阶段一：项目初始化 ✅

- [x] 创建 Maven 项目结构 (`pom.xml`, `.mvn/maven.config`)
- [x] 配置 Spring Boot 4.0.5 父 POM 和依赖
- [x] 创建 `application.yml` 配置文件
- [x] 创建 Spring Boot 启动类（启用 Scheduling 和 ConfigurationPropertiesScan）

### 阶段二：核心通信层 ✅

- [x] 实现 `WebSocketConfig` - 端点注册、握手拦截器配置
- [x] 实现 `WebConfig` - CORS 跨域配置
- [x] 实现 `AppProperties` - 配置属性绑定类
- [x] 实现 `AuthHandshakeInterceptor` - Token 鉴权拦截器
- [x] 实现 `ScreenWebSocketHandler` - WebSocket 消息处理
- [x] 实现 `SessionManager` - 会话管理与帧广播

### 阶段三：屏幕捕获与编码 ✅

- [x] 实现 `ScreenCaptureService` - AWT Robot 屏幕捕获（可复用 Buffer）
- [x] 实现 `FrameEncoderService` - 全帧/差分帧二进制协议编码
- [x] 实现 `ScreenBroadcaster` - 定时调度与异步广播
- [x] 实现 `PlatformService` - 跨平台环境检测

### 阶段四：输入事件分发 ✅

- [x] 定义 `InputEvent` DTO - 事件类型枚举与字段
- [x] 实现 `InputEventDispatcher` - JSON 解析与 Robot 模拟

### 阶段五：浏览器客户端 ✅

- [x] 构建 `index.html` - 远程桌面主页面（Cyberpunk Neon 暗色主题）
- [x] 构建 `style.css` - 状态栏、Canvas、工具栏、模态弹窗、用户管理面板样式
- [x] 构建 `client.js` - WebSocket 连接管理、Canvas 渲染、差分帧解码、鼠标键盘事件捕获
- [x] 实现操作权 UI - 请求/释放按钮、操作权状态显示
- [x] 实现用户管理 UI - 用户列表、新增、角色切换、密码重置、删除
- [x] 实现自动重连 - sessionStorage Token 缓存、页面刷新恢复连接
- [x] 实现截图保存 - 离屏 Canvas 导出 PNG

### 阶段六：鉴权与用户系统 ✅

- [x] 实现 `ChallengeStore` - 登录 Challenge 生成与验证
- [x] 实现 `TokenStore` - 会话 Token 管理（24h TTL）
- [x] 实现 `User` - 用户实体类
- [x] 实现 `UserService` - 用户 CRUD 服务（JSON 文件持久化）
- [x] 实现 `LoginController` - 登录/挑战/Token 验证接口
- [x] 实现 `UserController` - 用户管理 REST 接口（Admin 鉴权）

### 阶段七：操作权控制 ✅

- [x] 实现 `SessionManager` 操作权互斥 - `requestOperator`/`releaseOperator`/`isOperator`
- [x] 实现 `ScreenWebSocketHandler` 操作权消息处理 - REQUEST_CONTROL/RELEASE_CONTROL
- [x] 客户端操作权 UI 实现 - 状态显示、请求/释放按钮
- [x] 操作者断开自动释放操作权

### 阶段八：性能优化 ✅

- [x] Windows DPI 感知 - Java FFM API 调用原生 SetProcessDpiAwareness
- [x] 可复用 Buffer - ScreenCaptureService 和 FrameEncoderService 复用图像 Buffer
- [x] 异步帧广播 - ExecutorService 独立线程广播，避免阻塞调度线程
- [x] 采样对比优化 - 每块约 50 采样点，提前终止检测
- [x] 无活跃会话时暂停捕获

### 阶段九：单元测试 ✅

- [x] `NrDcApplicationTests` - Spring 上下文加载测试
- [x] `SessionManagerTest` - 会话增删、广播、错误处理
- [x] `InputEventDispatcherTest` - 鼠标键盘事件分发
- [x] `PlatformServiceTest` - 平台检测

### 阶段十：文档编写 ✅

- [x] `docs/development-tasks.md` - 开发任务文档
- [x] `README.md` - 项目说明文档
- [x] `agent.md` - Agent 开发指南

### 阶段十一：前端全面响应式改造（移动端支持） ✅

- [x] 移动端底部工具栏 (`#mobileToolbar`) - 取代桌面侧边工具栏，包含"操作权"、"画质"、"键盘"、"截图"、"连接"5个按钮
- [x] 虚拟键盘面板 (`#virtualKeyboard`) - Fn 行、方向键、组合键 Ctrl+C/V/Z/A/Del、Win 键，移动端专用
- [x] 触摸手势系统：
  - 未获操作权：单指拖动平移视图，双指捏合缩放视图
  - 已获操作权：单击=左键、双击=连续左键、长按=右键、单指拖动=移动鼠标、双指捏合=远程滚轮
  - 点击水波纹动画、振动反馈
- [x] CSS 响应式断点 - ≤640px 移动端、≤375px 极小屏、横屏 landscape 压缩
- [x] 弹窗底部滑入 - 移动端模态弹窗从底部向上弹出（sheet 风格）
- [x] iOS 适配 - 禁用默认 viewport 缩放、font-size ≥16px 防止 iOS 自动缩放、100dvh 动态视口
- [x] 模态弹窗 sticky header - 用户管理面板头部 position sticky，滚动时保持可见
- [x] 画质循环切换 - 移动端底部"画质"按钮循环切换低/中/高三档
- [x] 登录 crypto.subtle 修复 - HTTPS 环境使用原生 `crypto.subtle.digest`（无额外开销），HTTP 环境使用本地 `js/sha256.min.js` 库并弹出黄色安全警告

## 9. 构建与部署

### 9.1 构建

```bash
# 设置 JAVA_HOME (Windows)
set JAVA_HOME=D:\ProgramFiles\Java\jdk-25

# 编译打包
mvn clean package -DskipTests -s "D:\ProgramFiles\maven\conf\settings_aliyun.xml"

# 运行测试
mvn test
```

### 9.2 运行

```bash
java -jar target/nrdc-1.0.0-SNAPSHOT.jar
```

### 9.3 访问

```
浏览器打开: http://localhost:8080
WebSocket 地址: ws://localhost:8080/ws?token=<login-token>
```

### 9.4 Linux 部署

```bash
# 安装 Xvfb（headless 环境）
apt-get install xvfb

# 启动虚拟显示
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# 启动应用
java -jar nrdc-1.0.0-SNAPSHOT.jar
```

### 9.5 生产部署建议

- 使用 Nginx 反向代理并配置 HTTPS
- 修改默认管理员密码为强密码
- 通过 `--nrdc.capture.fps` 和 `--nrdc.capture.quality` 调整性能参数
- 配置防火墙规则限制访问端口
- `users.json` 需定期备份

## 10. 后续优化方向

1. **H.264 硬件编码** - 通过 FFmpeg 或 JavaCV 实现硬件加速编码
2. **剪贴板同步** - 双向剪贴板内容同步
3. **文件传输** - 拖拽文件上传下载
4. **多显示器支持** - 支持选择和切换多个显示器
5. **录制回放** - 远程桌面会话录制
6. **音频传输** - 远程音频捕获和播放
7. **数据库持久化** - 替换 JSON 文件为 SQLite/PostgreSQL
8. **HTTPS/WSS 强制** - 生产环境强制加密通信
