package com.nrdc.auth;

import java.util.StringJoiner;

public class User {

    private String username;
    private String passwordHash;
    private String role; // "admin" or "user"
    private long createdAt;

    public User() {
    }

    public User(String username, String passwordHash, String role, long createdAt) {
        this.username = username;
        this.passwordHash = passwordHash;
        this.role = role;
        this.createdAt = createdAt;
    }

    public static User createAdmin(String username, String plainPassword) {
        return new User(username, ChallengeStore.hash(plainPassword), "admin", System.currentTimeMillis());
    }

    public static User createUser(String username, String plainPassword) {
        return new User(username, ChallengeStore.hash(plainPassword), "user", System.currentTimeMillis());
    }

    public boolean isAdmin() {
        return "admin".equals(role);
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public String toString() {
        return new StringJoiner(", ", User.class.getSimpleName() + "[", "]")
                .add("username='" + username + "'")
                .add("role='" + role + "'")
                .add("createdAt=" + createdAt)
                .toString();
    }
}
