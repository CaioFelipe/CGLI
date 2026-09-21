import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  FileCode2,
  GitCompare,
  Lock,
  Trash2,
} from 'lucide-react'
import React from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { DiffNodeData } from '../../types/canvas'

export const DiffNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as DiffNodeData
  const { theme, deleteNode } = useCanvasStore()

  const accentColor = '#10B981' // Emerald accent for code diffs

  const lines = nodeData.lines || []
  const additions =
    nodeData.stats?.additions ?? lines.filter((l) => l.type === 'add').length
  const deletions =
    nodeData.stats?.deletions ?? lines.filter((l) => l.type === 'remove').length

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col ${
        selected ? 'ring-2 ring-emerald-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 420,
        minHeight: 300,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      <NodeResizer
        minWidth={420}
        minHeight={300}
        isVisible={selected}
        lineClassName="!border-emerald-500"
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-emerald-500 !rounded-xs"
      />

      {/* Target handle connected to parent agent - isConnectable={false} prevents linking to other agents */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!bg-emerald-500"
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!bg-emerald-500"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!bg-emerald-500"
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!bg-emerald-500"
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
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-emerald-500/15 text-emerald-500">
            <GitCompare className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight">{nodeData.title || 'Diff de Código'}</span>
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                +{additions} / -{deletions}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Lock className="w-2.5 h-2.5 text-amber-400" />
              <span>
                {nodeData.parentAgentTitle
                  ? `Vinculado a ${nodeData.parentAgentTitle} (Exclusivo)`
                  : 'Vinculado ao Agente'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Fechar Visualização de Diff"
            className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* File Bar */}
      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
        <span className="flex items-center gap-1.5 truncate">
          <FileCode2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-medium text-slate-200">{nodeData.filename || 'Nenhum arquivo modificado'}</span>
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">Unified Diff</span>
      </div>

      {/* Diff Content Lines with Full Event Isolation */}
      <div
        className="nodrag nowheel nopan flex-1 min-h-0 overflow-auto overscroll-contain select-text cursor-text p-2 bg-[#0B0F17] font-mono text-[11px]"
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="min-w-max space-y-0.5">
          {lines.length === 0 ? (
            <div className="h-full flex items-center justify-center p-4 text-slate-500 text-xs text-center font-sans">
              Nenhuma alteração pendente ou registrada para este agente.
            </div>
          ) : (
            lines.map((line, idx) => {
              const isAdd = line.type === 'add'
              const isRemove = line.type === 'remove'
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2 px-2 py-0.5 rounded-xs transition-colors ${
                    isAdd
                      ? 'bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500'
                      : isRemove
                      ? 'bg-rose-950/50 text-rose-300 border-l-2 border-rose-500'
                      : 'text-slate-400'
                  }`}
                >
                  <span className="w-4 text-center select-none text-[10px] opacity-60 shrink-0">
                    {isAdd ? '+' : isRemove ? '-' : ' '}
                  </span>
                  <span className="whitespace-pre leading-relaxed">{line.content}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Footer warning on linking */}
      <div
        className={`px-3 py-1.5 border-t rounded-b-xl flex items-center justify-between text-[10px] ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        <span className="flex items-center gap-1 text-amber-500/90 font-medium">
          <Lock className="w-3 h-3" /> Exclusivo do agente pai (não vinculável a outros agentes)
        </span>
        <span className="text-slate-500 font-mono">
          {lines.length} linha{lines.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
