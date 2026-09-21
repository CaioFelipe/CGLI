import { FitAddon } from '@xterm/addon-fit'
import { type ITheme, Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Handle, type NodeProps, Position, NodeResizer } from '@xyflow/react'
import {
  Archive,
  Brain,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  FolderSync,
  GitCompare,
  RotateCw,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  X,
  Plus,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ptyService } from '../../services/ptyService'
import { useCanvasStore } from '../../store/canvasStore'
import type { AgentNodeData } from '../../types/canvas'

interface SlashCommand {
  cmd: string
  label: string
  desc: string
}

const AVAILABLE_SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/plan', label: '/plan', desc: 'Criar plano de arquitetura e implementação' },
  { cmd: '/test', label: '/test', desc: 'Executar testes automatizados' },
  { cmd: '/review', label: '/review', desc: 'Revisar código e auditar mudanças' },
  { cmd: '/commit', label: '/commit', desc: 'Preparar mensagem e executar commit' },
  { cmd: '/clear', label: '/clear', desc: 'Limpar a tela do terminal' },
  { cmd: '/help', label: '/help', desc: 'Exibir comandos disponíveis' },
]

const TERMINAL_THEMES: Record<'dark' | 'light', ITheme> = {
  dark: {
    background: '#0D1117',
    foreground: '#C9D1D9',
    cursor: '#58A6FF',
    selectionBackground: '#1F6FEB44',
    black: '#0D1117',
    red: '#FF7B72',
    green: '#3FB950',
    yellow: '#D29922',
    blue: '#58A6FF',
    magenta: '#BC8CFF',
    cyan: '#39C5CF',
    white: '#C9D1D9',
    brightBlack: '#484F58',
    brightRed: '#FFA198',
    brightGreen: '#56D364',
    brightYellow: '#E3B341',
    brightBlue: '#79C0FF',
    brightMagenta: '#D2A8FF',
    brightCyan: '#56D4DD',
    brightWhite: '#F0F6FC',
  },
  light: {
    background: '#F8FAFC',
    foreground: '#1E293B',
    cursor: '#0284C7',
    selectionBackground: '#0284C722',
    black: '#1E293B',
    red: '#EF4444',
    green: '#10B981',
    yellow: '#F59E0B',
    blue: '#0284C7',
    magenta: '#8B5CF6',
    cyan: '#06B6D4',
    white: '#F8FAFC',
    brightBlack: '#64748B',
    brightRed: '#F87171',
    brightGreen: '#34D399',
    brightYellow: '#FBBF24',
    brightBlue: '#38BDF8',
    brightMagenta: '#A78BFA',
    brightCyan: '#22D3EE',
    brightWhite: '#FFFFFF',
  },
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const AgentCardNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as AgentNodeData
  const {
    theme,
    clis,
    getActiveWorkspacePath,
    stashNode,
    deleteNode,
    attachImageToAgent,
    removeAttachedImage,
    toggleAgentDiffNode,
    updateNodeData,
  } = useCanvasStore()

  const [inputVal, setInputVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonInstance = useRef<FitAddon | null>(null)

  const isClaude =
    nodeData.agentType?.toLowerCase().includes('claude') ||
    nodeData.title?.toLowerCase().includes('claude')
  const isAgy =
    nodeData.agentType?.toLowerCase().includes('agy') ||
    nodeData.title?.toLowerCase().includes('antigravity')

  const accentColor = isClaude ? '#EA580C' : isAgy ? '#0284C7' : '#6366F1'
  const accentLight = isClaude
    ? 'rgba(234, 88, 12, 0.15)'
    : isAgy
    ? 'rgba(2, 132, 199, 0.15)'
    : 'rgba(99, 102, 241, 0.15)'

  const sessionId = nodeData.sessionId || `pty-${id}`
  const workspacePath = nodeData.workspacePath || getActiveWorkspacePath()

  const cliConfig = clis.find(
    (c) =>
      c.id === nodeData.cliId ||
      c.binary === nodeData.agentType ||
      c.id === nodeData.agentType ||
      c.name.toLowerCase().includes(String(nodeData.agentType || '').toLowerCase())
  )

  const command =
    cliConfig?.binary ||
    (isClaude ? 'claude' : isAgy ? 'agy' : nodeData.agentType || 'powershell')

  const args = cliConfig?.defaultArgs ? cliConfig.defaultArgs.split(' ').filter(Boolean) : []

  const cliSessionIdRef = useRef<string>(
    nodeData.cliSessionId || generateUuid()
  )
  const hasStartedRef = useRef<boolean>(Boolean(nodeData.hasStarted))
  const termOutputBufferRef = useRef<string>('')
  const saveTermTimeoutRef = useRef<any>(null)

  const computeArgs = useCallback((resume: boolean, sessId: string, baseArgs: string[]) => {
    if (isClaude) {
      const filtered = baseArgs.filter(
        (a, i, arr) =>
          a !== '--resume' &&
          a !== '-r' &&
          a !== '--session-id' &&
          a !== '--continue' &&
          a !== '-c' &&
          arr[i - 1] !== '--session-id' &&
          arr[i - 1] !== '--resume' &&
          arr[i - 1] !== '-r'
      )
      if (resume) {
        return ['--resume', sessId, ...filtered]
      } else {
        return ['--session-id', sessId, ...filtered]
      }
    } else if (isAgy) {
      const filtered = baseArgs.filter(
        (a) => a !== '--continue' && a !== '-c' && a !== '--conversation'
      )
      if (resume) {
        return ['--continue', ...filtered]
      } else {
        return [...filtered]
      }
    }
    return baseArgs
  }, [isClaude, isAgy])

  // `args` is rebuilt on every render, so it must never be an effect dependency. Everything the
  // spawn needs is read from this ref at call time instead; the terminal effect below only
  // depends on the node/session identity and therefore mounts exactly once per node.
  const launchRef = useRef({
    command,
    args,
    workspacePath,
    role: nodeData.role,
    agentType: nodeData.agentType,
    theme,
  })
  useEffect(() => {
    launchRef.current = {
      command,
      args,
      workspacePath,
      role: nodeData.role,
      agentType: nodeData.agentType,
      theme,
    }
  })

  const markSessionStarted = useCallback(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      updateNodeData(id, { hasStarted: true })
    }
  }, [id, updateNodeData])

  const startPty = useCallback(async (forceFresh = false) => {
    const term = terminalInstance.current
    const cfg = launchRef.current
    const cachedOutput = (typeof localStorage !== 'undefined' ? localStorage.getItem(`cgli_term_${id}`) : '') || ''
    // Only attempt resume if the session has actually engaged AND there is prior cached output
    const shouldResume = !forceFresh && hasStartedRef.current && cachedOutput.trim().length > 0
    const sessId = cliSessionIdRef.current
    const argsToUse = computeArgs(shouldResume, sessId, cfg.args)

    try {
      await ptyService.spawnPty(sessionId, cfg.command, argsToUse, cfg.workspacePath, {
        CGLI_NODE_ID: id,
        CGLI_AGENT_ROLE: cfg.role,
        CGLI_AGENT_TYPE: cfg.agentType,
        CGLI_WORKSPACE_PATH: cfg.workspacePath,
      })
      updateNodeData(id, {
        isPtyActive: true,
        status: 'idle',
        cliSessionId: sessId,
      })

      // The PTY is created at 80x24; push the real size as soon as it exists.
      const fit = fitAddonInstance.current
      if (term && fit) {
        try {
          fit.fit()
        } catch (_) {}
        if (term.cols > 0 && term.rows > 0) {
          ptyService.resizePty(sessionId, term.cols, term.rows).catch(() => {})
        }
        term.focus()
      }
    } catch (err) {
      console.error('Failed to spawn PTY:', err)
      // If resuming failed (e.g. session was cleaned up or expired), fallback to a fresh session
      if (shouldResume && isClaude) {
        console.warn('Resume failed, starting clean session...')
        const newSessId = generateUuid()
        cliSessionIdRef.current = newSessId
        hasStartedRef.current = false
        const fallbackArgs = computeArgs(false, newSessId, cfg.args)
        try {
          await ptyService.spawnPty(sessionId, cfg.command, fallbackArgs, cfg.workspacePath, {
            CGLI_NODE_ID: id,
            CGLI_AGENT_ROLE: cfg.role,
            CGLI_AGENT_TYPE: cfg.agentType,
            CGLI_WORKSPACE_PATH: cfg.workspacePath,
          })
          updateNodeData(id, {
            isPtyActive: true,
            status: 'idle',
            hasStarted: false,
            cliSessionId: newSessId,
          })
          return
        } catch (_) {}
      }
      term?.writeln(`\r\n\x1b[31mFalha ao iniciar '${cfg.command}': ${String(err)}\x1b[0m`)
      updateNodeData(id, { isPtyActive: false, status: 'error' })
    }
  }, [id, sessionId, computeArgs, isClaude, updateNodeData])

  // xterm + output listener + PTY spawn. Mounted once per node; torn down only on real unmount.
  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    let disposed = false
    let unlistenOutput: (() => void) | undefined

    const term = new Terminal({
      theme: TERMINAL_THEMES[launchRef.current.theme === 'dark' ? 'dark' : 'light'],
      fontSize: 12.5,
      lineHeight: 1.15,
      fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "JetBrains Mono", Menlo, monospace',
      cursorBlink: true,
      convertEol: false,
    })

    // Keep keystrokes inside xterm so React Flow shortcuts (Delete, arrows...) don't fire
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      e.stopPropagation()
      return true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    terminalInstance.current = term
    fitAddonInstance.current = fitAddon

    // Preload cached terminal output if this node already has prior session history
    try {
      const cached = localStorage.getItem(`cgli_term_${id}`)
      if (cached) {
        if (
          cached.includes('No conversation found with session ID') ||
          (cached.includes('Session ID') && cached.includes('already in use'))
        ) {
          localStorage.removeItem(`cgli_term_${id}`)
          hasStartedRef.current = false
          cliSessionIdRef.current = generateUuid()
          updateNodeData(id, { hasStarted: false, cliSessionId: cliSessionIdRef.current })
        } else if (hasStartedRef.current) {
          term.write(cached)
          termOutputBufferRef.current = cached
        }
      }
    } catch (_) {}

    const safeFit = () => {
      // Hidden / 0x0 containers make fit() throw or produce NaN dimensions
      if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return
      try {
        fitAddon.fit()
        if (term.cols > 0 && term.rows > 0) {
          ptyService.resizePty(sessionId, term.cols, term.rows).catch(() => {})
        }
      } catch (_) {}
    }

    let rafId = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(safeFit)
    })
    ro.observe(container)

    // Keyboard input typed inside the terminal goes straight to the PTY stdin
    const dataSub = term.onData((d) => {
      if (d.includes('\r')) {
        markSessionStarted()
      }
      ptyService.writePty(sessionId, d).catch(() => {})
    })

    void (async () => {
      // The listener must be registered (awaited) BEFORE spawning, otherwise the first
      // frames of output can be emitted before anyone is listening.
      const unlisten = await ptyService.onPtyOutput(sessionId, (chunk) => {
        if (!disposed) {
          // Detect if Claude Code failed because the session was not found or already in use
          if (
            chunk.includes('No conversation found with session ID') ||
            (chunk.includes('Session ID') && chunk.includes('already in use'))
          ) {
            console.warn('Session ID mismatch detected from Claude Code. Auto-recovering with fresh session...')
            hasStartedRef.current = false
            const newUuid = generateUuid()
            cliSessionIdRef.current = newUuid
            updateNodeData(id, {
              cliSessionId: newUuid,
              hasStarted: false,
            })
            termOutputBufferRef.current = ''
            try {
              localStorage.removeItem(`cgli_term_${id}`)
            } catch (_) {}
            term.clear()
            term.writeln('\r\n\x1b[33m=== Sessão anterior não encontrada. Iniciando nova sessão limpa... ===\x1b[0m\r\n')
            setTimeout(() => {
              if (!disposed) {
                void startPty(true)
              }
            }, 300)
            return
          }

          term.write(chunk)
          termOutputBufferRef.current = (termOutputBufferRef.current + chunk).slice(-60000)
          if (saveTermTimeoutRef.current) clearTimeout(saveTermTimeoutRef.current)
          saveTermTimeoutRef.current = setTimeout(() => {
            try {
              localStorage.setItem(`cgli_term_${id}`, termOutputBufferRef.current)
            } catch (_) {}
          }, 1000)
        }
      })
      if (disposed) {
        unlisten()
        return
      }
      unlistenOutput = unlisten
      safeFit()
      await startPty()
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
      dataSub.dispose()
      unlistenOutput?.()
      if (saveTermTimeoutRef.current) clearTimeout(saveTermTimeoutRef.current)
      try {
        if (termOutputBufferRef.current) {
          localStorage.setItem(`cgli_term_${id}`, termOutputBufferRef.current)
        }
      } catch (_) {}
      term.dispose()
      terminalInstance.current = null
      fitAddonInstance.current = null
    }
  }, [id, sessionId, startPty])

  // Theme changes update the live terminal instead of rebuilding it
  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.theme = TERMINAL_THEMES[theme === 'dark' ? 'dark' : 'light']
    }
  }, [theme])

  const handleInterrupt = (e: React.MouseEvent) => {
    e.stopPropagation()
    ptyService.writePty(sessionId, '\x03').catch(() => {})
  }

  const handleRestartSession = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await ptyService.killPty(sessionId)
    if (terminalInstance.current) {
      terminalInstance.current.writeln('\r\n\x1b[33m=== Reconectando Sessão PTY... ===\x1b[0m\r\n')
    }
    // The output listener from the mount effect is still attached and keeps receiving the new session
    await startPty()
  }

  const handleNewSession = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ok = window.confirm('Deseja iniciar uma nova conversa e limpar o histórico anterior deste agente?')
    if (!ok) return

    await ptyService.killPty(sessionId)
    termOutputBufferRef.current = ''
    try {
      localStorage.removeItem(`cgli_term_${id}`)
    } catch (_) {}

    const newUuid = generateUuid()
    cliSessionIdRef.current = newUuid
    hasStartedRef.current = false

    updateNodeData(id, {
      cliSessionId: newUuid,
      hasStarted: false,
    })

    if (terminalInstance.current) {
      terminalInstance.current.clear()
      terminalInstance.current.writeln('\r\n\x1b[35m=== Nova Conversa Iniciada (Contexto Limpo) ===\x1b[0m\r\n')
    }

    await startPty(true)
  }

  const handleSendMessage = () => {
    if (!inputVal.trim()) return
    markSessionStarted()
    ptyService.writePty(sessionId, `${inputVal}\r`).catch(() => {})
    setInputVal('')
    terminalInstance.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (uploadEvent) => {
            const base64 = uploadEvent.target?.result as string
            if (base64) {
              attachImageToAgent(id, {
                id: `img-${Date.now()}`,
                url: base64,
                name: file.name || 'captura-de-tela.png',
              })
            }
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }

  return (
    <div
      className="relative w-full h-full"
      style={{
        minWidth: 440,
        minHeight: 380,
      }}
    >
      <NodeResizer
        minWidth={440}
        minHeight={380}
        isVisible={selected}
        lineClassName="!border-indigo-500 !z-40"
        handleClassName="!w-3 !h-3 !bg-white !border-2 !border-indigo-500 !rounded-xs shadow-md cursor-pointer !z-50"
        onResize={() => {
          try {
            fitAddonInstance.current?.fit()
            const term = terminalInstance.current
            if (term && term.cols > 0 && term.rows > 0) {
              ptyService.resizePty(sessionId, term.cols, term.rows).catch(() => {})
            }
          } catch (_) {}
        }}
        onResizeEnd={() => {
          try {
            fitAddonInstance.current?.fit()
            const term = terminalInstance.current
            if (term && term.cols > 0 && term.rows > 0) {
              ptyService.resizePty(sessionId, term.cols, term.rows).catch(() => {})
            }
          } catch (_) {}
        }}
      />

      {/* Target connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125 z-20"
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125 z-20"
      />
      <Handle
        type="source"
        id="left-source"
        position={Position.Left}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125 z-20"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125 z-20"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125 z-20"
      />

      <div
        className={`w-full h-full rounded-xl border shadow-xl flex flex-col overflow-hidden transition-all duration-150 select-none ${
          theme === 'dark'
            ? 'bg-[#0D1117] border-[#30363D] text-[#C9D1D9]'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
        style={{
          borderColor: selected ? accentColor : undefined,
          boxShadow: selected ? `0 0 0 2px ${accentColor}44, 0 10px 25px -5px rgba(0,0,0,0.4)` : undefined,
        }}
      >

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl shrink-0 ${
          theme === 'dark' ? 'bg-[#161B22] border-[#30363D]' : 'bg-slate-100/90 border-slate-200'
        }`}
        style={{
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-sm"
            style={{
              backgroundColor: accentLight,
              color: accentColor,
            }}
          >
            {isClaude ? <Brain className="w-4 h-4" /> : isAgy ? <Sparkles className="w-4 h-4" /> : <TerminalIcon className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs tracking-tight truncate text-slate-100">{nodeData.title}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0"
                style={{
                  backgroundColor: accentLight,
                  color: accentColor,
                }}
              >
                {nodeData.role === 'planner' ? 'Planejador' : 'Executor'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  nodeData.isPtyActive !== false
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                }`}
              />
              <span className="text-[10px] font-medium text-slate-300">
                {nodeData.isPtyActive !== false ? 'Pronto' : 'Parado'}
              </span>
              <span className="text-slate-600 text-[9px]">•</span>
              <span
                className="text-[10px] text-slate-400 truncate max-w-[180px] font-mono"
                title={workspacePath}
              >
                📁 {workspacePath.split(/[/\\]/).pop() || workspacePath}
              </span>
            </div>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => toggleAgentDiffNode(id)}
            title="Mostrar / Ocultar Diffs deste Agente"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            <GitCompare className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => stashNode(id)}
            title="Guardar no Stash"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <Archive className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover Nó"
            className="p-1.5 rounded hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Productivity Action Bar (Toolbar directly above xterm) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-[#11161F] border-[#21262D] shrink-0 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quick Enter / Confirm Button */}
          <button
            type="button"
            onClick={() => {
              markSessionStarted()
              ptyService.writePty(sessionId, '\r')
            }}
            title="Enviar Enter / Confirmar prompt atual (↵)"
            className="flex items-center gap-1 px-2.5 py-1 rounded font-semibold text-[11px] bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30 transition-all cursor-pointer shadow-xs"
          >
            <CornerDownLeft className="w-3 h-3" />
            <span>Confirmar (↵)</span>
          </button>

          {/* Up & Down Arrows for Interactive CLI menus */}
          <div className="flex items-center rounded border border-slate-700/80 bg-slate-800/80 overflow-hidden">
            <button
              type="button"
              onClick={() => ptyService.writePty(sessionId, '\x1b[A')}
              title="Seta para Cima (↑)"
              className="px-2 py-1 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border-r border-slate-700"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => ptyService.writePty(sessionId, '\x1b[B')}
              title="Seta para Baixo (↓)"
              className="px-2 py-1 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Esc Button */}
          <button
            type="button"
            onClick={() => ptyService.writePty(sessionId, '\x1b')}
            title="Enviar Esc"
            className="px-2 py-1 rounded text-[11px] font-mono border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            Esc
          </button>

          {/* Shift+Tab / Mode Switch in Claude */}
          <button
            type="button"
            onClick={() => ptyService.writePty(sessionId, '\x1b[Z')}
            title="Alternar Modo no Claude Code (⇧Tab)"
            className="px-2 py-1 rounded text-[11px] font-mono border border-slate-700/70 bg-slate-800/60 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            ⇧Tab Modo
          </button>

          {/* Ctrl+C Interrupt */}
          <button
            type="button"
            onClick={handleInterrupt}
            title="Interromper Comando (Ctrl+C)"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border border-rose-900/40 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>^C</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* New Clean Session */}
          <button
            type="button"
            onClick={handleNewSession}
            title="Nova Conversa (Limpar contexto e iniciar nova sessão)"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border border-sky-800/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Nova Conversa</span>
          </button>

          {/* Clear terminal */}
          <button
            type="button"
            onClick={() => terminalInstance.current?.clear()}
            title="Limpar buffer visual"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Reconnect PTY preserving session context */}
          <button
            type="button"
            onClick={handleRestartSession}
            title="Reconectar Sessão PTY mantendo histórico"
            className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <FolderSync className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Native xterm.js Viewport (100% visible, fully isolated from React Flow events) */}
      <div
        className="nodrag nowheel nopan flex-1 min-h-[220px] bg-[#0D1117] p-1.5 overflow-hidden flex flex-col relative"
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={() => terminalInstance.current?.focus()}
      >
        <div ref={terminalRef} className="w-full h-full" />
      </div>

      {/* Attached Images preview row (if any) */}
      {nodeData.attachedImages && nodeData.attachedImages.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161B22] border-t border-slate-800 overflow-x-auto">
          {nodeData.attachedImages.map((img) => (
            <div key={img.id} className="relative group shrink-0">
              <img
                src={img.url}
                alt={img.name}
                className="w-10 h-10 object-cover rounded border border-slate-700"
              />
              <button
                type="button"
                onClick={() => removeAttachedImage(id, img.id)}
                className="absolute -top-1 -right-1 p-0.5 bg-rose-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer: Quick Command Chips & Composer */}
      <div className="border-t bg-[#161B22] border-[#30363D] p-2 flex flex-col gap-1.5 shrink-0">
        {/* Quick Slash Command Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
          {AVAILABLE_SLASH_COMMANDS.map((sc) => (
            <button
              key={sc.cmd}
              type="button"
              onClick={() => {
                setInputVal(sc.cmd + ' ')
                inputRef.current?.focus()
              }}
              title={sc.desc}
              className="px-2.5 py-0.5 rounded-full border border-slate-700 bg-slate-800/80 hover:bg-indigo-600/30 hover:border-indigo-500 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 font-mono shadow-xs"
            >
              {sc.label}
            </button>
          ))}
        </div>

        {/* Input Composer */}
        <div className="flex items-center gap-2 bg-[#0D1117] border border-slate-700/80 rounded-lg px-2.5 py-1.5 focus-within:border-indigo-500 transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Digite um comando para o agente ou clique nos atalhos acima..."
            className="flex-1 bg-transparent text-xs text-slate-200 font-mono focus:outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!inputVal.trim()}
            title="Enviar comando (Enter)"
            className="p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white transition-all cursor-pointer shadow-xs shrink-0"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}
