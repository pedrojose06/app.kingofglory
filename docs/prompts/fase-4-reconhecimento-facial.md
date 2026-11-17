# Fase 4 — Reconhecimento facial (prompt para nova conversa)

Você vai implementar a **Fase 4 (reconhecimento facial de presença)** do app King of Glory, no repositório
`pedrojose06/app.kingofglory`, na branch **`feature/reconhecimento-facial`** (já criada a partir da `main`).
Leia o `README.md` antes de tudo: ele descreve a arquitetura, as migrations e as convenções.

## Contexto do projeto

- **PWA do professor** em Next.js 16 (app router, rotas estáticas, ids em `?id=`), `apps/web`. Instalado no celular,
  funciona offline (Serwist + fila offline `outbox` + cache do TanStack Query em IndexedDB).
- **`packages/core` (`@kog/core`)**: acesso a dados (`data/*.ts`), regras puras (`domain/*.ts`, com testes em vitest)
  e `database.types.ts` (mantido à mão: ao criar tabela/função, atualize esse arquivo).
- **`packages/ui` (`@kog/ui`)**: componentes e tokens (tema escuro/claro, dourado). Interface **em português**.
- **Supabase** (projeto `evxxnnbkkewlaeisfuyp`, região sa-east-1). Migrations em `supabase/migrations`.
  Fluxo adotado: escrever a migration, **testar no banco real dentro de uma transação que termina em erro proposital
  (rollback)**, aplicar com o MCP do Supabase (`apply_migration`) e renomear o arquivo para a versão aplicada.
- App no ar em `https://app.kingofglory.com.br` (Vercel, deploy da `main`). **Não suba nada na `main` sem eu pedir.**

## O que já existe e deve ser reaproveitado

- **Fotos do treino**: tabela `class_photos` + bucket privado `class-photos` (caminho `gym/aula/foto.jpg`, acesso por
  URL assinada; policies por `is_gym_member`). Código em `packages/core/src/data/photos.ts` (`uploadClassPhoto`,
  `signPhotoUrls`) e `apps/web/src/components/class-photos.tsx`, usado na tela da aula (`apps/web/src/app/(app)/aula/page.tsx`).
  As fotos são comprimidas no cliente (`browser-image-compression`).
- **Schema previsto (não aplicado)**: `supabase/migrations/20991231000000_future_face_recognition.sql.disabled`, com
  `face_embeddings` (pgvector 512, índice HNSW, trigger que exige consentimento) e `face_detections`
  (`confidence`, `confirmed`, `confirmed_by`). Use como ponto de partida e ajuste ao fluxo abaixo.
- **Consentimento (LGPD)**: `students.image_consent_at` (marcado pelo professor ou pelo aluno) e
  `students.account_consent_at` (aceite do próprio aluno na conta). **Só alunos com `image_consent_at` podem ter rosto
  cadastrado ou reconhecido.** Retirar o consentimento deve apagar os dados faciais do aluno.
- **Presença**: tabela `attendance` (status, `credits`, `source`); o enum `attendance_source` **já tem o valor `face`**.
  Marcação em lote pela RPC `mark_attendance_batch` (via fila offline `outbox` em `apps/web/src/lib/outbox.ts`).

## Decisões já tomadas

1. **O reconhecimento roda no celular de cada professor**, dentro do app (navegador/PWA). **Sem serviço externo.**
   Quem sobe a foto é quem processa. O banco guarda só os vetores (embeddings) e o resultado, nunca cópia extra da foto.
2. **Sempre perguntar e o professor sempre aprova.** Ao subir uma foto da turma, o app detecta os rostos e, para cada
   rosto, mostra o recorte e pergunta: **"Esta pessoa é Fulano de Tal? (87%)"**. Mesmo com 100%, **nenhuma presença é
   marcada sem a confirmação do professor** nesta fase. Opções por rosto: **Confirmar**, **É outro aluno** (escolher da
   lista da turma/academia) e **Ignorar** (não é aluno / rosto ruim).
3. **O reconhecimento aprende com as confirmações.** No começo ninguém tem rosto cadastrado: o professor escolhe o aluno
   de cada rosto e isso vira referência. Cada confirmação acrescenta (ou melhora) as referências do aluno, para as
   próximas sugestões ficarem melhores. Correções ("É outro aluno") também devem ensinar.
4. Presença confirmada pelo rosto é gravada com `source = 'face'`, pelo mesmo caminho das outras presenças (offline-first).
5. Deixe preparado (desligado e sem tela por enquanto) um futuro "aprovar automaticamente acima de X%".

## O que eu espero de você

1. **Antes de codar, me apresente um plano curto** com: a biblioteca/modelo de detecção e de embedding (prefira algo
   que rode bem em Android médio e iPhone pelo navegador, ex. MediaPipe + modelo de embedding em ONNX/TF.js), **tamanho
   do download do modelo**, desempenho esperado e **licença** (precisa permitir uso comercial). Diga onde os modelos
   ficam hospedados (de preferência servidos pelo próprio app e guardados em cache para uso offline).
2. Depois de eu aprovar, implemente em etapas pequenas, com commit em cada etapa na branch `feature/reconhecimento-facial`:
   schema + RLS + funções (testadas com rollback), lógica pura no `@kog/core` com testes (comparação de vetores, ranking
   de candidatos, limiares), e as telas no app.
3. Confira as telas com Playwright (dados simulados interceptando o Supabase) no tamanho de celular, nos temas claro e escuro.
4. Atualize o `README.md` (tabela de migrations e uma seção sobre o reconhecimento facial e a LGPD).
5. Ao final, me diga como testar no celular, passo a passo, e o que ficou de fora.

## Regras do projeto

- Nada de dados de rosto de aluno sem `image_consent_at`; trigger no banco garantindo isso.
- O professor só vê/usa rostos e alunos das academias em que dá aula (`is_gym_member`).
- Não apague presenças (o projeto não tem `delete` em `attendance`); corrija status.
- Commits em português, com as linhas de atribuição que o ambiente pedir. Não crie PR sem eu pedir.
