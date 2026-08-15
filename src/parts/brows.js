// Cejas: rectángulos macizos. El parámetro emocional principal y, medido contra las
// referencias, el rasgo que más varía entre personajes — de ahí que `width` sea param
// de pleno derecho y no una constante.
//
// Todas las medidas son fracciones del `faceBox` (ancho = ancho de cabeza).

import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  preset: {
    options: ['neutral', 'cansado', 'molesto', 'sorpresa'],
    pool: { neutral: 3, cansado: 3, molesto: 2, sorpresa: 1 },
    label: 'Expresión',
  },
  width: { min: 0.20, max: 0.50, range: [0.22, 0.47], step: 0.01, label: 'Ancho de ceja' },
  thickness: { min: 0.05, max: 0.20, range: [0.06, 0.17], step: 0.005, label: 'Grosor' },
  gap: { min: 0, max: 0.18, range: [0.115, 0.18], step: 0.005, label: 'Separación' },
  offsetY: { min: 0.02, max: 0.32, range: [0.04, 0.27], step: 0.01, label: 'Altura' },
  tilt: { min: -20, max: 20, range: [-14, 15], step: 1, unit: '°', label: 'Inclinación extra' },
  asymmetry: { min: 0, max: 12, range: [0.5, 9], step: 0.5, unit: '°', label: 'Asimetría' },
  // Fracción del grosor de la ceja, para que escale con ella. 0 la quita.
  shadow: { min: 0, max: 1.2, range: [0.25, 0.5], step: 0.05, label: 'Sombra proyectada (× grosor)' },
}

// Convención: tilt positivo = extremo INTERIOR hacia abajo (cara de cabreo).
export const PRESETS = {
  neutral: { tilt: 0 },
  cansado: { tilt: -13 }, // extremo exterior caído
  molesto: { tilt: 13 }, // extremo interior caído
  sorpresa: { tilt: -4, offsetY: 0.04 }, // cejas arriba del todo
}

export const randomize = randomizerFor(PARAMS)

/** Geometría sin dibujar. El pelo la necesita para saber dónde parar. */
export function build(faceBox, p) {
  const preset = PRESETS[p.preset] || null
  // el tilt del preset marca la expresión; `tilt` es la variación individual encima
  const tilt = (preset?.tilt ?? 0) + p.tilt
  const offsetY = preset?.offsetY ?? p.offsetY

  const gap = faceBox.w * p.gap
  // el par de cejas nunca puede desbordar la cabeza
  const maxW = (faceBox.w * 0.94 - gap) / 2
  const bw = Math.min(faceBox.w * p.width, maxW)
  const bh = faceBox.h * p.thickness
  const top = faceBox.y + faceBox.h * offsetY

  return {
    tilt,
    bw,
    bh,
    top,
    // los ojos se cuelgan de aquí: la ceja marca dónde acaba la zona de frente
    bottom: top + bh,
    innerLeft: faceBox.cx - gap / 2,
    innerRight: faceBox.cx + gap / 2,
  }
}

// La ceja se dibuja en DOS pasadas separadas a propósito, porque cada mitad va en una
// capa distinta: la sombra está sobre la piel y el pelo la tapa; el slab macizo es
// siempre lo más alto del dibujo y no lo tapa nada.

const tilts = (g, p) => [g.tilt + p.asymmetry, -g.tilt]

/**
 * Sombra proyectada. Es la propia ceja desplazada hacia abajo, así que sigue sola la
 * inclinación y la asimetría de cada una sin duplicar geometría.
 *
 * @param clip Path2D opcional — la silueta de la cabeza, para que no se salga.
 */
export function drawShadow(ctx, faceBox, p, palette, clip = null) {
  const g = build(faceBox, p)
  const off = g.bh * p.shadow
  if (off <= 0.5) return g

  const [left, right] = tilts(g, p)
  ctx.save()
  if (clip) ctx.clip(clip)
  // skinDeep y no skinShadow: sobre el lado ya sombreado de la cara, skinShadow
  // sería invisible
  ctx.fillStyle = palette.skinDeep
  slab(ctx, g.innerLeft - g.bw, g.top + off, g.bw, g.bh, left)
  slab(ctx, g.innerRight, g.top + off, g.bw, g.bh, right)
  ctx.restore()
  return g
}

/** El slab macizo. Va el último de la cara: nada se dibuja por encima de una ceja. */
export function drawSlabs(ctx, faceBox, p, palette) {
  const g = build(faceBox, p)
  const [left, right] = tilts(g, p)
  ctx.fillStyle = palette.solid
  // izquierda: rotación positiva baja su extremo derecho, que es el interior
  slab(ctx, g.innerLeft - g.bw, g.top, g.bw, g.bh, left)
  slab(ctx, g.innerRight, g.top, g.bw, g.bh, right)
  return g
}

/** Las dos pasadas seguidas, para usar el módulo suelto en su preview. */
export function draw(ctx, faceBox, p, palette, rng, clip = null) {
  drawShadow(ctx, faceBox, p, palette, clip)
  return drawSlabs(ctx, faceBox, p, palette)
}

function slab(ctx, x, y, w, h, deg) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}
