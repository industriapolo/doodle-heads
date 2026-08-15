// Motor de rayitas. La textura firma del estilo: trazos cortos e independientes de densidad
// variable (barba, pelo, orejas, sombreados).
//
// Convención de ángulo: **0° = vertical**, positivo = horario. Las rayitas de las referencias
// son predominantemente verticales, así que el default de 15° se lee como una ligera
// inclinación, no como casi-horizontal.
//
// Aquí es donde vive TODO el aire de "hecho a mano" del proyecto: los contornos son vector
// limpio (wobble = 0) y el temblor se concentra en el jitter de ángulo y largo de cada raya.

import { fine } from './stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  mode: {
    options: ['directional', 'radial'],
    pool: { directional: 3, radial: 1 },
    label: 'Modo',
  },
  angle: { min: -90, max: 90, range: [-20, 25], step: 1, unit: '°', label: 'Ángulo' },
  // por encima de ~0.65 las rayas se tocan y la textura se convierte en fieltro:
  // deja de leerse como trazo suelto, que es lo que la hace tuya
  density: { min: 0, max: 1, range: [0.28, 0.6], step: 0.01, label: 'Densidad' },
  length: { min: 3, max: 40, range: [9, 18], step: 0.5, label: 'Largo' },
  lengthJitter: { min: 0, max: 1, range: [0.2, 0.5], step: 0.01, label: 'Jitter largo' },
  angleJitter: { min: 0, max: 45, range: [4, 14], step: 1, unit: '°', label: 'Jitter ángulo' },
  edgeFade: { min: 0, max: 1, range: [0.2, 0.75], step: 0.01, label: 'Edge fade' },
  weight: { min: 0.5, max: 5, range: [1.8, 2.6], step: 0.1, label: 'Grosor' },
  radialOriginY: { min: -1, max: 2, range: [0.95, 1.35], step: 0.05, label: 'Origen radial Y' },
}

export const randomize = randomizerFor(PARAMS)

const SPACING_MAX = 18
const SPACING_MIN = 5
const MAX_STROKES = 12000 // tope de seguridad

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t

/**
 * Pinta hatching dentro de una máscara.
 *
 * @param ctx     contexto 2D
 * @param mask    Path2D — solo se pinta dentro
 * @param bounds  {x,y,w,h} bbox de la máscara (para acotar el barrido)
 * @param p       params (ver PARAMS)
 * @param palette paleta activa
 * @param rng     PRNG con seed
 * @param opts.densityAt  (nx, ny) => 0..1 — modulación extra de densidad en coords
 *                        normalizadas de `bounds`. Lo usa hair.js para que la barba se
 *                        disuelva hacia arriba: una máscara es binaria y no puede
 *                        expresar un degradado direccional.
 * @param opts.color      color de raya (default palette.hatch)
 */
