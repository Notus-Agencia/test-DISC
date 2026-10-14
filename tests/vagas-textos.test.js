'use strict';
// Textos do Vagas sem Caos (conteudo/vagas-textos/): JSON válidos com as chaves que as telas e as RPCs usam, nada de
// palavra proibida (agência, app de namoro, promessa, "aprovado" em selo, "DiSC", "candidato" onde deve ser neutro),
// aviso anti-golpe nos e-mails de quem se candidata, nota de minuta em todo texto jurídico e variáveis dos e-mails
// documentadas em emails/indice.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PASTA = path.join(__dirname, '..', 'conteudo', 'vagas-textos');
const ler = (a) => fs.readFileSync(path.join(PASTA, a), 'utf8');
const json = (a) => JSON.parse(ler(a));

const MD = ['termos-de-uso.md', 'aviso-de-privacidade.md'];
const JSONS = ['consentimentos.json', 'avisos.json', 'whatsapp.json', 'moderacao.json', 'emails/indice.json'];
const EMAILS = fs.readdirSync(path.join(PASTA, 'emails')).filter((a) => a.endsWith('.html')).sort();
const TODOS = [...MD, ...JSONS, ...EMAILS.map((a) => 'emails/' + a)];
const NOTA_MINUTA = 'MINUTA · para revisão do(a) advogado(a) antes de publicar';
const NUNCA_PAGUE = 'Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.';

// Texto sem as listas de filtro: `padrao`, `padroes` e `termos` são regex/termos de busca, não texto que alguém lê.
const semRegex = (v) => {
  if (Array.isArray(v)) return v.map(semRegex);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !['padrao', 'padroes', 'termos'].includes(k)).map(([k, x]) => [k, semRegex(x)]));
  return v;
};
const textoLido = (a) => (a.endsWith('.json') ? JSON.stringify(semRegex(json(a))) : ler(a));
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MARCADOR_SEDE = '[REVISÃO JURÍDICA: cidade da sede da Gestão sem Caos]';

test('todos os arquivos existem e os JSON são válidos', () => {
  for (const a of TODOS) assert.ok(fs.existsSync(path.join(PASTA, a)), a);
  for (const a of JSONS) assert.doesNotThrow(() => json(a), a);
  assert.ok(EMAILS.length >= 8, 'pelo menos 8 e-mails');
});

test('nenhum texto cita a agência, app de namoro, "swipe", promessa ("garant"), "DiSC" ou "perfil ideal"', () => {
  const proibidas = [/notus/i, /tinder/i, /swipe/i, /garant/i, /DiSC/, /perfil ideal/i, /compatibilidade/i, /prev[eê] (o )?desempenho/i];
  for (const a of TODOS) {
    const t = ler(a);
    for (const re of proibidas) assert.ok(!re.test(t), a + ' contém ' + re);
  }
});

// A plataforma é por cidade e a cidade do piloto pode mudar: nenhum texto traz cidade, UF, DDD ou gentílico regional fixo.
// A cidade entra pela variável {{cidade}}; a sede da Gestão sem Caos fica com o marcador até o dono informar.
test('nenhum nome de cidade fixo: só {{cidade}} ou texto genérico; sede com o marcador', () => {
  const nomes = ['boa vista', 'roraima', 'pacaraima', 'mucajai', 'rorainopolis', 'caracarai', 'uruacu', 'goias', 'goiania',
    'brasilia', 'sao paulo', 'manaus', 'venezuel', 'espanhol'];
  const UF = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
  const cidadeUf = new RegExp('\\b\\p{Lu}\\p{Ll}+(?:\\s(?:d[aeo]s?\\s)?\\p{Lu}\\p{Ll}+)*\\s?(?:/|,|\\s[-–]|\\()\\s?(?:' + UF + ')\\b', 'u');
  const slug = new RegExp('[a-z]+-(?:' + UF.toLowerCase() + ')/'); // caminho de cidade, ex.: /nome-da-cidade-uf/
  const ddd = /\(\d{2}\)\s?9?\d{4}/;
  for (const a of [...TODOS, '../../docs/VAGAS-TEXTOS.md']) {
    const t = a.startsWith('../') ? fs.readFileSync(path.join(PASTA, a), 'utf8') : textoLido(a);
    const n = semAcento(t);
    for (const nome of nomes) assert.ok(!n.includes(nome), a + ' cita "' + nome + '"');
    if (a.startsWith('../')) continue; // o docs cita leis e links; as regras de UF/DDD valem para o texto que alguém lê
    for (const re of [cidadeUf, slug, ddd]) {
      const m = t.match(re);
      assert.ok(!m, a + ' tem cidade/UF/DDD fixo: "' + (m && m[0]) + '"');
    }
  }
  // Foro e sede: marcador de revisão jurídica, com a ressalva do foro do consumidor.
  const termos = ler('termos-de-uso.md');
  const foro = termos.split('16.2.')[1].split('\n')[0];
  assert.ok(foro.includes(MARCADOR_SEDE), 'foro com o marcador');
  assert.match(foro, /salvo o direito da pessoa consumidora de usar o foro do seu domicílio/);
  assert.ok(ler('aviso-de-privacidade.md').includes(MARCADOR_SEDE), 'controladora com o marcador');
  // Textos que precisam da cidade usam a variável.
  const av = json('avisos.json').avisos;
  for (const k of ['cidade_lista_espera', 'cidade_pausada', 'cidade_entorno', 'mural_vazio']) assert.match(av[k], /{{cidade}}/, k);
  assert.match(json('whatsapp.json').mensagens.find((x) => x.chave === 'boletim_do_dia').texto, /{{cidade}}/);
});

