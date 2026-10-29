# ♞ Xadrez às Cegas

Desafie amigos no xadrez com **níveis de visualização individuais**: cada jogador escolhe seu nível antes da partida, e ele não pode ser trocado depois.

| Nível | O que você vê |
|---|---|
| 0 | Xadrez normal |
| 1 | Cavalos e bispos viram peças de damas |
| 2 | Cavalos, bispos e torres viram peças de damas |
| 3 | Tudo, menos os peões, vira peça de damas |
| 4 | Todas as peças viram peças de damas |
| 5 | Peças invisíveis (só a notação e o destaque do último lance) |
| 6 | Sem tabuleiro: só a lista de lances; os lances são digitados |

## Arquitetura

```
navegador ──HTTP──► Vercel (função em São Paulo, lib/api.js) ──► Supabase Postgres (São Paulo)
    ▲                                          │
    └──── Supabase Realtime Broadcast ◄────────┘  (canal privado: só o servidor envia)
```

- **Front-end**: HTML/CSS/JS puros em `public/`, servidos pela CDN da Vercel.
- **API**: uma única função serverless (`api/handler.js` → `lib/api.js`). Valida os lances com chess.js e controla o relógio.
- **Banco**: tabela `games`, com leitura pública e escrita só pelo servidor, e tabela `game_secrets`, com os tokens dos jogadores, inacessível ao navegador.
- **Tempo real**: depois de gravar cada lance, o servidor publica o novo estado num canal **Broadcast privado** (`game:<id>`). O navegador só pode receber; ninguém consegue forjar lances. As alterações da tabela (Postgres Changes) servem de reserva, mais lenta (~400 ms a mais).
- **Espectadores**: contados com Realtime **Presence** num canal público único (`espectadores`); cada aba de espectador informa qual partida está assistindo.
- **Relógio**: não há timer no servidor. O tempo é calculado a partir do horário de cada lance. Quando um relógio zera, o cliente avisa e o servidor confere.
- **Compensação de lag**: até 1 s por lance do tempo gasto na rede deixa de ser cobrado do relógio.

## Deploy (Supabase + Vercel)

### 1. Supabase

1. Crie um projeto escolhendo a região **South America (São Paulo)**. A região não pode ser trocada depois.
2. Aplique o [`supabase/schema.sql`](supabase/schema.sql) de um destes jeitos:
   - colando o arquivo no **SQL Editor** e clicando em **Run**; ou
   - pondo `SUPABASE_DB_URL` no `.env` (botão **Connect** → Connection String) e rodando `npm run db:setup`.
3. Em **Project Settings → API Keys** (ou **API**), anote:
   - a **Project URL** (`https://xxxx.supabase.co`);
   - a chave **publishable** (`sb_publishable_...`) ou a **anon** (legacy);
   - a chave **secret** (`sb_secret_...`) ou a **service_role** (legacy). Esta é secreta: nunca coloque no front-end nem no GitHub.

### 2. Vercel

