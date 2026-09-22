# Plano: Otimização dos Nós de Agente e Persistência do AGY

Este documento descreve as melhorias e correções no ambiente CGLI:
1. **Remoção do Rodapé Inútil**: Eliminação do input de prompt e atalhos rápidos de comandos no rodapé do nó de agente, priorizando a área e usabilidade direta do terminal nativo xterm.js.
2. **Visão de Imagens e Suporte a Ctrl+V**: Manutenção do atalho de colar imagem (Ctrl+V) diretamente no cartão/terminal do agente e conexão de nós de imagem via arestas, salvando em disco (`.cgli/attachments/`) com o comando `save_attachment` para que o CLI (Claude e AGY) possa ler e processar os arquivos visualmente.
3. **Persistência Confiável de Sessão do AGY**: Garantia de que tanto os subagentes quanto instâncias comuns do AGY salvem `hasStarted` e o buffer de saída do terminal, recuperem o histórico após reinício e utilizem identificadores de conversa dedicados (`--conversation <id>` / `--continue`).
