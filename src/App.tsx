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
import React, { useCallback, useEffect, useRef } from 'react'
import { Layers } from 'lucide-react'
import { Topbar } from './components/layout/Topbar'
import { ImageAnnotationModal } from './components/modais/ImageAnnotationModal'
import { SettingsModal } from './components/modais/SettingsModal'
import { AgentCardNode } from './components/nodes/AgentCardNode'
import { ArtifactViewerNode } from './components/nodes/ArtifactViewerNode'
import { GroupNode } from './components/nodes/GroupNode'
import { ImageGroupNode } from './components/nodes/ImageGroupNode'
import { ImageNode } from './components/nodes/ImageNode'
import { RemovableEdge } from './components/edges/RemovableEdge'
import { StashDrawer } from './components/panels/StashDrawer'
import { useCanvasStore } from './store/canvasStore'

// Register custom node types
const nodeTypes: NodeTypes = {
  agentNode: AgentCardNode,
  artifactNode: ArtifactViewerNode,
  imageNode: ImageNode,
  imageGroupNode: ImageGroupNode,
  groupNode: GroupNode,
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
    theme,
    groupSelectedNodes,
  } = useCanvasStore()

  const { screenToFlowPosition, fitView } = useReactFlow()
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 300, y: 300 })

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
            const reader = new FileReader()
            reader.onload = (uploadEvent) => {
              const result = uploadEvent.target?.result as string
              if (result) {
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
                    annotations: [],
                  },
                }
                addNode(newImgNode)
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
  }, [addNode, screenToFlowPosition])

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
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
      <ImageAnnotationModal />
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
