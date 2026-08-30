// ARCHIVO — la PRIMERA receta de síntesis (ago 2026). No se toca y no la usa nadie salvo
// `previews/voice.html`, que la necesita para el botón A/B: tocar la misma frase con la
// receta vieja y con la nueva, seguidas, es la única forma de juzgar una mejora de sonido
// con el oído en vez de con la memoria.
//
// Lo que le pasaba, y que es lo que arregla la v2:
//  · CHASQUIDO. Los ataques 'pop' eran un pulso de ruido de 8 ms a 0,9 — un golpe seco,
//    no una consonante. Y los bandpass de formantes, con Q 12–14, saltaban de frecuencia
//    con `setValueAtTime` en cada sílaba: a un filtro resonante le cambias la frecuencia
//    de golpe y suena un «tuc» él solo, sin que nadie le mande nada.
//  · ROBÓTICO. Dentro de cada sílaba todo era estático o recto: formantes fijos, tono en
//    rampa perfecta, envolvente lineal, todas las sílabas iguales. Y dos sierras con Q
//    alta zumban.
//
// El RENDER de la voz: coge una frase de `src/parts/voice.js` y la toca con Web Audio.
//
// Es del HOST, como el humo. Solo lo importan `index.html` y `previews/voice.html`; el
// generador y `compose.html` no lo cargan nunca, así que dibujar una cara no depende de
// que exista un AudioContext ni de que el navegador deje sonar. Y no conoce el rig: le
// entran datos y le sale ruido.
//
// La receta, de arriba abajo:
//
//   dos sierras ─┐
//                ├→ envolvente por sílaba ─┬→ bandpass F1 ─┐
//                │                          └→ bandpass F2 ─┤
//   ruido ───────┼→ paso bajo → soplo ────────────────────  ┼→ frase → master → comp
//                ├→ paso alto → siseo (ataques 'noise')     │
//                └→ paso bajo → chasquido (ataques 'pop') ──┘
//
// Los dos bandpass en paralelo son los FORMANTES, que es lo que hace que un zumbido se
// oiga como una vocal. Sin ellos una sierra filtrada suena a sintetizador de los 80; con
// ellos, a alguien diciendo algo. `vowel` mueve la pareja por el espacio vocálico y
// `timbre` la coloca (nasal, redondo, chillón).
//
// Todo se programa sobre el reloj del AudioContext con setValueAtTime y rampas: ni un
// setTimeout. El reloj de JS se va varios milisegundos y eso, en audio, se oye.

const MASTER = 0.5
const MAX_VOCES = 2 // dos a la vez; una tercera corta a la más vieja
const ATTACK = 0.015
const DECAY = 0.04
const FADE = 0.03 // lo que tarda en callarse una frase cortada, para que no dé un chasquido

// El espacio vocálico, en tres anclas. `vowel` recorre /i/ → /a/ → /u/, que es el
// triángulo de siempre: cerrada y clara, abierta, cerrada y oscura.
const VOCALES = [
  { f1: 300, f2: 2300 },
  { f1: 750, f2: 1200 },
  { f1: 350, f2: 850 },
]

// La colocación. Multiplican los formantes y deciden lo estrecha que es la resonancia:
// una Q alta es una voz más «apretada», más de dibujo animado.
const TIMBRES = {
  nasal: { f1: 0.9, f2: 0.85, q: 12, g2: 0.8 },
  redondo: { f1: 1, f2: 0.95, q: 7, g2: 0.55 },
  chillón: { f1: 1.15, f2: 1.3, q: 14, g2: 1 },
}

const F_MIN = 300
const F_MAX = 2800

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Formantes de una sílaba, ya colocados por el timbre y topados al rango útil. */
function formantes(vowel, timbre) {
  const t = TIMBRES[timbre] || TIMBRES.redondo
  const u = clamp(vowel, 0, 1) * 2
  const i = u < 1 ? 0 : 1
  const k = u - i
  const f1 = VOCALES[i].f1 + (VOCALES[i + 1].f1 - VOCALES[i].f1) * k
  const f2 = VOCALES[i].f2 + (VOCALES[i + 1].f2 - VOCALES[i].f2) * k
  return {
    f1: clamp(f1 * t.f1, F_MIN, F_MAX),
    f2: clamp(f2 * t.f2, F_MIN, F_MAX),
    q: t.q,
    g2: t.g2,
  }
}

/** La envolvente de una sílaba: ataque corto, meseta y caída. */
function envSilaba(param, t0, dur, pico) {
  const at = Math.min(ATTACK, dur * 0.4)
  const de = Math.min(DECAY, dur - at)
  param.setValueAtTime(0, t0)
  param.linearRampToValueAtTime(pico, t0 + at)
  param.setValueAtTime(pico, t0 + dur - de)
  param.linearRampToValueAtTime(0, t0 + dur)
}

/** Un pulso corto, para los ataques. */
function pulso(param, t0, dur, pico) {
  param.setValueAtTime(0, t0)
  param.linearRampToValueAtTime(pico, t0 + dur * 0.25)
  param.linearRampToValueAtTime(0, t0 + dur)
}

/**
 * El motor. Uno por página: es dueño del master, del compresor y del ruido compartido.
 *
 * @param ctx  un AudioContext, o un OfflineAudioContext para medirlo sin altavoces.
 */
