// Edge Function "clima" — Pesquisa de Clima da Equipe, link pessoal (modos "identificação opcional" e "identificada").
// Pública: no painel, desligue "Verify JWT" (supabase/config.toml já declara). Ação: codigo {token, canal} — manda o código
// de confirmação por e-mail (Resend) ou WhatsApp (sem provedor ainda). Segredos: RESEND_API_KEY?, EMAIL_REMETENTE?,
// WHATSAPP_PROVEDOR?, SITE_URL. Lógica em supabase/funcoes-compartilhadas/clima.js. Para colar no painel do Supabase use
// dist/funcoes/clima/index.ts (gerado por npm run montar:funcoes).
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { atenderClima, criarBaseClima } from '../../funcoes-compartilhadas/clima.js';

Deno.serve((req) => atenderClima(req, criarBaseClima(createClient, (n) => Deno.env.get(n))));
