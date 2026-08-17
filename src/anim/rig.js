// Estados de vida. UN solo requestAnimationFrame recorre todos los personajes — nunca
// uno por personaje.
//
// La clave de rendimiento no es cachear capas, es NO REPINTAR lo que no ha cambiado:
//
//  · el parpadeo dura ~120ms cada 2-7s, así que en un frame cualquiera hay una o dos
//    caras animándose de treinta. Las demás se saltan enteras.
//  · la mirada solo se mueve durante la transición, ~380ms cada 3-10s.
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
      const sig = `${a.blink.toFixed(3)}|${a.gaze.toFixed(3)}`
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
  return { eyes: { blink: a.blink, pupilX: a.gaze } }
}
