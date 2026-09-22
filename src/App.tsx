import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Layers,
  Bot,
  Brain,
  Sparkles,
  Image as ImageIcon,
  SquareTerminal,
} from 'lucide-react'
import { Topbar } from './components/layout/Topbar'
import { ImageAnnotationModal } from './components/modais/ImageAnnotationModal'
import { SettingsModal } from './components/modais/SettingsModal'
import { NewProjectModal } from './components/modais/NewProjectModal'
import { ManageWorkspaceModal } from './components/modais/ManageWorkspaceModal'
import { MemoryExplorerModal } from './components/modais/MemoryExplorerModal'
import { AgentCardNode } from './components/nodes/AgentCardNode'
import { ArtifactNode } from './components/nodes/ArtifactNode'
import { PreviewNode } from './components/nodes/PreviewNode'
import { DiffNode } from './components/nodes/DiffNode'
import { GroupNode } from './components/nodes/GroupNode'
import { ImageGroupNode } from './components/nodes/ImageGroupNode'
import { ImageNode } from './components/nodes/ImageNode'
import { MemoryNode } from './components/nodes/MemoryNode'
import { TerminalNode } from './components/nodes/TerminalNode'
import { RemovableEdge } from './components/edges/RemovableEdge'
import { StashDrawer } from './components/panels/StashDrawer'
import { useCanvasStore, getNodeDimensions } from './store/canvasStore'

// Register custom node types
const nodeTypes: NodeTypes = {
  agentNode: AgentCardNode,
  artifactNode: ArtifactNode,
  previewNode: PreviewNode,
  diffNode: DiffNode,
  imageNode: ImageNode,
  imageGroupNode: ImageGroupNode,
  groupNode: GroupNode,
  memoryNode: MemoryNode,
  terminalNode: TerminalNode,
}

// Register custom edge types
const edgeTypes = {
  removable: RemovableEdge,
  default: RemovableEdge,
}

