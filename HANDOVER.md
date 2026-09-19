# Handover Técnico: Nós de Agente Interativos & Orquestração Multi-Nó (CGLI)

Este documento descreve detalhadamente o **estado atual do trabalho**, a **arquitetura implementada**, o **diagnóstico das causas-raiz encontradas** e o **guia passo a passo para o próximo agente** concluir a funcionalidade com sucesso.

---

## 1. Visão Geral e Expectativa do Usuário

O objetivo central do usuário para o **CGLI** é:
- No VS Code, a extensão/CLI do **Claude Code** permite abrir terminais interativos em que o usuário conversa diretamente com o Claude no contexto do projeto aberto.
- No CGLI, os nós de agentes (**Claude Code**, **Antigravity - AGY**, ou qualquer outro CLI configurado) devem funcionar exatamente dessa forma: **terminais PTY interativos reais** dentro do card do nó no canvas, em vez de chats mockados ou caixas estáticas de "thinking".
- Além da sessão interativa direta via xterm.js, o agente deve ter **consciência ambiental do CGLI**:
  1. Saber em qual pasta do projeto o nó foi instanciado (`CGLI_WORKSPACE_PATH`).
  2. Conseguir invocar outros nós dinamicamente no canvas conectando-os por arestas:
     - Novos subagentes (Claude ou AGY): `cgli spawn-subagent`
     - Nós de Artefato (Markdown/Planos): `cgli create-artifact`
     - Nós de Preview Web (HTML/JS com sandbox): `cgli create-preview`
     - Nós de Diff de Código (Git diff): `cgli create-diff`
- O ambiente alvo definitivo é a **aplicação desktop nativa Tauri 2** no Windows.

---

## 2. O Que Já Foi Implementado (Estado Atual)

### 2.1 Backend Tauri 2 (Rust)
- **Sessões Nativas ConPTY (`portable-pty`):**
  - Arquivos: [`src-tauri/src/pty/mod.rs`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src-tauri/src/pty/mod.rs) e [`src-tauri/src/pty/session.rs`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src-tauri/src/pty/session.rs).
  - Gerenciamento completo de spawn, escrita no stdin, resize de cols/rows, kill e streaming assíncrono de stdout/stderr via eventos Tauri (`pty-output-<id>`, `pty-exit-<id>`).
  - Injeção automática das variáveis de ambiente: `CGLI_WORKSPACE_PATH`, `CGLI_NODE_ID`, `CGLI_AGENT_ROLE`, `CGLI_AGENT_TYPE`, `CGLI_BRIDGE_PORT`.
  - Inclusão do diretório `.cgli/bin` no `PATH` do processo filho.
- **Servidor Local de Ponte HTTP / Bridge CGLI:**
  - Arquivo: [`src-tauri/src/bridge/mod.rs`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src-tauri/src/bridge/mod.rs).
  - Roda em `127.0.0.1:<porta_dinamica>` gerenciada via `AtomicU16`.
  - Endpoints implementados e testados com sucesso via HTTP POST:
    - `/api/spawn-subagent`: `{ parent_node_id, child_type, role, task }`
    - `/api/create-artifact`: `{ parent_node_id, title, content }`
    - `/api/create-preview`: `{ parent_node_id, title, html }`
    - `/api/create-diff`: `{ parent_node_id, title, file_path, diff_content }`
    - `/api/workspace-info`: Retorna pastas e metadados do projeto.
    - `/api/status`: Retorna `{ running: true, port: ... }`.
  - Emite eventos Tauri `cgli-bridge-action` diretamente para a UI React.
- **Geração Automática do Helper CLI (`cgli`):**
  - Em `ensure_cgli_environment()`, gera dinamicamente:
    - `.cgli/bin/cgli.cmd` (para Windows CMD/PowerShell)
    - `.cgli/bin/cgli` (script shell)
    - `.cgli/CGLI_GUIDE.md`, `CLAUDE.md` e `AGY.md` na raiz do workspace com instruções para a IA sobre como usar a ferramenta `cgli`.

### 2.2 Frontend (React + Zustand + React Flow)
- **Serviço de PTY e Bridge:**
  - Arquivo: [`src/services/ptyService.ts`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/services/ptyService.ts).
  - Abstração centralizada para IPC Tauri (`spawnPty`, `writePty`, `resizePty`, `killPty`, `onPtyOutput`, `onPtyExit`, `onBridgeAction`).
