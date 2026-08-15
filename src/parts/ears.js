// Orejas: semicírculos laterales con hatching dentro.
// Se dibujan ANTES que la cabeza — en las referencias asoman por detrás de la silueta,
// no encima. Es lo que evita que parezcan pegatinas.

import { outline } from '../style/stroke.js'
import { hatch } from '../style/hatching.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  // pequeñas: en las referencias la oreja asoma, no se impone
  size: { min: 0.04, max: 0.18, range: [0.05, 0.10], step: 0.005, label: 'Tamaño' },
  offsetY: { min: 0.26, max: 0.68, range: [0.34, 0.52], step: 0.01, label: 'Altura' },
  stretch: { min: 0.7, max: 1.8, range: [1.0, 1.7], step: 0.05, label: 'Alargamiento' },
  hatchDensity: { min: 0, max: 1, range: [0.25, 0.7], step: 0.01, label: 'Densidad de rayas' },
  hatchAngle: { min: -80, max: 80, range: [-60, 60], step: 1, unit: '°', label: 'Ángulo de rayas' },
}

export const randomize = randomizerFor(PARAMS)

export function draw(ctx, geo, p, palette, rng) {
  const { headBox, faceBox } = geo
  const r = faceBox.w * p.size
  const cy = faceBox.y + faceBox.h * p.offsetY

  for (const side of [-1, 1]) {
    const cx = side < 0 ? headBox.x : headBox.right
    const path = new Path2D()
    path.ellipse(cx, cy, r, r * p.stretch, 0, 0, Math.PI * 2)

    ctx.fillStyle = palette.skin
    ctx.fill(path)

    hatch(
      ctx,
      path,
      { x: cx - r, y: cy - r * p.stretch, w: r * 2, h: r * p.stretch * 2 },
      {
        mode: 'directional',
        angle: p.hatchAngle,
        density: p.hatchDensity,
        length: r * 0.7,
        lengthJitter: 0.3,
        angleJitter: 6,
        edgeFade: 0.35,
        weight: 2,
      },
      palette,
      rng
    )

    outline(ctx, palette)
    ctx.stroke(path)
  }
}
