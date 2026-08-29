// Estados de vida. UN solo requestAnimationFrame recorre todos los personajes — nunca
// uno por personaje.
//
// La clave de rendimiento no es cachear capas, es NO REPINTAR lo que no ha cambiado:
//
//  · el parpadeo dura ~120ms cada 2-7s, así que en un frame cualquiera hay una o dos
//    caras animándose de treinta. Las demás se saltan enteras.
//  · la mirada solo se mueve durante la transición, ~380ms cada 3-10s.
//  · el ánimo (cejas y boca, un solo estado) solo se mueve durante su transición,
//    ~700ms cada 4-12s — y la mayoría de los cambios son VOLVER al neutro: el
//    personaje vive alrededor de su expresión base y hace excursiones, no va
//    saltando de mueca en mueca.
//
// La flotación se quitó: movía las cards y hacía que se solaparan entre sí.
//
// La caché de capas estáticas ya existe, y es del HOST, no de aquí: `character.js` parte
// el dibujo en `drawStatic` (capas 0–4, que ningún canal del rig puede mover) y
// `drawLive`, y el index guarda la primera en un offscreen por personaje. Esta regla
// sigue mandando igual: la caché abarata lo que sí cambia, no da permiso para repintar
// lo que no.

import { makeRng } from '../core/prng.js'

const BLINK_GAP = [2000, 7000] // entre parpadeos
const BLINK_DUR = [100, 140] // lo que dura uno
const GAZE_GAP = [3000, 10000]
const GAZE_EASE = 380
// Seguir al puntero NO es la transición programada: esa es una sacada, sale y llega. Un
// objetivo externo se persigue, así que es un suavizado exponencial hacia donde esté
// ahora mismo. La constante es el tiempo en el que se recorta la distancia a 1/e; con 100
// ms, cruzar de −1 a +1 queda a menos de 0,05 del objetivo en 400 ms, que es el listón.
const GAZE_FOLLOW = 100
const MOOD_GAP = [4000, 12000] // entre cambios de ánimo
const MOOD_EASE = 700 // las cejas se mueven despacio: rápido se lee como tic
// El humo se mueve a 25fps, no a 60: es una voluta, no un proyectil — y como el fumador
// solo re-blitea su cara cacheada + una línea, el coste por tic es ridículo.
const SMOKE_STEP = 40

// Las excursiones de ánimo. Cejas y boca son UN estado, no dos: cada ánimo define sus
// canales a la vez y la coordinación sale sola. Cejas: `tilt` en grados (positivo =
// ceño), `lift` en fracción de faceBox.h (negativo = arriba) y `raise` levanta UNA
// ceja (la arqueada de la duda; `mirror` sortea el lado). Boca: `curve` (positivo =
// sonrisa ⌣, negativo = mueca ⌢) y `open` 0..1 — con cigarrillo la propia boca los
// atenúa/anula (mouth.js), no hace falta tratarlo aquí.
// Un canal omitido en un ánimo queda en [0, 0].
const MOODS = [
  { tilt: [5, 12], lift: [0, 0.01], curve: [-0.55, -0.2] }, // ceño
  { tilt: [12, 17], lift: [0.004, 0.014], curve: [-0.8, -0.5] }, // enfado
  { tilt: [-10, -5], lift: [0, 0.008], curve: [-0.4, -0.1] }, // caído
  { tilt: [-14, -9], lift: [0.006, 0.016], curve: [-0.6, -0.35] }, // tristeza
  { tilt: [-4, 0], lift: [-0.03, -0.018], open: [0.4, 0.75] }, // sorpresa
  { tilt: [-6, -2], lift: [-0.038, -0.028], curve: [0, 0.1], open: [0.75, 1] }, // susto
  { tilt: [-2, 2], lift: [-0.012, -0.006], curve: [0.15, 0.5] }, // atención
  { tilt: [-3, 1], lift: [-0.02, -0.008], curve: [0.5, 0.85], open: [0, 0.15] }, // alegría
  { tilt: [0, 4], curve: [-0.35, -0.1], raise: [0.028, 0.048], mirror: true }, // duda
  { tilt: [-2, 2], lift: [-0.006, 0], curve: [0.3, 0.6], raise: [0.022, 0.04], mirror: true }, // picardía
]
const NEUTRAL = { tilt: 0, lift: 0, curve: 0, open: 0, raise: 0 }

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
    // La vertical solo la mueve un objetivo externo: el vagabundeo es horizontal, como
    // hasta ahora. Sin objetivo vuelve a cero ella sola.
    gazeY: 0,
    // Dónde mira, en [−1, 1] y coordenadas de la cara. Lo pone el HOST — el rig no sabe
    // que existe un ratón, solo que a veces le dicen dónde mirar.
    gazeTarget: null,
    gazeHeld: false,
    lastT: null,
    mood: { ...NEUTRAL },
    moodFrom: null,
    moodTo: null,
    moodAt: null,
    moodNext: rng.range(0, MOOD_GAP[1]),
    // el humo: fase propia (que treinta volutas no ondulen a coro) y reloj de tic.
    // `smokeTip` lo rellena el redraw del host cuando la cara tiene cigarro.
    smokeTip: null,
    smokePhase: rng.range(0, Math.PI * 2),
    smokeAt: 0,
    drawn: null,
  }
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v || 0)

