'use client'

import { describeOp } from '@kog/core'
import { Button, Card, EmptyState } from '@kog/ui'
import { Page } from '@/components/shell'
import { outbox, useOnline, useOutbox, useOutboxSyncing } from '@/lib/outbox'

export default function SyncPage() {
  const items = useOutbox()
  const online = useOnline()
  const syncing = useOutboxSyncing()
  const failed = items.filter((i) => i.error)

  return (
    <Page title="Sincronização" kicker={online ? 'Conectado' : 'Sem conexão'} back>
      {items.length === 0 ? (
        <EmptyState title="Tudo sincronizado">Nenhuma alteração pendente neste aparelho.</EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-soft">
            {items.length} {items.length === 1 ? 'alteração guardada' : 'alterações guardadas'} neste aparelho.{' '}
            {online ? 'Elas são enviadas automaticamente.' : 'Serão enviadas quando a conexão voltar.'}
          </p>
          <Button block loading={syncing} disabled={!online} onPress={() => outbox.retry()}>Sincronizar agora</Button>

          <Card className="mt-4 divide-y divide-line">
            {items.map((i) => (
              <div key={i.id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{describeOp(i.op)}</span>
                  <span className="shrink-0 text-xs text-dim">
                    {new Date(i.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {i.error ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-xs text-danger">Recusado pelo servidor: {i.error}</p>
                    <Button size="sm" variant="ghost" onPress={() => outbox.retry(i.id)}>Tentar</Button>
                    <Button size="sm" variant="danger" onPress={() => window.confirm('Descartar esta alteração?') && outbox.discard(i.id)}>Descartar</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
          {failed.length > 0 ? <p className="mt-3 text-xs text-dim">Itens recusados ficam aqui até você tentar de novo ou descartar; os demais continuam sendo enviados.</p> : null}
        </>
      )}
    </Page>
  )
}
