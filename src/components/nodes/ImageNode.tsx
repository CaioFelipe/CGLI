import { Handle, type NodeProps, Position } from '@xyflow/react'
import {
  Archive,
  Edit3,
  Image as ImageIcon,
  Layers,
  Trash2,
} from 'lucide-react'
import React from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { AnnotationItem, ImageNodeData } from '../../types/canvas'

export const ImageNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ImageNodeData
  const { theme, openAnnotationModal, stashNode, deleteNode } = useCanvasStore()

  const accentColor = '#F43F5E'

  // Render SVG annotations overlay over the image
  const renderAnnotations = (annotations: AnnotationItem[] = []) => {
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 400 240"
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
                  x={(ann.x || 0) - 4}
                  y={(ann.y || 0) - 14}
                  width={(ann.text?.length || 5) * 8 + 8}
                  height={18}
                  fill="#000000"
                  fillOpacity="0.75"
                  rx={3}
                />
                <text
                  x={ann.x}
                  y={ann.y}
                  fill={ann.color}
                  fontSize="12"
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
      className={`group relative rounded-xl border transition-all duration-200 shadow-md ${
        selected ? 'ring-2 ring-rose-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-xl shadow-black/50'
          : 'bg-white border-slate-200 text-slate-900 shadow-lg shadow-slate-200/50'
      }`}
      style={{
        width: 340,
        borderColor: selected ? accentColor : undefined,
      }}
    >
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
        className="flex items-center justify-between px-3 py-2 border-b rounded-t-xl"
        style={{
          borderBottomColor: theme === 'dark' ? '#21262D' : '#F1F5F9',
          borderTop: `3px solid ${accentColor}`,
        }}
      >
        <div className="flex items-center gap-2 truncate">
          <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs bg-rose-500/15 text-rose-500">
            <ImageIcon className="w-3.5 h-3.5" />
          </div>
          <div className="truncate">
            <span className="font-semibold text-xs tracking-tight truncate block">
              {nodeData.title || nodeData.name || 'Captura de Tela'}
            </span>
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

      {/* Image Preview & Annotations Container */}
      <div className="relative w-full h-52 bg-slate-950 flex items-center justify-center overflow-hidden">
        {nodeData.url ? (
          <img
            src={nodeData.url}
            alt={nodeData.name}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-500 text-xs">
            <ImageIcon className="w-8 h-8 opacity-40" />
            <span>Nenhuma imagem carregada</span>
          </div>
        )}

        {/* SVG Annotation Layer */}
        {renderAnnotations(nodeData.annotations)}

        {/* Annotation count badge */}
        {nodeData.annotations && nodeData.annotations.length > 0 && (
          <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-xs border border-slate-700/60 text-rose-400 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-xs">
            <Layers className="w-3 h-3" />
            <span>{nodeData.annotations.length} anotações</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        className="px-3 py-2 border-t rounded-b-xl flex items-center justify-between"
        style={{
          borderColor: theme === 'dark' ? '#1F2937' : '#F1F5F9',
          backgroundColor: theme === 'dark' ? '#0F172A' : '#FAFAFA',
        }}
      >
        <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
          {nodeData.name || 'captura.png'}
        </span>

        <button
          type="button"
          onClick={() => openAnnotationModal(id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-xs"
        >
          <Edit3 className="w-3 h-3" />
          Anotar Imagem
        </button>
      </div>
    </div>
  )
}
