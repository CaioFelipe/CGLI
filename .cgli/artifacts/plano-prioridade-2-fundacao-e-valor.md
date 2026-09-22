# Plano da Prioridade 2 — Fundação de Escrita e Valor no Canvas

**Autor:** Arquiteto CGLI · **Data:** 2026-09-22 · **Status:** proposta para aprovação
**Precedente:** Relatório de Qualidade da Memória Compartilhada (2026-09-22) e rodada de correções P0/P1-higiene.

---

## 0. Gate Zero — dois achados que precedem o planejamento

Antes de definir a P2, a inspeção do código atual revelou dois fatos que alteram as premissas declaradas. Ambos são baratos de corrigir agora e caros de descobrir depois.

### 0.1 O lado Rust das correções P0 nunca foi compilado

Não existe toolchain Rust nesta máquina (`cargo` e `rustup` ausentes do PATH; `$USERPROFILE\.cargo` inexistente) e **`src-tauri/target/` não existe** — o binário Tauri nunca foi construído localmente.

O "build limpo (0 erros TS)" registrado na rodada P0 é o build do Vite/TypeScript. Ele não exercita uma única linha de `src-tauri/src/bridge/mod.rs`. Portanto, as três correções P0 mais importantes — despacho `/api/memory/*` via RPC, guarda de sobrescrita do `cgli.cjs` e emissão do `vaultManager.cjs` — estão **escritas, mas não verificadas**. Elas podem não compilar, e ninguém saberia.

Isto repete, em escala menor, o padrão que o relatório de auditoria identificou: declarar concluído o que não foi exercitado.

**Ação de Gate Zero (bloqueante para toda a P2):** instalar o toolchain (`rustup-init` → `stable-x86_64-pc-windows-msvc` + Build Tools do VS com C++), rodar `cargo check` em `src-tauri/`, e só então abrir o primeiro lote.

### 0.2 O despacho RPC usa caminho relativo e quebra no app empacotado

`src-tauri/src/bridge/mod.rs:111-115`:

```rust
let mut cmd = std::process::Command::new("node");
cmd.arg(".cgli/bin/vaultManager.cjs")   // ← relativo ao cwd do processo Tauri
   .arg("rpc").arg(method).arg(path);
```

Não há `.current_dir(...)`. Em `npm run dev` o cwd é a raiz do repositório e funciona por acidente. No app empacotado, o cwd é o diretório de instalação (ou `C:\Windows\System32`, quando lançado por atalho): `node` resolve `.cgli/bin/vaultManager.cjs` a partir dali, falha com `MODULE_NOT_FOUND`, e o bridge devolve `500`.

Pior, o RPC do lado Node usa `workspacePath = body.workspacePath || params.get('workspacePath') || process.cwd()` (`vaultManager.cjs:1071`). Mesmo que o script fosse encontrado, um request sem `workspacePath` explícito gravaria o vault **no diretório de instalação do app**, não no projeto.

Ou seja: a P0 item 1 ("bridge despacha `/api/memory/*`") está funcionalmente incompleta exatamente no cenário que a P0 existia para consertar — o app empacotado.

**Correção (entra no Lote 1, é pré-requisito do single-writer):**

```rust
let ws = resolve_workspace_path();           // de WORKSPACE_INFO, com fallback
let script = ws.join(".cgli").join("bin").join("vaultManager.cjs");
cmd.current_dir(&ws)
   .arg(&script)
   .env("CGLI_WORKSPACE_PATH", ws.display().to_string());
```

E no lado Node, o `workspacePath` passa a resolver `process.env.CGLI_WORKSPACE_PATH` **antes** de `process.cwd()`, com erro explícito se nenhum dos dois apontar para um diretório que contenha `.cgli/`.

---

## 1. O que compõe a Prioridade 2

A P2 reúne dois conjuntos que a auditoria tratou separadamente. Eles não são alternativas — são camadas, e a ordem entre elas é a decisão central deste plano.

### Bloco A — Integridade de escrita (os P1 estruturais restantes)

| # | Item | Estado hoje |
|---|---|---|
| A1 | **D1 Single-Writer** com fila FIFO | 🔴 invertido: cada processo escreve direto |
| A2 | **ULID real monotônico** (26 chars, cripto) | 🟡 16 chars, `Math.random()`, fora de ordem no mesmo ms |
| A3 | **etag + rev + `--expect-rev` + notas `.conflict-*`** | 🔴 `rev` escrito como `1` e nunca incrementado |
| A4 | **Idempotência `--idem-key`** | 🔴 inexistente |
| A5 | **VaultGuard** (lock inter-processo, 2ª instância) | 🔴 inexistente |

