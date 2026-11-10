# CGLI (Canvas Agent Orchestrator — 100% Rust Edition)

Aplicação desktop nativa desenvolvida **100% em Rust** com **Tauri v2 + Leptos (CSR/WASM) + Axum + portable-pty + Tailwind CSS**, inspirada na estética e ergonomia visual do **n8n** (*Studio Clean*) e extensões do **VS Code**.

O **CGLI** oferece uma tela infinita (canvas) para supervisão, interação e orquestração de múltiplos agentes de inteligência artificial (com terminais ConPTY/PTY nativos e interfaces ricas para **Claude Code** e **Antigravity / AGY**, além de suporte a qualquer CLI customizado).

---

## 🦀 Arquitetura do Cargo Workspace (100% Rust)

```text
CGLI/
├── Cargo.toml                  # Workspace Cargo unificado
├── Trunk.toml                  # Configuração de empacotamento WASM (Leptos CSR)
├── index.html                  # Entrypoint WebAssembly
├── styles/
│   └── index.css               # Design System Studio Clean (Claro & Escuro)
├── crates/
│   ├── cgli-core/              # Modelos de domínio, grafo, parser de diff e DTOs Serde
│   ├── cgli-vault/             # Motor nativo de Memória Obsidian (ULID, SHA-256 ETag/Rev, Sanitizador, BM25, Doctor, MOC)
│   ├── cgli-cli/               # Binário nativo `cgli` (substitui cgli.cjs — zero Node.js)
│   ├── cgli-pty-vt/            # Emulador e parser de terminal ANSI/VT100 + extrator de stream markers
│   ├── cgli-desktop/           # Servidor Axum HTTP/SSE Bridge (:41732), Fila FIFO Single-Writer e SessionManager PTY
│   └── cgli-ui/                # Frontend reativo em Rust (Leptos CSR/WASM) com Canvas Infinito, 9 Nós e 5 Modais
└── src-tauri/                  # Host Desktop Tauri v2 integrado aos crates do workspace
```

---

## 🚀 Principais Recursos

### 1. Canvas Infinito com Estética n8n (Studio Clean)
- **Navegação Fluida**: Pan & zoom centrados no cursor, minimap em tempo real, fit-view e controles interativos em Rust/WASM (`crates/cgli-ui/src/canvas.rs`).
- **Modo Claro & Modo Escuro**: Alternador dinâmico de tema com paletas adaptadas (`#EEF2F6` no claro / `#06090E` no escuro).
- **Acentos Visuais Oficiais**:
  - **Claude Code**: Terracota / Âmbar Anthropic (`#EA580C`).
  - **AGY (Gemini)**: Azul Elétrico / Ciano (`#0284C7`).
  - **Nó de Imagem**: Rosa Choque (`#F43F5E`).
  - **Nó Visualizador de Artefatos**: Índigo Real (`#6366F1`).

### 2. Nós com Estética de Extensão do VS Code (Chat Rico & Terminais VT100)
- **Mensagens Formatadas**: Renderização completa em Markdown GFM (`pulldown-cmark`), alertas GitHub (`[!IMPORTANT]`, `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]`) e blocos de código com botão de cópia.
- **Raciocínio Colapsável (*Thinking Accordion*)**: Bloco para inspecionar o processo cognitivo do modelo sem poluir o canvas.
- **Aprovação Visual de Ações**: Cards interativos de comando/diff colorido com botões `[✓ Aprovar]` e `[✕ Rejeitar]`.
- **Modo Híbrido (Dual-View)**: Alternância instantânea entre a interface rica de extensão e o emulador de terminal ANSI/VT100 (`cgli-pty-vt`).

### 3. Nós de Imagem & Editor de Anotações Vetoriais
- **Colar Direto no Canvas (`Ctrl+V`)**: Mapeia a coordenada do mouse e cria um `ImageNode` imediatamente naquele ponto.
- **Editor de Anotações Vetoriais (`ImageAnnotationModal`)**: Modal SVG `800x480` para desenhar círculos, setas, retângulos, pincel livre e textos sobre prints.
- **Grupos de Imagens (`ImageGroupNode`)**: Agrupador de múltiplos prints em um cluster visual de evidências.

### 4. Nó Visualizador de Artefatos (`ArtifactNode`) com Comentários Ancorados
- Renderização de planos Markdown com **3 abas** (*Documento*, *Comentários* e *Dividido Lado a Lado*).
- **Comentários por Trecho**: Seleção direta no texto via `web-sys` + **CSS Custom Highlight API** (`::highlight(artifact-comment)`).
- Botão **"Aprovar e Executar"** que sincroniza e injeta o plano + todos os comentários diretamente no PTY do agente executor conectado.

### 5. Memória Compartilhada no Obsidian (`cgli-vault` + `MemoryNode` + `MemoryExplorerModal`)
- Cofre dual (**Local do Projeto** em `.cgli/vault/` e **Global do Usuário** em `~/.cgli/vault/`).
- **Fila FIFO Single-Writer (`writer.rs`)**, ULID monotônico Crockford Base32 de 26 caracteres, concorrência otimista (`rev` + `etag` SHA-256 + geração de `.conflict-*`) e sanitização automática de segredos.

---

## 💻 Como Compilar e Testar

### Pré-requisitos
- [Rust & Cargo](https://rustup.rs/) (1.77+)
- [Trunk](https://trunkrs.dev/) (`cargo install trunk`) e target WASM (`rustup target add wasm32-unknown-unknown`) para empacotamento web/Tauri.

### Comandos

1. **Executar toda a suíte de testes do Workspace Rust**:
   ```bash
   cargo test --workspace
   ```

2. **Compilar a CLI nativa (`cgli`) e o servidor Desktop Bridge (`cgli-desktop`)**:
   ```bash
   cargo build --release -p cgli-cli -p cgli-desktop
   ```

3. **Rodar o frontend Leptos/WASM em desenvolvimento**:
   ```bash
   trunk serve
   ```
