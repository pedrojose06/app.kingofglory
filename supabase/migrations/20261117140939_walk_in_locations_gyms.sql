-- Locais da presença avulsa: Matriz, todas as academias cadastradas pelos professores e, depois, os outros
-- locais que o professor já digitou (mais usados primeiro). Sem repetir nomes (ignora maiúsculas).
-- security definer: o professor não enxerga pela RLS as academias em que não dá aula; aqui só sai o nome.
create or replace function public.walk_in_locations()
returns table (location_label text, uses bigint)
language sql stable security definer
set search_path = ''
as $$
  with base as (
    select 'Matriz'::text as label, 0 as grp, 0::bigint as uses
    union all
    select trim(g.name), 1, 0::bigint from public.gyms g
    union all
    select a.location_label, 2, count(*)
    from public.attendance a
    where a.class_id is null and a.marked_by = (select auth.uid())
    group by a.location_label
  ),
  uniq as (
    select distinct on (lower(b.label)) b.label, b.grp, b.uses
    from base b
    where length(trim(coalesce(b.label, ''))) > 0
    order by lower(b.label), b.grp
  )
  select u.label, u.uses
  from uniq u
  order by u.grp, u.uses desc, u.label
$$;
revoke execute on function public.walk_in_locations() from public, anon;
grant execute on function public.walk_in_locations() to authenticated;
