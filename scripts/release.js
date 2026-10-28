// Fecha uma versão: npm run release -- <patch|minor|major|X.Y.Z>
// Atualiza o package.json, cria o commit e a tag vX.Y.Z em main, envia ao GitHub
// e abre a release com as notas geradas. NÃO publica: para isso, npm run deploy.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: 'inherit' });
const fail = (msg) => (console.error('✗ ' + msg), process.exit(1));

const arg = process.argv[2];
if (!arg) fail('Uso: npm run release -- <patch|minor|major|X.Y.Z>');

if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Feche versões a partir de main.');
if (git('status', '--porcelain')) fail('Há alterações não commitadas.');
git('fetch', 'origin', 'main', '--tags');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) fail('main local difere de origin/main: faça pull/push antes.');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const version = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[arg] ?? arg;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`Versão inválida: ${version}`);
const tag = 'v' + version;
if (git('tag', '--list', tag)) fail(`A tag ${tag} já existe.`);

// Se a versão for a mesma do package.json (ex.: a primeira release), só cria a tag.
if (version !== pkg.version) {
  for (const file of ['package.json', 'package-lock.json']) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.version = version;
    if (json.packages?.['']) json.packages[''].version = version;
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  }
  run('git', 'commit', '-am', `Versão ${version}`);
}
run('git', 'tag', '-a', tag, '-m', `Versão ${version}`);
run('git', 'push', 'origin', 'main', tag);
run('gh', 'release', 'create', tag, '--title', tag, '--generate-notes', '--verify-tag');

console.log(`\n✓ ${tag} fechada. Para publicar: npm run deploy -- ${tag}`);
