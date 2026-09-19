export type ThemeMode = 'light' | 'dark'

export type AgentType = 'claude' | 'agy' | string

export type AgentRole = 'planner' | 'executor'

export type AgentStatus = 'idle' | 'running' | 'waiting_approval' | 'error'

export type AgentViewMode = 'extension' | 'terminal'

export interface CodeBlockData {
  language: string
  code: string
}

export interface ChatMessage {
  id: string
  sender: 'user' | 'agent' | 'system'
  text: string
  codeBlocks?: CodeBlockData[]
  timestamp: string
  images?: string[]
}

export interface ActionApproval {
  id: string
  type: 'command' | 'file_change'
  title: string
  description?: string
  command?: string
  diff?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface ThinkingStep {
  duration: string
  thoughts: string[]
  isExpanded?: boolean
}

export interface AttachedImageBadge {
  id: string
  url: string
  name: string
  nodeId?: string
}

export interface AttachedArtifactBadge {
  id: string
  type: 'artifact' | 'preview'
  title: string
  sourceNodeId: string
  contentSnippet?: string
}

export interface AgentNodeData {
  title: string
  agentType: AgentType
  role: AgentRole
  status: AgentStatus
  viewMode: AgentViewMode
  thinking: ThinkingStep | null
  messages: ChatMessage[]
  approvals: ActionApproval[]
  attachedImages: AttachedImageBadge[]
  attachedArtifacts?: AttachedArtifactBadge[]
  terminalLogs: string[]
  sessionId?: string
  workspacePath?: string
  isPtyActive?: boolean
  cliId?: string
  customBinary?: string
  defaultArgs?: string
}

export interface DiffLine {
  type: 'add' | 'remove' | 'normal'
  content: string
  oldLine?: number
  newLine?: number
}

export interface ArtifactNodeData {
  title: string
  markdownContent: string
  status: 'draft' | 'approved' | 'rejected'
  parentAgentId?: string
  parentAgentTitle?: string
  activeTab?: 'markdown' | 'preview' | 'diff'
  htmlPreview?: string
  diffContent?: {
    filename: string
    lines: DiffLine[]
  }
}

export interface PreviewNodeData {
  title: string
  htmlPreview: string
  status?: 'draft' | 'ready'
  parentAgentId?: string
  parentAgentTitle?: string
}

export interface DiffNodeData {
  title: string
  filename: string
  lines: DiffLine[]
  stats?: {
    additions: number
    deletions: number
  }
  parentAgentId: string
  parentAgentTitle?: string
}

export type AnnotationTool = 'circle' | 'arrow' | 'rect' | 'brush' | 'text'

export interface AnnotationItem {
  id: string
  tool: AnnotationTool
  color: string
  strokeWidth: number
  points?: number[] // x1, y1, x2, y2...
  x?: number
  y?: number
  width?: number
  height?: number
  endX?: number
  endY?: number
  text?: string
}

export interface ImageItem {
  id: string
  url: string
  name: string
  annotations?: AnnotationItem[]
  width?: number
  height?: number
}

export interface ImageNodeData {
  title: string
  url?: string
  name?: string
  width?: number
  height?: number
  annotations?: AnnotationItem[]
  images?: ImageItem[]
  activeImageIndex?: number
}

export interface ImageGroupItem {
  id: string
  url: string
  name: string
  annotations?: AnnotationItem[]
}

export interface ImageGroupNodeData {
  title: string
  images: ImageGroupItem[]
  activeImageIndex: number
}

export interface GroupNodeData {
  title: string
  nodeIds: string[]
  width?: number
  height?: number
  color?: string
  isReactive?: boolean
  isDragOver?: boolean
}

export interface StashItem {
  id: string
  nodeId: string
  name: string
  type: 'agent' | 'artifact' | 'preview' | 'diff' | 'image' | 'imageGroup' | 'group'
  savedAt: string
  nodeData: any
  position: { x: number; y: number }
  previewSnippet: string
}

export interface CliConfig {
  id: string
  name: string
  binary: string
  color: string
  active: boolean
  role: AgentRole
  connectedAccount?: {
    email?: string
    status: 'connected' | 'disconnected'
    tokenOrKey?: string
  }
  defaultArgs: string
}

export interface SkillItem {
  id: string
  name: string
  description: string
  enabled: boolean
  category: string
}

export interface WorkspaceFolder {
  id: string
  name: string
  path: string
  isPrimary?: boolean
}

export interface ProjectInfo {
  id: string
  name: string
  path: string
  folders: WorkspaceFolder[]
  activeFolderId?: string
  createdAt?: string
  recentProjects?: Array<{ name: string; path: string }>
}
