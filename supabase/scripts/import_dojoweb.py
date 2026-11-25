#!/usr/bin/env python3
"""
Importação do DojoWeb para o sistema da academia (alunos, turmas, graduações, contratos e cobranças).

Lê as planilhas exportadas do DojoWeb e escreve um SQL idempotente: os ids são derivados (uuid5) do CPF ou do nome,
então rodar de novo atualiza em vez de duplicar. Os dados pessoais ficam só nas planilhas e no SQL gerado:
NUNCA salve nenhum dos dois dentro do repositório.

Uso (Python 3.10+, openpyxl):

    python3 -I supabase/scripts/import_dojoweb.py \\
        --gym <uuid da academia> --recorded-by <uuid de quem importa> --today 2026-11-25 \\
        --alunos Alunos.xlsx --pagos Cobrancas_pagos.xlsx --financeiro Financeiro.xlsx \\
        --abertos Cobrancas.xlsx --atrasos Cobrancas_atrasos.xlsx \\
        --out-dir /pasta/fora/do/repo

Gera, em ordem: 00-preparar.sql (tabela de passagem import_tmp.rows), 01..NN-dados.sql (os dados em JSON, em lotes
pequenos) e 99-gravar.sql (deriva os ids e grava tudo numa transação; apaga a tabela de passagem). Rodar os arquivos
nessa ordem (psql ou SQL Editor). Os ids são md5(academia|tipo|chave)::uuid: reimportar atualiza, não duplica.

Regras (decididas com a academia em 25/11/2026):
- Aluno: nome sem espaços sobrando, telefone normalizado, CPF só se válido, data de cadastro desconhecida
  (started_on = data da importação).
- Turmas pela coluna "Grade de Aulas"; modalidades Muay Thai e Jiu-Jitsu.
- Graduação atual (sem data no DojoWeb): muay thai nos graus do app (adulto ou infantil/juvenil) e jiu-jitsu nas
  faixas próprias, com a data da importação e marcada como data não informada.
- Pagador = o próprio aluno (o DojoWeb não tem os responsáveis; eles entram pela assinatura do contrato).
- Contrato por aluno com alguma cobrança: valor e dia de vencimento da cobrança mais recente; Valor 0 com pagamento
  = Gympass/Totalpass (app_parceiro), Valor 0 sem pagamento = isento. Vigência desconhecida: do mês da cobrança mais
  antiga até 31/12/2026, marcado para revisão. Gera a mensalidade de dezembro/2026 se ainda não existir.
- Cobranças pagas (com o pagamento: data e valor pagos; forma "outro", não informada) e em aberto/atrasadas
  (do Financeiro, com a categoria).
"""
import argparse
import datetime as dt
import re
import sys
import unicodedata
import uuid
from collections import defaultdict

import openpyxl

NS = uuid.UUID('6f0d2a3e-5b1c-4c8e-9a7d-2b4e6f8a0c1d')
END_OF_IMPORT = dt.date(2026, 12, 31)


def uid(*parts: str) -> str:
    return str(uuid.uuid5(NS, '|'.join(parts)))


def norm(s) -> str:
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def clean(s) -> str | None:
    if s is None:
        return None
    s = re.sub(r'\s+', ' ', str(s)).strip()
    return None if s in ('', '-', '---') else s


def q(v) -> str:
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def br_date(s) -> dt.date | None:
    s = clean(s)
    if not s:
        return None
    return dt.datetime.strptime(s[:10], '%d/%m/%Y').date()


def cents(v) -> int:
    return int(round(float(v or 0) * 100))


def cpf_ok(c: str) -> bool:
    if len(c) != 11 or c == c[0] * 11:
        return False
    for n in (9, 10):
        s = sum(int(c[i]) * (n + 1 - i) for i in range(n))
        if (s * 10) % 11 % 10 != int(c[n]):
            return False
    return True


