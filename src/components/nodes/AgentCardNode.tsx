import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import {
  Archive,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  FolderSync,
  GitFork,
  Image as ImageIcon,
  Paperclip,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { ActionApproval, AgentNodeData, ChatMessage } from '../../types/canvas'

export const AgentCardNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as AgentNodeData
  const {
    theme,
    sendAgentMessage,
    toggleAgentViewMode,
    handleApproval,
    stashNode,
    deleteNode,
    attachImageToAgent,
    removeAttachedImage,
    spawnSubagent,
  } = useCanvasStore()

  const [inputVal, setInputVal] = useState('')
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(
    nodeData.thinking?.isExpanded ?? false
  )

  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonInstance = useRef<FitAddon | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const isClaude = nodeData.agentType === 'claude'
  const accentColor = isClaude ? '#EA580C' : '#0284C7'
  const accentLight = isClaude ? 'rgba(234, 88, 12, 0.1)' : 'rgba(2, 132, 199, 0.1)'

  // Initialize and update xterm when in terminal view
  useEffect(() => {
    if (nodeData.viewMode === 'terminal' && terminalRef.current) {
      if (!terminalInstance.current) {
        const term = new Terminal({
          theme:
            theme === 'dark'
              ? {
                  background: '#0D1117',
                  foreground: '#C9D1D9',
                  cursor: '#58A6FF',
                  selectionBackground: '#1F6FEB44',
                }
              : {
                  background: '#F1F5F9',
                  foreground: '#1E293B',
                  cursor: '#0284C7',
                  selectionBackground: '#0284C722',
                },
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          cursorBlink: true,
          convertEol: true,
        })
        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(terminalRef.current)
        fitAddon.fit()

        term.writeln(`\x1b[1;36m=== ${nodeData.title} Terminal ===\x1b[0m`)
        term.writeln(`\x1b[90mPapel ativo: ${nodeData.role === 'planner' ? 'Planejador' : 'Executor'}\x1b[0m`)
        term.writeln('')

        nodeData.terminalLogs?.forEach((log) => {
          term.writeln(log)
        })

        terminalInstance.current = term
        fitAddonInstance.current = fitAddon
      } else {
        fitAddonInstance.current?.fit()
      }
    }

    return () => {
      if (terminalInstance.current && nodeData.viewMode !== 'terminal') {
        terminalInstance.current.dispose()
        terminalInstance.current = null
        fitAddonInstance.current = null
      }
    }
  }, [nodeData.viewMode, theme, nodeData.title, nodeData.role, nodeData.terminalLogs])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nodeData.messages])

  const handleSendMessage = () => {
    if (!inputVal.trim() && (!nodeData.attachedImages || nodeData.attachedImages.length === 0)) return
    const attached = nodeData.attachedImages?.map((img) => img.url)
    sendAgentMessage(id, inputVal.trim(), attached)
    setInputVal('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Paste image directly into the node input
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (uploadEvent) => {
            const result = uploadEvent.target?.result as string
            if (result) {
              attachImageToAgent(id, {
                id: `img-${Date.now()}`,
                url: result,
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

  const addSlashCommand = (cmd: string) => {
    setInputVal((prev) => (prev ? `${prev} ${cmd} ` : `${cmd} `))
  }

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 shadow-md ${
        selected ? 'ring-2' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#111827] border-slate-800 text-slate-100 shadow-black/40'
          : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
      }`}
      style={{
        width: 440,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 dark:!bg-slate-600"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-400 dark:!bg-slate-600"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400 dark:!bg-slate-600"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 dark:!bg-slate-600"
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl"
        style={{
          borderBottomColor: theme === 'dark' ? '#1F2937' : '#F1F5F9',
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
            style={{
              backgroundColor: accentLight,
              color: accentColor,
            }}
          >
            {isClaude ? 'CC' : 'AGY'}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight">{nodeData.title}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: accentLight,
                  color: accentColor,
                }}
              >
                {nodeData.role === 'planner' ? 'Planejador' : 'Executor'}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  nodeData.status === 'running'
                    ? 'bg-amber-500 animate-pulse'
                    : nodeData.status === 'error'
                    ? 'bg-rose-500'
                    : 'bg-emerald-500'
                }`}
              />
              <span className="text-[10px] text-slate-400">
                {nodeData.status === 'running'
                  ? 'Processando...'
                  : nodeData.status === 'waiting_approval'
                  ? 'Aguardando Aprovação'
                  : 'Pronto'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
          {/* Subagent Spawn Button */}
          <button
            type="button"
            onClick={() => spawnSubagent(id, isClaude ? 'agy' : 'claude')}
            title={isClaude ? 'Spawnar Subagente AGY conectado' : 'Spawnar Subagente Claude conectado'}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border shadow-2xs mr-1"
            style={{
              borderColor: isClaude ? '#0284C7' : '#EA580C',
              color: isClaude ? '#0284C7' : '#EA580C',
              backgroundColor: isClaude ? 'rgba(2, 132, 199, 0.08)' : 'rgba(234, 88, 12, 0.08)',
            }}
          >
            <GitFork className="w-3 h-3" />
            <span>+ Subagente {isClaude ? 'AGY' : 'Claude'}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleAgentViewMode(id)}
            title={nodeData.viewMode === 'extension' ? 'Mudar para Terminal' : 'Mudar para Chat Interativo'}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
          >
            {nodeData.viewMode === 'extension' ? (
              <TerminalIcon className="w-3.5 h-3.5" />
            ) : (
              <Code2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => stashNode(id)}
            title="Guardar no Stash"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover Nó"
            className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Terminal View */}
      {nodeData.viewMode === 'terminal' ? (
        <div className="h-72 w-full p-2 bg-[#0D1117] rounded-b-xl font-mono text-xs overflow-hidden">
          <div ref={terminalRef} className="w-full h-full terminal-container" />
        </div>
      ) : (
        /* Body: VS Code Extension Chat Style */
        <div className="flex flex-col h-80">
          {/* Thinking Accordion (Collapsible) */}
          {nodeData.thinking && (
            <div
              className={`border-b text-xs transition-colors ${
                theme === 'dark' ? 'border-slate-800/80 bg-slate-900/40' : 'border-slate-100 bg-slate-50/60'
              }`}
            >
              <button
                type="button"
                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                className="w-full px-3 py-1.5 flex items-center justify-between text-left text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
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
                <div className="px-3 pb-2 pt-1 space-y-1 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
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
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {nodeData.messages.map((msg: ChatMessage) => {
              const isUser = msg.sender === 'user'
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-medium text-slate-400">
                      {isUser ? 'Você' : nodeData.title}
                    </span>
                    <span className="text-[9px] text-slate-400">{msg.timestamp}</span>
                  </div>

                  {/* Attached images in message */}
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {msg.images.map((imgUrl, i) => (
                        <img
                          key={i}
                          src={imgUrl}
                          alt="Anexo"
                          className="w-16 h-12 object-cover rounded border border-slate-200 dark:border-slate-700"
                        />
                      ))}
                    </div>
                  )}

                  <div
                    className={`rounded-lg px-3 py-2 text-xs max-w-[90%] leading-relaxed ${
                      isUser
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-normal'
                        : 'bg-slate-50 dark:bg-slate-900/90 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {/* Code Blocks */}
                    {msg.codeBlocks?.map((cb, idx) => {
                      const blockKey = `${msg.id}-${idx}`
                      return (
                        <div
                          key={idx}
                          className="mt-2 rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0B0F17] text-slate-200 font-mono text-[11px]"
                        >
                          <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400">
                            <span>{cb.language}</span>
                            <button
                              type="button"
                              onClick={() => copyCodeToClipboard(cb.code, blockKey)}
                              className="flex items-center gap-1 hover:text-slate-100 transition-colors"
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
                          <pre className="p-2.5 overflow-x-auto text-[11px] leading-relaxed text-slate-300">
                            <code>{cb.code}</code>
                          </pre>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Action Approvals (Diffs or Commands) */}
            {nodeData.approvals &&
              nodeData.approvals.map((appr: ActionApproval) => (
                <div
                  key={appr.id}
                  className="rounded-lg border p-2.5 text-xs bg-slate-50/90 dark:bg-slate-900/70 border-amber-500/30 shadow-xs"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[11px] flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                      <FolderSync className="w-3.5 h-3.5 text-amber-500" />
                      {appr.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        appr.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : appr.status === 'rejected'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
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
                    <div className="font-mono text-[11px] bg-slate-950 text-slate-200 px-2 py-1 rounded mb-2 overflow-x-auto">
                      $ {appr.command}
                    </div>
                  )}

                  {appr.diff && (
                    <div className="font-mono text-[10px] bg-slate-950 text-slate-300 p-2 rounded mb-2 overflow-x-auto leading-relaxed">
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
                        className="px-2.5 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproval(id, appr.id, 'approved')}
                        className="px-3 py-1 rounded text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1 shadow-xs"
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

          {/* Attached Image Badges */}
          {nodeData.attachedImages && nodeData.attachedImages.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Anexos:
              </span>
              {nodeData.attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 text-[10px] border border-slate-200 dark:border-slate-700"
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
            </div>
          )}

          {/* Input & Slash Command Shortcuts */}
          <div
            className="p-2 border-t rounded-b-xl"
            style={{
              borderColor: theme === 'dark' ? '#1F2937' : '#F1F5F9',
              backgroundColor: theme === 'dark' ? '#0F172A' : '#FAFAFA',
            }}
          >
            {/* Quick Slash Commands & Spawn Subagent */}
            <div className="flex items-center justify-between gap-1 mb-1.5 overflow-x-auto text-[10px]">
              <div className="flex items-center gap-1">
                {['/plan', '/test', '/review', '/commit'].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => addSlashCommand(cmd)}
                    className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors font-mono"
                  >
                    {cmd}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => spawnSubagent(id, isClaude ? 'agy' : 'claude')}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors border shrink-0"
                style={{
                  borderColor: isClaude ? '#0284C7' : '#EA580C',
                  color: isClaude ? '#0284C7' : '#EA580C',
                  backgroundColor: isClaude ? 'rgba(2, 132, 199, 0.08)' : 'rgba(234, 88, 12, 0.08)',
                }}
              >
                <GitFork className="w-2.5 h-2.5" />
                <span>+ Subagente {isClaude ? 'AGY' : 'Claude'}</span>
              </button>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Instruir agente... (Ctrl+V para prints)"
                className="w-full text-xs rounded-lg px-3 py-2 pr-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-slate-400 dark:focus:border-slate-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-colors"
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!inputVal.trim() && (!nodeData.attachedImages || nodeData.attachedImages.length === 0)}
                className="absolute right-1.5 p-1 rounded-md text-white disabled:opacity-30 transition-opacity"
                style={{ backgroundColor: accentColor }}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
