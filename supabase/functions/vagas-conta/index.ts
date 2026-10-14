// @ts-nocheck
// ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITE. Gerado de supabase/funcoes-fonte/vagas-conta/index.ts por: npm run montar:funcoes
// Autocontido: cole este arquivo inteiro no editor da Edge Function no painel do Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ======== supabase/funcoes-compartilhadas/regras.js ========
// Regras puras compartilhadas pelas Edge Functions (porte fiel de apps-script/Code.gs).
// ES module sem dependências: roda no Node (testes) e no Deno (Supabase). Nada de rede aqui.

const MSG_SESSAO = 'Sessão expirada. Entre de novo.';
const MSG_SEM_PERMISSAO = 'Sem permissão.';
const MSG_ERRO_INTERNO = 'Erro interno no servidor. Tente novamente em instantes.';

const LETRAS_DISC = ['D', 'I', 'S', 'C'];
const TOTAL_GRUPOS_DISC = 25;

/** {ok:false, erro, ...extra} — mesmo formato do Code.gs. */
function erro(mensagem, extra) {
  const r = { ok: false, erro: mensagem };
  if (extra) for (const k of Object.keys(extra)) r[k] = extra[k];
  return r;
}

/** Remove caracteres de controle, junta espaços repetidos, apara e corta no limite. */
function limparTexto(v, max) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = s.substring(0, max).trim();
  return s;
}

/** Texto multilinha: mantém quebras de linha, remove outros controles. */
function limparTextoLongo(v, max) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim();
  if (max && s.length > max) s = s.substring(0, max).trim();
  return s;
}

function letrasContadas(texto) { return (String(texto).match(/\p{L}/gu) || []).length; }

function normalizarEmail(v) { return limparTexto(v, 120).toLowerCase(); }

function emailValido(email) {
  return typeof email === 'string' && email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Mesma regra de js/scoring.js: 100 dígitos, cada bloco de 4 é permutação de 1..4. */
function validarRespostasCompactas(str) {
  if (typeof str !== 'string' || !/^[1-4]{100}$/.test(str)) return false;
  for (let i = 0; i < TOTAL_GRUPOS_DISC; i++) {
    const bloco = str.substr(i * 4, 4);
    if (new Set(bloco).size !== 4) return false;
  }
  return true;
}

/** Totais, percentuais (total/2.5) e perfil (maior + segundo maior; empate na ordem D,I,S,C). */
function calcularDisc(str) {
  if (!validarRespostasCompactas(str)) throw new Error('Respostas inválidas.');
  const totais = { D: 0, I: 0, S: 0, C: 0 };
  for (let i = 0; i < TOTAL_GRUPOS_DISC; i++) {
    for (let j = 0; j < 4; j++) totais[LETRAS_DISC[j]] += Number(str[i * 4 + j]);
  }
  const percentuais = {};
  LETRAS_DISC.forEach((l) => { percentuais[l] = Math.round((totais[l] / 2.5) * 10) / 10; });
  const ordem = LETRAS_DISC.slice().sort((a, b) => (totais[b] - totais[a]) || (LETRAS_DISC.indexOf(a) - LETRAS_DISC.indexOf(b)));
  return { totais, percentuais, ordem, primario: ordem[0], secundario: ordem[1], codigo: ordem[0] + ordem[1] };
}

function protocoloValido(v) {
  return typeof v === 'string' && /^[0-9]{2}[A-HJ-NP-Z]$/.test(v);
}

function normalizarProtocolo(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/^'/, '').replace(/\s+/g, '').toUpperCase();
  return protocoloValido(s) ? s : '';
}

// ---------------------------------------------------------------------------
// Campos do ClickUp: nomes normalizados e termos sensíveis
// ---------------------------------------------------------------------------

const TERMOS_SENSIVEIS = ['sexo', 'genero', 'estado civil', 'filho', 'religi', 'gravid', 'etnia', 'raca',
  'cor da pele', 'orientacao', 'deficien', 'doenca', 'saude', 'antecedente', 'processo em seu nome', 'criminal'];
const TERMOS_ANTECEDENTES = ['antecedente', 'processo em seu nome', 'criminal'];

/** Nome de campo normalizado: minúsculas, sem acento, só letras/algarismos/% separados por 1 espaço. */
function normalizarNomeCampo(nome) {
  let s = String(nome === null || nome === undefined ? '' : nome).toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.replace(/[^a-z0-9%]+/g, ' ').trim();
}

/** '' (pode ler), 'sensivel' (nunca ler) ou 'antecedente' (só com config.permitirAntecedentes). */
function classificarCampo(nome, config) {
  const n = ' ' + normalizarNomeCampo(nome);
  config = config || {};
  for (const termo of TERMOS_SENSIVEIS) {
    if (n.indexOf(' ' + termo) === -1) continue;
    if (termo === 'saude' && config.permitirSaude === true) continue;
    if (TERMOS_ANTECEDENTES.indexOf(termo) >= 0) return config.permitirAntecedentes === true ? 'antecedente' : 'sensivel';
    return 'sensivel';
  }
  return '';
}

function numeroOuPadrao(v, padrao, min, max) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
  if (!isFinite(n)) return padrao;
  return Math.max(min, Math.min(max, n));
}

function idSimplesConfig(v, prefixo, i) {
  const s = limparTexto(v, 40);
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : prefixo + (i + 1);
}

/** Valida e completa a config do processo (mesma regra do Code.gs). {ok, config} ou {ok:false, erro}. */
function validarConfigProcesso(c) {
  if (c === undefined || c === null) c = {};
  if (typeof c !== 'object' || Array.isArray(c)) return erro('Configuração do processo inválida.');
  let json;
  try { json = JSON.stringify(c); } catch (err) { return erro('Configuração do processo inválida.'); }
  if (json.length > 40000) return erro('Configuração do processo grande demais.');
  const perfil = String(c.perfilIdeal || '').toUpperCase().replace(/[^DISC]/g, '');
  if (perfil.length > 2 || (perfil.length === 2 && perfil[0] === perfil[1])) return erro('Perfil ideal inválido: use 1 ou 2 letras entre D, I, S e C.');
  const permitirAntecedentes = c.permitirAntecedentes === true;
  const base = { permitirAntecedentes, permitirSaude: c.permitirSaude === true };
  let problema = null;
  const campo = (v) => {
    const nome = limparTexto(v, 120);
    if (nome && classificarCampo(nome, base) === 'sensivel') problema = problema || ('O campo "' + nome + '" é um dado sensível e não pode ser usado.');
    return nome;
  };
  const ids = {};
  const idUnico = (v, prefixo, i) => {
    let id = idSimplesConfig(v, prefixo, i);
    while (ids[id]) id = id + '_';
    ids[id] = true;
    return id;
  };
  const etapas = (Array.isArray(c.etapas) ? c.etapas : []).slice(0, 20).map((e, i) => {
    e = e && typeof e === 'object' ? e : {};
    return {
      id: idUnico(e.id, 'etapa', i), nome: limparTexto(e.nome, 80) || ('Etapa ' + (i + 1)),
      peso: numeroOuPadrao(e.peso, 0, 0, 1000), campo: campo(e.campo), descricao: limparTextoLongo(e.descricao, 1000)
    };
  });
  const bonus = (Array.isArray(c.bonus) ? c.bonus : []).slice(0, 20).map((b, i) => {
    b = b && typeof b === 'object' ? b : {};
    const regra = b.regra && typeof b.regra === 'object' ? b.regra : {};
    let r;
    if (regra.tipo === 'mapa') {
      const pontos = {};
      const origem = regra.pontos && typeof regra.pontos === 'object' ? regra.pontos : {};
      Object.keys(origem).slice(0, 50).forEach((k) => {
        const chave = limparTexto(k, 120);
        if (chave) pontos[chave] = numeroOuPadrao(origem[k], 0, -100, 100);
      });
      r = { tipo: 'mapa', pontos };
    } else {
      r = { tipo: 'checkbox', pontos: numeroOuPadrao(regra.pontos, 0, -100, 100) };
    }
    return { id: idUnico(b.id, 'bonus', i), nome: limparTexto(b.nome, 80) || ('Bônus ' + (i + 1)), campo: campo(b.campo), regra: r };
  });
  if (problema) return erro(problema);
  const corte = numeroOuPadrao(c.corte, 70, 0, 200);
  const faixa = numeroOuPadrao(c.faixaAvaliar, 55, 0, 200);
  if (faixa > corte) return erro('A faixa "avaliar" precisa ser menor ou igual à nota de corte.');
  return {
    ok: true,
    config: {
      perfilIdeal: perfil,
      explicacaoPerfil: limparTextoLongo(c.explicacaoPerfil, 2000),
      etapas,
      bonus,
      corte,
      faixaAvaliar: faixa,
      statusFinalistas: (Array.isArray(c.statusFinalistas) ? c.statusFinalistas : []).slice(0, 30)
        .map((x) => limparTexto(x, 80)).filter(Boolean),
      permitirAntecedentes,
      permitirSaude: c.permitirSaude === true
    }
  };
}