### Bloco B — Valor imediato no Canvas (os P2 de produto)

| # | Item | Estado hoje |
|---|---|---|
| B1 | **Injeção automática de contexto no spawn** | 🔴 depende de o agente lembrar de chamar |
| B2 | **SQLite FTS5 / BM25** | 🔴 varredura linear O(n), lendo cada arquivo 2× por consulta |
| B3 | **Watcher de arquivos** (edição humana → agente) | 🔴 loop humano→agente aberto |
| B4 | **Drag-to-attach no Canvas** | 🔴 "a interação central" do §4.2 não existe |

---

## 2. Proposta prioritária recomendada

**Recomendação: A1 → A2/A3/A4 → B1 → B2 → B3 → B4.** A fundação primeiro, com uma ressalva deliberada sobre B1.

### Por que a fundação primeiro

**1. A janela de A1 está se fechando, e ela é a única coisa aqui que expira.** O vault tem 6 notas e 3,4 KB. Migrar o modelo de escrita hoje é reescrever um caminho de código; migrar com 400 notas e journals de três meses é escrever um migrador, validá-lo e torcer. Nenhum item do Bloco B fica mais caro por esperar — todos são aditivos. A1 é o único que fica.

**2. Todo o Bloco B aumenta a pressão sobre a fundação frágil.** B2 introduz um índice SQLite que precisa ser mantido em sincronia com o disco — mais um escritor. B3 introduz eventos do sistema de arquivos disparando reindexação — mais um escritor, e assíncrono. B4 multiplica anexos e, portanto, escritas de metadados. Construir os três sobre um modelo onde "cada processo escreve direto" é repetir o erro que a auditoria diagnosticou: entregar Fase 2 e 3 sobre uma Fase 1 ausente.

**3. A1 é, hoje, muito mais barato do que o plano original supunha.** O plano falava em WriterTask, canal mpsc e processo dedicado. Mas o bridge Rust **já é** um processo único e já é o ponto por onde todo request de memória passa. O single-writer se reduz a: (a) serializar o caminho de escrita dentro do bridge com uma fila, e (b) **remover o fallback silencioso do `cgli.cjs`**. São dezenas de linhas, não um subsistema.

O fallback é o ponto crítico. Em `.cgli/bin/cgli.cjs:285-292`:

```js
try {
  const res = await post('/api/memory/write', payload);   // caminho correto
} catch (_) {
  const res = vaultManager.writeObservation(payload);     // ← escreve direto, engole o erro
}
```

Enquanto essa linha existir, **nenhuma quantidade de trabalho no lado Rust produz um single-writer**, porque qualquer falha transitória do bridge devolve o agente ao acesso direto ao disco. E o `catch (_)` descarta a causa: um bridge fora do ar e um erro de validação produzem exatamente o mesmo comportamento observável. Esse `catch` é a arquitetura D1 invertida em três linhas.

### A ressalva sobre B1

**B1 (injeção de contexto) é puramente de leitura e pode ser antecipado** se houver pressão por valor visível. Ele não escreve no vault, não disputa lock, não altera nenhum registro. É o único item do Bloco B que é seguro executar sobre a fundação atual.

Dito isso, **recomendo mantê-lo depois de A1-A4**, por um motivo prático: B1 é o item que faz os agentes efetivamente *usarem* a memória, e portanto é o item que transforma um vault de 6 notas num vault ativo. Antecipá-lo acelera o fechamento da janela de A1. Se a decisão for antecipar B1 mesmo assim, é uma escolha defensável — mas então A1 deve vir imediatamente depois, antes de B2/B3/B4, e não ser adiado de novo.

### O que fica fora da P2 (explicitamente)

A5 (VaultGuard inter-processo), busca vetorial `sqlite-vec`, detecção de contradições, `invalidates_on` + hook de Git, deep link `cgli://`, `promote`/`link`/`backlinks`, extração de entidades, MemoryLensNode, SessionTraceNode e telemetria de recall. A5 sai porque a fila do bridge cobre o caso real (N agentes, 1 app); duas instâncias simultâneas do CGLI é um cenário de risco menor que pode esperar a P3. Os demais são roadmap de longo prazo.

---

## 3. Desenho técnico

### Lote 1 — D1 Single-Writer (Bloco A1)