def phone(s) -> str | None:
    d = re.sub(r'\D', '', str(s or ''))
    if len(d) == 11:
        return f'({d[:2]}) {d[2:7]}-{d[7:]}'
    if len(d) == 10:
        return f'({d[:2]}) {d[2:6]}-{d[6:]}'
    return clean(s)


def sheet(path):
    rows = [r for r in openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)
            if any(c not in (None, '') for c in r)]
    header = [clean(h) or f'col{i}' for i, h in enumerate(rows[0])]
    return [dict(zip(header, r)) for r in rows[1:]]


# ── catálogo ────────────────────────────────────────────────────────────────
MODALITIES = {'mt': ('Muay Thai', 'muay_thai', '#17130a'), 'jj': ('Jiu-Jitsu', 'jiu_jitsu', '#b3261e')}
GROUPS = {  # nome no DojoWeb → (nome aqui, modalidade, cor)
    'muaythai': ('Muay Thai', 'mt', '#17130a'),
    'muaythai feminino': ('Muay Thai Feminino', 'mt', '#e879f9'),
    'muaythai juvenil': ('Muay Thai Juvenil', 'mt', '#eab308'),
    'jiu jitsu': ('Jiu-Jitsu', 'jj', '#dc2626'),
    'jiu jitsu kids': ('Jiu-Jitsu Kids', 'jj', '#6366f1'),
}
MT_ADULT = {
    'branca': 'Branco', 'branca/vermelha': 'Vermelho e Branco', 'vermelha': 'Vermelho',
    'vermelha/azul clara': 'Vermelho e Azul Claro', 'azul clara': 'Azul Claro', 'azul clara/azul escura': 'Azul Claro e Azul Escuro',
    'azul escura': 'Azul Escuro', 'azul escura/preta': 'Azul Escuro e Preto', 'azul escuro/preta': 'Azul Escuro e Preto', 'preta': 'Preto',
}
MT_KIDS = {'branca': 'Branco', 'amarela': 'Amarelo', 'laranja': 'Laranja', 'verde': 'Verde'}
STATES = {'sao paulo': 'SP'}


def parse_groups(text) -> set[str]:
    out = set()
    for part in re.split(r',|\se\s', str(text or '')):
        key = norm(part)
        if key:
            if key not in GROUPS:
                raise SystemExit(f'Turma desconhecida na planilha: {part!r}')
            out.add(key)
    return out


def parse_grads(text) -> dict[str, str]:
    out = {}
    for part in str(text or '').split(','):
        if ':' in part:
            k, v = part.split(':', 1)
            out[norm(k)] = norm(v)
    return out


