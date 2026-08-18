// Mejillas: rubor o pecas. Dos círculos planos (el rubor de la geisha y la morada) o
// una nube de puntos por lado (las pecas de la jeune fille). Es de los rasgos que más
// identidad dan por menos tinta.
//
// No es exclusivo de ningún arquetipo: los pools por defecto sacan algún hombre pecoso;
// el arquetipo mujer sube rubor y pecas.

import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  type: {
    options: ['nada', 'rubor', 'pecas'],
    pool: { nada: 5, rubor: 0.4, pecas: 1 },
    label: 'Tipo',
  },
  size: { min: 0.03, max: 0.12, range: [0.05, 0.08], step: 0.005, label: 'Tamaño' },
  spread: { min: 0.2, max: 0.42, range: [0.26, 0.34], step: 0.01, label: 'Separación del centro' },
  // suave = un paso de sombra de piel (morada, fumadora); acento = el rojo de la geisha
  tone: { options: ['suave', 'acento'], pool: { suave: 3, acento: 1 }, label: 'Tono' },
  freckles: { min: 3, max: 9, range: [4, 7], step: 1, int: true, label: 'Pecas por mejilla' },
}

export const randomize = randomizerFor(PARAMS)

/**
 * @param y altura de mejilla en px — la pone character.js donde acaba la nariz, que es
 *          donde viven en las cuatro referencias
 */
export function draw(ctx, faceBox, p, palette, rng, y) {
  if (p.type === 'nada') return
  const r = faceBox.w * p.size
  ctx.fillStyle = p.tone === 'acento' ? palette.accent : palette.skinDeep

  for (const dir of [-1, 1]) {
    const cx = faceBox.cx + dir * faceBox.w * p.spread
    if (p.type === 'rubor') {
      ctx.beginPath()
      ctx.arc(cx, y, r, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const n = Math.round(p.freckles)
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2
        const d = Math.sqrt(rng.next()) * r * 1.4
        ctx.beginPath()
        ctx.arc(cx + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, Math.max(1.8, r * 0.1), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
