// Estados de vida. UN solo requestAnimationFrame recorre todos los personajes — nunca
// uno por personaje.
//
// La clave de rendimiento no es cachear capas, es NO REPINTAR lo que no ha cambiado:
//
//  · el parpadeo dura ~120ms cada 2-7s.
//  · la mirada solo se mueve durante la transición, ~380ms cada 3-10s.
//  · el ánimo (cejas y boca, un solo estado) solo se mueve durante su transición,
//    ~700ms cada 4-12s — y la mayoría de los cambios son VOLVER al neutro: el
//    personaje vive alrededor de su expresión base y hace excursiones, no va
//    saltando de mueca en mueca.
//
// En reposo eso son 3,9 caras repintadas por frame de treinta, medido sobre 120 s. Aquí
// ponía «una o dos», que era optimismo: sumar los tres ciclos da un 13 % de ocupación por
// cara, o sea ~4 de 30. El número no ha cambiado con la mirada al puntero — se midió con
// la firma de repintado con `gazeY` y sin él, y sale idéntico.
//
// Con el puntero moviéndose es otra historia: cambian las treinta miradas a la vez, así
// que se repintan las treinta. Eso cuesta 10,4 ms por frame gracias a la caché de capas
// estáticas del host (la cara entera serían 52).
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
// El doble parpadeo de la atención: dos rápidos seguidos. Es el gesto de «te he visto»
// —más corto que un parpadeo normal y en pareja, que es lo que lo hace legible como
// intención y no como higiene del ojo.
const BLINK_FAST = 80
const BLINK_AGAIN = 120
// Lo que dura el coro: los vecinos miran hacia quien ha recibido el click.
const CORO_HOLD = 900
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
//
// El `name` no es decoración: es lo que deja al host pedir una reacción concreta
// (`react`) sin conocer los números. El host sabe «esto merece atención»; qué es la
// atención en grados de ceja lo sigue sabiendo solo este fichero.
const MOODS = [
  { name: 'ceño', tilt: [5, 12], lift: [0, 0.01], curve: [-0.55, -0.2] },
  { name: 'enfado', tilt: [12, 17], lift: [0.004, 0.014], curve: [-0.8, -0.5] },
  { name: 'caído', tilt: [-10, -5], lift: [0, 0.008], curve: [-0.4, -0.1] },
  { name: 'tristeza', tilt: [-14, -9], lift: [0.006, 0.016], curve: [-0.6, -0.35] },
  { name: 'sorpresa', tilt: [-4, 0], lift: [-0.03, -0.018], open: [0.4, 0.75] },
  { name: 'susto', tilt: [-6, -2], lift: [-0.038, -0.028], curve: [0, 0.1], open: [0.75, 1] },
  { name: 'atención', tilt: [-2, 2], lift: [-0.012, -0.006], curve: [0.15, 0.5] },
  { name: 'alegría', tilt: [-3, 1], lift: [-0.02, -0.008], curve: [0.5, 0.85], open: [0, 0.15] },
  { name: 'duda', tilt: [0, 4], curve: [-0.35, -0.1], raise: [0.028, 0.048], mirror: true },
  { name: 'picardía', tilt: [-2, 2], lift: [-0.006, 0], curve: [0.3, 0.6], raise: [0.022, 0.04], mirror: true },
]
const NEUTRAL = { tilt: 0, lift: 0, curve: 0, open: 0, raise: 0 }

/** Los ánimos de la DERIVA. `react` no los usa: tiene su propia tabla. */
export const MOOD_NAMES = MOODS.map((m) => m.name)