**Objetivo:** existir exatamente um caminho de escrita no vault, e falhar ruidosamente quando ele não estiver disponível.

#### 3.1.1 Fila FIFO no bridge Rust

Novo arquivo **`src-tauri/src/bridge/writer.rs`**:

```rust
pub struct WriteRequest {
    pub method: String,
    pub path: String,
    pub body: String,
    pub respond_to: tokio::sync::oneshot::Sender<(String, String)>, // (status, json)
}

// Task única, criada uma vez no boot do bridge.
// Consome de um mpsc::UnboundedReceiver<WriteRequest> em ordem de chegada.
// Enquanto processa o item N, o item N+1 espera. Essa é a garantia D1.
pub fn spawn_writer_task(ws: PathBuf) -> mpsc::UnboundedSender<WriteRequest> { ... }
```

Regra de roteamento em `mod.rs`, no bloco `path.starts_with("/api/memory/")`:

- **Escritas** (`write`, `note`, `update`, `append`, `compact`, `moc`, `context-file`) → enfileiradas no `WRITER_TX`, resposta via `oneshot`.
- **Leituras** (`list`, `get`, `search`, `context`, `doctor`, `open`) → executadas fora da fila, em paralelo, como hoje.

Serializar leituras seria um erro: elas são a maioria do tráfego e não têm efeito colateral. A fila existe para ordenar mutações, não para criar um gargalo global.

**Observabilidade obrigatória:** a task mantém `queue_depth` e `last_write_ms` expostos em `GET /api/status`. Uma fila cuja profundidade não é observável é uma fila que ninguém percebe que travou.

#### 3.1.2 Fim do fallback silencioso na CLI

Em `.cgli/bin/cgli.cjs`, o `catch` de cada subcomando de memória passa a distinguir três casos:

| Situação | Comportamento novo |
|---|---|
| Bridge respondeu 2xx | Sucesso; imprime o ID retornado |
| Bridge respondeu 4xx/5xx | **Falha ruidosa**: imprime o erro do servidor, `process.exit(1)` |
| Bridge inalcançável (`ECONNREFUSED`) | Grava no **outbox**, avisa o agente, `process.exit(1)` |

O outbox é `.cgli/vault/00-inbox/.outbox/<ulid>.json` — o request serializado, não a nota. Ele **preserva** a indisponibilidade em vez de mascará-la, que é a diferença exata entre o outbox do plano original e o fallback atual. O bridge drena o outbox no boot, pela fila, em ordem de ULID.

`process.exit(1)` é o detalhe que importa. Hoje o agente recebe sucesso e segue em frente. Com exit 1, o agente vê a falha, e a perda silenciosa de trabalho — o pior modo de falha do catálogo — deixa de ser possível.

#### 3.1.3 Correção do caminho relativo

Conforme §0.2: `.current_dir(&ws)`, caminho absoluto do script, `CGLI_WORKSPACE_PATH` no env do filho, e resolução estrita do `workspacePath` no lado Node.

**Arquivos:** `src-tauri/src/bridge/writer.rs` (novo), `src-tauri/src/bridge/mod.rs`, `.cgli/bin/cgli.cjs`, `.cgli/bin/vaultManager.cjs` (resolução de workspace + drenagem de outbox).

---

### Lote 2 — Integridade dos registros (Blocos A2, A3, A4)

Uma vez que as escritas estão serializadas, estes três itens ficam quase triviais: a maior parte da complexidade de etag/rev e idempotência vem de corridas, e a fila já as eliminou.

#### 3.2.1 A2 — ULID real monotônico

Substitui `generateId()` (`vaultManager.cjs:27-31`). 26 caracteres Crockford base32: 48 bits de timestamp + 80 bits de `crypto.randomBytes(10)`. Monotonicidade dentro do mesmo milissegundo por incremento big-endian do componente aleatório.

Sem dependências — `node:crypto` basta.

**Compatibilidade:** IDs antigos (16 chars, prefixo `01`) permanecem válidos. Nenhum arquivo é renomeado. `getNote` já resolve por `includes`/`startsWith`, então continua aceitando ambos. Registra-se um ADR no vault marcando a data de corte.

#### 3.2.2 A3 — etag, rev e resolução de conflito

**Decisão: SHA-256 via `node:crypto`, não Blake3.** Blake3 em Node exige binding nativo (node-gyp), e o relatório de auditoria já registra o custo de dependências nativas no Windows. SHA-256 é nativo, zero-dep, e a colisão não é a ameaça aqui — a detecção de modificação é.

