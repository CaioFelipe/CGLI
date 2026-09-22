# Plano de Teste: Comentários no Artefato

Plano descartável, criado só para testar o fluxo de comentários e aprovação. **Nenhuma alteração de código é necessária.**

## Objetivo
Verificar se os comentários adicionados neste nó chegam ao agente junto com o plano quando o usuário clica em "Aprovar e Executar".

## Passos para o agente executar
1. Confirmar que recebeu o plano aprovado.
2. Listar, numerados, **todos os comentários do usuário** recebidos junto com este plano (se não houver nenhum, dizer explicitamente "nenhum comentário recebido").
3. Responder em 2 a 3 linhas resumindo como pretende considerar cada comentário.
4. **Não editar, criar ou apagar nenhum arquivo. Não executar comandos.**

## Como testar (para o usuário)
- Abra a aba **Comentários** e adicione 2 ou 3 comentários, por exemplo:
  - "Responder sempre em português"
  - "Usar no máximo 3 linhas na resposta"
- Clique em **Aprovar e Executar (+N)**.
- Confira: o agente lista os mesmos comentários e o card do agente mostra o banner verde **Plano aprovado**.
