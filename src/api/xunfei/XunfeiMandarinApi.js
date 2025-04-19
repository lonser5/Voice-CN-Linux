const WebSocket = require('ws'); // 引入ws库
const crypto = require('crypto');

/**
 * 讯飞语音识别大模型 API (中文版)
 */
class XunfeiMandarinApi {
  constructor() {
    this.appId = '';
    this.apiKey = '';
    this.secretKey = '';
    this.host = 'iat.xf-yun.com'; // 大模型中文语音主机 (根据文档)
    this.path = '/v1'; // 固定路径
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
  }
  
  /**
   * 检查配置是否有效
   * @returns {boolean} 配置是否有效
   */
  isConfigValid() {
    return !!(this.appId && this.apiKey && this.secretKey);
  }
  
  /**
   * 生成符合WebSocket鉴权的URL
   * @returns {string} 鉴权URL
   */
  createAuthUrl() {
    const date = new Date().toGMTString(); // RFC1123 格式的 GMT 时间
    const requestLine = 'GET /v1 HTTP/1.1'; // 固定请求行

    // 1. 构建 signature_origin (确保 host 不含协议前缀)
    const signatureOrigin = `host: ${this.host}\ndate: ${date}\n${requestLine}`;
    console.log('Mandarin Signature Origin:\n', signatureOrigin); // Debug

    // 2. HMAC-SHA256 签名
    const signatureSha = crypto.createHmac('sha256', this.secretKey)
                               .update(signatureOrigin)
                               .digest();

    // 3. Base64 编码签名摘要
    const signature = signatureSha.toString('base64');
    console.log('Mandarin Signature (Base64):', signature); // Debug

    // 4. 构建 authorization_origin
    const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    console.log('Mandarin Authorization Origin:', authorizationOrigin); // Debug

    // 5. Base64 编码 authorization_origin (根据文档要求)
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    console.log('Mandarin Authorization (Base64):', authorization); // Debug

    // 6. 对 date 和 host 参数值进行 URL 编码
    const encodedDate = encodeURIComponent(date);
    const encodedHost = encodeURIComponent(this.host);

    // 7. 拼接最终URL (authorization 参数本身不需 URL 编码)
    const url = `wss://${this.host}${this.path}?authorization=${authorization}&date=${encodedDate}&host=${encodedHost}`;
    // console.log('Mandarin Final Auth URL:', url); // Don't log full URL with auth in prod
    console.log(`Mandarin Final Auth URL: wss://${this.host}${this.path}?authorization=...&date=${encodedDate}&host=${encodedHost}`); // Log safely
    return url;
  }
  
  /**
   * 识别语音
   * @param {Buffer} audioData 音频数据，PCM格式
   * @returns {Promise<string>} 识别结果
   */
  async recognize(audioData) {
    if (!this.isConfigValid()) {
      return Promise.reject(new Error('讯飞普通话API配置无效，请在设置中配置appId、apiKey和secretKey'));
    }

    return new Promise((resolve, reject) => {
      let authUrl;
      try {
        authUrl = this.createAuthUrl();
      } catch (error) {
        console.error("Mandarin: Failed to create auth URL:", error);
        return reject(new Error(`创建讯飞普通话认证URL失败: ${error.message}`));
      }

      const ws = new WebSocket(authUrl);
      let finalResult = '';

      ws.on('open', () => {
        console.log('WebSocket connection opened.');
        // 发送第一帧：业务参数
        const firstFrame = {
          header: {
            app_id: this.appId,
            status: 0 // 标记首帧
          },
          parameter: {
            iat: {
              domain: "slm", // 大模型识别领域
              language: "zh_cn",
              accent: "mandarin", // 普通话
              eos: 3000, // 静默检测时间
              result: {
                encoding: "utf8",
                compress: "raw",
                format: "json"
              }
            }
          },
          payload: {
            audio: {
              encoding: "raw", // 使用原始PCM数据
              sample_rate: 16000,
              channels: 1,
              bit_depth: 16,
              seq: 0, // 数据序号
              status: 0, // 帧状态，0开始
              audio: audioData.toString('base64') // 整个音频数据作为第一帧的payload发送 (注意：文档建议分片，但对于短语音，一次发送可能更简单)
                                                  // 如果遇到问题，需要改成按文档分片发送
            }
          }
        };
        ws.send(JSON.stringify(firstFrame));
        console.log('Sent first frame.');

        // 发送结束帧 (因为我们将整个音频放在第一帧，所以直接发送结束帧)
        const lastFrame = {
            header: {
                app_id: this.appId,
                status: 2 // 标记尾帧
            },
            payload: {
                audio: {
                    encoding: "raw",
                    sample_rate: 16000,
                    channels: 1,
                    bit_depth: 16,
                    seq: 1, // 结束帧序号
                    status: 2, // 帧状态，2结束
                    audio: "" // 结束帧无音频数据
                }
            }
        };
        ws.send(JSON.stringify(lastFrame));
        console.log('Sent last frame.');
      });

      ws.on('message', (data) => {
        // console.log('Received message:', data.toString()); // Debug: 输出接收到的原始消息
        const res = JSON.parse(data.toString());

        // 检查是否有错误
        if (res.header.code !== 0) {
          console.error(`ASR Error: ${res.header.code} - ${res.header.message}`);
          reject(new Error(`讯飞识别错误: ${res.header.message || res.header.code}`));
          ws.close();
          return;
        }

        // 处理识别结果
        if (res.payload && res.payload.result && res.payload.result.text) {
            // 解码Base64结果
            const decodedText = Buffer.from(res.payload.result.text, 'base64').toString('utf8');
            // console.log('Decoded text:', decodedText); // Debug: 输出解码后的文本
            try {
                const resultJson = JSON.parse(decodedText);
                if (resultJson.ws) {
                    resultJson.ws.forEach(item => {
                        if (item.cw) {
                            item.cw.forEach(word => {
                                finalResult += word.w;
                            });
                        }
                    });
                }
            } catch (e) {
                 console.error("Error parsing result text JSON:", e, " Raw text:", decodedText);
                 // 尝试直接使用解码后的文本，如果JSON解析失败
                 finalResult += decodedText;
            }
        }


        // 如果是最后一帧的响应，解析最终结果
        if (res.header.status === 2) {
          console.log('Recognition finished. Final result:', finalResult);
          resolve(finalResult);
          ws.close();
        }
      });

      ws.on('error', (err) => {
        console.error('Mandarin WebSocket error:', err);
        // 增加对 401 错误的特定处理
        if (err.message && err.message.includes('401')) {
            reject(new Error(`普通话 WebSocket连接认证失败 (401): 请检查 APIKey, APISecret 是否正确, 以及系统时间是否同步。`));
        } else {
            reject(new Error(`普通话 WebSocket连接错误: ${err.message}`));
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`WebSocket connection closed: ${code} - ${reason}`);
        // 如果没有成功 resolve，则 reject
        if (finalResult === '' && code !== 1000) { // 1000 是正常关闭
             reject(new Error(`WebSocket连接意外关闭: ${code} - ${reason}`));
        } else if (!finalResult && code === 1000) {
            // 正常关闭但没结果，可能是静音或识别失败
             resolve(''); // 返回空字符串表示无识别结果
        }
      });
    });
  }
}

module.exports = XunfeiMandarinApi; 