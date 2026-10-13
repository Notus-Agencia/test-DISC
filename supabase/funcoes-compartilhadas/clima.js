// Edge Function "clima" (pública; "Verify JWT" desligado): manda o código de confirmação do link pessoal da Pesquisa de
// Clima (modos "identificação opcional" e "identificada"; migração 20261018120000_clima_identificacao.sql).
//
// POST {acao:'codigo', token: <64 hex do link pessoal>, canal: 'email' | 'whatsapp'}
//   -> {ok:true, canal, destino: 'a***@e***.com.br' | 'final 88', minutos: 10}
//   -> {ok:false, erro} com mensagem ÚNICA para link inválido/usado/sem e-mail (não revela se a pessoa existe nem o que falta).
// O banco (public.clima_codigo_novo, só service_role) gera o código de 6 dígitos, guarda só o hash com sal, aplica os
// limites (1 por minuto, 5 por link a cada 24 h, 500 a cada 10 min no total) e devolve o código e o destino SÓ para esta
// função; ela manda por e-mail (Resend: RESEND_API_KEY + EMAIL_REMETENTE) ou WhatsApp (sem provedor ainda: ver whatsapp.js).
// A conferência do código acontece no envio das respostas (public.clima_enviar): validade de 10 min e 5 tentativas.
// Nada daqui grava IP nem o código em log.
import { erro, MSG_ERRO_INTERNO } from './regras.js';
import { criarResend } from './asaas.js';
import { escaparHtml, LOGO_EMAIL } from './email.js';
import { criarWhatsApp, NOMES_ENV_WHATSAPP } from './whatsapp.js';

export const NOMES_ENV_CLIMA = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SITE_URL', 'RESEND_API_KEY', 'EMAIL_REMETENTE']
  .concat(NOMES_ENV_WHATSAPP);
export const CLIMA_MSG_LINK = 'Não foi possível enviar um código por este link. Use outra forma de confirmação ou fale com quem enviou o link.';
export const CLIMA_MSG_NAO_CONFIGURADO = 'O envio do código por esta forma não está disponível agora. Use outra forma de confirmação ou fale com quem enviou o link.';
export const CLIMA_MSG_FALHOU = 'Não foi possível enviar o código agora. Tente de novo em instantes ou use outra forma de confirmação.';
const CLIMA_LIMITE_CORPO = 2000;

export function lerEnvClima(get) {
  const env = {};
  NOMES_ENV_CLIMA.forEach((n) => { let v = ''; try { v = get(n) || ''; } catch (err) { v = ''; } env[n] = String(v).trim(); });
  return env;
}

/** O que está ligado para mandar código (painel: "clima.envios" da função admin; aqui: antes de gerar o código). */
export function climaEnviosDisponiveis(env, fetchFn) {
  return {
    email: !!String((env && env.RESEND_API_KEY) || '').trim(),
    whatsapp: criarWhatsApp({ env: env || {}, fetch: fetchFn }).configurado
  };
}

/** E-mail com o código (marca Gestão sem Caos; sem link nem botão). -> {assunto, html, texto} */
export function montarEmailCodigoClima(d) {
  const codigo = String(d.codigo || '');
  const minutos = Number(d.minutos) || 10;
  const emp = String(d.empresa || '').trim();
  const intro = 'Use este código para confirmar que é você na Pesquisa de Clima da Equipe' + (emp ? ' da ' + emp : '') + ', conduzida pela Gestão sem Caos.';
  const nota = 'O código vale por ' + minutos + ' minutos. Se você não pediu este código, ignore este e-mail: ninguém consegue responder por você sem ele.';
  const quem = 'Só a consultoria (Gestão sem Caos) vê o seu nome junto com a sua resposta. A empresa só recebe resultados de grupo.';
  const P = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#13283F';
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>Seu código de confirmação</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F2EF;font-family:\'Plus Jakarta Sans\',Arial,Helvetica,sans-serif">' +
    '<span style="display:none;max-height:0;overflow:hidden;opacity:0">' + escaparHtml('Seu código: ' + codigo) + '</span>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EF;padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden">' +
    '<tr><td style="height:6px;background:#F34405;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:32px 32px 8px"><img src="' + LOGO_EMAIL + '" width="200" alt="Gestão sem Caos" style="display:block;width:200px;max-width:100%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:16px 32px 8px">' +
    '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#13283F;font-weight:700">Seu código de confirmação</h1>' +
    '<p style="' + P + '">' + escaparHtml(intro) + '</p>' +
    '<p style="margin:8px 0 24px;font-size:32px;line-height:1.2;letter-spacing:6px;font-weight:700;color:#13283F">' + escaparHtml(codigo) + '</p>' +
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5B6878">' + escaparHtml(nota) + '</p>' +
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5B6878">' + escaparHtml(quem) + '</p>' +
    '</td></tr>' +
    '<tr><td style="padding:24px 32px 32px;border-top:1px solid #E7E2DC"><p style="margin:0;font-size:12px;line-height:1.6;color:#8A94A2">' +
    'Gestão sem Caos · Pesquisa de Clima da Equipe</p></td></tr>' +
    '</table></td></tr></table></body></html>';
  const texto = ['Seu código de confirmação: ' + codigo, '', intro, '', nota, quem, '', 'Gestão sem Caos'].join('\n');
  return { assunto: 'Seu código: ' + codigo + ' — Pesquisa de Clima (Gestão sem Caos)', html, texto };
}