```
etag = sha256(corpo_markdown_após_o_frontmatter).hex.slice(0, 16)
```

O etag cobre **apenas o corpo**, não o frontmatter. Se cobrisse o frontmatter, cada escrita alteraria `updated` e `rev`, que alterariam o etag, que precisaria ser reescrito no frontmatter — recursão sem ponto fixo.

Novos comandos:

```bash
cgli memory update --id <ulid> --expect-rev <n> [--expect-etag <hex>] \
                   (--content "..." | --file doc.md | --stdin)
cgli memory append --id <ulid> --section "Título" --content "..."
```

Endpoints: `POST /api/memory/update`, `POST /api/memory/append` (ambos pela fila).

**Caminho feliz:** `rev` bate → `rev+1`, `updated` = agora, `etag` recalculado, `atomicWriteFile`.

**Conflito** (`rev` ou `etag` divergem): não sobrescreve nada. Escreve `<pasta-da-nota>/<id>--conflict-<novo-ulid>.md` com:

```yaml
cgli_schema: conflict/v1
conflicts_with: "<id-da-nota-original>"
base_rev: 3          # o que o autor esperava
actual_rev: 5        # o que estava em disco
base_etag: "a1b2..."
actual_etag: "c3d4..."
author: { agent_id: "..." }
```

Retorna HTTP `409` com o caminho do conflito. O agente vê o 409 e pode reler, reconciliar e reenviar.

`memory append` nunca conflita: ele acrescenta uma seção ao final e incrementa `rev`. É o caminho recomendado para acumulação de conhecimento; `update` fica para reescrita deliberada.

`memory doctor` ganha uma checagem: notas `.conflict-*` pendentes viram `[WARN]` com contagem.

#### 3.2.3 A4 — Idempotência `--idem-key`

Flag `--idem-key <string>` em `write`, `note`, `update` e `append`; header `X-CGLI-Idem-Key` no HTTP.

**Decisão: o ledger de idempotência vive no Rust, não no Node.** A writer task mantém `HashMap<String, (String, Instant)>` (chave → resposta JSON) hidratado no boot a partir de `.cgli/vault/00-meta/.idem-ledger.ndjson`. Chave repetida dentro de 24 h → devolve a resposta original **sem tocar no disco**.

Isso mantém o `vaultManager.cjs` stateless (ele continua sendo uma função pura de request → escrita), coloca a deduplicação no único ponto que enxerga todos os requests, e reaproveita a decisão já tomada na rodada P1 de usar ledger NDJSON lateral em vez de read-modify-write. O GC por idade entra no `memory doctor`.

Isso fecha T8: o timeout do agente, seguido de retry, deixa de duplicar observações.

**Arquivos:** `.cgli/bin/vaultManager.cjs` (ULID, etag, `updateNote`, `appendToNote`, conflitos), `.cgli/bin/cgli.cjs` (subcomandos e flags), `src-tauri/src/bridge/writer.rs` (ledger idem), `src-tauri/src/bridge/mod.rs` (rotas, 409), `.cgli/CGLI_GUIDE.md`, `CLAUDE.md`.

---

### Lote 3 — B1: Injeção automática de contexto no spawn

O item de maior retorno do plano inteiro. O relatório foi direto: *"memória que depende de o agente lembrar de consultá-la é memória que não será consultada."*

#### 3.3.1 Decisão de design: referência a arquivo, não injeção inline

O instinto é prefixar o bloco `<!-- CGLI:MEMORY_CONTEXT -->` ao texto da tarefa. **Isso quebra no PTY.** Em `canvasStore.ts:2165-2168` a tarefa é entregue via:

```ts
ptyService.writePty(`pty-${childId}`, `${task}\r`)
```

Colar 1.500 tokens de markdown multi-linha num CLI interativo significa que cada `\n` interno vira um Enter. O primeiro parágrafo é submetido como prompt e o resto é digitado no vazio. Em terminais Windows com bracketed paste inconsistente, o resultado é pior ainda.

**Desenho adotado:** o pack é escrito em `.cgli/context/<childId>.md` e a tarefa recebe **uma única linha** de referência:

```
[CGLI] Contexto de memória do projeto em .cgli/context/<childId>.md — leia antes de começar. Tarefa: <task original>
```

Uma linha, sem quebra, à prova de PTY, e funciona igual para `claude` e para `agy`, que são ambos CLIs com acesso ao sistema de arquivos. Como efeito colateral bem-vindo, o pack fica auditável em disco depois do spawn. Flag `--inline` fica disponível para quem quiser o comportamento antigo.

