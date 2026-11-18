'use client'

// Foto do cadastro do aluno como primeira referência: assim o aluno já é sugerido na primeira foto da turma.
// Roda no celular do professor, antes de analisar a foto da turma (precisa de internet para baixar a foto do
// cadastro). Só alunos com consentimento chegam aqui (face_signup_photos) e o banco confere de novo ao gravar.

import { addSignupFaceReference, listSignupFacePhotos, signFaceUrls, type StoredReference } from '@kog/core'
import { db } from '@/lib/supabase'
import { analyzePhoto, type FaceProgress } from './engine'

/** Fotos já tentadas sem rosto encontrado (por aparelho): não insistir a cada foto da turma. */
const TRIED_KEY = 'kog-signup-face-tried'

function readTried(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function markTried(key: string) {
  try {
    const tried = readTried()
    tried.add(key)
    localStorage.setItem(TRIED_KEY, JSON.stringify([...tried].slice(-500)))
  } catch {
    // sem armazenamento: só tenta de novo na próxima vez
  }
}

/** Calcula e grava as referências que faltam. Devolve as novas, para entrarem já na sugestão. Nunca lança. */
export async function bootstrapSignupReferences(gymId: string, onProgress?: (p: FaceProgress) => void): Promise<StoredReference[]> {
  const added: StoredReference[] = []
  try {
    const tried = readTried()
    const todo = (await listSignupFacePhotos(db(), gymId)).filter((p) => !tried.has(`${p.student_id}:${p.photo_path}`))
    if (todo.length === 0) return added
    const urls = await signFaceUrls(db(), todo.map((p) => p.photo_path), 600)
    for (const [i, item] of todo.entries()) {
      onProgress?.({ stage: 'signup', done: i, total: todo.length })
      const url = urls[item.photo_path]
      if (!url) continue
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const { faces } = await analyzePhoto(await res.blob(), undefined, { pad: 1.5 })
        // O rosto do aluno é o maior da selfie (pode ter alguém atrás).
        const face = [...faces].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0]
        if (!face) {
          markTried(`${item.student_id}:${item.photo_path}`)
          continue
        }
        const id = crypto.randomUUID()
        const embedding = face.embedding.map((v) => Math.round(v * 1e6) / 1e6)
        await addSignupFaceReference(db(), { student_id: item.student_id, id, embedding })
        added.push({ id, student_id: item.student_id, vector: face.embedding, created_at: new Date().toISOString() })
      } catch {
        // foto ou rede com problema: tenta de novo na próxima foto da turma
      }
    }
  } catch {
    // sem conexão ou sem permissão: segue só com as referências que já existem
  }
  return added
}
