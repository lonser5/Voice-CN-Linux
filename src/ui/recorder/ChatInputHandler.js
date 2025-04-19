const vscode = require('vscode');

/**
 * 聊天输入处理器
 * 专门处理对AI聊天输入框的识别和文本插入
 */
class ChatInputHandler {
  constructor() {
    // 空构造函数
  }
  
  /**
   * 检测并将文本插入到AI聊天输入框
   * 专门针对右下角的AI聊天输入框
   * @param {string} text 要插入的文本
   * @returns {Promise<boolean>} 是否成功插入
   */
  async detectAndInsertToAIChat(text) {
    try {
      console.log('尝试检测并插入到AI聊天框');
      
      // 保存原始剪贴板内容
      const originalClipboard = await vscode.env.clipboard.readText();
      
      // 将识别结果写入剪贴板
      await vscode.env.clipboard.writeText(text);
      
      // 使用更强大的AI聊天框检测和插入方法
      const success = await this.insertToAIChatWithRetry(text);
      
      // 恢复原始剪贴板内容
      setTimeout(() => {
        vscode.env.clipboard.writeText(originalClipboard);
      }, 500);
      
      return success;
    } catch (error) {
      console.error('AI聊天框插入失败:', error);
      return false;
    }
  }
  
  /**
   * 使用多种方法尝试插入到AI聊天框
   * @param {string} text 要插入的文本
   * @returns {Promise<boolean>} 是否成功插入
   */
  async insertToAIChatWithRetry(text) {
    // 1. 尝试专用的Cursor和VSCode聊天命令
    const chatCommands = [
      // --- 聚焦命令 ---
      { cmd: 'workbench.action.chat.focus', desc: 'VS Code内置聊天' },
      { cmd: 'chat.focus', desc: '通用聊天命令' },
      { cmd: 'cursor.focus', desc: 'Cursor聊天' },
      { cmd: 'cursor.chat.open', desc: '打开Cursor聊天' },
      { cmd: 'cursor.openChat', desc: '打开Cursor聊天(另一种命令)' },
      { cmd: 'workbench.panel.chat.view.focus', desc: 'VS Code聊天面板' },
      { cmd: 'workbench.action.terminal.focus', desc: '终端(可能有聊天)' },
      { cmd: 'workbench.action.focusPanelOrNotifications', desc: '聚焦面板区域' },
      
      // --- 控制键盘焦点命令 ---
      { cmd: 'workbench.action.focusActiveEditorGroup', desc: '编辑器组(可能包含聊天)' },
      { cmd: 'workbench.action.focusPanel', desc: '焦点面板' },
      { cmd: 'workbench.action.focusRightGroup', desc: '右侧组(通常是AI聊天)' },
      { cmd: 'workbench.action.nextEditor', desc: '下一个编辑器(可能切换到聊天)' },
      { cmd: 'workbench.action.focusAboveGroup', desc: '焦点上方组' },
      { cmd: 'workbench.action.focusBelowGroup', desc: '焦点下方组' }
    ];
    
    // 2. 尝试打开和聚焦聊天框
    let focused = false;
    console.log('尝试聚焦AI聊天框...');
    
    // 首先检查当前焦点是否已经在聊天框
    const isChatInputFieldFocused = await this.checkIfChatInputFieldFocused();
    if (isChatInputFieldFocused) {
      console.log('已经在聊天输入框中');
      focused = true;
    } else {
      // 尝试各种聚焦命令
      for (const {cmd, desc} of chatCommands) {
        try {
          // 尝试聚焦AI聊天框
          await vscode.commands.executeCommand(cmd);
          console.log(`执行命令: ${cmd} (${desc})`);
          
          // 给UI一点时间来响应
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 检查是否已经在聊天输入框
          if (await this.checkIfChatInputFieldFocused()) {
            console.log(`成功聚焦AI聊天框，使用命令: ${cmd}`);
            focused = true;
            break;
          }
        } catch (error) {
          // 忽略命令不存在的错误
          console.log(`命令 ${cmd} 执行失败`);
        }
      }
    }
    
    // 如果成功聚焦到聊天框，尝试插入文本
    if (focused) {
      // 3. 尝试插入文本到聊天框
      const success = await this.insertTextToChatInput(text);
      if (success) {
        console.log('成功将文本插入到AI聊天框');
        return true;
      }
    }
    
    // 4. 如果以上方法都失败，尝试直接操作活动元素
    console.log('尝试直接粘贴到当前活动元素...');
    try {
      // 尝试直接粘贴
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      console.log('已尝试直接粘贴到当前元素');
      
      // 检查是否成功
      await new Promise(resolve => setTimeout(resolve, 200));
      const textAfterPaste = await vscode.env.clipboard.readText();
      if (textAfterPaste === text) {
        console.log('文本仍在剪贴板，粘贴可能失败');
        return false;
      } else {
        console.log('剪贴板内容已更改，粘贴可能成功');
        return true;
      }
    } catch (error) {
      console.log('直接粘贴失败:', error);
      return false;
    }
  }
  
