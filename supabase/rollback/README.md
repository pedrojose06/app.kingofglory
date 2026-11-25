# Rollback das migrations

A CLI do Supabase não tem migration "down". Cada migration nova (a partir de `academy_members`) tem aqui um
arquivo `<versão>_<nome>.down.sql` que desfaz exatamente o que ela fez, na ordem inversa.

Antes de aplicar em produção, toda migration nova é testada no banco local:

```bash
supabase start
```

```bash
supabase db reset
```

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/rollback/<versão>_<nome>.down.sql
```

Depois do down, `supabase db reset` de novo confirma que a migration volta a aplicar do zero.

Para desfazer em produção: rodar o `.down.sql` e remover a linha da migration em
`supabase_migrations.schema_migrations` (`supabase migration repair --status reverted <versão>`).

As migrations anteriores a `academy_members` não têm rollback (já estavam em produção antes desta regra).
