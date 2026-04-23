package com.nrdc.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class SessionManager {

    private static final Logger log = LoggerFactory.getLogger(SessionManager.class);

    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();

    public void addSession(WebSocketSession session) {
        sessions.add(session);
        log.info("客户端连接，当前连接数: {}", sessions.size());
    }

    public void removeSession(WebSocketSession session) {
        sessions.remove(session);
        log.info("客户端断开，当前连接数: {}", sessions.size());
    }

    public void broadcastScreenFrame(byte[] frameData) {
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new org.springframework.web.socket.BinaryMessage(frameData));
                } catch (IOException e) {
                    log.error("向客户端发送帧数据失败: {}", e.getMessage());
                    removeSession(session);
                }
            }
        }
    }

    public int getSessionCount() {
        return sessions.size();
    }

    public boolean hasActiveSessions() {
        return !sessions.isEmpty();
    }
}
