const WebSocket = require('ws'); // 引入ws库
const crypto = require('crypto');

/**
 * 讯飞语音识别方言大模型 API
 */
class XunfeiDialectApi {
  constructor() {
    this.appId = '';
    this.apiKey = '';
    this.secretKey = '';
    this.host = 'iat.cn-huabei-1.xf-yun.com'; // 方言大模型主机 (根据文档)
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
    console.log('Dialect Signature Origin:\n', signatureOrigin); // Debug

    // 2. HMAC-SHA256 签名
    const signatureSha = crypto.createHmac('sha256', this.secretKey)
                               .update(signatureOrigin)
                               .digest();

    // 3. Base64 编码签名摘要
    const signature = signatureSha.toString('base64');
    console.log('Dialect Signature (Base64):', signature); // Debug

    // 4. 构建 authorization_origin
    const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    console.log('Dialect Authorization Origin:', authorizationOrigin); // Debug

    // 5. Base64 编码 authorization_origin (根据文档要求)
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    console.log('Dialect Authorization (Base64):', authorization); // Debug

    // 6. 对 date 和 host 参数值进行 URL 编码
    const encodedDate = encodeURIComponent(date);
    const encodedHost = encodeURIComponent(this.host); // 虽然 host 通常不需要编码，但保持一致

    // 7. 拼接最终URL (authorization 参数本身不需 URL 编码)
    const url = `wss://${this.host}${this.path}?authorization=${authorization}&date=${encodedDate}&host=${encodedHost}`;
    // console.log('Dialect Final Auth URL:', url); // Don't log full URL with auth in prod
    console.log(`Dialect Final Auth URL: wss://${this.host}${this.path}?authorization=...&date=${encodedDate}&host=${encodedHost}`); // Log safely
    return url;
  }
  
