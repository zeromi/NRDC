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

1. **实时屏幕捕获与推送** - 服务端通过 AWT Robot 定时采集屏幕，JPEG 压缩后通过 WebSocket 推送至浏览器
2. **远程键鼠操控** - 浏览器端捕获鼠标/键盘事件，JSON 序列化后发送至服务端，通过 Robot 模拟执行
3. **跨平台支持** - 兼容 Windows 和 Linux（X11）环境
4. **WebSocket 全双工通信** - 支持二进制帧传输屏幕数据，JSON 传输控制指令
5. **用户名密码鉴权** - 通过登录接口验证用户名密码，获取一次性会话 Token 用于 WebSocket 握手
6. **帧率与画质调节** - 可配置 FPS（5-30）和 JPEG 质量（10%-100%）
7. **会话管理** - 支持多客户端同时连接观看

## 3. 技术架构

```
┌─────────────────┐     WebSocket      ┌──────────────────────────────────┐
│   浏览器客户端    │◄──────────────────►│      Spring Boot 服务端           │
│                 │                    │                                  │
│  Canvas 渲染器   │    二进制帧(JPEG)   │  ScreenBroadcaster (定时捕获)     │
│  事件捕获器     │                    │    ↓                            │
│                 │    JSON 输入事件    │  ScreenCaptureService (Robot)    │
└─────────────────┘◄──────────────────│    ↓                            │
                                   │  FrameEncoderService (JPEG压缩)    │
                                   │    ↓                            │
                                   │  SessionManager (广播帧)          │
                                   │                                  │
                                   │  InputEventDispatcher ←──────────│
                                   │    ↓                            │
                                   │  AWT Robot (鼠标/键盘模拟)        │
                                   └──────────────────────────────────┘
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
│   ├── NrDcApplication.java                   # 启动类
│   ├── controller/
│   │   └── LoginController.java               # 登录 REST 接口
│   ├── config/
│   │   ├── AppProperties.java                 # 配置属性绑定
│   │   ├── WebSocketConfig.java               # WebSocket 配置
│   │   └── WebConfig.java                     # CORS 配置
│   ├── websocket/
│   │   ├── ScreenWebSocketHandler.java        # WebSocket 消息处理
│   │   └── SessionManager.java                # 会话管理
│   ├── service/
│   │   ├── ScreenCaptureService.java          # 屏幕捕获
│   │   ├── FrameEncoderService.java           # 帧编码
│   │   ├── ScreenBroadcaster.java             # 定时广播调度
│   │   ├── InputEventDispatcher.java          # 输入事件分发
│   │   └── PlatformService.java               # 平台检测
│   ├── dto/
│   │   └── InputEvent.java                    # 输入事件 DTO
│   └── auth/
│       ├── AuthHandshakeInterceptor.java      # 握手鉴权
│       └── TokenStore.java                    # 会话 Token 管理
├── src/main/resources/
│   ├── application.yml                        # 应用配置
│   └── static/                                # 前端静态资源
│       ├── index.html
│       ├── css/style.css
│       └── js/client.js
└── src/test/java/com/nrdc/                     # 单元测试
```

## 5. 模块说明

### 5.1 配置模块 (`config`)

| 类名 | 职责 |
|------|------|
| `AppProperties` | 绑定 `nrdc.*` 配置前缀，提供类型安全的配置访问 |
| `WebSocketConfig` | 注册 WebSocket 端点 `/ws`，配置握手拦截器 |
| `WebConfig` | 配置 CORS 跨域策略 |

### 5.3 WebSocket 模块 (`websocket`)

| 类名 | 职责 |
|------|------|
| `ScreenWebSocketHandler` | 处理 WebSocket 连接/断开事件，接收文本消息并分发到 InputEventDispatcher |
| `SessionManager` | 维护 `CopyOnWriteArraySet<WebSocketSession>` 集合，广播二进制帧数据 |

### 5.4 服务模块 (`service`)

| 类名 | 职责 |
|------|------|
| `ScreenCaptureService` | 使用 `Robot.createScreenCapture()` 捕获全屏，管理 Robot 生命周期 |
| `FrameEncoderService` | JPEG 压缩编码，支持动态调节质量参数 |
| `ScreenBroadcaster` | `@Scheduled` 定时调度，捕获→编码→广播的热路径执行 |
| `InputEventDispatcher` | 解析 JSON 输入事件，通过 Robot 执行鼠标移动/点击/键盘按键 |
| `PlatformService` | 检测 OS 类型、headless 模式、X11 可用性 |

### 5.5 DTO 模块 (`dto`)

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

### 5.6 鉴权模块 (`auth`)

| 类名 | 职责 |
|------|------|
| `AuthHandshakeInterceptor` | 在 WebSocket 握手阶段验证 URL 中的 `token` 参数（一次性会话 Token） |
| `TokenStore` | 内存中管理一次性会话 Token 的生成与验证 |
| `ChallengeStore` | 管理登录 Challenge-Response 机制的随机 nonce 生成与摘要验证 |

## 6. 接口定义

