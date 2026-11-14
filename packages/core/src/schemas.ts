import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const gymInput = z.object({
  name: z.string().trim().min(1, 'Informe o nome'),
  address: optionalText,
})
export type GymInput = z.infer<typeof gymInput>

export const studentInput = z.object({
  gym_id: z.uuid('Escolha a academia'),
  name: z.string().trim().min(2, 'Informe o nome'),
  phone: optionalText,
  birth_date: isoDate.nullable().optional(),
  notes: optionalText,
  started_on: isoDate.optional(),
  opening_after_grad: z.number().int().min(0).max(5000).nullable().optional(),
  track: z.enum(['adulto', 'infantil']).optional(),
  active: z.boolean().optional(),
})
export type StudentInput = z.infer<typeof studentInput>

export const scheduleInput = z.object({
  gym_id: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Horário inválido'),
  title: z.string().trim().min(1).default('Muay Thai'),
  starts_on: isoDate.optional(),
})
export type ScheduleInput = z.infer<typeof scheduleInput>

export const scheduleEditInput = z.object({
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Horário inválido'),
  title: z.string().trim().min(1, 'Informe o nome da aula'),
})

export const walkInInput = z.object({
  student_ids: z.array(z.uuid()).min(1, 'Escolha ao menos um aluno'),
  date: isoDate,
  location: z.string().trim().min(1, 'Informe o local'),
})
export type WalkInInput = z.infer<typeof walkInInput>

const nullableInt = (max: number) => z.number().int().min(0).max(max).nullable()
export const rankRequirementInput = z.object({
  min_months: nullableInt(240),
  required_classes: nullableInt(2000),
  min_percent: nullableInt(100),
  min_age: nullableInt(99).optional(),
})
export type RankRequirementInput = z.infer<typeof rankRequirementInput>

export const graduationInput = z.object({
  student_id: z.uuid(),
  rank_id: z.uuid('Escolha o grau'),
  graduated_at: isoDate,
  notes: optionalText,
})
export type GraduationInput = z.infer<typeof graduationInput>

/** Primeira mensagem de erro de um ZodError, para exibir em formulários simples. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos'
}
