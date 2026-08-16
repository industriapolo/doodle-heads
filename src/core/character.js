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

  // --- alturas, TODAS antes de dibujar ------------------------------------
  // La coherencia entre partes se resuelve aquí porque ningún módulo ve a los demás.
  // Y hay que resolverla antes de pintar nada: las orejas van en la primera capa pero
  // dependen de los ojos, que son de las últimas.
  const browsP = p('brows')
  const browGeo = brows.build(faceBox, browsP)
  const browBottom = (browGeo.bottom - faceBox.y) / faceBox.h

  // ojos: colgados de la ceja. Lo que se cuelga NO es la cuerda del ojo, es el punto
  // más alto del pliegue, que queda por encima. Lo calcula el propio módulo.
  const eyesP = p('eyes')
  const eyesY = clamp(browBottom + eyesP.browGap + eyes.topExtent(faceBox, eyesP), 0.24, 0.64)

  // orejas: el borde de ARRIBA a la altura de los ojos, con margen para desviarse.
  // Correlacionar el borde y no el centro hace que la regla aguante con orejas
  // grandes y pequeñas por igual.
  const earsP = p('ears')
  const earsY = clamp(eyesY + ears.halfHeight(faceBox, earsP) + earsP.eyeAlign, 0.2, 0.72)

  // 1. orejas — DETRÁS de la cabeza
  ears.draw(ctx, geo, { ...earsP, offsetY: earsY }, palette, rng.fork(2))

  // 2. cabeza: relleno + sombra plana + contorno
  head.paint(ctx, geo, headP, palette)

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

  // 7. ojos
  eyes.draw(ctx, faceBox, { ...eyesP, offsetY: eyesY }, palette, rng.fork(5))

  // 8. nariz, arrancando en el entrecejo.
  //
  // Dos topes que no puede poner el módulo, porque dependen de otras partes:
  //  · el largo se recorta para que la punta no rebase la barbilla — arrancando abajo
  //    y con el largo al máximo, la nariz se salía del faceBox
  //  · el desplazamiento lateral se limita al hueco entre los ojos, o la vertical
  //    aterriza sobre el borde de uno
  const noseP = p('nose')
  const noseStart = clamp(browBottom, 0.12, 0.5)
  const maxOffX = Math.max(0, eyesP.spacing / 2 - 0.015)
  const noseGeo = nose.draw(
    ctx,
    faceBox,
    {
      ...noseP,
      startY: noseStart,
      length: Math.min(noseP.length, NOSE_MAX_END - noseStart),
      offsetX: clamp(noseP.offsetX, -maxOffX, maxOffX),
    },
    palette,
    rng.fork(6)
  )

  // 9. boca, siempre por debajo de donde acaba la nariz (sombra incluida)
  const mouthP = p('mouth')
  const noseEnd = (noseGeo.endY - faceBox.y) / faceBox.h
  const mouthY = clamp(Math.max(mouthP.offsetY, noseEnd + 0.04), 0.68, 0.95)
  const mouthGeo = mouth.draw(ctx, faceBox, { ...mouthP, offsetY: mouthY }, palette, rng.fork(7))

  // 10. hoyuelo de la barbilla: en la punta del mentón, pero SIEMPRE por debajo de la
  //     boca. Su banda arrancaba en 0.90 y la boca llega a 0.95, así que podía salir
  //     por encima de ella.
  const chinP = p('chin')
  chin.draw(
    ctx,
    faceBox,
    { ...chinP, offsetY: clamp(Math.max(chinP.offsetY, mouthY + 0.04), 0.84, 0.98) },
    palette,
    rng.fork(9)
  )

  // 11. las CEJAS macizas, lo último de todo: nada se dibuja por encima de una ceja
  brows.drawSlabs(ctx, faceBox, browsP, palette)

  return { geo, browGeo, noseGeo, mouthGeo }
}

export function paletteFor(character, fallback) {
  return character.paletteName ? getPalette(character.paletteName) : fallback
}

// Dónde puede acabar la nariz como muy abajo, en fracción de faceBox. Deja sitio para
// su propia sombra, la boca y el hoyuelo sin que ninguno tenga que apretarse.
const NOSE_MAX_END = 0.78

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
