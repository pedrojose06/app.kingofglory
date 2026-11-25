'use client'

// Recorte do rosto direto da foto guardada (URL assinada), pela caixa normalizada salva no banco: nada de outra imagem.

import { useState } from 'react'

export interface FaceThumbProps {
  /** URL da foto inteira. */
  src: string | null | undefined
  /** Caixa do rosto normalizada (0..1). Sem caixa, mostra a foto inteira. */
  bbox: { x: number; y: number; w: number; h: number } | null | undefined
  /** Lado do quadrado em px. */
  size?: number
  alt?: string
  className?: string
}

export function FaceThumb({ src, bbox, size = 72, alt = 'Rosto', className }: FaceThumbProps) {
  const [aspect, setAspect] = useState<number | null>(null) // altura / largura da foto
  const box = `relative shrink-0 overflow-hidden rounded bg-surface-2 ${className ?? ''}`
  if (!src) return <div className={box} style={{ width: size, height: size }} aria-hidden />

  if (!bbox) {
    return (
      <div className={box} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      </div>
    )
  }

  // Quadrado com 1,6× o lado maior do rosto, centrado nele (como o recorte da revisão).
  const ratio = aspect ?? 1
  const sidePx = Math.max(bbox.w, bbox.h * ratio) * 1.6 // em larguras da foto
  const imgW = size / sidePx
  const imgH = imgW * ratio
  const left = size / 2 - (bbox.x + bbox.w / 2) * imgW
  const top = size / 2 - (bbox.y + bbox.h / 2) * imgH

  return (
    <div className={box} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget
          if (w && h) setAspect(h / w)
        }}
        style={{ position: 'absolute', width: imgW, height: imgH, left, top, maxWidth: 'none', opacity: aspect ? 1 : 0 }}
      />
    </div>
  )
}
