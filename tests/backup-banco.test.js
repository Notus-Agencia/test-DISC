// Cópia de segurança do banco (.github/workflows/backup-banco.yml + scripts/backup-banco.sh, docs/BACKUP.md).
// O repositório é público: estes testes garantem que só sai do robô a cópia TRANCADA e que a senha nunca vai para a
// linha de comando nem para o log.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const robo = fs.readFileSync(path.join(raiz, '.github/workflows/backup-banco.yml'), 'utf8');
const script = fs.readFileSync(path.join(raiz, 'scripts/backup-banco.sh'), 'utf8');
const semComentarios = (txt) => txt.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('robô: roda todo dia, só lê o repositório e não roda em fork', () => {
  assert.match(robo, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/);
  assert.match(robo, /workflow_dispatch:/);
  assert.match(robo, /permissions:\s*\n\s*contents: read\s*\n/);
  assert.match(robo, /if: \$\{\{ !github\.event\.repository\.fork \}\}/);
});

test('robô: segredos só por variável de ambiente e falha alto sem eles', () => {
  assert.match(robo, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.match(robo, /BACKUP_SENHA: \$\{\{ secrets\.BACKUP_SENHA \}\}/);
  const usos = robo.match(/secrets\.\w+/g);
  assert.deepEqual([...new Set(usos)].sort(), ['secrets.BACKUP_SENHA', 'secrets.SUPABASE_DB_URL']);
  assert.match(robo, /env\.SUPABASE_DB_URL == '' \|\| env\.BACKUP_SENHA == ''[\s\S]*?exit 1/);
});

test('robô: guarda só o arquivo trancado, por 90 dias', () => {
  const guardar = robo.slice(robo.indexOf('actions/upload-artifact'));
  assert.match(guardar, /path: copia\/\*\.tar\.gpg\s*\n/);
  assert.match(guardar, /retention-days: 90/);
  assert.match(guardar, /if-no-files-found: error/);
  assert.equal((robo.match(/upload-artifact/g) || []).length, 1);
});

test('robô: pg_dump na versão do banco (17)', () => {
  assert.match(robo, /postgresql-client-17/);
  assert.match(robo, /PG_BIN: \/usr\/lib\/postgresql\/17\/bin\//);
});

test('script: para no primeiro erro, sem eco de comandos', () => {
  assert.match(script, /^set -euo pipefail$/m);
  assert.doesNotMatch(semComentarios(script), /set -x|set -o xtrace|bash -x/);
});

test('script: tranca com AES-256 e a senha entra pelo descritor 3 (fora da linha de comando)', () => {
  const codigo = semComentarios(script);
  assert.match(codigo, /--symmetric --cipher-algo AES256/);
  assert.match(codigo, /--passphrase-fd 3/);
  assert.match(codigo, /3<<<"\$BACKUP_SENHA"/);
  assert.doesNotMatch(codigo, /--passphrase[ =]["$]/);
  assert.doesNotMatch(codigo, /echo[^\n]*\$(BACKUP_SENHA|SUPABASE_DB_URL)/);
  assert.match(codigo, /\$\{#BACKUP_SENHA\}" -lt 20/);
});

test('script: copia o DISC, o Vagas, as migrações e as contas; a cópia aberta fica só na pasta temporária', () => {
  const codigo = semComentarios(script);
  for (const esquema of ['public', 'vagas_interno', 'supabase_migrations']) assert.match(codigo, new RegExp(`--schema=${esquema}\\b`));
  assert.match(codigo, /--data-only \\\n\s*--schema=auth --schema=storage/);
  assert.match(codigo, /^umask 077$/m);
  assert.match(codigo, /trap 'rm -rf "\$TMP"' EXIT/);
  assert.match(codigo, /--output "\$SAIDA\/backup-\$DIA\.tar\.gpg" "\$TMP\/backup\.tar"/);
  assert.match(codigo, /pg_restore" --list/);
});

test('robô: pausa com data para acabar; sem segredos não roda nada e, com eles, a cópia segue normal', () => {
  const m = /PAUSA_ATE: '(\d{4}-\d{2}-\d{2})'/.exec(robo);
  assert.ok(m, 'PAUSA_ATE com data AAAA-MM-DD');
  assert.ok(!Number.isNaN(Date.parse(m[1] + 'T00:00:00Z')));
  const aviso = robo.slice(robo.indexOf('- name: Segredos ausentes'), robo.indexOf('- uses: actions/checkout'));
  assert.match(aviso, /< "\$PAUSA_ATE" \]\][\s\S]*?::notice::[\s\S]*?exit 0[\s\S]*?::error::[\s\S]*?exit 1/);
  const depois = robo.slice(robo.indexOf('- uses: actions/checkout'));
  const passos = depois.split(/\n      - /).length;
  const guardados = (depois.match(/if: env\.SUPABASE_DB_URL != '' && env\.BACKUP_SENHA != ''/g) || []).length;
  assert.equal(guardados, passos, 'cada passo depois do aviso só roda com os segredos');
});
