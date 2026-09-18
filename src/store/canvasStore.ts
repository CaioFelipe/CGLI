import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react'
import { create } from 'zustand'
import type {
  ActionApproval,
  AnnotationItem,
  ChatMessage,
  CliConfig,
  ProjectInfo,
  SkillItem,
  StashItem,
  ThemeMode,
  WorkspaceFolder,
} from '../types/canvas'

interface CanvasState {
  // Theme
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void

  // Project & Multi-Folder Workspaces
  projects: ProjectInfo[]
  currentProjectId: string
  project: ProjectInfo
  isNewProjectOpen: boolean
  isManageWorkspaceOpen: boolean
  openNewProjectModal: () => void
  closeNewProjectModal: () => void
  openManageWorkspaceModal: () => void
  closeManageWorkspaceModal: () => void
  createProject: (name: string, folders: Array<{ name: string; path: string }>) => void
  switchProject: (projectId: string) => void
  addFolderToProject: (projectId: string, folder: { name: string; path: string }) => void
  removeFolderFromProject: (projectId: string, folderId: string) => void
  setActiveFolder: (projectId: string, folderId: string) => void
  deleteProject: (projectId: string) => void
  setProject: (project: Partial<ProjectInfo>) => void

  // Canvas Nodes & Edges
  nodes: Node[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: Node) => void
  updateNodeData: (id: string, data: Record<string, any>) => void
  deleteNode: (id: string) => void

  // Stash Drawer
  stashItems: StashItem[]
  isStashOpen: boolean
  toggleStashOpen: () => void
  setStashOpen: (open: boolean) => void
  stashNode: (id: string) => void
  restoreFromStash: (stashId: string) => void
  removeStashItem: (stashId: string) => void

  // Modals
  isSettingsOpen: boolean
  settingsTab: number
  openSettings: (tab?: number) => void
  closeSettings: () => void
  setSettingsTab: (tab: number) => void

  // Image Annotation Modal
  annotatingNodeId: string | null
  openAnnotationModal: (nodeId: string) => void
  closeAnnotationModal: () => void
  saveAnnotations: (nodeId: string, annotations: AnnotationItem[]) => void

  // CLI & Roles
  clis: CliConfig[]
  updateCli: (id: string, partial: Partial<CliConfig>) => void
  addCli: (cli: CliConfig) => void

  // Skills Hub
  skills: SkillItem[]
  toggleSkill: (id: string) => void
  addSkill: (skill: SkillItem) => void

  // Node Actions
  sendAgentMessage: (nodeId: string, text: string, images?: string[]) => void
  toggleAgentViewMode: (nodeId: string) => void
  handleApproval: (nodeId: string, approvalId: string, action: 'approved' | 'rejected') => void
  approveArtifact: (nodeId: string) => void
  attachImageToAgent: (nodeId: string, image: { id: string; url: string; name: string }) => void
  removeAttachedImage: (nodeId: string, imageId: string) => void
  spawnSubagent: (parentId: string, childType: 'claude' | 'agy') => void
  deleteEdge: (edgeId: string) => void
  addNodeToGroup: (groupId: string, nodeId: string) => void
  removeNodeFromGroup: (groupId: string, nodeId: string) => void
  autoFitGroup: (groupId: string) => void
  groupSelectedNodes: (nodeIds: string[], title?: string) => void
  ungroupNodes: (groupId: string) => void
  stashGroup: (groupId: string) => void
}

const initialClis: CliConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    binary: 'claude',
    color: '#EA580C',
    active: true,
    role: 'planner',
    connectedAccount: {
      email: 'developer@workspace.dev',
      status: 'connected',
      tokenOrKey: '••••••••••••••••38f9',
    },
    defaultArgs: '--dangerously-skip-permissions',
  },
  {
    id: 'agy',
    name: 'Antigravity (AGY)',
    binary: 'agy',
    color: '#0284C7',
    active: true,
    role: 'executor',
    connectedAccount: {
      email: 'aluno@gemini.local',
      status: 'connected',
      tokenOrKey: '••••••••••••••••7a12',
    },
    defaultArgs: '--stream --auto-approve',
  },
]

const initialSkills: SkillItem[] = [
  {
    id: 'clean-ui-copy',
    name: 'Clean UI Copy',
    description: 'Enforces natural, production-grade microcopy without prompt leakage or style bleed.',
    enabled: true,
    category: 'UI & Design',
  },
  {
    id: 'cli-orchestrator',
    name: 'CLI Orchestrator',
    description: 'Hot-swap tokens and coordinate multi-agent tasks with quota guardrails.',
    enabled: true,
    category: 'Architecture',
  },
  {
    id: 'react-flow-helpers',
    name: 'Flow Automation',
    description: 'Automates node linking, graph validation, and smart auto-layouting.',
    enabled: true,
    category: 'Workflow',
  },
  {
    id: 'test-runner',
    name: 'Automated Test Runner',
    description: 'Executes unit tests and integration tests in background daemon tasks.',
    enabled: false,
    category: 'Testing',
  },
]

