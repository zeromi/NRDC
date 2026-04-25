package com.nrdc.controller;

import com.nrdc.auth.ChallengeStore;
import com.nrdc.auth.TokenStore;
import com.nrdc.auth.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
public class LoginController {

    private static final Logger log = LoggerFactory.getLogger(LoginController.class);

    private final TokenStore tokenStore;
    private final ChallengeStore challengeStore;
    private final UserService userService;

    public LoginController(TokenStore tokenStore, ChallengeStore challengeStore, UserService userService) {
        this.tokenStore = tokenStore;
        this.challengeStore = challengeStore;
        this.userService = userService;
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

        var userOpt = userService.findByUsername(username);
        if (userOpt.isEmpty()) {
            log.warn("登录失败，用户不存在: {}", username);
            return ResponseEntity.status(401).body(Map.of("error", "用户名或密码错误"));
        }

        var user = userOpt.get();

        // 客户端发送 SHA-256(challenge + SHA-256(plainPassword))
        // 服务端验证 SHA-256(challenge + storedPasswordHash) == response
        String expected = ChallengeStore.hash(challenge + user.getPasswordHash());
        if (!expected.equals(response)) {
            log.warn("登录失败，密码验证失败: {}", username);
            return ResponseEntity.status(401).body(Map.of("error", "用户名或密码错误"));
        }

        String sessionToken = UUID.randomUUID().toString().replace("-", "");
        tokenStore.addToken(sessionToken, username, user.getRole());
        log.info("用户登录成功: {} ({})", username, user.getRole());
        return ResponseEntity.ok(Map.of(
                "token", sessionToken,
                "role", user.getRole(),
                "username", user.getUsername()
        ));
    }
}
