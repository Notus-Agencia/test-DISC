# DISC na VPS: publicar à mão, voltar atrás, DNS e rotinas

Substitui o GitHub Pages e os robôs do GitHub Actions (limite de gastos). Mesmo padrão do BI: Docker Swarm, stacks em
`/opt/stacks/*.yaml`, **sem publicação automática**. As migrações e as funções do Supabase continuam entrando pela integração
do Supabase com o GitHub (não mudam). Sem segredo, endereço de servidor nem nome de pessoa neste arquivo.

Arquivos: `Dockerfile.site` + `nginx.conf` (site), `Dockerfile.rotinas` + `vps/rotina.sh` + `vps/crontab` (backup e despertador),
`vps/disc-stack.yaml` (modelo da stack). **Nada disto foi construído nem testado num Docker ainda** (a máquina de desenvolvimento
não tem Docker): o primeiro `docker build` na VPS é o primeiro teste.

## 1. Preparar a VPS (uma vez; o dono ou a sessão com acesso liberado)
1. Criar os 4 segredos no Swarm (o valor nunca vai para o chat nem para o repositório): `supabase_db_url` (URI do *Session pooler*),
   `backup_senha` (20+ caracteres, guardada também fora do servidor), `supabase_anon_key` (chave pública), `rclone_conf` (só se houver 2ª cópia).
   Ex.: `printf '%s' '<valor>' | docker secret create backup_senha -`
2. Copiar `vps/disc-stack.yaml` para `/opt/stacks/disc.yaml` e preencher os marcadores (`<TAG>`, `SUPABASE_URL`, `RCLONE_DESTINO`). Os rótulos do Traefik (rede `notus-net`, resolvedor `le`, `websecure`) já estão no modelo. Subir com `docker stack deploy -c /opt/stacks/disc.yaml disc` (stack nova; não toca nas outras).

## 2. Publicar (a cada mudança, depois do "pode publicar" do dono)
Do computador, na pasta do repositório, no commit aprovado:
```bash
TAG=$(date +%F)-$(git rev-parse --short HEAD)
git archive HEAD | ssh <VPS> "rm -rf /tmp/disc-src && mkdir /tmp/disc-src && tar -x -C /tmp/disc-src"
ssh <VPS> "cd /tmp/disc-src && docker build -f Dockerfile.site -t disc-site:$TAG . && docker build -f Dockerfile.rotinas -t disc-rotinas:$TAG ."
ssh <VPS> "docker service update --image disc-site:$TAG disc_site"      # só o site
# no yaml da stack, trocar <TAG> também (para o próximo 'stack deploy' não voltar a imagem antiga)
```
Conferir: abrir a página, `/admin.html` e `/vagas/`; `curl -I` deve mostrar `Cache-Control: no-cache` no HTML.

## 3. Voltar atrás (rollback)
- Imediato: `docker service rollback disc_site` (volta à imagem anterior; o `update_config` já faz isso sozinho se a nova não ficar saudável).
- Para uma versão específica: `docker service update --image disc-site:<TAG-ANTIGA> disc_site`. Guarde as 5 últimas imagens (`docker image prune` só depois).

## 4. DNS na Hostinger (com o site antigo de pé até conferir)
1. Subir o site novo na VPS **sem mexer no DNS** e testar com o endereço forçado: `curl --resolve disc.gestaosemcaos.com.br:443:<IP-DA-VPS> https://disc.gestaosemcaos.com.br/`
   (o certificado só nasce depois da virada; para o teste use `-k` ou o endereço temporário do proxy). Conferir: teste do candidato, entrar no painel, chave de acesso, relatório, `/vagas/`.
2. **24 h antes:** baixar o TTL do registro `disc` para 5 minutos.
3. Trocar o registro de `disc`: apagar o CNAME que aponta ao GitHub Pages e criar um registro **A** para o IP da VPS. Esperar o proxy emitir o certificado (alguns minutos).
4. Conferir de novo, no celular e no computador. Desfazer = recolocar o CNAME antigo (o TTL baixo faz a volta valer em minutos).
5. Só depois de 2 dias estável: tirar o arquivo `CNAME` do repositório e desligar o Pages (**Settings → Pages**). `SITE_URL` do Supabase não muda (o endereço é o mesmo).
Outros subdomínios (`vagas.`, `equipe.`) ficam como estão; `equipe.` segue o plano de `docs/VAGAS-HOSPEDAGEM.md` §Fase 1.

## 5. Backup e despertador
- Imagem `disc-rotinas`: backup todo dia às 03:41 (Brasília) em `/backups` (volume `disc_backups`), guarda 90 dias, grava `ULTIMA-COPIA-BOA`;
  despertador do Supabase a cada 3 dias. Logs: `docker service logs disc_rotinas`.
- **2ª cópia fora do servidor** (recomendada: o disco da VPS é ponto único de falha): `rclone` envia a cópia (já trancada) para um destino
  do dono (por exemplo uma pasta do Google Drive ou um armazenamento em nuvem), via o segredo `rclone_conf`.
- **Teste na hora:** `docker exec $(docker ps -qf name=disc_rotinas) /app/rotina.sh backup` e conferir `ls /backups`; depois abrir com `gpg -d` e `pg_restore --list` (como em `docs/BACKUP.md`). "Pronto" = 3 dias de cópia boa.
- Depois da virada, apagar `.github/workflows/backup-banco.yml` e `manter-ativo.yml` (para não falharem no GitHub).
