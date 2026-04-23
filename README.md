# NRDC - Network Remote Desktop Control

> 基于Spring Boot的浏览器远程桌面控制工具，支持Windows和Linux

## 功能特性

- 🖥️ **实时屏幕共享** - 浏览器中实时查看远程桌面画面
- 🖱️ **远程键鼠控制** - 在浏览器中操控远程设备鼠标和键盘
- 🔐 **Token 鉴权** - 连接认证，防止未授权访问
- 📊 **帧率画质可调** - 动态调节画面流畅度和画质
- 🖥️ **跨平台** - 支持 Windows 和 Linux（X11/Xvfb）
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
mvn clean package -DskipTests

# 启动
java -jar target/nrdc-1.0.0-SNAPSHOT.jar
```

### 浏览器访问

1. 打开 `http://localhost:8080`
2. 按 `F2` 或点击右上角 ⚙ 按钮打开连接面板
3. 输入 WebSocket 地址：`ws://localhost:8080/ws`
4. 输入认证令牌：`nrdc-default-token`（可在 `application.yml` 中修改）
5. 点击「连接」

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
    fps: 20              # 帧率 (5-30)
    quality: 0.6         # JPEG 质量 (0.1-1.0)
  auth:
    token: your-secret   # 修改为你的令牌
```

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
├── websocket/    # WebSocket 处理器与会话管理
├── service/      # 屏幕捕获、帧编码、输入分发
├── dto/          # 数据传输对象
└── auth/         # 鉴权拦截器
```

## License

MIT
