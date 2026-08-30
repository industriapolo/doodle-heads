// El RENDER de la voz: coge una frase de `src/parts/voice.js` y la toca con Web Audio.
//
// Es del HOST, como el humo. Solo lo importan `index.html` y `previews/voice.html`; el
// generador y `compose.html` no lo cargan nunca, así que dibujar una cara no depende de
// que exista un AudioContext ni de que el navegador deje sonar. Y no conoce el rig: le
// entran datos y le sale ruido.
//
// La receta, de arriba abajo:
//
//   pulso glotal ─┐
//   triangular ───┤→ envolvente por sílaba ─┬→ bandpass F1 ─┐
//                 │                         ├→ bandpass F2 ─┼→ paso bajo 3,8 kHz ─┐
//                 │                         └→ bandpass F3 ─┘                     │
//   ruido ────────┼→ paso bajo → soplo ────────────────────────────────────────────┤
//                 ├→ paso alto → siseo (ataques 'noise') ─────────────────────────┤
//                 └→ bandpass en F2 → plosiva (ataques 'pop') ────────────────────┘
//                                                    → frase → master → compresor
//
// Los tres bandpass en paralelo son los FORMANTES, que es lo que hace que un zumbido se
// oiga como una vocal. Sin ellos, una fuente filtrada suena a sintetizador de los 80; con
// ellos, a alguien diciendo algo. `vowel` mueve la pareja por el espacio vocálico y
// `timbre` la coloca (nasal, redondo, chillón).
//
// Hubo un banco con tres ejes para poder elegir de oído — era la única forma, porque
// «robótico» no se deja medir desde fuera: cada intento dio un número que mejoraba
// mientras el oído decía que no. Ganaron los tres, así que ya no son opciones:
//
//   FUENTE   pulso glotal en vez de sierra. Una sierra tiene demasiada energía arriba y
//            zumba; el pulso cae como 1/n², que es un pliegue vocal cerrándose.
//   RITMO    cada sílaba suena el 65 % de lo que ocupa y calla antes de la siguiente. El
//            cierre es lo que hace que una plosiva sea plosiva y lo que separa las
//            sílabas; sin él la frase es un continuo.
//   MELODÍA  no está aquí sino en `voice.js`: el tono es una curva de frase, no una nota
//            por sílaba. Una sucesión de notas afinadas es lo que más suena a robot.
//
// La receta vieja —sierra, sin cierre, notas sueltas— vive en el commit `d7ca8f6` por si
// alguna vez hay arqueología que hacer.
//
// Todo se programa sobre el reloj del AudioContext con setValueAtTime y rampas: ni un
// setTimeout. El reloj de JS se va varios milisegundos y eso, en audio, se oye.

import { mulberry32 } from '../core/prng.js'

const MASTER = 0.5
const MAX_VOCES = 2 // dos a la vez; una tercera corta a la más vieja
// Las envolventes son EXPONENCIALES (setTargetAtTime), no rectas. Una rampa lineal a una
// meseta plana y otra recta de vuelta es lo que hace que una sílaba suene a órgano de
// juguete: nada en una garganta se mueve en línea recta. Son constantes de tiempo: se
// llega al 95 % en 3τ, así que 3,5 ms de ataque son ~10 ms reales y 16 de caída, ~50.
const TAU_AT = 0.0035
// La caída tiene que caber en el hueco entre sílabas. Con τ = 16 ms tardaba ~50 ms en
// apagarse y los huecos duran 33–75: la frase se convertía en un zumbido continuo — medido,
// el silencio pasó del 31–39 % (v1) al 4–7 %. Un tono sostenido con un filtro barriendo es
// exactamente lo que se oye como robot, así que la caída vuelve a ser rápida sin dejar de
// ser curva: 6 ms de constante son ~18 ms de apagado, muy lejos todavía de un click.
const TAU_DE = 0.006
// El CIERRE de una plosiva: una /p/ no es un golpe, es un silencio y luego un golpe. Sin
// callar antes, la ráfaga se superpone a la vocal anterior y se oye como un chasquido
// encima de un zumbido.
const CIERRE = 0.05
// Lo que SUENA de cada sílaba; el resto es cierre. Es lo que separa una frase articulada de
// un continuo: con las sílabas tocándose, la frase es un zumbido con un filtro encima.
const SONANDO = 0.65
// Lo que se le deja a la última sílaba para apagarse antes de parar las fuentes. Cortar
// una cola exponencial a medias es, literalmente, un click.
const COLA = 0.12
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
// La Q baja de 12–14 a 4–8: con la resonancia tan estrecha, barrer los formantes de una
// sílaba a otra hacía surgir la amplitud de golpe a mitad de la vocal — medido, el mayor
// salto de envolvente caía 25 ms DENTRO de la sílaba, no en su ataque.
//
// `f3` es un tercer formante fijo, de garganta. No canta ninguna vocal: solo pone cuerpo,
// que es lo que separa una voz de dos filtros sonando a la vez.
const TIMBRES = {
  nasal: { f1: 0.9, f2: 0.85, q: 8, g2: 0.8, f3: 2500 },
  redondo: { f1: 1, f2: 0.95, q: 5, g2: 0.55, f3: 2600 },
  chillón: { f1: 1.15, f2: 1.3, q: 7, g2: 1, f3: 2900 },
}

