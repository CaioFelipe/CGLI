# Plano de Implementação — Nó "Terminal PowerShell"

## 1. Objetivo

Adicionar ao canvas um novo tipo de nó, `terminalNode`, que abre um **PowerShell real** (PTY) dentro de um card, sem agente de IA por trás. O usuário digita comandos, vê a saída em tempo real e pode redimensionar, reiniciar e remover o nó como nos demais.

O preview do AGY (`.cgli/artifacts/powershell.html`) é um **mock**: os comandos são respondidos por um `if/else` em JavaScript dentro de um iframe sandbox. Ele serve como **referência visual** (fundo `#012456`, barra de abas, cursor piscando), mas não executa nada. O nó real precisa de um PTY.

## 2. Decisão de arquitetura

**Nó nativo com xterm.js + PTY**, reaproveitando a infraestrutura que já existe para os agentes. Não usar `previewNode` com iframe.

| Opção | Resultado | Decisão |
|---|---|---|
| `previewNode` com o HTML do mock | Só simula; sem shell real; sandbox `allow-scripts` não acessa o sistema | Descartada |
| Novo `terminalNode` com xterm + `ptyService` | Shell real, mesmo pipeline já validado no `AgentCardNode` | **Escolhida** |

O backend Rust **não precisa de mudança**: `resolve_command("")` já devolve `powershell.exe` no Windows (`src-tauri/src/pty/session.rs:99`), e `spawn_pty` já injeta `.cgli/bin` no `PATH`, `CGLI_WORKSPACE_PATH` e `CGLI_BRIDGE_PORT`. O comando `cgli` passa a funcionar dentro do terminal.

## 3. Modelo de dados

`src/types/canvas.ts`

```ts
export interface TerminalNodeData {
  title: string
  shell: 'powershell'          // extensível: 'cmd' | 'pwsh' | 'bash' no futuro
  sessionId: string            // `pty-${nodeId}`
  workspacePath?: string       // cwd inicial do shell
  isPtyActive?: boolean        // false após pty-exit
}
```

- Estender `StashItem['type']` com `'terminal'`.

## 4. Mudanças por arquivo

### 4.1 `src/components/nodes/TerminalNode.tsx` (novo)

Estrutura visual copiada do `PreviewNode` (header, `NodeResizer`, rodapé), com acento azul PowerShell (`#0078D4`) e ícone `SquareTerminal` do lucide-react.

Ciclo de vida do xterm, espelhando `AgentCardNode.tsx:287-427`:

1. `useEffect` montado uma vez por nó: cria `Terminal` + `FitAddon`, chama `term.open(container)`.
2. `attachCustomKeyEventHandler` com `e.stopPropagation()`, para `Delete` e setas não dispararem atalhos do React Flow.
3. `safeFit()` protegido contra container 0x0, chamado por `ResizeObserver` com `requestAnimationFrame`, e depois `ptyService.resizePty(...)`.
4. `term.onData` → `ptyService.writePty(sessionId, d)`.
5. **Ordem obrigatória:** `await ptyService.onPtyOutput(...)` **antes** de `ptyService.spawnPty(...)`, senão os primeiros frames se perdem (o `AgentCardNode` já corrigiu isso).
6. `ptyService.onPtyExit(...)` → `updateNodeData(id, { isPtyActive: false })` e mensagem "Processo encerrado" no terminal.
7. Cleanup: `disposed = true`, `ro.disconnect()`, `dataSub.dispose()`, `unlisten()`, `term.dispose()`. **Não** matar o PTY no unmount (mesmo comportamento do agente); quem mata é `deleteNode`.

Spawn:

```ts
ptyService.spawnPty(sessionId, 'powershell.exe', ['-NoLogo'], workspacePath)
```

Tema xterm `POWERSHELL_THEME`: `background #012456`, `foreground #EEEDF0`, `cursor #EEEDF0`, paleta ANSI do PowerShell clássico. O fundo permanece azul nos temas claro e escuro do app, como no Windows.

Botões no header:
- **Interromper** — envia `\x03` (Ctrl+C).
- **Reiniciar** — `killPty` + `spawnPty` (o listener do mount continua ativo).
- **Limpar** — `term.clear()`.
- **Remover** — `deleteNode(id)`.

Área do terminal com classes `nodrag nowheel nopan` e `stopPropagation` em `onWheel`, `onMouseDown` e `onPointerDown`.

Cache de scrollback opcional em `localStorage` (`cgli_term_${id}`, últimos 60 KB), como no agente. **v1: não restaurar** o histórico, porque um shell novo com histórico antigo colado confunde. Só limpar a chave ao remover o nó.

Tamanho mínimo: `minWidth 420`, `minHeight 260`. Tamanho padrão: `640 x 400`.

### 4.2 `src/App.tsx`

- Importar e registrar `terminalNode: TerminalNode` em `nodeTypes` (linha ~36).
- `MiniMap.nodeColor` (linha ~453): `if (n.type === 'terminalNode') return '#0078D4'`.

### 4.3 `src/components/layout/Topbar.tsx`

- Novo `handleAddTerminal` ao lado de `handleAddImage` (linha ~90):

```ts
const nodeId = `node-terminal-${Date.now()}`
addNode({
  id: nodeId,
  type: 'terminalNode',
  position: { x: 200 + nodes.length * 30, y: 150 + nodes.length * 20 },
  style: { width: 640, height: 400 },
  data: {
    title: 'PowerShell',
    shell: 'powershell',
    sessionId: `pty-${nodeId}`,
    workspacePath: getActiveWorkspacePath(),
    isPtyActive: true,
  },
})
setIsAddNodeOpen(false)
```

