const vscode = require('vscode');
const fs = require('fs');
const naudiodon = require('naudiodon');
const PromptOptimizer = require('../../api/prompt-optimizer/PromptOptimizer');

/**
 * 录音管理器
 * 处理录音相关的逻辑
 */
class RecordManager {
  /**
   * 构造函数
   * @param {Object} apiManager API管理器
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.isRecording = false;
    this.audioData = [];
    this.recordingTimeout = null;
    this.lastAudioTime = Date.now();
    this.silenceTimeout = null;
    this.recordingCallback = null;
    this.promptOptimizer = new PromptOptimizer();
    this.audioIOInstance = null;
  }
  
  /**
   * 开始录音
   * @param {Function} callback 录音结果回调
   */
  startRecording(callback) {
    // 如果已经在录音，则不做任何操作
    if (this.isRecording) {
      return;
    }
    
    this.recordingCallback = callback;
    
    try {
      console.log('开始录音...');
      this.isRecording = true;
      this.audioData = [];
      this.lastAudioTime = Date.now();
      
      // 通知录音已开始
      if (this.recordingCallback) {
        this.recordingCallback('status', {
          command: 'recordingStarted'
        });
      }
      
      // 设置最大录音时间（60秒）
      this.recordingTimeout = setTimeout(() => {
        console.log('达到最大录音时间，自动停止');
        if (this.recordingCallback) {
          this.recordingCallback('status', {
            command: 'autoStopRecording'
          });
        }
        this.stopRecording();
      }, 60000);
      
      // 设置检查音频活动的定时器 - 5秒无声自动停止
      this.silenceTimeout = setInterval(() => {
        const now = Date.now();
        // 如果超过5秒没有有效音频数据
        if (now - this.lastAudioTime > 5000) {
          console.log('5秒内无有效音频，自动停止录音');
          clearInterval(this.silenceTimeout);
          this.silenceTimeout = null;
          if (this.recordingCallback) {
            this.recordingCallback('status', {
              command: 'autoStopRecording'
            });
          }
          this.stopRecording();
        }
      }, 1000);
      
      // --- 使用 naudiodon 启动录音 --- 
      console.log('使用 naudiodon 启动录音');

      // 获取默认输入设备ID (通常是 -1)
      const devices = naudiodon.getDevices();
      // 你可以打印设备列表以供调试: console.log(devices);
      const defaultInputDevice = devices.find(device => device.maxInputChannels > 0 && device.isDefaultInput);
      const deviceId = defaultInputDevice ? defaultInputDevice.id : -1; // 使用默认输入设备
      console.log(`使用的录音设备 ID: ${deviceId}`);

      // 创建 AudioIO 实例
      this.audioIOInstance = new naudiodon.AudioIO({
        inOptions: {
          deviceId: deviceId,       // 使用默认输入设备
          sampleRate: 16000,        // 16kHz 采样率
          channelCount: 1,          // 单声道
          sampleFormat: naudiodon.SampleFormat16Bit, // 16位 PCM
          closeOnError: true      // 发生错误时自动关闭流
        }
      });

      // 监听音频数据
      this.audioIOInstance.on('data', (data) => {
        this.audioData.push(data);
        if (this.hasSound(data)) { // 复用现有的声音检测逻辑
          this.lastAudioTime = Date.now();
        }
      });

      // 监听错误
      this.audioIOInstance.on('error', (err) => {
        console.error('naudiodon 录音错误:', err);
        if (this.recordingCallback) {
          this.recordingCallback('error', {
            command: 'recordingError',
            error: err.message || '录音出错'
          });
        }
        this.stopRecordingInternal(true); // 内部停止，避免重复处理数据
      });
      
      // 开始录音
      this.audioIOInstance.start();
      // ----------------------------------------
      
      return true;
    } catch (error) {
      console.error('启动录音失败:', error);
      this.isRecording = false;
      if (this.recordingCallback) {
        this.recordingCallback('error', {
          command: 'recordingError',
          error: error.message || '启动录音失败'
        });
      }
      return false;
    }
  }
  
