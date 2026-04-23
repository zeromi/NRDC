package com.nrdc.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PlatformServiceTest {

    @Test
    void platformService_detectsCurrentOS() {
        PlatformService service = new PlatformService();
        service.init();

        assertNotNull(service.getOsName());
        assertFalse(service.getOsName().equals("unknown"));

        // 当前环境只能是其中一种
        boolean isKnown = service.isLinux() || service.isWindows() || service.isMac();
        assertTrue(isKnown, "应检测到已知操作系统: " + service.getOsName());
    }
}
