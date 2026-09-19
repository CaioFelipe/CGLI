import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

interface PtySessionState {
  child: ChildProcess
  listeners: Set<(data: string) => void>
  exitListeners: Set<() => void>
  buffer: string[]
}

const activeSessions = new Map<string, PtySessionState>()
const bridgeActionListeners = new Set<(action: any) => void>()

function ptyServerPlugin(): Plugin {
  return {
    name: 'pty-server-plugin',
    configureServer(server) {
      // 1. Spawn PTY session
      server.middlewares.use('/api/pty/spawn', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const { sessionId, command, args = [], cwd, env = {} } = JSON.parse(body || '{}')
            const workDir = cwd || process.cwd()

            // If session exists, terminate first
            if (activeSessions.has(sessionId)) {
              const old = activeSessions.get(sessionId)
              old?.child.kill()
              activeSessions.delete(sessionId)
            }

            const isWindows = process.platform === 'win32'
            let cmdToRun = command || 'claude'
            let finalArgs = [...args]

            if (isWindows) {
              if (cmdToRun === 'claude') {
                const appdata = process.env.APPDATA || ''
                const claudeExe = path.join(appdata, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
                const claudeCmd = path.join(appdata, 'npm', 'claude.cmd')
                if (fs.existsSync(claudeExe)) {
                  cmdToRun = claudeExe
                } else if (fs.existsSync(claudeCmd)) {
                  cmdToRun = claudeCmd
                }
              } else if (cmdToRun === 'agy') {
                const localapp = process.env.LOCALAPPDATA || ''
                const agyExe = path.join(localapp, 'agy', 'bin', 'agy.exe')
                if (fs.existsSync(agyExe)) {
                  cmdToRun = agyExe
                }
              }
            }

            // Setup .cgli scripts if in workspace
            const binDir = path.join(workDir, '.cgli', 'bin')
            try {
              fs.mkdirSync(binDir, { recursive: true })
            } catch (_) {}

            const child = spawn(cmdToRun, finalArgs, {
              cwd: workDir,
              shell: isWindows,
              env: {
                ...process.env,
                ...env,
                PATH: isWindows ? `${binDir};${process.env.PATH}` : `${binDir}:${process.env.PATH}`,
                CGLI_WORKSPACE_PATH: workDir,
                CGLI_NODE_ID: sessionId,
                CGLI_BRIDGE_PORT: '41732',
              },
            })

            const sessionState: PtySessionState = {
              child,
              listeners: new Set(),
              exitListeners: new Set(),
              buffer: [],
            }

            const broadcast = (chunk: string) => {
              // Parse stream markers
              const markerRegex = /<<<CGLI:([A-Z_]+)\s+({.*?})>>>/g
              let match
              while ((match = markerRegex.exec(chunk)) !== null) {
                try {
                  const actionType = match[1].toLowerCase()
                  const payload = JSON.parse(match[2])
                  const actionObj = { action_type: actionType, parent_node_id: sessionId, ...payload }
                  bridgeActionListeners.forEach((fn) => fn(actionObj))
                } catch (_) {}
              }

              sessionState.buffer.push(chunk)
              if (sessionState.buffer.length > 200) sessionState.buffer.shift()
              sessionState.listeners.forEach((fn) => fn(chunk))
            }

            child.stdout?.on('data', (d) => broadcast(d.toString()))
            child.stderr?.on('data', (d) => broadcast(d.toString()))

            child.on('close', () => {
              sessionState.exitListeners.forEach((fn) => fn())
              activeSessions.delete(sessionId)
            })

            child.on('error', (err) => {
              broadcast(`\r\n\x1b[31m[Erro ao executar processo]: ${err.message}\x1b[0m\r\n`)
            })

            activeSessions.set(sessionId, sessionState)

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ success: true, sessionId }))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 2. Stream PTY output (Server-Sent Events)
      server.middlewares.use('/api/pty/stream', (req, res) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`)
        const sessionId = url.searchParams.get('sessionId') || ''
        const session = activeSessions.get(sessionId)

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        res.write('retry: 1000\n\n')

        // Flush existing output buffer
        if (session) {
          for (const chunk of session.buffer) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        }

        const listener = (chunk: string) => {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        }

        const exitListener = () => {
          res.write(`event: exit\ndata: {}\n\n`)
        }

        if (session) {
          session.listeners.add(listener)
          session.exitListeners.add(exitListener)
        }

        req.on('close', () => {
          if (session) {
            session.listeners.delete(listener)
            session.exitListeners.delete(exitListener)
          }
        })
      })

      // 3. Write to PTY stdin
      server.middlewares.use('/api/pty/write', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const { sessionId, data } = JSON.parse(body || '{}')
            const session = activeSessions.get(sessionId)
            if (session?.child.stdin?.writable) {
              session.child.stdin.write(data)
            }
            res.statusCode = 200
            res.end(JSON.stringify({ success: true }))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 4. Kill PTY
      server.middlewares.use('/api/pty/kill', (req, res) => {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const { sessionId } = JSON.parse(body || '{}')
            const session = activeSessions.get(sessionId)
            if (session) {
              session.child.kill()
              activeSessions.delete(sessionId)
            }
            res.statusCode = 200
            res.end(JSON.stringify({ success: true }))
          } catch (_) {
            res.statusCode = 200
            res.end(JSON.stringify({ success: true }))
          }
        })
      })

      // 5. Bridge Actions SSE stream
      server.middlewares.use('/api/bridge/events', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        res.write('retry: 2000\n\n')

        const actionListener = (action: any) => {
          res.write(`data: ${JSON.stringify(action)}\n\n`)
        }

        bridgeActionListeners.add(actionListener)
        req.on('close', () => {
          bridgeActionListeners.delete(actionListener)
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ptyServerPlugin()],
})
