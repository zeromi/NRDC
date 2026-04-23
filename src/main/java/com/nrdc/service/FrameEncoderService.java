package com.nrdc.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

@Service
public class FrameEncoderService {

    private static final Logger log = LoggerFactory.getLogger(FrameEncoderService.class);

    private static final String FORMAT = "jpeg";

    private double quality = 0.6f;
    private BufferedImage previousFrame;

    public byte[] encodeFrame(BufferedImage frame) {
        try (var baos = new ByteArrayOutputStream()) {
            var writer = ImageIO.getImageWritersByFormatName(FORMAT).next();
            var writeParam = writer.getDefaultWriteParam();
            writeParam.setCompressionMode(javax.imageio.ImageWriteParam.MODE_EXPLICIT);
            writeParam.setCompressionQuality((float) quality);

            writer.setOutput(ImageIO.createImageOutputStream(baos));
            writer.write(null, new javax.imageio.IIOImage(frame, null, null), writeParam);
            writer.dispose();

            return baos.toByteArray();
        } catch (IOException e) {
            log.error("帧编码失败: {}", e.getMessage());
            return new byte[0];
        }
    }

    public void setQuality(double quality) {
        this.quality = Math.max(0.1, Math.min(1.0, quality));
    }

    public double getQuality() {
        return quality;
    }

    public BufferedImage getPreviousFrame() {
        return previousFrame;
    }

    public void setPreviousFrame(BufferedImage previousFrame) {
        this.previousFrame = previousFrame;
    }
}
