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
//   reenviar {email, captcha?}  -> link novo de confirmação (só conta do Vagas não confirmada). Resposta neutra.
//   esqueci {email, captcha?}   -> link "Crie uma nova senha" (só conta do Vagas). Resposta neutra.
//   assistido (JWT de operador(a) da cidade ou da equipe) {email, tipo, cidade, empresaId?, nome?, codigoEvento?}
//       Cadastro assistido: a conta nasce PENDENTE e só vale quando a pessoa confirma pelo link (é o consentimento dela).
//       O link vai só para o e-mail da pessoa (nunca para quem fez o cadastro).
//   operador (JWT da equipe) {email, cidade, papel:'operador'|'moderador'} -> convite de operação para a cidade.
//   excluir (JWT) {confirmar:'EXCLUIR'} -> apaga a conta e tudo dela (LGPD), inclusive a foto do Storage. Conta que também
//       acessa o painel DISC: recusa.
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
// Link do e-mail: <VAGAS_SITE_URL>/entrar.html?token_hash=<hash>&type=invite|recovery (gerado com auth.admin.generateLink,
// no domínio do site; o antivírus que "abre" o link antes da pessoa não o gasta, porque a tela só confere no clique). No convite
// de equipe o link leva também &convite=<token> (ou só ?convite=<token> para quem já tem conta de empresa).
// Limites (banco, public.vagas_conta_limite): por origem (cf-connecting-ip e x-forwarded-for), por e-mail, por quem age e total.
// Segredos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (do Supabase), RESEND_API_KEY, VAGAS_SITE_URL, VAGAS_EMAIL_REMETENTE?
// (senão EMAIL_REMETENTE), TURNSTILE_SECRET? (liga o "não sou robô" no cadastrar/reenviar/esqueci).
// Textos finais dos e-mails: conteudo/vagas-textos/ (aqui, versões curtas com a marca Vagas sem Caos · Gestão sem Caos).
import { erro, MSG_ERRO_INTERNO } from './regras.js';
import { criarResend } from './asaas.js';
import { htmlMarca } from './email.js';

export const NOMES_ENV_VAGAS_CONTA = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'VAGAS_SITE_URL', 'VAGAS_EMAIL_REMETENTE',
  'EMAIL_REMETENTE', 'TURNSTILE_SECRET'];
export const VAGAS_SITE_PADRAO = 'https://vagas.gestaosemcaos.com.br';
export const VAGAS_MSG_ENVIADO = 'Se este e-mail puder ser usado, você vai receber um link em instantes. Confira também a caixa de spam.';
export const VAGAS_MSG_EMAIL_NAO_CONFIGURADO = 'O envio de e-mail ainda não está configurado. Fale com a Gestão sem Caos.';
export const VAGAS_MSG_CAPTCHA = 'Confirme que você não é um robô e tente de novo.';
export const VAGAS_MSG_EMAIL_INVALIDO = 'E-mail inválido.';
export const VAGAS_MSG_TERMOS = 'Para criar a conta, aceite os termos de uso e o aviso de privacidade.';
export const VAGAS_MSG_TIPO = 'Escolha se a conta é para procurar emprego ou para uma empresa.';
export const VAGAS_MSG_JA_EXISTE = 'Este e-mail já tem conta. A pessoa pode entrar ou usar "Esqueci minha senha".';
export const VAGAS_MSG_CONVITE_EQUIPE = 'Pronto. Se este e-mail puder entrar na equipe, a pessoa recebe o convite em instantes. O convite vale por 3 dias.';
export const VAGAS_BUCKET_FOTOS = 'vagas-fotos';
export const VAGAS_FOTO_SEGUNDOS = 300;
const VAGAS_LIMITE_CORPO = 4000;
const VAGAS_RODAPE = 'Vagas sem Caos · uma ferramenta da Gestão sem Caos. Nunca pague para se candidatar: se alguém pedir em nosso nome, é golpe.';

export function lerEnvVagasConta(get) {
  const env = {};
  NOMES_ENV_VAGAS_CONTA.forEach((n) => { let v = ''; try { v = get(n) || ''; } catch (err) { v = ''; } env[n] = String(v).trim(); });
  return env;
}

