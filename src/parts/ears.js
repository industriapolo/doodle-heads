// Orejas: semicírculos laterales con hatching dentro.
// Se dibujan ANTES que la cabeza — en las referencias asoman por detrás de la silueta,
// no encima. Es lo que evita que parezcan pegatinas.

import { outline } from '../style/stroke.js'
import { hatch } from '../style/hatching.js'

export const PARAMS = {
  size: { min: 0.04, max: 0.18, default: 0.10, step: 0.005, label: 'Tamaño' },
  offsetY: { min: 0.26, max: 0.68, default: 0.46, step: 0.01, label: 'Altura' },
  stretch: { min: 0.7, max: 1.8, default: 1.15, step: 0.05, label: 'Alargamiento' },
  hatchDensity: { min: 0, max: 1, default: 0.5, step: 0.01, label: 'Densidad de rayas' },
  hatchAngle: { min: -80, max: 80, default: 35, step: 1, unit: '°', label: 'Ángulo de rayas' },
}

export function randomize(rng) {
  return {
    // pequeñas: en las referencias la oreja asoma, no se impone
    size: rng.range(0.05, 0.10),
    offsetY: rng.range(0.34, 0.52),
    stretch: rng.range(1.0, 1.7),
    hatchDensity: rng.range(0.25, 0.7),
    hatchAngle: rng.range(-60, 60),
  }
}

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