/** Config gravada (jsonb ou texto JSON), sempre completa com os padrões. */
function configDoProcesso(proc) {
  let bruto = proc && proc.config;
  if (typeof bruto === 'string') { try { bruto = JSON.parse(bruto); } catch (err) { bruto = {}; } }
  const v = validarConfigProcesso(bruto || {});
  return v.ok ? v.config : validarConfigProcesso({}).config;
}

/** Linha da tabela public.processos (snake_case) -> processo no formato usado pela lógica (camelCase). */
function processoDaLinha(l) {
  if (!l) return null;
  return {
    id: String(l.id),
    codigo: l.codigo || '',
    nome: l.nome || '',
    tipo: l.tipo || 'selecao',
    empresa: l.empresa || '',
    vaga: l.vaga || '',
    cidade: l.cidade || '',
    consultor: l.consultor || '',
    contratante: l.contratante || '',
    periodoInicio: l.periodo_inicio ? String(l.periodo_inicio).substring(0, 10) : '',
    periodoFim: l.periodo_fim ? String(l.periodo_fim).substring(0, 10) : '',
    clickupListId: l.clickup_list_id ? String(l.clickup_list_id) : '',
    config: l.config || {},
    ativa: l.ativo !== false
  };
}

// ======== supabase/funcoes-compartilhadas/asaas.js ========
// Cliente mínimo da API v3 do Asaas (cobrança Pix + link de cartão) e do Resend (e-mail), sem nada do Deno:
// recebe fetch por parâmetro (testável no Node com respostas falsas).
//
// Segredos (Supabase > Edge Functions > Secrets; NUNCA no código nem no repositório):
//   ASAAS_API_KEY       chave da API do Asaas (copiada do painel do Asaas). Sem ela: "Pagamento ainda não configurado."
//   ASAAS_AMBIENTE      'sandbox' (padrão, testes) ou 'producao'
//   ASAAS_WEBHOOK_TOKEN token que o Asaas manda no cabeçalho asaas-access-token do webhook
//   RESEND_API_KEY      (opcional) envio de e-mail com o link do relatório
//   EMAIL_REMETENTE     (opcional) ex.: 'Gestão sem Caos <relatorio@seudominio.com.br>' (domínio verificado no Resend)

const ASAAS_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3'
};
const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const ASAAS_EVENTOS_PAGO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const ASAAS_EVENTOS_ESTORNO = ['PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE'];
const ASAAS_EVENTOS_CANCELA = ['PAYMENT_DELETED'];
const ASAAS_TIMEOUT_MS = 15000;

function asaasAmbiente(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'producao' || s === 'produção' || s === 'production' ? 'producao' : 'sandbox';
}

/** forma de pagamento do Asaas -> pedidos.metodo */
function asaasMetodo(billingType) {
  const b = String(billingType || '').toUpperCase();
  if (b === 'PIX') return 'pix';
  if (b === 'CREDIT_CARD' || b === 'DEBIT_CARD') return 'cartao';
  if (b === 'BOLETO') return 'boleto';
  return '';
}

/** Compara dois textos em tempo constante (tamanhos diferentes = falso). */
function iguaisSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** CPF (11 dígitos com dígitos verificadores) ou CNPJ (14 dígitos) -> só dígitos; inválido -> ''. */
function documentoValido(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return '';
    const dv = (n) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : '';
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return '';
    const calc = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[i];
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]) ? d : '';
  }
  return '';
}

function erroAsaas(status, corpo) {
  const lista = corpo && Array.isArray(corpo.errors) ? corpo.errors : [];
  const texto = lista.map((e) => String((e && (e.description || e.code)) || '')).filter(Boolean).join(' ') || ('HTTP ' + status);
  const e = new Error('Asaas: ' + texto.substring(0, 300));
  e.status = status;
  e.codigos = lista.map((x) => String((x && x.code) || ''));
  e.texto = texto;
  return e;
}

/**
 * criarAsaas({apiKey, ambiente, fetch}) -> {configurado, ambiente, clienteCriar, cobrancaCriar, cobranca, pixQrCode}
 * Todas lançam Error('Asaas: ...') com e.status/e.codigos/e.texto em resposta não-2xx.
 */
function criarAsaas(op) {
  const apiKey = String((op && op.apiKey) || '').trim();
  const ambiente = asaasAmbiente(op && op.ambiente);
  const base = ASAAS_URLS[ambiente];
  const fetchFn = op && op.fetch;

  async function chamar(metodo, caminho, corpo) {
    const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controle ? setTimeout(() => controle.abort(), ASAAS_TIMEOUT_MS) : null;
    try {
      const r = await fetchFn(base + caminho, {
        method: metodo,
        headers: { access_token: apiKey, 'Content-Type': 'application/json', 'User-Agent': 'gestao-sem-caos-mapa-disc' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controle ? controle.signal : undefined
      });
      const texto = await r.text();
      let json = null;
      try { json = texto ? JSON.parse(texto) : null; } catch (err) { json = null; }
      if (!r.ok) throw erroAsaas(r.status, json);
      return json || {};
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    configurado: !!apiKey,
    ambiente,
    /** {nome, email, cpfCnpj?, referencia} -> id do cliente (cus_...) */
    async clienteCriar(d) {
      const corpo = { name: d.nome, email: d.email, externalReference: d.referencia, notificationDisabled: true };
      if (d.cpfCnpj) corpo.cpfCnpj = d.cpfCnpj;
      const r = await chamar('POST', '/customers', corpo);
      if (!r.id) throw new Error('Asaas: cliente sem id');
      return String(r.id);
    },
    /** {cliente, valorCentavos, vencimento 'YYYY-MM-DD', descricao, referencia} -> {id, invoiceUrl, status} */
    async cobrancaCriar(d) {
      const r = await chamar('POST', '/payments', {
        customer: d.cliente, billingType: 'UNDEFINED', value: Math.round(d.valorCentavos) / 100,
        dueDate: d.vencimento, description: d.descricao, externalReference: d.referencia
      });
      if (!r.id) throw new Error('Asaas: cobrança sem id');
      return { id: String(r.id), invoiceUrl: String(r.invoiceUrl || ''), status: String(r.status || '') };
    },
    /** id -> {id, status, billingType, value, externalReference, invoiceUrl} */
    async cobranca(id) {
      return chamar('GET', '/payments/' + encodeURIComponent(id));
    },
    /** id -> {qrBase64, copiaECola, expira} */
    async pixQrCode(id) {
      const r = await chamar('GET', '/payments/' + encodeURIComponent(id) + '/pixQrCode');
      return { qrBase64: String(r.encodedImage || ''), copiaECola: String(r.payload || ''), expira: String(r.expirationDate || '') };
    }
  };
}

/** Envio pelo Resend. {configurado, enviar({para, assunto, html, texto}) -> {id} (id do e-mail no Resend, '' se não veio)} — lança erro em falha. */
function criarResend(op) {
  const chave = String((op && op.apiKey) || '').trim();
  const remetente = String((op && op.remetente) || '').trim() || 'Gestão sem Caos <onboarding@resend.dev>';
  return {
    configurado: !!chave,
    async enviar(m) {
      const r = await op.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: remetente, to: [m.para], subject: m.assunto, html: m.html, text: m.texto })
      });
      if (!r.ok) throw new Error('Resend: HTTP ' + r.status);
      let id = '';
      try {
        const j = typeof r.json === 'function' ? await r.json() : null;
        id = j && typeof j.id === 'string' ? j.id : '';
      } catch (err) { id = ''; }
      return { id };
    }
  };
}

// ======== supabase/funcoes-compartilhadas/email.js ========
// E-mails com a marca Gestão sem Caos (mesmo visual de supabase/templates/*.html: logo PNG, faixa laranja,
// botão em pílula). Só texto e link: nunca anexos. Tudo que vem de fora passa por escaparHtml().

const LOGO_EMAIL = 'https://disc.gestaosemcaos.com.br/assets/marca/gsc-logo-email.png';

function escaparHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const P = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#13283F';

/**
 * HTML do e-mail na moldura da marca.
 * m = { titulo, previa?, paragrafos: [texto], botao: {texto, url}, nota?, rodape? }
 */
