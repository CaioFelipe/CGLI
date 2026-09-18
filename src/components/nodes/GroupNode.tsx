import { Handle, type NodeProps, Position } from '@xyflow/react'
import {
  Edit2,
  FolderArchive,
  Layers,
  Trash2,
  Ungroup,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { GroupNodeData } from '../../types/canvas'

export const GroupNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as GroupNodeData
  const { theme, stashGroup, ungroupNodes, deleteNode, updateNodeData } = useCanvasStore()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [title, setTitle] = useState(nodeData.title || 'Novo Grupo de Nós')

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    updateNodeData(id, { title })
  }

  const memberCount = nodeData.nodeIds?.length || 0

  return (
    <div
      className={`relative rounded-2xl border-2 transition-all duration-150 ${
        selected ? 'ring-2 ring-indigo-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#080C14]/60 border-indigo-500/50 shadow-2xl shadow-indigo-950/20'
          : 'bg-indigo-50/70 border-indigo-300 shadow-md shadow-indigo-100/60'
      }`}
      style={{
        width: nodeData.width || 560,
        height: nodeData.height || 420,
        minWidth: 320,
        minHeight: 220,
      }}
    >
      {/* Handles */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-indigo-500 hover:!scale-125"
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-indigo-500 hover:!scale-125"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-indigo-500 hover:!scale-125"
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 hover:!scale-125"
      />

      {/* Group Header Bar */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl border-b backdrop-blur-sm ${
          theme === 'dark'
            ? 'bg-[#0D1117]/90 border-indigo-500/30 text-slate-100'
            : 'bg-white border-indigo-200 text-slate-900 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Layers className="w-4 h-4" />
          </div>

          {isEditingTitle ? (
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
              className="px-2 py-0.5 text-xs font-bold rounded bg-slate-800 text-white border border-indigo-500 focus:outline-hidden"
            />
          ) : (
            <div
              className="flex items-center gap-1.5 cursor-pointer group/title"
              onClick={() => setIsEditingTitle(true)}
              title="Clique para renomear o grupo"
            >
              <span className="font-bold text-xs tracking-tight">{title}</span>
              <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
            </div>
          )}

          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
            {memberCount} nós agrupados
          </span>
        </div>

        {/* Group Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stashGroup(id)}
            title="Guardar Grupo Completo no Stash"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Guardar no Stash</span>
          </button>

          <button
            type="button"
            onClick={() => ungroupNodes(id)}
            title="Desagrupar nós"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Ungroup className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Excluir Grupo"
            className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
