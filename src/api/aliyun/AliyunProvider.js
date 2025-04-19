const vscode = require('vscode');
const crypto = require('crypto');
// const { SpeechTranscription } = require('alibabacloud-nls'); // Removed SDK
const RPCClient = require('@alicloud/pop-core').RPCClient;
const { Readable } = require('stream');
const WebSocket = require('ws'); // Added ws library

// Helper function for delays
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

// Helper to generate unique IDs
const generateUniqueId = () => crypto.randomBytes(16).toString('hex');

class AliyunProvider {
    constructor() {
        this.appKey = null;
        this.accessKeyId = null;
        this.accessKeySecret = null;
        this.token = null;
        this.tokenExpireTime = 0;
        this.tokenFetchingPromise = null;
        this.nlsClient = null;
    }

    /**
     * 设置阿里云API配置
     */
    setConfig(appKey, accessKeyId, accessKeySecret) {
        console.log('AliyunProvider: Setting config...');
        const changed = this.appKey !== appKey || this.accessKeyId !== accessKeyId || this.accessKeySecret !== accessKeySecret;
        this.appKey = appKey;
        this.accessKeyId = accessKeyId;
        this.accessKeySecret = accessKeySecret;

        if (changed) {
            console.log('AliyunProvider: Config changed, invalidating current token and client.');
            this.token = null;
            this.tokenExpireTime = 0;
            this.nlsClient = null; // Re-initialize client if keys change
        }
        console.log(`AliyunProvider: Config set - AppKey: ${this.appKey ? '***' : 'Not Set'}, AccessKeyId: ${this.accessKeyId ? '***' : 'Not Set'}, Secret: ${this.accessKeySecret ? '***' : 'Not Set'}`);
    }

    /**
     * 检查配置是否有效
     */
    isConfigValid() {
        return !!(this.appKey && this.accessKeyId && this.accessKeySecret);
    }

    /**
     * 初始化 POP Core 客户端 (用于获取 Token)
     * @private
     */
    _initializeNlsClient() {
        if (!this.nlsClient) {
            if (!this.accessKeyId || !this.accessKeySecret) {
                throw new Error("Aliyun AccessKey ID or Secret not configured.");
            }
            // Use Shanghai endpoint for token generation as specified in docs examples
            this.nlsClient = new RPCClient({
                accessKeyId: this.accessKeyId,
                accessKeySecret: this.accessKeySecret,
                endpoint: 'https://nls-meta.cn-shanghai.aliyuncs.com', // NLS Meta endpoint for Shanghai
                apiVersion: '2019-02-28' // API version for token service
            });
            console.log("AliyunProvider: NLS RPC Client Initialized.");
        }
    }

    /**
     * 获取有效的阿里云鉴权 Token
     * @private
     */
    async _getValidToken() {
        const now = Date.now() / 1000;
        // Refresh token if invalid or expires within 5 minutes (300 seconds)
        if (!this.token || this.tokenExpireTime <= now + 300) {
            console.log('AliyunProvider: Token invalid or expiring soon. Fetching new token...');
            // Prevent multiple concurrent fetches
            if (!this.tokenFetchingPromise) {
                this.tokenFetchingPromise = this._fetchNewToken().finally(() => {
                    this.tokenFetchingPromise = null; // Clear promise once done
                });
            }
            await this.tokenFetchingPromise; // Wait for the ongoing fetch
        } else {
            // console.log('AliyunProvider: Using existing valid token.');
        }

        if (!this.token) {
            throw new Error("Failed to obtain a valid Alibaba Cloud token.");
        }
        return this.token;
    }

    /**
     * 使用 @alicloud/pop-core 获取新的 Token
     * @private
     */
    async _fetchNewToken() {
        this._initializeNlsClient(); // Ensure client is ready
        console.log("AliyunProvider: Calling NLS Meta API to create token...");
        try {
            // Method name according to documentation is 'CreateToken'
            const response = await this.nlsClient.request('CreateToken');
            // console.log("Aliyun Token API Response:", response); // Debug log

            if (response && response.Token && response.Token.Id && response.Token.ExpireTime) {
                this.token = response.Token.Id;
                this.tokenExpireTime = response.Token.ExpireTime; // Unix timestamp (seconds)
                console.log(`AliyunProvider: Successfully fetched token, expires at ${new Date(this.tokenExpireTime * 1000).toISOString()}`);
            } else {
                console.error("AliyunProvider: Invalid token response format:", response);
                throw new Error('Invalid token response format from Alibaba Cloud.');
            }
        } catch (error) {
            console.error("AliyunProvider: Error fetching token:", error.code || error.name, error.message || error);
            // Provide more specific feedback based on common error codes
            if (error.code === 'InvalidAccessKeyId.NotFound' || error.code === 'SignatureDoesNotMatch') {
                throw new Error(`获取阿里云Token失败：无效的 AccessKey ID 或 Secret。请检查配置。 (Code: ${error.code})`);
            } else if (error.data?.Message?.includes('forbidden')) {
                throw new Error(`获取阿里云Token失败：权限不足。请检查RAM用户权限。 (Details: ${error.data.Message})`);
            }
            throw new Error(`获取阿里云Token失败: ${error.message || '请检查网络或阿里云账户状态。'}`);
        }
    }

