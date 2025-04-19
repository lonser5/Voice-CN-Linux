const https = require('https');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Helper functions for V3 signature
function sha256Hmac(message, secret = '', encoding) {
    const hmac = crypto.createHmac('sha256', secret);
    return hmac.update(message).digest(encoding);
}

function getHash(message, encoding = 'hex') {
    const hash = crypto.createHash('sha256');
    return hash.update(message).digest(encoding);
}

function getDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const year = date.getUTCFullYear();
    const month = ('0' + (date.getUTCMonth() + 1)).slice(-2);
    const day = ('0' + date.getUTCDate()).slice(-2);
    return `${year}-${month}-${day}`;
}

class TencentProvider {
    constructor() {
        this.appId = ''; // AppId is not directly used in V3 auth header but needed for context
        this.secretId = '';
        this.secretKey = '';
        this.region = 'ap-guangzhou'; // Default region, consider making it configurable
        this.service = 'asr';
        this.host = 'asr.tencentcloudapi.com';
        this.action = 'SentenceRecognition';
        this.version = '2019-06-14'; // ASR API version
    }

    setConfig(appId, secretId, secretKey, region = 'ap-guangzhou') {
        console.log(`[TencentProvider V3] Setting config: AppId=${appId ? '***' : ''}, SecretId=${secretId ? '***' : ''}, SecretKey=${secretKey ? '***' : ''}, Region=${region}`);
        this.appId = appId; // Keep appId for potential future use or context
        this.secretId = secretId;
        this.secretKey = secretKey;
        this.region = region || 'ap-guangzhou'; // Allow overriding region
    }

    isConfigValid() {
        // AppId is not strictly needed for V3 auth itself, but good practice to have it configured
        const isValid = !!(this.secretId && this.secretKey && this.appId);
        console.log(`[TencentProvider V3] Config valid: ${isValid}`);
        return isValid;
    }

