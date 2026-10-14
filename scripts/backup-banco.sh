#!/usr/bin/env bash
# Cópia de segurança do banco do Supabase (DISC + Vagas), trancada com senha. Quem chama: o robô
# .github/workflows/backup-banco.yml (todo dia) ou alguém da equipe, à mão. Passo a passo e restauração: docs/BACKUP.md.
#
#   SUPABASE_DB_URL=… BACKUP_SENHA=… bash scripts/backup-banco.sh [pasta-de-saída]
#
# SUPABASE_DB_URL  URI do "Session pooler" do Supabase (o GitHub não tem IPv6; a conexão direta db.<ref>.supabase.co só
#                  tem IPv6 no plano grátis). Contém a senha do banco: só nos Secrets do GitHub, nunca no repositório.
# BACKUP_SENHA     senha que tranca a cópia (20+ caracteres). Sem ela a cópia não abre: guarde fora do GitHub.
# PG_BIN           (opcional) pasta do pg_dump/pg_restore com barra no fim; precisa ser da mesma versão do banco (17).
#
# Gera <pasta>/backup-AAAA-MM-DD.tar.gpg com dois arquivos dentro:
#   app.dump     estrutura + dados dos esquemas do produto (public, vagas_interno) e o histórico de migrações
#   contas.dump  só os dados das contas e do Storage (auth, storage); a estrutura desses é do próprio Supabase
# Os arquivos do Storage (fotos) NÃO entram: o pg_dump só copia o banco.
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL (veja docs/BACKUP.md)}"
: "${BACKUP_SENHA:?Falta BACKUP_SENHA (veja docs/BACKUP.md)}"
if [ "${#BACKUP_SENHA}" -lt 20 ]; then
  echo "BACKUP_SENHA curta demais: use 20 caracteres ou mais (por exemplo, 5 palavras aleatórias)." >&2
  exit 1
fi

PG_BIN="${PG_BIN:-}"
SAIDA="${1:-copia}"
DIA="$(date -u +%F)"
umask 077
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Copiando o produto (public, vagas_interno, histórico de migrações)…"
"${PG_BIN}pg_dump" --dbname="$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=vagas_interno --schema=supabase_migrations --file="$TMP/app.dump"

echo "Copiando os dados das contas e do Storage (auth, storage)…"
"${PG_BIN}pg_dump" --dbname="$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --data-only \
  --schema=auth --schema=storage --file="$TMP/contas.dump"

# A cópia só vale se abrir: o pg_restore lê o índice de cada arquivo (sem tocar em banco nenhum).
for f in app contas; do
  itens=$("${PG_BIN}pg_restore" --list "$TMP/$f.dump" | grep -cv '^;' || true)
  echo "$f.dump: $(wc -c < "$TMP/$f.dump") bytes, $itens itens"
  if [ "$itens" -lt 1 ]; then
    echo "$f.dump saiu vazio: a cópia não foi guardada." >&2
    exit 1
  fi
done

cat > "$TMP/LEIA-ME.txt" <<EOF
Cópia de segurança do banco do Supabase de $DIA (UTC).
app.dump: estrutura e dados de public, vagas_interno e supabase_migrations.
contas.dump: só os dados de auth e storage (as fotos do Storage não entram).
Como restaurar: docs/BACKUP.md no repositório.
EOF

tar -C "$TMP" -cf "$TMP/backup.tar" app.dump contas.dump LEIA-ME.txt
mkdir -p "$SAIDA"
# Senha pelo descritor 3 (não aparece na lista de processos nem no log). AES-256, chave derivada com SHA-512 e muitas voltas.
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --output "$SAIDA/backup-$DIA.tar.gpg" "$TMP/backup.tar" 3<<<"$BACKUP_SENHA"

echo "Cópia trancada: $SAIDA/backup-$DIA.tar.gpg ($(wc -c < "$SAIDA/backup-$DIA.tar.gpg") bytes)"
