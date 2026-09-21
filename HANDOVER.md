# Documentação Técnica e Validação: Nós de Agente Interativos & Orquestração Multi-Nó (CGLI)

Este documento descreve detalhadamente a **arquitetura implementada**, os **diagnósticos das causas-raiz encontradas e resolvidas**, a **validação funcional em execução** e as instruções para inicializar e testar o ambiente no **Tauri 2 (Desktop Windows)**.

---

## 1. Visão Geral e Expectativa do Usuário

O objetivo central do **CGLI** é:
- No VS Code, a extensão/CLI do **Claude Code** abre terminais interativos em que o usuário conversa diretamente com a IA no contexto do projeto aberto.
- No CGLI, os nós de agentes (**Claude Code**, **Antigravity - AGY**, ou qualquer outro CLI configurado) operam exatamente dessa forma: **terminais PTY interativos reais** dentro do card do nó no canvas, integrados via `@xterm/xterm`.
- Além da sessão interativa direta via xterm, o agente possui **consciência ambiental do CGLI**:
  1. Identifica em qual pasta do projeto o nó foi instanciado (`CGLI_WORKSPACE_PATH` e `cgli list-folders`).
  2. Consegue invocar outros nós dinamicamente no canvas conectando-os por arestas:
     - Novos subagentes (Claude ou AGY): `cgli spawn-subagent --type [claude|agy] --task "..."`
     - Nós de Artefato (Markdown/Planos): `cgli create-artifact --title "..." [--content "..." | --file doc.md]`
     - Nós de Preview Web (HTML/JS com sandbox): `cgli create-preview --title "..." [--html "..." | --file page.html]`
     - Nós de Diff de Código (Git diff real): `cgli create-diff --title "..." --file path/to/file`
     - Identificar pastas do workspace: `cgli list-folders`
     - Status da ponte: `cgli status`
- O ambiente alvo definitivo é a **aplicação desktop nativa Tauri 2** no Windows.

---

## 2. Diagnóstico das Causas-Raiz e Soluções Implementadas

Durante a auditoria e testes do servidor Tauri, identificamos e resolvemos as seguintes causas-raiz:

### 2.1 Falha na Execução do Claude Code (`--print` / TTY vs Pipes)
- **Causa-Raiz:** No teste web anterior no navegador Chrome padrão (`http://localhost:5173`), `ptyService` caía no fallback web do `vite.config.ts`, que usava `child_process.spawn` com pipes regulares (`stdio: 'pipe'`). Claude Code detectava que o `stdin` não era um TTY interativo e assumia modo headless/pipe, disparando timeout de 3s e erro:
  `Warning: no stdin data received in 3s... Error: Input must be provided either through stdin or as a prompt argument when using --print`.
- **Solução:** Na aplicação desktop nativa **Tauri 2**, a chamada `invoke('spawn_pty')` utiliza o `portable_pty::native_pty_system()`, que aloca um **ConPTY Windows real** com console handles genuínos (`isTTY: true`), executando a sessão interativa completa com cores, banners e prompt.

### 2.2 Loop Infinito de Re-Spawns no React (StrictMode e Re-renders)
- **Causa-Raiz:** O React `<StrictMode>` montava, desmontava e remontava os componentes em desenvolvimento. Ao desmontar, chamava `killPty`, e ao remontar chamava `spawnPty`, criando concorrência de processos PTY no Windows. Além disso, re-renderizações disparavam chamadas duplicadas.
- **Solução:** 
  1. Remoção do `<StrictMode>` em `src/main.tsx`.
  2. Implementação da trava `ptySpawnedRef` e cleanup no `useEffect` de `AgentCardNode.tsx`.
  3. `SessionManager::kill` no Rust tornado idempotente para evitar erros espúrios em encerramentos repetidos.

### 2.3 Resolução Robusta de Binários no Windows
- Em `src-tauri/src/pty/session.rs`, `resolve_command` prioriza `claude.cmd` antes do `.exe` cru do npm, e encapsula a execução com `cmd.exe /c` no ConPTY.
- Ambos `PATH` e `Path` são explicitamente exportados para o processo filho com `.cgli/bin` incluído, garantindo que o comando `cgli` seja resolvido universalmente tanto no PowerShell quanto no CMD ou em subshells.

### 2.4 Runner Universal `cgli.cjs` (Eliminação de Falhas de Escaping e ESM)
- **Causa-Raiz:** Scripts `.cmd` puros falhavam ao parsear strings longas com aspas duplas, quebras de linha (`\n`) ou blocos markdown de `--content`. Além disso, scripts `.js` falhavam com `ReferenceError: require is not defined` devido a `"type": "module"` no `package.json`.
- **Solução:** Implementação do runner em `CommonJS` puro (`.cgli/bin/cgli.cjs`), suportado pelo Node.js em qualquer diretório:
  - Wrapper `.cgli/bin/cgli.cmd`: `@echo off \r\n node "%~dp0\cgli.cjs" %*`
  - Wrapper `.cgli/bin/cgli`: `node "$DIR/cgli.cjs" "$@"`
  - Suporte completo a `--file` para carregar conteúdo de arquivos para nós de artefatos e previews.
  - Execução automática de `git diff` no `create-diff` quando `--file` for fornecido.