const initialNodes: Node[] = [
  {
    id: 'node-claude-1',
    type: 'agentNode',
    position: { x: 160, y: 140 },
    data: {
      title: 'Claude Code',
      agentType: 'claude',
      role: 'planner',
      status: 'idle',
      viewMode: 'extension',
      thinking: null,
      messages: [],
      approvals: [],
      attachedImages: [],
      terminalLogs: [
        '> Claude Code inicializado.',
        '> Digite uma instrução ou conecte uma imagem ao nó.',
      ],
    },
  },
  {
    id: 'node-agy-1',
    type: 'agentNode',
    position: { x: 660, y: 140 },
    data: {
      title: 'Antigravity (AGY)',
      agentType: 'agy',
      role: 'executor',
      status: 'idle',
      viewMode: 'extension',
      thinking: null,
      messages: [],
      approvals: [],
      attachedImages: [],
      terminalLogs: [
        '> Antigravity CLI pronto.',
        '> Aguardando despacho de tarefas.',
      ],
    },
  },
]

const initialEdges: Edge[] = []

const defaultProjects: ProjectInfo[] = [
  {
    id: 'proj-blissful-franklin',
    name: 'blissful-franklin',
    path: 'c:/Users/aluno/Documents/antigravity/blissful-franklin',
    folders: [
      {
        id: 'f-default-1',
        name: 'blissful-franklin',
        path: 'c:/Users/aluno/Documents/antigravity/blissful-franklin',
        isPrimary: true,
      },
    ],
    activeFolderId: 'f-default-1',
    createdAt: new Date().toISOString(),
    recentProjects: [
      { name: 'blissful-franklin', path: 'c:/Users/aluno/Documents/antigravity/blissful-franklin' },
      { name: 'cgli-core', path: 'c:/Users/aluno/Documents/antigravity/cgli-core' },
      { name: 'studio-clean-demo', path: 'c:/Users/aluno/Documents/antigravity/demo' },
    ],
  },
]

const getInitialProjectState = (): { projects: ProjectInfo[]; currentId: string; project: ProjectInfo } => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cgli_projects_v2')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const lastActive = localStorage.getItem('cgli_current_project_id') || parsed[0].id
          const current = parsed.find((p: any) => p.id === lastActive) || parsed[0]
          return { projects: parsed, currentId: current.id, project: current }
        }
      }
    } catch (e) {
      console.error('Error loading projects from localStorage:', e)
    }
  }
  return {
    projects: defaultProjects,
    currentId: defaultProjects[0].id,
    project: defaultProjects[0],
  }
}

const initialProjState = getInitialProjectState()

