const vscode = require('vscode');
const path = require('path');

/**
 * 位置选择器
 * 负责处理位置选择和文本插入逻辑
 */
class PositionSelector {
  /**
   * 构造函数
   * @param {vscode.ExtensionContext} context 扩展上下文
   */
  constructor(context) {
    this.context = context;
    this.inPositionSelectMode = false;
    this.positionSelectDisposable = null;
    this.editorSelectionDisposable = null;
    this.terminalStateDisposable = null;
    this.panelStateDisposable = null;
    this.positionSelectTimeout = null;
    this.selectedPosition = null;
    this.positionCallback = null;
  }
  
  /**
   * 开始位置选择模式
   * @param {Function} callback 选择结果回调
   */
  startPositionSelectMode(callback) {
    console.log('开始位置选择模式');
    
    // 设置选择模式标志
    this.inPositionSelectMode = true;
    this.positionCallback = callback;
    
    // 注册事件处理器
    this.registerPositionSelectionHandler();
  }
  
  /**
   * 取消位置选择模式
   */
  cancelPositionSelectMode() {
    console.log('取消位置选择模式');
    
    // 清除选择模式标志
    this.inPositionSelectMode = false;
    
    // 清除任何位置选择相关的状态
    this.selectedPosition = null;
    
    // 通知已取消选择模式
    if (this.positionCallback) {
      this.positionCallback('status', {
        command: 'positionSelectCancelled'
      });
    }
    
    // 解除事件监听器
    this.disposePositionSelectionHandler();
  }
  
  /**
   * 注册位置选择处理器
   */
  registerPositionSelectionHandler() {
    // 使用一次性的命令执行来捕获下一次用户点击
    this.positionSelectDisposable = vscode.commands.registerCommand('voice-to-text.captureNextClick', async () => {
      if (!this.inPositionSelectMode) {
        return;
      }
      
      try {
        // 获取当前焦点元素信息
        const activeEditor = vscode.window.activeTextEditor;
        let positionDescription = '未知位置';
        
        if (activeEditor) {
          positionDescription = `编辑器: ${path.basename(activeEditor.document.fileName)}`;
          // 保存当前编辑器和位置
          this.selectedPosition = {
            type: 'editor',
            editor: activeEditor,
            position: activeEditor.selection.active
          };
        } else {
          // 尝试判断焦点是否在终端或其他区域
          try {
            const isTerminalFocused = await vscode.commands.executeCommand('workbench.action.terminal.isFocused');
            if (isTerminalFocused) {
              positionDescription = '终端';
              this.selectedPosition = { type: 'terminal' };
            } else {
              // 检查其他可能的焦点区域
              const panels = ['panel', 'debug', 'scm', 'output', 'problems', 'comment', 'terminal'];
              for (const panel of panels) {
                try {
                  const isFocused = await vscode.commands.executeCommand(`workbench.panel.${panel}.focus`);
                  if (isFocused) {
                    positionDescription = `${panel} 面板`;
                    this.selectedPosition = { type: panel };
                    break;
                  }
                } catch (e) {
                  // 忽略错误，继续检查其他面板
                }
              }
            }
          } catch (e) {
            console.log('无法确定焦点位置:', e);
          }
        }
        
        // 位置选择成功
        console.log('选择位置成功:', positionDescription);
        
        // 通知位置已选择
        if (this.positionCallback) {
          this.positionCallback('status', {
            command: 'positionSelected',
            description: positionDescription
          });
        }
        
        // 清除选择模式标志
        this.inPositionSelectMode = false;
        
      } catch (error) {
        console.error('选择位置时出错:', error);
        this.cancelPositionSelectMode();
      } finally {
        this.disposePositionSelectionHandler();
      }
    });
    
    // 监听编辑器、终端和面板的点击事件
    this.registerClickListeners();
    
    // 在5秒后自动取消选择模式（如果用户没有选择）
    this.positionSelectTimeout = setTimeout(() => {
      if (this.inPositionSelectMode) {
        console.log('位置选择超时，自动取消');
        this.cancelPositionSelectMode();
      }
    }, 5000);
  }
  
