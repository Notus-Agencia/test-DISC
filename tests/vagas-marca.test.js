'use strict';
// Vagas sem Caos — marca própria (docs/IDENTIDADE-VISUAL.md, "Logo (Vagas sem Caos)"): o logo do Vagas sem Caos no topo de toda
// tela, a Gestão sem Caos só como endosso ("Uma empresa do grupo" + logo) nos rodapés, nos e-mails e nos textos, e o painel do
// DISC (admin.html, inclusive a aba Vagas) com a marca da Gestão sem Caos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const PAGINAS = fs.readdirSync(path.join(RAIZ, 'vagas')).filter((f) => f.endsWith('.html')).sort();
const LOGO_TOPO = /<img class="logo-gsc[^"]*" src="comum\/marca\/vsc-logo(?:-preto|-negativo)?\.svg" alt="Vagas sem Caos" width="(\d+)" height="(\d+)">/;
const ENDOSSO = /Uma empresa do grupo <img class="logo-gsc" src="comum\/marca\/gsc-logo\.svg" alt="Gestão sem Caos" width="142" height="20">/;
const PROPORCAO = 863.4 / 129.3;

test('topo: toda página do vagas/ usa o logo do Vagas sem Caos (alt "Vagas sem Caos"), sem o logo da Gestão sem Caos nem o nome escrito ao lado', () => {
  assert.ok(PAGINAS.length >= 14, 'todas as páginas: ' + PAGINAS.join(', '));
  const topoJs = /function topo\(op\) \{[^]*?\n  \}\n/.exec(ler('vagas/js/ui.js'))[0];
  assert.match(topoJs, /src: 'comum\/marca\/vsc-logo\.svg', alt: 'Vagas sem Caos', width: '160', height: '24'/, 'VAGAS_UI.topo');
  assert.doesNotMatch(topoJs, /gsc-logo|topo-nome/);
  for (const p of PAGINAS) {
    const html = ler('vagas/' + p);
    assert.doesNotMatch(html, /topo-nome|vg-espera__produto/, p + ': sem o nome escrito ao lado do logo');
    const cab = /<header[^>]*>([^]*?)<\/header>/.exec(html);
    if (p === 'entrar.html') { assert.equal(cab, null, 'entrar.html: a moldura vem de entrar.js'); continue; }
    assert.ok(cab, p + ' tem topo');
    if (/id="vg-topo"><\/header>/.test(html)) {
      assert.match(html, /<script src="js\/ui\.js"><\/script>/, p + ': topo montado pelo VAGAS_UI.topo');
      continue;
    }
    const m = LOGO_TOPO.exec(cab[1]);
    assert.ok(m, p + ': logo do Vagas sem Caos no topo');
    assert.ok(Number(m[2]) >= 20, p + ': altura mínima de 20 px');
    assert.ok(Math.abs(Number(m[1]) / Number(m[2]) - PROPORCAO) < 0.05, p + ': sem esticar (' + m[1] + '×' + m[2] + ')');
    assert.doesNotMatch(cab[1], /gsc-logo/, p + ': o logo da Gestão sem Caos não vai no topo');
  }
  // entrar.html (moldura laranja): versão preta, nas duas molduras (pessoa e empresa)
  const imgs = ler('vagas/js/entrar.js').match(/el\('img', \{[^}]*\}\)/g) || [];
  assert.equal(imgs.length, 2);
  for (const i of imgs) assert.match(i, /src: 'comum\/marca\/vsc-logo-preto\.svg', alt: 'Vagas sem Caos', width: '240', height: '36'/);
  // menu lateral da empresa e do operador; página do link curto (fundo azul-escuro: negativa)
  assert.match(ler('vagas/js/ui-area.js'), /class: 'logo-gsc menu-lateral__logo', src: 'comum\/marca\/vsc-logo\.svg', alt: 'Vagas sem Caos', width: '147', height: '22'/);
  assert.match(ler('vagas/functions/v/[codigo].js'), /<header><a href="\/"><img src="\/comum\/marca\/vsc-logo-negativo\.svg" alt="Vagas sem Caos" width="187" height="28">/);
});

