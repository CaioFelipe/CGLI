import { Handle, type NodeProps, Position, NodeResizer } from '@xyflow/react'
import {
  Edit2,
  FolderArchive,
  Layers,
  Trash2,
  Ungroup,
  Plus,
  X,
  Maximize2,
  Check,
  Bot,
  Sparkles,
  FileCode2,
  Image as ImageIcon,
  FolderKanban,
  Eye,
  GitCompare,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { GroupNodeData } from '../../types/canvas'

export const GroupNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as GroupNodeData
  const {
    theme,
    nodes,
    stashGroup,
    ungroupNodes,
    deleteNode,
    updateNodeData,
    addNodeToGroup,
    removeNodeFromGroup,
    autoFitGroup,
    toggleGroupReactive,
    setGroupResizing,
    updateGroupDimensions,
  } = useCanvasStore()

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [title, setTitle] = useState(nodeData.title || 'Novo Grupo de Nós')
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    updateNodeData(id, { title })
  }

  const isReactive = nodeData.isReactive !== false
  const isDragOver = Boolean(nodeData.isDragOver)
  const memberIds = nodeData.nodeIds || []
  const memberNodes = nodes.filter((n) => memberIds.includes(n.id))
  const candidateNodes = nodes.filter((n) => n.id !== id && n.type !== 'groupNode')

  const getNodeIcon = (type?: string, agentType?: string) => {
    if (type === 'agentNode') {
      return agentType === 'claude' ? (
        <Bot className="w-3 h-3 text-orange-500" />
      ) : (
        <Sparkles className="w-3 h-3 text-sky-500" />
      )
    }
    if (type === 'artifactNode') return <FileCode2 className="w-3 h-3 text-indigo-400" />
    if (type === 'previewNode') return <Eye className="w-3 h-3 text-cyan-400" />
    if (type === 'diffNode') return <GitCompare className="w-3 h-3 text-emerald-400" />
    if (type === 'imageNode') return <ImageIcon className="w-3 h-3 text-rose-400" />
    if (type === 'imageGroupNode') return <FolderKanban className="w-3 h-3 text-pink-400" />
    return <Layers className="w-3 h-3 text-slate-400" />
  }

  return (
    <div
      className={`relative rounded-2xl border-2 transition-all duration-150 flex flex-col ${
        isDragOver
          ? 'ring-4 ring-indigo-500/70 border-indigo-400 bg-indigo-500/15 shadow-indigo-500/30 shadow-2xl scale-[1.005]'
          : selected
          ? 'ring-2 ring-indigo-500 border-indigo-500'
          : ''
      } ${
        theme === 'dark'
          ? 'bg-[#080C14]/60 border-indigo-500/50 shadow-2xl shadow-indigo-950/20'
          : 'bg-indigo-50/70 border-indigo-300 shadow-md shadow-indigo-100/60'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 340,
        minHeight: 240,
      }}
    >
      {/* Drop zone feedback overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-indigo-600/15 backdrop-blur-[2px] border-2 border-dashed border-indigo-400 rounded-2xl flex items-center justify-center pointer-events-none z-30 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs shadow-2xl flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span>Solte para adicionar ao grupo</span>
          </div>
        </div>
      )}
      {/* NodeResizer from @xyflow/react */}
      <NodeResizer
        minWidth={340}
        minHeight={240}
        isVisible={selected}
        lineClassName="!border-indigo-500 !z-40"
        handleClassName="!w-3 !h-3 !bg-white !border-2 !border-indigo-500 !rounded-xs shadow-md cursor-pointer !z-50"
        onResizeStart={() => {
          setGroupResizing(id, true)
          updateNodeData(id, { isReactive: false, isResizing: true })
        }}
        onResize={(_, params) => {
          updateNodeData(id, {
            width: Math.round(params.width),
            height: Math.round(params.height),
            isReactive: false,
            isResizing: true,
          })
        }}
        onResizeEnd={(_, params) => {
          setGroupResizing(id, false)
          updateGroupDimensions(id, Math.round(params.width), Math.round(params.height), {
            x: Math.round(params.x),
            y: Math.round(params.y),
          })
        }}
      />

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
        className={`flex items-center justify-between px-3.5 py-2.5 rounded-t-xl border-b backdrop-blur-sm relative z-20 ${
          theme === 'dark'
            ? 'bg-[#0D1117]/95 border-indigo-500/30 text-slate-100'
            : 'bg-white/95 border-indigo-200 text-slate-900 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold shrink-0">
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
              className="flex items-center gap-1.5 cursor-pointer group/title truncate"
              onClick={() => setIsEditingTitle(true)}
              title="Clique para renomear o grupo"
            >
              <span className="font-bold text-xs tracking-tight truncate max-w-[140px]">{title}</span>
              <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
            </div>
          )}

          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 shrink-0">
            {memberIds.length} nós
          </span>
        </div>

        {/* Group Actions */}
        <div className="flex items-center gap-1.5 shrink-0 relative">
          {/* Mode Toggle Button: Reactive vs Manual */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleGroupReactive(id)
            }}
            title={
              isReactive
                ? 'Auto-Ajuste Reativo: Ativado (a moldura acompanha nós automaticamente)'
                : 'Tamanho Manual: Ativado (clique para ligar o Auto-Ajuste Reativo)'
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
              isReactive
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600/40 hover:bg-slate-700/80'
            }`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>{isReactive ? '⚡ Reativo' : '📐 Manual'}</span>
          </button>

          {/* Add Nodes Button */}
          <button
            type="button"
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            title="Adicionar ou remover nós deste grupo"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
          >
            <Plus className="w-3 h-3" />
            <span>Adicionar Nós</span>
          </button>

          {/* Add Nodes Popover */}
          {isAddMenuOpen && (
            <div
              className={`absolute right-0 top-full mt-1.5 w-64 rounded-xl border shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 ${
                theme === 'dark'
                  ? 'bg-[#111827] border-[#30363D] text-[#F0F6FC]'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400 border-b border-inherit mb-1 flex items-center justify-between">
                <span>Nós do Canvas</span>
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {candidateNodes.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {candidateNodes.map((cNode) => {
                    const isMember = memberIds.includes(cNode.id)
                    const nodeTitle = (cNode.data as any)?.title || (cNode.data as any)?.name || cNode.id
                    const agentType = (cNode.data as any)?.agentType

                    return (
                      <button
                        key={cNode.id}
                        type="button"
                        onClick={() => {
                          if (isMember) {
                            removeNodeFromGroup(id, cNode.id)
                          } else {
                            addNodeToGroup(id, cNode.id)
                          }
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          isMember
                            ? theme === 'dark'
                              ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-500/30'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : theme === 'dark'
                              ? 'hover:bg-[#1E293B] text-slate-300'
                              : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                          {getNodeIcon(cNode.type, agentType)}
                          <span className="truncate text-[11px] font-medium">{nodeTitle}</span>
                        </div>
                        {isMember ? (
                          <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 font-semibold shrink-0">
                            <Check className="w-3 h-3" /> No Grupo
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[10px] text-indigo-400 font-semibold shrink-0">
                            <Plus className="w-3 h-3" /> Incluir
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-slate-400">
                  Nenhum outro nó no canvas para agrupar.
                </div>
              )}
            </div>
          )}

          {/* Auto-Fit Button */}
          {memberIds.length > 0 && (
            <button
              type="button"
              onClick={() => autoFitGroup(id)}
              title="Ajustar moldura aos nós membros"
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => stashGroup(id)}
            title="Guardar Grupo Completo no Stash"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FolderArchive className="w-3.5 h-3.5" />
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

      {/* Member Node Badges Bar */}
      {memberNodes.length > 0 && (
        <div
          className={`px-3 py-1.5 border-b flex items-center gap-1.5 overflow-x-auto relative z-10 ${
            theme === 'dark' ? 'bg-[#0D1117]/70 border-indigo-500/20' : 'bg-white/70 border-indigo-100'
          }`}
        >
          <span className="text-[10px] text-slate-400 font-semibold shrink-0">Membros:</span>
          {memberNodes.map((mNode) => {
            const mTitle = (mNode.data as any)?.title || (mNode.data as any)?.name || mNode.id
            const agentType = (mNode.data as any)?.agentType

            return (
              <div
                key={mNode.id}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border shrink-0 transition-colors ${
                  theme === 'dark'
                    ? 'bg-[#161B22] border-[#30363D] text-slate-200'
                    : 'bg-white border-slate-300 text-slate-800 shadow-xs'
                }`}
              >
                {getNodeIcon(mNode.type, agentType)}
                <span className="truncate max-w-[90px] font-medium">{mTitle}</span>
                <button
                  type="button"
                  onClick={() => removeNodeFromGroup(id, mNode.id)}
                  title="Remover deste grupo"
                  className="text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Group Canvas Area */}
      {memberNodes.length === 0 ? (
        <div className="flex-1 w-full flex flex-col items-center justify-center p-6 text-center pointer-events-none select-none opacity-40">
          <Layers className="w-8 h-8 text-indigo-400 mb-2" />
          <span className="text-xs font-semibold text-slate-300">Moldura de Grupo Vazia</span>
          <span className="text-[10px] text-slate-400 mt-1 max-w-[220px]">
            Arraste nós para dentro desta moldura ou clique em "+ Adicionar Nós" para agrupar
          </span>
        </div>
      ) : (
        <div className="flex-1 w-full pointer-events-none" />
      )}
    </div>
  )
}
