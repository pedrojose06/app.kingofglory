import type { ClassPhoto, Db } from '../types'
import { unwrap } from './util'

export const PHOTO_BUCKET = 'class-photos'

export const photoPath = (gymId: string, classId: string, photoId: string) => `${gymId}/${classId}/${photoId}.jpg`

export async function listClassPhotos(db: Db, classId: string): Promise<ClassPhoto[]> {
  return unwrap(await db.from('class_photos').select('*').eq('class_id', classId).order('taken_at'))
}

export interface PhotoUpload {
  id: string
  gym_id: string
  class_id: string
  taken_at: string
}

/** Idempotente: o id e o caminho são gerados no cliente, então repetir o envio não duplica. */
export async function uploadClassPhoto(db: Db, meta: PhotoUpload, file: Blob): Promise<void> {
  const path = photoPath(meta.gym_id, meta.class_id, meta.id)
  const up = await db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: true })
  if (up.error) throw up.error
  unwrap(
    await db
      .from('class_photos')
      .upsert({ id: meta.id, class_id: meta.class_id, storage_path: path, taken_at: meta.taken_at }, { onConflict: 'id', ignoreDuplicates: true }),
  )
}

export async function signPhotoUrls(db: Db, paths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresInSeconds)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

export async function deleteClassPhoto(db: Db, photo: ClassPhoto): Promise<void> {
  unwrap(await db.from('class_photos').delete().eq('id', photo.id))
  await db.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
}
