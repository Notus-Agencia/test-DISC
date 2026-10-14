// Edge Function "vagas-conta" — contas do Vagas sem Caos (cadastrar, reenviar, esqueci, assistido, operador, excluir, foto,
// convite_equipe, avisar_lista_espera).
// Pública: no painel, desligue "Verify JWT" (supabase/config.toml já declara); as ações de operação e exclusão conferem o JWT
// sozinhas. Segredos: RESEND_API_KEY, VAGAS_SITE_URL, VAGAS_EMAIL_REMETENTE?, TURNSTILE_SECRET?. Lógica em
// supabase/funcoes-compartilhadas/vagas-conta.js. Para colar no painel do Supabase use dist/funcoes/vagas-conta/index.ts
// (gerado por npm run montar:funcoes).
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { atenderVagasConta, criarBaseVagasConta } from '../../funcoes-compartilhadas/vagas-conta.js';

Deno.serve((req) => atenderVagasConta(req, criarBaseVagasConta(createClient, (n) => Deno.env.get(n))));
