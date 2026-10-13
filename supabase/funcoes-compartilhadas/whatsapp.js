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

export const NOMES_ENV_WHATSAPP = ['WHATSAPP_PROVEDOR'];

/** Fábricas dos provedores (vazio: nenhum contratado). Os testes registram um falso aqui. */
export const PROVEDORES_WHATSAPP = {};

/** {configurado, provedor, enviarCodigo(m)} — enviarCodigo lança erro se não houver provedor configurado. */
export function criarWhatsApp(op) {
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
