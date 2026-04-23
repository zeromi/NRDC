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
    }

    public static class Auth {
        private String token = "nrdc-default-token";

        public String getToken() {
            return token;
        }

        public void setToken(String token) {
            this.token = token;
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
