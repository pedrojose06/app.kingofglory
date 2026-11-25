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
        --out /caminho/fora/do/repo/import.sql

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
    for a in ('gym', 'recorded-by', 'today', 'alunos', 'pagos', 'financeiro', 'abertos', 'atrasos', 'out'):
        ap.add_argument('--' + a, required=True)
    args = ap.parse_args()
    G, BY = args.gym, getattr(args, 'recorded_by')
    today = dt.date.fromisoformat(args.today)
    log = lambda *a: print(*a, file=sys.stderr)  # noqa: E731
    sql: list[str] = ['-- Gerado por supabase/scripts/import_dojoweb.py. Contém dados pessoais: não versionar.', 'begin;']

    # modalidades e turmas
    for key, (name, system, color) in MODALITIES.items():
        sql.append(f"insert into public.modalities (id, gym_id, name, belt_system, color) values ({q(uid(G, 'mod', key))}, {q(G)}, {q(name)}, {q(system)}, {q(color)}) "
                   "on conflict (id) do update set name = excluded.name, belt_system = excluded.belt_system;")
    for key, (name, mod, color) in GROUPS.items():
        sql.append(f"insert into public.class_groups (id, gym_id, modality_id, name, color) values ({q(uid(G, 'grp', key))}, {q(G)}, {q(uid(G, 'mod', mod))}, {q(name)}, {q(color)}) "
                   "on conflict (id) do update set name = excluded.name, modality_id = excluded.modality_id;")

    # alunos
    students = {}  # nome normalizado → id
    stats = defaultdict(int)
    for r in sheet(args.alunos):
        name = clean(r['Nome'])
        cpf = re.sub(r'\D', '', str(r.get('CPF') or ''))
        cpf = cpf if cpf_ok(cpf) else None
        ref = f'dojoweb:cpf:{cpf}' if cpf else f'dojoweb:nome:{norm(name)}'
        sid = uid(G, 'student', ref)
        students[norm(name)] = sid
        birth = br_date(r.get('Nascimento'))
        if birth and not (dt.date(1900, 1, 1) <= birth <= today):
            stats['nascimento_invalido_em_branco'] += 1  # ex.: data no futuro (erro de digitação no DojoWeb)
            birth = None
        groups = parse_groups(r.get('Grade de Aulas'))
        grads = parse_grads(r.get('Graduações'))
        juvenile = 'muaythai juvenil' in grads and 'muaythai' not in grads
        track = 'infantil' if juvenile else 'adulto'
        stats['alunos'] += 1
        stats['menores'] += bool(birth and (today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))) < 18)
        sql.append(
            f"insert into public.students (id, gym_id, name, phone, birth_date, track, started_on) values ({q(sid)}, {q(G)}, {q(name)}, {q(phone(r.get('Telefone')))}, "
            f"{q(birth and birth.isoformat())}, {q(track)}, {q(today.isoformat())}) "
            "on conflict (id) do update set name = excluded.name, phone = excluded.phone, birth_date = coalesce(excluded.birth_date, students.birth_date), track = excluded.track;")
        num = r.get('Número')
        num = str(int(num)) if isinstance(num, float) else clean(num)
        cep = re.sub(r'\D', '', str(r.get('CEP') or ''))
        state = clean(r.get('Estado'))
        email = (clean(r.get('Email')) or '').lower() or None
        sql.append(
            "insert into public.student_details (student_id, gym_id, cpf, rg, email, phone_home, cep, street, number, complement, district, city, state, external_ref) values ("
            f"{q(sid)}, {q(G)}, {q(cpf)}, {q(clean(r.get('RG')))}, {q(email)}, {q(phone(r.get('Telefone Residencial')))}, {q(cep if len(cep) == 8 else None)}, "
            f"{q(clean(r.get('Endereço')))}, {q(num)}, {q(clean(r.get('Complemento')))}, {q(clean(r.get('Bairro')))}, {q(clean(r.get('Cidade')))}, "
            f"{q(STATES.get(norm(state), state))}, {q(ref)}) on conflict (student_id) do update set cpf = excluded.cpf, rg = excluded.rg, email = excluded.email, "
            "phone_home = excluded.phone_home, cep = excluded.cep, street = excluded.street, number = excluded.number, complement = excluded.complement, "
            "district = excluded.district, city = excluded.city, state = excluded.state;")
        for g in groups:
            sql.append(f"insert into public.class_group_members (group_id, student_id, gym_id, joined_on) values ({q(uid(G, 'grp', g))}, {q(sid)}, {q(G)}, {q(today.isoformat())}) on conflict do nothing;")
        # graduações (data não informada no DojoWeb)
        note = 'Importado do DojoWeb (data da graduação não informada)'
        mt_name, mt_track = (MT_ADULT.get(grads['muaythai']), 'adulto') if 'muaythai' in grads else \
            (MT_KIDS.get(grads['muaythai juvenil']), 'infantil') if 'muaythai juvenil' in grads else (None, None)
        if ('muaythai' in grads or 'muaythai juvenil' in grads) and not mt_name:
            raise SystemExit(f'Faixa de muay thai desconhecida: {grads}')
        if mt_name:
            stats['graduacoes_mt'] += 1
            sql.append("insert into public.student_graduations (student_id, rank_id, graduated_at, notes, recorded_by) "
                       f"select {q(sid)}, id, {q(today.isoformat())}, {q(note)}, {q(BY)} from public.ranks where track = {q(mt_track)} and name = {q(mt_name)} "
                       "on conflict (student_id, rank_id) do nothing;")
        jj = grads.get('jiu jitsu') or grads.get('jiu jitsu kids')
        if jj:
            jj_track = 'adulto' if 'jiu jitsu' in grads else 'infantil'
            m = re.match(r'^(.*?)(?:\s+(\d+)\s+graus?)?$', jj)
            belt, degrees = m.group(1).strip(), int(m.group(2) or 0)
            stats['faixas_jj'] += 1
            sql.append("insert into public.student_belts (student_id, belt_rank_id, degrees, graduated_at, date_unknown, notes, recorded_by) "
                       f"select {q(sid)}, id, {degrees}, {q(today.isoformat())}, true, {q(note)}, {q(BY)} from public.belt_ranks "
                       f"where belt_system = 'jiu_jitsu' and track = {q(jj_track)} and lower(name) = {q(belt)} on conflict do nothing;")

    # cobranças das planilhas
    charges = []  # (pessoa, vencimento, valor_cents, pago_em, pago_cents, kind, description)
    for r in sheet(args.pagos):
        valor, total = cents(r['Valor']), cents(r['Total'])
        charges.append(dict(person=clean(r['Alunos']), due=br_date(r['Vencimento']), value=valor, paid_on=br_date(r['Pagamento']), paid=total, kind='mensalidade', desc=None))
    for r in sheet(args.financeiro):
        cat = norm(r['Categoria'])
        kind = {'mensalidade': 'mensalidade', 'matricula': 'matricula'}.get(cat, 'avulsa')
        charges.append(dict(person=clean(r['Pessoa']), due=br_date(r['Vencimento']), value=cents(r['Receber']), paid_on=None, paid=None,
                            kind=kind, desc=None if kind != 'avulsa' else clean(r['Categoria'])))
    # conferência: o Financeiro = atrasos + em aberto do mês (+ dívida antiga)
    open_rows = sheet(args.abertos) + sheet(args.atrasos)
    fin_keys = {(norm(c['person']), c['due'], c['value']) for c in charges if c['paid_on'] is None}
    missing = [r for r in open_rows if (norm(r['Alunos']), br_date(r['Vencimento']), cents(r['Valor'])) not in fin_keys]
    if missing:
        raise SystemExit(f'{len(missing)} cobranças em aberto/atrasadas não estão no Financeiro: confira as planilhas.')

    # pagadores e contratos
    by_person = defaultdict(list)
    for c in charges:
        by_person[norm(c['person'])].append(c)
    contract_of = {}
    for person, rows in by_person.items():
        sid = students.get(person)
        pid = uid(G, 'payer', sid or person)
        pname = rows[0]['person']
        sql.append(f"insert into public.payers (id, gym_id, name, student_id, external_ref) values ({q(pid)}, {q(G)}, {q(pname)}, {q(sid)}, {q('dojoweb:' + person)}) "
                   "on conflict (id) do update set name = excluded.name;")
        if sid:
            sql.append(f"update public.payers p set cpf = d.cpf, email = d.email from public.student_details d where p.id = {q(pid)} and d.student_id = {q(sid)} and p.cpf is null;")
            sql.append(f"update public.payers p set phone = s.phone from public.students s where p.id = {q(pid)} and s.id = {q(sid)} and p.phone is null;")
        else:
            stats['pagadores_sem_aluno'] += 1
        monthly = [c for c in rows if c['kind'] == 'mensalidade']
        if not sid or not monthly:
            continue
        last = max(monthly, key=lambda c: c['due'])
        value = last['value']
        billing = 'mensal' if value > 0 else ('app_parceiro' if any((c['paid'] or 0) > 0 for c in monthly) else 'isento')
        starts = min(c['due'] for c in monthly).replace(day=1)
        cid = uid(G, 'contract', sid)
        contract_of[person] = (cid, last['due'].day, billing, value)
        stats['contratos_' + billing] += 1
        sql.append(
            "insert into public.contracts (id, gym_id, payer_id, billing, starts_on, ends_on, due_day, amount_cents, review_needed, source, external_ref, notes, created_by) values ("
            f"{q(cid)}, {q(G)}, {q(pid)}, {q(billing)}, {q(starts.isoformat())}, {q(END_OF_IMPORT.isoformat())}, {last['due'].day}, {value}, true, 'importado', "
            f"{q('dojoweb:' + person)}, 'Importado do DojoWeb: confira o plano, a vigência e o responsável.', {q(BY)}) "
            "on conflict (id) do update set billing = excluded.billing, due_day = excluded.due_day, amount_cents = excluded.amount_cents;")
        sql.append(f"insert into public.contract_students (contract_id, student_id) values ({q(cid)}, {q(sid)}) on conflict do nothing;")

    # cobranças e pagamentos
    used_month = set()
    totals = defaultdict(int)
    for c in sorted(charges, key=lambda c: (c['due'], c['paid_on'] is None)):
        person = norm(c['person'])
        sid = students.get(person)
        if c['paid_on'] is not None and c['value'] == 0 and (c['paid'] or 0) == 0:
            stats['pagos_zerados_ignorados'] += 1
            continue
        pid = uid(G, 'payer', sid or person)
        competence = c['due'].replace(day=1) if c['kind'] == 'mensalidade' else None
        contract = contract_of.get(person)
        cid = contract[0] if contract and c['kind'] == 'mensalidade' else None
        if cid and (cid, competence) in used_month:
            cid = None  # segunda cobrança do mesmo mês: fica avulsa ao contrato
        if cid:
            used_month.add((cid, competence))
        paid = c['paid_on'] is not None
        amount = c['value'] if c['value'] > 0 else (c['paid'] or 0)
        key = f"{person}|{c['due']}|{c['kind']}|{amount}|{'pago' if paid else 'aberto'}"
        chid = uid(G, 'charge', key)
        totals['pago' if paid else 'aberto'] += (c['paid'] if paid else amount)
        sql.append(
            "insert into public.charges (id, gym_id, contract_id, payer_id, kind, description, competence, due_on, amount_cents, status, source, external_ref, created_by) values ("
            f"{q(chid)}, {q(G)}, {q(cid)}, {q(pid)}, {q(c['kind'])}, {q(c['desc'])}, {q(competence and competence.isoformat())}, {q(c['due'].isoformat())}, {amount}, "
            f"{q('paga' if paid else 'aberta')}, 'importado', {q('dojoweb:' + key)}, {q(BY)}) on conflict (id) do nothing;")
        if sid:
            sql.append(f"insert into public.charge_students (charge_id, student_id) values ({q(chid)}, {q(sid)}) on conflict do nothing;")
        if paid:
            sql.append(
                "insert into public.payments (id, charge_id, gym_id, paid_on, amount_cents, method, notes, received_by, source, external_ref) values ("
                f"{q(uid(G, 'payment', key))}, {q(chid)}, {q(G)}, {q(c['paid_on'].isoformat())}, {c['paid']}, 'outro', 'Forma de pagamento não informada (DojoWeb)', "
                f"{q(BY)}, 'importado', {q('dojoweb:' + key)}) on conflict do nothing;")
        stats['cobrancas_pagas' if paid else 'cobrancas_abertas'] += 1

    # mensalidade de dezembro/2026 dos contratos mensais (se ainda não existe)
    import calendar
    for person, (cid, due_day, billing, value) in contract_of.items():
        if billing != 'mensal' or (cid, dt.date(2026, 12, 1)) in used_month:
            continue
        due = dt.date(2026, 12, min(due_day, calendar.monthrange(2026, 12)[1]))
        sid = students[person]
        chid = uid(G, 'charge', f'{person}|2026-12|gerada')
        sql.append(
            "insert into public.charges (id, gym_id, contract_id, payer_id, kind, competence, due_on, amount_cents, source, created_by) values ("
            f"{q(chid)}, {q(G)}, {q(cid)}, {q(uid(G, 'payer', sid))}, 'mensalidade', '2026-12-01', {q(due.isoformat())}, {value}, 'contrato', {q(BY)}) on conflict do nothing;")
        sql.append(f"insert into public.charge_students (charge_id, student_id) values ({q(chid)}, {q(sid)}) on conflict do nothing;")
        stats['mensalidades_dezembro'] += 1

    sql.append('commit;')
    with open(args.out, 'w') as f:
        f.write('\n'.join(sql) + '\n')
    for k in sorted(stats):
        log(f'{k:28} {stats[k]}')
    log(f"{'total_pago_reais':28} {totals['pago'] / 100:.2f}")
    log(f"{'total_em_aberto_reais':28} {totals['aberto'] / 100:.2f}")
    log(f"{'alunos_sem_contrato':28} {len(students) - len(contract_of)}")


if __name__ == '__main__':
    main()
