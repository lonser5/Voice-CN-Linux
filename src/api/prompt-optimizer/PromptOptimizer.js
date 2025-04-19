const vscode = require('vscode');
const axios = require('axios');

/**
 * 提示词优化服务
 * 使用DeepSeek API对语音识别结果进行优化
 */
class PromptOptimizer {
  constructor() {
    // 初始化配置
    this.updateConfig();
    
    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration(this.updateConfig.bind(this));
  }
  
  /**
   * 更新配置
   */
  updateConfig() {
    const config = vscode.workspace.getConfiguration('voice-to-text');
    this.enabled = config.get('promptOptimization.enabled', false);
    this.deepseekApiKey = config.get('promptOptimization.deepseekApiKey', '');
  }
  
  /**
   * 检查配置是否有效
   */
  isConfigValid() {
    return this.enabled && this.deepseekApiKey;
  }
  
  /**
   * 优化提示词
   * @param {string} text 原始语音识别文本
   * @returns {Promise<string>} 优化后的提示词
   */
  async optimizePrompt(text) {
    if (!this.isConfigValid()) {
      console.log('[PromptOptimizer] 提示词优化未启用或配置无效');
      return text;
    }
    
    if (!text || text.trim().length === 0) {
      console.log('[PromptOptimizer] 输入文本为空，无需优化');
      return text;
    }
    
    try {
      console.log('[PromptOptimizer] 开始优化提示词...');
      
      // 调用DeepSeek API优化提示词
      const optimizedText = await this.callDeepSeekAPI(text);
      
      console.log('[PromptOptimizer] 提示词优化完成');
      return optimizedText;
    } catch (error) {
      console.error('[PromptOptimizer] 提示词优化失败:', error);
      // 出错时返回原始文本
      return text;
    }
  }
  
  /**
   * 调用DeepSeek API
   * @param {string} text 原始文本
   * @returns {Promise<string>} 优化后的文本
   */
  async callDeepSeekAPI(text) {
    try {
      // DeepSeek API 端点
      const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
      
      // 构建请求体
      const requestBody = {
        model: 'deepseek-chat',  // 使用DeepSeek V3模型
        messages: [
          {
            role: 'system',
            content: '用户正在编程，使用AI编程工具，你是一个提示词优化专家，你的任务是将用户的口语表达转换为准确、简洁、专业的提示词。保留原始内容的核心意图，但使其更加结构化和专业。请直接返回优化后的提示词，无需解释。'
          },
          {
            role: 'user',
            content: `请将以下语音识别结果优化为专业的提示词，保持简洁，不要添加不必要的内容：\n\n${text}`
          }
        ],
        temperature: 0.3, // 低温度以获得更一致的结果
        max_tokens: 1024,
        stream: false     // 非流式输出
      };
      
      // 发送请求
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.deepseekApiKey}`
        },
        timeout: 10000 // 10秒超时
      });
      
      // 处理响应
      if (response.data && 
          response.data.choices && 
          response.data.choices.length > 0 &&
          response.data.choices[0].message &&
          response.data.choices[0].message.content) {
        
        // 返回优化后的文本
        return response.data.choices[0].message.content.trim();
      } else {
        console.error('[PromptOptimizer] 无效的API响应:', response.data);
        throw new Error('无效的API响应');
      }
    } catch (error) {
      console.error('[PromptOptimizer] API调用失败:', error);
      if (error.response) {
        console.error('错误详情:', error.response.data);
      }
      throw error;
    }
  }
}

module.exports = PromptOptimizer; 