function htmlMarca(m) {
  const paras = (m.paragrafos || []).filter((t) => t !== null && t !== undefined && String(t) !== '')
    .map((t) => '<p style="' + P + '">' + escaparHtml(t).replace(/\n/g, '<br>') + '</p>').join('');
  const url = escaparHtml(m.botao.url);
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>' + escaparHtml(m.titulo) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4F2EF;font-family:\'Plus Jakarta Sans\',Arial,Helvetica,sans-serif">' +
    (m.previa ? '<span style="display:none;max-height:0;overflow:hidden;opacity:0">' + escaparHtml(m.previa) + '</span>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EF;padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden">' +
    '<tr><td style="height:6px;background:#F34405;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:32px 32px 8px"><img src="' + LOGO_EMAIL + '" width="200" alt="Gestão sem Caos" style="display:block;width:200px;max-width:100%;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:16px 32px 8px">' +
    '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#13283F;font-weight:700">' + escaparHtml(m.titulo) + '</h1>' + paras +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:#F34405">' +
    '<a href="' + url + '" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px">' + escaparHtml(m.botao.texto) + '</a>' +
    '</td></tr></table>' +
    (m.nota ? '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5B6878">' + escaparHtml(m.nota) + '</p>' : '') +
    '<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5B6878">Se o botão não funcionar, copie este endereço no navegador:<br>' +
    '<a href="' + url + '" style="color:#F34405;word-break:break-all">' + url + '</a></p>' +
    '</td></tr>' +
    '<tr><td style="padding:24px 32px 32px;border-top:1px solid #E7E2DC"><p style="margin:0;font-size:12px;line-height:1.6;color:#8A94A2">' +
    escaparHtml(m.rodape || 'Gestão sem Caos · Mapa DISC') + '</p></td></tr>' +
    '</table></td></tr></table></body></html>';
}

const ASSUNTOS_RELATORIO = {
  pessoa: 'Seu relatório DISC — Gestão sem Caos',
  equipe: 'Relatório de equipe — Gestão sem Caos',
  lideranca: 'Como liderar — relatório da Gestão sem Caos',
  processo: 'Relatório do processo seletivo — Gestão sem Caos'
};

/**
 * E-mail com o link de um relatório publicado (painel -> cliente).
 * d = { modelo, url, nome? (destinatário), mensagem? (do consultor), remetente? (nome do consultor), titulo? (do relatório) }
 * -> { assunto, html, texto }
 */
function montarEmailRelatorio(d) {
  const modelo = Object.prototype.hasOwnProperty.call(ASSUNTOS_RELATORIO, d.modelo) ? d.modelo : 'processo';
  const primeiro = String(d.nome || '').trim().split(/\s+/)[0] || '';
  const ola = primeiro ? 'Olá, ' + primeiro + '!' : 'Olá!';
  const quem = d.remetente ? d.remetente + ', da Gestão sem Caos,' : 'A Gestão sem Caos';
  const oque = modelo === 'pessoa' ? 'o seu relatório DISC' : (modelo === 'equipe' ? 'o relatório da equipe'
    : (modelo === 'lideranca' ? 'o relatório "Como liderar"' : 'o relatório do processo seletivo'));
  const intro = quem + ' enviou ' + oque + (d.titulo ? ': ' + d.titulo : '') + '.';
  const mensagem = String(d.mensagem || '').trim();
  const nota = 'O link abre o relatório no navegador, no celular ou no computador. Guarde este e-mail para voltar a ele.';
  const html = htmlMarca({
    titulo: modelo === 'pessoa' ? 'Seu relatório DISC está pronto' : 'Relatório pronto para você',
    previa: intro,
    paragrafos: [ola, intro, mensagem],
    botao: { texto: 'Ver relatório', url: d.url },
    nota,
    rodape: 'Gestão sem Caos · Mapa DISC. Você recebeu este e-mail porque a consultoria enviou um relatório para este endereço.'
  });
  const texto = [ola, '', intro].concat(mensagem ? ['', mensagem] : [])
    .concat(['', 'Ver relatório: ' + d.url, '', nota, '', 'Gestão sem Caos']).join('\n');
  return { assunto: ASSUNTOS_RELATORIO[modelo], html, texto };
}

// ---------------------------------------------------------------------------
// Histórico de envios (public.envios_email, migração 20261016120000_envios_email.sql): o painel mostra
// "Enviado para … em dd/mm às hh:mm por Nome". Só o combinado: o que (tipo + referência), para quem, quem enviou
// (nome do administrador ou 'cliente'), quando, resultado e o id no provedor. Nada do conteúdo do e-mail.
// ---------------------------------------------------------------------------

const TIPOS_ENVIO = ['relatorio', 'pedido'];
const RE_UUID_ENVIO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Linha de public.envios_email. r = { tipo, referencia, destinatario, enviadoPor? (nome), enviadoPorId? (uuid do admin;
 * sem ele = 'cliente'), resultado ('ok' | qualquer outro = 'erro'), provedorId?, em? (ISO) }. null se algo essencial
 * não bater com as regras da tabela (aí nada é gravado).
 */
function linhaEnvio(r) {
  r = r || {};
  const tipo = TIPOS_ENVIO.indexOf(r.tipo) >= 0 ? r.tipo : '';
  const referencia = String(r.referencia == null ? '' : r.referencia);
  const destinatario = String(r.destinatario == null ? '' : r.destinatario).trim().toLowerCase();
  if (!tipo || !/^[A-Za-z0-9_-]{1,128}$/.test(referencia)) return null;
  if (destinatario.length < 3 || destinatario.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(destinatario)) return null;
  const porId = r.enviadoPorId == null || r.enviadoPorId === '' ? '' : String(r.enviadoPorId);
  if (porId && !RE_UUID_ENVIO.test(porId)) return null;
  const nome = String(r.enviadoPor == null ? '' : r.enviadoPor).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
    .substring(0, 120).trim();
  const provedorId = String(r.provedorId == null ? '' : r.provedorId);
  return {
    tipo, referencia, destinatario,
    enviado_por: porId ? (nome || 'Administrador') : 'cliente',
    enviado_por_id: porId || null,
    em: typeof r.em === 'string' && r.em ? r.em : new Date().toISOString(),
    resultado: r.resultado === 'ok' ? 'ok' : 'erro',
    provedor_id: /^[A-Za-z0-9_.:-]{1,200}$/.test(provedorId) ? provedorId : null
  };
}

/** Grava a tentativa no histórico. NUNCA lança: o e-mail já foi (ou falhou) e o histórico é só para o painel. */
async function registrarEnvio(db, r) {
  const linha = linhaEnvio(r);
  if (!linha || !db || typeof db.envioRegistrar !== 'function') return false;
  try {
    await db.envioRegistrar(linha);
    return true;
  } catch (err) {
    try { console.error(err); } catch (e) { /* sem console */ }
    return false;
  }
}

// ======== supabase/funcoes-compartilhadas/vagas-conta.js ========
// Edge Function "vagas-conta" (pública; "Verify JWT" desligado): contas do Vagas sem Caos (vagas.gestaosemcaos.com.br).
// O cadastro aberto do Supabase Auth continua DESLIGADO: as contas nascem só aqui, com app_metadata.produto = 'vagas' e o
// tipo da conta, e o banco registra a conta em public.vagas_contas (migração 20261022120000_vagas.sql).
//
// POST {acao, ...} -> sempre HTTP 200 {ok, ...} (menos método errado). Ações:
//   cadastrar {email, tipo:'pessoa'|'empresa', termosVersao, nome?, captcha?}
//       Cria a conta (senha aleatória que ninguém conhece) e manda o link "Confirme seu e-mail e crie sua senha".
//       A SENHA SÓ É CRIADA DEPOIS DO CLIQUE no link (a tela entrar.html chama verifyOtp e depois updateUser): assim ninguém
//       consegue criar antes uma conta com o e-mail de outra pessoa e uma senha que só ele sabe.
//       Resposta NEUTRA (não revela se o e-mail já existe): conta do Vagas ainda não confirmada = manda o link de novo (e o
//       tipo passa a ser o pedido agora: quem tem o e-mail decide, mesmo que um terceiro tenha "pré-registrado" com outro);
//       já confirmada = e-mail "você já tem conta"; conta de outro produto (painel DISC) = nada é enviado.
//       O consentimento (termos/privacidade com data) só é gravado no banco quando a pessoa clica no link, nunca antes.
//   reenviar {email, captcha?}  -> link novo de confirmação (só conta do Vagas não confirmada). Resposta neutra. Com JWT de
//       operador(a) ou da equipe: sem captcha, limite 'reenviar_op' por quem age, e o operador só para conta assistida da
//       cidade dele (20261024120005).
//   esqueci {email, captcha?}   -> link "Crie uma nova senha" (só conta do Vagas). Resposta neutra.
//   assistido (JWT de operador(a) da cidade ou da equipe) {email, tipo, cidade, empresaId?, nome?, codigoEvento?}
//       Cadastro assistido: a conta nasce PENDENTE e só vale quando a pessoa confirma pelo link (é o consentimento dela).
//       O link vai só para o e-mail da pessoa (nunca para quem fez o cadastro).
//   operador (JWT da equipe) {email, cidade, papel:'operador'|'moderador'} -> convite de operação para a cidade.
//   excluir (JWT) {confirmar:'EXCLUIR'} -> apaga a conta e tudo dela (LGPD), inclusive a foto do Storage. Conta que também
//       acessa o painel DISC: recusa. Última pessoa dona de empresa com equipe: recusa (vagas_conta_exclusao_conferir).
//   foto (JWT) {candidatura?} -> {ok, url, expiraEm}: URL assinada de 5 minutos da foto OPCIONAL da pessoa (bucket privado
//       'vagas-fotos', <user_id>/foto.jpg). Sem candidatura = a própria foto (pessoa). Com candidatura = só membro da empresa
//       daquela candidatura, depois do Combinou e sem corte de acesso (quem confere é public.vagas_conta_foto, no banco).
//   convite_equipe (JWT de quem é dono(a) da empresa) {empresaId, email} -> convite para a equipe (papel recrutador). O banco
//       decide tudo (public.vagas_conta_convite_equipe: dono(a) ativo(a), limites, token de uso único de 72 h guardado com hash)
//       e diz para onde vai o e-mail; o token e o destino NUNCA voltam para o navegador. Resposta NEUTRA, igual para qualquer
//       e-mail: conta nova (a conta de empresa nasce pendente e o link confirma o e-mail e cria a senha), conta de empresa
//       (link para entrar e aceitar), conta de outro tipo (e-mail explicando que precisa de outro e-mail), conta só do painel
//       DISC ou suspensa (nada é enviado). A pessoa só entra na equipe depois de confirmar o e-mail e aceitar
//       (vagas_equipe_convite_aceitar, com o login dela).
//   avisar_lista_espera (JWT da equipe) {cidade, limite?} -> um LOTE (padrão 25, até 50) do aviso "a cidade abriu" por e-mail
//       para a lista de espera de uma cidade ATIVA. O banco (vagas_conta_aviso_lote) reserva quem ainda não foi avisado e
//       marca na hora (rodar de novo não manda duas vezes); quem falhar volta para o FIM da fila, até 3 vezes, e e-mail
//       recusado aqui não volta (vagas_conta_aviso_marcar, 20261024120003). Teto de 24 h no banco (padrão 60). Resposta:
//       só contagens {enviados, falhas, invalidos, restantes, aAvisarWhatsapp, terminou, travado, tetoAtingido}; nenhum
//       e-mail da lista sai daqui. A tela chama de novo enquanto terminou, travado e tetoAtingido forem false.
//       Migrações 20261024120002_vagas_aviso_abertura e 20261024120003_vagas_aviso_reforco.
//   lista_espera (sem login) {cidade, email, perfil?, whatsapp?, origem?, site?, captcha} -> a lista de espera pelo Turnstile:
//       a tela usa este caminho quando tem o "não sou robô" (TURNSTILE_SITE_KEY no site). Com TURNSTILE_SECRET, o captcha é
//       conferido aqui e o banco grava com o limite maior por origem (mutirão, escola, Wi-Fi da praça); sem o segredo, vale o
//       limite comum. Mesmas respostas da RPC pública vagas_lista_espera_entrar (20261024120004).
// Link do e-mail: <VAGAS_SITE_URL>/entrar.html?token_hash=<hash>&type=invite|recovery (gerado com auth.admin.generateLink,
// no domínio do site; o antivírus que "abre" o link antes da pessoa não o gasta, porque a tela só confere no clique). No convite
// de equipe o link leva também &convite=<token> (ou só ?convite=<token> para quem já tem conta de empresa).
// Limites (banco, public.vagas_conta_limite): por origem (cf-connecting-ip e x-forwarded-for), por e-mail, por quem age e total.
// Segredos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (do Supabase), RESEND_API_KEY, VAGAS_SITE_URL, VAGAS_EMAIL_REMETENTE?
// (senão EMAIL_REMETENTE), TURNSTILE_SECRET? (liga o "não sou robô" no cadastrar/reenviar/esqueci), SITE_URL? (o do DISC: o
// painel do DISC também chama esta função — convite de operador pela aba "Vagas"; sem ele, https://disc.gestaosemcaos.com.br).
// Textos finais dos e-mails: conteudo/vagas-textos/ (aqui, versões curtas com a marca Vagas sem Caos e o endosso da Gestão sem Caos).

const NOMES_ENV_VAGAS_CONTA = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'VAGAS_SITE_URL', 'VAGAS_EMAIL_REMETENTE',
  'EMAIL_REMETENTE', 'TURNSTILE_SECRET', 'SITE_URL'];
