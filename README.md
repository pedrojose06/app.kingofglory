# King of Glory — Presença

PWA do professor para a rotina de aula da equipe King of Glory: academias, alunos, plano de aula, chamada,
presença avulsa, foto do treino e controle de graduação (kruang/prajied).

- **App**: Next.js (App Router) + TypeScript + Tailwind v4, instalável e com funcionamento offline (Serwist).
- **Backend**: Supabase (Postgres, Auth, Storage, RLS). Projeto `kingofglory-app` (`evxxnnbkkewlaeisfuyp`, sa-east-1).
- **Domínio final**: `app.kingofglory.com.br` (não usar `interno.kingofglory.com.br`, que é outro sistema).

## Estrutura

```
apps/web          Next.js PWA (só telas e integração com o browser)
apps/mobile       reservado para o app Expo (Fase 5)
packages/core     tipos do banco, schemas Zod, regras de negócio, cliente e queries do Supabase, fila offline
packages/ui       tokens de design (tema claro/escuro) e componentes compartilháveis
supabase/         migrations versionadas e seed de desenvolvimento
```

Toda leitura/escrita de dados passa por `@kog/core`, que não depende de React DOM nem de APIs do browser.
O web só injeta o que é específico da plataforma (localStorage para a sessão, IndexedDB para a fila).

## Setup local

Requisitos: Node 22+, pnpm 10+.

```bash
pnpm install
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
pnpm dev
```

O app sobe em http://localhost:3000. O service worker fica desligado em desenvolvimento; para testar
instalação e offline use o build de produção:

```bash
pnpm build && pnpm --filter @kog/web start
```

Outros comandos: `pnpm typecheck`, `pnpm test` (Vitest no `core`).

### Variáveis de ambiente (`apps/web/.env.local`)

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://evxxnnbkkewlaeisfuyp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave *publishable* (`sb_publishable_…`) em Supabase › Project Settings › API Keys |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | chave pública VAPID do Web Push (ver "Lembrete de chamada") |

A chave publishable é pública por definição (a segurança vem da RLS). **Nunca** use a `service_role` no app.

## Banco de dados

As migrations em `supabase/migrations` já estão aplicadas no projeto remoto, com os mesmos números de versão.

| Migration | Conteúdo |
|---|---|
| `core` | perfis, academias, professores por academia, alunos, graus (11 graus já cadastrados) e graduações |
| `classes` | grade semanal, aulas, planos e templates; `ensure_classes()` gera as aulas da grade |
| `attendance` | presenças, presença avulsa, RPCs idempotentes e a view `student_progress` |
| `photos` | `class_photos` + bucket privado `class-photos` com policies por academia |
| `harden_functions` | nenhuma função é chamável sem login |
| `opening_balance` | saldo inicial por aluno (`opening_present`, `opening_absent`, `opening_until`), somado em `student_progress` |
| `attendance_reminders` | lembrete de chamada por push: `attendance_reminders`, `push_subscriptions` e o job do `pg_cron` |
| `attendance_insights` | limite de faltas seguidas por professor (`profiles.absence_alert_threshold`) e as views `student_absence_streaks` e `class_turnout` usadas em Pendências |
| `kids_ranks` | graduação infantil: `ranks.track` e `students.track` (adulto/infantil) e os graus Branco, Amarelo, Laranja e Verde |
| `kids_rank_age` | `ranks.min_age`: graduação infantil por idade que o aluno completa no ano (11 Branco, 12 Amarelo, 13 Laranja, 14 Verde) |
| `lesson_plan_reminders` | lembrete do plano de aula por push: `lesson_plan_reminders` (um horário por professor, padrão 13:30) e `claim_lesson_plan_reminders()`; o job do cron passa a acordar a Edge Function também para ele |
| `student_portal` | área do aluno: `student_access` (link secreto por aluno), `rotate_student_access()` e `student_portal(token)`, chamável sem login |
| `…future_face_recognition.sql.disabled` | schema previsto da Fase 4 (pgvector), não aplicado |

Para criar uma migration nova e aplicar (com a CLI do Supabase):

```bash
supabase link --project-ref evxxnnbkkewlaeisfuyp
```

```bash
supabase migration new nome_da_mudanca
```

```bash
supabase db push
```

```bash
pnpm db:types
```

`pnpm db:types` regenera `packages/core/src/database.types.ts`. Para um banco local com dados de exemplo:
`supabase start` e `supabase db reset` (aplica as migrations e o `supabase/seed.sql`; login
`professor@example.com` / `senha123`).

