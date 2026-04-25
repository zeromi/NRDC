package com.nrdc.controller;

import com.nrdc.auth.ChallengeStore;
import com.nrdc.auth.TokenStore;
import com.nrdc.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
public class LoginController {

    private static final Logger log = LoggerFactory.getLogger(LoginController.class);

    private final AppProperties appProperties;
    private final TokenStore tokenStore;
    private final ChallengeStore challengeStore;

    public LoginController(AppProperties appProperties, TokenStore tokenStore, ChallengeStore challengeStore) {
        this.appProperties = appProperties;
        this.tokenStore = tokenStore;
        this.challengeStore = challengeStore;
    }

    @GetMapping("/api/challenge")
    public ResponseEntity<?> challenge() {
        String nonce = challengeStore.generateChallenge();
        return ResponseEntity.ok(Map.of("challenge", nonce));
    }

    @PostMapping("/api/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String challenge = body.get("challenge");
        String response = body.get("response");

        if (username == null || challenge == null || response == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "缺少必要参数"));
        }

        if (!username.equals(appProperties.getAuth().getUsername())) {
            log.warn("登录失败，用户名错误: {}", username);
            return ResponseEntity.status(401).body(Map.of("error", "用户名或密码错误"));
        }

        if (!challengeStore.verifyResponse(challenge, response, appProperties.getAuth().getPassword())) {
            log.warn("登录失败，密码验证失败: {}", username);
            return ResponseEntity.status(401).body(Map.of("error", "用户名或密码错误"));
        }

        String sessionToken = UUID.randomUUID().toString().replace("-", "");
        tokenStore.addToken(sessionToken, username);
        log.info("用户登录成功: {}", username);
        return ResponseEntity.ok(Map.of("token", sessionToken));
    }
}