#### 3.3.2 Fluxo

1. `spawnSubagentFromAction` (`canvasStore.ts:2089`) recebe a tarefa.
2. Antes do `setTimeout` do `writePty`, chama `memoryFetch('/api/memory/context-file', { method:'POST', body: JSON.stringify({ query: task, nodeId: childId, budgetTokens: 1500, scope: 'all' }) })`.
3. O bridge enfileira (é escrita), o Node gera o pack e grava em `.cgli/context/<childId>.md`, retorna `{ path, notesCount, estimatedTokens }`.
4. Se `notesCount > 0`, a tarefa é prefixada com a linha de referência. Se `0`, a tarefa segue intocada — **nunca** injetar um "nenhum registro encontrado", que só gasta atenção do agente.
5. Um log entra no `terminalLogs` do nó: `> [CGLI Memory] 4 notas relevantes injetadas (1.2k tokens).` O usuário precisa ver que houve injeção; contexto invisível é contexto que ninguém depura.

**Ponto de injeção único:** tanto `spawnSubagent` (menu do canvas) quanto `spawnSubagentFromAction` (bloco `<<<CGLI:SPAWN_SUBAGENT>>>` e `cgli spawn-subagent`) devem passar pelo mesmo helper. Dois pontos de injeção divergem em uma semana.

#### 3.3.3 Melhoria do ranking

`buildContextPack` (`vaultManager.cjs:548`) hoje ordena por um único fator (a heurística de contagem do `searchNotes`). O plano original pedia quatro. Com o FTS5 ainda pendente (Lote 4), adiciona-se agora o que não depende de índice:

```
score_final = score_busca × (1 + 0.3·recencia) × (0.5 + 0.5·confidence) × boost_tipo
```

- `recencia`: decaimento exponencial sobre `updated`, meia-vida de 30 dias.
- `confidence`: já é gravado nas observações de journal; passa a entrar no frontmatter das notas (default 0.8).
- `boost_tipo`: `decision`/`rule` = 1.3, `knowledge`/`learning` = 1.0, `journal` = 0.6.

Proximidade no grafo fica para quando `links` estiver populado (depende de `promote`/`link`, fora da P2).

**Arquivos:** `src/store/canvasStore.ts`, `src/services/memoryService.ts`, `.cgli/bin/vaultManager.cjs`, `src-tauri/src/bridge/mod.rs`, `.gitignore` (adicionar `.cgli/context/`).

---

### Lote 4 — B2: Busca FTS5 com BM25

#### 3.4.1 Achado de viabilidade (verificado nesta análise)

**O `node:sqlite` do Node 22.15.1 não tem FTS5.** Testado diretamente:

```
$ node --experimental-sqlite -e "... CREATE VIRTUAL TABLE t USING fts5(...)"
FTS5 INDISPONIVEL: no such module: fts5
```

O SQLite embutido no Node é compilado sem `SQLITE_ENABLE_FTS5`. O caminho "zero dependências em JS" está fechado.

#### 3.4.2 Opções e recomendação

| Opção | Custo | Risco |
|---|---|---|
| **`rusqlite` com `features = ["bundled"]` no bridge** | SQLite compilado dentro do binário Tauri | MSVC já é exigido pelo Tauri; sem dependência nova em runtime |
| `better-sqlite3` em JS | prebuilds para ABI do Node 22 | binding nativo no Windows; quebra se o `node` do usuário divergir |
| Manter varredura linear, normalizada por tamanho | trivial | continua O(n) por consulta |

**Recomendação: `rusqlite` bundled.** Além de evitar toolchain nativo em JS, ele coloca o índice **no mesmo processo que já é o single-writer** (Lote 1). Índice e disco passam a ser mutados pela mesma task, na mesma ordem, sem um segundo protocolo de sincronização. Isso não é conveniência — é a diferença entre um índice que pode divergir do disco e um que não pode.

**Ressalva:** não foi possível verificar o `rusqlite` bundled nesta máquina, porque não há toolchain Rust instalado (§0.1). Fica como **Spike S1**, a primeira coisa a rodar depois do Gate Zero, com a opção `bundled-full` como alternativa caso o `bundled` padrão não traga FTS5. Se S1 falhar, o fallback é `better-sqlite3`; se esse também falhar, a varredura linear normalizada mantém o sistema funcional — o índice é uma otimização, não um requisito de correção.

