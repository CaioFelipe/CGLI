# Plano de Implementação: Comentários em Artefatos e Visualização no Agente

Permitir que usuários adicionem comentários e diretrizes diretamente no nó de artefato (plano de implementação) do CGLI Canvas e, ao clicar em "Aprovar e Executar", sincronizar o plano completo acompanhado de todos os comentários para o agente conectado, tanto na injeção de prompt no PTY quanto na interface visual do AgentCardNode.

## Mudanças Propostas

### 1. Tipos do Canvas (`src/types/canvas.ts`)
- Interface `ArtifactComment`: `id`, `author`, `text`, `createdAt`.
- Extensão de `ArtifactNodeData`: `comments?: ArtifactComment[]`, `activeTab?: 'document' | 'comments' | 'split'`.
- Extensão de `AttachedArtifactBadge` para rastrear dados de comentários e status.

### 2. Store do Canvas (`src/store/canvasStore.ts`)
- Ações `addArtifactComment(nodeId, text, author)` e `deleteArtifactComment(nodeId, commentId)`.
- Atualização em `approveArtifact(nodeId)` para injetar no PTY do agente o plano Markdown integral e a lista completa de comentários.
- Atualização dos logs do terminal do agente e sincronização de anexos.

### 3. Componente `ArtifactNode.tsx`
- Seletor de abas: "Documento", "Comentários (N)" e "Dividido (Lado a Lado)".
- Painel de comentários completo com lista estruturada, avatares, timestamps, botão de exclusão e formulário para novos comentários.
- Botão "Aprovar e Executar" com contagem dinâmica de comentários a serem repassados.

### 4. Componente `AgentCardNode.tsx`
- Banner e gaveta expansível de plano anexado e aprovado.
- Permite que o operador e o agente visualizem o plano e todos os comentários diretamente no card do agente.

## Plano de Verificação
- Compilação com `npm run build`
- Validação estática com `npx oxlint`
- Testes manuais no fluxo de comentários, aprovação e visualização no agente.
