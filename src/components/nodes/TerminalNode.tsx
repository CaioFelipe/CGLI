import { FitAddon } from '@xterm/addon-fit'
import { type ITheme, Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import { Eraser, RotateCw, Square, SquareTerminal, Trash2 } from 'lucide-react'
import React, { useCallback, useEffect, useRef } from 'react'
import { ptyService } from '../../services/ptyService'
import { useCanvasStore } from '../../store/canvasStore'
import type { TerminalNodeData } from '../../types/canvas'

const ACCENT = '#0078D4'

// Classic Windows PowerShell look (blue background + Campbell ANSI palette), kept in both app themes
const POWERSHELL_THEME: ITheme = {
  background: '#012456',
  foreground: '#EEEDF0',
  cursor: '#EEEDF0',
  selectionBackground: '#FFFFFF55',
  black: '#0C0C0C',
  red: '#C50F1F',
  green: '#13A10E',
  yellow: '#C19C00',
  blue: '#3B78FF',
  magenta: '#B4009E',
  cyan: '#3A96DD',
  white: '#CCCCCC',
  brightBlack: '#767676',
  brightRed: '#E74856',
  brightGreen: '#16C60C',
  brightYellow: '#F9F1A5',
  brightBlue: '#6EA0FF',
  brightMagenta: '#D670D6',
  brightCyan: '#61D6D6',
  brightWhite: '#F2F2F2',
}

// A spawn over a live session kills the old process, whose reader then emits a stale `pty-exit`.
// Exit events arriving this soon after a spawn belong to the replaced process, not the new shell.
const STALE_EXIT_WINDOW_MS = 1500

export const TerminalNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as TerminalNodeData
  const theme = useCanvasStore((s) => s.theme)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)

  const sessionId = nodeData.sessionId || `pty-${id}`
  const isActive = nodeData.isPtyActive !== false

  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ignoreExitUntilRef = useRef(0)

  // Latest launch config, read at spawn time so the xterm effect only depends on node identity.
  const workspacePathRef = useRef(nodeData.workspacePath)
  useEffect(() => {
    workspacePathRef.current = nodeData.workspacePath
  })

  const startPty = useCallback(async () => {
    const term = termRef.current
    ignoreExitUntilRef.current = Date.now() + STALE_EXIT_WINDOW_MS
    try {
      await ptyService.spawnPty(sessionId, 'powershell.exe', ['-NoLogo'], workspacePathRef.current, {
        CGLI_NODE_ID: id,
      })
      updateNodeData(id, { isPtyActive: true })

      // The PTY is created at 80x24; push the real size as soon as it exists.
      const fit = fitRef.current
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
      console.error('Failed to spawn PowerShell PTY:', err)
      term?.writeln(`\r\n\x1b[31mFalha ao iniciar o PowerShell: ${String(err)}\x1b[0m`)
      updateNodeData(id, { isPtyActive: false })
    }
  }, [id, sessionId, updateNodeData])

  // xterm + listeners + PTY spawn. Mounted once per node; torn down only on real unmount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let unlistenOutput: (() => void) | undefined
    let unlistenExit: (() => void) | undefined

    const term = new Terminal({
      theme: POWERSHELL_THEME,
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
    termRef.current = term
    fitRef.current = fitAddon

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

    const dataSub = term.onData((d) => {
      ptyService.writePty(sessionId, d).catch(() => {})
    })

    void (async () => {
      // Listeners must be registered (awaited) BEFORE spawning, otherwise the first
      // frames of output can be emitted before anyone is listening.
      const offOutput = await ptyService.onPtyOutput(sessionId, (chunk) => {
        if (!disposed) term.write(chunk)
      })
      if (disposed) {
        offOutput()
        return
      }
      unlistenOutput = offOutput

      const offExit = await ptyService.onPtyExit(sessionId, () => {
        if (disposed || Date.now() < ignoreExitUntilRef.current) return
        term.writeln('\r\n\x1b[33m[Processo encerrado]\x1b[0m')
        updateNodeData(id, { isPtyActive: false })
      })
      if (disposed) {
        offExit()
        return
      }
      unlistenExit = offExit

      safeFit()
      await startPty()
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      ro.disconnect()
      dataSub.dispose()
      unlistenOutput?.()
      unlistenExit?.()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [id, sessionId, startPty, updateNodeData])

  const handleInterrupt = () => {
    ptyService.writePty(sessionId, '\x03').catch(() => {})
    termRef.current?.focus()
  }

  const handleClear = () => {
    termRef.current?.clear()
    termRef.current?.focus()
  }

  const handleRestart = async () => {
    termRef.current?.writeln('\r\n\x1b[33m=== Reiniciando PowerShell... ===\x1b[0m\r\n')
    // spawn replaces (and kills) the previous process for this session id
    await startPty()
  }

  const iconButton =
    'p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors'

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 420,
        minHeight: 260,
        borderColor: selected ? ACCENT : undefined,
        boxShadow: selected ? `0 0 0 2px ${ACCENT}` : undefined,
      }}
    >
      <NodeResizer
        minWidth={420}
        minHeight={260}
        isVisible={selected}
        lineClassName="!border-blue-500"
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-blue-500 !rounded-xs"
      />

      {/* Single source handle so nodes created from this terminal via `cgli` get a rendered edge */}
      <Handle id="right" type="source" position={Position.Right} className="!bg-blue-500" />

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl ${
          theme === 'dark' ? 'bg-[#161B22]/80 border-[#21262D]' : 'bg-slate-50/90 border-slate-200'
        }`}
        style={{ borderTop: `3px solid ${ACCENT}` }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/15 text-blue-500">
            <SquareTerminal className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs tracking-tight">{nodeData.title || 'PowerShell'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              PowerShell
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={handleInterrupt} title="Interromper (Ctrl+C)" className={`${iconButton} hover:text-amber-500`}>
            <Square className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={handleClear} title="Limpar tela" className={`${iconButton} hover:text-blue-500`}>
            <Eraser className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={handleRestart} title="Reiniciar PowerShell" className={`${iconButton} hover:text-blue-500`}>
            <RotateCw className="w-3.5 h-3.5" />
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

      {/* xterm viewport, isolated from React Flow pan / zoom / drag */}
      <div
        className="nodrag nowheel nopan flex-1 min-h-0 overflow-hidden relative"
        style={{ backgroundColor: POWERSHELL_THEME.background }}
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div ref={containerRef} className="absolute inset-0 px-2 py-1.5" />
      </div>

      {/* Footer */}
      <div
        className={`px-3 py-1.5 border-t rounded-b-xl flex items-center justify-between gap-3 text-[10px] text-slate-400 ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-500'}`} />
          {isActive ? 'Pronto' : 'Encerrado'}
        </span>
        <span className="font-mono truncate" title={nodeData.workspacePath}>
          {nodeData.workspacePath || ''}
        </span>
      </div>
    </div>
  )
}