  /**
   * 识别语音 (流式WebSocket)
   * @param {Buffer} audioData 音频数据，PCM格式
   * @param {function(string)} onIntermediateResult 中间结果回调
   * @returns {Promise<string>} 最终识别结果
   */
  async recognize(audioData, onIntermediateResult) {
    if (!this.isConfigValid()) {
      return Promise.reject(new Error('讯飞方言API配置无效，请在设置中配置appId、apiKey和secretKey'));
    }

    return new Promise((resolve, reject) => {
      let authUrl;
      try {
        authUrl = this.createAuthUrl();
      } catch (error) {
        console.error("Dialect: Failed to create auth URL:", error);
        return reject(new Error(`创建讯飞方言认证URL失败: ${error.message}`));
      }
      
      const ws = new WebSocket(authUrl);
      let finalResult = '';
      const resultBuffer = {}; // 用于存储中间结果片段

      ws.on('open', () => {
        console.log('Xunfei Dialect WebSocket connection opened.');
        // 发送第一帧：业务参数
        const firstFrame = {
          header: {
            app_id: this.appId,
            status: 0 // 标记首帧
          },
          parameter: {
            iat: {
              domain: "slm",      // 方言大模型识别领域
              language: "zh_cn", // 语言仍是中文
              accent: "mulacc",   // !!! 方言设置，必须为 mulacc !!!
              eos: 3000,         // 静默检测时间
              result: {
                encoding: "utf8",
                compress: "raw",
                format: "json"
              }
            }
          },
          payload: {
            audio: {
              encoding: "raw",
              sample_rate: 16000,
              channels: 1,
              bit_depth: 16,
              seq: 0, // 数据序号
              status: 0, // 帧状态，0开始
              // 注意：这里一次性发送了所有数据，对于长音频可能需要分片
              audio: audioData.toString('base64')
            }
          }
        };
        ws.send(JSON.stringify(firstFrame));
        console.log('Sent first dialect frame.');

        // 发送结束帧
        const lastFrame = {
            header: {
                app_id: this.appId,
                status: 2 // 标记尾帧
            },
            payload: { // 结束帧也需要payload结构
                audio: {
                    encoding: "raw",
                    sample_rate: 16000,
                    channels: 1,
                    bit_depth: 16,
                    seq: 1, // 结束帧序号，需要递增
                    status: 2, // 帧状态，2结束
                    audio: "" // 结束帧无音频数据
                }
            }
        };
        // 稍微延迟发送结束帧，确保第一帧已被处理
        setTimeout(() => {
            ws.send(JSON.stringify(lastFrame));
            console.log('Sent last dialect frame.');
        }, 100); // 延迟100ms
      });

      ws.on('message', (data) => {
        // console.log('Dialect Received message:', data.toString()); // Debug
        const res = JSON.parse(data.toString());

        if (res.header.code !== 0) {
          console.error(`Dialect ASR Error: ${res.header.code} - ${res.header.message}`);
          reject(new Error(`讯飞方言识别错误: ${res.header.message || res.header.code}`));
          ws.close();
          return;
        }

        // 处理识别结果
        if (res.payload && res.payload.result && res.payload.result.text) {
            const decodedText = Buffer.from(res.payload.result.text, 'base64').toString('utf8');
            // console.log('Dialect Decoded text:', decodedText); // Debug
            try {
                const resultJson = JSON.parse(decodedText);
                let currentSentence = '';
                if (resultJson.ws) {
                    resultJson.ws.forEach(item => {
                        if (item.cw) {
                            item.cw.forEach(word => {
                                currentSentence += word.w;
                            });
                        }
                    });
                }
                // 使用 sn 序列号来管理和拼接结果
                resultBuffer[resultJson.sn] = currentSentence;

                // 根据 pgs 决定是替换还是追加 (rpl 替换, apd 追加 - 但文档似乎只有rpl?)
                // 如果是 rpl，需要清除旧的结果片段
                if (resultJson.pgs === 'rpl' && resultJson.rg) {
                    for (let i = resultJson.rg[0]; i <= resultJson.rg[1]; i++) {
                        if (i < resultJson.sn) {
                            delete resultBuffer[i];
                        }
                    }
                }

                // 拼接当前所有片段作为中间结果
                let intermediateResult = Object.keys(resultBuffer).sort((a, b) => a - b).map(key => resultBuffer[key]).join('');

                // 调用中间结果回调
                if (typeof onIntermediateResult === 'function') {
                    onIntermediateResult(intermediateResult);
                }

                // 如果是最终结果 (ls=true)，也更新 finalResult
                if (resultJson.ls) {
                   finalResult = intermediateResult;
                }

            } catch (e) {
                 console.error("Dialect: Error parsing result text JSON:", e, " Raw text:", decodedText);
                 // 发生错误时，可以考虑将原始解码文本追加给 finalResult 或 reject
                 finalResult += decodedText; // 简单处理
            }
        }

        // 服务端确认结束
        if (res.header.status === 2) {
          console.log('Dialect Recognition finished by server. Final result:', finalResult);
          // 确保即使最后一个消息没有 ls=true，也能拿到结果
           if (!finalResult) {
               finalResult = Object.keys(resultBuffer).sort((a, b) => a - b).map(key => resultBuffer[key]).join('');
           }
          resolve(finalResult);
          ws.close();
        }
      });

      ws.on('error', (err) => {
        console.error('Dialect WebSocket error:', err);
        // 增加对 401 错误的特定处理
        if (err.message && err.message.includes('401')) {
            reject(new Error(`方言 WebSocket连接认证失败 (401): 请检查 APIKey, APISecret 是否正确, 以及系统时间是否同步。`));
        } else {
            reject(new Error(`方言 WebSocket连接错误: ${err.message}`));
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`Dialect WebSocket connection closed: ${code} - ${reason.toString()}`);
         // 如果 WebSocket 在 resolve 之前关闭，检查是否已有结果
         if (ws.readyState === WebSocket.CLOSED && finalResult) {
             resolve(finalResult);
         } else if (ws.readyState === WebSocket.CLOSED && !finalResult && code !== 1000) {
            // 非正常关闭且无结果
            reject(new Error(`方言 WebSocket连接意外关闭: ${code} - ${reason.toString()}`));
         } else if (ws.readyState === WebSocket.CLOSED && !finalResult && code === 1000) {
            // 正常关闭但无结果
            resolve(''); // 返回空字符串
         }
      });
    });
  }
}

module.exports = XunfeiDialectApi; 