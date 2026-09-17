import {
  Archive,
  Clock,
  FileCode,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import React from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { StashItem } from '../../types/canvas'

export const StashDrawer: React.FC = () => {
  const {
    isStashOpen,
    setStashOpen,
    stashItems,
    restoreFromStash,
    removeStashItem,
    theme,
  } = useCanvasStore()

  if (!isStashOpen) return null

  const getTypeIcon = (type: StashItem['type']) => {
    switch (type) {
      case 'agent':
        return <Terminal className="w-3.5 h-3.5 text-amber-500" />
      case 'artifact':
        return <FileCode className="w-3.5 h-3.5 text-indigo-500" />
      case 'image':
      case 'imageGroup':
        return <ImageIcon className="w-3.5 h-3.5 text-rose-500" />
      default:
        return <Sparkles className="w-3.5 h-3.5 text-slate-400" />
    }
  }

  const getTypeBadge = (type: StashItem['type']) => {
    switch (type) {
      case 'agent':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
      case 'artifact':
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
      case 'image':
      case 'imageGroup':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={() => setStashOpen(false)}
      />

      {/* Drawer Container */}
      <div
        className={`relative w-96 max-w-full h-full shadow-2xl flex flex-col border-l z-50 animate-in slide-in-from-right duration-200 ${
          theme === 'dark'
            ? 'bg-[#0F172A] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold tracking-tight">Stash do Canvas</h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {stashItems.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setStashOpen(false)}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {stashItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Archive className="w-12 h-12 mb-3 opacity-30 stroke-[1.5]" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nenhum nó guardado no Stash
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">
                Clique no ícone de arquivo em qualquer nó para guardá-lo temporariamente fora do canvas.
              </p>
            </div>
          ) : (
            stashItems.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all duration-150 shadow-xs hover:shadow-md ${
                  theme === 'dark'
                    ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-50/90 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <span className="font-semibold text-xs truncate max-w-[170px]">
                      {item.name}
                    </span>
                  </div>

                  <span
                    className={`text-[9px] uppercase px-1.5 py-0.5 rounded border font-semibold tracking-wider ${getTypeBadge(
                      item.type
                    )}`}
                  >
                    {item.type}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                  {item.previewSnippet}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{item.savedAt}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => removeStashItem(item.id)}
                      title="Excluir do Stash"
                      className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreFromStash(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restaurar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