  /**
   * 停止录音
   */
  stopRecording() {
    // 如果没有在录音，则不做任何操作
    if (!this.isRecording) {
      return;
    }
    
    try {
      console.log('停止录音...');
      
      // --- 使用 naudiodon 停止录音 --- 
      console.log('使用 naudiodon 停止录音');
      if (this.audioIOInstance) {
        this.audioIOInstance.quit(); // 使用 quit() 来停止并清理资源
        this.audioIOInstance = null;
      }
      // ----------------------------------------
      
      // 通知录音已停止
      if (this.recordingCallback) {
        this.recordingCallback('status', {
          command: 'recordingStopped'
        });
      }
      
      // 处理录音数据
      this.processRecordingData();
      
    } catch (error) {
      console.error('停止录音失败:', error);
      if (this.recordingCallback) {
        this.recordingCallback('error', {
          command: 'recordingError',
          error: error.message || '停止录音失败'
        });
      }
    } finally {
      this.isRecording = false;
    }
  }
  
  /**
   * 检测音频数据中是否有声音
   * @param {Buffer} audioData 音频数据
   * @returns {boolean} 是否有声音
   */
  hasSound(audioData) {
    // PCM数据是16位有符号整数，小端序
    // 计算平均音量和峰值音量，判断是否有声音
    let volume = 0;
    let peakVolume = 0;
    let silenceCount = 0;
    const samples = audioData.length / 2; // 16位 = 2字节
    
    if (samples === 0) return false;
    
    for (let i = 0; i < audioData.length; i += 2) {
      // 将两个字节组合成一个16位整数（小端序）
      const sample = Math.abs(audioData.readInt16LE(i));
      volume += sample;
      
      // 记录峰值音量
      if (sample > peakVolume) {
        peakVolume = sample;
      }
      
      // 统计静音样本数量 (阈值可调整)
      if (sample < 200) {
        silenceCount++;
      }
    }
    
    // 计算平均音量和静音比例
    const avgVolume = volume / samples;
    const silenceRatio = silenceCount / samples;
    
    // 判断条件：
    // 1. 平均音量超过阈值
    // 2. 峰值音量超过较高阈值
    // 3. 静音比例低于一定值
    const avgThreshold = 500;   // 平均音量阈值
    const peakThreshold = 2000; // 峰值音量阈值
    const silenceThreshold = 0.8; // 静音比例阈值 (80%)
    
    return (
      avgVolume > avgThreshold ||
      (peakVolume > peakThreshold && silenceRatio < silenceThreshold)
    );
  }
  
  /**
   * 处理录音数据
   */
  async processRecordingData() {
    if (!this.audioData.length) {
      if (this.recordingCallback) {
        this.recordingCallback('error', {
          command: 'recognitionError',
          error: '没有录到语音'
        });
      }
      return;
    }
    
    try {
      // 合并所有音频数据
      const audioBuffer = Buffer.concat(this.audioData);
      console.log('合并后的音频数据大小: ' + audioBuffer.length + ' 字节');
      
      // 统计声音活动情况
      let soundChunks = 0;
      let totalChunks = this.audioData.length;
      let totalVolume = 0;
      let peakVolume = 0;
      
      // 检查是否有声音（更严格的检测）
      for (let i = 0; i < this.audioData.length; i++) {
        // 分析当前块的音频数据
        const chunk = this.audioData[i];
        let chunkVolume = 0;
        let chunkPeak = 0;
        
        for (let j = 0; j < chunk.length; j += 2) {
          if (j + 1 < chunk.length) {
            const sample = Math.abs(chunk.readInt16LE(j));
            chunkVolume += sample;
            if (sample > chunkPeak) chunkPeak = sample;
          }
        }
        
        const avgChunkVolume = chunkVolume / (chunk.length / 2);
        totalVolume += avgChunkVolume;
        if (chunkPeak > peakVolume) peakVolume = chunkPeak;
        
        // 判断这个块是否有声音
        if (this.hasSound(chunk)) {
          soundChunks++;
        }
      }
      
      // 计算整体统计
      const avgTotalVolume = totalVolume / totalChunks;
      const soundRatio = soundChunks / totalChunks;
      
      console.log(`声音块数量: ${soundChunks}/${totalChunks}, 声音比例: ${(soundRatio * 100).toFixed(2)}%, 平均音量: ${avgTotalVolume.toFixed(2)}, 峰值: ${peakVolume}`);
      
      // 声音活动判断条件（至少10%的数据块有声音，或者整体平均音量超过阈值）
      const hasDetectedSound = soundRatio > 0.1 || avgTotalVolume > 800 || peakVolume > 5000;
      
      if (!hasDetectedSound) {
        console.log('未检测到有效声音 - 声音块比例过低或音量过低');
        if (this.recordingCallback) {
          this.recordingCallback('error', {
            command: 'recognitionError',
            error: '未检测到有效声音，请重试'
          });
        }
        return;
      }
      
      // 调用API识别语音
      const result = await this.apiManager.recognizeSpeech(audioBuffer);
      console.log('识别结果:', result);
      
      // 过滤掉API返回的"不知道"等填充语
      const filteredResult = this.filterInvalidResult(result);
      console.log('过滤后的结果:', filteredResult);
      
      // 检查是否启用了提示词优化
      const config = vscode.workspace.getConfiguration('voice-to-text');
      const promptOptimizationEnabled = config.get('promptOptimization.enabled', false);
      
      if (promptOptimizationEnabled && this.promptOptimizer.isConfigValid()) {
        try {
          // 通知WebView正在进行提示词优化
          if (this.recordingCallback) {
            this.recordingCallback('status', {
              command: 'optimizingPrompt'
            });
          }
          
          // 使用AI优化提示词
          const optimizedResult = await this.promptOptimizer.optimizePrompt(filteredResult);
          console.log('优化后的提示词:', optimizedResult);
          
          // 通知识别和优化完成
          if (this.recordingCallback) {
            this.recordingCallback('result', {
              command: 'recognitionComplete',
              result: optimizedResult,
              originalResult: filteredResult,
              isOptimized: true
            });
          }
        } catch (error) {
          console.error('提示词优化失败:', error);
          // 优化失败时使用过滤后的原始结果
          if (this.recordingCallback) {
            this.recordingCallback('result', {
              command: 'recognitionComplete',
              result: filteredResult,
              optimizationError: error.message
            });
          }
        }
      } else {
        // 未启用提示词优化，直接使用过滤后的结果
        if (this.recordingCallback) {
          this.recordingCallback('result', {
            command: 'recognitionComplete',
            result: filteredResult
          });
        }
      }
      
    } catch (error) {
      console.error('处理录音数据出错:', error);
      if (this.recordingCallback) {
        this.recordingCallback('error', {
          command: 'recognitionError',
          error: error.message || '识别出错'
        });
      }
    }
  }
  
