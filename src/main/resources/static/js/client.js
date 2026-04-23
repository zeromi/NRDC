/**
 * NRDC - Network Remote Desktop Control
 * 客户端核心逻辑：WebSocket 连接管理、Canvas 渲染、事件捕获
 */

class NRDCClient {
    constructor() {
        this.canvas = document.getElementById('remoteDesktop');
        this.ctx = this.canvas.getContext('2d');

        // 连接状态：disconnected / connecting / connected / disconnecting
        this.state = 'disconnected';
        this.ws = null;
        this.connectUrl = '';
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.manualClose = false; // 用户主动断开，不自动重连

        this.frameCount = 0;
        this.lastFpsTime = Date.now();
        this.displayFps = 0;
        this.currentQuality = 0.6;

        // 渲染优化：可复用 Image 对象 + 帧队列
        this.renderImage = new Image();
        this.frameQueue = [];
        this.rendering = false;
        this.canvasInited = false;

        // 远程桌面实际分辨率（由服务端通知），用于鼠标坐标映射
        this.screenWidth = 0;
        this.screenHeight = 0;

        // 远程帧图像的实际尺寸，用于判断是否需要更新 canvas
        this.imageWidth = 0;
        this.imageHeight = 0;

        this.initDOM();
        this.bindEvents();
        this.updateCanvasSize();
    }