// Lista da psicologia (mesa): nem em negação. As regex de filtro (padrao/padroes/termos) não são texto de tela.
test('frases proibidas pela psicologia não aparecem em texto de tela, e-mail ou documento', () => {
  const proibidas = [/\bmatch\b/i, /currículo verificado/i, /\bvalidad[oa]s?\b/i, /científic/i, /certificad/i, /ranking/i, /os melhores/i, /teste psicológico/i, /avaliação/i, /\baprovad[oa]s?\b/i];
  for (const a of TODOS) {
    const t = textoLido(a);
    for (const re of proibidas) {
      const m = t.match(re);
      // "vaga aprovada" (moderação de anúncio) é a única exceção: não é sobre pessoa.
      if (m && re.source.includes('aprovad') && /vaga (foi )?aprovada|vaga-aprovada/i.test(t) && !/pessoa aprovada|selo aprovado|aprovado no teste/i.test(t)) continue;
      assert.ok(!m, a + ' contém ' + re + (m ? ' ("' + m[0] + '")' : ''));
    }
  }
});

test('linguagem neutra: "candidato(a)" não aparece (usar "pessoa" / "quem se candidata")', () => {
  const re = /\b(?<!se )candidat[oa]s?\b/i; // "quem se candidata" é verbo e pode
  for (const a of TODOS) {
    const m = ler(a).match(re);
    assert.ok(!m, a + ': "' + (m && m[0]) + '"');
  }
});

test('selo: nunca "aprovado/reprovado", sempre "online, sem supervisão" e "conhecimento prático"', () => {
  const av = json('avisos.json');
  const chavesSelo = Object.keys(av.avisos).filter((k) => k.startsWith('selo_'));
  assert.ok(chavesSelo.length >= 8, 'chaves selo_*');
  const textoSelo = chavesSelo.map((k) => av.avisos[k]).join('\n') + '\n' + ler('emails/seu-selo.html');
  assert.ok(!/aprovad|reprovad/i.test(textoSelo), 'selo não diz aprovado/reprovado');
  assert.equal(av.avisos.selo_supervisao, 'online, sem supervisão');
  assert.match(av.avisos.selo_descricao, /online, sem supervisão/);
  assert.match(av.avisos.selo_descricao, /conhecimento prático/);
  assert.match(ler('emails/seu-selo.html'), /online, sem supervisão/);
  assert.match(ler('emails/seu-selo.html'), /conhecimento prático/);
  // Nada de medida de capacidade, potencial ou perfil (padrão do agente psicologia).
  assert.ok(!/mede (a )?(sua |a )?(capacidade|potencial|perfil)|avalia (o|a) (seu|sua)/i.test(textoSelo));
  // O que descreve os testes está marcado para o parecer.
  assert.ok(Array.isArray(av._revisao_psicologia.avisos) && av._revisao_psicologia.avisos.includes('selo_descricao'));
  assert.match(ler('emails/seu-selo.html'), /REVISÃO PSICOLOGIA/);
  assert.match(ler('termos-de-uso.md'), /\[REVISÃO PSICOLOGIA\]/);
});

