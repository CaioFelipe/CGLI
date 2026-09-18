import React, { useState } from 'react'
import {
  Folder,
  FolderPlus,
  Plus,
  Trash2,
  X,
  Star,
  Layers,
  FolderSearch,
} from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'

export const NewProjectModal: React.FC = () => {
  const {
    isNewProjectOpen,
    closeNewProjectModal,
    createProject,
    theme,
  } = useCanvasStore()

  const [projectName, setProjectName] = useState('')
  const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([])
  const [manualPath, setManualPath] = useState('')
  const [manualName, setManualName] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isNewProjectOpen) return null

  // Native directory picker using window.showDirectoryPicker()
  const handlePickDirectory = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker()
        if (dirHandle) {
          const folderName = dirHandle.name
          const defaultPath = `C:/Users/aluno/Documents/antigravity/${folderName}`
          const promptPath = window.prompt(
            `Pasta "${folderName}" selecionada!\nConfirme ou ajuste o caminho absoluto da pasta no seu computador:`,
            defaultPath
          )
          const finalPath = promptPath ? promptPath.trim() : defaultPath

          if (!folders.some((f) => f.path.toLowerCase() === finalPath.toLowerCase())) {
            setFolders((prev) => [
              ...prev,
              { name: folderName, path: finalPath },
            ])
            setErrorMsg(null)
          }
        }
      } else {
        setErrorMsg('Seletor nativo de diretório não suportado neste navegador. Digite o caminho da pasta abaixo.')
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error picking directory:', err)
        setErrorMsg('Não foi possível acessar a pasta selecionada.')
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

    if (folders.some((f) => f.path.toLowerCase() === cleanPath.toLowerCase())) {
      setErrorMsg('Esta pasta já foi adicionada ao workspace.')
      return
    }

    setFolders((prev) => [...prev, { name: extractedName, path: cleanPath }])
    setManualPath('')
    setManualName('')
    setErrorMsg(null)
  }

  const handleRemoveFolder = (index: number) => {
    setFolders((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectName.trim()) {
      setErrorMsg('Por favor, defina um nome para o projeto.')
      return
    }

    if (folders.length === 0) {
      setErrorMsg('Adicione pelo menos uma pasta ao projeto para os agentes trabalharem.')
      return
    }

    createProject(projectName.trim(), folders)
    setProjectName('')
    setFolders([])
    setManualPath('')
    setManualName('')
    setErrorMsg(null)
  }

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
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-500">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Criar Novo Projeto</h2>
              <p className="text-xs text-slate-400">
                Configure um workspace único ou com múltiplas pastas (Multi-Root)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeNewProjectModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400">
              {errorMsg}
            </div>
          )}

          {/* Project Name */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-slate-300">
              Nome do Projeto <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value)
                setErrorMsg(null)
              }}
              placeholder="Ex: Plataforma E-Commerce, Microserviços API..."
              className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-hidden transition-colors ${
                theme === 'dark'
                  ? 'bg-[#161B22] border-[#30363D] text-[#F0F6FC] placeholder-slate-500 focus:border-indigo-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
              }`}
            />
          </div>

          {/* Workspace Folders Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Pastas do Projeto (Multi-Pastas) <span className="text-rose-500">*</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  Adicione uma ou mais pastas para que os agentes Claude e AGY tenham acesso ao código.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePickDirectory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
              >
                <FolderSearch className="w-3.5 h-3.5" />
                <span>Selecionar Pasta...</span>
              </button>
            </div>

            {/* List of Configured Folders */}
            {folders.length > 0 ? (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {folders.map((f, idx) => (
                  <div
                    key={f.path}
                    className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      theme === 'dark'
                        ? 'bg-[#161B22] border-[#30363D]'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <Folder className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">{f.name}</span>
                          {idx === 0 && (
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

                    <button
                      type="button"
                      onClick={() => handleRemoveFolder(idx)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remover pasta do workspace"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={`p-4 rounded-xl border border-dashed text-center ${
                  theme === 'dark'
                    ? 'border-slate-700/60 bg-[#161B22]/30 text-slate-400'
                    : 'border-slate-300 bg-slate-50 text-slate-500'
                }`}
              >
                <Layers className="w-6 h-6 mx-auto mb-1.5 text-slate-400 opacity-60" />
                <p className="text-xs font-medium">Nenhuma pasta vinculada ainda</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Clique em "Selecionar Pasta..." ou adicione o caminho absoluto abaixo.
                </p>
              </div>
            )}

            {/* Manual Path Inserter */}
            <div
              className={`p-3 rounded-xl border ${
                theme === 'dark' ? 'bg-[#12161F] border-[#30363D]' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                Ou adicione o caminho manualmente:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Apelido (opcional)"
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

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-inherit">
            <button
              type="button"
              onClick={closeNewProjectModal}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                theme === 'dark'
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!projectName.trim() || folders.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors shadow-md"
            >
              Criar Projeto
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
