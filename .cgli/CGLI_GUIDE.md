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
