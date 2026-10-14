alter table public.proposta_eventos drop constraint proposta_eventos_tipo_check;
alter table public.proposta_eventos add constraint proposta_eventos_tipo_check check (tipo = any (array['abriu','slide','clique','saiu','decisao']));
