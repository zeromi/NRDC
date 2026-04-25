package com.nrdc.auth;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TokenStore {

    /**
     * Token 默认有效期：24 小时（毫秒）
     */
    static final long DEFAULT_TTL_MS = 24 * 60 * 60 * 1000L;

    private final Map<String, TokenInfo> tokenMap = new ConcurrentHashMap<>();

    /**
     * 生成并存储 token（默认 24 小时有效）
     */
    public void addToken(String token, String username, String role) {
        addToken(token, username, role, DEFAULT_TTL_MS);
    }

    /**
     * 生成并存储 token（指定有效期）
     */
    public void addToken(String token, String username, String role, long ttlMs) {
        tokenMap.put(token, new TokenInfo(username, role, System.currentTimeMillis() + ttlMs));
    }

    /**
     * 验证 token（不消费），返回关联的 TokenInfo
     * @return TokenInfo，token 无效或已过期返回 null
     */
    public TokenInfo validateToken(String token) {
        if (token == null) return null;
        TokenInfo info = tokenMap.get(token);
        if (info == null) return null;
        if (System.currentTimeMillis() > info.expireAt) {
            tokenMap.remove(token);
            return null;
        }
        return info;
    }

    /**
     * 移除 token（用于主动注销）
     */
    public void removeToken(String token) {
        tokenMap.remove(token);
    }

    public record TokenInfo(String username, String role, long expireAt) {}
}