    initDOM() {
        this.dom = {
            statusIndicator: document.getElementById('statusIndicator'),
            connectionStatus: document.getElementById('connectionStatus'),
            fpsDisplay: document.getElementById('fpsDisplay'),
            latencyDisplay: document.getElementById('latencyDisplay'),
            resolutionDisplay: document.getElementById('resolutionDisplay'),
            username: document.getElementById('username'),
            password: document.getElementById('password'),
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

        // 窗口大小变化 / 全屏切换时更新 canvas 分辨率
        window.addEventListener('resize', () => this.updateCanvasSize());
        document.addEventListener('fullscreenchange', () => {
            this.updateCanvasSize();
        });
    }

    // ===== 连接管理 =====

    toggleModal() {
        this.dom.connectModal.classList.toggle('open');
    }

    closeModal() {
        this.dom.connectModal.classList.remove('open');
    }

    async connect() {
        const username = this.dom.username.value.trim();
        const password = this.dom.password.value.trim();

        if (!username) {
            this.showToast('请输入用户名', 'error');
            return;
        }
        if (!password) {
            this.showToast('请输入密码', 'error');
            return;
        }

        this.manualClose = false;
        this.reconnectAttempts = 0;

        try {
            this.setState('connecting');

            // 1. 获取服务端 challenge
            const chResp = await fetch('/api/challenge');
            const chData = await chResp.json();
            if (!chResp.ok) {
                this.showToast('获取验证挑战失败', 'error');
                this.setState('disconnected');
                return;
            }
            const challenge = chData.challenge;

            // 2. 计算 SHA-256(challenge + password) 作为响应，密码不离开浏览器
            const encoder = new TextEncoder();
            const data = encoder.encode(challenge + password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const response = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // 3. 发送用户名 + challenge + response 进行登录
            const resp = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, challenge, response }),
            });
            const loginData = await resp.json();
            if (!resp.ok) {
                this.showToast(loginData.error || '登录失败', 'error');
                this.setState('disconnected');
                return;
            }
            this.connectUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://')
                + location.host + '/ws?token=' + encodeURIComponent(loginData.token);
            this.doConnect();
        } catch (err) {
            this.showToast('登录请求失败: ' + err.message, 'error');
            this.setState('disconnected');
        }
    }

    doConnect() {
        this.setState('connecting');

        try {
            this.ws = new WebSocket(this.connectUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => this.onConnected();
            this.ws.onclose = (e) => this.onDisconnected(e);
            this.ws.onerror = () => {};
            this.ws.onmessage = (e) => this.onMessage(e);
        } catch (err) {
            this.showToast('连接失败: ' + err.message, 'error');
            this.scheduleReconnect();
        }
    }

    disconnect() {
        this.manualClose = true;
        this.clearReconnectTimer();
        this.setState('disconnecting');

        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
            this.ws = null;
        }

        this.setState('disconnected');
    }

    scheduleReconnect() {
        this.clearReconnectTimer();
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.setState('disconnected');
            this.showToast('重连失败，请手动重新连接', 'error');
            return;
        }
        this.setState('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
        this.showToast(delay / 1000 + 's 后尝试第 ' + this.reconnectAttempts + ' 次重连...', '');
        this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    onConnected() {
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.setState('connected');
        this.dom.canvasOverlay.classList.add('hidden');
        this.closeModal();
        this.showToast('已连接到远程桌面', 'success');
    }

    onDisconnected(e) {
        this.ws = null;

        if (this.manualClose) {
            this.setState('disconnected');
            return;
        }

        this.scheduleReconnect();
    }

    setState(newState) {
        this.state = newState;
        const btnConnect = document.getElementById('btnConnect');
        const btnDisconnect = document.getElementById('btnDisconnect');

        switch (newState) {
            case 'disconnected':
                this.updateStatusUI('disconnected', '未连接');
                this.dom.canvasOverlay.classList.remove('hidden');
                btnConnect.disabled = false;
                btnDisconnect.disabled = true;
                break;
            case 'connecting':
                this.updateStatusUI('connecting', '连接中...');
                btnConnect.disabled = true;
                btnDisconnect.disabled = false;
                break;
            case 'connected':
                this.updateStatusUI('connected', '已连接');
                btnConnect.disabled = true;
                btnDisconnect.disabled = false;
                break;
            case 'disconnecting':
                this.updateStatusUI('disconnecting', '断开中...');
                btnConnect.disabled = true;
                btnDisconnect.disabled = true;
                break;
            case 'reconnecting':
                this.updateStatusUI('reconnecting', '重连中...');
                btnConnect.disabled = true;
                btnDisconnect.disabled = false;
                break;
        }
    }

    updateStatusUI(className, text) {
        this.dom.statusIndicator.className = 'status-dot ' + className;
        this.dom.connectionStatus.textContent = text;
    }

    // ===== 消息处理 =====

    onMessage(e) {
        if (e.data instanceof ArrayBuffer) {
            this.frameQueue.push(e.data);
            if (this.frameQueue.length > 2) {
                this.frameQueue.shift();
            }
            this.scheduleRender();
        } else if (typeof e.data === 'string') {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'SCREEN_INFO') {
                    this.screenWidth = msg.width;
                    this.screenHeight = msg.height;
                    this.dom.resolutionDisplay.textContent = msg.width + 'x' + msg.height;
                }
            } catch (err) { /* ignore non-JSON text */ }
        }
    }

    // ===== Canvas 尺寸管理 =====

    updateCanvasSize() {
        const container = document.getElementById('canvasContainer');
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.canvasInited = true;
        }
    }

    // ===== 渲染 =====

    scheduleRender() {
        if (this.rendering) return;
        this.rendering = true;
        requestAnimationFrame(() => this.processFrameQueue());
    }

    processFrameQueue() {
        if (this.frameQueue.length === 0) {
            this.rendering = false;
            return;
        }

        // 仅取最新帧，丢弃中间帧
        const buffer = this.frameQueue[this.frameQueue.length - 1];
        this.frameQueue.length = 0;

        const blob = new Blob([buffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        this.renderImage.onload = () => {
            this.imageWidth = this.renderImage.width;
            this.imageHeight = this.renderImage.height;

            const cw = this.canvas.width;
            const ch = this.canvas.height;

            // 启用高质量图像缩放
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';

            // 计算保持宽高比的绘制区域（letterbox）
            const scaleX = cw / this.imageWidth;
            const scaleY = ch / this.imageHeight;
            const scale = Math.min(scaleX, scaleY);
            const dw = Math.round(this.imageWidth * scale);
            const dh = Math.round(this.imageHeight * scale);
            const dx = Math.round((cw - dw) / 2);
            const dy = Math.round((ch - dh) / 2);

            this.ctx.fillStyle = '#0A0E17';
            this.ctx.fillRect(0, 0, cw, ch);
            this.ctx.drawImage(this.renderImage, dx, dy, dw, dh);
            URL.revokeObjectURL(url);

            this.updateFps();

            // 继续处理队列中的下一帧
            if (this.frameQueue.length > 0) {
                requestAnimationFrame(() => this.processFrameQueue());
            } else {
                this.rendering = false;
            }
        };
        this.renderImage.src = url;
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
        if (this.state !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(event));
    }

    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (!this.imageWidth || !this.imageHeight) return { x: 0, y: 0 };

        // Canvas 像素尺寸与 CSS 显示尺寸的比例（处理 devicePixelRatio）
        const cssW = rect.width;
        const cssH = rect.height;
        const pixelW = this.canvas.width;
        const pixelH = this.canvas.height;

        // 鼠标在 canvas 像素空间中的位置
        const px = (e.clientX - rect.left) / cssW * pixelW;
        const py = (e.clientY - rect.top) / cssH * pixelH;

        // 计算绘制区域（与 processFrameQueue 中的 letterbox 逻辑一致）
        const scaleX = pixelW / this.imageWidth;
        const scaleY = pixelH / this.imageHeight;
        const scale = Math.min(scaleX, scaleY);
        const dw = this.imageWidth * scale;
        const dh = this.imageHeight * scale;
        const dx = (pixelW - dw) / 2;
        const dy = (pixelH - dh) / 2;

        // 映射到远程桌面坐标
        const targetW = this.screenWidth || this.imageWidth;
        const targetH = this.screenHeight || this.imageHeight;

        return {
            x: Math.max(0, Math.min(targetW - 1, Math.round((px - dx) / scale))),
            y: Math.max(0, Math.min(targetH - 1, Math.round((py - dy) / scale))),
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
        if (this.state !== 'connected') return;
        // 防止 F11/F2 被当输入事件发送
        if (e.key === 'F11' || e.key === 'F2') return;

        const keyCode = this.mapKeyCode(e);
        if (keyCode > 0) {
            e.preventDefault();
            this.sendEvent({ type: 'KEY_PRESS', keyCode, timestamp: Date.now() });
        }
    }

    onKeyUp(e) {
        if (this.state !== 'connected') return;
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
        if (this.state === 'connected') {
            this.showToast('画质已调整: ' + Math.round(this.currentQuality * 100) + '%', 'success');
        }
    }

    takeScreenshot() {
        if (this.state !== 'connected') {
            this.showToast('请先连接远程桌面', 'error');
            return;
        }
        // 裁剪出实际绘制区域（去除 letterbox 黑边）
        const pixelW = this.canvas.width;
        const pixelH = this.canvas.height;
        const scaleX = pixelW / this.imageWidth;
        const scaleY = pixelH / this.imageHeight;
        const scale = Math.min(scaleX, scaleY);
        const dw = Math.round(this.imageWidth * scale);
        const dh = Math.round(this.imageHeight * scale);
        const dx = Math.round((pixelW - dw) / 2);
        const dy = Math.round((pixelH - dh) / 2);

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = this.imageWidth;
        tmpCanvas.height = this.imageHeight;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(this.canvas, dx, dy, dw, dh, 0, 0, this.imageWidth, this.imageHeight);

        const link = document.createElement('a');
        link.download = 'nrdc-screenshot-' + Date.now() + '.png';
        link.href = tmpCanvas.toDataURL('image/png');
        link.click();
        this.showToast('截图已保存', 'success');
    }

    // ===== UI 更新 =====

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
