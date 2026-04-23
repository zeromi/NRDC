package com.nrdc.service;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.awt.image.BufferedImage;

@Service
public class ScreenCaptureService {

    private static final Logger log = LoggerFactory.getLogger(ScreenCaptureService.class);

    private final PlatformService platformService;
    private Robot robot;
    private Rectangle screenBounds;
    private BufferedImage reusableBuffer;

    public ScreenCaptureService(PlatformService platformService) throws AWTException {
        this.platformService = platformService;
        this.robot = new Robot();
        this.robot.setAutoDelay(0);
        this.screenBounds = getScreenBounds();
        this.reusableBuffer = new BufferedImage(
                screenBounds.width, screenBounds.height, BufferedImage.TYPE_INT_RGB);
        log.info("屏幕捕获服务初始化完成，屏幕分辨率: {}x{}", screenBounds.width, screenBounds.height);
    }

    private Rectangle getScreenBounds() {
        var screenSize = Toolkit.getDefaultToolkit().getScreenSize();
        return new Rectangle(0, 0, screenSize.width, screenSize.height);
    }

    /**
     * 捕获屏幕。直接写入可复用的 TYPE_INT_RGB BufferedImage，
     * 避免每帧分配新内存，同时确保像素格式兼容后续差分检测和缩放。
     */
    public BufferedImage captureScreen() {
        BufferedImage captured = robot.createScreenCapture(screenBounds);
        Graphics2D g = reusableBuffer.createGraphics();
        g.drawImage(captured, 0, 0, null);
        g.dispose();
        return reusableBuffer;
    }

    public int getScreenWidth() {
        return screenBounds.width;
    }

    public int getScreenHeight() {
        return screenBounds.height;
    }

    public Robot getRobot() {
        return robot;
    }

    @PreDestroy
    public void destroy() {
        log.info("屏幕捕获服务正在释放资源");
        robot = null;
    }
}
