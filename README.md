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
| `student_signup_requests` | cadastro do aluno sem link: `signup_directory()` (sem login), pedido criado no cadastro (`handle_new_user` lê `student_gym_id`) ou por `request_student_access`, e `list_student_requests`/`approve_student_request`/`reject_student_request` para o professor |
| `instructor_invites` | convite de professor: conta nova começa sem acesso (`profiles.role` padrão `student`); `create_instructor_invite`, `instructor_invite_info(token)` (sem login) e `accept_instructor_invite(token)` |
| `student_accounts` | link com validade (`student_access.expires_at`, padrão 24 h), conta do aluno (`claim_student_account`, `my_student_account`, `my_student_portal`) e aceite LGPD do aluno (`students.account_consent_at`, `accept_image_consent`) |
| `attendance_credits` | `attendance.credits`: quanto a presença vale (aulão = 2), somado em `student_progress`; `register_walk_ins()` registra avulsa com valor |
| `next_graduation` | `gyms.next_graduation_on`: data marcada da próxima graduação; o app conta os meses de cada aluno até ela |
| `graduation_schedule` | data da próxima graduação da equipe por trilha (adulto e infantil), igual para todas as academias; substitui `gyms.next_graduation_on` |
| `lesson_plan_share` | compartilhar o plano de aula: `lesson_plan_shares` (link secreto por aula + revisão do mestre), `rotate_lesson_plan_share()`, `shared_lesson_plan(token)` e `review_shared_lesson_plan(token, …)`, chamáveis sem login |
| `plan_review_push` | push para o professor quando o mestre revisa o plano: `lesson_plan_shares.review_notify_pending`, `claim_plan_review_notifications()` e `wake_push_reminders()` (acorda a Edge Function na hora) |
| `face_recognition` | Fase 4: `face_embeddings` (pgvector 128, só referências numéricas), `face_detections` (decisão do professor por rosto), trigger de consentimento, apagamento ao retirar o consentimento, `save_face_decisions`, `face_references` e `profiles.face_auto_approve_min` (desligado) |
| `face_signup_reference` | foto do cadastro do aluno como primeira referência: `face_embeddings.source` (`class_photo`/`signup_photo`, uma do cadastro por aluno, fora da poda), `face_signup_photos(gym)` e `add_signup_face_reference` |
| `guardian_consents` | termo do responsável do aluno menor: `is_minor(nascimento, hoje)`, data de nascimento validada (não futura, não pode ser apagada), `student_guardian_consents` (`pendente`/`enviado`), bucket privado `guardian-consents`, `set_guardian_consent_file` e uso de imagem de menor só com o termo enviado |
| `guardian_consent_review` | termo enviado pelo próprio aluno menor (`submit_guardian_consent_file`, status `em_analise`) e conferência do professor (`review_guardian_consent`: aprova informando se o responsável autorizou a imagem, ou recusa com motivo); `my_student_account` traz nascimento, `minor` e o termo; `accept_image_consent` não libera a imagem do menor sozinho |
| `signup_photo_without_confirmation` | foto de rosto do cadastro salva já no cadastro, antes de confirmar o e-mail: código secreto de uso único no signUp (`photo_upload_token`), envio sem login para `{profile_id}/signup-{código}.jpg` por até 24 h e `set_pending_signup_photo` |
| `schedule_start_date` | `set_schedule_start`: corrigir a data de início de um horário da grade (aulas vazias antes da nova data são removidas) |
| `signup_image_consent` | autorização de uso de imagem no cadastro sem link (`student_signup_requests.image_consent_at`), levada ao aluno na aprovação (maior de idade) |
| `signup_guardian_term` | termo do responsável anexado já no cadastro do aluno menor (`student_signup_requests.guardian_file_path`, também sem login pelo código do cadastro); aprovado o aluno, vira "Termo para conferir"; policies do Storage pelo registro do termo |
| `guardian_esign` | termo do responsável assinado no próprio app: link secreto `/termo#código` (`create_guardian_sign_link`, 30 dias), página sem login (`guardian_sign_info`, `sign_guardian_term`: nome, CPF validado, parentesco, as duas autorizações, cidade e assinatura na tela; guarda data, IP, navegador e SHA-256) e PDF gerado sob demanda (`guardian_term_signature`); fica "para conferir" e a aprovação com uso de imagem exige Sim nas duas autorizações |
| `signup_guardian_esign` | o responsável também assina na tela já no cadastro do aluno menor (`sign_signup_guardian_term`, sem login pelo código do cadastro ou pela conta logada; fica em `student_signup_requests.guardian_esign`); aprovado o aluno, vira "Termo para conferir" |
| `signup_request_term_view` | aprovação do cadastro de aluno menor com o termo: `list_student_requests` diz se é menor e qual termo veio (`guardian_term`, `guardian_file_path`) e `signup_guardian_signature` dá os dados do termo assinado na tela para o PDF |
| `fix_anon_storage_upload` | corrige o envio sem login da foto e do termo no cadastro (a policy do termo chamava uma função que `anon` não podia executar e derrubava todo envio sem login) |
| `minor_account_from_guardian` | aluno menor: aprovar o termo com uso de imagem também marca o aceite da conta (`account_consent_at`), sem a tela de aceite do aluno |
| `my_face_photo` | `my_face_photo()`: caminho da foto do cadastro do próprio aluno logado (aprovado), mostrada na área do aluno |

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
`professor@example.com` / `senha123`). A configuração local fica em `supabase/config.jsonc` (Postgres 17, igual à
produção, e confirmação de e-mail ligada).

