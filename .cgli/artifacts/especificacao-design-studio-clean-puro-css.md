# Especificação Técnica: Design Studio Clean em CSS Puro (Anti-Slop)

**Data:** 11 de Novembro de 2026  
**Status:** Implementado & Validado  
**Arquivo Principal:** `site/index.html` e `cgli_inline_widget.html`

## 1. Contexto e Motivação
A primeira versão da landing page apresentava dependências de scripts externos (Tailwind CDN) que causavam inconsistências de renderização em ambientes headless, além de uma estética genérica ("AI slop") com jargões de stack que não transmitiam o real valor do produto para o usuário final.

Através de uma pesquisa aprofundada nas referências de ferramentas de engenharia de elite (*Zed*, *Ghostty*, *Linear*, *Astral/uv*, *Warp*, *tldraw*), o design foi inteiramente refeito para uma estética **Studio Clean** em puro HTML, CSS e Vanilla JS, com foco 100% no valor para o desenvolvedor: **eliminação do caos de 10 abas de terminal, fim da ansiedade do Enter às cegas e supervisão humana direta sobre agentes de código**.

---

## 2. Pilares de Design Implementados

### 2.1 Tokens Visuais Studio Clean
- **Fundo Base:** `#0B0D13` (ardósia escuro ultra-profundo) com glow sutil radial índigo no topo.
- **Superfícies:** Camadas `#11141E` e `#161A26` com micro-bordas `rgba(255, 255, 255, 0.08)` e chanfros internos (`inset 0 1px 0 rgba(255, 255, 255, 0.07)`).
- **Zero Dependências Externas:** 100% do CSS embutido em `<style>`, garantindo renderização instantânea sem flash de layout não estilizado (FOUC).
- **Tipografia:** Pilha de fontes nativas do sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", ui-monospace`).

### 2.2 Vetorização & Eliminação de Emojis
- Substituição de todos os emojis por ícones vetoriais SVG monocromáticos e semânticos.
- Marcadores de nós de agente (Claude Arquiteto, AGY Executor, Documento de Plano, Memória Obsidian e Diff) com crachás, avatares geométricos e badges de status dedicados.

### 2.3 Mesa de Trabalho Studio OS & Conexões Bézier Dinâmicas
- Moldura de janela OS com botões macOS (vermelho, amarelo, verde) e breadcrumb do repositório (`~/meu-projeto • branch: feature/auth-jwt`).
- Nós do canvas totalmente arrastáveis via ponteiro/mouse com recálculo matemático de curvas cúbicas de Bézier em tempo real.
- Simulação de esteira interativa (Passo 1/5: Demanda -> 2/5: Plano do Arquiteto -> 3/5: Canetada Humana -> 4/5: Execução Guiada -> 5/5: Diff & Paz).

### 2.4 Split-Screen Comparativo de Alto Impacto
- **Lado Esquerdo (Caos Tradicional):** O terminal claustrofóbico com 12 abas, comando perigoso `--dangerously-skip-permissions`, difusão de 800 linhas sem contexto e ansiedade do "Enter".
- **Lado Direito (CGLI Workbench):** Mesa única de governança, plano auditado antes do código, regras de segurança do Obsidian preservadas e diff estritamente focado no escopo.

---

## 3. Validação Visual
- `14-showcase-pure-css-hero.png`: Validação da seção de Hero e Canvas interativo.
- `15-showcase-pure-css-full.png`: Validação das seções de diagnóstico comparativo e casos de uso.
- `16-showcase-pure-css-complete.png`: Validação de página inteira (Hero, Canvas, Comparativo, Casos de Uso, Quickstart e Rodapé).
- `17-widget-preview.png`: Validação do widget interativo compacto para incorporação inline no chat.