test('texto jurídico começa com a nota de minuta', () => {
  for (const a of MD) assert.ok(ler(a).trimStart().startsWith('> **' + NOTA_MINUTA + '**'), a);
  for (const a of ['consentimentos.json', 'moderacao.json', 'whatsapp.json', 'emails/indice.json']) assert.match(json(a)._sobre, /MINUTA/, a);
});

test('avisos.json: chaves obrigatórias e o aviso anti-golpe exato', () => {
  const av = json('avisos.json');
  assert.equal(av.avisos.nunca_pague, NUNCA_PAGUE);
  const chaves = ['nunca_pague', 'cartao_cego', 'empresa_confidencial', 'combinou_pessoa', 'combinou_empresa', 'combinou_convite',
    'combinou_convite_confidencial', 'selo_descricao', 'selo_emitido', 'selo_sem_selo', 'selo_supervisao', 'bico_mural', 'bico_diarista',
    'bico_valor_obrigatorio', 'cidade_lista_espera', 'cidade_pausada', 'sem_internet', 'erro_generico', 'sessao_expirada', 'excluir_conta', 'denuncia_ok'];
  for (const k of chaves) assert.equal(typeof av.avisos[k], 'string', 'avisos.' + k);
  assert.deepEqual([av.botoes.quero, av.botoes.pular, av.botoes.quero_conversar, av.botoes.agora_nao], ['Quero', 'Pular', 'Quero conversar', 'Agora não']);
  assert.match(av.avisos.bico_diarista, /LC 150\/2015/);
  assert.match(av.avisos.combinou_pessoa, /{{empresa_nome}}/);
  assert.deepEqual(av.avisos.denuncia_motivos.map((m) => m.chave), ['golpe', 'documento', 'discriminacao', 'falsa', 'ofensa', 'contato', 'outro']);
  assert.ok(av.avisos.denuncia_motivos.every((m) => typeof m.texto === 'string' && m.texto.length > 2));
  assert.equal(av.validacao.login_invalido, 'E-mail ou senha não conferem.');
  // Mensagens fixas do banco (fundacao) e da prova (testes): texto idêntico ao registrado na mesa.
  assert.equal(av.avisos.contato_cortado_empresa, 'A pessoa deixou de compartilhar o contato com a sua empresa.');
  assert.equal(av.avisos.empresa_ja_tem_acesso, 'Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
  assert.equal(av.avisos.empresa_saiu_conversa, 'A empresa saiu da plataforma. Esta conversa foi encerrada.');
  assert.deepEqual(av.referencia.texto_status, { pendente: 'Texto em revisão', publicado: 'Texto publicado', nao_publicado: 'Texto não publicado' });
  assert.match(av.avisos.cidade_lista_espera_vazia, /{{cidade}}/);
  assert.ok(!/{{total}}/.test(av.avisos.cidade_lista_espera_vazia), 'lista vazia não mostra número');
  assert.equal(av.avisos.referencia_ja_dada, 'Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.');
  assert.equal(av.foto.formato, 'A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.');
  assert.equal(av.anuncio.campos.diaria_prazo, 'A diária fica no ar de 48 a 168 horas.');
  assert.match(av.avisos.teste_lgpd_registro, /^Se você sair da prova \(para atender uma ligação, por exemplo\), o relógio continua\. Registramos o tempo de cada questão, quando você sai da tela e quando copia texto\./);
  assert.equal(av.avisos.teste_so_pessoa, 'Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste.');
  assert.equal(av.avisos.teste_conta_inativa, 'Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos.');
  assert.deepEqual(av.foto._fase2, ['em_moderacao', 'recusada_moderacao']);
  assert.equal(json('moderacao.json').motivos.find((x) => x.chave === 'foto_indevida').fase, 2);
  assert.match(av.avisos.cidade_lista_espera, /{{cidade}}/);
  for (const k of ['bloqueada_dinheiro', 'bloqueada_documento', 'bloqueada_link', 'bloqueada_generica', 'aviso_pessoa']) assert.equal(typeof av.mensagem[k], 'string', 'mensagem.' + k);
  for (const k of ['dinheiro', 'documento', 'link']) assert.doesNotThrow(() => new RegExp(av.mensagem.padroes[k], 'i'), 'regex ' + k);
  assert.match('me manda o pix', new RegExp(av.mensagem.padroes.dinheiro, 'i'));
  assert.match('envia foto do cpf', new RegExp(av.mensagem.padroes.documento, 'i'));
});

test('avisos.json: termos proibidos do anúncio com explicação curta e lei', () => {
  const an = json('avisos.json').anuncio;
  const porChave = Object.fromEntries(an.termos_proibidos.map((t) => [t.chave, t]));
  for (const k of ['boa_aparencia', 'idade', 'sexo', 'estado_civil', 'gravidez', 'cor_raca', 'nacionalidade', 'religiao', 'deficiencia', 'foto', 'cobranca', 'pix']) {
    assert.ok(porChave[k], 'termo ' + k);
    assert.ok(porChave[k].termos.length > 0 || (porChave[k].padroes || []).length > 0, k + ' sem termos');
    assert.match(porChave[k].explicacao, /^não pode/, k + ' explica começando com "não pode"');
    assert.ok(porChave[k].explicacao.length <= 260, k + ' explicação curta');
  }
  assert.ok(porChave.boa_aparencia.termos.includes('boa aparencia'));
  assert.match(porChave.boa_aparencia.explicacao, /9\.029\/1995/);
  assert.ok(porChave.estado_civil.termos.includes('solteira'));
  for (const t of an.termos_proibidos) for (const re of t.padroes || []) assert.doesNotThrow(() => new RegExp(re, 'i'), t.chave);
  assert.match('vaga ate 30 anos', new RegExp(porChave.idade.padroes[0], 'i'));
  for (const b of an.bloqueios) assert.doesNotThrow(() => new RegExp(b.padrao, 'i'), b.chave);
  const tel = an.bloqueios.find((b) => b.chave === 'telefone');
  assert.match('chame (95) 99123-4567', new RegExp(tel.padrao));
  // Termos sem acento e em minúsculas (a comparação é feita assim).
  for (const t of an.termos_proibidos) for (const s of t.termos) assert.equal(s, s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), s);
  assert.equal(typeof an.campos.salario_obrigatorio, 'string');
});

