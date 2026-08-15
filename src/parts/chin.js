// Hoyuelo de la barbilla. Va en la PUNTA del mentón, no en la boca.
//
// La × estaba dentro de mouth.js como tipo de boca "cosida" por una lectura mía
// equivocada de las referencias: es un rasgo de barbilla que Jorge dibuja casi siempre,
// y no tiene nada que ver con la boca. Módulo aparte porque se coloca aparte y varía
// aparte.

import { interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  type: {
    options: ['x', 'crease', 'none'],
    pool: { x: 4, crease: 2, none: 2 },
    label: 'Tipo',
  },
  size: { min: 0.008, max: 0.10, range: [0.018, 0.045], step: 0.002, label: 'Tamaño' },
  offsetY: { min: 0.80, max: 1.0, range: [0.90, 0.97], step: 0.005, label: 'Altura (punta)' },
  offsetX: { min: -0.08, max: 0.08, range: [-0.02, 0.02], step: 0.005, label: 'Descentrado' },
  rotation: { min: -45, max: 45, range: [-12, 12], step: 1, unit: '°', label: 'Giro' },
}

export const randomize = randomizerFor(PARAMS)

export function draw(ctx, faceBox, p, palette, rng) {
  if (p.type === 'none') return

  const cx = faceBox.cx + faceBox.w * p.offsetX
  const cy = faceBox.y + faceBox.h * p.offsetY
  const s = faceBox.w * p.size

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((p.rotation * Math.PI) / 180)

  const path = new Path2D()
  if (p.type === 'x') {
    path.moveTo(-s, -s)
    path.lineTo(s, s)
    path.moveTo(s, -s)
    path.lineTo(-s, s)
  } else {
    path.moveTo(0, -s)
    path.lineTo(0, s)
  }

  interior(ctx, palette, 0.8)
  ctx.stroke(path)
  ctx.restore()
}
