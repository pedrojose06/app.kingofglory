-- Mensagens padrão da academia: textos prontos (com emojis) para mandar nos grupos do WhatsApp.
--
-- O texto fica fixo e os trechos que mudam a cada envio são campos entre chaves no próprio texto, ex.: {Data},
-- {Horário}, {Valor por aluno}. Na hora de usar, o app pede cada campo e monta a mensagem.
-- `defaults` guarda o valor padrão de cada campo ({"Valor por aluno": "R$ 15,00"}), preenchido ao abrir a mensagem.
-- Administrador e professores da academia leem, criam, editam e apagam.
-- Rollback: supabase/rollback/20261129120000_academy_message_templates.down.sql

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 120),
  body text not null check (length(trim(body)) > 0 and length(body) <= 8000),
  defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(defaults) = 'object'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index message_templates_title_uq on public.message_templates (gym_id, lower(title));
create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();

alter table public.message_templates enable row level security;
create policy message_templates_staff on public.message_templates for all to authenticated
  using (public.is_academy_staff(gym_id)) with check (public.is_academy_staff(gym_id));
