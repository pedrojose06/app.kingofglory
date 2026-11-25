'use client'

import { RANK_TRACKS, saveGraduationEvent, todayISO, TRACK_LABEL, type GraduationEvent, type RankTrack } from '@kog/core'
import { Button, DateInput, Field, Input, Select, Textarea } from '@kog/ui'
import { toastError } from '@kog/web-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Dialog } from '@/components/kit'
import { useAcademy } from '@/lib/academy'
import { keys } from '@/lib/queries'
import { db } from '@/lib/supabase'

/** Criar ou editar a graduação (data, trilha, título). */
export function GraduationEventDialog({ event, onClose }: { event: GraduationEvent | null; onClose: () => void }) {
  const { academy } = useAcademy()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [heldOn, setHeldOn] = useState(event?.held_on ?? todayISO())
  const [track, setTrack] = useState<RankTrack>((event?.track as RankTrack) ?? 'adulto')
  const [title, setTitle] = useState(event?.title ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')

  const save = useMutation({
    mutationFn: () =>
      saveGraduationEvent(db(), { id: event?.id, gym_id: academy.gym_id, held_on: heldOn, track, title: title || null, notes: notes || null }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: keys.graduationEvents(academy.gym_id) })
      queryClient.setQueryData(keys.graduationEvent(academy.gym_id, saved.id), saved)
      onClose()
      if (!event) router.push(`/graduacao?id=${saved.id}`)
    },
    onError: toastError,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (heldOn) save.mutate()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={event ? 'Editar graduação' : 'Nova graduação'}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>Cancelar</Button>
          <Button type="submit" form="graduation-event" loading={save.isPending} disabled={!heldOn}>Salvar</Button>
        </>
      }
    >
      <form id="graduation-event" onSubmit={submit} className="space-y-4">
        <Field label="Data da graduação">
          <DateInput value={heldOn} onChange={(e) => setHeldOn(e.target.value)} required />
        </Field>
        <Field label="Trilha" hint="Quem for aprovado entra no próximo grau desta trilha.">
          <Select value={track} onChange={(e) => setTrack(e.target.value as RankTrack)} disabled={!!event}>
            {RANK_TRACKS.map((t) => (
              <option key={t} value={t}>{TRACK_LABEL[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Título (opcional)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: Graduação de dezembro" />
        </Field>
        <Field label="Observações (opcional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
        </Field>
      </form>
    </Dialog>
  )
}