#### 3.4.3 Esquema

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  id UNINDEXED, title, body, tags, type UNINDEXED,
  scope UNINDEXED, path UNINDEXED, tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE notes_meta (
  id TEXT PRIMARY KEY, path TEXT, mtime INTEGER,
  etag TEXT, rev INTEGER, updated TEXT, confidence REAL
);
```

`remove_diacritics 2` não é opcional: o vault é em português, e sem isso "decisão" e "decisao" são termos distintos.

O índice vive em `.cgli/vault/_index/fts.db` (já no `.gitignore` pelo padrão do plano original — confirmar). É **descartável e reconstruível**: `cgli memory reindex` reconstrói do zero a partir do disco. O disco é a fonte da verdade; o índice nunca é.

Manutenção incremental pela writer task: toda escrita bem-sucedida atualiza a linha correspondente na mesma transação lógica. `searchNotes` passa a consultar o índice, com fallback automático para a varredura linear se o banco não abrir.

---

### Lote 5 — B3: Watcher com supressão de eco

**Decisão: `notify` em Rust, não `chokidar` em JS.** O watcher precisa viver no processo que possui o `app.emit` e que já conhece as próprias escritas — e esse processo é o bridge. Um watcher em Node precisaria de um canal extra só para saber o que o writer acabou de gravar.

Dependências: `notify = "6"` e `sha2 = "0.10"` em `src-tauri/Cargo.toml`.

**Supressão de eco.** Sem ela, toda escrita do agente dispara um evento que parece uma edição humana, que dispara reindexação e notificação, que pode disparar outra escrita. O mecanismo:

1. A writer task, ao gravar, registra `path → (etag, Instant)` num `HashMap` de ecos recentes.
2. O watcher, ao receber um evento, calcula o SHA-256 do arquivo.
3. Se bate com o etag registrado nos últimos 3 s → descarta silenciosamente (foi eco da própria escrita).
4. Caso contrário → é edição humana no Obsidian: reindexa, incrementa `rev`, e emite `memory://changed { path, id, scope }`.

Comparação por **conteúdo**, não por timestamp. Timestamps no Windows têm granularidade e comportamento de cache que tornam a comparação temporal não confiável; o hash é determinístico.

Debounce de 500 ms por caminho, porque o Obsidian salva em rajada.

No frontend, `memory://changed` atualiza o `MemoryExplorerModal` e qualquer `MemoryNode` montado. **Não** injeta nada automaticamente em agentes em execução — mudar o contexto de um agente no meio de um turno é comportamento surpreendente. A edição humana fica disponível no próximo spawn e nos próximos packs.

---

### Lote 6 — B4: Drag-to-attach no Canvas

O código de interseção já existe e deve ser reusado, não reescrito. `handleNodeDragStop` em `src/App.tsx:117-150` já implementa a detecção "centro dentro" + "sobreposição > 25%" para nós de grupo. O mesmo predicado serve para MemoryNode → AgentNode.

**Fluxo:** arrastar um `memoryNode` e soltá-lo sobre um `agentNode` →

1. Cria aresta `rel: attached-memory` (estilo distinto: tracejado esmeralda, para não se confundir com as arestas de spawn e artefato).
2. Acrescenta o ID da nota em `agentNode.data.attachedMemoryIds`.
3. Regenera `.cgli/context/<agentId>.md` incluindo as notas fixadas **no topo**, acima do que o ranking automático escolheu — a curadoria manual do usuário vence a heurística, sempre.
4. Feedback visual durante o arraste, reaproveitando o padrão de `groupDragOver` que já existe.

Remover a aresta desanexa. `MemoryNodeData` já tem `parentAgentId` (`src/types/canvas.ts:193`), então o modelo de dados já está meio caminho andado.

---

## 4. Estratégia de concorrência e integridade no Windows/Tauri

As regras que atravessam todos os lotes:

