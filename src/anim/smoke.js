// Humo del cigarro: UNA línea que nace en la punta y sube ondulando. Nada de
// partículas — es la voluta de la referencia 1, reducida a su gesto.
//
// La ondulación crece con la altura (f^0.8): pegada a la brasa el humo sube recto y
// arriba se deshace. Dos senos a frecuencias distintas para que el vaivén no sea
// metrónomo, y una deriva lateral fija para que no suba en columna.

const HEIGHT = 185 // unidades lógicas de subida
const STEPS = 24 // más tramos al ser más larga, o la ondulación sale poligonal

/**
 * @param tip   {x, y} — la punta del cigarro, de mouthGeo.smoke
 * @param t     reloj en ms (el del rAF)
 * @param phase desfase por personaje, para que treinta humos no ondulen a coro
 */
export function drawSmoke(ctx, tip, t, palette, phase = 0) {
  ctx.save()
  ctx.strokeStyle = palette.line
  ctx.globalAlpha = 0.38
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  ctx.beginPath()
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS
    const y = tip.y - f * HEIGHT
    const sway =
      Math.sin(phase + t * 0.0016 + f * 5) * 14 * f ** 0.8 +
      Math.sin(phase * 2 + t * 0.0009 + f * 10) * 5 * f
    const x = tip.x + sway + f * 9
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}
