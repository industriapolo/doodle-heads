// Pelo y barba. Este módulo NO dibuja rayas: solo define máscaras y delega en hatching.js.
//
// La barba necesita disolverse hacia ARRIBA, hacia la mejilla, y una máscara es binaria:
// no puede expresar un degradado direccional. Por eso usa el hook `densityAt` del motor
// en vez de intentar recortar la forma del difuminado.

import { hatch } from '../style/hatching.js'
import { roundedRectPath } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const HAIR_PARAMS = {
  mode: {
    options: ['radial', 'directional', 'bald'],
    pool: { radial: 2, directional: 2, bald: 1 },
    label: 'Modo',
  },
  hairline: { min: 0, max: 0.55, range: [0.02, 0.26], step: 0.01, label: 'Línea del pelo' },
  hairDensity: { min: 0, max: 1, range: [0.3, 0.65], step: 0.01, label: 'Densidad' },
  hairAngle: { min: -60, max: 60, range: [-35, 35], step: 1, unit: '°', label: 'Ángulo (directional)' },
  hairOriginY: { min: -2, max: 3, range: [0.95, 1.35], step: 0.05, label: 'Origen radial Y' },
}

// La barba tiene su propio modo: es una superficie distinta del pelo y no tiene por qué
// compartir dirección con él. En radial, el origen por defecto queda POR ENCIMA de la zona
// de barba (valores negativos), que es como crece de verdad — abriéndose desde la cara
// hacia la mandíbula.
export const BEARD_PARAMS = {
  beardMode: {
    options: ['radial', 'directional'],
    pool: { radial: 1, directional: 2 },
    label: 'Modo',
  },
  beardCoverage: { min: 0, max: 1, range: [0, 0.95], step: 0.01, label: 'Cobertura' },
  beardTop: { min: 0.45, max: 0.95, range: [0.52, 0.82], step: 0.01, label: 'Arranque' },
  beardDensity: { min: 0, max: 1, range: [0.28, 0.58], step: 0.01, label: 'Densidad' },
  beardAngle: { min: -60, max: 60, range: [-6, 14], step: 1, unit: '°', label: 'Ángulo (directional)' },
  beardOriginY: { min: -3, max: 2, range: [-1.3, -0.35], step: 0.05, label: 'Origen radial Y' },
}

export const PARAMS = { ...HAIR_PARAMS, ...BEARD_PARAMS }

export const randomize = randomizerFor(PARAMS)

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
          radialOriginY: p.hairOriginY,
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
          mode: p.beardMode,
          angle: p.beardAngle,
          density: p.beardDensity,
          length: 12,
          lengthJitter: 0.4,
          angleJitter: p.beardMode === 'radial' ? 7 : 12,
          edgeFade: 0.15,
          weight: 2.2,
          radialOriginY: p.beardOriginY,
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