  /**
   * 检查当前焦点是否在聊天输入框
   * @returns {Promise<boolean>} 是否在聊天输入框
   */
  async checkIfChatInputFieldFocused() {
    // 尝试检测当前焦点元素类型
    try {
      // 这里无法直接访问DOM，使用间接方法检测
      
      // 检查方法1: 尝试获取活动编辑器
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        // 如果有活动编辑器，但不是常规文件，可能是聊天输入框
        const fileName = editor.document.fileName;
        const uri = editor.document.uri.toString();
        
        // 检查URI或文件名是否包含chat相关字符串
        if (uri.includes('chat') || fileName.includes('chat') || 
            uri.includes('input') || uri.includes('cursor')) {
          console.log('检测到可能是聊天输入框:', uri);
          return true;
        }
      }
      
      // 检查方法2: 检查命令状态
      try {
        // 尝试执行聊天特定的命令
        const chatCommandResult = await vscode.commands.executeCommand('workbench.action.chat.focusInput');
        // 如果命令执行成功并返回真值，可能是聊天框
        if (chatCommandResult) {
          console.log('聊天输入框焦点命令执行成功');
          return true;
        }
      } catch (e) {
        // 忽略命令不存在的错误
      }
      
      return false;
    } catch (error) {
      console.log('检查聊天输入框焦点失败:', error);
      return false;
    }
  }
  
  /**
   * 插入文本到聊天输入框
   * @param {string} text 要插入的文本
   * @returns {Promise<boolean>} 是否成功插入
   */
  async insertTextToChatInput(text) {
    // 尝试多种方法将文本插入到聊天输入框
    const insertMethods = [
      // 1. 尝试插入命令
      async () => {
        try {
          // Cursor特有的发送文本命令
          await vscode.commands.executeCommand('cursor.sendCurrentMessage', text);
          console.log('使用cursor.sendCurrentMessage成功');
          return true;
        } catch (e) {
          console.log('cursor.sendCurrentMessage不可用');
          return false;
        }
      },
      
      // 2. 尝试修改输入内容
      async () => {
        try {
          // Cursor特有的类型命令
          await vscode.commands.executeCommand('cursor.type', text);
          console.log('使用cursor.type成功');
          return true;
        } catch (e) {
          console.log('cursor.type不可用');
          return false;
        }
      },
      
      // 3. 尝试不同的粘贴命令
      async () => {
        const pasteCommands = [
          'editor.action.clipboardPasteAction',
          'paste',
          'editor.paste',
          'cursorPaste',
          'workbench.action.chat.paste'
        ];
        
        for (const cmd of pasteCommands) {
          try {
            await vscode.commands.executeCommand(cmd);
            console.log(`使用${cmd}粘贴成功`);
            return true;
          } catch (e) {
            console.log(`${cmd}不可用`);
          }
        }
        return false;
      },
      
      // 4. 尝试通过键盘事件插入
      async () => {
        try {
          // 使用终端sendSequence命令（有时对聊天框也有效）
          await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text });
          console.log('使用sendSequence成功');
          return true;
        } catch (e) {
          console.log('sendSequence不可用');
          return false;
        }
      }
    ];
    
    // 依次尝试各种方法
    for (const method of insertMethods) {
      if (await method()) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 在当前焦点位置插入文本
   * 使用通用粘贴方式
   * @param {string} text 要插入的文本
   * @returns {Promise<boolean>} 是否成功插入
   */
  async insertTextWithGenericPaste(text) {
    try {
      console.log('尝试使用通用粘贴命令...');
      
      // 保存原始剪贴板内容
      const originalClipboard = await vscode.env.clipboard.readText();
      
      // 将识别结果写入剪贴板
      await vscode.env.clipboard.writeText(text);
      
      // 尝试多种粘贴命令
      const pasteCommands = [
        'editor.action.clipboardPasteAction',  // 编辑器粘贴
        'paste',                               // 通用粘贴
        'workbench.action.terminal.paste',     // 终端粘贴
        'editor.action.webvieweditor.paste'    // WebView粘贴
      ];
      
      let pasteSuccess = false;
      for (const command of pasteCommands) {
        try {
          await vscode.commands.executeCommand(command);
          console.log(`通过 ${command} 命令插入文本成功`);
          pasteSuccess = true;
          break;
        } catch (error) {
          console.log(`${command} 命令失败:`, error);
        }
      }
      
      // 恢复原始剪贴板内容
      setTimeout(() => {
        vscode.env.clipboard.writeText(originalClipboard);
      }, 500);
      
      return pasteSuccess;
    } catch (error) {
      console.error('通用粘贴方法失败:', error);
      return false;
    }
  }
}

module.exports = ChatInputHandler; 