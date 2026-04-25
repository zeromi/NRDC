package com.nrdc.controller;

import com.nrdc.auth.User;
import com.nrdc.auth.UserService;
import com.nrdc.websocket.SessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    private final UserService userService;
    private final SessionManager sessionManager;

    public UserController(UserService userService, SessionManager sessionManager) {
        this.userService = userService;
        this.sessionManager = sessionManager;
    }

    private boolean isAdmin(String sessionId) {
        String role = sessionManager.getRoleBySessionId(sessionId);
        return "admin".equals(role);
    }

    @GetMapping
    public ResponseEntity<?> listUsers(@RequestHeader(value = "X-Session-Id", required = false) String sessionId) {
        if (sessionId == null || !isAdmin(sessionId)) {
            return ResponseEntity.status(403).body(Map.of("error", "需要管理员权限"));
        }
        List<User> users = userService.listUsers();
        List<? extends Map<String, Object>> result = users.stream().map(u -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("username", u.getUsername());
            map.put("role", u.getRole());
            map.put("createdAt", u.getCreatedAt());
            return map;
        }).toList();
        return ResponseEntity.ok(result);
    }

    @PostMapping
    public ResponseEntity<?> addUser(@RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                     @RequestBody Map<String, String> body) {
        if (sessionId == null || !isAdmin(sessionId)) {
            return ResponseEntity.status(403).body(Map.of("error", "需要管理员权限"));
        }
        String username = body.get("username");
        String password = body.get("password");
        String role = body.get("role");

        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "用户名和密码不能为空"));
        }
        if (username.length() < 2 || username.length() > 20) {
            return ResponseEntity.badRequest().body(Map.of("error", "用户名长度应为 2-20 个字符"));
        }
        if (password.length() < 4) {
            return ResponseEntity.badRequest().body(Map.of("error", "密码长度不能少于 4 个字符"));
        }
        if (role == null || role.isBlank()) {
            role = "user";
        }
        if (!"admin".equals(role) && !"user".equals(role)) {
            return ResponseEntity.badRequest().body(Map.of("error", "角色只能是 admin 或 user"));
        }

        try {
            User user = userService.addUser(username, password, role);
            return ResponseEntity.ok(Map.of(
                    "message", "用户创建成功",
                    "username", user.getUsername(),
                    "role", user.getRole()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{username}/password")
    public ResponseEntity<?> updatePassword(@RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                            @PathVariable String username,
                                            @RequestBody Map<String, String> body) {
        if (sessionId == null || !isAdmin(sessionId)) {
            return ResponseEntity.status(403).body(Map.of("error", "需要管理员权限"));
        }
        String newPassword = body.get("password");
        if (newPassword == null || newPassword.isBlank() || newPassword.length() < 4) {
            return ResponseEntity.badRequest().body(Map.of("error", "密码长度不能少于 4 个字符"));
        }

        try {
            userService.updateUserPassword(username, newPassword);
            return ResponseEntity.ok(Map.of("message", "密码修改成功"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{username}/role")
    public ResponseEntity<?> updateRole(@RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                        @PathVariable String username,
                                        @RequestBody Map<String, String> body) {
        if (sessionId == null || !isAdmin(sessionId)) {
            return ResponseEntity.status(403).body(Map.of("error", "需要管理员权限"));
        }
        String newRole = body.get("role");
        if (!"admin".equals(newRole) && !"user".equals(newRole)) {
            return ResponseEntity.badRequest().body(Map.of("error", "角色只能是 admin 或 user"));
        }

        try {
            userService.updateUserRole(username, newRole);
            return ResponseEntity.ok(Map.of("message", "角色修改成功"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{username}")
    public ResponseEntity<?> deleteUser(@RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                        @PathVariable String username) {
        if (sessionId == null || !isAdmin(sessionId)) {
            return ResponseEntity.status(403).body(Map.of("error", "需要管理员权限"));
        }

        try {
            userService.deleteUser(username);
            return ResponseEntity.ok(Map.of("message", "用户删除成功"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
