import {
  ArrowUpRight,
  Circle,
  CornerUpLeft,
  Pencil,
  Save,
  Square,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { AnnotationItem, AnnotationTool, ImageGroupNodeData, ImageNodeData } from '../../types/canvas'

export const ImageAnnotationModal: React.FC = () => {
  const {
    nodes,
    annotatingNodeId,
    closeAnnotationModal,
    saveAnnotations,
    updateNodeData,
    theme,
  } = useCanvasStore()

  const activeNode = nodes.find((n) => n.id === annotatingNodeId)
  const isGroup = activeNode?.type === 'imageGroupNode'
  const groupData = isGroup ? (activeNode?.data as unknown as ImageGroupNodeData) : undefined
  const activeGroupImage = groupData?.images?.[groupData.activeImageIndex || 0]

  const nodeData = activeNode?.data as unknown as ImageNodeData | undefined
  const imageUrl = isGroup ? activeGroupImage?.url : nodeData?.url
  const imageName = isGroup ? activeGroupImage?.name : (nodeData?.title || nodeData?.name)
  const currentAnnotations = isGroup
    ? (activeGroupImage?.annotations || [])
    : (nodeData?.annotations || [])

  const [annotations, setAnnotations] = useState<AnnotationItem[]>(
    currentAnnotations ? [...currentAnnotations] : []
  )
  const [activeTool, setActiveTool] = useState<AnnotationTool>('circle')
  const [activeColor, setActiveColor] = useState('#EF4444')
  const strokeWidth = 3

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [currentDraft, setCurrentDraft] = useState<AnnotationItem | null>(null)
  const [textPromptPos, setTextPromptPos] = useState<{ x: number; y: number } | null>(null)
  const [textInputVal, setTextInputVal] = useState('')

  const svgRef = useRef<SVGSVGElement>(null)

  const handleMouseUp = useCallback(() => {
    if (isDrawing && currentDraft) {
      // Validate item has size
      if (
        (currentDraft.tool === 'brush' && currentDraft.points && currentDraft.points.length > 2) ||
        (currentDraft.tool === 'arrow' &&
          (currentDraft.x !== currentDraft.endX || currentDraft.y !== currentDraft.endY)) ||
        (currentDraft.tool === 'rect' && (currentDraft.width || 0) > 4) ||
        (currentDraft.tool === 'circle' && (currentDraft.width || 0) > 4)
      ) {
        setAnnotations((prev) => [...prev, currentDraft])
      }
    }
    setIsDrawing(false)
    setStartPoint(null)
    setCurrentDraft(null)
  }, [isDrawing, currentDraft])

  // Global mouseup listener to catch releases outside the SVG
  useEffect(() => {
    if (!isDrawing) return
    const handleGlobalMouseUp = () => {
      handleMouseUp()
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [isDrawing, handleMouseUp])

  if (!annotatingNodeId || (!nodeData && !isGroup)) return null

  const getSvgCoordinates = (e: React.MouseEvent<SVGSVGElement> | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = 800 / rect.width
    const scaleY = 480 / rect.height
    return {
      x: Math.max(0, Math.min(800, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(480, (e.clientY - rect.top) * scaleY)),
    }
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e)

    if (activeTool === 'text') {
      setTextPromptPos(coords)
      setTextInputVal('')
      return
    }

    setIsDrawing(true)
    setStartPoint(coords)

    if (activeTool === 'brush') {
      setCurrentDraft({
        id: `ann-${Date.now()}`,
        tool: 'brush',
        color: activeColor,
        strokeWidth,
        points: [coords.x, coords.y],
      })
    } else {
      setCurrentDraft({
        id: `ann-${Date.now()}`,
        tool: activeTool,
        color: activeColor,
        strokeWidth,
        x: coords.x,
        y: coords.y,
        endX: coords.x,
        endY: coords.y,
        width: 0,
        height: 0,
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPoint || !currentDraft) return
    const coords = getSvgCoordinates(e)

    if (activeTool === 'brush') {
      setCurrentDraft({
        ...currentDraft,
        points: [...(currentDraft.points || []), coords.x, coords.y],
      })
    } else if (activeTool === 'arrow') {
      setCurrentDraft({
        ...currentDraft,
        endX: coords.x,
        endY: coords.y,
      })
    } else if (activeTool === 'circle' || activeTool === 'rect') {
      const minX = Math.min(startPoint.x, coords.x)
      const minY = Math.min(startPoint.y, coords.y)
      const w = Math.abs(coords.x - startPoint.x)
      const h = Math.abs(coords.y - startPoint.y)

      setCurrentDraft({
        ...currentDraft,
        x: minX,
        y: minY,
        width: w,
        height: h,
      })
    }
  }

  const handleConfirmText = () => {
    if (textPromptPos && textInputVal.trim()) {
      const newTextItem: AnnotationItem = {
        id: `ann-${Date.now()}`,
        tool: 'text',
        color: activeColor,
        strokeWidth,
        x: textPromptPos.x,
        y: textPromptPos.y,
        text: textInputVal.trim(),
      }
      setAnnotations((prev) => [...prev, newTextItem])
    }
    setTextPromptPos(null)
    setTextInputVal('')
  }

  const handleUndo = () => {
    setAnnotations((prev) => prev.slice(0, -1))
  }

  const handleClearAll = () => {
    setAnnotations([])
  }

  const handleSave = () => {
    if (isGroup && groupData && activeGroupImage) {
      const activeIdx = groupData.activeImageIndex || 0
      const updatedImages = (groupData.images || []).map((img, idx) =>
        idx === activeIdx ? { ...img, annotations } : img
      )
      updateNodeData(annotatingNodeId, { images: updatedImages })
      closeAnnotationModal()
    } else {
      saveAnnotations(annotatingNodeId, annotations)
    }
  }

  const colorPalette = [
    { label: 'Vermelho', hex: '#EF4444' },
    { label: 'Âmbar', hex: '#F59E0B' },
    { label: 'Verde', hex: '#10B981' },
    { label: 'Azul', hex: '#3B82F6' },
  ]

  const tools: Array<{ id: AnnotationTool; label: string; icon: React.ReactNode }> = [
    { id: 'circle', label: 'Círculo / Elipse', icon: <Circle className="w-4 h-4" /> },
    { id: 'arrow', label: 'Seta', icon: <ArrowUpRight className="w-4 h-4" /> },
    { id: 'rect', label: 'Retângulo', icon: <Square className="w-4 h-4" /> },
    { id: 'brush', label: 'Desenho Livre', icon: <Pencil className="w-4 h-4" /> },
    { id: 'text', label: 'Texto', icon: <Type className="w-4 h-4" /> },
  ]

  const renderItem = (item: AnnotationItem, isDraft = false) => {
    if (item.tool === 'circle') {
      const cx = (item.x || 0) + (item.width || 0) / 2
      const cy = (item.y || 0) + (item.height || 0) / 2
      const rx = Math.abs((item.width || 0) / 2)
      const ry = Math.abs((item.height || 0) / 2)
      return (
        <ellipse
          key={item.id}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          strokeDasharray={isDraft ? '4 4' : undefined}
        />
      )
    }

    if (item.tool === 'rect') {
      return (
        <rect
          key={item.id}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          strokeDasharray={isDraft ? '4 4' : undefined}
          rx={4}
        />
      )
    }

    if (item.tool === 'arrow') {
      return (
        <g key={item.id} style={{ color: item.color }}>
          <line
            x1={item.x}
            y1={item.y}
            x2={item.endX}
            y2={item.endY}
            stroke={item.color}
            strokeWidth={item.strokeWidth}
            markerEnd="url(#modal-arrow-head)"
          />
        </g>
      )
    }

    if (item.tool === 'brush' && item.points) {
      const pointsStr = item.points
        .reduce((acc: string[], val, idx) => {
          if (idx % 2 === 0) {
            acc.push(`${val},${item.points![idx + 1]}`)
          }
          return acc
        }, [])
        .join(' ')

      return (
        <polyline
          key={item.id}
          points={pointsStr}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    }

    if (item.tool === 'text') {
      return (
        <g key={item.id}>
          <rect
            x={(item.x || 0) - 6}
            y={(item.y || 0) - 18}
            width={(item.text?.length || 5) * 9 + 12}
            height={24}
            fill="#000000"
            fillOpacity="0.8"
            rx={4}
          />
          <text
            x={item.x}
            y={item.y}
            fill={item.color}
            fontSize="14"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {item.text}
          </text>
        </g>
      )
    }

    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          theme === 'dark'
            ? 'bg-[#111827] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Anotações Visuais
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Desenhe setas, círculos e orientações diretamente sobre a captura
            </p>
          </div>
          <button
            type="button"
            onClick={closeAnnotationModal}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          {/* Tools */}
          <div className="flex items-center gap-1.5">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTool(t.id)}
                title={t.label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTool === t.id
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Colors & Actions */}
          <div className="flex items-center gap-4">
            {/* Color Swatches */}
            <div className="flex items-center gap-1.5">
              {colorPalette.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setActiveColor(c.hex)}
                  title={c.label}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    activeColor === c.hex
                      ? 'scale-125 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />

            {/* Undo & Clear */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={annotations.length === 0}
                title="Desfazer"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <CornerUpLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={annotations.length === 0}
                title="Limpar Tudo"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Annotation Canvas */}
        <div className="relative w-full h-[480px] bg-slate-950 flex items-center justify-center overflow-hidden select-none p-4">
          {imageUrl ? (
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              <img
                src={imageUrl}
                alt={imageName || 'Imagem'}
                className="max-w-full max-h-[448px] w-auto h-auto object-contain pointer-events-none block select-none rounded-sm"
              />

              {/* SVG Overlay covering the exact bounds of the image */}
              <svg
                ref={svgRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                viewBox="0 0 800 480"
                preserveAspectRatio="none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <defs>
                  <marker
                    id="modal-arrow-head"
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

                {annotations.map((ann) => renderItem(ann, false))}
                {currentDraft && renderItem(currentDraft, true)}
              </svg>

              {/* Text Input Prompt overlay */}
              {textPromptPos && (
                <div
                  className="absolute z-20 bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-xl flex items-center gap-2"
                  style={{
                    left: `${(textPromptPos.x / 800) * 100}%`,
                    top: `${(textPromptPos.y / 480) * 100}%`,
                    transform: 'translate(-10%, -50%)',
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={textInputVal}
                    onChange={(e) => setTextInputVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmText()
                      if (e.key === 'Escape') setTextPromptPos(null)
                    }}
                    placeholder="Digitar legenda..."
                    className="text-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-hidden focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={handleConfirmText}
                    className="px-2 py-1 rounded text-xs bg-rose-600 text-white font-medium hover:bg-rose-500"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextPromptPos(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500 text-sm">Nenhuma imagem carregada para anotação</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-xs text-slate-500">
            {annotations.length} anotação(ões) registrada(s)
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeAnnotationModal}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-all shadow-md"
            >
              <Save className="w-4 h-4" />
              Salvar Anotações
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
