package com.nrdc.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class SessionManager {

    private static final Logger log = LoggerFactory.getLogger(SessionManager.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();
    private final Map<String, WebSocketSession> sessionMap = new ConcurrentHashMap<>();

    /** 当前拥有操作权的 session ID，null 表示无人操作 */
    private volatile String operatorSessionId = null;
    /** 当前操作者的用户名 */
    private volatile String operatorUsername = null;

    // ===== 会话管理 =====

    public void addSession(WebSocketSession session) {
        sessions.add(session);
        sessionMap.put(session.getId(), session);
        log.info("客户端连接，sessionId={}, username={}, 当前连接数: {}",
                getSessionId(session), getUsername(session), sessions.size());
    }

    public void removeSession(WebSocketSession session) {
        sessions.remove(session);
        sessionMap.remove(session.getId());

        String sessionId = getSessionId(session);
        log.info("客户端断开，sessionId={}, username={}, 当前连接数: {}",
                sessionId, getUsername(session), sessions.size());

        // 如果操作者断开，释放操作权
        if (sessionId != null && sessionId.equals(operatorSessionId)) {
            releaseOperator(sessionId);
        }
    }

    // ===== 屏幕帧广播 =====

    public void broadcastScreenFrame(byte[] frameData) {
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new BinaryMessage(frameData));
                } catch (IOException e) {
                    log.error("向客户端发送帧数据失败: {}", e.getMessage());
                    removeSession(session);
                }
            }
        }
    }

    // ===== 操作权控制 =====

    /**
     * 请求操作权。
     * @return true 如果成功获取操作权，false 如果被拒绝（别人正在操作）
     */
    public synchronized boolean requestOperator(String sessionId) {
        if (operatorSessionId != null && !operatorSessionId.equals(sessionId)) {
            return false;
        }
        operatorSessionId = sessionId;
        operatorUsername = getUsernameBySessionId(sessionId);
        log.info("操作权转移: sessionId={}, username={}", sessionId, operatorUsername);
        return true;
    }

    /**
     * 释放操作权。
     */
    public synchronized void releaseOperator(String sessionId) {
        if (operatorSessionId != null && operatorSessionId.equals(sessionId)) {
            log.info("操作权释放: sessionId={}, username={}", operatorSessionId, operatorUsername);
            operatorSessionId = null;
            operatorUsername = null;
        }
    }

    public synchronized boolean isOperator(String sessionId) {
        return operatorSessionId != null && operatorSessionId.equals(sessionId);
    }

    public synchronized String getOperatorSessionId() {
        return operatorSessionId;
    }

    public synchronized String getOperatorUsername() {
        return operatorUsername;
    }

    public int getSessionCount() {
        return sessions.size();
    }

    public boolean hasActiveSessions() {
        return !sessions.isEmpty();
    }

    // ===== 定向消息与广播 =====

    public void sendToSession(String sessionId, Object message) {
        WebSocketSession session = findSessionByAttrId(sessionId);
        if (session != null && session.isOpen()) {
            try {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
            } catch (IOException e) {
                log.error("向 sessionId={} 发送消息失败: {}", sessionId, e.getMessage());
            }
        }
    }

    public void broadcastTextMessage(Object message) {
        try {
            String json = objectMapper.writeValueAsString(message);
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    try {
                        session.sendMessage(new TextMessage(json));
                    } catch (IOException e) {
                        log.error("广播消息失败: {}", e.getMessage());
                        removeSession(session);
                    }
                }
            }
        } catch (Exception e) {
            log.error("序列化广播消息失败: {}", e.getMessage());
        }
    }

    // ===== 辅助方法 =====

    public String getSessionId(WebSocketSession session) {
        Object attr = session.getAttributes().get("sessionId");
        return attr != null ? attr.toString() : null;
    }

    public String getUsername(WebSocketSession session) {
        Object attr = session.getAttributes().get("username");
        return attr != null ? attr.toString() : "unknown";
    }

    public String getUsernameBySessionId(String sessionId) {
        WebSocketSession session = findSessionByAttrId(sessionId);
        return session != null ? getUsername(session) : "unknown";
    }

    public String getRoleBySessionId(String sessionId) {
        WebSocketSession session = findSessionByAttrId(sessionId);
        return session != null ? getRole(session) : "user";
    }

    public String getRole(WebSocketSession session) {
        Object attr = session.getAttributes().get("role");
        return attr != null ? attr.toString() : "user";
    }

    private WebSocketSession findSessionByAttrId(String sessionId) {
        for (WebSocketSession session : sessions) {
            if (sessionId.equals(getSessionId(session))) {
                return session;
            }
        }
        return null;
    }
}
