# CGLI (Canvas Agent Orchestrator) - Guia de Interação

Você está executando dentro do ambiente **CGLI**.
Você tem total acesso ao projeto neste diretório e pode criar ou invocar nós diretamente no canvas.

## Comandos do Canvas Disponíveis

Você pode executar o utilitário `cgli` diretamente no terminal:

1. **Invocar Subagente:**
   ```bash
   cgli spawn-subagent --type agy --task "Executar suite de testes e build"
   cgli spawn-subagent --type claude --role planner --task "Planejar arquitetura"
   ```

2. **Criar Nó de Artefato (Plano / Especificação / Documento):**
   ```bash
   cgli create-artifact --title "Plano de Implementação" --content "# Detalhes..."
   ```

3. **Criar Nó de Preview Web (HTML / Sandbox Iframe):**
   ```bash
   cgli create-preview --title "Dashboard Preview" --html "<div><h1>Preview</h1></div>"
   ```

4. **Criar Nó de Diff (Comparação de Código):**
   ```bash
   cgli create-diff --title "Alterações em Auth" --file "src/auth.ts"
   ```

## Ações via Blocos de Texto
Alternativamente, você pode emitir blocos estruturados na sua resposta que o CGLI interceptará:
`<<<CGLI:SPAWN_SUBAGENT {"child_type":"agy","role":"executor","task":"Executar testes"}>>>`
`<<<CGLI:CREATE_ARTIFACT {"title":"Plano de Teste","content":"# Plano\n..."}>>>`
`<<<CGLI:CREATE_PREVIEW {"title":"Preview Botão","html":"<button>Clique</button>"}>>>`
`<<<CGLI:CREATE_DIFF {"title":"Diff Auth","filename":"src/auth.ts"}>>>`

<!-- CGLI:BEGIN v2 -->
# CGLI (Canvas Agent Orchestrator) — Regras de Execução

Você está executando dentro do ambiente interativo **CGLI** no desktop Tauri.
O canvas do CGLI só exibe planos, especificações, diffs e subagentes que você registrar com o comando `cgli`.

## 📌 REGRA MANDATÓRIA PARA O PAPEL DE PLANEJADOR (PLANNER)
Sempre que concluir um plano de arquitetura, plano de implementação, especificação ou documento técnico:
1. Salve o plano em arquivo markdown na pasta de artefatos: `.cgli/artifacts/<nome-do-plano>.md`
2. Registre-o e publique-o imediatamente no canvas executando no terminal:
   `cgli create-artifact --title "Título do Plano" --file .cgli/artifacts/<nome-do-plano>.md`
   (ou envie diretamente via stdin: `cat plano.md | cgli create-artifact --title "Título do Plano" --stdin`)
3. Após criar o nó no canvas, responda ao usuário no terminal com um breve resumo de 2 a 3 linhas citando o título do plano criado.

## 🛠️ Comandos Disponíveis do Canvas

- **Criar Nó de Artefato (Plano / Especificação / Documento):**
  `cgli create-artifact --title "Título" --file caminho/documento.md`

- **Invocar Subagente Conectado no Canvas:**
  `cgli spawn-subagent --type claude --role planner --task "Descrição da tarefa"`
  `cgli spawn-subagent --type agy --role executor --task "Executar build e testes"`

- **Criar Nó de Diff (Alterações de Código):**
  `cgli create-diff --title "Alterações em Auth" --file "src/auth.ts"`

- **Criar Nó de Preview Web (HTML / Sandbox Iframe):**
  `cgli create-preview --title "Dashboard Preview" --file index.html`

- **Listar Pastas do Workspace:**
  `cgli list-folders`

## 🧠 Memória Compartilhada no Obsidian (Vaults Local e Global)

O CGLI possui memória persistente integrada ao Obsidian dividida em dois níveis:
1. **Vault Local do Projeto (`.cgli/vault/`):** decisões de arquitetura (ADRs), especificações, tarefas e journal de sessões deste repositório.
2. **Vault Global do Usuário (`~/.cgli/vault/`):** aprendizados gerais, preferências do desenvolvedor e convenções universais.

### Comandos de Memória:
- **Registrar observação no journal diário (append-only):**
  `cgli memory write [--scope project|global] --text "Texto da observação" [--tags tag1,tag2]`
- **Registrar decisão (ADR) ou aprendizado formal:**
  `cgli memory note [--scope project|global] --type decision --title "Título" [--content "..." | --file doc.md]`
  `cgli memory note --scope global --type learning --title "Convenção" --content "Conteúdo"`
- **Listar notas de memória salvas:**
  `cgli memory list [--scope project|global] [--type decision]`
- **Consultar conteúdo de uma nota:**
  `cgli memory get <id_ou_nome>`
- **Abrir o Vault no aplicativo Obsidian:**
  `cgli memory open [--scope project|global]`
<!-- CGLI:END -->