// Inner canvas component to access useReactFlow hook
const CanvasInner: React.FC = () => {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    addNodeToGroup,
    setGroupDragOver,
    annotatingNodeId,
    theme,
    groupSelectedNodes,
    openMemoryExplorer,
    getActiveWorkspacePath,
  } = useCanvasStore()

  const { screenToFlowPosition, fitView } = useReactFlow()
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 300, y: 300 })

  const handleNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      if (node.type === 'groupNode') return
      const groups = nodes.filter((n) => n.type === 'groupNode')
      const { width: nW, height: nH } = getNodeDimensions(node)
      const nX = node.position.x
      const nY = node.position.y
      const nCenterX = nX + nW / 2
      const nCenterY = nY + nH / 2

      let targetGroupId: string | null = null
      for (const group of groups) {
        const memberIds = ((group.data as any)?.nodeIds || []) as string[]
        if (memberIds.includes(node.id)) continue

        const gX = group.position.x
        const gY = group.position.y
        const { width: gW, height: gH } = getNodeDimensions(group)

        const isCenterIn =
          nCenterX >= gX &&
          nCenterX <= gX + gW &&
          nCenterY >= gY &&
          nCenterY <= gY + gH

        const overlapX = Math.max(0, Math.min(nX + nW, gX + gW) - Math.max(nX, gX))
        const overlapY = Math.max(0, Math.min(nY + nH, gY + gH) - Math.max(nY, gY))
        const overlapArea = overlapX * overlapY
        const nodeArea = nW * nH
        const hasOverlap = nodeArea > 0 && overlapArea / nodeArea > 0.25

        if (isCenterIn || hasOverlap) {
          targetGroupId = group.id
          break
        }
      }
      setGroupDragOver(targetGroupId)
    },
    [nodes, setGroupDragOver]
  )

  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      setGroupDragOver(null)
      if (node.type === 'groupNode') return

      const groups = nodes.filter((n) => n.type === 'groupNode')
      const { width: nW, height: nH } = getNodeDimensions(node)
      const nX = node.position.x
      const nY = node.position.y
      const nCenterX = nX + nW / 2
      const nCenterY = nY + nH / 2

      for (const group of groups) {
        const memberIds = ((group.data as any)?.nodeIds || []) as string[]
        if (memberIds.includes(node.id)) continue

        const gX = group.position.x
        const gY = group.position.y
        const { width: gW, height: gH } = getNodeDimensions(group)

        const isCenterIn =
          nCenterX >= gX &&
          nCenterX <= gX + gW &&
          nCenterY >= gY &&
          nCenterY <= gY + gH

        const overlapX = Math.max(0, Math.min(nX + nW, gX + gW) - Math.max(nX, gX))
        const overlapY = Math.max(0, Math.min(nY + nH, gY + gH) - Math.max(nY, gY))
        const overlapArea = overlapX * overlapY
        const nodeArea = nW * nH
        const hasOverlap = nodeArea > 0 && overlapArea / nodeArea > 0.25

        if (isCenterIn || hasOverlap) {
          addNodeToGroup(group.id, node.id)
          return
        }
      }

      // Drag-to-attach: Conexão automática ao arrastar memoryNode sobre agentNode (ou vice-versa)
      if (node.type === 'memoryNode') {
        const agentNodes = nodes.filter((n) => n.type === 'agentNode')
        for (const agent of agentNodes) {
          const { width: aW, height: aH } = getNodeDimensions(agent)
          const aX = agent.position.x
          const aY = agent.position.y

          const isCenterIn =
            nCenterX >= aX &&
            nCenterX <= aX + aW &&
            nCenterY >= aY &&
            nCenterY <= aY + aH

          const overlapX = Math.max(0, Math.min(nX + nW, aX + aW) - Math.max(nX, aX))
          const overlapY = Math.max(0, Math.min(nY + nH, aY + aH) - Math.max(nY, aY))
          const overlapArea = overlapX * overlapY
          const nodeArea = nW * nH
          const hasOverlap = nodeArea > 0 && overlapArea / nodeArea > 0.25

          if (isCenterIn || hasOverlap) {
            const alreadyConnected = edges.some(
              (e) => (e.source === node.id && e.target === agent.id) || (e.source === agent.id && e.target === node.id)
            )
            if (!alreadyConnected) {
              onConnect({
                source: node.id,
                target: agent.id,
                sourceHandle: null,
                targetHandle: null,
              })
            }
            break
          }
        }
      } else if (node.type === 'agentNode') {
        const memoryNodes = nodes.filter((n) => n.type === 'memoryNode')
        for (const mem of memoryNodes) {
          const { width: mW, height: mH } = getNodeDimensions(mem)
          const mX = mem.position.x
          const mY = mem.position.y

          const isCenterIn =
            nCenterX >= mX &&
            nCenterX <= mX + mW &&
            nCenterY >= mY &&
            nCenterY <= mY + mH

          const overlapX = Math.max(0, Math.min(nX + nW, mX + mW) - Math.max(nX, mX))
          const overlapY = Math.max(0, Math.min(nY + nH, mY + mH) - Math.max(nY, mY))
          const overlapArea = overlapX * overlapY
          const nodeArea = nW * nH
          const hasOverlap = nodeArea > 0 && overlapArea / nodeArea > 0.25

          if (isCenterIn || hasOverlap) {
            const alreadyConnected = edges.some(
              (e) => (e.source === node.id && e.target === mem.id) || (e.source === mem.id && e.target === node.id)
            )
            if (!alreadyConnected) {
              onConnect({
                source: mem.id,
                target: node.id,
                sourceHandle: null,
                targetHandle: null,
              })
            }
            break
          }
        }
      }
    },
    [nodes, edges, onConnect, addNodeToGroup, setGroupDragOver]
  )
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    flowX: number
    flowY: number
  } | null>(null)

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleDismiss = () => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleDismiss)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleDismiss)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const spawnAgent = useCallback((type: 'claude' | 'agy', pos: { x: number; y: number }) => {
    const isClaude = type === 'claude'
    const newNode: Node = {
      id: `node-${type}-${Date.now()}`,
      type: 'agentNode',
      position: { x: pos.x - 190, y: pos.y - 150 },
      style: { width: 600, height: 520 },
      data: {
        title: isClaude ? 'Claude Code' : 'Antigravity (AGY)',
        agentType: type,
        role: isClaude ? 'planner' : 'executor',
        status: 'idle',
        viewMode: 'extension',
        thinking: null,
        messages: [],
        approvals: [],
        attachedImages: [],
        terminalLogs: [],
        cliSessionId: crypto.randomUUID(),
        hasStarted: false,
      },
    }
    addNode(newNode)
    setContextMenu(null)
  }, [addNode])

  const spawnTerminal = useCallback((pos: { x: number; y: number }) => {
    const nodeId = `node-terminal-${Date.now()}`
    const newNode: Node = {
      id: nodeId,
      type: 'terminalNode',
      position: { x: pos.x - 200, y: pos.y - 120 },
      style: { width: 640, height: 400 },
      data: {
        title: 'PowerShell',
        shell: 'powershell',
        sessionId: `pty-${nodeId}`,
        workspacePath: getActiveWorkspacePath(),
        isPtyActive: true,
      },
    }
    addNode(newNode)
    setContextMenu(null)
  }, [addNode, getActiveWorkspacePath])

  const spawnImage = useCallback((pos: { x: number; y: number }) => {
    const newNode: Node = {
      id: `node-image-${Date.now()}`,
      type: 'imageNode',
      position: { x: pos.x - 170, y: pos.y - 120 },
      data: {
        title: 'Nova Imagem',
        name: '',
        url: '',
        images: [],
        activeImageIndex: 0,
        annotations: [],
      },
    }
    addNode(newNode)
    setContextMenu(null)
  }, [addNode])

  const spawnNodeGroup = useCallback((pos: { x: number; y: number }) => {
    const newNode: Node = {
      id: `group-${Date.now()}`,
      type: 'groupNode',
      position: { x: pos.x - 200, y: pos.y - 150 },
      style: { width: 560, height: 420, zIndex: 0 },
      data: {
        title: 'Novo Grupo de Nós',
        nodeIds: [],
        width: 560,
        height: 420,
      },
    }
    addNode(newNode)
    setContextMenu(null)
  }, [addNode])

  const handlePaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault()
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      })
    },
    [screenToFlowPosition]
  )

  // Synchronize document.documentElement dark class with canvasStore theme
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }, [theme])

  // Track cursor position on the screen to spawn pasted images at the cursor
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Global Clipboard paste listener (Ctrl+V)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // If user is typing in an active text input or textarea, let the element handle it
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') {
        return
      }

      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            const reader = new FileReader()
            reader.onload = (uploadEvent) => {
              const result = uploadEvent.target?.result as string
              if (result) {
                const store = useCanvasStore.getState()
                const selectedNode = store.nodes.find((n) => n.selected)

                if (selectedNode) {
                  // Add directly to the selected node
                  store.addImageToNode(selectedNode.id, {
                    url: result,
                    name: file.name || `captura-${Date.now()}.png`,
                  })
                  return
                }

                const flowPos = screenToFlowPosition(mousePositionRef.current)
                const newImgNode: Node = {
                  id: `node-image-paste-${Date.now()}`,
                  type: 'imageNode',
                  position: {
                    x: flowPos.x - 170,
                    y: flowPos.y - 120,
                  },
                  data: {
                    title: 'Captura Colada',
                    name: file.name || `captura-${Date.now()}.png`,
                    url: result,
                    images: [
                      {
                        id: `img-${Date.now()}`,
                        url: result,
                        name: file.name || `captura-${Date.now()}.png`,
                        annotations: [],
                      },
                    ],
                    activeImageIndex: 0,
                    annotations: [],
                  },
                }
                store.addNode(newImgNode)
              }
            }
            reader.readAsDataURL(file)
            break
          }
        }
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [screenToFlowPosition])

  // Drag and drop image files directly onto canvas
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter((f) => f.type.startsWith('image/'))

      if (imageFiles.length > 0) {
        const file = imageFiles[0]
        const reader = new FileReader()
        reader.onload = (uploadEvent) => {
          const result = uploadEvent.target?.result as string
          if (result) {
            const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
            const newImgNode: Node = {
              id: `node-image-drop-${Date.now()}`,
              type: 'imageNode',
              position: {
                x: flowPos.x - 170,
                y: flowPos.y - 120,
              },
              data: {
                title: 'Imagem Importada',
                name: file.name,
                url: result,
                annotations: [],
              },
            }
            addNode(newImgNode)
          }
        }
        reader.readAsDataURL(file)
      }
    },
    [addNode, screenToFlowPosition]
  )

  // Check Tauri API integration or fallback
  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

    if (isTauri) {
      console.info('[CGLI] Tauri desktop runtime detected.')
    } else {
      console.info('[CGLI] Running in standard browser environment with mock fallbacks.')
    }
  }, [])

  return (
    <div className="w-full h-full flex flex-col">
      <Topbar onFitView={() => fitView({ padding: 0.2, duration: 400 })} />

      <main
        className="flex-1 w-full h-full relative"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={(connection) => {
            const sourceNode = nodes.find((n) => n.id === connection.source)
            const targetNode = nodes.find((n) => n.id === connection.target)
            // Diff nodes cannot be connected to any other agent
            if (sourceNode?.type === 'diffNode' || targetNode?.type === 'diffNode') {
              return false
            }
            return true
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => setContextMenu(null)}
          onMoveStart={() => setContextMenu(null)}
          onNodeClick={() => setContextMenu(null)}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          fitView
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          className="w-full h-full"
        >
          {/* Dot grid inspired by n8n */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.5}
            color={theme === 'dark' ? '#1E293B' : '#94A3B8'}
          />

          <Controls
            showInteractive={false}
            className={`!border !rounded-xl !shadow-lg ${
              theme === 'dark'
                ? '!bg-slate-900 !border-slate-800 [&_button]:!fill-slate-300 [&_button]:!border-slate-800 hover:[&_button]:!bg-slate-800'
                : '!bg-white !border-slate-300 [&_button]:!fill-slate-700 [&_button]:!border-slate-200 hover:[&_button]:!bg-slate-100'
            }`}
          />

          <MiniMap
            zoomable
            pannable
            nodeStrokeWidth={3}
            nodeColor={(n) => {
              if (n.type === 'agentNode') {
                return (n.data as any)?.agentType === 'claude' ? '#EA580C' : '#0284C7'
              }
              if (n.type === 'artifactNode') return '#6366F1'
              if (n.type === 'previewNode') return '#06B6D4'
              if (n.type === 'terminalNode') return '#0078D4'
              if (n.type === 'diffNode') return '#10B981'
              if (n.type === 'imageNode' || n.type === 'imageGroupNode') return '#F43F5E'
              if (n.type === 'groupNode') return 'rgba(99, 102, 241, 0.3)'
              return '#64748B'
            }}
            className={`!rounded-xl !border !shadow-md overflow-hidden ${
              theme === 'dark'
                ? '!bg-[#0D1117] !border-slate-800'
                : '!bg-white !border-slate-300'
            }`}
          />
        </ReactFlow>

        {/* Canvas Right-Click Context Menu */}
        {contextMenu && (
          <div
            data-testid="canvas-context-menu"
            className={`fixed z-50 min-w-[220px] rounded-xl border p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none ${
              theme === 'dark'
                ? 'bg-[#161B22]/95 border-[#30363D] text-[#F0F6FC] shadow-black/60'
                : 'bg-white/95 border-slate-300 text-slate-900 shadow-slate-400/40'
            }`}
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 380),
              left: Math.min(contextMenu.x, window.innerWidth - 240),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-inherit mb-1 flex items-center justify-between">
              <span>Adicionar ao Canvas</span>
              <span className="text-[9px] font-mono opacity-70">Menu</span>
            </div>

            <button
              type="button"
              onClick={() => spawnAgent('claude', { x: contextMenu.flowX, y: contextMenu.flowY })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-[#21262D] text-slate-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-orange-500/15 flex items-center justify-center text-orange-500 shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-semibold text-xs leading-tight">Claude Code</span>
                <span className="text-[10px] text-slate-400 leading-tight">Planejador CLI</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => spawnAgent('agy', { x: contextMenu.flowX, y: contextMenu.flowY })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-[#21262D] text-slate-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-sky-500/15 flex items-center justify-center text-sky-500 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-semibold text-xs leading-tight">Antigravity AGY</span>
                <span className="text-[10px] text-slate-400 leading-tight">Executor CLI</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => spawnTerminal({ x: contextMenu.flowX, y: contextMenu.flowY })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-[#21262D] text-slate-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-500 shrink-0">
                <SquareTerminal className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-semibold text-xs leading-tight">Terminal PowerShell</span>
                <span className="text-[10px] text-slate-400 leading-tight">Shell local PTY</span>
              </div>
            </button>

            <div className={`my-1 border-t ${theme === 'dark' ? 'border-[#30363D]' : 'border-slate-200'}`} />

            <button
              type="button"
              onClick={() => spawnImage({ x: contextMenu.flowX, y: contextMenu.flowY })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-[#21262D] text-slate-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-rose-500/15 flex items-center justify-center text-rose-500 shrink-0">
                <ImageIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-semibold text-xs leading-tight">Imagem</span>
                <span className="text-[10px] text-slate-400 leading-tight">Print & Editor Canvas</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => spawnNodeGroup({ x: contextMenu.flowX, y: contextMenu.flowY })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-[#21262D] text-slate-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center text-purple-500 shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-semibold text-xs leading-tight">Moldura de Grupo</span>
                <span className="text-[10px] text-slate-400 leading-tight">Agrupar nós no canvas</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                openMemoryExplorer({ x: contextMenu.flowX, y: contextMenu.flowY })
                setContextMenu(null)
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-[#21262D] text-slate-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
                <Brain className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-semibold text-xs leading-tight">Nota de Memória</span>
                <span className="text-[10px] text-slate-400 leading-tight">Explorar Obsidian & Fixar</span>
              </div>
            </button>
          </div>
        )}

        {/* Multi-Node Selection Floating Toolbar */}
        {nodes.filter((n) => n.selected && n.type !== 'groupNode').length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl bg-[#0D1117]/95 border-indigo-500/40 text-slate-100 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
            <span className="text-xs font-semibold text-indigo-400">
              {nodes.filter((n) => n.selected && n.type !== 'groupNode').length} nós selecionados
            </span>
            <button
              type="button"
              onClick={() => {
                const selectedIds = nodes
                  .filter((n) => n.selected && n.type !== 'groupNode')
                  .map((n) => n.id)
                groupSelectedNodes(selectedIds)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Criar Grupo</span>
            </button>
          </div>
        )}
      </main>

      {/* Overlays & Drawers */}
      <StashDrawer />
      <SettingsModal />
      <NewProjectModal />
      <ManageWorkspaceModal />
      <MemoryExplorerModal />
      <ImageAnnotationModal key={annotatingNodeId || 'none'} />
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