- **Nó de Agente Interativo (`AgentCardNode.tsx`):**
  - Arquivo: [`src/components/nodes/AgentCardNode.tsx`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/components/nodes/AgentCardNode.tsx).
  - Integração com `@xterm/xterm` + `@xterm/addon-fit`.
  - `NodeResizer` integrado para redimensionamento livre do terminal.
  - Conexão bidirecional: digitação no terminal envia stdin diretamente; saída do PTY renderiza em tempo real com cores ANSI.
  - Barra de atalhos rápidos (`/plan`, `/test`, `/review`, `/commit`, `/clear`, `/help`).
  - Barra inferior de envio rápido de comandos com suporte a colar screenshots (`Ctrl+V`).
  - Botões de cabeçalho: Interrupção (`Ctrl+C`), Reiniciar Sessão (`RotateCw`), Visualizar Diffs (`GitCompare`), Guardar no Stash (`Archive`), Excluir (`Trash2`).
  - Handles completos para conexões do React Flow: `top`, `bottom`, `left-source`, `left-target`, `right-source`, `right-target`.
- **Nós Satélites (Artefato, Preview, Diff):**
  - [`src/components/nodes/ArtifactNode.tsx`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/components/nodes/ArtifactNode.tsx): Exibidor Markdown com botão `[Aprovar e Executar]` que devolve confirmação via `writePty` ao agente.
  - [`src/components/nodes/PreviewNode.tsx`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/components/nodes/PreviewNode.tsx): Iframe seguro para renderização de HTML/CSS/JS.
  - [`src/components/nodes/DiffNode.tsx`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/components/nodes/DiffNode.tsx): Visualizador de adições/remoções Git com trava ao nó pai.
- **Store Zustand (`canvasStore.ts`):**
  - Tratamento de eventos de criação de subagentes (`spawnSubagentFromAction`), artefatos, previews e diffs.
  - Limpeza de sessões PTY (`killPty`) ao deletar nós.

---

## 3. Diagnóstico dos Problemas Encontrados na Sessão (Causas-Raiz)

Ao testar a aplicação na janela Tauri nativa, os terminais apareceram pretos ou quebrados por conta de **duas falhas críticas identificadas**:

### 3.1 Falha na Resolução do Binário do Claude Code no Windows
- Em [`src-tauri/src/pty/session.rs`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src-tauri/src/pty/session.rs) (linhas 39-48):
  ```rust
  let claude_exe = Path::new(&appdata).join("npm").join("node_modules").join("@anthropic-ai").join("claude-code").join("bin").join("claude.exe");
  if ... claude_exe.is_file() {
      return claude_exe.to_string_lossy().to_string();
  }
  ```
- **O Problema:** Executar diretamente esse arquivo `claude.exe` no Windows falha imediatamente com o erro:
  `Falha ao inicializar o thread. (código de saída 1)`.
- **A Solução:** O ponto de entrada oficial instalado pelo npm é o `claude.cmd` localizado em `%APPDATA%\npm\claude.cmd`. Esse script `.cmd` executa corretamente através do `cmd.exe /c claude.cmd` (testado e funcionando versão 2.1.260).
  Portanto, em `resolve_command`, **deve-se priorizar `claude.cmd` antes de qualquer `.exe`**!

### 3.2 Loop Infinito de Re-Spawns e Esgotamento do Desktop Heap no Windows
- **O Problema:** Em `AgentCardNode.tsx`, no `useEffect`, quando um processo PTY finalizava ou falhava (por exemplo pelo erro do binário acima), o listener `onPtyExit` chamava:
  ```tsx
  updateNodeData(id, { isPtyActive: false, status: 'idle' })
  ```
  Isso atualizava o store do Zustand, gerando uma cascata de re-renderizações no nó. Se o nó não tiver uma trava explícita (como uma `useRef` tipo `hasSpawnedRef` ou `isSpawningRef`), o `useEffect` tentava rodar novamente o `spawnPty`.
- **Consequência no Windows:** Foram instanciados dezenas de processos `agy` e `cmd` em background, esgotando o limite de recursos do Windows (`Desktop Heap exhaustion`), resultando nos seguintes erros do sistema:
  - `Failed to load ncrypt.dll: Insufficient system resources exist to complete the requested service.`
  - `0xC0000142 (STATUS_DLL_INIT_FAILED)` em novos processos.
  - `ERR_INSUFFICIENT_RESOURCES` na tela do WebView.
