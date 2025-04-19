const vscode = require('vscode');

/**
 * 文本插入管理器
 * 协调并管理不同的文本插入方式
 */
class TextInsertionManager {
  /**
   * 构造函数
   * @param {Object} chatInputHandler 聊天输入处理器
   */
  constructor(positionSelector, chatInputHandler) {
    this.chatInputHandler = chatInputHandler;
  }
  
  /**
   * 在当前焦点位置插入文本
   * @param {string} text 要插入的文本
   */
  async insertTextAtCurrentFocus(text) {
    try {
      // 优先检测并尝试插入到AI聊天框
      console.log('尝试识别并插入到AI聊天框...');
      const aiChatSuccess = await this.chatInputHandler.detectAndInsertToAIChat(text);
      if (aiChatSuccess) {
        console.log('已成功插入到AI聊天框');
        return;
      }
      
      console.log('AI聊天框插入失败，尝试其他方法');
      
      // 尝试获取活动编辑器并在光标位置插入文本
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('检测到活动编辑器，尝试插入文本');
        await editor.edit(editBuilder => {
          const position = editor.selection.active;
          editBuilder.insert(position, text);
        });
        console.log('已将文本插入到编辑器');
        return;
      }
      
      // 检查终端是否处于焦点
      try {
        const isTerminalFocused = await vscode.commands.executeCommand('workbench.action.terminal.isFocused');
        if (isTerminalFocused) {
          console.log('检测到终端在焦点，发送文本到终端');
          await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text });
          return;
        }
      } catch (error) {
        console.log('终端焦点检测失败:', error);
      }
      
      // 尝试使用通用粘贴命令
      const pasteSuccess = await this.chatInputHandler.insertTextWithGenericPaste(text);
      if (pasteSuccess) {
        console.log('使用通用粘贴命令成功');
        return;
      }
      
      // 如果所有尝试都失败，显示通知
      console.log('所有插入方法均失败，显示通知');
      vscode.window.showInformationMessage(`识别结果: ${text}`, '复制').then(selection => {
        if (selection === '复制') {
          vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('已复制到剪贴板');
        }
      });
    } catch (error) {
      console.error('插入文本失败:', error);
      vscode.window.showInformationMessage(`识别结果: ${text}`, '复制').then(selection => {
        if (selection === '复制') {
          vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('已复制到剪贴板');
        }
      });
    }
  }
}

module.exports = TextInsertionManager; 