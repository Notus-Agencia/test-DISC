// Vagas sem Caos v2 — peças da entrada por código (sem senha) e da consulta de CNPJ, usadas pela Edge Function "vagas-conta"
// (ações codigo_pedir, codigo_confirmar, cnpj, empresa_criar; fluxo em supabase/funcoes-compartilhadas/vagas-conta.js).
// Aqui só há lógica pura: o fetch, o relógio e o sorteio vêm de fora (testável no Node, sem rede). Nenhum segredo neste arquivo.
import { iguaisSeguro } from './asaas.js';

export const VAGAS_CODIGO_DIGITOS = 6;
export const VAGAS_CODIGO_VALE_SEG = 600;       // 10 minutos
export const VAGAS_CODIGO_REENVIO_SEG = 30;     // reenviar só depois de 30 s
export const VAGAS_CODIGO_TENTATIVAS = 5;       // vale no banco (vagas_conta_codigo_tentar); aqui só para a mensagem
export const VAGAS_MSG_CODIGO_FORMATO = 'Digite os 6 números do código.';
export const VAGAS_MSG_CODIGO_ERRADO = 'Código incorreto. Confira e tente de novo.';
export const VAGAS_MSG_CODIGO_VENCIDO = 'Este código venceu ou já foi usado. Peça um novo código.';
export const VAGAS_MSG_CODIGO_ESGOTADO = 'Você errou o código vezes demais. Peça um novo código.';
export const VAGAS_MSG_WHATSAPP_DESLIGADO = 'O código por WhatsApp ainda não está ligado. Use o e-mail.';
export const VAGAS_MSG_ENVIO_FALHOU = 'Não deu para enviar o e-mail agora. Tente de novo em instantes.';
export const VAGAS_MSG_OUTRO_SISTEMA = 'Este e-mail já é usado em outro sistema da Gestão sem Caos e não entra aqui. Use outro e-mail.';
export const VAGAS_MSG_CPF = 'Isto parece um CPF. O MEI tem CNPJ próprio: ele está no Certificado do MEI (CCMEI).';
export const VAGAS_MSG_CNPJ_INVALIDO = 'CNPJ inválido. Confira os números.';
export const VAGAS_MSG_CNPJ_NAO_ACHADO = 'Não achamos este CNPJ na Receita Federal. Confira os números.';
export const VAGAS_MSG_CNPJ_INDISPONIVEL = 'Não deu para consultar o CNPJ agora. Tente de novo em instantes.';
export const VAGAS_FRASE_GOLPE = 'Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.';

// Base pública da Receita Federal consultada pelo SERVIDOR (o CSP do site não deixa o navegador chamar API de terceiros).
// BrasilAPI: GET /api/cnpj/v1/<14 caracteres> -> JSON; 404 = não existe; 400 = número inválido; 429/5xx = fora do ar.
export const VAGAS_URL_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1/';
export const VAGAS_CNPJ_PRAZO_MS = 8000;
export const VAGAS_CNPJ_CACHE_MS = 300000;      // 5 minutos
const VAGAS_CNPJ_CACHE_MAX = 500;
export const VAGAS_CNPJ_CACHE = new Map();

/** 6 dígitos sorteados com segurança (sem viés: descarta o que passa do múltiplo de 1.000.000). */
export function gerarCodigoVagas(sorteio) {
  const pegar = sorteio || (() => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]; });
  const teto = Math.floor(4294967296 / 1000000) * 1000000;
  let n = pegar();
  while (n >= teto) n = pegar();
  return String(n % 1000000).padStart(VAGAS_CODIGO_DIGITOS, '0');
}

