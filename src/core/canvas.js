// Setup de canvas. Los módulos dibujan SIEMPRE en coordenadas lógicas 0..LOGICAL
// y nunca se enteran del devicePixelRatio ni del tamaño real de pantalla.

export const LOGICAL = 800

/**
 * Prepara un canvas para dibujar en el espacio lógico.
 * @param canvas  elemento <canvas>
 * @param display lado en px CSS (el tamaño al que se ve)
 * @returns el contexto 2D, ya transformado
 */
export function setupCanvas(canvas, display = LOGICAL) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(display * dpr)
  canvas.height = Math.round(display * dpr)
  canvas.style.width = display + 'px'
  canvas.style.height = display + 'px'

  const ctx = canvas.getContext('2d')
  const s = (display * dpr) / LOGICAL
  ctx.setTransform(s, 0, 0, s, 0, 0)
  // guardamos la escala base para poder restaurarla tras un reset
  ctx._baseScale = s
  return ctx
}

/** Restaura la transformación base (tras haber toqueteado el transform). */
export function resetTransform(ctx) {
  const s = ctx._baseScale || 1
  ctx.setTransform(s, 0, 0, s, 0, 0)
}

/** Limpia el canvas entero y opcionalmente lo rellena de color. */
export function clear(ctx, color) {
  ctx.save()
  resetTransform(ctx)
  if (color) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, LOGICAL, LOGICAL)
  } else {
    ctx.clearRect(0, 0, LOGICAL, LOGICAL)
  }
  ctx.restore()
}

/** Caja rectangular: la unidad de layout que se pasa a cada parte. */
export function box(x, y, w, h) {
  return {
    x, y, w, h,
    cx: x + w / 2,
    cy: y + h / 2,
    right: x + w,
    bottom: y + h,
  }
}
