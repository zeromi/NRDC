package com.nrdc.config;

import com.nrdc.auth.AuthHandshakeInterceptor;
import com.nrdc.websocket.ScreenWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final AuthHandshakeInterceptor authHandshakeInterceptor;
    private final ScreenWebSocketHandler screenWebSocketHandler;

    public WebSocketConfig(AuthHandshakeInterceptor authHandshakeInterceptor,
                           ScreenWebSocketHandler screenWebSocketHandler) {
        this.authHandshakeInterceptor = authHandshakeInterceptor;
        this.screenWebSocketHandler = screenWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(screenWebSocketHandler, "/ws")
                .addInterceptors(authHandshakeInterceptor)
                .setAllowedOrigins("*");
    }
}
