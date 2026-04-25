package com.nrdc.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthHandshakeInterceptor.class);
    static final String ATTR_SESSION_ID = "sessionId";
    static final String ATTR_USERNAME = "username";

    private final TokenStore tokenStore;

    public AuthHandshakeInterceptor(TokenStore tokenStore) {
        this.tokenStore = tokenStore;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = null;
        var query = request.getURI().getQuery();
        if (query != null) {
            for (String param : query.split("&")) {
                var eq = param.indexOf('=');
                if (eq > 0 && "token".equals(param.substring(0, eq))) {
                    token = param.substring(eq + 1);
                    break;
                }
            }
        }

        String username = tokenStore.validateToken(token);
        if (username == null) {
            log.warn("WebSocket 握手鉴权失败，token 无效");
            return false;
        }

        String sessionId = java.util.UUID.randomUUID().toString().substring(0, 8);
        attributes.put(ATTR_SESSION_ID, sessionId);
        attributes.put(ATTR_USERNAME, username);
        log.info("WebSocket 握手成功，sessionId={}, username={}", sessionId, username);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }
}
