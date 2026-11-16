import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'

/** Extensões do documento do plano de aula: as mesmas no editor e na leitura pelo link compartilhado. */
export const planExtensions = () => [
  StarterKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Details.configure({ persist: true, HTMLAttributes: { class: 'details' } }),
  DetailsSummary,
  DetailsContent,
]
