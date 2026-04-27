package com.nrdc.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nrdc.dto.InputEvent;
import com.nrdc.service.FrameEncoderService;
import com.nrdc.service.InputEventDispatcher;
import com.nrdc.service.ScreenCaptureService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.awt.*;
import java.awt.datatransfer.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.List;

@Component
public class ScreenWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ScreenWebSocketHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SessionManager sessionManager;
    private final InputEventDispatcher inputEventDispatcher;
    private final ScreenCaptureService captureService;
    private final FrameEncoderService encoderService;

    public ScreenWebSocketHandler(SessionManager sessionManager,
                                   InputEventDispatcher inputEventDispatcher,
                                   ScreenCaptureService captureService,
                                   FrameEncoderService encoderService) {
        this.sessionManager = sessionManager;
        this.inputEventDispatcher = inputEventDispatcher;
        this.captureService = captureService;
        this.encoderService = encoderService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessionManager.addSession(session);
        String sessionId = sessionManager.getSessionId(session);
        String username = sessionManager.getUsername(session);
        log.info("WebSocket 连接建立: {}, username={}", sessionId, username);

        // 发送屏幕实际分辨率和图像格式给客户端
        var info = new LinkedHashMap<String, Object>();
        info.put("type", "SCREEN_INFO");
        info.put("width", captureService.getScreenWidth());
        info.put("height", captureService.getScreenHeight());
        info.put("imageFormat", encoderService.getImageFormat());
        info.put("sessionId", sessionId);
        info.put("role", sessionManager.getRole(session));
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(info)));

        // 通知当前操作权状态
        String operatorId = sessionManager.getOperatorSessionId();
        String operatorName = sessionManager.getOperatorUsername();
        var controlInfo = new LinkedHashMap<String, Object>();
        controlInfo.put("type", "CONTROL_CHANGED");
        controlInfo.put("operatorId", operatorId);
        controlInfo.put("operator", operatorName);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(controlInfo)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = sessionManager.getSessionId(session);
        sessionManager.removeSession(session);
        log.info("WebSocket 连接关闭: {}, status={}", sessionId, status);

        // 广播操作权变更（如果操作者断开，removeSession 中已释放操作权）
        String operatorId = sessionManager.getOperatorSessionId();
        String operatorName = sessionManager.getOperatorUsername();
        sessionManager.broadcastTextMessage(Map.of(
                "type", "CONTROL_CHANGED",
                "operatorId", operatorId != null ? operatorId : "",
                "operator", operatorName != null ? operatorName : ""
        ));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            Map<String, Object> msg = objectMapper.readValue(message.getPayload(), Map.class);
            String type = (String) msg.get("type");

            if (type == null) return;

            String sessionId = sessionManager.getSessionId(session);

            switch (type) {
                case "REQUEST_CONTROL" -> handleRequestControl(sessionId);
                case "RELEASE_CONTROL" -> handleReleaseControl(sessionId);
                case "CLIPBOARD_SYNC" -> {
                    if (sessionManager.isOperator(sessionId)) {
                        handleClipboardSync(sessionId, message.getPayload());
                    }
                }
                default -> {
                    // 非控制消息视为输入事件，检查操作权
                    if (sessionManager.isOperator(sessionId)) {
                        inputEventDispatcher.dispatch(message.getPayload());
                    }
                }
            }
        } catch (Exception e) {
            log.error("处理消息失败: {}", e.getMessage());
        }
    }

    private void handleRequestControl(String sessionId) {
        boolean granted = sessionManager.requestOperator(sessionId);
        String operatorName = sessionManager.getUsernameBySessionId(sessionId);

        if (granted) {
            // 通知获取者
            sessionManager.sendToSession(sessionId, Map.of(
                    "type", "CONTROL_GRANTED"
            ));
            // 广播给所有人
            sessionManager.broadcastTextMessage(Map.of(
                    "type", "CONTROL_CHANGED",
                    "operatorId", sessionId,
                    "operator", operatorName
            ));
            log.info("操作权已授予: sessionId={}, username={}", sessionId, operatorName);
        } else {
            String currentOperator = sessionManager.getOperatorUsername();
            sessionManager.sendToSession(sessionId, Map.of(
                    "type", "CONTROL_DENIED",
                    "operator", currentOperator != null ? currentOperator : ""
            ));
            log.info("操作权被拒绝: sessionId={}, 当前操作者={}", sessionId, currentOperator);
        }
    }

    private void handleReleaseControl(String sessionId) {
        if (sessionManager.isOperator(sessionId)) {
            sessionManager.releaseOperator(sessionId);
            // 广播操作权释放
            sessionManager.broadcastTextMessage(Map.of(
                    "type", "CONTROL_CHANGED",
                    "operatorId", "",
                    "operator", ""
            ));
            // 通知释放者
            sessionManager.sendToSession(sessionId, Map.of(
                    "type", "CONTROL_RELEASED",
                    "reason", "你已主动释放操作权"
            ));
            log.info("操作权已释放: sessionId={}", sessionId);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket 传输错误: {}", exception.getMessage());
        String sessionId = sessionManager.getSessionId(session);
        sessionManager.removeSession(session);

        // 广播操作权变更
        String operatorId = sessionManager.getOperatorSessionId();
        String operatorName = sessionManager.getOperatorUsername();
        sessionManager.broadcastTextMessage(Map.of(
                "type", "CONTROL_CHANGED",
                "operatorId", operatorId != null ? operatorId : "",
                "operator", operatorName != null ? operatorName : ""
        ));
    }

    // ===== 剪贴板同步 =====

    /** 大文件阈值：5MB，超过此值广播提醒 */
    private static final long CLIPBOARD_LARGE_THRESHOLD = 5 * 1024 * 1024;

    @SuppressWarnings("unchecked")
    private void handleClipboardSync(String sessionId, String payload) {
        try {
            Map<String, Object> msg = objectMapper.readValue(payload, Map.class);
            String text = (String) msg.get("text");
            List<Map<String, Object>> files = (List<Map<String, Object>>) msg.get("files");

            boolean hasContent = (text != null && !text.isEmpty())
                    || (files != null && !files.isEmpty());
            if (!hasContent) return;

            // 计算总大小
            long totalSize = 0;
            if (text != null && !text.isEmpty()) {
                totalSize += text.getBytes(StandardCharsets.UTF_8).length;
            }

            // 处理文件：保存到临时目录
            List<File> fileList = new ArrayList<>();
            if (files != null) {
                for (Map<String, Object> fileItem : files) {
                    String name = (String) fileItem.get("name");
                    String base64Data = (String) fileItem.get("data");
                    Number sizeNum = (Number) fileItem.get("size");

                    if (base64Data == null || base64Data.isEmpty()) continue;

                    try {
                        byte[] fileBytes = Base64.getDecoder().decode(base64Data);
                        // 安全化文件名
                        String safeName = name != null ? name.replaceAll("[\\\\/:*?\"<>|]", "_") : "clipboard-file";
                        File tempFile = File.createTempFile("nrdc-clip-", "-" + safeName);
                        tempFile.deleteOnExit();
                        Files.write(tempFile.toPath(), fileBytes);
                        fileList.add(tempFile);

                        if (sizeNum != null) {
                            totalSize += sizeNum.longValue();
                        } else {
                            totalSize += fileBytes.length;
                        }
                    } catch (Exception e) {
                        log.warn("保存剪贴板文件失败: {}", e.getMessage());
                    }
                }
            }

            // 设置系统剪贴板
            try {
                Clipboard clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
                Transferable transferable;

                if (!fileList.isEmpty() && text != null && !text.isEmpty()) {
                    // 同时有文本和文件：复合 Transferable
                    transferable = new CompositeSelection(text, fileList);
                } else if (!fileList.isEmpty()) {
                    // 仅文件
                    transferable = new CompositeSelection(null, fileList);
                } else {
                    // 仅文本
                    transferable = new StringSelection(text);
                }

                clipboard.setContents(transferable, null);
                log.info("剪贴板已同步: sessionId={}, 大小={}bytes", sessionId, totalSize);
            } catch (Exception e) {
                log.error("设置系统剪贴板失败: {}", e.getMessage());
                return;
            }

            // 大文件提醒：广播通知所有连接的客户端
            if (totalSize >= CLIPBOARD_LARGE_THRESHOLD) {
                String operator = sessionManager.getUsernameBySessionId(sessionId);
                String summary = buildClipboardSummary(text, files, totalSize);
                sessionManager.broadcastTextMessage(Map.of(
                        "type", "CLIPBOARD_NOTIFICATION",
                        "operator", operator,
                        "message", summary,
                        "isLarge", true
                ));
            }
        } catch (Exception e) {
            log.error("处理剪贴板同步失败: {}", e.getMessage());
        }
    }

    /** 构建剪贴板同步摘要文本 */
    private String buildClipboardSummary(String text, List<?> files, long totalSize) {
        StringBuilder sb = new StringBuilder();
        sb.append("已同步剪贴板 (");
        sb.append(formatFileSize(totalSize));
        sb.append("): ");
        List<String> parts = new ArrayList<>();
        if (text != null && !text.isEmpty()) {
            parts.add("文本 " + formatFileSize(text.getBytes(StandardCharsets.UTF_8).length));
        }
        if (files != null && !files.isEmpty()) {
            parts.add(files.size() + "个文件");
        }
        sb.append(String.join(" + ", parts));
        return sb.toString();
    }

    /** 格式化文件大小 */
    private static String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + "B";
        if (bytes < 1024 * 1024) return String.format("%.1fKB", bytes / 1024.0);
        return String.format("%.1fMB", bytes / (1024.0 * 1024));
    }

    /**
     * 复合 Transferable：同时支持文本和文件列表。
     * 被控制端粘贴时，目标应用程序可以选择接受文本或文件。
     */
    private static class CompositeSelection implements Transferable {
        private final String text;
        private final List<File> files;

        CompositeSelection(String text, List<File> files) {
            this.text = text;
            this.files = files;
        }

        @Override
        public DataFlavor[] getTransferDataFlavors() {
            List<DataFlavor> flavors = new ArrayList<>();
            if (files != null && !files.isEmpty()) {
                flavors.add(DataFlavor.javaFileListFlavor);
            }
            if (text != null && !text.isEmpty()) {
                flavors.add(DataFlavor.stringFlavor);
                try {
                    flavors.add(new DataFlavor("text/plain; charset=utf-8"));
                } catch (ClassNotFoundException ignored) {}
            }
            return flavors.toArray(new DataFlavor[0]);
        }

        @Override
        public boolean isDataFlavorSupported(DataFlavor flavor) {
            if (files != null && !files.isEmpty() && DataFlavor.javaFileListFlavor.equals(flavor)) {
                return true;
            }
            if (text != null && !text.isEmpty()) {
                return DataFlavor.stringFlavor.equals(flavor)
                        || flavor.getMimeType().startsWith("text/plain");
            }
            return false;
        }

        @Override
        public Object getTransferData(DataFlavor flavor) throws UnsupportedFlavorException {
            if (DataFlavor.javaFileListFlavor.equals(flavor) && files != null) {
                return files;
            }
            if ((DataFlavor.stringFlavor.equals(flavor)
                    || flavor.getMimeType().startsWith("text/plain")) && text != null) {
                return text;
            }
            throw new UnsupportedFlavorException(flavor);
        }
    }
}
