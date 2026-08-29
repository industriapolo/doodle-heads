// Tests del rig. Cubren los TIEMPOS, no el dibujo: `advance` es una función pura del
// estado del actor y de un instante, así que el bucle entero se puede simular sin
// canvas y sin requestAnimationFrame de verdad.
//
// El rAF se sustituye por una cola que el test hace avanzar a mano. Eso es lo que
// permite mentirle al rig sobre el reloj del navegador — que es exactamente el caso que
// rompía el hallazgo 5 de la auditoría.

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { makeActor, advance, startRig, overridesFor, react, lookAtAll, REACTION_NAMES } from '../src/anim/rig.js'

/** Cola de rAF gobernada por el test: `tick(t)` corre un frame en el instante `t`. */
function fakeRaf() {
  const pend = new Map()
  let id = 0
  const real = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame]
  globalThis.requestAnimationFrame = (cb) => {
    pend.set(++id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (i) => pend.delete(i)
  return {
    tick(t) {
      const ahora = [...pend.entries()]
      pend.clear()
      for (const [, cb] of ahora) cb(t)
    },
    pendientes: () => pend.size,
    restore() {
      ;[globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = real
    },
  }
}

const treinta = () => Array.from({ length: 30 }, (_, s) => makeActor(s))
const parpadeando = (actores) => actores.filter((a) => a.blinkAt !== null).length

// ---------------------------------------------------------------------------

describe('el reloj del rig es suyo, no el del navegador', () => {
  let raf
  beforeEach(() => { raf = fakeRaf() })
  afterEach(() => raf.restore())

  it('pausar y reanudar no manda a los 30 a parpadear a coro', () => {
    // HALLAZGO 5 de la auditoría. `makeActor` reparte los desfases iniciales en ms del
    // reloj de rAF; si el rig sigue ese reloj, una pausa larga deja TODAS las citas
    // (parpadeo, mirada, ánimo) en el pasado y en el primer frame tras reanudar los
    // treinta parpadean, miran y cambian de humor a la vez. Luego se vuelven a dispersar
    // solos, que es lo que hacía difícil verlo: parece un parpadeo colectivo y ya está.
    const actores = treinta()
    const rig = startRig(actores, () => {})

    for (let t = 16; t <= 5000; t += 16) raf.tick(t)
    const enPausa = { now: rig.now(), parpadeando: parpadeando(actores) }

    rig.pause()
    assert.equal(raf.pendientes(), 0, 'un rig en pausa no puede dejar frames pedidos')

    // 20 segundos de reloj de navegador con el rig parado: pestaña de fondo, o el botón
    // «pausar» mientras se mira otra cosa.
    rig.resume()
    raf.tick(25000)

    assert.ok(
      Math.abs(rig.now() - enPausa.now) < 50,
      `el reloj del rig saltó de ${enPausa.now.toFixed(0)} a ${rig.now().toFixed(0)} ms ` +
        `al reanudar: está siguiendo el reloj del navegador`
    )
    assert.ok(
      parpadeando(actores) <= 2,
      `${parpadeando(actores)} de 30 parpadean en el primer frame tras reanudar ` +
        `(antes de la pausa había ${enPausa.parpadeando})`
    )
  })

  it('el reloj arranca en cero aunque el navegador lleve horas encendido', () => {
    // rAF cuenta desde que cargó el documento. Si el rig se monta en una página que
    // lleva un rato abierta, su primer frame llega con un `t` grande y todas las citas
    // iniciales —que `makeActor` reparte entre 0 y unos segundos— nacen ya vencidas.
    const actores = treinta()
    const rig = startRig(actores, () => {})
    raf.tick(3_600_000)
    assert.equal(rig.now(), 0)
    assert.equal(parpadeando(actores), 0, 'los 30 arrancaron parpadeando a la vez')
  })

  it('el tiempo corre mientras no esté en pausa', () => {
    const actores = treinta()
    const rig = startRig(actores, () => {})
    raf.tick(1000)
    raf.tick(1500)
    assert.equal(rig.now(), 500)
    rig.pause()
    rig.resume()
    raf.tick(9000)
    raf.tick(9250)
    assert.equal(rig.now(), 750, 'la pausa no puede contar como tiempo de animación')
  })

  it('parar de verdad no deja frames pedidos y no se puede reanudar solo', () => {
    const rig = startRig(treinta(), () => {})
    raf.tick(16)
    rig.stop()
    assert.equal(raf.pendientes(), 0)
    raf.tick(32)
    assert.equal(raf.pendientes(), 0, 'un rig parado volvió a pedir frame')
  })

  it('redraw recibe el tiempo del RIG, que es el que ve el humo', () => {
    // `drawSmoke` y `a.smokeAt` se miden con el mismo reloj; si a redraw le llegara el
    // del navegador, la voluta daría un salto en cada reanudación.
    const vistos = []
    const rig = startRig(treinta(), (a, t) => vistos.push(t))
    raf.tick(4000)
    raf.tick(4016)
    assert.ok(vistos.length > 0, 'nadie repintó: el test no está midiendo nada')
    assert.ok(Math.max(...vistos) <= rig.now(), 'a redraw le llegó un tiempo del navegador')
  })
})

// ---------------------------------------------------------------------------

describe('mirada con objetivo externo', () => {
  const FRAME = 16
  /** Corre `ms` de animación en frames de 16, devolviendo la traza de la mirada. */
  const correr = (a, desde, ms, target) => {
    const traza = []
    for (let t = desde; t <= desde + ms; t += FRAME) {
      a.gazeTarget = target
      advance(a, t)
      traza.push({ t, x: a.gaze, y: a.gazeY })
    }
    return traza
  }

  it('con objetivo fijo, la mirada llega en menos de 400 ms', () => {
    // Desde el peor caso posible: cruzar el rango entero.
    const a = makeActor(3)
    advance(a, 0)
    a.gaze = -1
    a.gazeY = -1
    const traza = correr(a, FRAME, 400, { x: 1, y: 1 })
    const fin = traza[traza.length - 1]
    assert.ok(Math.abs(fin.x - 1) < 0.05, `pupilX se quedó en ${fin.x.toFixed(3)}`)
    assert.ok(Math.abs(fin.y - 1) < 0.05, `pupilY se quedó en ${fin.y.toFixed(3)}`)
  })

  it('persigue: se acerca siempre, nunca se pasa, y cada paso es menor que el anterior', () => {
    // Un exponencial recorta una fracción fija de lo que le queda, así que el primer paso
    // es el más grande (~0,25 cruzando el rango entero a 60fps) y a partir de ahí solo
    // decrece. Eso es lo que se lee como perseguir: sale rápido y frena al llegar.
    const a = makeActor(3)
    advance(a, 0)
    a.gaze = -1
    const traza = correr(a, FRAME, 600, { x: 1, y: 0 })
    let pasoPrevio = Infinity
    for (let i = 1; i < traza.length; i++) {
      const paso = traza[i].x - traza[i - 1].x
      assert.ok(paso >= -1e-9, `retrocedió en t=${traza[i].t}`)
      assert.ok(traza[i].x <= 1 + 1e-9, `se pasó del objetivo: ${traza[i].x}`)
      assert.ok(paso <= pasoPrevio + 1e-9, `aceleró en t=${traza[i].t}`)
      pasoPrevio = paso
    }
  })

  it('el objetivo se sigue mientras se mueve', () => {
    const a = makeActor(3)
    advance(a, 0)
    let t = FRAME
    for (const x of [0.8, -0.8, 0.3]) {
      for (let i = 0; i < 40; i++, t += FRAME) {
        a.gazeTarget = { x, y: 0 }
        advance(a, t)
      }
      assert.ok(Math.abs(a.gaze - x) < 0.05, `no alcanzó ${x}: ${a.gaze.toFixed(3)}`)
    }
  })

  it('soltar el objetivo no da un salto, y devuelve la vertical al centro', () => {
    const a = makeActor(3)
    advance(a, 0)
    const conObjetivo = correr(a, FRAME, 600, { x: 0.9, y: 0.9 })
    const antes = { x: a.gaze, y: a.gazeY }
    let t = conObjetivo[conObjetivo.length - 1].t

    // La costura: el primer frame SIN objetivo. La horizontal no puede moverse NADA —
    // el vagabundeo arranca desde donde esté y su cita queda reprogramada—, y la vertical
    // solo puede empezar a bajar, que es el mismo suavizado con el que subió.
    t += FRAME
    a.gazeTarget = null
    advance(a, t)
    assert.equal(a.gaze, antes.x, `pupilX saltó ${(a.gaze - antes.x).toFixed(4)} al soltar`)
    assert.ok(a.gazeY < antes.y && a.gazeY > antes.y - 0.2, `pupilY dio un tirón: ${antes.y} → ${a.gazeY}`)

    // y la vertical baja sola al centro, sin pasarse
    let previo = Math.abs(a.gazeY)
    for (; t <= 3000; t += FRAME) {
      a.gazeTarget = null
      advance(a, t)
      const ahora = Math.abs(a.gazeY)
      assert.ok(ahora <= previo + 1e-9, `la vertical se pasó de largo en t=${t}`)
      previo = ahora
    }
    assert.ok(Math.abs(a.gazeY) < 0.02, `la vertical se quedó en ${a.gazeY.toFixed(3)}`)
  })

  it('tras soltar, el vagabundeo vuelve a mover la mirada', () => {
    // Si al soltar quedara una cita vencida, la sacada saldría en el mismo frame; y si no
    // se reprogramara ninguna, el personaje se quedaría con la mirada congelada.
    const a = makeActor(3)
    advance(a, 0)
    correr(a, FRAME, 600, { x: 0.9, y: 0 })
    a.gazeTarget = null
    advance(a, 632)
    const alSoltar = a.gaze
    let movio = false
    for (let t = 648; t <= 20000; t += FRAME) {
      advance(a, t)
      if (Math.abs(a.gaze - alSoltar) > 0.05) { movio = true; break }
    }
    assert.ok(movio, 'la mirada se quedó congelada tras soltar el objetivo')
  })

  it('el objetivo se recorta a [-1, 1]', () => {
    const a = makeActor(3)
    advance(a, 0)
    correr(a, FRAME, 800, { x: 5, y: -9 })
    assert.ok(Math.abs(a.gaze - 1) < 0.05, `pupilX=${a.gaze}`)
    assert.ok(Math.abs(a.gazeY + 1) < 0.05, `pupilY=${a.gazeY}`)
  })

  it('overridesFor manda los dos canales de mirada', () => {
    const a = makeActor(3)
    advance(a, 0)
    correr(a, FRAME, 600, { x: -0.5, y: 0.4 })
    const ov = overridesFor(a)
    assert.equal(ov.eyes.pupilX, a.gaze)
    assert.equal(ov.eyes.pupilY, a.gazeY)
  })

  it('sin objetivo, el vagabundeo es el de siempre y la vertical no se mueve', () => {
    const a = makeActor(9)
    for (let t = 0; t <= 30000; t += FRAME) advance(a, t)
    assert.equal(a.gazeY, 0, 'algo movió la vertical sin que nadie se lo pidiera')
  })
})

// ---------------------------------------------------------------------------

describe('react: la envolvente', () => {
  const FRAME = 16
  /** Corre la animación hasta `fin` y devuelve el actor. */
  const hasta = (a, desde, fin) => { for (let t = desde; t <= fin; t += FRAME) advance(a, t) }
  /** Un actor con la deriva congelada: aquí se mide la REACCIÓN, no el ánimo de fondo. */
  const quieto = (seed = 5, mood = null) => {
    const a = makeActor(seed)
    advance(a, 0)
    a.moodNext = 1e9
    if (mood) a.mood = { ...a.mood, ...mood }
    return a
  }

  it('los nombres del mapa del host existen', () => {
    for (const n of ['atención', 'sorpresa', 'alegría', 'neutro']) {
      assert.ok(REACTION_NAMES.includes(n), `'${n}' ya no es una reacción`)
    }
  })

  it('al final del ataque la cara está en la amplitud de la reacción', () => {
    const a = quieto()
    react(a, 'sorpresa', 1000)
    hasta(a, 1000, 1000 + 120) // attack de sorpresa
    for (const k of ['tilt', 'lift', 'curve', 'open', 'eyeOpen']) {
      const d = Math.abs(a.expr[k] - a.reactTo[k])
      assert.ok(d < 0.02 * Math.max(1, Math.abs(a.reactTo[k])) + 0.02, `${k}: ${a.expr[k]} vs ${a.reactTo[k]}`)
    }
  })

  it('el ataque es rápido: a los 100 ms ya se ha dicho casi todo', () => {
    // Esto es lo que se estaba perdiendo. Con MOOD_EASE (700 ms) a los 100 ms la cara
    // llevaba un 4 % del recorrido y la reacción no se veía llegar.
    const a = quieto()
    react(a, 'sorpresa', 1000)
    hasta(a, 1000, 1100)
    assert.ok(a.reactE > 0.9, `a los 100 ms la envolvente va por ${a.reactE.toFixed(2)}`)
  })

  it('durante el sostenido se queda ahí', () => {
    const a = quieto()
    react(a, 'alegría', 1000)
    hasta(a, 1000, 1000 + 180 + 300)
    assert.ok(Math.abs(a.reactE - 1) < 1e-9, `envolvente ${a.reactE}`)
  })

  it('la suelta cae en el ÁNIMO QUE HABÍA, no en el neutro', () => {
    // El ánimo de fondo tiene que sobrevivir a la reacción: si la suelta fuera al neutro,
    // un click le borraría el humor al personaje.
    const fondo = { tilt: 9, lift: 0.008, curve: -0.4, open: 0, raise: 0 }
    const a = quieto(5, fondo)
    react(a, 'sorpresa', 1000)
    hasta(a, 1000, 1000 + 120 + 500 + 600 + 100)
    assert.equal(a.reactAt, null, 'la reacción no terminó')
    for (const k of Object.keys(fondo)) {
      assert.ok(Math.abs(a.expr[k] - fondo[k]) < 1e-9, `${k}: ${a.expr[k]} en vez de ${fondo[k]}`)
    }
    assert.equal(a.expr.eyeOpen, 1, 'el ojo no volvió a su apertura de reposo')
  })

  it('la atención aguanta hasta que la sueltan', () => {
    const a = quieto()
    react(a, 'atención', 1000)
    hasta(a, 1000, 20000)
    assert.ok(a.reactE === 1, 'la atención se soltó sola')
    react(a, 'neutro', 20000)
    hasta(a, 20016, 20000 + 400 + 50)
    assert.equal(a.reactAt, null)
    assert.equal(a.reactE, 0)
  })

  it('soltar a mitad del ataque no da un tirón hacia arriba', () => {
    // Un ratón que solo roza la celda: entra y sale antes de que acabe el ataque.
    const a = quieto()
    react(a, 'atención', 1000)
    hasta(a, 1000, 1060) // a mitad del ataque de 160 ms
    const eMedio = a.reactE
    assert.ok(eMedio > 0 && eMedio < 1, `envolvente a mitad: ${eMedio}`)
    react(a, 'neutro', 1060)
    let previo = eMedio
    for (let t = 1076; t <= 1500; t += FRAME) {
      advance(a, t)
      assert.ok(a.reactE <= previo + 1e-9, `la envolvente subió tras soltar (t=${t})`)
      previo = a.reactE
    }
  })

  it('reaccionar encima de otra reacción arranca justo donde estaba la cara', () => {
    // La costura es el instante del cambio, no el frame siguiente: el ataque es rápido a
    // propósito (un 35 % del recorrido en el primer frame) y medir ahí solo mediría eso.
    // Lo que no puede haber es un escalón EN el cambio.
    const a = quieto()
    react(a, 'atención', 1000)
    hasta(a, 1000, 1200)
    const antes = { ...a.expr }
    react(a, 'sorpresa', 1200)
    advance(a, 1200)
    assert.deepEqual(a.expr, antes, 'la cara se teletransportó al cambiar de reacción')

    // y de ahí en adelante va derecha al objetivo, sin retroceder ni pasarse
    let previo = a.expr.lift
    for (let t = 1216; t <= 1320; t += FRAME) {
      advance(a, t)
      assert.ok(a.expr.lift <= previo + 1e-9, `la ceja retrocedió en t=${t}`)
      assert.ok(a.expr.lift >= a.reactTo.lift - 1e-9, `se pasó del objetivo en t=${t}`)
      previo = a.expr.lift
    }
  })

  it('la deriva no arranca excursiones mientras hay reacción', () => {
    const a = makeActor(5)
    advance(a, 0)
    a.moodNext = 1200 // cita de deriva vencida DURANTE la reacción
    react(a, 'atención', 1000)
    hasta(a, 1000, 5000)
    assert.equal(a.moodAt, null, 'la deriva arrancó una excursión por debajo de la reacción')
    // y al soltar, el reloj se reprograma en vez de dispararse en el mismo frame
    react(a, 'neutro', 5000)
    hasta(a, 5016, 5000 + 400 + 32)
    assert.ok(a.moodNext > 5400, `moodNext quedó en ${a.moodNext}, o sea vencido`)
    assert.equal(a.moodAt, null, 'la deriva disparó justo al soltar')
  })

  it('el golpe de escala sube y vuelve, y la atención no lo tiene', () => {
    const a = quieto()
    react(a, 'sorpresa', 1000)
    let pico = 0
    for (let t = 1000; t <= 1400; t += FRAME) { advance(a, t); pico = Math.max(pico, a.bounce) }
    assert.ok(Math.abs(pico - 0.06) < 0.006, `pico de bounce ${pico.toFixed(4)}`)
    hasta(a, 1400, 1500)
    assert.equal(a.bounce, 0, 'el golpe no volvió a cero')

    const b = quieto()
    react(b, 'atención', 1000)
    let max = 0
    for (let t = 1000; t <= 2000; t += FRAME) { advance(b, t); max = Math.max(max, Math.abs(b.bounce)) }
    assert.equal(max, 0, 'la atención no puede dar un golpe de escala')
  })

  it('la alegría rebota: el golpe se pasa de vuelta y se asienta', () => {
    const a = quieto()
    react(a, 'alegría', 1000)
    let min = 0
    for (let t = 1000; t <= 1400; t += FRAME) { advance(a, t); min = Math.min(min, a.bounce) }
    assert.ok(min < -0.001, `no hay rebote: el mínimo fue ${min.toFixed(4)}`)
  })

  it('un nombre que no existe no toca nada', () => {
    const a = quieto()
    react(a, 'alegría', 1000)
    hasta(a, 1000, 1200)
    const antes = { expr: { ...a.expr }, reactAt: a.reactAt }
    assert.equal(react(a, 'euforia', 1200), false)
    assert.deepEqual({ expr: { ...a.expr }, reactAt: a.reactAt }, antes)
  })

  it('un instante anterior al arranque no extrapola', () => {
    // `advance` es una costura pública. Con un reloj que retrocede, la cúbica del ataque
    // se disparaba a −1e9 en `open` y mouth.js reventaba pidiendo una elipse de radio
    // negativo. El reloj del rig no retrocede; quien lo gobierne desde fuera puede.
    const a = quieto()
    react(a, 'sorpresa', 10000)
    advance(a, 0)
    for (const k of ['tilt', 'lift', 'curve', 'open', 'raise', 'eyeOpen', 'cigDrop']) {
      assert.ok(Number.isFinite(a.expr[k]), `${k} = ${a.expr[k]}`)
    }
    assert.ok(a.expr.open >= 0 && a.expr.open <= 1, `open = ${a.expr.open}`)
    assert.ok(a.reactE >= 0 && a.reactE <= 1, `envolvente = ${a.reactE}`)
  })

  it('sin `t`, usa el último instante que vio el actor', () => {
    const a = quieto()
    advance(a, 4321)
    react(a, 'sorpresa')
    assert.equal(a.reactAt, 4321)
  })

  it('overridesFor manda expr, no el ánimo de fondo', () => {
    const a = quieto(5, { tilt: 9 })
    react(a, 'sorpresa', 1000)
    hasta(a, 1000, 1120)
    const ov = overridesFor(a)
    assert.equal(ov.brows.moodTilt, a.expr.tilt)
    assert.equal(ov.eyes.eyeOpen, a.expr.eyeOpen)
    assert.notEqual(ov.brows.moodTilt, a.mood.tilt)
  })
})

// ---------------------------------------------------------------------------

describe('el coro', () => {
  // Rejilla 6×5 como la del index, con el paso elegido para que el radio de 700 recoja
  // exactamente a los ocho vecinos: ortogonal 400, diagonal 566, y dos celdas ya son 800.
  const COLS = 6
  const FILAS = 5
  const PASO = 400
  const rejilla = () => {
    const actores = []
    const centros = []
    for (let f = 0; f < FILAS; f++) {
      for (let c = 0; c < COLS; c++) {
        actores.push(makeActor(f * COLS + c))
        centros.push({ x: c * PASO, y: f * PASO })
      }
    }
    return { actores, centros }
  }
  const idx = (c, f) => f * COLS + c
  const vecinos = (c, f) => {
    const v = []
    for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !df) continue
      const x = c + dc, y = f + df
      if (x >= 0 && x < COLS && y >= 0 && y < FILAS) v.push(idx(x, y))
    }
    return v
  }

  it('miran los vecinos, y hacia el pulsado', () => {
    const { actores, centros } = rejilla()
    const pulsado = idx(2, 2)
    const n = lookAtAll(actores, centros, centros[pulsado], 1000, { except: pulsado, reach: 500, radius: 700 })

    const esperados = new Set(vecinos(2, 2))
    assert.equal(n, esperados.size, `miraron ${n} y se esperaban ${esperados.size}`)
    for (let i = 0; i < actores.length; i++) {
      const mira = actores[i].gazeTarget !== null
      assert.equal(mira, esperados.has(i), `el actor ${i} ${mira ? 'mira' : 'no mira'} y debería lo contrario`)
    }

    // y miran HACIA él: el de su izquierda tiene que girar a la derecha, y al revés
    assert.ok(actores[idx(1, 2)].gazeTarget.x > 0.5, 'el vecino de la izquierda no gira hacia él')
    assert.ok(actores[idx(3, 2)].gazeTarget.x < -0.5, 'el vecino de la derecha no gira hacia él')
    assert.ok(actores[idx(2, 1)].gazeTarget.y > 0.5, 'el de arriba no mira hacia abajo')
    assert.ok(actores[idx(2, 3)].gazeTarget.y < -0.5, 'el de abajo no mira hacia arriba')
  })

  it('el pulsado no se mira a sí mismo', () => {
    const { actores, centros } = rejilla()
    const pulsado = idx(2, 2)
    lookAtAll(actores, centros, centros[pulsado], 1000, { except: pulsado, reach: 500, radius: 700 })
    assert.equal(actores[pulsado].gazeTarget, null)
    assert.equal(actores[pulsado].gazeHold, null)
  })

  it('las esquinas lejanas ni se enteran', () => {
    const { actores, centros } = rejilla()
    const pulsado = idx(2, 2)
    lookAtAll(actores, centros, centros[pulsado], 1000, { except: pulsado, reach: 500, radius: 700 })
    for (const [c, f] of [[0, 0], [5, 0], [0, 4], [5, 4]]) {
      assert.equal(actores[idx(c, f)].gazeTarget, null, `la esquina (${c},${f}) se giró`)
    }
  })

  it('a los 900 ms se sueltan todos, solos', () => {
    const { actores, centros } = rejilla()
    const pulsado = idx(2, 2)
    lookAtAll(actores, centros, centros[pulsado], 1000, { except: pulsado, reach: 500, radius: 700 })
    for (const a of actores) advance(a, 1000)
    assert.ok(actores[idx(1, 2)].gazeTarget !== null, 'se soltó antes de tiempo')
    for (let t = 1016; t <= 1899; t += 16) for (const a of actores) advance(a, t)
    assert.ok(actores[idx(1, 2)].gazeTarget !== null, `se soltó a los ${1899 - 1000} ms`)
    for (const a of actores) advance(a, 1900)
    for (const a of actores) {
      assert.equal(a.gazeTarget, null, 'quedó alguien mirando tras el coro')
      assert.equal(a.gazeHold, null)
    }
  })

  it('mientras dura el coro, el host no puede pisarlo', () => {
    // El index reparte miradas en cada pointermove. Sin el candado, mover el ratón un
    // píxel borraría el coro entero antes de que se vea.
    const { actores, centros } = rejilla()
    lookAtAll(actores, centros, centros[idx(2, 2)], 1000, { except: idx(2, 2), reach: 500, radius: 700 })
    const conCandado = actores.filter((a) => a.gazeHold !== null).length
    assert.equal(conCandado, 8)
  })
})

