const vscode = require('vscode');
const BaiduApi = require('./baidu/BaiduApi');
const XunfeiMandarinApi = require('./xunfei/XunfeiMandarinApi');
const XunfeiDialectApi = require('./xunfei/XunfeiDialectApi');
const AliyunProvider = require('./aliyun/AliyunProvider');
const TencentProvider = require('./tencent/TencentProvider');

/**
 * API管理器，用于管理不同的语音识别服务
 */
class ApiManager {
  constructor(context) {
    this.context = context;
    this.apiInstances = {
      baidu: new BaiduApi(),
      'xunfei-mandarin': new XunfeiMandarinApi(),
      'xunfei-dialect': new XunfeiDialectApi(),
      'aliyun': new AliyunProvider(),
      'tencent': new TencentProvider()
    };
    
    // 获取初始配置来决定默认 provider
    const initialConfig = vscode.workspace.getConfiguration('voice-to-text');
    this.currentProvider = initialConfig.get('apiProvider', 'baidu');
    
    this.updateConfiguration();
    
    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('voice-to-text')) {
            console.log('Configuration changed, updating ApiManager...');
            this.updateConfiguration();
        }
    });
  }
  
  /**
   * 更新所有API实例的配置
   * 从 VS Code 配置中读取密钥信息
   */
  updateConfiguration() {
    const config = vscode.workspace.getConfiguration('voice-to-text');
    this.currentProvider = config.get('apiProvider', 'baidu');
    
    // 更新百度配置
    if (this.apiInstances.baidu) {
      const baiduConfig = config.get('baidu', {});
      this.apiInstances.baidu.setConfig(
        baiduConfig.appId || '',
        baiduConfig.apiKey || '',
        baiduConfig.secretKey || ''
      );
    }
    
    // 更新讯飞配置 (读取各自独立的配置)
    const xunfeiMandarinConfig = config.get('xunfei-mandarin', {});
    if (this.apiInstances['xunfei-mandarin']) {
      this.apiInstances['xunfei-mandarin'].setConfig(
          xunfeiMandarinConfig.appId || '', 
          xunfeiMandarinConfig.apiKey || '', 
          xunfeiMandarinConfig.apiSecret || ''
      );
    }

    const xunfeiDialectConfig = config.get('xunfei-dialect', {});
    if (this.apiInstances['xunfei-dialect']) {
      this.apiInstances['xunfei-dialect'].setConfig(
          xunfeiDialectConfig.appId || '', 
          xunfeiDialectConfig.apiKey || '', 
          xunfeiDialectConfig.apiSecret || ''
      );
    }
    
    // 更新阿里云配置
    if (this.apiInstances.aliyun) {
        const aliyunConfig = config.get('aliyun', {});
        this.apiInstances.aliyun.setConfig(
            aliyunConfig.appKey || '',
            aliyunConfig.accessKeyId || '',
            aliyunConfig.accessKeySecret || ''
        );
    }
    
    // 更新腾讯云配置
    if (this.apiInstances.tencent) {
        const tencentConfig = config.get('tencent', {});
        this.apiInstances.tencent.setConfig(
            tencentConfig.appId || '',
            tencentConfig.secretId || '',
            tencentConfig.secretKey || ''
        );
    }
    
    console.log(`ApiManager updated. Current provider: ${this.currentProvider}`);
  }
  
  /**
   * 保存指定Provider的API配置 (由 command 'voice-to-text.saveProviderConfig' 调用)
   * @param {string} provider 提供商标识
   * @param {Object} credentials 包含密钥的对象
   * @returns {Promise<boolean>} 配置是否成功
   */
  async saveProviderConfig(provider, credentials) {
    console.log(`ApiManager: Saving config for ${provider}`, credentials);
    if (!provider || typeof credentials !== 'object') {
        console.error('ApiManager: Invalid arguments for saveProviderConfig.');
        return false;
    }

    const config = vscode.workspace.getConfiguration('voice-to-text');
    try {
      // 1. Update the selected provider setting
      await config.update('apiProvider', provider, vscode.ConfigurationTarget.Global);
      this.currentProvider = provider; // Update internal state immediately

      // 2. Update provider-specific credentials under its own key
      await config.update(provider, credentials, vscode.ConfigurationTarget.Global);

      // 3. **REMOVED**: Don't immediately update instances here. Rely on onDidChangeConfiguration or explicit reload.
      // this.updateConfiguration(); // Reload config into instances

      console.log(`ApiManager: Configuration saved successfully for ${provider}. VS Code workspace config updated.`);
      return true; // Indicate success

    } catch (error) {
      console.error(`ApiManager: Failed to save configuration for ${provider}:`, error);
      vscode.window.showErrorMessage(`保存 ${provider} 配置失败: ${error.message}`);
      return false; // Indicate failure
    }
  }
  
  /**
   * 获取当前使用的API实例
   * @returns {Object | null} API实例 或 null
   */
  getCurrentApi() {
    if (!this.apiInstances[this.currentProvider]) {
      console.warn(`Current provider '${this.currentProvider}' not found in apiInstances. Attempting to reload config.`);
      this.updateConfiguration();
      if (!this.apiInstances[this.currentProvider]) {
        console.error(`Failed to get current API instance for provider: ${this.currentProvider}`);
        vscode.window.showErrorMessage(`无法加载API服务: ${this.getProviderName()}. 请检查配置或重启。`);
        return null;
      }
    }
    return this.apiInstances[this.currentProvider];
  }
  
  /**
   * 获取指定API提供商的配置信息
   * @param {string} [provider] 提供商标识 (可选, 默认为当前选择的 provider)
   * @returns {Object | null} API配置对象 或 null
   */
  getApiConfig(provider) {
    const targetProvider = provider || this.currentProvider;
    
    if (!this.apiInstances[targetProvider]) {
      console.warn(`Provider '${targetProvider}' not found when getting config.`);
      return null;
    }
    
    const config = vscode.workspace.getConfiguration('voice-to-text');
    const providerConfig = config.get(targetProvider, {});
    const isValid = this.apiInstances[targetProvider]?.isConfigValid() ?? false;
    
    return {
        provider: targetProvider,
        ...providerConfig,
        isValid
    };
  }
  
  /**
   * 获取所有可用API提供商
   * @returns {Array<{id: string, name: string}>} 提供商列表
   */
  getAvailableProviders() {
    return [
      { id: 'baidu', name: '百度短语音识别极速版' },
      { id: 'xunfei-mandarin', name: '讯飞星火语音识别大模型中文版' },
      { id: 'xunfei-dialect', name: '讯飞星火语音识别大模型方言版' },
      { id: 'aliyun', name: '阿里云实时语音识别' },
      { id: 'tencent', name: '腾讯云一句话识别' }
    ];
  }
  
  /**
   * 获取当前提供商名称 (用于显示)
   * @returns {string} 提供商名称
   */
  getProviderName() {
    const providerInfo = this.getAvailableProviders().find(p => p.id === this.currentProvider);
    return providerInfo ? providerInfo.name : this.currentProvider;
  }
  
  /**
   * 调用当前选择的API进行语音识别
   * @param {Buffer} audioData 音频数据 (应为API期望的格式, 如PCM)
   * @returns {Promise<string>} 识别结果文本
   */
  async recognizeSpeech(audioData) {
    const api = this.getCurrentApi();
    const providerName = this.getProviderName();

    if (!api) {
      vscode.window.showErrorMessage(`当前API提供商 (${providerName}) 未正确加载或配置。请检查设置。`);
      throw new Error(`API provider ${this.currentProvider} not loaded.`);
    }

    if (!api.isConfigValid()) {
      vscode.window.showWarningMessage(`${providerName} 配置无效或不完整，请在侧边栏检查并保存API密钥。`);
      try {
        await vscode.commands.executeCommand('workbench.view.extension.voice-to-text-view');
        setTimeout(() => {
             vscode.commands.executeCommand('voice-to-text-config.focus');
         }, 100);
      } catch (e) {
        console.error('Attempting to focus config view failed:', e);
      }
      throw new Error(`${providerName} configuration is invalid. Please complete the API configuration.`);
    }

    try {
      console.log(`Using API: ${providerName} for recognition.`);
      if (!Buffer.isBuffer(audioData) || audioData.length === 0) {
          throw new Error("Invalid audio data provided for recognition.");
      }
      return await api.recognize(audioData);
    } catch (error) {
      console.error(`Error during speech recognition with ${providerName}:`, error);
      const errorMessage = error.message || 'Unknown error';
      vscode.window.showErrorMessage(`语音识别失败 (${providerName}): ${errorMessage}`);
      throw error;
    }
  }
}

module.exports = ApiManager; 