import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
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
            const { agentType, prompt, images, cwd } = data
            const workDir = cwd || process.cwd()

            let finalPrompt = String(prompt || '')
            if (images && Array.isArray(images) && images.length > 0) {
              const firstImg = images[0]
              if (typeof firstImg === 'string' && firstImg.startsWith('data:image/')) {
                try {
                  const base64Content = firstImg.split(';base64,').pop()
                  if (base64Content) {
                    const tempImgPath = path.resolve(workDir, '.canvas_context_image.png')
                    fs.writeFileSync(tempImgPath, Buffer.from(base64Content, 'base64'))
                    finalPrompt = `[Nota: Imagem de contexto conectada salva em .canvas_context_image.png] ${finalPrompt}`
                  }
                } catch (e) {
                  console.error('Erro ao salvar imagem temporária:', e)
                }
              }
            }

            const isWindows = process.platform === 'win32'
            let childProcess

            if (agentType === 'agy') {
              const agyBin = isWindows
                ? 'C:\\Users\\aluno\\AppData\\Local\\agy\\bin\\agy.exe'
                : 'agy'
              childProcess = spawn(agyBin, ['-p', finalPrompt], {
                cwd: workDir,
                shell: false,
                env: { ...process.env, CI: '1' },
              })
              childProcess.stdin?.end()
            } else {
              // Claude Code - pipe prompt through stdin to avoid cmd.exe argument escaping issues
              const claudeBin = isWindows ? 'claude.cmd' : 'claude'
              childProcess = spawn(claudeBin, ['-p'], {
                cwd: workDir,
                shell: isWindows,
                env: { ...process.env, CI: '1' },
              })
              childProcess.stdin?.write(finalPrompt)
              childProcess.stdin?.end()
            }

            const child = childProcess

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
