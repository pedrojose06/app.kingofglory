'use client'

import { exportAll } from '@kog/core'
import { Button, Card, Chip } from '@kog/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Award, BarChart3, GraduationCap, UserPlus, BellRing, Building2, ChevronRight, Download, FilePen, FileUp, History, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Section } from '@/components/common'
import { Page } from '@/components/shell'
import { useAuth } from '@/lib/auth'
import { useOutbox } from '@/lib/outbox'
import { useProfile } from '@/lib/queries'
import { disablePush } from '@/lib/push'
import { db } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

const LINKS = [
  { href: '/academias', label: 'Academias e grade semanal', icon: Building2 },
  { href: '/graus', label: 'Graus e requisitos de graduação', icon: Award },
  { href: '/modelo-plano', label: 'Modelo do plano de aula', icon: FilePen },
  { href: '/lembretes', label: 'Lembretes de chamada e plano de aula', icon: BellRing },
  { href: '/relatorios', label: 'Relatórios de frequência', icon: BarChart3 },
  { href: '/professores', label: 'Convidar professor', icon: UserPlus },
  { href: '/minhas-presencas', label: 'Minha área de aluno (onde eu treino)', icon: GraduationCap },
  { href: '/historico', label: 'Histórico de aulas', icon: History },
  { href: '/importar', label: 'Importar presenças (InClass)', icon: FileUp },
  { href: '/sync', label: 'Sincronização', icon: RefreshCw },
] as const

type Theme = 'system' | 'light' | 'dark'

export default function MorePage() {
  const { session } = useAuth()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const pending = useOutbox().length
  const [theme, setTheme] = useState<Theme>('system')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('kog-theme')
    setTheme(saved === 'light' || saved === 'dark' ? saved : 'system')
  }, [])

  function applyTheme(next: Theme) {
    setTheme(next)
    if (next === 'system') {
      localStorage.removeItem('kog-theme')
      delete document.documentElement.dataset.theme
    } else {
      localStorage.setItem('kog-theme', next)
      document.documentElement.dataset.theme = next
    }
  }

  async function runExport() {
    setExporting(true)
    try {
      for (const file of await exportAll(db())) {
        const url = URL.createObjectURL(new Blob([file.content], { type: 'text/csv;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
      toast('Exportação concluída: 3 arquivos CSV')
    } catch (error) {
      toastError(error)
    } finally {
      setExporting(false)
    }
  }

  async function signOut() {
    if (pending > 0 && !window.confirm(`Há ${pending} alterações ainda não sincronizadas. Sair mesmo assim? Elas ficam guardadas neste aparelho.`)) return
    // Quem sai deixa de receber lembretes neste aparelho.
    await disablePush().catch(() => {})
    await db().auth.signOut()
    queryClient.clear()
  }

  return (
    <Page title="Mais" kicker={profile.data?.name || session?.user.email || ''}>
      <Card className="divide-y divide-line">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-3 px-4 active:bg-tint">
            <Icon className="size-5 text-accent" />
            <span className="flex-1 text-sm font-medium text-text">{label}</span>
            {href === '/sync' && pending > 0 ? <span className="text-xs font-bold text-accent">{pending}</span> : null}
            <ChevronRight className="size-4 text-faint" />
          </Link>
        ))}
      </Card>

      <Section title="Cópia dos dados">
        <Button variant="ghost" block loading={exporting} onPress={runExport}><Download className="size-4" /> Exportar tudo (CSV)</Button>
        <p className="mt-2 text-xs text-dim">Baixa alunos, presenças e graduações. Guarde uma cópia de tempos em tempos.</p>
      </Section>

      <Section title="Tema">
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Chip key={t} active={theme === t} onPress={() => applyTheme(t)} className="flex-1">
              {t === 'system' ? 'Sistema' : t === 'light' ? 'Claro' : 'Escuro'}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Conta">
        <p className="mb-2 text-sm text-dim">{session?.user.email}</p>
        <Button variant="danger" block onPress={signOut}>Sair</Button>
      </Section>
    </Page>
  )
}
