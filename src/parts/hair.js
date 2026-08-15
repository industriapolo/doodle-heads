// Pelo y barba. Este módulo NO dibuja rayas: solo define máscaras y delega en hatching.js.
//
// La barba necesita disolverse hacia ARRIBA, hacia la mejilla, y una máscara es binaria:
// no puede expresar un degradado direccional. Por eso usa el hook `densityAt` del motor
// en vez de intentar recortar la forma del difuminado.

import { hatch } from '../style/hatching.js'
import { roundedRectPath } from '../style/stroke.js'

export const PARAMS = {
  mode: { options: ['radial', 'directional', 'bald'], default: 'radial', label: 'Pelo' },
  hairline: { min: 0, max: 0.55, default: 0.16, step: 0.01, label: 'Línea del pelo' },
  hairDensity: { min: 0, max: 1, default: 0.5, step: 0.01, label: 'Densidad de pelo' },
  hairAngle: { min: -60, max: 60, default: 10, step: 1, unit: '°', label: 'Ángulo del pelo' },
  beardCoverage: { min: 0, max: 1, default: 0.55, step: 0.01, label: 'Barba' },
  beardTop: { min: 0.45, max: 0.95, default: 0.62, step: 0.01, label: 'Arranque de barba' },
  beardDensity: { min: 0, max: 1, default: 0.45, step: 0.01, label: 'Densidad de barba' },
}

export function randomize(rng) {
  return {
    mode: rng.weighted({ radial: 2, directional: 2, bald: 1 }),
    hairline: rng.range(0.02, 0.26),
    hairDensity: rng.range(0.3, 0.65),
    hairAngle: rng.range(-35, 35),
    beardCoverage: rng.range(0, 0.95),
    beardTop: rng.range(0.52, 0.82),
    beardDensity: rng.range(0.28, 0.58),
  }
}

/**
 * @param geo geometría devuelta por head.build() — se usa su `path` como recorte exterior,
 *            de modo que ni el pelo ni la barba puedan salirse de la silueta.
 */
export function draw(ctx, geo, p, palette, rng, limits = {}) {
  const { headBox, faceBox, path: headPath } = geo

  ctx.save()
  ctx.clip(headPath) // todo lo de aquí dentro queda dentro de la cabeza

  // --- pelo ---------------------------------------------------------------
  if (p.mode !== 'bald' && p.hairDensity > 0.02) {
    // El pelo nunca puede bajar de la ceja. Sin este tope la cabeza entera se texturiza
    // y deja de leerse como pelo: se lee como cabeza peluda.
    const bottom = Math.min(
      faceBox.y + faceBox.h * p.hairline,
      limits.hairBottom ?? Infinity
    )
    const region = { x: headBox.x, y: headBox.y, w: headBox.w, h: bottom - headBox.y }
    if (region.h > 4) {
      const mask = roundedRectPath(region.x, region.y, region.w, region.h, 2)
      hatch(
        ctx,
        mask,
        region,
        {
          mode: p.mode,
          angle: p.hairAngle,
          density: p.hairDensity,
          length: 14,
          lengthJitter: 0.35,
          angleJitter: p.mode === 'radial' ? 5 : 10,
          edgeFade: 0.25,
          weight: 2.2,
          radialOriginY: 1.15,
        },
        palette,
        rng
      )
    }
  }

  // --- barba --------------------------------------------------------------
  if (p.beardCoverage > 0.05 && p.beardDensity > 0.02) {
    const top = faceBox.y + faceBox.h * p.beardTop
    const region = { x: headBox.x, y: top, w: headBox.w, h: headBox.bottom - top }
    if (region.h > 4) {
      const mask = roundedRectPath(region.x, region.y, region.w, region.h, 2)
      // ny = 0 arriba de la región, 1 abajo. La barba nace difusa en la mejilla y
      // se cierra hacia la mandíbula: eso es lo que hace el degradado.
      const fadeZone = 1 - p.beardCoverage * 0.85
      const densityAt = (_nx, ny) => (fadeZone <= 0.01 ? 1 : smoothstep(ny / fadeZone))

      hatch(
        ctx,
        mask,
        region,
        {
          mode: 'directional',
          angle: 8,
          density: p.beardDensity,
          length: 12,
          lengthJitter: 0.4,
          angleJitter: 12,
          edgeFade: 0.15,
          weight: 2.2,
        },
        palette,
        rng,
        { densityAt }
      )
    }
  }

  ctx.restore()
}

function smoothstep(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}
