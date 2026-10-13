/*
 * Vagas sem Caos — configuração do site (vagas.gestaosemcaos.com.br). Edite aqui antes de publicar.
 *
 *   MODO                'previa'   — dados fictícios de Boa Vista guardados só neste navegador (vagas/js/api-previa.js);
 *                       'supabase' — banco real. Só troque depois de aplicar a migração 20261022120000_vagas.sql e publicar a
 *                                    Edge Function vagas-conta (docs/SUPABASE.md, seção "Vagas sem Caos").
 *                       Na página: ?previa=1 liga a prévia para a aba toda; ?previa=0 desliga.
 *   SUPABASE_URL        "Project URL" do Supabase (o MESMO projeto do DISC).
 *   SUPABASE_ANON_KEY   Chave PÚBLICA do Supabase (a mesma do DISC: o banco é protegido pela RLS). NUNCA a service_role/secret.
 *   SITE_URL            Endereço do site (links de e-mail e de compartilhar).
 *   TURNSTILE_SITE_KEY  Chave pública do "não sou robô" (Cloudflare Turnstile). Vazio = desligado.
 *   VERSAO_TERMOS       Versão dos termos de uso e do aviso de privacidade aceita no cadastro (texto final em conteudo/vagas-textos/).
 */
(function (root) {
  var CONFIG = {
    MODO: 'previa',
    SUPABASE_URL: 'https://tevpqngqzxcswmticjnr.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_8B735nOKFWn-CC8dYpr1sg_RQs5y_W-',
    SITE_URL: 'https://vagas.gestaosemcaos.com.br',
    TURNSTILE_SITE_KEY: '',
    VERSAO_TERMOS: '2026-10'
  };
  try {
    var loc = root.location;
    var ss = root.sessionStorage;
    if (loc && ss) {
      if (/[?&]previa=0\b/.test(loc.search || '')) ss.removeItem('vagas_previa');
      else if (/[?&]previa=(1|sim)\b/.test(loc.search || '')) ss.setItem('vagas_previa', '1');
      if (ss.getItem('vagas_previa') === '1') CONFIG.MODO = 'previa';
    }
  } catch (e) { /* sem location/sessionStorage: segue a configuração */ }
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.VAGAS_CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
