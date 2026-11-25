/*
 * Vagas sem Caos — configuração do site (vagas.gestaosemcaos.com.br). Edite aqui antes de publicar.
 *
 *   MODO                'previa'   — dados fictícios de Uruaçu (GO) guardados só neste navegador (vagas/js/api-previa.js);
 *                       'supabase' — banco real. Só troque depois de aplicar a migração 20261022120000_vagas.sql e publicar a
 *                                    Edge Function vagas-conta (docs/SUPABASE.md, seção "Vagas sem Caos").
 *                       Fora do domínio oficial (localhost, *.pages.dev, artefato): ?previa=1 liga a prévia para a aba toda;
 *                       ?previa=0 desliga. No domínio oficial (*.gestaosemcaos.com.br) o endereço NUNCA liga a prévia: só o MODO.
 *   SUPABASE_URL        "Project URL" do Supabase (o MESMO projeto do DISC).
 *   SUPABASE_ANON_KEY   Chave PÚBLICA do Supabase (a mesma do DISC: o banco é protegido pela RLS). NUNCA a service_role/secret.
 *   SITE_URL            Endereço do site (links de e-mail e de compartilhar).
 *   TURNSTILE_SITE_KEY  Chave pública do "não sou robô" (Cloudflare Turnstile). Vazio = desligado.
 *   VERSAO_TERMOS       Versão dos termos de uso e do aviso de privacidade aceita no cadastro (texto final em conteudo/vagas-textos/).
 *   v2: WHATSAPP_AJUDA, EMAIL_AJUDA, CANAL_WHATSAPP, PREVIA_LATENCIA, PREVIA_VALIDAR e ajuda(): docs/projeto/status/vagas-v2-servidor.md.
 */
(function (root) {
  var CONFIG = {
    MODO: 'supabase',
    SUPABASE_URL: 'https://tevpqngqzxcswmticjnr.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_8B735nOKFWn-CC8dYpr1sg_RQs5y_W-',
    SITE_URL: 'https://vagas.gestaosemcaos.com.br',
    TURNSTILE_SITE_KEY: '',
    VERSAO_TERMOS: '2026-11-24',
    WHATSAPP_AJUDA: '',
    EMAIL_AJUDA: '',
    CANAL_WHATSAPP: false,
    PREVIA_LATENCIA: 120,
    PREVIA_VALIDAR: false
  };
  function ajuda(texto) {
    var t = texto ? encodeURIComponent(texto) : '', d = String(CONFIG.WHATSAPP_AJUDA).replace(/\D/g, ''), e = String(CONFIG.EMAIL_AJUDA);
    if (d.length < 12) d = '55' + d;
    if (/^55[1-9][1-9][0-9]{8,9}$/.test(d)) return { tipo: 'whatsapp', href: 'https://wa.me/' + d + (t ? '?text=' + t : '') };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { tipo: 'contingencia', texto: 'Fale com a gente pelo e-mail ' + e + '.', href: 'mailto:' + e + (t ? '?subject=' + t : '') };
    return { tipo: 'contingencia', texto: 'O atendimento por WhatsApp ainda não está disponível. Volte em breve.', href: '' };
  }
  CONFIG.ajuda = CONFIG.ajudaLink = ajuda;
  try {
    var loc = root.location;
    var ss = root.sessionStorage;
    var oficial = !!loc && /(^|\.)gestaosemcaos\.com\.br$/i.test(loc.hostname || '');
    if (loc && ss) {
      if (oficial || /[?&]previa=0\b/.test(loc.search || '')) ss.removeItem('vagas_previa');
      else if (/[?&]previa=(1|sim)\b/.test(loc.search || '')) ss.setItem('vagas_previa', '1');
      if (!oficial && ss.getItem('vagas_previa') === '1') CONFIG.MODO = 'previa';
    }
  } catch (e) { /* sem location/sessionStorage: segue a configuração */ }
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.VAGAS_CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