const VAGAS_SITE_PADRAO = 'https://vagas.gestaosemcaos.com.br';
const VAGAS_PAINEL_DISC_PADRAO = 'https://disc.gestaosemcaos.com.br';
const VAGAS_MSG_ENVIADO = 'Se este e-mail puder ser usado, você vai receber um link em instantes. Confira também a caixa de spam.';
const VAGAS_MSG_EMAIL_NAO_CONFIGURADO = 'O envio de e-mail ainda não está configurado. Fale com a Gestão sem Caos.';
const VAGAS_MSG_CAPTCHA = 'Confirme que você não é um robô e tente de novo.';
const VAGAS_MSG_EMAIL_INVALIDO = 'E-mail inválido.';
const VAGAS_MSG_TERMOS = 'Para criar a conta, aceite os termos de uso e o aviso de privacidade.';
const VAGAS_MSG_TIPO = 'Escolha se a conta é para procurar emprego ou para uma empresa.';
const VAGAS_MSG_JA_EXISTE = 'Este e-mail já tem conta. A pessoa pode entrar ou usar "Esqueci minha senha".';
const VAGAS_MSG_CONVITE_EQUIPE = 'Pronto. Se este e-mail puder entrar na equipe, a pessoa recebe o convite em instantes. O convite vale por 3 dias.';
const VAGAS_AVISO_LOTE_PADRAO = 25;
const VAGAS_AVISO_LOTE_MAX = 50;
const VAGAS_AVISO_INTERVALO_MS = 600;   // ~2 envios por segundo (limite padrão do Resend)
const VAGAS_MSG_CIDADE_FECHADA_AVISO = 'A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.';
const VAGAS_BUCKET_FOTOS = 'vagas-fotos';
const VAGAS_FOTO_SEGUNDOS = 300;
const VAGAS_LIMITE_CORPO = 4000;
// Logo do topo dos e-mails do Vagas: PNG como o da moldura (o Gmail não mostra SVG), 903×136, mostrado a 188 px (scripts/marca-vagas-email.mjs).
const VAGAS_LOGO_EMAIL = 'https://disc.gestaosemcaos.com.br/assets/marca/vsc-logo-email.png';
const VAGAS_RODAPE = 'Vagas sem Caos · uma empresa do grupo Gestão sem Caos. Nunca pague para se candidatar: se alguém pedir em nosso nome, é golpe.';

function lerEnvVagasConta(get) {
  const env = {};
  NOMES_ENV_VAGAS_CONTA.forEach((n) => { let v = ''; try { v = get(n) || ''; } catch (err) { v = ''; } env[n] = String(v).trim(); });
  return env;
}

function siteVagas(env) {
  try { return new URL(String((env && env.VAGAS_SITE_URL) || VAGAS_SITE_PADRAO).trim()).origin; } catch (err) { return VAGAS_SITE_PADRAO; }
}

// Só ASCII visível (! a ~), igual a vagas_interno.email (20261024120003) e a VAGAS_REGRAS.normalizarEmail: o que o banco
// aceita a Function também aceita (senão a fila do aviso de abertura travava num e-mail com caractere invisível).
function emailVagas(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return e.length <= 254 && /^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$/.test(e) ? e : '';
}

/** "ana.souza@empresa.com.br" -> "a***@e***.com.br" */
function mascararEmailVagas(e) {
  const m = /^([^@]+)@([^.]+)(\..+)?$/.exec(String(e || ''));
  if (!m) return '';
  return m[1].charAt(0) + '***@' + m[2].charAt(0) + '***' + (m[3] || '');
}

/** Link do e-mail no domínio do site: a tela entrar.html confere o código no clique (verifyOtp). */
function linkVagas(env, tokenHash, tipo) {
  return siteVagas(env) + '/entrar.html?token_hash=' + encodeURIComponent(tokenHash) + '&type=' + encodeURIComponent(tipo);
}

/** E-mails com a marca Vagas sem Caos (a moldura comum, com o logo do Vagas no lugar do da Gestão sem Caos).
 *  tipo: confirmar | jaTemConta | senha | assistido | operador | conviteEquipe | conviteEquipeOutraConta | cidadeAbriu
 *  (textos completos para revisão: conteudo/vagas-textos/emails/convite-equipe*.html e cidade-abriu.html).
 *  cidadeAbriu: d.cidade, d.perfil ('pessoa' | 'empresa'), d.url (criar a conta), d.urlSair (sair da lista de espera). */
