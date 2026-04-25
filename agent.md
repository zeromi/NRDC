# Agent 开发指南

## 项目概述

NRDC（Network Remote Desktop Control）是基于 Spring Boot 4.0.5 的浏览器远程桌面控制工具，通过 WebSocket 实现实时屏幕共享与远程键鼠控制。支持多用户角色管理、互斥操作权控制、块级差分编码、自动重连等功能。

## 必须遵守的环境配置

### JDK

本项目**必须使用 OpenJDK 25**，路径如下：

```
D:\ProgramFiles\Java\jdk-25
```

在执行任何构建或运行命令前，必须确保 `JAVA_HOME` 指向该路径：

```bash
set JAVA_HOME=D:\ProgramFiles\Java\jdk-25
```

### Maven

Maven 构建时**必须使用自定义配置文件**：

```
D:\ProgramFiles\maven\conf\settings_aliyun.xml
```

该配置使用了阿里云镜像源以加速依赖下载。构建命令需通过 `-s` 参数指定：

```bash
mvn clean package -DskipTests -s "D:\ProgramFiles\maven\conf\settings_aliyun.xml"
```

### 标准构建流程

```bash
# 1. 设置环境变量
set JAVA_HOME=D:\ProgramFiles\Java\jdk-25

# 2. 编译打包
mvn clean package -DskipTests -s "D:\ProgramFiles\maven\conf\settings_aliyun.xml"

# 3. 运行
java -jar target/nrdc-1.0.0-SNAPSHOT.jar
```

## 项目技术信息

| 项目 | 值 |
|------|-----|
| GroupId | `com.nrdc` |
| ArtifactId | `nrdc` |
| Spring Boot | 4.0.5 |
| Java 版本 | 25（启用 `--enable-preview`） |
| 通信协议 | WebSocket |
| 默认端口 | 8080 |

## 项目结构

```
src/main/java/com/nrdc/
├── config/       # WebSocket、CORS、属性配置绑定
├── controller/   # REST 控制器（登录接口、用户管理接口）
├── websocket/    # WebSocket 处理器、会话管理、操作权控制
├── service/      # 屏幕捕获、帧编码、输入事件分发
├── dto/          # 数据传输对象
└── auth/         # Token 鉴权、Challenge-Response、用户管理（JSON 持久化）
```

## 核心功能

- 实时屏幕捕获与推送（AWT Robot + JPEG/PNG 编码）
- 远程键鼠操控（WebSocket JSON 指令 + Robot 模拟）
- 用户名密码鉴权（Challenge-Response，SHA-256 摘要传输）
- 多用户角色管理（admin/user，`users.json` 持久化）
- 互斥操作权控制（多人观看，仅一人可操作）
- 块级差分编码（全帧/差分帧二进制协议，带宽节省 50-95%）
- 自动重连（sessionStorage Token 缓存）
- 跨平台（Windows 高 DPI 感知、Linux X11/Xvfb）

## 注意事项

- 仅使用 Java 25 稳定特性，未启用预览特性
- 远程桌面功能依赖本地图形环境（Windows 原生 / Linux 需 X11 或 Xvfb）
- 用户数据存储在工作目录 `users.json`，首次启动自动创建 `admin/admin`
- 会话 Token 有效期 24 小时，缓存在客户端 sessionStorage
