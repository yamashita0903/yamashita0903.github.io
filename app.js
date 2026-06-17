/* ==========================================================================
   Sleek Cafè Tech - Future Coffee Machine JS Logic
   ========================================================================== */

class CoffeeMachineApp {
  constructor() {
    this.states = ['standby', 'orderable', 'brewing', 'completed'];
    this.currentState = 'standby';
    
    // Config / Defaults
    this.brewDuration = 7; // 秒 (スライダーで可変)
    this.useCamera = true;
    this.soundEnabled = true;
    this.cameraRotateRight = false;
    this.cameraRotateLeft = false;
    this.cameraJudgmentLevel = 75;
    this.contentScale = 0.7;
    this.contentLift = 0;
    this.enableStandbyTapTransition = true;
    this.isUserDetected = false;
    this.isSimulatingUser = false;
    this.lastDetectedTime = 0;
    this.lostTimeoutDuration = 3000; // 人物ロストとみなす時間 (3秒)
    this.faceHistory = []; // 簡易顔認識用の履歴
    this.newAutoDetectMode = false; // 新しい待機画面検知モード
    this.standbyFaceProfile = null;
    this.standbyFaceHoldStart = 0;
    this.standbyFaceMinSize = 0.20; // ある程度大きく捉える判定
    this.standbyFaceHoldDuration = 1500; // 1.5秒保持すると注文可へ
    this.standbyFaceMatchDistLimit = 0.18;
    this.standbyFaceMatchSizeLimit = 0.26;
    this.orderBgPlayedOnce = false;

    // Audio Context
    this.audioCtx = null;
    this.camera = null;
    this.faceDetection = null;
    this.cameraRetryTimer = null;
    this.cameraRetryCount = 0;

    // Timer refs
    this.stateTimer = null;
    this.lostCheckInterval = null;
    this.brewInterval = null;
    
    // Recommended Coffee Menus
    this.menus = {
      new: {
        name: "プレミアム アロマブレンド",
        desc: "厳選されたアラビカ豆を100%使用。華やかな香りと柔らかな酸味が特徴の本日の提案です。",
        roast: "ミディアムライト",
        temp: "HOT"
      },
      returning: {
        name: "ビター カプチーノ",
        desc: "いつものお気に入り。深煎りエスプレッソに、きめ細やかなスチームドミルクをたっぷり注いで。",
        roast: "ダークロースト",
        temp: "HOT / 甘さ控えめ"
      }
    };
    
    // DOM Cache
    this.dom = {
      sections: {},
      webcam: document.getElementById('webcam'),
      debugOverlay: document.getElementById('debug-overlay'),
      debugLogs: document.getElementById('debug-logs'),
      debugPanel: document.getElementById('debug-panel'),
      debugTrigger: document.getElementById('debug-trigger'),
      debugClose: document.getElementById('debug-close'),
      debugVideoContainer: document.querySelector('.debug-video-container'),
      
      // Standby
      adCanvas: document.getElementById('ad-canvas'),
      standbyCmVideo: document.getElementById('standby-cm-video'),
      
      // Detection
      scanFill: document.querySelector('.scan-progress-fill'),
      
      // Orderable
      orderBgVideo: document.getElementById('order-bg-video'),
      orderGreetingTitle: document.getElementById('order-greeting-title'),
      orderGreetingMessage: document.getElementById('order-greeting-message'),
      orderGreeting: document.getElementById('order-greeting'),
      orderQuestion: document.getElementById('order-question'),
      orderSub: document.getElementById('order-sub'),
      btnBrew: document.getElementById('btn-brew'),
      
      // Brewing
      dripStream: document.getElementById('drip-stream'),
      liquidMask: document.getElementById('coffee-liquid-mask'),
      progressCircle: document.getElementById('brew-progress-circle'),
      brewPercentage: document.getElementById('brew-percentage'),
      brewTimer: document.getElementById('brew-timer'),
      brewingCmVideo: document.getElementById('brewing-cm-video'),
      
      // Completed
      resetProgressBar: document.getElementById('reset-progress-bar'),
      
      // Settings
      cfgCamera: document.getElementById('cfg-camera-toggle'),
      cfgCameraRotateRight: document.getElementById('cfg-camera-rotate-right'),
      cfgCameraRotateLeft: document.getElementById('cfg-camera-rotate-left'),
      cfgCameraJudgment: document.getElementById('cfg-camera-judgment'),
      cfgCameraJudgmentVal: document.getElementById('cfg-camera-judgment-val'),
      cfgStandbyTapTransition: document.getElementById('cfg-standby-tap-transition'),
      cfgBrewTime: document.getElementById('cfg-brew-time'),
      cfgBrewTimeVal: document.getElementById('cfg-brew-time-val'),
      cfgHoldDuration: document.getElementById('cfg-hold-duration'),
      cfgHoldDurationVal: document.getElementById('cfg-hold-duration-val'),
      cfgContentScale: document.getElementById('cfg-content-scale'),
      cfgContentScaleVal: document.getElementById('cfg-content-scale-val'),
      cfgContentLift: document.getElementById('cfg-content-lift'),
      cfgContentLiftVal: document.getElementById('cfg-content-lift-val')
    };

    // Load sections
    this.states.forEach(state => {
      this.dom.sections[state] = document.getElementById(`state-${state}`);
    });

    // Particle FX Background
    this.particles = [];
    this.initBackgroundParticles();

    // Ad Banner Anim
    this.adAnimFrame = null;
    this.adCanvasCtx = this.dom.adCanvas.getContext('2d');
    
    // Bind Event Listeners
    this.bindEvents();

    // Sync settings to default values immediately.
    this.syncSettingsUI();
    this.applyCameraRotationSetting();
    this.applyCameraJudgmentSetting();
    this.applyContentScaleSetting();
    
    // Init MediaPipe
    this.initMediaPipe();
    
    // Start Ad Canvas Anim
    this.resizeAdCanvas();
    this.startAdAnimation();
    this.updateMediaForState('standby', false);
    
    // Start System Loops
    this.startSystemTick();

    this.log("System initialized. Ready in Standby.");
  }

