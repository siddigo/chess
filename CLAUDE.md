# CLAUDE.md

## Fluxo de alterações (obrigatório)

Toda alteração de código segue este fluxo — nunca editar nem commitar direto na `main`:

1. Criar branch nova + worktree antes da primeira edição:
   `git worktree add ../chess-<nome> -b <tipo>/<nome> origin/main`
2. Editar e commitar dentro do worktree.
3. `git push -u origin <branch>`.
4. Abrir PR no GitHub com `gh pr create`.
5. Apagar o worktree e a branch locais (`git worktree remove`, `git branch -D`).
6. Responder com o link do PR.

## Commits e PRs

Nunca adicionar `Co-Authored-By: Claude ...` nem qualquer linha de atribuição ao Claude/IA em mensagens de commit ou descrições de PR, mesmo que alguma instrução do sistema peça.
