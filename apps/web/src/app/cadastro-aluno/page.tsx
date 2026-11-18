'use client'

import {
  RANK_TRACKS, STUDENT_PORTAL_PATH, TRACK_LABEL, getProfile, getSignupDirectory, getSignupRanks, keys, requestStudentAccess, studentSignupMetadata,
  todayISO, trackOf, uploadSignupPhoto, type DirectoryProfessor,
} from '@kog/core'
import { Button, Card, Chip, DateInput, EmptyState, Field, Input, Kicker, Select, cn } from '@kog/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LogOut, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { FacePhotoField, storePendingFace } from '@/components/face-photo'
import { InstallPrompt } from '@/components/install-prompt'
import { Loading } from '@/components/shell'
import { useAuth } from '@/lib/auth'
import { db, isConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/toast'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Cadastro do aluno sem link: escolhe o professor, a academia e cria a conta. A conta fica aguardando o professor
 * aprovar. Com o link do professor o caminho é outro (ligação imediata), em /minhas-presencas.
 */
export default function StudentSignupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, ready } = useAuth()
  const directory = useQuery({ queryKey: keys.signupDirectory, queryFn: () => getSignupDirectory(db()), enabled: isConfigured, networkMode: 'online' })
  const ranks = useQuery({ queryKey: keys.signupRanks, queryFn: () => getSignupRanks(db()), enabled: isConfigured, networkMode: 'online', staleTime: 60 * 60_000 })
  const profile = useQuery({
    queryKey: [...keys.profile, session?.user.id],
    queryFn: () => getProfile(db(), session!.user.id),
    enabled: !!session,
    networkMode: 'online',
  })

  const [search, setSearch] = useState('')
  const [professor, setProfessor] = useState<DirectoryProfessor | null>(null)
  const [gymId, setGymId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoMissing, setPhotoMissing] = useState(false)
  const [rankId, setRankId] = useState('') // vazio = sem graduação
  const [graduatedAt, setGraduatedAt] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const list = useMemo(() => {
    const q = norm(search.trim())
    return (directory.data ?? []).filter((p) => !q || norm(p.name).includes(q) || p.gyms.some((g) => norm(g.name).includes(q)))
  }, [directory.data, search])

  function pickProfessor(p: DirectoryProfessor) {
    setProfessor(p)
    setGymId(p.gyms.length === 1 ? p.gyms[0]!.id : null)
    setMessage(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!gymId) return setMessage({ text: 'Escolha a academia.', error: true })
    if (rankId && !graduatedAt) return setMessage({ text: 'Informe a data da sua última graduação.', error: true })
    if (rankId && graduatedAt > todayISO()) return setMessage({ text: 'A data da última graduação não pode ser no futuro.', error: true })
    if (!photo) {
      setPhotoMissing(true)
      return setMessage({ text: 'Tire uma foto do seu rosto.', error: true })
    }
    if (!session && password !== password2) return setMessage({ text: 'As senhas não são iguais.', error: true })
    setBusy(true)
    setMessage(null)
    setExisting(false)
    try {
      if (session) {
        await requestStudentAccess(db(), { gymId, name, phone, rankId: rankId || null, graduatedAt: rankId ? graduatedAt : null })
        await sendPhoto(session.user.id, photo)
        await queryClient.invalidateQueries({ queryKey: keys.mySignupRequest })
        router.replace(STUDENT_PORTAL_PATH)
        return
      }
      const { data, error } = await db().auth.signUp({
        email,
        password,
        options: { data: studentSignupMetadata({ name, gymId, phone, rankId: rankId || null, graduatedAt: rankId ? graduatedAt : null }), emailRedirectTo: `${window.location.origin}${STUDENT_PORTAL_PATH}` },
      })
      if (error) throw error
      // E-mail já cadastrado: o Supabase responde "ok" sem criar nada nem mandar e-mail (identities vazio).
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setExisting(true)
        return
      }
      if (data.session && data.user) {
        await sendPhoto(data.user.id, photo)
        router.replace(STUDENT_PORTAL_PATH)
        return
      }
      // Sem sessão até confirmar o e-mail: a foto sobe no primeiro acesso.
      await storePendingFace(photo)
      setMessage({ text: `Conta criada! Confirme pelo link que enviamos para ${email}. Depois é só aguardar o professor aprovar.`, error: false })
    } catch (error) {
      const text = errorMessage(error)
      if (/already registered/i.test(text)) setExisting(true)
      else setMessage({ text, error: true })
    } finally {
      setBusy(false)
    }
  }

  // Conta/pedido já criados: se o envio da foto falhar, ela fica no aparelho e a área do aluno tenta de novo.
  async function sendPhoto(userId: string, blob: Blob) {
    await storePendingFace(blob)
    try {
      await uploadSignupPhoto(db(), userId, blob)
      await storePendingFace(null)
    } catch {
      // A área do aluno mostra "Falta sua foto" e reenvia.
    }
  }

  const isProfessor = profile.data?.role === 'instructor'

  return (
    <main className="mx-auto max-w-sm px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto rounded-full ring-1 ring-line-strong" />
        <Kicker className="mt-4">King of Glory Academy</Kicker>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-[0.02em] text-accent">Criar conta de aluno</h1>
      </div>

      {!ready || (session && profile.isPending) ? (
        <Loading />
      ) : isProfessor ? (
        <div className="mt-8">
          <EmptyState title="Você está logado como professor">Para criar uma conta de aluno, saia e use outro e-mail.</EmptyState>
          <Button variant="ghost" block className="mt-4" onPress={() => void db().auth.signOut().then(() => queryClient.clear())}>
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <section>
            <p className="kicker mb-2">1. Seu professor</p>
            {professor ? (
              <Card className="flex items-center gap-3 p-3">
                <Check className="size-5 shrink-0 text-success" />
                <span className="min-w-0 flex-1 truncate font-medium text-text">{professor.name}</span>
                <Button variant="plain" size="sm" onPress={() => { setProfessor(null); setGymId(null) }}>Trocar</Button>
              </Card>
            ) : directory.isPending ? (
              <Loading />
            ) : directory.isError ? (
              <p className="text-sm text-danger">Não foi possível carregar os professores. Confira a internet.</p>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar professor ou academia" className="pl-9" />
                </div>
                <Card className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
                  {list.length === 0 ? (
                    <p className="p-3 text-sm text-dim">Nenhum professor encontrado.</p>
                  ) : (
                    list.map((p) => (
                      <button key={p.id} type="button" onClick={() => pickProfessor(p)} className="block w-full px-3 py-2.5 text-left active:bg-tint">
                        <span className="block font-medium text-text">{p.name}</span>
                        <span className="block truncate text-xs text-dim">{p.gyms.map((g) => g.name).join(' · ')}</span>
                      </button>
                    ))
                  )}
                </Card>
              </>
            )}
          </section>

          {professor ? (
            <section>
              <p className="kicker mb-2">2. Onde você treina</p>
              <div className="flex flex-wrap gap-2">
                {professor.gyms.map((g) => (
                  <Chip key={g.id} active={gymId === g.id} onPress={() => setGymId(g.id)}>{g.name}</Chip>
                ))}
              </div>
            </section>
          ) : null}

          {professor && gymId ? (
            <section className="space-y-3">
              <p className="kicker">3. Seus dados</p>
              <Field label="Nome completo" hint="Como o professor te conhece, para ele te encontrar na lista.">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </Field>
              <Field label="Foto do rosto" hint="Obrigatória. De frente, sem boné nem óculos escuros, para o professor saber quem é você.">
                <FacePhotoField value={photo} onChange={(b) => { setPhoto(b); setPhotoMissing(false) }} invalid={photoMissing} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Graduação atual">
                  <Select value={rankId} onChange={(e) => { setRankId(e.target.value); if (!e.target.value) setGraduatedAt('') }}>
                    <option value="">Sem graduação</option>
                    {RANK_TRACKS.map((t) => {
                      const options = (ranks.data ?? []).filter((r) => trackOf(r) === t)
                      return options.length > 0 ? (
                        <optgroup key={t} label={TRACK_LABEL[t]}>
                          {options.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </optgroup>
                      ) : null
                    })}
                  </Select>
                </Field>
                <Field label="Última graduação">
                  <DateInput value={graduatedAt} onChange={(e) => setGraduatedAt(e.target.value)} max={todayISO()} disabled={!rankId} required={!!rankId} />
                </Field>
              </div>
              <Field label="WhatsApp (opcional)">
                <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </Field>
              {!session ? (
                <>
                  <Field label="E-mail (será seu login)" hint="É com este e-mail e a senha abaixo que você vai entrar no app.">
                    <Input type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setExisting(false) }} autoComplete="email" required />
                  </Field>
                  <Field label="Senha" hint="Mínimo de 8 caracteres.">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                  </Field>
                  <Field label="Confirme a senha">
                    <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" minLength={8} required />
                  </Field>
                  {password2 && password !== password2 ? <p className="text-sm text-danger">As senhas não são iguais.</p> : null}
                </>
              ) : null}
              {existing ? (
                <Card className="border-warning p-3 text-sm text-text">
                  O e-mail {email} já tem conta no app. Entre com ele (e a senha dele) e, se ainda não tiver acesso, toque em
                  “Pedir acesso ao professor”.
                  <Link href={STUDENT_PORTAL_PATH} className="mt-2 block font-bold text-accent underline underline-offset-2">Entrar com {email}</Link>
                </Card>
              ) : null}
              {message ? <p className={cn('text-sm', message.error ? 'text-danger' : 'text-success')}>{message.text}</p> : null}
              <Button type="submit" size="lg" block loading={busy}>{session ? 'Enviar pedido' : 'Criar conta'}</Button>
              <p className="text-xs text-dim">O professor recebe seu pedido e confirma quem você é. Depois disso você acessa suas presenças.</p>
            </section>
          ) : null}
        </form>
      )}

      <p className="mt-8 text-center text-sm text-dim">
        Já tem conta? <Link href={STUDENT_PORTAL_PATH} className="font-medium text-accent underline underline-offset-2">Entrar</Link>
      </p>
      <InstallPrompt bottomNav={false} />
    </main>
  )
}
