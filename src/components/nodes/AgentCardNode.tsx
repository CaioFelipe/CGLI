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
  ChevronUp,
  Copy,
  CornerDownLeft,
  Eye,
  FileText,
  FolderSync,
  GitCompare,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  RotateCw,
  Sparkles,
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

export function cleanPtyOutput(raw: string): string {
  if (!raw) return ''

  // 1. Remove OSC escape sequences (\x1b] ... \x07 or \x1b\)
  let text = raw.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')

  // 2. Remove CSI escape sequences (\x1b[ ... letter)
  text = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')

  // 3. Remove simple escape sequences (\x1b=, \x1b>, etc.)
  text = text.replace(/\x1b[=><()#]/g, '')

  // 4. Remove bell and control characters (except newline \n and carriage return \r)
  text = text.replace(/[\x07\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

  // 5. Handle carriage returns (\r) without \n (line overwrites from spinners / progress bars)
  const lines = text.split('\n').map((line) => {
    if (!line.includes('\r')) return line
    const segments = line.split('\r').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : ''
  })

  return lines.join('\n')
}

export function cleanResponseText(raw: string, promptSent?: string): string {
  let cleaned = cleanPtyOutput(raw).trim()

  if (promptSent && promptSent.trim()) {
    const trimmedPrompt = promptSent.trim()
    if (cleaned.startsWith(trimmedPrompt)) {
      cleaned = cleaned.slice(trimmedPrompt.length).trim()
    }
  }

  // Remove trailing prompt character (e.g. `>` or `$` or `❯`) if on its own line at the end
  cleaned = cleaned.replace(/(\r?\n|\s)*(>|❯|\$|#)\s*$/g, '')

  // Remove initial CLI banners or safety warnings if at the top
  const lines = cleaned.split('\n')
  while (lines.length > 0) {
    const first = lines[0].trim()
    if (
      first.startsWith('Quick safety check:') ||
      first.startsWith('Welcome to Claude Code') ||
      first.startsWith('╭─') ||
      first.startsWith('╰─') ||
      first.startsWith('│') ||
      first.startsWith('Warning: no stdin data received')
    ) {
      lines.shift()
    } else {
      break
    }
  }

  return lines.join('\n').trim()
}

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
      const txt = text.slice(lastIndex, match.index)
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
    const txt = text.slice(lastIndex)
    if (txt) parts.push({ type: 'text', content: txt })
  }

  if (parts.length === 0 && text.trim()) {
    parts.push({ type: 'text', content: text })
  }

  return parts
}

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[11px] border border-slate-700/60"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function renderMarkdownText(text: string): React.ReactNode {
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        if (line.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-bold text-xs mt-2 mb-1 text-slate-200">
              {line.replace(/^###\s+/, '')}
            </h4>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={idx} className="font-bold text-sm mt-2.5 mb-1 text-slate-100">
              {line.replace(/^##\s+/, '')}
            </h3>
          )
        }
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const content = line.trim().replace(/^[-*]\s+/, '')
          return (
            <div key={idx} className="flex items-start gap-1.5 my-0.5 ml-1">
              <span className="text-indigo-400 leading-relaxed">•</span>
              <span className="leading-relaxed">{formatInline(content)}</span>
            </div>
          )
        }
        const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/)
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 my-0.5 ml-1">
              <span className="text-indigo-400 font-mono text-[10px] shrink-0 mt-0.5">
                {numMatch[1]}.
              </span>
              <span className="leading-relaxed">{formatInline(numMatch[2])}</span>
            </div>
          )
        }
        if (!line.trim()) {
          return <div key={idx} className="h-1.5" />
        }
        return (
          <p key={idx} className="leading-relaxed my-0.5">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

export const AgentCardNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as AgentNodeData
  const {
    theme,
    clis,
    getActiveWorkspacePath,
    sendAgentMessage,
    setAgentViewMode,
    clearAgentMessages,
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

  // Stream output synchronization refs
  const ptyBufferRef = useRef<string>('')
  const activePromptRef = useRef<string>('')
  const startTimeRef = useRef<number>(Date.now())
  const debounceTimerRef = useRef<any>(null)

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

      // Listen for PTY output chunks and stream to both xterm and Extension chat
      ptyService
        .onPtyOutput(sessionId, (chunk) => {
          if (!isDisposed) {
            // Write raw chunk to xterm
            term.write(chunk)

            // Buffer raw text for assistant chat response
            ptyBufferRef.current += chunk

            // Clear previous debounce timer
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current)
            }

            // Clean the accumulated buffer for the chat view
            const currentCleaned = cleanResponseText(ptyBufferRef.current, activePromptRef.current)

            // If the node is running and we have an assistant message placeholder, stream live!
            const currentMessages = nodeData.messages || []
            const lastMsg = currentMessages[currentMessages.length - 1]

            if (lastMsg && lastMsg.sender === 'agent' && nodeData.status === 'running') {
              if (currentCleaned && currentCleaned !== lastMsg.text) {
                const updated = currentMessages.map((m, idx) =>
                  idx === currentMessages.length - 1
                    ? { ...m, text: currentCleaned, isStreaming: true }
                    : m
                )
                updateNodeData(id, { messages: updated })
              }
            } else if (currentCleaned && nodeData.status === 'running') {
              // If no assistant message exists yet, create one
              const newMsg: ChatMessage = {
                id: `msg-agent-${Date.now()}`,
                sender: 'agent',
                text: currentCleaned,
                timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                isStreaming: true,
              }
              updateNodeData(id, { messages: [...currentMessages, newMsg] })
            }

            // Debounce timer: when output settles for 1200ms, finalize the response
            debounceTimerRef.current = setTimeout(() => {
              const finalCleaned = cleanResponseText(ptyBufferRef.current, activePromptRef.current)
              const msgs = nodeData.messages || []
              const finalLast = msgs[msgs.length - 1]

              const durationSec = `${((Date.now() - startTimeRef.current) / 1000).toFixed(1)}s`

              if (finalLast && finalLast.sender === 'agent') {
                const updated = msgs.map((m, idx) =>
                  idx === msgs.length - 1
                    ? {
                        ...m,
                        text: finalCleaned || '(Execução concluída no terminal)',
                        isStreaming: false,
                      }
                    : m
                )
                updateNodeData(id, {
                  messages: updated,
                  status: 'idle',
                  thinking: {
                    duration: durationSec,
                    thoughts: [
                      `Executado pelo modelo ${nodeData.title} em ${durationSec}.`,
                      'Resposta gerada e sincronizada com sucesso.',
                    ],
                    isExpanded: false,
                  },
                })
              } else if (finalCleaned) {
                const newMsg: ChatMessage = {
                  id: `msg-agent-${Date.now()}`,
                  sender: 'agent',
                  text: finalCleaned,
                  timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                  isStreaming: false,
                }
                updateNodeData(id, {
                  messages: [...msgs, newMsg],
                  status: 'idle',
                  thinking: {
                    duration: durationSec,
                    thoughts: [
                      `Executado pelo modelo ${nodeData.title} em ${durationSec}.`,
                      'Resposta sincronizada.',
                    ],
                    isExpanded: false,
                  },
                })
              } else {
                updateNodeData(id, { status: 'idle' })
              }

              ptyBufferRef.current = ''
              activePromptRef.current = ''
            }, 1400)
          }
        })
        .then((unlisten) => {
          if (!isDisposed) {
            unlistenOutput = unlisten
          } else {
            unlisten()
          }
        })

      // Listen for PTY process exit
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

      // Spawn native PTY directly in workspace folder
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
                    activePromptRef.current = taskToSend
                    startTimeRef.current = Date.now()
                    sendAgentMessage(id, taskToSend)
                  }
                }, 1500)
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
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
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
      terminalInstance.current.writeln('\r\n\x1b[33m=== Reiniciando Sessão PTY... ===\x1b[0m\r\n')
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

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearAgentMessages(id)
  }

  const handleSwitchViewMode = (mode: AgentViewMode) => {
    setAgentViewMode(id, mode)
    if (mode === 'terminal') {
      setTimeout(() => {
        try {
          fitAddonInstance.current?.fit()
          terminalInstance.current?.focus()
        } catch (_) {}
      }, 50)
    }
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

  const handleSendMessage = (overrideText?: string) => {
    const rawText = overrideText !== undefined ? overrideText : inputVal
    const text = rawText.trim()
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
        clearAgentMessages(id)
      }
      setInputVal('')
      if (viewMode === 'terminal') {
        terminalInstance.current?.focus()
      }
      return
    }

    // Set tracking refs for stream synchronization
    activePromptRef.current = text
    ptyBufferRef.current = ''
    startTimeRef.current = Date.now()

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
        clearAgentMessages(id)
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
        width: 560,
        height: 520,
        minWidth: 440,
        minHeight: 400,
        borderColor: selected ? accentColor : undefined,
        boxShadow: selected ? `0 0 0 2px ${accentColor}44, 0 10px 25px -5px rgba(0,0,0,0.3)` : undefined,
      }}
    >
      <NodeResizer
        minWidth={440}
        minHeight={400}
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
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-xs"
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
                  ? 'Processando resposta...'
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

        {/* Header Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
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

      {/* Segmented Mode Switcher (Conversa vs Terminal PTY) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-slate-100/70 dark:bg-[#11161F] border-slate-200 dark:border-[#21262D] shrink-0">
        <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-[#161B22] p-0.5 rounded-lg border border-slate-300/80 dark:border-[#30363D]">
          <button
            type="button"
            onClick={() => handleSwitchViewMode('extension')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'extension'
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Conversa</span>
            {nodeData.messages && nodeData.messages.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[9px] bg-slate-200 dark:bg-indigo-700/80 text-slate-700 dark:text-white">
                {nodeData.messages.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSwitchViewMode('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'terminal'
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>Terminal PTY</span>
          </button>
        </div>

        {viewMode === 'terminal' ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => ptyService.writePty(sessionId, '\r')}
              title="Enviar Enter ao prompt do terminal"
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1"
            >
              <CornerDownLeft className="w-2.5 h-2.5" /> Enter
            </button>
            <button
              type="button"
              onClick={() => ptyService.writePty(sessionId, '\x1b[A')}
              title="Seta Cima (Navegar menu)"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => ptyService.writePty(sessionId, '\x1b[B')}
              title="Seta Baixo (Navegar menu)"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
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
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {nodeData.messages && nodeData.messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                title="Limpar mensagens da conversa"
                className="text-[10px] text-slate-400 hover:text-rose-400 px-2 py-0.5 rounded hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                Limpar chat
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body: Live Interactive Terminal (Always mounted to preserve session, hidden when in Conversa view) */}
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

      {/* Body: VS Code Extension Chat Style (Conversa) */}
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
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 shadow-sm"
                  style={{ backgroundColor: accentLight, color: accentColor }}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Como posso ajudar você hoje?
                </span>
                <span className="text-[11px] mt-1 max-w-[280px] leading-relaxed text-slate-400">
                  Faça uma pergunta sobre o código ou selecione uma ação rápida:
                </span>
                <div className="mt-3 flex flex-col gap-1.5 w-full max-w-[320px]">
                  {[
                    'Explique a arquitetura e pastas deste projeto',
                    'Escreva testes unitários para os módulos principais',
                    'Crie um plano de refatoração para os componentes',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendMessage(suggestion)}
                      className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      💡 {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              nodeData.messages.map((msg: ChatMessage) => {
                const isUser = msg.sender === 'user'
                const isStreaming = msg.isStreaming && (!msg.text || !msg.text.trim())
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
                      className={`rounded-lg px-3 py-2 text-xs max-w-[94%] leading-relaxed select-text ${
                        isUser
                          ? theme === 'dark'
                            ? 'bg-[#21262D] text-[#F0F6FC] border border-[#30363D]'
                            : 'bg-slate-100 text-slate-900 border border-slate-300'
                          : theme === 'dark'
                            ? 'bg-[#161B22] text-slate-200 border border-[#30363D]'
                            : 'bg-white text-slate-800 border border-slate-300 shadow-xs'
                      }`}
                    >
                      {isStreaming ? (
                        <div className="flex items-center gap-2 py-1 px-0.5 text-slate-400">
                          <span className="flex gap-1 items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                          <span className="text-[11px] text-slate-400">Pensando na resposta...</span>
                        </div>
                      ) : (
                        <>
                          {/* Render Parsed Content: Text & Code Blocks with Copy Button */}
                          {parsedContent.map((block, idx) => {
                            if (block.type === 'code') {
                              const blockKey = `${msg.id}-${idx}`
                              return (
                                <div
                                  key={idx}
                                  className="mt-2 mb-1.5 rounded-md overflow-hidden border border-slate-700/80 bg-[#0B0F17] text-slate-200 font-mono text-[11px]"
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

                            return <div key={idx}>{renderMarkdownText(block.content)}</div>
                          })}

                          {/* Subtle blinking cursor when message is actively streaming */}
                          {msg.isStreaming && msg.text && (
                            <span className="inline-block w-1.5 h-3 ml-0.5 bg-indigo-400 animate-pulse align-middle" />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })
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
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
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
              onClick={() => applySlashCommand(cmd)}
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
                : 'Instruir agente... (Ctrl+V para colar prints)'
            }
            className={`w-full text-xs rounded-lg px-3 py-2 pr-9 border transition-colors focus:outline-hidden ${
              theme === 'dark'
                ? 'bg-[#161B22] border-[#30363D] text-[#F0F6FC] placeholder-slate-500 focus:border-indigo-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 shadow-xs'
            }`}
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
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
