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

// Modo `lapiz` (palette.strokeStyle): la tinta se rompe con un dash irregular FIJO
// (determinista: nada de rng aquí) y pierde opacidad (palette.sketchLine). El patrón se
// escala con el grosor para que contorno e interiores rompan en la misma proporción.
const SKETCH_DASH = [46, 4, 23, 3, 34, 5, 17, 3]

function configure(ctx, palette, width, color) {
  const lapiz = palette.strokeStyle === 'lapiz'
  ctx.strokeStyle = lapiz ? palette.sketchLine || color : color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // el dash es estado del contexto: el modo limpio tiene que RESETEARLO, porque todo
  // trazo pasa por aquí pero los rellenos no
  if (lapiz) ctx.setLineDash(SKETCH_DASH.map((d) => (d * width) / WEIGHT.outline))
  else ctx.setLineDash([])
}

/** Contorno principal. `width` en unidades del espacio lógico. */
export function outline(ctx, palette, width = WEIGHT.outline) {
  configure(ctx, palette, width, palette.line)
}

/** Línea interior (párpados, nariz, arrugas). */
export function interior(ctx, palette, width = WEIGHT.interior) {
  configure(ctx, palette, width, palette.line)
}

/** Rayita fina (hatching). Sin dash: romper rayitas de 12 unidades las evapora. */
export function fine(ctx, palette, width = WEIGHT.fine) {
  const lapiz = palette.strokeStyle === 'lapiz'
  ctx.strokeStyle = lapiz ? palette.sketchLine || palette.hatch : palette.hatch
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([])
}

/**
 * Traza un contorno con el estilo de la paleta: `limpio` es una pasada; `lapiz` añade
 * una segunda más fina, desplazada y levemente girada sobre el centro del lienzo — el
 * repaso del boceto. Determinista: el desplazamiento es fijo, escalado por sketchJitter.
 */
export function strokeOutline(ctx, path, palette, width = WEIGHT.outline) {
  outline(ctx, palette, width)
  ctx.stroke(path)
  if (palette.strokeStyle === 'lapiz' && (palette.sketchJitter ?? 0) > 0.05) {
    const j = palette.sketchJitter
    ctx.save()
    ctx.translate(400, 400)
    ctx.rotate(0.0035 * j)
    ctx.translate(-400 + j * 0.9, -400 - j * 0.7)
    outline(ctx, palette, width * 0.5)
    ctx.stroke(path)
    ctx.restore()
  }
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

// ---------------------------------------------------------------------------
// Casquetes del contorno
// ---------------------------------------------------------------------------

/**
 * El tramo de un polígono redondeado desplazado `o` hacia fuera que va de la costura
 * izquierda (altura `yL`) a la derecha (`yR`): por arriba (`crown`) o por abajo (`jaw`).
 *
 * Es la primitiva de las masas de pelo y barba: al derivarse de los MISMOS puntos y
 * radios que dibujan la silueta, encajan por construcción con cualquier radio de esquina
 * y cualquier asimetría — aproximarla con una elipse dejaba esquinas de cráneo asomando.
 *
 * Devuelve una polilínea ordenada — crown: izquierda → derecha; jaw: derecha → izquierda
 * pasando por la barbilla (el sentido horario del contorno en ambos casos) — o `null` si
 * alguna costura no corta el contorno.
 */
export function shellBetween(pts, radii, o, yL, yR, part = 'crown') {
  const loop = offsetLoop(pts, radii, o)
  const m = loop.length
  // costura izquierda: primer cruce de yL subiendo desde la barbilla por el lado
  // izquierdo. Costura derecha: último cruce de yR bajando por el derecho.
  let iL = -1
  let iR = -1
  for (let i = 0; i < m - 1 && iL < 0; i++) if (loop[i].y >= yL && loop[i + 1].y < yL) iL = i
  for (let i = m - 1; i > 0 && iR < 0; i--) if (loop[i].y >= yR && loop[i - 1].y < yR) iR = i
  if (iL < 0 || iR < 0 || iL >= iR) return null

  const cut = (A, B, y) => ({ x: A.x + ((B.x - A.x) * (y - A.y)) / (B.y - A.y || 1), y })
  if (part === 'crown') {
    const out = [cut(loop[iL], loop[iL + 1], yL)]
    for (let i = iL + 1; i < iR; i++) out.push(loop[i])
    out.push(cut(loop[iR], loop[iR - 1], yR))
    return out
  }
  const out = [cut(loop[iR], loop[iR - 1], yR)]
  for (let i = iR; i < m; i++) out.push(loop[i])
  for (let i = 0; i <= iL; i++) out.push(loop[i])
  out.push(cut(loop[iL], loop[iL + 1], yL))
  return out
}

/**
 * La silueta completa desplazada `o`, como polilínea cerrada. Cada esquina se desplaza
 * sobre su círculo real — mismo centro, radio + o — con la misma tangencia y el mismo
 * clamp de radio que aplica `arcTo` dentro de roundedPolyPath. Las aristas no hace falta
 * muestrearlas: entre el final de un arco y el principio del siguiente son rectas.
 *
 * El lazo se rota para empezar en su punto más bajo (la barbilla), de modo que el
 * recorrido horario sea barbilla → lado izquierdo → coronilla → lado derecho.
 */
function offsetLoop(pts, radii, o) {
  const n = pts.length
  const out = []
  for (let i = 0; i < n; i++) {
    const V = pts[i]
    const P = pts[(i - 1 + n) % n]
    const N = pts[(i + 1) % n]
    const c = cornerArc(P, V, N, Array.isArray(radii) ? radii[i] ?? 0 : radii)
    const a1 = edgeNormalAngle(P, V)
    const a2 = edgeNormalAngle(V, N)
    let delta = a2 - a1
    while (delta <= -Math.PI) delta += Math.PI * 2
    while (delta > Math.PI) delta -= Math.PI * 2
    const R = c.r + o
    const steps = Math.max(2, Math.ceil((Math.abs(delta) * R) / 7))
    for (let k = 0; k <= steps; k++) {
      const a = a1 + (delta * k) / steps
      out.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R })
    }
  }
  let lo = 0
  for (let i = 1; i < out.length; i++) if (out[i].y > out[lo].y) lo = i
  return out.slice(lo).concat(out.slice(0, lo))
}

/** Círculo del redondeo del vértice V entre sus vecinos P y N: { x, y, r } del arco real. */
function cornerArc(P, V, N, r) {
  const l1 = dist(P, V)
  const l2 = dist(V, N)
  const rr = Math.max(0, Math.min(r, Math.min(l1, l2) / 2))
  const d1 = { x: (P.x - V.x) / l1, y: (P.y - V.y) / l1 }
  const d2 = { x: (N.x - V.x) / l2, y: (N.y - V.y) / l2 }
  const half = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y))) / 2
  const bl = Math.hypot(d1.x + d2.x, d1.y + d2.y) || 1
  const dd = rr / Math.sin(half)
  return { x: V.x + ((d1.x + d2.x) / bl) * dd, y: V.y + ((d1.y + d2.y) / bl) * dd, r: rr }
}

/** Ángulo de la normal exterior de la arista A→B (polígono horario, y hacia abajo). */
function edgeNormalAngle(A, B) {
  return Math.atan2(-(B.x - A.x), B.y - A.y)
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
