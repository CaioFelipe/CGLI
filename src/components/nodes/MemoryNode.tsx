import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  Brain,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Tag,
  Trash2,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { MemoryNodeData } from '../../types/canvas'
import { MarkdownView } from '../common/MarkdownView'
import { memoryFetch } from '../../services/memoryService'

export const MemoryNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as MemoryNodeData
  const { theme, deleteNode } = useCanvasStore()
  const [copied, setCopied] = useState(false)

  const isGlobal = nodeData.scope === 'global'
  const accentColor = isGlobal ? '#10B981' : '#6366F1' // Esmeralda para global, Índigo para local

  const handleCopy = () => {
    navigator.clipboard.writeText(nodeData.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenObsidian = async () => {
    try {
      await memoryFetch('/api/memory/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: nodeData.scope || 'project',
          file: nodeData.relativePath || ''
        })
      })
    } catch (_) {
      // Fallback para deep link nativo se falhar
      const vaultName = isGlobal ? 'CGLI_Global' : 'CGLI'
      const fileParam = nodeData.relativePath ? encodeURIComponent(nodeData.relativePath.replace(/\.md$/, '')) : ''
      window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${fileParam}`, '_blank')
    }
  }

  const getTypeLabel = (type?: string) => {
    switch (type) {
      case 'decision': return 'Decisão (ADR)'
      case 'learning': return 'Aprendizado'
      case 'knowledge': return 'Conhecimento'
      case 'rule':
      case 'preference': return 'Regra / Preferência'
      case 'task': return 'Tarefa'
      case 'entity': return 'Entidade'
      default: return 'Nota de Memória'
    }
  }

  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'decision': return 'bg-amber-500/15 text-amber-500 border-amber-500/30'
      case 'learning': return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
      case 'knowledge': return 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30'
      case 'rule':
      case 'preference': return 'bg-purple-500/15 text-purple-500 border-purple-500/30'
      default: return 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30'
    }
  }

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col overflow-hidden ${
        selected ? 'ring-2' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 380,
        minHeight: 280,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      <NodeResizer
        minWidth={380}
        minHeight={280}
        isVisible={selected}
        lineClassName={isGlobal ? '!border-emerald-500' : '!border-indigo-500'}
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-emerald-500 !rounded-xs"
      />

      {/* Handles para conectar ao agente */}
      <Handle id="top" type="target" position={Position.Top} className={isGlobal ? '!bg-emerald-400' : '!bg-indigo-400'} />
      <Handle id="top-source" type="source" position={Position.Top} className="!opacity-0" />
      <Handle id="left" type="target" position={Position.Left} className={isGlobal ? '!bg-emerald-400' : '!bg-indigo-400'} />
      <Handle id="left-source" type="source" position={Position.Left} className="!opacity-0" />
      <Handle id="right" type="source" position={Position.Right} className={isGlobal ? '!bg-emerald-400' : '!bg-indigo-400'} />
      <Handle id="right-target" type="target" position={Position.Right} className="!opacity-0" />
      <Handle id="bottom" type="source" position={Position.Bottom} className={isGlobal ? '!bg-emerald-400' : '!bg-indigo-400'} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} className="!opacity-0" />

      {/* Cabeçalho */}
      <div
        className={`px-3.5 py-2.5 border-b flex items-center justify-between shrink-0 select-none ${
          theme === 'dark' ? 'bg-[#161B22] border-[#30363D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isGlobal
                ? 'bg-emerald-500/20 text-emerald-500'
                : 'bg-indigo-500/20 text-indigo-500'
            }`}
          >
            {isGlobal ? <Globe className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                  isGlobal
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30'
                }`}
              >
                {isGlobal ? 'Vault Global' : 'Vault Local'}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getTypeColor(nodeData.noteType)}`}>
                {getTypeLabel(nodeData.noteType)}
              </span>
            </div>
            <h3 className="text-xs font-semibold truncate leading-tight mt-0.5 max-w-[200px]" title={nodeData.title}>
              {nodeData.title || 'Nota de Memória'}
            </h3>
          </div>
        </div>

        {/* Botões de Ação do Cabeçalho */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenObsidian}
            title="Abrir no aplicativo Obsidian"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-600/15 text-purple-400 hover:bg-purple-600/25 border border-purple-500/30 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="text-[10px] hidden sm:inline">Obsidian</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="Copiar conteúdo"
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover do canvas"
            className="p-1.5 rounded hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tags Chips */}
      {nodeData.tags && nodeData.tags.length > 0 && (
        <div className={`px-3.5 py-1.5 flex items-center gap-1.5 flex-wrap border-b text-[11px] ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-100/60 border-slate-200'
        }`}>
          <Tag className="w-3 h-3 text-slate-400 shrink-0" />
          {nodeData.tags.map((tag, idx) => (
            <span key={idx} className="px-1.5 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Conteúdo Markdown */}
      <div className="flex-1 overflow-y-auto p-4 text-xs font-sans leading-relaxed">
        <MarkdownView source={nodeData.content || ''} />
      </div>

      {/* Rodapé com info do arquivo */}
      <div className={`px-3 py-1.5 border-t text-[10px] text-slate-400 flex items-center justify-between shrink-0 ${
        theme === 'dark' ? 'bg-[#161B22] border-[#30363D]' : 'bg-slate-50 border-slate-200'
      }`}>
        <span className="truncate max-w-[240px]" title={nodeData.relativePath || ''}>
          {nodeData.relativePath || (nodeData.id ? `ID: ${nodeData.id}` : 'Memória Obsidian')}
        </span>
        {nodeData.author && (
          <span>Agente: {nodeData.author}</span>
        )}
      </div>
    </div>
  )
}
