// Pages Function (Cloudflare) da página da vaga pelo link curto: GET /v/K7M2QX
//
// Monta a página INTEIRA no servidor (abre sem JavaScript) com as tags Open Graph que o WhatsApp lê para a
// prévia: título da vaga, empresa (ou "Empresa confidencial · verificada"), cidade/zona, modalidade e faixa
// salarial ou valor da diária. Nunca entra dado de pessoa.
//
// Dados: RPC pública do Supabase (anon) `RPC_ANUNCIO` (p_codigo text) -> {ok:true, anuncio:{...}} | {ok:false, erro}.
// Chave anon: variável `SUPABASE_ANON_KEY` do projeto no Cloudflare Pages (Settings > Variables and Secrets) ou,
// na falta dela, lida de /js/config.js do próprio site (é a chave pública, a mesma que o navegador usa).
//
// Exporta também as funções puras (sem rede) usadas em tests/vagas-hospedagem.test.js:
//   normalizarAnuncio(obj) -> anúncio com campos conhecidos (tolerante a variações de nome)
//   montarPaginaVaga(anuncio, origem) -> HTML da vaga
//   montarPaginaErro(tipo, origem) -> HTML de 404 ('nao_encontrada') ou 503 ('indisponivel')
//   descricaoOg(anuncio) / resumoLinha(anuncio) -> textos curtos da prévia
//   codigoValido(texto) -> 'K7M2QX' ou ''
//   lerChaveDoConfig(textoJs) -> chave anon encontrada num js/config.js
//   cabecalhosHtml(status, cache) -> cabeçalhos da resposta (os de vagas/_headers NÃO valem para Functions)

export const RPC_ANUNCIO = 'vagas_anuncio_publico';            // nome registrado pelo agente fundacao na mesa
export const SUPABASE_URL = 'https://tevpqngqzxcswmticjnr.supabase.co';
export const NOME_SITE = 'Vagas · Gestão sem Caos';
export const IMAGEM_OG = '/comum/marca/gsc-logo-email.png';     // PNG (o WhatsApp não mostra SVG)
export const CACHE_SEGUNDOS = 120;                               // prévia pode atrasar até 2 min depois de editar
const PRAZO_RPC_MS = 6000;

const MODALIDADES = { clt: 'CLT', temporario: 'Temporário', diaria: 'Diária', freelancer: 'Freelancer', estagio: 'Estágio' };

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function codigoValido(texto) {
  const c = String(texto || '').trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(c) ? c : '';
}

