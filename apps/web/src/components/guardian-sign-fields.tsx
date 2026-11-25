'use client'

// Campos do termo do responsável assinado na tela: responsável (nome, CPF, parentesco), as duas autorizações, cidade,
// assinatura com o dedo e a declaração. Usado na página do link (/termo) e no cadastro do aluno menor.

import { GUARDIAN_RELATIONSHIPS, GUARDIAN_SIGN_DECLARATION, GUARDIAN_TERM, formatCpf, type GuardianSignForm } from '@kog/core'
import { Card, Chip, Field, Input, cn } from '@kog/ui'
import { useState, type ReactNode } from 'react'
import { SignaturePad } from '@/components/signature-pad'

export const EMPTY_GUARDIAN_SIGN: GuardianSignForm = {
  guardianName: '', guardianCpf: '', relationship: '', image: null, face: null, place: '', signature: '', declaration: false,
}

interface Props {
  form: GuardianSignForm
  onChange: (form: GuardianSignForm) => void
  /** Já tentou enviar: destaca a assinatura em branco. */
  tried?: boolean
  /** Cada parte num card (página do link) ou tudo num bloco só (dentro de outro card, no cadastro). */
  boxed?: boolean
  /** Entra no fim da parte da assinatura (erro e botão, na página do link). */
  footer?: ReactNode
}

export function GuardianSignFields({ form, onChange, tried = false, boxed = true, footer }: Props) {
  const [otherRel, setOtherRel] = useState(
    () => !!form.relationship && !(GUARDIAN_RELATIONSHIPS as readonly string[]).includes(form.relationship),
  )
  const set = <K extends keyof GuardianSignForm>(key: K, value: GuardianSignForm[K]) => onChange({ ...form, [key]: value })
  const t = GUARDIAN_TERM
  const answers = [['image', t.authorizations.rows[0]], ['face', t.authorizations.rows[1]]] as const
  // Função (não componente): um componente criado aqui seria outro a cada render e remontaria tudo (a assinatura
  // seria apagada e o campo perderia o foco a cada tecla).
  const box = (children: ReactNode, first = false) =>
    boxed ? <Card className="space-y-4 p-4">{children}</Card> : <div className={cn('space-y-4', !first && 'border-t border-line pt-4')}>{children}</div>

  return (
    <>
      {box(<>
        <p className="kicker">Responsável</p>
        <Field label="Nome completo do responsável">
          <Input value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} autoComplete="off" autoCapitalize="words" />
        </Field>
        <Field label="CPF do responsável">
          <Input
            value={form.guardianCpf}
            onChange={(e) => set('guardianCpf', formatCpf(e.target.value))}
            inputMode="numeric"
            placeholder="000.000.000-00"
            autoComplete="off"
          />
        </Field>
        <div role="group" aria-label="Parentesco com o aluno">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-dim">Parentesco com o aluno</p>
          <div className="flex flex-wrap gap-2">
            {GUARDIAN_RELATIONSHIPS.map((r) => (
              <Chip key={r} active={!otherRel && form.relationship === r} onPress={() => { setOtherRel(false); set('relationship', r) }}>{r}</Chip>
            ))}
            <Chip active={otherRel} onPress={() => { setOtherRel(true); set('relationship', '') }}>Outro</Chip>
          </div>
          {otherRel ? (
            <Input className="mt-2" value={form.relationship} onChange={(e) => set('relationship', e.target.value)} placeholder="Ex.: tia, guardião" maxLength={40} aria-label="Parentesco" />
          ) : null}
        </div>
      </>, true)}

      {box(<>
        <p className="kicker">{t.authorizations.heading}</p>
        {answers.map(([key, label]) => (
          <div key={key} role="group" aria-label={label}>
            <p className="text-sm text-text">{label}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Chip active={form[key] === true} onPress={() => set(key, true)} className="w-full">Autorizo</Chip>
              <Chip active={form[key] === false} onPress={() => set(key, false)} className="w-full">Não autorizo</Chip>
            </div>
          </div>
        ))}
        <p className="text-xs text-dim">Recusar não impede o aluno de treinar. {t.revocation}</p>
      </>)}

      {box(<>
        <p className="kicker">Assinatura do responsável</p>
        <Field label="Cidade">
          <Input value={form.place} onChange={(e) => set('place', e.target.value)} autoCapitalize="words" placeholder="Ex.: Bauru" maxLength={80} />
        </Field>
        <SignaturePad onChange={(png) => set('signature', png)} invalid={tried && !form.signature} />
        <label className="flex items-start gap-3 rounded-lg border border-line p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-[var(--kog-gold)]"
            checked={form.declaration}
            onChange={(e) => set('declaration', e.target.checked)}
          />
          <span className="text-sm text-text">{GUARDIAN_SIGN_DECLARATION}</span>
        </label>
        <p className="text-xs text-dim">
          Assinatura eletrônica (Lei 14.063/2020). Junto com o termo ficam registrados a data e a hora, o endereço IP e o
          navegador deste aparelho. Só os professores do aluno veem o termo e o CPF.
        </p>
        {footer}
      </>)}
    </>
  )
}
