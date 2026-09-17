import {
  Cpu,
  Key,
  Plus,
  Sliders,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { AgentRole, CliConfig, SkillItem } from '../../types/canvas'

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    closeSettings,
    settingsTab,
    setSettingsTab,
    clis,
    updateCli,
    addCli,
    skills,
    toggleSkill,
    addSkill,
    theme,
  } = useCanvasStore()

  // New CLI form state
  const [newCliName, setNewCliName] = useState('')
  const [newCliBinary, setNewCliBinary] = useState('')
  const [newCliArgs, setNewCliArgs] = useState('')
  const [newCliRole, setNewCliRole] = useState<AgentRole>('executor')
  const [newCliColor, setNewCliColor] = useState('#8B5CF6')

  // New Skill form state
  const [isAddingSkill, setIsAddingSkill] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillDesc, setNewSkillDesc] = useState('')
  const [newSkillCategory, setNewSkillCategory] = useState('Geral')

  if (!isSettingsOpen) return null

  const tabs = [
    { id: 0, label: 'CLIs & Contas', icon: <Terminal className="w-4 h-4" /> },
    { id: 1, label: 'Papéis dos Nós', icon: <Cpu className="w-4 h-4" /> },
    { id: 2, label: 'Adicionar CLI', icon: <Plus className="w-4 h-4" /> },
    { id: 3, label: 'Hub de Skills', icon: <Sparkles className="w-4 h-4" /> },
  ]

  const handleCreateCli = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCliName.trim() || !newCliBinary.trim()) return

    const newConfig: CliConfig = {
      id: `cli-${Date.now()}`,
      name: newCliName.trim(),
      binary: newCliBinary.trim(),
      color: newCliColor,
      active: true,
      role: newCliRole,
      defaultArgs: newCliArgs.trim() || '--stream',
      connectedAccount: {
        email: 'local@device',
        status: 'connected',
      },
    }

    addCli(newConfig)
    setNewCliName('')
    setNewCliBinary('')
    setNewCliArgs('')
    setSettingsTab(0)
  }

  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSkillName.trim() || !newSkillDesc.trim()) return

    const newSkill: SkillItem = {
      id: `skill-${Date.now()}`,
      name: newSkillName.trim(),
      description: newSkillDesc.trim(),
      enabled: true,
      category: newSkillCategory.trim() || 'Geral',
    }

    addSkill(newSkill)
    setNewSkillName('')
    setNewSkillDesc('')
    setIsAddingSkill(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          theme === 'dark'
            ? 'bg-[#111827] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Preferências do Estúdio</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gerencie executáveis CLI, contas autenticadas e skills globais
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeSettings}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                settingsTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto max-h-[460px]">
          {/* Tab 0: CLIs & Contas */}
          {settingsTab === 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">
                  CLIs configurados para orquestração
                </span>
                <button
                  type="button"
                  onClick={() => setSettingsTab(2)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar CLI
                </button>
              </div>

              {clis.map((cli) => (
                <div
                  key={cli.id}
                  className={`p-4 rounded-xl border transition-all ${
                    theme === 'dark'
                      ? 'bg-slate-900/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
                        style={{
                          backgroundColor: `${cli.color}20`,
                          color: cli.color,
                        }}
                      >
                        {cli.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs">{cli.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {cli.binary}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {cli.connectedAccount?.email || 'Nenhuma conta vinculada'}
                        </span>
                      </div>
                    </div>

                    {/* Toggle Active */}
                    <button
                      type="button"
                      onClick={() => updateCli(cli.id, { active: !cli.active })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        cli.active ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          cli.active ? 'translate-x-4.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Account status & Auth details */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200/80 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Key className="w-3.5 h-3.5" />
                      <span>Token: {cli.connectedAccount?.tokenOrKey || 'Não configurado'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const isConnected = cli.connectedAccount?.status === 'connected'
                        updateCli(cli.id, {
                          connectedAccount: {
                            ...cli.connectedAccount,
                            status: isConnected ? 'disconnected' : 'connected',
                          },
                        })
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                        cli.connectedAccount?.status === 'connected'
                          ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {cli.connectedAccount?.status === 'connected'
                        ? 'Desconectar'
                        : 'Conectar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 1: Papéis dos Nós */}
          {settingsTab === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Defina o comportamento padrão de cada agente no canvas ao iniciar fluxos de trabalho.
              </p>

              {clis.map((cli) => (
                <div
                  key={cli.id}
                  className={`p-4 rounded-xl border flex items-center justify-between ${
                    theme === 'dark'
                      ? 'bg-slate-900/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
                      style={{
                        backgroundColor: `${cli.color}20`,
                        color: cli.color,
                      }}
                    >
                      {cli.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-xs block">{cli.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {cli.role === 'planner'
                          ? 'Focado em especificação, requisitos e planos'
                          : 'Focado em execução, patches de código e testes'}
                      </span>
                    </div>
                  </div>

                  {/* Role Selector */}
                  <select
                    value={cli.role}
                    onChange={(e) =>
                      updateCli(cli.id, { role: e.target.value as AgentRole })
                    }
                    className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden"
                  >
                    <option value="planner">Planejador</option>
                    <option value="executor">Executor</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Adicionar Novo CLI */}
          {settingsTab === 2 && (
            <form onSubmit={handleCreateCli} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do CLI
                </label>
                <input
                  type="text"
                  required
                  value={newCliName}
                  onChange={(e) => setNewCliName(e.target.value)}
                  placeholder="Ex: Claude Code, Antigravity, OpenCode"
                  className="w-full text-xs rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Comando Executável
                  </label>
                  <input
                    type="text"
                    required
                    value={newCliBinary}
                    onChange={(e) => setNewCliBinary(e.target.value)}
                    placeholder="Ex: claude, agy, codex"
                    className="w-full text-xs font-mono rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Papel Inicial
                  </label>
                  <select
                    value={newCliRole}
                    onChange={(e) => setNewCliRole(e.target.value as AgentRole)}
                    className="w-full text-xs rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="planner">Planejador</option>
                    <option value="executor">Executor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Argumentos Padrão
                </label>
                <input
                  type="text"
                  value={newCliArgs}
                  onChange={(e) => setNewCliArgs(e.target.value)}
                  placeholder="Ex: --stream --auto-approve"
                  className="w-full text-xs font-mono rounded-lg px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cor de Identificação
                </label>
                <div className="flex items-center gap-3">
                  {['#EA580C', '#0284C7', '#8B5CF6', '#10B981', '#F43F5E'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCliColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        newCliColor === color
                          ? 'scale-125 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar CLI
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: Hub de Skills Compartilhadas */}
          {settingsTab === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Skills disponíveis para os agentes do projeto
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingSkill(!isAddingSkill)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Skill
                </button>
              </div>

              {/* Form to add skill if toggled */}
              {isAddingSkill && (
                <form
                  onSubmit={handleCreateSkill}
                  className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-3"
                >
                  <h4 className="text-xs font-bold text-indigo-500">Cadastrar Nova Skill</h4>
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Nome da Skill (Ex: code-reviewer)"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      className="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Descrição do propósito da skill"
                      value={newSkillDesc}
                      onChange={(e) => setNewSkillDesc(e.target.value)}
                      className="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Categoria (Ex: UI & Design, Architecture, Workflow)"
                      value={newSkillCategory}
                      onChange={(e) => setNewSkillCategory(e.target.value)}
                      className="w-full text-xs rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingSkill(false)}
                      className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
                    >
                      Salvar Skill
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2.5">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      theme === 'dark'
                        ? 'bg-slate-900/60 border-slate-800'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs">{skill.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                          {skill.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-md">
                        {skill.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        skill.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          skill.enabled ? 'translate-x-4.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
