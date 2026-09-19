import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useReactFlow,
} from '@xyflow/react'
import { X } from 'lucide-react'
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'

export const RemovableEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}) => {
  const { setEdges } = useReactFlow()
  const deleteEdge = useCanvasStore((state) => state.deleteEdge)
  const [isHovered, setIsHovered] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const isLocked = Boolean((data as any)?.isLocked)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLocked) return
    deleteEdge(id)
    setEdges((edges) => edges.filter((edge) => edge.id !== id))
  }

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isHovered || selected ? 3 : 2,
          transition: 'stroke-width 0.15s ease, stroke 0.15s ease',
        }}
      />
      {/* Invisible thicker interaction path for easier mouse hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {!isLocked && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <button
              type="button"
              onClick={handleDelete}
              title="Excluir conexão entre os nós"
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 shadow-md ${
                isHovered || selected
                  ? 'opacity-100 scale-110 bg-rose-600 text-white hover:bg-rose-500 ring-2 ring-rose-400/40'
                  : 'opacity-40 hover:opacity-100 bg-slate-900/90 text-slate-300 border border-slate-700 hover:bg-rose-600 hover:text-white'
              }`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