export function siteVagas(env) {
  try { return new URL(String((env && env.VAGAS_SITE_URL) || VAGAS_SITE_PADRAO).trim()).origin; } catch (err) { return VAGAS_SITE_PADRAO; }
}

export function emailVagas(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

/** "ana.souza@empresa.com.br" -> "a***@e***.com.br" */
export function mascararEmailVagas(e) {
  const m = /^([^@]+)@([^.]+)(\..+)?$/.exec(String(e || ''));
  if (!m) return '';
  return m[1].charAt(0) + '***@' + m[2].charAt(0) + '***' + (m[3] || '');
}

/** Link do e-mail no domínio do site: a tela entrar.html confere o código no clique (verifyOtp). */
export function linkVagas(env, tokenHash, tipo) {
  return siteVagas(env) + '/entrar.html?token_hash=' + encodeURIComponent(tokenHash) + '&type=' + encodeURIComponent(tipo);
}

/** E-mails com a marca Vagas sem Caos (moldura da Gestão sem Caos).
 *  tipo: confirmar | jaTemConta | senha | assistido | operador | conviteEquipe | conviteEquipeOutraConta
 *  (textos completos para revisão: conteudo/vagas-textos/emails/convite-equipe*.html). */
export function montarEmailVagas(tipo, d) {
  d = d || {};
  const primeiro = String(d.nome || '').trim().split(/\s+/)[0] || '';
  const ola = primeiro ? 'Olá, ' + primeiro + '!' : 'Olá!';
  const empresa = String(d.empresa || '').trim() || 'uma empresa';
  const quem = String(d.quem || '').trim();
  const convidou = (quem ? quem + ', da empresa ' + empresa + ', convidou' : 'A empresa ' + empresa + ' convidou') +
    ' você para a equipe dela no Vagas sem Caos' + (d.cidade ? ', em ' + d.cidade : '') + '.';
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
      botao: 'Abrir o Vagas sem Caos', nota: 'Se você não conhece esta empresa, ignore este e-mail: nada muda na sua conta.' }
  };
  const m = modelos[tipo] || modelos.confirmar;
  const html = htmlMarca({ titulo: m.titulo, previa: m.paragrafos[1], paragrafos: m.paragrafos, botao: { texto: m.botao, url: d.url }, nota: m.nota,
    rodape: VAGAS_RODAPE });
  const texto = m.paragrafos.concat(['', m.botao + ': ' + d.url, '', m.nota, '', VAGAS_RODAPE]).join('\n');
  return { assunto: m.assunto, html, texto };
}

/** Origem do pedido original (o banco transforma em chaves por IP; nunca guarda o IP inteiro de IPv6). */
export function origemVagas(req) {
  return { cf: req.headers.get('cf-connecting-ip') || '', xff: req.headers.get('x-forwarded-for') || '' };
}

