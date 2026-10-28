// Lê as variáveis do Supabase aceitando os nomes do .env.example e os que o
// painel do Supabase / a integração Supabase↔Vercel costumam criar.
// Com LOCAL_DB=1 (npm run dev:local) finge que não há Supabase: base fake local.
const first = (...names) => process.env.LOCAL_DB ? '' : names.map((n) => process.env[n]).find(Boolean) ?? '';

export const supabaseEnv = () => ({
  url: first('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
  publicKey: first('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  secretKey: first('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'),
});
