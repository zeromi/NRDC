package com.nrdc.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

@Service
public class FrameEncoderService {

    private static final Logger log = LoggerFactory.getLogger(FrameEncoderService.class);

    // 帧类型标记
    private static final byte FULL_FRAME = 0x01;
    private static final byte DIFF_FRAME = 0x02;

    // 编码参数
    private double quality = 0.6f;
    private double scaleFactor = 0.5;
    private String imageFormat = "jpg";

    // 差分编码参数
    private int blockSize = 128;          // 块大小（像素）
    private int keyframeInterval = 60;    // 每 N 帧强制发送关键帧
    private double maxDiffRatio = 0.5;    // 超过此比例的块变化时退回全帧

    // 缩放状态
    private BufferedImage reusableScaledBuffer;
    private int scaledWidth;
    private int scaledHeight;

    // 差分比较状态
    private BufferedImage previousScaledFrame;

    // ImageWriter 状态
    private boolean initialized = false;
    private ImageWriter cachedWriter;
    private ImageWriteParam cachedWriteParam;

    // 帧计数
    private int frameCount = 0;
    private int lastKeyframeFrame = -999;

    /**
     * 图像格式: "jpg" 或 "png"
     */
    public void setImageFormat(String format) {
        String normalized = switch (format.toLowerCase().trim()) {
            case "jpeg", "jpg" -> "jpg";
            case "png" -> "png";
            default -> throw new IllegalArgumentException("不支持的图像格式: " + format + "，仅支持 jpg/png");
        };
        if (!normalized.equals(this.imageFormat)) {
            this.imageFormat = normalized;
            this.initialized = false;
            log.info("图像编码格式切换为: {}", this.imageFormat);
        }
    }

    public String getImageFormat() {
        return imageFormat;
    }

