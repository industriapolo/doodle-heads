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
    pool: { solid: 3, radial: 2, directional: 0, bald: 1 },
    label: 'Modo',
  },
  hairline: { min: 0, max: 0.55, range: [0.11, 0.35], step: 0.01, label: 'Línea del pelo' },
  hairDensity: { min: 0, max: 1, range: [0, 0.29], step: 0.01, label: 'Densidad (rayitas)' },
  hairAngle: { min: -60, max: 60, range: [15, 60], step: 1, unit: '°', label: 'Ángulo (directional)' },
  hairOriginY: { min: -2, max: 3, range: [0.95, 1.35], step: 0.05, label: 'Origen radial Y' },
  hairWeight: { min: 0.4, max: 8, range: [2.2, 2.2], step: 0.1, label: 'Grosor de rayita' },

  // --- masa (mode: solid) ---
  overhang: { min: 0, max: 0.16, range: [0.01, 0.035], step: 0.005, label: 'Vuelo sobre el cráneo' },
  fringeY: { min: -0.05, max: 0.42, range: [-0.05, -0.05], step: 0.01, label: 'Altura del flequillo' },
  sideDrop: { min: 0, max: 0.5, range: [0.02, 0.14], step: 0.01, label: 'Caída del flequillo a los lados' },

  // --- laterales: piezas INDEPENDIENTES de la masa -----------------------
  // Separados para poder ajustarlos sin tocar el casquete, y para poder bajarlos por
  // debajo de la oreja a modo de patilla.
  sideWidth: { min: 0, max: 0.26, range: [0.085, 0.20], step: 0.005, label: 'Ancho del lateral' },
  sideLength: { min: 0.05, max: 0.9, range: [0.28, 0.75], step: 0.01, label: 'Largo del lateral' },
  sideTaper: { min: 0, max: 1, range: [0.1, 0.6], step: 0.05, label: 'Estrechamiento' },
  sideburn: { min: 0, max: 0.45, range: [0, 0.18], step: 0.01, label: 'Patilla (bajo la oreja)' },
  sideJag: { min: 0, max: 0.09, range: [0, 0.008], step: 0.002, label: 'Dentado del borde interior' },
  // Los tres acabados de flequillo salen de la MISMA linea base: `pico` es el zigzag de
  // siempre, `curva` la arquea y quita las puas, y `curva-picos` arquea y deja puas
  // cortas. No es geometria nueva, es modular dos numeros.
  fringeShape: {
    options: ['pico', 'curva', 'curva-picos'],
    pool: { pico: 2, curva: 2, 'curva-picos': 2 },
    label: 'Acabado del flequillo',
  },
  // Positivo = el centro BAJA (pico de viuda), negativo = sube (arco). Antes la
  // direccion no dependia de este numero sino de si superaba a `sideDrop`, que llega a
  // 0.5 — asi que en la practica la curva salia siempre hacia arriba.
  fringeBow: { min: -0.25, max: 0.25, range: [0.02, 0.16], step: 0.005, label: 'Curva del flequillo' },
  // El BARRIDO diagonal: entra alto por un lado y sale bajo por el otro. Es lo mas
  // constante de las referencias de pelo y no lo hacia ninguno de los tres acabados,
  // que eran todos simetricos.
  fringeTilt: { min: -0.3, max: 0.3, range: [-0.16, 0.16], step: 0.01, label: 'Barrido diagonal' },
  fringeSpikes: { min: 3, max: 18, range: [9, 16], step: 1, int: true, label: 'Nº de púas del flequillo' },
  fringeDepth: { min: 0, max: 0.22, range: [0.015, 0.07], step: 0.005, label: 'Profundidad de las púas' },
  topSpikes: { min: 3, max: 20, range: [5, 12], step: 1, int: true, label: 'Nº de picos de la silueta' },
  // El tope llega a 0.20 para el caso cresta, pero la banda por defecto es corta:
  // en las referencias la silueta de arriba es casi lisa con algún mechón suelto, y el
  // zigzag de verdad está en el flequillo. Con picos largos por defecto sale un punk.
  topSpikeDepth: { min: 0, max: 0.20, range: [0, 0.046], step: 0.002, label: 'Largo de los picos' },
  // Pelos de punta en un solo lado. El bias multiplica el largo del pico segun donde
  // caiga en el recorrido de la cupula, asi que la asimetria sale de un solo numero.
  spikeSide: {
    options: ['ambos', 'izquierda', 'derecha'],
    pool: { ambos: 2, izquierda: 1, derecha: 1 },
    label: 'Lado de los pelos de punta',
  },
  spikeAsym: { min: 0, max: 1, range: [0.6, 1], step: 0.05, label: 'Fuerza de la asimetría' },
  fringeShadow: { min: 0, max: 0.09, range: [0.015, 0.035], step: 0.002, label: 'Sombra proyectada' },
  parting: { min: 0, max: 0.35, range: [0.1, 0.17], step: 0.01, label: 'Fuerza de la raya' },
  partingAngle: { min: -70, max: 70, range: [-70, 70], step: 5, unit: '°', label: 'Ángulo de la raya' },
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
  beardAngle: { min: -60, max: 60, range: [-12, 10], step: 1, unit: '°', label: 'Ángulo (directional)' },
  beardOriginY: { min: -3, max: 2, range: [-1.3, -0.35], step: 0.05, label: 'Origen radial Y' },
  beardWeight: { min: 0.4, max: 8, range: [2.2, 2.2], step: 0.1, label: 'Grosor de rayita' },
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
        weight: p.hairWeight,
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
      // Y no crece sobre la nariz. Es anatomía, no un parche: la alternativa —tapar la
      // barba con un relleno de piel— fallaría sobre la sombra plana lateral de la cara,
      // que se vería como un halo claro alrededor de la nariz.
      const keep = limits.noseKeepOut
      const densityAt = (nx, ny) => {
        let d = fadeZone <= 0.01 ? 1 : smoothstep(ny / fadeZone)
        if (keep && d > 0) d *= smoothstep(distanceToSegment(
          region.x + nx * region.w, region.y + ny * region.h, keep) / keep.r - 1)
        return d
      }

      hatch(ctx, mask, region, {
        mode: p.beardMode,
        angle: p.beardAngle,
        density: p.beardDensity,
        length: 12,
        lengthJitter: 0.4,
        angleJitter: p.beardMode === 'radial' ? 7 : 12,
        edgeFade: 0.15,
        weight: p.beardWeight,
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
export function drawMass(ctx, geo, p, palette, rng, limits = {}) {
  if (p.mode !== 'solid') return null
  const { headBox, faceBox } = geo

  // El vuelo incluye el desplazamiento de la asimetría, y la cúpula se mueve con él:
  // si no, el pelo se queda corto por el lado hacia el que se inclina la cabeza.
  const lean = geo.lean || 0
  const o = headBox.w * p.overhang + Math.abs(lean)
  const cx = headBox.cx + lean
  const halfW = headBox.w / 2 + o
  const topY = headBox.y - o

  // El flequillo no puede llegar a la ceja. La masa y las cejas son la MISMA tinta, así
  // que en cuanto se tocan se funden en un solo borrón y se pierden las dos. En las
  // referencias siempre queda una banda de frente entre el pelo y la ceja.
  // La sombra cuenta para el tope: como ahora la masa se pinta DESPUÉS de las cejas,
  // una sombra que bajara de más se pintaría encima de la ceja en vez de sobre la frente.
  const deepest = faceBox.h * (p.fringeDepth + p.fringeShadow)
  const maxFringeY = (limits.hairBottom ?? Infinity) - deepest - faceBox.h * 0.02
  const fringeY = Math.min(faceBox.y + faceBox.h * p.fringeY, maxFringeY)
  const sideY = fringeY + faceBox.h * p.sideDrop
  const domeH = fringeY - topY
  if (domeH <= 2) return null

  // UNA sola línea base para la silueta de arriba y para el flequillo.
  //
  // Antes eran dos: la cúpula acababa en `fringeY` y el flequillo arrancaba en
  // `fringeY + caída + barrido`. Como son dos tramos del MISMO contorno, entre el final
  // de uno y el principio del otro se colaba un muro vertical de hasta 330 unidades —
  // los cortes raros de los lados.
  //
  // `u` va de -1 (izquierda) a +1 (derecha). La caída usa u⁴: se concentra en las
  // sienes en vez de hundir también el centro, pero sin el escalón que dejaba u⁶.
  const bow = p.fringeShape === 'pico' ? 0 : faceBox.h * p.fringeBow
  const tilt = faceBox.h * p.fringeTilt
  const baseline = (u) =>
    fringeY + (sideY - fringeY) * u ** 4 + bow * (1 - u * u) + tilt * u

  const path = new Path2D()

  // --- silueta superior: elipse muestreada con picos alternos -------------
  const n = Math.max(4, Math.round(p.topSpikes) * 2)
  const spike = headBox.w * p.topSpikeDepth
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI // 180° → 0°
    // i/n recorre la cúpula de izquierda a derecha: con eso se apagan los picos de un
    // lado y quedan de punta solo en el otro
    const nx = i / n
    const lado = p.spikeSide === 'izquierda' ? 1 - nx : p.spikeSide === 'derecha' ? nx : 1
    const bias = 1 - p.spikeAsym * (1 - lado * lado)
    // los índices impares salen disparados: eso es lo que hace la silueta de pico
    const out = i % 2 === 1 ? spike * (0.55 + rng.next() * 0.9) * bias : 0
    // la cúpula cuelga de la misma línea base, así que sus extremos caen exactamente
    // donde arranca el flequillo y el contorno cierra sin costura
    const x = cx + Math.cos(a) * (halfW + out)
    const y = baseline(Math.cos(a)) - Math.sin(a) * (domeH + out)
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }

  // --- flequillo: zigzag de púas hacia la frente, de derecha a izquierda ---
  // La línea base cae hacia los lados (parábola), que es lo que hace que el pelo
  // sea más largo por las sienes que por el centro.
  const spikes = Math.max(2, Math.round(p.fringeSpikes))
  const depth = faceBox.h * p.fringeDepth
  // `curva` arquea la línea base y apaga las púas; `curva-picos` arquea y las deja
  // cortas. En modo curva hacen falta más tramos o el arco se ve poligonal.
  const spikeMul = p.fringeShape === 'curva' ? 0 : p.fringeShape === 'curva-picos' ? 0.42 : 1
  const steps = p.fringeShape === 'curva' ? Math.max(spikes * 2, 28) : spikes * 2
  for (let i = 0; i <= steps; i++) {
    const t = 1 - i / steps // 1 → 0 (derecha a izquierda)
    const u = 2 * t - 1 // -1 izquierda, 0 centro, +1 derecha
    const base = baseline(u)
    // Las púas se concentran en un lado, como los picos de la silueta, en vez de
    // repartirse por igual: en las referencias son dos o tres grandes, no una fila.
    const lado = p.spikeSide === 'izquierda' ? t : p.spikeSide === 'derecha' ? 1 - t : 1 // eslint-disable-line
    const bias = 1 - p.spikeAsym * (1 - lado * lado)
    const tip =
      i % 2 === 1
        ? depth * spikeMul * bias * (0.6 + rng.next() * 0.8)
        : -depth * spikeMul * bias * 0.12
    path.lineTo(cx + (t * 2 - 1) * halfW, base + tip)
  }

  path.closePath()

  // Los laterales son piezas aparte, no parte del casquete: así se ajustan solos y
  // pueden pasar de la oreja hacia abajo como patilla.
  const sides = [
    sidePath(headBox, faceBox, p, -1, fringeY, lean, rng),
    sidePath(headBox, faceBox, p, 1, fringeY, lean, rng),
  ]

  // Sombra proyectada: la propia masa desplazada hacia abajo. Como el borde de abajo es
  // el zigzag del flequillo, la sombra sale dentada sola, siguiendo diente a diente.
  // Recortada a la cabeza porque la masa vuela por fuera del cráneo y su sombra no puede.
  const shOff = faceBox.h * p.fringeShadow
  if (shOff > 0.5) {
    ctx.save()
    ctx.clip(geo.path)
    ctx.translate(0, shOff)
    ctx.fillStyle = palette.skinDeep
    ctx.fill(path)
    for (const s of sides) if (s) ctx.fill(s)
    ctx.restore()
  }

  ctx.fillStyle = palette.solid
  ctx.fill(path)

  // Los laterales SÍ van recortados a la cabeza. El casquete vuela a propósito, pero un
  // lateral que vuele se sale de la silueta justo por donde la mandíbula se estrecha, y
  // queda colgando sobre el fondo como un goterón.
  ctx.save()
  ctx.clip(geo.path)
  for (const s of sides) if (s) ctx.fill(s)
  ctx.restore()

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

  return { path, sides, fringeY, sideY }
}

/**
 * Una pieza lateral. El truco de la patilla es que el borde EXTERIOR baja más que el
 * interior: la diagonal que los une hace sola la punta que cae por delante de la oreja.
 *
 * @param dir -1 izquierda, +1 derecha
 */
function sidePath(headBox, faceBox, p, dir, fringeY, lean, rng) {
  const w = headBox.w * p.sideWidth
  if (w < 1) return null

  // Pegado al borde del cráneo, SIN el vuelo del casquete: con vuelo la pieza tapaba la
  // oreja entera. Así el lateral cae por delante y la oreja sigue asomando por fuera.
  // Lo único que se le suma es la asimetría, o deja de cubrir por el lado inclinado.
  const grow = Math.abs(lean)
  const outerX = dir < 0 ? headBox.x - grow : headBox.right + grow
  const inward = -dir // hacia el centro de la cara

  const top = fringeY - faceBox.h * 0.08
  const inner = faceBox.y + faceBox.h * p.sideLength
  const outer = inner + faceBox.h * p.sideburn
  // Suelo al estrechamiento: sin él, un lateral estrecho y muy afilado se convierte en
  // un hilo de tinta de 5 unidades de ancho y media cara de largo.
  const wBottom = w * (1 - p.sideTaper * 0.6)

  const path = new Path2D()
  path.moveTo(outerX, top)
  path.lineTo(outerX, outer) // borde exterior, el que baja del todo
  path.lineTo(outerX + inward * wBottom, inner) // diagonal: la punta de la patilla

  // borde interior dentado de abajo a arriba, como el flequillo
  const jag = headBox.w * p.sideJag
  const steps = 6
  for (let i = steps; i >= 1; i--) {
    const t = i / steps
    const y = inner + (top - inner) * (1 - t)
    const bite = i % 2 === 1 ? jag * (0.5 + rng.next()) : 0
    const width = wBottom + (w - wBottom) * (1 - t)
    path.lineTo(outerX + inward * (width - bite), y)
  }
  path.lineTo(outerX + inward * w, top)
  path.closePath()
  return path
}

/** Distancia de un punto al eje de la nariz, para apagar la barba a su alrededor. */
function distanceToSegment(px, py, s) {
  const dx = s.x1 - s.x0
  const dy = s.y1 - s.y0
  const len2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / len2))
  return Math.hypot(px - (s.x0 + t * dx), py - (s.y0 + t * dy))
}

function smoothstep(t) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}
