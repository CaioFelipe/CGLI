import { Handle, NodeResizer, type NodeProps, Position } from '@xyflow/react'
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Image as ImageIcon,
  Layers,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import React, { useMemo, useRef, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { AnnotationItem, ImageItem, ImageNodeData } from '../../types/canvas'

export const ImageNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ImageNodeData
  const {
    theme,
    openAnnotationModal,
    stashNode,
    deleteNode,
    updateNodeData,
    edges,
    nodes,
    attachImageToAgent,
    removeAttachedImage,
  } = useCanvasStore()

  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const accentColor = '#F43F5E'

  // Normalize images list (supports new multi-image format and legacy single url)
  const images: ImageItem[] = useMemo(() => {
    if (nodeData.images && Array.isArray(nodeData.images) && nodeData.images.length > 0) {
      return nodeData.images
    }
    if (nodeData.url) {
      return [
        {
          id: `${id}-img-1`,
          url: nodeData.url,
          name: nodeData.name || nodeData.title || 'captura.png',
          annotations: nodeData.annotations || [],
        },
      ]
    }
    return []
  }, [nodeData.images, nodeData.url, nodeData.name, nodeData.title, nodeData.annotations, id])

  const currentIndex = Math.min(
    Math.max(0, nodeData.activeImageIndex || 0),
    Math.max(0, images.length - 1)
  )
  const activeImage: ImageItem | undefined = images[currentIndex]

  // Broadcast newly added images to any agents currently connected to this node
  const syncImagesToConnectedAgents = React.useCallback(
    (newImages: ImageItem[]) => {
      const connectedEdges = edges.filter((e) => e.source === id || e.target === id)
      connectedEdges.forEach((edge) => {
        const otherNodeId = edge.source === id ? edge.target : edge.source
        const otherNode = nodes.find((n) => n.id === otherNodeId)
        if (otherNode && otherNode.type === 'agentNode') {
          newImages.forEach((img) => {
            if (img.url) {
              attachImageToAgent(otherNode.id, {
                id: img.id,
                url: img.url,
                name: img.name || 'imagem.png',
                nodeId: id,
              })
            }
          })
        }
      })
    },
    [edges, nodes, id, attachImageToAgent]
  )

  // Handle file reading from drop or file dialog
  const processFiles = React.useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (fileArray.length === 0) return

      let readCount = 0
      const newItems: ImageItem[] = []

      fileArray.forEach((file) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (result) {
            const newItem: ImageItem = {
              id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              url: result,
              name: file.name,
              annotations: [],
            }
            newItems.push(newItem)
          }
          readCount++
          if (readCount === fileArray.length) {
            const updated = [...images, ...newItems]
            const nextIndex = updated.length - 1
            updateNodeData(id, {
              images: updated,
              activeImageIndex: nextIndex,
              url: updated[0]?.url,
              name: updated[0]?.name,
            })
            syncImagesToConnectedAgents(newItems)
          }
        }
        reader.readAsDataURL(file)
      })
    },
    [images, id, updateNodeData, syncImagesToConnectedAgents]
  )

  // Listen for Ctrl+V paste directly on ImageNode when selected
  React.useEffect(() => {
    if (!selected) return

    const handleNodePaste = (e: ClipboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') return

      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            e.stopPropagation()
            processFiles([file])
            break
          }
        }
      }
    }

    window.addEventListener('paste', handleNodePaste)
    return () => window.removeEventListener('paste', handleNodePaste)
  }, [selected, processFiles])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleRemoveImage = (e: React.MouseEvent, imgIdToRemove: string) => {
    e.stopPropagation()

    // Detach from connected agents
    const connectedEdges = edges.filter((e) => e.source === id || e.target === id)
    connectedEdges.forEach((edge) => {
      const otherNodeId = edge.source === id ? edge.target : edge.source
      const otherNode = nodes.find((n) => n.id === otherNodeId)
      if (otherNode && otherNode.type === 'agentNode') {
        removeAttachedImage(otherNode.id, imgIdToRemove)
      }
    })

    const remaining = images.filter((img) => img.id !== imgIdToRemove)
    const nextIdx = Math.max(0, Math.min(currentIndex, remaining.length - 1))
    updateNodeData(id, {
      images: remaining,
      activeImageIndex: nextIdx,
      url: remaining[0]?.url || '',
      name: remaining[0]?.name || '',
      annotations: remaining[0]?.annotations || [],
    })
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex > 0) {
      updateNodeData(id, { activeImageIndex: currentIndex - 1 })
    }
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex < images.length - 1) {
      updateNodeData(id, { activeImageIndex: currentIndex + 1 })
    }
  }

  // Render SVG annotations overlay over the active image
  const renderAnnotations = (annotations: AnnotationItem[] = []) => {
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 800 480"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id={`arrow-head-${id}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L7,3 z" fill="currentColor" />
          </marker>
        </defs>

        {annotations.map((ann) => {
          if (ann.tool === 'circle') {
            const cx = (ann.x || 0) + (ann.width || 0) / 2
            const cy = (ann.y || 0) + (ann.height || 0) / 2
            const rx = Math.abs((ann.width || 0) / 2)
            const ry = Math.abs((ann.height || 0) / 2)
            return (
              <ellipse
                key={ann.id}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="none"
                stroke={ann.color}
                strokeWidth={ann.strokeWidth || 3}
              />
            )
          }

          if (ann.tool === 'rect') {
            return (
              <rect
                key={ann.id}
                x={ann.x}
                y={ann.y}
                width={ann.width}
                height={ann.height}
                fill="none"
                stroke={ann.color}
                strokeWidth={ann.strokeWidth || 3}
                rx={4}
              />
            )
          }

          if (ann.tool === 'arrow') {
            return (
              <g key={ann.id} style={{ color: ann.color }}>
                <line
                  x1={ann.x}
                  y1={ann.y}
                  x2={ann.endX}
                  y2={ann.endY}
                  stroke={ann.color}
                  strokeWidth={ann.strokeWidth || 3}
                  markerEnd={`url(#arrow-head-${id})`}
                />
              </g>
            )
          }

          if (ann.tool === 'brush' && ann.points) {
            const pointsStr = ann.points
              .reduce((acc: string[], val, idx) => {
                if (idx % 2 === 0) {
                  acc.push(`${val},${ann.points![idx + 1]}`)
                }
                return acc
              }, [])
              .join(' ')

            return (
              <polyline
                key={ann.id}
                points={pointsStr}
                fill="none"
                stroke={ann.color}
                strokeWidth={ann.strokeWidth || 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          }

          if (ann.tool === 'text') {
            return (
              <g key={ann.id}>
                <rect
                  x={(ann.x || 0) - 6}
                  y={(ann.y || 0) - 18}
                  width={(ann.text?.length || 5) * 9 + 12}
                  height={24}
                  fill="#000000"
                  fillOpacity="0.8"
                  rx={4}
                />
                <text
                  x={ann.x}
                  y={ann.y}
                  fill={ann.color}
                  fontSize="14"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {ann.text}
                </text>
              </g>
            )
          }

          return null
        })}
      </svg>
    )
  }

  return (
    <div
      tabIndex={0}
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col focus:outline-hidden ${
        selected ? 'ring-2 ring-rose-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 280,
        minHeight: 220,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      {/* Hidden File Input supporting multiple file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* NodeResizer for interactive resizing */}
      <NodeResizer
        minWidth={280}
        minHeight={220}
        isVisible={selected}
        lineClassName="!border-rose-500"
        handleClassName="!w-2.5 !h-2.5 !bg-white !border-2 !border-rose-500 !rounded-xs"
      />

      {/* Handles: Top, Left, Right, Bottom with explicit IDs and dual directions */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-slate-400 dark:!bg-slate-400"
      />
      <Handle
        id="top-source"
        type="source"
        position={Position.Top}
        className="!opacity-0"
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-slate-400 dark:!bg-slate-400"
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className="!opacity-0"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-slate-400 dark:!bg-slate-400"
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className="!opacity-0"
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 dark:!bg-slate-400"
      />
      <Handle
        id="bottom-target"
        type="target"
        position={Position.Bottom}
        className="!opacity-0"
      />

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b rounded-t-xl ${
          theme === 'dark' ? 'bg-[#161B22]/80 border-[#21262D]' : 'bg-slate-50/90 border-slate-200'
        }`}
        style={{
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2 truncate">
          <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs bg-rose-500/15 text-rose-500 shrink-0">
            <ImageIcon className="w-3.5 h-3.5" />
          </div>
          <div className="truncate flex items-center gap-1.5">
            <span className="font-semibold text-xs tracking-tight truncate block">
              {nodeData.title || (images.length > 0 ? (activeImage?.name || 'Imagem') : 'Adicionar Imagem')}
            </span>
            {images.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                {images.length}
              </span>
            )}
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stashNode(id)}
            title="Guardar no Stash"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover Nó"
            className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Empty State vs Image Preview Container */}
      {images.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
            if (e.dataTransfer.files?.length) {
              processFiles(e.dataTransfer.files)
            }
          }}
          className={`relative m-2.5 flex-1 min-h-[160px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 cursor-pointer transition-all duration-150 select-none ${
            isDragOver
              ? 'border-rose-500 bg-rose-500/10 scale-[0.99]'
              : theme === 'dark'
              ? 'border-slate-700 hover:border-rose-500/60 bg-slate-900/40 hover:bg-slate-900/80 text-slate-300'
              : 'border-slate-300 hover:border-rose-500/60 bg-slate-50 hover:bg-slate-100 text-slate-600'
          }`}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-500/15 text-rose-500 mb-2">
            <UploadCloud className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-center">
            {isDragOver ? 'Solte a imagem aqui' : 'Arraste uma ou mais imagens'}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 text-center">
            ou clique para escolher do computador (ou Ctrl+V)
          </span>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
            if (e.dataTransfer.files?.length) {
              processFiles(e.dataTransfer.files)
            }
          }}
          className={`relative w-full flex-1 min-h-[160px] bg-slate-950 flex items-center justify-center overflow-hidden p-1.5 ${
            isDragOver ? 'ring-2 ring-rose-500 ring-inset' : ''
          }`}
        >
          {activeImage ? (
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              <img
                src={activeImage.url}
                alt={activeImage.name}
                className="max-w-full max-h-full w-auto h-auto object-contain select-none pointer-events-none block rounded-sm"
              />

              {/* SVG Annotation Layer hugging the active image */}
              {renderAnnotations(activeImage.annotations)}
            </div>
          ) : null}

          {/* Delete active image button */}
          {activeImage && (
            <button
              type="button"
              onClick={(e) => handleRemoveImage(e, activeImage.id)}
              title="Remover esta imagem"
              className="absolute top-2 left-2 p-1 rounded-md bg-slate-900/80 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors z-20 backdrop-blur-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Annotation count badge */}
          {activeImage?.annotations && activeImage.annotations.length > 0 && (
            <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-xs border border-slate-700/60 text-rose-400 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-xs z-10 pointer-events-none">
              <Layers className="w-3 h-3" />
              <span>{activeImage.annotations.length} anotações</span>
            </div>
          )}

          {/* Carousel Navigation Buttons */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                title="Imagem anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/85 text-white disabled:opacity-20 hover:bg-rose-600 transition-colors z-20 backdrop-blur-xs shadow-md"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIndex === images.length - 1}
                title="Próxima imagem"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900/85 text-white disabled:opacity-20 hover:bg-rose-600 transition-colors z-20 backdrop-blur-xs shadow-md"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-2 inset-x-0 flex justify-center z-20 pointer-events-none">
                <span className="bg-slate-950/80 backdrop-blur-xs border border-slate-800 px-2 py-0.5 rounded text-[10px] text-white">
                  {currentIndex + 1} de {images.length}
                </span>
              </div>
            </>
          )}

          {/* Drag over overlay when images already present */}
          {isDragOver && (
            <div className="absolute inset-0 bg-rose-950/70 backdrop-blur-xs flex flex-col items-center justify-center text-white z-30 pointer-events-none">
              <UploadCloud className="w-6 h-6 mb-1 text-rose-400 animate-bounce" />
              <span className="text-xs font-semibold">Solte para adicionar mais imagens</span>
            </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
      <div
        className={`px-3 py-2 border-t rounded-b-xl flex items-center justify-between gap-2 ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="text-[10px] text-slate-400 truncate max-w-[130px]" title={activeImage?.name}>
          {activeImage?.name || (images.length === 0 ? 'Nenhuma imagem' : 'imagem.png')}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Button to add more images */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Adicionar mais imagem (clique, arraste ou use Ctrl+V)"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              theme === 'dark'
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
            }`}
          >
            <Plus className="w-3 h-3 text-rose-500" />
            <span>Adicionar</span>
          </button>

          {/* Annotation Button */}
          {images.length > 0 && (
            <button
              type="button"
              onClick={() => openAnnotationModal(id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-xs"
            >
              <Edit3 className="w-3 h-3" />
              <span>Anotar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
