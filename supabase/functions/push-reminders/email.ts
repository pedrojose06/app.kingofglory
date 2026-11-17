// E-mail de aviso ao aluno, no mesmo visual dos modelos de e-mail do login (supabase/templates).
// Sem dependências, para poder ser testado fora do Deno.

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

const APP_URL = 'https://app.kingofglory.com.br'

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Pedido de acesso aprovado pelo professor. */
export function approvalEmail(input: { to: string; name: string | null; gym: string }): EmailMessage {
  const first = input.name?.trim().split(/\s+/)[0] ?? ''
  const hello = first ? `Olá, ${escape(first)}!` : 'Olá!'
  const gym = escape(input.gym)
  const url = `${APP_URL}/minhas-presencas`
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>Acesso liberado</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0a07;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0b0a07;">O professor aprovou seu acesso. Suas presenças já estão no app.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0a07" style="background-color:#0b0a07;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding:0 0 20px 0;">
            <img src="${APP_URL}/icons/icon-192.png" width="88" height="88" alt="King of Glory" style="display:block;width:88px;height:88px;border:0;border-radius:44px;">
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#a89e85;">
            King of Glory Academy
          </td>
        </tr>
        <tr>
          <td bgcolor="#121008" style="background-color:#121008;border:1px solid #3b3015;border-radius:12px;padding:32px 28px;">
            <h1 style="margin:0 0 16px 0;font-family:Impact,'Arial Narrow Bold','Arial Black',Arial,sans-serif;font-size:28px;line-height:1.15;font-weight:normal;letter-spacing:1px;text-transform:uppercase;color:#e9c55c;">Acesso liberado</h1>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#ede6d6;">
              <p style="margin:0 0 12px 0;">${hello}</p>
              <p style="margin:0 0 12px 0;">O professor aprovou seu acesso ao app. Academia: <strong style="color:#e9c55c;">${gym}</strong>.</p>
              <p style="margin:0;">Entre no app com seu e-mail e senha para ver suas presenças, seu progresso para a próxima graduação e ligar o lembrete das aulas.</p>
            </div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:28px 0 8px 0;">
              <tr>
                <td align="center" bgcolor="#d9a93f" style="border-radius:8px;background-color:#d9a93f;background-image:linear-gradient(180deg,#f0ce6b,#b98a2e);">
                  <a href="${url}" target="_blank" style="display:block;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#17130a;text-decoration:none;border-radius:8px;">Abrir o app</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 8px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6e6449;">
            King of Glory Academy · Muay Thai · Jiu Jitsu<br>
            Este é um e-mail automático, não precisa responder.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`
  const text = [
    first ? `Olá, ${first}!` : 'Olá!',
    '',
    `O professor aprovou seu acesso ao app. Academia: ${input.gym}.`,
    'Entre no app com seu e-mail e senha para ver suas presenças, seu progresso para a próxima graduação e ligar o lembrete das aulas.',
    '',
    url,
    '',
    'King of Glory Academy · Este é um e-mail automático, não precisa responder.',
  ].join('\n')
  return { to: input.to, subject: 'Seu acesso foi liberado · King of Glory', html, text }
}