// ---------------------------------------------------------------------------

describe('el doble parpadeo de la atención', () => {
  it('son dos, cortos y seguidos', () => {
    const a = makeActor(5)
    advance(a, 0)
    a.blinkFrom = 1e9 // sin parpadeo ambiental por medio: aquí se mide el doble
    react(a, 'atención', 1000)
    const arranques = []
    let previo = null
    for (let t = 1000; t <= 1600; t += 8) {
      advance(a, t)
      if (a.blinkAt !== null && a.blinkAt !== previo) arranques.push(a.blinkAt)
      previo = a.blinkAt
    }
    assert.equal(arranques.length, 2, `hubo ${arranques.length} parpadeos, no 2`)
    assert.equal(arranques[0], 1000)
    assert.equal(arranques[1] - arranques[0], 80 + 120, 'la separación no es la pedida')
  })

  it('no lo llevan las demás reacciones', () => {
    for (const n of ['sorpresa', 'alegría']) {
      const a = makeActor(5)
      advance(a, 0)
      a.blinkFrom = 1e9
      react(a, n, 1000)
      assert.equal(a.blinkAgainAt, null, `${n} disparó el doble parpadeo`)
    }
  })

  it('el parpadeo ambiental se reprograma como siempre', () => {
    // El doble no puede dejar al actor sin su ciclo: tras el segundo, la cita normal
    // vuelve a caer dentro de su banda de 2 a 7 segundos.
    const a = makeActor(5)
    advance(a, 0)
    a.blinkFrom = 1e9
    react(a, 'atención', 1000)
    for (let t = 1000; t <= 1400; t += 8) advance(a, t)
    assert.equal(a.blinkAgainAt, null, 'el doble no se cerró')
    assert.ok(a.blinkFrom > 1200 && a.blinkFrom < 1400 + 7000, `blinkFrom quedó en ${a.blinkFrom}`)
  })
})