    /**
     * 识别语音流 (使用 WebSocket 直接实现)
     * @param {Buffer} audioData - PCM 音频数据 (16kHz, 16bit, 单声道)
     * @returns {Promise<string>} 识别结果文本
     */
    async recognize(audioData) {
        if (!this.isConfigValid()) {
            throw new Error("阿里云 API 配置无效。请检查 AppKey、AccessKey ID 和 Secret。");
        }
        if (!Buffer.isBuffer(audioData) || audioData.length === 0) {
            throw new Error("提供给阿里云识别的音频数据无效。");
        }

        console.log(`AliyunProvider (WebSocket): Starting recognition. Audio size: ${audioData.length}`);
        let ws = null;
        let recognizedText = '';
        const taskId = generateUniqueId(); // Unique ID for the entire session

        return new Promise(async (resolve, reject) => {
            let connectionClosedUnexpectedly = true; // Assume unexpected close unless completed normally
            let transcriptionStarted = false; // Flag to track if we can send audio
            let audioStreamEnded = false; // Flag to track if all audio has been sent
            let promiseSettled = false; // Flag to track if promise is resolved/rejected

            try {
                console.log("AliyunProvider (WebSocket): Getting token...");
                const token = await this._getValidToken();
                console.log("AliyunProvider (WebSocket): Token obtained.");

                // Use Shanghai endpoint as specified in documentation examples
                const url = `wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1?token=${token}`;
                console.log(`AliyunProvider (WebSocket): Connecting to ${url.split('?')[0]}...`); // Don't log token

                ws = new WebSocket(url);

                ws.on('open', () => {
                    console.log('AliyunProvider (WebSocket): Connection opened. Sending StartTranscription command...');
                    const startCommand = {
                        header: {
                            message_id: generateUniqueId(),
                            task_id: taskId,
                            namespace: 'SpeechTranscriber',
                            name: 'StartTranscription',
                            appkey: this.appKey
                        },
                        payload: {
                            format: 'PCM', // Assuming PCM input
                            sample_rate: 16000, // Assuming 16kHz
                            enable_intermediate_result: false, // Default
                            enable_punctuation_prediction: true, // Enable punctuation
                            enable_inverse_text_normalization: true // Enable number conversion
                            // Add other parameters from docs if needed
                        }
                    };
                    ws.send(JSON.stringify(startCommand));
                });

                ws.on('message', (data) => {
                    // console.log('AliyunProvider (WebSocket): Received message:', data.toString()); // Verbose
                    try {
                        const message = JSON.parse(data.toString());
                        const header = message.header;
                        const payload = message.payload;

                        if (header && header.name) {
                            switch (header.name) {
                                case 'TranscriptionStarted':
                                    console.log(`AliyunProvider (WebSocket): Event: TranscriptionStarted (Task ID: ${header.task_id})`);
                                    if (header.status === 20000000) {
                                        transcriptionStarted = true;
                                        // Start sending audio now
                                        sendAudioChunks();
                                    } else {
                                        console.error('AliyunProvider (WebSocket): Transcription start failed:', header.status_message);
                                        reject(new Error(`阿里云启动转写失败: ${header.status_message}`));
                                        ws.close();
                                    }
                                    break;
                                case 'TranscriptionResultChanged':
                                    // Intermediate results (if enabled)
                                    // console.log(`AliyunProvider (WebSocket): Event: TranscriptionResultChanged - '${payload?.result}'`);
                                    break;
                                case 'SentenceBegin':
                                    // console.log(`AliyunProvider (WebSocket): Event: SentenceBegin (Index: ${payload?.index})`);
                                    break;
                                case 'SentenceEnd':
                                    // Final result for a sentence
                                    if (payload && payload.result) {
                                        console.log(`AliyunProvider (WebSocket): Event: SentenceEnd - '${payload.result}'`);
                                        recognizedText += (recognizedText ? ' ' : '') + payload.result;
                                    }
                                    break;
                                case 'TranscriptionCompleted':
                                    if (promiseSettled) break; // Ignore if already settled
                                    console.log(`AliyunProvider (WebSocket): Event: TranscriptionCompleted (Task ID: ${header.task_id})`);
                                    connectionClosedUnexpectedly = false; // Mark as normal completion
                                    promiseSettled = true; // Mark promise as settled
                                    resolve(recognizedText.trim());
                                    // No need to close here, server closes after this event typically
                                    break;
                                case 'TaskFailed':
                                    if (promiseSettled) {
                                        console.warn('AliyunProvider (WebSocket): Event: TaskFailed received after promise already settled. Ignoring rejection.', header.status_message, payload);
                                        break; // Ignore if already settled
                                    }
                                    console.error('AliyunProvider (WebSocket): Event: TaskFailed - ', header.status_message, payload);
                                    connectionClosedUnexpectedly = false; // It failed, but wasn't an *unexpected* close
                                    promiseSettled = true; // Mark promise as settled
                                    reject(new Error(`阿里云任务失败: ${header.status_message || '未知错误 (TaskFailed received)'}`)); // Handle undefined status_message
                                    if (ws) ws.close(); // Close from client side on task failure
                                    break;
                                default:
                                    console.warn('AliyunProvider (WebSocket): Received unknown message name:', header.name);
                            }
                        } else {
                            console.warn('AliyunProvider (WebSocket): Received message without header or name:', message);
                        }
                    } catch (e) {
                        console.error('AliyunProvider (WebSocket): Error parsing message:', e, data.toString());
                        reject(new Error('无法解析来自阿里云的响应。'));
                        ws.close();
                    }
                });

                ws.on('error', (error) => {
                    if (promiseSettled) return; // Ignore if already settled
                    console.error('AliyunProvider (WebSocket): Connection error:', error);
                    connectionClosedUnexpectedly = false; // Error is not an unexpected *close* event
                    promiseSettled = true; // Mark promise as settled
                    reject(new Error(`阿里云 WebSocket 连接错误: ${error.message}`));
                });

                ws.on('close', (code, reason) => {
                    if (promiseSettled) return; // Ignore if already settled
                    const reasonStr = reason ? reason.toString() : 'No reason provided';
                    console.log(`AliyunProvider (WebSocket): Connection closed. Code: ${code}, Reason: ${reasonStr}`);
                    if (connectionClosedUnexpectedly) {
                        // Reject only if the close was not due to normal completion or a reported task failure/error
                        promiseSettled = true; // Mark promise as settled
                        reject(new Error(`阿里云连接意外关闭。 Code: ${code}, Reason: ${reasonStr}`));
                    }
                    // Cleanup reference
                    ws = null;
                });

                // Function to send audio chunks
                const sendAudioChunks = async () => {
                    console.log('AliyunProvider (WebSocket): Starting to send audio chunks...');
                    const chunkSize = 3200; // Recommended chunk size from docs
                    let totalSent = 0;
                    let offset = 0;

                    // Manually slice and send chunks
                    while (offset < audioData.length) {
                        if (!ws || ws.readyState !== WebSocket.OPEN) {
                            console.warn('AliyunProvider (WebSocket): WebSocket not open while trying to send audio. Aborting.');
                            return; // Stop sending
                        }

                        const end = Math.min(offset + chunkSize, audioData.length);
                        const chunk = audioData.slice(offset, end);

                        // console.log(`Sending chunk size: ${chunk.length}, offset: ${offset}`); // Verbose
                        ws.send(chunk, { binary: true }); // Send as binary frame
                        totalSent += chunk.length;
                        offset += chunk.length; // Move offset to the next chunk

                        // Minimal yield to prevent blocking event loop, especially for large files
                        await sleep(10); // Small delay can sometimes help flow control
                    }

                    console.log(`AliyunProvider (WebSocket): Finished sending audio stream. Total bytes: ${totalSent}`);
                    audioStreamEnded = true;

                    // Send StopTranscription command after all audio is sent
                     if (ws && ws.readyState === WebSocket.OPEN) {
                         console.log('AliyunProvider (WebSocket): Sending StopTranscription command...');
                         const stopCommand = {
                             header: {
                                 message_id: generateUniqueId(),
                                 task_id: taskId, // Must use the same task_id
                                 namespace: 'SpeechTranscriber',
                                 name: 'StopTranscription',
                                 appkey: this.appKey
                             },
                             // Payload is empty for StopTranscription
                         };
                         ws.send(JSON.stringify(stopCommand));
                     } else {
                         console.warn('AliyunProvider (WebSocket): Cannot send StopTranscription, WebSocket is not open.');
                     }
                };

            } catch (error) {
                if (promiseSettled) return; // Ignore if already settled during setup
                console.error('AliyunProvider (WebSocket): Error setting up recognition:', error);
                promiseSettled = true; // Mark promise as settled
                reject(error); // Reject the main promise if setup fails (e.g., token fetch)
                if (ws) {
                    ws.close(); // Ensure WS is closed if setup fails after connection attempt
                }
            }
        });
    }
}

module.exports = AliyunProvider;
