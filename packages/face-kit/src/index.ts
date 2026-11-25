// Reconhecimento facial no aparelho (YuNet + SFace em onnxruntime-web, num Web Worker), compartilhado pelo app do
// professor e pelo sistema da academia. A lógica pura (comparação, confiança, sugestões) fica em @kog/core.
export { analyzePhoto, cropFace, faceModelsCached, normalizeBox, warmUpFaceModels, FACE_ASSETS } from './engine'
export type { AnalyzedPhoto, FaceProgress } from './engine'
export { FaceReview } from './face-review'
export type { FaceReviewProps, FaceReviewSave, FaceReviewTarget, FaceReviewWalkIn } from './face-review'
export { ORT_VERSION } from './assets'
export { FaceThumb } from './face-thumb'
export type { FaceThumbProps } from './face-thumb'
