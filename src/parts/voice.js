// La voz, como parte del personaje: sale de su seed igual que su cara.
//
// Aquí NO suena nada. Este módulo produce una frase como DATOS —una lista de sílabas con
// sus tiempos, sus tonos y su apertura de boca— y quien la toca es `src/anim/speech.js`,
// que es del host. La frontera no es un capricho:
//
//  · el generador y `compose.html` no cargan Web Audio. Dibujar una cara no puede
//    depender de que exista un AudioContext, ni de que el navegador deje sonar.
//  · una frase es serializable y determinista, así que se puede testear en Node sin
//    audio y sin canvas — que es exactamente donde se comprueba el ritmo y la melodía.
//  · el mismo dato sirve para la boca: `open` por sílaba es lo que abre el labio en
//    `rig.js`, sin que el rig se entere de que hay sonido.
//
// El balbuceo no tiene idioma: son sílabas con vocal y ataque, no fonemas. Lo que da
// carácter es la CURVA de la frase (afirma, pregunta, queja) y el timbre, no las letras.

import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  pitch: { min: 90, max: 480, range: [140, 330], step: 1, unit: ' Hz', label: 'Tono base' },
  // Cuánto sube y baja dentro de la frase. En SEMITONOS, no en Hz: un intervalo se oye
  // igual de grande arriba que abajo, y en Hz la misma cifra sería un salto enorme en una
  // voz aguda y un temblor en una grave.
  pitchRange: { min: 0, max: 24, range: [3, 12], step: 0.5, unit: ' st', label: 'Recorrido melódico' },
  rate: { min: 2, max: 14, range: [4, 9], step: 0.25, unit: ' síl/s', label: 'Velocidad' },
  length: { min: 1, max: 12, range: [3, 8], step: 1, int: true, label: 'Sílabas por frase' },
  rough: { min: 0, max: 1, range: [0.1, 0.6], step: 0.05, label: 'Aspereza' },
  breath: { min: 0, max: 1, range: [0.05, 0.35], step: 0.05, label: 'Soplo' },
  vibrato: { min: 0, max: 1, range: [0, 0.5], step: 0.05, label: 'Vibrato' },
  contour: {
    options: ['afirma', 'pregunta', 'queja'],
    pool: { afirma: 3, pregunta: 2, queja: 1 },
    label: 'Curva de frase',
  },
  timbre: {
    options: ['nasal', 'redondo', 'chillón'],
    pool: { nasal: 1, redondo: 2, chillón: 1 },
    label: 'Timbre',
  },
}

export const randomize = randomizerFor(PARAMS)

// La curva de la frase, en fracciones de `pitchRange`. `from`/`to` son el tono al empezar
// y al acabar; `glide` es lo que se desliza DENTRO de la última sílaba, que es donde se
// decide si la frase suena a punto, a interrogación o a lamento; `drag` la alarga.
//
// La queja es la única que arrastra: es lo que la separa de una afirmación con el tono
// bajo. Un final corto y grave es un punto; uno largo y cayendo es un quejido.
const CONTOURS = {
  afirma: { from: 0.3, to: -0.6, glide: -0.25, drag: 1 },
  pregunta: { from: -0.15, to: 0.85, glide: 0.5, drag: 1.1 },
  queja: { from: 0.45, to: -0.25, glide: -0.9, drag: 2 },
}

// Cómo empieza cada sílaba. Los bordes son lo que hace que un balbuceo se lea como habla
// y no como un theremín — pero un borde no es un golpe: lo que se oye como consonante es
// la TRANSICIÓN de formantes que viene detrás, y eso lo pone `speech.js`.
//
// `pop` bajó de peso 3 a 2 y entró `nasal`: con tres de cada siete sílabas empezando en
// plosiva, la frase sonaba a percusión.
const ONSETS = { none: 2, noise: 2, pop: 2, nasal: 1 }

// Lo que ocupa el SONIDO dentro del paso de una sílaba; el resto es silencio. Sin ese
// silencio las sílabas se sueldan en un zumbido continuo.
const SONIDO = 0.62

/** Topes de cordura en Hz: con el recorrido al máximo, el tono se iría de la voz. */
const HZ_MIN = 60
const HZ_MAX = 1200

/**
 * Una frase de balbuceo, como datos. Pura: mismo `v` y mismo rng → misma frase.
 *
 * El host le pasa `makeRng(seed).fork(SALT.voice).fork(k)`, con `k` el número de frase.
 * Así la frase 3 de un personaje es siempre la misma frase 3, y no depende de cuántas
 * veces le hayan hecho click antes ni de en qué orden.
 *
 * @returns {{ syllables: Array, dur: number }} tiempos en SEGUNDOS desde el inicio.
 */
export function phrase(v, rng) {
  const n = Math.max(1, Math.round(v.length))
  const paso = 1 / v.rate
  const c = CONTOURS[v.contour] || CONTOURS.afirma
  const R = v.pitchRange
  const syllables = []
  let t = 0

  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 1 : i / (n - 1)
    const ultima = i === n - 1
    const dur = paso * SONIDO * rng.range(0.85, 1.15) * (ultima ? c.drag : 1)
    // El tono de la sílaba es la curva de la frase MÁS un bandazo propio. Sin el bandazo
    // la frase es una rampa y suena a sirena; con él, a alguien hablando.
    const semi = R * (c.from + (c.to - c.from) * u) + rng.range(-0.28, 0.28) * R
    const glide = (ultima ? c.glide : rng.range(-0.3, 0.3)) * R
    syllables.push({
      t,
      dur,
      pitch: hz(v.pitch, semi),
      pitchEnd: hz(v.pitch, semi + glide),
      open: rng.range(0.35, 1),
      onset: rng.weighted(ONSETS),
      vowel: rng.range(0, 1),
    })
    t += dur + paso * (1 - SONIDO) * rng.range(0.7, 1.3)
  }

  const last = syllables[n - 1]
  // La frase acaba cuando acaba la última sílaba: el silencio de después no es frase.
  return { syllables, dur: last.t + last.dur }
}

const hz = (base, semitones) =>
  Math.min(HZ_MAX, Math.max(HZ_MIN, base * Math.pow(2, semitones / 12)))
