const vscode = require('vscode');
const path = require('path');
const ApiManager = require('./api/ApiManager');
const ConfigView = require('./ui/ConfigView');
const RecordView = require('./ui/RecordView');

/**
 * 激活扩展
 * @param {vscode.ExtensionContext} context 
 */
function activate(context) {
  console.log('正在激活语音转文字扩展...');

  // 创建API管理器
  const apiManager = new ApiManager(context);
  
  // 创建录音视图
  const recordView = new RecordView(context, apiManager);
  
  // 创建配置视图
  const configView = new ConfigView(context, apiManager);
  
  // 注册视图提供者
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('voice-to-text-config', {
      resolveWebviewView: (webviewView) => {
        configView.view = webviewView;
        configView.updateView();
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [context.extensionUri]
        };
        webviewView.webview.onDidReceiveMessage(message => configView.handleMessage(message));
        console.log('配置视图已加载');
      }
    }, { webviewOptions: { retainContextWhenHidden: true } })
  );
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('voice-to-text-recorder', {
      resolveWebviewView: (webviewView) => {
        recordView.view = webviewView;
        recordView.updateView();
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [context.extensionUri]
        };
        webviewView.webview.onDidReceiveMessage(message => recordView.handleMessage(message));
        console.log('录音视图已加载');
      }
    }, { webviewOptions: { retainContextWhenHidden: true } })
  );
  
  // 注册快捷键命令 - 直接开始/停止录音
  context.subscriptions.push(
    vscode.commands.registerCommand('voice-to-text.toggleRecording', async () => {
      console.log('快捷键被触发: Ctrl+1 - 切换录音状态');
      
      try {
        // 检查扩展是否已初始化
        if (!recordView) {
          console.log('错误: recordView未初始化');
          vscode.window.showErrorMessage('语音转文字扩展未正确初始化，请重启VS Code');
          return;
        }
        
        // 检查API配置是否有效
        const currentApi = apiManager.getCurrentApi();
        if (!currentApi || !currentApi.isConfigValid()) {
            const providerName = apiManager.getProviderName();
            vscode.window.showWarningMessage(`${providerName} API 配置无效或不完整，请先完成配置。`);
            try {
                await vscode.commands.executeCommand('workbench.view.extension.voice-to-text-view');
                await vscode.commands.executeCommand('voice-to-text-config.focus');
            } catch (e) {
                console.error('尝试显示配置视图失败:', e);
            }
            return;
        }

        console.log('使用toggleRecording方法切换录音状态');
        
        // 使用toggleRecording方法
        recordView.toggleRecording();
        
        // 显示状态通知
        if (recordView.isRecording) {
          vscode.window.showInformationMessage('语音识别：已开始录音', { modal: false });
        } else {
          vscode.window.showInformationMessage('语音识别：录音已停止，正在优化结果', { modal: false });
        }
        
        // 如果视图可见，仍然可以尝试更新WebView状态，但这不再是必须的
        if (recordView.view && recordView.view.visible) {
          console.log('录音视图可见，通知其更新状态');
          recordView.view.webview.postMessage({
            command: 'updateRecordingStatus',
            isRecording: recordView.isRecording
          });
        }
        
      } catch (error) {
        console.error('执行快捷键命令失败:', error);
        vscode.window.showErrorMessage('执行录音命令失败: ' + error.message);
      }
    })
  );
  
  // 注册选择位置命令
  context.subscriptions.push(
    vscode.commands.registerCommand('voice-to-text.selectPosition', async () => {
      // 该命令的实现在RecordView中，这里只是注册命令
      console.log('执行选择位置命令');
    })
  );
  
  // 注册捕获点击命令
  context.subscriptions.push(
    vscode.commands.registerCommand('voice-to-text.captureNextClick', async () => {
      console.log('捕获下一次点击');
      // 实际实现在RecordView类中
    })
  );
  
  // 注册发送到聊天命令
  context.subscriptions.push(
    vscode.commands.registerCommand('voice-to-text.sendToChat', async () => {
      console.log('快捷键被触发: Ctrl+2 - 发送到聊天');
      
      try {
        // 检查扩展是否已初始化
        if (!recordView) {
          console.log('错误: recordView未初始化');
          vscode.window.showErrorMessage('语音转文字扩展未正确初始化，请重启VS Code');
          return;
        }
        
        // 检查是否有上次识别的文本
        if (recordView.lastRecognizedText) {
          await recordView.sendToChat(recordView.lastRecognizedText);
        } else {
          vscode.window.showInformationMessage('没有可发送的识别结果，请先进行语音识别');
        }
      } catch (error) {
        console.error('执行发送到聊天命令失败:', error);
        vscode.window.showErrorMessage('执行发送到聊天命令失败: ' + error.message);
      }
    })
  );
  
  // 注册活动栏图标点击命令
  context.subscriptions.push(
    vscode.commands.registerCommand('voice-to-text.activityBarIconClicked', async () => {
      console.log('活动栏图标被点击');
      
      try {
        // 检查扩展是否已初始化
        if (!recordView) {
          console.log('错误: recordView未初始化');
          vscode.window.showErrorMessage('语音转文字扩展未正确初始化，请重启VS Code');
          return;
        }
        
        // 确保录音视图已加载
        if (!recordView.view) {
          console.log('录音视图尚未加载，将其展示并等待加载');
          
          // 尝试聚焦到录音视图
          try {
            await vscode.commands.executeCommand('voice-to-text-recorder.focus');
            console.log('已聚焦到录音视图');
          } catch (e) {
            console.log('聚焦录音视图失败，但会继续尝试', e);
          }
          
          // 给视图加载的时间
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('使用toggleRecording方法切换录音状态');
        
        // 切换录音状态
        recordView.toggleRecording();
        
        // 如果视图可见，更新视图
        if (recordView.view && recordView.view.visible) {
          console.log('视图可见，已通知视图更新状态');
          // 主动更新WebView状态
          recordView.view.webview.postMessage({
            command: 'updateRecordingStatus',
            isRecording: recordView.isRecording
          });
        }
      } catch (error) {
        console.error('执行活动栏图标点击命令失败:', error);
        vscode.window.showErrorMessage('执行录音命令失败: ' + error.message);
      }
    })
  );
  
  // 强制初始化视图容器
  const initializeViews = async () => {
    try {
      console.log('尝试初始化视图容器...');
      
      // 先确保视图容器可见
      await vscode.commands.executeCommand('workbench.view.extension.voice-to-text-view');
      console.log('视图容器已显示');
      
      // 给VS Code一点时间来处理视图显示
      setTimeout(async () => {
        try {
          // 如果API配置有效，聚焦到录音视图
          if (apiManager.getCurrentApi() && apiManager.getCurrentApi().isConfigValid()) {
            await vscode.commands.executeCommand('voice-to-text-recorder.focus');
            console.log('已聚焦到录音视图');
          } else {
            // 如果API配置无效，聚焦到配置视图
            await vscode.commands.executeCommand('voice-to-text-config.focus');
            console.log('已聚焦到配置视图');
          }
        } catch (e) {
          console.error('初始化视图失败:', e);
        }
      }, 300);
    } catch (error) {
      console.error('初始化视图容器失败:', error);
    }
  };
  
  // 在扩展激活时初始化视图
  // setTimeout(initializeViews, 1000); // 注释掉此行以防止启动时自动聚焦
  
  // 注册命令：启动语音转文字
  let startCommand = vscode.commands.registerCommand('voice-to-text.start', async () => {
    console.log('执行语音转文字命令');
    
    try {
      // 首先显示视图容器
      await vscode.commands.executeCommand('workbench.view.extension.voice-to-text-view');
      console.log('视图容器已显示');
      
      // 检查API配置是否有效
      if (apiManager.getCurrentApi() && apiManager.getCurrentApi().isConfigValid()) {
        // 等待视图容器显示后再聚焦到录音视图
        setTimeout(async () => {
          try {
            // 聚焦到录音视图
            await vscode.commands.executeCommand('voice-to-text-recorder.focus');
            console.log('已聚焦到录音视图');
            
            // 检查视图是否可见
            if (recordView.view && recordView.view.visible) {
              // 标记需要自动开始录音
              recordView.startRecordingOnReady();
              console.log('已标记需要自动开始录音');
            } else {
              console.log('录音视图不可见，无法自动开始录音');
            }
          } catch (e) {
            console.error('聚焦录音视图失败:', e);
          }
        }, 300);
      } else {
        // 否则聚焦到配置视图
        setTimeout(async () => {
          try {
            await vscode.commands.executeCommand('voice-to-text-config.focus');
            console.log('已聚焦到配置视图');
          } catch (e) {
            console.error('聚焦配置视图失败:', e);
          }
        }, 300);
      }
    } catch (error) {
      console.error('执行启动命令失败:', error);
      // 如果常规方法失败，尝试直接创建面板
      vscode.window.showInformationMessage('正在启动语音转文字...');
    }
  });
  
  // 将命令添加到上下文中
  context.subscriptions.push(startCommand);
  
  // 注册一个专门用于调试的命令
  let debugCommand = vscode.commands.registerCommand('voice-to-text.debug', async () => {
    console.log('======= 调试信息 =======');
    console.log('API 管理器状态:', apiManager.getCurrentApi() ? '已初始化' : '未初始化');
    console.log('当前API提供商:', apiManager.getProviderName());
    console.log('API配置有效性:', apiManager.getCurrentApi()?.isConfigValid() ? '有效' : '无效');
    console.log('配置视图状态:', configView.view ? '已初始化' : '未初始化');
    console.log('录音视图状态:', recordView.view ? '已初始化' : '未初始化');
    if (recordView.view) {
      console.log('录音视图可见性:', recordView.view.visible ? '可见' : '不可见');
    }
    
    // 尝试修复问题
    try {
      await initializeViews();
      console.log('已尝试重新初始化视图');
    } catch (e) {
      console.error('重新初始化视图失败:', e);
    }
    
    vscode.window.showInformationMessage('已在控制台输出调试信息');
  });
  
  context.subscriptions.push(debugCommand);
  
  // ** NEW: Command to save provider configuration **
  context.subscriptions.push(
    vscode.commands.registerCommand('voice-to-text.saveProviderConfig', async (provider, credentials) => {
        console.log(`Extension: Received command to save config for ${provider}`, credentials);
        if (!apiManager) {
             console.error('Extension: ApiManager not initialized!');
             vscode.window.showErrorMessage('保存配置失败：内部错误。');
             return false; // Indicate failure
        }
        try {
            const success = await apiManager.saveProviderConfig(provider, credentials);
            if (success) {
                 console.log(`Extension: Config saved successfully by ApiManager for ${provider}.`);
                 // Optional: Trigger refresh of views or other components if needed
                 // configView.updateView(); // Refresh config view if it's open
                 // recordView.updateStatus(); // Update recorder status if needed
                 return true; // Indicate success
            } else {
                 console.error(`Extension: ApiManager failed to save config for ${provider}.`);
                 // ApiManager should have shown an error message already
                 return false; // Indicate failure
            }
        } catch (error) {
             console.error(`Extension: Error executing saveProviderConfig for ${provider}:`, error);
             vscode.window.showErrorMessage(`保存配置时发生错误: ${error.message}`);
             return false; // Indicate failure
        }
    })
  );
  
  console.log('语音转文字扩展已激活');
}

/**
 * 停用扩展
 */
function deactivate() {
  console.log('语音转文字扩展已停用');
}

module.exports = {
  activate,
  deactivate
}; 