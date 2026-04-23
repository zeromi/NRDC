package com.nrdc.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nrdc")
public class AppProperties {

    private Capture capture = new Capture();
    private Auth auth = new Auth();
    private WebSocket websocket = new WebSocket();

    public Capture getCapture() {
        return capture;
    }

    public void setCapture(Capture capture) {
        this.capture = capture;
    }

    public Auth getAuth() {
        return auth;
    }

    public void setAuth(Auth auth) {
        this.auth = auth;
    }

    public WebSocket getWebsocket() {
        return websocket;
    }

    public void setWebsocket(WebSocket websocket) {
        this.websocket = websocket;
    }

    public static class Capture {
        private int fps = 20;
        private double quality = 0.6;
        private int diffThreshold = 5;
        private double scaleFactor = 0.5;
        private String imageFormat = "jpg";
        private int blockSize = 128;
        private int keyframeInterval = 60;
        private double maxDiffRatio = 0.5;

        public int getFps() {
            return fps;
        }

        public void setFps(int fps) {
            this.fps = fps;
        }

        public double getQuality() {
            return quality;
        }

        public void setQuality(double quality) {
            this.quality = quality;
        }

        public int getDiffThreshold() {
            return diffThreshold;
        }

        public void setDiffThreshold(int diffThreshold) {
            this.diffThreshold = diffThreshold;
        }

        public double getScaleFactor() {
            return scaleFactor;
        }

        public void setScaleFactor(double scaleFactor) {
            this.scaleFactor = scaleFactor;
        }

        public String getImageFormat() {
            return imageFormat;
        }

        public void setImageFormat(String imageFormat) {
            this.imageFormat = imageFormat;
        }

        public int getBlockSize() {
            return blockSize;
        }

        public void setBlockSize(int blockSize) {
            this.blockSize = blockSize;
        }

        public int getKeyframeInterval() {
            return keyframeInterval;
        }

        public void setKeyframeInterval(int keyframeInterval) {
            this.keyframeInterval = keyframeInterval;
        }

        public double getMaxDiffRatio() {
            return maxDiffRatio;
        }

        public void setMaxDiffRatio(double maxDiffRatio) {
            this.maxDiffRatio = maxDiffRatio;
        }
    }

    public static class Auth {
        private String token = "nrdc-default-token";
        private String username = "admin";
        private String password = "admin";

        public String getToken() {
            return token;
        }

        public void setToken(String token) {
            this.token = token;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }

    public static class WebSocket {
        private String endpoint = "/ws";
        private String destinationPrefix = "/topic";

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public String getDestinationPrefix() {
            return destinationPrefix;
        }

        public void setDestinationPrefix(String destinationPrefix) {
            this.destinationPrefix = destinationPrefix;
        }
    }
}
