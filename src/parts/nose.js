// Nariz: línea en L que baja del entrecejo y engancha a un lado, rematada por una
// pequeña forma semicircular — la aleta. El conjunto se lee como una "C".
//
// Debajo de la horizontal va una sombra plana, también semicircular, que es lo que le
// da la vuelta al volumen: sin ella el gancho es una línea suelta.

import { interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  startY: { min: 0.14, max: 0.44, range: [0.18, 0.36], step: 0.01, label: 'Arranque' },
  // arranca en el entrecejo (~23%) y en las refs llega casi a la boca: por debajo
  // de 0.32 se queda flotando en mitad de la cara
  length: { min: 0.20, max: 0.56, range: [0.34, 0.54], step: 0.01, label: 'Largo' },
  // En los pantallazos la horizontal de la C es casi la mitad de la vertical: con
  // ganchos cortos la nariz se queda en una rayita con un pico
  hookWidth: { min: 0.02, max: 0.22, range: [0.08, 0.16], step: 0.005, label: 'Ancho del gancho' },
  hookSide: { options: ['left', 'right'], pool: { left: 1, right: 1 }, label: 'Lado del gancho' },
  wingSize: { min: 0, max: 0.7, range: [0.22, 0.42], step: 0.01, label: 'Aleta' },
  shadowSize: { min: 0, max: 1.2, range: [0.28, 0.55], step: 0.05, label: 'Sombra bajo la horizontal' },
  offsetX: { min: -0.08, max: 0.08, range: [-0.05, 0.05], step: 0.005, label: 'Desplazamiento X' },
  tilt: { min: -8, max: 8, range: [-5, 5], step: 0.5, unit: '°', label: 'Inclinación' },
}

export const randomize = randomizerFor(PARAMS)

export function draw(ctx, faceBox, p, palette, rng) {
  const nx = faceBox.cx + faceBox.w * p.offsetX
  const y0 = faceBox.y + faceBox.h * p.startY
  const y1 = y0 + faceBox.h * p.length
  const hw = faceBox.w * p.hookWidth
  const dir = p.hookSide === 'left' ? -1 : 1
  const lean = Math.tan((p.tilt * Math.PI) / 180) * (y1 - y0)
  const bx = nx + lean // base de la vertical

  const wr = hw * p.wingSize
  const corner = Math.min(hw * 0.45, faceBox.h * 0.02)

  // --- sombra plana bajo la horizontal, antes que la línea -----------------
  const sr = hw * p.shadowSize
  if (sr > 1) {
    const scx = bx + dir * (hw * 0.5)
    const shadow = new Path2D()
    shadow.arc(scx, y1, sr, 0, Math.PI, false) // semicírculo hacia abajo
    shadow.closePath()
    ctx.fillStyle = palette.skinShadow
    ctx.fill(shadow)
  }

  // --- la C: vertical, esquina redondeada, horizontal ---------------------
  const path = new Path2D()
  path.moveTo(nx, y0)
  path.lineTo(bx, y1 - corner)
  path.quadraticCurveTo(bx, y1, bx + dir * corner, y1)
  path.lineTo(bx + dir * (hw - wr * 2), y1)

  // --- aleta: semicírculo que remata el gancho ----------------------------
  if (wr > 0.5) {
    const wcx = bx + dir * (hw - wr)
    // de π a 0 en sentido horario de pantalla pasa por arriba: la aleta abomba hacia
    // el puente, que es como remata en las referencias
    path.arc(wcx, y1, wr, dir < 0 ? 0 : Math.PI, dir < 0 ? Math.PI : 0, dir < 0)
  }

  interior(ctx, palette)
  ctx.stroke(path)

  return { tipX: bx, tipY: y1, endY: y1 + (sr > 1 ? sr : 0) }
}