**Toda migration nova é testada no banco local antes de ir para produção** e tem o rollback em
`supabase/rollback/` (ver o README de lá). O histórico local e o de produção têm as mesmas versões; uma migration
aplicada direto no painel ou pelo SQL Editor precisa ganhar o arquivo correspondente aqui com a mesma versão.

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
- **Escrita**: presença, presença avulsa, conclusão de chamada, plano de aula, foto e respostas da presença pelo rosto vão para uma fila em
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

## Modelo do plano de aula

Todo plano ainda sem texto abre com um **esqueleto** pronto para preencher (títulos das seções com "Escreva aqui…"
embaixo). Sem modelo próprio vale o padrão da equipe (`DEFAULT_PLAN_TEMPLATE` em `packages/core/src/data/templates.ts`:
Objetivo, Aquecimento, Técnica, Combinações/drills, Condicionamento/sparring, Alongamento, Observações). Cada
professor pode montar o seu em **Mais › Modelo do plano de aula** (tabela `lesson_templates`, um por professor) ou
voltar ao padrão. O esqueleto só é salvo no plano quando o professor escreve algo, então o lembrete do plano continua
valendo até lá. Mudar o modelo não altera planos já escritos.

## Compartilhar o plano de aula (aprovação do mestre)

Na aba **Plano** da aula, o botão **Compartilhar** (como no Notion) gera um link secreto daquela aula
(`/plano#token`). O professor envia pelo menu de compartilhar do celular (ou WhatsApp) ou copia o link. Quem abre
o link não precisa de login: vê academia, data, horário e o plano sempre na versão mais recente salva no servidor
(nada de alunos ou presenças) e tem só dois botões: **Aprovar** (envia na hora) ou **Solicitar ajuste**, que abre
uma janela para escrever o que ajustar.
A revisão aparece no topo do plano para o professor, com aviso se o plano foi editado depois dela.
**Gerar novo link** invalida o anterior e zera a revisão; **Desativar** corta o acesso. Exige conexão.

