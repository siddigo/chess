# Roadmap

Ideias de melhoria organizadas em etapas. As etapas 0, 1 e 2 não dependem de contas de usuário e podem ser feitas em qualquer ordem. Da 3 em diante, cada etapa depende das anteriores.

```
Etapa 0   Nível 6 (só notação)                              independente
Etapa 1   Assistir partidas (melhorias no modo espectador)  independente (link pelo perfil vem com a 4)
Etapa 2   Engine: análise pós-jogo e análise ao vivo        independente (ao vivo precisa da 1)
Etapa 3   Contas: registro, login, perfil                   base das funções sociais
Etapa 4   Meus jogos + busca por usuário                    precisa da 3
Etapa 5   Status (online / jogando / offline)               precisa da 3
Etapa 6   Desafiar usuário específico                       precisa da 4 e da 5
Etapa 7   Amigos + desafiar amigo                           precisa da 6
Etapa 8   Chat: partida, plateia, entre usuários            partida/plateia: só precisam da 1; DM precisa da 3 (melhor com a 7)
Etapa 9   Torneios                                          precisa da 6
```

---

## Etapa 0 — Nível 6: só a notação

Nível mais difícil: não há tabuleiro, só a lista de lances.

- [ ] Ampliar a restrição `white_level`/`black_level` no `supabase/schema.sql` para `between 0 and 6`, e a validação em `lib/api.js`.
- [ ] Em `public/game.html`, no nível 6, esconder o tabuleiro e mostrar a notação em destaque (último lance grande + lista completa).
- [ ] **Entrada de lances por texto** (SAN, ex.: `Cf3`, `exd5`, `O-O`), aceitando notação em português e em inglês conforme a configuração. Sem tabuleiro, não há como clicar.
- [ ] Feedback de lance inválido/ambíguo sem revelar a posição além do que a notação já revela.
- [ ] Incluir o nível 6 no replay (`public/replay.html`), no histórico, no seletor do espectador e na tabela de níveis do README.

**A decidir:** o nível 5 continua permitindo clicar no tabuleiro invisível? O nível 6 aceita só texto ou também um teclado de casas (a1–h8)?

---

## Etapa 1 — Assistir partidas em andamento

**Já existe:** lista de partidas ao vivo na página inicial (`public/index.html`) e, para o espectador, escolha do nível de visualização (`#spectator-level` em `public/game.html`).

- [ ] Opção **"Ver como as brancas / Ver como as pretas"**: o espectador assume o nível e a orientação daquele jogador e vê exatamente o que ele vê.
- [ ] Página dedicada de **partidas ao vivo**, com mais informações: ritmo, níveis, número de lances, relógios e número de espectadores.
- [ ] Contador de espectadores na partida (Presence no canal da partida).
- [ ] Botão "Assistir" no perfil do usuário quando ele estiver jogando (depende das etapas 4 e 5).
- [ ] Opcional: miniatura do tabuleiro na lista (no nível 0, ou no nível escolhido pelo espectador).

---

## Etapa 2 — Análise com engine

Stockfish é open source (licença **GPL v3**) e tem versão compilada para **WebAssembly**, que roda no navegador do próprio usuário: sem custo de servidor. Ao distribuir o arquivo `.wasm`, é preciso incluir a licença e indicar onde está o código-fonte (basta citar nos créditos e manter os arquivos de licença junto).

**2a. Análise pós-jogo**
- [ ] Integrar o Stockfish WASM num Web Worker (protocolo UCI), sem travar a página.
- [ ] Analisar cada posição da partida com profundidade/tempo configurável e barra de progresso.
- [ ] **Barra de avaliação** (centipawns e mate em N) acompanhando o replay lance a lance.
- [ ] **Melhores lances** de cada posição (top 1–3 linhas), com seta no tabuleiro.
- [ ] **Classificação de cada lance** pela perda de avaliação: excelente, bom, imprecisão (?!), erro (?), capivarada (??).
- [ ] Resumo por jogador: precisão média, número de imprecisões, erros e capivaradas.
- [ ] Gráfico de avaliação ao longo da partida (clicar num ponto leva ao lance).
- [ ] Opcional: guardar a análise no banco para não recalcular (`game_analysis`).

**2b. Análise ao vivo (para espectadores)**
- [ ] Liga/desliga no painel do espectador, com o que mostrar escolhido na hora:
  - nada;
  - só a barra de avaliação;
  - classificação do último lance (bom, imprecisão, erro...);
  - melhores lances sugeridos.
- [ ] Preferência salva no navegador, como as outras configurações.
- [ ] **Antitrapaça:** os jogadores da partida nunca veem a análise. Como alguém pode abrir a partida em outra aba como espectador, considerar:
  - atraso na análise ao vivo (ex.: só mostra até o lance N−1, ou com X segundos de atraso);
  - em torneios (Etapa 9), análise ao vivo desligada ou com atraso maior;
  - o chat da plateia (Etapa 8) nunca chega aos jogadores.

---

## Etapa 3 — Contas: registro, login e perfil

Hoje o jogador é identificado por um token salvo no navegador. Esta etapa cria a identidade que as etapas seguintes usam.

**3a. Autenticação**
- [ ] Supabase Auth (e-mail + senha; opcionalmente login com Google).
- [ ] Páginas de registro, login, "esqueci minha senha" e logout.
- [ ] A API (`lib/api.js`) passa a validar o JWT do Supabase e saber qual usuário fez a requisição.

