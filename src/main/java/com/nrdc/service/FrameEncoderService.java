package com.nrdc.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

@Service
public class FrameEncoderService {

    private static final Logger log = LoggerFactory.getLogger(FrameEncoderService.class);

    private double quality = 0.6f;
    private double scaleFactor = 0.5;
    private BufferedImage previousFrame;
    private int[] previousPixels;

    private int scaledWidth;
    private int scaledHeight;
    private boolean initialized = false;
    private BufferedImage reusableScaledBuffer;

    /**
     * 初始化（线程安全，仅调用一次）
     */
    private synchronized void ensureInitialized() {
        if (initialized) return;
        if (!ImageIO.getImageWritersByFormatName("png").hasNext()) {
            throw new RuntimeException("No PNG ImageWriter found");
        }
        initialized = true;
    }

    /**
     * 更新缩放尺寸
     */
    private void updateScaledSize(int screenW, int screenH) {
        int newW = (int) (screenW * scaleFactor);
        int newH = (int) (screenH * scaleFactor);
        if (newW == scaledWidth && newH == scaledHeight) return;
        this.scaledWidth = Math.max(1, newW);
        this.scaledHeight = Math.max(1, newH);
        this.previousFrame = null;
        this.previousPixels = null;
        this.reusableScaledBuffer = new BufferedImage(scaledWidth, scaledHeight, BufferedImage.TYPE_INT_RGB);
        log.info("编码分辨率调整为: {}x{} (scale={})", scaledWidth, scaledHeight, scaleFactor);
    }

    /**
     * 检测两帧之间是否有显著变化（快速像素对比，仅采样检测）
     */
    private boolean hasSignificantChange(BufferedImage currentFrame) {
        if (previousFrame == null) return true;

        int w = currentFrame.getWidth();
        int h = currentFrame.getHeight();

        if (previousFrame.getWidth() != w || previousFrame.getHeight() != h) {
            return true;
        }

        // 提取当前帧像素
        int[] currentPixels;
        try {
            currentPixels = ((DataBufferInt) currentFrame.getRaster().getDataBuffer()).getData();
        } catch (Exception e) {
            return true; // 无法提取像素，视为有变化
        }

        // 采样检测：每隔若干像素检测一次，覆盖整幅图像
        int step = Math.max(1, (w * h) / 5000); // 检测约 5000 个采样点
        int diffCount = 0;
        int threshold = 3; // RGB 差值阈值
        int maxDiffPixels = 50; // 最大允许相同像素数（低于此值视为无变化）

        for (int i = 0; i < w * h && diffCount < maxDiffPixels; i += step) {
            if (previousPixels[i] != currentPixels[i]) {
                int pr = previousPixels[i] & 0xFF;
                int pg = (previousPixels[i] >> 8) & 0xFF;
                int pb = (previousPixels[i] >> 16) & 0xFF;
                int cr = currentPixels[i] & 0xFF;
                int cg = (currentPixels[i] >> 8) & 0xFF;
                int cb = (currentPixels[i] >> 16) & 0xFF;
                if (Math.abs(pr - cr) > threshold || Math.abs(pg - cg) > threshold || Math.abs(pb - cb) > threshold) {
                    diffCount++;
                }
            }
        }

        if (diffCount >= maxDiffPixels) {
            previousPixels = currentPixels;
            return true;
        }

        return false;
    }

    /**
     * 编码帧：差分检测 → 缩放 → PNG 编码
     *
     * @return 编码后的字节数组，无变化时返回空数组
     */
    public byte[] encodeFrame(BufferedImage frame) {
        ensureInitialized();

        // 1) 差分检测
        if (!hasSignificantChange(frame)) {
            return new byte[0];
        }

        // 2) 缩放
        updateScaledSize(frame.getWidth(), frame.getHeight());
        BufferedImage scaled = scaleImage(frame);

        // 3) PNG 编码
        return compressPng(scaled);
    }

    /**
     * 缩放图像，使用高性能双线性插值
     */
    private BufferedImage scaleImage(BufferedImage src) {
        Graphics2D g = reusableScaledBuffer.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(src, 0, 0, scaledWidth, scaledHeight, null);
        g.dispose();
        return reusableScaledBuffer;
    }

    /**
     * PNG 编码
     */
    private byte[] compressPng(BufferedImage image) {
        try (var baos = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", baos);
            return baos.toByteArray();
        } catch (IOException e) {
            log.error("帧编码失败: {}", e.getMessage());
            return new byte[0];
        }
    }

    /**
     * 强制下一帧完整发送（重置差分基线）
     */
    public void resetBaseline() {
        this.previousFrame = null;
        this.previousPixels = null;
    }

    public void setQuality(double quality) {
        // PNG 为无损格式，不支持质量参数，此方法保留兼容性
        this.quality = Math.max(0.1, Math.min(1.0, quality));
    }

    public void setScaleFactor(double scaleFactor) {
        this.scaleFactor = Math.max(0.25, Math.min(1.0, scaleFactor));
        this.previousFrame = null;
        this.previousPixels = null;
    }

    public double getQuality() {
        return quality;
    }

    public double getScaleFactor() {
        return scaleFactor;
    }

    public int getEncodedWidth() {
        return scaledWidth;
    }

    public int getEncodedHeight() {
        return scaledHeight;
    }
}
