// Ojos. La construcción sale de mirar las referencias, no de un óvalo genérico:
//
//   · el blanco es un SEGMENTO CIRCULAR — recta arriba, arco de círculo abajo,
//     donde la recta es la cuerda de ese círculo
//   · la pupila se apoya EN la recta, no flota en el centro
//   · por encima, y separada, va otra línea arqueada: no es el borde del blanco,
//     es el pliegue del párpado, y su trabajo es insinuar que el globo sigue
//     redondo por detrás
//
// El parpadeo cae solo de esta geometría: la cuerda baja hacia el arco y el blanco
// se cierra a cero. `lidCoverage` es ese único número.

import { interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  eyeWidth: { min: 0.14, max: 0.44, range: [0.25, 0.43], step: 0.01, label: 'Ancho (cuerda)' },
  depth: { min: 0.015, max: 0.12, range: [0.025, 0.115], step: 0.005, label: 'Apertura (flecha del arco)' },
  tilt: { min: -18, max: 18, range: [-2, 1], step: 0.5, unit: '°', label: 'Inclinación' },
  spacing: { min: 0.01, max: 0.24, range: [0.1, 0.18], step: 0.01, label: 'Separación' },
  offsetY: { min: 0.24, max: 0.62, range: [0.34, 0.46], step: 0.01, label: 'Altura' },
  browGap: { min: 0, max: 0.16, range: [0.01, 0.14], step: 0.005, label: 'Hueco bajo la ceja' },

  lidGap: { min: 0.01, max: 0.34, range: [0.05, 0.325], step: 0.005, label: 'Separación del párpado' },
  lidRise: { min: 0.03, max: 0.45, range: [0.115, 0.275], step: 0.005, label: 'Curvatura del párpado' },
  // El tope es 0.95 a propósito: el pliegue SIEMPRE tiene que ser más estrecho que el ojo.
  // En cuanto lo iguala o lo pasa, deja de leerse como párpado y se lee como una ceja.
  lidSpan: { min: 0.35, max: 0.95, range: [0.74, 0.82], step: 0.01, label: 'Largo del párpado' },

  pupilSize: { min: 0.03, max: 0.22, range: [0.03, 0.17], step: 0.005, label: 'Tamaño pupila' },
  pupilX: { min: -1, max: 1, range: [-0.75, 1], step: 0.05, label: 'Mirada X' },

  bagLines: { min: 0, max: 3, range: [0, 3], step: 1, int: true, label: 'Líneas de bolsa' },
  // Múltiplo de la apertura del ojo. Estaba clavado en 0.75 y las bolsas se desparramaban
  // por media mejilla en vez de leerse como un grupo.
  bagSpacing: { min: 0.06, max: 0.8, range: [0.16, 0.28], step: 0.01, label: 'Separación entre bolsas' },
  bagTop: { min: 0.6, max: 2.2, range: [1.05, 1.3], step: 0.05, label: 'Distancia al ojo' },
  // `accent` queda apagado: en la paleta magenta daba ojos rojos. No lo borro porque la
  // referencia del esqueleto sí lleva ojos de acento — se enciende desde el panel.
  sclera: { options: ['white', 'accent'], pool: { white: 1, accent: 0 }, label: 'Esclerótica' },

  // Canal de animación. 0 = como está dibujado, 1 = cerrado del todo.
  lidCoverage: { min: 0, max: 1, range: [0, 0.07], step: 0.01, label: 'Cierre del párpado' },

  // Anchos absolutos e independientes entre sí: el ojo (arco inferior y borde del
  // párpado) y sus detalles (pliegue y bolsas) se ajustan por separado.
  lineWeight: { min: 0.5, max: 12, range: [4.1, 4.1], step: 0.1, label: 'Grosor del ojo' },
  detailWeight: { min: 0.5, max: 12, range: [3.2, 3.2], step: 0.1, label: 'Grosor de los detalles' },
}

export const randomize = randomizerFor(PARAMS)

/** Geometría de los dos ojos, sin dibujar. rig.js la necesita para la mirada. */
export function build(faceBox, p) {
  const w = faceBox.w * p.eyeWidth
  const depth = faceBox.h * p.depth
  const gap = faceBox.w * p.spacing
  const cy = faceBox.y + faceBox.h * p.offsetY
  return {
    w,
    depth,
    left: { cx: faceBox.cx - gap / 2 - w / 2, cy, dir: -1 },
    right: { cx: faceBox.cx + gap / 2 + w / 2, cy, dir: 1 },
  }
}

