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
import * as cheeks from '../parts/cheeks.js'
import * as glasses from '../parts/glasses.js'
import * as voice from '../parts/voice.js'
import { makeRng } from './prng.js'
import { touchedBands } from './params.js'
import * as palettes from '../style/palettes.js'
import * as archetypes from './archetypes.js'
import { applyFinish } from '../style/finish.js'

// Carril de PRNG de cada parte. `rng.fork(salt)` es función pura de (seed, salt), así que
// estos números son parte del formato de las seeds guardadas: cambiar uno cambia esa parte
// en TODOS los personajes ya guardados. Son intocables — solo se añaden (el siguiente libre
// es el 16).
//
// Estaban escritos a mano y por duplicado entre `makeCharacter` y `draw`. Repetir uno por
// descuido correlaciona el sorteo de una parte con el jitter de dibujo de otra, y nada avisa:
// sale una cara plausible, solo que dos rasgos que deberían ser independientes se mueven
// juntos.
//
// Que una parte use el MISMO salt al sortear y al dibujar sí es deliberado: el jitter de
// dibujo va en el carril de esa parte. `hairBack` y `hairMass` tienen el suyo porque son dos
// masas distintas del mismo módulo, y solo existen en `draw`.
export const SALT = {
  arquetipo: 12,
  head: 1,
  ears: 2,
  hair: 3,
  brows: 4,
  eyes: 5,
  nose: 6,
  mouth: 7,
  chin: 9,
  glasses: 10,
  palette: 11,
  hairBack: 13,
  hairMass: 8,
  cheeks: 14,
  voice: 15,
}

// El PARAMS de cada parte, para poder preguntar qué bandas vienen DIRIGIDAS y cuáles
// están de fábrica (`touchedBands`). Sin esa distinción, un panel que persiste todas las
// bandas pisaría el overlay del arquetipo entero con puros valores de fábrica y los
// botones de arquetipo no harían nada.
//
// La comparación NO se hace aquí: vive en params.js, y la usan también el panel (qué
// persiste, qué exporta) y las configuraciones. Tienen que decir lo mismo o el generador
// miente — el panel guardaría como dirección de arte algo que aquí cuenta como fábrica.
const PARAMS_OF = {
  head: head.PARAMS,
  ears: ears.PARAMS,
  hair: hair.PARAMS,
  brows: brows.PARAMS,
  eyes: eyes.PARAMS,
  nose: nose.PARAMS,
  mouth: mouth.PARAMS,
  chin: chin.PARAMS,
  cheeks: cheeks.PARAMS,
  glasses: glasses.PARAMS,
  voice: voice.PARAMS,
}

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
  const arch = archetypes.randomize(rng.fork(SALT.arquetipo), bands.arquetipo)
  const overlay = archetypes.BANDS[arch.arquetipo] || {}
  const bandFor = (k) => ({ ...(overlay[k] || {}), ...touchedBands(PARAMS_OF[k], bands[k]) })
  return {
    seed,
    paletteName,
    arquetipo: arch.arquetipo,
    head: head.randomize(rng.fork(SALT.head), bandFor('head')),
    ears: ears.randomize(rng.fork(SALT.ears), bandFor('ears')),
    hair: hair.randomize(rng.fork(SALT.hair), bandFor('hair')),
    brows: brows.randomize(rng.fork(SALT.brows), bandFor('brows')),
    eyes: eyes.randomize(rng.fork(SALT.eyes), bandFor('eyes')),
    nose: nose.randomize(rng.fork(SALT.nose), bandFor('nose')),
    mouth: mouth.randomize(rng.fork(SALT.mouth), bandFor('mouth')),
    chin: chin.randomize(rng.fork(SALT.chin), bandFor('chin')),
    cheeks: cheeks.randomize(rng.fork(SALT.cheeks), bandFor('cheeks')),
    glasses: glasses.randomize(rng.fork(SALT.glasses), bandFor('glasses')),
    palette: palettes.randomize(rng.fork(SALT.palette), bands.palette),
    // La voz no se dibuja: la toca el host (`src/anim/speech.js`). Va aquí porque es del
    // personaje, no del momento — sale de su seed como su cara, y por su propio carril
    // del rng, así que añadirla no ha movido ni un valor de las demás partes.
    voice: voice.randomize(rng.fork(SALT.voice), bandFor('voice')),
  }
}

