'use client'

// Quadro para assinar com o dedo (ou mouse). Fundo sempre branco e traço escuro, nos dois temas: a assinatura vai
// para o PDF e precisa ficar como no papel. Devolve um PNG (data URL) recortado na área assinada; '' = em branco.

import { Button } from '@kog/ui'
import { Eraser } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Largura máxima do PNG guardado (px): nítido no PDF e leve para o banco. */
const MAX_OUT_WIDTH = 900

export function SignaturePad({ onChange, invalid }: { onChange: (png: string) => void; invalid?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const bounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // Tamanho real do canvas = tamanho na tela × densidade (traço nítido). Redimensionar apaga: só no início.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.4
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const grow = (p: { x: number; y: number }) => {
    const b = bounds.current
    bounds.current = b
      ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }
      : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = point(e)
    last.current = p
    grow(p)
    // Um toque sem arrastar vira um ponto.
    const ctx = e.currentTarget.getContext('2d')!
    ctx.beginPath()
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')!
    // Pontos intermediários que o navegador juntou num evento só: traço mais liso.
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]
    const rect = e.currentTarget.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
      ctx.lineTo(p.x, p.y)
      grow(p)
      last.current = p
    }
    ctx.stroke()
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const png = exportPng()
    setEmpty(!png)
    onChange(png)
  }

  /** Recorta a área assinada (com margem), em fundo branco. Rabisco muito pequeno conta como em branco. */
  function exportPng(): string {
    const canvas = canvasRef.current
    const b = bounds.current
    if (!canvas || !b) return ''
    const w = b.maxX - b.minX
    const h = b.maxY - b.minY
    if (w < 24 && h < 24) return ''
    const scale = canvas.width / canvas.getBoundingClientRect().width
    const pad = 8
    const sx = Math.max(0, (b.minX - pad) * scale)
    const sy = Math.max(0, (b.minY - pad) * scale)
    const sw = Math.min(canvas.width - sx, (w + 2 * pad) * scale)
    const sh = Math.min(canvas.height - sy, (h + 2 * pad) * scale)
    const k = Math.min(1, MAX_OUT_WIDTH / sw)
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(sw * k))
    out.height = Math.max(1, Math.round(sh * k))
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    bounds.current = null
    setEmpty(true)
    onChange('')
  }

  return (
    <div>
      <div className={`relative overflow-hidden rounded-lg border-2 bg-white ${invalid ? 'border-danger' : 'border-line-strong'}`}>
        <canvas
          ref={canvasRef}
          aria-label="Quadro de assinatura: assine com o dedo"
          className="block h-44 w-full cursor-crosshair touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {/* Linha de base, como no papel. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-gray-400" />
        {empty ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-gray-500">Assine aqui com o dedo</p>
        ) : null}
      </div>
      <div className="mt-1.5 flex justify-end">
        <Button variant="plain" size="sm" onPress={clear} disabled={empty}>
          <Eraser className="size-4" /> Limpar
        </Button>
      </div>
    </div>
  )
}