// --- reacciones ------------------------------------------------------------
//
// Tabla APARTE de MOODS, y no por gusto de duplicar: una reacción y una deriva son cosas
// distintas y se estaban calibrando con los mismos números. MOODS está afinado para que
// treinta caras hagan muecas de fondo sin que canse — cejas del orden del 1 % de la
// altura de la cara, 700 ms de transición. Con eso, contestar a un click se perdía: era
// la misma deriva de siempre, solo que a destiempo.
//
// Lo que cambia:
//  · ENVOLVENTE propia en vez de una sola transición. Ataque rápido (easeOut: sale de
//    golpe y frena al llegar), sostenido, y suelta lenta. Una reacción tiene ese perfil;
//    una deriva no tiene perfil ninguno, va y vuelve.
//  · la suelta va hacia el ÁNIMO QUE HAYA, no hacia el neutro. Reaccionar no puede
//    borrarle el humor de fondo al personaje.
//  · amplitudes ×2.5 en `lift` — la ceja es lo que más se lee de lejos. `tilt` y `curve`
//    se quedan igual: subirlos hacía muecas de payaso.
//  · canales que la deriva no tiene: `eyeOpen` (abre o cierra el ojo), `bounce` (un golpe
//    de escala del dibujo entero, que lo pinta el host) y `cigDrop` (el cigarrillo se
//    despega del labio, ver mouth.js).
//
// `hold: Infinity` es la atención: dura mientras el ratón esté encima, y la suelta la
// dispara el host con react(a, 'neutro').
const REACTIONS = [
  {
    name: 'atención',
    attack: 160,
    hold: Infinity,
    release: 400,
    tilt: [-2, 2],
    lift: [-0.03, -0.015],
    curve: [0.15, 0.5],
    eyeOpen: 1.15,
    // el fumador que solo mira no se despega el cigarro de los labios
    cigDrop: 0,
    dobleParpadeo: true,
  },
  {
    name: 'sorpresa',
    attack: 120,
    hold: 500,
    release: 600,
    tilt: [-4, 0],
    lift: [-0.075, -0.045],
    open: [0.4, 0.75],
    eyeOpen: 1.4,
    bounce: 0.06,
    bounceDur: 250,
    cigDrop: 1,
  },
  {
    name: 'alegría',
    attack: 180,
    hold: 700,
    release: 600,
    tilt: [-3, 1],
    lift: [-0.05, -0.02],
    curve: [0.5, 0.85],
    open: [0, 0.15],
    // los ojos se CIERRAN al reír: es lo que separa una sonrisa de una mueca ancha
    eyeOpen: 0.75,
    bounce: 0.04,
    bounceDur: 300,
    rebote: true,
    cigDrop: 0.7,
  },
]

/** Lo que entiende `react`, más 'neutro' para soltar. */
export const REACTION_NAMES = [...REACTIONS.map((r) => r.name), 'neutro']

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
    blinkAgainAt: null, // el segundo del doble parpadeo, si lo hay
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
    // Objetivo con caducidad: mientras dure, el host no lo pisa y al vencer se suelta
    // solo. Es lo que deja al coro durar 900 ms sin que el host tenga que llevar el reloj.
    gazeHold: null,
    gazeHeld: false,
    lastT: null,
    mood: { ...NEUTRAL },
    moodFrom: null,
    moodTo: null,
    moodAt: null,
    moodNext: rng.range(0, MOOD_GAP[1]),
    // la reacción en curso, si la hay. `expr` es lo que se DIBUJA: el ánimo, o la mezcla
    // de ánimo y reacción mientras la envolvente está abierta.
    reactAt: null,
    reactDef: null,
    reactTo: null,
    reactBase: null,
    reactHoldExpr: null,
    reactHoldEnd: 0,
    reactE0: 1,
    reactE: 0,
    bounce: 0,
    expr: { ...NEUTRAL, eyeOpen: 1, cigDrop: 0 },
    // La frase que está diciendo, si la hay: `{ t0, phrase }` con `t0` en ms del reloj
    // del rig. La pone el HOST — el rig no sabe que eso suena, solo que mientras dura
    // manda en la boca. Se descuelga sola al acabar.
    speech: null,
    talkOpen: 0,
    talkDrop: 0,
    // el humo: fase propia (que treinta volutas no ondulen a coro) y reloj de tic.
    // `smokeTip` lo rellena el redraw del host cuando la cara tiene cigarro.
    smokeTip: null,
    smokePhase: rng.range(0, Math.PI * 2),
    smokeAt: 0,
    drawn: null,
  }
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
// El ataque sale disparado y frena al llegar: es lo que hace que se lea como respuesta y
// no como que la cara se ha puesto a hacer algo por su cuenta.
const easeOut = (t) => 1 - (1 - t) ** 3
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v || 0)
const lerp = (a, b, k) => a + (b - a) * k