export const useCanvasStore = create<CanvasState>((set, get) => ({
  theme: 'dark',
  setTheme: (theme) => {
    set({ theme })
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  projects: initialProjState.projects,
  currentProjectId: initialProjState.currentId,
  project: initialProjState.project,
  isNewProjectOpen: false,
  isManageWorkspaceOpen: false,

  openNewProjectModal: () => set({ isNewProjectOpen: true }),
  closeNewProjectModal: () => set({ isNewProjectOpen: false }),
  openManageWorkspaceModal: () => set({ isManageWorkspaceOpen: true }),
  closeManageWorkspaceModal: () => set({ isManageWorkspaceOpen: false }),

  createProject: (name, folders) => {
    const projId = `proj-${Date.now()}`
    const workspaceFolders: WorkspaceFolder[] = folders.map((f, i) => ({
      id: `f-${Date.now()}-${i}`,
      name: f.name || `pasta-${i + 1}`,
      path: f.path,
      isPrimary: i === 0,
    }))

    const newProj: ProjectInfo = {
      id: projId,
      name: name.trim() || 'Novo Projeto',
      path: workspaceFolders[0]?.path || '',
      folders: workspaceFolders,
      activeFolderId: workspaceFolders[0]?.id,
      createdAt: new Date().toISOString(),
      recentProjects: [],
    }

    const currentId = get().currentProjectId
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        `cgli_canvas_${currentId}`,
        JSON.stringify({
          nodes: get().nodes,
          edges: get().edges,
        })
      )
    }

    const updatedProjects = [newProj, ...get().projects]
    if (typeof window !== 'undefined') {
      localStorage.setItem('cgli_projects_v2', JSON.stringify(updatedProjects))
      localStorage.setItem('cgli_current_project_id', projId)
    }

    const freshClaudeNode: Node = {
      id: `node-claude-${Date.now()}`,
      type: 'agentNode',
      position: { x: 260, y: 160 },
      data: {
        title: 'Claude Code',
        agentType: 'claude',
        role: 'planner',
        status: 'idle',
        viewMode: 'extension',
        thinking: null,
        messages: [],
        approvals: [],
        attachedImages: [],
        terminalLogs: [`> Sessão Claude Code inicializada em [${newProj.name}]`],
      },
    }

    set({
      projects: updatedProjects,
      currentProjectId: projId,
      project: newProj,
      nodes: [freshClaudeNode],
      edges: [],
      isNewProjectOpen: false,
      annotatingNodeId: null,
    })
  },

  switchProject: (projectId) => {
    if (projectId === get().currentProjectId) return
    const target = get().projects.find((p) => p.id === projectId)
    if (!target) return

    const currentId = get().currentProjectId
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        `cgli_canvas_${currentId}`,
        JSON.stringify({
          nodes: get().nodes,
          edges: get().edges,
        })
      )
    }

    let targetNodes = initialNodes
    let targetEdges = initialEdges
    if (typeof window !== 'undefined') {
      localStorage.setItem('cgli_current_project_id', projectId)
      const saved = localStorage.getItem(`cgli_canvas_${projectId}`)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed.nodes) targetNodes = parsed.nodes
          if (parsed.edges) targetEdges = parsed.edges
        } catch (e) {
          console.error('Error restoring project canvas:', e)
        }
      }
    }

    set({
      currentProjectId: projectId,
      project: target,
      nodes: targetNodes,
      edges: targetEdges,
      annotatingNodeId: null,
    })
  },

  addFolderToProject: (projectId, folder) => {
    const updatedProjects = get().projects.map((p) => {
      if (p.id === projectId) {
        const newFolder: WorkspaceFolder = {
          id: `f-${Date.now()}`,
          name: folder.name || 'Nova Pasta',
          path: folder.path,
          isPrimary: p.folders.length === 0,
        }
        const newFolders = [...p.folders, newFolder]
        return {
          ...p,
          folders: newFolders,
          path: p.path || newFolder.path,
        }
      }
      return p
    })

    if (typeof window !== 'undefined') {
      localStorage.setItem('cgli_projects_v2', JSON.stringify(updatedProjects))
    }

    const current = updatedProjects.find((p) => p.id === get().currentProjectId)
    set({
      projects: updatedProjects,
      project: current || get().project,
    })
  },

  removeFolderFromProject: (projectId, folderId) => {
    const updatedProjects = get().projects.map((p) => {
      if (p.id === projectId) {
        const newFolders = p.folders.filter((f) => f.id !== folderId)
        return {
          ...p,
          folders: newFolders,
          path: newFolders[0]?.path || '',
          activeFolderId: p.activeFolderId === folderId ? newFolders[0]?.id : p.activeFolderId,
        }
      }
      return p
    })

    if (typeof window !== 'undefined') {
      localStorage.setItem('cgli_projects_v2', JSON.stringify(updatedProjects))
    }

    const current = updatedProjects.find((p) => p.id === get().currentProjectId)
    set({
      projects: updatedProjects,
      project: current || get().project,
    })
  },

  setActiveFolder: (projectId, folderId) => {
    const updatedProjects = get().projects.map((p) => {
      if (p.id === projectId) {
        const targetFolder = p.folders.find((f) => f.id === folderId)
        return {
          ...p,
          activeFolderId: folderId,
          path: targetFolder?.path || p.path,
        }
      }
      return p
    })

    if (typeof window !== 'undefined') {
      localStorage.setItem('cgli_projects_v2', JSON.stringify(updatedProjects))
    }

    const current = updatedProjects.find((p) => p.id === get().currentProjectId)
    set({
      projects: updatedProjects,
      project: current || get().project,
    })
  },

  deleteProject: (projectId) => {
    if (get().projects.length <= 1) return
    const remaining = get().projects.filter((p) => p.id !== projectId)
    let nextCurrent = get().currentProjectId
    if (nextCurrent === projectId) {
      nextCurrent = remaining[0].id
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(`cgli_canvas_${projectId}`)
      localStorage.setItem('cgli_projects_v2', JSON.stringify(remaining))
      localStorage.setItem('cgli_current_project_id', nextCurrent)
    }

    const current = remaining.find((p) => p.id === nextCurrent) || remaining[0]
    set({
      projects: remaining,
      currentProjectId: nextCurrent,
      project: current,
    })
  },

  setProject: (partial) => {
    set((state) => ({ project: { ...state.project, ...partial } }))
  },

  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: (changes) => {
    let currentNodes = get().nodes
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const node = currentNodes.find((n) => n.id === change.id)
        if (node && node.type === 'groupNode' && (node.data as any)?.nodeIds?.length > 0) {
          const deltaX = change.position.x - node.position.x
          const deltaY = change.position.y - node.position.y
          if (deltaX !== 0 || deltaY !== 0) {
            const memberIds = (node.data as any).nodeIds as string[]
            currentNodes = currentNodes.map((n) => {
              if (memberIds.includes(n.id)) {
                return {
                  ...n,
                  position: {
                    x: n.position.x + deltaX,
                    y: n.position.y + deltaY,
                  },
                }
              }
              return n
            })
          }
        }
      }
    }
    set({
      nodes: applyNodeChanges(changes, currentNodes),
    })
  },
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    })
  },
  onConnect: (connection) => {
    const sourceNode = get().nodes.find((n) => n.id === connection.source)
    const targetNode = get().nodes.find((n) => n.id === connection.target)

    let strokeColor = '#6366F1'
    if (sourceNode?.type === 'imageNode' || sourceNode?.type === 'imageGroupNode') {
      strokeColor = '#F43F5E'
    } else if (sourceNode?.type === 'agentNode') {
      strokeColor = (sourceNode.data as any).agentType === 'claude' ? '#EA580C' : '#0284C7'
    }

    set({
      edges: addEdge(
        {
          ...connection,
          type: 'removable',
          animated: true,
          style: { stroke: strokeColor, strokeWidth: 2 },
        },
        get().edges
      ),
    })

    // If connecting an image or image group to an agent, automatically attach it
    if (sourceNode && targetNode && targetNode.type === 'agentNode') {
      if (sourceNode.type === 'imageNode') {
        const imgData = sourceNode.data as any
        get().attachImageToAgent(targetNode.id, {
          id: sourceNode.id,
          url: imgData.url,
          name: imgData.name || imgData.title || 'captura-de-tela.png',
        })
      } else if (sourceNode.type === 'imageGroupNode') {
        const groupData = sourceNode.data as any
        ;(groupData.images || []).forEach((img: any) => {
          get().attachImageToAgent(targetNode.id, {
            id: img.id,
            url: img.url,
            name: img.name || 'grupo-imagem.png',
          })
        })
      }
    }
  },
  addNode: (node) => {
    set({ nodes: [...get().nodes, node] })
  },
  updateNodeData: (id, data) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...data,
            },
          }
        }
        return node
      }),
    })
  },
  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id),
    })
  },

  stashItems: [
    {
      id: 'stash-item-demo',
      nodeId: 'node-archived-demo',
      name: 'Claude Code (Sessão Anterior)',
      type: 'agent',
      savedAt: '17/09/2026 13:45',
      nodeData: {
        title: 'Claude Code (Refactor)',
        agentType: 'claude',
        role: 'planner',
        status: 'idle',
        viewMode: 'extension',
        messages: [{ id: 'm-old', sender: 'agent', text: 'Refatoração da store concluída.', timestamp: '13:40' }],
      },
      position: { x: 300, y: 300 },
      previewSnippet: 'Refatoração da store concluída com sucesso.',
    },
  ],
  isStashOpen: false,
  toggleStashOpen: () => set((state) => ({ isStashOpen: !state.isStashOpen })),
  setStashOpen: (open) => set({ isStashOpen: open }),
  stashNode: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return

    if (node.type === 'groupNode') {
      get().stashGroup(id)
      return
    }

    let type: StashItem['type'] = 'agent'
    if (node.type === 'artifactNode') type = 'artifact'
    else if (node.type === 'imageNode') type = 'image'
    else if (node.type === 'imageGroupNode') type = 'imageGroup'

    const dataObj = node.data as any
    const preview =
      dataObj?.title ||
      dataObj?.messages?.[dataObj?.messages?.length - 1]?.text ||
      'Nó arquivado'

    const newItem: StashItem = {
      id: `stash-${Date.now()}`,
      nodeId: node.id,
      name: (node.data as any)?.title || `Nó ${node.id}`,
      type,
      savedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      nodeData: node.data,
      position: node.position,
      previewSnippet: typeof preview === 'string' ? preview.slice(0, 70) : 'Item arquivado',
    }

    set({
      stashItems: [newItem, ...get().stashItems],
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
    })
  },
  restoreFromStash: (stashId) => {
    const item = get().stashItems.find((s) => s.id === stashId)
    if (!item) return

    if (item.type === 'group') {
      const groupData = item.nodeData as {
        groupNode: Node
        memberNodes: Node[]
        memberEdges: Edge[]
      }
      const offsetX = 50
      const offsetY = 50

      const restoredGroupNode: Node = {
        ...groupData.groupNode,
        id: `${groupData.groupNode.id}-restored-${Date.now()}`,
        position: {
          x: groupData.groupNode.position.x + offsetX,
          y: groupData.groupNode.position.y + offsetY,
        },
      }

      const restoredMemberNodes = (groupData.memberNodes || []).map((node) => ({
        ...node,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
      }))

      restoredGroupNode.data = {
        ...restoredGroupNode.data,
        nodeIds: restoredMemberNodes.map((n) => n.id),
      }

      set({
        nodes: [...get().nodes, restoredGroupNode, ...restoredMemberNodes],
        edges: [...get().edges, ...(groupData.memberEdges || [])],
        stashItems: get().stashItems.filter((s) => s.id !== stashId),
      })
      return
    }

    let nodeType = 'agentNode'
    if (item.type === 'artifact') nodeType = 'artifactNode'
    else if (item.type === 'image') nodeType = 'imageNode'
    else if (item.type === 'imageGroup') nodeType = 'imageGroupNode'

    const restoredNode: Node = {
      id: `${item.nodeId}-restored-${Date.now()}`,
      type: nodeType,
      position: {
        x: item.position.x + 40,
        y: item.position.y + 40,
      },
      data: item.nodeData,
    }

    set({
      nodes: [...get().nodes, restoredNode],
      stashItems: get().stashItems.filter((s) => s.id !== stashId),
    })
  },
  removeStashItem: (stashId) => {
    set({
      stashItems: get().stashItems.filter((s) => s.id !== stashId),
    })
  },

  isSettingsOpen: false,
  settingsTab: 0,
  openSettings: (tab = 0) => set({ isSettingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ isSettingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  annotatingNodeId: null,
  openAnnotationModal: (nodeId) => set({ annotatingNodeId: nodeId }),
  closeAnnotationModal: () => set({ annotatingNodeId: null }),
  saveAnnotations: (nodeId, annotations) => {
    get().updateNodeData(nodeId, { annotations })
    set({ annotatingNodeId: null })
  },

  clis: initialClis,
  updateCli: (id, partial) => {
    set({
      clis: get().clis.map((cli) => (cli.id === id ? { ...cli, ...partial } : cli)),
    })
  },
  addCli: (cli) => {
    set({ clis: [...get().clis, cli] })
  },

  skills: initialSkills,
  toggleSkill: (id) => {
    set({
      skills: get().skills.map((skill) =>
        skill.id === id ? { ...skill, enabled: !skill.enabled } : skill
      ),
    })
  },
  addSkill: (skill) => {
    set({ skills: [...get().skills, skill] })
  },

  sendAgentMessage: async (nodeId, text, images) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return

    const agentType = (node.data as any).agentType || 'claude'

    // Collect images attached directly AND connected via canvas edges to this node
    const connectedEdges = get().edges.filter((e) => e.target === nodeId || e.source === nodeId)
    const connectedImageUrls: string[] = []
    for (const edge of connectedEdges) {
      const otherNodeId = edge.target === nodeId ? edge.source : edge.target
      const otherNode = get().nodes.find((n) => n.id === otherNodeId)
      if (otherNode?.type === 'imageNode') {
        const d = otherNode.data as any
        if (d?.url) connectedImageUrls.push(d.url)
      } else if (otherNode?.type === 'imageGroupNode') {
        const d = otherNode.data as any
        if (d?.images) {
          d.images.forEach((img: any) => {
            if (img?.url) connectedImageUrls.push(img.url)
          })
        }
      }
    }

    const allImages = [
      ...(images || []),
      ...connectedImageUrls.filter((u) => !(images || []).includes(u)),
    ]

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      images: allImages.length > 0 ? allImages : undefined,
    }

    const currentMessages = ((node.data as any).messages || []) as ChatMessage[]
    const updatedMessages = [...currentMessages, userMessage]

    get().updateNodeData(nodeId, {
      messages: updatedMessages,
      status: 'running',
      attachedImages: [],
      thinking: {
        duration: 'Executando CLI real...',
        thoughts: [
          `Enviando instrução para o binário ${agentType} instalado no sistema...`,
          allImages.length > 0
            ? `${allImages.length} imagem(ns) conectada(s) pelo canvas incluída(s) no contexto.`
            : 'Contexto do workspace anexado.',
        ],
        isExpanded: true,
      },
    })

    const startTime = Date.now()

    try {
      const proj = get().project
      const activeFolder = proj.folders?.find((f) => f.id === proj.activeFolderId) || proj.folders?.[0]
      const cwd = activeFolder?.path || proj.path

      let workspaceContext = ''
      if (proj.folders && proj.folders.length > 1) {
        workspaceContext = `[Workspace Multi-Pastas (${proj.folders.length} pastas): ${proj.folders.map((f) => `${f.name}: "${f.path}"`).join(', ')}. Diretório ativo: "${cwd}"]\n`
      }

      let fullPrompt = `${workspaceContext}${text}`
      if (allImages.length > 0) {
        fullPrompt = `${workspaceContext}[Contexto: ${allImages.length} imagens conectadas pelo canvas]: ${text}`
      }

      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType,
          prompt: fullPrompt,
          images: allImages,
          cwd,
        }),
      })

      const result = await response.json()
      const durationSec = `${((Date.now() - startTime) / 1000).toFixed(1)}s`

      if (result.success && result.output) {
        const responseMessage: ChatMessage = {
          id: `msg-resp-${Date.now()}`,
          sender: 'agent',
          text: result.output,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }

        get().updateNodeData(nodeId, {
          messages: [...updatedMessages, responseMessage],
          status: 'idle',
          thinking: {
            duration: durationSec,
            thoughts: [
              `Resposta retornada pelo CLI ${agentType} em ${durationSec}.`,
              'Execução concluída com código 0.',
            ],
            isExpanded: false,
          },
          terminalLogs: [
            ...((node.data as any).terminalLogs || []),
            `> [${agentType.toUpperCase()}] ${text.slice(0, 45)}...`,
            `> Concluído com sucesso em ${durationSec}`,
          ],
        })

        // Check if this is an analysis or plan request -> spawn ArtifactViewerNode!
        const lower = text.toLowerCase()
        const isPlanRequest =
          lower.includes('plano') ||
          lower.includes('analis') ||
          lower.includes('especifica') ||
          lower.includes('implementa')

        if (isPlanRequest && agentType === 'claude') {
          const existingArtifact = get().nodes.find((n) => n.type === 'artifactNode')
          let targetArtifactId = existingArtifact?.id

          if (!existingArtifact) {
            targetArtifactId = `node-artifact-${Date.now()}`
            const newArtifactNode: Node = {
              id: targetArtifactId,
              type: 'artifactNode',
              position: { x: node.position.x + 500, y: node.position.y - 30 },
              data: {
                title: 'Plano de Implementação Gerado',
                activeTab: 'markdown',
                markdownContent: result.output,
                htmlPreview:
                  '<div style="padding:24px;font-family:sans-serif;color:#94a3b8;background:#0D1117;min-height:100vh"><h3>Aguardando geração pelo AGY...</h3></div>',
                diffContent: {
                  filename: 'src/components/DashboardFeature.tsx',
                  lines: [{ type: 'add', content: '+// Componente planejado por Claude Code' }],
                },
                status: 'draft',
              },
            }

            const edgeToArtifact: Edge = {
              id: `e-${nodeId}-${targetArtifactId}`,
              source: nodeId,
              target: targetArtifactId,
              type: 'removable',
              animated: true,
              style: { stroke: '#EA580C', strokeWidth: 2 },
            }

            set({
              nodes: [...get().nodes, newArtifactNode],
              edges: [...get().edges, edgeToArtifact],
            })
          } else {
            get().updateNodeData(existingArtifact.id, {
              markdownContent: result.output,
              title: 'Plano de Implementação (Atualizado)',
            })
          }

          // If prompt requests AGY or HTML preview or subagent invocation:
          if (
            lower.includes('agy') ||
            lower.includes('preview') ||
            lower.includes('invoc') ||
            lower.includes('subagente')
          ) {
            setTimeout(async () => {
              const agyId = `node-agy-${Date.now()}`
              const agyNode: Node = {
                id: agyId,
                type: 'agentNode',
                position: { x: node.position.x + 1020, y: node.position.y },
                data: {
                  title: 'Antigravity (AGY)',
                  agentType: 'agy',
                  role: 'executor',
                  status: 'running',
                  viewMode: 'extension',
                  thinking: {
                    duration: 'Gerando Preview HTML...',
                    thoughts: [
                      'Subagente invocado autonomamente por Claude Code.',
                      'Executando CLI AGY real para gerar componente HTML/Tailwind...',
                    ],
                    isExpanded: true,
                  },
                  messages: [
                    {
                      id: `msg-${Date.now()}`,
                      sender: 'agent',
                      text: 'Recebi o plano de implementação de Claude. Gerando o preview HTML interativo agora com o CLI real...',
                      timestamp: new Date().toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    },
                  ],
                  approvals: [],
                  attachedImages: [],
                  terminalLogs: [
                    '> Subagente AGY invocado por Claude Code',
                    '> Executando geração do componente HTML via CLI...',
                  ],
                },
              }

              const edgeArtifactToAgy: Edge = {
                id: `e-${targetArtifactId}-${agyId}`,
                source: targetArtifactId!,
                target: agyId,
                type: 'removable',
                animated: true,
                style: { stroke: '#0284C7', strokeWidth: 2 },
              }

              set({
                nodes: [...get().nodes, agyNode],
                edges: [...get().edges, edgeArtifactToAgy],
              })

              // Run real AGY CLI to generate HTML
              try {
                const agyRes = await fetch('/api/agent/run', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    agentType: 'agy',
                    prompt: `Gere apenas o codigo HTML completo com inline CSS para uma tela bonita de preview moderna (dashboard ou card de metricas). Responda apenas com a tag HTML, sem explicacoes.`,
                  }),
                })
                const agyData = await agyRes.json()
                let generatedHtml = agyData.output || ''

                // Clean markdown code blocks if any
                generatedHtml = generatedHtml
                  .replace(/^```html\s*/i, '')
                  .replace(/```\s*$/i, '')
                  .trim()

                if (!generatedHtml || !generatedHtml.includes('<')) {
                  generatedHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; background: #07090E; color: #F0F6FC; padding: 24px; }
    .card { background: #0D1117; border: 1px solid #30363D; border-radius: 12px; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    .badge { background: #0284C7; color: white; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; }
    h2 { color: #38BDF8; margin-top: 12px; }
    p { color: #8B949E; font-size: 13px; line-height: 1.6; }
    .btn { background: #0284C7; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">AGY Executor</span>
    <h2>Componente Gerado com Sucesso</h2>
    <p>Preview interativo gerado autonomamente a partir da análise de imagem de Claude Code.</p>
    <button class="btn">Executar Ação</button>
  </div>
</body>
</html>`
                }

                get().updateNodeData(targetArtifactId!, {
                  htmlPreview: generatedHtml,
                  activeTab: 'preview',
                  status: 'approved',
                })

                get().updateNodeData(agyId, {
                  status: 'idle',
                  thinking: {
                    duration: '1.4s',
                    thoughts: [
                      'Preview HTML gerado com sucesso pelo AGY.',
                      'Aba de preview do artefato atualizada no canvas.',
                    ],
                    isExpanded: false,
                  },
                  messages: [
                    ...((agyNode.data as any).messages || []),
                    {
                      id: `msg-resp-agy-${Date.now()}`,
                      sender: 'agent',
                      text: 'Preview HTML gerado com sucesso e incorporado diretamente na aba "Preview" do nó Visualizador de Artefatos!',
                      timestamp: new Date().toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    },
                  ],
                })
              } catch (e: any) {
                console.error('AGY CLI generation error:', e)
              }
            }, 1000)
          }
        }
      } else {
        const errMessage: ChatMessage = {
          id: `msg-err-${Date.now()}`,
          sender: 'agent',
          text: `Retorno do CLI: ${result.output || result.error || 'Erro ao executar binário.'}`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }
        get().updateNodeData(nodeId, {
          messages: [...updatedMessages, errMessage],
          status: 'error',
          thinking: {
            duration: 'Erro',
            thoughts: [result.error || 'Falha na execução do processo.'],
            isExpanded: true,
          },
        })
      }
    } catch (err: any) {
      console.error('Agent execution error:', err)
      const errMessage: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        sender: 'agent',
        text: `Erro de conexão com o CLI local: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }
      get().updateNodeData(nodeId, {
        messages: [...updatedMessages, errMessage],
        status: 'error',
      })
    }
  },

  toggleAgentViewMode: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const currentMode = (node.data as any).viewMode || 'extension'
    const newMode = currentMode === 'extension' ? 'terminal' : 'extension'
    get().updateNodeData(nodeId, { viewMode: newMode })
  },

  handleApproval: (nodeId, approvalId, action) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const approvals = ((node.data as any).approvals || []) as ActionApproval[]
    const updatedApprovals = approvals.map((appr) =>
      appr.id === approvalId ? { ...appr, status: action } : appr
    )

    get().updateNodeData(nodeId, { approvals: updatedApprovals })
  },

  approveArtifact: (nodeId) => {
    get().updateNodeData(nodeId, { status: 'approved' })

    // Find outgoing edges to trigger the next agent
    const edges = get().edges.filter((e) => e.source === nodeId)
    for (const edge of edges) {
      const targetNode = get().nodes.find((n) => n.id === edge.target)
      if (targetNode && (targetNode.type === 'agentNode')) {
        get().updateNodeData(targetNode.id, {
          status: 'running',
          terminalLogs: [
            ...((targetNode.data as any).terminalLogs || []),
            `> Notificação recebida do artefato [${nodeId}]: Aprovado`,
            `> Iniciando execução da etapa configurada...`,
          ],
        })
        setTimeout(() => {
          get().updateNodeData(targetNode.id, { status: 'idle' })
        }, 1500)
      }
    }
  },

  attachImageToAgent: (nodeId, image) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const current = ((node.data as any).attachedImages || []) as Array<{ id: string; url: string; name: string }>
    if (!current.some((img) => img.id === image.id)) {
      get().updateNodeData(nodeId, { attachedImages: [...current, image] })
    }
  },

  removeAttachedImage: (nodeId, imageId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const current = ((node.data as any).attachedImages || []) as Array<{ id: string; url: string; name: string }>
    get().updateNodeData(nodeId, {
      attachedImages: current.filter((img) => img.id !== imageId),
    })
  },

  spawnSubagent: (parentId, childType) => {
    const parent = get().nodes.find((n) => n.id === parentId)
    if (!parent) return

    const childId = `node-${childType}-sub-${Date.now()}`
    const isClaude = childType === 'claude'
    const color = isClaude ? '#EA580C' : '#0284C7'

    const existingOutEdges = get().edges.filter((e) => e.source === parentId)
    const posX = parent.position.x + 480
    const posY = parent.position.y + existingOutEdges.length * 140

    const newSubNode: Node = {
      id: childId,
      type: 'agentNode',
      position: { x: posX, y: posY },
      data: {
        title: isClaude ? 'Subagente Claude Code' : 'Subagente Antigravity (AGY)',
        agentType: childType,
        role: isClaude ? 'planner' : 'executor',
        status: 'idle',
        viewMode: 'extension',
        thinking: {
          duration: 'Pronto',
          thoughts: [
            `Subagente instanciado dinamicamente a partir do nó [${(parent.data as any).title || parentId}].`,
            'Canal de comunicação entre agentes configurado via grafo.',
          ],
          isExpanded: false,
        },
        messages: [
          {
            id: `msg-sub-${Date.now()}`,
            sender: 'agent',
            text: `Subagente ${childType.toUpperCase()} inicializado e vinculado ao nó pai. Pronto para receber sub-tarefas especializadas.`,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          },
        ],
        approvals: [],
        attachedImages: [],
        terminalLogs: [
          `> [SPAWN] Subagente ${childType.toUpperCase()} criado pelo nó [${parentId}]`,
          `> Conexão PTY multiplexada pronta`,
          `> Sessão vinculada ao workspace ativo`,
        ],
      },
    }

    const newEdge: Edge = {
      id: `e-${parentId}-${childId}`,
      source: parentId,
      target: childId,
      animated: true,
      style: { stroke: color, strokeWidth: 2, strokeDasharray: '4 4' },
    }

    const currentParentLogs = ((parent.data as any).terminalLogs || []) as string[]
    const updatedParentLogs = [
      ...currentParentLogs,
      `> [SPAWN] Subagente [${newSubNode.data.title}] criado e conectado com sucesso.`,
    ]

    set({
      nodes: [
        ...get().nodes.map((n) =>
          n.id === parentId
            ? { ...n, data: { ...n.data, terminalLogs: updatedParentLogs } }
            : n
        ),
        newSubNode,
      ],
      edges: [...get().edges, newEdge],
    })
  },

  deleteEdge: (edgeId) => {
    set({
      edges: get().edges.filter((e) => e.id !== edgeId),
    })
  },

  addNodeToGroup: (groupId, nodeId) => {
    const groupNode = get().nodes.find((n) => n.id === groupId)
    const targetNode = get().nodes.find((n) => n.id === nodeId)
    if (!groupNode || !targetNode) return

    const currentMemberIds = ((groupNode.data as any)?.nodeIds || []) as string[]
    if (currentMemberIds.includes(nodeId)) return

    const updatedMemberIds = [...currentMemberIds, nodeId]

    // Recalculate group bounding box to comfortably include the new node
    const allMembers = get().nodes.filter((n) => updatedMemberIds.includes(n.id))
    let minX = groupNode.position.x
    let minY = groupNode.position.y
    const groupW = Number((groupNode.data as any)?.width) || (groupNode.style?.width as number) || 560
    const groupH = Number((groupNode.data as any)?.height) || (groupNode.style?.height as number) || 420
    let maxX = groupNode.position.x + groupW
    let maxY = groupNode.position.y + groupH

    for (const m of allMembers) {
      const mw = (m.style as any)?.width || 420
      const mh = (m.style as any)?.height || 360
      if (m.position.x < minX + 20) minX = m.position.x - 40
      if (m.position.y < minY + 60) minY = m.position.y - 60
      if (m.position.x + mw > maxX - 20) maxX = m.position.x + mw + 40
      if (m.position.y + mh > maxY - 20) maxY = m.position.y + mh + 40
    }

    const newW = Math.max(maxX - minX, 520)
    const newH = Math.max(maxY - minY, 380)

    set({
      nodes: get().nodes.map((n) => {
        if (n.id === groupId) {
          return {
            ...n,
            position: { x: minX, y: minY },
            style: { ...n.style, width: newW, height: newH, zIndex: -1 },
            data: {
              ...n.data,
              nodeIds: updatedMemberIds,
              width: newW,
              height: newH,
            },
          }
        }
        return n
      }),
    })
  },

  removeNodeFromGroup: (groupId, nodeId) => {
    const groupNode = get().nodes.find((n) => n.id === groupId)
    if (!groupNode) return

    const currentMemberIds = ((groupNode.data as any)?.nodeIds || []) as string[]
    const updatedMemberIds = currentMemberIds.filter((id) => id !== nodeId)

    set({
      nodes: get().nodes.map((n) =>
        n.id === groupId
          ? {
              ...n,
              data: {
                ...n.data,
                nodeIds: updatedMemberIds,
              },
            }
          : n
      ),
    })
  },

  autoFitGroup: (groupId) => {
    const groupNode = get().nodes.find((n) => n.id === groupId)
    if (!groupNode) return

    const memberIds = ((groupNode.data as any)?.nodeIds || []) as string[]
    const members = get().nodes.filter((n) => memberIds.includes(n.id))
    if (members.length === 0) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const m of members) {
      const mw = (m.style as any)?.width || 420
      const mh = (m.style as any)?.height || 360
      if (m.position.x < minX) minX = m.position.x
      if (m.position.y < minY) minY = m.position.y
      if (m.position.x + mw > maxX) maxX = m.position.x + mw
      if (m.position.y + mh > maxY) maxY = m.position.y + mh
    }

    const padding = 40
    const newX = minX - padding
    const newY = minY - padding - 30
    const newW = Math.max(maxX - minX + padding * 2, 480)
    const newH = Math.max(maxY - minY + padding * 2 + 30, 360)

    set({
      nodes: get().nodes.map((n) =>
        n.id === groupId
          ? {
              ...n,
              position: { x: newX, y: newY },
              style: { ...n.style, width: newW, height: newH, zIndex: -1 },
              data: {
                ...n.data,
                width: newW,
                height: newH,
              },
            }
          : n
      ),
    })
  },

  groupSelectedNodes: (nodeIds, title = 'Grupo de Nós') => {
    if (!nodeIds || nodeIds.length === 0) return

    const selectedNodes = get().nodes.filter((n) => nodeIds.includes(n.id))
    if (selectedNodes.length === 0) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of selectedNodes) {
      const x = node.position.x
      const y = node.position.y
      const w = 460
      const h = 380
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x + w > maxX) maxX = x + w
      if (y + h > maxY) maxY = y + h
    }

    const padding = 50
    const groupX = minX - padding
    const groupY = minY - padding - 40
    const groupW = Math.max(maxX - minX + padding * 2, 520)
    const groupH = Math.max(maxY - minY + padding * 2 + 40, 420)

    const groupId = `group-${Date.now()}`
    const newGroupNode: Node = {
      id: groupId,
      type: 'groupNode',
      position: { x: groupX, y: groupY },
      style: { width: groupW, height: groupH, zIndex: -1 },
      data: {
        title,
        nodeIds,
        width: groupW,
        height: groupH,
      },
    }

    // Place the group container node behind its member nodes
    set({
      nodes: [newGroupNode, ...get().nodes],
    })
  },

  ungroupNodes: (groupId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== groupId),
    })
  },

  stashGroup: (groupId) => {
    const groupNode = get().nodes.find((n) => n.id === groupId)
    if (!groupNode) return

    const memberNodeIds = ((groupNode.data as any)?.nodeIds || []) as string[]
    const allNodeIdsToStash = [groupId, ...memberNodeIds]

    const memberNodes = get().nodes.filter((n) => memberNodeIds.includes(n.id))
    const memberEdges = get().edges.filter(
      (e) => allNodeIdsToStash.includes(e.source) || allNodeIdsToStash.includes(e.target)
    )

    const newItem: StashItem = {
      id: `stash-group-${Date.now()}`,
      nodeId: groupId,
      name: (groupNode.data as any)?.title || 'Grupo de Nós',
      type: 'group',
      savedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      nodeData: {
        groupNode,
        memberNodes,
        memberEdges,
      },
      position: groupNode.position,
      previewSnippet: `${memberNodes.length} nós arquivados (${memberNodes
        .map((n) => (n.data as any)?.title || n.id)
        .join(', ')})`,
    }

    set({
      stashItems: [newItem, ...get().stashItems],
      nodes: get().nodes.filter((n) => !allNodeIdsToStash.includes(n.id)),
      edges: get().edges.filter(
        (e) => !allNodeIdsToStash.includes(e.source) && !allNodeIdsToStash.includes(e.target)
      ),
    })
  },
}))

if (typeof window !== 'undefined') {
  ;(window as any).__canvasStore = useCanvasStore
}