test('consentimentos.json: aceites versionados com os campos exigidos', () => {
  const c = json('consentimentos.json');
  assert.match(c.termos_versao, /^\d{4}-\d{2}-\d{2}$/);
  const chaves = c.aceites.map((a) => a.chave);
  for (const k of ['pessoa_cadastro', 'pessoa_candidatura', 'pessoa_banco_talentos', 'pessoa_combinou_contato', 'pessoa_cadastro_assistido', 'empresa_cadastro', 'operador_contrato']) assert.ok(chaves.includes(k), k);
  assert.equal(new Set(chaves).size, chaves.length, 'chaves únicas');
  for (const a of c.aceites) {
    for (const campo of ['chave', 'versao', 'texto', 'obrigatorio', 'quem', 'explicacao', 'base_legal']) assert.ok(campo in a, a.chave + '.' + campo);
    assert.equal(typeof a.obrigatorio, 'boolean', a.chave);
    assert.match(a.versao, /^\d{4}-\d{2}-\d{2}$/);
  }
  const banco = c.aceites.find((a) => a.chave === 'pessoa_banco_talentos');
  assert.equal(banco.obrigatorio, false, 'banco de talentos é opcional');
  assert.equal(banco.prazo_dias, 180);
  assert.match(banco.base_legal, /art\. 7º, I/);
  assert.match(c.aceites.find((a) => a.chave === 'pessoa_candidatura').base_legal, /7º, V/);
  assert.match(c.aceites.find((a) => a.chave === 'pessoa_cadastro_assistido').explicacao, /só passa a valer/);
  assert.match(c.aceites.find((a) => a.chave === 'empresa_cadastro').explicacao, /9\.029\/1995/);
  assert.match(c.aceites.find((a) => a.chave === 'pessoa_combinou_contato').texto, /{{empresa_nome}}/);
});