function montarEmailVagas(tipo, d) {
  d = d || {};
  const primeiro = String(d.nome || '').trim().split(/\s+/)[0] || '';
  const ola = primeiro ? 'Olá, ' + primeiro + '!' : 'Olá!';
  const empresa = String(d.empresa || '').trim() || 'uma empresa';
  const quem = String(d.quem || '').trim();
  const convidou = (quem ? quem + ', da empresa ' + empresa + ', convidou' : 'A empresa ' + empresa + ' convidou') +
    ' você para a equipe dela no Vagas sem Caos' + (d.cidade ? ', em ' + d.cidade : '') + '.';
  const cidadeAviso = String(d.cidade || '').trim() || 'a sua cidade';
  const pediu = 'Você pediu para ser avisado(a) quando o Vagas sem Caos abrisse em ' + cidadeAviso + '.';
  const modelos = {
    confirmar: { assunto: 'Confirme seu e-mail — Vagas sem Caos', titulo: 'Confirme seu e-mail',
      paragrafos: [ola, 'Falta só um passo para usar o Vagas sem Caos: confirme que este e-mail é seu e crie a sua senha.'],
      botao: 'Confirmar e criar senha', nota: 'O link vale por tempo limitado e funciona uma vez só. Se você não pediu esta conta, ignore este e-mail: sem o clique, nada acontece.' },
    jaTemConta: { assunto: 'Você já tem conta — Vagas sem Caos', titulo: 'Você já tem conta',
      paragrafos: [ola, 'Alguém (talvez você) tentou criar uma conta com este e-mail, mas ela já existe.',
        'Para entrar, use a sua senha. Se não lembra, toque em "Esqueci minha senha" na tela de entrada.'],
      botao: 'Entrar', nota: 'Se não foi você, pode ignorar este e-mail: nada mudou na sua conta.' },
    senha: { assunto: 'Crie uma nova senha — Vagas sem Caos', titulo: 'Crie uma nova senha',
      paragrafos: [ola, 'Recebemos um pedido para criar uma nova senha da sua conta no Vagas sem Caos.'],
      botao: 'Criar nova senha', nota: 'O link vale por tempo limitado e funciona uma vez só. Se você não pediu, ignore este e-mail: a senha atual continua valendo.' },
    assistido: { assunto: 'Ative a sua conta — Vagas sem Caos', titulo: 'Ative a sua conta',
      paragrafos: [ola, 'A equipe do Vagas sem Caos começou o seu cadastro, como você pediu. Para ativar a conta, confirme que este e-mail é seu e crie a sua senha.',
        'Sem a sua confirmação, a conta não vale e ninguém vê os seus dados.'],
      botao: 'Ativar minha conta', nota: 'Se você não pediu este cadastro, ignore este e-mail.' },
    operador: { assunto: 'Acesso de operação — Vagas sem Caos', titulo: 'Seu acesso de operação',
      paragrafos: [ola, 'A Gestão sem Caos criou o seu acesso de operação do Vagas sem Caos' + (d.cidade ? ' em ' + d.cidade : '') + '. Crie a sua senha para entrar.'],
      botao: 'Criar minha senha', nota: 'O link vale por tempo limitado e funciona uma vez só.' },
    conviteEquipe: { assunto: 'Convite para a equipe de ' + empresa + ' — Vagas sem Caos', titulo: 'Convite para a equipe da empresa',
      paragrafos: [ola, convidou, 'Na equipe, você publica vagas, vê os cartões de quem se candidatou (sem nome nem contato até o Combinou) e conversa pela plataforma.',
        'Para aceitar, abra o link e entre com este e-mail. Se ainda não tem conta, o mesmo link confirma o e-mail e cria a sua senha.'],
      botao: 'Ver o convite', nota: 'O convite vale por 3 dias e funciona uma vez só. Se você não conhece esta empresa, ignore este e-mail: sem o seu aceite, nada acontece.' },
    conviteEquipeOutraConta: { assunto: 'Convite para a equipe de ' + empresa + ' — Vagas sem Caos', titulo: 'Convite para a equipe da empresa',
      paragrafos: [ola, convidou, 'Este e-mail já é usado numa conta do Vagas sem Caos de outro tipo, e cada e-mail tem um tipo de conta só. Para entrar na equipe, peça a quem convidou para usar outro e-mail seu.'],
      botao: 'Abrir o Vagas sem Caos', nota: 'Se você não conhece esta empresa, ignore este e-mail: nada muda na sua conta.' },
    cidadeAbriu: d.perfil === 'empresa'
      ? { assunto: 'O Vagas sem Caos chegou a ' + cidadeAviso, titulo: 'Chegamos a ' + cidadeAviso,
        paragrafos: ['Olá!', pediu + ' Abriu: a sua empresa já pode publicar vagas e conversar, pela plataforma, com quem se interessar.',
          'Crie a conta da empresa com o CNPJ (MEI também serve) e publique a sua primeira vaga.'],
        botao: 'Criar a conta da empresa', nota: 'Este é o aviso que você pediu. Depois dele, o seu e-mail sai da lista de espera desta cidade.' }
      : { assunto: 'O Vagas sem Caos chegou a ' + cidadeAviso, titulo: 'Chegamos a ' + cidadeAviso,
        paragrafos: ['Olá!', pediu + ' Abriu: as vagas das empresas da cidade já estão no site.',
          'Para dizer "Quero" numa vaga, crie a sua conta. Leva 2 minutos, e procurar emprego aqui é sempre de graça.'],
        botao: 'Criar minha conta', nota: 'Este é o aviso que você pediu. Depois dele, o seu e-mail sai da lista de espera desta cidade.' }
  };
  const m = modelos[tipo] || modelos.confirmar;
  const extra = tipo === 'cidadeAbriu' && d.urlSair
    ? { antes: 'Deixou também o WhatsApp e não quer o aviso por lá?', texto: 'Sair da lista de espera', url: d.urlSair } : null;
  let html = htmlMarca({ titulo: m.titulo, previa: m.paragrafos[1], paragrafos: m.paragrafos, botao: { texto: m.botao, url: d.url }, nota: m.nota,
    rodape: VAGAS_RODAPE }).replace('<img src="' + LOGO_EMAIL + '" width="200" alt="Gestão sem Caos" style="display:block;width:200px;',
    '<img src="' + VAGAS_LOGO_EMAIL + '" width="188" alt="Vagas sem Caos" style="display:block;width:188px;');
  // Link a mais (sair da lista), logo antes do "Se o botão não funcionar" da moldura — sem mexer na moldura comum do DISC.
  if (extra) {
    const marca = '<p style="margin:0 0 8px;font-size:13px';
    const p = '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5B6878">' + escaparHtmlVagas(extra.antes) + ' <a href="' +
      escaparHtmlVagas(extra.url) + '" style="color:#F34405">' + escaparHtmlVagas(extra.texto) + '</a></p>';
    html = html.indexOf(marca) >= 0 ? html.replace(marca, p + marca) : html.replace('</td></tr><tr><td style="padding:24px', p + '</td></tr><tr><td style="padding:24px');
  }
  const texto = m.paragrafos.concat(['', m.botao + ': ' + d.url, '', m.nota], extra ? ['', extra.antes + ' ' + extra.texto + ': ' + extra.url] : [],
    ['', VAGAS_RODAPE]).join('\n');
  return { assunto: m.assunto, html, texto };
}

function escaparHtmlVagas(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Origem do pedido original (o banco transforma em chaves por IP; nunca guarda o IP inteiro de IPv6). */
function origemVagas(req) {
  return { cf: req.headers.get('cf-connecting-ip') || '', xff: req.headers.get('x-forwarded-for') || '' };
}

/** Cloudflare Turnstile (só se TURNSTILE_SECRET existir). */
async function conferirCaptchaVagas(base, token, ip) {
  const segredo = String((base.env && base.env.TURNSTILE_SECRET) || '').trim();
  if (!segredo) return true;
  if (typeof token !== 'string' || !token || token.length > 4000) return false;
  try {
    const corpo = new URLSearchParams({ secret: segredo, response: token });
    if (ip) corpo.set('remoteip', ip);
    const r = await base.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: corpo });
    const j = await r.json();
    return !!(j && j.success === true);
  } catch (err) {
    return false;
  }
}

function senhaAleatoriaVagas(base) {
  if (typeof base.aleatorio === 'function') return base.aleatorio();
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') + 'Aa1!';
}

async function enviarEmailVagas(base, para, tipo, dados) {
  const m = montarEmailVagas(tipo, dados);
  await criarResend({ apiKey: base.env.RESEND_API_KEY, remetente: base.env.VAGAS_EMAIL_REMETENTE || base.env.EMAIL_REMETENTE ||
    'Vagas sem Caos <onboarding@resend.dev>', fetch: base.fetch }).enviar({ para, assunto: m.assunto, html: m.html, texto: m.texto });
}

// Link de confirmação/convite: 'invite' (cria a senha no clique); se o Auth recusar para a conta pendente, 'magiclink'.
async function linkConfirmacaoVagas(base, email) {
  try {
    return { hash: await base.auth.gerarLink('invite', email), tipo: 'invite' };
  } catch (err) {
    return { hash: await base.auth.gerarLink('magiclink', email), tipo: 'magiclink' };
  }
}

function vagasEmailConfigurado(base) { return !!String((base.env && base.env.RESEND_API_KEY) || '').trim(); }
const vagasNeutro = (email) => ({ ok: true, enviado: true, mensagem: VAGAS_MSG_ENVIADO, email: mascararEmailVagas(email) });

