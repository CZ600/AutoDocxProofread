/**
 * apiSettings 域：API 配置的增删改查/测试/选中，以及代理设置
 */
import { ipcMain, session } from 'electron'
import { DB } from '../database'
import { maskKey } from '../apiKeyCrypto'
import { testAPI, testAPIWithProvider, type ChatThinkingMode } from '../chat'
import { ModelProvider } from '../../shared/modelProviders'
import { api_info, proxy_settings } from './apiState'

export const registerApiSettingsHandlers = () => {
  ipcMain.handle('set-api', async (event, URL, Key, modelName, provider = ModelProvider.OPENAI_COMPATIBLE) => {
    try {
      console.log('add a new api setting:', URL, maskKey(Key), modelName, provider)
      api_info.apiKey = Key
      api_info.apiURL = URL
      api_info.modelName = modelName
      api_info.provider = provider
      const result = await DB.insertAPISetting(URL, Key, modelName, provider)
      console.log('the result of the new api setting adding:', result)
      if (result) {
        return 'success'
      } else {
        return 'error'
      }
    } catch (error) {
      return 'error'
    }
  })
  // 获取所有api设置
  ipcMain.handle('update-api', async (event, id, URL, Key, modelName, provider) => {
    try {
      console.log('update api setting:', id, URL, maskKey(Key), modelName, provider)
      api_info.apiKey = Key
      api_info.apiURL = URL
      api_info.modelName = modelName
      if (provider) api_info.provider = provider
      return await DB.updateAPISettingById(id, URL, Key, modelName, provider)
    } catch (error) {
      console.error('update api setting failed:', error)
      return false
    }
  })

  ipcMain.handle('get-all-api-settings', async event => {
    return await DB.getAllAPISettings()
  })

  ipcMain.handle('delete-one-api-setting', async (event, id) => {
    const result = await DB.deleteAPISettingById(id)
    if (result) {
      return {
        isSuccess: true
      }
    } else {
      return {
        isSuccess: false
      }
    }
  })

  ipcMain.handle('test-api', async (event, URL, Key, modelName) => {
    if (!URL || !Key || !modelName) {
      console.log('Please input all the parameters!')
      return false
    } else {
      console.log('Testing API:', URL, maskKey(Key), modelName)
    }
    const result = await testAPI(URL, Key, modelName)
    return result
  })

  ipcMain.handle('test-api-with-provider', async (event, provider, URL, Key, modelName) => {
    if (!Key || !modelName) {
      console.log('Please input all the parameters!')
      return false
    } else {
      console.log('Testing API with provider:', provider, URL, maskKey(Key), modelName)
    }
    const result = await testAPIWithProvider(provider, URL, Key, modelName)
    return result
  })

  ipcMain.handle(
    'selectAPISetting',
    async (
      event,
      URL,
      Key,
      modelName,
      parallel = 30,
      requestsPerMinute = null,
      provider = ModelProvider.OPENAI_COMPATIBLE,
      requestTimeoutSec = null,
      thinkingMode: ChatThinkingMode = 'default'
    ) => {
      api_info.apiKey = Key
      api_info.apiURL = URL
      api_info.modelName = modelName
      api_info.provider = provider
      api_info.parallel = parallel
      // 历史参数名 TimeLimit 实际语义是「每分钟请求数上限」，已按语义更名
      api_info.requestsPerMinute = requestsPerMinute
      api_info.requestTimeoutSec = requestTimeoutSec
      api_info.thinkingMode = thinkingMode === 'enabled' || thinkingMode === 'disabled' ? thinkingMode : 'default'
      console.log('Selected API:', URL, maskKey(Key), modelName, parallel, requestsPerMinute, provider, requestTimeoutSec, api_info.thinkingMode)
      return true
    }
  )

  ipcMain.handle('get-api-settings', async event => {
    return {
      URL: api_info.apiURL,
      Key: api_info.apiKey,
      modelName: api_info.modelName,
      provider: api_info.provider,
      parallel: api_info.parallel || 30,
      requestsPerMinute: api_info.requestsPerMinute,
      requestTimeoutSec: api_info.requestTimeoutSec,
      thinkingMode: api_info.thinkingMode
    }
  })

  // 代理设置相关IPC
  ipcMain.handle('setProxySettings', async (event, enabled: boolean, port: number) => {
    try {
      proxy_settings.enabled = enabled
      proxy_settings.port = port

      if (enabled) {
        await session.defaultSession.setProxy({
          proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
          proxyBypassRules: 'localhost,127.0.0.1'
        })
        console.log('Proxy enabled on port:', port)
      } else {
        await session.defaultSession.setProxy({})
        console.log('Proxy disabled')
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to set proxy:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('getProxySettings', async event => {
    return proxy_settings
  })
}