/**
 * El golpe de escala. Con `rebote`, la vuelta se pasa un poco y se asienta — que es lo
 * que hace un cuerpo que se para. Sin él es un solo bulto: para la sorpresa interesa el
 * golpe seco, no el temblor.
 *
 * Normalizada para que el pico valga exactamente 1: la amplitud la pone la tabla.
 */
function popCurve(u, rebote) {
  if (u <= 0 || u >= 1) return 0
  if (!rebote) return Math.sin(Math.PI * u)
  return u < 0.6
    ? Math.sin((Math.PI * u) / 0.6)
    : -0.25 * Math.sin((Math.PI * (u - 0.6)) / 0.4)
}

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
  // El segundo del doble va ANTES de la lógica normal: es una cita forzada, no depende de
  // `blinkFrom`. Su duración tampoco sale del rng — así el doble parpadeo no le mueve la
  // secuencia al actor por el hecho de que alguien haya pasado el ratón por encima.
  if (a.blinkAgainAt !== null && a.blinkAt === null && t >= a.blinkAgainAt) {
    a.blinkAt = t
    a.blinkDur = BLINK_FAST
    a.blinkAgainAt = null
  }
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
  if (a.gazeHold !== null && t >= a.gazeHold) {
    a.gazeHold = null
    a.gazeTarget = null
  }
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
  // Con una reacción abierta la deriva NO arranca excursiones nuevas: la cara ya está
  // diciendo algo y ponerse además a derivar lo emborrona. La que estuviera en vuelo sí
  // termina — cortarla daría el salto que la envolvente existe para evitar. El reloj se
  // reprograma al soltar, más abajo.
  if (a.moodAt === null) {
    if (t >= a.moodNext && a.reactAt === null) {
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

  // --- reacción: la envolvente ------------------------------------------
  //
  // Tres tramos, y las costuras entre ellos son lo delicado:
  //  · ATAQUE — de donde estuviera la cara (`reactBase`) hasta la amplitud. Arranca en
  //    la expresión de ese instante, no en el ánimo, así que reaccionar encima de otra
  //    reacción no teletransporta nada.
  //  · SOSTENIDO — quieta en la amplitud.
  //  · SUELTA — de donde estaba al empezar a soltar (`reactHoldExpr`) hasta el ánimo
  //    VIVO. No al neutro y no a un ánimo guardado: al que haya en ese momento, que es
  //    lo único que no le borra el humor de fondo al personaje.
  //
  // La suelta se comprueba ANTES que el ataque. Al revés, soltar a mitad del ataque no
  // hacía nada —seguía subiendo— y un ratón que solo roza la celda daba un tirón.
  a.bounce = 0
  if (a.reactAt !== null) {
    const d = a.reactDef
    // Los tramos se miden con el reloj POR DELANTE. `advance` es una costura pública y
    // nada impide llamarla con un instante anterior al arranque; sin este suelo, la
    // cúbica del ataque extrapola —medido: −1e9 en `open`— y `mouth.js` revienta pidiendo
    // una elipse de radio negativo. El reloj del rig no retrocede, pero el que lo gobierne
    // desde fuera no tiene por qué saberlo.
    const u = Math.max(0, t - a.reactAt)
    if (t >= a.reactHoldEnd) {
      if (a.reactHoldExpr === null) {
        a.reactHoldExpr = a.expr
        a.reactE0 = a.reactE
      }
      const r = Math.max(0, (t - a.reactHoldEnd) / d.release)
      if (r >= 1) {
        // Se acabó. El reloj de la deriva se reprograma aquí y no antes: si no, la cita
        // vencida durante la reacción dispararía una excursión en el mismo frame en que
        // la cara acaba de volver, y se leería como un tic.
        a.reactAt = null
        a.reactDef = null
        a.reactHoldExpr = null
        a.moodNext = t + a.rng.range(...MOOD_GAP)
      } else {
        const k = 1 - easeInOut(r)
        a.reactE = a.reactE0 * k
        a.expr = mezcla(exprDeAnimo(a), a.reactHoldExpr, k)
      }
    } else if (u < d.attack) {
      a.reactE = easeOut(u / d.attack)
      a.expr = mezcla(a.reactBase, a.reactTo, a.reactE)
    } else {
      a.reactE = 1
      a.expr = { ...a.reactTo }
    }
    if (a.reactAt !== null && d.bounce) {
      a.bounce = d.bounce * popCurve(u / d.bounceDur, d.rebote)
    }
  }
  if (a.reactAt === null) {
    a.reactE = 0
    a.expr = exprDeAnimo(a)
  }

  // --- habla: la frase manda en la boca mientras dura --------------------
  // Se mezcla con MÁXIMO, no sustituyendo: si el personaje está a mitad de una sorpresa
  // con la boca abierta, hablar no puede cerrársela. Y va sobre `expr`, que es lo que se
  // dibuja, así que `overridesFor` y la firma de repintado no se enteran de que existe
  // otro origen — la boca tampoco: le llega `moodOpen` y no pregunta de dónde viene.
  a.talkOpen = 0
  a.talkDrop = 0
  if (a.speech) {
    const u = (t - a.speech.t0) / 1000 // la frase viene en SEGUNDOS; el rig cuenta en ms
    const f = a.speech.phrase
    if (u >= f.dur || u < 0) {
      a.speech = null
    } else {
      for (const sy of f.syllables) {
        if (u < sy.t || u >= sy.t + sy.dur) continue
        a.talkOpen = sy.open * bocaSilaba((u - sy.t) / sy.dur)
        break
      }
      // El cigarrillo se descuelga durante toda la frase, no solo en las sílabas: no se
      // habla sujetando el pitillo con los labios y soltándolo entre sílaba y sílaba.
      a.talkDrop = Math.max(0, Math.min(1, u / 0.08, (f.dur - u) / 0.2))
    }
  }
  if (a.talkOpen > a.expr.open) a.expr.open = a.talkOpen
  if (a.talkDrop > a.expr.cigDrop) a.expr.cigDrop = a.talkDrop
}

// La boca dentro de una sílaba: abre rápido, aguanta y cierra algo más lento. No es la
// envolvente exacta del sonido —esa vive en speech.js— pero sigue su forma, que es lo que
// hace que el labio parezca la causa del ruido y no un acompañamiento.
const bocaSilaba = (k) => (k < 0.25 ? k / 0.25 : k > 0.65 ? (1 - k) / 0.35 : 1)

// Los canales que se DIBUJAN. `eyeOpen` va aquí y no en NEUTRAL porque su reposo es 1,
// no 0: es un multiplicador de la apertura del ojo, no un delta.
const EXPR_KEYS = ['tilt', 'lift', 'curve', 'open', 'raise', 'eyeOpen', 'cigDrop']
const exprDeAnimo = (a) => ({ ...a.mood, eyeOpen: 1, cigDrop: 0 })
const mezcla = (A, B, k) =>
  Object.fromEntries(EXPR_KEYS.map((n) => [n, lerp(A[n], B[n], k)]))

function moodTarget(rng) {
  return moodValues(MOODS[Math.floor(rng.next() * MOODS.length)], rng)
}

/** Un ánimo concreto, con sus canales sorteados dentro de sus bandas. */
function moodValues(m, rng) {
  const t = Object.fromEntries(Object.keys(NEUTRAL).map((k) => [k, rng.range(...(m[k] || [0, 0]))]))
  // la ceja arqueada no tiene lado bueno: se sortea
  if (m.mirror && rng.next() < 0.5) t.raise = -t.raise
  return t
}

/**
 * Reaccionar AHORA: abre la envolvente de una reacción con nombre.
 *
 * Es la única puerta del host a la expresión, y es deliberadamente estrecha: entra un
 * nombre, no unos grados de ceja. El index sabe que pasar el ratón por encima «merece
 * atención»; cuánto se levanta una ceja para eso sigue viviendo aquí.
 *
 * No pisa el ánimo de fondo: la reacción se MEZCLA encima con el peso de la envolvente,
 * así que la suelta cae sola en el ánimo que haya. Reaccionar dos veces seguidas tampoco
 * da un salto — la segunda arranca desde el peso que llevara la primera.
 *
 * @param name  uno de REACTION_NAMES. 'neutro' suelta la reacción en curso (es lo que
 *              necesita la atención, que aguanta hasta que el host la suelte).
 * @returns false si el nombre no existe, sin tocar nada.
 */
export function react(a, name, t = a.lastT ?? 0) {
  if (name === 'neutro') {
    if (a.reactAt === null) return true
    // Soltar YA: el tramo de suelta arranca en este instante y sale de donde esté la
    // cara, esté a mitad del ataque o en el sostenido.
    a.reactHoldEnd = Math.min(a.reactHoldEnd, t)
    return true
  }
  const d = REACTIONS.find((r) => r.name === name)
  if (!d) return false
  a.reactAt = t
  a.reactDef = d
  a.reactE0 = 1
  a.reactHoldExpr = null
  // la cara de AHORA es el punto de partida del ataque, venga del ánimo o de otra reacción
  a.reactBase = { ...a.expr }
  a.reactHoldEnd = d.hold === Infinity ? Infinity : t + d.attack + d.hold
  if (d.dobleParpadeo) {
    a.blinkAt = t
    a.blinkDur = BLINK_FAST
    a.blinkAgainAt = t + BLINK_FAST + BLINK_AGAIN
  }
  a.reactTo = {
    tilt: a.rng.range(...(d.tilt || [0, 0])),
    lift: a.rng.range(...(d.lift || [0, 0])),
    curve: a.rng.range(...(d.curve || [0, 0])),
    open: a.rng.range(...(d.open || [0, 0])),
    raise: a.rng.range(...(d.raise || [0, 0])),
    eyeOpen: d.eyeOpen ?? 1,
    cigDrop: d.cigDrop ?? 0,
  }
  return true
}

/**
 * El coro: los que están cerca miran hacia un punto durante un rato.
 *
 * Vive aquí y no en el host porque es mirada, que es del rig; lo que el rig sigue sin
 * saber es qué es ese punto. Le entran posiciones y le sale a quién le toca mirar.
 *
 * El RADIO es lo que lo hace un coro y no una coreografía: si miraran los treinta, treinta
 * cabezas girando a la vez se leen como un efecto, no como que alguien ha llamado la
 * atención. Miran los vecinos, y el resto ni se entera.
 *
 * @param centros  centro de la celda de cada actor, en las unidades del host
 * @param except   índice que NO mira (el pulsado: nadie se mira a sí mismo)
 * @param reach    distancia de referencia para normalizar a [−1, 1], como el puntero
 * @param radius   más lejos de esto, ni se giran
 */
export function lookAtAll(actors, centros, punto, t, opts = {}) {
  const { except = -1, reach = 500, radius = 700, hold = CORO_HOLD } = opts
  let n = 0
  for (let i = 0; i < actors.length; i++) {
    if (i === except || !centros[i]) continue
    const dx = punto.x - centros[i].x
    const dy = punto.y - centros[i].y
    if (Math.hypot(dx, dy) > radius) continue
    actors[i].gazeTarget = { x: clamp1(dx / reach), y: clamp1(dy / reach) }
    actors[i].gazeHold = t + hold
    n++
  }
  return n
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
        `${a.blink.toFixed(3)}|${a.gaze.toFixed(3)}|${a.gazeY.toFixed(3)}|${a.expr.tilt.toFixed(2)}|` +
        `${a.expr.lift.toFixed(4)}|${a.expr.curve.toFixed(3)}|${a.expr.open.toFixed(3)}|` +
        `${a.expr.raise.toFixed(4)}|${a.expr.eyeOpen.toFixed(3)}|${a.expr.cigDrop.toFixed(3)}|` +
        a.bounce.toFixed(4)
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

/**
 * Los overrides que este actor le pasa a character.draw.
 *
 * Salen de `expr`, no de `mood`: `mood` es solo la deriva, y `expr` es lo que de verdad
 * hay que dibujar una vez mezclada la reacción. `bounce` NO va aquí — no es un canal del
 * personaje sino una transformación del lienzo entero, y la aplica el host.
 */
export function overridesFor(a) {
  return {
    eyes: { blink: a.blink, pupilX: a.gaze, pupilY: a.gazeY, eyeOpen: a.expr.eyeOpen },
    brows: { moodTilt: a.expr.tilt, moodLift: a.expr.lift, moodRaise: a.expr.raise },
    mouth: { moodCurve: a.expr.curve, moodOpen: a.expr.open, cigDrop: a.expr.cigDrop },
  }
}
