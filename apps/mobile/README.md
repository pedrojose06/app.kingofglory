# apps/mobile (reservado — Fase 5)

App nativo com Expo. Ainda não implementado.

Quando for criado, deve consumir `@kog/core` para tudo que é dado e regra de negócio:

- `createSupabase(url, key, { storage: AsyncStorage })` — o cliente aceita o storage de sessão por injeção.
- Funções de `@kog/core` (`listStudents`, `markAttendanceBatch`, …) recebem o cliente como primeiro argumento
  e não tocam em APIs do browser.
- A fila offline (`@kog/core` › `outbox`) é pura; só a persistência muda (IndexedDB no web, SQLite/MMKV no nativo).
- `@kog/ui` usa apenas classes utilitárias com tokens semânticos, para facilitar o port para NativeWind.
