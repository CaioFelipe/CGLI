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
} from 'lucide-react'
import React from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { AnnotationItem, ImageGroupNodeData } from '../../types/canvas'

export const ImageGroupNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ImageGroupNodeData
  const { theme, openAnnotationModal, stashNode, deleteNode, updateNodeData } = useCanvasStore()
  const currentIndex = nodeData.activeImageIndex || 0

  const accentColor = '#F43F5E'
  const images = nodeData.images || []
  const activeImage = images[currentIndex]

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      const nextIdx = currentIndex + 1
      updateNodeData(id, { activeImageIndex: nextIdx })
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1
      updateNodeData(id, { activeImageIndex: prevIdx })
    }
  }

  const handleAddImage = () => {
    const newImg = {
      id: `img-${Date.now()}`,
      url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80',
      name: `captura-${images.length + 1}.png`,
      annotations: [],
    }
    const updated = [...images, newImg]
    updateNodeData(id, { images: updated, activeImageIndex: updated.length - 1 })
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
            id={`arrow-head-group-${id}`}
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
                  markerEnd={`url(#arrow-head-group-${id})`}
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
      className={`group relative rounded-xl border transition-all duration-200 flex flex-col ${
        selected ? 'ring-2 ring-rose-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 300,
        minHeight: 220,
        borderColor: selected ? accentColor : undefined,
      }}
    >
      {/* NodeResizer for interactive resizing */}
      <NodeResizer
        minWidth={300}
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
        className={`flex items-center justify-between px-3.5 py-2.5 border-b rounded-t-xl ${
          theme === 'dark' ? 'bg-[#161B22]/80 border-[#21262D]' : 'bg-slate-50/90 border-slate-200'
        }`}
        style={{
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs bg-rose-500/15 text-rose-500">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-bold text-xs tracking-tight">
              {nodeData.title || 'Grupo de Referências'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {images.length} capturas agrupadas
            </span>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleAddImage}
            title="Adicionar imagem ao grupo"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-500 hover:text-rose-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stashNode(id)}
            title="Guardar no Stash"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => deleteNode(id)}
            title="Remover Nó"
            className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Image View */}
      <div className="relative w-full flex-1 min-h-[160px] bg-slate-950 flex items-center justify-center overflow-hidden p-1.5">
        {activeImage ? (
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img
              src={activeImage.url}
              alt={activeImage.name}
              className="max-w-full max-h-full w-auto h-auto object-contain select-none pointer-events-none block rounded-sm"
            />

            {/* SVG Annotation Layer directly hugging the active image */}
            {renderAnnotations(activeImage.annotations)}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-500 text-xs">
            <ImageIcon className="w-8 h-8 opacity-40" />
            <span>Nenhuma imagem no grupo</span>
          </div>
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
              className="absolute left-2 p-1.5 rounded-full bg-slate-900/80 text-white disabled:opacity-20 hover:bg-slate-900 transition-colors z-20"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex === images.length - 1}
              className="absolute right-2 p-1.5 rounded-full bg-slate-900/80 text-white disabled:opacity-20 hover:bg-slate-900 transition-colors z-20"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 inset-x-0 flex justify-center z-20">
              <span className="bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-white pointer-events-none">
                {currentIndex + 1} de {images.length}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div
        className={`px-3 py-2 border-t rounded-b-xl flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#090D13] border-[#21262D]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
          {activeImage?.name || 'imagem.png'}
        </span>

        <button
          type="button"
          onClick={() => openAnnotationModal(id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-xs"
        >
          <Edit3 className="w-3 h-3" />
          Anotar
        </button>
      </div>
    </div>
  )
}