**3b. Perfil**
- [ ] Tabela `profiles` (`id` = `auth.users.id`, `username` único, `display_name`, `avatar_url`, `created_at`).
- [ ] Upload de foto no Supabase Storage (bucket `avatars`, com limite de tamanho e redimensionamento).
- [ ] Página "Editar perfil".

**3c. Ligar partidas a usuários**
- [ ] Colunas `white_user_id` e `black_user_id` (nulas para convidados) em `games`.
- [ ] Ao criar/aceitar desafio logado, o nome vem do perfil.
- [ ] Opcional: ao fazer login, "reivindicar" partidas antigas cujo token está no `localStorage`.

**A decidir:** continuar permitindo jogar como convidado, sem conta? (Sugestão: sim, mas recursos sociais só para logados.)

---

## Etapa 4 — Lista de jogos do usuário e busca por usuário

- [ ] Página de perfil público (`/u/<username>`): foto, nome, estatísticas (V/E/D, por nível) e lista de partidas.
- [ ] "Meus jogos": partidas em andamento (com link para voltar) e encerradas (com link para o replay e a análise da Etapa 2).
- [ ] Busca por usuário (por `username`/`display_name`, com índice `pg_trgm` ou `ilike`).
- [ ] O histórico atual passa a filtrar por usuário em vez de por nome digitado.
- [ ] Opcional: estatísticas de precisão média (Etapa 2) no perfil.

---

## Etapa 5 — Status do usuário

- [ ] Supabase Realtime **Presence** num canal global (`lobby`) para saber quem está online.
- [ ] Status derivado: **online**, **jogando** (tem partida `playing`, com link para assistir), **offline** (com "visto por último").
- [ ] Indicador de status no perfil, na busca e (depois) na lista de amigos.

---

## Etapa 6 — Desafiar usuário específico

- [ ] Botão "Desafiar" no perfil e na busca: abre o formulário atual (nível, cor, ritmo) já com o adversário definido.
- [ ] Tabela `challenges` (de, para, configuração, status: pendente / aceito / recusado / expirado).
- [ ] Notificação em tempo real para o desafiado (canal privado `user:<id>`), com aceitar/recusar.
- [ ] Lista de desafios recebidos e enviados; expiração automática.
- [ ] O desafio por link continua existindo para quem não tem conta.

---

## Etapa 7 — Amigos

- [ ] Tabela `friendships` (solicitante, destinatário, status: pendente / aceita / bloqueada).
- [ ] Enviar, aceitar, recusar e desfazer amizade; bloquear usuário.
- [ ] Lista de amigos com status (Etapa 5), botão **Desafiar amigo** (reusa a Etapa 6) e **Assistir** quando o amigo estiver jogando.
- [ ] Opcional: só amigos podem desafiar diretamente / mandar mensagem (configuração de privacidade).

---

## Etapa 8 — Chat

Três chats separados, que nunca se misturam:

| Chat | Quem escreve | Quem lê |
|---|---|---|
| Partida | os dois jogadores | os dois jogadores |
| Plateia | espectadores | só espectadores (jogadores **não** veem) |
| Entre usuários | participantes da conversa | participantes da conversa |

**8a. Chat na partida**
- [ ] Tabela `game_messages` (partida, autor, texto, horário); envio pela API, entrega por canal próprio dos jogadores.
- [ ] Mensagens rápidas prontas ("Boa partida", "Bom lance", "Obrigado").
- [ ] Opção para silenciar o chat do adversário.
- [ ] Pode ser antecipado: funciona com os tokens atuais, sem login.

**8b. Chat da plateia**
- [ ] Tabela `spectator_messages` e canal separado (`game:<id>:plateia`); a API recusa mensagens de quem é jogador da partida e não entrega o canal na tela dos jogadores.
- [ ] Apelido para espectadores sem conta, ou chat só para logados (facilita moderação).
- [ ] Limite de frequência (anti-flood) e opção de esconder o chat.
- [ ] Antitrapaça: mesmo cuidado da Etapa 2b — um jogador pode abrir a partida como espectador em outra aba. Avaliar atraso nas mensagens ou exigir login e bloquear contas que sejam jogadoras da partida.

**8c. Chat entre usuários**
- [ ] Tabelas `conversations` e `messages`, com RLS: só participantes leem.
- [ ] Lista de conversas, contador de não lidas, entrega em tempo real pelo canal `user:<id>`.
- [ ] Respeitar bloqueios e a configuração de privacidade da Etapa 7.

---

## Etapa 9 — Torneios

Regras fixas para todas as partidas do torneio.

- [ ] Tabela `tournaments` (nome, organizador, formato, ritmo, nível de visualização, nº de rodadas, inscrições abertas até, status).
- [ ] Tabela `tournament_players` (inscrição, pontuação, desempate) e `games.tournament_id` + `round`.
- [ ] **Regras fixas:** ritmo e nível definidos pelo organizador; nenhum jogador pode alterar.
- [ ] Formato inicial: **todos contra todos** (mais simples). Depois: **suíço** e **eliminatório**.
- [ ] Emparelhamento automático por rodada, com alternância de cores.
- [ ] Tabela de classificação ao vivo, com desempates (Sonneborn-Berger, confronto direto).
- [ ] Regras para W.O. (jogador não aparece em X minutos) e abandono.
- [ ] Página do torneio: inscritos, rodadas, partidas em andamento (assistir) e classificação.
- [ ] Regra de análise ao vivo e chat da plateia durante o torneio (ver Etapas 2b e 8b).

**A decidir:** o nível é igual para todos ou cada jogador escolhe o seu no momento da inscrição (e mantém até o fim)?
