// Ensamblador. No conoce los rangos de ninguna parte: pide `randomize()` a cada una y
// las compone en el orden de capas correcto.
//
// Lo único que sí decide aquí es la COHERENCIA entre partes — que el ojo cuelgue de la
// ceja y la nariz del entrecejo. Eso no puede vivir dentro de un módulo, porque ninguno
// ve a los demás.

import * as head from '../parts/head.js'
import * as ears from '../parts/ears.js'
import * as hair from '../parts/hair.js'
import * as brows from '../parts/brows.js'
import * as eyes from '../parts/eyes.js'
import * as nose from '../parts/nose.js'
import * as mouth from '../parts/mouth.js'
import { makeRng } from './prng.js'
import { pickPalette, getPalette } from '../style/palettes.js'

/**
 * Un personaje completo = un objeto plano. Serializable, reproducible, mutable.
 *
 * Cada parte recibe un `fork` propio del PRNG en vez de consumir la secuencia compartida:
 * así añadir un parámetro a la boca no cambia la cara de todos los personajes ya guardados.
 */
export function makeCharacter(seed, paletteName) {
  const rng = makeRng(seed)
  return {
    seed,
    palette: paletteName || pickPalette(rng).label,
    paletteName: paletteName || null,
    head: head.randomize(rng.fork(1)),
    ears: ears.randomize(rng.fork(2)),
    hair: hair.randomize(rng.fork(3)),
    brows: brows.randomize(rng.fork(4)),
    eyes: eyes.randomize(rng.fork(5)),
    nose: nose.randomize(rng.fork(6)),
    mouth: mouth.randomize(rng.fork(7)),
  }
}

/**
 * @param overrides  parches por parte, p.ej. { eyes: { lidCoverage: 1 } } para el parpadeo.
 *                   rig.js anima exclusivamente por aquí: no hay estado oculto.
 */
export function draw(ctx, frame, character, palette, overrides = {}) {
  const rng = makeRng(character.seed)
  const p = (name) => ({ ...character[name], ...(overrides[name] || {}) })

  const headP = p('head')
  const geo = head.build(frame, headP)
  const { faceBox } = geo

  // 1. orejas — DETRÁS de la cabeza
  ears.draw(ctx, geo, p('ears'), palette, rng.fork(2))

  // 2. cabeza: relleno + sombra plana + contorno
  head.paint(ctx, geo, headP, palette)

  // La geometría de las cejas se calcula ANTES de dibujar nada: el pelo necesita saber
  // dónde parar, y las cejas van una capa por encima del pelo.
  const browsP = p('brows')
  const browGeo = brows.build(faceBox, browsP)
  const browBottom = (browGeo.bottom - faceBox.y) / faceBox.h

  // 3. pelo y barba, recortados a la silueta y topados por la ceja
  hair.draw(ctx, geo, p('hair'), palette, rng.fork(3), { hairBottom: browGeo.top })

  // 4. cejas
  brows.draw(ctx, faceBox, browsP, palette, rng.fork(4))

  // 5. ojos, colgados de la ceja
  const eyesP = p('eyes')
  eyes.draw(
    ctx,
    faceBox,
    { ...eyesP, offsetY: clamp(browBottom + eyesP.browGap + eyesP.eyeHeight / 2, 0.24, 0.64) },
    palette,
    rng.fork(5)
  )

  // 6. nariz, arrancando en el entrecejo
  const noseP = p('nose')
  const noseGeo = nose.draw(
    ctx,
    faceBox,
    { ...noseP, startY: clamp(browBottom, 0.12, 0.5) },
    palette,
    rng.fork(6)
  )

  // 7. boca, siempre por debajo de donde acaba la nariz
  const mouthP = p('mouth')
  const noseEnd = (noseGeo.endY - faceBox.y) / faceBox.h
  const mouthGeo = mouth.draw(
    ctx,
    faceBox,
    { ...mouthP, offsetY: clamp(Math.max(mouthP.offsetY, noseEnd + 0.05), 0.68, 0.95) },
    palette,
    rng.fork(7)
  )

  // 8. re-trazo del contorno: impide que el hatching se coma la silueta
  head.restroke(ctx, geo, palette)

  return { geo, browGeo, noseGeo, mouthGeo }
}

export function paletteFor(character, fallback) {
  return character.paletteName ? getPalette(character.paletteName) : fallback
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
