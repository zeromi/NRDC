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
        log.info("WebSocket 连接建立: {}", session.getId());

        // 发送屏幕实际分辨率和图像格式给客户端
        var info = new java.util.LinkedHashMap<String, Object>();
        info.put("type", "SCREEN_INFO");
        info.put("width", captureService.getScreenWidth());
        info.put("height", captureService.getScreenHeight());
        info.put("imageFormat", encoderService.getImageFormat());
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(info)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessionManager.removeSession(session);
        log.info("WebSocket 连接关闭: {}, status={}", session.getId(), status);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        inputEventDispatcher.dispatch(message.getPayload());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket 传输错误: {}", exception.getMessage());
        sessionManager.removeSession(session);
    }
}
