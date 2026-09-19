import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface BridgeAction {
  action_type: 'spawn_subagent' | 'create_artifact' | 'create_preview' | 'create_diff'
  parent_node_id?: string
  child_type?: string
  role?: 'planner' | 'executor'
  task?: string
  title?: string
  content?: string
  html?: string
  filename?: string
  lines?: Array<{ type: 'add' | 'remove' | 'normal'; content: string }>
}

class PtyService {
  private eventSources: Map<string, EventSource> = new Map()

  public isTauri(): boolean {
    return isTauri()
  }

  public async spawnPty(
    sessionId: string,
    command: string,
    args: string[] = [],
    cwd?: string,
    env?: Record<string, string>
  ): Promise<string> {
    if (this.isTauri()) {
      return await invoke<string>('spawn_pty', {
        sessionId,
        command,
        args,
        cwd,
        env,
      })
    }

    // Web / Browser mode: use HTTP bridge
    const res = await fetch('/api/pty/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, command, args, cwd, env }),
    })
    const data = await res.json()
    if (!data.success) {
      throw new Error(data.error || 'Falha ao iniciar PTY no servidor web')
    }
    return sessionId
  }

  public async writePty(sessionId: string, data: string): Promise<void> {
    if (this.isTauri()) {
      await invoke('write_pty', { sessionId, data })
      return
    }

    // Web / Browser mode
    await fetch('/api/pty/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, data }),
    })
  }

  public async resizePty(sessionId: string, cols: number, rows: number): Promise<void> {
    if (this.isTauri()) {
      await invoke('resize_pty', { sessionId, cols, rows })
    }
  }

  public async killPty(sessionId: string): Promise<void> {
    // Clean up SSE if in web mode
    if (this.eventSources.has(sessionId)) {
      this.eventSources.get(sessionId)?.close()
      this.eventSources.delete(sessionId)
    }

    if (this.isTauri()) {
      try {
        await invoke('kill_pty', { sessionId })
      } catch (e) {
        console.warn(`[PtyService] Erro ao encerrar PTY ${sessionId}:`, e)
      }
      return
    }

    // Web / Browser mode
    await fetch('/api/pty/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  }

  public async onPtyOutput(
    sessionId: string,
    callback: (data: string) => void
  ): Promise<UnlistenFn> {
    if (this.isTauri()) {
      return await listen<string>(`pty-output-${sessionId}`, (event) => {
        callback(event.payload)
      })
    }

    // Web / Browser mode: Server-Sent Events
    const es = new EventSource(`/api/pty/stream?sessionId=${encodeURIComponent(sessionId)}`)
    es.onmessage = (event) => {
      try {
        const text = JSON.parse(event.data)
        callback(text)
      } catch (_) {
        callback(event.data)
      }
    }
    this.eventSources.set(sessionId, es)

    return () => {
      es.close()
      this.eventSources.delete(sessionId)
    }
  }

  public async onPtyExit(
    sessionId: string,
    callback: () => void
  ): Promise<UnlistenFn> {
    if (this.isTauri()) {
      return await listen(`pty-exit-${sessionId}`, () => {
        callback()
      })
    }

    const es = this.eventSources.get(sessionId)
    if (es) {
      es.addEventListener('exit', () => callback())
    }

    return () => {}
  }

  public async onBridgeAction(
    callback: (action: BridgeAction) => void
  ): Promise<UnlistenFn> {
    if (this.isTauri()) {
      return await listen<BridgeAction>('cgli-bridge-action', (event) => {
        callback(event.payload)
      })
    }

    // Web / Browser mode
    const es = new EventSource('/api/bridge/events')
    es.onmessage = (event) => {
      try {
        const action = JSON.parse(event.data)
        callback(action)
      } catch (_) {}
    }

    return () => es.close()
  }

  public async getBridgePort(): Promise<number> {
    if (!this.isTauri()) return 41732
    try {
      return await invoke<number>('get_cgli_bridge_port')
    } catch {
      return 41732
    }
  }
}

export const ptyService = new PtyService()
