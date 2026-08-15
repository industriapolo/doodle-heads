// Ojos: almendra con párpado caído encima, bolsas marcadas y pupila pequeña.
// Es la parte con más estados de animación — `lidCoverage` va de 0 (abierto) a 1 (cerrado)
// y es exactamente el canal que usa el blink de rig.js.

import { interior } from '../style/stroke.js'

export const PARAMS = {
  // Medido sobre la referencia magenta: cada ojo ocupa el 35% del ancho de cabeza y el par
  // abarca el 76% de la cara. Un ojo pequeño deja la cara vacía y rompe el parecido.
  eyeWidth: { min: 0.16, max: 0.42, default: 0.32, step: 0.01, label: 'Ancho de ojo' },
  eyeHeight: { min: 0.05, max: 0.20, default: 0.12, step: 0.005, label: 'Alto de ojo' },
  spacing: { min: 0.01, max: 0.22, default: 0.06, step: 0.01, label: 'Separación' },
  offsetY: { min: 0.26, max: 0.60, default: 0.40, step: 0.01, label: 'Altura' },
  lidCoverage: { min: 0, max: 1, default: 0.5, step: 0.01, label: 'Párpado' },
  pupilSize: { min: 0.05, max: 0.24, default: 0.13, step: 0.005, label: 'Tamaño pupila' },
  pupilX: { min: -1, max: 1, default: 0, step: 0.05, label: 'Mirada X' },
  pupilY: { min: -1, max: 1, default: -0.15, step: 0.05, label: 'Mirada Y' },
  // Distancia ceja→ojo. En las referencias el ojo va pegado bajo la ceja (~4% de la cara),
  // así que character.js deriva la altura del ojo de la ceja usando esto y `offsetY`
  // solo actúa cuando el módulo se usa suelto (su preview).
  browGap: { min: 0, max: 0.14, default: 0.035, step: 0.005, label: 'Hueco bajo la ceja' },
  bagLines: { min: 0, max: 2, default: 1, step: 1, label: 'Líneas de bolsa' },
  sclera: { options: ['white', 'accent'], default: 'white', label: 'Esclerótica' },
}

export function randomize(rng) {
  return {
    eyeWidth: rng.range(0.26, 0.38),
    // almendra ancha y baja: alta y redonda deja un blanco enorme que no está en las refs
    eyeHeight: rng.range(0.07, 0.115),
    spacing: rng.range(0.03, 0.11),
    offsetY: rng.range(0.34, 0.46),
    lidCoverage: rng.range(0.42, 0.68),
    pupilSize: rng.range(0.08, 0.19),
    pupilX: rng.range(-0.5, 0.5),
    pupilY: rng.range(-0.4, 0.1),
    browGap: rng.range(0.01, 0.09),
    bagLines: rng.int(0, 2),
    sclera: rng.weighted({ white: 4, accent: 1 }),
  }
}

/** Geometría de los dos ojos, sin dibujar. rig.js la necesita para animar la mirada. */
export function build(faceBox, p) {
  const w = faceBox.w * p.eyeWidth
  const h = faceBox.h * p.eyeHeight
  const gap = faceBox.w * p.spacing
  const cy = faceBox.y + faceBox.h * p.offsetY
  return {
    w,
    h,
    left: { cx: faceBox.cx - gap / 2 - w / 2, cy },
    right: { cx: faceBox.cx + gap / 2 + w / 2, cy },
  }
}

export function draw(ctx, faceBox, p, palette, rng) {
  const g = build(faceBox, p)
  for (const side of [g.left, g.right]) {
    eye(ctx, side.cx, side.cy, g.w, g.h, p, palette)
  }
  return g
}

function almondPath(cx, cy, w, h) {
  const path = new Path2D()
  const l = cx - w / 2
  const r = cx + w / 2
  path.moveTo(l, cy)
  // control a -h da vértice en -h/2; el inferior más pronunciado es lo que hace la almendra
  path.quadraticCurveTo(cx, cy - h, r, cy)
  path.quadraticCurveTo(cx, cy + h * 1.4, l, cy)
  path.closePath()
  return path
}

function eye(ctx, cx, cy, w, h, p, palette) {
  const shape = almondPath(cx, cy, w, h)

  // El párpado interpola entre el borde superior (abierto) y el inferior (cerrado):
  // a lidCoverage = 1 la curva del párpado coincide con la curva de abajo y el ojo
  // queda sellado. Eso es lo que hace que el blink sea un único número.
  const lidCtrlY = cy - h + p.lidCoverage * (h * 2.4)

  ctx.save()
  ctx.clip(shape)

  ctx.fillStyle = p.sclera === 'accent' ? palette.accent : palette.accent2
  ctx.fillRect(cx - w, cy - h * 2, w * 2, h * 4)

  // Pupila. Va colgada del BORDE DEL PÁRPADO, no del centro del ojo: en las referencias
  // el punto se apoya justo debajo de la línea del párpado. Anclarla al centro hacía que
  // el párpado se la tragara en cuanto lidCoverage pasaba de 0.4.
  const pr = (w * p.pupilSize) / 2
  const lidApexY = (cy + lidCtrlY) / 2
  const px = cx + p.pupilX * (w / 2 - pr * 1.8)
  const py = Math.min(lidApexY + pr * 1.15 + p.pupilY * h * 0.18, cy + h * 0.5 - pr)
  ctx.fillStyle = palette.line
  ctx.beginPath()
  ctx.arc(px, py, pr, 0, Math.PI * 2)
  ctx.fill()

  // el párpado tapa lo que sobra porque va después: no hay que recortar nada a mano
  const lid = new Path2D()
  lid.moveTo(cx - w / 2, cy)
  lid.quadraticCurveTo(cx, lidCtrlY, cx + w / 2, cy)
  lid.lineTo(cx + w / 2, cy - h * 3)
  lid.lineTo(cx - w / 2, cy - h * 3)
  lid.closePath()
  ctx.fillStyle = palette.skin
  ctx.fill(lid)

  ctx.restore()

  // almendra fina...
  interior(ctx, palette, 0.8)
  ctx.stroke(shape)

  // ...y línea de párpado más gruesa encima: es la que da la mirada caída
  const lidLine = new Path2D()
  lidLine.moveTo(cx - w / 2, cy)
  lidLine.quadraticCurveTo(cx, lidCtrlY, cx + w / 2, cy)
  interior(ctx, palette, 1.15)
  ctx.stroke(lidLine)

  // bolsas
  interior(ctx, palette, 0.7)
  for (let i = 0; i < p.bagLines; i++) {
    const by = cy + h * (0.95 + i * 0.5)
    const bw = w * (0.82 - i * 0.14)
    const bag = new Path2D()
    bag.moveTo(cx - bw / 2, by)
    bag.quadraticCurveTo(cx, by + h * 0.55, cx + bw / 2, by)
    ctx.stroke(bag)
  }
}
