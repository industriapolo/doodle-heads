// Gafas. No salen siempre — es una probabilidad, como el cigarrillo o la sombra del ojo.
//
// No calcula dónde van los ojos: se lo pide a eyes.build() a través de character.js. Si
// las lentes se colocaran por su cuenta, cualquier cambio en la geometría del ojo las
// dejaría descolocadas.

import { interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  glasses: { type: 'bool', p: 0.28, label: 'Probabilidad de gafas' },
  shape: {
    options: ['rect', 'redonda'],
    pool: { rect: 2, redonda: 2 },
    label: 'Forma de la lente',
  },
  lensWidth: { min: 0.9, max: 2.0, range: [1.12, 1.4], step: 0.02, label: 'Ancho (× ancho de ojo)' },
  lensAspect: { min: 0.35, max: 1.3, range: [0.55, 0.85], step: 0.02, label: 'Alto (× ancho de lente)' },
  lensOffsetY: { min: -0.5, max: 0.8, range: [0.1, 0.4], step: 0.02, label: 'Centrado vertical' },
  corner: { min: 0, max: 0.5, range: [0.08, 0.3], step: 0.01, label: 'Redondeo (solo rect)' },
  bridgeDrop: { min: -0.4, max: 0.5, range: [-0.1, 0.15], step: 0.02, label: 'Caída del puente' },
  temple: { options: ['si', 'no'], pool: { si: 3, no: 1 }, label: 'Patillas' },
  lineWeight: { min: 0.5, max: 12, range: [3.8, 3.8], step: 0.1, label: 'Grosor de línea' },
}

export const randomize = randomizerFor(PARAMS)

/**
 * @param eyeGeo  lo que devuelve eyes.build(): centros, ancho y flecha de cada ojo
 * @param headBox para saber hasta dónde llegan las patillas
 */
export function draw(ctx, eyeGeo, headBox, p, palette) {
  if (!p.glasses) return null

  const lw = eyeGeo.w * p.lensWidth
  const lh = lw * p.lensAspect
  // El ojo va de la cuerda (cy) hacia abajo, así que su centro visual no es cy sino algo
  // más abajo: la lente se centra ahí, no en la cuerda.
  const cy = eyeGeo.left.cy + eyeGeo.depth * p.lensOffsetY

  const lente = (cx) => {
    const path = new Path2D()
    if (p.shape === 'redonda') {
      path.ellipse(cx, cy, lw / 2, lh / 2, 0, 0, Math.PI * 2)
    } else {
      const r = Math.min(lw, lh) * p.corner
      path.roundRect(cx - lw / 2, cy - lh / 2, lw, lh, r)
    }
    return path
  }

  interior(ctx, palette, p.lineWeight)

  const izq = eyeGeo.left.cx
  const der = eyeGeo.right.cx
  ctx.stroke(lente(izq))
  ctx.stroke(lente(der))

  // puente: de borde interior a borde interior
  const puente = new Path2D()
  const py = cy + lh * p.bridgeDrop
  puente.moveTo(izq + lw / 2, py)
  puente.lineTo(der - lw / 2, py)
  ctx.stroke(puente)

  // patillas: del borde exterior hacia la oreja, ligeramente hacia arriba
  if (p.temple === 'si') {
    const patillas = new Path2D()
    for (const [cx, dir] of [[izq, -1], [der, 1]]) {
      const x0 = cx + (dir * lw) / 2
      const x1 = dir < 0 ? headBox.x : headBox.right
      patillas.moveTo(x0, cy - lh * 0.18)
      patillas.lineTo(x1, cy - lh * 0.34)
    }
    ctx.stroke(patillas)
  }

  return { cy, lensWidth: lw, lensHeight: lh }
}
