// @ts-nocheck
// ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITE. Gerado de supabase/funcoes-fonte/clima/index.ts por: npm run montar:funcoes
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

// ======== supabase/funcoes-compartilhadas/whatsapp.js ========
// Código de confirmação pelo WhatsApp (Pesquisa de Clima, link pessoal): a interface está pronta, mas NENHUM provedor
// foi contratado ainda (decisão do dono). Sem provedor, configurado = false e a opção "Código por WhatsApp" não aparece
// nem no painel nem para quem responde.
//
// Para ligar um provedor (ex.: API oficial do WhatsApp Business ou um intermediário):
//   1. acrescente em PROVEDORES_WHATSAPP uma fábrica nome -> ({env, fetch}) => ({ configurado, enviarCodigo({para, codigo,
//      empresa, minutos}) -> Promise<{id}> }) que leia as próprias credenciais de env (segredos do Supabase) e lance erro
//      em falha;
//   2. acrescente os nomes desses segredos em NOMES_ENV_WHATSAPP;
//   3. defina o segredo WHATSAPP_PROVEDOR = <nome> nas Edge Functions "clima" e "admin".
// "para" é o telefone só com dígitos e DDI (ex.: 5511999998888). Nunca registre o código em log.

const NOMES_ENV_WHATSAPP = ['WHATSAPP_PROVEDOR'];

/** Fábricas dos provedores (vazio: nenhum contratado). Os testes registram um falso aqui. */
const PROVEDORES_WHATSAPP = {};

/** {configurado, provedor, enviarCodigo(m)} — enviarCodigo lança erro se não houver provedor configurado. */
function criarWhatsApp(op) {
  const env = (op && op.env) || {};
  const nome = String(env.WHATSAPP_PROVEDOR || '').trim().toLowerCase();
  const fabrica = nome && Object.prototype.hasOwnProperty.call(PROVEDORES_WHATSAPP, nome) ? PROVEDORES_WHATSAPP[nome] : null;
  let prov = null;
  try { prov = fabrica ? fabrica({ env, fetch: op && op.fetch }) : null; } catch (err) { prov = null; }
  const ok = !!(prov && prov.configurado && typeof prov.enviarCodigo === 'function');
  return {
    configurado: ok,
    provedor: ok ? nome : '',
    async enviarCodigo(m) {
      if (!ok) throw new Error('WhatsApp: nenhum provedor configurado.');
      return prov.enviarCodigo(m);
    }
  };
}

// ======== supabase/funcoes-compartilhadas/clima.js ========
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

const NOMES_ENV_CLIMA = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SITE_URL', 'RESEND_API_KEY', 'EMAIL_REMETENTE']
  .concat(NOMES_ENV_WHATSAPP);
const CLIMA_MSG_LINK = 'Não foi possível enviar um código por este link. Use outra forma de confirmação ou fale com quem enviou o link.';
const CLIMA_MSG_NAO_CONFIGURADO = 'O envio do código por esta forma não está disponível agora. Use outra forma de confirmação ou fale com quem enviou o link.';
const CLIMA_MSG_FALHOU = 'Não foi possível enviar o código agora. Tente de novo em instantes ou use outra forma de confirmação.';
const CLIMA_LIMITE_CORPO = 2000;

function lerEnvClima(get) {
  const env = {};
  NOMES_ENV_CLIMA.forEach((n) => { let v = ''; try { v = get(n) || ''; } catch (err) { v = ''; } env[n] = String(v).trim(); });
  return env;
}

/** O que está ligado para mandar código (painel: "clima.envios" da função admin; aqui: antes de gerar o código). */
function climaEnviosDisponiveis(env, fetchFn) {
  return {
    email: !!String((env && env.RESEND_API_KEY) || '').trim(),
    whatsapp: criarWhatsApp({ env: env || {}, fetch: fetchFn }).configurado
  };
}

/** E-mail com o código (marca Gestão sem Caos; sem link nem botão). -> {assunto, html, texto} */
function montarEmailCodigoClima(d) {
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
function criarDbClima(sb) {
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

function criarBaseClima(createClient, getEnv, extras) {
  const env = lerEnvClima(getEnv);
  const servico = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return Object.assign({ env, fetch: (u, o) => fetch(u, o), db: criarDbClima(servico) }, extras || {});
}

/** {acao:'codigo', token, canal} -> {ok, canal, destino, minutos} | {ok:false, erro} */
async function acaoClimaCodigo(base, corpo) {
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
function climaCors(req, env) {
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
async function atenderClima(req, base) {
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

// ======== supabase/funcoes-fonte/clima/index.ts ========
// Edge Function "clima" — Pesquisa de Clima da Equipe, link pessoal (modos "identificação opcional" e "identificada").
// Pública: no painel, desligue "Verify JWT" (supabase/config.toml já declara). Ação: codigo {token, canal} — manda o código
// de confirmação por e-mail (Resend) ou WhatsApp (sem provedor ainda). Segredos: RESEND_API_KEY?, EMAIL_REMETENTE?,
// WHATSAPP_PROVEDOR?, SITE_URL. Lógica em supabase/funcoes-compartilhadas/clima.js. Para colar no painel do Supabase use
// dist/funcoes/clima/index.ts (gerado por npm run montar:funcoes).

Deno.serve((req) => atenderClima(req, criarBaseClima(createClient, (n) => Deno.env.get(n))));
