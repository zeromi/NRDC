package com.nrdc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.SymbolLookup;
import java.lang.foreign.ValueLayout;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class NrDcApplication {

    public static void main(String[] args) {
        initDpiAwareness();
        SpringApplication.run(NrDcApplication.class, args);
    }

    /**
     * 在 AWT 初始化之前声明进程为 DPI 感知。
     * 使 Toolkit.getScreenSize() 返回物理分辨率，
     * Robot.createScreenCapture() 捕获物理像素，
     * Robot.mouseMove() 使用物理坐标。
     */
    private static void initDpiAwareness() {
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            return;
        }
        try {
            var linker = Linker.nativeLinker();
            // 优先使用 SetProcessDpiAwareness (Windows 8.1+)
            var shcore = SymbolLookup.libraryLookup("shcore.dll", Arena.global());
            var handle = shcore.find("SetProcessDpiAwareness").orElse(null);
            if (handle != null) {
                var setDpi = linker.downcallHandle(handle,
                        FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.JAVA_INT));
                // PROCESS_PER_MONITOR_DPI_AWARE = 2
                int hr = (int) setDpi.invokeExact(2);
                if (hr == 0) {
                    System.out.println("[NRDC] 已启用 Per-Monitor DPI 感知模式");
                    return;
                }
            }
            // 回退到 SetProcessDPIAware (Windows Vista+)
            var user32 = SymbolLookup.libraryLookup("user32.dll", Arena.global());
            var fallback = user32.find("SetProcessDPIAware").orElse(null);
            if (fallback != null) {
                var setAware = linker.downcallHandle(fallback,
                        FunctionDescriptor.of(ValueLayout.JAVA_INT));
                int result = (int) setAware.invokeExact();
                if (result != 0) {
                    System.out.println("[NRDC] 已启用全局 DPI 感知模式");
                    return;
                }
            }
        } catch (Throwable e) {
            System.err.println("[NRDC] DPI 感知设置失败: " + e.getMessage());
        }
    }
}
