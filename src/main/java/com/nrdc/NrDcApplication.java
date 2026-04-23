package com.nrdc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
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
     * 同时设置 Java AWT DPI 属性，双重保障。
     */
    private static void initDpiAwareness() {
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            return;
        }

        // 设置 Java AWT DPI 属性（必须在 AWT 初始化之前）
        System.setProperty("sun.java2d.dpiaware", "true");
        System.setProperty("sun.java2d.uiScale", "1.0");

        try {
            var linker = Linker.nativeLinker();
            var intLayout = ValueLayout.JAVA_INT;

            // 优先使用 SetProcessDpiAwareness (Windows 8.1+)
            var shcore = SymbolLookup.libraryLookup("shcore.dll", Arena.global());
            var handle = shcore.find("SetProcessDpiAwareness").orElse(null);
            if (handle != null) {
                var setDpi = linker.downcallHandle(handle,
                        FunctionDescriptor.of(intLayout, intLayout));
                // PROCESS_PER_MONITOR_DPI_AWARE = 2
                int hr = (int) setDpi.invokeExact(2);
                if (hr == 0) {
                    System.out.println("[NRDC] 已启用 Per-Monitor DPI 感知模式");
                    return;
                }
                System.err.println("[NRDC] SetProcessDpiAwareness 返回 HRESULT: 0x" + Integer.toHexString(hr));
            }

            // 回退到 SetProcessDPIAware (Windows Vista+)
            var user32 = SymbolLookup.libraryLookup("user32.dll", Arena.global());
            var fallback = user32.find("SetProcessDPIAware").orElse(null);
            if (fallback != null) {
                var setAware = linker.downcallHandle(fallback,
                        FunctionDescriptor.of(intLayout));
                int ret = (int) setAware.invokeExact();
                if (ret != 0) {
                    System.out.println("[NRDC] 已启用全局 DPI 感知模式");
                    return;
                }
            }

            System.err.println("[NRDC] DPI 感知设置未生效，将使用逻辑分辨率");
        } catch (Throwable e) {
            System.err.println("[NRDC] DPI 感知设置失败: " + e);
        }
    }
}
