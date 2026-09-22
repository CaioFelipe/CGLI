import React, { useState, useEffect } from 'react'
import {
  Brain,
  ExternalLink,
  Plus,
  Search,
  X,
  RefreshCw,
  FileText,
  Activity,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  Sparkles,
  Map
} from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { MarkdownView } from '../common/MarkdownView'
import { memoryFetch } from '../../services/memoryService'

interface NoteItem {
  id: string
  title: string
  type: string
  scope: 'project' | 'global'
  relativePath: string
  fullPath: string
  snippet?: string
}

interface DoctorIssue {
  severity: 'error' | 'warning' | 'info'
  scope: string
  file: string
  message: string
  suggestion?: string
}

interface DoctorReport {
  passed: boolean
  scannedScopes: string[]
  stats: {
    totalNotes: number
    totalJournals: number
    totalEstimatedTokens: number
    storageBytes: number
  }
  issues: DoctorIssue[]
  summary: {
    errors: number
    warnings: number
    infos: number
  }
}

export const MemoryExplorerModal: React.FC = () => {
  const {
    isMemoryExplorerOpen,
    closeMemoryExplorer,
    spawnMemoryNode,
    theme
  } = useCanvasStore()

  // Navegação de visualização principal
  const [viewMode, setViewMode] = useState<'notes' | 'moc' | 'doctor'>('notes')

  // Estado das Notas
  const [activeTab, setActiveTab] = useState<'all' | 'project' | 'global'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(false)

  // Estado do MOC
  const [mocContent, setMocContent] = useState<string>('')
  const [mocLoading, setMocLoading] = useState(false)

  // Estado do Doctor
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(false)

  // Feedback de compactação
  const [compactLoading, setCompactLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 4000)
  }

  useEffect(() => {
    if (isMemoryExplorerOpen) {
      if (viewMode === 'notes') {
        loadNotes()
      } else if (viewMode === 'moc') {
        loadMOC()
      } else if (viewMode === 'doctor') {
        loadDoctor()
      }
    }
  }, [isMemoryExplorerOpen, viewMode, activeTab, searchQuery, selectedType])

  const loadNotes = async () => {
    setLoading(true)
    try {
      if (searchQuery.trim().length > 1) {
        const res = await memoryFetch(`/api/memory/search?q=${encodeURIComponent(searchQuery)}&scope=${activeTab}`)
        const data = await res.json()
        if (data.success && Array.isArray(data.results)) {
          let list = data.results
          if (selectedType !== 'all') {
            list = list.filter((n: NoteItem) => n.type === selectedType)
          }
          setNotes(list)
        }
      } else {
        let all: NoteItem[] = []
        if (activeTab === 'all' || activeTab === 'project') {
          const resProj = await memoryFetch('/api/memory/list?scope=project' + (selectedType !== 'all' ? `&type=${selectedType}` : ''))
          const dataProj = await resProj.json()
          if (dataProj.success && Array.isArray(dataProj.notes)) {
            all = all.concat(dataProj.notes.map((n: any) => ({ ...n, scope: 'project' })))
          }
        }
        if (activeTab === 'all' || activeTab === 'global') {
          const resGlob = await memoryFetch('/api/memory/list?scope=global' + (selectedType !== 'all' ? `&type=${selectedType}` : ''))
          const dataGlob = await resGlob.json()
          if (dataGlob.success && Array.isArray(dataGlob.notes)) {
            all = all.concat(dataGlob.notes.map((n: any) => ({ ...n, scope: 'global' })))
          }
        }
        setNotes(all)
      }
    } catch (err) {
      console.error('Erro ao carregar notas do Vault:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMOC = async (regenerate = false) => {
    setMocLoading(true)
    try {
      const scope = activeTab === 'global' ? 'global' : 'project'
      const res = await memoryFetch('/api/memory/moc' + (regenerate ? '' : `?scope=${scope}`), {
        method: regenerate ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: regenerate ? JSON.stringify({ scope }) : undefined
      })
      const data = await res.json()
      if (data.success && data.content) {
        setMocContent(data.content)
      }
    } catch (err) {
      console.error('Erro ao carregar MOC:', err)
    } finally {
      setMocLoading(false)
    }
  }

  const loadDoctor = async () => {
    setDoctorLoading(true)
    try {
      const res = await memoryFetch(`/api/memory/doctor?scope=${activeTab}`)
      const data = await res.json()
      setDoctorReport(data)
    } catch (err) {
      console.error('Erro ao executar diagnóstico:', err)
    } finally {
      setDoctorLoading(false)
    }
  }

  const handleCompact = async () => {
    setCompactLoading(true)
    try {
      const scope = activeTab === 'global' ? 'global' : 'project'
      const res = await memoryFetch('/api/memory/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, dryRun: false })
      })
      const data = await res.json()
      showToast(data.message || 'Compactação realizada com sucesso!')
      loadNotes()
    } catch (err: any) {
      showToast('Falha na compactação: ' + err.message)
    } finally {
      setCompactLoading(false)
    }
  }

  const handleAddNoteToCanvas = async (note: NoteItem) => {
    try {
      const res = await memoryFetch(`/api/memory/get?scope=${note.scope}&id=${encodeURIComponent(note.id || note.relativePath)}`)
      const data = await res.json()
      const content = data.content || `# ${note.title}\n\nNota recuperada do Vault.`

      spawnMemoryNode({
        id: note.id,
        title: note.title,
        noteType: note.type,
        scope: note.scope,
        content,
        relativePath: note.relativePath,
        fullPath: note.fullPath
      })
    } catch (_) {
      spawnMemoryNode({
        id: note.id,
        title: note.title,
        noteType: note.type,
        scope: note.scope,
        content: `# ${note.title}\n\nNota recuperada do Vault.`,
        relativePath: note.relativePath,
        fullPath: note.fullPath
      })
    }
  }

  const handlePinMocToCanvas = () => {
    const scope = activeTab === 'global' ? 'global' : 'project'
    spawnMemoryNode({
      title: `Map of Content (${scope})`,
      noteType: 'knowledge',
      scope,
      content: mocContent || '# Map of Content\n\nNenhum conteúdo gerado.',
      relativePath: '00-meta/MOC.md',
      tags: ['moc', 'index']
    })
  }

  const handleOpenInObsidian = async (note: NoteItem) => {
    try {
      await memoryFetch('/api/memory/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: note.scope,
          file: note.relativePath
        })
      })
    } catch (_) {}
  }

  const handleOpenEntireVault = async (scope: 'project' | 'global') => {
    try {
      await memoryFetch('/api/memory/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope })
      })
    } catch (_) {}
  }

  if (!isMemoryExplorerOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`w-full max-w-3xl max-h-[88vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${
          theme === 'dark'
            ? 'bg-[#111827] border-slate-800 text-slate-100 shadow-black/80'
            : 'bg-white border-slate-200 text-slate-900 shadow-xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-500">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight flex items-center gap-2">
                <span>Memória Compartilhada do Obsidian</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  {notes.length} notas
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Curadoria, Recall inteligente e sincronização Obsidian ↔ Agentes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCompact}
              disabled={compactLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
              title="Compactar observações de journal em notas permanentes"
            >
              <Sparkles className={`w-3.5 h-3.5 ${compactLoading ? 'animate-spin' : ''}`} />
              <span>{compactLoading ? 'Compactando...' : 'Compactar'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenEntireVault(activeTab === 'global' ? 'global' : 'project')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
              title="Abrir o Vault no app desktop Obsidian"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir Obsidian</span>
            </button>
            <button
              type="button"
              onClick={closeMemoryExplorer}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notificação Toast */}
        {toastMessage && (
          <div className="bg-purple-600/90 text-white px-4 py-2 text-xs text-center font-medium shadow-md transition-all animate-in fade-in">
            {toastMessage}
          </div>
        )}

        {/* Barra de Navegação de Visualizações: Notas | MOC | Diagnóstico */}
        <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between flex-wrap gap-2">
          <div className="flex rounded-lg p-0.5 bg-slate-200/60 dark:bg-slate-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('notes')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'notes'
                  ? 'bg-white dark:bg-[#1E293B] text-purple-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Explorador de Notas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('moc')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'moc'
                  ? 'bg-white dark:bg-[#1E293B] text-purple-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              <span>Map of Content (MOC)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('doctor')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'doctor'
                  ? 'bg-white dark:bg-[#1E293B] text-purple-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Saúde do Vault (Doctor)</span>
            </button>
          </div>

          {/* Abas de Escopo: Todos | Projeto | Global */}
          <div className="flex rounded-lg p-0.5 bg-slate-200/60 dark:bg-slate-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-[#1E293B] text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('project')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'project'
                  ? 'bg-white dark:bg-[#1E293B] text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Projeto
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('global')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'global'
                  ? 'bg-white dark:bg-[#1E293B] text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Global
            </button>
          </div>
        </div>

        {/* CONTEÚDO PRINCIPAL BASEADO NA VIEW */}
        {viewMode === 'notes' && (
          <>
            {/* Filtros e Busca */}
            <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar por título, tags (#arquitetura) ou conteúdo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-400 focus:outline-hidden"
              >
                <option value="all">Todos os Tipos</option>
                <option value="decision">Decisões (ADRs)</option>
                <option value="learning">Aprendizados</option>
                <option value="rule">Regras / Convenções</option>
                <option value="knowledge">Conhecimento</option>
                <option value="journal">Journal</option>
              </select>
            </div>

            {/* Lista de Notas */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-500" />
                  <span>Consultando Vaults...</span>
                </div>
              ) : notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center p-6 text-slate-400">
                  <Brain className="w-10 h-10 mb-2 opacity-30 text-purple-400" />
                  <p className="text-xs font-semibold">Nenhuma nota encontrada</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                    Os agentes criam notas automaticamente ao utilizar o comando <code className="text-purple-400">cgli memory note</code> ou você pode criar notas diretamente no Obsidian.
                  </p>
                </div>
              ) : (
                notes.map((note) => {
                  const isGlob = note.scope === 'global'
                  return (
                    <div
                      key={note.id || note.relativePath}
                      className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                        theme === 'dark'
                          ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                              isGlob
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                            }`}
                          >
                            {isGlob ? 'Global' : 'Projeto'}
                          </span>
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-200/50 dark:bg-slate-800 text-slate-400">
                            {note.type}
                          </span>
                          {note.id && (
                            <span className="text-[9px] font-mono text-slate-500">
                              {note.id}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold truncate text-slate-200">
                          {note.title}
                        </h4>
                        {note.snippet && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {note.snippet}
                          </p>
                        )}
                        <div className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1 truncate">
                          <span>{note.relativePath}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-center">
                        <button
                          type="button"
                          onClick={() => handleOpenInObsidian(note)}
                          title="Abrir no Obsidian"
                          className="p-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddNoteToCanvas(note)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Fixar no Canvas</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}

        {/* MAP OF CONTENT (MOC) VIEW */}
        {viewMode === 'moc' && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-[350px]">
            <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Índice consolidado navegável (<code>00-meta/MOC.md</code>)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadMOC(true)}
                  disabled={mocLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${mocLoading ? 'animate-spin' : ''}`} />
                  <span>Regerar MOC</span>
                </button>
                <button
                  type="button"
                  onClick={handlePinMocToCanvas}
                  className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Fixar MOC no Canvas</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-xs font-sans leading-relaxed">
              {mocLoading ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-500" />
                  <span>Gerando Map of Content...</span>
                </div>
              ) : (
                <MarkdownView source={mocContent || '# Map of Content\n\nNenhum conteúdo gerado ainda.'} />
              )}
            </div>
          </div>
        )}

        {/* DOCTOR HEALTH REPORT VIEW */}
        {viewMode === 'doctor' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[350px]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {doctorReport?.passed ? (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-4 h-4" />
                    <span>COFRE SAUDÁVEL</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-4 h-4" />
                    <span>ATENÇÃO NECESSÁRIA</span>
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {doctorReport?.issues.length === 0
                    ? 'Nenhum apontamento detectado.'
                    : `${doctorReport?.issues.length} apontamentos encontrados.`}
                </span>
              </div>

              <button
                type="button"
                onClick={loadDoctor}
                disabled={doctorLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${doctorLoading ? 'animate-spin' : ''}`} />
                <span>Reexecutar Diagnóstico</span>
              </button>
            </div>

            {/* Cartões de Métricas */}
            {doctorReport?.stats && (
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-[10px] text-slate-400 block">Total de Notas</span>
                  <span className="text-lg font-bold text-slate-100">{doctorReport.stats.totalNotes}</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-[10px] text-slate-400 block">Journals Diários</span>
                  <span className="text-lg font-bold text-indigo-400">{doctorReport.stats.totalJournals}</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-[10px] text-slate-400 block">Armazenamento</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {(doctorReport.stats.storageBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-[10px] text-slate-400 block">Tokens Estimados</span>
                  <span className="text-lg font-bold text-purple-400">~{doctorReport.stats.totalEstimatedTokens}</span>
                </div>
              </div>
            )}

            {/* Lista de Problemas / Apontamentos */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold text-slate-300">Apontamentos do Diagnóstico</h4>
              {doctorReport?.issues.length === 0 ? (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Todos os arquivos, frontmatters, links e regras de segurança estão 100% íntegros.</span>
                </div>
              ) : (
                doctorReport?.issues.map((issue, idx) => {
                  const isError = issue.severity === 'error'
                  const isWarn = issue.severity === 'warning'
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${
                        isError
                          ? 'border-rose-500/30 bg-rose-500/5 text-rose-200'
                          : isWarn
                          ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
                          : 'border-sky-500/30 bg-sky-500/5 text-sky-200'
                      }`}
                    >
                      {isError ? (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold uppercase text-[9px] px-1 py-0.2 rounded bg-black/30">
                            {issue.severity}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            [{issue.scope}] {issue.file}
                          </span>
                        </div>
                        <p className="font-medium text-slate-100">{issue.message}</p>
                        {issue.suggestion && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            Sugestão: {issue.suggestion}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
