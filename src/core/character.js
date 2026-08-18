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
import * as glasses from '../parts/glasses.js'
import { makeRng } from './prng.js'
import { bandsOf } from './params.js'
import * as palettes from '../style/palettes.js'
import * as archetypes from './archetypes.js'
import { applyFinish } from '../style/finish.js'

// Las bandas DECLARADAS de cada parte, para distinguir «el panel no lo ha tocado» de
// «el panel lo ha dirigido». El panel persiste TODAS las bandas, movidas o no: sin este
// diff, pisaría el overlay del arquetipo entero con puros valores de fábrica y los
// botones de arquetipo no harían nada.
const DECLARED = {
  head: bandsOf(head.PARAMS),
  ears: bandsOf(ears.PARAMS),
  hair: bandsOf(hair.PARAMS),
  brows: bandsOf(brows.PARAMS),
  eyes: bandsOf(eyes.PARAMS),
  nose: bandsOf(nose.PARAMS),
  mouth: bandsOf(mouth.PARAMS),
  chin: bandsOf(chin.PARAMS),
  glasses: bandsOf(glasses.PARAMS),
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Un personaje completo = un objeto plano. Serializable, reproducible, mutable.
 *
 * Cada parte recibe un `fork` propio del PRNG en vez de consumir la secuencia compartida:
 * así añadir un parámetro a la boca no cambia la cara de todos los personajes ya guardados.
 */
export function makeCharacter(seed, bands = {}, paletteName = null) {
  const rng = makeRng(seed)
  // El arquetipo pone bandas por parte DEBAJO de las del panel: correlaciona rasgos
  // (melena + ceja fina + sin barba llegan juntos) sin quitarle el mando a los sliders.
  // «Debajo» significa: una banda del panel solo pisa al arquetipo si difiere de la
  // declarada — donde está de fábrica, manda el arquetipo.
  const arch = archetypes.randomize(rng.fork(12), bands.arquetipo)
  const overlay = archetypes.BANDS[arch.arquetipo] || {}
  const bandFor = (k) => {
    const touched = {}
    for (const [name, b] of Object.entries(bands[k] || {})) {
      if (!same(b, DECLARED[k]?.[name])) touched[name] = b
    }
    return { ...(overlay[k] || {}), ...touched }
  }
  return {
    seed,
    paletteName,
    arquetipo: arch.arquetipo,
    head: head.randomize(rng.fork(1), bandFor('head')),
    ears: ears.randomize(rng.fork(2), bandFor('ears')),
    hair: hair.randomize(rng.fork(3), bandFor('hair')),
    brows: brows.randomize(rng.fork(4), bandFor('brows')),
    eyes: eyes.randomize(rng.fork(5), bandFor('eyes')),
    nose: nose.randomize(rng.fork(6), bandFor('nose')),
    mouth: mouth.randomize(rng.fork(7), bandFor('mouth')),
    chin: chin.randomize(rng.fork(9), bandFor('chin')),
    glasses: glasses.randomize(rng.fork(10), bandFor('glasses')),
    palette: palettes.randomize(rng.fork(11), bands.palette),
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
  // El layout cuelga de las cejas SIN los canales de ánimo del rig: si el humor moviera
  // browGeo, levantar una ceja arrastraría ojos, nariz y tope del pelo. El ánimo solo
  // entra en el DIBUJO de la ceja (browsP, más abajo).
  const browsP = p('brows')
  const browGeo = brows.build(faceBox, character.brows)
  const browBottom = (browGeo.bottom - faceBox.y) / faceBox.h

  // Reparto del ANCHO. El par de ojos llega a ocupar el 96% de la cara, así que no queda
  // sitio físico para el pelo lateral y acaban montándose. Ceden primero los laterales,
  // que son decorativos; el ojo solo se estrecha si el lateral ya está en su mínimo.
  const eyesP0 = p('eyes')
  const hairP = p('hair')
  // Y si al lateral no le queda sitio decente, no se dibuja: mejor sin patilla que con
  // un hilo de tinta bajando por el borde de la cara.
  const room = 0.5 - eyesP0.spacing / 2 - SIDE_MARGIN
  const libre = room - eyesP0.eyeWidth
  const sideWidth = libre < MIN_SIDE ? 0 : Math.min(hairP.sideWidth, libre)
  const eyesP = { ...eyesP0, eyeWidth: Math.min(eyesP0.eyeWidth, room - sideWidth) }

  // ojos: colgados de la ceja. Lo que se cuelga NO es la cuerda del ojo, es el punto
  // más alto del pliegue, que queda por encima. Lo calcula el propio módulo.
  const eyesY = clamp(browBottom + eyesP.browGap + eyes.topExtent(faceBox, eyesP), 0.24, 0.64)

  // orejas: el borde de ARRIBA a la altura de los ojos, con margen para desviarse.
  // Correlacionar el borde y no el centro hace que la regla aguante con orejas
  // grandes y pequeñas por igual.
  const earsP = p('ears')
  const earsY = clamp(eyesY + ears.halfHeight(faceBox, earsP) + earsP.eyeAlign, 0.2, 0.72)

  // La nariz se resuelve aquí, antes de dibujar nada, porque la BARBA necesita saber
  // dónde cae para no crecerle encima.
  //
  // El descentrado mueve el arranque y la inclinación desvía la PUNTA, así que se suman:
  // no basta con topar el arranque, hay que topar dónde acaba. Se despeja la inclinación
  // que deja la punta dentro del hueco entre los ojos, y se permite la que corrige hacia
  // el centro — de ahí que el rango sea asimétrico.
  const noseP = p('nose')
  const noseStart = clamp(browBottom, 0.12, 0.5)
  const noseLen = Math.min(noseP.length, NOSE_MAX_END - noseStart)
  const maxDrift = Math.max(0, eyesP.spacing / 2 - 0.015)
  const offX = clamp(noseP.offsetX, -maxDrift, maxDrift)
  const lenPx = faceBox.h * noseLen
  const offPx = offX * faceBox.w
  const driftPx = maxDrift * faceBox.w
  const deg = (r) => (Math.atan(r) * 180) / Math.PI
  const noseTilt = clamp(noseP.tilt, deg((-driftPx - offPx) / lenPx), deg((driftPx - offPx) / lenPx))

  const noseTop = faceBox.y + faceBox.h * noseStart
  const noseKeepOut = {
    x0: faceBox.cx + offPx,
    y0: noseTop,
    x1: faceBox.cx + offPx + Math.tan((noseTilt * Math.PI) / 180) * lenPx,
    y1: noseTop + lenPx,
    r: Math.max(faceBox.w * 0.055, faceBox.w * noseP.hookWidth * 0.95),
  }

  // 0. melena: la masa trasera cae por detrás de TODO — cabeza, orejas y patillas
  hair.drawBack(ctx, geo, hairP, palette, rng.fork(13))

  // 1. orejas — DETRÁS de la cabeza (pero delante de la melena, como en las refs)
  ears.draw(ctx, geo, { ...earsP, offsetY: earsY }, palette, rng.fork(2))

  // 2. cabeza: relleno + sombra plana + contorno
  head.paint(ctx, geo, headP, palette)

  // 3. pelo texturado y barba, recortados a la silueta y topados por la ceja
  hair.draw(ctx, geo, hairP, palette, rng.fork(3), { hairBottom: browGeo.top, noseKeepOut })

  // 4. re-trazo del contorno: impide que el hatching se coma la silueta.
  //    Va aquí y no al final porque todo el hatching ya está puesto, y porque la masa
  //    de pelo sobresale del cráneo — si el contorno fuera después, le cruzaría una
  //    línea por encima que en las referencias no existe.
  head.restroke(ctx, geo, palette, headP.lineWeight)

  // 5. SOMBRA de las cejas. Está sobre la piel, así que el pelo tiene que taparla —
  //    si no, desborda por los lados de la ceja y se ve encima del pelo.
  brows.drawShadow(ctx, faceBox, browsP, palette, geo.path)

  // 6. masas de pelo y barba: tapan la sombra de la ceja, pero no la ceja. La barba de
  //    masa necesita la nariz (anatomía) y el borde bajo de la oreja (vuela por fuera
  //    de la silueta y sin tope pintaría sobre el lóbulo).
  const earBottom = faceBox.y + faceBox.h * (earsY + ears.halfHeight(faceBox, earsP))
  hair.drawMass(ctx, geo, { ...hairP, sideWidth }, palette, rng.fork(8), {
    hairBottom: browGeo.top,
    noseKeepOut,
    earBottom,
  })

  // 7. ojos
  const eyeGeo = eyes.draw(ctx, faceBox, { ...eyesP, offsetY: eyesY }, palette, rng.fork(5))

  // 8. nariz, arrancando en el entrecejo.
  //
  // Dos topes que no puede poner el módulo, porque dependen de otras partes:
  //  · el largo se recorta para que la punta no rebase la barbilla — arrancando abajo
  //    y con el largo al máximo, la nariz se salía del faceBox
  //  · el desplazamiento lateral se limita al hueco entre los ojos, o la vertical
  //    aterriza sobre el borde de uno
  const noseGeo = nose.draw(
    ctx,
    faceBox,
    { ...noseP, startY: noseStart, length: noseLen, offsetX: offX, tilt: noseTilt },
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

  // 11. gafas: DESPUÉS de la nariz, porque se apoyan en ella. Reciben la geometría de
  //     los ojos en vez de recalcularla — si se colocaran solas, cualquier cambio en el
  //     ojo las dejaría descuadradas.
  glasses.draw(ctx, eyeGeo, geo.headBox, p('glasses'), palette)

  // 12. las CEJAS macizas, lo último del personaje: nada SUYO se dibuja encima
  brows.drawSlabs(ctx, faceBox, browsP, palette)

  // 13. acabado: grano y viñeta sobre el lienzo entero, personaje y fondo por igual —
  //     es textura de papel, no de piel
  applyFinish(ctx, palette)

  return { geo, browGeo, noseGeo, mouthGeo }
}

/**
 * El color del personaje. Va con el, no con la rejilla: con la banda del fondo cerrada
 * todas las caras comparten fondo, y abrirla convierte el grid en mosaico sin tocar nada.
 */
export function paletteFor(character, fallback) {
  return character.palette ? palettes.buildPalette(character.palette) : fallback
}

// Dónde puede acabar la nariz como muy abajo, en fracción de faceBox. Deja sitio para
// su propia sombra, la boca y el hoyuelo sin que ninguno tenga que apretarse.
const NOSE_MAX_END = 0.78

// Reparto del ancho entre ojos y pelo lateral: margen de aire, y lo mínimo que puede
// quedarse un lateral antes de que empiece a ceder el ojo.
const SIDE_MARGIN = 0.02
const MIN_SIDE = 0.07

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
