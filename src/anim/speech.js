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
// Margen antes de la primera sílaba. Tiene que ser mayor que el pre-ataque más largo
// (60 ms, el del plosivo) o la consonante de la primera sílaba caería en tiempo negativo
// — que en un AudioContext vivo no pasa nunca, porque su reloj lleva rato corriendo, pero
// en un OfflineAudioContext el reloj empieza en cero y ahí se ve.
const MARGEN = 0.07
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

/**
 * La envolvente de una sílaba: ataque corto, meseta y caída.
 *
 * `desde` es el nivel al que arranca — lo usa la nasal, que empieza sonando bajito con el
 * formante grave y luego abre.
 */
function envSilaba(param, t0, dur, pico, desde = 0) {
  const at = Math.min(ATTACK, dur * 0.4)
  const de = Math.min(DECAY, dur - at)
  param.setValueAtTime(desde, t0)
  param.linearRampToValueAtTime(pico, t0 + at)
  param.setValueAtTime(pico, t0 + dur - de)
  param.linearRampToValueAtTime(0, t0 + dur)
}

/** Mueve un parámetro SIN saltos. τ pequeño = llega rápido, pero llega deslizándose. */
const desliza = (param, valor, cuando, tau = 0.012) =>
  param.setTargetAtTime(valor, Math.max(0, cuando), tau)

// La constante del barrido consonante→vocal: con τ = 18 ms está al 95 % a los 54 ms, que
// es donde vive esa transición en el habla.
const GLIDE = 0.018

// Dónde arrancan los formantes de cada sílaba, en múltiplos de los de su vocal. El primer
// formante siempre parte de abajo (la boca está más cerrada al empezar); el segundo sube
// en las fricativas y baja en las plosivas, que es lo que separa una «s» de una «b».
const DESVIO = {
  none: { f1: 0.85, f2: 1 },
  noise: { f1: 0.6, f2: 1.25 },
  pop: { f1: 0.6, f2: 0.75 },
  nasal: { f1: 0.6, f2: 0.9 },
}

/** Un pulso corto, para los ataques. */
function pulso(param, t0, dur, pico) {
  const a = Math.max(0, t0) // el reloj no tiene pasado
  param.setValueAtTime(0, a)
  param.linearRampToValueAtTime(pico, a + dur * 0.25)
  param.linearRampToValueAtTime(0, a + dur)
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
      const t0 = ctx.currentTime + MARGEN // programar en el pasado se pierde
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
      const filtros = {}
      for (const [nombre, tipo, freq] of [
        ['soplo', 'lowpass', 1500],
        ['siseo', 'highpass', 3000],
        // El plosivo va por un BANDPASS que se centra en el F2 de cada sílaba, no por un
        // lowpass fijo a 700: un golpe grave de banda ancha suena a madera, y una ráfaga
        // centrada donde va a estar la vocal suena a la boca abriéndose para decirla.
        ['pop', 'bandpass', 1200],
      ]) {
        const f = ctx.createBiquadFilter()
        f.type = tipo
        f.frequency.value = freq
        if (tipo === 'bandpass') f.Q.value = 1.5
        const g = ctx.createGain()
        g.gain.value = 0
        nz.connect(f)
        f.connect(g)
        g.connect(gain)
        rutas[nombre] = g
        filtros[nombre] = f
      }

      // --- programación por sílaba ---------------------------------------------
      let finPrevia = 0
      for (const s of frase.syllables) {
        const a = t0 + s.t
        const f = formantes(s.vowel, v.timbre)
        const d = DESVIO[s.onset] || DESVIO.none

        // Los formantes se DESLIZAN, nunca saltan. A un bandpass resonante le cambias la
        // frecuencia de golpe y suena un «tuc» él solo, sin que nadie le mande nada: era
        // la mitad del chasquido, y la que costaba más de encontrar porque no venía de
        // ningún nodo de ruido.
        //
        // Y arrancan DESPLAZADOS, deslizándose a la vocal en ~50 ms. Esa transición es lo
        // que se oye como consonante: lo que distingue «ba» de un golpe no es el golpe,
        // es el barrido de formantes que viene detrás.
        const arranque = Math.max(t0, a - 0.03)
        desliza(bp1.frequency, f.f1 * d.f1, arranque)
        desliza(bp2.frequency, f.f2 * d.f2, arranque)
        desliza(bp1.Q, f.q, arranque)
        desliza(bp2.Q, f.q, arranque)
        desliza(gf2.gain, f.g2, arranque)
        desliza(bp1.frequency, f.f1, a + 0.01, GLIDE)
        desliza(bp2.frequency, f.f2, a + 0.01, GLIDE)

        // El tono sí puede saltar: la fase del oscilador sigue siendo continua, así que
        // un escalón de frecuencia no rompe la onda. Lo que no puede saltar es la
        // amplitud, y de eso se encarga la envolvente.
        const dip = s.onset === 'pop' ? 0.92 : 1
        for (const o of [osc, osc2]) {
          o.frequency.setValueAtTime(s.pitch * dip, a)
          if (dip !== 1) o.frequency.linearRampToValueAtTime(s.pitch, a + 0.03)
          o.frequency.exponentialRampToValueAtTime(s.pitchEnd, a + s.dur)
        }

        // la boca abierta suena más fuerte: `open` es amplitud además de dibujo
        const pico = 0.18 + 0.5 * s.open
        if (s.onset === 'nasal') {
          // 25 ms de zumbido con el primer formante muy grave antes de abrir: es la /m/.
          // Se recorta contra el final de la sílaba anterior para no montarse encima.
          const pre = Math.max(finPrevia, a - 0.025)
          desliza(bp1.frequency, 250, pre)
          desliza(bp1.frequency, f.f1, a + 0.01, GLIDE)
          envSilaba(cuerpo.gain, pre, s.dur + (a - pre), pico, pico * 0.28)
        } else {
          envSilaba(cuerpo.gain, a, s.dur, pico)
        }
        envSilaba(rutas.soplo.gain, a, s.dur, v.breath * 0.5)

        // La ráfaga de consonante: más larga y mucho más floja que antes (era 8 ms a 0,9,
        // que no es una consonante, es un martillazo).
        if (s.onset === 'noise') pulso(rutas.siseo.gain, a - 0.03, 0.03, 0.25)
        else if (s.onset === 'pop') {
          // el bandpass del plosivo se coloca en el F2 de ESTA sílaba. Puede saltar sin
          // que se oiga: su ganancia está a cero mientras tanto.
          filtros.pop.frequency.setValueAtTime(f.f2, Math.max(0, a - 0.06))
          pulso(rutas.pop.gain, a - 0.025, 0.025, 0.32)
        }
        finPrevia = a + s.dur
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