function texto(v) { return v == null ? '' : String(v).trim(); }
function numero(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function primeiro(obj, nomes) {
  for (const n of nomes) if (obj && obj[n] != null && obj[n] !== '') return obj[n];
  return undefined;
}

export function reais(centavos) {
  const n = numero(centavos);
  if (n == null) return '';
  const inteiro = Math.floor(Math.abs(n) / 100);
  const cents = Math.abs(n) % 100;
  const milhar = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + milhar + (cents ? ',' + String(cents).padStart(2, '0') : '');
}

/** Faixa salarial ou valor da diária em texto; '' quando o anúncio não informa. */
export function textoValor(a) {
  if (a.modalidade === 'diaria' && a.diariaValor != null) return reais(a.diariaValor) + ' por dia';
  if (a.salarioMin != null && a.salarioMax != null && a.salarioMax > a.salarioMin) return reais(a.salarioMin) + ' a ' + reais(a.salarioMax);
  if (a.salarioMin != null) return reais(a.salarioMin) + (a.salarioMax == null ? ' ou mais' : '');
  if (a.salarioMax != null) return 'até ' + reais(a.salarioMax);
  if (a.salarioTexto) return a.salarioTexto;
  return '';
}

/** Lê o JSON da RPC (ou já o anúncio) e devolve só o que a página usa, com nomes fixos. */
export function normalizarAnuncio(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const a = obj.anuncio || obj.vaga || obj.dados || obj;
  if (!a || typeof a !== 'object') return null;
  const emp = a.empresa && typeof a.empresa === 'object' ? a.empresa : {};
  const confidencial = !!primeiro(a, ['confidencial', 'empresaConfidencial']) || !!emp.confidencial;
  const nomeEmpresa = confidencial ? '' : texto(primeiro(a, ['empresaNome', 'empresa_nome']) || emp.nome || (typeof a.empresa === 'string' ? a.empresa : ''));
  const cidadeObj = a.cidade && typeof a.cidade === 'object' ? a.cidade : {};
  const zonaObj = a.zona && typeof a.zona === 'object' ? a.zona : {};
  const diaria = a.diaria && typeof a.diaria === 'object' ? a.diaria : {};
  const modalidade = texto(a.modalidade).toLowerCase();
  const titulo = texto(primeiro(a, ['titulo', 'cargo', 'nome']));
  if (!titulo) return null;
  return {
    codigo: codigoValido(primeiro(a, ['codigo', 'link', 'codigoLink'])),
    titulo,
    modalidade,
    modalidadeNome: MODALIDADES[modalidade] || (modalidade ? modalidade[0].toUpperCase() + modalidade.slice(1) : ''),
    empresaNome: nomeEmpresa,
    confidencial,
    verificada: emp.verificada != null ? !!emp.verificada : !!primeiro(a, ['empresaVerificada', 'verificada']),
    cidadeNome: texto(primeiro(a, ['cidadeNome', 'cidade_nome']) || cidadeObj.nome || (typeof a.cidade === 'string' ? a.cidade : '')),
    cidadeSlug: texto(primeiro(a, ['cidadeSlug', 'cidade_slug']) || cidadeObj.slug || ''),
    zonaNome: texto(primeiro(a, ['zonaNome', 'zona_nome']) || zonaObj.nome || (typeof a.zona === 'string' ? a.zona : '')),
    salarioMin: numero(primeiro(a, ['salarioMin', 'salario_min', 'salarioDe'])),
    salarioMax: numero(primeiro(a, ['salarioMax', 'salario_max', 'salarioAte'])),
    salarioTexto: texto(primeiro(a, ['salarioTexto', 'faixaSalarial'])),
    diariaValor: numero(primeiro(a, ['diariaValor', 'diaria_valor', 'valorDiaria']) ?? diaria.valor),
    diariaData: texto(primeiro(a, ['diariaData', 'diaria_data']) || diaria.data),
    diariaHorario: texto(primeiro(a, ['diariaHorario', 'diaria_horario']) || diaria.horario),
    descricao: texto(primeiro(a, ['descricao', 'resumo'])),
    requisitos: texto(primeiro(a, ['requisitos', 'exigencias'])),
    horario: texto(primeiro(a, ['horario', 'jornada'])),
    publicadoEm: texto(primeiro(a, ['publicadoEm', 'publicado_em'])),
    validoAte: texto(primeiro(a, ['validoAte', 'valido_ate', 'expiraEm', 'expira_em'])),
    status: texto(a.status).toLowerCase()
  };
}

export function textoEmpresa(a) {
  if (a.confidencial || !a.empresaNome) return a.verificada ? 'Empresa confidencial · verificada' : 'Empresa confidencial';
  return a.empresaNome + (a.verificada ? ' · verificada' : '');
}

export function textoLocal(a) {
  return [a.cidadeNome, a.zonaNome].filter(Boolean).join(' · ');
}

/** Uma linha para a prévia (og:description): empresa · cidade/zona · modalidade · valor. */
export function descricaoOg(a) {
  return [textoEmpresa(a), textoLocal(a), a.modalidadeNome, textoValor(a)].filter(Boolean).join(' · ');
}

export function resumoLinha(a) {
  return [a.modalidadeNome, textoLocal(a)].filter(Boolean).join(' · ');
}

function dataCurta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

const CSS = `
:root{--laranja:#f34405;--azul:#13283f;--tinta:#13283f;--suave:#6b7586;--fundo:#f2f2f2;--papel:#fff;--linha:#e2e6ec}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fundo);color:var(--tinta);font:16px/1.5 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
header{background:var(--azul);padding:14px 16px}header img{display:block;height:28px;width:auto}
main{max-width:640px;margin:0 auto;padding:16px}
.cartao{background:var(--papel);border:1px solid var(--linha);border-radius:16px;padding:20px 18px}
.rotulo{display:inline-block;font-size:.8rem;font-weight:700;color:var(--laranja);letter-spacing:.04em;text-transform:uppercase}
h1{font-size:1.5rem;line-height:1.2;margin:6px 0 4px;text-wrap:balance}
.empresa{margin:0 0 14px;color:var(--suave)}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 16px;font-size:.95rem}dt{color:var(--suave);font-weight:600}dd{margin:0}
.valor{font-size:1.15rem;font-weight:800;color:var(--azul)}
.texto{white-space:pre-line;margin:0 0 16px}
.botao{display:block;text-align:center;background:var(--laranja);color:#141414;font-weight:800;text-decoration:none;padding:14px 20px;border-radius:999px;font-size:1.05rem}
.botao:focus-visible{outline:3px solid var(--azul);outline-offset:3px}
.aviso{margin:16px 0 0;font-size:.85rem;color:var(--suave)}
footer{max-width:640px;margin:0 auto;padding:8px 16px 32px;font-size:.8rem;color:var(--suave)}footer a{color:inherit}
`;

function cabecalhoHtml(tituloJanela, descricao, urlPagina, origem, extraMeta) {
  return '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<meta name="color-scheme" content="light">\n<meta name="theme-color" content="#13283F">\n' +
    '<title>' + esc(tituloJanela) + '</title>\n' +
    '<meta name="description" content="' + esc(descricao) + '">\n' +
    (extraMeta || '') +
    '<meta property="og:site_name" content="' + esc(NOME_SITE) + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:locale" content="pt_BR">\n' +
    '<meta property="og:title" content="' + esc(tituloJanela) + '">\n' +
    '<meta property="og:description" content="' + esc(descricao) + '">\n' +
    (urlPagina ? '<meta property="og:url" content="' + esc(urlPagina) + '">\n' : '') +
    '<meta property="og:image" content="' + esc(origem + IMAGEM_OG) + '">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<link rel="icon" href="/comum/marca/gsc-favicon.svg" type="image/svg+xml">\n' +
    '<style>' + CSS + '</style>\n</head>\n<body>\n' +
    '<header><a href="/"><img src="/comum/marca/gsc-logo-negativo.svg" alt="Gestão sem Caos" width="199" height="28"></a></header>\n';
}

const RODAPE = '<footer>Vagas · Gestão sem Caos. Nunca pague para se candidatar: a plataforma não cobra da pessoa e nenhuma empresa pode pedir dinheiro, Pix ou documento pelo chat. <a href="/termos.html">Termos</a> · <a href="/privacidade.html">Privacidade</a></footer>\n</body>\n</html>\n';

/** Página da vaga (HTML completo, sem JavaScript). `origem` = https://vagas.gestaosemcaos.com.br (sem barra). */
export function montarPaginaVaga(anuncio, origem) {
  const a = normalizarAnuncio(anuncio);
  if (!a) throw new Error('anúncio sem título');
  const base = String(origem || '').replace(/\/$/, '');
  const urlPagina = a.codigo ? base + '/v/' + a.codigo : '';
  const tituloJanela = a.titulo + ' · ' + NOME_SITE;
  const descricao = descricaoOg(a);
  const valor = textoValor(a);
  const linhas = [];
  if (a.modalidadeNome) linhas.push(['Tipo', a.modalidadeNome]);
  if (textoLocal(a)) linhas.push(['Onde', textoLocal(a)]);
  if (a.modalidade === 'diaria' && (a.diariaData || a.diariaHorario)) linhas.push(['Quando', [dataCurta(a.diariaData) || a.diariaData, a.diariaHorario].filter(Boolean).join(', ')]);
  if (a.horario) linhas.push(['Horário', a.horario]);
  if (valor) linhas.push([a.modalidade === 'diaria' ? 'Diária' : 'Salário', '<span class="valor">' + esc(valor) + '</span>', true]);
  if (a.validoAte) linhas.push(['Vaga aberta até', dataCurta(a.validoAte) || a.validoAte]);
  const destino = a.cidadeSlug ? '/' + a.cidadeSlug + '/' : '/';
  const linkApp = destino + (a.codigo ? '?vaga=' + a.codigo : '');
  const expirada = a.status && !['publicado', 'ativo', 'ativa', 'aberta'].includes(a.status);
  const expiradaMeta = expirada ? '<meta name="robots" content="noindex">\n' : '';
  return cabecalhoHtml(tituloJanela, descricao, urlPagina, base, expiradaMeta) +
    '<main>\n<article class="cartao">\n' +
    '<span class="rotulo">' + esc(expirada ? 'Vaga encerrada' : 'Vaga') + (a.codigo ? ' · ' + esc(a.codigo) : '') + '</span>\n' +
    '<h1>' + esc(a.titulo) + '</h1>\n' +
    '<p class="empresa">' + esc(textoEmpresa(a)) + '</p>\n' +
    (linhas.length ? '<dl>\n' + linhas.map((l) => '<dt>' + esc(l[0]) + '</dt><dd>' + (l[2] ? l[1] : esc(l[1])) + '</dd>').join('\n') + '\n</dl>\n' : '') +
    (a.descricao ? '<p class="texto">' + esc(a.descricao) + '</p>\n' : '') +
    (a.requisitos ? '<h2 style="font-size:1rem;margin:0 0 6px">O que a empresa pede</h2>\n<p class="texto">' + esc(a.requisitos) + '</p>\n' : '') +
    (expirada
      ? '<a class="botao" href="' + esc(destino) + '">Ver outras vagas</a>\n'
      : '<a class="botao" href="' + esc(linkApp) + '">Quero essa vaga</a>\n<p class="aviso">Para se candidatar você cria uma conta grátis com e-mail e senha. A empresa só vê seu nome e contato depois que vocês dois combinarem.</p>\n') +
    '</article>\n</main>\n' + RODAPE;
}

/** Página simples de erro: 'nao_encontrada' (404) ou 'indisponivel' (503). */
export function montarPaginaErro(tipo, origem) {
  const base = String(origem || '').replace(/\/$/, '');
  const naoAchou = tipo !== 'indisponivel';
  const titulo = naoAchou ? 'Vaga não encontrada' : 'Não deu para carregar a vaga';
  const descricao = naoAchou
    ? 'Esse link não existe mais ou a vaga já foi encerrada. Veja as vagas abertas da sua cidade.'
    : 'Tente de novo em instantes.';
  return cabecalhoHtml(titulo + ' · ' + NOME_SITE, descricao, '', base, '<meta name="robots" content="noindex">\n') +
    '<main>\n<article class="cartao">\n<span class="rotulo">' + (naoAchou ? '404' : 'Instabilidade') + '</span>\n' +
    '<h1>' + esc(titulo) + '</h1>\n<p class="texto">' + esc(descricao) + '</p>\n' +
    '<a class="botao" href="/">Ver vagas abertas</a>\n</article>\n</main>\n' + RODAPE;
}

/** Cabeçalhos da resposta da Function (vagas/_headers não vale aqui, por isso repete a segurança). */
export function cabecalhosHtml(status, cacheSegundos) {
  const cache = status === 200 && cacheSegundos > 0
    ? 'public, max-age=' + cacheSegundos + ', s-maxage=' + (cacheSegundos * 5) + ', stale-while-revalidate=600'
    : 'no-store';
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cache,
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    Vary: 'Accept-Encoding'
  };
}

