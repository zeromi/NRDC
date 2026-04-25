package com.nrdc.auth;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TokenStore {

    private final Map<String, String> tokenUserMap = new ConcurrentHashMap<>();

    public void addToken(String token, String username) {
        tokenUserMap.put(token, username);
    }

    /**
     * 验证并消费 token（一次性），返回关联的用户名
     * @return 用户名，验证失败返回 null
     */
    public String validateToken(String token) {
        if (token == null) return null;
        String username = tokenUserMap.remove(token);
        return username;
    }
}
