# Gestão sem Caos Vagas — onde paramos (14/10/2026)

Nada foi publicado: a branch principal (`claude/disc-test-selection-system-61ot0f`) está como antes; produção do
banco em `20261024120002`. O envio à principal aplica as migrações 0003/0004/0005 em produção, então só depois da
revisão de segurança e da aprovação do dono.

## Cópias de segurança (`backup/vagas-2026-10-14/*`)
Cada uma é uma foto do código, sem o histórico intermediário.
- `integracao`: tudo integrado até aqui (telas da pessoa, testes, empresa, operação + aba Vagas do painel, oculta
  com `VAGAS_PAINEL: false`; divulgação /emprego e /empresas; migrações 0003/0004/0005, não aplicadas). As questões
  de demonstração da prévia foram conferidas em privado: nenhuma parecida com as reais.
- `marca`, `testes`, `empresa`, `banco`: fotos antigas de cada frente (já integradas; só para consulta).

## Para terminar, em ordem
1. **Nome novo**: o dono trocou "Vagas sem Caos" por **"Gestão sem Caos Vagas"** (logo da Gestão sem Caos + "Vagas";
   sai o "Uma empresa do grupo"). A equipe de design fez três montagens (A: logo | Vagas, recomendada; B: "VAGAS"
   embaixo; C: etiqueta). Falta o dono escolher; depois trocar topo, rodapé, imagens do WhatsApp, e-mails (PNG),
   textos ("a Gestão sem Caos Vagas"), documentos, testes e CLAUDE.md.
2. **Revisão de segurança (rodada 4)**: achados corrigidos na seção 7 da 0005; falta a conferência rápida (rodada 5)
   antes da produção e o Turnstile ligado antes da divulgação (`lista_espera_captcha` só depois do TURNSTILE_SECRET).
3. **Revisões que faltam**: telas da pessoa e da operação (código, celular, acessibilidade).
4. **Prévia completa do app** para o dono; envio só depois da aprovação.
5. **No lançamento**: `MODO: 'supabase'` em `vagas/js/config.js`; ligar o pg_cron e agendar
   `select vagas_interno.contas_assistidas_limpar();` uma vez por dia; republicar `vagas-conta`.

## Decisões do dono pendentes
Montagem do nome (A, B ou C) · número do WhatsApp da Gestão sem Caos · razão social e CNPJ no rodapé · aviso de 30
dias antes de qualquer cobrança · prazos prometidos às empresas · uma frase sobre a Gestão sem Caos · quem opera
Uruaçu · advogado (foro, CLT 442-A, seção da lista de espera no aviso de privacidade) · psicólogo(a) com CRP.