/** Acha a chave anon (pública) dentro do texto de um js/config.js. */
export function lerChaveDoConfig(textoJs) {
  const m = /SUPABASE_ANON_KEY\s*[:=]\s*['"]([^'"]+)['"]/.exec(String(textoJs || ''));
  return m ? m[1].trim() : '';
}

async function chaveAnon(context, origem) {
  const env = context.env || {};
  const daVariavel = String(env.SUPABASE_ANON_KEY || env.VAGAS_SUPABASE_ANON_KEY || '').trim();
  if (daVariavel) return daVariavel;
  try {
    const r = await env.ASSETS.fetch(new Request(origem + '/js/config.js'));
    if (r && r.ok) return lerChaveDoConfig(await r.text());
  } catch (err) { /* sem config.js: segue sem chave */ }
  return '';
}

async function buscarAnuncio(codigo, chave, fetchFn) {
  const r = await fetchFn(SUPABASE_URL + '/rest/v1/rpc/' + RPC_ANUNCIO, {
    method: 'POST',
    headers: { apikey: chave, Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_codigo: codigo }),
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(PRAZO_RPC_MS) : undefined
  });
  if (r.status === 404) return { ok: false, naoExiste: true };
  if (!r.ok) throw new Error('RPC ' + r.status);
  const json = await r.json();
  return json && typeof json === 'object' ? json : { ok: false };
}

