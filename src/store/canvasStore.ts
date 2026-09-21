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
import { ptyService } from '../services/ptyService'
import type {
  ActionApproval,
  AnnotationItem,
  AttachedArtifactBadge,
  ChatMessage,
  CliConfig,
  DiffLine,
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
  getActiveWorkspacePath: () => string

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
  attachImageToAgent: (nodeId: string, image: { id: string; url: string; name: string; nodeId?: string }) => void
  removeAttachedImage: (nodeId: string, imageId: string) => void
  attachArtifactToAgent: (agentId: string, artifact: AttachedArtifactBadge) => void
  removeAttachedArtifact: (agentId: string, artifactId: string) => void
  toggleAgentDiffNode: (agentId: string) => void
  addImageToNode: (nodeId: string, image: { url: string; name?: string }) => void
  spawnSubagent: (parentId: string, childType: 'claude' | 'agy') => void
  createArtifactFromAgent: (agentId: string, title: string, content: string) => void
  createPreviewFromAgent: (agentId: string, title: string, html: string) => void
  createDiffFromAgent: (agentId: string, title: string, filename: string, lines?: DiffLine[]) => void
  spawnSubagentFromAction: (parentId: string, childType: string, role?: string, task?: string) => void
  deleteEdge: (edgeId: string) => void
  addNodeToGroup: (groupId: string, nodeId: string) => void
  removeNodeFromGroup: (groupId: string, nodeId: string) => void
  autoFitGroup: (groupId: string) => void
  toggleGroupReactive: (groupId: string) => void
  setGroupDragOver: (groupId: string | null) => void
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
    defaultArgs: '--dangerously-skip-permissions',
  },
  {
    id: 'agy',
    name: 'Antigravity (AGY)',
    binary: 'agy',
    color: '#0284C7',
    active: true,
    role: 'executor',
    defaultArgs: '--dangerously-skip-permissions',
  },
]

const getInitialClis = (): CliConfig[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cgli_clis')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitize any legacy mock accounts or invalid CLI arguments
          return parsed.map((cli: any) => {
            if (cli.id === 'agy' && cli.defaultArgs?.includes('--stream')) {
              cli.defaultArgs = '--dangerously-skip-permissions'
            }
            if (
              cli.connectedAccount &&
              (cli.connectedAccount.email?.includes('developer@workspace.dev') ||
                cli.connectedAccount.email?.includes('aluno@gemini.local') ||
                cli.connectedAccount.tokenOrKey?.includes('••••'))
            ) {
              return { ...cli, connectedAccount: undefined }
            }
            return cli
          })
        }
      }
    } catch (e) {
      console.error('Error loading clis from localStorage:', e)
    }
  }
  return initialClis
}

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

const getInitialSkills = (): SkillItem[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cgli_skills')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.error('Error loading skills from localStorage:', e)
    }
  }
  return initialSkills
}

