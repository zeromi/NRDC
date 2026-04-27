package com.nrdc.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nrdc.dto.InputEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.awt.datatransfer.Clipboard;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.StringSelection;
import java.awt.datatransfer.Transferable;
import java.awt.event.KeyEvent;

@Service
public class InputEventDispatcher {

    private static final Logger log = LoggerFactory.getLogger(InputEventDispatcher.class);

    private final Robot robot;
    private final ObjectMapper objectMapper;

    public InputEventDispatcher(ScreenCaptureService screenCaptureService) {
        this.robot = screenCaptureService.getRobot();
        this.objectMapper = new ObjectMapper();
    }

    public void dispatch(String jsonPayload) {
        try {
            InputEvent event = objectMapper.readValue(jsonPayload, InputEvent.class);
            dispatchEvent(event);
        } catch (Exception e) {
            log.error("解析输入事件失败: {}", e.getMessage());
        }
    }

    private void dispatchEvent(InputEvent event) {
        switch (event.getType()) {
            case MOUSE_MOVE -> handleMouseMove(event);
            case MOUSE_PRESS -> handleMousePress(event);
            case MOUSE_RELEASE -> handleMouseRelease(event);
            case MOUSE_WHEEL -> handleMouseWheel(event);
            case KEY_PRESS -> handleKeyPress(event);
            case KEY_RELEASE -> handleKeyRelease(event);
            case TEXT_INPUT -> handleTextInput(event);
            default -> log.warn("未知事件类型: {}", event.getType());
        }
    }

    private void handleMouseMove(InputEvent event) {
        robot.mouseMove(event.getX(), event.getY());
    }

    private void handleMousePress(InputEvent event) {
        int buttonMask = mapMouseButton(event.getButton());
        robot.mousePress(buttonMask);
    }

    private void handleMouseRelease(InputEvent event) {
        int buttonMask = mapMouseButton(event.getButton());
        robot.mouseRelease(buttonMask);
    }

    private void handleMouseWheel(InputEvent event) {
        robot.mouseWheel(event.getWheelDelta());
    }

    private void handleKeyPress(InputEvent event) {
        robot.keyPress(event.getKeyCode());
    }

    private void handleKeyRelease(InputEvent event) {
        robot.keyRelease(event.getKeyCode());
    }

    /**
     * 处理文本输入（非ASCII字符，如中文、日文等）。
     * 通过剪贴板 + Ctrl+V 模拟粘贴来实现。
     */
    private void handleTextInput(InputEvent event) {
        String text = event.getText();
        if (text == null || text.isEmpty()) return;

        try {
            Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();

            // 保存当前剪贴板内容
            Transferable oldContents = null;
            try {
                oldContents = clipboard.getContents(null);
            } catch (Exception ignored) {}

            // 设置新内容到剪贴板
            clipboard.setContents(new StringSelection(text), null);

            // 模拟 Ctrl+V 粘贴
            robot.keyPress(KeyEvent.VK_CONTROL);
            robot.delay(30);
            robot.keyPress(KeyEvent.VK_V);
            robot.delay(30);
            robot.keyRelease(KeyEvent.VK_V);
            robot.delay(30);
            robot.keyRelease(KeyEvent.VK_CONTROL);

            // 恢复剪贴板内容
            if (oldContents != null) {
                try {
                    clipboard.setContents(oldContents, null);
                } catch (Exception ignored) {}
            }

            log.debug("文本输入已发送: {}", text.length() > 10 ? text.substring(0, 10) + "..." : text);
        } catch (Exception e) {
            log.error("文本输入失败: {}", e.getMessage());
        }
    }

    private int mapMouseButton(int button) {
        return switch (button) {
            case 2 -> java.awt.event.InputEvent.BUTTON2_DOWN_MASK;
            case 3 -> java.awt.event.InputEvent.BUTTON3_DOWN_MASK;
            default -> java.awt.event.InputEvent.BUTTON1_DOWN_MASK;
        };
    }
}
