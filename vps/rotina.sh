#!/usr/bin/env bash
# Chamado pelo cron da imagem Dockerfile.rotinas: "backup" ou "despertar". Segredos vêm de /run/secrets (Docker Swarm).
set -euo pipefail
seg() { local n="$1"; if [ -z "${!n:-}" ] && [ -r "/run/secrets/${n,,}" ]; then export "$n=$(cat "/run/secrets/${n,,}")"; fi; }
DIR="${BACKUP_DIR:-/backups}"

case "${1:-}" in
  backup)
    seg SUPABASE_DB_URL; seg BACKUP_SENHA
    PG_BIN=/usr/libexec/postgresql17/ bash /app/backup-banco.sh "$DIR"
    # guarda 90 dias, como o robô antigo
    find "$DIR" -name 'backup-*.tar.gpg' -mtime +90 -delete
    # 2ª cópia fora do servidor (opcional): RCLONE_DESTINO = "remoto:pasta", com o remoto configurado em /run/secrets/rclone_conf
    if [ -n "${RCLONE_DESTINO:-}" ]; then
      rclone --config /run/secrets/rclone_conf copy "$DIR" "$RCLONE_DESTINO" --include 'backup-*.tar.gpg' --max-age 2d
      echo "2ª cópia enviada para $RCLONE_DESTINO"
    fi
    date -u +%FT%TZ > "$DIR/ULTIMA-COPIA-BOA"
    ;;
  despertar)
    seg SUPABASE_ANON_KEY
    : "${SUPABASE_URL:?}" "${SUPABASE_ANON_KEY:?}"
    case "$SUPABASE_ANON_KEY" in sb_*) auth=() ;; *) auth=(-H "Authorization: Bearer $SUPABASE_ANON_KEY") ;; esac
    for t in 1 2 3; do
      cod=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -X POST "${SUPABASE_URL%/}/rest/v1/rpc/avaliacao_publica" \
        -H "apikey: $SUPABASE_ANON_KEY" "${auth[@]}" -H 'Content-Type: application/json' -d '{"p_codigo":"ZZZZ"}' || true)
      echo "despertar tentativa $t: HTTP $cod"; [ "$cod" = 200 ] && exit 0; sleep 20
    done
    echo "ERRO: Supabase não respondeu" >&2; exit 1 ;;
  *) echo "uso: rotina.sh backup|despertar" >&2; exit 2 ;;
esac
