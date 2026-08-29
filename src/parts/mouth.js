// Boca: pequeña y mínima. El cigarrillo NO es un caso raro — sale en 2 de las 3 cabezas
// de referencia, así que pesa alto en el randomize. Cuando lo hay, devuelve el punto
// emisor para las partículas de humo de rig.js.

import { interior, outline } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  // La × NO es una boca: es el hoyuelo de la barbilla, y vive en chin.js, en la punta
  // del mentón. Estaba aquí por una lectura mía equivocada de las referencias.
  // `labios` es la boca de las referencias de mujer: labio superior bilobulado y
  // panza inferior, tinta plana. Por defecto no sale — lo reparte el arquetipo.
  type: {
    options: ['line', 'frown', 'tiny-o', 'labios'],
    pool: { line: 3, frown: 2, 'tiny-o': 1, labios: 0 },
    label: 'Tipo',
  },
  lipFull: { min: 0.3, max: 1.1, range: [0.55, 0.9], step: 0.05, label: 'Carnosidad' },
  // la geisha los lleva rojos (acento); la morada, de tinta
  lipInk: { options: ['tinta', 'acento'], pool: { tinta: 3, acento: 1 }, label: 'Color de labios' },
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

// Lo que cae el cigarrillo cuando se despega del labio, en grados. Hacia abajo: colgando.
const CIG_DROP_ANGLE = 25

/**
 * `moodCurve` (−1..+1) y `moodOpen` (0..1) son los canales de ánimo del rig, como los
 * moodTilt/moodLift de las cejas: deltas SOBRE el tipo base del personaje, solo dibujo.
 * Convención de curva: positivo = el centro BAJA (sonrisa ⌣), negativo = sube (mueca ⌢).
 * Con cigarrillo, los labios lo sujetan: en la DERIVA la apertura se anula y la curva se
 * atenúa — el fumador expresa con las cejas, y así la punta (y el humo) no se mueve.
 *
 * `cigDrop` (0..1) es lo que rompe ese trato, y solo lo abre una REACCIÓN: el cigarrillo
 * se despega del labio y cae 25°, y la boca puede abrirse por debajo. Sin esto, la mitad
 * de las caras —el cigarro sale en 2 de cada 3 referencias— se quedaban sin reacción de
 * boca justo cuando más se las estaba mirando. Sin cigarrillo el canal no pinta nada.
 */
export function draw(ctx, faceBox, p, palette, rng) {
  const mx = faceBox.cx + faceBox.w * p.offsetX
  const my = faceBox.y + faceBox.h * p.offsetY
  const w = faceBox.w * p.width

  const drop = p.cigarette ? Math.min(1, Math.max(0, p.cigDrop ?? 0)) : 0
  const open = p.cigarette ? (p.moodOpen ?? 0) * drop : (p.moodOpen ?? 0)
  const curve = (p.moodCurve ?? 0) * (p.cigarette ? 0.4 : 1)

  interior(ctx, palette, p.lineWeight)

  const path = new Path2D()
  if (p.type === 'labios') {
    // Tinta plana sin contorno, como las masas. El ánimo tuerce las COMISURAS
    // (curve > 0 las sube: sonrisa) y la apertura hincha la panza inferior — un
    // labio de verdad no se abre en O sin romper el dibujo.
    // Más anchos que la boca de línea: en la referencia morada los labios ocupan
    // bastante más que la boquita mínima de los hombres.
    const lw = w * 1.45
    const hUp = lw * 0.17 * p.lipFull
    const hLo = lw * 0.24 * p.lipFull * (1 + open * 0.45)
    const yC = -curve * lw * 0.18 // las comisuras
    path.moveTo(-lw / 2 + mx, my + yC)
    path.quadraticCurveTo(mx - lw * 0.3, my - hUp, mx - lw * 0.09, my - hUp * 0.82)
    path.quadraticCurveTo(mx, my - hUp * 0.45, mx + lw * 0.09, my - hUp * 0.82)
    path.quadraticCurveTo(mx + lw * 0.3, my - hUp, mx + lw / 2, my + yC)
    path.quadraticCurveTo(mx + lw * 0.26, my + hLo, mx, my + hLo)
    path.quadraticCurveTo(mx - lw * 0.26, my + hLo, mx - lw / 2, my + yC)
    path.closePath()
    ctx.fillStyle = p.lipInk === 'acento' ? palette.accent : palette.line
    ctx.fill(path)
  } else if (p.type === 'tiny-o') {
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
  // los labios van sin contorno (son masa, como el pelo); el resto de bocas son línea
  if (p.type !== 'labios') ctx.stroke(path)

  if (!p.cigarette) return { smoke: null }

  // cigarrillo: palito blanco con punta de acento, saliendo de la comisura.
  // Al despegarse cae 25°: es el gesto: la boca se abre y el pitillo se descuelga.
  const a = ((p.cigAngle + CIG_DROP_ANGLE * drop) * Math.PI) / 180
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
