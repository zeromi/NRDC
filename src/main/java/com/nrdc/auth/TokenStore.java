package com.nrdc.auth;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TokenStore {

    private final Set<String> tokens = ConcurrentHashMap.newKeySet();

    public void addToken(String token) {
        tokens.add(token);
    }

    public boolean validateToken(String token) {
        return token != null && tokens.remove(token);
    }
}
