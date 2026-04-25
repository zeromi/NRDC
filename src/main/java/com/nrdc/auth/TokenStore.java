package com.nrdc.auth;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TokenStore {

    private final Map<String, TokenInfo> tokenMap = new ConcurrentHashMap<>();

    public void addToken(String token, String username, String role) {
        tokenMap.put(token, new TokenInfo(username, role));
    }

    /**
     * 验证并消费 token（一次性），返回关联的 TokenInfo
     * @return TokenInfo，验证失败返回 null
     */
    public TokenInfo validateToken(String token) {
        if (token == null) return null;
        return tokenMap.remove(token);
    }

    public record TokenInfo(String username, String role) {}
}
