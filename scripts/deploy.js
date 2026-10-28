// Publica uma versão em produção: npm run deploy -- vX.Y.Z
// Aponta a branch prod para a tag escolhida (avança ou volta) e a Vercel faz o deploy.
// Sem argumento, mostra a versão em produção e as tags disponíveis; com --escolher,
// pergunta qual publicar (usado pela tarefa do VS Code).
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (msg) => (console.error('✗ ' + msg), process.exit(1));

git('fetch', 'origin', '--tags', '--prune', '--prune-tags');
const prodSha = (() => {
  try {
    return git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/prod');
  } catch {
    return '';
  }
})();
const prodTag = prodSha && git('tag', '--points-at', prodSha, '--list', 'v*');
const current = prodSha ? prodTag || `${prodSha.slice(0, 7)} (sem tag)` : 'nenhuma (branch prod ainda não existe)';

let tag = process.argv[2];
if (!tag || tag === '--escolher') {
  const pick = tag === '--escolher';
  console.log(`Em produção: ${current}\n\nVersões (mais recentes primeiro):`);
  const tags = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean).slice(0, 15);
  console.log(tags.map((t, i) => `  ${pick ? `${i + 1}) ` : ''}${t}${t === prodTag ? '  ← produção' : ''}`).join('\n') || '  (nenhuma)');
  if (!pick || !tags.length) {
    console.log('\nUso: npm run deploy -- vX.Y.Z');
    process.exit(0);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\nNúmero ou tag a publicar (Enter cancela): ')).trim();
  rl.close();
  if (!answer) fail('Cancelado.');
  tag = tags[Number(answer) - 1] ?? answer;
}

if (!git('tag', '--list', tag)) fail(`A tag ${tag} não existe no GitHub. Feche a versão com npm run release.`);
const sha = git('rev-parse', `${tag}^{commit}`);
if (sha === prodSha) fail(`${tag} já está em produção.`);

console.log(`Produção: ${current} → ${tag}`);
// --force-with-lease: aceita voltar versão, mas falha se alguém mexeu em prod nesse meio-tempo.
execFileSync('git', ['push', `--force-with-lease=refs/heads/prod:${prodSha}`, 'origin', `${sha}:refs/heads/prod`], { stdio: 'inherit' });
console.log(`\n✓ prod aponta para ${tag}. Acompanhe o deploy no painel da Vercel.`);
