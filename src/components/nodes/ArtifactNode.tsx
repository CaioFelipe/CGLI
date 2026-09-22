import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  Check,
  Columns2,
  Copy,
  Edit3,
  Eye,
  FileText,
  MessageSquare,
  MessageSquarePlus,
  Play,
  Quote,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { ArtifactComment, ArtifactNodeData } from '../../types/canvas'
import {
  caretAtPoint,
  clearHighlights,
  getSelectionAnchor,
  resolveAnchorRange,
  scrollWithin,
  setHighlights,
  type TextAnchor,
} from '../../utils/textAnchors'
import { MarkdownView } from '../common/MarkdownView'

type ArtifactTab = 'document' | 'comments' | 'split'

const formatCommentTime = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const ArtifactNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ArtifactNodeData
  const { theme, approveArtifact, deleteNode, addArtifactComment, deleteArtifactComment, updateNodeData } =
    useCanvasStore()
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(nodeData.markdownContent || '')
  const [commentText, setCommentText] = useState('')

  const comments: ArtifactComment[] = nodeData.comments || []
  const isApproved = nodeData.status === 'approved'
  const activeTab: ArtifactTab =
    nodeData.activeTab === 'comments' || nodeData.activeTab === 'split' ? nodeData.activeTab : 'document'
  const setActiveTab = (tab: ArtifactTab) => updateNodeData(id, { activeTab: tab })

  // --- Passage-anchored comments -------------------------------------------------------------
  const docRef = useRef<HTMLDivElement>(null) // scroll container of the document pane
  const docTextRef = useRef<HTMLDivElement>(null) // wraps the rendered markdown: root of the text offsets
  const commentsListRef = useRef<HTMLDivElement>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const rangeMapRef = useRef<Map<string, Range>>(new Map())
  const [selectionBtn, setSelectionBtn] = useState<{ top: number; left: number; anchor: TextAnchor } | null>(null)
  const [pendingAnchor, setPendingAnchor] = useState<TextAnchor | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [scrollRequest, setScrollRequest] = useState<{ id: string; to: 'doc' | 'list' } | null>(null)

  const submitComment = () => {
    if (!commentText.trim()) return
    addArtifactComment(id, commentText, undefined, pendingAnchor ?? undefined)
    setCommentText('')
    setPendingAnchor(null)
  }

  const focusCommentInDoc = (commentId: string) => {
    setActiveCommentId(commentId)
    if (activeTab === 'comments') setActiveTab('split')
    setScrollRequest({ id: commentId, to: 'doc' })
  }

  const focusCommentInList = (commentId: string) => {
    setActiveCommentId(commentId)
    if (activeTab === 'document') setActiveTab('split')
    setScrollRequest({ id: commentId, to: 'list' })
  }

  const startAnchoredComment = () => {
    if (!selectionBtn) return
    setPendingAnchor(selectionBtn.anchor)
    setSelectionBtn(null)
    window.getSelection()?.removeAllRanges()
    if (activeTab === 'document') setActiveTab('split')
  }

  // Mouse up on the document: a selection offers "Comentar"; a plain click on a highlight opens its comment.
  const handleDocMouseUp = (e: React.MouseEvent) => {
    const root = docTextRef.current
    const box = docRef.current
    if (!root || !box || isEditing) return

    const anchor = getSelectionAnchor(root)
    if (anchor) {
      const range = window.getSelection()?.getRangeAt(0)
      if (isApproved || !range) {
        setSelectionBtn(null)
        return
      }
      const boxRect = box.getBoundingClientRect()
      const scale = box.offsetWidth ? boxRect.width / box.offsetWidth : 1
      const rect = range.getBoundingClientRect()
      const left = Math.max(
        4,
        Math.min((rect.left + rect.width / 2 - boxRect.left) / scale + box.scrollLeft - 55, box.clientWidth - 120)
      )
      let top = (rect.top - boxRect.top) / scale + box.scrollTop - 36
      if (top < box.scrollTop + 4) top = (rect.bottom - boxRect.top) / scale + box.scrollTop + 6
      setSelectionBtn({ top, left, anchor })
      return
    }

    setSelectionBtn(null)
    const caret = caretAtPoint(e.clientX, e.clientY)
    if (caret) {
      for (const [commentId, range] of rangeMapRef.current) {
        try {
          if (range.comparePoint(caret.node, caret.offset) === 0) {
            focusCommentInList(commentId)
            return
          }
        } catch {
          // caret in another tree: not a hit
        }
      }
    }
    setActiveCommentId(null)
  }

  // Paint the commented passages (runs every render: the ranges must follow whatever nodes React kept).
  useEffect(() => {
    const root = docTextRef.current
    const map = new Map<string, Range>()
    const base: Range[] = []
    const active: Range[] = []
    const pending: Range[] = []
    if (root && !isEditing && activeTab !== 'comments') {
      for (const c of comments) {
        if (!c.quote) continue
        const range = resolveAnchorRange(root, { quote: c.quote, start: c.quoteStart ?? -1, end: c.quoteEnd ?? -1 })
        if (!range) continue
        map.set(c.id, range)
        ;(c.id === activeCommentId ? active : base).push(range)
      }
      if (pendingAnchor) {
        const range = resolveAnchorRange(root, pendingAnchor)
        if (range) pending.push(range)
      }
    }
    rangeMapRef.current = map
    setHighlights(id, 'comment', base)
    setHighlights(id, 'active', active)
    setHighlights(id, 'pending', pending)
  })

  useEffect(() => () => clearHighlights(id), [id])

  // Scroll to the requested passage / comment card once its pane is mounted.
  useEffect(() => {
    if (!scrollRequest) return
    if (scrollRequest.to === 'doc') {
      const box = docRef.current
      if (!box) return // document pane not mounted yet
      const range = rangeMapRef.current.get(scrollRequest.id)
      if (range) scrollWithin(box, range)
    } else {
      const list = commentsListRef.current
      if (!list) return
      const card = list.querySelector(`[data-comment-id="${scrollRequest.id}"]`)
      if (card) scrollWithin(list, card)
    }
    setScrollRequest(null)
  }, [scrollRequest, activeTab])

  useEffect(() => {
    if (pendingAnchor) commentInputRef.current?.focus()
  }, [pendingAnchor, activeTab])

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

      {/* Tab selector: Documento / Comentários / Dividido */}
      <div
        className={`nodrag flex items-center gap-1 px-3 py-1.5 border-b shrink-0 ${
          theme === 'dark' ? 'bg-[#11161F] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        {(
          [
            { key: 'document', label: 'Documento', icon: <FileText className="w-3 h-3" /> },
            {
              key: 'comments',
              label: `Comentários (${comments.length})`,
              icon: <MessageSquare className="w-3 h-3" />,
            },
            { key: 'split', label: 'Dividido', icon: <Columns2 className="w-3 h-3" /> },
          ] as Array<{ key: ArtifactTab; label: string; icon: React.ReactNode }>
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/50'
                : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area with Complete Event Isolation for Mouse Scroll & Text Selection */}
      <div
        className={`flex-1 min-h-0 flex ${activeTab === 'split' ? 'flex-row' : 'flex-col'}`}
      >
        {activeTab !== 'comments' && (
          <div
            ref={docRef}
            className={`nodrag nowheel nopan relative min-h-0 overflow-y-auto overscroll-contain select-text cursor-text p-4 bg-[#0D1117] ${
              activeTab === 'split' ? 'flex-1 min-w-0 border-r border-[#21262D]' : 'flex-1'
            }`}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.stopPropagation()
              setSelectionBtn(null)
            }}
            onMouseUp={handleDocMouseUp}
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
              <div ref={docTextRef}>
                <MarkdownView source={nodeData.markdownContent || 'Nenhum documento gerado.'} />
              </div>
            )}

            {selectionBtn && (
              <button
                type="button"
                // keep the text selection alive while the button is pressed
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={startAnchoredComment}
                style={{ position: 'absolute', top: selectionBtn.top, left: selectionBtn.left }}
                className="z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                Comentar
              </button>
            )}
          </div>
        )}

        {activeTab !== 'document' && (
          <div
            className={`nodrag nowheel nopan min-h-0 flex flex-col bg-[#0D1117] ${
              activeTab === 'split' ? 'w-[42%] min-w-[180px] shrink-0' : 'flex-1'
            }`}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div
              ref={commentsListRef}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain select-text p-3 flex flex-col gap-2"
            >
              {comments.length === 0 ? (
                <div className="text-[11px] text-slate-500 text-center py-6">
                  Nenhum comentário ainda. Selecione um trecho do plano para comentar aquele ponto, ou escreva uma
                  diretriz geral abaixo.
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    data-comment-id={c.id}
                    onClick={() => c.quote && focusCommentInDoc(c.id)}
                    className={`group/comment flex gap-2 rounded-lg border bg-[#161B22] p-2.5 transition-colors ${
                      activeCommentId === c.id ? 'border-amber-400/70' : 'border-slate-700/60'
                    } ${c.quote ? 'cursor-pointer' : ''}`}
                  >
                    <div className="w-6 h-6 shrink-0 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold uppercase">
                      {c.author.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-200">{c.author}</span>
                        <span>{formatCommentTime(c.createdAt)}</span>
                      </div>
                      {c.quote && (
                        <div
                          title="Ir para o trecho no documento"
                          className="mt-1 border-l-2 border-amber-400/70 pl-2 text-[11px] italic text-slate-400 line-clamp-3 break-words"
                        >
                          “{c.quote}”
                        </div>
                      )}
                      <p className="mt-1 text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                        {c.text}
                      </p>
                    </div>
                    {!isApproved && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteArtifactComment(id, c.id)
                        }}
                        title="Excluir comentário"
                        className="self-start p-1 rounded text-slate-500 opacity-0 group-hover/comment:opacity-100 hover:text-rose-400 hover:bg-rose-950/40 transition-all cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {isApproved ? (
              <div className="px-3 py-2 border-t border-[#21262D] text-[10px] text-slate-500">
                Plano aprovado — comentários enviados ao agente e travados.
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-2.5 border-t border-[#21262D]">
                {pendingAnchor && (
                  <div className="flex items-start gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1.5">
                    <Quote className="w-3 h-3 mt-0.5 shrink-0 text-indigo-300" />
                    <span className="min-w-0 flex-1 text-[11px] italic text-slate-300 line-clamp-2 break-words">
                      “{pendingAnchor.quote}”
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingAnchor(null)}
                      title="Comentar sem trecho (comentário geral)"
                      className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={commentInputRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        submitComment()
                      }
                    }}
                    rows={2}
                    placeholder={
                      pendingAnchor
                        ? 'Comente o trecho selecionado... (Ctrl+Enter envia)'
                        : 'Escreva um comentário ou diretriz... (Ctrl+Enter envia)'
                    }
                    className="flex-1 bg-[#090D13] text-slate-200 text-xs p-2 rounded-lg border border-slate-700/80 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={!commentText.trim()}
                    title="Adicionar comentário"
                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
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
            comments.length > 0
              ? `${comments.length} comentário${comments.length === 1 ? '' : 's'} será${comments.length === 1 ? '' : 'ão'} enviado${comments.length === 1 ? '' : 's'} ao agente`
              : 'Revise o documento antes de avançar'
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
              Aprovar e Executar{comments.length > 0 ? ` (+${comments.length})` : ''}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
