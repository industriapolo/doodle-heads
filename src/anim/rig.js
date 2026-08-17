// Estados de vida. UN solo requestAnimationFrame recorre todos los personajes — nunca
// uno por personaje.
//
// La clave de rendimiento no es cachear capas, es NO REPINTAR lo que no ha cambiado:
//
//  · el parpadeo dura ~120ms cada 2-7s, así que en un frame cualquiera hay una o dos
//    caras animándose de treinta. Las demás se saltan enteras.
//  · la mirada solo se mueve durante la transición, ~380ms cada 3-10s.
//  · el ánimo (cejas) solo se mueve durante su transición, ~700ms cada 4-12s — y la
//    mayoría de los cambios son VOLVER al neutro: el personaje vive alrededor de su
//    expresión base y hace excursiones, no va saltando de mueca en mueca.
//
// La flotación se quitó: movía las cards y hacía que se solaparan entre sí.
//
// Cachear capas estáticas en offscreen seguirá haciendo falta cuando entre el humo, que
// sí cambia cada frame. Pero mientras el estilo se está afinando sale caro: obligaría a
// invalidar y regenerar la caché en cada retoque de un parámetro.

import { makeRng } from '../core/prng.js'

const BLINK_GAP = [2000, 7000] // entre parpadeos
const BLINK_DUR = [100, 140] // lo que dura uno
const GAZE_GAP = [3000, 10000]
const GAZE_EASE = 380
const MOOD_GAP = [4000, 12000] // entre cambios de ánimo
const MOOD_EASE = 700 // las cejas se mueven despacio: rápido se lee como tic

// Las excursiones de ánimo, en los dos canales de brows.js: grados de inclinación
// (positivo = ceño) y subida en fracción de faceBox.h (negativo = cejas arriba).
const MOODS = [
  { tilt: [5, 12], lift: [0, 0.01] }, // ceño
  { tilt: [-10, -5], lift: [0, 0.008] }, // caído
  { tilt: [-4, 0], lift: [-0.03, -0.018] }, // sorpresa leve
  { tilt: [-2, 2], lift: [-0.012, -0.006] }, // atención
]

/**
 * Estado de animación de un personaje. El desfase inicial sale de su seed: sin eso los
 * treinta parpadearían a la vez y el efecto se cae.
 */
export function makeActor(seed, extra = {}) {
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0)
  return {
    ...extra,
    seed,
    rng,
    blink: 0,
    blinkFrom: rng.range(0, BLINK_GAP[1]), // el desfase, para que no vayan a coro
    blinkAt: null,
    blinkDur: 0,
    gaze: rng.range(-0.4, 0.4),
    gazeFrom: 0,
    gazeTo: 0,
    gazeAt: null,
    gazeNext: rng.range(0, GAZE_GAP[1]),
    mood: { tilt: 0, lift: 0 },
    moodFrom: null,
    moodTo: null,
    moodAt: null,
    moodNext: rng.range(0, MOOD_GAP[1]),
    drawn: null,
  }
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * Avanza un actor a un instante dado. Exportada porque es la costura para gobernar el
 * rig desde otro reloj — un host de animación distinto, o una simulación para
 * comprobar los tiempos sin depender de requestAnimationFrame.
 */
export function advance(a, t) {
  // --- parpadeo ---------------------------------------------------------
  if (a.blinkAt === null) {
    if (t >= a.blinkFrom) {
      a.blinkAt = t
      a.blinkDur = a.rng.range(...BLINK_DUR)
    }
  } else {
    const phase = (t - a.blinkAt) / a.blinkDur
    if (phase >= 1) {
      a.blink = 0
      a.blinkAt = null
      a.blinkFrom = t + a.rng.range(...BLINK_GAP)
    } else {
      // cierra rápido y abre algo más lento, que es como parpadea un ojo de verdad
      a.blink = phase < 0.38 ? phase / 0.38 : 1 - (phase - 0.38) / 0.62
    }
  }

  // --- mirada -----------------------------------------------------------
  if (a.gazeAt === null) {
    if (t >= a.gazeNext) {
      a.gazeAt = t
      a.gazeFrom = a.gaze
      a.gazeTo = a.rng.range(-0.6, 0.6)
    }
  } else {
    const phase = (t - a.gazeAt) / GAZE_EASE
    if (phase >= 1) {
      a.gaze = a.gazeTo
      a.gazeAt = null
      a.gazeNext = t + a.rng.range(...GAZE_GAP)
    } else {
      a.gaze = a.gazeFrom + (a.gazeTo - a.gazeFrom) * easeInOut(phase)
    }
  }

  // --- ánimo (cejas) ----------------------------------------------------
  if (a.moodAt === null) {
    if (t >= a.moodNext) {
      const enNeutro = a.mood.tilt === 0 && a.mood.lift === 0
      // desde una excursión casi siempre se vuelve al neutro; desde el neutro, a veces
      // ni eso — el personaje se queda quieto y solo se reprograma el reloj
      let target = null
      if (!enNeutro) {
        target = a.rng.next() < 0.75 ? { tilt: 0, lift: 0 } : moodTarget(a.rng)
      } else if (a.rng.next() < 0.5) {
        target = moodTarget(a.rng)
      }
      if (target) {
        a.moodAt = t
        a.moodFrom = a.mood
        a.moodTo = target
      } else {
        a.moodNext = t + a.rng.range(...MOOD_GAP)
      }
    }
  } else {
    const phase = (t - a.moodAt) / MOOD_EASE
    if (phase >= 1) {
      a.mood = a.moodTo
      a.moodAt = null
      a.moodNext = t + a.rng.range(...MOOD_GAP)
    } else {
      const e = easeInOut(phase)
      a.mood = {
        tilt: a.moodFrom.tilt + (a.moodTo.tilt - a.moodFrom.tilt) * e,
        lift: a.moodFrom.lift + (a.moodTo.lift - a.moodFrom.lift) * e,
      }
    }
  }
}

function moodTarget(rng) {
  const m = MOODS[Math.floor(rng.next() * MOODS.length)]
  return { tilt: rng.range(...m.tilt), lift: rng.range(...m.lift) }
}

/**
 * Arranca el bucle compartido.
 *
 * @param actors  lista de estados creados con makeActor. Cada uno debe traer `canvas`.
 * @param redraw  (actor) => void — solo se llama cuando el actor ha cambiado de verdad
 * @returns una función para parar
 */
export function startRig(actors, redraw) {
  let raf = 0
  let alive = true

  const frame = (t) => {
    if (!alive) return
    for (const a of actors) {
      advance(a, t)

      // Solo repinta si cambió algo que se dibuje. Redondear a 3 decimales evita
      // repintar por diferencias que no se ven.
      const sig = `${a.blink.toFixed(3)}|${a.gaze.toFixed(3)}|${a.mood.tilt.toFixed(2)}|${a.mood.lift.toFixed(4)}`
      if (sig !== a.drawn) {
        a.drawn = sig
        redraw(a)
      }
    }
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
  return () => {
    alive = false
    cancelAnimationFrame(raf)
  }
}

/** Los overrides que este actor le pasa a character.draw. */
export function overridesFor(a) {
  return {
    eyes: { blink: a.blink, pupilX: a.gaze },
    brows: { moodTilt: a.mood.tilt, moodLift: a.mood.lift },
  }
}
