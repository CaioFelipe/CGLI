// Helpers to anchor comments to a selected passage of rendered text.
// An anchor is (quote, start, end) where start/end are character offsets into the root element's
// textContent. Highlights use the CSS Custom Highlight API, which paints ranges without touching the
// DOM that React owns.

export interface TextAnchor {
  quote: string
  start: number
  end: number
}

export type HighlightLayer = 'comment' | 'active' | 'pending'

const MAX_QUOTE_LENGTH = 600

const HIGHLIGHT_NAMES: Record<HighlightLayer, string> = {
  comment: 'artifact-comment',
  active: 'artifact-comment-active',
  pending: 'artifact-comment-pending',
}

const HIGHLIGHT_PRIORITY: Record<HighlightLayer, number> = { comment: 0, pending: 1, active: 2 }

// CSS.highlights is global, so ranges of every artifact node are merged per layer.
const registry: Record<HighlightLayer, Map<string, Range[]>> = {
  comment: new Map(),
  active: new Map(),
  pending: new Map(),
}

const supportsHighlights = (): boolean =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof (globalThis as any).Highlight === 'function'

const syncLayer = (layer: HighlightLayer) => {
  const highlights = (CSS as any).highlights
  const name = HIGHLIGHT_NAMES[layer]
  const ranges = [...registry[layer].values()].flat()
  if (ranges.length === 0) {
    highlights.delete(name)
    return
  }
  const highlight = new (globalThis as any).Highlight(...ranges)
  highlight.priority = HIGHLIGHT_PRIORITY[layer]
  highlights.set(name, highlight)
}

export const setHighlights = (ownerId: string, layer: HighlightLayer, ranges: Range[]) => {
  if (!supportsHighlights()) return
  if (ranges.length > 0) registry[layer].set(ownerId, ranges)
  else registry[layer].delete(ownerId)
  syncLayer(layer)
}

export const clearHighlights = (ownerId: string) => {
  if (!supportsHighlights()) return
  for (const layer of Object.keys(registry) as HighlightLayer[]) {
    if (registry[layer].delete(ownerId)) syncLayer(layer)
  }
}

/** Builds a Range covering [start, end) of the concatenated text nodes under `root`. */
export const rangeFromOffsets = (root: Node, start: number, end: number): Range | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let pos = 0
  let startSet = false
  let node = walker.nextNode()
  while (node) {
    const length = node.nodeValue?.length ?? 0
    if (!startSet && start < pos + length) {
      range.setStart(node, start - pos)
      startSet = true
    }
    if (startSet && end <= pos + length) {
      range.setEnd(node, end - pos)
      return range
    }
    pos += length
    node = walker.nextNode()
  }
  return null
}

/** Finds the anchor's range: exact offsets first, then the first occurrence of the quote. */
export const resolveAnchorRange = (root: HTMLElement, anchor: TextAnchor): Range | null => {
  const full = root.textContent ?? ''
  if (!anchor.quote) return null
  let start = anchor.start
  if (start < 0 || full.slice(start, start + anchor.quote.length) !== anchor.quote) {
    start = full.indexOf(anchor.quote)
    if (start < 0) return null
  }
  return rangeFromOffsets(root, start, start + anchor.quote.length)
}

/** Reads the current selection as an anchor, or null if it is empty or outside `root`. */
export const getSelectionAnchor = (root: HTMLElement): TextAnchor | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null

  const before = document.createRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)

  const raw = range.toString()
  const leading = raw.length - raw.trimStart().length
  const quote = raw.trim().slice(0, MAX_QUOTE_LENGTH)
  if (!quote) return null

  const start = before.toString().length + leading
  return { quote, start, end: start + quote.length }
}

export const caretAtPoint = (x: number, y: number): { node: Node; offset: number } | null => {
  const doc = document as any
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y)
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  return null
}

/**
 * Scrolls `container` (not its ancestors: scrollIntoView could move the canvas viewport) so that
 * `target` is centered. Rects are divided by the canvas zoom, which scales both but not scrollTop.
 */
export const scrollWithin = (container: HTMLElement, target: Range | Element) => {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const scale = container.offsetHeight ? containerRect.height / container.offsetHeight : 1
  const delta =
    (targetRect.top - containerRect.top) / scale - container.clientHeight / 2 + targetRect.height / scale / 2
  container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
}
