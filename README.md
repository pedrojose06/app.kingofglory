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
- **Graduação**: contam presença e atraso; falta (justificada ou não) não conta. Cada grau tem intervalo mínimo
  em meses, quantidade de aulas de referência e porcentagem mínima (editáveis em Mais › Graus).

## Como funciona o offline

- **Leitura**: cache do TanStack Query persistido em IndexedDB; as telas abrem com os últimos dados vistos.
- **Escrita**: presença, presença avulsa, conclusão de chamada, plano de aula e foto vão para uma fila em
  IndexedDB e são enviadas quando há conexão. Todas as operações são idempotentes no servidor, e em conflito
  de presença vence a marcação mais recente.
- O selo no topo das telas mostra quantas alterações estão pendentes; Mais › Sincronização lista cada uma.
- Cadastros (academias, alunos, graus) e importação exigem conexão.

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
   em Redirect URLs (necessário para o link de "esqueci a senha").
7. **Criar sua conta** no app e depois, em Supabase › Authentication › Sign In / Providers, desligar
   "Allow new users to sign up". Enquanto estiver ligado, qualquer pessoa com o link consegue criar uma conta
   de professor (ela não vê seus dados, mas poderia editar os requisitos dos graus).
8. **Instalar no celular**: abrir `https://app.kingofglory.com.br` e usar "Adicionar à tela de início".

## Fases seguintes

- **Fase 2**: convites de professores (`gym_instructors` já suporta), relatórios, templates (`lesson_templates`).
- **Fase 3**: app do aluno (`students.profile_id`, policies de leitura das próprias presenças já existem).
- **Fase 4**: reconhecimento facial via Edge Function (schema em `…future_face_recognition.sql.disabled`).
- **Fase 5**: `apps/mobile` com Expo reaproveitando `@kog/core`.