test('moderacao.json: motivos por alvo, com texto para a empresa e orientação', () => {
  const m = json('moderacao.json');
  const chaves = m.motivos.map((x) => x.chave);
  assert.equal(new Set(chaves).size, chaves.length);
  for (const k of ['anuncio_discriminatorio', 'anuncio_sem_valor', 'anuncio_cobranca', 'anuncio_falso', 'anuncio_denuncias', 'empresa_cnpj_nao_confere', 'empresa_suspensa_golpe', 'mensagem_pedido_dinheiro', 'mensagem_pedido_documento']) assert.ok(chaves.includes(k), k);
  for (const x of m.motivos) {
    assert.ok(['anuncio', 'empresa', 'mensagem', 'denuncia', 'referencia', 'foto'].includes(x.alvo), x.chave);
    assert.equal(typeof x.texto_empresa, 'string');
    if (!['publicar', 'reativar', 'arquivar', 'acatar', 'liberar'].includes(x.acao)) assert.ok(x.correcao.length > 20, x.chave + ' precisa de orientação de correção');
  }
  assert.match(m.motivos.find((x) => x.chave === 'anuncio_discriminatorio').lei, /9\.029\/1995/);
});

test('whatsapp.json: mensagens prontas, sem dado sensível e com o aviso anti-golpe quando couber', () => {
  const w = json('whatsapp.json');
  const chaves = w.mensagens.map((x) => x.chave);
  for (const k of ['empresa_para_pessoa_combinou', 'pessoa_para_empresa_combinou', 'boletim_do_dia', 'empresa_convite_colaborador', 'operador_convite_empresa', 'operador_convite_pessoa', 'lembrete_prova_presencial']) assert.ok(chaves.includes(k), k);
  for (const x of w.mensagens) {
    assert.ok(['wa_me', 'copiar'].includes(x.uso), x.chave);
    for (const v of x.texto.match(/{{[a-z_]+}}/g) || []) assert.ok(x.variaveis.includes(v.slice(2, -2)), x.chave + ' variável não documentada ' + v);
    assert.ok(!/{{(idade|cpf|rg|documento|endereco|nota)}}/.test(x.texto), x.chave + ' sem dado sensível');
  }
  for (const k of ['boletim_do_dia', 'empresa_convite_colaborador', 'operador_convite_pessoa', 'operador_cadastro_assistido']) assert.match(w.mensagens.find((x) => x.chave === k).texto, /é golpe/, k);
});

