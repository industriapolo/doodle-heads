// Orejas: forma lateral con UNA sola línea curva dentro — la caracola del oído.
//
// Nada de hatching aquí: rayado dentro de la oreja se lee como pelo, no como oreja.
// En la referencia cian es una única curva casi cerrada en la parte alta.
//
// Van ANTES que la cabeza, así que la mitad interior queda tapada por la silueta y lo
// que se ve es la mitad de fuera. Por eso la caracola se coloca hacia el exterior.

import { outline, interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  size: { min: 0.04, max: 0.18, range: [0.05, 0.1], step: 0.005, label: 'Tamaño' },
  // La altura NO se sortea suelta: character.js la deriva de los ojos. Regla clásica de
  // proporción — el borde de arriba de la oreja a la altura de la línea de los ojos.
  // `eyeAlign` es el margen que se le permite desviarse, para que no salga monolítico.
  eyeAlign: { min: -0.14, max: 0.14, range: [-0.03, 0.045], step: 0.005, label: 'Desvío sobre la línea de ojos' },
  offsetY: { min: 0.26, max: 0.68, range: [0.3, 0.59], step: 0.01, label: 'Altura (solo suelto)' },
  stretch: { min: 0.7, max: 1.8, range: [1, 1.6], step: 0.05, label: 'Alargamiento' },
  innerSize: { min: 0.2, max: 0.8, range: [0.2, 0.43], step: 0.01, label: 'Tamaño del oído' },
  innerSweep: { min: 140, max: 360, range: [140, 360], step: 5, unit: '°', label: 'Cierre del oído' },
  innerRotation: { min: -180, max: 180, range: [-180, -180], step: 5, unit: '°', label: 'Giro del oído' },
  innerRise: { min: -0.5, max: 0.5, range: [-0.28, 0.06], step: 0.01, label: 'Altura del oído' },
  lineWeight: { min: 0.5, max: 16, range: [6, 6], step: 0.1, label: 'Grosor del contorno' },
}

export const randomize = randomizerFor(PARAMS)

/**
 * Media altura de la oreja en fracción de faceBox.h. character.js la necesita para
 * poder poner el BORDE SUPERIOR a la altura de los ojos: así la correlación se ajusta
 * sola al tamaño de la oreja en vez de descuadrarse con las grandes.
 */
export function halfHeight(faceBox, p) {
  return (faceBox.w * p.size * p.stretch) / faceBox.h
}

export function draw(ctx, geo, p, palette, rng) {
  const { headBox, faceBox } = geo
  const r = faceBox.w * p.size
  const ry = r * p.stretch
  const cy = faceBox.y + faceBox.h * p.offsetY

  for (const side of [-1, 1]) {
    const cx = side < 0 ? headBox.x : headBox.right

    const shell = new Path2D()
    shell.ellipse(cx, cy, r, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = palette.skin
    ctx.fill(shell)
    outline(ctx, palette, p.lineWeight)
    ctx.stroke(shell)

    // la caracola, desplazada hacia fuera para que no la tape la cabeza
    const ix = cx + side * r * 0.34
    const iy = cy + ry * p.innerRise
    const ir = r * p.innerSize
    const sweep = (p.innerSweep * Math.PI) / 180
    // el hueco de la curva mira hacia la cabeza, como en la referencia
    const start = ((p.innerRotation * Math.PI) / 180) + (side < 0 ? -sweep / 2 : Math.PI - sweep / 2)

    const inner = new Path2D()
    inner.arc(ix, iy, ir, start, start + sweep)
    interior(ctx, palette, p.lineWeight * 0.55)
    ctx.stroke(inner)
  }
}
