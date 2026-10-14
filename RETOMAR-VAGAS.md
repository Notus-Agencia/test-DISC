# Vagas sem Caos — onde paramos (14/10/2026)

Trabalho parado a pedido do dono para poupar o limite de uso da semana. Nada foi publicado: a branch principal
(`claude/disc-test-selection-system-61ot0f`) está como antes; produção do banco em `20261024120002`.

## Cópias de segurança (`backup/vagas-2026-10-14/*`)
Cada uma é uma foto do código sobre a principal, sem o histórico intermediário e **sem as questões de demonstração
da prévia** (repositório público; precisam ser reescritas antes de ir a qualquer branch daqui).
- `integracao`: as quatro frentes de telas (pessoa, testes, empresa, operação + aba Vagas do painel, oculta), a
  divulgação (/emprego e /empresas), a marca própria nas páginas de divulgação e as migrações 0003/0004 (não aplicadas).
- `marca`, `testes`, `empresa`, `banco`: trabalho em andamento de cada frente (inclui commit "WIP").

## Para terminar, em ordem
1. **Marca**: FEITA e integrada (logo em todas as telas e e-mails, prévia separada de produção, peso 95,9 KB).
2. **Testes**: FEITO e integrado (psicologia, celular; questões de demonstração reescritas e conferidas em privado: nenhuma parecida com as reais).
3. **Empresa**: FEITA e integrada (experiência até 6 meses, selo sugerido, sem duplicar, convite no celular, pré-abertura).
4. **Banco (migração 0005)**: a empresa não pode ver se a pessoa aceitou ou recusou a referência; ids novos de
   experiência; vagas_cartoes ignora escolaridade/experiência mínimas; pedidos abertos das telas.
5. **Revisão de segurança** das migrações 0003/0004/0005 antes de enviar à principal (o envio aplica em produção).
6. **Revisões que faltam**: telas da pessoa e da operação (psicologia, código, celular).
7. **Prévia completa do app** para o dono; envio só depois da aprovação.

## Decisões do dono pendentes
Número do WhatsApp da Gestão sem Caos · razão social e CNPJ no rodapé · aviso de 30 dias antes de qualquer cobrança
· prazos prometidos às empresas · uma frase sobre a Gestão sem Caos · quem opera Uruaçu · advogado (foro, "empresa
do grupo", CLT 442-A, seção da lista de espera no aviso de privacidade) · psicólogo(a) com CRP.