/**
 * El LAYOUT: dónde cae cada rasgo. Sale del personaje y solo del personaje.
 *
 * Se calcula entero antes de pintar nada porque las capas no van en el orden de sus
 * dependencias: las orejas son la primera capa y cuelgan de los ojos, que son de las
 * últimas. Y sale del personaje SIN overrides a propósito — es la misma regla que ya
 * seguía la ceja («si el humor moviera browGeo, levantar una ceja arrastraría ojos,
 * nariz y tope del pelo»), ahora extendida a todo: los overrides del rig son canales de
 * DIBUJO, no de composición. Si movieran el layout, la capa estática cacheada y la viva
 * dejarían de cuadrar y la cara se descosería por la costura.
 */
function layout(frame, character) {
  const headP = character.head
  const hairP = character.hair
  // El moño crece POR ENCIMA de la coronilla y la cabeza llena el marco casi hasta
  // arriba: sin ceder un poco de fill, moño y palillos se pintarían fuera del lienzo.
  // La geisha de referencia funciona exactamente así — cabeza más pequeña, aire encima.
  const conMono = hairP.bun && hairP.mode === 'solid'
  const geo = head.build(frame, conMono ? { ...headP, fill: headP.fill * 0.86 } : headP)
  const { faceBox } = geo

  const browGeo = brows.build(faceBox, character.brows)
  const browBottom = (browGeo.bottom - faceBox.y) / faceBox.h

  // Reparto del ANCHO. El par de ojos llega a ocupar el 96% de la cara, así que no queda
  // sitio físico para el pelo lateral y acaban montándose. Ceden primero los laterales,
  // que son decorativos; el ojo solo se estrecha si el lateral ya está en su mínimo.
  const eyesP0 = character.eyes
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
  const earsP = character.ears
  const earsY = clamp(eyesY + ears.halfHeight(faceBox, earsP) + earsP.eyeAlign, 0.2, 0.72)
  // la barba de masa vuela por fuera de la silueta y sin tope pintaría sobre el lóbulo
  const earBottom = faceBox.y + faceBox.h * (earsY + ears.halfHeight(faceBox, earsP))

  // La nariz se resuelve aquí, antes de dibujar nada, porque la BARBA necesita saber
  // dónde cae para no crecerle encima.
  //
  // El descentrado mueve el arranque y la inclinación desvía la PUNTA, así que se suman:
  // no basta con topar el arranque, hay que topar dónde acaba. Se despeja la inclinación
  // que deja la punta dentro del hueco entre los ojos, y se permite la que corrige hacia
  // el centro — de ahí que el rango sea asimétrico.
  const noseP = character.nose
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

  return {
    geo,
    faceBox,
    browGeo,
    sideWidth,
    eyesP,
    eyesY,
    earsY,
    earBottom,
    nose: { startY: noseStart, length: noseLen, offsetX: offX, tilt: noseTilt },
    noseKeepOut,
  }
}

/**
 * Capas 0–4: melena, orejas, cabeza, hatching y re-trazo del contorno.
 *
 * Ninguna depende de un canal del rig, así que para un personaje dado esto se pinta UNA
 * vez y se cachea: el host lo guarda en un offscreen y lo blitea antes de cada capa
 * viva. Es lo caro del dibujo — `hatch` crea un canvas, le aplica un blur por `filter` y
 * lee `getImageData` en cada llamada, hasta dos por cara— y era lo que se re-ejecutaba
 * entero en cada parpadeo (auditoría §4).
 *
 * NO recibe overrides: lo estático es del personaje, no del momento.
 *
 * @returns el layout, que es lo que `drawLive` necesita para colocarse encima.
 */
export function drawStatic(ctx, frame, character, palette) {
  const rng = makeRng(character.seed)
  const L = layout(frame, character)
  const headP = character.head
  const hairP = character.hair

  // 0. melena: la masa trasera cae por detrás de TODO — cabeza, orejas y patillas
  hair.drawBack(ctx, L.geo, hairP, palette, rng.fork(SALT.hairBack))

  // 1. orejas — DETRÁS de la cabeza (pero delante de la melena, como en las refs)
  ears.draw(ctx, L.geo, { ...character.ears, offsetY: L.earsY }, palette, rng.fork(SALT.ears))

  // 2. cabeza: relleno + sombra plana + contorno
  head.paint(ctx, L.geo, headP, palette)

  // 3. pelo texturado y barba, recortados a la silueta y topados por la ceja
  hair.draw(ctx, L.geo, hairP, palette, rng.fork(SALT.hair), {
    hairBottom: L.browGeo.top,
    noseKeepOut: L.noseKeepOut,
  })

  // 4. re-trazo del contorno: impide que el hatching se coma la silueta.
  //    Va aquí y no al final porque todo el hatching ya está puesto, y porque la masa
  //    de pelo sobresale del cráneo — si el contorno fuera después, le cruzaría una
  //    línea por encima que en las referencias no existe.
  head.restroke(ctx, L.geo, palette, headP.lineWeight)

  return L
}

