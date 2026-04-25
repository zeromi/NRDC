package com.nrdc.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);
    private static final String DATA_FILE = "users.json";

    private final ObjectMapper objectMapper;
    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    public UserService() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.enable(SerializationFeature.INDENT_OUTPUT);
    }

    @PostConstruct
    public void init() {
        lock.writeLock().lock();
        try {
            Path dataPath = getDataPath();
            if (Files.exists(dataPath)) {
                loadFromFile(dataPath);
            } else {
                createDefaultAdmin();
                saveToFile(dataPath);
            }
            log.info("用户服务初始化完成，已加载 {} 个用户", users.size());
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void createDefaultAdmin() {
        User admin = User.createAdmin("admin", "admin");
        users.put(admin.getUsername(), admin);
        log.info("已创建默认管理员账号: admin/admin");
    }

    private Path getDataPath() {
        return Paths.get(DATA_FILE);
    }

    private void loadFromFile(Path path) {
        try {
            String json = Files.readString(path);
            List<User> userList = objectMapper.readValue(json, new TypeReference<>() {});
            users.clear();
            for (User user : userList) {
                users.put(user.getUsername(), user);
            }
        } catch (IOException e) {
            log.error("加载用户数据失败，使用默认管理员账号: {}", e.getMessage());
            users.clear();
            createDefaultAdmin();
        }
    }

    private void saveToFile() {
        lock.writeLock().lock();
        try {
            saveToFile(getDataPath());
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void saveToFile(Path path) {
        try {
            String json = objectMapper.writeValueAsString(users.values());
            Files.writeString(path, json);
        } catch (IOException e) {
            log.error("保存用户数据失败: {}", e.getMessage());
        }
    }

    public Optional<User> findByUsername(String username) {
        lock.readLock().lock();
        try {
            return Optional.ofNullable(users.get(username));
        } finally {
            lock.readLock().unlock();
        }
    }

    public boolean verifyPassword(String username, String challenge, String response) {
        lock.readLock().lock();
        try {
            User user = users.get(username);
            if (user == null) return false;
            return ChallengeStore.hash(challenge + user.getPasswordHash()).equals(response);
        } finally {
            lock.readLock().unlock();
        }
    }

    public List<User> listUsers() {
        lock.readLock().lock();
        try {
            return List.copyOf(users.values());
        } finally {
            lock.readLock().unlock();
        }
    }

    public User addUser(String username, String plainPassword, String role) {
        lock.writeLock().lock();
        try {
            if (users.containsKey(username)) {
                throw new IllegalArgumentException("用户名已存在: " + username);
            }
            User user = "admin".equals(role)
                    ? User.createAdmin(username, plainPassword)
                    : User.createUser(username, plainPassword);
            users.put(username, user);
            saveToFile(getDataPath());
            log.info("新增用户: {} ({})", username, role);
            return user;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public User updateUserPassword(String username, String newPassword) {
        lock.writeLock().lock();
        try {
            User user = users.get(username);
            if (user == null) {
                throw new IllegalArgumentException("用户不存在: " + username);
            }
            user.setPasswordHash(ChallengeStore.hash(newPassword));
            saveToFile(getDataPath());
            log.info("更新用户密码: {}", username);
            return user;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public User updateUserRole(String username, String newRole) {
        lock.writeLock().lock();
        try {
            User user = users.get(username);
            if (user == null) {
                throw new IllegalArgumentException("用户不存在: " + username);
            }
            user.setRole(newRole);
            saveToFile(getDataPath());
            log.info("更新用户角色: {} -> {}", username, newRole);
            return user;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void deleteUser(String username) {
        lock.writeLock().lock();
        try {
            if (!users.containsKey(username)) {
                throw new IllegalArgumentException("用户不存在: " + username);
            }
            if ("admin".equals(username)) {
                throw new IllegalArgumentException("不能删除管理员账号");
            }
            users.remove(username);
            saveToFile(getDataPath());
            log.info("删除用户: {}", username);
        } finally {
            lock.writeLock().unlock();
        }
    }
}
