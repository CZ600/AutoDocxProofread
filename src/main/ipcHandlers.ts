/**
 * IPC handler 聚合注册入口。
 *
 * 原单文件 1100+ 行、约 60 个 handler，已按域拆分到 ipc/ 下的六个模块：
 * - windowHandlers      窗口控制与应用级杂项
 * - dialogHandlers      文件选择与内容读取
 * - apiSettingsHandlers API 配置与代理设置
 * - proofHandlers       校对编排、提示词、历史记录
 * - knowledgeHandlers   知识库（向量表）管理
 * - formatHandlers      格式克隆与 SmartFormatAgent
 *
 * 跨域共享的进程内状态（api_info / proxy_settings / resolveReviewApiInfo）在 ipc/apiState.ts。
 * 本文件只做聚合注册，不承载任何 handler；新增通道请放进对应域模块。
 */
import { registerWindowHandlers } from './ipc/windowHandlers'
import { registerDialogHandlers } from './ipc/dialogHandlers'
import { registerApiSettingsHandlers } from './ipc/apiSettingsHandlers'
import { registerProofHandlers } from './ipc/proofHandlers'
import { registerKnowledgeHandlers } from './ipc/knowledgeHandlers'
import { registerFormatHandlers } from './ipc/formatHandlers'

// 类型消费方（electron.d.ts）从这里导入 API 设置类型
export type { apiSettings, ProxySettings } from './ipc/apiState'

// 全局embedding_api变量已移除，由Pinia store管理
export const registerIpcHandlers = () => {
  registerWindowHandlers()
  registerDialogHandlers()
  registerApiSettingsHandlers()
  registerProofHandlers()
  registerKnowledgeHandlers()
  registerFormatHandlers()
}