  /**
   * 注册点击事件监听器
   */
  registerClickListeners() {
    // 下面是处理各种面板和区域的点击事件
    // 编辑器点击
    this.editorSelectionDisposable = vscode.window.onDidChangeTextEditorSelection(() => {
      if (this.inPositionSelectMode) {
        vscode.commands.executeCommand('voice-to-text.captureNextClick');
      }
    });
    
    // 终端状态变化（通常表示用户与终端交互）
    this.terminalStateDisposable = vscode.window.onDidChangeActiveTerminal(() => {
      if (this.inPositionSelectMode) {
        vscode.commands.executeCommand('voice-to-text.captureNextClick');
      }
    });
    
    // 活动面板变化
    this.panelStateDisposable = vscode.window.onDidChangeWindowState(() => {
      if (this.inPositionSelectMode) {
        vscode.commands.executeCommand('voice-to-text.captureNextClick');
      }
    });
  }
  
  /**
   * 清除位置选择处理器
   */
  disposePositionSelectionHandler() {
    if (this.positionSelectDisposable) {
      this.positionSelectDisposable.dispose();
      this.positionSelectDisposable = null;
    }
    
    if (this.editorSelectionDisposable) {
      this.editorSelectionDisposable.dispose();
      this.editorSelectionDisposable = null;
    }
    
    if (this.terminalStateDisposable) {
      this.terminalStateDisposable.dispose();
      this.terminalStateDisposable = null;
    }
    
    if (this.panelStateDisposable) {
      this.panelStateDisposable.dispose();
      this.panelStateDisposable = null;
    }
    
    if (this.positionSelectTimeout) {
      clearTimeout(this.positionSelectTimeout);
      this.positionSelectTimeout = null;
    }
  }
  
  /**
   * 在用户选择的位置插入文本
   * @param {string} text 要插入的文本
   * @returns {Promise<boolean>} 是否成功插入
   */
  async insertTextAtSelectedPosition(text) {
    if (!this.selectedPosition) {
      return false;
    }
    
    try {
      switch (this.selectedPosition.type) {
        case 'editor':
          if (this.selectedPosition.editor) {
            // 检查编辑器是否仍然存在
            if (!vscode.window.visibleTextEditors.includes(this.selectedPosition.editor)) {
              return false;
            }
            
            // 插入文本到编辑器中的指定位置
            await this.selectedPosition.editor.edit(editBuilder => {
              editBuilder.insert(this.selectedPosition.position, text);
            });
            return true;
          }
          break;
          
        case 'terminal':
          // 向终端发送文本
          await vscode.commands.executeCommand('workbench.action.terminal.focus');
          await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text });
          return true;
          
        default:
          // 尝试聚焦到保存的面板类型
          if (this.selectedPosition.type) {
            try {
              await vscode.commands.executeCommand(`workbench.panel.${this.selectedPosition.type}.focus`);
              
              // 使用剪贴板粘贴
              const originalClipboard = await vscode.env.clipboard.readText();
              await vscode.env.clipboard.writeText(text);
              
              // 尝试粘贴
              await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
              
              // 恢复剪贴板
              setTimeout(() => {
                vscode.env.clipboard.writeText(originalClipboard);
              }, 500);
              
              return true;
            } catch (error) {
              console.log(`无法聚焦到保存的面板 ${this.selectedPosition.type}:`, error);
            }
          }
          break;
      }
      
      return false;
    } catch (error) {
      console.error('在选择的位置插入文本失败:', error);
      return false;
    }
  }
  
  /**
   * 获取当前选择的位置
   * @returns {Object|null} 选择的位置
   */
  getSelectedPosition() {
    return this.selectedPosition;
  }
}

module.exports = PositionSelector; 