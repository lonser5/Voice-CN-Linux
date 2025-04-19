const vscode = require('vscode');

/**
 * API配置视图
 * 负责显示API配置界面
 */
class ConfigView {
  /**
   * 构造函数
   * @param {vscode.ExtensionContext} context 扩展上下文
   * @param {Object} apiManager API管理器
   */
  constructor(context, apiManager) {
    this.context = context;
    this.apiManager = apiManager;
    this.view = null;
  }
  
  /**
   * 初始化视图
   */
  initialize() {
    // 验证视图是否已经存在
    if (this.view) {
      return;
    }
    
    // 主动创建webview视图
    try {
      // 使用registerWebviewViewProvider已经注册，不需要在这里创建
      console.log('配置视图已准备就绪');
    } catch (error) {
      console.error('初始化配置视图失败:', error);
    }
  }
  
  /**
   * 更新视图内容
   */
  updateView() {
    if (!this.view) {
      return;
    }
    
    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    
    this.view.webview.html = this.getWebviewContent();
  }
  
  /**
   * 获取Webview内容
   * @returns {string} HTML内容
   */
  getWebviewContent() {
    // 获取当前API提供商及配置
    const providers = this.apiManager.getAvailableProviders();
    const currentConfig = this.apiManager.getApiConfig();
    const currentProvider = currentConfig ? currentConfig.provider : 'baidu';

    // 获取百度、讯飞和阿里云的配置信息 (无论当前选择哪个，都获取)
    const baiduConfig = this.apiManager.getApiConfig('baidu');
    const xunfeiConfig = this.apiManager.getApiConfig('xunfei-mandarin') || this.apiManager.getApiConfig('xunfei-dialect'); // 讯飞共享配置
    const aliyunConfig = this.apiManager.getApiConfig('aliyun'); // 获取阿里云配置
    const tencentConfig = this.apiManager.getApiConfig('tencent'); // 新增获取腾讯云配置

    // 生成提供商选项HTML
    let providerOptionsHtml = '';
    // Manually add Aliyun and Tencent if not automatically included yet by apiManager
    const providerList = [...this.apiManager.getAvailableProviders()]; // Get the base list
    if (!providerList.some(p => p.id === 'aliyun')) {
        providerList.push({ id: 'aliyun', name: '阿里云实时语音识别' });
    }
    if (!providerList.some(p => p.id === 'tencent')) {
        providerList.push({ id: 'tencent', name: '腾讯云一句话识别' });
    }
    providerList.sort((a, b) => a.name.localeCompare(b.name)); // Sort providers alphabetically
    providerList.forEach(p => {
        providerOptionsHtml += `<option value="${p.id}" ${currentProvider === p.id ? 'selected' : ''}>${p.name}</option>`;
    });

    // 获取AI提示词优化配置
    const config = vscode.workspace.getConfiguration('voice-to-text');
    const promptOptimizationEnabled = config.get('promptOptimization.enabled', false);
    const deepseekApiKey = config.get('promptOptimization.deepseekApiKey', '');

    // SVG Icons
    const eyeIconSvg = `<svg class="eye-icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
    const eyeSlashIconSvg = `<svg class="eye-slash-icon hidden" viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75C21.27 9.11 17 6.5 12 6.5c-1.6 0-3.14.35-4.54.96l1.56 1.56C9.74 8.13 10.85 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L21.73 22 20.46 23.27 3.27 6 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`;

    return `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:; style-src ${this.view.webview.cspSource} 'unsafe-inline'; img-src ${this.view.webview.cspSource} data:;">
      <title>API配置</title>
      <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); font-size: var(--vscode-font-size); }
        h3 { margin-top: 0; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        select, input { width: 100%; padding: 5px; border: 1px solid var(--vscode-input-border); background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 2px; box-sizing: border-box; font-size: inherit; }
        .provider-title { font-weight: bold; margin-bottom: 10px; color: var(--vscode-editor-foreground); }
        .provider-fields { margin-top: 15px; padding-top: 0; }
        .button-container { margin-top: 20px; text-align: right; }
        button:not(.toggle-password) { padding: 6px 12px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-size: inherit; }
        button:not(.toggle-password):hover { background-color: var(--vscode-button-hoverBackground); }
        .status { margin-top: 15px; padding: 10px; border-radius: 3px; }
        .status.success { background-color: rgba(0, 128, 0, 0.1); border: 1px solid rgba(0, 128, 0, 0.3); color: var(--vscode-list-activeSelectionForeground); }
        .status.error { background-color: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.3); color: var(--vscode-errorForeground); }
        .hidden { display: none !important; }
        .separator { margin: 25px 0 15px 0; border-top: 1px solid var(--vscode-panel-border); padding-top: 15px; }
        .checkbox-group { display: flex; align-items: center; }
        .checkbox-group input[type="checkbox"] { width: auto; margin-right: 8px; }
        .checkbox-group label { margin-bottom: 0; font-weight: normal; }
        .description { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 5px; margin-bottom: 10px; }
        .password-container { position: relative; }
        .password-container input { padding-right: 35px; }
        .toggle-password { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: var(--vscode-input-foreground); opacity: 0.7; width: 16px; height: 16px; background: none; border: none; padding: 0; display: flex; align-items: center; justify-content: center; }
        .toggle-password:hover { opacity: 1; }
        .eye-icon, .eye-slash-icon { width: 16px; height: 16px; fill: currentColor; }
      </style>
    </head>
    <body>
      <h3>语音识别 API 配置</h3>

      <div class="form-group">
        <label for="provider">选择服务提供商:</label>
        <select id="provider" name="provider">
          ${providerOptionsHtml}
        </select>
      </div>

      <div id="baiduFields" class="provider-fields ${currentProvider !== 'baidu' ? 'hidden' : ''}">
        <div class="form-group">
          <label for="baiduAppId">App ID:</label>
          <input type="text" id="baiduAppId" name="baiduAppId" value="${baiduConfig?.appId || ''}" placeholder="请输入App ID">
        </div>
        <div class="form-group">
          <label for="baiduApiKey">API Key:</label>
          <input type="text" id="baiduApiKey" name="baiduApiKey" value="${baiduConfig?.apiKey || ''}" placeholder="请输入API Key">
        </div>
        <div class="form-group">
          <label for="baiduSecretKey">Secret Key:</label>
          <div class="password-container">
            <input type="password" id="baiduSecretKey" name="baiduSecretKey" value="${baiduConfig?.secretKey || ''}" placeholder="请输入Secret Key">
            <button type="button" class="toggle-password" data-target="baiduSecretKey">
              ${eyeIconSvg} ${eyeSlashIconSvg}
            </button>
          </div>
        </div>
      </div>

      <div id="xunfeiFields" class="provider-fields ${!(currentProvider === 'xunfei-mandarin' || currentProvider === 'xunfei-dialect') ? 'hidden' : ''}">
        <p class="description">讯飞普通话版与方言版使用同一套 APPID、APIKey、APISecret。</p>
        <div class="form-group">
           <label for="xunfeiAppId">APPID:</label>
           <input type="text" id="xunfeiAppId" name="xunfeiAppId" value="${xunfeiConfig?.appId || ''}" placeholder="请输入APPID">
        </div>
        <div class="form-group">
           <label for="xunfeiApiKey">APIKey:</label>
           <div class="password-container">
             <input type="password" id="xunfeiApiKey" name="xunfeiApiKey" value="${xunfeiConfig?.apiKey || ''}" placeholder="请输入APIKey">
             <button type="button" class="toggle-password" data-target="xunfeiApiKey">
               ${eyeIconSvg} ${eyeSlashIconSvg}
             </button>
           </div>
        </div>
        <div class="form-group">
           <label for="xunfeiApiSecret">APISecret:</label>
           <div class="password-container">
             <input type="password" id="xunfeiApiSecret" name="xunfeiApiSecret" value="${xunfeiConfig?.apiSecret || ''}" placeholder="请输入APISecret">
             <button type="button" class="toggle-password" data-target="xunfeiApiSecret">
               ${eyeIconSvg} ${eyeSlashIconSvg}
             </button>
           </div>
        </div>
      </div>

      <div id="aliyunFields" class="provider-fields ${currentProvider !== 'aliyun' ? 'hidden' : ''}">
        <p class="description">阿里云实时语音识别需要AppKey、AccessKey ID和AccessKey Secret来生成鉴权Token。</p>
        <div class="form-group">
          <label for="aliyunAppKey">AppKey:</label>
          <input type="text" id="aliyunAppKey" name="aliyunAppKey" value="${aliyunConfig?.appKey || ''}" placeholder="请输入阿里云项目的AppKey">
        </div>
        <div class="form-group">
          <label for="aliyunAccessKeyId">AccessKey ID:</label>
          <input type="text" id="aliyunAccessKeyId" name="aliyunAccessKeyId" value="${aliyunConfig?.accessKeyId || ''}" placeholder="请输入AccessKey ID">
        </div>
        <div class="form-group">
          <label for="aliyunAccessKeySecret">AccessKey Secret:</label>
          <div class="password-container">
            <input type="password" id="aliyunAccessKeySecret" name="aliyunAccessKeySecret" value="${aliyunConfig?.accessKeySecret || ''}" placeholder="请输入AccessKey Secret">
            <button type="button" class="toggle-password" data-target="aliyunAccessKeySecret">
              ${eyeIconSvg} ${eyeSlashIconSvg}
            </button>
          </div>
        </div>
      </div>

      <div id="tencentFields" class="provider-fields ${currentProvider !== 'tencent' ? 'hidden' : ''}">
        <p class="description">腾讯云一句话识别需要 AppId、SecretId 和 SecretKey。</p>
        <div class="form-group">
          <label for="tencentAppId">AppId:</label>
          <input type="text" id="tencentAppId" name="tencentAppId" value="${tencentConfig?.appId || ''}" placeholder="请输入腾讯云 AppId">
        </div>
        <div class="form-group">
          <label for="tencentSecretId">SecretId:</label>
          <input type="text" id="tencentSecretId" name="tencentSecretId" value="${tencentConfig?.secretId || ''}" placeholder="请输入腾讯云 SecretId">
        </div>
        <div class="form-group">
          <label for="tencentSecretKey">SecretKey:</label>
          <div class="password-container">
            <input type="password" id="tencentSecretKey" name="tencentSecretKey" value="${tencentConfig?.secretKey || ''}" placeholder="请输入腾讯云 SecretKey">
            <button type="button" class="toggle-password" data-target="tencentSecretKey">
              ${eyeIconSvg} ${eyeSlashIconSvg}
            </button>
          </div>
        </div>
      </div>

      <div class="separator">
        <h3>AI 提示词优化 (可选)</h3>
        <p class="description">开启后，语音转文字的结果将发送给DeepSeek进行优化，使其更适合作为AI编程助手的输入。</p>
        <div class="form-group checkbox-group">
            <input type="checkbox" id="promptOptimizationEnabled" name="promptOptimizationEnabled" ${promptOptimizationEnabled ? 'checked' : ''}>
            <label for="promptOptimizationEnabled">启用优化</label>
        </div>
         <div id="deepseekFields" class="form-group ${!promptOptimizationEnabled ? 'hidden' : ''}">
            <label for="deepseekApiKey">DeepSeek API Key:</label>
             <div class="password-container">
                <input type="password" id="deepseekApiKey" name="deepseekApiKey" value="${deepseekApiKey || ''}" placeholder="sk-...">
                <button type="button" class="toggle-password" data-target="deepseekApiKey">
                    ${eyeIconSvg} ${eyeSlashIconSvg}
                </button>
            </div>
            <p class="description">请前往 DeepSeek 开放平台获取 API Key。</p>
        </div>
      </div>

      <div class="button-container">
        <button id="saveButton">保存配置</button>
      </div>

      <div id="statusMessage" class="status hidden"></div>

      <script>
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || {};

        const providerSelect = document.getElementById('provider');
        const baiduFields = document.getElementById('baiduFields');
        const xunfeiFields = document.getElementById('xunfeiFields');
        const aliyunFields = document.getElementById('aliyunFields');
        const tencentFields = document.getElementById('tencentFields');
        const saveButton = document.getElementById('saveButton');
        const statusMessage = document.getElementById('statusMessage');
        const promptOptimizationCheckbox = document.getElementById('promptOptimizationEnabled');
        const deepseekFields = document.getElementById('deepseekFields');

        function toggleProviderFields() {
          const selectedProvider = providerSelect.value;
          baiduFields.classList.toggle('hidden', selectedProvider !== 'baidu');
          xunfeiFields.classList.toggle('hidden', !(selectedProvider === 'xunfei-mandarin' || selectedProvider === 'xunfei-dialect'));
          aliyunFields.classList.toggle('hidden', selectedProvider !== 'aliyun');
          tencentFields.classList.toggle('hidden', selectedProvider !== 'tencent');
        }

        function toggleDeepseekFields() {
            deepseekFields.classList.toggle('hidden', !promptOptimizationCheckbox.checked);
        }

        function setupPasswordToggle() {
            document.querySelectorAll('.toggle-password').forEach(button => {
                button.replaceWith(button.cloneNode(true));
            });
            document.querySelectorAll('.toggle-password').forEach(button => {
                button.addEventListener('click', function() {
                    const targetInputId = this.getAttribute('data-target');
                    const targetInput = document.getElementById(targetInputId);
                    if (!targetInput) return;
                    const eyeIcon = this.querySelector('.eye-icon');
                    const eyeSlashIcon = this.querySelector('.eye-slash-icon');

                    if (targetInput.type === 'password') {
                        targetInput.type = 'text';
                        eyeIcon.classList.add('hidden');
                        eyeSlashIcon.classList.remove('hidden');
                    } else {
                        targetInput.type = 'password';
                        eyeIcon.classList.remove('hidden');
                        eyeSlashIcon.classList.add('hidden');
                    }
                });

                 // Initialize icon state based on input type
                 const targetInputId = button.getAttribute('data-target');
                 const targetInput = document.getElementById(targetInputId);
                 if (targetInput) {
                     const eyeIcon = button.querySelector('.eye-icon');
                     const eyeSlashIcon = button.querySelector('.eye-slash-icon');
                     if (targetInput.type === 'password') {
                         eyeIcon.classList.remove('hidden');
                         eyeSlashIcon.classList.add('hidden');
                     } else {
                         eyeIcon.classList.add('hidden');
                         eyeSlashIcon.classList.remove('hidden');
                     }
                 }
            });
        }

        toggleProviderFields();
        toggleDeepseekFields();
        setupPasswordToggle();

        providerSelect.addEventListener('change', toggleProviderFields);
        promptOptimizationCheckbox.addEventListener('change', toggleDeepseekFields);

        saveButton.addEventListener('click', () => {
          const provider = providerSelect.value;
          const configData = {
            provider: provider,
            promptOptimization: promptOptimizationCheckbox.checked,
            deepseekApiKey: document.getElementById('deepseekApiKey')?.value.trim() || ''
          };

          let credentials = {};
          if (provider === 'baidu') {
            credentials = {
              appId: document.getElementById('baiduAppId')?.value.trim() || '',
              apiKey: document.getElementById('baiduApiKey')?.value.trim() || '',
              secretKey: document.getElementById('baiduSecretKey')?.value.trim() || ''
            };
          } else if (provider === 'xunfei-mandarin' || provider === 'xunfei-dialect') {
             credentials = {
               appId: document.getElementById('xunfeiAppId')?.value.trim() || '',
               apiKey: document.getElementById('xunfeiApiKey')?.value.trim() || '',
               apiSecret: document.getElementById('xunfeiApiSecret')?.value.trim() || ''
             };
          } else if (provider === 'aliyun') {
             credentials = {
               appKey: document.getElementById('aliyunAppKey')?.value.trim() || '',
               accessKeyId: document.getElementById('aliyunAccessKeyId')?.value.trim() || '',
               accessKeySecret: document.getElementById('aliyunAccessKeySecret')?.value.trim() || ''
             };
          } else if (provider === 'tencent') {
            credentials = {
              appId: document.getElementById('tencentAppId')?.value.trim() || '',
              secretId: document.getElementById('tencentSecretId')?.value.trim() || '',
              secretKey: document.getElementById('tencentSecretKey')?.value.trim() || ''
            };
          }

           vscode.postMessage({
             command: 'saveConfig',
             provider: provider,
             config: credentials,
             promptOptimization: configData.promptOptimization,
             deepseekApiKey: configData.deepseekApiKey
           });
        });

        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.command) {
              case 'updateStatus':
                  statusMessage.textContent = message.text;
                  statusMessage.className = 'status ' + message.type;
                  statusMessage.classList.remove('hidden');
                  setTimeout(() => {
                    statusMessage.classList.add('hidden');
                  }, 5000);
                  break;
          }
        });

      </script>
    </body>
    </html>`;
  }
  
  /**
   * 处理来自Webview的消息
   * @param {Object} message 消息对象
   */
  handleMessage(message) {
    switch (message.command) {
      case 'saveConfig':
        const { provider, config: credentials, promptOptimization, deepseekApiKey } = message;

        if (!credentials) {
            console.error('ConfigView: Received saveConfig message without credentials object');
             if (this.view) { this.view.webview.postMessage({ command: 'updateStatus', text: '保存失败：内部错误 (数据缺失)。', type: 'error' }); }
            return;
        }

        console.log(`ConfigView: Posting save command for ${provider}`);
        this.view?.webview.postMessage({ command: 'updateStatus', text: '正在保存...', type: 'loading' }); // Show loading status

        vscode.commands.executeCommand('voice-to-text.saveProviderConfig', provider, credentials)
            .then(async (success) => {
                console.log(`ConfigView: Save command returned: ${success}`);
                let promptOptSuccess = true;
                try {
                    console.log(`ConfigView: Updating prompt optimization enabled: ${promptOptimization}`);
                    await vscode.workspace.getConfiguration('voice-to-text').update('promptOptimization.enabled', promptOptimization, vscode.ConfigurationTarget.Global);
                    await vscode.workspace.getConfiguration('voice-to-text').update('promptOptimization.deepseekApiKey', deepseekApiKey, vscode.ConfigurationTarget.Global);
                    console.log('ConfigView: Prompt optimization settings updated.');
                } catch (e) {
                    promptOptSuccess = false;
                    console.error('ConfigView: Failed to save prompt optimization settings:', e);
                }

                if (success === true) {
                    console.log(`ConfigView: Provider config save successful for ${provider}.`);
                    const statusText = promptOptSuccess ? '配置已保存成功！' : '服务商配置已保存，但提示词优化配置保存失败。';
                    if (this.view) { this.view.webview.postMessage({ command: 'updateStatus', text: statusText, type: 'success' }); }

                    // **ADD DELAY**: Wait a bit before updating the view to allow config changes to propagate
                    console.log('ConfigView: Delaying view update slightly...');
                    setTimeout(() => {
                         if (this.view) { // Check if view still exists
                            console.log('ConfigView: Updating view after successful save and delay.');
                            this.updateView();
                         }
                    }, 200); // 200ms delay

                } else {
                    console.error(`ConfigView: Provider config command failed or returned false for ${provider}.`);
                    if (this.view) { this.view.webview.postMessage({ command: 'updateStatus', text: '服务商配置保存失败，请检查日志。', type: 'error' }); }
                }
            }, (error) => {
                console.error(`ConfigView: Error executing save command for ${provider}:`, error);
                if (this.view) { this.view.webview.postMessage({ command: 'updateStatus', text: `配置保存命令错误: ${error.message || error}`, type: 'error' }); }
            });
        break;
    }
  }
}

module.exports = ConfigView; 