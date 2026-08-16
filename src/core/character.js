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
import * as chin from '../parts/chin.js'
import { makeRng } from './prng.js'
import { getPalette } from '../style/palettes.js'

/**
 * Un personaje completo = un objeto plano. Serializable, reproducible, mutable.
 *
 * Cada parte recibe un `fork` propio del PRNG en vez de consumir la secuencia compartida:
 * así añadir un parámetro a la boca no cambia la cara de todos los personajes ya guardados.
 */
export function makeCharacter(seed, bands = {}, paletteName = null) {
  const rng = makeRng(seed)
  return {
    seed,
    paletteName,
    head: head.randomize(rng.fork(1), bands.head),
    ears: ears.randomize(rng.fork(2), bands.ears),
    hair: hair.randomize(rng.fork(3), bands.hair),
    brows: brows.randomize(rng.fork(4), bands.brows),
    eyes: eyes.randomize(rng.fork(5), bands.eyes),
    nose: nose.randomize(rng.fork(6), bands.nose),
    mouth: mouth.randomize(rng.fork(7), bands.mouth),
    chin: chin.randomize(rng.fork(9), bands.chin),
  }
}

/**
 * @param overrides  parches por parte, p.ej. { eyes: { blink: 1 } } para el parpadeo.
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

  // 3. pelo texturado y barba, recortados a la silueta y topados por la ceja
  const hairP = p('hair')
  hair.draw(ctx, geo, hairP, palette, rng.fork(3), { hairBottom: browGeo.top })

  // 4. re-trazo del contorno: impide que el hatching se coma la silueta.
  //    Va aquí y no al final porque todo el hatching ya está puesto, y porque la masa
  //    de pelo sobresale del cráneo — si el contorno fuera después, le cruzaría una
  //    línea por encima que en las referencias no existe.
  head.restroke(ctx, geo, palette, headP.lineWeight)

  // 5. SOMBRA de las cejas. Está sobre la piel, así que el pelo tiene que taparla —
  //    si no, desborda por los lados de la ceja y se ve encima del pelo.
  brows.drawShadow(ctx, faceBox, browsP, palette, geo.path)

  // 6. masa de pelo: tapa la sombra de la ceja, pero no la ceja
  hair.drawMass(ctx, geo, hairP, palette, rng.fork(8), { hairBottom: browGeo.top })

  // 7. ojos, colgados de la ceja.
  //
  // Lo que se cuelga de la ceja NO es la cuerda del ojo: es el punto más alto del
  // pliegue, que queda por encima. Lo calcula el propio módulo, que es quien sabe cómo
  // está construido.
  const eyesP = p('eyes')
  eyes.draw(
    ctx,
    faceBox,
    {
      ...eyesP,
      offsetY: clamp(browBottom + eyesP.browGap + eyes.topExtent(faceBox, eyesP), 0.24, 0.64),
    },
    palette,
    rng.fork(5)
  )

  // 8. nariz, arrancando en el entrecejo
  const noseP = p('nose')
  const noseGeo = nose.draw(
    ctx,
    faceBox,
    { ...noseP, startY: clamp(browBottom, 0.12, 0.5) },
    palette,
    rng.fork(6)
  )

  // 9. boca, siempre por debajo de donde acaba la nariz
  const mouthP = p('mouth')
  const noseEnd = (noseGeo.endY - faceBox.y) / faceBox.h
  const mouthGeo = mouth.draw(
    ctx,
    faceBox,
    { ...mouthP, offsetY: clamp(Math.max(mouthP.offsetY, noseEnd + 0.05), 0.68, 0.95) },
    palette,
    rng.fork(7)
  )

  // 10. hoyuelo de la barbilla, en la punta del mentón
  chin.draw(ctx, faceBox, p('chin'), palette, rng.fork(9))

  // 11. las CEJAS macizas, lo último de todo: nada se dibuja por encima de una ceja
  brows.drawSlabs(ctx, faceBox, browsP, palette)

  return { geo, browGeo, noseGeo, mouthGeo }
}

export function paletteFor(character, fallback) {
  return character.paletteName ? getPalette(character.paletteName) : fallback
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
