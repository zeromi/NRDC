# Agent 开发指南

## 项目概述

NRDC（Network Remote Desktop Control）是基于 Spring Boot 4.0.5 的浏览器远程桌面控制工具，通过 WebSocket 实现实时屏幕共享与远程键鼠控制。

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
├── config/       # WebSocket、CORS 配置
├── controller/   # REST 控制器（登录接口）
├── websocket/    # WebSocket 处理器与会话管理
├── service/      # 屏幕捕获、帧编码、输入事件分发
├── dto/          # 数据传输对象
└── auth/         # Token 鉴权拦截器与 Token 管理
```

## 注意事项

- 仅使用 Java 25 稳定特性，未启用预览特性
- 远程桌面功能依赖本地图形环境（Windows 原生 / Linux 需 X11 或 Xvfb）
- 鉴权 Token 默认为 `nrdc-default-token`，可在 `application.yml` 中修改
