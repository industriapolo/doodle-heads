// Pelo y barba.
//
// Dos familias de pelo, y no se parecen en nada:
//
//  · `radial` / `directional` — textura de rayitas, delega en hatching.js
//  · `solid` — MASA de color plano, como las cejas. El hilo conductor de las referencias
//    de pelo: un solo color sin contorno, borde inferior en zigzag de púas hacia la frente,
//    silueta exterior también de pico, sobresaliendo del cráneo, más larga por los lados
//    que por el centro, y una división diagonal plana más clara haciendo de raya.
//
// La barba, aparte, tiene su propio modo — no comparte dirección con el pelo.

import { hatch } from '../style/hatching.js'
import { roundedRectPath } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const HAIR_PARAMS = {
  mode: {
    options: ['solid', 'radial', 'directional', 'bald'],
    pool: { solid: 3, radial: 2, directional: 2, bald: 1 },
    label: 'Modo',
  },
  hairline: { min: 0, max: 0.55, range: [0.02, 0.26], step: 0.01, label: 'Línea del pelo' },
  hairDensity: { min: 0, max: 1, range: [0.3, 0.65], step: 0.01, label: 'Densidad (rayitas)' },
  hairAngle: { min: -60, max: 60, range: [-35, 35], step: 1, unit: '°', label: 'Ángulo (directional)' },
  hairOriginY: { min: -2, max: 3, range: [0.95, 1.35], step: 0.05, label: 'Origen radial Y' },

  // --- masa (mode: solid) ---
  overhang: { min: 0, max: 0.16, range: [0.02, 0.09], step: 0.005, label: 'Vuelo sobre el cráneo' },
  fringeY: { min: -0.05, max: 0.42, range: [0.04, 0.24], step: 0.01, label: 'Altura del flequillo' },
  sideDrop: { min: 0, max: 0.5, range: [0.12, 0.36], step: 0.01, label: 'Caída por los lados' },
  fringeSpikes: { min: 3, max: 18, range: [5, 12], step: 1, int: true, label: 'Nº de púas del flequillo' },
  fringeDepth: { min: 0, max: 0.22, range: [0.06, 0.16], step: 0.005, label: 'Profundidad de las púas' },
  topSpikes: { min: 3, max: 20, range: [5, 12], step: 1, int: true, label: 'Nº de picos de la silueta' },
  // El tope llega a 0.20 para el caso cresta, pero la banda por defecto es corta:
  // en las referencias la silueta de arriba es casi lisa con algún mechón suelto, y el
  // zigzag de verdad está en el flequillo. Con picos largos por defecto sale un punk.
  topSpikeDepth: { min: 0, max: 0.20, range: [0.006, 0.045], step: 0.002, label: 'Largo de los picos' },
  parting: { min: 0, max: 0.35, range: [0.10, 0.22], step: 0.01, label: 'Fuerza de la raya' },
  partingAngle: { min: -70, max: 70, range: [-45, 45], step: 5, unit: '°', label: 'Ángulo de la raya' },
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

/** Rayitas (pelo texturado) y barba. Van recortadas a la silueta. */
export function draw(ctx, geo, p, palette, rng, limits = {}) {
  const { headBox, faceBox, path: headPath } = geo

  ctx.save()
  ctx.clip(headPath)

  if (p.mode !== 'bald' && p.mode !== 'solid' && p.hairDensity > 0.02) {
    // El pelo nunca puede bajar de la ceja. Sin este tope la cabeza entera se texturiza
    // y deja de leerse como pelo: se lee como cabeza peluda.
    const bottom = Math.min(faceBox.y + faceBox.h * p.hairline, limits.hairBottom ?? Infinity)
    const region = { x: headBox.x, y: headBox.y, w: headBox.w, h: bottom - headBox.y }
    if (region.h > 4) {
      const mask = roundedRectPath(region.x, region.y, region.w, region.h, 2)
      hatch(ctx, mask, region, {
        mode: p.mode,
        angle: p.hairAngle,
        density: p.hairDensity,
        length: 14,
        lengthJitter: 0.35,
        angleJitter: p.mode === 'radial' ? 5 : 10,
        edgeFade: 0.25,
        weight: 2.2,
        radialOriginY: p.hairOriginY,
      }, palette, rng)
    }
  }

  if (p.beardCoverage > 0.05 && p.beardDensity > 0.02) {
    const top = faceBox.y + faceBox.h * p.beardTop
    const region = { x: headBox.x, y: top, w: headBox.w, h: headBox.bottom - top }
    if (region.h > 4) {
      const mask = roundedRectPath(region.x, region.y, region.w, region.h, 2)
      // ny = 0 arriba de la región, 1 abajo. La barba nace difusa en la mejilla y
      // se cierra hacia la mandíbula: eso es lo que hace el degradado.
      const fadeZone = 1 - p.beardCoverage * 0.85
      const densityAt = (_nx, ny) => (fadeZone <= 0.01 ? 1 : smoothstep(ny / fadeZone))

      hatch(ctx, mask, region, {
        mode: p.beardMode,
        angle: p.beardAngle,
        density: p.beardDensity,
        length: 12,
        lengthJitter: 0.4,
        angleJitter: p.beardMode === 'radial' ? 7 : 12,
        edgeFade: 0.15,
        weight: 2.2,
        radialOriginY: p.beardOriginY,
      }, palette, rng, { densityAt })
    }
  }

  ctx.restore()
}

/**
 * La masa de pelo. Se pinta APARTE y por encima del re-trazo del contorno, porque
 * sobresale del cráneo: si el contorno de la cabeza se dibujara después, le cruzaría
 * una línea por encima que en las referencias no existe.
 *
 * Sin contorno propio, como las cejas: es tinta plana.
 */
export function drawMass(ctx, geo, p, palette, rng) {
  if (p.mode !== 'solid') return null
  const { headBox, faceBox } = geo

  const o = headBox.w * p.overhang
  const cx = headBox.cx
  const halfW = headBox.w / 2 + o
  const topY = headBox.y - o
  const fringeY = faceBox.y + faceBox.h * p.fringeY
  const sideY = fringeY + faceBox.h * p.sideDrop
  const domeH = fringeY - topY
  if (domeH <= 2) return null

  const path = new Path2D()

  // --- silueta superior: elipse muestreada con picos alternos -------------
  const n = Math.max(4, Math.round(p.topSpikes) * 2)
  const spike = headBox.w * p.topSpikeDepth
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI // 180° → 0°
    // los índices impares salen disparados: eso es lo que hace la silueta de pico
    const out = i % 2 === 1 ? spike * (0.55 + rng.next() * 0.9) : 0
    const x = cx + Math.cos(a) * (halfW + out)
    const y = fringeY - Math.sin(a) * (domeH + out)
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }

  // --- flequillo: zigzag de púas hacia la frente, de derecha a izquierda ---
  // La línea base cae hacia los lados (parábola), que es lo que hace que el pelo
  // sea más largo por las sienes que por el centro.
  const spikes = Math.max(2, Math.round(p.fringeSpikes))
  const depth = faceBox.h * p.fringeDepth
  const steps = spikes * 2
  for (let i = 0; i <= steps; i++) {
    const t = 1 - i / steps // 1 → 0 (derecha a izquierda)
    const edge = (2 * t - 1) ** 2 // 1 en los bordes, 0 en el centro
    const base = fringeY + (sideY - fringeY) * edge
    const tip = i % 2 === 1 ? depth * (0.6 + rng.next() * 0.8) : -depth * 0.12
    path.lineTo(cx + (t * 2 - 1) * halfW, base + tip)
  }

  path.closePath()

  ctx.fillStyle = palette.solid
  ctx.fill(path)

  // --- raya: división diagonal plana, más clara. No es un degradado ------
  if (p.parting > 0.01) {
    ctx.save()
    ctx.clip(path)
    const a = (p.partingAngle * Math.PI) / 180
    const r = headBox.w * 2
    const px = cx + Math.sin(a) * headBox.w * 0.12
    const py = topY + domeH * 0.35
    const wedge = new Path2D()
    wedge.moveTo(px, py)
    wedge.lineTo(px + Math.cos(a - 0.35) * r, py + Math.sin(a - 0.35) * r)
    wedge.lineTo(px + Math.cos(a + 0.9) * r, py + Math.sin(a + 0.9) * r)
    wedge.closePath()
    ctx.fillStyle = `rgba(255,255,255,${p.parting})`
    ctx.fill(wedge)
    ctx.restore()
  }

  return { path, fringeY, sideY }
}

function smoothstep(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}