  // LOGGING UTILITY
  log(message) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${message}`);
    if (this.dom.debugLogs) {
      const logDiv = document.createElement('div');
      logDiv.textContent = `[${time}] ${message}`;
      this.dom.debugLogs.appendChild(logDiv);
      this.dom.debugLogs.scrollTop = this.dom.debugLogs.scrollHeight;
      
      // Limit logs display
      while (this.dom.debugLogs.children.length > 20) {
        this.dom.debugLogs.removeChild(this.dom.debugLogs.firstChild);
      }
    }
  }

  // INITIALIZE AUDIO (Web Audio API)
  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // PLAY AUDIO EFFECTS
  playSFX(type) {
    if (!this.soundEnabled) return;
    this.initAudio();
    
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    
    switch (type) {
      case 'scan_chirp': { // ピピピッというスキャン音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.15);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'scan_complete': { // 判定成功時
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.type = 'triangle';
        osc2.type = 'sine';
        
        osc1.frequency.setValueAtTime(600, now);
        osc1.frequency.setValueAtTime(900, now + 0.08);
        osc2.frequency.setValueAtTime(1200, now + 0.08);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.12, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        osc1.start(now);
        osc2.start(now + 0.08);
        osc1.stop(now + 0.3);
        osc2.stop(now + 0.3);
        break;
      }
      case 'order_confirm': { // 決定ボタン押下
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.15, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }
      case 'steam_brew': { // スチーム・ドリップ中の持続音
        // ホワイトノイズ生成
        const bufferSize = ctx.sampleRate * this.brewDuration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = buffer;
        
        // バンドパスフィルタでノイズの音色を調整 (シューという音)
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.Q.setValueAtTime(1.5, now);
        
        // ドリップのポタポタ音を追加するための低周波オシレーター
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4; // 4Hz
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 150;
        
        const oscDrip = ctx.createOscillator();
        oscDrip.type = 'sine';
        oscDrip.frequency.value = 250;
        
        lfo.connect(lfoGain);
        lfoGain.connect(oscDrip.frequency);
        
        const dripGain = ctx.createGain();
        dripGain.gain.value = 0.02;
        
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.06, now); // 抽出中の音量
        noiseGain.gain.linearRampToValueAtTime(0.06, now + this.brewDuration - 1);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + this.brewDuration);
        
        noiseNode.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        
        oscDrip.connect(dripGain);
        dripGain.connect(ctx.destination);
        
        noiseNode.start(now);
        lfo.start(now);
        oscDrip.start(now);
        
        noiseNode.stop(now + this.brewDuration);
        lfo.stop(now + this.brewDuration);
        oscDrip.stop(now + this.brewDuration);
        
        this.brewAudioNodes = { noiseNode, lfo, oscDrip };
        break;
      }
      case 'success_chime': { // 完成ファンファーレ
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.50]; // C, E, G, B, C (メジャー7th)
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          
          gain.gain.setValueAtTime(0.05, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.6);
          
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.6);
        });
        break;
      }
    }
  }

  // STATE TRANSITIONS
  transitionTo(nextState) {
    if (!this.states.includes(nextState)) {
      if (nextState === 'detection') {
        this.transitionTo('orderable');
      }
      return;
    }

    const prevState = this.currentState;
    this.currentState = nextState;
    this.log(`Transition: ${prevState.toUpperCase()} ➔ ${nextState.toUpperCase()}`);
    
    // UI Update
    Object.keys(this.dom.sections).forEach(state => {
      this.dom.sections[state]?.classList.remove('active', 'exiting');
    });
    this.dom.sections[nextState]?.classList.add('active');
    this.updateMediaForState(nextState, true);
    
    // Clear state timers
    if (this.stateTimer) clearTimeout(this.stateTimer);
    if (this.brewInterval) clearInterval(this.brewInterval);
    
    // State Specific logic
    switch (nextState) {
      case 'standby':
        this.resetStateStandby();
        break;
      case 'detection':
        this.enterStateDetection();
        break;
      case 'orderable':
        this.enterStateOrderable();
        break;
      case 'brewing':
        this.enterStateBrewing();
        break;
      case 'completed':
        this.enterStateCompleted();
        break;
    }
  }

  // STATE: STANDBY
  resetStateStandby() {
    this.log("Resetting to Standby ad loop.");
    this.isUserDetected = false;
    this.resetStandbyFaceTracking();
    this.dom.liquidMask.setAttribute('y', '95'); // Reset liquid mask
    this.dom.dripStream.classList.remove('active'); // Stop drip line
    this.dom.brewPercentage.textContent = '0%';
    this.dom.brewTimer.textContent = '残り 0秒';
    this.dom.resetProgressBar.classList.remove('counting');
    this.updateMediaForState('standby', true);
  }

  transitionFromStandbyToOrderable() {
    if (this.currentState !== 'standby') return;
    this.log("Standby: Transitioning to Orderable after stable hold.");
    this.transitionTo('orderable');
  }

  resetStandbyFaceTracking() {
    this.standbyFaceProfile = null;
    this.standbyFaceHoldStart = 0;
  }

  isStandbyFaceBigEnough(bbox) {
    return bbox.width >= this.standbyFaceMinSize && bbox.height >= this.standbyFaceMinSize;
  }

  handleStandbyDetection(bbox) {
    if (this.currentState !== 'standby') return;
    if (!this.isStandbyFaceBigEnough(bbox)) {
      this.resetStandbyFaceTracking();
      return;
    }

    if (this.standbyFaceProfile && this.isSameFaceProfile(this.standbyFaceProfile, bbox)) {
      if (!this.standbyFaceHoldStart) {
        this.standbyFaceHoldStart = Date.now();
      }
      if (Date.now() - this.standbyFaceHoldStart >= this.standbyFaceHoldDuration) {
        this.resetStandbyFaceTracking();
        this.transitionFromStandbyToOrderable();
      }
      return;
    }

    this.standbyFaceProfile = {
      x: bbox.xCenter,
      y: bbox.yCenter,
      w: bbox.width,
      h: bbox.height
    };
    this.standbyFaceHoldStart = Date.now();
  }

  playVideo(video, restart = false) {
    if (!video) return;
    if (restart) {
      try {
        video.currentTime = 0;
      } catch (error) {
        // Some browsers block seeking until metadata is ready.
      }
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (!video.muted) {
          video.muted = true;
          video.play().catch(() => {});
        }
      });
    }
  }

  configureVideo(video, { muted, volume }) {
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }

  syncSettingsUI() {
    if (this.dom.cfgCamera) {
      this.dom.cfgCamera.checked = this.useCamera;
    }
    if (this.dom.cfgCameraRotateRight) {
      this.dom.cfgCameraRotateRight.checked = this.cameraRotateRight;
    }
    if (this.dom.cfgCameraRotateLeft) {
      this.dom.cfgCameraRotateLeft.checked = this.cameraRotateLeft;
    }
    if (this.dom.cfgCameraJudgment) {
      this.dom.cfgCameraJudgment.value = String(this.cameraJudgmentLevel);
    }
    if (this.dom.cfgCameraJudgmentVal) {
      this.dom.cfgCameraJudgmentVal.textContent = this.getCameraJudgmentLabel(this.cameraJudgmentLevel);
    }
    if (this.dom.cfgStandbyTapTransition) {
      this.dom.cfgStandbyTapTransition.checked = this.enableStandbyTapTransition;
    }
    if (this.dom.cfgBrewTime) {
      this.dom.cfgBrewTime.value = String(this.brewDuration);
    }
    if (this.dom.cfgBrewTimeVal) {
      this.dom.cfgBrewTimeVal.textContent = `${this.brewDuration}s`;
    }
    if (this.dom.cfgHoldDuration) {
      this.dom.cfgHoldDuration.value = String(this.standbyFaceHoldDuration / 1000);
    }
    if (this.dom.cfgHoldDurationVal) {
      this.dom.cfgHoldDurationVal.textContent = `${(this.standbyFaceHoldDuration / 1000).toFixed(1)}秒`;
    }
    if (this.dom.cfgContentScale) {
      this.dom.cfgContentScale.value = String(Math.round(this.contentScale * 100));
    }
    if (this.dom.cfgContentScaleVal) {
      this.dom.cfgContentScaleVal.textContent = `${Math.round(this.contentScale * 100)}%`;
    }
    if (this.dom.cfgContentLift) {
      this.dom.cfgContentLift.value = String(this.contentLift);
    }
    if (this.dom.cfgContentLiftVal) {
      this.dom.cfgContentLiftVal.textContent = `${this.contentLift}px`;
    }
  }

  applyCameraRotationSetting() {
    if (!this.dom.debugVideoContainer) return;
    const applyRight = this.cameraRotateRight && !this.cameraRotateLeft;
    const applyLeft = this.cameraRotateLeft && !this.cameraRotateRight;
    this.dom.debugVideoContainer.classList.toggle('camera-rotated-right', applyRight);
    this.dom.debugVideoContainer.classList.toggle('camera-rotated-left', applyLeft);
  }

  applyCameraJudgmentSetting() {
    const normalized = Math.max(0, Math.min(1, this.cameraJudgmentLevel / 100));
    this.standbyFaceMatchDistLimit = 0.16 + (normalized * 0.06);
    this.standbyFaceMatchSizeLimit = 0.22 + (normalized * 0.08);
  }

  applyContentScaleSetting() {
    document.documentElement.style.setProperty('--content-scale', String(this.contentScale));
  }

  applyContentLiftSetting() {
    document.documentElement.style.setProperty('--content-lift', `${this.contentLift}px`);
  }

  getCameraJudgmentLabel(level) {
    if (level <= 45) return '非常に緩い';
    if (level <= 80) return 'かなり緩い';
    return '緩い';
  }

  updateMediaForState(state, restart = false) {
    this.configureVideo(this.dom.standbyCmVideo, {
      muted: state !== 'standby',
      volume: 1
    });
    if (this.dom.orderBgVideo) {
      this.dom.orderBgVideo.loop = false;
    }
    this.configureVideo(this.dom.orderBgVideo, {
      muted: true,
      volume: 0
    });
    this.configureVideo(this.dom.brewingCmVideo, {
      muted: state !== 'brewing',
      volume: 0.35
    });

    if (state === 'standby') {
      this.playVideo(this.dom.standbyCmVideo, restart);
      this.dom.orderBgVideo?.pause();
      this.dom.brewingCmVideo?.pause();
    } else if (state === 'orderable') {
      this.dom.standbyCmVideo?.pause();
      if (!this.orderBgPlayedOnce) {
        this.playVideo(this.dom.orderBgVideo, restart);
        this.orderBgPlayedOnce = true;
      }
      this.dom.brewingCmVideo?.pause();
    } else if (state === 'brewing') {
      this.dom.standbyCmVideo?.pause();
      this.dom.orderBgVideo?.pause();
      this.playVideo(this.dom.brewingCmVideo, restart);
    } else {
      this.dom.standbyCmVideo?.pause();
      this.dom.orderBgVideo?.pause();
      this.dom.brewingCmVideo?.pause();
    }
  }

  unlockVideoAudio() {
    if (this.currentState === 'standby') {
      this.configureVideo(this.dom.standbyCmVideo, { muted: false, volume: 1 });
      this.playVideo(this.dom.standbyCmVideo, false);
    }
    if (this.currentState === 'brewing') {
      this.configureVideo(this.dom.brewingCmVideo, { muted: false, volume: 0.35 });
      this.playVideo(this.dom.brewingCmVideo, false);
    }
  }

  // STATE: DETECTION
  enterStateDetection() {
    this.playSFX('scan_chirp');
    
    // Simulate scan bar
    let progress = 0;
    this.dom.scanFill.style.width = '0%';
    
    const interval = setInterval(() => {
      progress += 5;
      if (this.dom.scanFill) {
        this.dom.scanFill.style.width = `${progress}%`;
      }
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 100);

    // 2.2秒後に自動で注文可能へ
    this.stateTimer = setTimeout(() => {
      clearInterval(interval);
      this.playSFX('scan_complete');
      this.transitionTo('orderable');
    }, 2200);
  }

  // STATE: ORDERABLE
  enterStateOrderable() {
    const isNewUser = this.determineUserType();
    this.updateOrderableUI(isNewUser);
    this.updateMediaForState('orderable', true);
  }

  updateOrderableUI(isNewUser) {
    const greeting = this.dom.orderGreeting;
    const title = this.dom.orderGreetingTitle;
    const message = this.dom.orderGreetingMessage;
    const question = this.dom.orderQuestion;
    const sub = this.dom.orderSub;
    const button = this.dom.btnBrew;

    if (this.newAutoDetectMode) {
      greeting.style.display = 'block';
      question.style.display = 'none';
      if (isNewUser) {
        title.textContent = 'はじめまして！';
        message.textContent = '本日のあなたにおすすめの一杯をご提案します';
        button.style.display = '';
        button.disabled = false;
        sub.textContent = 'タップしてください';
      } else {
        title.textContent = 'おかえりなさい！';
        message.textContent = 'またのご利用をお待ちしております';
        button.style.display = 'none';
        sub.textContent = '';
      }
    } else {
      greeting.style.display = 'none';
      question.style.display = '';
      button.style.display = '';
      button.disabled = false;
      sub.textContent = 'タップしてください';
    }
  }

  determineUserType() {
    // デバッグで明示的に新規/既存シミュレーションボタンが押された場合
    if (this.forcedUserType !== undefined) {
      const type = this.forcedUserType;
      this.forcedUserType = undefined; // 使い捨て
      return type === 'new';
    }
    
    // 通常判定：直前の顔のサイズ・位置履歴から簡易判定
    if (this.faceHistory.length > 0) {
      const currentFace = this.faceHistory[this.faceHistory.length - 1];
      // 過去3回の中に、位置・サイズが近い顔があれば「既存」と見なす
      const isMatch = this.faceHistory.slice(0, -1).some(prevFace => {
        const distLimit = 0.15; // 座標位置誤差15%以内
        const sizeLimit = 0.20; // 境界枠の大きさの誤差20%以内
        
        const dx = Math.abs(prevFace.x - currentFace.x);
        const dy = Math.abs(prevFace.y - currentFace.y);
        const dw = Math.abs(prevFace.w - currentFace.w);
        const dh = Math.abs(prevFace.h - currentFace.h);
        
        return dx < distLimit && dy < distLimit && dw < sizeLimit && dh < sizeLimit;
      });
      
      if (isMatch) {
        this.log("顔認識：既存利用者と判定されました。");
        return false;
      }
    }
    
    this.log("顔認識：初回利用者（新規）と判定されました。");
    return true; // 新規
  }

  // STATE: BREWING (抽出中)
  enterStateBrewing() {
    this.playSFX('order_confirm');
    
    // 巨大ボタンを無効化（状態遷移で非表示になりますが、念のため）
    this.dom.btnBrew.disabled = true;
    this.dom.brewPercentage.textContent = '0%';
    this.dom.brewTimer.textContent = '残り 0秒';
    this.dom.liquidMask.setAttribute('y', '95');
    this.dom.dripStream.classList.remove('active');

    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    this.dom.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    this.dom.progressCircle.style.strokeDashoffset = circumference;

    // 抽出音を少し遅らせて再生開始
    setTimeout(() => {
      if (this.currentState === 'brewing') {
        //this.playSFX('steam_brew');//抽出中のSE削除
        this.dom.dripStream.classList.add('active'); // 液体落下ライン開始
      }
    }, 400);

    const cmVideo = this.dom.brewingCmVideo;
    if (cmVideo) {
      cmVideo.loop = false;
      this.updateMediaForState('brewing', true);
    }

    const startProgress = () => {
      if (this.currentState !== 'brewing') return;

      const videoDuration = cmVideo && Number.isFinite(cmVideo.duration) && cmVideo.duration > 0
        ? cmVideo.duration
        : this.brewDuration;
      const startTime = Date.now();
      const durationMs = videoDuration * 1000;
      this.dom.brewPercentage.textContent = '0%';
      this.dom.brewTimer.textContent = `残り ${Math.ceil(videoDuration)}秒`;

      if (this.brewInterval) clearInterval(this.brewInterval);
      this.brewInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const percent = Math.floor(progress * 100);
      const remainingSec = Math.ceil((durationMs - elapsed) / 1000);
      
      // Update Texts
      this.dom.brewPercentage.textContent = `${percent}%`;
      this.dom.brewTimer.textContent = `残り ${Math.max(remainingSec, 0)}秒`;

      // Update Circular ring
      const offset = circumference - (progress * circumference);
      this.dom.progressCircle.style.strokeDashoffset = offset;
      
      // Update Coffee Liquid (SVG mask `y` attribute from 95 down to 30)
      const liquidY = 95 - (progress * (95 - 40));
      this.dom.liquidMask.setAttribute('y', liquidY);
      
      if (progress >= 1) {
        clearInterval(this.brewInterval);
        this.dom.dripStream.classList.remove('active'); // ストリーム停止
        this.dom.brewPercentage.textContent = '100%';
        this.dom.brewTimer.textContent = '残り 0秒';
        this.transitionTo('completed');
      }
      }, 50);
    };

    if (cmVideo && !(Number.isFinite(cmVideo.duration) && cmVideo.duration > 0)) {
      cmVideo.addEventListener('loadedmetadata', startProgress, { once: true });
    } else {
      startProgress();
    }
  }

  // STATE: COMPLETED (完成)
  enterStateCompleted() {
    this.playSFX('success_chime');
    
    // ボタンなどの初期化
    this.dom.btnBrew.disabled = false;
    
    // デモ用として、人が居続けても最長8秒で自動リセットするタイマーを併設
    // またはカメラ非使用時は自動で5秒でスタンバイに戻る
    let resetSec = 5;
    this.dom.resetProgressBar.style.animation = 'none';
    this.dom.resetProgressBar.offsetHeight; // トリガーリフロー
    this.dom.resetProgressBar.style.animation = 'shrinkWidth 5s linear forwards';
    
    this.stateTimer = setTimeout(() => {
      this.log("完成画面のタイムアウト完了。Standbyへ戻ります。");
      this.transitionTo('standby');
    }, 5000);
    // clearTimeout(this.stateTimer);
    // this.stateTimer = null;
    this.completedFace = this.faceHistory.length > 0 ? { ...this.faceHistory[this.faceHistory.length - 1] } : null;
    this.lastDetectedTime = Date.now();
    this.dom.resetProgressBar.style.animation = 'none';
    this.dom.resetProgressBar.classList.remove('counting');
  }

  // BIND DOM EVENTS
  bindEvents() {
    // 注文ボタンタップ
    this.dom.btnBrew.addEventListener('click', () => {
      this.transitionTo('brewing');
    });

    // 待機画面タップで注文可へ移行
    this.dom.sections.standby.addEventListener('click', () => {
      if (this.currentState === 'standby' && this.enableStandbyTapTransition) {
        this.transitionTo('orderable');
      }
    });

    // デバッグパネルの開閉
    this.dom.debugTrigger.addEventListener('click', () => {
      this.unlockVideoAudio();
      this.dom.debugPanel.classList.toggle('open');
    });
    this.dom.debugClose.addEventListener('click', () => {
      this.dom.debugPanel.classList.remove('open');
    });

    // デバッグ設定: カメラ有効無効
    this.dom.cfgCamera.addEventListener('change', (e) => {
      this.useCamera = e.target.checked;
      this.log(`Camera detect toggled: ${this.useCamera}`);
      if (this.useCamera) {
        this.cameraRetryCount = 0;
        this.initMediaPipe();
      } else {
        this.stopCamera();
      }
    });

    // デバッグ設定: カメラを右回転
    this.dom.cfgCameraRotateRight.addEventListener('change', (e) => {
      this.cameraRotateRight = e.target.checked;
      this.applyCameraRotationSetting();
    });

    // デバッグ設定: カメラを左回転
    this.dom.cfgCameraRotateLeft.addEventListener('change', (e) => {
      this.cameraRotateLeft = e.target.checked;
      this.applyCameraRotationSetting();
    });

    // デバッグ設定: カメラ判定のゆるさ
    this.dom.cfgCameraJudgment.addEventListener('input', (e) => {
      this.cameraJudgmentLevel = parseInt(e.target.value, 10);
      this.applyCameraJudgmentSetting();
      if (this.dom.cfgCameraJudgmentVal) {
        this.dom.cfgCameraJudgmentVal.textContent = this.getCameraJudgmentLabel(this.cameraJudgmentLevel);
      }
    });

    // デバッグ設定: 待機画面からのタップ移行
    this.dom.cfgStandbyTapTransition.addEventListener('change', (e) => {
      this.enableStandbyTapTransition = e.target.checked;
    });

    // デバッグ設定: 抽出時間
    this.dom.cfgBrewTime.addEventListener('input', (e) => {
      this.brewDuration = parseInt(e.target.value);
      this.dom.cfgBrewTimeVal.textContent = `${this.brewDuration}s`;
    });

    // デバッグ設定: 秒保持すると注文可へ
    this.dom.cfgHoldDuration.addEventListener('input', (e) => {
      this.standbyFaceHoldDuration = Math.round(parseFloat(e.target.value) * 1000);
      if (this.dom.cfgHoldDurationVal) {
        this.dom.cfgHoldDurationVal.textContent = `${parseFloat(e.target.value).toFixed(1)}秒`;
      }
    });

    // デバッグ設定: コンテンツ表示の大きさ
    this.dom.cfgContentScale.addEventListener('input', (e) => {
      this.contentScale = parseInt(e.target.value, 10) / 100;
      this.applyContentScaleSetting();
      if (this.dom.cfgContentScaleVal) {
        this.dom.cfgContentScaleVal.textContent = `${e.target.value}%`;
      }
    });

    // デバッグ設定: 抽出中/完成コンテンツを上に引き上げる
    this.dom.cfgContentLift.addEventListener('input', (e) => {
      this.contentLift = parseInt(e.target.value, 10);
      this.applyContentLiftSetting();
      if (this.dom.cfgContentLiftVal) {
        this.dom.cfgContentLiftVal.textContent = `${this.contentLift}px`;
      }
    });

    // Resize window
    window.addEventListener('resize', () => {
      this.resizeAdCanvas();
    });

    // PCキーボードショートカット (デモ補助用)
    window.addEventListener('keydown', (e) => {
      this.unlockVideoAudio();
      if (e.target.tagName === 'INPUT') return; // 入力欄内は無視
      
      switch (e.key) {
        case '1': this.transitionTo('standby'); break;
        case '2': this.transitionTo('orderable'); break;
        case '3': this.transitionTo('orderable'); break;
        case '4': this.transitionTo('brewing'); break;
        case '5': this.transitionTo('completed'); break;
        case 'd': // 'd'キーでデバッグパネルトグル
          this.dom.debugPanel.classList.toggle('open');
          break;
        case 's': // 's'キーで人物検知シミュレート
          this.log("Debug Shortcut: Sim user");
          this.isSimulatingUser = true;
          this.lastDetectedTime = Date.now();
          if (this.currentState === 'standby') {
            this.handleStandbyDetection({ xCenter: 0.5, yCenter: 0.45, width: 0.28, height: 0.28 });
          }
          break;
        case 'l': // 'l'キーで人物ロスト
          this.log("Debug Shortcut: Lost user");
          this.isSimulatingUser = false;
          this.lastDetectedTime = 0;
          this.handleUserLost();
          break;
      }
    });

    window.addEventListener('pointerdown', () => {
      this.unlockVideoAudio();
    });
  }

  // MEDIAPIPE FACE DETECTION INITIALIZATION
  initMediaPipe() {
    try {
      if (!this.useCamera) return;
      if (typeof FaceDetection === 'undefined') {
        this.log("Warning: MediaPipe FaceDetection library not loaded. Running in Simulator fallback mode.");
        return;
      }

      if (!this.faceDetection) {
        this.faceDetection = new FaceDetection({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        this.faceDetection.setOptions({
          model: 'short',
          minDetectionConfidence: 0.55
        });

        this.faceDetection.onResults((results) => this.onCameraResults(results));
      }

      if (this.camera) return;
      this.stopWebcamTracks();

      this.camera = new Camera(this.dom.webcam, {
        onFrame: async () => {
          if (this.useCamera) {
            await this.faceDetection.send({ image: this.dom.webcam });
          }
        },
        width: 160,
        height: 120
      });
      
      this.camera.start()
        .then(() => {
          this.cameraRetryCount = 0;
          this.dom.webcam.style.display = 'block';
          this.log("Webcam and MediaPipe started successfully.");
        })
        .catch(err => {
          this.camera = null;
          this.stopWebcamTracks();
          this.handleCameraStartError(err);
        });

    } catch (error) {
      this.log(`MediaPipe initialization failed: ${error.message}. Simulator fallback active.`);
    }
  }

  handleCameraStartError(error) {
    const name = error?.name || '';
    const message = error?.message || String(error);
    const isDeviceBusy = name === 'NotReadableError' || /device in use|could not start video source/i.test(message);
    const reason = isDeviceBusy
      ? 'Camera is already in use by another app or browser tab.'
      : message;

    this.log(`Camera start error: ${reason} Simulator fallback active.`);

    if (this.cameraRetryTimer) clearTimeout(this.cameraRetryTimer);
    if (this.useCamera && this.cameraRetryCount < 3) {
      this.cameraRetryCount += 1;
      this.cameraRetryTimer = setTimeout(() => {
        this.log(`Retrying camera start (${this.cameraRetryCount}/3).`);
        this.initMediaPipe();
      }, 1500);
    } else {
      this.dom.webcam.style.display = 'none';
    }
  }

  stopWebcamTracks() {
    const stream = this.dom.webcam?.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(track => track.stop());
    }
    if (this.dom.webcam) {
      this.dom.webcam.srcObject = null;
    }
  }

  stopCamera() {
    if (this.cameraRetryTimer) {
      clearTimeout(this.cameraRetryTimer);
      this.cameraRetryTimer = null;
    }
    if (this.camera && typeof this.camera.stop === 'function') {
      try {
        this.camera.stop();
      } catch (error) {
        this.log(`Camera stop warning: ${error.message}`);
      }
    }
    this.camera = null;
    this.cameraRetryCount = 0;
    this.stopWebcamTracks();
  }

  // PROCESS MEDIAPIPE DETECTIONS
  onCameraResults(results) {
    if (!this.useCamera) return;

    const overlay = this.dom.debugOverlay;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const detections = results.detections || [];
    
    if (detections.length > 0) {
      this.lastDetectedTime = Date.now();
      const bbox = detections[0].boundingBox;

      // if (this.currentState === 'completed' && this.completedFace && this.isDifferentFace(bbox, this.completedFace)) {
      //   this.log("System: Different user detected on completed screen.");
      //   this.isUserDetected = true;
      //   this.transitionTo('orderable');
      //   return;
      // }

      // Draw detection box on debug view
      detections.forEach(det => {
        const dbox = det.boundingBox;
        const x = dbox.xCenter - dbox.width / 2;
        const y = dbox.yCenter - dbox.height / 2;

        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          x * overlay.width,
          y * overlay.height,
          dbox.width * overlay.width,
          dbox.height * overlay.height
        );

        // Save face data for identity profiling (simplified ID tracking)
        this.saveFaceProfile(dbox);
      });

      if (this.currentState === 'standby') {
        this.handleStandbyDetection(bbox);
      }

      if (!this.isUserDetected) {
        this.isUserDetected = true;
        this.log("AI Camera: User detected!");
      }
    } else {
      this.resetStandbyFaceTracking();
      // カメラ上は検出されないが、デバッグシミュレーターがONなら検知状態を維持
      if (this.isSimulatingUser) {
        this.lastDetectedTime = Date.now();
      }
    }
  }

  saveFaceProfile(bbox) {
    // 簡易顔座標を最大10回まで履歴として保存
    const currentFace = {
      x: bbox.xCenter,
      y: bbox.yCenter,
      w: bbox.width,
      h: bbox.height,
      time: Date.now()
    };
    
    this.faceHistory.push(currentFace);
    if (this.faceHistory.length > 10) {
      this.faceHistory.shift();
    }
  }

  isSameFaceProfile(prev, current) {
    const dx = Math.abs(prev.x - current.xCenter);
    const dy = Math.abs(prev.y - current.yCenter);
    const dw = Math.abs(prev.w - current.width);
    const dh = Math.abs(prev.h - current.height);
    return dx < 0.12 && dy < 0.12 && dw < 0.18 && dh < 0.18;
  }

  isDifferentFace(current, previous) {
    const dx = Math.abs(current.xCenter - previous.x);
    const dy = Math.abs(current.yCenter - previous.y);
    const dw = Math.abs(current.width - previous.w);
    const dh = Math.abs(current.height - previous.h);
    return dx > 0.22 || dy > 0.22 || dw > 0.28 || dh > 0.28;
  }

  // BACKGROUND SYSTEMS CHECK (LOST DETECTING)
  startSystemTick() {
    this.lostCheckInterval = setInterval(() => {
      // 人物ロストチェック
      const timeSinceLastDetection = Date.now() - this.lastDetectedTime;
      const isSimulating = this.isSimulatingUser;
      
      // カメラがオフ、かつシミュレーターもオフの場合は、ロスト判定は走らない
      if (!this.useCamera && !isSimulating) {
        return;
      }

      if (isSimulating) {
        this.lastDetectedTime = Date.now();
        return;
      }
      
      // 人物検知中なのに、一定時間（5秒）以上検知がなかった場合
      if ((this.isUserDetected || isSimulating) && timeSinceLastDetection > this.lostTimeoutDuration) {
        this.handleUserLost();
      }
    }, 1000);
  }

  handleUserLost() {
    this.isUserDetected = false;
    this.isSimulatingUser = false;
    this.log("System: User lost for 3+ seconds.");
    
    // 抽出中以外であれば、即待機状態に戻す
    if (this.currentState !== 'standby' && this.currentState !== 'brewing') {
      this.log("Resetting to Standby state due to user leave.");
      this.transitionTo('standby');
    }
  }

  // 1. BACKGROUND DYNAMIC PARTICLES (コーヒー風味の背景演出)
  initBackgroundParticles() {
    const container = document.getElementById('particles-container');
    if (!container) return;
    
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'bg-dot';
      
      const size = Math.random() * 8 + 4;
      const left = Math.random() * 100;
      const delay = Math.random() * 10;
      const duration = Math.random() * 15 + 10;
      
      p.style.cssText = `
        position: absolute;
        bottom: -20px;
        left: ${left}%;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(88,60,40,0.1) 70%, transparent 100%);
        border-radius: 50%;
        filter: blur(1px);
        pointer-events: none;
        animation: riseUp ${duration}s linear infinite;
        animation-delay: ${delay}s;
      `;
      
      container.appendChild(p);
    }
    
    // Inject animation CSS rule dynamically
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes riseUp {
        0% { transform: translateY(0) scale(1); opacity: 0; }
        10% { opacity: 0.8; }
        90% { opacity: 0.8; }
        100% { transform: translateY(-105vh) scale(1.5); opacity: 0; }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  // 2. STANDBY AD BANNER DYNAMIC CANVAS ART (モーショングラフィックス広告)
  resizeAdCanvas() {
    const canvas = this.dom.adCanvas;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }

  startAdAnimation() {
    const ctx = this.adCanvasCtx;
    const canvas = this.dom.adCanvas;
    
    let waveOffset = 0;
    
    const draw = () => {
      if (this.currentState === 'standby') {
        ctx.fillStyle = '#120f0d'; // Clear color matching dark coffee
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw elegant flowing curves representing coffee aroma
        waveOffset += 0.005;
        
        ctx.lineWidth = 1;
        
        // Curve 1 (Coffee Gold)
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.12)';
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height * 0.6 + Math.sin(x * 0.003 + waveOffset) * 60 + Math.cos(x * 0.0015 - waveOffset) * 30;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Curve 2 (Warm Amber)
        ctx.strokeStyle = 'rgba(255, 185, 0, 0.08)';
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height * 0.5 + Math.sin(x * 0.002 - waveOffset * 1.5) * 80 + Math.cos(x * 0.004 + waveOffset) * 40;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Curve 3 (Deep Brown)
        ctx.strokeStyle = 'rgba(88, 60, 40, 0.15)';
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height * 0.65 + Math.sin(x * 0.001 + waveOffset * 0.8) * 40 + Math.cos(x * 0.002 + waveOffset * 1.2) * 50;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      
      this.adAnimFrame = requestAnimationFrame(draw);
    };
    
    draw();
  }
}

// Global App Instance
window.app = null;
window.addEventListener('DOMContentLoaded', () => {
  window.app = new CoffeeMachineApp();
});
