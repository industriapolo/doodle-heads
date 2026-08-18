// Boca: pequeña y mínima. El cigarrillo NO es un caso raro — sale en 2 de las 3 cabezas
// de referencia, así que pesa alto en el randomize. Cuando lo hay, devuelve el punto
// emisor para las partículas de humo de rig.js.

import { interior, outline } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  // La × NO es una boca: es el hoyuelo de la barbilla, y vive en chin.js, en la punta
  // del mentón. Estaba aquí por una lectura mía equivocada de las referencias.
  type: {
    options: ['line', 'frown', 'tiny-o'],
    pool: { line: 3, frown: 2, 'tiny-o': 1 },
    label: 'Tipo',
  },
  width: { min: 0.03, max: 0.24, range: [0.05, 0.18], step: 0.005, label: 'Ancho' },
  offsetY: { min: 0.68, max: 0.96, range: [0.76, 0.92], step: 0.01, label: 'Altura' },
  offsetX: { min: -0.14, max: 0.14, range: [-0.1, 0.1], step: 0.01, label: 'Descentrado' },
  // firma de estilo, no excepción: sale en 2 de las 3 cabezas de referencia
  cigarette: { type: 'bool', p: 0.45, label: 'Probabilidad de cigarrillo' },
  cigAngle: { min: -10, max: 55, range: [8, 45], step: 1, unit: '°', label: 'Ángulo del cigarro' },
  cigLength: { min: 0.08, max: 0.30, range: [0.22, 0.27], step: 0.01, label: 'Largo del cigarro' },
  lineWeight: { min: 0.5, max: 12, range: [3.6, 3.6], step: 0.1, label: 'Grosor de línea' },
}

export const randomize = randomizerFor(PARAMS)

/**
 * `moodCurve` (−1..+1) y `moodOpen` (0..1) son los canales de ánimo del rig, como los
 * moodTilt/moodLift de las cejas: deltas SOBRE el tipo base del personaje, solo dibujo.
 * Convención de curva: positivo = el centro BAJA (sonrisa ⌣), negativo = sube (mueca ⌢).
 * Con cigarrillo, los labios lo sujetan: la apertura se anula y la curva se atenúa —
 * el fumador expresa con las cejas. Además así la punta (y el humo) no se mueve.
 */
export function draw(ctx, faceBox, p, palette, rng) {
  const mx = faceBox.cx + faceBox.w * p.offsetX
  const my = faceBox.y + faceBox.h * p.offsetY
  const w = faceBox.w * p.width

  const open = p.cigarette ? 0 : (p.moodOpen ?? 0)
  const curve = (p.moodCurve ?? 0) * (p.cigarette ? 0.4 : 1)

  interior(ctx, palette, p.lineWeight)

  const path = new Path2D()
  if (p.type === 'tiny-o') {
    // ya es una boca abierta: el ánimo solo la abre un poco más
    path.ellipse(mx, my, w * 0.36, w * 0.44 * (1 + open * 0.5), 0, 0, Math.PI * 2)
    ctx.fillStyle = palette.line
    ctx.fill(path)
  } else if (open > 0.06) {
    // apertura de sorpresa: la línea se convierte en un óvalo relleno que crece con
    // el canal — a poca apertura es casi la línea, a tope es un tiny-o
    path.ellipse(mx, my, w * (0.5 - 0.15 * open), w * (0.05 + 0.42 * open), 0, 0, Math.PI * 2)
    ctx.fillStyle = palette.line
    ctx.fill(path)
  } else {
    // la curva del tipo base ('frown') y la del ánimo son el MISMO número: el ánimo
    // empuja la que ya hay en vez de sustituirla
    const bow = (p.type === 'frown' ? 0.55 : 0) + curve * 0.55
    path.moveTo(mx - w / 2, my)
    if (Math.abs(bow) > 0.03) path.quadraticCurveTo(mx, my + w * bow, mx + w / 2, my)
    else path.lineTo(mx + w / 2, my)
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
  outline(ctx, palette, p.lineWeight)
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