def main():
    ap = argparse.ArgumentParser()
    for a in ('gym', 'recorded-by', 'today', 'alunos', 'pagos', 'financeiro', 'abertos', 'atrasos', 'out-dir'):
        ap.add_argument('--' + a, required=True)
    ap.add_argument('--chunk-kb', type=int, default=24)
    args = ap.parse_args()
    G, BY = args.gym, args.recorded_by
    today = dt.date.fromisoformat(args.today)
    log = lambda *a: print(*a, file=sys.stderr)  # noqa: E731
    rows: list[list] = []  # [tipo, dados]
    stats = defaultdict(int)
    iso = lambda d: d and d.isoformat()  # noqa: E731

    for key, (name, system, color) in MODALITIES.items():
        rows.append(['mod', [key, name, system, color]])
    for key, (name, mod, color) in GROUPS.items():
        rows.append(['grp', [key, name, mod, color]])

    students = {}  # nome normalizado → chave do aluno
    for r in sheet(args.alunos):
        name = clean(r['Nome'])
        cpf = re.sub(r'\D', '', str(r.get('CPF') or ''))
        cpf = cpf if cpf_ok(cpf) else None
        sk = f'c:{cpf}' if cpf else f'n:{norm(name)}'
        students[norm(name)] = sk
        birth = br_date(r.get('Nascimento'))
        if birth and not (dt.date(1900, 1, 1) <= birth <= today):
            stats['nascimento_invalido_em_branco'] += 1  # ex.: data no futuro (erro de digitação no DojoWeb)
            birth = None
        groups = parse_groups(r.get('Grade de Aulas'))
        grads = parse_grads(r.get('Graduações'))
        track = 'infantil' if ('muaythai juvenil' in grads and 'muaythai' not in grads) else 'adulto'
        stats['alunos'] += 1
        stats['menores'] += bool(birth and (today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))) < 18)
        rows.append(['stu', [sk, name, phone(r.get('Telefone')), iso(birth), track]])
        num = r.get('Número')
        num = str(int(num)) if isinstance(num, float) else clean(num)
        cep = re.sub(r'\D', '', str(r.get('CEP') or ''))
        state = clean(r.get('Estado'))
        email = (clean(r.get('Email')) or '').lower() or None
        rows.append(['det', [sk, cpf, clean(r.get('RG')), email, phone(r.get('Telefone Residencial')), cep if len(cep) == 8 else None,
                             clean(r.get('Endereço')), num, clean(r.get('Complemento')), clean(r.get('Bairro')), clean(r.get('Cidade')),
                             STATES.get(norm(state), state), 'dojoweb:' + sk]])
        for g in sorted(groups):
            rows.append(['mem', [sk, g]])
        mt_name, mt_track = (MT_ADULT.get(grads['muaythai']), 'adulto') if 'muaythai' in grads else \
            (MT_KIDS.get(grads['muaythai juvenil']), 'infantil') if 'muaythai juvenil' in grads else (None, None)
        if ('muaythai' in grads or 'muaythai juvenil' in grads) and not mt_name:
            raise SystemExit(f'Faixa de muay thai desconhecida: {grads}')
        if mt_name:
            stats['graduacoes_mt'] += 1
            rows.append(['grd', [sk, mt_track, mt_name]])
        jj = grads.get('jiu jitsu') or grads.get('jiu jitsu kids')
        if jj:
            m = re.match(r'^(.*?)(?:\s+(\d+)\s+graus?)?$', jj)
            stats['faixas_jj'] += 1
            rows.append(['blt', [sk, 'adulto' if 'jiu jitsu' in grads else 'infantil', m.group(1).strip(), int(m.group(2) or 0)]])

    charges = []
    for r in sheet(args.pagos):
        charges.append(dict(person=clean(r['Alunos']), due=br_date(r['Vencimento']), value=cents(r['Valor']), paid_on=br_date(r['Pagamento']),
                            paid=cents(r['Total']), kind='mensalidade', desc=None))
    for r in sheet(args.financeiro):
        kind = {'mensalidade': 'mensalidade', 'matricula': 'matricula'}.get(norm(r['Categoria']), 'avulsa')
        charges.append(dict(person=clean(r['Pessoa']), due=br_date(r['Vencimento']), value=cents(r['Receber']), paid_on=None, paid=None,
                            kind=kind, desc=None if kind != 'avulsa' else clean(r['Categoria'])))
    fin_keys = {(norm(c['person']), c['due'], c['value']) for c in charges if c['paid_on'] is None}
    missing = [r for r in sheet(args.abertos) + sheet(args.atrasos) if (norm(r['Alunos']), br_date(r['Vencimento']), cents(r['Valor'])) not in fin_keys]
    if missing:
        raise SystemExit(f'{len(missing)} cobranças em aberto/atrasadas não estão no Financeiro: confira as planilhas.')

    by_person = defaultdict(list)
    for c in charges:
        by_person[norm(c['person'])].append(c)
    contract_of = {}
    for person, prs in by_person.items():
        sk = students.get(person)
        pk = sk or f'p:{person}'
        rows.append(['pay', [pk, prs[0]['person'], sk, 'dojoweb:' + pk]])
        if not sk:
            stats['pagadores_sem_aluno'] += 1
        monthly = [c for c in prs if c['kind'] == 'mensalidade']
        if not sk or not monthly:
            continue
        last = max(monthly, key=lambda c: c['due'])
        value = last['value']
        billing = 'mensal' if value > 0 else ('app_parceiro' if any((c['paid'] or 0) > 0 for c in monthly) else 'isento')
        starts = min(c['due'] for c in monthly).replace(day=1)
        contract_of[person] = (sk, last['due'].day, billing, value)
        stats['contratos_' + billing] += 1
        rows.append(['con', [sk, pk, billing, starts.isoformat(), END_OF_IMPORT.isoformat(), last['due'].day, value, 'dojoweb:' + pk]])

    import calendar
    import hashlib
    used_month = set()
    totals = defaultdict(int)
    for c in sorted(charges, key=lambda c: (c['due'], c['paid_on'] is None)):
        person = norm(c['person'])
        sk = students.get(person)
        if c['paid_on'] is not None and c['value'] == 0 and (c['paid'] or 0) == 0:
            stats['pagos_zerados_ignorados'] += 1
            continue
        pk = sk or f'p:{person}'
        competence = c['due'].replace(day=1) if c['kind'] == 'mensalidade' else None
        contract = contract_of.get(person) if c['kind'] == 'mensalidade' else None
        ck_contract = contract[0] if contract and (contract[0], competence) not in used_month else None
        if ck_contract:
            used_month.add((ck_contract, competence))
        paid = c['paid_on'] is not None
        amount = c['value'] if c['value'] > 0 else (c['paid'] or 0)
        ref = f"{pk}|{c['due']}|{c['kind']}|{amount}|{'pago' if paid else 'aberto'}"
        ck = hashlib.sha1(ref.encode()).hexdigest()[:16]
        totals['pago' if paid else 'aberto'] += (c['paid'] if paid else amount)
        rows.append(['chg', [ck, pk, ck_contract, c['kind'], c['desc'], iso(competence), c['due'].isoformat(), amount,
                             'paga' if paid else 'aberta', 'importado', 'dojoweb:' + ck, sk]])
        if paid:
            rows.append(['pmt', [ck, c['paid_on'].isoformat(), c['paid']]])
        stats['cobrancas_pagas' if paid else 'cobrancas_abertas'] += 1

    for person, (sk, due_day, billing, value) in contract_of.items():
        if billing != 'mensal' or (sk, dt.date(2026, 12, 1)) in used_month:
            continue
        due = dt.date(2026, 12, min(due_day, calendar.monthrange(2026, 12)[1]))
        rows.append(['chg', [f'dez2026:{sk}', sk, sk, 'mensalidade', None, '2026-12-01', due.isoformat(), value, 'aberta', 'contrato', None, sk]])
        stats['mensalidades_dezembro'] += 1

    import json
    import os
    os.makedirs(args.out_dir, exist_ok=True)
    with open(os.path.join(args.out_dir, '00-preparar.sql'), 'w') as f:
        f.write('-- Gerado por supabase/scripts/import_dojoweb.py\n'
                'create schema if not exists import_tmp;\n'
                'drop table if exists import_tmp.rows;\n'
                'create table import_tmp.rows (n bigserial primary key, kind text not null, data jsonb not null);\n'
                'revoke all on schema import_tmp from public, anon, authenticated;\n')
    chunk, size, part = [], 0, 1

    def flush():
        nonlocal chunk, size, part
        if not chunk:
            return
        payload = json.dumps(chunk, ensure_ascii=False, separators=(',', ':'))
        with open(os.path.join(args.out_dir, f'{part:02d}-dados.sql'), 'w') as f:
            f.write('-- Contém dados pessoais: não versionar.\n'
                    f"insert into import_tmp.rows (kind, data) select x ->> 0, x -> 1 from jsonb_array_elements($j${payload}$j$::jsonb) x;\n")
        chunk, size, part = [], 0, part + 1

    for r in rows:
        chunk.append(r)
        size += len(json.dumps(r, ensure_ascii=False))
        if size > args.chunk_kb * 1024:
            flush()
    flush()
    loader = LOADER.replace(':gym', f"'{G}'::uuid").replace(':by', f"'{BY}'::uuid").replace(':today', f"'{today.isoformat()}'::date")
    with open(os.path.join(args.out_dir, '99-gravar.sql'), 'w') as f:
        f.write(loader)
    for k in sorted(stats):
        log(f'{k:28} {stats[k]}')
    log(f"{'total_pago_reais':28} {totals['pago'] / 100:.2f}")
    log(f"{'total_em_aberto_reais':28} {totals['aberto'] / 100:.2f}")
    log(f"{'alunos_sem_contrato':28} {len(students) - len(contract_of)}")
    log(f"{'arquivos_de_dados':28} {part - 1}")