async function acaoVagasCadastrar(base, corpo, origem) {
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  const tipo = corpo.tipo;
  if (tipo !== 'pessoa' && tipo !== 'empresa') return erro(VAGAS_MSG_TIPO);
  const versao = String(corpo.termosVersao || '').trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(versao)) return erro(VAGAS_MSG_TERMOS);
  const nome = String(corpo.nome || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  if (!(await conferirCaptchaVagas(base, corpo.captcha, origem.cf))) return erro(VAGAS_MSG_CAPTCHA, { captcha: true });
  const lim = await base.db.limite('cadastrar', origem.cf, origem.xff, email, null);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  const c = await base.db.consultar(email);
  if (!c.existe) {
    const u = await base.auth.criarUsuario({ email, senha: senhaAleatoriaVagas(base), app: { produto: 'vagas', tipo }, usuario: nome ? { nome } : {} });
    const reg = await base.db.registrar(u.id, { tipo, termosVersao: versao });
    if (!reg || reg.ok !== true) throw new Error('registro da conta falhou');
    const l = await linkConfirmacaoVagas(base, email);
    await enviarEmailVagas(base, email, 'confirmar', { nome, url: linkVagas(base.env, l.hash, l.tipo) });
  } else if (c.produto === 'vagas' || c.conta) {
    if (!c.confirmada) {
      // Conta pendente (ninguém confirmou o e-mail ainda): quem tem o e-mail decide o tipo. Se um terceiro "pré-registrou"
      // o e-mail com outro tipo, o banco troca (vagas_conta_registrar) e o app_metadata acompanha. O banco recusa a troca
      // em conta assistida, com vínculo de empresa ou convite de operação: aí o tipo fica e o link vai de novo, com a
      // MESMA resposta neutra (nada revela que o e-mail tem vínculo).
      const reg = await base.db.registrar(c.userId, { tipo, termosVersao: versao });
      if (reg && reg.ok === true && c.conta && c.conta.tipo !== tipo && base.auth.atualizarApp) {
        await base.auth.atualizarApp(c.userId, { produto: 'vagas', tipo });
      }
      const l = await linkConfirmacaoVagas(base, email);
      await enviarEmailVagas(base, email, 'confirmar', { nome, url: linkVagas(base.env, l.hash, l.tipo) });
    } else {
      await enviarEmailVagas(base, email, 'jaTemConta', { url: siteVagas(base.env) + '/entrar.html' });
    }
  }
  // Outra conta do projeto (painel DISC): nada é enviado, e a resposta é a mesma.
  return vagasNeutro(email);
}

// quem (JWT, opcional): operador(a) de alguma cidade ou a equipe reenviam SEM captcha (a tela do operador não tem o "não sou
// robô"), com o limite próprio 'reenviar_op' por quem age (20261024120005); o operador só reenvia para conta assistida da
// cidade dele (consultar.conta.assistidaCidade) e a equipe para qualquer conta do Vagas pendente. Sem JWT ou com JWT de outra
// conta: o caminho de sempre (captcha). A resposta é a mesma (neutra) em todos os casos.
async function acaoVagasReenviar(base, corpo, origem, quem) {
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  const ops = quem && Array.isArray(quem.operador) ? quem.operador.filter((o) => o && o.papel === 'operador').map((o) => o.cidade) : [];
  const operacao = !!quem && (quem.admin === true || ops.length > 0);
  if (!operacao && !(await conferirCaptchaVagas(base, corpo.captcha, origem.cf))) return erro(VAGAS_MSG_CAPTCHA, { captcha: true });
  const lim = await base.db.limite(operacao ? 'reenviar_op' : 'reenviar', origem.cf, origem.xff, email, operacao ? quem.id : null);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  const c = await base.db.consultar(email);
  const daCidade = !operacao || quem.admin === true || (!!c.conta && !!c.conta.assistidaCidade && ops.includes(c.conta.assistidaCidade));
  if (c.existe && (c.produto === 'vagas' || c.conta) && !c.confirmada && daCidade) {
    const l = await linkConfirmacaoVagas(base, email);
    await enviarEmailVagas(base, email, c.conta && c.conta.tipo === 'operador' ? 'operador' : 'confirmar', { url: linkVagas(base.env, l.hash, l.tipo) });
  }
  return vagasNeutro(email);
}

async function acaoVagasEsqueci(base, corpo, origem) {
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  if (!(await conferirCaptchaVagas(base, corpo.captcha, origem.cf))) return erro(VAGAS_MSG_CAPTCHA, { captcha: true });
  const lim = await base.db.limite('esqueci', origem.cf, origem.xff, email, null);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  const c = await base.db.consultar(email);
  if (c.existe && c.conta && !c.admin) {
    const hash = await base.auth.gerarLink('recovery', email);
    await enviarEmailVagas(base, email, 'senha', { url: linkVagas(base.env, hash, 'recovery') });
  }
  return vagasNeutro(email);
}

// Quem chama (JWT): {id, email, admin, conta, operador:[{cidade, papel}]} | null
async function quemChamaVagas(base, req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const u = await base.auth.usuarioDoToken(m[1].trim());
  if (!u || !u.id) return null;
  const q = await base.db.quem(u.id);
  return Object.assign({ id: u.id, email: u.email || '' }, q || {});
}