- **A Solução:** O ciclo de vida do terminal deve ser blindado contra re-execuções. O spawn só deve ocorrer **uma única vez** na montagem do nó (usando `spawnedSessionRef.current = sessionId`), e nunca reiniciar automaticamente em caso de exit a menos que o usuário clique explicitamente no botão de Reiniciar (`handleRestartSession`).

---

## 4. Guia Passo a Passo para o Próximo Agente Finalizar

### Passo 1: Ajustar a Resolução de Binários em `src-tauri/src/pty/session.rs`
Inverter a ordem de prioridade no Windows para o Claude Code:
1. Primeiro verificar se existe `%APPDATA%\npm\claude.cmd`. Se existir, retornar o caminho do `.cmd`.
2. O tratamento existente no `spawn()` já encapsula arquivos `.cmd` com `cmd.exe /c <caminho>`, o que garante que o Node/npm execute perfeitamente sem falha de threads.

### Passo 2: Blindar o Ciclo de Vida do PTY em `AgentCardNode.tsx`
1. Criar uma referência de controle:
   ```tsx
   const spawnedRef = useRef<boolean>(false)
   ```
2. No `useEffect`, só chamar `ptyService.spawnPty(...)` se `!spawnedRef.current`. Marcar `spawnedRef.current = true`.
3. No cleanup do `useEffect` (desmontagem), chamar `ptyService.killPty(sessionId)`.
4. No botão de reiniciar (`handleRestartSession`), resetar a flag ou chamar explicitamente o spawn após o kill.

### Passo 3: Garantir Argumentos Limpos para o Claude e AGY
- Verificar em `src/store/canvasStore.ts`:
  - Claude Code: Não passar flags que fechem o processo imediatamente. Claude Code pode iniciar sem argumentos adicionais (iniciando a sessão interativa normal) ou com `--dangerously-skip-permissions` se o usuário desejar aprovação automática.
  - AGY: `agy.exe` em `%LOCALAPPDATA%\agy\bin\agy.exe` aceita `--dangerously-skip-permissions`. Certificar-se de que flags inválidas antigas como `--stream` ou `--auto-approve` não sejam passadas.

### Passo 4: Limpar o LocalStorage do Navegador / Webview
- Como o CGLI salva nós antigos no `localStorage`, nós de sessões anteriores podem estar com dados corrompidos.
- Adicionar uma sanitização ou limpar o cache na inicialização para testar com um nó novo em folha.

### Passo 5: Validar a Execução no Tauri Desktop
Executar:
```powershell
npx tauri dev
```
Testar:
1. Clicar em "Novo Nó" -> "Claude Code".
2. O terminal xterm dentro do nó deve abrir com o prompt interativo do Claude Code.
3. Testar a digitação direta no terminal.
4. Testar o comando do helper no terminal:
   ```bash
   cgli create-artifact --title "Plano" --content "# Teste de Artefato"
   ```
5. Confirmar que o nó de Artefato surge conectado ao Claude Code no canvas.

---

## 5. Resumo dos Arquivos Chave

| Arquivo | Finalidade |
|---|---|
| [`src-tauri/src/pty/session.rs`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src-tauri/src/pty/session.rs) | Gerenciador PTY nativo (portable-pty), resolução de binários e streaming de E/S. |
| [`src-tauri/src/bridge/mod.rs`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src-tauri/src/bridge/mod.rs) | Servidor HTTP local (Bridge) e gerador de `.cgli/bin/cgli.cmd`. |
| [`src/components/nodes/AgentCardNode.tsx`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/components/nodes/AgentCardNode.tsx) | Componente do Nó de Agente com terminal xterm.js integrado. |
| [`src/store/canvasStore.ts`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/store/canvasStore.ts) | Store do canvas com manipulação de nós, subagentes e conexões. |
| [`src/services/ptyService.ts`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/src/services/ptyService.ts) | Comunicação IPC com o backend Tauri. |
| [`.cgli/bin/cgli.cmd`](file:///c:/Users/aluno/Documents/antigravity/blissful-franklin/.cgli/bin/cgli.cmd) | Script CLI que o Claude/AGY executa no terminal para comandar o canvas. |
