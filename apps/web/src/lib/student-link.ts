// Link da área do aluno guardado no aparelho: com o app instalado, abrir pela Tela de Início
// (que começa em "/") leva o aluno direto às presenças dele.
const KEY = 'kog-student-token'

export function getStoredStudentToken(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function storeStudentToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(KEY, token)
    else window.localStorage.removeItem(KEY)
  } catch {
    // Sem storage (aba anônima): só não lembra o link.
  }
}