async function acaoVagasAssistido(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  const cidade = String(corpo.cidade || '').trim().toLowerCase();
  const pode = quem.admin || (Array.isArray(quem.operador) && quem.operador.some((o) => o.cidade === cidade && o.papel === 'operador'));
  if (!pode) return erro('Sem permissão.');
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  const tipo = corpo.tipo;
  if (tipo !== 'pessoa' && tipo !== 'empresa') return erro(VAGAS_MSG_TIPO);
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  const lim = await base.db.limite('assistido', origem.cf, origem.xff, email, quem.id);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  const c = await base.db.consultar(email);
  if (c.existe) return erro(VAGAS_MSG_JA_EXISTE, { existe: true });
  const nome = String(corpo.nome || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const u = await base.auth.criarUsuario({ email, senha: senhaAleatoriaVagas(base), app: { produto: 'vagas', tipo, assistido: true },
    usuario: nome ? { nome } : {} });
  const reg = await base.db.registrar(u.id, { tipo, assistidaPor: quem.id, cidade, empresaId: corpo.empresaId || '',
    codigoEvento: String(corpo.codigoEvento || '') });
  if (!reg || reg.ok !== true) {
    try { await base.auth.excluirUsuario(u.id); } catch (err) { /* sem conta pela metade */ }
    return erro((reg && reg.erro) || MSG_ERRO_INTERNO);
  }
  const l = await linkConfirmacaoVagas(base, email);
  await enviarEmailVagas(base, email, 'assistido', { nome, url: linkVagas(base.env, l.hash, l.tipo) });
  return { ok: true, enviado: true, email: mascararEmailVagas(email) };
}

async function acaoVagasOperador(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  if (!quem.admin) return erro('Sem permissão.');
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  const cidade = String(corpo.cidade || '').trim().toLowerCase();
  const papel = corpo.papel === 'moderador' ? 'moderador' : 'operador';
  const lim = await base.db.limite('operador', origem.cf, origem.xff, email, quem.id);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  const c = await base.db.consultar(email);
  if (c.existe) {
    if (!c.conta || c.conta.tipo !== 'operador') return erro('Este e-mail já tem outra conta. Use um e-mail só para a operação.');
    const reg = await base.db.registrar(c.userId, { tipo: 'operador', operador: { cidade, papel } });
    if (!reg || reg.ok !== true) return erro((reg && reg.erro) || MSG_ERRO_INTERNO);
    return { ok: true, existente: true, email: mascararEmailVagas(email) };
  }
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  const u = await base.auth.criarUsuario({ email, senha: senhaAleatoriaVagas(base), app: { produto: 'vagas', tipo: 'operador' }, usuario: {} });
  const reg = await base.db.registrar(u.id, { tipo: 'operador', assistidaPor: quem.id, operador: { cidade, papel } });
  if (!reg || reg.ok !== true) {
    try { await base.auth.excluirUsuario(u.id); } catch (err) { /* sem conta pela metade */ }
    return erro((reg && reg.erro) || MSG_ERRO_INTERNO);
  }
  const l = await linkConfirmacaoVagas(base, email);
  await enviarEmailVagas(base, email, 'operador', { cidade: corpo.cidadeNome || '', url: linkVagas(base.env, l.hash, l.tipo) });
  return { ok: true, enviado: true, email: mascararEmailVagas(email) };
}

async function acaoVagasExcluir(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  if (quem.admin) return erro('Esta conta também acessa o painel DISC. Fale com a Gestão sem Caos para excluir.');
  if (!quem.conta) return erro('Conta não encontrada.');
  if (corpo.confirmar !== 'EXCLUIR') return erro('Para excluir, digite EXCLUIR.');
  const lim = await base.db.limite('excluir', origem.cf, origem.xff, '', quem.id);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  // A última pessoa dona de uma empresa que tem equipe não sai sem passar a empresa adiante (o banco confere).
  const pode = await base.db.exclusaoConferir(quem.id);
  if (!pode || pode.ok !== true) return erro(pode && typeof pode.erro === 'string' ? pode.erro : MSG_ERRO_INTERNO);
  // A foto do Storage sai antes (o Auth não apaga usuário dono de arquivo; e a foto é dado pessoal).
  if (base.storage) await base.storage.remover(VAGAS_BUCKET_FOTOS, [quem.id + '/foto.jpg']);
  await base.auth.excluirUsuario(quem.id);
  return { ok: true, excluida: true };
}

const UUID_VAGAS = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link do convite de equipe: conta nova ou pendente recebe também o link de confirmação (cria a senha). */
function linkConviteEquipe(env, token, confirmacao) {
  const t = encodeURIComponent(String(token || ''));
  return confirmacao ? linkVagas(env, confirmacao.hash, confirmacao.tipo) + '&convite=' + t : siteVagas(env) + '/entrar.html?convite=' + t;
}

/** Convite para a equipe da empresa: o banco decide (dono(a), limites, token) e diz para onde vai o e-mail; a tela recebe
 *  sempre a mesma resposta (nada revela se o e-mail tem conta, nem de que tipo). */
async function acaoVagasConviteEquipe(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  const empresaId = String(corpo.empresaId || '').trim();
  if (!UUID_VAGAS.test(empresaId)) return erro('Empresa não encontrada.');
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  const r = await base.db.conviteEquipe(quem.id, empresaId, email, origem.cf, origem.xff);
  if (!r || r.ok !== true) {
    // Erro do banco (permissão, limite, e-mail que já está na equipe): só a mensagem e as marcas, nunca outro campo.
    if (!r || typeof r.erro !== 'string') return erro(MSG_ERRO_INTERNO);
    const marcas = {};
    ['sessaoExpirada', 'confirmar', 'suspensa', 'bloqueado'].forEach((k) => { if (r[k]) marcas[k] = true; });
    return erro(r.erro, marcas);
  }
  if (!/^[0-9a-f]{64}$/.test(String(r.token || ''))) throw new Error('convite sem token');
  const dados = { empresa: r.empresaNome, cidade: r.cidadeNome, quem: r.convidadoPor };
  if (r.destino === 'nova') {
    const u = await base.auth.criarUsuario({ email, senha: senhaAleatoriaVagas(base), app: { produto: 'vagas', tipo: 'empresa', convite: true }, usuario: {} });
    const reg = await base.db.registrar(u.id, { tipo: 'empresa' });
    if (!reg || reg.ok !== true) {
      try { await base.auth.excluirUsuario(u.id); } catch (err) { /* sem conta pela metade */ }
      throw new Error('registro da conta do convite falhou');
    }
    const l = await linkConfirmacaoVagas(base, email);
    await enviarEmailVagas(base, email, 'conviteEquipe', Object.assign({ url: linkConviteEquipe(base.env, r.token, l) }, dados));
  } else if (r.destino === 'empresa_pendente') {
    const l = await linkConfirmacaoVagas(base, email);
    await enviarEmailVagas(base, email, 'conviteEquipe', Object.assign({ url: linkConviteEquipe(base.env, r.token, l) }, dados));
  } else if (r.destino === 'empresa') {
    await enviarEmailVagas(base, email, 'conviteEquipe', Object.assign({ url: linkConviteEquipe(base.env, r.token, null) }, dados));
  } else if (r.destino === 'outro_tipo') {
    await enviarEmailVagas(base, email, 'conviteEquipeOutraConta', Object.assign({ url: siteVagas(base.env) + '/entrar.html' }, dados));
  }
  // 'nenhum' (conta só do painel DISC ou suspensa): nada é enviado, e a resposta é a mesma.
  const c = r.convite || {};
  return { ok: true, enviado: true, mensagem: VAGAS_MSG_CONVITE_EQUIPE, email: mascararEmailVagas(email),
    convite: { id: c.id, email: c.email, papel: c.papel, status: c.status, criadoEm: c.criadoEm, expiraEm: c.expiraEm } };
}

/** Links do aviso de abertura: criar a conta (pessoa ou empresa) e sair da lista de espera (páginas de divulgação, #sair).
 *  Com o token de saída (64 hex, do lote), o link tira a pessoa sem pedir o e-mail (vagas_lista_espera_sair_link). */
function linksAvisoAbertura(env, cidade, perfil, sairToken) {
  const site = siteVagas(env);
  const c = encodeURIComponent(String(cidade || ''));
  const t = /^[0-9a-f]{64}$/.test(String(sairToken || '')) ? '&sair=' + sairToken : '';
  return perfil === 'empresa'
    ? { criar: site + '/entrar.html?tipo=empresa#criar', sair: site + '/empresas.html?cidade=' + c + t + '#sair' }
    : { criar: site + '/entrar.html#criar', sair: site + '/emprego.html?cidade=' + c + t + '#sair' };
}

/** Aviso de abertura da cidade à lista de espera (só a equipe): o banco reserva um lote de quem ainda não foi avisado
 *  (e marca na hora: rodar de novo não manda duas vezes) e devolve e-mail e perfil SÓ para cá; aqui sai um e-mail por
 *  pessoa, ~2 por segundo; quem falhou volta para a fila. A tela recebe só contagens — nunca um e-mail da lista. */
async function acaoVagasAvisarListaEspera(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  if (!quem.admin) return erro('Sem permissão.');
  const cidade = String(corpo.cidade || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cidade) || cidade.length > 60) return erro('Cidade não encontrada.');
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  const pedido = parseInt(corpo.limite, 10);
  const limite = Math.min(Math.max(isFinite(pedido) ? pedido : VAGAS_AVISO_LOTE_PADRAO, 1), VAGAS_AVISO_LOTE_MAX);
  const r = await base.db.avisoLote(quem.id, cidade, limite);
  if (!r || r.ok !== true) {
    if (!r || typeof r.erro !== 'string') return erro(MSG_ERRO_INTERNO);
    return erro(r.erro, r.sessaoExpirada ? { sessaoExpirada: true } : undefined);
  }
  const nome = String((r.cidade && r.cidade.nome) || '');
  const lote = Array.isArray(r.lote) ? r.lote : [];
  const esperar = typeof base.esperar === 'function' ? base.esperar : (ms) => new Promise((res) => setTimeout(res, ms));
  const enviados = [];
  const falhas = [];
  const invalidos = [];
  for (let i = 0; i < lote.length; i++) {
    const c = lote[i] || {};
    const email = emailVagas(c.email);
    if (!UUID_VAGAS.test(String(c.id || ''))) continue;
    if (!email) { invalidos.push(c.id); continue; }
    if (i > 0) await esperar(VAGAS_AVISO_INTERVALO_MS);
    const l = linksAvisoAbertura(base.env, cidade, c.perfil, c.sairToken);
    try {
      await enviarEmailVagas(base, email, 'cidadeAbriu', { cidade: nome, perfil: c.perfil === 'empresa' ? 'empresa' : 'pessoa', url: l.criar, urlSair: l.sair });
      enviados.push(c.id);
    } catch (err) {
      falhas.push(c.id);
    }
  }
  let contagens = r.contagens || {};
  if (enviados.length || falhas.length || invalidos.length) {
    const m = await base.db.avisoMarcar(quem.id, cidade, enviados, falhas, invalidos);
    if (!m || m.ok !== true) throw new Error('aviso: marcar o lote falhou');
    contagens = m.contagens || contagens;
  }
  const n = (k) => (typeof contagens[k] === 'number' ? contagens[k] : 0);
  const restantes = n('aAvisarEmail');
  // O teto que o banco devolve já desconta este lote (R4-6, 20261024120005: antes a Function descontava de novo).
  const disponivel = r.teto && typeof r.teto.disponivel === 'number' ? r.teto.disponivel : 1;
  // travado: o lote não avisou ninguém e só teve falhas (a tela para de repetir); tetoAtingido: acabou a cota de 24 h.
  return { ok: true, cidade: { slug: cidade, nome }, enviados: enviados.length, falhas: falhas.length, invalidos: invalidos.length,
    restantes, aAvisarWhatsapp: n('aAvisarWhatsapp'), terminou: restantes === 0,
    travado: enviados.length === 0 && falhas.length > 0, tetoAtingido: restantes > 0 && disponivel <= 0 };
}

/** Lista de espera com o Turnstile: confere o captcha (só com TURNSTILE_SECRET) e grava pelo banco
 *  (vagas_conta_lista_espera), que aplica as mesmas regras da RPC pública com o limite maior por origem quando o captcha
 *  foi conferido. Só os campos da lista seguem para o banco. */
