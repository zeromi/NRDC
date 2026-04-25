/**
 * NRDC - Network Remote Desktop Control
 * 客户端核心逻辑：WebSocket 连接管理、Canvas 渲染、事件捕获
 * 支持全帧 (FULL_FRAME) 和差分帧 (DIFF_FRAME) 二进制协议
 * 支持多人观看 + 互斥操作权控制
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
        this.imageFormat = 'jpeg';

        // 渲染优化
        this.renderImage = new Image();
        this.canvasInited = false;

        // 远程桌面实际分辨率（由服务端通知），用于鼠标坐标映射
        this.screenWidth = 0;
        this.screenHeight = 0;

        // 远程帧图像的实际尺寸，用于判断是否需要更新 canvas
        this.imageWidth = 0;
        this.imageHeight = 0;

        // 离屏 Canvas：差分帧合成用
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.offscreenReady = false;

        // 帧序列号：丢弃过期帧
        this.frameSequence = 0;

        // 合成调度标记
        this.compositeScheduled = false;

        // 帧类型常量（与服务端协议一致）
        this.FULL_FRAME = 0x01;
        this.DIFF_FRAME = 0x02;

        // 操作权状态
        this.isOperator = false;
        this.operatorName = '';

        // 用户信息
        this.role = 'user';
        this.sessionId = '';
        this.currentUser = '';

        this.initDOM();
        this.bindEvents();
        this.updateCanvasSize();

        // 页面刷新后自动重连（用缓存的 Token，无需重新输入密码）
        this.autoReconnectWithToken();
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
            controlDisplay: document.getElementById('controlDisplay'),
            btnRequestControl: document.getElementById('btnRequestControl'),
            btnUserMgmt: document.getElementById('btnUserMgmt'),
            userMgmtModal: document.getElementById('userMgmtModal'),
            userFormModal: document.getElementById('userFormModal'),
            userTableBody: document.getElementById('userTableBody'),
            userFormTitle: document.getElementById('userFormTitle'),
            newUsername: document.getElementById('newUsername'),
            newPassword: document.getElementById('newPassword'),
            newRole: document.getElementById('newRole'),
            userDisplay: document.getElementById('userDisplay'),
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
        document.getElementById('btnRequestControl').addEventListener('click', () => this.toggleControl());

        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setQuality(btn));
        });

        // 用户管理按钮
        document.getElementById('btnUserMgmt').addEventListener('click', () => this.openUserMgmt());
        document.getElementById('btnCloseUserMgmt').addEventListener('click', () => this.closeUserMgmt());
        document.getElementById('btnAddUser').addEventListener('click', () => this.openUserForm());
        document.getElementById('btnCloseUserForm').addEventListener('click', () => this.closeUserForm());
        document.getElementById('btnCancelUser').addEventListener('click', () => this.closeUserForm());
        document.getElementById('btnSaveUser').addEventListener('click', () => this.saveUser());
        this.dom.userMgmtModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeUserMgmt());
        this.dom.userFormModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeUserForm());

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

            // 2. 计算 SHA-256(challenge + SHA-256(password)) 作为响应
            const encoder = new TextEncoder();
            const pwHashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password));
            const pwHash = Array.from(new Uint8Array(pwHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

            const data = encoder.encode(challenge + pwHash);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const response = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

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

            // 4. 缓存 Token 用于自动重连（sessionStorage: 刷新保留，关闭标签页自动清除）
            sessionStorage.setItem('nrdc_token', loginData.token);
            sessionStorage.setItem('nrdc_username', loginData.username || username);
            sessionStorage.setItem('nrdc_role', loginData.role || 'user');

            this.onTokenReady(loginData.token, loginData.username || username, loginData.role || 'user');
        } catch (err) {
            this.showToast('登录请求失败: ' + err.message, 'error');
            this.setState('disconnected');
        }
    }

    /**
     * 页面刷新后用缓存的 Token 自动重连
     */
    async autoReconnectWithToken() {
        const token = sessionStorage.getItem('nrdc_token');
        if (!token) return;

        try {
            const resp = await fetch('/api/token/verify', {
                headers: { 'X-Auth-Token': token }
            });
            if (!resp.ok) {
                // Token 已失效，清除缓存
                sessionStorage.removeItem('nrdc_token');
                sessionStorage.removeItem('nrdc_username');
                sessionStorage.removeItem('nrdc_role');
                return;
            }
            const data = await resp.json();
            this.dom.username.value = data.username;
            this.onTokenReady(token, data.username, data.role);
        } catch (err) {
            // 网络错误，不清除 Token，等网络恢复后用户手动重连
        }
    }

    /**
     * Token 就绪后建立 WebSocket 连接
     */
    onTokenReady(token, username, role) {
        this.currentUser = username;
        this.role = role;
        this.connectUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://')
            + location.host + '/ws?token=' + encodeURIComponent(token);
        this.doConnect();
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

        this.isOperator = false;
        this.operatorName = '';
        this.updateControlUI();
        this.setState('disconnected');
    }

    scheduleReconnect() {
        this.clearReconnectTimer();
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.setState('disconnected');
            this.showToast('重连失败，请手动重新连接', 'error');
            // 清除失效的 Token
            sessionStorage.removeItem('nrdc_token');
            return;
        }
        this.setState('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
        this.showToast(delay / 1000 + 's 后尝试第 ' + this.reconnectAttempts + ' 次重连...', '');

        // 用缓存的 Token 直接重连 WebSocket
        const savedToken = sessionStorage.getItem('nrdc_token');
        if (savedToken) {
            this.reconnectTimer = setTimeout(() => this.onTokenReady(
                savedToken,
                sessionStorage.getItem('nrdc_username') || this.currentUser,
                sessionStorage.getItem('nrdc_role') || this.role
            ), delay);
        } else {
            this.setState('disconnected');
            this.showToast('登录已过期，请重新登录', 'error');
        }
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
        this.isOperator = false;
        this.operatorName = '';
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
                this.updateUserRoleUI();
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
                this.updateUserRoleUI();
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
            this.handleBinaryMessage(new Uint8Array(e.data));
        } else if (typeof e.data === 'string') {
            try {
                const msg = JSON.parse(e.data);
                switch (msg.type) {
                    case 'SCREEN_INFO':
                        this.screenWidth = msg.width;
                        this.screenHeight = msg.height;
                        this.imageFormat = msg.imageFormat === 'png' ? 'png' : 'jpeg';
                        this.dom.resolutionDisplay.textContent = msg.width + 'x' + msg.height;
                        this.sessionId = msg.sessionId || '';
                        this.updateUserRoleUI();
                        break;
                    case 'CONTROL_GRANTED':
                        this.onControlGranted();
                        break;
                    case 'CONTROL_RELEASED':
                        this.onControlReleased(msg.reason);
                        break;
                    case 'CONTROL_DENIED':
                        this.onControlDenied(msg.operator);
                        break;
                    case 'CONTROL_CHANGED':
                        this.onControlChanged(msg.operatorId, msg.operator);
                        break;
                }
            } catch (err) { /* ignore non-JSON text */ }
        }
    }

    // ===== 操作权处理 =====

    toggleControl() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.isOperator) {
            this.ws.send(JSON.stringify({ type: 'RELEASE_CONTROL' }));
        } else {
            this.ws.send(JSON.stringify({ type: 'REQUEST_CONTROL' }));
        }
    }

    onControlGranted() {
        this.isOperator = true;
        this.operatorName = this.dom.username.value.trim();
        this.updateControlUI();
        this.canvas.style.cursor = 'default';
        this.showToast('已获取操作权，你可以控制远程桌面', 'success');
    }

    onControlReleased(reason) {
        this.isOperator = false;
        this.operatorName = '';
        this.updateControlUI();
        this.canvas.style.cursor = 'not-allowed';
        this.showToast(reason || '操作权已释放', '');
    }

    onControlDenied(operator) {
        this.showToast('操作权被拒绝，' + (operator ? operator + ' 正在操作' : '有人正在操作'), 'error');
    }

    onControlChanged(operatorId, operator) {
        if (!operator) {
            this.operatorName = '';
        } else {
            this.operatorName = operator;
        }
        this.updateControlUI();

        if (!this.isOperator) {
            this.canvas.style.cursor = operator ? 'not-allowed' : 'default';
        }
    }

    updateControlUI() {
        const btn = this.dom.btnRequestControl;
        const display = this.dom.controlDisplay;
        if (!btn || !display) return;

        if (this.isOperator) {
            btn.textContent = '释放操作';
            btn.classList.add('control-active');
            btn.classList.remove('control-locked');
            display.textContent = '操作中';
            display.classList.add('control-active-text');
            display.classList.remove('control-locked-text');
        } else if (this.operatorName) {
            btn.textContent = '请求操作';
            btn.classList.remove('control-active');
            btn.classList.add('control-locked');
            display.textContent = this.operatorName + ' 操作中';
            display.classList.remove('control-active-text');
            display.classList.add('control-locked-text');
        } else {
            btn.textContent = '请求操作';
            btn.classList.remove('control-active', 'control-locked');
            display.textContent = '空闲';
            display.classList.remove('control-active-text', 'control-locked-text');
        }
    }

    /**
     * 解析二进制协议帧消息
     * 协议:
     *   FULL_FRAME (0x01): [type][完整图像数据]
     *   DIFF_FRAME (0x02): [type][blockW][blockH][gridCols][gridRows][count] + [col][row][len][blockData]...
     */
    handleBinaryMessage(data) {
        if (data.length === 0) return;

        const frameType = data[0];
        const payload = data.slice(1);

        if (frameType === this.FULL_FRAME) {
            this.processFullFrame(payload);
        } else if (frameType === this.DIFF_FRAME) {
            this.processDiffFrame(payload);
        }
    }

    /**
     * 处理全帧：绘制到离屏 Canvas + 合成到屏幕
     */
    processFullFrame(imageData) {
        const blob = new Blob([imageData], { type: 'image/' + this.imageFormat });
        const url = URL.createObjectURL(blob);

        const seq = ++this.frameSequence;
        this.renderImage.onload = () => {
            if (seq !== this.frameSequence) {
                URL.revokeObjectURL(url);
                return;
            }

            // 更新离屏 Canvas
            this.offscreenCanvas.width = this.renderImage.width;
            this.offscreenCanvas.height = this.renderImage.height;
            this.offscreenCtx.drawImage(this.renderImage, 0, 0);
            this.offscreenReady = true;

            this.imageWidth = this.renderImage.width;
            this.imageHeight = this.renderImage.height;

            URL.revokeObjectURL(url);
            this.requestComposite();
        };
        this.renderImage.src = url;
    }

    /**
     * 处理差分帧：解析块数据，绘制到离屏 Canvas，合成到屏幕
     */
    processDiffFrame(data) {
        if (!this.offscreenReady || data.length < 10) return;

        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let offset = 0;

        const blockWidth = view.getUint16(offset); offset += 2;
        const blockHeight = view.getUint16(offset); offset += 2;
        const gridCols = view.getUint16(offset); offset += 2;
        const gridRows = view.getUint16(offset); offset += 2;
        const changedCount = view.getUint16(offset); offset += 2;

        if (changedCount === 0) return;

        const seq = ++this.frameSequence;
        let remaining = changedCount;
        const self = this;

        for (let i = 0; i < changedCount; i++) {
            const col = view.getUint16(offset); offset += 2;
            const row = view.getUint16(offset); offset += 2;
            const dataLength = view.getUint32(offset); offset += 4;

            if (offset + dataLength > data.length) break; // 数据截断，丢弃

            const blockData = data.slice(offset, offset + dataLength);
            offset += dataLength;

            const blob = new Blob([blockData], { type: 'image/' + this.imageFormat });
            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = function () {
                if (seq !== self.frameSequence) {
                    URL.revokeObjectURL(url);
                    return;
                }
                self.offscreenCtx.drawImage(this, col * blockWidth, row * blockHeight);
                URL.revokeObjectURL(url);
                remaining--;
                if (remaining === 0) {
                    self.requestComposite();
                }
            };

            img.onerror = function () {
                URL.revokeObjectURL(url);
                remaining--;
                if (remaining === 0) {
                    self.requestComposite();
                }
            };

            img.src = url;
        }
    }

    /**
     * 请求合成到屏幕（通过 requestAnimationFrame 批量合并）
     */
    requestComposite() {
        if (!this.compositeScheduled) {
            this.compositeScheduled = true;
            requestAnimationFrame(() => {
                this.compositeScheduled = false;
                this.compositeToScreen();
                this.updateFps();
            });
        }
    }

    /**
     * 将离屏 Canvas 合成到可见 Canvas（含 letterbox）
     */
    compositeToScreen() {
        if (!this.offscreenReady || !this.canvasInited) return;

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const ow = this.offscreenCanvas.width;
        const oh = this.offscreenCanvas.height;

        if (ow === 0 || oh === 0) return;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        const scaleX = cw / ow;
        const scaleY = ch / oh;
        const scale = Math.min(scaleX, scaleY);
        const dw = Math.round(ow * scale);
        const dh = Math.round(oh * scale);
        const dx = Math.round((cw - dw) / 2);
        const dy = Math.round((ch - dh) / 2);

        this.ctx.fillStyle = '#0A0E17';
        this.ctx.fillRect(0, 0, cw, ch);
        this.ctx.drawImage(this.offscreenCanvas, dx, dy, dw, dh);
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
        if (!this.isOperator) return;
        this.ws.send(JSON.stringify(event));
    }

    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (!this.imageWidth || !this.imageHeight) return { x: 0, y: 0 };

        const cssW = rect.width;
        const cssH = rect.height;
        const pixelW = this.canvas.width;
        const pixelH = this.canvas.height;

        const px = (e.clientX - rect.left) / cssW * pixelW;
        const py = (e.clientY - rect.top) / cssH * pixelH;

        const scaleX = pixelW / this.imageWidth;
        const scaleY = pixelH / this.imageHeight;
        const scale = Math.min(scaleX, scaleY);
        const dw = this.imageWidth * scale;
        const dh = this.imageHeight * scale;
        const dx = (pixelW - dw) / 2;
        const dy = (pixelH - dh) / 2;

        const targetW = this.screenWidth || this.imageWidth;
        const targetH = this.screenHeight || this.imageHeight;

        return {
            x: Math.max(0, Math.min(targetW - 1, Math.round((px - dx) / scale))),
            y: Math.max(0, Math.min(targetH - 1, Math.round((py - dy) / scale))),
        };
    }

    onMouseMove(e) {
        if (!this.isOperator) return;
        const coords = this.getCanvasCoords(e);
        this.sendEvent({ type: 'MOUSE_MOVE', x: coords.x, y: coords.y, timestamp: Date.now() });
    }

    onMouseDown(e) {
        if (!this.isOperator) return;
        const coords = this.getCanvasCoords(e);
        const button = e.button + 1;
        this.sendEvent({ type: 'MOUSE_PRESS', x: coords.x, y: coords.y, button, timestamp: Date.now() });
    }

    onMouseUp(e) {
        if (!this.isOperator) return;
        const coords = this.getCanvasCoords(e);
        const button = e.button + 1;
        this.sendEvent({ type: 'MOUSE_RELEASE', x: coords.x, y: coords.y, button, timestamp: Date.now() });
    }

    onMouseWheel(e) {
        if (!this.isOperator) return;
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -1 * 3;
        this.sendEvent({ type: 'MOUSE_WHEEL', wheelDelta: delta, timestamp: Date.now() });
    }

    mapKeyCode(e) {
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

        const fMatch = e.code.match(/^F(\d+)$/);
        if (fMatch) {
            return 111 + parseInt(fMatch[1]);
        }

        if (e.key.length === 1) {
            return e.key.toUpperCase().charCodeAt(0);
        }

        return 0;
    }

    onKeyDown(e) {
        if (this.state !== 'connected') return;
        if (e.key === 'F11' || e.key === 'F2') return;
        if (!this.isOperator) return;

        const keyCode = this.mapKeyCode(e);
        if (keyCode > 0) {
            e.preventDefault();
            this.sendEvent({ type: 'KEY_PRESS', keyCode, timestamp: Date.now() });
        }
    }

    onKeyUp(e) {
        if (this.state !== 'connected') return;
        if (e.key === 'F11' || e.key === 'F2') return;
        if (!this.isOperator) return;

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
        const isCollapsed = toolbar.classList.contains('collapsed');
        btn.textContent = isCollapsed ? '▶' : '◀';
        btn.title = isCollapsed ? '展开工具栏' : '折叠工具栏';
        btn.classList.toggle('active', !isCollapsed);
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
        // 从离屏 Canvas 截图（保证完整分辨率）
        const sourceCanvas = this.offscreenReady ? this.offscreenCanvas : this.canvas;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = sourceCanvas.width;
        tmpCanvas.height = sourceCanvas.height;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(sourceCanvas, 0, 0);

        const link = document.createElement('a');
        link.download = 'nrdc-screenshot-' + Date.now() + '.png';
        link.href = tmpCanvas.toDataURL('image/png');
        link.click();
        this.showToast('截图已保存', 'success');
    }

    // ===== UI 更新 =====

    updateUserRoleUI() {
        const btn = this.dom.btnUserMgmt;
        const display = this.dom.userDisplay;
        if (!btn || !display) return;

        if (this.state === 'connected' || this.state === 'reconnecting') {
            display.style.display = '';
            display.textContent = this.currentUser + (this.role === 'admin' ? ' [Admin]' : '');
            if (this.role === 'admin') {
                btn.style.display = '';
            } else {
                btn.style.display = 'none';
            }
        } else {
            btn.style.display = 'none';
            display.style.display = 'none';
        }
    }

    // ===== 用户管理 =====

    openUserMgmt() {
        this.dom.userMgmtModal.classList.add('open');
        this.loadUsers();
    }

    closeUserMgmt() {
        this.dom.userMgmtModal.classList.remove('open');
    }

    async loadUsers() {
        try {
            const resp = await fetch('/api/users', {
                headers: { 'X-Session-Id': this.sessionId }
            });
            const users = await resp.json();
            if (!resp.ok) {
                this.showToast(users.error || '获取用户列表失败', 'error');
                return;
            }
            this.renderUserTable(users);
        } catch (err) {
            this.showToast('获取用户列表失败: ' + err.message, 'error');
        }
    }

    renderUserTable(users) {
        const tbody = this.dom.userTableBody;
        tbody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '-';
            const roleLabel = u.role === 'admin' ? '<span class="role-badge role-admin">管理员</span>' : '<span class="role-badge role-user">普通用户</span>';
            const isSelf = u.username === this.currentUser;

            let actions = '';
            if (!isSelf) {
                actions += `<button class="table-btn" onclick="nrdc.editUserRole('${u.username}', '${u.role}')">切换角色</button>`;
                actions += `<button class="table-btn btn-danger-text" onclick="nrdc.resetUserPassword('${u.username}')">重置密码</button>`;
                if (u.role !== 'admin') {
                    actions += `<button class="table-btn btn-danger-text" onclick="nrdc.deleteUser('${u.username}')">删除</button>`;
                }
            } else {
                actions = '<span class="text-muted">当前用户</span>';
            }

            tr.innerHTML = `
                <td>${u.username}</td>
                <td>${roleLabel}</td>
                <td class="text-muted">${dateStr}</td>
                <td class="table-actions">${actions}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    openUserForm() {
        this.dom.userFormTitle.textContent = '新增用户';
        this.dom.newUsername.value = '';
        this.dom.newUsername.disabled = false;
        this.dom.newPassword.value = '';
        this.dom.newPassword.style.display = '';
        this.dom.newPassword.previousElementSibling.style.display = '';
        this.dom.newRole.value = 'user';
        this.dom.userFormModal.dataset.editMode = '';
        this.dom.userFormModal.classList.add('open');
    }

    closeUserForm() {
        this.dom.userFormModal.classList.remove('open');
        // 恢复被隐藏的字段
        this.dom.newPassword.style.display = '';
        this.dom.newPassword.previousElementSibling.style.display = '';
        this.dom.newRole.style.display = '';
        this.dom.newRole.previousElementSibling.style.display = '';
        this.dom.newUsername.disabled = false;
    }

    async saveUser() {
        const username = this.dom.newUsername.value.trim();
        const password = this.dom.newPassword.value;
        const role = this.dom.newRole.value;

        if (!username) { this.showToast('请输入用户名', 'error'); return; }
        if (!password && !this.dom.userFormModal.dataset.editMode) {
            this.showToast('请输入密码', 'error'); return;
        }

        try {
            let resp;
            if (this.dom.userFormModal.dataset.editMode === 'password') {
                resp = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Id': this.sessionId },
                    body: JSON.stringify({ password })
                });
            } else if (this.dom.userFormModal.dataset.editMode === 'role') {
                resp = await fetch(`/api/users/${encodeURIComponent(username)}/role`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Id': this.sessionId },
                    body: JSON.stringify({ role })
                });
            } else {
                resp = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Id': this.sessionId },
                    body: JSON.stringify({ username, password, role })
                });
            }

            const data = await resp.json();
            if (!resp.ok) {
                this.showToast(data.error || '操作失败', 'error');
                return;
            }
            this.showToast(data.message || '操作成功', 'success');
            this.closeUserForm();
            this.loadUsers();
        } catch (err) {
            this.showToast('操作失败: ' + err.message, 'error');
        }
    }

    editUserRole(username, currentRole) {
        this.dom.userFormTitle.textContent = '修改角色 - ' + username;
        this.dom.newUsername.value = username;
        this.dom.newUsername.disabled = true;
        this.dom.newPassword.style.display = 'none';
        this.dom.newPassword.previousElementSibling.style.display = 'none';
        this.dom.newRole.value = currentRole === 'admin' ? 'user' : 'admin';
        this.dom.userFormModal.dataset.editMode = 'role';
        this.dom.userFormModal.classList.add('open');
    }

    resetUserPassword(username) {
        this.dom.userFormTitle.textContent = '重置密码 - ' + username;
        this.dom.newUsername.value = username;
        this.dom.newUsername.disabled = true;
        this.dom.newPassword.style.display = '';
        this.dom.newPassword.previousElementSibling.style.display = '';
        this.dom.newPassword.value = '';
        this.dom.newRole.style.display = 'none';
        this.dom.newRole.previousElementSibling.style.display = 'none';
        this.dom.userFormModal.dataset.editMode = 'password';
        this.dom.userFormModal.classList.add('open');
        // 保存恢复显示的引用
        this._formRoleHidden = true;
    }

    async deleteUser(username) {
        if (!confirm(`确定要删除用户 "${username}" 吗？`)) return;
        try {
            const resp = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                method: 'DELETE',
                headers: { 'X-Session-Id': this.sessionId }
            });
            const data = await resp.json();
            if (!resp.ok) {
                this.showToast(data.error || '删除失败', 'error');
                return;
            }
            this.showToast(data.message, 'success');
            this.loadUsers();
        } catch (err) {
            this.showToast('删除失败: ' + err.message, 'error');
        }
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