export function createSpeech(ctx) {
  const master = ctx.createGain()
  master.gain.value = MASTER

  // Compresor suave al final: dos voces a la vez suman y sin esto la mezcla satura y
  // suena a distorsión, que es un ruido que no está en ninguna de las dos voces.
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.knee.value = 24
  comp.ratio.value = 3
  comp.attack.value = 0.005
  comp.release.value = 0.15
  master.connect(comp)
  comp.connect(ctx.destination)

  // Un solo buffer de ruido para toda la página: los AudioBufferSourceNode son de usar y
  // tirar, pero el buffer se comparte.
  const ruido = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate)
  const datos = ruido.getChannelData(0)
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1

  const vivas = []

  function parar(voz, cuando = ctx.currentTime) {
    const fin = cuando + FADE
    try {
      voz.gain.gain.cancelScheduledValues(cuando)
      voz.gain.gain.setValueAtTime(voz.gain.gain.value, cuando)
      voz.gain.gain.linearRampToValueAtTime(0, fin)
      for (const s of voz.fuentes) s.stop(fin)
    } catch {
      // un nodo ya parado tira; da igual, lo que importa es que deje de sonar
    }
    const i = vivas.indexOf(voz)
    if (i >= 0) vivas.splice(i, 1)
  }

  return {
    /**
     * Toca una frase. Devuelve cuándo acaba, en el reloj del AudioContext.
     *
     * @param id  quién habla. Volver a hablar con el mismo id CORTA lo anterior: un
     *            personaje no puede solaparse consigo mismo, se interrumpe.
     */
    speak(v, frase, id = null) {
      const t0 = ctx.currentTime + 0.02 // un pelo de margen: programar en el pasado se pierde
      if (id !== null) for (const otra of vivas.filter((x) => x.id === id)) parar(otra)
      while (vivas.length >= MAX_VOCES) parar(vivas[0])

      const gain = ctx.createGain()
      gain.gain.value = 1
      gain.connect(master)

      // --- el tono: dos sierras, la segunda desafinada por `rough` ------------
      // Una sola sierra con detune no suena áspera: suena transpuesta. La aspereza es el
      // batido entre dos que no acaban de afinar, que es lo que hace una garganta.
      const cuerpo = ctx.createGain()
      cuerpo.gain.value = 0
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.connect(cuerpo)
      const osc2 = ctx.createOscillator()
      osc2.type = 'sawtooth'
      osc2.detune.value = 8 + v.rough * 30
      const g2 = ctx.createGain()
      g2.gain.value = v.rough
      osc2.connect(g2)
      g2.connect(cuerpo)

      // vibrato: un LFO sobre el desafinado de las dos, no sobre la frecuencia — así no
      // se pelea con las rampas de tono de cada sílaba
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 5 + v.vibrato * 2
      const lfoG = ctx.createGain()
      lfoG.gain.value = v.vibrato * 45 // en cents
      lfo.connect(lfoG)
      lfoG.connect(osc.detune)
      lfoG.connect(osc2.detune)

      // --- formantes ----------------------------------------------------------
      const bp1 = ctx.createBiquadFilter()
      const bp2 = ctx.createBiquadFilter()
      const gf2 = ctx.createGain()
      for (const f of [bp1, bp2]) f.type = 'bandpass'
      cuerpo.connect(bp1)
      cuerpo.connect(bp2)
      bp1.connect(gain)
      bp2.connect(gf2)
      gf2.connect(gain)

      // --- ruido: soplo, siseo y chasquidos ------------------------------------
      const nz = ctx.createBufferSource()
      nz.buffer = ruido
      nz.loop = true
      const rutas = {}
      for (const [nombre, tipo, freq] of [
        ['soplo', 'lowpass', 1500],
        ['siseo', 'highpass', 3000],
        ['pop', 'lowpass', 700],
      ]) {
        const f = ctx.createBiquadFilter()
        f.type = tipo
        f.frequency.value = freq
        const g = ctx.createGain()
        g.gain.value = 0
        nz.connect(f)
        f.connect(g)
        g.connect(gain)
        rutas[nombre] = g
      }

      // --- programación por sílaba ---------------------------------------------
      for (const s of frase.syllables) {
        const a = t0 + s.t
        const f = formantes(s.vowel, v.timbre)
        bp1.frequency.setValueAtTime(f.f1, a)
        bp2.frequency.setValueAtTime(f.f2, a)
        bp1.Q.setValueAtTime(f.q, a)
        bp2.Q.setValueAtTime(f.q, a)
        gf2.gain.setValueAtTime(f.g2, a)

        osc.frequency.setValueAtTime(s.pitch, a)
        osc.frequency.exponentialRampToValueAtTime(s.pitchEnd, a + s.dur)
        osc2.frequency.setValueAtTime(s.pitch, a)
        osc2.frequency.exponentialRampToValueAtTime(s.pitchEnd, a + s.dur)

        // la boca abierta suena más fuerte: `open` es amplitud además de dibujo
        envSilaba(cuerpo.gain, a, s.dur, 0.18 + 0.5 * s.open)
        envSilaba(rutas.soplo.gain, a, s.dur, v.breath * 0.5)

        if (s.onset === 'noise') pulso(rutas.siseo.gain, a - 0.02, 0.02, 0.35)
        else if (s.onset === 'pop') pulso(rutas.pop.gain, a - 0.008, 0.008, 0.9)
      }

      const fin = t0 + frase.dur + FADE
      const fuentes = [osc, osc2, lfo, nz]
      for (const s of fuentes) {
        s.start(t0)
        s.stop(fin)
      }

      const voz = { id, gain, fuentes, until: fin }
      vivas.push(voz)
      // se descuelga sola al acabar; `onended` de una fuente basta
      osc.onended = () => {
        const i = vivas.indexOf(voz)
        if (i >= 0) vivas.splice(i, 1)
      }
      return fin
    },

    /** Silenciar sin parar nada: la frase sigue su curso, no se oye. */
    setMuted(m) {
      master.gain.value = m ? 0 : MASTER
    },

    stopAll() {
      for (const v of [...vivas]) parar(v)
    },

    get hablando() {
      return vivas.length
    },
  }
}
