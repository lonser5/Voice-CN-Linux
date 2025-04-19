/**
 * 录音视图模板
 * 负责生成WebView HTML内容
 */
class RecordViewTemplate {
  /**
   * 获取Webview内容
   * @param {string} providerName 提供商名称
   * @param {boolean} isConfigValid 配置是否有效
   * @returns {string} HTML内容
   */
  static getWebviewContent(providerName, isConfigValid) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <title>语音识别</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 10px;
      color: var(--vscode-foreground);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .provider-info {
      width: 100%;
      margin-bottom: 20px;
      padding: 10px;
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
    }
    .provider-name {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .status-indicator {
      display: flex;
      align-items: center;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 5px;
    }
    .status-dot.valid {
      background-color: #4CAF50;
    }
    .status-dot.invalid {
      background-color: #F44336;
    }
    .optimization-badge {
      display: inline-block;
      background-color: #5e9eff;
      color: white;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 10px;
      margin-left: 8px;
      vertical-align: middle;
    }
    .microphone-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 30px 0;
    }
    .countdown {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--vscode-editor-foreground);
    }
    .countdown.warning {
      color: #FFA500;
    }
    .countdown.danger {
      color: #FF4D4D;
    }
    .microphone {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background-color: var(--vscode-button-background);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .microphone:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .microphone.recording {
      background-color: #ff4d4d;
      animation: pulse 1.5s infinite;
    }
    .microphone.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .microphone-icon {
      width: 35px;
      height: 35px;
      fill: var(--vscode-button-foreground);
    }
    .status-text {
      margin-top: 10px;
      text-align: center;
    }
    .result-container {
      width: 100%;
      margin-top: 20px;
    }
    .result-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .result-text {
      width: 100%;
      min-height: 100px;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 3px;
      resize: vertical;
    }
    .button-container {
      display: flex;
      justify-content: space-between;
      width: 100%;
      margin-top: 15px;
    }
    .button {
      padding: 6px 12px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      transition: background-color 0.2s;
    }
    .button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .button.active {
      background-color: #5e9eff;
    }
    .button-icon {
      width: 14px;
      height: 14px;
      display: inline-block;
      vertical-align: middle;
      margin-right: 4px;
    }
    .position-indicator {
      margin-top: 10px;
      padding: 6px 10px;
      background-color: rgba(80, 200, 120, 0.2);
      border-radius: 3px;
      font-size: 12px;
      display: none;
    }
    .position-indicator.active {
      display: block;
    }
    @keyframes pulse {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.1);
        opacity: 0.8;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div class="provider-info">
    <div class="provider-name">当前服务：${providerName}</div>
    <div class="status-indicator">
      <div class="status-dot ${isConfigValid ? 'valid' : 'invalid'}"></div>
      <span>${isConfigValid ? '配置有效' : '配置无效，请先完成API配置'}</span>
      ${isConfigValid ? '<span style="margin-left: 10px; font-size: 0.9em; opacity: 0.7;">(点击Ctrl+1快捷启动/关闭)</span>' : ''}
    </div>
  </div>
  
  <div class="microphone-container">
    <div id="countdown" class="countdown" style="display: none;">剩余时间：60秒</div>
    <div id="microphone" class="microphone ${isConfigValid ? '' : 'disabled'}">
      <svg class="microphone-icon" viewBox="0 0 24 24">
        <path d="M12,2C9.8,2,8,3.8,8,6v6c0,2.2,1.8,4,4,4s4-1.8,4-4V6C16,3.8,14.2,2,12,2z"/>
        <path d="M19,11h-1c0,3.3-2.7,6-6,6s-6-2.7-6-6H5c0,3.7,2.9,6.7,6.5,7v3h1v-3C16.1,17.7,19,14.7,19,11z"/>
      </svg>
    </div>
    <div class="status-text" id="statusText">
      ${isConfigValid ? '点击麦克风开始录音' : '请先完成API配置'}
    </div>
  </div>
  
  <div class="result-container">
    <div class="result-title">识别结果：</div>
    <textarea id="resultText" class="result-text" readonly placeholder="语音识别结果将显示在这里..."></textarea>
  </div>
  
  <div class="button-container">
    <button id="autoCopyBtn" class="button">
      <span class="button-icon">📋</span>自动复制结果<span id="autoCopyStatus" class="status-indicator-text">（关闭）</span>
    </button>
    <button id="clearResultBtn" class="button">
      <span class="button-icon">🗑️</span>清除结果
    </button>
  </div>
  
  <div id="copyIndicator" class="position-indicator">
    自动复制已开启，识别结果将自动复制到剪贴板
  </div>
  
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      
      // 获取DOM元素
      const microphone = document.getElementById('microphone');
      const statusText = document.getElementById('statusText');
      const resultText = document.getElementById('resultText');
      const countdownEl = document.getElementById('countdown');
      const autoCopyBtn = document.getElementById('autoCopyBtn');
      const autoCopyStatus = document.getElementById('autoCopyStatus');
      const clearResultBtn = document.getElementById('clearResultBtn');
      const copyIndicator = document.getElementById('copyIndicator');
      
      // 录音状态
      let isRecording = false;
      let countdownInterval = null;
      let countdownTime = 60;
      let autoCopyEnabled = false;
      
      // 检查是否可以录音
      const isDisabled = microphone.classList.contains('disabled');
      
      // 更新倒计时显示
      function updateCountdown(seconds) {
        countdownEl.textContent = '剩余时间：' + seconds + '秒';
        countdownEl.style.display = 'block';
        
        // 添加颜色警告
        if (seconds <= 10) {
          countdownEl.className = 'countdown danger';
        } else if (seconds <= 20) {
          countdownEl.className = 'countdown warning';
        } else {
          countdownEl.className = 'countdown';
        }
      }
      
      // 开始倒计时
      function startCountdown() {
        countdownTime = 60;
        updateCountdown(countdownTime);
        
        if (countdownInterval) {
          clearInterval(countdownInterval);
        }
        
        countdownInterval = setInterval(() => {
          countdownTime--;
          updateCountdown(countdownTime);
          
          if (countdownTime <= 0) {
            clearInterval(countdownInterval);
            stopRecording();
          }
        }, 1000);
      }
      
      // 停止倒计时
      function stopCountdown() {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        countdownEl.style.display = 'none';
      }
      
      // 启动录音
      function startRecording() {
        if (isDisabled || isRecording) {
          return;
        }
        
        // 开始录音
        vscode.postMessage({
          command: 'startRecording'
        });
        isRecording = true;
        microphone.classList.add('recording');
        statusText.textContent = '正在录音...点击停止';
        startCountdown();
      }
      
      // 停止录音
      function stopRecording() {
        if (!isRecording) {
          return;
        }
        
        // 停止录音
        vscode.postMessage({
          command: 'stopRecording'
        });
        isRecording = false;
        microphone.classList.remove('recording');
        statusText.textContent = '正在处理...';
        stopCountdown();
      }
      
      // 切换自动复制模式
      function toggleAutoCopy() {
        autoCopyEnabled = !autoCopyEnabled;
        
        if (autoCopyEnabled) {
          // 启用自动复制
          autoCopyBtn.classList.add('active');
          autoCopyStatus.textContent = '（开启）';
          copyIndicator.classList.add('active');
          
          // 通知扩展启用自动复制
          vscode.postMessage({
            command: 'enableAutoCopy'
          });
        } else {
          // 禁用自动复制
          autoCopyBtn.classList.remove('active');
          autoCopyStatus.textContent = '（关闭）';
          copyIndicator.classList.remove('active');
          
          // 通知扩展禁用自动复制
          vscode.postMessage({
            command: 'disableAutoCopy'
          });
        }
      }
      
      // 清除结果
      function clearResult() {
        resultText.value = '';
        
        // 通知扩展清除结果
        vscode.postMessage({
          command: 'clearResult'
        });
      }
      
      // 点击麦克风按钮
      microphone.addEventListener('click', function() {
        if (isDisabled) {
          return;
        }
        
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      });
      
      // 点击自动复制按钮
      autoCopyBtn.addEventListener('click', function() {
        toggleAutoCopy();
      });
      
      // 点击清除结果按钮
      clearResultBtn.addEventListener('click', function() {
        clearResult();
      });
      
      // 监听扩展发送的消息
      window.addEventListener('message', function(event) {
        const message = event.data;
        
        console.log('收到扩展消息:', message.command, message);
        
        if (message.command === 'recordingStarted') {
          isRecording = true;
          microphone.classList.add('recording');
          statusText.textContent = '正在录音...点击停止';
          startCountdown();
        } else if (message.command === 'recordingStopped') {
          isRecording = false;
          microphone.classList.remove('recording');
          statusText.textContent = '正在处理...';
          stopCountdown();
        } else if (message.command === 'optimizingPrompt') {
          statusText.textContent = '正在使用AI优化提示词...';
        } else if (message.command === 'recognitionComplete') {
          statusText.textContent = '识别完成，结果已显示';
          if (message.result) {
            resultText.value = message.result;
            
            // 如果是优化过的提示词，显示优化标记
            if (message.isOptimized) {
              statusText.innerHTML = '识别完成 <span class="optimization-badge">AI优化</span>';
              
              // 如果有原始结果，在控制台记录
              if (message.originalResult) {
                console.log('原始识别结果:', message.originalResult);
              }
            }
            
            // 如果启用了自动复制，则复制结果到剪贴板
            if (autoCopyEnabled) {
              vscode.postMessage({
                command: 'copyToClipboard',
                text: message.result
              });
              statusText.innerHTML = (message.isOptimized ? 
                '识别完成 <span class="optimization-badge">AI优化</span> 并已复制到剪贴板' : 
                '识别完成并已复制到剪贴板');
            }
          }
        } else if (message.command === 'recognitionError') {
          statusText.textContent = '识别出错: ' + message.error;
          isRecording = false;
          microphone.classList.remove('recording');
          stopCountdown();
        } else if (message.command === 'recordingError') {
          statusText.textContent = '录音出错: ' + message.error;
          isRecording = false;
          microphone.classList.remove('recording');
          stopCountdown();
        } else if (message.command === 'configChanged') {
          // 重新加载页面以反映新的配置
          window.location.reload();
        } else if (message.command === 'autoStartRecording') {
          startRecording();
        } else if (message.command === 'updateRecordingStatus') {
          // 更新录音状态
          isRecording = message.isRecording;
          if (isRecording) {
            microphone.classList.add('recording');
            statusText.textContent = '正在录音...点击停止';
            if (!countdownInterval) {
              startCountdown();
            }
          } else {
            microphone.classList.remove('recording');
            statusText.textContent = '识别完成，点击麦克风重新开始';
            stopCountdown();
          }
          console.log('录音状态已更新:', isRecording ? '正在录音' : '未录音');
        } else if (message.command === 'updateAutoCopyStatus') {
          // 更新自动复制状态
          autoCopyEnabled = message.enabled;
          if (autoCopyEnabled) {
            autoCopyBtn.classList.add('active');
            autoCopyStatus.textContent = '（开启）';
            copyIndicator.classList.add('active');
          } else {
            autoCopyBtn.classList.remove('active');
            autoCopyStatus.textContent = '（关闭）';
            copyIndicator.classList.remove('active');
          }
        } else if (message.command === 'clipboardCopySuccess') {
          // 复制成功通知
          statusText.textContent = '已成功复制到剪贴板';
          setTimeout(() => {
            statusText.textContent = '识别完成，点击麦克风重新开始';
          }, 2000);
        }
      });
      
      // 当页面加载完成后，通知扩展准备好了
      vscode.postMessage({
        command: 'viewReady'
      });
      
      // 获取当前录音状态
      setTimeout(() => {
        vscode.postMessage({
          command: 'getRecordingStatus'
        });
      }, 300);
    })();
  </script>
</body>
</html>`;
  }
}

module.exports = RecordViewTemplate; 