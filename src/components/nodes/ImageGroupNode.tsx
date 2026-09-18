import { Handle, type NodeProps, Position } from '@xyflow/react'
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
import React, { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { ImageGroupNodeData } from '../../types/canvas'

export const ImageGroupNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as ImageGroupNodeData
  const { theme, openAnnotationModal, stashNode, deleteNode, updateNodeData } = useCanvasStore()
  const [currentIndex, setCurrentIndex] = useState(nodeData.activeImageIndex || 0)

  const accentColor = '#F43F5E'
  const images = nodeData.images || []
  const activeImage = images[currentIndex]

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleAddImage = () => {
    const newImg = {
      id: `img-${Date.now()}`,
      url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80',
      name: `captura-${images.length + 1}.png`,
    }
    const updated = [...images, newImg]
    updateNodeData(id, { images: updated })
    setCurrentIndex(updated.length - 1)
  }

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 ${
        selected ? 'ring-2 ring-rose-500' : ''
      } ${
        theme === 'dark'
          ? 'bg-[#0D1117] border-[#30363D] text-[#F0F6FC] shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
          : 'bg-white border-slate-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.12),0_2px_6px_-1px_rgba(15,23,42,0.08)]'
      }`}
      style={{
        width: 360,
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
      <div className="relative w-full h-56 bg-slate-950 flex items-center justify-center overflow-hidden">
        {activeImage ? (
          <img
            src={activeImage.url}
            alt={activeImage.name}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-500 text-xs">
            <ImageIcon className="w-8 h-8 opacity-40" />
            <span>Nenhuma imagem no grupo</span>
          </div>
        )}

        {/* Carousel Navigation Buttons */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="absolute left-2 p-1.5 rounded-full bg-slate-900/80 text-white disabled:opacity-20 hover:bg-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex === images.length - 1}
              className="absolute right-2 p-1.5 rounded-full bg-slate-900/80 text-white disabled:opacity-20 hover:bg-slate-900 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 inset-x-0 flex justify-center">
              <span className="bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-white">
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
