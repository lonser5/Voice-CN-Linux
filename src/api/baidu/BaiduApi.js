const AipSpeechClient = require('baidu-aip-sdk').speech;
const axios = require('axios');

/**
 * 百度语音识别API接口
 */
class BaiduApi {
  constructor() {
    this.appId = '';
    this.apiKey = '';
    this.secretKey = '';
    this.client = null;
    this.tokenExpireTime = 0; // token过期时间
    this.token = ''; // 访问令牌
  }
  
  /**
   * 设置配置信息
   * @param {string} appId 应用ID
   * @param {string} apiKey API密钥
   * @param {string} secretKey Secret密钥
   */
  setConfig(appId, apiKey, secretKey) {
    this.appId = appId;
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    
    // 极速版不直接使用client实例，但为了兼容保留这个设置
    if (this.appId && this.apiKey && this.secretKey) {
      this.client = new AipSpeechClient(this.appId, this.apiKey, this.secretKey);
    } else {
      this.client = null;
    }
    
    // 重置token，确保使用新的密钥获取token
    this.token = '';
    this.tokenExpireTime = 0;
  }
  
  /**
   * 检查配置是否有效
   * @returns {boolean} 配置是否有效
   */
  isConfigValid() {
    return !!(this.appId && this.apiKey && this.secretKey);
  }
  
  /**
   * 识别语音
   * @param {Buffer} audioData 音频数据，PCM格式
   * @returns {Promise<string>} 识别结果
   */
  async recognize(audioData) {
    if (!this.isConfigValid()) {
      throw new Error('百度语音API配置无效，请在设置中配置appId、apiKey和secretKey');
    }
    
    try {
      console.log('使用百度语音识别极速版API...');
      console.log(`音频数据大小: ${audioData.length} 字节`);
      
      // 确保token有效
      await this.ensureTokenValid();
      
      // 使用极速版API
      const url = 'https://vop.baidu.com/pro_api';
      
      // 生成唯一的cuid（区分不同请求）
      const cuid = `voice_to_text_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      console.log(`使用cuid: ${cuid}`);
      
      // 准备请求数据
      const requestData = {
        format: 'pcm',
        rate: 16000,  // 确保16k采样率
        channel: 1,
        cuid: cuid,
        token: this.token,
        dev_pid: 80001, // 极速版输入法模型
        speech: audioData.toString('base64'),
        len: audioData.length // 原始音频数据长度
      };
      
      console.log('发送请求到百度极速版语音识别API...');
      console.log(`使用token: ${this.token.substring(0, 10)}...`);
      
      // 发送请求
      const response = await axios.post(url, requestData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10秒超时
      });
      
      console.log('百度语音识别返回:', response.data);
      
      if (response.data && response.data.err_no === 0 && response.data.result && response.data.result.length > 0) {
        return response.data.result[0];
      } else {
        // 如果是3302错误，可能是token问题，尝试重新获取
        if (response.data && response.data.err_no === 3302) {
          console.log('检测到3302错误，可能是token问题，尝试重新获取token...');
          this.token = '';
          this.tokenExpireTime = 0;
          await this.ensureTokenValid();
          throw new Error(`识别失败(需重试): ${response.data.err_no}: ${response.data.err_msg || '未知错误'}`);
        }
        
        throw new Error(`识别失败: ${response.data.err_no}: ${response.data.err_msg || '未知错误'}`);
      }
    } catch (error) {
      console.error('百度语音识别出错:', error);
      if (error.response) {
        console.error('错误响应:', error.response.data);
      }
      throw error;
    }
  }
  
  /**
   * 确保token有效
   * @returns {Promise<void>}
   */
  async ensureTokenValid() {
    // 检查token是否过期
    const now = Date.now();
    if (!this.token || now >= this.tokenExpireTime) {
      console.log('正在获取百度API Token...');
      try {
        // 根据官方文档获取token
        const url = `https://aip.baidubce.com/oauth/2.0/token`;
        
        // 使用post请求, 明确指定参数（根据百度官方文档）
        const response = await axios.post(url, null, {
          params: {
            grant_type: 'client_credentials',
            client_id: this.apiKey,
            client_secret: this.secretKey
          },
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        console.log('Token响应:', response.data);
        
        if (response.data && response.data.access_token) {
          this.token = response.data.access_token;
          // token有效期从响应中获取，通常为30天，单位是秒
          const expiresIn = response.data.expires_in || (30 * 24 * 60 * 60); // 默认30天
          this.tokenExpireTime = now + (expiresIn - 60) * 1000; // 提前1分钟过期
          console.log(`成功获取新的百度API Token: ${this.token.substring(0, 10)}...`);
          console.log(`Token有效期至: ${new Date(this.tokenExpireTime).toLocaleString()}`);
        } else {
          throw new Error('获取token失败: ' + JSON.stringify(response.data));
        }
      } catch (error) {
        console.error('获取百度API Token失败:', error);
        throw new Error('获取百度API授权失败: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
      }
    } else {
      console.log(`使用缓存的token: ${this.token.substring(0, 10)}...`);
    }
  }
}

module.exports = BaiduApi; 