// Aplica supabase/schema.sql no banco: npm run db:setup
// Requer SUPABASE_DB_URL no .env (Supabase → Connect → Session pooler). Nunca imprime a URL.
import fs from 'node:fs';
import pg from 'pg';

try {
  process.loadEnvFile('.env');
} catch {}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Defina SUPABASE_DB_URL no .env (Supabase → Connect → Connection String → Session pooler).');
  process.exit(1);
}

// Monta a conexão por partes, para aceitar senhas com caracteres especiais (/, ?, @, #…).
function parse(u) {
  const m = u.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:\/]+)(?::(\d+))?\/([^?]+)/);
  if (!m) throw new Error('SUPABASE_DB_URL não está no formato postgresql://usuario:senha@host:porta/postgres');
  const [, user, password, host, port, database] = m;
  return { user, password, host, port: Number(port ?? 5432), database };
}

let conn;
try {
  conn = parse(url);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const client = new pg.Client({ ...conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
  await client.query(fs.readFileSync('supabase/schema.sql', 'utf8'));
  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('games', 'game_secrets') order by 1`);
  console.log('Schema aplicado. Tabelas:', rows.map((r) => r.table_name).join(', '));
  // Avisa a API do Supabase (PostgREST) para recarregar o cache de tabelas.
  await client.query(`notify pgrst, 'reload schema'`);
} catch (err) {
  console.error('Falhou:', err.message.replaceAll(conn.password, '***'));
  if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/.test(err.code ?? err.message))
    console.error('→ Sua rede provavelmente não tem IPv6. Use a string do "Session pooler" (Connect → Connection String).');
  if (/password authentication/.test(err.message)) console.error('→ Senha do banco incorreta (Project Settings → Database → Reset database password).');
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
