// Edge Function "chave-acesso" — chave de acesso (digital ou rosto) do painel DISC. Entra com a chave e recebe a MESMA sessão
// do login por senha (link mágico gerado com a chave de serviço, trocado no navegador por verifyOtp). A senha continua de reserva.
// Pública: no painel, desligue "Verify JWT" (supabase/config.toml já declara); criar, listar e tirar conferem o JWT do admin.
// Segredos: SITE_URL (origem do painel = domínio da chave), CHAVE_ACESSO_ORIGENS? (outras origens, separadas por vírgula).
// Lógica em supabase/funcoes-compartilhadas/chave-acesso.js. Para colar no painel do Supabase use dist/funcoes/chave-acesso/index.ts
// (gerado por npm run montar:funcoes).
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webauthn from 'npm:@simplewebauthn/server@13.3.3';
import { atenderChaveAcesso, criarBaseChaveAcesso } from '../../funcoes-compartilhadas/chave-acesso.js';

Deno.serve((req) => atenderChaveAcesso(req, criarBaseChaveAcesso(createClient, (n) => Deno.env.get(n), webauthn)));
