# Plano de Arquitetura: Site de Demonstração Interativo CGLI (Anti-AI-Slop Showcase)

## 1. Visão Geral e Propósito
Criar uma aplicação web de apresentação e demonstração interativa para o **CGLI (Canvas Agent Orchestrator 100% Rust)**.
O objetivo é proporcionar uma experiência de alta fidelidade técnica e estética (*Studio Clean* / Linear / Raycast / Liveblocks), eliminando clichês de "AI Slop" (sem ilustrações genéricas de robôs, sem jargões corporativos vazios, sem gradientes roxos borrados) e focando na **engenharia real do sistema**.

---

## 2. Pilares de Design e Conteúdo (Zero AI-Slop)

1. **Simulador de Canvas Dinâmico (Efeito UAU):**
   - Mini-canvas interativo no Hero com nós arrastáveis, conexões em curva de Bézier cúbica reativas via SVG.
   - Botão **"Simulação Guiada do Fluxo"**: passo-a-passo animado em 5 etapas mostrando o ciclo de vida completo:
     1. Prompt do usuário ao Claude Code (Planner).
     2. Geração e publicação de artefato Markdown no canvas (`cgli create-artifact`).
     3. Anotação humana ancorada em trecho de texto (`TextAnchor`) e aprovação.
     4. Transmissão do contexto aprovado para o Antigravity (AGY Executor).
     5. AGY consultando o Vault Obsidian (`ADR-001`), gerando o nó de Diff e executando no terminal VT100.
2. **Explorador Interativo do Dual-Vault Obsidian (`cgli-vault`):**
   - Demonstração do funcionamento dos 2 níveis de memória (Local `.cgli/vault/` e Global `~/.cgli/vault/`).
   - Busca BM25 em tempo real com filtros por tipo (`decision`, `spec`, `learning`, `journal`).
   - Visualizador de frontmatter YAML, ULID Crockford Base32 monotônico e ETag SHA-256 para controle de concorrência otimista.
3. **Emulador ANSI/VT100 Nativo (`cgli-pty-vt`):**
   - Terminal interativo executável no browser demonstrando parser SGR TrueColor 24-bit e ANSI 256 cores sem dependência de xterm.js.
4. **Visualizador Arquitetural dos 6 Crates Rust:**
   - Mapa interativo dos crates (`cgli-core`, `cgli-pty-vt`, `cgli-vault`, `cgli-cli`, `cgli-desktop`, `cgli-ui`).
   - Tabela comparativa de métricas reais (Rust Leptos vs. Node.js/Electron).
5. **CLI Cheat-Sheet Interativo:**
   - Referência rápida de todos os comandos do `cgli` com botão de cópia instantânea e saída simulada.
6. **Alternador de Tema em Tempo Real:**
   - Transição instantânea entre **Modo Escuro (`#06090E`)** e **Modo Claro (`#EEF2F6`)**.

---

## 3. Estrutura de Arquivos

- **No Repositório:** `site/index.html` (servido estaticamente e integrado a rotas do `cgli-desktop`)
- **Como Artefato Brain:** `<appDataDir>/brain/<conversation-id>/cgli_showcase.html` para visualização direta no ambiente do usuário.
- **Rota no Desktop Server:** `/demo` ou `/showcase` em `crates/cgli-desktop/src/bridge.rs`.
