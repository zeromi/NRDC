package com.nrdc.auth;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ChallengeStore {

    private final Map<String, String> challenges = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    public String generateChallenge() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String nonce = HexFormat.of().formatHex(bytes);
        challenges.put(nonce, nonce);
        return nonce;
    }

    public boolean verifyResponse(String challenge, String response, String password) {
        if (!challenges.remove(challenge).equals(challenge)) {
            return false;
        }
        return response.equals(hash(challenge + password));
    }

    public static String hash(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
