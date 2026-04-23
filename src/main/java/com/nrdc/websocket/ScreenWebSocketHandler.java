package com.nrdc.websocket;

import com.nrdc.dto.InputEvent;
import com.nrdc.service.InputEventDispatcher;
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

    private final SessionManager sessionManager;
    private final InputEventDispatcher inputEventDispatcher;

    public ScreenWebSocketHandler(SessionManager sessionManager,
                                   InputEventDispatcher inputEventDispatcher) {
        this.sessionManager = sessionManager;
        this.inputEventDispatcher = inputEventDispatcher;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessionManager.addSession(session);
        log.info("WebSocket 连接建立: {}", session.getId());
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