export function hatch(ctx, mask, bounds, p, palette, rng, opts = {}) {
  const spacing = lerp(SPACING_MAX, SPACING_MIN, clamp01(p.density))
  if (p.density <= 0.001) return

  const field = p.edgeFade > 0.001 ? edgeField(mask, bounds, spacing * 3.5) : null

  const ox = bounds.x + bounds.w * 0.5
  const oy = bounds.y + bounds.h * (p.radialOriginY ?? 1.15)

  const jitterRad = ((p.angleJitter || 0) * Math.PI) / 180
  const baseRad = ((p.angle || 0) * Math.PI) / 180

  ctx.save()
  ctx.clip(mask)
  fine(ctx, palette)
  ctx.lineWidth = p.weight
  if (opts.color) ctx.strokeStyle = opts.color

  const path = new Path2D()
  let count = 0

  const emit = (x, y, dir) => {
    if (count > MAX_STROKES) return
    if (x < bounds.x || x > bounds.x + bounds.w || y < bounds.y || y > bounds.y + bounds.h) return

    let keep = 1
    if (field) keep *= lerp(1, field(x, y), p.edgeFade)
    if (opts.densityAt) {
      keep *= clamp01(opts.densityAt((x - bounds.x) / bounds.w, (y - bounds.y) / bounds.h))
    }
    if (keep < 1 && rng.next() > keep) return

    const a = dir + (rng.next() - 0.5) * 2 * jitterRad
    const len = p.length * (1 + (rng.next() - 0.5) * 2 * p.lengthJitter)
    const half = len / 2

    // 0° = vertical → dirección (sin a, -cos a)
    const dx = Math.sin(a) * half
    const dy = -Math.cos(a) * half

    path.moveTo(x - dx, y - dy)
    path.lineTo(x + dx, y + dy)
    count++
  }

  if (p.mode === 'radial') {
    // Muestreo POLAR, no en rejilla: la cúpula de la referencia es un abanico peinado y
    // regular. Con una rejilla cuadrada las rayas se agolpan cerca del origen y se abren
    // lejos, y el abanico se ensucia. Anillos a distancia constante con paso angular
    // proporcional al radio mantienen la separación pareja en todo el abanico.
    const corners = [
      [bounds.x, bounds.y],
      [bounds.x + bounds.w, bounds.y],
      [bounds.x, bounds.y + bounds.h],
      [bounds.x + bounds.w, bounds.y + bounds.h],
    ]
    const maxR = Math.max(...corners.map(([cx, cy]) => Math.hypot(cx - ox, cy - oy)))

    for (let r = spacing; r <= maxR && count <= MAX_STROKES; r += spacing) {
      const step = spacing / r // paso angular → longitud de arco ≈ spacing
      const phase = rng.next() * step // desfasa cada anillo para que no se alineen en radios
      for (let a = phase; a < Math.PI * 2; a += step) {
        const jr = r + (rng.next() - 0.5) * spacing * 0.6
        emit(ox + Math.cos(a) * jr, oy + Math.sin(a) * jr, a + Math.PI / 2)
      }
    }
  } else {
    // rejilla con jitter: distribución pareja pero orgánica, que es el look de la barba
    const cols = Math.ceil(bounds.w / spacing)
    const rows = Math.ceil(bounds.h / spacing)
    for (let gy = 0; gy <= rows && count <= MAX_STROKES; gy++) {
      for (let gx = 0; gx <= cols; gx++) {
        emit(
          bounds.x + (gx + 0.5) * spacing + (rng.next() - 0.5) * spacing,
          bounds.y + (gy + 0.5) * spacing + (rng.next() - 0.5) * spacing,
          baseRad
        )
      }
    }
  }

  ctx.stroke(path)
  ctx.restore()
  return count
}

/**
 * Campo de "interioridad" 0..1 para el edge fade.
 *
 * Rasteriza la máscara desenfocada a cuarto de resolución y usa el alfa como proxy de
 * distancia al borde: una lectura O(1) por punto en vez de sondear isPointInPath en
 * varias direcciones, que con ~7000 rayas por cabeza × 30 personajes se notaría.
 */
function edgeField(mask, bounds, blurPx) {
  const SCALE = 0.25
  const w = Math.max(1, Math.ceil(bounds.w * SCALE))
  const h = Math.max(1, Math.ceil(bounds.h * SCALE))

  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.filter = `blur(${Math.max(1, blurPx * SCALE)}px)`
  g.setTransform(SCALE, 0, 0, SCALE, -bounds.x * SCALE, -bounds.y * SCALE)
  g.fillStyle = '#fff'
  g.fill(mask)

  const data = g.getImageData(0, 0, w, h).data

  return (x, y) => {
    const px = ((x - bounds.x) * SCALE) | 0
    const py = ((y - bounds.y) * SCALE) | 0
    if (px < 0 || py < 0 || px >= w || py >= h) return 0
    // el blur sangra hacia fuera: en el borde el alfa es ~0.5, así que remapeamos
    // 0.5..1 a 0..1 para que el fade tenga recorrido completo
    return clamp01((data[(py * w + px) * 4 + 3] / 255 - 0.5) * 2)
  }
}

/** Bbox de una caja con margen, para pasar como `bounds`. */
export function boundsOf(box, pad = 0) {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 }
}
