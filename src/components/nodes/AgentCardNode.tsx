import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Handle, type NodeProps, Position, NodeResizer } from '@xyflow/react'
import {
  Archive,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  CornerDownLeft,
  Eye,
  FileText,
  FolderSync,
  GitCompare,
  Image as ImageIcon,
  Paperclip,
  RotateCw,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { ptyService } from '../../services/ptyService'
import { useCanvasStore } from '../../store/canvasStore'
import type {
  ActionApproval,
  AgentNodeData,
  AgentViewMode,
  ChatMessage,
} from '../../types/canvas'

interface SlashCommand {
  cmd: string
  label: string
  desc: string
  category: string
}

const AVAILABLE_SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: '/plan',
    label: '/plan',
    desc: 'Criar plano estruturado de arquitetura e implementação',
    category: 'Planejador',
  },
  {
    cmd: '/test',
    label: '/test',
    desc: 'Executar bateria de testes e validação de código',
    category: 'Qualidade',
  },
  {
    cmd: '/review',
    label: '/review',
    desc: 'Auditar mudanças recentes, identificar bugs e melhorias',
    category: 'Revisão',
  },
  {
    cmd: '/commit',
    label: '/commit',
    desc: 'Gerar mensagem semântica e preparar commit',
    category: 'Git',
  },
  {
    cmd: '/clear',
    label: '/clear',
    desc: 'Limpar histórico ou a tela do terminal',
    category: 'Manutenção',
  },
  {
    cmd: '/help',
    label: '/help',
    desc: 'Exibir comandos disponíveis e orientações do agente',
    category: 'Ajuda',
  },
]

function parseMessageContent(text: string): Array<
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; code: string }
> {
  const parts: Array<
    | { type: 'text'; content: string }
    | { type: 'code'; language: string; code: string }
  > = []
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const txt = text.slice(lastIndex, match.index).trim()
      if (txt) parts.push({ type: 'text', content: txt })
    }
    parts.push({
      type: 'code',
      language: match[1] || 'código',
      code: match[2].trim(),
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const txt = text.slice(lastIndex).trim()
    if (txt) parts.push({ type: 'text', content: txt })
  }

  if (parts.length === 0 && text.trim()) {
    parts.push({ type: 'text', content: text.trim() })
  }

  return parts
}

