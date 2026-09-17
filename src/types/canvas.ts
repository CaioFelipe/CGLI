export type ThemeMode = 'light' | 'dark'

export type AgentType = 'claude' | 'agy'

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
  terminalLogs: string[]
}

export interface DiffLine {
  type: 'add' | 'remove' | 'normal'
  content: string
  oldLine?: number
  newLine?: number
}

export interface ArtifactNodeData {
  title: string
  activeTab: 'markdown' | 'preview' | 'diff'
  markdownContent: string
  htmlPreview: string
  diffContent: {
    filename: string
    lines: DiffLine[]
  }
  status: 'draft' | 'approved' | 'rejected'
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

export interface ImageNodeData {
  title: string
  url: string
  name: string
  width?: number
  height?: number
  annotations: AnnotationItem[]
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

export interface StashItem {
  id: string
  nodeId: string
  name: string
  type: 'agent' | 'artifact' | 'image' | 'imageGroup'
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

export interface ProjectInfo {
  name: string
  path: string
  recentProjects: Array<{ name: string; path: string }>
}