/** Sal por linha: 16 bytes em hexadecimal (32 caracteres). */
export function gerarSalVagas() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256(chave = segredo do servidor + sal; mensagem = destino + código) em hexadecimal. O código nunca vai ao banco. */
export async function hashCodigoVagas(codigo, destino, sal, segredo) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(String(segredo || '') + ':' + String(sal)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', chave, enc.encode(String(destino) + ':' + String(codigo)));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Confere em tempo constante. */
export async function conferirCodigoVagas(codigo, destino, sal, segredo, hashGuardado) {
  return iguaisSeguro(await hashCodigoVagas(codigo, destino, sal, segredo), String(hashGuardado || ''));
}

/** Só os 6 números (aceita espaço e traço colados: "123 456"). '' se não for o formato. */
export function codigoDigitadoVagas(v) {
  const s = String(v == null ? '' : v).replace(/[\s-]/g, '');
  return /^[0-9]{6}$/.test(s) ? s : '';
}

/** WhatsApp só com dígitos no formato 55DDNNNNNNNNN (celular ou fixo); '' se não bater. */
export function whatsappDigitosVagas(v) {
  let d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return /^55[1-9][1-9][0-9]{8,9}$/.test(d) ? d : '';
}

/** "55119****1234" para a resposta (nunca o número inteiro). */
export function mascararWhatsappVagas(d) {
  const s = String(d || '');
  return s.length >= 8 ? s.slice(0, 4) + '*'.repeat(Math.max(s.length - 8, 1)) + s.slice(-4) : '';
}

/** E-mail do código: o código em destaque, o prazo e o aviso de golpe. logo = URL do PNG do topo. */
export function montarEmailCodigoVagas(d) {
  const codigo = String(d.codigo);
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const prazo = 'Vale por 10 minutos. Não passe este código para ninguém.';
  const rodape = 'Vagas sem Caos · uma empresa do grupo Gestão sem Caos.';
  const texto = ['Seu código do Vagas sem Caos: ' + codigo + '. ' + prazo, '', 'Se você não pediu este código, ignore este e-mail: sem ele, ninguém entra na sua conta.', '',
    VAGAS_FRASE_GOLPE, '', rodape].join('\n');
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>Seu código do Vagas sem Caos</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F2EF;font-family:Arial,Helvetica,sans-serif">' +
    '<span style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc('Seu código: ' + codigo + '. ' + prazo) + '</span>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EF;padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden">' +
    '<tr><td style="height:6px;background:#C2410C;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:32px 32px 8px"><img src="' + esc(d.logo) + '" width="188" alt="Vagas sem Caos" style="display:block;width:188px;max-width:100%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:16px 32px 8px"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#13283F">Seu código de entrada</h1>' +
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#13283F">Digite este código na tela do Vagas sem Caos:</p>' +
    '<p style="margin:0 0 16px;font-size:36px;line-height:1.2;font-weight:700;letter-spacing:8px;color:#13283F;background:#F4F2EF;border-radius:12px;padding:16px;text-align:center">' + esc(codigo) + '</p>' +
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#13283F">' + esc(prazo) + '</p>' +
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5B6878">Se você não pediu este código, ignore este e-mail: sem ele, ninguém entra na sua conta.</p>' +
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#13283F;font-weight:700">' + esc(VAGAS_FRASE_GOLPE) + '</p></td></tr>' +
    '<tr><td style="padding:24px 32px 32px;border-top:1px solid #E7E2DC"><p style="margin:0;font-size:12px;line-height:1.6;color:#8A94A2">' + esc(rodape) + '</p></td></tr>' +
    '</table></td></tr></table></body></html>';
  return { assunto: 'Seu código do Vagas sem Caos: ' + codigo, html, texto };
}

// ---------------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------------

/** 14 caracteres (maiúsculas, só 0-9 e A-Z); outro tamanho devolve o que sobrou. */
export function cnpjNormalizadoVagas(v) {
  return String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** CNPJ numérico ou alfanumérico (IN RFB 2.229/2024): valor de cada caractere = código ASCII − 48; módulo 11. Igual a VAGAS_REGRAS.cnpjValido. */
export function cnpjValidoVagas(v) {
  const c = cnpjNormalizadoVagas(v);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const dv = (pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += (c.charCodeAt(i) - 48) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c.charAt(12)) && dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c.charAt(13));
}

/** 11 números (com ou sem pontos e traço): quem digitou o CPF no lugar do CNPJ. */
export function pareceCpfVagas(v) {
  const s = String(v == null ? '' : v).trim();
  return /^[0-9.\-\s]+$/.test(s) && s.replace(/[^0-9]/g, '').length === 11;
}

const VAGAS_PEQUENAS = ['de', 'da', 'do', 'das', 'dos', 'e'];
/** "URUAÇU" -> "Uruaçu"; "SANTA CRUZ DE GOIÁS" -> "Santa Cruz de Goiás". */
export function nomeProprioVagas(t) {
  return String(t == null ? '' : t).trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && VAGAS_PEQUENAS.indexOf(p) >= 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

const VAGAS_SITUACOES = { ATIVA: 'ativa', BAIXADA: 'baixada', SUSPENSA: 'suspensa', INAPTA: 'inapta', NULA: 'nula' };

/** JSON da BrasilAPI -> forma cnpjConsultar do contrato (sem {ok}); null se a resposta não for de um CNPJ. */
export function interpretarCnpjVagas(j, cnpjPedido) {
  if (!j || typeof j !== 'object') return null;
  const cnpj = cnpjNormalizadoVagas(j.cnpj);
  if (!cnpj || (cnpjPedido && cnpj !== cnpjNormalizadoVagas(cnpjPedido))) return null;
  const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
  const bruta = texto(j.descricao_situacao_cadastral, 40).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const porCodigo = Number(j.situacao_cadastral) === 2 ? 'ATIVA' : '';
  const chave = bruta || porCodigo;
  if (!chave) return null;
  const mei = j.opcao_pelo_mei === true;
  const abertura = /^\d{4}-\d{2}-\d{2}$/.test(String(j.data_inicio_atividade || '')) ? String(j.data_inicio_atividade) : null;
  return { cnpj, tipo: mei ? 'mei' : 'empresa', ativa: chave === 'ATIVA', situacao: VAGAS_SITUACOES[chave] || chave.toLowerCase(),
    razaoSocial: texto(j.razao_social, 160), nomeFantasia: texto(j.nome_fantasia, 160), cidade: nomeProprioVagas(texto(j.municipio, 80)),
    uf: texto(j.uf, 2).toUpperCase(), bairro: nomeProprioVagas(texto(j.bairro, 80)), abertura, mei, setor: texto(j.cnae_fiscal_descricao, 120) };
}

/** Frase para quem tem o CNPJ fora de ATIVA (usada ao criar a empresa). */
export function motivoCnpjInativoVagas(situacao) {
  const motivos = { baixada: 'está baixado', suspensa: 'está suspenso', inapta: 'está inapto', nula: 'está nulo' };
  return 'O CNPJ ' + (motivos[situacao] || 'não está ativo') + ' na Receita Federal. Só empresa com situação ATIVA pode anunciar. Regularize e volte.';
}

/**
 * Consulta o CNPJ na base pública. Nunca aprova sem consulta.
 * op = { cache?: Map, agora?: () => ms, fresco?: true (ignora o cache), prazoMs? }
 * -> {ok:true, consulta} | {ok:false, codigo:'cnpj_invalido'|'cpf'|'cnpj_nao_encontrado'|'consulta_indisponivel', erro}
 */
export async function consultarCnpjVagas(fetchFn, cnpjDigitado, op) {
  op = op || {};
  if (pareceCpfVagas(cnpjDigitado)) return { ok: false, codigo: 'cpf', erro: VAGAS_MSG_CPF };
  const cnpj = cnpjNormalizadoVagas(cnpjDigitado);
  if (!cnpjValidoVagas(cnpj)) return { ok: false, codigo: 'cnpj_invalido', erro: VAGAS_MSG_CNPJ_INVALIDO };
  const cache = op.cache || VAGAS_CNPJ_CACHE;
  const agora = op.agora ? op.agora() : Date.now();
  const guardado = cache.get(cnpj);
  if (!op.fresco && guardado && agora - guardado.em < VAGAS_CNPJ_CACHE_MS) return { ok: true, consulta: guardado.consulta };
  const indisponivel = { ok: false, codigo: 'consulta_indisponivel', erro: VAGAS_MSG_CNPJ_INDISPONIVEL };
  const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controle ? setTimeout(() => controle.abort(), op.prazoMs || VAGAS_CNPJ_PRAZO_MS) : null;
  try {
    const r = await fetchFn(VAGAS_URL_CNPJ + encodeURIComponent(cnpj), {
      method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'vagas-sem-caos' }, signal: controle ? controle.signal : undefined });
    if (r.status === 404 || r.status === 400) return { ok: false, codigo: 'cnpj_nao_encontrado', erro: VAGAS_MSG_CNPJ_NAO_ACHADO };
    if (!r.ok) return indisponivel;
    let j = null;
    try { j = await r.json(); } catch (err) { j = null; }
    const consulta = interpretarCnpjVagas(j, cnpj);
    if (!consulta) return indisponivel;
    if (cache.size >= VAGAS_CNPJ_CACHE_MAX) cache.clear();
    cache.set(cnpj, { em: agora, consulta });
    return { ok: true, consulta };
  } catch (err) {
    return indisponivel;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