/** Resposta pronta a partir do resultado da RPC (função pura usada pelo handler e pelos testes). */
export function responderComAnuncio(resultado, origem) {
  const ok = resultado && resultado.ok !== false && normalizarAnuncio(resultado);
  if (!ok) return { status: 404, html: montarPaginaErro('nao_encontrada', origem) };
  return { status: 200, html: montarPaginaVaga(resultado, origem) };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const origem = url.origin;
  const codigo = codigoValido(context.params && context.params.codigo);
  if (!codigo) return new Response(montarPaginaErro('nao_encontrada', origem), { status: 404, headers: cabecalhosHtml(404, 0) });

  const chaveCache = new Request(origem + '/v/' + codigo, { method: 'GET' });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    try { const pronta = await cache.match(chaveCache); if (pronta) return pronta; } catch (err) { /* sem cache */ }
  }

  let resposta;
  try {
    const chave = await chaveAnon(context, origem);
    if (!chave) throw new Error('sem chave anon');
    const r = responderComAnuncio(await buscarAnuncio(codigo, chave, fetch), origem);
    resposta = new Response(r.html, { status: r.status, headers: cabecalhosHtml(r.status, CACHE_SEGUNDOS) });
  } catch (err) {
    try { console.error('vaga ' + codigo + ': ' + (err && err.message)); } catch (e) { /* sem console */ }
    const h = cabecalhosHtml(503, 0); h['Retry-After'] = '30';
    return new Response(montarPaginaErro('indisponivel', origem), { status: 503, headers: h });
  }
  if (cache && resposta.status === 200) {
    try { context.waitUntil(cache.put(chaveCache, resposta.clone())); } catch (err) { /* sem cache */ }
  }
  return resposta;
}

export const onRequestHead = onRequestGet;