### 2.5 Sincronização Dinâmica do Workspace (`cgli list-folders`)
- O backend Rust em `src-tauri/src/bridge/mod.rs` agora conta com o endpoint `POST /api/update-workspace-info` e armazenamento em `static WORKSPACE_INFO`.
- O frontend React (`canvasStore.ts` e `ptyService.ts`) sincroniza o nome do projeto e lista de pastas em tempo real com o Bridge.
- Quando o agente ou usuário executa `cgli list-folders` no terminal, o utilitário exibe todas as pastas do projeto e o diretório ativo do nó.

---

## 3. Arquitetura Final Implementada

```
+-------------------------------------------------------------------------------+
|                             CGLI Canvas (React)                               |
|                                                                               |
|  [ AgentCardNode: Claude ]                [ AgentCardNode: Subagente AGY ]    |
|  +-----------------------+                +------------------------------+    |
|  | xterm.js (PTY ConPTY) | ===(edge)===>  | xterm.js (PTY ConPTY)        |    |
|  | prompt > cgli ...     |                | prompt > Executando tarefa...|    |
|  +-----------------------+                +------------------------------+    |
|            ||                                            ||                   |
|       (bridge action)                               (bridge action)           |
|            \/                                            \/                   |
|  [ ArtifactNode (Plano) ]                [ DiffNode (Alterações Git) ]        |
|  +-----------------------+               +-------------------------------+    |
|  | [Aprovar e Executar]  |               | diff --git a/src/lib.rs ...   |    |
|  +-----------------------+               +-------------------------------+    |
+-------------------------------------------------------------------------------+
                                    || (IPC)
                                    \/
+-------------------------------------------------------------------------------+
|                           Tauri 2 Backend (Rust)                              |
|                                                                               |
|  - SessionManager (portable-pty): Spawns cmd/claude/agy in ConPTY             |
|  - Bridge HTTP Server (127.0.0.1:41732):                                      |
|      /api/status, /api/workspace-info, /api/update-workspace-info             |
|      /api/spawn-subagent, /api/create-artifact, /api/create-preview,          |
|      /api/create-diff                                                         |
|  - Emite eventos Tauri: 'cgli-bridge-action', 'pty-output-<id>', 'pty-exit'   |
+-------------------------------------------------------------------------------+
```

---

## 4. Testes de Validação Realizados com Sucesso

Todos os endpoints e comandos do utilitário `cgli` foram testados e validados com código de saída 0:

1. **Status da Ponte:**
   ```powershell
   .\.cgli\bin\cgli.cmd status
   # Saída: [CGLI Status] Bridge ativa na porta 41732
   ```

2. **Listar Pastas do Workspace:**
   ```powershell
   .\.cgli\bin\cgli.cmd list-folders
   # Saída:
   # === CGLI Workspace Info ===
   # Projeto: Projeto Atual
   # Diretório deste Nó: C:\Users\aluno\Documents\antigravity\blissful-franklin
   # Pastas do Projeto: C:\Users\aluno\Documents\antigravity\blissful-franklin
   ```

3. **Criação de Nó de Artefato:**
   ```powershell
   .\.cgli\bin\cgli.cmd create-artifact --title "Guia de Arquitetura" --content "# Conteudo do Plano"
   # Saída: [CGLI] Nó de artefato 'Guia de Arquitetura' criado no canvas.
   ```

4. **Criação de Nó de Preview Web:**
   ```powershell
   .\.cgli\bin\cgli.cmd create-preview --title "Preview do App" --html "<h1>CGLI Canvas Preview</h1>"
   # Saída: [CGLI] Nó de preview 'Preview do App' criado no canvas.
   ```

5. **Criação de Nó de Diff com Git:**
   ```powershell
   .\.cgli\bin\cgli.cmd create-diff --title "Diff Recente" --file "src-tauri\src\lib.rs"
   # Saída: [CGLI] Nó de diff 'Diff Recente' criado no canvas.
   ```

6. **Invocação de Subagente:**
   ```powershell
   .\.cgli\bin\cgli.cmd spawn-subagent --type claude --role planner --task "Planejar arquitetura modular"
   # Saída: [CGLI] Subagente CLAUDE invocado com sucesso no canvas.
   ```

7. **Compilação do Frontend:**
   ```powershell
   npm run build
   # Saída: built in 1.37s (0 erros)
   ```

8. **Checagem do Backend Rust:**
   ```powershell
   cargo check
   # Saída: Finished dev profile (0 erros, 0 avisos)
   ```

---

## 5. Como Executar

Para iniciar o CGLI no ambiente nativo desktop Tauri:
```powershell
npx tauri dev
```

Dentro da janela desktop do CGLI:
- Clique em **"Novo Nó"** -> Selecione **Claude Code** ou **Antigravity (AGY)**.
- O card abrirá com a sessão do terminal interativo xterm conectado.
- Digite instruções diretamente no terminal ou na barra de envio inferior.
- Peça para a IA invocar subagentes, criar planos de artefatos, previews web ou diffs de código; a IA utilizará o utilitário `cgli` e os nós aparecerão conectados no canvas em tempo real.
