'use client'

import { Card } from '@kog/ui'
import { CalendarDays, FileSignature, Users, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { useAcademy } from '@/lib/academy'

const ROADMAP = [
  { icon: Users, title: 'Cadastros e matrículas', text: 'Alunos, responsáveis, planos, turmas e contratos de matrícula com as parcelas geradas.' },
  { icon: Wallet, title: 'Mensalidades', text: 'Em aberto, atrasados e pagos por mês, baixa com forma de pagamento e exportação.' },
  { icon: CalendarDays, title: 'Diários de aula', text: 'Grade da semana com presentes por aula e a chamada de cada turma.' },
  { icon: FileSignature, title: 'Contratos', text: 'Termo de uso do espaço e de imagem, assinado no sistema com trilha de evidência.' },
]

export default function DashboardPage() {
  const { academy, role } = useAcademy()

  if (role === 'membro') {
    return (
      <>
        <PageHeader kicker={academy.name} title="Minha área" />
        <Card className="p-5">
          <p className="font-bold text-text">Em breve, aqui</p>
          <p className="mt-1 text-sm text-soft">Você vai preencher os seus dados, assinar o contrato e acompanhar as suas mensalidades.</p>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader kicker={academy.name} title="Painel" />
      <Card className="p-5">
        <p className="font-bold text-text">O painel chega junto com os módulos</p>
        <p className="mt-1 text-sm text-soft">
          Contratos com pendência, cobranças em atraso, resumo do mês e aulas do dia aparecem aqui assim que os cadastros e o
          financeiro estiverem no ar. A ordem de entrega:
        </p>
      </Card>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROADMAP.map(({ icon: Icon, title, text }, i) => (
          <li key={title}>
            <Card className="flex h-full gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-accent">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="kicker">Etapa {i + 1}</p>
                <p className="mt-1 font-bold text-text">{title}</p>
                <p className="mt-1 text-sm text-soft">{text}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </>
  )
}