const getInitialCanvasState = (projectId: string): { nodes: Node[]; edges: Edge[] } => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(`cgli_canvas_${projectId}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          // Sanitize any legacy mock demo nodes or legacy diff mock content
          const cleanNodes = parsed.nodes
            .filter(
              (n: any) =>
                n.id !== 'node-claude-1' &&
                n.id !== 'node-agy-1' &&
                n.id !== 'node-archived-demo' &&
                !String(n.id || '').includes('sub-1789828517030')
            )
            .map((n: any) => {
              if (n.type === 'diffNode') {
                const hasMockDiff = n.data?.lines?.some((l: any) =>
                  String(l?.content || '').includes('Implementação anterior') ||
                  String(l?.content || '').includes('validatedFeature')
                )
                if (hasMockDiff) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      lines: [],
                      filename: 'Nenhum arquivo modificado',
                      title: 'Diff de Alterações',
                      stats: { additions: 0, deletions: 0 },
                    },
                  }
                }
              }
              if (n.type === 'agentNode') {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'idle',
                    viewMode: 'terminal',
                    sessionId: n.data?.sessionId || `pty-${n.id}`,
                    isPtyActive: true,
                  },
                }
              }
              return n
            })
          const cleanEdges = parsed.edges.filter(
            (e: any) =>
              cleanNodes.some((n: any) => n.id === e.source) && cleanNodes.some((n: any) => n.id === e.target)
          )
          return { nodes: cleanNodes, edges: cleanEdges }
        }
      }
    } catch (e) {
      console.error('Error loading canvas from localStorage:', e)
    }
  }
  return { nodes: [], edges: [] }
}

const getInitialStashItems = (): StashItem[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cgli_stash_items')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Remove any legacy mock demo stash item and mock diff items
          return parsed
            .filter(
              (item: any) =>
                item.id !== 'stash-item-demo' &&
                item.nodeId !== 'node-archived-demo' &&
                !String(item.previewSnippet || '').includes('validatedFeature') &&
                !String(item.previewSnippet || '').includes('Implementação anterior')
            )
            .map((item: any) => {
              if (item.type === 'diff') {
                const nodeData = item.nodeData as any
                const hasMock = nodeData?.lines?.some((l: any) =>
                  String(l?.content || '').includes('Implementação anterior') ||
                  String(l?.content || '').includes('validatedFeature')
                )
                if (hasMock) {
                  return {
                    ...item,
                    previewSnippet: 'Nenhum arquivo modificado',
                    nodeData: {
                      ...nodeData,
                      lines: [],
                      filename: 'Nenhum arquivo modificado',
                      title: 'Diff de Alterações',
                      stats: { additions: 0, deletions: 0 },
                    },
                  }
                }
              }
              return item
            })
        }
      }
    } catch (e) {
      console.error('Error loading stash from localStorage:', e)
    }
  }
  return []
}

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
          // Sanitize legacy mock projects from recent list
          const sanitizedProjects = parsed.map((p: any) => ({
            ...p,
            recentProjects: Array.isArray(p.recentProjects)
              ? p.recentProjects.filter(
                  (r: any) => r.name !== 'cgli-core' && r.name !== 'studio-clean-demo'
                )
              : [{ name: p.name, path: p.path }],
          }))
          const lastActive = localStorage.getItem('cgli_current_project_id') || sanitizedProjects[0].id
          const current = sanitizedProjects.find((p: any) => p.id === lastActive) || sanitizedProjects[0]
          return { projects: sanitizedProjects, currentId: current.id, project: current }
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
const initialCanvas = getInitialCanvasState(initialProjState.currentId)
const initialStash = getInitialStashItems()
const initialClisList = getInitialClis()
const initialSkillsList = getInitialSkills()

export const getNodeDimensions = (node: Node): { width: number; height: number } => {
  const measuredW = Number(node.measured?.width)
  const measuredH = Number(node.measured?.height)
  if (measuredW > 0 && measuredH > 0) {
    return { width: measuredW, height: measuredH }
  }

  const nodeW = Number(node.width)
  const nodeH = Number(node.height)
  if (nodeW > 0 && nodeH > 0) {
    return { width: nodeW, height: nodeH }
  }

  const styleW =
    typeof node.style?.width === 'number'
      ? node.style.width
      : parseInt(String(node.style?.width || '0'), 10)
  const styleH =
    typeof node.style?.height === 'number'
      ? node.style.height
      : parseInt(String(node.style?.height || '0'), 10)
  if (styleW > 0 && styleH > 0) {
    return { width: styleW, height: styleH }
  }

  switch (node.type) {
    case 'agentNode':
      return { width: 380, height: 380 }
    case 'artifactNode':
      return { width: 400, height: 320 }
    case 'previewNode':
      return { width: 440, height: 360 }
    case 'diffNode':
      return { width: 440, height: 320 }
    case 'imageNode':
      return { width: 340, height: 280 }
    case 'imageGroupNode':
      return { width: 360, height: 300 }
    case 'groupNode':
      return { width: 560, height: 420 }
    default:
      return { width: 380, height: 320 }
  }
}

export const calculateGroupBounds = (
  members: Node[],
  options: { padX?: number; padTop?: number; padBottom?: number } = {}
): { x: number; y: number; width: number; height: number } | null => {
  if (!members || members.length === 0) return null

  const padX = options.padX ?? 36
  const padTop = options.padTop ?? 94 // Clears header bar and member badges bar cleanly
  const padBottom = options.padBottom ?? 36

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const m of members) {
    const { width: mw, height: mh } = getNodeDimensions(m)
    const mx = m.position.x
    const my = m.position.y

    if (mx < minX) minX = mx
    if (my < minY) minY = my
    if (mx + mw > maxX) maxX = mx + mw
    if (my + mh > maxY) maxY = my + mh
  }

  const x = Math.round(minX - padX)
  const y = Math.round(minY - padTop)
  const width = Math.round(Math.max(maxX - minX + padX * 2, 440))
  const height = Math.round(Math.max(maxY - minY + padTop + padBottom, 280))

  return { x, y, width, height }
}

export const detachImagesForNode = (
  imageNodeId: string,
  imageNodeData: any,
  edges: Edge[],
  getNodes: () => Node[],
  updateNodeData: (nodeId: string, data: any) => void
) => {
  const imageIdsToRemove = new Set<string>()
  const urlsToRemove = new Set<string>()

  imageIdsToRemove.add(imageNodeId)

  if (imageNodeData) {
    if (imageNodeData.images && Array.isArray(imageNodeData.images)) {
      imageNodeData.images.forEach((img: any) => {
        if (img.id) imageIdsToRemove.add(img.id)
        if (img.url) urlsToRemove.add(img.url)
      })
    }
    if (imageNodeData.url) urlsToRemove.add(imageNodeData.url)
  }

  // Find all edges connected to this image node
  const connectedEdges = edges.filter(
    (e) => e.source === imageNodeId || e.target === imageNodeId
  )

  const nodes = getNodes()
  connectedEdges.forEach((edge) => {
    const otherNodeId = edge.source === imageNodeId ? edge.target : edge.source
    const otherNode = nodes.find((n) => n.id === otherNodeId)
    if (otherNode && otherNode.type === 'agentNode') {
      const currentAttached = ((otherNode.data as any).attachedImages || []) as Array<{
        id: string
        url: string
        name: string
        nodeId?: string
      }>
      const updatedAttached = currentAttached.filter(
        (img) =>
          img.nodeId !== imageNodeId &&
          !imageIdsToRemove.has(img.id) &&
          !urlsToRemove.has(img.url)
      )
      updateNodeData(otherNode.id, { attachedImages: updatedAttached })
    }
  })
}

export const detachImagesIfNoRemainingEdge = (
  edge: Edge,
  remainingEdges: Edge[],
  getNodes: () => Node[],
  updateNodeData: (nodeId: string, data: any) => void
) => {
  const nodes = getNodes()
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)

  const agentNode =
    (sourceNode?.type === 'agentNode' ? sourceNode : targetNode?.type === 'agentNode' ? targetNode : null) ||
    nodes.find((n) => (n.id === edge.source || n.id === edge.target) && n.type === 'agentNode')

  if (!agentNode) return

  const imgNodeId = edge.source === agentNode.id ? edge.target : edge.source
  const imgNode = nodes.find((n) => n.id === imgNodeId)

  // Check if there are any remaining edges connecting these two
  const stillConnected = remainingEdges.some(
    (e) =>
      (e.source === imgNodeId && e.target === agentNode.id) ||
      (e.source === agentNode.id && e.target === imgNodeId)
  )

  if (!stillConnected) {
    const imageIdsToRemove = new Set<string>()
    const urlsToRemove = new Set<string>()
    imageIdsToRemove.add(imgNodeId)

    if (imgNode) {
      const imgData = imgNode.data as any
      if (imgData.images && Array.isArray(imgData.images)) {
        imgData.images.forEach((img: any) => {
          if (img.id) imageIdsToRemove.add(img.id)
          if (img.url) urlsToRemove.add(img.url)
        })
      }
      if (imgData.url) urlsToRemove.add(imgData.url)
    }

    const currentAttached = ((agentNode.data as any).attachedImages || []) as Array<{
      id: string
      url: string
      name: string
      nodeId?: string
    }>
    const updatedAttached = currentAttached.filter(
      (img) =>
        img.nodeId !== imgNodeId &&
        !imageIdsToRemove.has(img.id) &&
        !urlsToRemove.has(img.url)
    )
    updateNodeData(agentNode.id, { attachedImages: updatedAttached })
  }
}

export const detachArtifactsIfNoRemainingEdge = (
  edge: Edge,
  remainingEdges: Edge[],
  getNodes: () => Node[],
  updateNodeData: (nodeId: string, data: any) => void
) => {
  const nodes = getNodes()
  const sourceNode = nodes.find((n) => n.id === edge.source)
  const targetNode = nodes.find((n) => n.id === edge.target)

  const agentNode =
    (sourceNode?.type === 'agentNode' ? sourceNode : targetNode?.type === 'agentNode' ? targetNode : null) ||
    nodes.find((n) => (n.id === edge.source || n.id === edge.target) && n.type === 'agentNode')

  if (!agentNode) return

  const artNodeId = edge.source === agentNode.id ? edge.target : edge.source
  const artNode = nodes.find((n) => n.id === artNodeId)

  if (!artNode || (artNode.type !== 'artifactNode' && artNode.type !== 'previewNode')) return

  const stillConnected = remainingEdges.some(
    (e) =>
      (e.source === artNodeId && e.target === agentNode.id) ||
      (e.source === agentNode.id && e.target === artNodeId)
  )

  if (!stillConnected) {
    const currentAttached = ((agentNode.data as any).attachedArtifacts || []) as AttachedArtifactBadge[]
    const updatedAttached = currentAttached.filter((art) => art.sourceNodeId !== artNodeId)
    updateNodeData(agentNode.id, { attachedArtifacts: updatedAttached })
  }
}

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
      localStorage.setItem(`cgli_canvas_${projId}`, JSON.stringify({ nodes: [], edges: [] }))
    }

    set({
      projects: updatedProjects,
      currentProjectId: projId,
      project: newProj,
      nodes: [],
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
      localStorage.setItem('cgli_current_project_id', projectId)
    }

    const targetCanvas = getInitialCanvasState(projectId)

    set({
      currentProjectId: projectId,
      project: target,
      nodes: targetCanvas.nodes,
      edges: targetCanvas.edges,
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
    set((state) => {
      const updated = { ...state.project, ...partial }
      ptyService.syncWorkspaceInfo({
        projectName: updated.name,
        activeFolderId: updated.activeFolderId,
        folders: updated.folders,
      })
      return { project: updated }
    })
  },

  getActiveWorkspacePath: () => {
    const project = get().project
    if (project.activeFolderId && project.folders) {
      const activeFolder = project.folders.find((f) => f.id === project.activeFolderId)
      if (activeFolder?.path) return activeFolder.path
    }
    if (project.folders && project.folders.length > 0) {
      return project.folders[0].path
    }
    return project.path || '.'
  },

  nodes: initialCanvas.nodes,
  edges: initialCanvas.edges,
  onNodesChange: (changes) => {
    let currentNodes = get().nodes
    const groupDeltaMap: Record<string, { deltaX: number; deltaY: number }> = {}
    const agentChildDeltaMap: Record<string, { deltaX: number; deltaY: number }> = {}
    const affectedGroupIds = new Set<string>()

    for (const change of changes) {
      if (change.type === 'remove') {
        const nodeToRemove = currentNodes.find((n) => n.id === change.id)
        if (nodeToRemove && (nodeToRemove.type === 'imageNode' || nodeToRemove.type === 'imageGroupNode')) {
          detachImagesForNode(
            nodeToRemove.id,
            nodeToRemove.data,
            get().edges,
            () => currentNodes,
            (nId, data) => {
              currentNodes = currentNodes.map((n) =>
                n.id === nId ? { ...n, data: { ...n.data, ...data } } : n
              )
              get().updateNodeData(nId, data)
            }
          )
        }
      } else if (change.type === 'position' && change.position) {
        const node = currentNodes.find((n) => n.id === change.id)
        if (node && node.type === 'groupNode') {
          const deltaX = change.position.x - node.position.x
          const deltaY = change.position.y - node.position.y
          if (deltaX !== 0 || deltaY !== 0) {
            groupDeltaMap[node.id] = { deltaX, deltaY }
          }
        } else if (node && node.type === 'agentNode') {
          const deltaX = change.position.x - node.position.x
          const deltaY = change.position.y - node.position.y
          if (deltaX !== 0 || deltaY !== 0) {
            agentChildDeltaMap[node.id] = { deltaX, deltaY }
          }
          // Also check groups containing this agent
          for (const g of currentNodes) {
            if (g.type === 'groupNode') {
              const memberIds = ((g.data as any)?.nodeIds || []) as string[]
              if (memberIds.includes(node.id)) {
                affectedGroupIds.add(g.id)
              }
            }
          }
        } else if (node && node.type !== 'groupNode') {
          for (const g of currentNodes) {
            if (g.type === 'groupNode') {
              const memberIds = ((g.data as any)?.nodeIds || []) as string[]
              if (memberIds.includes(node.id)) {
                affectedGroupIds.add(g.id)
              }
            }
          }
        }
      } else if (change.type === 'dimensions') {
        const node = currentNodes.find((n) => n.id === change.id)
        if (node && node.type === 'groupNode') {
          if (change.dimensions) {
            currentNodes = currentNodes.map((n) =>
              n.id === change.id
                ? {
                    ...n,
                    style: {
                      ...n.style,
                      width: change.dimensions!.width,
                      height: change.dimensions!.height,
                      zIndex: -1,
                    },
                    data: {
                      ...n.data,
                      width: change.dimensions!.width,
                      height: change.dimensions!.height,
                      ...((change as any).resizing ? { isReactive: false } : {}),
                    },
                  }
                : n
            )
          }
        } else if (node && node.type !== 'groupNode') {
          for (const g of currentNodes) {
            if (g.type === 'groupNode') {
              const memberIds = ((g.data as any)?.nodeIds || []) as string[]
              if (memberIds.includes(node.id)) {
                affectedGroupIds.add(g.id)
              }
            }
          }
        }
      }
    }

    if (Object.keys(groupDeltaMap).length > 0) {
      currentNodes = currentNodes.map((n) => {
        for (const [groupId, delta] of Object.entries(groupDeltaMap)) {
          const gNode = currentNodes.find((g) => g.id === groupId)
          const memberIds = ((gNode?.data as any)?.nodeIds || []) as string[]
          if (memberIds.includes(n.id)) {
            return {
              ...n,
              position: {
                x: n.position.x + delta.deltaX,
                y: n.position.y + delta.deltaY,
              },
            }
          }
        }
        return n
      })
    }

    // Move child nodes (artifact, preview, diff) solidarily with their parent agent
    if (Object.keys(agentChildDeltaMap).length > 0) {
      currentNodes = currentNodes.map((n) => {
        const parentAgentId = (n.data as any)?.parentAgentId
        if (parentAgentId && agentChildDeltaMap[parentAgentId]) {
          const delta = agentChildDeltaMap[parentAgentId]
          return {
            ...n,
            position: {
              x: n.position.x + delta.deltaX,
              y: n.position.y + delta.deltaY,
            },
          }
        }
        return n
      })
    }

    let updatedNodes = applyNodeChanges(changes, currentNodes)

    if (affectedGroupIds.size > 0) {
      updatedNodes = updatedNodes.map((gNode) => {
        if (affectedGroupIds.has(gNode.id) && !groupDeltaMap[gNode.id]) {
          const isReactive = (gNode.data as any)?.isReactive !== false
          if (isReactive) {
            const memberIds = ((gNode.data as any)?.nodeIds || []) as string[]
            const members = updatedNodes.filter((n) => memberIds.includes(n.id))
            const bounds = calculateGroupBounds(members)
            if (bounds) {
              return {
                ...gNode,
                position: { x: bounds.x, y: bounds.y },
                style: {
                  ...(gNode as any).style,
                  width: bounds.width,
                  height: bounds.height,
                  zIndex: -1,
                },
                data: {
                  ...gNode.data,
                  width: bounds.width,
                  height: bounds.height,
                },
              }
            }
          }
        }
        return gNode
      })
    }

    set({ nodes: updatedNodes })
  },
  onEdgesChange: (changes) => {
    const currentEdges = get().edges
    const nodes = get().nodes
    const filteredChanges: EdgeChange[] = []

    for (const change of changes) {
      if (change.type === 'remove') {
        const edgeToRemove = currentEdges.find((e) => e.id === change.id)
        if (edgeToRemove) {
          const isLocked = Boolean((edgeToRemove.data as any)?.isLocked)
          const parentExists = nodes.some(
            (n) => n.id === edgeToRemove.source || n.id === edgeToRemove.target
          )
          if (isLocked && parentExists) {
            // Cannot remove locked parent-child edge while parent exists!
            continue
          }
          const remaining = currentEdges.filter((e) => e.id !== change.id)
          detachImagesIfNoRemainingEdge(edgeToRemove, remaining, () => get().nodes, get().updateNodeData)
          detachArtifactsIfNoRemainingEdge(edgeToRemove, remaining, () => get().nodes, get().updateNodeData)
        }
      }
      filteredChanges.push(change)
    }
    set({
      edges: applyEdgeChanges(filteredChanges, currentEdges),
    })
  },
  onConnect: (connection) => {
    const sourceNode = get().nodes.find((n) => n.id === connection.source)
    const targetNode = get().nodes.find((n) => n.id === connection.target)

    // User requirement:
    // "O de diff não pode ser separado de seu pai, deve sumir quando o pai for excluido e não pode ser linkado a outro agente."
    if (sourceNode?.type === 'diffNode' || targetNode?.type === 'diffNode') {
      return
    }

    let strokeColor = '#6366F1'
    if (sourceNode?.type === 'imageNode' || sourceNode?.type === 'imageGroupNode') {
      strokeColor = '#F43F5E'
    } else if (sourceNode?.type === 'agentNode') {
      strokeColor = (sourceNode.data as any).agentType === 'claude' ? '#EA580C' : '#0284C7'
    } else if (sourceNode?.type === 'previewNode') {
      strokeColor = '#06B6D4'
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

    // If connecting an image or image group to an agent (in either direction), automatically attach it
    const isSourceImg = sourceNode?.type === 'imageNode' || sourceNode?.type === 'imageGroupNode'
    const isTargetAgent = targetNode?.type === 'agentNode'
    const isTargetImg = targetNode?.type === 'imageNode' || targetNode?.type === 'imageGroupNode'
    const isSourceAgent = sourceNode?.type === 'agentNode'

    const imgNode = isSourceImg && isTargetAgent ? sourceNode : isTargetImg && isSourceAgent ? targetNode : null
    const agentNode = isSourceImg && isTargetAgent ? targetNode : isTargetImg && isSourceAgent ? sourceNode : null

    if (imgNode && agentNode) {
      const imgData = imgNode.data as any
      if (imgData.images && Array.isArray(imgData.images) && imgData.images.length > 0) {
        imgData.images.forEach((img: any) => {
          if (img.url) {
            get().attachImageToAgent(agentNode!.id, {
              id: img.id,
              url: img.url,
              name: img.name || 'imagem.png',
              nodeId: imgNode.id,
            })
          }
        })
      } else if (imgData.url) {
        get().attachImageToAgent(agentNode.id, {
          id: imgNode.id,
          url: imgData.url,
          name: imgData.name || imgData.title || 'captura-de-tela.png',
          nodeId: imgNode.id,
        })
      }
    }

    // User requirement:
    // "O de artefato e o de preview pode ser linkado a outro agente e deve entrar como um anexo ou menção."
    const isSourceArt = sourceNode?.type === 'artifactNode' || sourceNode?.type === 'previewNode'
    const isTargetArt = targetNode?.type === 'artifactNode' || targetNode?.type === 'previewNode'

    const artNode = isSourceArt && isTargetAgent ? sourceNode : isTargetArt && isSourceAgent ? targetNode : null
    const artTargetAgent = isSourceArt && isTargetAgent ? targetNode : isTargetArt && isSourceAgent ? sourceNode : null

    if (artNode && artTargetAgent) {
      const artData = artNode.data as any
      get().attachArtifactToAgent(artTargetAgent.id, {
        id: `art-${artNode.id}`,
        type: artNode.type === 'artifactNode' ? 'artifact' : 'preview',
        title: artData.title || (artNode.type === 'artifactNode' ? 'Documento' : 'Web Preview'),
        sourceNodeId: artNode.id,
        contentSnippet: artNode.type === 'artifactNode' ? artData.markdownContent?.slice(0, 100) : 'Web Preview Sandbox',
      })
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
    const nodeToDelete = get().nodes.find((n) => n.id === id)
    const isParentAgent = nodeToDelete?.type === 'agentNode'

    if (isParentAgent) {
      const sessionId = (nodeToDelete.data as any)?.sessionId || `pty-${id}`
      ptyService.killPty(sessionId)
    }

    if (nodeToDelete && (nodeToDelete.type === 'imageNode' || nodeToDelete.type === 'imageGroupNode')) {
      detachImagesForNode(id, nodeToDelete.data, get().edges, () => get().nodes, get().updateNodeData)
    }

    // Set of node IDs that must be deleted
    const nodesToDelete = new Set<string>([id])

    // User requirement:
    // "O de diff não pode ser separado de seu pai, deve sumir quando o pai for excluido e não pode ser linkado a outro agente."
    if (isParentAgent) {
      get().nodes.forEach((n) => {
        if (n.type === 'diffNode' && (n.data as any)?.parentAgentId === id) {
          nodesToDelete.add(n.id)
        }
      })
    }

    // Clean up any attachedArtifacts badges referencing any deleted node
    get().nodes.forEach((n) => {
      if (n.type === 'agentNode') {
        const attached = ((n.data as any)?.attachedArtifacts || []) as AttachedArtifactBadge[]
        const hasDeleted = attached.some((a) => nodesToDelete.has(a.sourceNodeId))
        if (hasDeleted) {
          get().updateNodeData(n.id, {
            attachedArtifacts: attached.filter((a) => !nodesToDelete.has(a.sourceNodeId)),
          })
        }
      }
    })

    // For artifact and preview nodes whose parent was deleted, release the parent lock
    const remainingNodes = get().nodes
      .filter((node) => !nodesToDelete.has(node.id))
      .map((n) => {
        if (isParentAgent && ((n.data as any)?.parentAgentId === id)) {
          return {
            ...n,
            data: {
              ...n.data,
              parentAgentId: undefined,
              parentAgentTitle: undefined,
            },
          }
        }
        return n
      })

    const updatedNodes = remainingNodes.map((n) => {
      if (n.type === 'groupNode') {
        const memberIds = ((n.data as any)?.nodeIds || []) as string[]
        const hasDeletedMember = memberIds.some((mId) => nodesToDelete.has(mId))
        if (hasDeletedMember) {
          const updatedMemberIds = memberIds.filter((mId) => !nodesToDelete.has(mId))
          const remainingMembers = remainingNodes.filter((m) => updatedMemberIds.includes(m.id))
          const isReactive = (n.data as any)?.isReactive !== false
          if (isReactive && remainingMembers.length > 0) {
            const bounds = calculateGroupBounds(remainingMembers)
            if (bounds) {
              return {
                ...n,
                position: { x: bounds.x, y: bounds.y },
                style: { ...n.style, width: bounds.width, height: bounds.height, zIndex: -1 },
                data: {
                  ...n.data,
                  nodeIds: updatedMemberIds,
                  width: bounds.width,
                  height: bounds.height,
                },
              }
            }
          }
          return {
            ...n,
            data: {
              ...n.data,
              nodeIds: updatedMemberIds,
            },
          }
        }
      }
      return n
    })

    set({
      nodes: updatedNodes,
      edges: get().edges.filter((edge) => !nodesToDelete.has(edge.source) && !nodesToDelete.has(edge.target)),
    })
  },

  stashItems: initialStash,
  isStashOpen: false,
  toggleStashOpen: () => set((state) => ({ isStashOpen: !state.isStashOpen })),
  setStashOpen: (open) => set({ isStashOpen: open }),
  stashNode: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return

    if (node.type === 'imageNode' || node.type === 'imageGroupNode') {
      detachImagesForNode(id, node.data, get().edges, () => get().nodes, get().updateNodeData)
    }

    if (node.type === 'groupNode') {
      get().stashGroup(id)
      return
    }

    let type: StashItem['type'] = 'agent'
    if (node.type === 'artifactNode') type = 'artifact'
    else if (node.type === 'previewNode') type = 'preview'
    else if (node.type === 'diffNode') type = 'diff'
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

    const updatedStash = [newItem, ...get().stashItems]
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_stash_items', JSON.stringify(updatedStash))
      } catch (e) {
        console.error('Error saving stash to localStorage:', e)
      }
    }

    set({
      stashItems: updatedStash,
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

      const updatedStash = get().stashItems.filter((s) => s.id !== stashId)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('cgli_stash_items', JSON.stringify(updatedStash))
        } catch (e) {
          console.error('Error saving stash to localStorage:', e)
        }
      }

      set({
        nodes: [...get().nodes, restoredGroupNode, ...restoredMemberNodes],
        edges: [...get().edges, ...(groupData.memberEdges || [])],
        stashItems: updatedStash,
      })
      return
    }

    let nodeType = 'agentNode'
    if (item.type === 'artifact') nodeType = 'artifactNode'
    else if (item.type === 'preview') nodeType = 'previewNode'
    else if (item.type === 'diff') nodeType = 'diffNode'
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

    const updatedStash = get().stashItems.filter((s) => s.id !== stashId)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_stash_items', JSON.stringify(updatedStash))
      } catch (e) {
        console.error('Error saving stash to localStorage:', e)
      }
    }

    set({
      nodes: [...get().nodes, restoredNode],
      stashItems: updatedStash,
    })
  },
  removeStashItem: (stashId) => {
    const updatedStash = get().stashItems.filter((s) => s.id !== stashId)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_stash_items', JSON.stringify(updatedStash))
      } catch (e) {
        console.error('Error saving stash to localStorage:', e)
      }
    }
    set({
      stashItems: updatedStash,
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
    const node = get().nodes.find((n) => n.id === nodeId)
    if (node && (node.data as any).images && Array.isArray((node.data as any).images)) {
      const imgData = node.data as any
      const activeIdx = imgData.activeImageIndex || 0
      const updatedImages = imgData.images.map((img: any, idx: number) =>
        idx === activeIdx ? { ...img, annotations } : img
      )
      get().updateNodeData(nodeId, {
        images: updatedImages,
        annotations: activeIdx === 0 ? annotations : imgData.annotations,
      })
    } else {
      get().updateNodeData(nodeId, { annotations })
    }
    set({ annotatingNodeId: null })
  },

  clis: initialClisList,
  updateCli: (id, partial) => {
    const updated = get().clis.map((cli) => (cli.id === id ? { ...cli, ...partial } : cli))
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_clis', JSON.stringify(updated))
      } catch (e) {
        console.error('Error saving clis to localStorage:', e)
      }
    }
    set({ clis: updated })
  },
  addCli: (cli) => {
    const updated = [...get().clis, cli]
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_clis', JSON.stringify(updated))
      } catch (e) {
        console.error('Error saving clis to localStorage:', e)
      }
    }
    set({ clis: updated })
  },

  skills: initialSkillsList,
  toggleSkill: (id) => {
    const updated = get().skills.map((skill) =>
      skill.id === id ? { ...skill, enabled: !skill.enabled } : skill
    )
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_skills', JSON.stringify(updated))
      } catch (e) {
        console.error('Error saving skills to localStorage:', e)
      }
    }
    set({ skills: updated })
  },
  addSkill: (skill) => {
    const updated = [...get().skills, skill]
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_skills', JSON.stringify(updated))
      } catch (e) {
        console.error('Error saving skills to localStorage:', e)
      }
    }
    set({ skills: updated })
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

    try {
      const proj = get().project
      const activeFolder = proj.folders?.find((f) => f.id === proj.activeFolderId) || proj.folders?.[0]
      const cwd = activeFolder?.path || proj.path

      let workspaceContext = ''
      if (proj.folders && proj.folders.length > 1) {
        workspaceContext = `[Workspace Multi-Pastas (${proj.folders.length} pastas): ${proj.folders.map((f) => `${f.name}: "${f.path}"`).join(', ')}. Diretório ativo: "${cwd}"]\n`
      }

      let artifactContext = ''
      const attachedArtifacts = ((node.data as any).attachedArtifacts || []) as AttachedArtifactBadge[]
      if (attachedArtifacts.length > 0) {
        const nodes = get().nodes
        const artDetails = attachedArtifacts.map((art) => {
          const artNode = nodes.find((n) => n.id === art.sourceNodeId)
          if (artNode?.type === 'artifactNode') {
            return `[Documento Anexado "${art.title}"]: ${((artNode.data as any).markdownContent || '').slice(0, 1000)}`
          }
          if (artNode?.type === 'previewNode') {
            return `[Web Preview Anexado "${art.title}"]`
          }
          return `[Anexo "${art.title}"]`
        })
        artifactContext = `\n[Contexto de Artefatos Anexados pelo Canvas]:\n${artDetails.join('\n')}\n`
      }

      let fullPrompt = `${workspaceContext}${artifactContext}${text}`
      if (allImages.length > 0) {
        fullPrompt = `${workspaceContext}${artifactContext}[Contexto: ${allImages.length} imagens conectadas pelo canvas]: ${text}`
      }

      const sessionId = (node.data as any).sessionId || `pty-${nodeId}`
      await ptyService.writePty(sessionId, `${fullPrompt}\r`)

      get().updateNodeData(nodeId, {
        messages: updatedMessages,
        status: 'running',
        attachedImages: [],
        terminalLogs: [
          ...((node.data as any).terminalLogs || []),
          `> [${agentType.toUpperCase()}] ${text}`,
        ],
      })
    } catch (err: any) {
      console.error('Agent execution error:', err)
      const errMessage: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        sender: 'agent',
        text: `Erro de conexão com a sessão PTY: ${err.message}`,
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
    const currentMode = (node.data as any).viewMode || 'terminal'
    const newMode = currentMode === 'terminal' ? 'extension' : 'terminal'
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
    const artNode = get().nodes.find((n) => n.id === nodeId)
    const parentAgentId = (artNode?.data as any)?.parentAgentId

    const candidateAgentIds: string[] = []
    if (parentAgentId) candidateAgentIds.push(parentAgentId)

    const edges = get().edges.filter((e) => e.source === nodeId || e.target === nodeId)
    for (const edge of edges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source
      const other = get().nodes.find((n) => n.id === otherId)
      if (other && other.type === 'agentNode' && !candidateAgentIds.includes(other.id)) {
        candidateAgentIds.push(other.id)
      }
    }

    const title = (artNode?.data as any)?.title || 'Artefato'
    for (const agentId of candidateAgentIds) {
      const targetNode = get().nodes.find((n) => n.id === agentId)
      if (targetNode) {
        const sessionId = (targetNode.data as any)?.sessionId || `pty-${agentId}`
        ptyService.writePty(
          sessionId,
          `Plano [${title}] aprovado pelo usuário. Prossiga com a execução imediata.\r`
        )

        get().updateNodeData(targetNode.id, {
          status: 'running',
          terminalLogs: [
            ...((targetNode.data as any).terminalLogs || []),
            `> Notificação recebida do artefato [${title}]: Aprovado pelo usuário`,
            `> Notificação injetada na sessão PTY`,
          ],
        })
      }
    }
  },

  attachImageToAgent: (nodeId, image) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return
    const current = ((node.data as any).attachedImages || []) as Array<{ id: string; url: string; name: string; nodeId?: string }>
    if (!current.some((img) => img.id === image.id || (image.nodeId && img.nodeId === image.nodeId && img.url === image.url))) {
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

  attachArtifactToAgent: (agentId, artifact) => {
    const node = get().nodes.find((n) => n.id === agentId)
    if (!node) return
    const current = ((node.data as any).attachedArtifacts || []) as AttachedArtifactBadge[]
    if (!current.some((art) => art.id === artifact.id || art.sourceNodeId === artifact.sourceNodeId)) {
      get().updateNodeData(agentId, {
        attachedArtifacts: [...current, artifact],
      })
    }
  },

  removeAttachedArtifact: (agentId, artifactId) => {
    const node = get().nodes.find((n) => n.id === agentId)
    if (!node) return
    const current = ((node.data as any).attachedArtifacts || []) as AttachedArtifactBadge[]
    get().updateNodeData(agentId, {
      attachedArtifacts: current.filter((art) => art.id !== artifactId),
    })
  },

  toggleAgentDiffNode: (agentId) => {
    const agent = get().nodes.find((n) => n.id === agentId)
    if (!agent) return

    // Check if diffNode already exists for this parent agent
    const existingDiff = get().nodes.find(
      (n) => n.type === 'diffNode' && (n.data as any).parentAgentId === agentId
    )

    if (existingDiff) {
      // Toggle off / close
      get().deleteNode(existingDiff.id)
      return
    }

    // Otherwise create dedicated DiffNode
    const diffNodeId = `diff-${agentId}-${Date.now()}`
    const agentData = agent.data as any
    const approvals = (agentData.approvals || []) as ActionApproval[]
    const apprWithDiff = approvals.find((a) => a.diff)

    const filename = apprWithDiff?.title || ''
    let diffLines: DiffLine[] = []

    if (apprWithDiff?.diff) {
      diffLines = apprWithDiff.diff.split('\n').map((line) => {
        if (line.startsWith('+')) return { type: 'add' as const, content: line }
        if (line.startsWith('-')) return { type: 'remove' as const, content: line }
        return { type: 'normal' as const, content: line }
      })
    }

    const additions = diffLines.filter((l) => l.type === 'add').length
    const deletions = diffLines.filter((l) => l.type === 'remove').length

    const newDiffNode: Node = {
      id: diffNodeId,
      type: 'diffNode',
      position: { x: agent.position.x + 420, y: agent.position.y + 40 },
      data: {
        title: filename ? `Diff: ${filename.split('/').pop() || filename}` : 'Diff de Alterações',
        filename: filename || 'Nenhum arquivo modificado',
        lines: diffLines,
        stats: { additions, deletions },
        parentAgentId: agentId,
        parentAgentTitle: agentData.title || 'Agente',
      },
    }

    const lockedEdge: Edge = {
      id: `e-${agentId}-${diffNodeId}`,
      source: agentId,
      target: diffNodeId,
      type: 'removable',
      animated: true,
      data: { isLocked: true },
      style: { stroke: '#10B981', strokeWidth: 2 },
    }

    set({
      nodes: [...get().nodes, newDiffNode],
      edges: [...get().edges, lockedEdge],
    })
  },

  addImageToNode: (nodeId, image) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node) return

    if (node.type === 'imageNode') {
      const imgData = node.data as any
      const currentImages =
        imgData.images && Array.isArray(imgData.images) && imgData.images.length > 0
          ? imgData.images
          : imgData.url
          ? [
              {
                id: `${node.id}-img-1`,
                url: imgData.url,
                name: imgData.name || imgData.title || 'captura.png',
                annotations: imgData.annotations || [],
              },
            ]
          : []

      const newItem = {
        id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        url: image.url,
        name: image.name || `captura-${currentImages.length + 1}.png`,
        annotations: [],
      }

      const updatedImages = [...currentImages, newItem]
      const nextIndex = updatedImages.length - 1

      get().updateNodeData(nodeId, {
        images: updatedImages,
        activeImageIndex: nextIndex,
        url: updatedImages[0]?.url,
        name: updatedImages[0]?.name,
      })

      // If this image node is connected to any agents, sync the new image immediately
      const connectedEdges = get().edges.filter(
        (e) => e.source === nodeId || e.target === nodeId
      )
      connectedEdges.forEach((edge) => {
        const otherNodeId = edge.source === nodeId ? edge.target : edge.source
        const otherNode = get().nodes.find((n) => n.id === otherNodeId)
        if (otherNode && otherNode.type === 'agentNode') {
          get().attachImageToAgent(otherNode.id, {
            id: newItem.id,
            url: newItem.url,
            name: newItem.name,
            nodeId: nodeId,
          })
        }
      })
    } else if (node.type === 'agentNode') {
      const badge = {
        id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        url: image.url,
        name: image.name || 'captura.png',
      }
      get().attachImageToAgent(nodeId, badge)
    }
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

    const workspacePath = (parent.data as any)?.workspacePath || get().getActiveWorkspacePath()
    const newSubNode: Node = {
      id: childId,
      type: 'agentNode',
      position: { x: posX, y: posY },
      data: {
        title: isClaude ? 'Subagente Claude Code' : 'Subagente Antigravity (AGY)',
        agentType: childType,
        role: isClaude ? 'planner' : 'executor',
        status: 'idle',
        viewMode: 'terminal',
        thinking: null,
        messages: [],
        approvals: [],
        attachedImages: [],
        terminalLogs: [],
        workspacePath,
        sessionId: `pty-${childId}`,
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

  createArtifactFromAgent: (agentId, title, content) => {
    const parent = get().nodes.find((n) => n.id === agentId)
    const existingOutEdges = get().edges.filter((e) => e.source === agentId)
    const posX = parent ? parent.position.x + 440 : 250
    const posY = parent ? parent.position.y + (existingOutEdges.length * 60) - 20 : 200

    const artifactId = `node-artifact-${Date.now()}`
    const newArtifactNode: Node = {
      id: artifactId,
      type: 'artifactNode',
      position: { x: posX, y: posY },
      data: {
        title: title || 'Documento de Artefato',
        markdownContent: content || '',
        status: 'draft',
        parentAgentId: agentId,
        parentAgentTitle: (parent?.data as any)?.title || 'Agente',
      },
    }

    const edge: Edge = {
      id: `e-${agentId}-${artifactId}`,
      source: agentId,
      target: artifactId,
      type: 'removable',
      animated: true,
      data: { isLocked: true },
      style: { stroke: '#6366F1', strokeWidth: 2 },
    }

    const currentLogs = ((parent?.data as any)?.terminalLogs || []) as string[]
    const updatedLogs = [
      ...currentLogs,
      `> [CGLI] Nó de artefato [${newArtifactNode.data.title}] criado no canvas.`,
    ]

    set({
      nodes: [
        ...get().nodes.map((n) =>
          n.id === agentId ? { ...n, data: { ...n.data, terminalLogs: updatedLogs } } : n
        ),
        newArtifactNode,
      ],
      edges: [...get().edges, edge],
    })
  },

  createPreviewFromAgent: (agentId, title, html) => {
    const parent = get().nodes.find((n) => n.id === agentId)
    const existingOutEdges = get().edges.filter((e) => e.source === agentId)
    const posX = parent ? parent.position.x + 440 : 250
    const posY = parent ? parent.position.y + (existingOutEdges.length * 70) + 60 : 250

    const previewId = `node-preview-${Date.now()}`
    const newPreviewNode: Node = {
      id: previewId,
      type: 'previewNode',
      position: { x: posX, y: posY },
      data: {
        title: title || 'Preview Web',
        htmlPreview: html || '',
        status: 'ready',
        parentAgentId: agentId,
        parentAgentTitle: (parent?.data as any)?.title || 'Agente',
      },
    }

    const edge: Edge = {
      id: `e-${agentId}-${previewId}`,
      source: agentId,
      target: previewId,
      type: 'removable',
      animated: true,
      data: { isLocked: true },
      style: { stroke: '#06B6D4', strokeWidth: 2 },
    }

    const currentLogs = ((parent?.data as any)?.terminalLogs || []) as string[]
    const updatedLogs = [
      ...currentLogs,
      `> [CGLI] Nó de preview [${newPreviewNode.data.title}] criado no canvas.`,
    ]

    set({
      nodes: [
        ...get().nodes.map((n) =>
          n.id === agentId ? { ...n, data: { ...n.data, terminalLogs: updatedLogs } } : n
        ),
        newPreviewNode,
      ],
      edges: [...get().edges, edge],
    })
  },

  createDiffFromAgent: (agentId, title, filename, lines) => {
    const parent = get().nodes.find((n) => n.id === agentId)
    const posX = parent ? parent.position.x + 420 : 250
    const posY = parent ? parent.position.y + 160 : 280

    const diffId = `diff-${agentId}-${Date.now()}`
    const diffLines: DiffLine[] = lines && Array.isArray(lines) ? lines : []
    const additions = diffLines.filter((l) => l.type === 'add').length
    const deletions = diffLines.filter((l) => l.type === 'remove').length

    const newDiffNode: Node = {
      id: diffId,
      type: 'diffNode',
      position: { x: posX, y: posY },
      data: {
        title: title || (filename ? `Diff: ${filename.split('/').pop() || filename}` : 'Diff de Alterações'),
        filename: filename || 'Nenhum arquivo modificado',
        lines: diffLines,
        stats: { additions, deletions },
        parentAgentId: agentId,
        parentAgentTitle: (parent?.data as any)?.title || 'Agente',
      },
    }

    const lockedEdge: Edge = {
      id: `e-${agentId}-${diffId}`,
      source: agentId,
      target: diffId,
      type: 'removable',
      animated: true,
      data: { isLocked: true },
      style: { stroke: '#10B981', strokeWidth: 2 },
    }

    const currentLogs = ((parent?.data as any)?.terminalLogs || []) as string[]
    const updatedLogs = [
      ...currentLogs,
      `> [CGLI] Nó de diff [${newDiffNode.data.title}] criado no canvas.`,
    ]

    set({
      nodes: [
        ...get().nodes.map((n) =>
          n.id === agentId ? { ...n, data: { ...n.data, terminalLogs: updatedLogs } } : n
        ),
        newDiffNode,
      ],
      edges: [...get().edges, lockedEdge],
    })
  },

  spawnSubagentFromAction: (parentId, childType, role = 'executor', task) => {
    const parent = get().nodes.find((n) => n.id === parentId)
    const childId = `node-${childType}-sub-${Date.now()}`
    const isClaude = childType.toLowerCase().includes('claude')
    const color = isClaude ? '#EA580C' : '#0284C7'

    const existingOutEdges = get().edges.filter((e) => e.source === parentId)
    const posX = parent ? parent.position.x + 480 : 250
    const posY = parent ? parent.position.y + existingOutEdges.length * 140 : 200

    const workspacePath = get().getActiveWorkspacePath()
    const initialMessages: ChatMessage[] = task
      ? [
          {
            id: `msg-${Date.now()}`,
            sender: 'user',
            text: task,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          },
        ]
      : []

    const newSubNode: Node = {
      id: childId,
      type: 'agentNode',
      position: { x: posX, y: posY },
      data: {
        title: isClaude ? 'Subagente Claude Code' : 'Subagente Antigravity (AGY)',
        agentType: childType,
        role,
        status: task ? 'running' : 'idle',
        viewMode: 'terminal',
        thinking: null,
        messages: initialMessages,
        approvals: [],
        attachedImages: [],
        terminalLogs: [
          `> [CGLI] Subagente [${childId}] criado pelo nó [${parentId}]`,
          `> Sessão PTY inicializada no workspace: ${workspacePath}`,
        ],
        workspacePath,
        sessionId: `pty-${childId}`,
        initialTask: task,
      },
    }

    const newEdge: Edge = {
      id: `e-${parentId}-${childId}`,
      source: parentId,
      target: childId,
      animated: true,
      style: { stroke: color, strokeWidth: 2, strokeDasharray: '4 4' },
    }

    const currentParentLogs = ((parent?.data as any)?.terminalLogs || []) as string[]
    const updatedParentLogs = [
      ...currentParentLogs,
      `> [CGLI] Subagente [${newSubNode.data.title}] invocado com sucesso.`,
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

    // If task was provided, write to PTY after brief startup delay
    if (task) {
      setTimeout(() => {
        ptyService.writePty(`pty-${childId}`, `${task}\r`)
      }, 1200)
    }
  },

  deleteEdge: (edgeId) => {
    const currentEdges = get().edges
    const edgeToRemove = currentEdges.find((e) => e.id === edgeId)
    if (edgeToRemove) {
      const isLocked = Boolean((edgeToRemove.data as any)?.isLocked)
      const parentExists = get().nodes.some(
        (n) => n.id === edgeToRemove.source || n.id === edgeToRemove.target
      )
      if (isLocked && parentExists) {
        return
      }
      const remaining = currentEdges.filter((e) => e.id !== edgeId)
      detachImagesIfNoRemainingEdge(edgeToRemove, remaining, () => get().nodes, get().updateNodeData)
      detachArtifactsIfNoRemainingEdge(edgeToRemove, remaining, () => get().nodes, get().updateNodeData)
      set({
        edges: remaining,
      })
    }
  },

  addNodeToGroup: (groupId, nodeId) => {
    const groupNode = get().nodes.find((n) => n.id === groupId)
    const targetNode = get().nodes.find((n) => n.id === nodeId)
    if (!groupNode || !targetNode || targetNode.type === 'groupNode') return

    const currentMemberIds = ((groupNode.data as any)?.nodeIds || []) as string[]
    if (currentMemberIds.includes(nodeId)) return

    const updatedMemberIds = [...currentMemberIds, nodeId]
    const allMembers = get().nodes.filter((n) => updatedMemberIds.includes(n.id))
    const bounds = calculateGroupBounds(allMembers)

    const newPosition = bounds ? { x: bounds.x, y: bounds.y } : groupNode.position
    const newW = bounds ? bounds.width : 520
    const newH = bounds ? bounds.height : 380

    set({
      nodes: get().nodes.map((n) => {
        if (n.id === groupId) {
          return {
            ...n,
            position: newPosition,
            style: { ...n.style, width: newW, height: newH, zIndex: -1 },
            data: {
              ...n.data,
              nodeIds: updatedMemberIds,
              width: newW,
              height: newH,
              isReactive: true,
              isDragOver: false,
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
    const remainingMembers = get().nodes.filter((n) => updatedMemberIds.includes(n.id))
    const isReactive = (groupNode.data as any)?.isReactive !== false

    let newPosition = groupNode.position
    let newWidth = Number((groupNode.data as any)?.width) || (groupNode.style?.width as number) || 480
    let newHeight = Number((groupNode.data as any)?.height) || (groupNode.style?.height as number) || 320

    if (isReactive && remainingMembers.length > 0) {
      const bounds = calculateGroupBounds(remainingMembers)
      if (bounds) {
        newPosition = { x: bounds.x, y: bounds.y }
        newWidth = bounds.width
        newHeight = bounds.height
      }
    }

    set({
      nodes: get().nodes.map((n) =>
        n.id === groupId
          ? {
              ...n,
              position: newPosition,
              style: { ...n.style, width: newWidth, height: newHeight, zIndex: -1 },
              data: {
                ...n.data,
                nodeIds: updatedMemberIds,
                width: newWidth,
                height: newHeight,
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

    const bounds = calculateGroupBounds(members)
    if (!bounds) return

    set({
      nodes: get().nodes.map((n) =>
        n.id === groupId
          ? {
              ...n,
              position: { x: bounds.x, y: bounds.y },
              style: { ...n.style, width: bounds.width, height: bounds.height, zIndex: -1 },
              data: {
                ...n.data,
                isReactive: true,
                width: bounds.width,
                height: bounds.height,
              },
            }
          : n
      ),
    })
  },

  toggleGroupReactive: (groupId) => {
    const group = get().nodes.find((n) => n.id === groupId)
    if (!group) return
    const current = (group.data as any)?.isReactive !== false
    const next = !current

    let updatedGroup: Node = {
      ...group,
      data: {
        ...(group.data as any),
        isReactive: next,
      },
    }

    if (next) {
      const memberIds = ((group.data as any)?.nodeIds || []) as string[]
      const members = get().nodes.filter((n) => memberIds.includes(n.id))
      const bounds = calculateGroupBounds(members)
      if (bounds) {
        updatedGroup = {
          ...updatedGroup,
          position: { x: bounds.x, y: bounds.y },
          style: { ...updatedGroup.style, width: bounds.width, height: bounds.height, zIndex: -1 },
          data: {
            ...(updatedGroup.data as any),
            isReactive: true,
            width: bounds.width,
            height: bounds.height,
          },
        }
      }
    }

    set({
      nodes: get().nodes.map((n) => (n.id === groupId ? updatedGroup : n)),
    })
  },

  setGroupDragOver: (groupId) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.type === 'groupNode') {
          const isOver = n.id === groupId
          if ((n.data as any)?.isDragOver !== isOver) {
            return {
              ...n,
              data: {
                ...n.data,
                isDragOver: isOver,
              },
            }
          }
        }
        return n
      }),
    })
  },

  groupSelectedNodes: (nodeIds, title = 'Grupo de Nós') => {
    if (!nodeIds || nodeIds.length === 0) return

    const selectedNodes = get().nodes.filter((n) => nodeIds.includes(n.id) && n.type !== 'groupNode')
    if (selectedNodes.length === 0) return

    const bounds = calculateGroupBounds(selectedNodes)
    const groupX = bounds ? bounds.x : 200
    const groupY = bounds ? bounds.y : 200
    const groupW = bounds ? bounds.width : 560
    const groupH = bounds ? bounds.height : 420

    const groupId = `group-${Date.now()}`
    const newGroupNode: Node = {
      id: groupId,
      type: 'groupNode',
      position: { x: groupX, y: groupY },
      style: { width: groupW, height: groupH, zIndex: -1 },
      data: {
        title,
        nodeIds: selectedNodes.map((n) => n.id),
        width: groupW,
        height: groupH,
        isReactive: true,
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

    const updatedStash = [newItem, ...get().stashItems]
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cgli_stash_items', JSON.stringify(updatedStash))
      } catch (e) {
        console.error('Error saving stash to localStorage:', e)
      }
    }

    set({
      stashItems: updatedStash,
      nodes: get().nodes.filter((n) => !allNodeIdsToStash.includes(n.id)),
      edges: get().edges.filter(
        (e) => !allNodeIdsToStash.includes(e.source) && !allNodeIdsToStash.includes(e.target)
      ),
    })
  },
}))

if (typeof window !== 'undefined') {
  ;(window as any).__canvasStore = useCanvasStore

  let saveCanvasTimer: any = null
  useCanvasStore.subscribe((state) => {
    try {
      localStorage.setItem('cgli_stash_items', JSON.stringify(state.stashItems))
      localStorage.setItem('cgli_clis', JSON.stringify(state.clis))
      localStorage.setItem('cgli_skills', JSON.stringify(state.skills))
      localStorage.setItem('cgli_theme', state.theme)

      clearTimeout(saveCanvasTimer)
      saveCanvasTimer = setTimeout(() => {
        try {
          localStorage.setItem(
            `cgli_canvas_${state.currentProjectId}`,
            JSON.stringify({ nodes: state.nodes, edges: state.edges })
          )
        } catch (e) {
          console.error('Error auto-saving canvas to localStorage:', e)
        }
      }, 150)
    } catch (e) {
      console.error('Error in canvas store subscriber:', e)
    }
  })

  window.addEventListener('beforeunload', () => {
    try {
      const state = useCanvasStore.getState()
      localStorage.setItem(
        `cgli_canvas_${state.currentProjectId}`,
        JSON.stringify({ nodes: state.nodes, edges: state.edges })
      )
      localStorage.setItem('cgli_stash_items', JSON.stringify(state.stashItems))
      localStorage.setItem('cgli_clis', JSON.stringify(state.clis))
      localStorage.setItem('cgli_skills', JSON.stringify(state.skills))
      localStorage.setItem('cgli_theme', state.theme)
    } catch (e) {
      console.error('Error flushing canvas to localStorage before unload:', e)
    }
  })

  // Listen for actions dispatched from CLI agents via CGLI Bridge
  ptyService.onBridgeAction((action) => {
    const state = useCanvasStore.getState()
    const parentId =
      action.parent_node_id ||
      state.nodes.find((n) => n.type === 'agentNode')?.id

    if (!parentId) return

    if (action.action_type === 'spawn_subagent') {
      state.spawnSubagentFromAction(
        parentId,
        action.child_type || 'agy',
        action.role || 'executor',
        action.task
      )
    } else if (action.action_type === 'create_artifact') {
      state.createArtifactFromAgent(
        parentId,
        action.title || 'Documento de Artefato',
        action.content || ''
      )
    } else if (action.action_type === 'create_preview') {
      state.createPreviewFromAgent(
        parentId,
        action.title || 'Preview Web',
        action.html || ''
      )
    } else if (action.action_type === 'create_diff') {
      let lines: DiffLine[] | undefined
      if (action.content) {
        lines = action.content.split('\n').map((l) => {
          if (l.startsWith('+')) return { type: 'add' as const, content: l }
          if (l.startsWith('-')) return { type: 'remove' as const, content: l }
          return { type: 'normal' as const, content: l }
        })
      }
      state.createDiffFromAgent(
        parentId,
        action.title || 'Alterações de Código',
        action.filename || 'diff.patch',
        lines
      )
    }
  })

  // Initial sync of project workspace info to bridge
  try {
    const initProj = useCanvasStore.getState().project
    ptyService.syncWorkspaceInfo({
      projectName: initProj.name,
      activeFolderId: initProj.activeFolderId,
      folders: initProj.folders,
    })
  } catch (_) {}
}