- Novo item "Terminal PowerShell" no menu "Adicionar Nó" (bloco em torno das linhas 299-360).

### 4.4 `src/store/canvasStore.ts`

| Ponto | Mudança |
|---|---|
| `getNodeDimensions` (~415) | `case 'terminalNode': return { width: 640, height: 400 }` |
| `deleteNode` (~1210) | Se `terminalNode`, chamar `ptyService.killPty(sessionId)` e remover `cgli_term_${id}` do `localStorage`. Hoje só `agentNode` mata o PTY, então sem isso o PowerShell **vira processo órfão** |
| `stashNode` (~1312) | Mapear `terminalNode` → `'terminal'` e matar o PTY (o nó sai do canvas) |
| `restoreFromStash` (~1417) | Mapear `'terminal'` → `terminalNode`, com `style` padrão `640x400`. O id restaurado muda (`-restored-<ts>`), então **regenerar `data.sessionId = pty-<novoId>`** para não reutilizar a sessão morta |
| Carga do canvas (~273) | Normalizar `terminalNode` ao carregar: `sessionId = n.data.sessionId \|\| pty-${n.id}`, `isPtyActive: true`, `style` padrão. Como o shell não sobrevive ao restart do app, o nó reabre com um PowerShell novo |

### 4.5 `src/components/nodes/GroupNode.tsx`

Ícone em `getNodeIcon` (~56): `if (type === 'terminalNode') return <SquareTerminal className="w-3 h-3 text-blue-400" />`.

## 5. Pontos de atenção e riscos

1. **`CGLI_NODE_ID` e ações da bridge.** `session.rs:244` define `CGLI_NODE_ID = session_id sem "pty-"`. Se o usuário rodar `cgli create-artifact` ou `cgli spawn-subagent` dentro do terminal, a bridge vai enviar `parent_node_id` de um `terminalNode`. Verificar em `canvasStore.ts` (~1920-1955, `createDiffNode` e `spawnSubagent`) que um pai que não é `agentNode` **não quebra** a criação: o esperado é criar o nó sem vínculo de pai, ou ligá-lo ao terminal.
2. **Encoding pt-BR.** O PowerShell 5.1 pode devolver acentos incorretos. Se aparecer, spawnar com `-NoExit -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8"`. Decidir depois de testar, sem antecipar.
3. **Vazamento de PTY ao empilhar (stash) ou remover.** Coberto em 4.4; é o item mais fácil de esquecer.
4. **Modo web (sem Tauri).** `ptyService` já tem fallback via `/api/pty/*` + SSE; o nó herda isso sem código extra. Testar que `resizePty` é no-op no modo web (já é).
5. **Duplicação de código.** O efeito do xterm terá ~80 linhas parecidas com o do `AgentCardNode`. Para a v1, **não refatorar o `AgentCardNode`**: ele recebeu correções recentes de ciclo de vida (commits `4f78873` e `24c9a1e`) e mexer nele ampliaria o risco. Extrair um hook `useXtermPty` fica como passo posterior, separado.
6. **Mock do AGY.** `.cgli/artifacts/powershell.html` não entra no build; fica como referência visual.

## 6. Ordem de implementação

1. Tipos (`canvas.ts`) e `getNodeDimensions`.
2. `TerminalNode.tsx` com xterm + PTY.
3. Registro em `App.tsx` + botão na `Topbar`. **Ponto de teste: o nó já abre e funciona.**
4. Ciclo de vida na store: `deleteNode`, `stashNode`, `restoreFromStash`, normalização na carga.
5. Ícone no `GroupNode` e cor no minimapa.
6. Verificação final (seção 7).

## 7. Verificação

Sem suíte de testes de UI para os nós. A verificação é o type-check/build do projeto mais o roteiro manual abaixo, no app Tauri:

- [ ] Adicionar o nó pela Topbar: abre `PS C:\...>` no diretório do workspace.
- [ ] `Get-ChildItem`, `Get-Date`, `cgli status`: executam de verdade.
- [ ] Digitar `Delete`, setas e `Backspace` **não** apagam nem movem o nó.
- [ ] Redimensionar pelos cantos: o terminal reajusta colunas/linhas (`echo $Host.UI.RawUI.WindowSize` confere).
- [ ] Rolar com a roda do mouse dentro do terminal rola o histórico, não dá zoom no canvas.
- [ ] `Ctrl+C` em `Start-Sleep 60` interrompe; "Reiniciar" traz um shell limpo.
- [ ] Digitar `exit`: mostra "Processo encerrado" e `isPtyActive = false`.
- [ ] Remover o nó: o `powershell.exe` some do Gerenciador de Tarefas.
- [ ] Empilhar (stash) e restaurar: novo shell funcional, sem sessão duplicada.
- [ ] Fechar e reabrir o app: o nó reaparece e abre um shell novo.
- [ ] Nó dentro de um grupo: arrasta e redimensiona com o grupo, com o ícone correto.
- [ ] Alternar tema claro/escuro: o terminal mantém o fundo azul.

## 8. Fora de escopo (v1)

- Outros shells (`pwsh`, `cmd`, `bash`) e seletor de shell.
- Persistência do scrollback entre reinícios.
- Handles/arestas para anexar a saída do terminal a agentes.
- Comando `cgli create-terminal` (exigiria novo `action_type` na bridge Rust e em `BridgeAction`).

## 9. Perguntas em aberto

1. O nó precisa de **handles de conexão** (para futuramente ligar a agentes), ou fica isolado na v1?
2. Devemos oferecer `cgli create-terminal` já na v1, para agentes criarem terminais pelo canvas?
