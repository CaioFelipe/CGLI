import React, { useState } from 'react'
import {
  Folder,
  Plus,
  Trash2,
  X,
  Star,
  FolderSearch,
  CheckCircle2,
} from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'

export const ManageWorkspaceModal: React.FC = () => {
  const {
    isManageWorkspaceOpen,
    closeManageWorkspaceModal,
    project,
    currentProjectId,
    addFolderToProject,
    removeFolderFromProject,
    setActiveFolder,
    theme,
  } = useCanvasStore()

  const [manualPath, setManualPath] = useState('')
  const [manualName, setManualName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isManageWorkspaceOpen) return null

  const handlePickDirectory = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker()
        if (dirHandle) {
          const folderName = dirHandle.name
          const defaultPath = `C:/Users/aluno/Documents/antigravity/${folderName}`
          const promptPath = window.prompt(
            `Pasta "${folderName}" selecionada!\nConfirme ou ajuste o caminho absoluto da pasta:`,
            defaultPath
          )
          const finalPath = promptPath ? promptPath.trim() : defaultPath

          if (!project.folders?.some((f) => f.path.toLowerCase() === finalPath.toLowerCase())) {
            addFolderToProject(currentProjectId, { name: folderName, path: finalPath })
            setErrorMsg(null)
          } else {
            setErrorMsg('Esta pasta já faz parte do workspace.')
          }
        }
      } else {
        setErrorMsg('Seletor nativo não suportado neste navegador. Insira o caminho abaixo.')
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error picking directory:', err)
        setErrorMsg('Erro ao selecionar pasta.')
      }
    }
  }

  const handleAddManualFolder = () => {
    if (!manualPath.trim()) {
      setErrorMsg('Informe o caminho da pasta.')
      return
    }

    const cleanPath = manualPath.trim()
    const extractedName = manualName.trim() || cleanPath.split(/[/\\]/).filter(Boolean).pop() || 'pasta'

    if (project.folders?.some((f) => f.path.toLowerCase() === cleanPath.toLowerCase())) {
      setErrorMsg('Esta pasta já faz parte do workspace.')
      return
    }

    addFolderToProject(currentProjectId, { name: extractedName, path: cleanPath })
    setManualPath('')
    setManualName('')
    setErrorMsg(null)
  }

  const folders = project.folders || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          theme === 'dark'
            ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC]'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            theme === 'dark' ? 'bg-[#161B22]/80 border-[#30363D]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-500">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Gerenciar Pastas do Workspace</h2>
              <p className="text-xs text-slate-400">
                Projeto ativo: <span className="font-semibold text-slate-200">{project.name}</span> ({folders.length} pasta{folders.length !== 1 ? 's' : ''})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeManageWorkspaceModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400">
              {errorMsg}
            </div>
          )}

          {/* Current Folders List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">
                Pastas Vinculadas a este Workspace:
              </span>
              <button
                type="button"
                onClick={handlePickDirectory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
              >
                <FolderSearch className="w-3.5 h-3.5" />
                <span>Adicionar Pasta...</span>
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto">
              {folders.map((f) => {
                const isActive = (project.activeFolderId === f.id) || (!project.activeFolderId && f.isPrimary)
                return (
                  <div
                    key={f.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isActive
                        ? theme === 'dark'
                          ? 'bg-indigo-950/25 border-indigo-500/50'
                          : 'bg-indigo-50 border-indigo-300'
                        : theme === 'dark'
                          ? 'bg-[#161B22] border-[#30363D]'
                          : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                        <Folder className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">{f.name}</span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Diretório Ativo
                            </span>
                          )}
                          {f.isPrimary && (
                            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                              <Star className="w-2.5 h-2.5 fill-amber-400" /> Principal
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono truncate block">
                          {f.path}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => setActiveFolder(currentProjectId, f.id)}
                          className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                            theme === 'dark'
                              ? 'bg-[#21262D] hover:bg-[#30363D] text-slate-300'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                          title="Definir como diretório ativo de execução"
                        >
                          Tornar Ativo
                        </button>
                      )}
                      {folders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFolderFromProject(currentProjectId, f.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remover pasta do workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add Folder Manually */}
          <div
            className={`p-3.5 rounded-xl border ${
              theme === 'dark' ? 'bg-[#12161F] border-[#30363D]' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-400 block mb-2">
              Adicionar outra pasta manualmente ao projeto:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Nome/Apelido"
                  className={`w-full px-2.5 py-1.5 text-xs rounded-lg border focus:outline-hidden ${
                    theme === 'dark'
                      ? 'bg-[#161B22] border-[#30363D] text-[#F0F6FC] placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>
              <div className="sm:col-span-6">
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="C:/caminho/para/pasta..."
                  className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-hidden ${
                    theme === 'dark'
                      ? 'bg-[#161B22] border-[#30363D] text-[#F0F6FC] placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddManualFolder}
                  className="w-full h-full min-h-[30px] flex items-center justify-center gap-1 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-inherit flex items-center justify-end">
          <button
            type="button"
            onClick={closeManageWorkspaceModal}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-md"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}
