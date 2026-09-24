alter table public.tarifas add column if not exists preco_exato numeric;
update public.tarifas set preco_exato = preco_unitario where preco_exato is null;
comment on column public.tarifas.preco_unitario is 'DEPRECATED para leitura: arredonda em 6 casas. Use preco_exato (sem limite de casas).';