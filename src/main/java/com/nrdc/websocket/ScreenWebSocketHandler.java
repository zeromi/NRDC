package com.nrdc.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nrdc.dto.InputEvent;
import com.nrdc.service.FrameEncoderService;
import com.nrdc.service.InputEventDispatcher;
import com.nrdc.service.ScreenCaptureService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class ScreenWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ScreenWebSocketHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SessionManager sessionManager;
    private final InputEventDispatcher inputEventDispatcher;
    private final ScreenCaptureService captureService;
    private final FrameEncoderService encoderService;

    public ScreenWebSocketHandler(SessionManager sessionManager,
                                   InputEventDispatcher inputEventDispatcher,
                                   ScreenCaptureService captureService,
                                   FrameEncoderService encoderService) {
        this.sessionManager = sessionManager;
        this.inputEventDispatcher = inputEventDispatcher;
        this.captureService = captureService;
        this.encoderService = encoderService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessionManager.addSession(session);
        String sessionId = sessionManager.getSessionId(session);
        String username = sessionManager.getUsername(session);
        log.info("WebSocket 连接建立: {}, username={}", sessionId, username);

        // 发送屏幕实际分辨率和图像格式给客户端
        var info = new LinkedHashMap<String, Object>();
        info.put("type", "SCREEN_INFO");
        info.put("width", captureService.getScreenWidth());
        info.put("height", captureService.getScreenHeight());
        info.put("imageFormat", encoderService.getImageFormat());
        info.put("sessionId", sessionId);
        info.put("role", sessionManager.getRole(session));
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(info)));

        // 通知当前操作权状态
        String operatorId = sessionManager.getOperatorSessionId();
        String operatorName = sessionManager.getOperatorUsername();
        var controlInfo = new LinkedHashMap<String, Object>();
        controlInfo.put("type", "CONTROL_CHANGED");
        controlInfo.put("operatorId", operatorId);
        controlInfo.put("operator", operatorName);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(controlInfo)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = sessionManager.getSessionId(session);
        sessionManager.removeSession(session);
        log.info("WebSocket 连接关闭: {}, status={}", sessionId, status);

        // 广播操作权变更（如果操作者断开，removeSession 中已释放操作权）
        String operatorId = sessionManager.getOperatorSessionId();
        String operatorName = sessionManager.getOperatorUsername();
        sessionManager.broadcastTextMessage(Map.of(
                "type", "CONTROL_CHANGED",
                "operatorId", operatorId != null ? operatorId : "",
                "operator", operatorName != null ? operatorName : ""
        ));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            Map<String, Object> msg = objectMapper.readValue(message.getPayload(), Map.class);
            String type = (String) msg.get("type");

            if (type == null) return;

            String sessionId = sessionManager.getSessionId(session);

            switch (type) {
                case "REQUEST_CONTROL" -> handleRequestControl(sessionId);
                case "RELEASE_CONTROL" -> handleReleaseControl(sessionId);
                default -> {
                    // 非控制消息视为输入事件，检查操作权
                    if (sessionManager.isOperator(sessionId)) {
                        inputEventDispatcher.dispatch(message.getPayload());
                    }
                }
            }
        } catch (Exception e) {
            log.error("处理消息失败: {}", e.getMessage());
        }
    }

    private void handleRequestControl(String sessionId) {
        boolean granted = sessionManager.requestOperator(sessionId);
        String operatorName = sessionManager.getUsernameBySessionId(sessionId);

        if (granted) {
            // 通知获取者
            sessionManager.sendToSession(sessionId, Map.of(
                    "type", "CONTROL_GRANTED"
            ));
            // 广播给所有人
            sessionManager.broadcastTextMessage(Map.of(
                    "type", "CONTROL_CHANGED",
                    "operatorId", sessionId,
                    "operator", operatorName
            ));
            log.info("操作权已授予: sessionId={}, username={}", sessionId, operatorName);
        } else {
            String currentOperator = sessionManager.getOperatorUsername();
            sessionManager.sendToSession(sessionId, Map.of(
                    "type", "CONTROL_DENIED",
                    "operator", currentOperator != null ? currentOperator : ""
            ));
            log.info("操作权被拒绝: sessionId={}, 当前操作者={}", sessionId, currentOperator);
        }
    }

    private void handleReleaseControl(String sessionId) {
        if (sessionManager.isOperator(sessionId)) {
            sessionManager.releaseOperator(sessionId);
            // 广播操作权释放
            sessionManager.broadcastTextMessage(Map.of(
                    "type", "CONTROL_CHANGED",
                    "operatorId", "",
                    "operator", ""
            ));
            // 通知释放者
            sessionManager.sendToSession(sessionId, Map.of(
                    "type", "CONTROL_RELEASED",
                    "reason", "你已主动释放操作权"
            ));
            log.info("操作权已释放: sessionId={}", sessionId);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket 传输错误: {}", exception.getMessage());
        String sessionId = sessionManager.getSessionId(session);
        sessionManager.removeSession(session);

        // 广播操作权变更
        String operatorId = sessionManager.getOperatorSessionId();
        String operatorName = sessionManager.getOperatorUsername();
        sessionManager.broadcastTextMessage(Map.of(
                "type", "CONTROL_CHANGED",
                "operatorId", operatorId != null ? operatorId : "",
                "operator", operatorName != null ? operatorName : ""
        ));
    }
}
