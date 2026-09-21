import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  Check,
  Copy,
  Edit3,
  Eye,
  FileText,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { ArtifactNodeData } from '../../types/canvas'
import { MarkdownView } from '../common/MarkdownView'

export const ArtifactNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ArtifactNodeData
  const { theme, approveArtifact, deleteNode } = useCanvasStore()
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(nodeData.markdownContent || '')

  const accentColor = '#6366F1'

  const handleCopy = () => {
    navigator.clipboard.writeText(nodeData.markdownContent || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col overflow-hidden ${
        selected ? 'ring-2 ring-indigo-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 420,
        minHeight: 320,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      <NodeResizer
        minWidth={420}
        minHeight={320}
        isVisible={selected}
        lineClassName="!border-indigo-500"
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-indigo-500 !rounded-xs"
      />

      {/* Handles: Top, Left, Right, Bottom with dual directions for linking */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-indigo-400 dark:!bg-indigo-400"
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
        className="!bg-indigo-400 dark:!bg-indigo-400"
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
        className="!bg-indigo-400 dark:!bg-indigo-400"
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
        className="!bg-indigo-400 dark:!bg-indigo-400"
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
          theme === 'dark' ? 'bg-[#161B22]/90 border-[#21262D]' : 'bg-slate-50/90 border-slate-200'
        }`}
        style={{
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-indigo-500/15 text-indigo-400">
            <FileText className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight">{nodeData.title || 'Documento de Artefato'}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  nodeData.status === 'approved'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                    : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60'
                }`}
              >
                {nodeData.status === 'approved' ? 'Aprovado' : 'Revisão'}
              </span>
            </div>
            {nodeData.parentAgentTitle && (
              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                <span>Gerado por {nodeData.parentAgentTitle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Copiado!' : 'Copiar Markdown'}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            title={isEditing ? 'Visualizar Markdown' : 'Editar Documento'}
            className={`p-1.5 rounded transition-colors ${
              isEditing
                ? 'bg-indigo-600 text-white'
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover Nó"
            className="p-1.5 rounded hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content Area with Complete Event Isolation for Mouse Scroll & Text Selection */}
      <div
        className="nodrag nowheel nopan flex-1 min-h-0 overflow-y-auto overscroll-contain select-text cursor-text p-4 bg-[#0D1117]"
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="nodrag nowheel nopan w-full h-full min-h-[220px] bg-[#090D13] text-slate-200 font-mono text-xs p-3 rounded-lg border border-slate-700/80 resize-none focus:outline-none focus:border-indigo-500 leading-relaxed"
            placeholder="Edite o conteúdo em Markdown..."
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <MarkdownView source={nodeData.markdownContent || 'Nenhum documento gerado.'} />
        )}
      </div>

      {/* Footer Actions */}
      <div
        className={`px-3.5 py-2.5 border-t rounded-b-xl flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="text-[11px] text-slate-400">
          {nodeData.status === 'approved' ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Check className="w-3.5 h-3.5" /> Aprovado e pronto para execução
            </span>
          ) : (
            'Revise o documento antes de avançar'
          )}
        </div>

        <button
          type="button"
          onClick={() => approveArtifact(id)}
          disabled={nodeData.status === 'approved'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-sm"
        >
          {nodeData.status === 'approved' ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Aprovado
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              Aprovar e Executar
            </>
          )}
        </button>
      </div>
    </div>
  )
}
