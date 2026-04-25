/**
 * NRDC - Network Remote Desktop Control
 * 客户端核心逻辑
 * 支持桌面端（鼠标/键盘）及移动端（触摸手势）
 * 支持全帧 (FULL_FRAME) 和差分帧 (DIFF_FRAME) 二进制协议
 * 支持多人观看 + 互斥操作权控制
 */

class NRDCClient {
    constructor() {
        this.canvas = document.getElementById('remoteDesktop');
        this.ctx = this.canvas.getContext('2d');

        // 连接状态
        this.state = 'disconnected';
        this.ws = null;
        this.connectUrl = '';
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.manualClose = false;

        this.frameCount = 0;
        this.lastFpsTime = Date.now();
        this.displayFps = 0;
        this.currentQuality = 0.6;
        this.imageFormat = 'jpeg';

        // 渲染
        this.renderImage = new Image();
        this.canvasInited = false;
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.imageWidth = 0;
        this.imageHeight = 0;

        // 离屏 Canvas（差分帧合成）
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.offscreenReady = false;

        // 帧序列号
        this.frameSequence = 0;
        this.compositeScheduled = false;

        // 协议常量
        this.FULL_FRAME = 0x01;
        this.DIFF_FRAME = 0x02;

        // 操作权
        this.isOperator = false;
        this.operatorName = '';

        // 用户信息
        this.role = 'user';
        this.sessionId = '';
        this.currentUser = '';
        this.isLoggedIn = false;

        // ===== 触摸交互状态 =====
        this.isMobile = this._detectMobile();

        // 单指操作
        this.touch = {
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
            startTime: 0,
            moved: false,
            tapTimer: null,         // 等待双击计时
            longPressTimer: null,
            isLongPress: false,
        };

        // 双指捏合缩放（查看模式用：缩放 canvas 视图）
        this.pinch = {
            active: false,
            initialDist: 0,
            initialScale: 1.0,
            scale: 1.0,
            offsetX: 0,
            offsetY: 0,
            panStartX: 0,
            panStartY: 0,
        };

        // 视图变换（移动端可拖动/缩放 canvas 内容）
        this.view = {
            scale: 1.0,
            x: 0,
            y: 0,
        };

        // 虚拟键盘
        this.vkOpen = false;

        // 浮动工具栏（全屏用）
        this.isFullscreen = false;

        // 画质档位轮换
        this.qualityLevels = [0.3, 0.6, 0.85];
        this.qualityIndex = 1;

        this.initDOM();
        this.bindEvents();
        this.bindMobileEvents();
        this.updateCanvasSize();
        this.autoReconnectWithToken();
    }

