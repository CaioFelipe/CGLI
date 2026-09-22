import { createRequire } from 'node:module'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const nodeRequire = createRequire(import.meta.url)
const vaultManager = nodeRequire('./.cgli/bin/vaultManager.cjs')


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
      // Status endpoint for healthcheck
      server.middlewares.use('/api/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.statusCode = 200
        res.end(JSON.stringify({ status: 'ok', port: 5173 }))
      })

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
                const claudeCmd = path.join(appdata, 'npm', 'claude.cmd')
                const claudeExe = path.join(appdata, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
                if (fs.existsSync(claudeCmd)) {
                  cmdToRun = claudeCmd
                } else if (fs.existsSync(claudeExe)) {
                  cmdToRun = claudeExe
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

      // Inicializar estruturas dos Vaults na inicialização
      try {
        vaultManager.ensureVaultStructure('project', process.cwd())
        vaultManager.ensureVaultStructure('global', process.cwd())
      } catch (_) {}

      // 6. Memory write observation
      server.middlewares.use('/api/memory/write', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.writeObservation(data)
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 7. Memory create note
      server.middlewares.use('/api/memory/note', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.createNote(data)
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 7a. Memory update note (concorrência otimista com rev + etag)
      server.middlewares.use('/api/memory/update', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.updateNote({ ...data, workspacePath: process.cwd() })
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = result.conflict ? 409 : (result.success ? 200 : 400)
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 7b. Memory append to note
      server.middlewares.use('/api/memory/append', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.appendToNote({ ...data, workspacePath: process.cwd() })
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = result.success ? 200 : 400
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 7c. Memory context-file (geração atômica em .cgli/context/<childId>.md)
      server.middlewares.use('/api/memory/context-file', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.generateContextFile({
              ...data,
              workspacePath: process.cwd()
            })
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 7d. Memory drain outbox
      server.middlewares.use('/api/memory/drain-outbox', (_req, res) => {
        try {
          const result = vaultManager.drainOutbox(process.cwd())
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify(result))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })

      // 8. Memory list
      server.middlewares.use('/api/memory/list', (req, res) => {
        try {
          const url = new URL(req.url || '', `http://${req.headers.host}`)
          const scope = url.searchParams.get('scope') || 'project'
          const type = url.searchParams.get('type') || null
          const notes = vaultManager.listNotes({ scope, workspacePath: process.cwd(), type })
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ success: true, scope, notes }))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })

      // 9. Memory get
      server.middlewares.use('/api/memory/get', (req, res) => {
        try {
          const url = new URL(req.url || '', `http://${req.headers.host}`)
          const scope = url.searchParams.get('scope') || 'project'
          const id = url.searchParams.get('id') || ''
          const result = vaultManager.getNote({ scope, workspacePath: process.cwd(), idOrPath: id })
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = result.success ? 200 : 404
          res.end(JSON.stringify(result))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })

      // 10. Memory open in Obsidian
      server.middlewares.use('/api/memory/open', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.openInObsidian(data)
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 11. Memory search
      server.middlewares.use('/api/memory/search', (req, res) => {
        try {
          const url = new URL(req.url || '', `http://${req.headers.host}`)
          const query = url.searchParams.get('q') || ''
          const scope = url.searchParams.get('scope') || 'all'
          const limit = Number(url.searchParams.get('limit') || 20)
          const results = vaultManager.searchNotes({
            query,
            scope,
            limit,
            workspacePath: process.cwd()
          })
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ success: true, query, results }))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })

      // 12. Memory context pack
      server.middlewares.use('/api/memory/context', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.buildContextPack({
              query: data.query || data.for || '',
              budgetTokens: Number(data.budgetTokens || 3000),
              scope: data.scope || 'all',
              includeJournals: Boolean(data.includeJournals),
              workspacePath: process.cwd()
            })
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 13. Memory Doctor (Diagnóstico de integridade)
      server.middlewares.use('/api/memory/doctor', (req, res) => {
        try {
          const url = new URL(req.url || '', `http://${req.headers.host}`)
          const scope = url.searchParams.get('scope') || 'all'
          const result = vaultManager.runDoctor({ scope, workspacePath: process.cwd() })
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify(result))
        } catch (e: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      })

      // 14. Memory Compact (Consolidação de journals)
      server.middlewares.use('/api/memory/compact', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', chunk => (body += chunk))
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const result = vaultManager.compactJournals({
              scope: data.scope || 'project',
              dryRun: Boolean(data.dryRun),
              olderThanDays: data.olderThanDays !== undefined ? Number(data.olderThanDays) : (data.days !== undefined ? Number(data.days) : 7),
              workspacePath: process.cwd()
            })
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })

      // 15. Memory MOC (Map of Content)
      server.middlewares.use('/api/memory/moc', (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => (body += chunk))
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}')
              const result = vaultManager.generateMOC({
                scope: data.scope || 'project',
                workspacePath: process.cwd()
              })
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(JSON.stringify(result))
            } catch (e: any) {
              res.statusCode = 500
              res.end(JSON.stringify({ success: false, error: e.message }))
            }
          })
        } else {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const scope = url.searchParams.get('scope') || 'project'
            const result = vaultManager.generateMOC({ scope, workspacePath: process.cwd() })
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ptyServerPlugin()],
  server: {
    watch: {
      ignored: [
        '**/.cgli/**',
        '**/CLAUDE.md',
        '**/AGY.md',
        '**/HANDOVER.md',
        '**/src-tauri/**',
      ],
    },
  },
})
