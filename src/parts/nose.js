// Nariz: línea en L que baja del entrecejo y engancha a un lado, rematada por una
// pequeña forma semicircular — la aleta. El conjunto se lee como una "C".
//
// Debajo de la horizontal va una sombra plana, también semicircular, que es lo que le
// da la vuelta al volumen: sin ella el gancho es una línea suelta.

import { interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  // `escalon`: la vertical no baja hasta la horizontal — sale hacia el lado CONTRARIO
  // al gancho, baja, y desde ahí arranca la horizontal larga.
  type: { options: ['recta', 'escalon'], pool: { recta: 2, escalon: 1 }, label: 'Tipo de punta' },
  stepWidth: { min: 0.01, max: 0.14, range: [0.035, 0.075], step: 0.005, label: 'Ancho del escalón' },
  stepDrop: { min: 0.005, max: 0.12, range: [0.03, 0.065], step: 0.005, label: 'Caída del escalón' },
  startY: { min: 0.14, max: 0.44, range: [0.15, 0.36], step: 0.01, label: 'Arranque' },
  length: { min: 0.20, max: 0.56, range: [0.29, 0.52], step: 0.01, label: 'Largo' },
  hookWidth: { min: 0.02, max: 0.22, range: [0.025, 0.14], step: 0.005, label: 'Ancho del gancho' },
  hookSide: { options: ['left', 'right'], pool: { left: 1, right: 1 }, label: 'Lado del gancho' },
  curlRadius: { min: 0, max: 0.7, range: [0.28, 0.45], step: 0.01, label: 'Radio del rizo (aleta)' },
  curlSweep: { min: 120, max: 260, range: [170, 215], step: 5, unit: '°', label: 'Vuelta del rizo' },
  // 0° = el rizo entra en tangente y la esquina desaparece. Es el error que había que
  // corregir: la horizontal tiene que QUEBRAR antes de subir.
  curlCorner: { min: 0, max: 80, range: [32, 52], step: 2, unit: '°', label: 'Ángulo de la esquina' },
  // PROFUNDIDAD de la sombra, no su ancho: el ancho va clavado al de la horizontal.
  // Como fraccion del gancho salia mas estrecha que la nariz y ademas variable.
  shadowDepth: { min: 0, max: 1.2, range: [0.45, 0.7], step: 0.05, label: 'Hondura de la sombra' },
  offsetX: { min: -0.08, max: 0.08, range: [-0.05, 0.05], step: 0.005, label: 'Desplazamiento X' },
  tilt: { min: -8, max: 8, range: [-5, 5], step: 0.5, unit: '°', label: 'Inclinación' },
  lineWeight: { min: 0.5, max: 12, range: [3.6, 3.6], step: 0.1, label: 'Grosor de línea' },
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

  const r = hw * p.curlRadius

  // El escalón sale hacia el lado CONTRARIO al gancho, así que la horizontal de abajo
  // va de `xFar` (lado del escalón) a `px` (donde arranca el rizo).
  const stepped = p.type === 'escalon'
  const sw = stepped ? faceBox.w * p.stepWidth : 0
  const sd = stepped ? faceBox.h * p.stepDrop : 0
  const xFar = bx - dir * sw
  const px = bx + dir * hw // la esquina: punto más bajo y más externo del gancho

  // --- sombra plana bajo la horizontal, antes que la línea -----------------
  // Media elipse, no medio círculo: el ancho lo fija la horizontal —de xFar a px— y solo
  // la hondura es ajustable. Con un círculo el ancho dependía del radio y la sombra no
  // coincidía nunca con la nariz.
  const srx = Math.abs(px - xFar) / 2
  const sry = srx * p.shadowDepth
  if (sry > 0.5) {
    const shadow = new Path2D()
    shadow.ellipse((xFar + px) / 2, y1, srx, sry, 0, 0, Math.PI, false)
    shadow.closePath()
    ctx.fillStyle = palette.skinShadow
    ctx.fill(shadow)
  }

  // --- vertical y horizontal, con la punta EN PICO ------------------------
  // Sin redondear: la esquina entre la vertical y la horizontal es un ángulo vivo.
  const path = new Path2D()
  path.moveTo(nx, y0)
  if (stepped) {
    path.lineTo(bx, y1 - sd)
    path.lineTo(xFar, y1 - sd)
    path.lineTo(xFar, y1)
  } else {
    path.lineTo(bx, y1)
  }
  path.lineTo(px, y1)

  // --- aleta: la línea QUIEBRA y se enrosca sobre sí misma ----------------
  // La clave es que el arco NO entra en tangente. Si el centro cae justo encima de la
  // esquina, el arco sale horizontal, la esquina se redondea y se pierde el quiebre.
  // Girando el centro `curlCorner` grados alrededor de la esquina, el arco arranca ya
  // inclinado y el ángulo vivo aparece solo.
  if (r > 0.5) {
    const th = (p.curlCorner * Math.PI) / 180
    const ccx = px - dir * r * Math.sin(th)
    const ccy = y1 - r * Math.cos(th)
    const start = Math.atan2(Math.cos(th), dir * Math.sin(th))
    const sweep = (p.curlSweep * Math.PI) / 180
    path.arc(ccx, ccy, r, start, start + (dir < 0 ? sweep : -sweep), dir > 0)
  }

  interior(ctx, palette, p.lineWeight)
  ctx.stroke(path)

  return { tipX: bx, tipY: y1, endY: y1 + Math.max(0, sry) }
}