    _detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (window.innerWidth <= 640);
    }

    initDOM() {
        this.dom = {
            statusIndicator:    document.getElementById('statusIndicator'),
            connectionStatus:   document.getElementById('connectionStatus'),
            fpsDisplay:         document.getElementById('fpsDisplay'),
            latencyDisplay:     document.getElementById('latencyDisplay'),
            resolutionDisplay:  document.getElementById('resolutionDisplay'),
            username:           document.getElementById('username'),
            password:           document.getElementById('password'),
            connectModal:       document.getElementById('connectModal'),
            canvasOverlay:      document.getElementById('canvasOverlay'),
            sideToolbar:        document.getElementById('sideToolbar'),
            controlDisplay:     document.getElementById('controlDisplay'),
            btnRequestControl:  document.getElementById('btnRequestControl'),
            btnUserMgmt:        document.getElementById('btnUserMgmt'),
            userMgmtModal:      document.getElementById('userMgmtModal'),
            userFormModal:      document.getElementById('userFormModal'),
            userTableBody:      document.getElementById('userTableBody'),
            userFormTitle:      document.getElementById('userFormTitle'),
            newUsername:        document.getElementById('newUsername'),
            newPassword:        document.getElementById('newPassword'),
            newRole:            document.getElementById('newRole'),
            userDisplay:        document.getElementById('userDisplay'),
            // 移动端
            mobileToolbar:      document.getElementById('mobileToolbar'),
            mBtnControl:        document.getElementById('mBtnControl'),
            mBtnControlLabel:   document.getElementById('mBtnControlLabel'),
            mBtnConnect:        document.getElementById('mBtnConnect'),
            mBtnConnectLabel:   document.getElementById('mBtnConnectLabel'),
            mBtnQuality:        document.getElementById('mBtnQuality'),
            mBtnKeyboard:       document.getElementById('mBtnKeyboard'),
            mBtnScreenshot:     document.getElementById('mBtnScreenshot'),
            mBtnFullscreen:     document.getElementById('mBtnFullscreen'),
            touchModeBadge:     document.getElementById('touchModeBadge'),
            virtualKeyboard:    document.getElementById('virtualKeyboard'),
            btnCloseVK:         document.getElementById('btnCloseVK'),
            floatingToolbar:    document.getElementById('floatingToolbar'),
            fBtnKeyboard:       document.getElementById('fBtnKeyboard'),
            fBtnExitFullscreen: document.getElementById('fBtnExitFullscreen'),
            // 弹窗视图切换
            loginForm:          document.getElementById('loginForm'),
            loggedInPanel:      document.getElementById('loggedInPanel'),
            loggedInUser:       document.getElementById('loggedInUser'),
            loggedInRole:       document.getElementById('loggedInRole'),
            modalTitle:         document.getElementById('modalTitle'),
            btnLogout:          document.getElementById('btnLogout'),
        };
    }

    // ===== 事件绑定 =====

    bindEvents() {
        // 顶部工具栏
        document.getElementById('btnToggleConnect').addEventListener('click', () => this.toggleModal());
        document.getElementById('btnCloseModal').addEventListener('click', () => this.closeModal());
        document.getElementById('btnConnect').addEventListener('click', () => this.connect());
        document.getElementById('btnDisconnect').addEventListener('click', () => this.disconnect());
        this.dom.btnLogout.addEventListener('click', () => this.logout());

        // 桌面端工具栏
        document.getElementById('btnFullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('btnToolbarToggle').addEventListener('click', () => this.toggleToolbar());
        document.getElementById('btnScreenshot').addEventListener('click', () => this.takeScreenshot());
        document.getElementById('btnRequestControl').addEventListener('click', () => this.toggleControl());

        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setQualityByBtn(btn));
        });

        // 用户管理
        document.getElementById('btnUserMgmt').addEventListener('click', () => this.openUserMgmt());
        document.getElementById('btnCloseUserMgmt').addEventListener('click', () => this.closeUserMgmt());
        document.getElementById('btnAddUser').addEventListener('click', () => this.openUserForm());
        document.getElementById('btnCloseUserForm').addEventListener('click', () => this.closeUserForm());
        document.getElementById('btnCancelUser').addEventListener('click', () => this.closeUserForm());
        document.getElementById('btnSaveUser').addEventListener('click', () => this.saveUser());
        this.dom.userMgmtModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeUserMgmt());
        this.dom.userFormModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeUserForm());
        this.dom.connectModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());

        // Canvas 鼠标事件（桌面端）
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // 全局键盘
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));

        // 快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); }
            if (e.key === 'F2') { e.preventDefault(); this.toggleModal(); }
        });

        // 尺寸变化
        window.addEventListener('resize', () => this.updateCanvasSize());
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
    }

    onFullscreenChange() {
        this.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.updateCanvasSize();
        this._updateFloatingToolbar();
    }

    _updateFloatingToolbar() {
        const ft = this.dom.floatingToolbar;
        if (!ft) return;
        // 仅在移动端全屏时显示浮动工具栏
        if (this.isMobile && this.isFullscreen) {
            ft.classList.add('show');
        } else {
            ft.classList.remove('show');
        }
    }

    bindMobileEvents() {
        // 移动端底部工具栏按钮
        if (this.dom.mBtnControl) {
            this.dom.mBtnControl.addEventListener('click', () => this.toggleControl());
        }
        if (this.dom.mBtnConnect) {
            this.dom.mBtnConnect.addEventListener('click', () => this.toggleModal());
        }
        if (this.dom.mBtnQuality) {
            this.dom.mBtnQuality.addEventListener('click', () => this.cycleQuality());
        }
        if (this.dom.mBtnKeyboard) {
            this.dom.mBtnKeyboard.addEventListener('click', () => this.toggleVirtualKeyboard());
        }
        if (this.dom.mBtnScreenshot) {
            this.dom.mBtnScreenshot.addEventListener('click', () => this.takeScreenshot());
        }
        if (this.dom.mBtnFullscreen) {
            this.dom.mBtnFullscreen.addEventListener('click', () => this.toggleFullscreen());
        }
        if (this.dom.btnCloseVK) {
            this.dom.btnCloseVK.addEventListener('click', () => this.closeVirtualKeyboard());
        }

        // 浮动工具栏按钮（全屏模式用）
        if (this.dom.fBtnKeyboard) {
            this.dom.fBtnKeyboard.addEventListener('click', () => this.toggleVirtualKeyboard());
        }
        if (this.dom.fBtnExitFullscreen) {
            this.dom.fBtnExitFullscreen.addEventListener('click', () => this.toggleFullscreen());
        }

        // 虚拟键盘按键
        if (this.dom.virtualKeyboard) {
            this.dom.virtualKeyboard.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-key],[data-combo]');
                if (!btn) return;
                if (btn.dataset.combo) {
                    this.sendCombo(btn.dataset.combo);
                } else if (btn.dataset.key) {
                    this.sendVirtualKey(btn.dataset.key);
                }
                this._showTouchBadge('按键已发送');
            });
        }

        // Canvas 触摸事件
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => this.onTouchCancel(e), { passive: false });
    }

    // ===== 连接管理 =====

    toggleModal() {
        this.updateModalUI();
        this.dom.connectModal.classList.toggle('open');
        // 移动端弹窗打开时，等输入框 focus 后再处理
        if (this.dom.connectModal.classList.contains('open')) {
            setTimeout(() => {
                if (!this.isLoggedIn) {
                    const userInput = this.dom.username;
                    if (userInput && !userInput.value) userInput.focus();
                }
            }, 300);
        }
    }

    closeModal() {
        this.dom.connectModal.classList.remove('open');
    }

    async connect() {
        const username = this.dom.username.value.trim();
        const password = this.dom.password.value.trim();

        if (!username) { this.showToast('请输入用户名', 'error'); return; }
        if (!password) { this.showToast('请输入密码', 'error'); return; }

        // 移动端关闭弹窗（避免虚拟键盘遮挡）
        this.closeModal();

        this.manualClose = false;
        this.reconnectAttempts = 0;

        try {
            this.setState('connecting');

            const chResp = await fetch('/api/challenge');
            const chData = await chResp.json();
            if (!chResp.ok) {
                this.showToast('获取验证挑战失败', 'error');
                this.setState('disconnected');
                return;
            }
            // 2. 计算 SHA-256(challenge + SHA-256(password)) 作为响应
            const challenge = chData.challenge;
            var pwHash, response;
            if (crypto && crypto.subtle) {
                const encoder = new TextEncoder();
                const pwHashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password));
                pwHash = Array.from(new Uint8Array(pwHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(challenge + pwHash));
                response = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            } else {
                this.showToast('当前为 HTTP 环境，安全性较低，建议通过 HTTPS 访问', 'warning');
                pwHash = sha256(password);
                response = sha256(challenge + pwHash);
            }

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

                        localStorage.setItem('nrdc_token', loginData.token);
            localStorage.setItem('nrdc_username', loginData.username || username);
            localStorage.setItem('nrdc_role', loginData.role || 'user');

            this.onTokenReady(loginData.token, loginData.username || username, loginData.role || 'user');
        } catch (err) {
            this.showToast('登录请求失败: ' + err.message, 'error');
            this.setState('disconnected');
        }
    }

    async autoReconnectWithToken() {
        const token = localStorage.getItem('nrdc_token');
        if (!token) return;

        try {
            const resp = await fetch('/api/token/verify', {
                headers: { 'X-Auth-Token': token }
            });
            if (!resp.ok) {
                localStorage.removeItem('nrdc_token');
                localStorage.removeItem('nrdc_username');
                localStorage.removeItem('nrdc_role');
                return;
            }
            const data = await resp.json();
            this.dom.username.value = data.username;
            this.onTokenReady(token, data.username, data.role);
        } catch (err) { /* 网络错误，保留 Token */ }
    }

    onTokenReady(token, username, role) {
        this.currentUser = username;
        this.role = role;
        this.isLoggedIn = true;
        this.connectUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://')
            + location.host + '/ws?token=' + encodeURIComponent(token);
        this.doConnect();
        this.updateModalUI();
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
            localStorage.removeItem('nrdc_token');
            return;
        }
        this.setState('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
        this.showToast(delay / 1000 + 's 后尝试第 ' + this.reconnectAttempts + ' 次重连...', '');

        const savedToken = localStorage.getItem('nrdc_token');
        if (savedToken) {
            this.reconnectTimer = setTimeout(() => this.onTokenReady(
                savedToken,
                localStorage.getItem('nrdc_username') || this.currentUser,
                localStorage.getItem('nrdc_role') || this.role
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
        this._updateMobileConnectBtn();
    }

    onDisconnected(e) {
        this.ws = null;
        if (this.manualClose) {
            this.setState('disconnected');
            this._updateMobileConnectBtn();
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
        this._updateMobileConnectBtn();
        this.updateModalUI();
    }

    updateStatusUI(className, text) {
        this.dom.statusIndicator.className = 'status-dot ' + className;
        this.dom.connectionStatus.textContent = text;
    }

    _updateMobileConnectBtn() {
        if (!this.dom.mBtnConnectLabel) return;
        if (this.state === 'connected') {
            this.dom.mBtnConnectLabel.textContent = '断开';
            this.dom.mBtnConnect.style.color = 'var(--danger)';
        } else {
            this.dom.mBtnConnectLabel.textContent = '连接';
            this.dom.mBtnConnect.style.color = '';
        }
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
                        if (this.dom.resolutionDisplay) {
                            this.dom.resolutionDisplay.textContent = msg.width + 'x' + msg.height;
                        }
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
            } catch (err) { /* ignore non-JSON */ }
        }
    }

    // ===== 操作权 =====

    toggleControl() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showToast('请先连接远程桌面', 'error');
            return;
        }
        if (this.isOperator) {
            this.ws.send(JSON.stringify({ type: 'RELEASE_CONTROL' }));
        } else {
            this.ws.send(JSON.stringify({ type: 'REQUEST_CONTROL' }));
        }
    }

    onControlGranted() {
        this.isOperator = true;
        this.operatorName = this.currentUser;
        this.updateControlUI();
        this.canvas.style.cursor = 'default';
        this.showToast('已获取操作权，可控制远程桌面', 'success');
        this._showTouchBadge('🟢 操作权已获取');
    }

    onControlReleased(reason) {
        this.isOperator = false;
        this.operatorName = '';
        this.updateControlUI();
        this.canvas.style.cursor = 'not-allowed';
        this.showToast(reason || '操作权已释放', '');
        this._showTouchBadge('⚪ 操作权已释放');
    }

    onControlDenied(operator) {
        this.showToast('操作权被拒绝，' + (operator ? operator + ' 正在操作' : '有人正在操作'), 'error');
    }

    onControlChanged(operatorId, operator) {
        this.operatorName = operator || '';
        this.updateControlUI();
        if (!this.isOperator) {
            this.canvas.style.cursor = operator ? 'not-allowed' : 'default';
        }
    }

    updateControlUI() {
        const btn = this.dom.btnRequestControl;
        const display = this.dom.controlDisplay;
        const mBtn = this.dom.mBtnControl;
        const mLabel = this.dom.mBtnControlLabel;

        if (this.isOperator) {
            if (btn) {
                btn.textContent = '释放操作';
                btn.classList.add('control-active');
                btn.classList.remove('control-locked');
            }
            if (display) {
                display.textContent = '操作中';
                display.classList.add('control-active-text');
                display.classList.remove('control-locked-text');
            }
            if (mBtn) {
                mBtn.classList.add('control-active');
                mBtn.classList.remove('control-locked');
            }
            if (mLabel) mLabel.textContent = '释放';
        } else if (this.operatorName) {
            if (btn) {
                btn.textContent = '请求操作';
                btn.classList.remove('control-active');
                btn.classList.add('control-locked');
            }
            if (display) {
                display.textContent = this.operatorName + ' 操作中';
                display.classList.remove('control-active-text');
                display.classList.add('control-locked-text');
            }
            if (mBtn) {
                mBtn.classList.remove('control-active');
                mBtn.classList.add('control-locked');
            }
            if (mLabel) mLabel.textContent = '请求';
        } else {
            if (btn) {
                btn.textContent = '请求操作';
                btn.classList.remove('control-active', 'control-locked');
            }
            if (display) {
                display.textContent = '空闲';
                display.classList.remove('control-active-text', 'control-locked-text');
            }
            if (mBtn) {
                mBtn.classList.remove('control-active', 'control-locked');
            }
            if (mLabel) mLabel.textContent = '请求操作';
        }
    }

    // ===== 二进制帧处理 =====

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

    processFullFrame(imageData) {
        const blob = new Blob([imageData], { type: 'image/' + this.imageFormat });
        const url = URL.createObjectURL(blob);
        const seq = ++this.frameSequence;

        this.renderImage.onload = () => {
            if (seq !== this.frameSequence) { URL.revokeObjectURL(url); return; }
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
            if (offset + dataLength > data.length) break;
            const blockData = data.slice(offset, offset + dataLength);
            offset += dataLength;

            const blob = new Blob([blockData], { type: 'image/' + this.imageFormat });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = function () {
                if (seq !== self.frameSequence) { URL.revokeObjectURL(url); return; }
                self.offscreenCtx.drawImage(this, col * blockWidth, row * blockHeight);
                URL.revokeObjectURL(url);
                remaining--;
                if (remaining === 0) self.requestComposite();
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                remaining--;
                if (remaining === 0) self.requestComposite();
            };
            img.src = url;
        }
    }

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

    compositeToScreen() {
        if (!this.offscreenReady || !this.canvasInited) return;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const ow = this.offscreenCanvas.width;
        const oh = this.offscreenCanvas.height;
        if (ow === 0 || oh === 0) return;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.fillStyle = '#0A0E17';
        this.ctx.fillRect(0, 0, cw, ch);

        // 基础 letterbox 缩放
        const scaleX = cw / ow;
        const scaleY = ch / oh;
        const baseScale = Math.min(scaleX, scaleY);
        const dw = Math.round(ow * baseScale);
        const dh = Math.round(oh * baseScale);
        const dx = Math.round((cw - dw) / 2);
        const dy = Math.round((ch - dh) / 2);

        // 移动端叠加视图变换（捏合缩放 + 平移）
        if (this.isMobile && (this.view.scale !== 1.0 || this.view.x !== 0 || this.view.y !== 0)) {
            this.ctx.save();
            this.ctx.translate(this.view.x, this.view.y);
            this.ctx.scale(this.view.scale, this.view.scale);
            this.ctx.drawImage(this.offscreenCanvas, dx, dy, dw, dh);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(this.offscreenCanvas, dx, dy, dw, dh);
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
            if (this.offscreenReady) this.compositeToScreen();
        }
        this.isMobile = this._detectMobile();
    }

    updateFps() {
        this.frameCount++;
        const now = Date.now();
        const elapsed = now - this.lastFpsTime;
        if (elapsed >= 1000) {
            this.displayFps = Math.round(this.frameCount * 1000 / elapsed);
            if (this.dom.fpsDisplay) this.dom.fpsDisplay.textContent = this.displayFps + ' FPS';
            this.frameCount = 0;
            this.lastFpsTime = now;
        }
    }

    // ===== 桌面端鼠标 =====

    sendEvent(event) {
        if (this.state !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this.isOperator) return;
        this.ws.send(JSON.stringify(event));
    }

    /** 将 canvas CSS 坐标映射为远程屏幕坐标 */
    getCanvasCoords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        if (!this.imageWidth || !this.imageHeight) return { x: 0, y: 0 };

        const cssW = rect.width;
        const cssH = rect.height;
        const pixelW = this.canvas.width;
        const pixelH = this.canvas.height;

        let px = (clientX - rect.left) / cssW * pixelW;
        let py = (clientY - rect.top) / cssH * pixelH;

        // 逆变换移动端视图变换（平移和缩放都需要逆变换）
        if (this.isMobile && (this.view.scale !== 1.0 || this.view.x !== 0 || this.view.y !== 0)) {
            px = (px - this.view.x) / this.view.scale;
            py = (py - this.view.y) / this.view.scale;
        }

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
        const c = this.getCanvasCoords(e.clientX, e.clientY);
        this.sendEvent({ type: 'MOUSE_MOVE', x: c.x, y: c.y, timestamp: Date.now() });
    }

    onMouseDown(e) {
        if (!this.isOperator) return;
        const c = this.getCanvasCoords(e.clientX, e.clientY);
        this.sendEvent({ type: 'MOUSE_PRESS', x: c.x, y: c.y, button: e.button + 1, timestamp: Date.now() });
    }

    onMouseUp(e) {
        if (!this.isOperator) return;
        const c = this.getCanvasCoords(e.clientX, e.clientY);
        this.sendEvent({ type: 'MOUSE_RELEASE', x: c.x, y: c.y, button: e.button + 1, timestamp: Date.now() });
    }

    onMouseWheel(e) {
        if (!this.isOperator) return;
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -1 * 3;
        this.sendEvent({ type: 'MOUSE_WHEEL', wheelDelta: delta, timestamp: Date.now() });
    }

    // ===== 触摸事件处理 =====

    /**
     * 触摸交互设计：
     *  未获取操作权：
     *    - 单指拖动 → 平移视图
     *    - 双指捏合 → 缩放视图
     *  已获取操作权（远程控制模式）：
     *    - 单指单击 → 左键单击
     *    - 单指双击 → 左键双击
     *    - 单指长按 (>500ms) → 右键单击
     *    - 单指拖动 → 移动鼠标
     *    - 双指捏合 → 滚轮缩放（发送到远程）
     *    - 双指上下滑动 → 滚轮滚动
     */

    onTouchStart(e) {
        e.preventDefault();

        if (e.touches.length === 1) {
            const t = e.touches[0];
            this.touch.startX = t.clientX;
            this.touch.startY = t.clientY;
            this.touch.lastX = t.clientX;
            this.touch.lastY = t.clientY;
            this.touch.startTime = Date.now();
            this.touch.moved = false;
            this.touch.isLongPress = false;

            // 清除可能存在的双击等待
            if (this.touch.tapTimer) {
                clearTimeout(this.touch.tapTimer);
                this.touch.tapTimer = null;
            }

            // 长按计时
            this.touch.longPressTimer = setTimeout(() => {
                if (!this.touch.moved) {
                    this.touch.isLongPress = true;
                    this._onLongPress(t.clientX, t.clientY);
                }
            }, 500);

            // 如果有操作权，立即发送移动位置
            if (this.isOperator) {
                const c = this.getCanvasCoords(t.clientX, t.clientY);
                this.sendEvent({ type: 'MOUSE_MOVE', x: c.x, y: c.y, timestamp: Date.now() });
            }

        } else if (e.touches.length === 2) {
            // 取消长按
            this._clearLongPress();

            const t0 = e.touches[0];
            const t1 = e.touches[1];
            this.pinch.active = true;
            this.pinch.initialDist = this._dist(t0, t1);
            this.pinch.initialScale = this.view.scale;
            this.pinch.panStartX = (t0.clientX + t1.clientX) / 2;
            this.pinch.panStartY = (t0.clientY + t1.clientY) / 2;
        }
    }

    onTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 1 && !this.pinch.active) {
            const t = e.touches[0];
            const dx = t.clientX - this.touch.lastX;
            const dy = t.clientY - this.touch.lastY;
            const totalDist = Math.hypot(t.clientX - this.touch.startX, t.clientY - this.touch.startY);

            if (totalDist > 8) {
                this.touch.moved = true;
                this._clearLongPress();
            }

            if (this.isOperator) {
                // 控制模式：直接移动鼠标
                const c = this.getCanvasCoords(t.clientX, t.clientY);
                this.sendEvent({ type: 'MOUSE_MOVE', x: c.x, y: c.y, timestamp: Date.now() });
            } else {
                // 观看模式：平移视图
                this.view.x += dx;
                this.view.y += dy;
                this._clampView();
                this.compositeToScreen();
            }

            this.touch.lastX = t.clientX;
            this.touch.lastY = t.clientY;

        } else if (e.touches.length === 2) {
            const t0 = e.touches[0];
            const t1 = e.touches[1];
            const dist = this._dist(t0, t1);

            if (this.pinch.active) {
                const ratio = dist / this.pinch.initialDist;

                if (this.isOperator) {
                    // 控制模式：双指捏合 → 远程滚轮
                    const pinchDelta = dist - (this.pinch.initialDist || dist);
                    if (Math.abs(pinchDelta) > 5) {
                        const delta = Math.sign(pinchDelta) * 3;
                        this.sendEvent({ type: 'MOUSE_WHEEL', wheelDelta: delta, timestamp: Date.now() });
                        this.pinch.initialDist = dist; // 重置基准，避免持续累积
                    }
                } else {
                    // 观看模式：捏合缩放视图
                    const newScale = Math.max(0.5, Math.min(4.0, this.pinch.initialScale * ratio));
                    const midX = (t0.clientX + t1.clientX) / 2;
                    const midY = (t0.clientY + t1.clientY) / 2;

                    // 以捏合中心为锚点缩放
                    const rect = this.canvas.getBoundingClientRect();
                    const cx = (midX - rect.left) / rect.width * this.canvas.width;
                    const cy = (midY - rect.top) / rect.height * this.canvas.height;

                    const scaleChange = newScale / this.view.scale;
                    this.view.x = cx - scaleChange * (cx - this.view.x);
                    this.view.y = cy - scaleChange * (cy - this.view.y);
                    this.view.scale = newScale;

                    this._clampView();
                    this.compositeToScreen();
                }
            }
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        this._clearLongPress();

        const totalDist = Math.hypot(
            this.touch.lastX - this.touch.startX,
            this.touch.lastY - this.touch.startY
        );
        const duration = Date.now() - this.touch.startTime;

        if (e.touches.length === 0) {
            this.pinch.active = false;

            // 轻触（未移动，非长按，时间短）→ 点击
            if (!this.touch.moved && !this.touch.isLongPress && totalDist < 10 && duration < 500) {
                this._onTap(this.touch.startX, this.touch.startY, e.changedTouches[0]);
            }
        }

        if (e.touches.length < 2) {
            this.pinch.active = false;
        }
    }

    onTouchCancel(e) {
        this._clearLongPress();
        this.pinch.active = false;
        this.touch.moved = false;
    }

    /** 单击处理（支持双击检测） */
    _onTap(x, y, touch) {
        if (this.isOperator) {
            // 第一次点击：等待 250ms 看是否有第二次（双击）
            if (this.touch.tapTimer) {
                // 双击
                clearTimeout(this.touch.tapTimer);
                this.touch.tapTimer = null;
                this._sendClick(x, y, 1); // 两次单击 = 双击效果
                this._sendClick(x, y, 1);
                this._showTapRipple(x, y, 'double');
            } else {
                this.touch.tapTimer = setTimeout(() => {
                    this.touch.tapTimer = null;
                    this._sendClick(x, y, 1);
                    this._showTapRipple(x, y, 'single');
                }, 250);
            }
        }
    }

    /** 长按处理 → 右键 */
    _onLongPress(x, y) {
        if (this.isOperator) {
            this._sendClick(x, y, 3); // 右键
            this._showTapRipple(x, y, 'long');
            this._showTouchBadge('🖱️ 右键点击');
            // 振动反馈
            if (navigator.vibrate) navigator.vibrate(80);
        }
    }

    /** 发送鼠标点击（按下+释放） */
    _sendClick(clientX, clientY, button) {
        const c = this.getCanvasCoords(clientX, clientY);
        this.sendEvent({ type: 'MOUSE_PRESS', x: c.x, y: c.y, button, timestamp: Date.now() });
        setTimeout(() => {
            this.sendEvent({ type: 'MOUSE_RELEASE', x: c.x, y: c.y, button, timestamp: Date.now() });
        }, 50);
    }

    _clearLongPress() {
        if (this.touch.longPressTimer) {
            clearTimeout(this.touch.longPressTimer);
            this.touch.longPressTimer = null;
        }
    }

    /** 计算两触摸点距离 */
    _dist(t0, t1) {
        return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    }

    /** 限制视图平移范围，防止完全移出屏幕 */
    _clampView() {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const margin = 50;
        this.view.x = Math.max(-cw * this.view.scale + margin, Math.min(cw - margin, this.view.x));
        this.view.y = Math.max(-ch * this.view.scale + margin, Math.min(ch - margin, this.view.y));
    }

    /** 点击水波纹动画 */
    _showTapRipple(clientX, clientY, type) {
        const rect = this.canvas.getBoundingClientRect();
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        ripple.style.left = (clientX - rect.left) + 'px';
        ripple.style.top = (clientY - rect.top) + 'px';

        if (type === 'long') {
            ripple.style.background = 'rgba(255, 82, 82, 0.4)';
        } else if (type === 'double') {
            ripple.style.background = 'rgba(0, 230, 118, 0.4)';
        }

        document.getElementById('canvasContainer').appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    /** 显示操作提示气泡 */
    _showTouchBadge(text) {
        const badge = this.dom.touchModeBadge;
        if (!badge) return;
        badge.textContent = text;
        badge.className = 'touch-mode-badge show';
        setTimeout(() => { badge.className = 'touch-mode-badge'; }, 2500);
    }

    // ===== 键盘事件 =====

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
        if (keyMap[e.code] !== undefined) return keyMap[e.code];
        const fMatch = e.code.match(/^F(\d+)$/);
        if (fMatch) return 111 + parseInt(fMatch[1]);
        if (e.key && e.key.length === 1) return e.key.toUpperCase().charCodeAt(0);
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

    // ===== 虚拟键盘 =====

    /** 发送虚拟单键 */
    sendVirtualKey(code) {
        if (!this.isOperator) { this.showToast('请先获取操作权', 'error'); return; }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const codeMap = {
            'Escape': 27, 'Tab': 9, 'Home': 36, 'End': 35,
            'Insert': 155, 'Delete': 127, 'PageUp': 33, 'PageDown': 34,
            'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowRight': 39, 'ArrowDown': 40,
            'Space': 32, 'ControlLeft': 17, 'AltLeft': 18,
            'PrintScreen': 154,
        };

        let keyCode = codeMap[code];
        if (!keyCode) {
            const fMatch = code.match(/^F(\d+)$/);
            if (fMatch) keyCode = 111 + parseInt(fMatch[1]);
        }

        if (keyCode) {
            this.ws.send(JSON.stringify({ type: 'KEY_PRESS', keyCode, timestamp: Date.now() }));
            setTimeout(() => {
                this.ws && this.ws.send(JSON.stringify({ type: 'KEY_RELEASE', keyCode, timestamp: Date.now() }));
            }, 80);
        }
        // 振动反馈
        if (navigator.vibrate) navigator.vibrate(20);
    }

    /** 发送组合键 */
    sendCombo(combo) {
        if (!this.isOperator) { this.showToast('请先获取操作权', 'error'); return; }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const combos = {
            'ctrl-alt-del': [[17, 18, 127], 'Ctrl+Alt+Del'],
            'ctrl-c':  [[17, 67], 'Ctrl+C'],
            'ctrl-v':  [[17, 86], 'Ctrl+V'],
            'ctrl-z':  [[17, 90], 'Ctrl+Z'],
            'ctrl-a':  [[17, 65], 'Ctrl+A'],
            'win':     [[524], 'Win'],
        };

        const c = combos[combo];
        if (!c) return;
        const [keys] = c;
        // 依次按下
        keys.forEach((k, i) => {
            setTimeout(() => {
                this.ws && this.ws.send(JSON.stringify({ type: 'KEY_PRESS', keyCode: k, timestamp: Date.now() }));
            }, i * 30);
        });
        // 逆序释放
        [...keys].reverse().forEach((k, i) => {
            setTimeout(() => {
                this.ws && this.ws.send(JSON.stringify({ type: 'KEY_RELEASE', keyCode: k, timestamp: Date.now() }));
            }, keys.length * 30 + i * 30);
        });

        if (navigator.vibrate) navigator.vibrate(30);
    }

    toggleVirtualKeyboard() {
        if (this.vkOpen) {
            this.closeVirtualKeyboard();
        } else {
            this.openVirtualKeyboard();
        }
    }

    openVirtualKeyboard() {
        if (!this.dom.virtualKeyboard) return;
        this.dom.virtualKeyboard.classList.add('show');
        this.vkOpen = true;
        if (this.dom.mBtnKeyboard) {
            this.dom.mBtnKeyboard.style.color = 'var(--primary)';
        }
        if (this.dom.fBtnKeyboard) {
            this.dom.fBtnKeyboard.classList.add('vk-active');
        }
    }

    closeVirtualKeyboard() {
        if (!this.dom.virtualKeyboard) return;
        this.dom.virtualKeyboard.classList.remove('show');
        this.vkOpen = false;
        if (this.dom.mBtnKeyboard) {
            this.dom.mBtnKeyboard.style.color = '';
        }
        if (this.dom.fBtnKeyboard) {
            this.dom.fBtnKeyboard.classList.remove('vk-active');
        }
    }

    // ===== 工具栏操作 =====

    toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            const requestFn = el.requestFullscreen || el.webkitRequestFullscreen;
            if (requestFn) {
                requestFn.call(el).catch(() => {});
            } else {
                this.showToast('当前浏览器不支持全屏', 'error');
            }
        } else {
            const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
            if (exitFn) exitFn.call(document).catch(() => {});
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

    setQualityByBtn(btn) {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentQuality = parseFloat(btn.dataset.quality);
        this.qualityIndex = this.qualityLevels.indexOf(this.currentQuality);
        if (this.qualityIndex < 0) this.qualityIndex = 1;
        if (this.state === 'connected') {
            this.showToast('画质已调整: ' + Math.round(this.currentQuality * 100) + '%', 'success');
        }
    }

    /** 移动端循环切换画质 */
    cycleQuality() {
        this.qualityIndex = (this.qualityIndex + 1) % this.qualityLevels.length;
        this.currentQuality = this.qualityLevels[this.qualityIndex];
        const labels = ['低画质', '中画质', '高画质'];
        this.showToast('画质: ' + labels[this.qualityIndex], 'success');
        this._showTouchBadge('🎨 ' + labels[this.qualityIndex]);
        // 同步桌面端画质按钮
        document.querySelectorAll('.quality-btn').forEach(b => {
            b.classList.toggle('active', parseFloat(b.dataset.quality) === this.currentQuality);
        });
    }

    takeScreenshot() {
        if (this.state !== 'connected') {
            this.showToast('请先连接远程桌面', 'error');
            return;
        }
        const sourceCanvas = this.offscreenReady ? this.offscreenCanvas : this.canvas;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = sourceCanvas.width;
        tmpCanvas.height = sourceCanvas.height;
        tmpCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);

        const link = document.createElement('a');
        link.download = 'nrdc-screenshot-' + Date.now() + '.png';
        link.href = tmpCanvas.toDataURL('image/png');
        link.click();
        this.showToast('截图已保存', 'success');
    }

    // ===== 登录状态 & 弹窗视图 =====

    /** 注销登录：断开连接、清除凭证、回到登录表单 */
    logout() {
        this.manualClose = true;
        this.clearReconnectTimer();
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
            this.ws = null;
        }
        this.isLoggedIn = false;
        this.isOperator = false;
        this.operatorName = '';
        this.currentUser = '';
        this.role = 'user';
        this.sessionId = '';

        localStorage.removeItem('nrdc_token');
        localStorage.removeItem('nrdc_username');
        localStorage.removeItem('nrdc_role');

        this.updateControlUI();
        this.updateModalUI();
        this.setState('disconnected');
        this.updateUserRoleUI();
        this.closeModal();
        this.showToast('已注销', '');
    }

    /** 根据登录+连接状态切换弹窗内容 */
    updateModalUI() {
        const loginForm = this.dom.loginForm;
        const loggedInPanel = this.dom.loggedInPanel;
        const btnConnect = document.getElementById('btnConnect');
        const btnDisconnect = document.getElementById('btnDisconnect');
        const btnLogout = this.dom.btnLogout;
        const loggedInUser = this.dom.loggedInUser;
        const loggedInRole = this.dom.loggedInRole;
        const modalTitle = this.dom.modalTitle;

        if (this.isLoggedIn) {
            // 已登录：隐藏表单，显示用户信息面板
            loginForm.style.display = 'none';
            loggedInPanel.style.display = '';
            btnLogout.style.display = '';

            loggedInUser.textContent = this.currentUser;
            loggedInRole.textContent = this.role === 'admin' ? '管理员' : '普通用户';
            loggedInRole.className = 'role-badge ' + (this.role === 'admin' ? 'role-admin' : 'role-user');

            if (this.state === 'connected' || this.state === 'connecting' || this.state === 'reconnecting') {
                // 已连接：显示断开 + 注销
                modalTitle.textContent = '远程桌面';
                btnConnect.style.display = 'none';
                btnDisconnect.style.display = '';
            } else {
                // 已登录但未连接：显示连接 + 注销
                modalTitle.textContent = '远程桌面';
                btnConnect.style.display = '';
                btnDisconnect.style.display = 'none';
            }
        } else {
            // 未登录：显示登录表单
            modalTitle.textContent = '连接设置';
            loginForm.style.display = '';
            loggedInPanel.style.display = 'none';
            btnLogout.style.display = 'none';
            btnConnect.style.display = '';
            btnDisconnect.style.display = '';
        }
    }

    // ===== UI 更新 =====

    updateUserRoleUI() {
        const btn = this.dom.btnUserMgmt;
        const display = this.dom.userDisplay;
        if (!btn || !display) return;

        if (this.state === 'connected' || this.state === 'reconnecting') {
            display.style.display = '';
            display.textContent = this.currentUser + (this.role === 'admin' ? ' [A]' : '');
            btn.style.display = this.role === 'admin' ? '' : 'none';
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
            if (!resp.ok) { this.showToast(users.error || '获取用户列表失败', 'error'); return; }
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
            const roleLabel = u.role === 'admin'
                ? '<span class="role-badge role-admin">管理员</span>'
                : '<span class="role-badge role-user">普通用户</span>';
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
                <td><div class="table-actions">${actions}</div></td>
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
        this.dom.newRole.style.display = '';
        this.dom.newRole.previousElementSibling.style.display = '';
        this.dom.userFormModal.dataset.editMode = '';
        this.dom.userFormModal.classList.add('open');
    }

    closeUserForm() {
        this.dom.userFormModal.classList.remove('open');
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
            const mode = this.dom.userFormModal.dataset.editMode;
            if (mode === 'password') {
                resp = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Id': this.sessionId },
                    body: JSON.stringify({ password })
                });
            } else if (mode === 'role') {
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
            if (!resp.ok) { this.showToast(data.error || '操作失败', 'error'); return; }
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
        this.dom.newRole.style.display = '';
        this.dom.newRole.previousElementSibling.style.display = '';
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
    }

    async deleteUser(username) {
        if (!confirm(`确定要删除用户 "${username}" 吗？`)) return;
        try {
            const resp = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                method: 'DELETE',
                headers: { 'X-Session-Id': this.sessionId }
            });
            const data = await resp.json();
            if (!resp.ok) { this.showToast(data.error || '删除失败', 'error'); return; }
            this.showToast(data.message, 'success');
            this.loadUsers();
        } catch (err) {
            this.showToast('删除失败: ' + err.message, 'error');
        }
    }

    // ===== Toast 通知 =====

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
