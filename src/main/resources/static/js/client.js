/**
 * NRDC - Network Remote Desktop Control
 * 客户端核心逻辑：WebSocket 连接管理、Canvas 渲染、事件捕获
 */

class NRDCClient {
    constructor() {
        this.canvas = document.getElementById('remoteDesktop');
        this.ctx = this.canvas.getContext('2d');
        this.ws = null;
        this.connected = false;
        this.frameCount = 0;
        this.lastFpsTime = Date.now();
        this.displayFps = 0;
        this.currentQuality = 0.6;
        this.mouseMappingRatio = 1;

        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        this.dom = {
            statusIndicator: document.getElementById('statusIndicator'),
            connectionStatus: document.getElementById('connectionStatus'),
            fpsDisplay: document.getElementById('fpsDisplay'),
            latencyDisplay: document.getElementById('latencyDisplay'),
            resolutionDisplay: document.getElementById('resolutionDisplay'),
            wsUrl: document.getElementById('wsUrl'),
            authToken: document.getElementById('authToken'),
            connectModal: document.getElementById('connectModal'),
            canvasOverlay: document.getElementById('canvasOverlay'),
            sideToolbar: document.getElementById('sideToolbar'),
        };
    }

    bindEvents() {
        document.getElementById('btnToggleConnect').addEventListener('click', () => this.toggleModal());
        document.getElementById('btnCloseModal').addEventListener('click', () => this.closeModal());
        document.getElementById('btnConnect').addEventListener('click', () => this.connect());
        document.getElementById('btnDisconnect').addEventListener('click', () => this.disconnect());

        document.getElementById('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('btnToolbarToggle').addEventListener('click', () => this.toggleToolbar());
        document.getElementById('btnScreenshot').addEventListener('click', () => this.takeScreenshot());

        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setQuality(btn));
        });

        // Canvas 鼠标事件
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // 全局键盘事件
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));

        // 快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }
            if (e.key === 'F2') {
                e.preventDefault();
                this.toggleModal();
            }
        });

        // 模态弹窗背景点击关闭
        this.dom.connectModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
    }

    // ===== 连接管理 =====

    toggleModal() {
        this.dom.connectModal.classList.toggle('open');
    }

    closeModal() {
        this.dom.connectModal.classList.remove('open');
    }

    connect() {
        const url = this.dom.wsUrl.value.trim();
        const token = this.dom.authToken.value.trim();

        if (!url) {
            this.showToast('请输入 WebSocket 地址', 'error');
            return;
        }
        if (!token) {
            this.showToast('请输入认证令牌', 'error');
            return;
        }

        // 构建 WebSocket URL（附加 token 参数）
        const separator = url.includes('?') ? '&' : '?';
        const wsUrl = url + separator + 'token=' + encodeURIComponent(token);

        this.showToast('正在连接...', '');
        this.dom.connectionStatus.textContent = '连接中...';

        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => this.onConnected();
            this.ws.onclose = (e) => this.onDisconnected(e);
            this.ws.onerror = (e) => this.onError(e);
            this.ws.onmessage = (e) => this.onMessage(e);
        } catch (err) {
            this.showToast('连接失败: ' + err.message, 'error');
            this.updateStatus(false);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    onConnected() {
        this.connected = true;
        this.updateStatus(true);
        this.dom.canvasOverlay.classList.add('hidden');
        this.closeModal();
        this.showToast('已连接到远程桌面', 'success');
        document.getElementById('btnConnect').disabled = true;
        document.getElementById('btnDisconnect').disabled = false;
    }

    onDisconnected(e) {
        this.connected = false;
        this.updateStatus(false);
        this.dom.canvasOverlay.classList.remove('hidden');
        this.showToast('连接已断开', 'error');
        document.getElementById('btnConnect').disabled = false;
        document.getElementById('btnDisconnect').disabled = true;
        this.ws = null;
    }

    onError(e) {
        console.error('WebSocket error:', e);
        this.showToast('连接错误', 'error');
    }

    onMessage(e) {
        if (e.data instanceof ArrayBuffer) {
            this.renderFrame(e.data);
            this.updateFps();
        }
    }

    // ===== 渲染 =====

    renderFrame(buffer) {
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            // 更新鼠标坐标映射比例
            const rect = this.canvas.getBoundingClientRect();
            this.mouseMappingRatio = {
                x: img.width / rect.width,
                y: img.height / rect.height,
            };

            // 更新分辨率显示
            this.dom.resolutionDisplay.textContent = img.width + 'x' + img.height;
        };
        img.src = url;
    }

    updateFps() {
        this.frameCount++;
        const now = Date.now();
        const elapsed = now - this.lastFpsTime;
        if (elapsed >= 1000) {
            this.displayFps = Math.round(this.frameCount * 1000 / elapsed);
            this.dom.fpsDisplay.textContent = this.displayFps + ' FPS';
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    // ===== 输入事件 =====

    sendEvent(event) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(event));
    }

    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: Math.round((e.clientX - rect.left) * (this.mouseMappingRatio.x || 1)),
            y: Math.round((e.clientY - rect.top) * (this.mouseMappingRatio.y || 1)),
        };
    }

    onMouseMove(e) {
        const coords = this.getCanvasCoords(e);
        this.sendEvent({ type: 'MOUSE_MOVE', x: coords.x, y: coords.y, timestamp: Date.now() });
    }

    onMouseDown(e) {
        const coords = this.getCanvasCoords(e);
        const button = e.button + 1; // 转为 1/2/3
        this.sendEvent({ type: 'MOUSE_PRESS', x: coords.x, y: coords.y, button, timestamp: Date.now() });
    }

    onMouseUp(e) {
        const coords = this.getCanvasCoords(e);
        const button = e.button + 1;
        this.sendEvent({ type: 'MOUSE_RELEASE', x: coords.x, y: coords.y, button, timestamp: Date.now() });
    }

    onMouseWheel(e) {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -1 * 3; // 归一化
        this.sendEvent({ type: 'MOUSE_WHEEL', wheelDelta: delta, timestamp: Date.now() });
    }

    mapKeyCode(e) {
        // 浏览器 key -> Java AWT KeyEvent VK_* 映射
        const keyMap = {
            'Backspace': 8, 'Tab': 9, 'Enter': 10, 'ShiftLeft': 16, 'ShiftRight': 16,
            'ControlLeft': 17, 'ControlRight': 17, 'AltLeft': 18, 'AltRight': 18,
            'CapsLock': 20, 'Escape': 27, 'Space': 32, 'PageUp': 33, 'PageDown': 34,
            'End': 35, 'Home': 36,
            'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowRight': 39, 'ArrowDown': 40,
            'PrintScreen': 154, 'Insert': 155, 'Delete': 127,
            'MetaLeft': 524, 'MetaRight': 525,
        };

        if (keyMap[e.code] !== undefined) {
            return keyMap[e.code];
        }

        // F1-F12
        const fMatch = e.code.match(/^F(\d+)$/);
        if (fMatch) {
            return 111 + parseInt(fMatch[1]); // VK_F1=112, etc.
        }

        // 数字和小写字母直接映射到 keyCode
        if (e.key.length === 1) {
            return e.key.toUpperCase().charCodeAt(0);
        }

        return 0;
    }

    onKeyDown(e) {
        if (!this.connected) return;
        // 防止 F11/F2 被当输入事件发送
        if (e.key === 'F11' || e.key === 'F2') return;

        const keyCode = this.mapKeyCode(e);
        if (keyCode > 0) {
            e.preventDefault();
            this.sendEvent({ type: 'KEY_PRESS', keyCode, timestamp: Date.now() });
        }
    }

    onKeyUp(e) {
        if (!this.connected) return;
        if (e.key === 'F11' || e.key === 'F2') return;

        const keyCode = this.mapKeyCode(e);
        if (keyCode > 0) {
            this.sendEvent({ type: 'KEY_RELEASE', keyCode, timestamp: Date.now() });
        }
    }

    // ===== 工具栏操作 =====

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    toggleToolbar() {
        const toolbar = this.dom.sideToolbar;
        toolbar.classList.toggle('collapsed');
        const btn = document.getElementById('btnToolbarToggle');
        btn.textContent = toolbar.classList.contains('collapsed') ? '▶' : '◀';
    }

    setQuality(btn) {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentQuality = parseFloat(btn.dataset.quality);
        if (this.connected) {
            this.showToast('画质已调整: ' + Math.round(this.currentQuality * 100) + '%', 'success');
        }
    }

    takeScreenshot() {
        if (!this.connected) {
            this.showToast('请先连接远程桌面', 'error');
            return;
        }
        const link = document.createElement('a');
        link.download = 'nrdc-screenshot-' + Date.now() + '.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
        this.showToast('截图已保存', 'success');
    }

    // ===== UI 更新 =====

    updateStatus(connected) {
        this.dom.statusIndicator.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
        this.dom.connectionStatus.textContent = connected ? '已连接' : '未连接';
    }

    showToast(message, type) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast ' + (type || '');
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
    window.nrdc = new NRDCClient();
});