1. **Nenhuma dependência nativa nova em JS.** SHA-256 e ULID via `node:crypto`. O SQLite entra pelo Rust, onde o MSVC já é obrigatório. Isso é uma decisão consciente contra Blake3 e contra `better-sqlite3` no caminho principal.
2. **Serializar mutações, nunca leituras.** A fila existe para ordenar escritas. Leituras continuam paralelas — caso contrário, `memory search` numa UI aberta bloquearia a escrita de um agente.
3. **Journals permanecem estritamente append-only.** `appendFileSync` no caminho quente, sem exceção. A correção P1 que moveu a compactação para ledger lateral fica valendo; nenhum lote da P2 pode reintroduzir read-modify-write em `90-journal/`.
4. **`rename` atômico continua sendo o commit.** `atomicWriteFile` (já com `fsyncSync` e backoff com jitter, corrigido na P1) permanece o único caminho de publicação de notas.
5. **Um `.tmp` por vault, nunca por pasta.** `rename` entre volumes não é atômico no Windows; manter o temporário dentro da mesma raiz de vault preserva a garantia. O código atual já faz isso.
6. **Caminhos absolutos e canonicalizados em toda fronteira de processo.** O achado §0.2 é a demonstração de por que caminho relativo através de fronteira de processo é um bug esperando o empacotamento.
7. **Sem `process.exit(0)` em caminho de erro.** Já discutido em 3.1.2, mas vale como regra geral: o código de saída é a única coisa que o agente enxerga de forma confiável.

---

## 5. Plano de verificação

Nenhum lote é declarado concluído sem seu bloco de verificação. O relatório de auditoria foi explícito sobre o motivo: *"sete verificações sequenciais de rota HTTP contra o dev server... é por isso que tudo passou e nada funciona."*

### Gate Zero (bloqueante)

```powershell
rustup --version; cargo --version         # toolchain instalado
cd src-tauri; cargo check                 # o lado Rust da P0 compila?
cd ..; npm run tauri build                # o app empacota?
```

Só depois disso, rodar o app **empacotado** (não `npm run dev`) e executar, de um agente real dentro do canvas:

```bash
cgli memory write --text "verificacao gate zero" --tags gate0
cgli memory list
```

Critério: a nota aparece em `.cgli/vault/90-journal/<hoje>/` **do workspace do projeto**, e não do diretório de instalação. Isso é o teste direto de §0.2.

### Lote 1 — Single-Writer

- **Teste de concorrência 8×500** (o critério de saída que a Fase 1 declarou e nunca executou): 8 processos, 500 escritas cada, simultâneos. Critérios: 4.000 entradas presentes, zero truncadas, zero IDs duplicados, ordem por ULID consistente com a ordem de chegada na fila.
- **Teste de fail-loud:** matar o bridge, executar `cgli memory write`. Esperado: `exit 1`, mensagem clara, request no outbox, **nada escrito no vault**.
- **Teste de drenagem:** subir o bridge, confirmar que o outbox é drenado em ordem e esvaziado.
- **Teste de erro do servidor:** forçar 500, confirmar `exit 1` com a mensagem do servidor (não engolida pelo `catch (_)`).

### Lote 2 — Integridade

- **ULID:** 10.000 IDs no mesmo ms → ordenação lexicográfica estritamente crescente, zero colisões, 26 chars, alfabeto Crockford.
- **etag/rev:** criar nota (rev 1) → `update --expect-rev 1` → rev 2, etag muda. Repetir `--expect-rev 1` → **409**, nota `.conflict-*` criada, original intacta.
- **Corrida real:** dois `update --expect-rev 1` simultâneos → exatamente um vence, exatamente um conflito gerado.
- **Idempotência:** mesmo `--idem-key` 5× → uma entrada no vault, cinco respostas idênticas. Após 24 h simuladas → nova entrada.
- **Regressão:** `memory get` continua resolvendo IDs antigos de 16 chars.

### Lote 3 — Injeção de contexto

- Spawn com tarefa relacionada a nota existente → `.cgli/context/<id>.md` criado, linha de referência de **exatamente uma linha** no PTY, log visível no terminal do nó.
- Spawn com vault vazio → tarefa entregue intocada, sem ruído.
- **Verificação de ponta a ponta:** o subagente, ao ser perguntado, deve citar conteúdo que só existe no vault. É o único teste que prova que a injeção funcionou; os demais provam apenas que o arquivo foi escrito.
- Teste com tarefa contendo aspas, acentos e `&` — o PTY do Windows é o adversário aqui.

### Lote 4 — FTS5

- **Spike S1 antes de qualquer código:** `rusqlite` bundled expõe FTS5 e `bm25()`? Decide entre as três opções da §3.4.2.
- Busca com acento/sem acento retorna o mesmo conjunto (validação do `remove_diacritics 2`).
- Benchmark com 1.000 notas sintéticas: consulta abaixo de 50 ms; comparação com a varredura linear atual registrada no ADR.
- `memory reindex` do zero → resultados idênticos ao índice incremental. Se divergirem, o índice incremental tem bug.
- Deletar `fts.db` com o app em execução → fallback para varredura linear sem crash.

