package com.nrdc.auth;

import com.nrdc.config.AppProperties;
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
    private static final String ATTR_SESSION_ID = "sessionId";

    private final AppProperties appProperties;

    public AuthHandshakeInterceptor(AppProperties appProperties) {
        this.appProperties = appProperties;
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

        if (token == null || !token.equals(appProperties.getAuth().getToken())) {
            log.warn("WebSocket 握手鉴权失败，token 无效或不匹配");
            return false;
        }

        String sessionId = java.util.UUID.randomUUID().toString().substring(0, 8);
        attributes.put(ATTR_SESSION_ID, sessionId);
        log.info("WebSocket 握手成功，sessionId={}", sessionId);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }
}
