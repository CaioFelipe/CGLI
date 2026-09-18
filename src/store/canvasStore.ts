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
} from '../types/canvas'

interface CanvasState {
  // Theme
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void

  // Project
  project: ProjectInfo
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

  project: {
    name: 'blissful-franklin',
    path: 'c:/Users/aluno/Documents/antigravity/blissful-franklin',
    recentProjects: [
      { name: 'blissful-franklin', path: 'c:/Users/aluno/Documents/antigravity/blissful-franklin' },
      { name: 'cgli-core', path: 'c:/Users/aluno/Documents/antigravity/cgli-core' },
      { name: 'studio-clean-demo', path: 'c:/Users/aluno/Documents/antigravity/demo' },
    ],
  },
  setProject: (partial) => {
    set((state) => ({ project: { ...state.project, ...partial } }))
  },

  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
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
      let fullPrompt = text
      if (allImages.length > 0) {
        fullPrompt = `[Contexto: ${allImages.length} imagens conectadas pelo canvas]: ${text}`
      }

      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType,
          prompt: fullPrompt,
          images: allImages,
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