const F_MIN = 300
const F_MAX = 2800

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * El pulso glotal como onda periódica: los armónicos caen como 1/n² en vez del 1/n de una
 * sierra, que es la diferencia entre un pliegue vocal cerrándose y un oscilador. Una
 * sierra tiene demasiada energía arriba y por eso zumba.
 */
let ondaCache = null
function ondaGlotal(ctx) {
  if (ondaCache && ondaCache.ctx === ctx) return ondaCache.onda
  const N = 40
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  for (let n = 1; n < N; n++) imag[n] = 1 / (n * n)
  const onda = ctx.createPeriodicWave(real, imag)
  ondaCache = { ctx, onda }
  return onda
}

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
    f3: t.f3,
  }
}

/**
 * La envolvente de una sílaba: ataque corto, meseta y caída.
 *
 * `desde` es el nivel al que arranca — lo usa la nasal, que empieza sonando bajito con el
 * formante grave y luego abre.
 */
function envSilaba(param, t0, dur, pico) {
  // Sin `setValueAtTime`: el valor de partida es DONDE ESTÉ. Fijarlo sería el escalón que
  // toda esta función existe para evitar — y encadenar setTargetAtTime sale gratis,
  // porque cada uno arranca de lo que dejó el anterior.
  param.setTargetAtTime(pico, Math.max(0, t0), TAU_AT)
  param.setTargetAtTime(0, Math.max(0, t0 + dur), TAU_DE)
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
  //
  // El ruido sale de `mulberry32`, no de `Math.random()`, por la misma razón que todo lo
  // demás en este proyecto: para que dos ejecuciones den lo mismo. Con `Math.random()`
  // cada motor tenía su propio ruido y la misma frase sonaba distinta cada vez que se
  // recargaba la página — inofensivo al oído, pero hacía imposible medir si un cambio
  // había mejorado algo o solo había cambiado el ruido.
  const ruido = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate)
  const datos = ruido.getChannelData(0)
  const rnd = mulberry32(0x5eed)
  for (let i = 0; i < datos.length; i++) datos[i] = rnd() * 2 - 1

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
      osc.setPeriodicWave(ondaGlotal(ctx))
      osc.connect(cuerpo)
      // La segunda es TRIANGULAR, no otra sierra: dos sierras suman armónicos agudos y lo
      // que sale es zumbido. Una triangular desafinada añade batido sin añadir brillo, que
      // es lo que se busca en `rough` — aspereza de garganta, no más filo.
      const osc2 = ctx.createOscillator()
      osc2.type = 'triangle'
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

      // JITTER de tono: ruido pasado por un filtro a 30 Hz, o sea un vaivén lento y sin
      // periodo. Una nota perfectamente afinada es lo más robótico que hay; ninguna voz
      // sostiene un tono exacto ni siquiera cuando lo intenta. El vibrato es un temblor
      // REGULAR y se oye como canto — esto es lo otro, y es lo que hace que suene vivo.
      const jitterSrc = ctx.createBufferSource()
      jitterSrc.buffer = ruido
      jitterSrc.loop = true
      const jitterLp = ctx.createBiquadFilter()
      jitterLp.type = 'lowpass'
      // 30 Hz era un vaivén tan lento que se oía como desafinar, no como voz. El jitter de
      // una garganta es de ciclo a ciclo: rápido y pequeño.
      jitterLp.frequency.value = 260
      const jitterG = ctx.createGain()
      jitterG.gain.value = 6 + v.rough * 10 // en cents
      jitterSrc.connect(jitterLp)
      jitterLp.connect(jitterG)
      jitterG.connect(osc.detune)
      jitterG.connect(osc2.detune)

      // --- formantes ----------------------------------------------------------
      const bp1 = ctx.createBiquadFilter()
      const bp2 = ctx.createBiquadFilter()
      const bp3 = ctx.createBiquadFilter()
      const gf2 = ctx.createGain()
      const gf3 = ctx.createGain()
      gf3.gain.value = 0.15
      for (const f of [bp1, bp2, bp3]) f.type = 'bandpass'
      bp3.Q.value = 6

      // Los tres formantes se suman y pasan por un paso bajo antes de salir. Ese filtro es
      // lo que quita el zumbido de sierra: por encima de 3,8 kHz una voz no tiene nada que
      // decir, y lo que había ahí era el diente de sierra asomando entre las resonancias.
      // Va SOLO en la voz: el siseo de las consonantes vive por encima de 3 kHz y pasarlo
      // por aquí lo dejaría mudo.
      const mezclaVoz = ctx.createGain()
      const lpVoz = ctx.createBiquadFilter()
      lpVoz.type = 'lowpass'
      lpVoz.frequency.value = 3800
      cuerpo.connect(bp1)
      cuerpo.connect(bp2)
      cuerpo.connect(bp3)
      bp1.connect(mezclaVoz)
      bp2.connect(gf2)
      gf2.connect(mezclaVoz)
      bp3.connect(gf3)
      gf3.connect(mezclaVoz)
      mezclaVoz.connect(lpVoz)
      lpVoz.connect(gain)

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

      bp3.frequency.value = formantes(0.5, v.timbre).f3

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
        // ...y siguen moviéndose HASTA EL FINAL. Que el barrido acabe a los 50 ms dejaba
        // el resto de la sílaba con el filtro clavado, o sea una nota de sintetizador con
        // vocal. La boca no se queda quieta mientras suena.
        const fFin = formantes(s.vowelEnd ?? s.vowel, v.timbre)
        desliza(bp1.frequency, fFin.f1, a + s.dur * 0.35, s.dur * 0.3)
        desliza(bp2.frequency, fFin.f2, a + s.dur * 0.35, s.dur * 0.3)

        // El tono sí puede saltar: la fase del oscilador sigue siendo continua, así que
        // un escalón de frecuencia no rompe la onda. Lo que no puede saltar es la
        // amplitud, y de eso se encarga la envolvente.
        const dip = s.onset === 'pop' ? 0.92 : 1
        for (const o of [osc, osc2]) {
          o.frequency.setValueAtTime(s.pitch * dip, a)
          if (dip !== 1) o.frequency.linearRampToValueAtTime(s.pitch, a + 0.03)
          o.frequency.exponentialRampToValueAtTime(s.pitchEnd, a + s.dur)
        }

        // La boca abierta suena más fuerte: `open` es amplitud además de dibujo. El nivel
        // bajó un 12 % respecto a la v1 para compensar el tercer formante y las colas
        // exponenciales, que rellenan los huecos entre sílabas y suben el RMS.
        const pico = 0.16 + 0.44 * s.open
        // La sílaba SUENA menos de lo que ocupa: el resto es cierre. Sin esto, forzar el
        // silencio antes de la siguiente no hacía nada — la caída ya llegaba a cero por su
        // cuenta (medido en su día: 0,09 de diferencia, o sea ninguna).
        const son = s.dur * SONANDO
        // Cerrar antes de una plosiva. Es lo que la hace plosiva: la presión se acumula
        // detrás de unos labios cerrados, y lo que se oye es la soltada.
        if (s.onset !== 'none') cuerpo.gain.setTargetAtTime(0, Math.max(0, a - CIERRE), 0.004)

        if (s.onset === 'nasal') {
          // 25 ms de zumbido con el primer formante muy grave antes de abrir: es la /m/.
          // Se recorta contra el final de la sílaba anterior para no montarse encima.
          const pre = Math.max(finPrevia, a - 0.025)
          desliza(bp1.frequency, 250, pre)
          desliza(bp1.frequency, f.f1, a + 0.01, GLIDE)
          // el zumbido nasal entra bajito y la vocal abre: dos objetivos encadenados
          cuerpo.gain.setTargetAtTime(pico * 0.28, Math.max(0, pre), TAU_AT)
          envSilaba(cuerpo.gain, a, son, pico)
        } else {
          envSilaba(cuerpo.gain, a, son, pico)
        }
        envSilaba(rutas.soplo.gain, a, son, v.breath * 0.5)

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

      // La cola exponencial de la última sílaba necesita sitio, y el corte final tiene que
      // ser un fundido: parar una fuente con señal distinta de cero es un click de manual.
      const fin = t0 + frase.dur + COLA
      gain.gain.setValueAtTime(1, fin - 0.02)
      gain.gain.linearRampToValueAtTime(0, fin)
      const fuentes = [osc, osc2, lfo, nz, jitterSrc]
      for (const s of fuentes) {
        s.start(Math.max(0, t0 - 0.05)) // arrancan antes, pero con todas las ganancias a 0
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
