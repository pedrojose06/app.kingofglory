'use client'

import {
  buildImportPlan, formatDateBR, listClassesRange, parseAttendanceExport, runImport, type ImportOutcome, type ImportPlan,
  type ParseResult,
} from '@kog/core'
import { Button, Card, EmptyState, Field, Select } from '@kog/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Section } from '@/components/common'
import { Page } from '@/components/shell'
import { useGyms, useStudents } from '@/lib/queries'
import { db } from '@/lib/supabase'
import { toastError } from '@/lib/toast'

export default function ImportPage() {
  const gyms = useGyms()
  const students = useStudents()
  const queryClient = useQueryClient()
  const [gymId, setGymId] = useState('')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  useEffect(() => {
    if (!gymId && gyms.data?.[0]) setGymId(gyms.data[0].id)
  }, [gyms.data, gymId])

  // Recalcula o preview quando muda o arquivo ou a academia de destino.
  useEffect(() => {
    let stale = false
    setPlan(null)
    if (!parsed || parsed.rows.length === 0 || !gymId) return
    const dates = parsed.rows.map((r) => r.date).sort()
    listClassesRange(db(), gymId, dates[0]!, dates[dates.length - 1]!)
      .then((classes) => {
        if (stale) return
        setPlan(buildImportPlan(parsed.rows, (students.data ?? []).filter((s) => s.gym_id === gymId), classes))
      })
      .catch(toastError)
    return () => {
      stale = true
    }
  }, [parsed, gymId, students.data])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setOutcome(null)
    setFileName(file.name)
    setParsed(parseAttendanceExport(await file.text()))
  }

  async function confirm() {
    if (!plan) return
    setBusy(true)
    try {
      setOutcome(await runImport(db(), gymId, plan))
      setParsed(null)
      setFileName('')
      await queryClient.invalidateQueries()
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Importar" kicker="Presenças do InClass" back="/mais">
      {gyms.data?.length === 0 ? (
        <EmptyState title="Cadastre uma academia antes de importar" />
      ) : (
        <>
          <div className="space-y-3">
            <Field label="Academia de destino">
              <Select value={gymId} onChange={(e) => setGymId(e.target.value)}>
                {(gyms.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label="Arquivo (CSV)" hint="Colunas aluno + data (+ status), ou uma linha por aluno com uma coluna por data.">
              <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} className="block w-full text-sm text-soft file:mr-3 file:h-10 file:rounded file:border file:border-line-strong file:bg-transparent file:px-3 file:text-xs file:font-bold file:uppercase file:tracking-[0.1em] file:text-accent" />
            </Field>
          </div>

          {outcome ? (
            <Card className="mt-5 border-success/50 p-4 text-sm text-soft">
              <p className="font-bold text-success">Importação concluída</p>
              <p className="mt-1">{outcome.attendanceWritten} presenças gravadas · {outcome.studentsCreated} alunos criados · {outcome.classesCreated} aulas criadas</p>
            </Card>
          ) : null}

          {parsed ? (
            <Section title={`Preview — ${fileName}`}>
              {parsed.rows.length === 0 ? (
                <EmptyState title="Nada para importar">{parsed.warnings[0]}</EmptyState>
              ) : !plan ? (
                <p className="text-sm text-dim">Comparando com os dados existentes…</p>
              ) : (
                <>
                  <Card className="divide-y divide-line text-sm">
                    <Row label="Período" value={plan.dateRange ? `${formatDateBR(plan.dateRange.from)} a ${formatDateBR(plan.dateRange.to)}` : '—'} />
                    <Row label="Registros a gravar" value={`${plan.records.length} (${plan.presentCount} presenças)`} />
                    <Row label="Alunos novos a criar" value={plan.newStudents.length} />
                    <Row label="Aulas a criar" value={plan.newClassDates.length} />
                    {plan.duplicates > 0 ? <Row label="Linhas duplicadas ignoradas" value={plan.duplicates} /> : null}
                    {parsed.warnings.length > 0 ? <Row label="Linhas com problema" value={parsed.warnings.length} /> : null}
                  </Card>

                  {plan.newStudents.length > 0 ? (
                    <details className="mt-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <summary className="font-medium text-text">Alunos que serão criados</summary>
                      <p className="mt-2 text-dim">{plan.newStudents.join(', ')}</p>
                    </details>
                  ) : null}
                  {parsed.warnings.length > 0 ? (
                    <details className="mt-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <summary className="font-medium text-warning">Avisos</summary>
                      <ul className="mt-2 space-y-0.5 text-dim">{parsed.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul>
                    </details>
                  ) : null}

                  <Button block size="lg" className="mt-4" loading={busy} onPress={confirm}>Gravar {plan.records.length} registros</Button>
                  <p className="mt-2 text-center text-xs text-dim">Nada é gravado antes deste botão. Repetir a importação não duplica registros nem sobrescreve chamadas feitas no app.</p>
                </>
              )}
            </Section>
          ) : null}
        </>
      )}
    </Page>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2.5">
      <span className="text-dim">{label}</span>
      <span className="text-right font-bold text-text">{value}</span>
    </div>
  )
}
