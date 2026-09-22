# Plano de Teste: Comentários por Trecho

Plano descartável, criado só para testar comentários ligados a trechos selecionados. **Nenhuma alteração de código é necessária.**

## 1. Contexto
O módulo de autenticação usa sessões em memória. Hoje o tempo de expiração da sessão é de 30 minutos e o token é renovado a cada requisição. Não há limite de tentativas de login.

## 2. Mudanças propostas
- Migrar o armazenamento de sessões para um banco persistente.
- Reduzir o tempo de expiração da sessão para 15 minutos.
- Adicionar limite de 5 tentativas de login por minuto por IP.
- Registrar em log todo login que falhar.

## 3. Comparativo de opções

| Opção | Armazenamento | Custo | Complexidade |
|-------|---------------|-------|--------------|
| A | Redis | Médio | Baixa |
| B | PostgreSQL | Baixo | Média |
| C | Arquivo local | Nenhum | Baixa |

## 4. Exemplo de configuração
```ts
const sessionConfig = {
  store: 'redis',
  ttlMinutes: 15,
  maxLoginAttempts: 5,
}
```

## 5. Riscos
1. Perda de sessões ativas durante a migração.
2. Usuários atrás do mesmo IP (rede corporativa) podem ser bloqueados por engano.

## Passos para o agente executar
1. Confirmar que recebeu o plano aprovado.
2. Listar, numerados, **todos os comentários** recebidos, informando para cada um **a qual trecho do plano ele se refere** (ou "comentário geral" se não houver trecho).
3. Responder em 2 a 3 linhas resumindo como pretende considerar cada comentário.
4. **Não editar, criar ou apagar nenhum arquivo. Não executar comandos.**

## Como testar (para o usuário)
- Selecione um trecho (por exemplo "15 minutos" em 2. Mudanças propostas) e clique em **Comentar**.
- Faça outro comentário em um trecho da tabela e um **comentário geral** (sem selecionar nada).
- Clique num comentário e veja se o plano rola até o trecho; clique num trecho destacado e veja se o comentário abre.
- Clique em **Aprovar e Executar (+N)** e confira se o agente informa o trecho de cada comentário.