test('e-mails: moldura da marca, sem endereço comprido, anti-golpe para quem se candidata, variáveis documentadas', () => {
  const indice = json('emails/indice.json');
  const porArquivo = Object.fromEntries(indice.emails.map((e) => [e.arquivo, e]));
  for (const a of EMAILS) {
    const t = ler('emails/' + a);
    assert.ok(porArquivo[a], a + ' no índice');
    assert.match(t, /assets\/marca\/vsc-logo-email\.png" width="188" alt="Vagas sem Caos"/, a + ' logo do Vagas sem Caos');
    assert.match(t, /uma empresa do grupo Gestão sem Caos/, a + ' endosso no rodapé');
    assert.match(t, /#F34405/, a + ' botão laranja');
    assert.match(t, /Gestão sem Caos/, a);
    assert.match(t, /<table role="presentation"/, a + ' tabela');
    assert.ok(!/Se o botão não funcionar, copie este endereço/.test(t), a + ' sem endereço comprido');
    for (const v of t.match(/{{[a-z_]+}}/g) || []) assert.ok(v.slice(2, -2) in porArquivo[a].variaveis, a + ' variável não documentada ' + v);
    assert.ok(!/{{ \./.test(t), a + ' sem sintaxe do Supabase Auth');
  }
  for (const a of ['confirmar-cadastro.html', 'cadastro-assistido.html', 'empresa-quer-conversar.html', 'combinou.html', 'seu-selo.html']) assert.ok(ler('emails/' + a).includes(NUNCA_PAGUE), a + ' tem o nunca_pague');
  for (const a of ['confirmar-cadastro.html', 'redefinir-senha.html', 'empresa-quer-conversar.html', 'combinou.html', 'vaga-aprovada.html', 'vaga-recusada.html', 'nova-candidatura.html', 'seu-selo.html', 'conta-sera-apagada.html']) assert.ok(EMAILS.includes(a), a);
  assert.match(ler('emails/conta-sera-apagada.html'), /30 dias/);
});

test('referência profissional: aceite da pessoa, declaração da empresa, avisos, moderação, e-mails e lista de pontos fortes', () => {
  const c = json('consentimentos.json');
  const aceite = c.aceites.find((a) => a.chave === 'pessoa_referencia_aceitar');
  assert.ok(aceite && aceite.obrigatorio && /ocultar ou excluir/.test(aceite.texto), 'aceite da pessoa');
  const decl = c.aceites.find((a) => a.chave === 'empresa_referencia_declaracao');
  assert.match(decl.texto, /^Declaro que a pessoa trabalhou nesta empresa no período informado\. A referência é pública e aparece com o nome da empresa\./);
  const av = json('avisos.json');
  for (const k of ['referencia_o_que_e', 'referencia_so_se_aceitar', 'referencia_publica', 'referencia_cartao_cego', 'referencia_recebida', 'referencia_ocultada', 'referencia_sem_ordem']) assert.equal(typeof av.avisos[k], 'string', 'avisos.' + k);
  assert.match(av.avisos.referencia_so_se_aceitar, /só aparece se você aceitar/);
  assert.equal(av.referencia.pontos_fortes.length, 12, 'lista fechada da psicologia: 12 pontos fortes');
  assert.ok(av.referencia.pontos_fortes.every((p) => p.chave && p.texto));
  assert.equal(av.referencia.pontos_fortes.find((p) => p.chave === 'caixa_certo').texto, 'Caixa fecha certo');
  assert.match(av.avisos.referencia_cartao_cego, /Referência de empresa verificada: sim/);
  assert.match(av.avisos.referencia_texto_regras, /^Descreva uma situação de trabalho que você viu \(o que a pessoa fez\)\. Não escreva qualidades pessoais\./);
  assert.ok(json('moderacao.json').motivos.some((x) => x.chave === 'referencia_qualidade_pessoal'));
  // Textos fixos da psicologia: tela antes da prova, resultado sem selo, nota com margem.
  // (revisão C da psicologia: sem a prova presencial, que não existe; o "refazer" aparece uma vez só, com a data, no resultado)
  assert.equal(av.avisos.teste_antes, 'Faça sozinho(a), sem consultar. O teste mede o que você sabe hoje do básico da função; não mede inteligência nem personalidade.');
  assert.equal(av.avisos.selo_sem_selo, 'Ainda sem selo neste teste. A empresa não fica sabendo.');
  assert.equal(av.avisos.teste_encerrar_conta, 'Se você encerrar antes do fim, a tentativa conta: este teste só pode ser feito de novo em 30 dias.');
  assert.match(av.anuncio.campos.selo_sugerido, /^Quer sugerir o teste de {{teste_nome}}\? Quem quiser faz o teste/);
  assert.match(av.avisos.selo_emitido, /Nota {{nota}} de 100 \(15 questões; margem de cerca de ±{{margem}} pontos\)/);
  assert.match(ler('emails/seu-selo.html'), /Nota {{nota}} de 100<\/strong> \(15 questões; margem de cerca de ±{{margem}} pontos\)/);
  assert.ok(EMAILS.includes('contratada.html'));
  assert.equal(typeof av.botoes.roteiro_entrevista, 'string');
  // Pontos fortes são comportamentos observáveis (frases com verbo no passado), não traços.
  for (const p of av.referencia.pontos_fortes) assert.ok(!/\b(honest|leal|inteligent|esfor[cç]ad|dedicad|proativ|carism)/i.test(p.texto), p.texto + ' parece traço, não comportamento');
  assert.ok(!/estrela|nota|média|ranking/i.test(av.avisos.referencia_o_que_e.replace(/Sem estrelas, sem nota, sem média/, '')));
  const m = json('moderacao.json');
  for (const k of ['referencia_dado_sensivel', 'referencia_discriminatoria', 'referencia_contato', 'referencia_negativa']) {
    const x = m.motivos.find((y) => y.chave === k);
    assert.ok(x && x.alvo === 'referencia' && x.correcao.length > 20, k);
  }
  assert.match(m.motivos.find((y) => y.chave === 'referencia_negativa').lei, /REVISÃO JURÍDICA/);
  for (const a of ['referencia-recebida.html', 'referencia-pedido.html']) assert.ok(EMAILS.includes(a), a);
  // P2 (integrador): a empresa nunca é avisada nem percebe que a pessoa aceitou, recusou, ocultou ou excluiu a referência.
  assert.ok(!EMAILS.includes('referencia-decidida.html'), 'sem e-mail para a empresa sobre a decisão da pessoa');
  for (const k of ['referencia_empresa_aceita', 'referencia_empresa_ocultada']) assert.ok(!(k in av.avisos), k + ' não existe');
  for (const k of ['referencia_so_se_aceitar', 'referencia_recusada', 'referencia_ocultada', 'referencia_excluida']) assert.match(av.avisos[k], /não fica sabendo/, k);
  for (const a of TODOS) {
    const t = textoLido(a);
    assert.ok(!/a empresa (é|será) avisada|avisamos quando ela decidir|ocultar ou excluir, e você é avisad/i.test(t), a + ' avisa a empresa sobre a referência');
  }
  // P1: no cartão cego, só "Referência de empresa verificada: sim" (nada de contagem nem pontos fortes).
  for (const a of TODOS) assert.ok(!/cartão[^.]{0,40}(só|apenas) a contagem|contagem e os pontos fortes/i.test(textoLido(a)), a + ' cartão cego com contagem/pontos fortes');
  assert.match(ler('emails/referencia-recebida.html'), /só você vê|Só aparece se você aceitar/i);
  assert.ok(json('whatsapp.json').mensagens.some((x) => x.chave === 'pessoa_pedir_referencia'));
  assert.match(ler('termos-de-uso.md'), /6\.3\. \*\*Referência profissional\.\*\* \[REVISÃO JURÍDICA\]/);
  assert.match(ler('aviso-de-privacidade.md'), /Referências profissionais:\*\* \[REVISÃO JURÍDICA\]/);
});

test('termos e privacidade cobrem os pontos obrigatórios', () => {
  const termos = ler('termos-de-uso.md');
  for (const re of [/não é agência de emprego/, /6\.019\/1974/, /grátis para a pessoa, para sempre/, /sem renovação automática|Nenhum extra renova sozinho/, /9\.029\/1995/, /373-A/, /LC 150\/2015/, /REVISÃO JURÍDICA: cidade da sede da Gestão sem Caos/, /operador de dados/, /Resumo em 10 linhas/]) assert.match(termos, re);
  const priv = ler('aviso-de-privacidade.md');
  for (const re of [/art\. 7º, V/, /consentimento específico, com prazo/, /24 meses/, /Supabase/, /Resend/, /Cloudflare/, /Stripe/, /InfinitePay/, /"Meus dados"/, /Encarregad[oa]\(a\) de dados/, /18 anos/, /Resumo em 10 linhas/, /art\. 20/]) assert.match(priv, re);
  const naoColeta = ['idade', 'gênero', 'estado civil', 'filhos', 'gravidez', 'cor', 'religião', 'nacionalidade', 'saúde', 'antecedentes'];
  const secao = priv.split('### 2.4.')[1].split('## 3.')[0];
  for (const d of naoColeta) assert.ok(secao.toLowerCase().includes(d), 'não coletamos: ' + d);
  // Foto: opcional, aceite separado, só depois do Combinou, nunca no cartão cego.
  assert.match(secao, /foto, que é opcional/);
  assert.match(priv, /\*\*Foto \(opcional\):\*\* \[REVISÃO JURÍDICA\]/);
  assert.match(termos, /4\.7\. \*\*Foto \(opcional\)\.\*\* \[REVISÃO JURÍDICA\]/);
  const av = json('avisos.json');
  assert.equal(av.foto.explicacao, 'A empresa só vê sua foto depois que vocês combinarem de conversar. Sem foto não muda nada na sua candidatura.');
  for (const k of ['removida', 'recusada_moderacao', 'quem_ve']) assert.equal(typeof av.foto[k], 'string', 'foto.' + k);
  assert.match(av.avisos.cartao_cego, /sem foto/);
  const fotoAceite = json('consentimentos.json').aceites.find((a) => a.chave === 'foto_opcional');
  assert.ok(fotoAceite && fotoAceite.obrigatorio === false && /remover/i.test(fotoAceite.texto) && fotoAceite.texto.length < 200, 'aceite foto_opcional curto e opcional');
  const fotoMod = json('moderacao.json').motivos.find((x) => x.chave === 'foto_indevida');
  assert.ok(fotoMod && fotoMod.alvo === 'foto' && fotoMod.correcao.length > 20);
  // O resumo de 10 linhas tem exatamente 10 itens numerados.
  for (const t of [termos, priv]) {
    const resumo = t.split('## Resumo em 10 linhas')[1].split('---')[0];
    assert.equal((resumo.match(/^\d+\. /gm) || []).length, 10);
  }
});