    /**
     * Generates the TC3-HMAC-SHA256 signature for Tencent Cloud API v3.
     * @param {object} requestPayload - The JSON payload object for the request body.
     * @param {number} timestamp - UNIX timestamp for the request.
     * @returns {string} The Authorization header value.
     */
    generateV3Signature(requestPayload, timestamp) {
        const httpRequestMethod = 'POST';
        const canonicalUri = '/';
        const canonicalQueryString = '';

        // Default headers, ensure content-type matches the actual request
        const contentType = 'application/json; charset=utf-8';
        const canonicalHeaders = `content-type:${contentType}\nhost:${this.host}\n`;
        const signedHeaders = 'content-type;host'; // Headers included in the signature calculation

        // Hash the request payload
        const payloadString = JSON.stringify(requestPayload);
        const hashedRequestPayload = getHash(payloadString);

        // Step 1: Create Canonical Request
        const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
        console.log(`[TencentProvider V3] Canonical Request:\n${canonicalRequest}`);

        // Step 2: Create String to Sign
        const algorithm = 'TC3-HMAC-SHA256';
        const date = getDate(timestamp);
        const credentialScope = `${date}/${this.service}/tc3_request`;
        const hashedCanonicalRequest = getHash(canonicalRequest);
        const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
        console.log(`[TencentProvider V3] String to Sign:\n${stringToSign}`);

        // Step 3: Calculate Signature
        const kDate = sha256Hmac(date, 'TC3' + this.secretKey);
        const kService = sha256Hmac(this.service, kDate);
        const kSigning = sha256Hmac('tc3_request', kService);
        const signature = sha256Hmac(stringToSign, kSigning, 'hex');
        console.log(`[TencentProvider V3] Calculated Signature: ${signature}`);

        // Step 4: Assemble Authorization Header
        const authorization = `${algorithm} Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        console.log(`[TencentProvider V3] Authorization Header: ${authorization}`);

        return authorization;
    }

    /**
     * Recognizes speech from a complete audio buffer using Tencent Cloud API v3 SentenceRecognition.
     * @param {Buffer} audioData The entire audio data buffer (PCM, 16kHz, 16bit, mono assumed)
     * @returns {Promise<string>} A promise that resolves with the final recognized text.
     */
    async recognize(audioData) {
        console.log('[TencentProvider V3] Starting recognize...');
        if (!this.isConfigValid()) {
            throw new Error('腾讯云 V3 配置无效或不完整 (需要 SecretId, SecretKey, AppId)');
        }
        if (!audioData || audioData.length === 0) {
            throw new Error('音频数据为空');
        }

        return new Promise((resolve, reject) => {
            const timestamp = Math.floor(Date.now() / 1000);
            const audioBase64 = audioData.toString('base64');
            const usrAudioKey = uuidv4(); // Unique key for this request

            // Request payload for SentenceRecognition
            const requestPayload = {
                // ProjectId: 0, // Often optional or default
                // SubServiceType: 2, // Can be omitted if using EngSerViceType directly
                EngSerViceType: '16k_zh', // Engine type: 16k Mandarin (adjust if needed)
                SourceType: 1, // 1 = Audio data in the request body
                VoiceFormat: 'pcm', // Assuming PCM input (matches previous implementation)
                UsrAudioKey: usrAudioKey,
                Data: audioBase64, // Base64 encoded audio data
                // DataLen: audioData.length // Usually calculated by the service if Data is provided
            };

            // Generate the V3 signature
            const authorizationHeader = this.generateV3Signature(requestPayload, timestamp);
            const payloadString = JSON.stringify(requestPayload);

            const options = {
                hostname: this.host,
                path: '/',
                method: 'POST',
                headers: {
                    'Authorization': authorizationHeader,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Host': this.host,
                    'X-TC-Action': this.action,
                    'X-TC-Version': this.version,
                    'X-TC-Timestamp': timestamp.toString(),
                    'X-TC-Region': this.region,
                    // 'X-TC-Language': 'zh-CN', // Optional: Specify language for response messages
                    'Content-Length': Buffer.byteLength(payloadString)
                }
            };

            console.log(`[TencentProvider V3] Sending POST request to https://${this.host}/`);

            const req = https.request(options, (res) => {
                let responseBody = '';
                res.setEncoding('utf8');

                res.on('data', (chunk) => {
                    responseBody += chunk;
                });

                res.on('end', () => {
                    console.log(`[TencentProvider V3] Received response status: ${res.statusCode}`);
                    console.log(`[TencentProvider V3] Received response body: ${responseBody}`);
                    try {
                        const responseData = JSON.parse(responseBody);
                        // Check for API-level errors first
                        if (responseData.Response && responseData.Response.Error) {
                            const error = responseData.Response.Error;
                            console.error(`[TencentProvider V3] API Error: Code=${error.Code}, Message=${error.Message}`);
                            reject(new Error(`腾讯云 API 错误: ${error.Message} (Code: ${error.Code}, RequestId: ${responseData.Response.RequestId})`));
                        } else if (responseData.Response && responseData.Response.Result !== undefined) {
                            // SentenceRecognition returns result directly in Response.Result
                            console.log(`[TencentProvider V3] Recognition successful. Result: "${responseData.Response.Result}"`);
                            resolve(responseData.Response.Result);
                        } else {
                             // Unexpected response structure
                            console.error('[TencentProvider V3] Unexpected response structure:', responseData);
                            reject(new Error(`腾讯云返回结果格式意外: ${JSON.stringify(responseData)}`));
                        }
                    } catch (parseError) {
                        console.error('[TencentProvider V3] Error parsing JSON response:', parseError);
                        console.error('[TencentProvider V3] Raw response body:', responseBody);
                        reject(new Error(`解析腾讯云响应失败: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('[TencentProvider V3] HTTPS request error:', error);
                reject(new Error(`腾讯云 V3 请求失败: ${error.message}`));
            });

            // Write the payload and end the request
            req.write(payloadString);
            req.end();
        });
    }

    // Removed WebSocket specific methods: recognizeSpeech, stopRecognition
}

module.exports = TencentProvider; 