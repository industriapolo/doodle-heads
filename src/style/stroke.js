// Trazo y esquinas. Todos los grosores son absolutos en el espacio lógico 800×800:
// el peso de línea uniforme es lo que hace que todo se lea como la misma mano.
//
// `wobble` está cerrado en 0 — los contornos de las referencias son vector limpio.
// El aire de "hecho a mano" vive entero en el jitter de hatching.js, no aquí.

export const WOBBLE = 0

// Los grosores se pasan SIEMPRE como ancho absoluto en unidades del espacio de trabajo,
// nunca como multiplicador de un peso compartido. Con multiplicadores encadenados, tocar
// el grosor de la nariz movía también el de los ojos: no eran ajustables de verdad por
// separado. Cada parte declara el suyo en su PARAMS.
//
// Estos valores son el punto de partida de cada parte, no un estado global mutable.
export const WEIGHT = {
  outline: 6, // contorno principal
  interior: 3.6, // líneas interiores: 60% del contorno (§4)
  fine: 2.2, // rayitas de hatching
}

/** Contorno principal. `width` en unidades del espacio lógico. */
export function outline(ctx, palette, width = WEIGHT.outline) {
  ctx.strokeStyle = palette.line
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

/** Línea interior (párpados, nariz, arrugas). */
export function interior(ctx, palette, width = WEIGHT.interior) {
  ctx.strokeStyle = palette.line
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

/** Rayita fina (hatching). */
export function fine(ctx, palette, width = WEIGHT.fine) {
  ctx.strokeStyle = palette.hatch
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

// ---------------------------------------------------------------------------
// Esquinas
// ---------------------------------------------------------------------------

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * Polígono con esquinas redondeadas independientes. Es la primitiva de silueta:
 * head.js define un polígono (con su jaw inset) y le pasa un radio por vértice.
 *
 * Va a midpoints de arista en vez de a los vértices siguientes para que un radio
 * grande nunca se pase de largo y cruce la arista contigua.
 *
 * @param pts   [{x,y}, ...] en orden
 * @param radii number | number[] — radio por vértice
 * @returns Path2D (sirve para fill, stroke y clip)
 */
export function roundedPolyPath(pts, radii) {
  const n = pts.length
  const r = (i) => (Array.isArray(radii) ? radii[i] ?? 0 : radii)
  const path = new Path2D()

  const start = mid(pts[n - 1], pts[0])
  path.moveTo(start.x, start.y)

  for (let i = 0; i < n; i++) {
    const cur = pts[i]
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    // el radio no puede comerse más de media arista por ninguno de los dos lados
    const max = Math.min(dist(prev, cur), dist(cur, next)) / 2
    const rr = Math.max(0, Math.min(r(i), max))
    const to = mid(cur, next)
    if (rr > 0.01) path.arcTo(cur.x, cur.y, to.x, to.y, rr)
    else path.lineTo(cur.x, cur.y)
    path.lineTo(to.x, to.y)
  }

  path.closePath()
  return path
}

/** Rectángulo con radio por esquina: [supIzq, supDer, infDer, infIzq]. */
export function roundedRectPath(x, y, w, h, radii) {
  const pts = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  return roundedPolyPath(pts, radii)
}

/** Traza una polilínea abierta suavizada por curvas cuadráticas (párpados, arrugas). */
export function smoothPath(pts) {
  const path = new Path2D()
  if (pts.length < 2) return path
  path.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1])
    path.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y)
  }
  const last = pts[pts.length - 1]
  path.lineTo(last.x, last.y)
  return path
}

/** Rellena y contornea una silueta de una sola vez. */
export function fillAndStroke(ctx, path, fillColor, palette, width = WEIGHT.outline) {
  ctx.fillStyle = fillColor
  ctx.fill(path)
  outline(ctx, palette, width)
  ctx.stroke(path)
}
