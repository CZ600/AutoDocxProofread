import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { OpenaiGen, setThinkingMode } from '../src/main/chat'

// 用本地 mock SSE 服务模拟 DeepSeek 官方文档的思维链响应格式：
// 流式 delta.reasoning_content / delta.content 分流；非流式 message.reasoning_content。
// 目的：验证 OpenaiGen 的思考参数透传与思维链提取链路本身正确。

let server: http.Server
let port = 0
let lastBody: any = null

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString('utf-8')))
    req.on('end', () => {
      try {
        lastBody = JSON.parse(raw || '{}')
      } catch {
        lastBody = {}
      }
      if (lastBody.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const chunks = [
          { choices: [{ index: 0, delta: { reasoning_content: '思维链A' } }] },
          { choices: [{ index: 0, delta: { reasoning_content: '思维链B' } }] },
          { choices: [{ index: 0, delta: { content: '最终' } }] },
          { choices: [{ index: 0, delta: { content: '答案' } }] },
          { choices: [], usage: { total_tokens: 42 } }
        ]
        for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            choices: [
              {
                message: { content: '最终答案', reasoning_content: '整段思维链' },
                finish_reason: 'stop'
              }
            ],
            usage: { total_tokens: 7 }
          })
        )
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as any).port
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('OpenaiGen 思考模式（DeepSeek 规范）', () => {
  it('流式：reasoning_content 与 content 正确分流，thinking 参数随请求体发出', async () => {
    setThinkingMode('enabled')
    const thinking: string[] = []
    let content = ''
    const { result, total_tokens } = await OpenaiGen(
      'sys',
      'user',
      'sk-test',
      'deepseek-flash',
      `http://127.0.0.1:${port}`,
      c => (content += c),
      undefined,
      t => thinking.push(t)
    )
    expect(thinking.join('')).toBe('思维链A思维链B')
    expect(content).toBe('最终答案')
    expect(result).toBe('最终答案')
    expect(total_tokens).toBe(42)
    expect(lastBody.thinking).toEqual({ type: 'enabled' })
  })

  it('disabled：请求体携带 thinking.type=disabled', async () => {
    setThinkingMode('disabled')
    await OpenaiGen('sys', 'user', 'sk-test', 'deepseek-flash', `http://127.0.0.1:${port}`, () => {})
    expect(lastBody.thinking).toEqual({ type: 'disabled' })
  })

  it('default：不向请求体注入 thinking 参数', async () => {
    setThinkingMode('default')
    await OpenaiGen('sys', 'user', 'sk-test', 'deepseek-flash', `http://127.0.0.1:${port}`, () => {})
    expect(lastBody.thinking).toBeUndefined()
  })

  it('非流式回退：message.reasoning_content 一次性喂给 onThinking', async () => {
    setThinkingMode('enabled')
    const thinking: string[] = []
    await OpenaiGen('sys', 'user', 'sk-test', 'deepseek-flash', `http://127.0.0.1:${port}`, undefined, undefined, t =>
      thinking.push(t)
    )
    expect(thinking).toEqual(['整段思维链'])
  })
})
