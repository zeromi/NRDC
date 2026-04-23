package com.nrdc.service;

import com.nrdc.config.AppProperties;
import com.nrdc.websocket.SessionManager;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;

@Service
public class ScreenBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(ScreenBroadcaster.class);

    private final ScreenCaptureService captureService;
    private final FrameEncoderService encoderService;
    private final SessionManager sessionManager;
    private final AppProperties appProperties;

    private volatile boolean running = true;
    private int frameCount;
    private long lastFpsTime;
    private int currentFps;

    public ScreenBroadcaster(ScreenCaptureService captureService,
                             FrameEncoderService encoderService,
                             SessionManager sessionManager,
                             AppProperties appProperties) {
        this.captureService = captureService;
        this.encoderService = encoderService;
        this.sessionManager = sessionManager;
        this.appProperties = appProperties;
    }

    @PostConstruct
    public void init() {
        encoderService.setQuality(appProperties.getCapture().getQuality());
        lastFpsTime = System.currentTimeMillis();
        log.info("屏幕广播服务启动，FPS: {}, 质量: {}",
                appProperties.getCapture().getFps(),
                appProperties.getCapture().getQuality());
    }

    @Scheduled(fixedRateString = "${nrdc.capture.interval-ms:50}")
    public void broadcastFrame() {
        if (!running || !sessionManager.hasActiveSessions()) {
            return;
        }

        try {
            BufferedImage screen = captureService.captureScreen();
            byte[] frameData = encoderService.encodeFrame(screen);
            if (frameData.length > 0) {
                sessionManager.broadcastScreenFrame(frameData);
            }

            frameCount++;
            updateFps();
        } catch (Exception e) {
            log.error("屏幕广播异常: {}", e.getMessage());
        }
    }

    private void updateFps() {
        long now = System.currentTimeMillis();
        long elapsed = now - lastFpsTime;
        if (elapsed >= 1000) {
            currentFps = (int) (frameCount * 1000L / elapsed);
            frameCount = 0;
            lastFpsTime = now;
        }
    }

    public int getCurrentFps() {
        return currentFps;
    }

    public void setQuality(double quality) {
        encoderService.setQuality(quality);
    }

    @PreDestroy
    public void destroy() {
        running = false;
        log.info("屏幕广播服务停止");
    }
}