### Lote 5 — Watcher

- Escrita de agente → **zero** eventos `memory://changed` (supressão de eco funcionando).
- Edição no Obsidian → exatamente um evento após o debounce, `rev` incrementado, índice atualizado.
- Salvamento em rajada (5 saves em 1 s) → um evento.
- Teste de loop: 100 escritas de agente em sequência não produzem nenhuma reindexação em cascata.

### Lote 6 — Drag-to-attach

- Soltar MemoryNode sobre AgentNode → aresta criada, `attachedMemoryIds` atualizado, pack regenerado com a nota fixada **no topo**.
- Remover aresta → desanexa, pack regenerado.
- Soltar sobre nó que não é agente → nenhuma mudança de estado.
- Persistência entre reinícios do app.

### Verificação final da P2

```bash
cgli memory doctor --scope all     # SAUDÁVEL, zero conflitos pendentes
git status --short                 # nenhum arquivo de vault/índice/contexto não ignorado
npm run build                      # 0 erros TS
cd src-tauri && cargo check        # 0 erros Rust
```

E, fechando o ciclo: registrar as decisões de arquitetura desta P2 no próprio vault, pelo app empacotado, via `cgli memory note --type decision`. Se a memória não conseguir registrar a própria evolução em produção, ela não está pronta.

---

## 6. Riscos e decisões registradas

| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-P2-1 | Single-writer como fila FIFO dentro do bridge Rust | Processo `memoryd` Node dedicado | O bridge já é processo único e já é o ponto de passagem; um daemon novo adiciona ciclo de vida, supervisão e mais um modo de falha |
| D-P2-2 | SHA-256 (`node:crypto`) para etag | Blake3 | Blake3 exige binding nativo no Windows; a ameaça é detecção de modificação, não colisão |
| D-P2-3 | Ledger de idempotência no Rust | Ledger lido pelo Node a cada request | Mantém o `vaultManager.cjs` stateless e coloca a dedup no único ponto que vê todos os requests |
| D-P2-4 | Contexto por referência a arquivo | Injeção inline no PTY | Markdown multi-linha em CLI interativo submete no primeiro `\n` |
| D-P2-5 | SQLite via `rusqlite` bundled | `node:sqlite` / `better-sqlite3` | `node:sqlite` **não tem FTS5** (verificado); `better-sqlite3` reintroduz toolchain nativo em JS |
| D-P2-6 | Watcher em Rust (`notify`) | `chokidar` em Node | O watcher precisa conhecer as próprias escritas para suprimir eco; essa informação vive no writer |
| D-P2-7 | A5 (VaultGuard inter-processo) adiado para P3 | Incluir na P2 | A fila do bridge cobre N agentes + 1 app, que é o cenário real; duas instâncias do CGLI é risco menor |

**Riscos abertos:**

- **R1 — Spike S1 falha.** Se `rusqlite` bundled não expuser FTS5, o Lote 4 cai para `better-sqlite3` (+1 semana, risco de ABI) ou permanece na varredura linear normalizada. Não bloqueia nenhum outro lote.
- **R2 — Custo de cold start do Node por escrita.** Cada escrita ainda gera um `node` novo (~60-100 ms no Windows). Aceitável até ~10 escritas/s; acima disso, promover a writer task a um processo Node persistente com protocolo NDJSON sobre stdin/stdout. **Medir no teste 8×500 antes de decidir** — otimizar antes de medir seria trocar um problema conhecido por um desconhecido.
- **R3 — Gate Zero revela que o Rust da P0 não compila.** Probabilidade não desprezível: o código nunca foi compilado. O tempo de correção deve ser orçado dentro do Lote 1, não tratado como surpresa.
- **R4 — Antecipação de B1.** Se B1 for movido para antes do Lote 1 (§2), o vault cresce sob o modelo de escrita atual e a janela de migração de A1 encolhe. Mitigação: se antecipar, A1 vem imediatamente depois, sem novo adiamento.

---

*Plano produzido a partir de leitura direta do código em 2026-09-22: `vaultManager.cjs` (1.127 L), `cgli.cjs` (564 L), `bridge/mod.rs` (603 L), `canvasStore.ts`, `App.tsx`, `types/canvas.ts`, `memoryService.ts`; verificação executada da disponibilidade de FTS5 no `node:sqlite` (v22.15.1) e do estado do toolchain Rust.*