    /**
     * 初始化 ImageWriter
     */
    private synchronized void ensureInitialized() {
        if (initialized) return;

        String writerFormat = "jpg".equals(imageFormat) ? "jpeg" : "png";
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(writerFormat);
        if (!writers.hasNext()) {
            throw new RuntimeException("No " + imageFormat.toUpperCase() + " ImageWriter found");
        }

        cachedWriter = writers.next();
        cachedWriteParam = cachedWriter.getDefaultWriteParam();

        if ("jpg".equals(imageFormat)) {
            cachedWriteParam.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            cachedWriteParam.setCompressionQuality((float) quality);
            log.info("JPEG 编码器初始化完成，质量: {}", quality);
        } else {
            if (cachedWriteParam.canWriteCompressed()) {
                cachedWriteParam.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                cachedWriteParam.setCompressionType("Deflate");
                cachedWriteParam.setCompressionQuality(0.0f);
            }
            log.info("PNG 编码器初始化完成，启用 Deflate 最高压缩");
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
        this.previousScaledFrame = null;
        this.reusableScaledBuffer = new BufferedImage(scaledWidth, scaledHeight, BufferedImage.TYPE_INT_RGB);
        log.info("编码分辨率调整为: {}x{} (scale={})", scaledWidth, scaledHeight, scaleFactor);
    }

    /**
     * 缩放图像
     */
    private BufferedImage scaleImage(BufferedImage src) {
        Graphics2D g = reusableScaledBuffer.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(src, 0, 0, scaledWidth, scaledHeight, null);
        g.dispose();
        return reusableScaledBuffer;
    }

    /**
     * 编码帧：关键帧 / 差分帧 / 跳帧
     *
     * 二进制协议:
     *   FULL_FRAME (0x01):
     *     [1 byte] type
     *     [N bytes] 完整 JPEG/PNG 图像数据
     *
     *   DIFF_FRAME (0x02):
     *     [1 byte]  type
     *     [2 bytes] blockWidth
     *     [2 bytes] blockHeight
     *     [2 bytes] gridCols
     *     [2 bytes] gridRows
     *     [2 bytes] changedCount
     *     Per changed block:
     *       [2 bytes] colIndex
     *       [2 bytes] rowIndex
     *       [4 bytes] dataLength
     *       [dataLength bytes] JPEG/PNG 块数据
     *
     * @return 协议消息字节数组，无变化时返回空数组
     */
    public byte[] encodeFrame(BufferedImage frame) {
        ensureInitialized();
        updateScaledSize(frame.getWidth(), frame.getHeight());
        BufferedImage scaled = scaleImage(frame);

        frameCount++;

        // 判断是否需要发送关键帧（第一帧、分辨率变化、周期关键帧）
        boolean needKeyframe = (previousScaledFrame == null)
                || (frameCount - lastKeyframeFrame >= keyframeInterval);

        if (needKeyframe) {
            return buildFullFrame(scaled);
        }

        // 块级差分检测
        int gridCols = (scaledWidth + blockSize - 1) / blockSize;
        int gridRows = (scaledHeight + blockSize - 1) / blockSize;
        boolean[] changedBlocks = computeChangedBlocks(scaled, gridCols, gridRows);

        int changedCount = 0;
        for (boolean b : changedBlocks) {
            if (b) changedCount++;
        }

        // 无变化，跳帧
        if (changedCount == 0) {
            return new byte[0];
        }

        // 变化太多，退回全帧
        int totalBlocks = gridCols * gridRows;
        if ((double) changedCount / totalBlocks > maxDiffRatio) {
            return buildFullFrame(scaled);
        }

        return buildDiffFrame(scaled, changedBlocks, gridCols, gridRows);
    }

    /**
     * 构建全帧消息
     */
    private byte[] buildFullFrame(BufferedImage scaled) {
        byte[] imageBytes = compress(scaled);
        if (imageBytes.length == 0) {
            return new byte[0];
        }

        byte[] message = new byte[1 + imageBytes.length];
        message[0] = FULL_FRAME;
        System.arraycopy(imageBytes, 0, message, 1, imageBytes.length);

        updatePixelBaseline(scaled);
        lastKeyframeFrame = frameCount;
        return message;
    }

    /**
     * 构建差分帧消息
     */
    private byte[] buildDiffFrame(BufferedImage scaled, boolean[] changedBlocks, int gridCols, int gridRows) {
        try {
            // 编码所有变化的块，收集块数据
            List<int[]> blockMeta = new ArrayList<>(); // [col, row, dataLength]
            ByteArrayOutputStream blockDataStream = new ByteArrayOutputStream();

            for (int row = 0; row < gridRows; row++) {
                for (int col = 0; col < gridCols; col++) {
                    if (!changedBlocks[row * gridCols + col]) continue;

                    int x = col * blockSize;
                    int y = row * blockSize;
                    int w = Math.min(blockSize, scaledWidth - x);
                    int h = Math.min(blockSize, scaledHeight - y);

                    BufferedImage block = extractBlock(scaled, x, y, w, h);
                    byte[] blockData = compress(block);

                    if (blockData.length == 0) {
                        // 单块编码失败，退回全帧
                        log.warn("块编码失败 ({}, {})，退回全帧", col, row);
                        return buildFullFrame(scaled);
                    }

                    blockMeta.add(new int[]{col, row, blockData.length});
                    blockDataStream.write(blockData);
                }
            }

            // 构建消息
            // 头部: type(1) + blockW(2) + blockH(2) + gridCols(2) + gridRows(2) + count(2) = 11 bytes
            // 块元数据: (col(2) + row(2) + len(4)) * N = 8N bytes
            int headerSize = 11 + blockMeta.size() * 8;
            byte[] blockDataBytes = blockDataStream.toByteArray();
            byte[] message = new byte[headerSize + blockDataBytes.length];

            ByteBuffer buf = ByteBuffer.wrap(message);
            buf.order(ByteOrder.BIG_ENDIAN);

            buf.put(DIFF_FRAME);
            buf.putShort((short) blockSize);
            buf.putShort((short) blockSize);
            buf.putShort((short) gridCols);
            buf.putShort((short) gridRows);
            buf.putShort((short) blockMeta.size());

            for (int[] meta : blockMeta) {
                buf.putShort((short) meta[0]);
                buf.putShort((short) meta[1]);
                buf.putInt(meta[2]);
            }

            System.arraycopy(blockDataBytes, 0, message, headerSize, blockDataBytes.length);

            updatePixelBaseline(scaled);
            lastKeyframeFrame = frameCount;
            return message;

        } catch (IOException e) {
            log.error("构建差分帧失败: {}", e.getMessage());
            return buildFullFrame(scaled);
        }
    }

    /**
     * 块级差分检测（采样对比）
     *
     * @return boolean 数组，true 表示该块有显著变化
     */
    private boolean[] computeChangedBlocks(BufferedImage currentFrame, int gridCols, int gridRows) {
        boolean[] changed = new boolean[gridCols * gridRows];

        if (previousScaledFrame == null
                || previousScaledFrame.getWidth() != currentFrame.getWidth()
                || previousScaledFrame.getHeight() != currentFrame.getHeight()) {
            Arrays.fill(changed, true);
            return changed;
        }

        int[] prevPixels;
        int[] currPixels;
        try {
            prevPixels = ((DataBufferInt) previousScaledFrame.getRaster().getDataBuffer()).getData();
            currPixels = ((DataBufferInt) currentFrame.getRaster().getDataBuffer()).getData();
        } catch (Exception e) {
            Arrays.fill(changed, true);
            return changed;
        }

        int colorThreshold = 3;    // 颜色差异阈值
        int maxDiffSamples = 5;    // 超过此采样数才认为块变化

        int imgWidth = currentFrame.getWidth();

        for (int row = 0; row < gridRows; row++) {
            for (int col = 0; col < gridCols; col++) {
                int x0 = col * blockSize;
                int y0 = row * blockSize;
                int bw = Math.min(blockSize, imgWidth - x0);
                int bh = Math.min(blockSize, currentFrame.getHeight() - y0);

                // 采样步长：每块约采样 50 个像素
                int step = Math.max(1, (bw * bh) / 50);
                int diffCount = 0;

                outer:
                for (int y = y0; y < y0 + bh; y += step) {
                    for (int x = x0; x < x0 + bw; x += step) {
                        int idx = y * imgWidth + x;
                        int prev = prevPixels[idx];
                        int curr = currPixels[idx];
                        if (prev != curr) {
                            int dr = Math.abs((prev & 0xFF) - (curr & 0xFF));
                            int dg = Math.abs(((prev >> 8) & 0xFF) - ((curr >> 8) & 0xFF));
                            int db = Math.abs(((prev >> 16) & 0xFF) - ((curr >> 16) & 0xFF));
                            if (dr > colorThreshold || dg > colorThreshold || db > colorThreshold) {
                                diffCount++;
                                if (diffCount >= maxDiffSamples) break outer;
                            }
                        }
                    }
                }

                changed[row * gridCols + col] = (diffCount >= maxDiffSamples);
            }
        }

        return changed;
    }

    /**
     * 提取子区域图像
     */
    private BufferedImage extractBlock(BufferedImage source, int x, int y, int w, int h) {
        if (x == 0 && y == 0 && w == source.getWidth() && h == source.getHeight()) {
            return source;
        }
        BufferedImage block = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = block.createGraphics();
        g.drawImage(source, x, y, x + w, y + h, 0, 0, w, h, null);
        g.dispose();
        return block;
    }

    /**
     * 更新像素基线（用于下一帧差分比较）
     */
    private void updatePixelBaseline(BufferedImage currentFrame) {
        if (previousScaledFrame == null
                || previousScaledFrame.getWidth() != currentFrame.getWidth()
                || previousScaledFrame.getHeight() != currentFrame.getHeight()) {
            previousScaledFrame = new BufferedImage(
                    currentFrame.getWidth(), currentFrame.getHeight(), BufferedImage.TYPE_INT_RGB);
        }
        Graphics2D g = previousScaledFrame.createGraphics();
        g.drawImage(currentFrame, 0, 0, null);
        g.dispose();
    }

    /**
     * 编码压缩（复用 ImageWriter）
     */
    private byte[] compress(BufferedImage image) {
        try (var baos = new ByteArrayOutputStream()) {
            ImageOutputStream ios = ImageIO.createImageOutputStream(baos);
            cachedWriter.setOutput(ios);
            cachedWriter.write(null, new IIOImage(image, null, null), cachedWriteParam);
            ios.flush();
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
        this.previousScaledFrame = null;
        this.lastKeyframeFrame = -999;
    }

    public void setQuality(double quality) {
        this.quality = Math.max(0.1, Math.min(1.0, quality));
        if (cachedWriteParam != null && "jpg".equals(imageFormat)) {
            cachedWriteParam.setCompressionQuality((float) this.quality);
        }
    }

    public void setScaleFactor(double scaleFactor) {
        this.scaleFactor = Math.max(0.25, Math.min(1.0, scaleFactor));
        this.previousScaledFrame = null;
    }

    public void setBlockSize(int blockSize) {
        this.blockSize = Math.max(32, Math.min(512, blockSize));
        this.previousScaledFrame = null;
    }

    public void setKeyframeInterval(int keyframeInterval) {
        this.keyframeInterval = Math.max(1, keyframeInterval);
    }

    public void setMaxDiffRatio(double maxDiffRatio) {
        this.maxDiffRatio = Math.max(0.1, Math.min(0.9, maxDiffRatio));
    }

    public double getQuality() {
        return quality;
    }

    public double getScaleFactor() {
        return scaleFactor;
    }

    public int getBlockSize() {
        return blockSize;
    }

    public int getKeyframeInterval() {
        return keyframeInterval;
    }

    public int getEncodedWidth() {
        return scaledWidth;
    }

    public int getEncodedHeight() {
        return scaledHeight;
    }
}
