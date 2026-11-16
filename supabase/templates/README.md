# Modelos de e-mail (Supabase Auth)

E-mails do login no padrão visual da King of Glory. O Supabase não lê esta pasta: cada modelo é colado no painel.

**Supabase › Authentication › Emails › Templates**: em cada aba, cole o **Subject** abaixo e o conteúdo do arquivo
em **Body** (modo "Source"/HTML) e salve.

| Aba no Supabase | Arquivo | Subject |
|---|---|---|
| Confirm signup | `confirmation.html` | `Confirme seu e-mail · King of Glory` |
| Reset password | `recovery.html` | `Crie uma nova senha · King of Glory` |
| Change email address | `email_change.html` | `Confirme seu novo e-mail · King of Glory` |
| Magic link | `magic_link.html` | `Seu link de acesso · King of Glory` |

- Em uso hoje: **Confirm signup** (cadastro de aluno e professor) e **Reset password** ("Esqueci a senha").
  Troca de e-mail e link mágico ainda não aparecem no app; os modelos ficam prontos para quando aparecerem.
- O logo vem de `https://app.kingofglory.com.br/icons/icon-192.png`; se o domínio mudar, troque nos arquivos.
- Variáveis do Supabase usadas: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` (troca de e-mail) e
  `{{ .Data.name }}` (nome informado no cadastro; sem nome, o e-mail diz só "Olá!").
- O remetente (nome "King of Glory", `nao-responda@kingofglory.com.br`) é configurado em Emails › SMTP Settings.