// ---------------------------------------------------------------------------

describe('la boca sigue a la frase', () => {
  // Una frase de juguete: tres sílabas de 200 ms con 100 ms de silencio entre ellas.
  // Tiempos en SEGUNDOS, como los devuelve voice.js.
  const FRASE = {
    syllables: [
      { t: 0, dur: 0.2, open: 1, pitch: 200, pitchEnd: 200, onset: 'pop', vowel: 0.5 },
      { t: 0.3, dur: 0.2, open: 0.5, pitch: 200, pitchEnd: 200, onset: 'none', vowel: 0.5 },
      { t: 0.6, dur: 0.2, open: 0.8, pitch: 200, pitchEnd: 200, onset: 'noise', vowel: 0.5 },
    ],
    dur: 0.8,
  }
  const hablando = (seed = 5, t0 = 1000) => {
    const a = makeActor(seed)
    advance(a, 0)
    a.moodNext = 1e9
    a.speech = { t0, phrase: FRASE }
    return a
  }
  /** talkOpen en un instante dado (en ms del rig). */
  const en = (a, t) => { advance(a, t); return a.talkOpen }

  it('la boca se abre en cada sílaba y se cierra entre ellas', () => {
    const a = hablando()
    // en medio de cada sílaba, abierta; en los silencios, cerrada
    assert.ok(en(a, 1100) > 0.9, 'la primera sílaba no abre la boca')
    assert.equal(en(a, 1250), 0, 'la boca no se cierra entre sílabas')
    assert.ok(Math.abs(en(a, 1400) - 0.5) < 0.01, 'la segunda sílaba no respeta su `open`')
    assert.equal(en(a, 1550), 0)
    assert.ok(Math.abs(en(a, 1700) - 0.8) < 0.01)
  })

  it('al acabar la frase la boca vuelve a cero y se descuelga sola', () => {
    const a = hablando()
    for (let t = 1000; t <= 1799; t += 16) advance(a, t)
    assert.ok(a.speech !== null, 'se soltó antes de acabar')
    advance(a, 1800)
    assert.equal(a.talkOpen, 0)
    assert.equal(a.speech, null, 'el host tendría que limpiarlo a mano')
  })

  it('la boca abre y cierra DENTRO de la sílaba, no a saltos', () => {
    const a = hablando()
    const traza = []
    for (let t = 1000; t <= 1200; t += 8) traza.push(en(a, t))
    assert.ok(traza[0] < 0.2, 'empieza ya abierta del todo')
    assert.ok(Math.max(...traza) > 0.95, 'no llega a abrirse')
    assert.ok(traza[traza.length - 1] < 0.3, 'no acaba de cerrarse')
  })

  it('hablar no le cierra la boca a una reacción que ya la tenía abierta', () => {
    // Se mezcla por máximo: una sorpresa a media frase no puede quedar en un balbuceo.
    const a = hablando()
    react(a, 'sorpresa', 1000)
    advance(a, 1120) // ataque cumplido, y en el silencio de la primera sílaba... no
    const conReaccion = a.expr.open
    const b = hablando()
    react(b, 'sorpresa', 1000)
    advance(b, 1250) // silencio entre sílabas: talkOpen = 0
    assert.ok(b.expr.open > 0.3, `la reacción se perdió en el silencio: ${b.expr.open}`)
    assert.ok(conReaccion > 0.3)
  })

  it('el cigarrillo se descuelga durante toda la frase, silencios incluidos', () => {
    const a = hablando()
    advance(a, 1250) // entre sílabas
    assert.ok(a.expr.cigDrop > 0.9, `cigDrop = ${a.expr.cigDrop} en el silencio`)
    advance(a, 1810)
    assert.equal(a.expr.cigDrop, 0, 'el pitillo no vuelve a su sitio al acabar')
  })

  it('overridesFor no distingue de dónde viene la boca abierta', () => {
    const a = hablando()
    advance(a, 1100)
    assert.equal(overridesFor(a).mouth.moodOpen, a.expr.open)
    assert.ok(overridesFor(a).mouth.moodOpen > 0.9)
  })

  it('una frase en el pasado no deja la boca colgada', () => {
    const a = hablando(5, 100)
    advance(a, 5000)
    assert.equal(a.speech, null)
    assert.equal(a.talkOpen, 0)
  })
})

// ---------------------------------------------------------------------------

describe('advance', () => {
  it('es determinista: mismo actor, misma línea de tiempo, mismo estado', () => {
    const paso = (a) => { for (let t = 0; t <= 30000; t += 16) advance(a, t) }
    const a = makeActor(7)
    const b = makeActor(7)
    paso(a)
    paso(b)
    assert.deepEqual(overridesFor(a), overridesFor(b))
  })

  it('los canales se quedan dentro de sus topes', () => {
    for (let s = 0; s < 20; s++) {
      const a = makeActor(s)
      for (let t = 0; t <= 60000; t += 16) {
        advance(a, t)
        assert.ok(a.blink >= 0 && a.blink <= 1, `blink=${a.blink}`)
        assert.ok(Math.abs(a.gaze) <= 1, `gaze=${a.gaze}`)
      }
    }
  })
})
