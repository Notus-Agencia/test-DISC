/*
 * Vagas sem Caos v2 · LEITURA SIMPLES DO CURRÍCULO (lógica pura: navegador e Node).
 * Recebe o TEXTO do currículo (já tirado do PDF ou do Word no navegador, sem IA externa) e devolve só o que a empresa precisa:
 * nome, contato, cidade, bairro, função, experiências (cargo, lugar, mês de início e de saída), escolaridade, cursos e CNH.
 * DESCARTA nascimento, idade, estado civil, CPF, RG, nacionalidade, sexo, filhos: esses dados nunca entram no resumo
 * (a lista `sensiveis` só diz à pessoa QUE o arquivo tem isso, sem repetir o conteúdo).
 *
 *   VSC_CURRICULO_TEXTO.extrair(texto, { cidades: [{id, nome, bairros}], agora: Date })
 */
(function (root) {
  'use strict';

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function tituloCaso(s) {
    return String(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
  }
  // linhas que nunca viram dado do resumo (e, se aparecem, são só avisadas em `sensiveis`)
  const PROIBIDO = /\b(cpf|rg|identidade|nascimento|nascid[oa]|idade|anos de idade|estado civil|solteir[oa]|casad[oa]|divorciad[oa]|vi[uú]v[oa]|nacionalidade|brasileir[oa]|naturalidade|sexo|g[eê]nero|filhos?|pis|t[ií]tulo de eleitor)\b/i;
  const SECAO = /^(forma[cç][aã]o|escolaridade|educa[cç][aã]o|cursos?|qualifica[cç]|habilidades|compet[eê]ncias|idiomas|refer[eê]ncias|informa[cç][oõ]es|dados pessoais|objetivo|resumo|perfil|experi[eê]ncia)/i;
  const TITULO_RUIM = /curr[ií]culo|vitae|resumo|objetivo|dados pessoais|perfil|contato|endere[cç]o|telefone|e-?mail|whats|experi[eê]ncia|forma[cç][aã]o/i;
  const UF = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
  const FAIXA = /((?:0?[1-9]|1[0-2])[/.])?((?:19|20)\d{2})\s*(?:a|à|-|–|—|até|ate)\s*(?:((?:0?[1-9]|1[0-2])[/.])?((?:19|20)\d{2})|(atual|atualmente|hoje|o momento|presente))/i;

  function mes2(n) { return (n < 10 ? '0' : '') + n; }
  // início e saída no formato do banco (AAAA-MM), sem passar do mês de hoje
  function periodo(m, agora) {
    const anoHoje = agora.getFullYear(), mesHoje = agora.getMonth() + 1;
    const ini = { a: +m[2], m: m[1] ? parseInt(m[1], 10) : 1 };
    let fim = null;
    if (m[4]) fim = { a: +m[4], m: m[3] ? parseInt(m[3], 10) : 12 };
    if (ini.a > anoHoje || (ini.a === anoHoje && ini.m > mesHoje)) return null;
    if (fim && (fim.a > anoHoje || (fim.a === anoHoje && fim.m >= mesHoje))) fim = null;   // ainda trabalha lá
    if (fim && (fim.a < ini.a || (fim.a === ini.a && fim.m < ini.m))) fim = null;
    return { inicio: ini.a + '-' + mes2(ini.m), fim: fim ? fim.a + '-' + mes2(fim.m) : null, anos: Math.max(0, (fim ? fim.a + (fim.m - 1) / 12 : anoHoje + (mesHoje - 1) / 12) - (ini.a + (ini.m - 1) / 12)) };
  }
  function separaCargo(txt) {
    const t = txt.replace(/^[-•*·\s]+/, '').replace(/\s+/g, ' ').trim();
    const p = t.split(/\s+[–—-]\s+|\s*\|\s*|\s*,\s+(?=[A-ZÀ-Ú])/);
    return { cargo: (p[0] || '').replace(/[()]/g, '').trim().slice(0, 80), empresa: p.slice(1).join(' · ').replace(/[()]/g, '').trim().slice(0, 120) };
  }
  function escolaridadeDe(t) {
    const m = t.match(/ensino\s+(fundamental|m[eé]dio)\s+(completo|incompleto)|superior\s+(completo|incompleto|em andamento|cursando)|t[eé]cnico\s+(completo|em\s+[a-zà-ÿ]+)|cursando\s+(ensino\s+superior|faculdade|gradua[cç][aã]o)|gradua[cç][aã]o\s+(completa|em andamento)/i);
    if (!m) return '';
    const k = norm(m[0]);
    if (/fundamental/.test(k)) return /incompleto/.test(k) ? 'Ensino fundamental incompleto' : 'Ensino fundamental completo';
    if (/medio/.test(k)) return /incompleto/.test(k) ? 'Ensino médio incompleto' : 'Ensino médio completo';
    if (/tecnico/.test(k)) return 'Técnico completo';
    if (/incompleto|andamento|cursando/.test(k)) return 'Superior em andamento';
    return 'Superior completo';
  }

  function extrair(texto, opcoes) {
    const op = opcoes || {}, cidades = op.cidades || [], agora = op.agora || new Date();
    const t = String(texto || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    const linhas = t.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const r = { nome: '', email: '', whats: '', cidade: '', cidadeTexto: '', bairro: '', funcao: '', experiencias: [], outras: [], escolaridade: '', cnh: [], cursos: [], tempo: '', sensiveis: [], temContato: false };

    const em = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (em) r.email = em[0].toLowerCase();
    const fm = t.match(/(?:\+?55\s*)?\(?\b(\d{2})\)?\s*(9)\s?(\d{4})[\s.-]?(\d{4})\b/);
    if (fm) r.whats = '(' + fm[1] + ') ' + fm[2] + fm[3] + '-' + fm[4];
    r.temContato = !!(r.whats || r.email);

    for (let i = 0; i < Math.min(8, linhas.length); i++) {
      const L = linhas[i].replace(/^nome( completo)?\s*:?\s*/i, '');
      if (/\d|@/.test(L) || TITULO_RUIM.test(L) || PROIBIDO.test(L)) continue;
      const ws = L.split(' ');
      if (ws.length >= 2 && ws.length <= 6 && L.length <= 60 && /^[A-Za-zÀ-ÿ' .-]+$/.test(L)) { r.nome = tituloCaso(L); break; }
    }

    const nt = norm(t);
    cidades.forEach((c) => { if (!r.cidade && new RegExp('\\b' + norm(c.nome) + '\\b').test(nt)) r.cidade = c.id; });
    if (!r.cidade) {
      const cm = t.match(new RegExp('([A-ZÀ-Ú][A-Za-zÀ-ÿ]+(?: (?:de |do |da |dos |das )?[A-ZÀ-Ú][A-Za-zÀ-ÿ]+)*)\\s*[-–/,]\\s*(' + UF + ')\\b'));
      if (cm) r.cidadeTexto = cm[1] + ' - ' + cm[2];
    }
    if (r.cidade) {
      const c = cidades.filter((x) => x.id === r.cidade)[0], bs = (c && c.bairros) || [], bm = t.match(/(?:bairro|setor)\s*:?\s*([^\n,|·]+)/i);
      bs.forEach((b) => { if (!r.bairro && bm && norm(bm[0]).indexOf(norm(b)) >= 0) r.bairro = b; });
      bs.forEach((b) => { if (!r.bairro && b !== 'Centro' && b !== 'Zona rural' && nt.indexOf(norm(b)) >= 0) r.bairro = b; });
    }

    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(/^(objetivo|cargo pretendido|cargo desejado|vaga desejada|vaga de interesse|[aá]rea de interesse|fun[cç][aã]o desejada)\s*:?\s*(.*)$/i);
      if (m) { const f = m[2] || linhas[i + 1] || ''; if (!SECAO.test(f) && !PROIBIDO.test(f)) r.funcao = f.replace(/[.;]+$/, '').slice(0, 80); break; }
    }

    // experiências: depois do título "Experiência profissional" até a próxima seção
    let ini = -1;
    for (let i = 0; i < linhas.length; i++) if (/^(experi[eê]ncias?( profissional| profissionais)?|hist[oó]rico profissional)\s*:?$/i.test(linhas[i])) { ini = i; break; }
    let anos = 0;
    if (ini >= 0) {
      let atual = null;
      for (let i = ini + 1; i < linhas.length; i++) {
        const L = linhas[i];
        if (SECAO.test(L)) break;
        if (PROIBIDO.test(L) || L.length < 3) continue;
        const fx = L.match(FAIXA);
        const per = fx ? periodo(fx, agora) : null;
        if (per) anos += per.anos;
        if (/^[-•*·]/.test(L)) continue;
        const resto = fx ? L.replace(fx[0], '').replace(/[()[\],.;-]/g, ' ').replace(/\s+/g, ' ').trim() : L;
        if (fx && resto.length < 3) { if (atual && !atual.inicio && per) { atual.inicio = per.inicio; atual.fim = per.fim; } continue; }
        if (r.experiencias.length + r.outras.length >= 6) continue;
        const { cargo, empresa } = separaCargo(fx ? L.replace(fx[0], ' ') : L);
        if (!cargo) continue;
        atual = { cargo, empresa, inicio: per ? per.inicio : '', fim: per ? per.fim : null };
        r.experiencias.push(atual);
      }
      const comData = r.experiencias.filter((x) => x.inicio);
      r.experiencias.filter((x) => !x.inicio).forEach((x) => r.outras.push([x.cargo, x.empresa].filter(Boolean).join(' · ')));
      r.experiencias = comData.slice(0, 5);
    }
    if (anos) r.tempo = anos > 3 ? 'Mais de 3 anos' : anos >= 1 ? '1 a 3 anos' : 'Menos de 1 ano';
    if (!r.funcao && r.experiencias[0]) r.funcao = r.experiencias[0].cargo;

    r.escolaridade = escolaridadeDe(t);
    const cn = t.match(/\b(?:CNH|habilita[cç][aã]o)\b([^\n]{0,30})/i);
    if (cn) { const cat = cn[1].match(/\b([ABCDE]{1,2})\b/); if (cat) r.cnh = cat[1].split(''); }

    let ci = -1;
    for (let i = 0; i < linhas.length; i++) if (/^cursos?( livres| complementares)?\s*:?$/i.test(linhas[i])) { ci = i; break; }
    if (ci >= 0) {
      for (let i = ci + 1; i < linhas.length && r.cursos.length < 3; i++) {
        if (SECAO.test(linhas[i]) && !/^cursos?/i.test(linhas[i])) break;
        if (!PROIBIDO.test(linhas[i])) r.cursos.push(linhas[i].replace(/^[-•*·]\s*/, '').slice(0, 80));
      }
    }

    // o que o arquivo mostra e a empresa não precisa ver (o resumo nunca guarda isso)
    if (/\bcpf\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i.test(t)) r.sensiveis.push('CPF');
    if (/nascimento|nascid[oa] em|\b\d{2} anos de idade\b|\bidade\s*:/i.test(t)) r.sensiveis.push('data de nascimento');
    if (/estado civil|\bsolteir[oa]\b|\bcasad[oa]\b|\bdivorciad[oa]\b|\bvi[uú]v[oa]\b/i.test(t)) r.sensiveis.push('estado civil');
    if (/\b(rg|identidade)\b/i.test(t)) r.sensiveis.push('RG');
    return r;
  }

  const API = { extrair, PROIBIDO };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VSC_CURRICULO_TEXTO = API;
})(typeof self !== 'undefined' ? self : this);