/**
 * Capas 5–13: todo lo que un canal del rig puede mover, y lo que va por encima de ello.
 *
 * El acabado (grano y viñeta) se queda aquí aunque no dependa del rig: va sobre el
 * lienzo entero y encima de todo, así que no puede pintarse antes que las cejas.
 *
 * @param overrides  parches por parte, p.ej. { eyes: { blink: 1 } } para el parpadeo.
 *                   rig.js anima exclusivamente por aquí: no hay estado oculto.
 * @param L          lo que devolvió `drawStatic` sobre este mismo personaje. Los campos
 *                   de layout (anchos, alturas) se imponen DESPUÉS de los overrides: un
 *                   canal del rig no puede descolocar lo que ya está pintado debajo.
 */
export function drawLive(ctx, frame, character, palette, overrides = {}, L) {
  const rng = makeRng(character.seed)
  const p = (name) => ({ ...character[name], ...(overrides[name] || {}) })
  const { geo, faceBox } = L

  // 5. SOMBRA de las cejas. Está sobre la piel, así que el pelo tiene que taparla —
  //    si no, desborda por los lados de la ceja y se ve encima del pelo.
  const browsP = p('brows')
  brows.drawShadow(ctx, faceBox, browsP, palette, geo.path)

  // 6. masas de pelo y barba: tapan la sombra de la ceja, pero no la ceja. La barba de
  //    masa necesita la nariz (anatomía) y el borde bajo de la oreja.
  hair.drawMass(ctx, geo, { ...p('hair'), sideWidth: L.sideWidth }, palette, rng.fork(SALT.hairMass), {
    hairBottom: L.browGeo.top,
    noseKeepOut: L.noseKeepOut,
    earBottom: L.earBottom,
  })

  // 7. ojos
  const eyesP = { ...L.eyesP, ...(overrides.eyes || {}), eyeWidth: L.eyesP.eyeWidth, offsetY: L.eyesY }
  const eyeGeo = eyes.draw(ctx, faceBox, eyesP, palette, rng.fork(SALT.eyes))

  // 8. nariz, arrancando en el entrecejo. Los dos topes que no puede poner el módulo
  //    —largo contra la barbilla, desplazamiento contra el hueco entre los ojos— ya
  //    vienen resueltos en el layout.
  const noseGeo = nose.draw(ctx, faceBox, { ...p('nose'), ...L.nose }, palette, rng.fork(SALT.nose))

  // 8b. mejillas: rubor o pecas, donde acaba la nariz — ahí viven en las referencias.
  //     Antes de la boca (los labios pisan al rubor si se rozan) y de las gafas.
  cheeks.draw(ctx, faceBox, p('cheeks'), palette, rng.fork(SALT.cheeks), L.noseKeepOut.y1)

  // 9. boca, siempre por debajo de donde acaba la nariz (sombra incluida)
  const mouthP = p('mouth')
  const noseEnd = (noseGeo.endY - faceBox.y) / faceBox.h
  const mouthY = clamp(Math.max(mouthP.offsetY, noseEnd + 0.04), 0.68, 0.95)
  const mouthGeo = mouth.draw(ctx, faceBox, { ...mouthP, offsetY: mouthY }, palette, rng.fork(SALT.mouth))

  // 10. hoyuelo de la barbilla: en la punta del mentón, pero SIEMPRE por debajo de la
  //     boca. Su banda arrancaba en 0.90 y la boca llega a 0.95, así que podía salir
  //     por encima de ella.
  const chinP = p('chin')
  chin.draw(
    ctx,
    faceBox,
    { ...chinP, offsetY: clamp(Math.max(chinP.offsetY, mouthY + 0.04), 0.84, 0.98) },
    palette,
    rng.fork(SALT.chin)
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

  return { geo, browGeo: L.browGeo, noseGeo, mouthGeo }
}

/**
 * La cara entera, de una pasada. Es lo que usan las previews y los tests: ahí no hay
 * caché que amortizar y partir el dibujo solo estorbaría.
 */
export function draw(ctx, frame, character, palette, overrides = {}) {
  const L = drawStatic(ctx, frame, character, palette)
  return drawLive(ctx, frame, character, palette, overrides, L)
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
