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
