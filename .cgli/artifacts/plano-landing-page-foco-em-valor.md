# Plano de Landing Page: Foco no Valor Real, Rotina do Desenvolvedor e Resolução de Dores

**Data:** 11 de Novembro de 2026  
**Autor:** Antigravity (Pareamento Técnico com Caio Felipe)  
**Projeto:** [CGLI (Canvas Agent Orchestrator)](https://github.com/CaioFelipe/CGLI)  
**Objetivo:** Eliminar o foco egocêntrico em stack/performance e reestruturar a Landing Page 100% em torno do **valor prático para a rotina do desenvolvedor**.

---

## 1. A Mudança Fundamental de Posicionamento

> **A Regra de Ouro:** Ninguém compra a furadeira porque a carcaça é feita de polímero aeroespacial; as pessoas compram pelo **buraco na parede** feito sem esforço e sem quebrar o azulejo.

| O que estava errado (Foco na Máquina) | O que o Usuário Realmente Quer Saber (Foco no Valor) |
|---|---|
| "Refatorado para 100% Rust, Axum, Leptos WASM" | **"Como isso me impede de perder horas corrigindo código quebrado por IA?"** |
| "Consome apenas 18MB de RAM e tem cold start de 4ms" | **"Como isso organiza as 10 abas de terminal que eu abro todo dia para codar com agentes?"** |
| "Engine ANSI/VT100 e 6 Crates modulares no Cargo" | **"Como eu garanto que o Claude planeje direito antes de sair mexendo no meu código?"** |
| "Dual-Vault com ULID monotônico e SHA-256 ETag" | **"Por que meus agentes não vão esquecer as regras da minha empresa na próxima sessão?"** |

---

## 2. A Dor Real do Desenvolvedor que Usa IA em 2026

O desenvolvedor moderno que utiliza ferramentas como Claude Code, Cursor, Copilot e Aider enfrenta 4 frustrações diárias:

1. **O Inferno das Abas de Terminal (Terminal Tab Hell):**
   - Um terminal rodando o Claude Code, outro rodando os testes, outro com o servidor de desenvolvimento, outra janela com o git diff. O dia vira uma maratona de `Alt+Tab` e cópia manual de prompts e logs de erro.
2. **A Amnésia do Agente:**
   - Você passa 40 minutos ensinando as convenções do seu projeto. No dia seguinte, ou em uma nova sessão, o agente alucina, inventa padrões proibidos e quebra o banco de dados porque esqueceu a decisão anterior.
3. **O Medo do "Enter" Cego:**
   - O agente diz que vai implementar uma feature e cospe 800 linhas de código no terminal. É impossível revisar direito no terminal, o dev aceita no escuro e passa as 3 horas seguintes caçando bugs que a IA introduziu.
4. **Agente sem Especialização:**
   - O mesmo agente tenta planejar arquitetura, criar banco, escrever frontend e rodar testes na mesma conversa linear, estourando a janela de contexto e degradando a qualidade do raciocínio.

---

## 3. O Que o CGLI Entrega na Prática (A Proposta de Valor)

O CGLI é a **mesa de cirurgia visual** do engenheiro de software para orquestrar agentes de IA com segurança absoluta:

### 💡 Proposta de Valor Principal:
> **"Orquestre seus agentes de IA como um time de engenharia. O arquiteto planeja, você aprova com anotações pontuais, e o executor codifica. Com você no controle total da sua base de código."**

### Os 4 Pilares de Valor no Dia a Dia:

1. **Visão Panorâmica em Tela Única (Zero Alt+Tab):**
   - Claude Code (Planejador), Antigravity (Executor), Diffs de código, terminal de testes e anotações arquiteturais visíveis no mesmo canvas interativo.
2. **Aprovação Humana Antes do Código (TextAnchor):**
   - O Claude desenha o plano. Você lê o markdown no canvas, grifa um parágrafo ("*não use biblioteca X, use Y*") e clica em **Aprovar**. O executor só digita código depois do seu aval.
3. **Memória de Longo Prazo que Nunca Esquece (Obsidian Vault):**
   - Decisões de arquitetura (ADRs) são salvas em arquivos Markdown reais no seu repositório. Qualquer agente consulta e segue as regras automaticamente.
4. **Diffs Visuais Instantâneos:**
   - Veja cada linha adicionada ou removida em tempo real enquanto os testes rodam, garantindo que nada indesejado entre na sua branch.

---

## 4. Estrutura da Nova Landing Page Focada em Valor

1. **Hero de Alto Impacto (O Alívio Imediato):**
   - **Título:** *Pare de se perder em 10 abas de terminal para programar com IA.*
   - **Subtítulo:** *O CGLI transforma o caos de múltiplos agentes em uma linha de montagem visual. O arquiteto planeja, você ajusta e aprova o plano, e o executor codifica. Sem surpresas na sua main.*
   - **Ação Imediata:** Botão *"Experimentar a Simulação Interativa"* + Comando rápido de terminal.

2. **O Canvas Interativo como Demonstração da Rotina Real:**
   - O simulador passa a contar a história do **dia a dia de uma feature real**:
     - *Passo 1:* Você pede uma funcionalidade complexa (ex: Autenticação JWT com Refresh Token).
     - *Passo 2:* O Arquiteto (Claude) desenha o plano passo a passo no canvas.
     - *Passo 3 (O Efeito Uau de Valor):* Você grifa uma linha no plano e anota: *"Atenção: usar cookies HttpOnly para segurança"*. Você aprova o plano.
     - *Passo 4:* O Executor (AGY) lê o plano aprovado + as regras salvas no Obsidian e implementa o código.
     - *Passo 5:* O diff verde/vermelho aparece e os testes passam com sucesso.

3. **Seção "O Caos Atual vs. A Vida com CGLI" (Antes e Depois):**
   - Tabela comparativa visual mostrando a dor do fluxo tradicional vs a tranquilidade do CGLI.

4. **Seção "3 Momentos em que o CGLI Salva a Sua Semana" (Casos de Uso Concretos):**
   - **Caso 1: Refatorações e Migrações Perigosas:** Mudar a stack ou o banco sem medo porque cada etapa tem um plano aprovado e um diff visual.
   - **Caso 2: Features Complexas Full-Stack:** Separar o planejamento de backend/frontend da codificação real.
   - **Caso 3: Onboarding e Projetos em Equipe:** Agentes que respeitam automaticamente a memória histórica da equipe gravada no repositório.

5. **Como Começar em 1 Minuto (Zero Fricção):**
   - Clone o repo e rode o desktop com 2 comandos simples.