### Regras que o banco garante

- **Presenças não são apagadas**: não existe policy de `delete` em `attendance`, `students` e `classes`, e as
  chaves estrangeiras são `RESTRICT`. Aluno é inativado; aula é cancelada.
- **RLS**: o professor só enxerga academias em que está em `gym_instructors` e os dados ligados a elas.
  Presença avulsa é visível a quem marcou e ao aluno dono do registro.
- **Graduação**: o aluno começa sem graduação; a primeira pode ser Branco ou direto Vermelho e Branco (dá
  para pular graus). Cada grau exige uma quantidade de treinos desde a graduação anterior (ou desde o início
  do aluno) e um intervalo mínimo em meses; nos graus com * basta uma % da quantidade (Mais › Graus). O
  contador zera a cada graduação; o total do aluno nunca zera. Presença e atraso contam; falta não.
  Na primeira graduação, quem está apto ao Branco e tem 5+ meses pode pular direto para Vermelho e Branco
  (decisão do professor; o app só sinaliza). O saldo importado (sem datas) só conta para o próximo grau se a última graduação for anterior ao período dele.

## Como funciona o offline

- **Leitura**: cache do TanStack Query persistido em IndexedDB; as telas abrem com os últimos dados vistos.
- **Escrita**: presença, presença avulsa, conclusão de chamada, plano de aula e foto vão para uma fila em
  IndexedDB e são enviadas quando há conexão. Todas as operações são idempotentes no servidor, e em conflito
  de presença vence a marcação mais recente.
- O selo no topo das telas mostra quantas alterações estão pendentes; Mais › Sincronização lista cada uma.
- Cadastros (academias, alunos, graus) e importação exigem conexão.

## Faltas e padrões de frequência (Pendências)

- **Faltas seguidas**: lista os alunos ativos que passaram do limite de faltas seguidas desde a última presença
  (presença avulsa conta como presença; falta justificada não conta nem zera). Cada professor ajusta o próprio
  limite em Pendências › Ajustar (padrão 5: avisa a partir da 6ª falta).
- **Padrões**: compara a média de alunos por aula no início, meio e fim do mês, entre os dias da semana da grade e
  nas últimas 8 semanas contra as 8 anteriores, por academia. Só vira aviso a diferença de pelo menos 10% que
  passa no teste t de Welch: "Padrão" com t ≥ 2, "Sinal leve" com t ≥ 1,3. Dias com poucas aulas (extras fora da
  grade) e academias com menos de 12 aulas concluídas ficam de fora. A lógica está em
  `packages/core/src/domain/insights.ts`.

## Plano de aula antecipado

A tela Hoje lista as **próximas aulas** (7 dias, a partir de amanhã) com o selo "Plano feito" ou "Sem plano".
Tocar abre a aba Plano; se a aula da grade ainda não foi gerada, ela é criada naquele momento (exige conexão) e,
no dia, `ensure_classes` encontra a aula já criada. A chamada de uma aula futura só abre no dia. Encerrar um
horário da grade cancela as aulas futuras dele que já tinham sido criadas.

## Lembretes de chamada e plano de aula (push)

Mais › Lembretes de chamada e plano de aula. O professor ativa as notificações no aparelho e escolhe **um horário para todas
as turmas do dia** ou **um horário por turma**. No horário, se a chamada de uma aula de hoje ainda estiver em
aberto, chega uma notificação; aula concluída ou cancelada não avisa. No iPhone o push só funciona com o app
instalado na Tela de Início (iOS 16.4+).

**Plano de aula**: na mesma tela, o professor liga o lembrete do plano e escolhe até que horário o plano deve
estar feito e enviado (padrão **13:30**). Nesse horário, se alguma aula de hoje dele (da grade ou extra, não
cancelada) ainda não tiver plano com texto salvo no servidor, chega uma notificação; tocar nela abre a aba Plano da
aula. Plano escrito offline e ainda na fila de sincronização conta como não enviado.

Como funciona: o `pg_cron` roda `dispatch_attendance_reminders()` a cada minuto; havendo lembrete vencido, ele
chama a Edge Function `push-reminders` (via `pg_net`), que busca o que enviar em `claim_attendance_reminders()` e
`claim_lesson_plan_reminders()`
e manda o Web Push. Cada lembrete dispara no máximo uma vez por dia, com até 2h de tolerância se o cron atrasar.
Os horários são de São Paulo.

