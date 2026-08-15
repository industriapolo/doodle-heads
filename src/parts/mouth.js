// Boca: pequeña y mínima. El cigarrillo NO es un caso raro — sale en 2 de las 3 cabezas
// de referencia, así que pesa alto en el randomize. Cuando lo hay, devuelve el punto
// emisor para las partículas de humo de rig.js.

import { interior, outline } from '../style/stroke.js'

export const PARAMS = {
  type: { options: ['line', 'frown', 'tiny-o', 'stitch'], default: 'line', label: 'Tipo' },
  width: { min: 0.03, max: 0.24, default: 0.10, step: 0.005, label: 'Ancho' },
  offsetY: { min: 0.68, max: 0.96, default: 0.84, step: 0.01, label: 'Altura' },
  offsetX: { min: -0.14, max: 0.14, default: 0, step: 0.01, label: 'Descentrado' },
  cigarette: { type: 'bool', default: false, label: 'Cigarrillo' },
  cigAngle: { min: -10, max: 55, default: 28, step: 1, unit: '°', label: 'Ángulo del cigarro' },
  cigLength: { min: 0.08, max: 0.30, default: 0.18, step: 0.01, label: 'Largo del cigarro' },
}

export function randomize(rng) {
  return {
    type: rng.weighted({ line: 3, frown: 2, 'tiny-o': 1, stitch: 2 }),
    width: rng.range(0.05, 0.18),
    offsetY: rng.range(0.76, 0.92),
    offsetX: rng.range(-0.10, 0.10),
    cigarette: rng.chance(0.45), // firma de estilo, no excepción
    cigAngle: rng.range(8, 45),
    cigLength: rng.range(0.11, 0.26),
    stitchCount: rng.int(1, 2),
  }
}

export function draw(ctx, faceBox, p, palette, rng) {
  const mx = faceBox.cx + faceBox.w * p.offsetX
  const my = faceBox.y + faceBox.h * p.offsetY
  const w = faceBox.w * p.width

  interior(ctx, palette)

  const path = new Path2D()
  switch (p.type) {
    case 'frown':
      path.moveTo(mx - w / 2, my)
      path.quadraticCurveTo(mx, my + w * 0.55, mx + w / 2, my)
      break
    case 'tiny-o':
      path.ellipse(mx, my, w * 0.36, w * 0.44, 0, 0, Math.PI * 2)
      break
    case 'stitch': {
      // la x cosida de las imágenes 2 y 3
      const s = w * 0.36
      path.moveTo(mx - s, my - s)
      path.lineTo(mx + s, my + s)
      path.moveTo(mx + s, my - s)
      path.lineTo(mx - s, my + s)
      break
    }
    default:
      path.moveTo(mx - w / 2, my)
      path.lineTo(mx + w / 2, my)
  }
  ctx.stroke(path)

  if (!p.cigarette) return { smoke: null }

  // cigarrillo: palito blanco con punta de acento, saliendo de la comisura
  const a = (p.cigAngle * Math.PI) / 180
  const len = faceBox.w * p.cigLength
  const thick = Math.max(5, faceBox.w * 0.022)
  const x0 = mx + w * 0.45
  const y0 = my + w * 0.12
  const x1 = x0 + Math.cos(a) * len
  const y1 = y0 + Math.sin(a) * len

  ctx.save()
  ctx.lineCap = 'butt'
  outline(ctx, palette, 1)
  ctx.strokeStyle = palette.line
  ctx.lineWidth = thick + 4
  strokeSeg(ctx, x0, y0, x1, y1)
  ctx.strokeStyle = palette.accent2
  ctx.lineWidth = thick
  strokeSeg(ctx, x0, y0, x1, y1)
  // ascua
  const tipLen = len * 0.16
  ctx.strokeStyle = palette.accent
  strokeSeg(ctx, x1 - Math.cos(a) * tipLen, y1 - Math.sin(a) * tipLen, x1, y1)
  ctx.restore()

  return { smoke: { x: x1, y: y1 } }
}

function strokeSeg(ctx, x0, y0, x1, y1) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}
