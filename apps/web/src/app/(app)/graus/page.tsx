'use client'

import { firstIssue, keys, RANK_TRACKS, rankRequirementInput, ranksOfTrack, TRACK_LABEL, trackOf, updateRankRequirements, type Rank } from '@kog/core'
import { Button, Card, Field, Input, RankBand, Sheet } from '@kog/ui'
import { useState } from 'react'
import { Loading, Page } from '@/components/shell'
import { useRanks, useSave } from '@/lib/queries'
import { db } from '@/lib/supabase'

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))

export default function RanksPage() {
  const ranks = useRanks()
  const [editing, setEditing] = useState<Rank | null>(null)
  const [months, setMonths] = useState('')
  const [classes, setClasses] = useState('')
  const [percent, setPercent] = useState('')

  const open = (r: Rank) => {
    setEditing(r)
    setMonths(r.min_months?.toString() ?? '')
    setClasses(r.required_classes?.toString() ?? '')
    setPercent(r.min_percent?.toString() ?? '')
  }

  const save = useSave(
    async () => {
      if (!editing) return
      const parsed = rankRequirementInput.safeParse({ min_months: toNumber(months), required_classes: toNumber(classes), min_percent: toNumber(percent) })
      if (!parsed.success) throw new Error(firstIssue(parsed.error))
      await updateRankRequirements(db(), editing.id, parsed.data)
    },
    [keys.ranks],
    () => setEditing(null),
  )


  return (
    <Page title="Graus" kicker="Kruang · Prajied" back="/mais">
      <p className="mb-3 text-sm text-dim">Toque num grau para definir o que o aluno precisa cumprir para chegar nele. Os treinos contam desde a graduação anterior (ou desde o início, para quem ainda não tem graduação) e zeram a cada graduação.</p>
      {ranks.isPending ? (
        <Loading />
      ) : (
        RANK_TRACKS.map((track) => ranksOfTrack(ranks.data ?? [], track)).filter((list) => list.length > 0).map((list) => (
        <section key={trackOf(list[0])} className="mb-5">
        <p className="kicker mb-2">Graduação {TRACK_LABEL[trackOf(list[0])].toLowerCase()}</p>
        <Card className="divide-y divide-line">
          {list.map((r) => (
            <button key={r.id} type="button" onClick={() => open(r)} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-tint">
              <span className="w-6 shrink-0 text-center font-display text-lg text-accent">{r.grade}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text">{r.name}</span>
                <span className="block truncate text-xs text-dim">
                  {r.level}
                  {r.min_months == null && r.min_percent == null && r.required_classes == null
                    ? ' · sem requisito definido'
                    : ` · ${[r.min_months != null ? `${r.min_months} meses` : null, r.required_classes != null ? `${r.required_classes}${r.min_percent != null ? '*' : ''} treinos` : null].filter(Boolean).join(' · ')}`}
                </span>
              </span>
              <RankBand colors={r.colors} />
            </button>
          ))}
        </Card>
        </section>
        ))
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.grade}º · ${editing.name}${trackOf(editing) === 'infantil' ? ' (infantil)' : ''}` : ''}>
        <div className="space-y-3">
          <Field label="Intervalo mínimo (meses)" hint="Tempo desde a graduação anterior (ou desde o início do aluno). Ex.: 6, 12, 18.">
            <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} placeholder="—" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Treinos">
              <Input inputMode="numeric" value={classes} onChange={(e) => setClasses(e.target.value.replace(/\D/g, ''))} placeholder="—" />
            </Field>
            <Field label="% mínima" hint="Ex.: 80 nos graus com *">
              <Input inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ''))} placeholder="100" />
            </Field>
          </div>
          {toNumber(classes) != null ? (
            <p className="text-sm text-soft">O aluno precisa de <strong className="text-text">{Math.ceil((Number(classes) * (toNumber(percent) ?? 100)) / 100)} treinos</strong> desde a última graduação.</p>
          ) : null}
          <Button block loading={save.isPending} onPress={() => save.mutate()}>Salvar</Button>
        </div>
      </Sheet>
    </Page>
  )
}
