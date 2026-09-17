# CGLI (Canvas Agent Orchestrator)

Aplicação desktop nativa desenvolvida com **Tauri v2 + React 19 + TypeScript + Vite + Tailwind CSS**, inspirada na estética e ergonomia visual do **n8n**.

O **CGLI** oferece uma tela infinita (canvas) para supervisão, interação e orquestração de múltiplos agentes de inteligência artificial (com terminais e interfaces ricas para **Claude Code** e **AGY**, além de suporte a qualquer CLI customizado).

---

## 🚀 Principais Recursos

### 1. Canvas Infinito com Estética n8n (Opção 1: Studio Clean)
- **Navegação Fluida**: Pan & zoom suaves, minimap integrado, fit-view e controles interativos (`@xyflow/react`).
- **Modo Claro & Modo Escuro**: Alternador dinâmico de tema com paletas adaptadas (off-white `#F8FAFC` no claro / charcoal profundo `#0B0F17` no escuro).
- **Acentos Visuais Oficiais**:
  - **Claude Code**: Terracota / Âmbar Anthropic (`#EA580C`).
  - **AGY (Gemini)**: Azul Elétrico / Ciano (`#0284C7`).
  - **Nó de Imagem**: Rosa Choque (`#F43F5E`).
  - **Nó Visualizador de Artefatos**: Índigo Real (`#6366F1`).

### 2. Nós com Estética de Extensão do VS Code (Chat Rico & Terminais)
- **Mensagens Formatadas**: Renderização completa em Markdown, code blocks com sintaxe destacada e botão de cópia.
- **Raciocínio Colapsável (*Thinking Accordion*)**: Bloco para inspecionar o processo cognitivo do modelo sem poluir o canvas.
- **Aprovação Visual de Ações**: Cards interativos de diff colorido (verde/vermelho) com botões `[✓ Aprovar]` e `[✕ Rejeitar]`.
- **Modo Híbrido (Dual-View)**: Botão no cabeçalho para alternar instantaneamente entre a interface rica de extensão e o terminal nativo xterm.js (`@xterm/xterm`).
- **Paridade Total**: Claude Code e AGY compartilham rigorosamente os mesmos recursos visuais e ergonomia.

### 3. Nós de Imagem & Editor de Anotações Integrado
- **Colar Direto no Canvas (`Ctrl+V`)**: Ao pressionar `Ctrl+V` sobre a tela infinita, o CGLI mapeia a coordenada do mouse e cria um nó de imagem (`ImageNode`) imediatamente naquele ponto.
- **Editor de Anotações Vetoriais**: Modal completo para desenhar sobre a imagem:
  - ⭕ **Círculos e Elipses** para circular erros na tela.
  - ➡️ **Setas** para apontar elementos exatos da interface.
  - 🔲 **Retângulos** e ✏️ **Desenho Livre**.
  - 🔤 **Texto** e paleta de cores destacadas (Vermelho, Âmbar, Verde, Azul).
- **Grupos de Imagens**: Agrupador de múltiplos prints em um cluster visual de evidências.
- **Entrada Multimodal**: Fios conectados da imagem para o agente injetam o print anotado diretamente no prompt do LLM.

### 4. Nó Visualizador de Artefatos & Resultados (`ArtifactViewerNode`)
- Nós spawnados dinamicamente pelos agentes no canvas com 3 abas:
  1. **Documento / Plano**: Markdown rico com alertas GitHub (`[!IMPORTANT]`, `[!NOTE]`, `[!TIP]`), tabelas e checklists.
  2. **Preview Web Interativo**: Sandbox iframe seguro renderizando protótipos HTML/JS criados pela IA.
  3. **Diff de Código**: Visualização de alterações em arquivos locais.
- Botão integrado no nó para aprovar o plano e liberar a execução imediata para o nó AGY conectado.

### 5. Gaveta de Nós Guardados (Stash)
- Painel lateral retrátil à direita para arquivar nós ou grupos de nós, limpando o espaço de trabalho sem perder histórico de mensagens, variáveis ou estado de execução.
- Restauração com 1 clique diretamente de volta ao canvas.

### 6. Central de Configurações, Contas & Hub de Skills
- **Papéis Customizáveis**: Alterne quem é o planejador e quem é o executor.
- **Chaves de Ativação**: Ative ou desative CLIs caso você só possua Claude ou só possua AGY.
- **Cadastro de Novos CLIs**: Registre ferramentas externas (Aider, Goose, scripts locais).
- **Contas & Credenciais**: Conecte, desconecte e alterne logins.
- **Hub Compartilhado de Skills**: Repositório centralizado sincronizado para todos os agentes.

---

## 🛠️ Tecnologias Utilizadas

- **Desktop Core**: [Tauri v2](https://tauri.app/) (Rust) com ConPTY nativo via `portable-pty`.
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Tailwind CSS v4](https://tailwindcss.com/).
- **Canvas Engine**: [@xyflow/react](https://reactflow.dev/) (React Flow).
- **Terminal Emulator**: [@xterm/xterm](https://xtermjs.org/) + FitAddon.
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/).
- **Ícones**: [Lucide React](https://lucide.dev/).

---

## 💻 Como Rodar o Projeto Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 20+)
- [Rust & Cargo](https://rustup.rs/)

### Passos

1. **Instalar dependências**:
   ```bash
   npm install
   ```

2. **Rodar em modo web/desenvolvimento rápido**:
   ```bash
   npm run dev
   ```

3. **Compilar e rodar a aplicação desktop nativa (Tauri)**:
   ```bash
   npx @tauri-apps/cli dev
   ```

4. **Gerar build de produção**:
   ```bash
   npm run build
   npx @tauri-apps/cli build
   ```