  /**
   * 过滤无效结果
   * @param {string} result 识别结果
   * @returns {string} 过滤后的结果
   */
  filterInvalidResult(result) {
    if (!result) return '';
    
    // 定义要过滤的无效词组列表
    const invalidPhrases = [
      '我不知道',
      '我并没有说话',
      '我没说话',
      '不知道',
      '我不知道实际上',
      '我都没说话'
    ];
    
    // 替换无效词组
    let filteredResult = result;
    invalidPhrases.forEach(phrase => {
      // 使用正则表达式匹配词组，考虑词组前后可能有标点符号或空格
      const regex = new RegExp(`[，。,.\\s]?${phrase}[，。,.\\s]?`, 'g');
      filteredResult = filteredResult.replace(regex, '');
      
      // 特别处理句尾的无效词组
      const endRegex = new RegExp(`${phrase}$`, 'g');
      filteredResult = filteredResult.replace(endRegex, '');
    });
    
    // 清理可能留下的多余标点
    filteredResult = filteredResult.replace(/[，。,.]$/, ''); // 移除末尾的标点
    filteredResult = filteredResult.replace(/，{2,}/g, '，'); // 将多个逗号替换为一个
    filteredResult = filteredResult.replace(/。{2,}/g, '。'); // 将多个句号替换为一个
    
    // 如果过滤后内容为空，则返回原始内容
    if (!filteredResult.trim()) {
      return result;
    }
    
    return filteredResult;
  }

  /**
   * 内部停止录音逻辑 (避免重复停止和处理数据)
   * @param {boolean} skipProcessing 是否跳过数据处理 (例如，因错误停止时)
   */
  stopRecordingInternal(skipProcessing = false) {
    if (!this.isRecording) {
      return;
    }

    console.log('执行内部停止逻辑...');

    // 清除超时
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
    
    // 清除静音检测
    if (this.silenceTimeout) {
      clearInterval(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    
    // 停止 naudiodon (如果尚未停止)
    if (this.audioIOInstance) {
      try {
        this.audioIOInstance.quit();
      } catch (e) {
        console.warn('尝试停止 audioIOInstance 时出错 (可能已停止): ', e);
      }
      this.audioIOInstance = null;
    }

    // 标记录音结束
    this.isRecording = false;

    // 通知录音已停止 (如果不是由错误触发的停止)
    if (!skipProcessing && this.recordingCallback) {
      this.recordingCallback('status', {
        command: 'recordingStopped'
      });
    }

    // 处理录音数据 (如果不是因为错误而停止)
    if (!skipProcessing) {
      this.processRecordingData();
    }
  }
}

module.exports = RecordManager; 