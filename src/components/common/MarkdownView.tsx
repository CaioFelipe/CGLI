import React, { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  Info,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  Square,
} from 'lucide-react'

interface MarkdownViewProps {
  source: string
  className?: string
}

// Format badges like [MODIFY], [NEW], [DELETE] inline in text
function formatBadges(text: string): React.ReactNode {
  const parts = text.split(/(\[(?:MODIFY|NEW|DELETE)\])/g)
  if (parts.length === 1) return text

  return parts.map((part, idx) => {
    if (part === '[MODIFY]') {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30"
        >
          MODIFY
        </span>
      )
    }
    if (part === '[NEW]') {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        >
          NEW
        </span>
      )
    }
    if (part === '[DELETE]') {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30"
        >
          DELETE
        </span>
      )
    }
    return part
  })
}

// Code block with language pill and copy button
function CodeBlock({
  language,
  value,
}: {
  language?: string
  value: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-3 rounded-lg border border-slate-700/80 bg-[#0B0F17] overflow-hidden shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161B22]/80 border-b border-slate-800 text-[11px] font-mono text-slate-400">
        <span className="font-semibold text-slate-300 uppercase text-[10px] tracking-wider">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] hover:bg-slate-700/50 text-slate-300 hover:text-white transition-colors"
          title="Copiar código"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium text-[10px]">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-400" />
              <span className="text-[10px]">Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed">
        <code>{value}</code>
      </pre>
    </div>
  )
}

// GitHub Alerts: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
function GitHubAlert({
  type,
  children,
}: {
  type: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'
  children: React.ReactNode
}) {
  const configs = {
    NOTE: {
      border: 'border-sky-500/80 bg-sky-950/25 text-sky-200',
      titleColor: 'text-sky-400',
      icon: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
      label: 'Nota',
    },
    TIP: {
      border: 'border-emerald-500/80 bg-emerald-950/25 text-emerald-200',
      titleColor: 'text-emerald-400',
      icon: <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0" />,
      label: 'Dica',
    },
    IMPORTANT: {
      border: 'border-indigo-500/80 bg-indigo-950/30 text-indigo-200',
      titleColor: 'text-indigo-400',
      icon: <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />,
      label: 'Importante',
    },
    WARNING: {
      border: 'border-amber-500/80 bg-amber-950/30 text-amber-200',
      titleColor: 'text-amber-400',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
      label: 'Aviso',
    },
    CAUTION: {
      border: 'border-rose-500/80 bg-rose-950/30 text-rose-200',
      titleColor: 'text-rose-400',
      icon: <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />,
      label: 'Atenção',
    },
  }

  const cfg = configs[type] || configs.NOTE

  return (
    <div className={`my-3 p-3 rounded-r-lg border-l-4 text-xs ${cfg.border} shadow-sm`}>
      <div className={`flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] mb-1.5 ${cfg.titleColor}`}>
        {cfg.icon}
        <span>{cfg.label}</span>
      </div>
      <div className="space-y-1 leading-relaxed opacity-95 text-[12px]">{children}</div>
    </div>
  )
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ source, className = '' }) => {
  return (
    <div className={`markdown-body text-slate-200 font-sans text-xs space-y-2.5 leading-relaxed ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-slate-100 pb-1.5 mb-2.5 border-b border-slate-700/60 flex items-center gap-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-slate-100 mt-4 mb-2 pb-1 border-b border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-3.5 rounded-full bg-indigo-500 inline-block" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-bold text-slate-200 mt-3 mb-1.5 flex items-center gap-1.5">
              <span className="text-indigo-400 font-mono">›</span>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[11px] font-semibold text-slate-300 mt-2 mb-1">
              {children}
            </h4>
          ),

          // Paragraphs with badge detection
          p: ({ children }) => {
            if (typeof children === 'string') {
              return <p className="my-1.5 leading-relaxed">{formatBadges(children)}</p>
            }
            if (Array.isArray(children)) {
              return (
                <p className="my-1.5 leading-relaxed">
                  {children.map((child, i) =>
                    typeof child === 'string' ? (
                      <React.Fragment key={i}>{formatBadges(child)}</React.Fragment>
                    ) : (
                      child
                    )
                  )}
                </p>
              )
            }
            return <p className="my-1.5 leading-relaxed">{children}</p>
          },

          // Blockquotes with GitHub Alert detection
          blockquote: ({ children }) => {
            // Check if first child is an alert tag
            const textContent = React.Children.toArray(children)
              .map((c: any) => c?.props?.children || '')
              .join(' ')

            const match = textContent.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)
            if (match) {
              const alertType = match[1].toUpperCase() as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'
              // Strip the tag from children if needed
              return (
                <GitHubAlert type={alertType}>
                  {React.Children.map(children, (child: any) => {
                    if (child?.props?.children) {
                      const childText = String(child.props.children)
                      if (childText.includes(`[!${alertType}]`)) {
                        const cleaned = childText.replace(new RegExp(`\\[!${alertType}\\]\\s*`, 'i'), '')
                        return cleaned ? <p>{cleaned}</p> : null
                      }
                    }
                    return child
                  })}
                </GitHubAlert>
              )
            }

            return (
              <blockquote className="my-2 pl-3 border-l-3 border-indigo-500/60 text-slate-300 italic bg-slate-900/40 py-1 rounded-r">
                {children}
              </blockquote>
            )
          },

          // Code blocks & inline code
          code: ({ node, className: codeClassName, children, ...props }) => {
            const match = /language-(\w+)/.exec(codeClassName || '')
            const isInline = !match && !String(children).includes('\n')

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-300 font-mono text-[11px] border border-slate-700/50"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            return (
              <CodeBlock
                language={match ? match[1] : undefined}
                value={String(children).replace(/\n$/, '')}
              />
            )
          },

          // Tables
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-slate-700/70 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#161B22] text-slate-200 border-b border-slate-700 uppercase font-mono text-[10px] tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-800 bg-[#0D1117]/80">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-800/40 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-semibold text-slate-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-300 text-xs">
              {children}
            </td>
          ),

          // Lists & Task lists
          ul: ({ children }) => (
            <ul className="my-2 space-y-1 list-none pl-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1 list-decimal list-inside pl-1 text-slate-300">
              {children}
            </ol>
          ),
          li: ({ children }) => {
            // Task list item detection
            return (
              <li className="flex items-start gap-2 my-0.5 text-slate-300 leading-relaxed">
                <span className="text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
                <span className="flex-1">{children}</span>
              </li>
            )
          },

          // Checkbox for GFM task list
          input: ({ type, checked, disabled }) => {
            if (type === 'checkbox') {
              return (
                <span className="inline-flex items-center mr-2 align-middle">
                  {checked ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400/20" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </span>
              )
            }
            return <input type={type} checked={checked} disabled={disabled} />
          },

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors font-medium"
            >
              <span>{children}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70" />
            </a>
          ),

          // Horizontal rule
          hr: () => <hr className="my-3 border-t border-slate-700/60" />,
        }}
      >
        {source}
      </Markdown>
    </div>
  )
}
