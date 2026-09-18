import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  Archive,
  Check,
  Code,
  Eye,
  FileCode2,
  FileText,
  Play,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { ArtifactNodeData } from '../../types/canvas'

export const ArtifactViewerNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ArtifactNodeData
  const { theme, updateNodeData, approveArtifact, stashNode, deleteNode } = useCanvasStore()
  const [iframeKey, setIframeKey] = useState(0)

  const accentColor = '#6366F1'
  const activeTab = nodeData.activeTab || 'markdown'

  const handleTabChange = (tab: 'markdown' | 'preview' | 'diff') => {
    updateNodeData(id, { activeTab: tab })
  }

  const renderMarkdown = (content: string) => {
    // Parse GitHub alerts and markdown structure cleanly
    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let inAlert: { type: string; title: string; lines: string[] } | null = null
    let inCodeBlock: { lang: string; lines: string[] } | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <div
              key={`code-${i}`}
              className="my-2 rounded-md bg-[#0B0F17] text-slate-200 p-2.5 font-mono text-[11px] overflow-x-auto border border-slate-800"
            >
              <div className="text-[10px] text-slate-500 mb-1">{inCodeBlock.lang}</div>
              <pre>
                <code>{inCodeBlock.lines.join('\n')}</code>
              </pre>
            </div>
          )
          inCodeBlock = null
        } else {
          inCodeBlock = { lang: line.replace('```', '').trim(), lines: [] }
        }
        continue
      }

      if (inCodeBlock) {
        inCodeBlock.lines.push(line)
        continue
      }

      // GitHub Alerts: > [!IMPORTANT], > [!NOTE], > [!TIP]
      if (line.startsWith('> [!')) {
        const typeMatch = line.match(/> \[!([A-Z]+)\]/)
        if (typeMatch) {
          inAlert = { type: typeMatch[1], title: typeMatch[1], lines: [] }
          continue
        }
      }

      if (inAlert) {
        if (line.startsWith('>')) {
          inAlert.lines.push(line.replace(/^>\s?/, ''))
          continue
        } else {
          // Flush alert
          const alertColor =
            inAlert.type === 'IMPORTANT'
              ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200'
              : inAlert.type === 'WARNING'
              ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
              : 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-950 dark:text-blue-200'

          elements.push(
            <div
              key={`alert-${i}`}
              className={`p-2.5 my-2 border-l-3 rounded-r-md text-xs ${alertColor}`}
            >
              <div className="font-semibold text-[11px] uppercase tracking-wider mb-0.5">
                {inAlert.title}
              </div>
              <div className="text-slate-800 dark:text-slate-300">{inAlert.lines.join(' ')}</div>
            </div>
          )
          inAlert = null
        }
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={i} className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-2 mb-1">
            {line.replace('### ', '')}
          </h3>
        )
      } else if (line.startsWith('#### ')) {
        elements.push(
          <h4 key={i} className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 mt-1.5 mb-1">
            {line.replace('#### ', '')}
          </h4>
        )
      } else if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) {
        const checked = line.startsWith('- [x] ')
        const text = line.replace(/- \[[x ]\] /, '')
        elements.push(
          <div key={i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 my-0.5">
            <input
              type="checkbox"
              readOnly
              checked={checked}
              className="rounded accent-indigo-600"
            />
            <span className={checked ? 'line-through text-slate-400 dark:text-slate-500' : ''}>{text}</span>
          </div>
        )
      } else if (line.trim().length > 0) {
        elements.push(
          <p key={i} className="text-xs text-slate-700 dark:text-slate-300 my-1 leading-relaxed">
            {line}
          </p>
        )
      }
    }

    // Flush any trailing alert
    if (inAlert) {
      elements.push(
        <div
          key="alert-tail"
          className="p-2.5 my-2 border-l-3 rounded-r-md text-xs border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200"
        >
          <div className="font-semibold text-[11px] uppercase tracking-wider mb-0.5">
            {inAlert.title}
          </div>
          <div className="text-slate-800 dark:text-slate-300">{inAlert.lines.join(' ')}</div>
        </div>
      )
    }

    return elements
  }

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col ${
        selected ? 'ring-2 ring-indigo-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 400,
        minHeight: 320,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      {/* NodeResizer for interactive resizing */}
      <NodeResizer
        minWidth={400}
        minHeight={320}
        isVisible={selected}
        lineClassName="!border-indigo-500"
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-indigo-500 !rounded-xs"
      />
      {/* Handles: Top, Left, Right, Bottom with explicit IDs and dual directions */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-slate-400 dark:!bg-slate-400"
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
        className="!bg-slate-400 dark:!bg-slate-400"
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
        className="!bg-slate-400 dark:!bg-slate-400"
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
        className="!bg-slate-400 dark:!bg-slate-400"
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
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-indigo-500/15 text-indigo-500">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight">{nodeData.title}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  nodeData.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                }`}
              >
                {nodeData.status === 'approved' ? 'Aprovado' : 'Revisão'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
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

      {/* Tab Navigation */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b text-xs ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleTabChange('markdown')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'markdown'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3 h-3" />
            Documento
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'preview'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Eye className="w-3 h-3" />
            Web Preview
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('diff')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'diff'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Code className="w-3 h-3" />
            Diff de Código
          </button>
        </div>

        {activeTab === 'preview' && (
          <button
            type="button"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Recarregar Preview"
            className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 min-h-[220px] p-3 overflow-y-auto">
        {activeTab === 'markdown' && (
          <div className="text-xs space-y-1">
            {renderMarkdown(nodeData.markdownContent || 'Nenhum documento gerado.')}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="w-full h-full rounded-lg border border-slate-700 overflow-hidden bg-slate-950">
            <iframe
              key={iframeKey}
              title="Preview Sandbox"
              sandbox="allow-scripts allow-same-origin"
              srcDoc={nodeData.htmlPreview || '<h3>Sem conteúdo de preview</h3>'}
              className="w-full h-full border-0"
            />
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="font-mono text-[11px] rounded-lg border border-slate-800 bg-[#0B0F17] overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <FileCode2 className="w-3 h-3 text-indigo-400" />
                {nodeData.diffContent?.filename || 'arquivo.diff'}
              </span>
              <span>Unified Diff</span>
            </div>
            <div className="p-2 space-y-0.5 overflow-x-auto">
              {nodeData.diffContent?.lines?.map((line, idx) => {
                const isAdd = line.type === 'add'
                const isRemove = line.type === 'remove'
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 px-1.5 py-0.5 rounded-xs ${
                      isAdd
                        ? 'bg-emerald-950/40 text-emerald-400'
                        : isRemove
                        ? 'bg-rose-950/40 text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="w-4 text-center select-none text-[9px] opacity-60">
                      {isAdd ? '+' : isRemove ? '-' : ' '}
                    </span>
                    <span className="whitespace-pre">{line.content}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        className={`px-3 py-2 border-t rounded-b-xl flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="text-[10px] text-slate-400">
          {nodeData.status === 'approved' ? (
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <Check className="w-3 h-3" /> Plano aprovado e despachado
            </span>
          ) : (
            'Aprovar para avançar execução aos nós conectados'
          )}
        </div>

        <button
          type="button"
          onClick={() => approveArtifact(id)}
          disabled={nodeData.status === 'approved'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-xs"
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
