import { spawn } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function cliRunnerPlugin(): Plugin {
  return {
    name: 'cli-runner-plugin',
    configureServer(server) {
      server.middlewares.use('/api/agent/run', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })

        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const { agentType, prompt, cwd } = data
            const workDir = cwd || process.cwd()

            const isWindows = process.platform === 'win32'
            let childProcess

            if (agentType === 'agy') {
              const agyBin = isWindows
                ? 'C:\\Users\\aluno\\AppData\\Local\\agy\\bin\\agy.exe'
                : 'agy'
              childProcess = spawn(agyBin, ['-p', String(prompt || '')], {
                cwd: workDir,
                env: { ...process.env, CI: '1' },
              })
            } else {
              // Claude Code
              const claudeBin = isWindows ? 'claude.cmd' : 'claude'
              childProcess = spawn(claudeBin, ['-p', String(prompt || '')], {
                cwd: workDir,
                shell: isWindows,
                env: { ...process.env, CI: '1' },
              })
            }

            const child = childProcess
            // Close stdin so neither waits for terminal input
            child.stdin?.end()

            let stdout = ''
            let stderr = ''

            child.stdout?.on('data', (d) => {
              stdout += d.toString()
            })

            child.stderr?.on('data', (d) => {
              stderr += d.toString()
            })

            child.on('close', (code) => {
              // Clean any warning text like "Warning: no stdin data received in 3s..."
              const cleanedStdout = stdout
                .replace(/^Warning: no stdin data received in \d+s[^\n]*\n?/gm, '')
                .trim()

              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(
                JSON.stringify({
                  success: code === 0 || cleanedStdout.length > 0,
                  output: cleanedStdout || stderr || 'Execução concluída.',
                  code,
                  stderr,
                })
              )
            })

            child.on('error', (err) => {
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 500
              res.end(JSON.stringify({ success: false, error: err.message }))
            })
          } catch (err: any) {
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 400
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cliRunnerPlugin()],
})