export const AgentCardNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as AgentNodeData
  const {
    theme,
    clis,
    getActiveWorkspacePath,
    sendAgentMessage,
    toggleAgentViewMode,
    handleApproval,
    stashNode,
    deleteNode,
    attachImageToAgent,
    removeAttachedImage,
    removeAttachedArtifact,
    toggleAgentDiffNode,
    updateNodeData,
  } = useCanvasStore()

  const [inputVal, setInputVal] = useState('')
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(
    nodeData.thinking?.isExpanded ?? false
  )
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonInstance = useRef<FitAddon | null>(null)
  const ptySpawnedRef = useRef<boolean>(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const ptyOutputBufferRef = useRef<string>('')
  const outputDebounceTimerRef = useRef<any>(null)

  const isClaude =
    nodeData.agentType?.toLowerCase().includes('claude') ||
    nodeData.title?.toLowerCase().includes('claude')
  const isAgy =
    nodeData.agentType?.toLowerCase().includes('agy') ||
    nodeData.title?.toLowerCase().includes('antigravity')

  const accentColor = isClaude ? '#EA580C' : isAgy ? '#0284C7' : '#6366F1'
  const accentLight = isClaude
    ? 'rgba(234, 88, 12, 0.12)'
    : isAgy
    ? 'rgba(2, 132, 199, 0.12)'
    : 'rgba(99, 102, 241, 0.12)'

  const sessionId = nodeData.sessionId || `pty-${id}`
  const workspacePath = nodeData.workspacePath || getActiveWorkspacePath()
  const viewMode: AgentViewMode = nodeData.viewMode || 'extension'

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

  // Initialize and manage xterm and PTY session lifecycle
  useEffect(() => {
    let unlistenOutput: (() => void) | null = null
    let unlistenExit: (() => void) | null = null
    let isDisposed = false

    if (terminalRef.current && !terminalInstance.current) {
      const term = new Terminal({
        theme:
          theme === 'dark'
            ? {
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
              }
            : {
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
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        cursorBlink: true,
        convertEol: true,
      })

      // Attach custom key event handler to isolate xterm from React Flow
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        // Stop React Flow canvas and window listeners from capturing arrow keys, Enter, Backspace, Delete, etc.
        e.stopPropagation()
        return true
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(terminalRef.current)

      terminalInstance.current = term
      fitAddonInstance.current = fitAddon

      setTimeout(() => {
        try {
          if (!isDisposed) fitAddon.fit()
        } catch (_) {}
      }, 50)

      const ro = new ResizeObserver(() => {
        try {
          if (!isDisposed && terminalRef.current) {
            fitAddon.fit()
            if (term.cols > 0 && term.rows > 0) {
              ptyService.resizePty(sessionId, term.cols, term.rows)
            }
          }
        } catch (_) {}
      })
      ro.observe(terminalRef.current)

      // Send terminal keyboard input directly to PTY stdin
      term.onData((d) => {
        ptyService.writePty(sessionId, d)
      })

      // 1. Listen for PTY output chunks BEFORE spawning so no banner is lost
      ptyService
        .onPtyOutput(sessionId, (chunk) => {
          if (!isDisposed) {
            term.write(chunk)

            // Buffer clean output text for Extension mode chat sync
            const cleanChunk = chunk.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
            ptyOutputBufferRef.current += cleanChunk

            if (outputDebounceTimerRef.current) {
              clearTimeout(outputDebounceTimerRef.current)
            }

            outputDebounceTimerRef.current = setTimeout(() => {
              const fullText = ptyOutputBufferRef.current.trim()
              if (fullText) {
                // If the node status was running, mark it idle and update thoughts
                updateNodeData(id, {
                  status: 'idle',
                  thinking: {
                    duration: '2.1s',
                    thoughts: [
                      `Processo executado no terminal (${command}).`,
                      'Saída sincronizada com sucesso.',
                    ],
                    isExpanded: false,
                  },
                })
                ptyOutputBufferRef.current = ''
              }
            }, 1800)
          }
        })
        .then((unlisten) => {
          if (!isDisposed) {
            unlistenOutput = unlisten
          } else {
            unlisten()
          }
        })

      // 2. Listen for PTY process exit
      ptyService
        .onPtyExit(sessionId, () => {
          if (!isDisposed) {
            term.writeln('\r\n\x1b[90m[Processo finalizado]\x1b[0m\r\n')
            updateNodeData(id, { isPtyActive: false, status: 'idle' })
          }
        })
        .then((unlisten) => {
          if (!isDisposed) {
            unlistenExit = unlisten
          } else {
            unlisten()
          }
        })

      // 3. Spawn native PTY directly in workspace folder
      if (!ptySpawnedRef.current) {
        ptySpawnedRef.current = true
        ptyService
          .spawnPty(sessionId, command, args, workspacePath, {
            CGLI_NODE_ID: id,
            CGLI_AGENT_ROLE: nodeData.role,
            CGLI_AGENT_TYPE: nodeData.agentType,
            CGLI_WORKSPACE_PATH: workspacePath,
          })
          .then(() => {
            if (!isDisposed) {
              updateNodeData(id, {
                sessionId,
                workspacePath,
                isPtyActive: true,
              })
              if (nodeData.initialTask) {
                const taskToSend = nodeData.initialTask
                updateNodeData(id, { initialTask: undefined })
                setTimeout(() => {
                  if (!isDisposed) {
                    ptyService.writePty(sessionId, `${taskToSend}\r`)
                  }
                }, 1800)
              }
            }
          })
          .catch((err) => {
            if (!isDisposed) {
              term.writeln(`\r\n\x1b[31m[Erro ao iniciar sessão PTY]: ${err}\x1b[0m\r\n`)
              updateNodeData(id, { isPtyActive: false })
            }
          })
      }

      return () => {
        isDisposed = true
        ro.disconnect()
        if (outputDebounceTimerRef.current) clearTimeout(outputDebounceTimerRef.current)
        if (unlistenOutput) unlistenOutput()
        if (unlistenExit) unlistenExit()
        ptyService.killPty(sessionId)
        term.dispose()
        terminalInstance.current = null
        fitAddonInstance.current = null
        ptySpawnedRef.current = false
      }
    }
  }, [id, sessionId, command, workspacePath])

  // Fit terminal whenever theme or viewMode changes
  useEffect(() => {
    if (viewMode === 'terminal') {
      setTimeout(() => {
        try {
          fitAddonInstance.current?.fit()
          if (terminalInstance.current) {
            ptyService.resizePty(
              sessionId,
              terminalInstance.current.cols,
              terminalInstance.current.rows
            )
            terminalInstance.current.focus()
          }
        } catch (_) {}
      }, 60)
    }
  }, [viewMode, theme, sessionId])

  // Auto-scroll chat to bottom when messages update in Extension view
  useEffect(() => {
    if (viewMode === 'extension') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [nodeData.messages, viewMode])

  const handleInterrupt = (e: React.MouseEvent) => {
    e.stopPropagation()
    ptyService.writePty(sessionId, '\x03')
  }

  const handleRestartSession = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await ptyService.killPty(sessionId)
    if (terminalInstance.current) {
      terminalInstance.current.clear()
      terminalInstance.current.writeln('\r\n\x1b[33m=== Reiniciando Sessão... ===\x1b[0m\r\n')
    }
    await ptyService.spawnPty(sessionId, command, args, workspacePath, {
      CGLI_NODE_ID: id,
      CGLI_AGENT_ROLE: nodeData.role,
      CGLI_AGENT_TYPE: nodeData.agentType,
      CGLI_WORKSPACE_PATH: workspacePath,
    })
    updateNodeData(id, { isPtyActive: true, status: 'idle' })
    terminalInstance.current?.focus()
  }

  // Autocomplete slash command detection
  const lastSlashIndex = inputVal.lastIndexOf('/')
  const isSlashActive =
    lastSlashIndex !== -1 &&
    (lastSlashIndex === 0 || inputVal[lastSlashIndex - 1] === ' ') &&
    !inputVal.slice(lastSlashIndex).includes(' ')

  const slashQuery = isSlashActive ? inputVal.slice(lastSlashIndex).toLowerCase() : ''
  const filteredSlashCommands = isSlashActive
    ? AVAILABLE_SLASH_COMMANDS.filter(
        (c) =>
          c.cmd.toLowerCase().startsWith(slashQuery) ||
          c.desc.toLowerCase().includes(slashQuery.replace('/', ''))
      )
    : []

  const handleSendMessage = () => {
    const text = inputVal.trim()
    const attached = nodeData.attachedImages?.map((img) => img.url)

    // If input is empty, send an Enter / newline to the PTY (useful for interactive CLI menus & prompts)
    if (!text && (!attached || attached.length === 0)) {
      ptyService.writePty(sessionId, '\r')
      if (viewMode === 'terminal') {
        terminalInstance.current?.focus()
      }
      return
    }

    if (text === '/clear') {
      if (viewMode === 'terminal') {
        terminalInstance.current?.clear()
      } else {
        updateNodeData(id, { messages: [], approvals: [], thinking: null })
      }
      setInputVal('')
      if (viewMode === 'terminal') {
        terminalInstance.current?.focus()
      }
      return
    }

    sendAgentMessage(id, text, attached)
    setInputVal('')
    if (viewMode === 'terminal') {
      terminalInstance.current?.focus()
    }
  }

  const applySlashCommand = (cmd: string) => {
    if (cmd === '/clear') {
      if (viewMode === 'terminal') {
        terminalInstance.current?.clear()
      } else {
        updateNodeData(id, { messages: [], approvals: [], thinking: null })
      }
      setInputVal('')
      return
    }
    const prefix = lastSlashIndex > 0 ? inputVal.slice(0, lastSlashIndex) : ''
    const newVal = prefix ? `${prefix}${cmd} ` : `${cmd} `
    setInputVal(newVal)
    setSelectedSlashIndex(0)
    inputRef.current?.focus()
  }

  const addSlashCommand = (cmd: string) => {
    applySlashCommand(cmd)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSlashActive && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSlashIndex(
          (prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applySlashCommand(filteredSlashCommands[selectedSlashIndex].cmd)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInputVal((prev) => prev.trimEnd() + ' ')
        return
      }
    }

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

  const copyCodeToClipboard = (code: string, blockKey: string) => {
    navigator.clipboard.writeText(code)
    setCopiedBlock(blockKey)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  return (
    <div
      className={`rounded-xl border shadow-xl flex flex-col overflow-hidden transition-all duration-150 select-none ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#C9D1D9]'
          : 'bg-white border-slate-300 text-slate-900'
      }`}
      style={{
        width: 520,
        height: 480,
        minWidth: 420,
        minHeight: 380,
        borderColor: selected ? accentColor : undefined,
        boxShadow: selected ? `0 0 0 2px ${accentColor}44, 0 10px 25px -5px rgba(0,0,0,0.3)` : undefined,
      }}
    >
      <NodeResizer
        minWidth={420}
        minHeight={380}
        isVisible={selected}
        lineClassName="border-indigo-500"
        handleClassName="h-3 w-3 bg-white border-2 border-indigo-500 rounded-xs"
        onResize={() => {
          try {
            fitAddonInstance.current?.fit()
          } catch (_) {}
        }}
      />

      {/* Target connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
      <Handle
        type="source"
        id="left-source"
        position={Position.Left}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
      <Handle
        type="target"
        id="left-target"
        position={Position.Left}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3.5 py-2 border-b rounded-t-xl shrink-0 ${
          theme === 'dark' ? 'bg-[#161B22] border-[#30363D]' : 'bg-slate-100/90 border-slate-200'
        }`}
        style={{
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
            style={{
              backgroundColor: accentLight,
              color: accentColor,
            }}
          >
            {isClaude ? 'CC' : isAgy ? 'AGY' : 'CLI'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs tracking-tight truncate">{nodeData.title}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
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
                  nodeData.status === 'running'
                    ? 'bg-amber-400 animate-ping'
                    : nodeData.isPtyActive !== false
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                }`}
              />
              <span className="text-[10px] font-medium text-slate-400">
                {nodeData.status === 'running'
                  ? 'Processando...'
                  : nodeData.isPtyActive !== false
                  ? 'Conectado'
                  : 'Parado'}
              </span>
              <span className="text-slate-600 text-[9px]">•</span>
              <span
                className="text-[9px] text-slate-400 truncate max-w-[140px]"
                title={workspacePath}
              >
                📁 {workspacePath.split(/[/\\]/).pop() || workspacePath}
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* View Mode Toggle Button */}
          <button
            type="button"
            onClick={() => {
              toggleAgentViewMode(id)
            }}
            title={
              viewMode === 'extension'
                ? 'Alternar para Terminal (PTY interativo)'
                : 'Alternar para Modo Extensão (Chat & Raciocínio)'
            }
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
          >
            {viewMode === 'extension' ? (
              <TerminalIcon className="w-3.5 h-3.5" />
            ) : (
              <Code2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Terminal-specific shortcuts */}
          {viewMode === 'terminal' && (
            <>
              <button
                type="button"
                onClick={handleInterrupt}
                title="Interromper Processo (Ctrl+C)"
                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                Ctrl+C
              </button>
              <button
                type="button"
                onClick={handleRestartSession}
                title="Reiniciar Sessão PTY"
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => toggleAgentDiffNode(id)}
            title="Mostrar / Ocultar Diffs deste Agente"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            <GitCompare className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stashNode(id)}
            title="Guardar no Stash"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover Nó"
            className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Live Interactive Terminal (Always mounted to preserve session, hidden when in Extension view) */}
      <div
        className={`nodrag nowheel nopan flex-1 w-full p-2 bg-[#0D1117] font-mono text-xs overflow-hidden flex-col min-h-0 cursor-text select-text ${
          viewMode === 'terminal' ? 'flex' : 'hidden'
        }`}
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation()
          terminalInstance.current?.focus()
        }}
        onClick={(e) => {
          e.stopPropagation()
          terminalInstance.current?.focus()
        }}
      >
        <div
          ref={terminalRef}
          className="nodrag nowheel nopan w-full flex-1 terminal-container overflow-hidden"
        />
      </div>

      {/* Body: VS Code Extension Chat Style (Modo Bonito) */}
      {viewMode === 'extension' && (
        <div className="nodrag nowheel nopan flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Thinking Accordion (Collapsible) */}
          {nodeData.thinking && (
            <div
              className={`border-b text-xs transition-colors shrink-0 ${
                theme === 'dark' ? 'border-[#21262D] bg-[#161B22]/60' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <button
                type="button"
                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                className="w-full px-3 py-1.5 flex items-center justify-between text-left text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium text-[11px]">
                    Raciocínio ({nodeData.thinking.duration})
                  </span>
                </div>
                {isThinkingExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {isThinkingExpanded && (
                <div
                  className={`px-3 pb-2 pt-1 space-y-1 text-[11px] border-t max-h-36 overflow-y-auto ${
                    theme === 'dark' ? 'border-[#21262D] text-slate-300' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  {nodeData.thinking.thoughts.map((thought, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-500/80 leading-relaxed">•</span>
                      <span className="leading-relaxed">{thought}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages & Conversation Scroll Area */}
          <div className="nodrag nowheel flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {(!nodeData.messages || nodeData.messages.length === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 dark:text-slate-500 select-none">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {nodeData.title} Pronto
                </span>
                <span className="text-[11px] mt-1 max-w-[280px] leading-relaxed">
                  Digite uma instrução abaixo ou alterne para o terminal para interagir diretamente.
                </span>
              </div>
            ) : (
              nodeData.messages.map((msg: ChatMessage) => {
                const isUser = msg.sender === 'user'
                const parsedContent = parseMessageContent(msg.text)

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-medium text-slate-400">
                        {isUser ? 'Você' : nodeData.title}
                      </span>
                      <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
                    </div>

                    {/* Attached images in message */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {msg.images.map((imgUrl, i) => (
                          <img
                            key={i}
                            src={imgUrl}
                            alt="Anexo"
                            className="w-16 h-12 object-cover rounded border border-slate-300 dark:border-slate-700"
                          />
                        ))}
                      </div>
                    )}

                    <div
                      className={`rounded-lg px-3 py-2 text-xs max-w-[92%] leading-relaxed select-text ${
                        isUser
                          ? theme === 'dark'
                            ? 'bg-[#21262D] text-[#F0F6FC] border border-[#30363D]'
                            : 'bg-slate-100 text-slate-900 border border-slate-300'
                          : theme === 'dark'
                            ? 'bg-[#161B22] text-slate-200 border border-[#30363D]'
                            : 'bg-white text-slate-800 border border-slate-300 shadow-xs'
                      }`}
                    >
                      {/* Render Parsed Content: Text & Code Blocks with Copy Button */}
                      {parsedContent.map((block, idx) => {
                        if (block.type === 'code') {
                          const blockKey = `${msg.id}-${idx}`
                          return (
                            <div
                              key={idx}
                              className="mt-2 mb-1 rounded-md overflow-hidden border border-slate-700/80 bg-[#0B0F17] text-slate-200 font-mono text-[11px]"
                            >
                              <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400">
                                <span className="font-semibold">{block.language}</span>
                                <button
                                  type="button"
                                  onClick={() => copyCodeToClipboard(block.code, blockKey)}
                                  className="flex items-center gap-1 hover:text-slate-100 transition-colors cursor-pointer"
                                >
                                  {copiedBlock === blockKey ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">Copiado</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copiar</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="p-2.5 overflow-x-auto text-[11px] leading-relaxed">
                                <code>{block.code}</code>
                              </pre>
                            </div>
                          )
                        }

                        return (
                          <p key={idx} className="whitespace-pre-wrap">
                            {block.content}
                          </p>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}

            {/* Running indicator when agent is processing and no new assistant message yet */}
            {nodeData.status === 'running' && (
              <div className="flex items-center gap-2 px-1 text-slate-400 text-xs py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px]">Agente em execução...</span>
              </div>
            )}

            {/* Action Approvals (diffs and commands requiring user decision) */}
            {nodeData.approvals &&
              nodeData.approvals.map((appr: ActionApproval) => (
                <div
                  key={appr.id}
                  className={`rounded-lg border p-2.5 text-xs shadow-xs ${
                    theme === 'dark'
                      ? 'bg-[#161B22] border-[#30363D]'
                      : 'bg-white border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold flex items-center gap-1.5 text-[11px]">
                      <FolderSync className="w-3.5 h-3.5 text-amber-500" />
                      {appr.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        appr.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : appr.status === 'rejected'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      {appr.status === 'approved'
                        ? 'Aprovado'
                        : appr.status === 'rejected'
                        ? 'Rejeitado'
                        : 'Pendente'}
                    </span>
                  </div>

                  {appr.command && (
                    <div className="font-mono text-[11px] bg-slate-950 text-slate-200 px-2 py-1 rounded mb-2 overflow-x-auto border border-slate-800">
                      $ {appr.command}
                    </div>
                  )}

                  {appr.diff && (
                    <div className="font-mono text-[10px] bg-slate-950 text-slate-300 p-2 rounded mb-2 overflow-x-auto leading-relaxed border border-slate-800 max-h-48">
                      {appr.diff.split('\n').map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.startsWith('+')
                              ? 'text-emerald-400 bg-emerald-950/40 px-1'
                              : line.startsWith('-')
                              ? 'text-rose-400 bg-rose-950/40 px-1'
                              : 'text-slate-400'
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  )}

                  {appr.status === 'pending' && (
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleApproval(id, appr.id, 'rejected')}
                        className="px-2.5 py-1 rounded text-[11px] font-medium text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproval(id, appr.id, 'approved')}
                        className="px-3 py-1 rounded text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        Aprovar
                      </button>
                    </div>
                  )}
                </div>
              ))}

            <div ref={chatBottomRef} />
          </div>
        </div>
      )}

      {/* Attached Image and Artifact Badges */}
      {((nodeData.attachedImages && nodeData.attachedImages.length > 0) ||
        (nodeData.attachedArtifacts && nodeData.attachedArtifacts.length > 0)) && (
        <div
          className={`px-3 py-1.5 border-t flex items-center gap-2 overflow-x-auto shrink-0 ${
            theme === 'dark' ? 'border-[#21262D] bg-[#161B22]/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
            <Paperclip className="w-3 h-3" /> Anexos:
          </span>
          {nodeData.attachedImages?.map((img) => (
            <div
              key={img.id}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border shrink-0 ${
                theme === 'dark'
                  ? 'bg-[#21262D] border-[#30363D] text-slate-200'
                  : 'bg-white border-slate-300 text-slate-800 shadow-xs'
              }`}
            >
              <ImageIcon className="w-2.5 h-2.5 text-slate-400" />
              <span className="truncate max-w-[90px]">{img.name}</span>
              <button
                type="button"
                onClick={() => removeAttachedImage(id, img.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {nodeData.attachedArtifacts?.map((art) => (
            <div
              key={art.id}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border shrink-0 ${
                art.type === 'artifact'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
              }`}
            >
              {art.type === 'artifact' ? (
                <FileText className="w-2.5 h-2.5 text-indigo-400" />
              ) : (
                <Eye className="w-2.5 h-2.5 text-cyan-400" />
              )}
              <span className="truncate max-w-[110px]" title={art.title}>
                {art.title}
              </span>
              <button
                type="button"
                onClick={() => removeAttachedArtifact(id, art.id)}
                className="text-slate-400 hover:text-rose-400 ml-0.5 cursor-pointer"
                title="Desanexar"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input & Quick Slash Command Shortcuts */}
      <div
        className={`p-2.5 border-t rounded-b-xl relative shrink-0 ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        {/* Slash Command Autocomplete Popover */}
        {isSlashActive && filteredSlashCommands.length > 0 && (
          <div
            className={`absolute bottom-full mb-1.5 left-2.5 right-2.5 rounded-lg shadow-xl border overflow-hidden z-50 ${
              theme === 'dark'
                ? 'bg-[#161B22] border-[#30363D] text-[#F0F6FC]'
                : 'bg-white border-slate-300 text-slate-900 shadow-md'
            }`}
          >
            <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 border-b border-inherit flex items-center justify-between">
              <span>Comandos Disponíveis</span>
              <span className="text-[9px] font-normal text-slate-400">↑↓ navegar • Enter selecionar</span>
            </div>
            <div className="max-h-44 overflow-y-auto py-1">
              {filteredSlashCommands.map((cmd, idx) => {
                const isSelected = idx === selectedSlashIndex
                return (
                  <button
                    key={cmd.cmd}
                    type="button"
                    onClick={() => applySlashCommand(cmd.cmd)}
                    onMouseEnter={() => setSelectedSlashIndex(idx)}
                    className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? theme === 'dark'
                          ? 'bg-indigo-600/30 text-indigo-300'
                          : 'bg-indigo-50 text-indigo-700 font-medium'
                        : theme === 'dark'
                        ? 'hover:bg-[#21262D] text-slate-300'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold">{cmd.cmd}</span>
                    <span className="text-[10px] text-slate-400">{cmd.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick Slash Commands */}
        <div className="flex items-center gap-1 mb-2 overflow-x-auto text-[10px]">
          {['/plan', '/test', '/review', '/commit', '/clear', '/help'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => addSlashCommand(cmd)}
              className={`px-2 py-0.5 rounded transition-colors font-mono font-medium cursor-pointer ${
                theme === 'dark'
                  ? 'bg-[#21262D] text-slate-300 hover:bg-[#30363D]'
                  : 'bg-slate-200/90 text-slate-700 hover:bg-slate-300 border border-slate-300/60'
              }`}
            >
              {cmd}
            </button>
          ))}
        </div>

        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value)
              setSelectedSlashIndex(0)
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              viewMode === 'terminal'
                ? 'Digitar no terminal ou pressionar Enter para confirmar...'
                : 'Instruir agente... (Ctrl+V para prints)'
            }
            className={`w-full text-xs rounded-lg px-3 py-2 pr-9 border transition-colors focus:outline-hidden ${
              theme === 'dark'
                ? 'bg-[#161B22] border-[#30363D] text-[#F0F6FC] placeholder-slate-500 focus:border-indigo-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 shadow-xs'
            }`}
          />
          <button
            type="button"
            onClick={handleSendMessage}
            title={
              inputVal.trim()
                ? 'Enviar instrução ao agente'
                : 'Pressione para confirmar prompt no terminal (Enter)'
            }
            className="absolute right-1.5 p-1.5 rounded-md text-white hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center"
            style={{ backgroundColor: accentColor }}
          >
            {inputVal.trim() ? (
              <ArrowRight className="w-3.5 h-3.5" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Source connection handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
      <Handle
        type="source"
        id="right-source"
        position={Position.Right}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
      <Handle
        type="target"
        id="right-target"
        position={Position.Right}
        className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-slate-900 rounded-full cursor-crosshair transition-transform hover:scale-125"
      />
    </div>
  )
}