test('nenhuma frase pública "ferramenta da Gestão sem Caos": o Vagas sem Caos é "uma empresa do grupo Gestão sem Caos"', () => {
  const arquivos = [];
  const andar = (dir) => {
    for (const n of fs.readdirSync(path.join(RAIZ, dir))) {
      const rel = dir + '/' + n;
      if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) andar(rel);
      else if (/\.(html|js|json|md|ts|txt)$/.test(n) && n !== 'OFL.txt') arquivos.push(rel);
    }
  };
  ['vagas', 'conteudo/vagas-textos', 'conteudo/vagas-operacao'].forEach(andar);
  arquivos.push('supabase/funcoes-compartilhadas/vagas-conta.js', 'supabase/functions/vagas-conta/index.ts', 'dist/funcoes/vagas-conta/index.ts');
  assert.ok(arquivos.length > 50);
  for (const a of arquivos) assert.doesNotMatch(ler(a), /ferramenta da Gestão sem Caos/i, a);
  assert.match(ler('vagas/js/selo.js'), /Emitido pelo Vagas sem Caos, uma empresa do grupo Gestão sem Caos\./);
});

test('endosso: todo rodapé tem "Uma empresa do grupo" + logo da Gestão sem Caos (20 px); na lista pública, só texto (peso)', () => {
  const comRodape = PAGINAS.filter((p) => /<footer/.test(ler('vagas/' + p)));
  assert.deepEqual(comRodape, ['emprego.html', 'empresas.html', 'index.html', 'privacidade.html', 'termos.html']);
  for (const p of comRodape) assert.match(/<footer[^]*?<\/footer>/.exec(ler('vagas/' + p))[0], ENDOSSO, p);
  assert.match(ler('vagas/js/cidade.js'), /el\('footer', \{ class: 'rodape' \}, el\('p', \{ class: 'rodape-nota' \}, \['Uma empresa do grupo Gestão sem Caos · '/);
  assert.match(ler('vagas/functions/v/[codigo].js'), /<footer><p class="grupo">Uma empresa do grupo <img src="\/comum\/marca\/gsc-logo\.svg" alt="Gestão sem Caos" width="142" height="20"><\/p>/);
  assert.match(ler('vagas/assets/vagas.css'), /\.vg-grupo \.logo-gsc \{ height: 20px; \}/);
});

test('textos legais: a Gestão sem Caos continua responsável; o "empresa do grupo" leva o marcador de revisão jurídica uma vez em cada documento', () => {
  const MARCADOR = '[REVISÃO JURÍDICA: confirmar a estrutura societária de "empresa do grupo"]';
  for (const a of ['conteudo/vagas-textos/termos-de-uso.md', 'conteudo/vagas-textos/aviso-de-privacidade.md', 'conteudo/vagas-operacao/contrato-parceiro-MINUTA.md']) {
    const t = ler(a);
    assert.equal(t.split(MARCADOR).length - 1, 1, a + ': marcador uma vez');
    assert.match(t, /empresa do grupo Gestão sem Caos/, a);
  }
  assert.match(ler('conteudo/vagas-textos/termos-de-uso.md'), /É mantido pela Gestão sem Caos/);
  assert.match(ler('conteudo/vagas-textos/aviso-de-privacidade.md'), /A controladora dos dados é a \*\*Gestão sem Caos\*\*/);
  assert.ok(ler('vagas/termos.html').includes('[REVISÃO JURÍDICA: confirmar a estrutura societária de &quot;empresa do grupo&quot;]'));
});

test('painel do DISC (admin.html, inclusive a aba Vagas) continua com o logo da Gestão sem Caos', () => {
  const admin = ler('admin.html');
  assert.match(admin, /class="logo-gsc topo__logo" src="assets\/marca\/gsc-logo\.svg" alt="Gestão sem Caos"/);
  assert.match(admin, /class="logo-gsc menu-lateral__logo" src="assets\/marca\/gsc-logo\.svg" alt="Gestão sem Caos"/);
  assert.doesNotMatch(admin, /vsc-logo/);
  for (const a of fs.readdirSync(path.join(RAIZ, 'js')).filter((f) => /^admin.*\.js$/.test(f))) assert.doesNotMatch(ler('js/' + a), /vsc-logo/, a);
  for (const p of PAGINAS) assert.match(ler('vagas/' + p), /href="comum\/marca\/gsc-favicon\.svg"/, p + ': o favicon continua o símbolo');
});

test('logos do Vagas sem Caos: as três versões com o mesmo desenho (só a cor muda), proporção 6,68:1, otimizadas; PNG do e-mail 903×136', () => {
  const svgs = ['vsc-logo.svg', 'vsc-logo-negativo.svg', 'vsc-logo-preto.svg'].map((f) => ler('assets/marca/' + f));
  const forma = (s) => s.replace(/fill="#[0-9a-f]{6}"/g, 'fill=""');
  assert.equal(forma(svgs[1]), forma(svgs[0]));
  assert.equal(forma(svgs[2]), forma(svgs[0]));
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgs[0]);
  assert.ok(vb && Math.abs(Number(vb[1]) / Number(vb[2]) - 6.68) < 0.01);
  assert.match(svgs[0], /fill="#122940"[^]*fill="#f2752e"[^]*fill="#fcba75"/);
  assert.match(svgs[1], /fill="#f2f2f2"[^]*fill="#f2752e"[^]*fill="#fcba75"/);
  assert.deepEqual([...new Set(svgs[2].match(/fill="#[0-9a-f]{6}"/g))], ['fill="#141414"']);
  for (const s of svgs) {
    assert.match(s, /aria-label="Vagas sem Caos"/);
    assert.ok(zlib.gzipSync(s, { level: 9 }).length <= 1800, 'otimizado para a lista pública');
    assert.ok(Buffer.byteLength(s) <= 4600);
  }
  const png = fs.readFileSync(path.join(RAIZ, 'assets/marca/vsc-logo-email.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [903, 136]);
});

test('e-mails da vagas-conta: logo do Vagas sem Caos (PNG) no topo e o endosso no rodapé, em todos os modelos', async () => {
  const V = await import('../supabase/funcoes-compartilhadas/vagas-conta.js');
  assert.equal(V.VAGAS_LOGO_EMAIL, 'https://disc.gestaosemcaos.com.br/assets/marca/vsc-logo-email.png');
  for (const tipo of ['confirmar', 'jaTemConta', 'senha', 'assistido', 'operador', 'conviteEquipe', 'conviteEquipeOutraConta', 'cidadeAbriu']) {
    const e = V.montarEmailVagas(tipo, { nome: 'Ana', cidade: 'Cidade Exemplo', url: 'https://vagas.gestaosemcaos.com.br/entrar.html?token_hash=x&type=invite',
      urlSair: 'https://vagas.gestaosemcaos.com.br/emprego.html#sair' });
    assert.ok(e.html.includes('<img src="' + V.VAGAS_LOGO_EMAIL + '" width="188" alt="Vagas sem Caos" style="display:block;width:188px;'), tipo + ': logo');
    assert.doesNotMatch(e.html, /gsc-logo-email|ferramenta da/, tipo);
    assert.match(e.html, /Vagas sem Caos · uma empresa do grupo Gestão sem Caos\./, tipo + ': endosso no rodapé');
    assert.match(e.texto, /Vagas sem Caos · uma empresa do grupo Gestão sem Caos\./, tipo + ': endosso na versão em texto');
  }
});