/** Cloudflare Turnstile (só se TURNSTILE_SECRET existir). */
export async function conferirCaptchaVagas(base, token, ip) {
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

export async function acaoVagasCadastrar(base, corpo, origem) {
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

export async function acaoVagasReenviar(base, corpo, origem) {
  const email = emailVagas(corpo.email);
  if (!email) return erro(VAGAS_MSG_EMAIL_INVALIDO);
  if (!vagasEmailConfigurado(base)) return erro(VAGAS_MSG_EMAIL_NAO_CONFIGURADO, { naoConfigurado: true });
  if (!(await conferirCaptchaVagas(base, corpo.captcha, origem.cf))) return erro(VAGAS_MSG_CAPTCHA, { captcha: true });
  const lim = await base.db.limite('reenviar', origem.cf, origem.xff, email, null);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  const c = await base.db.consultar(email);
  if (c.existe && (c.produto === 'vagas' || c.conta) && !c.confirmada) {
    const l = await linkConfirmacaoVagas(base, email);
    await enviarEmailVagas(base, email, c.conta && c.conta.tipo === 'operador' ? 'operador' : 'confirmar', { url: linkVagas(base.env, l.hash, l.tipo) });
  }
  return vagasNeutro(email);
}

export async function acaoVagasEsqueci(base, corpo, origem) {
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

export async function acaoVagasAssistido(base, corpo, origem, quem) {
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

export async function acaoVagasOperador(base, corpo, origem, quem) {
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

export async function acaoVagasExcluir(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  if (quem.admin) return erro('Esta conta também acessa o painel DISC. Fale com a Gestão sem Caos para excluir.');
  if (!quem.conta) return erro('Conta não encontrada.');
  if (corpo.confirmar !== 'EXCLUIR') return erro('Para excluir, digite EXCLUIR.');
  const lim = await base.db.limite('excluir', origem.cf, origem.xff, '', quem.id);
  if (!lim || lim.ok !== true) return lim || erro(MSG_ERRO_INTERNO);
  // A foto do Storage sai antes (o Auth não apaga usuário dono de arquivo; e a foto é dado pessoal).
  if (base.storage) await base.storage.remover(VAGAS_BUCKET_FOTOS, [quem.id + '/foto.jpg']);
  await base.auth.excluirUsuario(quem.id);
  return { ok: true, excluida: true };
}

const UUID_VAGAS = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link do convite de equipe: conta nova ou pendente recebe também o link de confirmação (cria a senha). */
export function linkConviteEquipe(env, token, confirmacao) {
  const t = encodeURIComponent(String(token || ''));
  return confirmacao ? linkVagas(env, confirmacao.hash, confirmacao.tipo) + '&convite=' + t : siteVagas(env) + '/entrar.html?convite=' + t;
}

/** Convite para a equipe da empresa: o banco decide (dono(a), limites, token) e diz para onde vai o e-mail; a tela recebe
 *  sempre a mesma resposta (nada revela se o e-mail tem conta, nem de que tipo). */
export async function acaoVagasConviteEquipe(base, corpo, origem, quem) {
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

/** URL assinada curta da foto: o banco decide se pode (vagas_conta_foto); aqui só se assina o caminho que ele devolver. */
export async function acaoVagasFoto(base, corpo, origem, quem) {
  if (!quem) return erro('Sessão expirada. Entre de novo.', { sessaoExpirada: true });
  const cand = String(corpo.candidatura || '').trim();
  if (cand && !UUID_VAGAS.test(cand)) return erro('Candidatura não encontrada.');
  const r = await base.db.foto(quem.id, cand || null);
  if (!r || r.ok !== true) return r || erro(MSG_ERRO_INTERNO);
  const url = await base.storage.assinar(VAGAS_BUCKET_FOTOS, r.caminho, VAGAS_FOTO_SEGUNDOS);
  return { ok: true, url, expiraEm: new Date(Date.now() + VAGAS_FOTO_SEGUNDOS * 1000).toISOString() };
}

/** Banco (service role) e Auth (admin) reais, a partir do supabase-js. */
export function criarBaseVagasConta(createClient, getEnv, extras) {
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
        p_email: email, p_cf: cf || '', p_xff: xff || '' })
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

/** CORS: só a origem de VAGAS_SITE_URL (e localhost/127.0.0.1 para testes). */
export function vagasCors(req, env) {
  const origem = req.headers.get('origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  const site = siteVagas(env);
  if (origem && (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origem) || origem === site)) h['Access-Control-Allow-Origin'] = origem;
  return h;
}

function vagasResponder(obj, status, extras) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extras || {})
  });
}

export async function atenderVagasConta(req, base) {
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
    else if (corpo.acao === 'reenviar') r = await acaoVagasReenviar(base, corpo, origem);
    else if (corpo.acao === 'esqueci') r = await acaoVagasEsqueci(base, corpo, origem);
    else if (corpo.acao === 'assistido') r = await acaoVagasAssistido(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'operador') r = await acaoVagasOperador(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'excluir') r = await acaoVagasExcluir(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'foto') r = await acaoVagasFoto(base, corpo, origem, await quemChamaVagas(base, req));
    else if (corpo.acao === 'convite_equipe') r = await acaoVagasConviteEquipe(base, corpo, origem, await quemChamaVagas(base, req));
    else r = erro('Ação desconhecida.');
    return vagasResponder(r, 200, cors);
  } catch (err) {
    try { console.error(err && err.message ? err.message : err); } catch (e) { /* sem console */ }
    return vagasResponder(erro(MSG_ERRO_INTERNO), 200, cors);
  }
}