async function acaoVagasListaEspera(base, corpo, origem) {
  const dados = {};
  ['cidade', 'email', 'perfil', 'whatsapp', 'origem', 'site'].forEach((k) => {
    if (typeof corpo[k] === 'string') dados[k] = corpo[k].slice(0, 300);
  });
  const humano = !!String((base.env && base.env.TURNSTILE_SECRET) || '').trim();
  if (humano && !(await conferirCaptchaVagas(base, corpo.captcha, origem.cf))) return erro(VAGAS_MSG_CAPTCHA, { captcha: true });
  const r = await base.db.listaEspera(dados, origem.cf, origem.xff, humano);
  if (!r || typeof r.ok !== 'boolean') return erro(MSG_ERRO_INTERNO);
  return r;
}

/** URL assinada curta da foto: o banco decide se pode (vagas_conta_foto); aqui só se assina o caminho que ele devolver. */
async function acaoVagasFoto(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  const cand = String(corpo.candidatura || '').trim();
  if (cand && !UUID_VAGAS.test(cand)) return erro('Candidatura não encontrada.');
  const r = await base.db.foto(quem.id, cand || null);
  if (!r || r.ok !== true) return r || erro(MSG_ERRO_INTERNO);
  const url = await base.storage.assinar(VAGAS_BUCKET_FOTOS, r.caminho, VAGAS_FOTO_SEGUNDOS);
  return { ok: true, url, expiraEm: new Date(Date.now() + VAGAS_FOTO_SEGUNDOS * 1000).toISOString() };
}

/** Banco (service role) e Auth (admin) reais, a partir do supabase-js. */
function criarBaseVagasConta(createClient, getEnv, extras) {
  const env = lerEnvVagasConta(getEnv);
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  async function rpc(nome, args) {
    const { data, error } = await sb.rpc(nome, args);
    if (error) throw new Error('falha no banco de dados (' + String(error.message || error.code || 'erro').substring(0, 160) + ')');
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  return Object.assign({
    env,
    fetch: (u, o) => fetch(u, o),
    db: {
      limite: (acao, cf, xff, email, ator) => rpc('vagas_conta_limite', { p_acao: acao, p_cf: cf || '', p_xff: xff || '', p_email: email || '', p_ator: ator || null }),
      consultar: (email) => rpc('vagas_conta_consultar', { p_email: email }),
      registrar: (userId, dados) => rpc('vagas_conta_registrar', { p_user: userId, p_dados: dados }),
      quem: (userId) => rpc('vagas_conta_quem', { p_user: userId }),
      foto: (userId, candidatura) => rpc('vagas_conta_foto', { p_user: userId, p_candidatura: candidatura || null }),
      conviteEquipe: (userId, empresaId, email, cf, xff) => rpc('vagas_conta_convite_equipe', { p_user: userId, p_empresa: empresaId,
        p_email: email, p_cf: cf || '', p_xff: xff || '' }),
      exclusaoConferir: (userId) => rpc('vagas_conta_exclusao_conferir', { p_user: userId }),
      avisoLote: (userId, cidade, limite) => rpc('vagas_conta_aviso_lote', { p_user: userId, p_cidade: cidade, p_limite: limite }),
      avisoMarcar: (userId, cidade, enviados, falhas, invalidos) => rpc('vagas_conta_aviso_marcar', { p_user: userId, p_cidade: cidade,
        p_enviados: enviados || [], p_falhas: falhas || [], p_invalidos: invalidos || [] }),
      listaEspera: (dados, cf, xff, humano) => rpc('vagas_conta_lista_espera', { p_dados: dados || {}, p_cf: cf || '', p_xff: xff || '',
        p_humano: !!humano })
    },
    storage: {
      async assinar(bucket, caminho, segundos) {
        const { data, error } = await sb.storage.from(bucket).createSignedUrl(caminho, segundos);
        if (error || !data || !data.signedUrl) throw new Error('Storage: ' + String((error && error.message) || 'sem URL').substring(0, 160));
        return data.signedUrl;
      },
      async remover(bucket, caminhos) {
        const { error } = await sb.storage.from(bucket).remove(caminhos);
        if (error) throw new Error('Storage: ' + String(error.message || 'falha ao apagar').substring(0, 160));
      }
    },
    auth: {
      async criarUsuario(u) {
        const { data, error } = await sb.auth.admin.createUser({ email: u.email, password: u.senha, email_confirm: false,
          app_metadata: u.app, user_metadata: u.usuario || {} });
        if (error || !data || !data.user) throw new Error('Auth: ' + String((error && error.message) || 'sem usuário').substring(0, 160));
        return { id: data.user.id };
      },
      async gerarLink(tipo, email) {
        const { data, error } = await sb.auth.admin.generateLink({ type: tipo, email });
        const hash = data && data.properties && data.properties.hashed_token;
        if (error || !hash) throw new Error('Auth: ' + String((error && error.message) || 'sem link').substring(0, 160));
        return hash;
      },
      async usuarioDoToken(jwt) {
        const { data, error } = await sb.auth.getUser(jwt);
        if (error || !data || !data.user) return null;
        return { id: data.user.id, email: data.user.email || '' };
      },
      async atualizarApp(id, app) {
        const { error } = await sb.auth.admin.updateUserById(id, { app_metadata: app });
        if (error) throw new Error('Auth: ' + String(error.message || 'falha ao atualizar').substring(0, 160));
      },
      async excluirUsuario(id) {
        const { error } = await sb.auth.admin.deleteUser(id);
        if (error) throw new Error('Auth: ' + String(error.message || 'falha ao excluir').substring(0, 160));
      }
    }
  }, extras || {});
}

/** Origem do painel do DISC (SITE_URL do DISC; sem ele, o endereço oficial). */
function painelDiscVagas(env) {
  try { return new URL(String((env && env.SITE_URL) || VAGAS_PAINEL_DISC_PADRAO).trim()).origin; } catch (err) { return VAGAS_PAINEL_DISC_PADRAO; }
}

/** CORS: só a origem de VAGAS_SITE_URL, a do painel do DISC (SITE_URL) e localhost/127.0.0.1 para testes. O token de quem
 * chama continua obrigatório nas ações com login (CORS não é a proteção; só deixa o navegador do painel ler a resposta). */
function vagasCors(req, env) {
  const origem = req.headers.get('origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  const site = siteVagas(env);
  const painel = painelDiscVagas(env);
  if (origem && (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origem) || origem === site || origem === painel)) {
    h['Access-Control-Allow-Origin'] = origem;
  }
  return h;
}

function vagasResponder(obj, status, extras) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extras || {})
  });
}

async function atenderVagasConta(req, base) {
  const cors = vagasCors(req, base.env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return vagasResponder(erro('Método não permitido.'), 405, cors);
  try {
    const texto = await req.text();
    if (!texto) return vagasResponder(erro('Requisição vazia.'), 200, cors);
    if (texto.length > VAGAS_LIMITE_CORPO) return vagasResponder(erro('Requisição grande demais.'), 200, cors);
    let corpo;
    try { corpo = JSON.parse(texto); } catch (err) { return vagasResponder(erro('JSON inválido.'), 200, cors); }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return vagasResponder(erro('Formato de requisição inválido.'), 200, cors);
    const origem = origemVagas(req);
    let r;
    if (corpo.acao === 'cadastrar') r = await acaoVagasCadastrar(base, corpo, origem);
    else if (corpo.acao === 'reenviar') r = await acaoVagasReenviar(base, corpo, origem, await quemChamaVagas(base, req).catch(() => null));
    else if (corpo.acao === 'esqueci') r = await acaoVagasEsqueci(base, corpo, origem);
    else if (corpo.acao === 'assistido') r = await acaoVagasAssistido(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'operador') r = await acaoVagasOperador(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'excluir') r = await acaoVagasExcluir(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'foto') r = await acaoVagasFoto(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'convite_equipe') r = await acaoVagasConviteEquipe(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'avisar_lista_espera') r = await acaoVagasAvisarListaEspera(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'lista_espera') r = await acaoVagasListaEspera(base, corpo, origem);
    else r = erro('Ação desconhecida.');
    return vagasResponder(r, 200, cors);
  } catch (err) {
    try { console.error(err && err.message ? err.message : err); } catch (e) { /* sem console */ }
    return vagasResponder(erro(MSG_ERRO_INTERNO), 200, cors);
  }
}

// ======== supabase/funcoes-fonte/vagas-conta/index.ts ========
// Edge Function "vagas-conta" — contas do Vagas sem Caos (cadastrar, reenviar, esqueci, assistido, operador, excluir, foto,
// convite_equipe, avisar_lista_espera, lista_espera).
// Pública: no painel, desligue "Verify JWT" (supabase/config.toml já declara); as ações de operação e exclusão conferem o JWT
// sozinhas. Segredos: RESEND_API_KEY, VAGAS_SITE_URL, VAGAS_EMAIL_REMETENTE?, TURNSTILE_SECRET?. Lógica em
// supabase/funcoes-compartilhadas/vagas-conta.js. Para colar no painel do Supabase use dist/funcoes/vagas-conta/index.ts
// (gerado por npm run montar:funcoes).

Deno.serve((req) => atenderVagasConta(req, criarBaseVagasConta(createClient, (n) => Deno.env.get(n))));