1. Suba este projeto para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório. O preset **Other** serve; o `vercel.json` já define o build, a pasta `public` e a região `gru1` (São Paulo).
3. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`) | Project URL |
   | `SUPABASE_ANON_KEY` (ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | chave publishable/anon |
   | `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`) | chave secret/service_role |
   | `ADMIN_PASSWORD` | uma senha sua, usada para apagar partidas do histórico |

4. Clique em **Deploy**.
5. Em **Settings → Environments → Production → Branch Tracking**, troque `main` por `prod`.

### 3. Versões e publicação

Produção é a branch `prod`, que sempre aponta para uma tag de versão. Pushes em `main` não geram deploy (`git.deploymentEnabled` no `vercel.json`); outras branches geram previews.

```bash
npm run release -- minor   # ou patch, major, 1.4.0: commit + tag vX.Y.Z em main + release no GitHub
npm run deploy             # mostra a versão em produção e as tags disponíveis
npm run deploy -- v1.4.0   # aponta prod para v1.4.0 (avançar ou voltar versão) e a Vercel publica
```

No VS Code: **Ctrl+Shift+P → Tasks: Run Task → Fechar release** (escolhe patch/minor/major) ou **Deploy em produção** (lista as versões e pergunta qual publicar).

O `release` exige estar em `main`, sem alterações pendentes e sincronizado com `origin/main`, e usa o `gh` (GitHub CLI) para criar a release.

> Se mudar alguma variável de ambiente depois, faça um **Redeploy**: a chave pública é gravada no `config.js` durante o build.

## Rodar localmente

Requer Node.js 20 ou mais novo.

```bash
npm install
npm run dev        # http://localhost:3000
```

- **Sem `.env`**: modo 100% local, sem Supabase. Os dados ficam em `data/dev-games.json` e as atualizações chegam por polling (1 s). Bom para testar.
- **Com `.env`** (copie de [`.env.example`](.env.example)): usa o mesmo Supabase da produção.

Para conferir a configuração do Supabase, deixe `npm run dev` rodando e, em outro terminal, rode `npm run check`. Ele testa as tabelas, as permissões do navegador, o Realtime (com a latência de cada lance) e uma partida completa, e apaga as partidas de teste no final.

## Como jogar

1. Em **Jogar**, informe seu nome, escolha seu nível, a cor e o ritmo, e crie o desafio.
2. Copie o link e mande para o amigo. Ele escolhe o nível dele e aceita.
3. Mova clicando (origem → destino) ou arrastando. Mesmo no nível 5 dá para clicar numa casa: se houver uma peça sua, os lances possíveis aparecem.
   No nível 6 não há tabuleiro: digite o lance na notação escolhida nas configurações (ex.: `Cf3`/`Nf3`, `exd5`, `O-O`, `e8=D`/`e8=Q`) ou com as casas de origem e destino (`g1f3`).
4. Configurações no painel lateral (ficam salvas no navegador):
   - mostrar ou ocultar os lances possíveis;
   - notação em português (C, B, T, D, R) ou em inglês (N, B, R, Q, K);
   - revelar as peças quando a partida terminar.

O relógio começa a correr assim que o desafio é aceito. Até o segundo lance, a partida ainda pode ser abortada.

Se você fechar a aba, basta abrir o link da partida de novo **no mesmo navegador**: ele lembra que você é jogador dela.

## Assistir partidas

A página **Ao vivo** (`/ao-vivo`) lista as partidas em andamento com os jogadores, os níveis, o ritmo, o número de lances, os relógios correndo e quantas pessoas estão assistindo. Cada partida tem uma miniatura do tabuleiro no nível escolhido no topo da página (ou nenhuma).

Quem abre uma partida da qual não é jogador entra como espectador e escolhe no painel lateral:

- **como as brancas / como as pretas**: vê exatamente o que aquele jogador vê, no nível e no lado dele (no nível 6, só a notação);
- **nível livre**: qualquer nível de 0 a 6.

A escolha fica salva no navegador e também pode vir no link: `/game/<id>?ver=w`, `?ver=b` ou `?ver=0` a `?ver=6`. O número de espectadores aparece na partida para todos, inclusive os jogadores. No modo local (sem Supabase) não há contagem.

O espectador também pode ligar a **análise ao vivo** e escolher o que ver: barra de avaliação, classificação do lance e melhores lances. Para que um jogador não use a análise abrindo a própria partida como espectador em outra aba, enquanto a partida está em andamento ela fica **um lance atrás** (posição depois do lance N−1) e os melhores lances mostram só o primeiro lance de cada linha, nunca a continuação. Na tela dos jogadores o painel não aparece e o engine nem é carregado.

## Análise com engine

Na revisão de uma partida encerrada, **Analisar partida** roda o [Stockfish](https://stockfishchess.org/) no próprio navegador (WebAssembly, num Web Worker: nada passa pelo servidor), com profundidade rápida (10), normal (14) ou profunda (18). Mostra:

- barra de avaliação ao lado do tabuleiro, acompanhando o lance escolhido;
- as 3 melhores linhas da posição, com setas no tabuleiro;
- a classificação de cada lance pela perda de chance de vitória de quem jogou: excelente, bom, imprecisão (?!), erro (?) e capivarada (??);
- precisão média e número de imprecisões, erros e capivaradas de cada jogador;
- gráfico de avaliação ao longo da partida (clique para ir ao lance).

A análise fica salva no navegador (`localStorage`) para não recalcular. Durante a partida, a revisão não oferece análise.

## Histórico

A página **Histórico** permite:

- filtrar por jogador (mostra vitórias, empates e derrotas);
- revisar a partida lance a lance (setas ← →) em qualquer nível de visualização;
- baixar ou copiar o PGN. O PGN traz as tags extras `WhiteVisionLevel` e `BlackVisionLevel`;
- apagar partidas. Pede a `ADMIN_PASSWORD`.

## Créditos

Peças: conjunto *cburnett* (Colin M.L. Burnett, CC BY-SA 3.0), o mesmo do Lichess.

Engine: [Stockfish](https://github.com/official-stockfish/Stockfish) 17.1, na versão WebAssembly [Stockfish.js](https://github.com/nmrugg/stockfish.js) (Nathan Rugg / Chess.com), licença **GPL v3**. O build copia o engine para `public/vendor/stockfish/` junto com a licença (`COPYING.txt`) e os autores (`AUTHORS.txt`); o código-fonte está nos repositórios citados. A curva de chance de vitória e a fórmula de precisão seguem as do Lichess.