Configuração (uma vez por projeto):

1. Gerar o par de chaves VAPID:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Segredos da Edge Function e deploy:

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
   ```

   ```bash
   supabase functions deploy push-reminders --no-verify-jwt
   ```

3. No SQL Editor, guardar no Vault a URL da função e um segredo aleatório para o cron (gerado no próprio banco;
   a função o confere por `cron_secret_matches()`, então ele não precisa ser copiado para lugar nenhum):

   ```sql
   select vault.create_secret('https://evxxnnbkkewlaeisfuyp.supabase.co/functions/v1/push-reminders', 'push_reminders_url');
   select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'push_reminders_secret');
   ```

4. Na Vercel, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` com a chave pública (Production e Preview) e um novo deploy.

A chave privada VAPID nunca entra no repositório nem no app.

## Área do aluno

Na tela do aluno, card **Área do aluno** › Gerar link. O professor envia pelo WhatsApp (ou copia) um link
`/minhas-presencas#<token>`; o aluno abre no celular, sem conta nem senha, e vê: treinos no total e no mês,
frequência, faltas, grau atual e progresso para o próximo, graduações, treinos por mês e o histórico.
Telefone e observações do professor não aparecem.

- O token (122 bits aleatórios) vai no `#`, que não chega ao servidor nem aos logs. Quem tem o link vê os dados.
- **Gerar novo link** invalida o anterior; **Desativar** apaga o acesso. O card mostra quando o aluno abriu pela última vez.
- O aparelho guarda o link: com o app instalado na Tela de Início, ele abre direto nas presenças do aluno.
  Os dados ficam em cache e abrem offline.

## Importação do InClass

Mais › Importar presenças. O arquivo é lido no browser, o app mostra um preview (alunos e aulas que serão
criados, total de registros) e só grava depois da confirmação, com `source = import`. Repetir a importação
não duplica nada.

O formato real do export do InClass ainda não é conhecido. Hoje o parser aceita CSV em dois layouts
(uma linha por presença, ou uma linha por aluno com uma coluna por data). Para adaptar ao arquivo real,
altere apenas `parseAttendanceExport` em `packages/core/src/domain/import.ts`.

## Deploy (Vercel)

1. **Criar o projeto**: vercel.com › time `pedrojose06s-projects` › Add New › Project › importar
   `pedrojose06/app.kingofglory`.
   - Root Directory: `apps/web`
   - Framework: Next.js (os comandos de build e install são detectados pelo `package.json`)
2. **Variáveis** (Production e Preview): `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   com os valores da tabela acima.
3. **Deploy** e teste na URL `*.vercel.app`.
4. **Domínio**: Project › Settings › Domains › adicionar `app.kingofglory.com.br`.
5. **DNS no cPanel** (Zone Editor de `kingofglory.com.br`) › Add Record:

   | Tipo | Nome | Valor | TTL |
   |---|---|---|---|
   | CNAME | `app` | `cname.vercel-dns.com.` | 14400 |

   A Vercel pode mostrar um valor específico do projeto na tela de domínios (algo como
   `xxxx.vercel-dns-017.com`); se mostrar, use o que estiver lá. O certificado HTTPS é emitido sozinho
   alguns minutos depois de o DNS propagar.
6. **Supabase › Authentication › URL Configuration**: Site URL `https://app.kingofglory.com.br` e a mesma URL
   em Redirect URLs, mais `https://app.kingofglory.com.br/login-professor` (necessário para o link de "esqueci a senha").
7. **Criar sua conta** no app e depois, em Supabase › Authentication › Sign In / Providers, desligar
   "Allow new users to sign up". Enquanto estiver ligado, qualquer pessoa com o link consegue criar uma conta
   de professor (ela não vê seus dados, mas poderia editar os requisitos dos graus).
8. **Instalar no celular**: abrir `https://app.kingofglory.com.br` e usar "Adicionar à tela de início".

## Fases seguintes

- **Fase 2**: convites de professores (`gym_instructors` já suporta), relatórios, templates (`lesson_templates`).
- **Fase 3**: app do aluno (`students.profile_id`, policies de leitura das próprias presenças já existem).
- **Fase 4**: reconhecimento facial via Edge Function (schema em `…future_face_recognition.sql.disabled`).
- **Fase 5**: `apps/mobile` com Expo reaproveitando `@kog/core`.