### 6.1 REST 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/challenge` | GET | 获取登录挑战 nonce（随机 64 字符十六进制字符串） |
| `/api/login` | POST | Challenge-Response 登录，返回一次性会话 Token |

**登录流程（密码不离开客户端）：**

1. 客户端请求 `GET /api/challenge` 获取随机 nonce
2. 客户端计算 `SHA-256(nonce + password)` 作为响应
3. 客户端发送 `POST /api/login`

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
    "token": "sessiontoken..."
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

### 6.3 消息格式

**服务端 → 客户端（二进制帧）：**
- 类型：`BinaryMessage`
- 内容：JPEG 编码的屏幕截图字节数组

**客户端 → 服务端（文本帧）：**
```json
{
    "type": "MOUSE_MOVE",
    "x": 1920,
    "y": 1080,
    "timestamp": 1713859200000
}
```

```json
{
    "type": "KEY_PRESS",
    "keyCode": 65,
    "timestamp": 1713859200000
}
```

## 7. 配置说明

### 7.1 application.yml

```yaml
server:
  port: 8080                        # 服务端口

nrdc:
  capture:
    fps: 20                         # 屏幕捕获帧率 (5-30)
    quality: 0.6                    # JPEG 压缩质量 (0.1-1.0)
    diff-threshold: 5               # 帧差分阈值
  auth:
    token: nrdc-default-token       # 连接认证令牌
  websocket:
    endpoint: /ws                   # WebSocket 端点路径
    destination-prefix: /topic      # STOMP 消息前缀
```

### 7.2 环境要求

| 组件 | 版本要求 |
|------|----------|
| JDK | OpenJDK 25+ |
| Maven | 3.9+ |
| Windows | 需图形界面环境 |
| Linux | 需 X11 或 Xvfb（headless: `Xvfb :99 -screen 0 1920x1080x24 &` + `DISPLAY=:99`） |

## 8. 开发任务清单

### 阶段一：项目初始化 ✅

- [x] 创建 Maven 项目结构 (`pom.xml`, `.mvn/maven.config`)
- [x] 配置 Spring Boot 4.0.5 父 POM 和依赖
- [x] 创建 `application.yml` 配置文件
- [x] 创建 Spring Boot 启动类（启用 Scheduling 和 ConfigurationPropertiesScan）

### 阶段二：核心通信层 ✅

- [x] 实现 `WebSocketConfig` - STOMP 端点注册、消息代理配置
- [x] 实现 `WebConfig` - CORS 跨域配置
- [x] 实现 `AppProperties` - 配置属性绑定类
- [x] 实现 `AuthHandshakeInterceptor` - Token 鉴权拦截器
- [x] 实现 `ScreenWebSocketHandler` - WebSocket 消息处理
- [x] 实现 `SessionManager` - 会话管理与帧广播

### 阶段三：屏幕捕获与编码 ✅

- [x] 实现 `ScreenCaptureService` - AWT Robot 屏幕捕获
- [x] 实现 `FrameEncoderService` - JPEG 压缩编码
- [x] 实现 `ScreenBroadcaster` - 定时调度与广播
- [x] 实现 `PlatformService` - 跨平台环境检测

### 阶段四：输入事件分发 ✅

- [x] 定义 `InputEvent` DTO - 事件类型枚举与字段
- [x] 实现 `InputEventDispatcher` - JSON 解析与 Robot 模拟

### 阶段五：浏览器客户端 ✅

- [x] 构建 `index.html` - 远程桌面主页面（Cyberpunk Neon 暗色主题）
- [x] 构建 `style.css` - 状态栏、Canvas、工具栏、模态弹窗样式
- [x] 构建 `client.js` - WebSocket 连接管理、Canvas 渲染、鼠标键盘事件捕获

### 阶段六：单元测试 ✅

- [x] `NrDcApplicationTests` - Spring 上下文加载测试
- [x] `SessionManagerTest` - 会话增删、广播、错误处理
- [x] `InputEventDispatcherTest` - 鼠标键盘事件分发
- [x] `PlatformServiceTest` - 平台检测

### 阶段七：文档编写 ✅

- [x] `docs/development-tasks.md` - 开发任务文档
- [x] `README.md` - 项目说明文档

## 9. 构建与部署

### 9.1 构建

```bash
# 设置 JAVA_HOME (Windows)
set JAVA_HOME=D:\ProgramFiles\Java\jdk-25

# 编译打包
mvn clean package -DskipTests

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
WebSocket 地址: ws://localhost:8080/ws?token=nrdc-default-token
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
- 修改默认用户名和密码为强密码
- 通过 `--nrdc.capture.fps` 和 `--nrdc.capture.quality` 调整性能参数
- 配置防火墙规则限制访问端口

## 10. 后续优化方向

1. **增量帧差分** - 对比前后帧差异，仅传输变化区域，降低带宽
2. **H.264 硬件编码** - 通过 FFmpeg 或 JavaCV 实现硬件加速编码
3. **剪贴板同步** - 双向剪贴板内容同步
4. **文件传输** - 拖拽文件上传下载
5. **多显示器支持** - 支持选择和切换多个显示器
6. **录制回放** - 远程桌面会话录制
7. **音频传输** - 远程音频捕获和播放
