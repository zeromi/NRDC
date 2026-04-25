# NRDC - Network Remote Desktop Control

> 基于Spring Boot的浏览器远程桌面控制工具，支持Windows和Linux

## 功能特性

- 🖥️ **实时屏幕共享** - 浏览器中实时查看远程桌面画面
- 🖱️ **远程键鼠控制** - 在浏览器中操控远程设备鼠标和键盘
- 🔐 **用户名密码鉴权** - Challenge-Response 机制，密码摘要传输，防止未授权访问
- 👥 **多用户与角色管理** - 支持 admin/user 角色，管理员可增删改查用户（JSON 文件持久化）
- 🎮 **互斥操作权控制** - 多人同时观看时，仅一人可操作，支持请求/释放操作权
- 📊 **帧率画质可调** - 动态调节画面流畅度和画质（Q+/Q/Q-）
- 🧩 **区域差分编码** - 块级帧差分检测，仅传输屏幕变化区域，带宽节省 50-95%
- 📸 **截图保存** - 一键保存当前远程桌面画面
- 🔄 **自动重连** - 页面刷新后自动恢复连接，无需重新输入密码
- 🖥️ **跨平台** - 支持 Windows 和 Linux（X11/Xvfb），Windows 高 DPI 感知
- 🎨 **Cyberpunk UI** - 暗色科技风界面，支持全屏模式

## 技术栈

| 技术 | 版本 |
|------|------|
| Spring Boot | 4.0.5 |
| JDK | OpenJDK 25 |
| Maven | 3.9+ |
| 通信协议 | WebSocket |
| 前端 | HTML5 Canvas + JavaScript |

## 快速开始

### 环境要求

- JDK 25+
- Maven 3.9+

### 构建运行

```bash
# 设置 JAVA_HOME (Windows)
set JAVA_HOME=D:\ProgramFiles\Java\jdk-25

# 编译打包
mvn clean package -DskipTests -s "D:\ProgramFiles\maven\conf\settings_aliyun.xml"

# 启动
java -jar target/nrdc-1.0.0-SNAPSHOT.jar
```

### 浏览器访问

1. 打开 `http://localhost:8080`
2. 按 `F2` 或点击右上角 ⚙ 按钮打开连接面板
3. 输入用户名和密码（默认：`admin` / `admin`）
4. 点击「连接」
5. 点击顶部状态栏「请求操作」按钮获取远程控制权

### Linux Headless 环境

```bash
# 安装 Xvfb
sudo apt-get install xvfb

# 启动虚拟显示
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# 启动应用
java -jar nrdc-1.0.0-SNAPSHOT.jar
```

## 配置

编辑 `src/main/resources/application.yml`：

```yaml
server:
  port: 8080

nrdc:
  capture:
    fps: 30                 # 帧率 (5-30)
    interval-ms: 33         # 广播间隔（毫秒）
    quality: 0.6            # JPEG 质量 (0.1-1.0)
    image-format: png       # 编码格式: jpg（有损，带宽低）/ png（无损，画质高）
    scale-factor: 1.0       # 缩放比例 (0.25-1.0)，1.0 为原始分辨率
    block-size: 128         # 差分编码块大小（像素），范围 32-512
    keyframe-interval: 60   # 每 N 帧强制发送关键帧
    max-diff-ratio: 0.5     # 超过此比例块变化时退回全帧 (0.1-0.9)
  auth:
    token: nrdc-default-token  # 保留配置项（兼容），实际使用 users.json 管理
  websocket:
    endpoint: /ws
    destination-prefix: /topic
```

### 用户管理

- 用户数据持久化在 `users.json`（工作目录下）
- 首次启动自动创建默认管理员 `admin/admin`
- 管理员可通过页面右上角 👤 按钮管理用户（新增、角色切换、重置密码、删除）
- 会话 Token 有效期 24 小时

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| F11 | 全屏切换 |
| F2 | 打开/关闭连接面板 |
| Ctrl+Alt+Del | 发送特殊按键 |

## 项目结构

```
src/main/java/com/nrdc/
├── config/       # 配置类（WebSocket、CORS、属性绑定）
├── controller/   # REST 控制器（登录、用户管理接口）
├── websocket/    # WebSocket 处理器与会话管理
├── service/      # 屏幕捕获、帧编码、输入分发
├── dto/          # 数据传输对象
└── auth/         # 鉴权、用户管理、Token 管理
```

## License

MIT
