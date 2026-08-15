// Un rasgo aislado no se puede juzgar: el ajuste fino sale de la superposición de capas.
// Así que las previews de rasgos los dibujan SOBRE una cabeza real, con su seed derivada
// de la misma celda para que la cabeza sea estable mientras iteras el rasgo.

import * as head from '../src/parts/head.js'

export function drawHead(ctx, frame, palette, rng, overrides = {}) {
  const p = { ...head.randomize(rng.fork(1)), ...overrides }
  return head.draw(ctx, frame, p, palette, rng)
}

export { head }