# Grava os dados da tabela de passagem nas tabelas de verdade. Ids: md5(academia|tipo|chave)::uuid.
LOADER = r"""-- Gerado por supabase/scripts/import_dojoweb.py: grava a importação numa transação e apaga a tabela de passagem.
begin;
create function pg_temp.kid(p_kind text, p_key text) returns uuid language sql immutable
as $$ select md5(:gym::text || '|' || p_kind || '|' || p_key)::uuid $$;
create temp view r as select kind, data from import_tmp.rows;

insert into public.modalities (id, gym_id, name, belt_system, color)
select pg_temp.kid('mod', d->>0), :gym, d->>1, d->>2, d->>3 from (select data d from r where kind = 'mod') x
on conflict (id) do update set name = excluded.name, belt_system = excluded.belt_system;

insert into public.class_groups (id, gym_id, modality_id, name, color)
select pg_temp.kid('grp', d->>0), :gym, pg_temp.kid('mod', d->>2), d->>1, d->>3 from (select data d from r where kind = 'grp') x
on conflict (id) do update set name = excluded.name, modality_id = excluded.modality_id;

insert into public.students (id, gym_id, name, phone, birth_date, track, started_on)
select pg_temp.kid('stu', d->>0), :gym, d->>1, d->>2, (d->>3)::date, d->>4, :today from (select data d from r where kind = 'stu') x
on conflict (id) do update set name = excluded.name, phone = excluded.phone,
  birth_date = coalesce(excluded.birth_date, students.birth_date), track = excluded.track;

insert into public.student_details (student_id, gym_id, cpf, rg, email, phone_home, cep, street, number, complement, district, city, state, external_ref)
select pg_temp.kid('stu', d->>0), :gym, d->>1, d->>2, d->>3, d->>4, d->>5, d->>6, d->>7, d->>8, d->>9, d->>10, d->>11, d->>12
from (select data d from r where kind = 'det') x
on conflict (student_id) do update set cpf = excluded.cpf, rg = excluded.rg, email = excluded.email, phone_home = excluded.phone_home,
  cep = excluded.cep, street = excluded.street, number = excluded.number, complement = excluded.complement,
  district = excluded.district, city = excluded.city, state = excluded.state;

insert into public.class_group_members (group_id, student_id, gym_id, joined_on)
select pg_temp.kid('grp', d->>1), pg_temp.kid('stu', d->>0), :gym, :today from (select data d from r where kind = 'mem') x
on conflict do nothing;

insert into public.student_graduations (student_id, rank_id, graduated_at, notes, recorded_by)
select pg_temp.kid('stu', d->>0), k.id, :today, 'Importado do DojoWeb (data da graduação não informada)', :by
from (select data d from r where kind = 'grd') x join public.ranks k on k.track = d->>1 and k.name = d->>2
on conflict (student_id, rank_id) do nothing;

insert into public.student_belts (student_id, belt_rank_id, degrees, graduated_at, date_unknown, notes, recorded_by)
select pg_temp.kid('stu', d->>0), b.id, (d->>3)::smallint, :today, true, 'Importado do DojoWeb (data da graduação não informada)', :by
from (select data d from r where kind = 'blt') x
join public.belt_ranks b on b.belt_system = 'jiu_jitsu' and b.track = d->>1 and lower(b.name) = d->>2
on conflict do nothing;

insert into public.payers (id, gym_id, name, student_id, external_ref)
select pg_temp.kid('pay', d->>0), :gym, d->>1, case when d->>2 is null then null else pg_temp.kid('stu', d->>2) end, d->>3
from (select data d from r where kind = 'pay') x
on conflict (id) do update set name = excluded.name;
update public.payers p set cpf = coalesce(p.cpf, sd.cpf), email = coalesce(p.email, sd.email), phone = coalesce(p.phone, s.phone)
from public.students s left join public.student_details sd on sd.student_id = s.id
where p.gym_id = :gym and p.student_id = s.id and p.external_ref like 'dojoweb:%';

insert into public.contracts (id, gym_id, payer_id, billing, starts_on, ends_on, due_day, amount_cents, review_needed, source, external_ref, notes, created_by)
select pg_temp.kid('con', d->>0), :gym, pg_temp.kid('pay', d->>1), d->>2, (d->>3)::date, (d->>4)::date, (d->>5)::smallint, (d->>6)::int,
  true, 'importado', d->>7, 'Importado do DojoWeb: confira o plano, a vigência e o responsável.', :by
from (select data d from r where kind = 'con') x
on conflict (id) do update set billing = excluded.billing, due_day = excluded.due_day, amount_cents = excluded.amount_cents;
insert into public.contract_students (contract_id, student_id)
select pg_temp.kid('con', d->>0), pg_temp.kid('stu', d->>0) from (select data d from r where kind = 'con') x on conflict do nothing;

insert into public.charges (id, gym_id, contract_id, payer_id, kind, description, competence, due_on, amount_cents, status, source, external_ref, created_by)
select pg_temp.kid('chg', d->>0), :gym, case when d->>2 is null then null else pg_temp.kid('con', d->>2) end, pg_temp.kid('pay', d->>1),
  d->>3, d->>4, (d->>5)::date, (d->>6)::date, (d->>7)::int, d->>8, d->>9, d->>10, :by
from (select data d from r where kind = 'chg') x
on conflict (id) do nothing;
insert into public.charge_students (charge_id, student_id)
select pg_temp.kid('chg', d->>0), pg_temp.kid('stu', d->>11) from (select data d from r where kind = 'chg') x where d->>11 is not null
on conflict do nothing;

insert into public.payments (id, charge_id, gym_id, paid_on, amount_cents, method, notes, received_by, source, external_ref)
select pg_temp.kid('pmt', d->>0), pg_temp.kid('chg', d->>0), :gym, (d->>1)::date, (d->>2)::int, 'outro',
  'Forma de pagamento não informada (DojoWeb)', :by, 'importado', 'dojoweb:' || (d->>0)
from (select data d from r where kind = 'pmt') x
on conflict do nothing;

-- Conferência: tudo que veio na tabela de passagem tem de estar nas tabelas.
do $$
declare v_missing int;
begin
  select count(*) into v_missing from import_tmp.rows t
  where (t.kind = 'stu' and not exists (select 1 from public.students s where s.id = pg_temp.kid('stu', t.data->>0)))
     or (t.kind = 'chg' and not exists (select 1 from public.charges c where c.id = pg_temp.kid('chg', t.data->>0)))
     or (t.kind = 'grd' and not exists (select 1 from public.student_graduations g where g.student_id = pg_temp.kid('stu', t.data->>0)))
     or (t.kind = 'blt' and not exists (select 1 from public.student_belts b where b.student_id = pg_temp.kid('stu', t.data->>0)));
  if v_missing > 0 then
    raise exception 'Importação incompleta: % registros não gravados', v_missing;
  end if;
end $$;

drop view r;
drop table import_tmp.rows;
drop schema import_tmp;
commit;
"""


if __name__ == '__main__':
    main()