/** Banco (cliente service role): só a função clima_codigo_novo. */
export function criarDbClima(sb) {
  return {
    async codigoNovo(token, canal) {
      const { data, error } = await sb.rpc('clima_codigo_novo', { p_token: token, p_canal: canal });
      if (error) {
        const e = new Error('falha no banco de dados (' + String(error.message || error.code || 'erro').substring(0, 160) + ')');
        e.causa = error;
        throw e;
      }
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
  };
}

export function criarBaseClima(createClient, getEnv, extras) {
  const env = lerEnvClima(getEnv);
  const servico = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return Object.assign({ env, fetch: (u, o) => fetch(u, o), db: criarDbClima(servico) }, extras || {});
}

/** {acao:'codigo', token, canal} -> {ok, canal, destino, minutos} | {ok:false, erro} */
export async function acaoClimaCodigo(base, corpo) {
  const token = String((corpo && corpo.token) || '').trim().toLowerCase();
  const canal = corpo && corpo.canal;
  if (!/^[0-9a-f]{64}$/.test(token) || (canal !== 'email' && canal !== 'whatsapp')) return erro(CLIMA_MSG_LINK);
  const envios = climaEnviosDisponiveis(base.env, base.fetch);
  if (!envios[canal]) return erro(CLIMA_MSG_NAO_CONFIGURADO, { naoConfigurado: true });
  const r = await base.db.codigoNovo(token, canal);
  if (!r || r.ok !== true) return erro((r && r.erro) || CLIMA_MSG_LINK);
  try {
    if (canal === 'email') {
      const m = montarEmailCodigoClima({ codigo: r.codigo, empresa: r.empresaNome, minutos: r.minutos });
      await criarResend({ apiKey: base.env.RESEND_API_KEY, remetente: base.env.EMAIL_REMETENTE, fetch: base.fetch })
        .enviar({ para: r.destino, assunto: m.assunto, html: m.html, texto: m.texto });
    } else {
      await criarWhatsApp({ env: base.env, fetch: base.fetch })
        .enviarCodigo({ para: r.destino, codigo: r.codigo, empresa: r.empresaNome, minutos: r.minutos });
    }
  } catch (err) {
    return erro(CLIMA_MSG_FALHOU);
  }
  return { ok: true, canal, destino: r.destinoMascarado || '', minutos: Number(r.minutos) || 10 };
}

function climaResponder(obj, status, extras) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extras || {})
  });
}

/** CORS: só a origem do SITE_URL (e localhost/127.0.0.1 para testes). */
export function climaCors(req, env) {
  const origem = req.headers.get('origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  let site = '';
  try { site = env && env.SITE_URL ? new URL(String(env.SITE_URL).trim()).origin : ''; } catch (err) { site = ''; }
  if (origem && (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origem) || (site && origem === site))) {
    h['Access-Control-Allow-Origin'] = origem;
  }
  return h;
}

/** Edge Function "clima" (pública). Sempre HTTP 200 {ok, ...} (menos método errado). */
export async function atenderClima(req, base) {
  const cors = climaCors(req, base.env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return climaResponder(erro('Método não permitido.'), 405, cors);
  try {
    const texto = await req.text();
    if (!texto) return climaResponder(erro('Requisição vazia.'), 200, cors);
    if (texto.length > CLIMA_LIMITE_CORPO) return climaResponder(erro('Requisição grande demais.'), 200, cors);
    let corpo;
    try { corpo = JSON.parse(texto); } catch (err) { return climaResponder(erro('JSON inválido.'), 200, cors); }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return climaResponder(erro('Formato de requisição inválido.'), 200, cors);
    const r = corpo.acao === 'codigo' ? await acaoClimaCodigo(base, corpo) : erro('Ação desconhecida.');
    return climaResponder(r, 200, cors);
  } catch (err) {
    try { console.error(err && err.message ? err.message : err); } catch (e) { /* sem console */ }
    return climaResponder(erro(MSG_ERRO_INTERNO), 200, cors);
  }
}