Quando o mestre aprova ou pede ajustes, o professor que compartilhou recebe um **push** na hora ("Plano de aula
aprovado" / "Ajustes no plano de aula", com o comentário); tocar abre a aba Plano da aula. Usa os mesmos aparelhos
e a mesma Edge Function dos lembretes: a revisão acorda a função via `pg_net`, e o cron de cada minuto reenvia o
que tiver ficado pendente. Precisa das notificações ativadas em Mais › Lembretes.

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

## Data da próxima graduação

A graduação é da equipe toda, com datas separadas para adulto e infantil. Em Alunos › Graduação, card
**Próxima graduação**: uma data para **Adulto** e outra para **Infantil** (valem para todas as academias). Com a
data marcada (futura), os meses de cada aluno — e, no infantil, a idade que completa no ano — contam até o dia da
graduação da trilha dele; os treinos são os registrados até hoje. Ex.: começou há 5 meses, graduação daqui a 1 mês →
conta 6 meses. Na primeira graduação, quem cumpre os requisitos do segundo grau (treinos e meses) aparece como
**Pode ir direto** (ex.: direto para Vermelho e Branco), e o registro da graduação já sugere esse grau. Depois que a
data passa, o cálculo volta a ser para hoje. A área do aluno mostra a data da trilha dele.

## Presença que vale mais de uma (aulão)

Em Presença avulsa, **Vale: 1, 2 ou 3 presenças**. O valor soma no progresso da graduação, no total e nos
treinos por mês (falta continua contando 1 aula no período). Registrar de novo o mesmo aluno, dia e local
corrige o valor sem duplicar. O histórico mostra o selo "Vale 2".

## Área do aluno

Na tela do aluno, card **Área do aluno** › Gerar link. O professor envia pelo WhatsApp (ou copia) um link
`/minhas-presencas#<token>`; o aluno abre no celular, sem conta nem senha, e vê: treinos no total e no mês,
frequência, faltas, grau atual e progresso para o próximo, graduações, treinos por mês e o histórico.
Telefone e observações do professor não aparecem.

- O token (122 bits aleatórios) vai no `#`, que não chega ao servidor nem aos logs. Quem tem o link vê os dados.
- O link **expira**: 24 horas por padrão (dá para escolher 3 ou 7 dias ao gerar). Vencido, o aluno vê "Link expirado".
- **Gerar novo link** invalida o anterior; **Desativar** apaga o acesso. O card mostra a validade e quando o aluno abriu.
- O aparelho guarda o link: com o app instalado na Tela de Início, ele abre direto nas presenças do aluno.
  Os dados ficam em cache e abrem offline.

### Conta do aluno

Pelo link, o aluno pode **criar a conta** (nome, e-mail, senha). A conta é ligada a ele pelo próprio link
(`claim_student_account`), então só dá para criar com um link válido. Depois disso ele entra em
`/minhas-presencas` com e-mail e senha, sem precisar de link.

- **Aceite LGPD**: no primeiro acesso da conta o aluno precisa autorizar o uso de imagem. Se não aceitar, sai da
  conta e continua dependendo do link do professor. Sem esse aceite (`students.account_consent_at`) e com o
  consentimento de imagem em vigor, a conta não lê nada no banco (`is_own_student`, `my_student_portal`).
- Se o professor desmarcar "Autorizou uso de imagem", a conta fica bloqueada até o aluno aceitar de novo.
- No card **Área do aluno** o professor vê se o aluno tem conta e pode **Desvincular**.
- Conta de aluno que entra pelo login do professor é levada para a área do aluno. Conta de professor (com academia)
  não pode ser ligada a um aluno.
- Para o aluno criar conta, "Allow new users to sign up" precisa estar ligado no Supabase. Se a confirmação de
  e-mail estiver ligada, o aluno confirma no mesmo celular enquanto o link ainda vale; ao abrir, a conta é ligada.

### Cadastro do aluno sem link

Em `/cadastro-aluno` (link "É aluno? Criar conta de aluno" no login) o aluno escolhe o **professor**, a **academia**
em que treina e cria a conta (nome, WhatsApp opcional, e-mail e senha). A conta fica **aguardando**.

- O professor vê os pedidos em **Pendências** (somam no número da aba) e, para cada um,
  diz **qual aluno da lista é esse login** (nomes parecidos primeiro), **cadastra como aluno novo** ou **recusa**.
  Qualquer professor que dá aula na academia escolhida pode decidir.
- Menor de idade: o cadastro tem **Baixar termo** (gerado sem login, com o nome e o nascimento digitados) e o anexo do
  termo assinado (obrigatório). Aprovado o aluno, o termo aparece como **Termo para conferir** em Pendências.
- O aluno maior de idade autoriza o uso de imagem já no cadastro (obrigatório para usar a conta). Aprovado, a autorização
  vai para o aluno e ele entra direto, sem a tela de aceite. Menor de idade: vale o termo do responsável.
- Pedido sem autorização no cadastro (feito antes dela existir): no primeiro acesso o aluno passa pelo aceite LGPD.
- Enquanto espera, o aluno vê "Aguardando o professor"; recusado, pode escolher outro professor ou academia.
- O pedido é gravado já no cadastro (metadado do signUp), então funciona mesmo confirmando o e-mail em outro navegador.
- A foto de rosto também sobe já no cadastro, mesmo sem confirmar o e-mail: o app manda um código secreto de uso único
  no signUp e envia a foto sem login (vale 24 h). O pedido já aparece para o professor com a foto. Sem sinal no momento,
  a foto fica no aparelho e sobe no primeiro acesso.
- O cadastro deixa claro que o e-mail é o login e pede a senha duas vezes. E-mail que já tem conta: o Supabase não
  avisa nem manda e-mail; o app detecta e pede para entrar com ele e usar "Pedir acesso ao professor".

## Convite de professor

Mais › **Convidar professor** › Gerar convite. Qualquer professor pode convidar. O link `/convite#<token>` vale
para uma pessoa e por 7 dias; quem abre cria a conta (ou entra, se já tiver) e vira professor. O convite só
libera o acesso: o convidado cadastra a própria academia, alunos e grade, e não vê as academias de quem convidou.

- Conta criada sem convite nem link de aluno não tem acesso a nada (é levada para uma tela explicando isso).
- O login do professor não tem mais "Criar conta": professor novo entra pelo convite.
- Convites abertos podem ser cancelados; a tela lista também os usados e vencidos.

## Presença pelo rosto (reconhecimento facial)

Na aula › **Fotos**, ao subir a foto da turma (câmera ou galeria), o celular procura os rostos e, para cada um,
pergunta **"Esta pessoa é Fulano de Tal? (87%)"** com o recorte do rosto. Opções: **Confirmar**, **É outro**
(escolher um aluno da academia; os mais parecidos primeiro) e **Ignorar** (não é aluno, rosto ruim). Rosto sem sugestão
mostra **"Quem é?"**. Nada vira presença sem a resposta do professor; **Salvar** marca as presenças com `source = 'face'`
pela mesma fila offline da chamada (quem já estava presente ou atrasado não muda).

- **No aparelho, sem serviço externo**: detecção com **YuNet** (OpenCV Zoo, MIT, 0,2 MB) e vetor do rosto com **SFace**
  int8 (OpenCV Zoo, Apache-2.0, 9,9 MB, 128 dimensões), rodando em **onnxruntime-web** (MIT, WASM, uma thread) dentro de
  um Web Worker. A foto original é analisada (mais nítida que a enviada); foto grande é varrida em blocos sobrepostos
  para achar rostos pequenos do fundo. A lógica pura (blocos, decodificação, alinhamento, comparação, confiança,
  sugestões) está em `packages/core/src/domain/face.ts`, com testes em `face.test.ts`.
- **Modelos servidos pelo próprio app**: `apps/web/public/models/` (no repositório) e o runtime em `/ort/<versão>/`,
  copiado do pacote por `apps/web/scripts/face-assets.mjs` no `dev`/`build`. Não entram no pré-cache (ninguém baixa 11 MB
  ao instalar); o service worker guarda no primeiro uso (`kog-face-models`) e depois funciona offline. Trocar de modelo
  é trocar o nome do arquivo e o `FACE_MODEL` (vetores de modelos diferentes não se comparam: exige recadastro).
- **Foto do cadastro**: aluno que se cadastrou com foto de rosto (cadastro sem link) e aceitou o termo já chega com uma
  referência. Antes de analisar a foto da turma, com internet, o celular do professor baixa as fotos de cadastro de quem
  ainda não tem essa referência, acha o maior rosto (selfie numa moldura maior, para o detector) e grava só o vetor
  (`source = 'signup_photo'`, uma por aluno, nunca podada). Foto sem rosto encontrado não é tentada de novo naquele
  aparelho (`localStorage`). Código em `apps/web/src/lib/face/signup-refs.ts`.
- **Aprende com o professor**: sem foto de cadastro, o aluno começa sem referência e o rosto dele é "Quem é?". Cada resposta vira
  referência do aluno (`face_embeddings`): correções sempre; confirmações quando trazem algo novo (cosseno < 0,9 com as
  que ele já tem). Máximo de 20 por aluno (as mais antigas saem). A nota do aluno é a média das 3 referências mais
  parecidas; a confiança mostrada é uma curva do cosseno (limiar do SFace, 0,363, ≈ 55%); abaixo de 45% o app não sugere.
  Cada aluno é sugerido para um rosto só por foto. As referências ficam no cache offline e as novas valem na hora.
- **O banco guarda só números**: o vetor (128 números) e a decisão de cada rosto (`face_detections`: caixa normalizada,
  sugestão, confiança, aluno escolhido, tipo de decisão e quem decidiu). O recorte mostrado na revisão existe só na
  memória do celular; não há cópia extra da foto.
- **Aprovação automática** (preparada, desligada e sem tela): `profiles.face_auto_approve_min` (nulo = desligado; mínimo
  50%). Com valor, o rosto acima do limite já abre como "Aprovado automaticamente" e grava `decision = 'auto'`; o
  professor ainda pode desfazer antes de salvar.
- **Desempenho**: 1 a 3 s por foto num Android médio (a primeira vez inclui o download, com barra de progresso).

### LGPD (dado biométrico)

- Só alunos com **"Autorizou uso de imagem e reconhecimento facial"** (`students.image_consent_at`) aparecem para
  escolha e podem ter referência. **O banco garante**: triggers recusam referência ou decisão de aluno sem consentimento
  ou de outra academia; o aceite do aluno na conta (`accept_image_consent`) cita o reconhecimento facial.
- **Retirar o consentimento apaga na hora** as referências e as decisões do aluno (trigger `students_forget_face`); as
  presenças continuam.
- **RLS**: o professor só vê e grava rostos de alunos e fotos das academias em que dá aula (`can_manage_student`,
  `can_manage_photo`). Apagar a foto apaga as decisões dela; as referências continuam (sem ligação com a foto).

## Termo do responsável (aluno menor de 18 anos)

A **data de nascimento** é obrigatória no cadastro do aluno (válida, não futura). Alunos cadastrados antes, sem data,
continuam funcionando: aparecem com o selo **Data pendente** na lista e a ficha pede o preenchimento.

- **Idade**: `isMinor(birthDate, today)` em `packages/core/src/domain/age.ts` (dia civil de São Paulo; faz 18 no dia do
  aniversário; nascido em 29/02 faz 18 em 01/03 em ano não bissexto). O banco usa a mesma regra em `public.is_minor`.
- **Cadastro**: com a data de um menor, o formulário mostra a etapa do termo: **Baixar termo** (PDF A4 de uma página,
  já com nome e nascimento) e o envio do termo assinado (PDF, JPG ou PNG, até 10 MB). Dá para salvar sem o termo: o aluno
  fica com **Termo pendente** e o professor envia depois, na ficha (card "Termo do responsável", que também permite
  ver e substituir o arquivo). Maior de idade: nada muda.
- **PDF**: gerado no servidor por `POST /api/termo-responsavel` (pdf-lib, sem serviço externo), só para professor logado.
  Nome e data vão no corpo, nada é guardado e a resposta é `no-store`. Texto em `GUARDIAN_TERM` (`@kog/core`).
- **Arquivo**: bucket privado `guardian-consents` (`{aluno}/{id}.{pdf|jpg|png}`). Só os professores das academias do
  aluno (`can_manage_student`) enviam e abrem, e só por URL assinada de 60 segundos.
- **Uso de imagem e reconhecimento facial**: para menor, só valem com o termo enviado. O banco recusa marcar
  "Autorizou uso de imagem" (e o aceite do próprio aluno na conta) sem o termo; quem vira menor ao preencher a data perde o
  aceite anterior e os dados do rosto são apagados. Recusar não impede o aluno de treinar: presença e chamada seguem iguais.
- No cadastro sem link (`/cadastro-aluno`) a data também é obrigatória; o menor é avisado de que o professor vai pedir o termo.
- **Pelo próprio aluno**: na conta, o aluno menor sem termo aprovado vê a tela **Autorização do responsável** em vez do
  aceite: baixa o termo (o servidor usa o nome e o nascimento do cadastro dele) e envia o arquivo assinado. O termo fica
  **Termo para conferir** e aparece em **Pendências** (soma no número da aba) e na ficha do aluno. O professor abre o
  arquivo e **aprova**, dizendo se o responsável autorizou uso de imagem e reconhecimento facial, ou **recusa** com o motivo,
  que o aluno vê para enviar de novo. Aprovado com "Sim", o aluno faz o aceite e entra na conta; com "Não", a conta não fica
  disponível (ele segue treinando e vê as presenças pelo link do professor). Termo enviado pelo professor já vale como aprovado.

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
   em Redirect URLs, mais `https://app.kingofglory.com.br/login-professor` (necessário para o link de "esqueci a senha")
   e `https://app.kingofglory.com.br/minhas-presencas` (confirmação de e-mail da conta do aluno).
7. **Criar sua conta** no app. "Allow new users to sign up" (Supabase › Authentication › Sign In / Providers)
   precisa ficar ligado para alunos e professores criarem conta. Conta nova começa sem acesso: vira aluno pelo
   link do aluno ou professor pelo convite (Mais › Convidar professor).
8. **Instalar no celular**: abrir `https://app.kingofglory.com.br` e usar "Adicionar à tela de início".

## Fases seguintes

- **Fase 2**: convites de professores (`gym_instructors` já suporta), relatórios, templates (`lesson_templates`).
- **Fase 3**: app do aluno (`students.profile_id`, policies de leitura das próprias presenças já existem).
- **Fase 4**: reconhecimento facial no celular — feito (ver "Presença pelo rosto"). Próximo passo possível: ligar a aprovação automática com uma tela de ajuste.
- **Fase 5**: `apps/mobile` com Expo reaproveitando `@kog/core`.
