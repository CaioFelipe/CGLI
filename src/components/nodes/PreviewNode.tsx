import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  ExternalLink,
  Eye,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { PreviewNodeData } from '../../types/canvas'

export const PreviewNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as PreviewNodeData
  const { theme, deleteNode } = useCanvasStore()
  const [iframeKey, setIframeKey] = useState(0)

  const accentColor = '#06B6D4' // Cyan / Sky accent for Preview

  const openInNewWindow = () => {
    if (!nodeData.htmlPreview) return
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(nodeData.htmlPreview)
      win.document.close()
    }
  }

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col ${
        selected ? 'ring-2 ring-cyan-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 420,
        minHeight: 340,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      <NodeResizer
        minWidth={420}
        minHeight={340}
        isVisible={selected}
        lineClassName="!border-cyan-500"
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-cyan-500 !rounded-xs"
      />

      {/* Handles for connecting to other agents as attachment/mention */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-cyan-400 dark:!bg-cyan-400"
      />
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        className="!opacity-0"
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-cyan-400 dark:!bg-cyan-400"
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className="!opacity-0"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-cyan-400 dark:!bg-cyan-400"
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className="!opacity-0"
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-cyan-400 dark:!bg-cyan-400"
      />
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        className="!opacity-0"
      />

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl ${
          theme === 'dark' ? 'bg-[#161B22]/80 border-[#21262D]' : 'bg-slate-50/90 border-slate-200'
        }`}
        style={{
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-cyan-500/15 text-cyan-500">
            <Eye className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight">{nodeData.title || 'Web Preview'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                Sandbox
              </span>
            </div>
            {nodeData.parentAgentTitle && (
              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                <span>Gerado por {nodeData.parentAgentTitle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Recarregar Preview"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-500 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={openInNewWindow}
            title="Abrir em Nova Aba"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-500 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
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

      {/* Preview Sandbox Area with Event Isolation & Security Sandbox */}
      <div
        className="nodrag nowheel nopan flex-1 min-h-0 p-2.5 overflow-hidden flex flex-col relative"
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="w-full flex-1 rounded-lg border border-slate-700/80 overflow-hidden bg-slate-950 shadow-inner">
          <iframe
            key={iframeKey}
            title="Web Sandbox"
            sandbox="allow-scripts"
            srcDoc={nodeData.htmlPreview || '<div style="font-family:sans-serif;padding:24px;color:#94a3b8;background:#0D1117;min-height:100vh"><h3>Aguardando conteúdo de preview...</h3></div>'}
            className="w-full h-full border-0"
          />
        </div>
      </div>

      {/* Footer info */}
      <div
        className={`px-3 py-1.5 border-t rounded-b-xl flex items-center justify-between text-[10px] text-slate-400 ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span>Preview isolado e interativo</span>
        <span className="font-mono">iframe sandbox</span>
      </div>
    </div>
  )
}
