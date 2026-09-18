import {
  Archive,
  Check,
  ChevronDown,
  FileCode,
  FolderArchive,
  FolderGit2,
  FolderPlus,
  FolderSearch,
  Image as ImageIcon,
  Layers,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
  ZoomIn,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'

interface TopbarProps {
  onFitView?: () => void
}

export const Topbar: React.FC<TopbarProps> = ({ onFitView }) => {
  const {
    theme,
    toggleTheme,
    projects,
    currentProjectId,
    project,
    switchProject,
    deleteProject,
    openNewProjectModal,
    openManageWorkspaceModal,
    stashItems,
    toggleStashOpen,
    openSettings,
    addNode,
    nodes,
  } = useCanvasStore()

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false)


  const handleAddAgent = (type: 'claude' | 'agy') => {
    const isClaude = type === 'claude'
    const newNode = {
      id: `node-${type}-${Date.now()}`,
      type: 'agentNode',
      position: { x: 200 + nodes.length * 30, y: 150 + nodes.length * 20 },
      data: {
        title: isClaude ? 'Claude Code' : 'Antigravity (AGY)',
        agentType: type,
        role: isClaude ? 'planner' : 'executor',
        status: 'idle',
        viewMode: 'extension',
        thinking: null,
        messages: [
          {
            id: `msg-${Date.now()}`,
            sender: 'agent',
            text: isClaude
              ? 'Pronto para planejar e estruturar tarefas do projeto.'
              : 'Pronto para executar comandos e testes em segundo plano.',
            timestamp: new Date().toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ],
        approvals: [],
        attachedImages: [],
        terminalLogs: [`> ${type} session created`],
      },
    }
    addNode(newNode)
    setIsAddNodeOpen(false)
  }

  const handleAddArtifact = () => {
    const newNode = {
      id: `node-artifact-${Date.now()}`,
      type: 'artifactNode',
      position: { x: 300 + nodes.length * 25, y: 180 + nodes.length * 20 },
      data: {
        title: 'Novo Artefato',
        activeTab: 'markdown',
        markdownContent: `### Documento de Especificação\n\n> [!NOTE]\n> Descreva o escopo e diretrizes desta entrega aqui.\n\n- [ ] Tarefa inicial\n`,
        htmlPreview: '<div style="font-family:sans-serif;padding:20px;color:#94a3b8"><h3>Preview Vazio</h3></div>',
        diffContent: {
          filename: 'src/index.ts',
          lines: [{ type: 'normal', content: '// Arquivo inicial' }],
        },
        status: 'draft',
      },
    }
    addNode(newNode)
    setIsAddNodeOpen(false)
  }

  const handleAddImage = () => {
    const newNode = {
      id: `node-image-${Date.now()}`,
      type: 'imageNode',
      position: { x: 100 + nodes.length * 25, y: 220 + nodes.length * 20 },
      data: {
        title: 'Nova Captura',
        name: 'design-reference.png',
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
        annotations: [],
      },
    }
    addNode(newNode)
    setIsAddNodeOpen(false)
  }

  const handleAddImageGroup = () => {
    const newNode = {
      id: `node-img-group-${Date.now()}`,
      type: 'imageGroupNode',
      position: { x: 120 + nodes.length * 25, y: 200 + nodes.length * 20 },
      data: {
        title: 'Grupo de Referências',
        activeImageIndex: 0,
        images: [
          {
            id: `img-g1-${Date.now()}`,
            name: 'spec-layout.png',
            url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
          },
          {
            id: `img-g2-${Date.now()}`,
            name: 'dashboard-preview.png',
            url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80',
          },
        ],
      },
    }
    addNode(newNode)
    setIsAddNodeOpen(false)
  }

  const handleAddNodeGroup = () => {
    const newNode = {
      id: `group-${Date.now()}`,
      type: 'groupNode',
      position: { x: 150 + nodes.length * 20, y: 150 + nodes.length * 20 },
      style: { width: 560, height: 420, zIndex: -1 },
      data: {
        title: 'Novo Grupo de Nós',
        nodeIds: [],
        width: 560,
        height: 420,
      },
    }
    addNode(newNode)
    setIsAddNodeOpen(false)
  }

  return (
    <header
      className={`h-13 w-full border-b flex items-center justify-between px-4 z-30 select-none ${
        theme === 'dark'
          ? 'bg-[#0B0F17]/95 border-slate-800/80 text-slate-100 backdrop-blur-md'
          : 'bg-white/95 border-slate-200/80 text-slate-900 backdrop-blur-md'
      }`}
    >
      {/* Left: Brand & Active Project Selector */}
      <div className="flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-2 border-r border-slate-200 dark:border-slate-800">
          <img
            src="/favicon.svg"
            alt="CGLI Logo"
            className="w-7 h-7 rounded-lg shadow-xs select-none"
          />
          <span className="font-bold text-sm tracking-tight">CGLI</span>
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs transition-colors"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-indigo-500" />
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold block">{project.name}</span>
                {project.folders && project.folders.length > 1 && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                    {project.folders.length} pastas
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[220px]">
                {project.path}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 ml-1" />
          </button>

          {isProjectDropdownOpen && (
            <div
              className={`absolute left-0 top-full mt-1.5 w-80 rounded-xl border shadow-2xl p-2 z-50 animate-in fade-in-50 duration-100 ${
                theme === 'dark'
                  ? 'bg-[#111827] border-slate-800 text-slate-100'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              {/* Quick Actions */}
              <div className="space-y-1 pb-2 border-b border-inherit">
                <button
                  type="button"
                  onClick={() => {
                    setIsProjectDropdownOpen(false)
                    openNewProjectModal()
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 transition-colors shadow-xs"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>+ Criar Novo Projeto</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProjectDropdownOpen(false)
                    openManageWorkspaceModal()
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-slate-800 text-slate-300'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FolderSearch className="w-3.5 h-3.5 text-sky-400" />
                    <span>Gerenciar Pastas do Workspace</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-700/40 text-slate-300">
                    {project.folders?.length || 1}
                  </span>
                </button>
              </div>

              {/* Projects List */}
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-slate-400">
                Seus Projetos
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {projects.map((p) => {
                  const isCurrent = p.id === currentProjectId
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        isCurrent
                          ? theme === 'dark'
                            ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-500/30'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : theme === 'dark'
                            ? 'hover:bg-slate-800 text-slate-300'
                            : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          switchProject(p.id)
                          setIsProjectDropdownOpen(false)
                        }}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        {isCurrent ? (
                          <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold truncate">{p.name}</span>
                            {p.folders && p.folders.length > 1 && (
                              <span className="text-[9px] px-1 rounded bg-slate-700/50 text-slate-300 font-mono">
                                {p.folders.length}p
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono truncate block">
                            {p.path.split('/').pop() || p.path}
                          </span>
                        </div>
                      </button>

                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Deseja excluir o projeto "${p.name}"?`)) {
                              deleteProject(p.id)
                            }
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 ml-1 transition-colors"
                          title="Excluir projeto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions & Toggles */}
      <div className="flex items-center gap-2">
        {/* Add Node Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsAddNodeOpen(!isAddNodeOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Nó</span>
            <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
          </button>

          {isAddNodeOpen && (
            <div
              className={`absolute right-0 top-full mt-1.5 w-52 rounded-xl border shadow-xl p-1.5 z-50 animate-in fade-in-50 duration-100 ${
                theme === 'dark'
                  ? 'bg-[#111827] border-slate-800 text-slate-100'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <button
                type="button"
                onClick={() => handleAddAgent('claude')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Agente Claude Code</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddAgent('agy')}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Agente Antigravity</span>
              </button>
              <button
                type="button"
                onClick={handleAddArtifact}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-500" />
                <span>Visualizador de Artefato</span>
              </button>
              <button
                type="button"
                onClick={handleAddImage}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <ImageIcon className="w-3.5 h-3.5 text-rose-500" />
                <span>Imagem / Captura</span>
              </button>
              <button
                type="button"
                onClick={handleAddImageGroup}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                <span>Grupo de Imagens</span>
              </button>
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              <button
                type="button"
                onClick={handleAddNodeGroup}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
                <span>Novo Grupo de Nós</span>
              </button>
            </div>
          )}
        </div>

        {/* Fit View Zoom Button */}
        {onFitView && (
          <button
            type="button"
            onClick={onFitView}
            title="Enquadrar nós no canvas"
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        )}

        {/* Stash Toggle Button */}
        <button
          type="button"
          onClick={toggleStashOpen}
          title="Gaveta do Stash"
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors"
        >
          <Archive className="w-4 h-4 text-indigo-500" />
          <span>Stash</span>
          {stashItems.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
              {stashItems.length}
            </span>
          )}
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => openSettings(0)}
          title="Configurações e CLIs"
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
