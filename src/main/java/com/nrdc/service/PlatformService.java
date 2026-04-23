package com.nrdc.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.awt.GraphicsEnvironment;

@Service
public class PlatformService {

    private static final Logger log = LoggerFactory.getLogger(PlatformService.class);

    private String osName;
    private String osVersion;
    private boolean headless;
    private boolean x11Available;

    @PostConstruct
    public void init() {
        var props = System.getProperties();
        this.osName = props.getProperty("os.name", "unknown");
        this.osVersion = props.getProperty("os.version", "unknown");
        this.headless = GraphicsEnvironment.isHeadless();

        if (isLinux()) {
            this.x11Available = checkX11Available();
        } else {
            this.x11Available = true;
        }

        logPlatformInfo();
    }

    private void logPlatformInfo() {
        log.info("========== 平台信息 ==========");
        log.info("操作系统: {} {}", osName, osVersion);
        log.info("Headless 模式: {}", headless);
        if (isLinux()) {
            log.info("X11 可用: {}", x11Available);
            if (!x11Available && headless) {
                log.warn("Linux headless 环境未检测到 X11，请启动 Xvfb: Xvfb :99 -screen 0 1920x1080x24 &");
                log.warn("并设置环境变量: DISPLAY=:99");
            }
        }
        log.info("===============================");
    }

    private boolean checkX11Available() {
        try {
            var ge = GraphicsEnvironment.getLocalGraphicsEnvironment();
            return ge.getDefaultScreenDevice() != null;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isLinux() {
        return osName.toLowerCase().contains("linux");
    }

    public boolean isWindows() {
        return osName.toLowerCase().contains("windows");
    }

    public boolean isMac() {
        return osName.toLowerCase().contains("mac");
    }

    public String getOsName() {
        return osName;
    }

    public boolean isHeadless() {
        return headless;
    }

    public boolean isX11Available() {
        return x11Available;
    }
}