/**
 * Avanza un actor a un instante dado. Exportada porque es la costura para gobernar el
 * rig desde otro reloj — un host de animación distinto, o una simulación para
 * comprobar los tiempos sin depender de requestAnimationFrame.
 */
export function advance(a, t) {
  // El paso desde el frame anterior, que es lo que necesita el suavizado de la mirada.
  // En el primer frame no hay paso: dt = 0 y nada se mueve.
  const dt = a.lastT === null ? 0 : Math.max(0, t - a.lastT)
  a.lastT = t

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
  // Dos regímenes, y el paso de uno a otro no puede dar un salto: la mirada es lo que
  // más delata un truco.
  const k = 1 - Math.exp(-dt / GAZE_FOLLOW)
  if (a.gazeTarget) {
    // Persiguiendo un objetivo externo. Se cancela la sacada que hubiera en vuelo: el
    // objetivo manda, y dejarla correr por debajo la devolvería de golpe al soltar.
    a.gaze += (clamp1(a.gazeTarget.x) - a.gaze) * k
    a.gazeY += (clamp1(a.gazeTarget.y) - a.gazeY) * k
    a.gazeAt = null
    a.gazeHeld = true
  } else {
    if (a.gazeHeld) {
      // Recién soltado. El vagabundeo arranca DESDE donde esté la mirada (`gazeFrom` es
      // siempre `a.gaze`), así que no hay salto; lo único que hace falta es no disparar
      // una sacada en el mismo frame con un `gazeNext` que quedó vencido mientras
      // miraba. La pausa es fija a propósito: pedirle un número al rng aquí ataría la
      // secuencia del actor a cuánto rato estuvo el ratón encima.
      a.gazeHeld = false
      a.gazeNext = t + GAZE_GAP[0]
    }
    // la vertical no la vagabundea nadie: vuelve al centro por el mismo suavizado, o el
    // personaje se quedaría mirando al techo para siempre
    if (a.gazeY) a.gazeY += -a.gazeY * k

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

  // --- ánimo (cejas + boca) ---------------------------------------------
  if (a.moodAt === null) {
    if (t >= a.moodNext) {
      const enNeutro = Object.keys(NEUTRAL).every((k) => a.mood[k] === 0)
      // desde una excursión casi siempre se vuelve al neutro; desde el neutro, a veces
      // ni eso — el personaje se queda quieto y solo se reprograma el reloj
      let target = null
      if (!enNeutro) {
        target = a.rng.next() < 0.75 ? { ...NEUTRAL } : moodTarget(a.rng)
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
      a.mood = Object.fromEntries(
        Object.keys(NEUTRAL).map((k) => [k, a.moodFrom[k] + (a.moodTo[k] - a.moodFrom[k]) * e])
      )
    }
  }
}

function moodTarget(rng) {
  const m = MOODS[Math.floor(rng.next() * MOODS.length)]
  const t = Object.fromEntries(Object.keys(NEUTRAL).map((k) => [k, rng.range(...(m[k] || [0, 0]))]))
  // la ceja arqueada no tiene lado bueno: se sortea
  if (m.mirror && rng.next() < 0.5) t.raise = -t.raise
  return t
}

/**
 * Arranca el bucle compartido.
 *
 * EL RELOJ ES SUYO, no el del navegador. `requestAnimationFrame` cuenta desde que cargó
 * el documento y no se detiene nunca; el rig cuenta desde su propio arranque y se para
 * cuando se pausa. La diferencia no es cosmética: `makeActor` reparte los desfases
 * iniciales en milisegundos de ese reloj, así que veinte segundos de pausa dejaban TODAS
 * las citas —parpadeo, mirada, ánimo— en el pasado, y en el primer frame tras reanudar
 * los treinta parpadeaban a coro (medido: 30/30 parpadeando, 27/30 moviendo la mirada,
 * 20/30 cambiando de humor). Luego se volvían a dispersar solos, que es lo que lo hacía
 * difícil de ver: parecía un pestañeo colectivo y ya está.
 *
 * `redraw` recibe también el tiempo del rig, no el del navegador: el humo se mide con
 * `a.smokeAt` en esa misma escala y con la del navegador la voluta pegaría un salto en
 * cada reanudación.
 *
 * @param actors  lista de estados creados con makeActor. Cada uno debe traer `canvas`.
 * @param redraw  (actor, t, faceChanged) => void — se llama cuando el actor cambió de
 *                verdad, o en el tic de humo (faceChanged=false: basta re-blitear la
 *                cara cacheada y pintar la voluta encima)
 * @returns {{ now, running, pause, resume, stop }} el mando del bucle. `now()` es el
 *          reloj del rig, que es el que hay que pasarle a `react`.
 */
export function startRig(actors, redraw) {
  let raf = 0
  let corriendo = true
  let vivo = true
  // `base` es el instante de rAF en el que arrancó el tramo actual, y `acumulado` el
  // tiempo de rig de los tramos anteriores. Reanudar vuelve a anclar `base`, así que la
  // pausa no cuenta como tiempo de animación.
  let base = null
  let acumulado = 0
  let now = 0

  const frame = (t) => {
    if (!corriendo) return
    if (base === null) base = t
    now = acumulado + (t - base)
    for (const a of actors) {
      advance(a, now)

      // Solo repinta si cambió algo que se dibuje. Redondear a 3 decimales evita
      // repintar por diferencias que no se ven.
      const sig =
        `${a.blink.toFixed(3)}|${a.gaze.toFixed(3)}|${a.gazeY.toFixed(3)}|${a.mood.tilt.toFixed(2)}|` +
        `${a.mood.lift.toFixed(4)}|${a.mood.curve.toFixed(3)}|${a.mood.open.toFixed(3)}|` +
        a.mood.raise.toFixed(4)
      const faceChanged = sig !== a.drawn
      const smokeDue = a.smokeTip !== null && now - a.smokeAt >= SMOKE_STEP
      if (faceChanged || smokeDue) {
        a.drawn = sig
        if (smokeDue) a.smokeAt = now
        redraw(a, now, faceChanged)
      }
    }
    raf = requestAnimationFrame(frame)
  }

  const pause = () => {
    if (!corriendo) return
    corriendo = false
    cancelAnimationFrame(raf)
    acumulado = now // congela el reloj donde se quedó
    base = null
  }
  const resume = () => {
    if (corriendo || !vivo) return
    corriendo = true
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
  return {
    now: () => now,
    running: () => corriendo,
    pause,
    resume,
    stop: () => {
      pause()
      vivo = false
    },
  }
}

/** Los overrides que este actor le pasa a character.draw. */
export function overridesFor(a) {
  return {
    eyes: { blink: a.blink, pupilX: a.gaze, pupilY: a.gazeY },
    brows: { moodTilt: a.mood.tilt, moodLift: a.mood.lift, moodRaise: a.mood.raise },
    mouth: { moodCurve: a.mood.curve, moodOpen: a.mood.open },
  }
}