export function draw(ctx, faceBox, p, palette, rng) {
  const g = build(faceBox, p)
  for (const side of [g.left, g.right]) eye(ctx, side, g.w, g.depth, p, palette)
  return g
}

/**
 * Segmento circular: cuerda horizontal de largo `w` en y=0, arco de flecha `sag`
 * bombeando hacia `sign` (+1 abajo, -1 arriba). Un arco de círculo de verdad, no
 * una bézier que se le parezca.
 */
function segmentArc(path, w, sag, sign) {
  const half = w / 2
  const R = (sag * sag + half * half) / (2 * sag)
  const cy = sign * -(R - sag) // centro del círculo, al otro lado de la cuerda
  const a0 = Math.atan2(sign * (R - sag), -half)
  const a1 = Math.atan2(sign * (R - sag), half)
  path.arc(0, cy, R, a0, a1, sign > 0)
  return { R, cy }
}

function eye(ctx, side, w, depth, p, palette) {
  const { cx, cy } = side
  const lidY = depth * p.lidCoverage // la cuerda baja al parpadear

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((p.tilt * Math.PI) / 180)

  // --- blanco: cuerda recta + arco de círculo -----------------------------
  const white = new Path2D()
  white.moveTo(-w / 2, 0)
  segmentArc(white, w, depth, 1)
  white.closePath()

  ctx.save()
  ctx.clip(white)

  ctx.fillStyle = p.sclera === 'accent' ? palette.accent : palette.accent2
  ctx.fillRect(-w, -depth * 2, w * 2, depth * 4)

  // pupila apoyada en la recta
  const pr = (w * p.pupilSize) / 2
  const px = p.pupilX * (w / 2 - pr * 2.2)
  ctx.fillStyle = palette.line
  ctx.beginPath()
  ctx.arc(px, lidY + pr * 0.45, pr, 0, Math.PI * 2)
  ctx.fill()

  // al parpadear, la piel come el blanco desde arriba (y de paso la pupila)
  if (lidY > 0.01) {
    ctx.fillStyle = palette.skin
    ctx.fillRect(-w, -depth * 3, w * 2, depth * 3 + lidY)
  }
  ctx.restore()

  // --- arco inferior ------------------------------------------------------
  const lower = new Path2D()
  lower.moveTo(-w / 2, 0)
  segmentArc(lower, w, depth, 1)
  interior(ctx, palette, p.lineWeight * 0.75)
  ctx.stroke(lower)

  // --- la recta de arriba: es el borde del párpado, va más gruesa ----------
  const chord = new Path2D()
  chord.moveTo(-w / 2, lidY)
  chord.lineTo(w / 2, lidY)
  interior(ctx, palette, p.lineWeight)
  ctx.stroke(chord)

  // --- pliegue del párpado: la línea que redondea el globo -----------------
  // acompaña al parpadeo, pero a la mitad de recorrido — un párpado real no baja
  // todo el pliegue con el borde
  const lw = w * p.lidSpan
  const rise = w * p.lidRise
  const lidBaseY = -w * p.lidGap + lidY * 0.5
  ctx.save()
  ctx.translate(0, lidBaseY)
  const crease = new Path2D()
  crease.moveTo(-lw / 2, 0)
  segmentArc(crease, lw, rise, -1)
  interior(ctx, palette, p.detailWeight)
  ctx.stroke(crease)
  ctx.restore()

  // --- bolsas -------------------------------------------------------------
  interior(ctx, palette, p.detailWeight * 0.8)
  const spacing = depth * p.bagSpacing
  // La curva no puede hundirse más que la separación o las bolsas se cruzan entre sí:
  // el vértice de una quedaría por debajo de los extremos de la siguiente.
  const bulge = Math.min(depth * 1.2, spacing * 1.6)
  for (let i = 0; i < p.bagLines; i++) {
    const by = depth * p.bagTop + i * spacing
    const bw = w * (0.8 - i * 0.12)
    const bag = new Path2D()
    bag.moveTo(-bw / 2, by)
    bag.quadraticCurveTo(0, by + bulge, bw / 2, by)
    ctx.stroke(bag)
  }

  ctx.restore()
}
