// Acabado: la capa final sobre el dibujo entero. Grano de papel y viñeta, gobernados
// por la paleta (palette.grain / grainScale / vignette). A 0, esta capa no existe.
//
// El grano es UN tile de ruido compartido por todas las caras: es textura de papel, no
// identidad del personaje, así que no depende de la seed. Se genera una vez por sesión
// con el PRNG del proyecto (determinista: mismo tile siempre) y se compone en `overlay`,
// que sobre gris medio es neutro — el tile solo aporta sus desviaciones.

import { LOGICAL } from '../core/canvas.js'
import { mulberry32 } from '../core/prng.js'

const TILE = 160
let tile = null

function noiseTile() {
  if (tile) return tile
  tile = document.createElement('canvas')
  tile.width = tile.height = TILE
  const ictx = tile.getContext('2d')
  const img = ictx.createImageData(TILE, TILE)
  const rnd = mulberry32(0xd00d1e5)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 96
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ictx.putImageData(img, 0, 0)
  return tile
}

/** Se llama al final de character.draw, sobre el lienzo lógico completo. */
export function applyFinish(ctx, palette) {
  const g = palette.grain ?? 0
  const v = palette.vignette ?? 0
  if (g < 0.005 && v < 0.005) return

  ctx.save()
  if (g >= 0.005) {
    const pat = ctx.createPattern(noiseTile(), 'repeat')
    // escala del tile = tamaño del grano; sin DOMMatrix (tests headless) se queda a 1
    if (pat.setTransform && typeof DOMMatrix !== 'undefined')
      pat.setTransform(new DOMMatrix().scale(palette.grainScale || 1))
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = g
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, LOGICAL, LOGICAL)
  }
  if (v >= 0.005) {
    const c = LOGICAL / 2
    const grad = ctx.createRadialGradient(c, c, LOGICAL * 0.42, c, c, LOGICAL * 0.74)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(v, 1)})`)
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 1
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, LOGICAL, LOGICAL)
  }
  ctx.restore()
}
