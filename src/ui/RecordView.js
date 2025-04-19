const vscode = require('vscode');
const path = require('path');

// 引入重构后的模块
const RecordManager = require('./recorder/RecordManager');
const ChatInputHandler = require('./recorder/ChatInputHandler');
const TextInsertionManager = require('./recorder/TextInsertionManager');
const RecordViewTemplate = require('./recorder/RecordViewTemplate');

/**
 * 录音视图
 * 负责显示录音界面和协调各组件
 */
class RecordView {
  /**
   * 构造函数
   * @param {vscode.ExtensionContext} context 扩展上下文
   * @param {Object} apiManager API管理器
   */
  constructor(context, apiManager) {
    this.context = context;
    this.apiManager = apiManager;
    this.view = null;
    this.isRecording = false;
    this.shouldAutoRecord = false;
    this.autoCopyEnabled = false; // 新增：是否自动复制到剪贴板
    this.lastRecognizedText = ''; // 最后一次识别的文本
    
    // 创建子模块实例
    this.recordManager = new RecordManager(apiManager);
    this.chatInputHandler = new ChatInputHandler();
    this.textInsertionManager = new TextInsertionManager(
      null,
      this.chatInputHandler
    );
    
    // 监听配置变化
    this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('voice-to-text')) {
        console.log('[RecordView] 检测到相关配置更改，正在更新视图...');
        // 当配置更改时，也需要更新 ApiManager 内部状态
        this.apiManager.updateConfiguration(); 
        // 更新 RecordView 的显示
        this.updateView();
      }
    }));
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
      console.log('录音视图已准备就绪');
    } catch (error) {
      console.error('初始化录音视图失败:', error);
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
    
    // 获取当前API提供商名称
    const providerName = this.apiManager.getProviderName();
    const currentApi = this.apiManager.getCurrentApi();
    const isConfigValid = currentApi && currentApi.isConfigValid();
    
    // 使用模板生成HTML内容
    this.view.webview.html = RecordViewTemplate.getWebviewContent(
      providerName, 
      isConfigValid
    );
  }
  
  /**
   * 处理Webview发送的消息
   * @param {Object} message 消息对象
   */
  handleMessage(message) {
    switch (message.command) {
      case 'startRecording':
        this.startRecording();
        break;
      case 'stopRecording':
        this.stopRecording();
        break;
      case 'viewReady':
        this.handleViewReady();
        break;
      case 'enableAutoCopy':
        this.enableAutoCopy();
        break;
      case 'disableAutoCopy':
        this.disableAutoCopy();
        break;
      case 'copyToClipboard':
        this.copyToClipboard(message.text);
        break;
      case 'sendToChat':
        this.sendToChat(message.text);
        break;
      case 'showCopyButton':
        // 对于手动复制按钮，不需要做特殊处理，界面上已经有按钮
        // 但将文本暂存，以便后续复制
        this.lastRecognizedText = message.text;
        break;
      case 'clearResult':
        this.clearResult();
        break;
      case 'getRecordingStatus':
        // 返回当前录音状态
        if (this.view) {
          this.view.webview.postMessage({
            command: 'updateRecordingStatus',
            isRecording: this.isRecording
          });
          // 同时发送自动复制状态
          this.view.webview.postMessage({
            command: 'updateAutoCopyStatus',
            enabled: this.autoCopyEnabled
          });
        }
        break;
    }
  }
  
  /**
   * 处理模块发送的回调
   * @param {string} type 回调类型
   * @param {Object} data 回调数据
   */
  handleModuleCallback(type, data) {
    // 根据类型处理回调
    switch (type) {
      case 'status': // 状态更新
        // 同步isRecording状态
        if (data.command === 'recordingStarted') {
          this.isRecording = true;
          console.log('状态已更新: 正在录音');
        } else if (data.command === 'recordingStopped' || data.command === 'autoStopRecording') {
          this.isRecording = false;
          console.log('状态已更新: 停止录音');
        }
        
        // 如果有WebView，转发状态消息
        if (this.view) {
          this.view.webview.postMessage(data);
        }
        break;
        
      case 'error': // 错误信息
        // 错误时也要重置录音状态
        if (data.command === 'recordingError' || data.command === 'recognitionError') {
          this.isRecording = false;
          console.log('状态已更新(错误): 停止录音');
        }
        
        // 如果有WebView，转发错误信息
        if (this.view) {
          this.view.webview.postMessage(data);
        }
        break;
        
      case 'result': // 识别结果
        // 结果返回时录音已经停止
        this.isRecording = false;
        
        // 首先通知WebView
        if (this.view) {
          this.view.webview.postMessage(data);
        }
        
        // 如果启用了自动复制，复制结果到剪贴板
        if (this.autoCopyEnabled && data.result) {
          this.copyToClipboard(data.result);
        }
        
        // 不再自动插入文本到当前焦点位置，让用户自行粘贴
        break;
    }
  }
  
  /**
   * 开始录音
   */
  startRecording() {
    console.log('[RecordView] 尝试开始录音，当前状态:', this.isRecording ? '正在录音' : '未录音');
    
    // 如果已经在录音，则不做任何操作
    if (this.isRecording) {
      console.log('[RecordView] 已经在录音中，忽略开始录音请求');
      return;
    }
    
    // 先设置录音状态为true
    this.isRecording = true;
    
    // 启动录音，并传入回调函数
    const success = this.recordManager.startRecording((type, data) => {
      this.handleModuleCallback(type, data);
    });
    
    // 如果启动失败，恢复状态
    if (!success) {
      console.log('[RecordView] 启动录音失败，恢复状态');
      this.isRecording = false;
    } else {
      console.log('[RecordView] 录音已成功启动');
    }
  }
  
  /**
   * 停止录音
   */
  stopRecording() {
    console.log('[RecordView] 尝试停止录音，当前状态:', this.isRecording ? '正在录音' : '未录音');
    
    // 如果没有在录音，则不做任何操作
    if (!this.isRecording) {
      console.log('[RecordView] 当前没有录音，忽略停止录音请求');
      return;
    }
    
    // 先设置录音状态为false
    this.isRecording = false;
    
    // 停止录音
    this.recordManager.stopRecording();
    console.log('[RecordView] 停止录音命令已发送');
  }
  
  /**
   * 切换录音状态
   */
  toggleRecording() {
    console.log('RecordView.toggleRecording() - 当前状态:', this.isRecording ? '正在录音' : '未录音');
    
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }
  
  /**
   * 启用自动复制功能
   */
  enableAutoCopy() {
    console.log('[RecordView] 启用自动复制功能');
    this.autoCopyEnabled = true;
    
    // 存储设置
    vscode.workspace.getConfiguration('voice-to-text').update('autoCopy', true, true);
  }
  
  /**
   * 禁用自动复制功能
   */
  disableAutoCopy() {
    console.log('[RecordView] 禁用自动复制功能');
    this.autoCopyEnabled = false;
    
    // 存储设置
    vscode.workspace.getConfiguration('voice-to-text').update('autoCopy', false, true);
  }
  
  /**
   * 复制文本到剪贴板
   * @param {string} text 要复制的文本
   */
  async copyToClipboard(text) {
    if (!text) return;
    
    try {
      // 复制到剪贴板
      await vscode.env.clipboard.writeText(text);
      console.log('[RecordView] 已复制文本到剪贴板:', text);
      
      // 通知WebView复制成功
      if (this.view) {
        this.view.webview.postMessage({
          command: 'clipboardCopySuccess'
        });
      }
      
      // 显示通知
      vscode.window.showInformationMessage('已复制识别结果到剪贴板');
    } catch (error) {
      console.error('[RecordView] 复制到剪贴板失败:', error);
    }
  }
  
  /**
   * 发送文本到聊天窗口
   * @param {string} text 要发送的文本
   */
  async sendToChat(text) {
    if (!text) return;
    
    try {
      console.log('[RecordView] 尝试发送文本到聊天窗口:', text);
      
      // 1. 首先复制文本到剪贴板
      await vscode.env.clipboard.writeText(text);
      
      // 2. 尝试聚焦到聊天窗口
      // 使用Tab键导航到聊天输入框
      await this.focusChatInput();
      
      // 3. 模拟粘贴操作
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      
      // 4. 显示通知
      vscode.window.showInformationMessage('已发送识别结果到聊天窗口');
    } catch (error) {
      console.error('[RecordView] 发送到聊天窗口失败:', error);
      vscode.window.showErrorMessage('发送到聊天窗口失败: ' + error.message);
    }
  }
  
  /**
   * 尝试聚焦到聊天输入框
   * 使用多种策略来尝试聚焦到Cursor等编辑器的AI聊天输入框
   */
  async focusChatInput() {
    try {
      console.log('[RecordView] 尝试聚焦到聊天输入框');
      
      // 策略1: 尝试常规的编辑器导航命令
      await this.tryFocusWithStandardCommands();
      
      // 策略2: 尝试针对Cursor的特定操作
      await this.tryFocusCursorChat();
      
      // 给UI一些反应时间
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('[RecordView] 已尝试聚焦到聊天输入框');
    } catch (error) {
      console.error('[RecordView] 聚焦到聊天输入框失败:', error);
      throw new Error('无法聚焦到聊天输入框');
    }
  }
  
  /**
   * 使用标准命令尝试聚焦到聊天输入框
   */
  async tryFocusWithStandardCommands() {
    try {
      // 尝试1: 聚焦到面板区域
      await vscode.commands.executeCommand('workbench.action.focusPanel');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 尝试2: 聚焦到底部区域
      await vscode.commands.executeCommand('workbench.action.focusBottomPanel');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 尝试3: Tab导航
      for (let i = 0; i < 5; i++) {
        await vscode.commands.executeCommand('workbench.action.focusNextPart');
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    } catch (error) {
      console.warn('[RecordView] 标准命令聚焦失败:', error);
    }
  }
  
  /**
   * 尝试特别针对Cursor聊天界面的聚焦方法
   */
  async tryFocusCursorChat() {
    try {
      // 尝试1: 先聚焦到终端，然后向上移动
      await vscode.commands.executeCommand('workbench.action.terminal.focus');
      await new Promise(resolve => setTimeout(resolve, 50));
      await vscode.commands.executeCommand('workbench.action.focusAboveGroup');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 尝试2: 焦点移动到最后一个编辑器
      await vscode.commands.executeCommand('workbench.action.focusLastEditorGroup');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 尝试3: 模拟ESC键退出可能的焦点区域，然后点击Tab键几次
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
      await new Promise(resolve => setTimeout(resolve, 30));
      
      // 模拟按下文本选择，通常用于定位到聊天框末尾
      await vscode.commands.executeCommand('cursorEnd');
      
      // 如果是Cursor特有的命令，尝试直接聚焦到聊天
      try {
        // 这些命令是猜测的，Cursor可能有特定命令
        await vscode.commands.executeCommand('cursor.focus.chat');
      } catch (error) {
        // 忽略错误，因为这些命令可能不存在
      }
      
      // 尝试4: 发送一些键盘导航指令
      await vscode.commands.executeCommand('cursorBottom');
      await new Promise(resolve => setTimeout(resolve, 30));
      await vscode.commands.executeCommand('cursorEnd');
    } catch (error) {
      console.warn('[RecordView] Cursor聊天聚焦失败:', error);
    }
  }
  
  /**
   * 清除结果
   */
  clearResult() {
    // 留空，由WebView处理
  }
  
  /**
   * 显示视图
   */
  show() {
    if (this.view) {
      this.view.show();
    } else {
      this.initialize();
    }
  }
  
  /**
   * 处理视图就绪事件，在视图准备好后可以自动开始录音
   */
  handleViewReady() {
    // 加载自动复制设置
    const config = vscode.workspace.getConfiguration('voice-to-text');
    this.autoCopyEnabled = config.get('autoCopy', false);
    
    // 通知WebView当前状态
    if (this.view) {
      this.view.webview.postMessage({
        command: 'updateAutoCopyStatus',
        enabled: this.autoCopyEnabled
      });
    }
    
    // 如果设置了自动开始录音，则启动录音
    if (this.shouldAutoRecord) {
      this.shouldAutoRecord = false;
      setTimeout(() => {
        this.view.webview.postMessage({
          command: 'autoStartRecording'
        });
      }, 500);
    }
  }
  
  /**
   * 标记需要自动开始录音
   */
  startRecordingOnReady() {
    this.shouldAutoRecord = true;
    if (this.view && this.view.visible) {
      // 如果视图已经可见，则直接发送自动开始录音命令
      this.view.webview.postMessage({
        command: 'autoStartRecording'
      });
    }
  }
}

module.exports = RecordView; 