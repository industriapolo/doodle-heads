// Tests del rig. Cubren los TIEMPOS, no el dibujo: `advance` es una función pura del
// estado del actor y de un instante, así que el bucle entero se puede simular sin
// canvas y sin requestAnimationFrame de verdad.
//
// El rAF se sustituye por una cola que el test hace avanzar a mano. Eso es lo que
// permite mentirle al rig sobre el reloj del navegador — que es exactamente el caso que
// rompía el hallazgo 5 de la auditoría.

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { makeActor, advance, startRig, overridesFor, react, MOOD_NAMES } from '../src/anim/rig.js'

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

describe('react', () => {
  const enNeutro = (a) => Object.values(a.mood).every((v) => v === 0)
  /** Corre la animación hasta `hasta`, sin objetivo de mirada. */
  const hasta = (a, desde, fin) => { for (let t = desde; t <= fin; t += 16) advance(a, t) }

  it('los nombres del mapa del host existen', () => {
    // Si un ánimo se renombra, esto se pone rojo aquí y no en silencio en el index.
    for (const n of ['atención', 'sorpresa', 'alegría', 'neutro']) {
      assert.ok(MOOD_NAMES.includes(n), `'${n}' ya no es un ánimo`)
    }
  })

  it('arranca la excursión en el acto, sin esperar al reloj', () => {
    const a = makeActor(5)
    advance(a, 0)
    assert.ok(enNeutro(a))
    assert.equal(react(a, 'sorpresa', 1000), true)
    assert.equal(a.moodAt, 1000)
    hasta(a, 1016, 1000 + 800) // MOOD_EASE = 700
    assert.ok(!enNeutro(a), 'la cara no se movió')
    // sorpresa = cejas arriba (lift negativo) y boca abierta
    assert.ok(a.mood.lift < 0, `lift=${a.mood.lift}`)
    assert.ok(a.mood.open > 0.3, `open=${a.mood.open}`)
  })

  it("'neutro' devuelve la cara a reposo", () => {
    const a = makeActor(5)
    advance(a, 0)
    react(a, 'alegría', 1000)
    hasta(a, 1016, 1800)
    assert.ok(!enNeutro(a))
    react(a, 'neutro', 1800)
    hasta(a, 1816, 2600)
    assert.ok(enNeutro(a), `se quedó en ${JSON.stringify(a.mood)}`)
  })

  it('reaccionar a mitad de otro gesto no da un salto', () => {
    // Es el caso real: entrar, salir y volver a entrar en una celda más rápido que los
    // 700 ms de la transición.
    const a = makeActor(5)
    advance(a, 0)
    react(a, 'enfado', 1000)
    hasta(a, 1016, 1300) // a mitad de camino
    const medio = { ...a.mood }
    react(a, 'alegría', 1300)
    advance(a, 1316)
    for (const k of Object.keys(medio)) {
      const d = Math.abs(a.mood[k] - medio[k])
      assert.ok(d < 0.08, `el canal ${k} saltó ${d.toFixed(3)} al cambiar de ánimo`)
    }
  })

  it('tras reaccionar, el personaje vuelve solo al neutro', () => {
    // Una reacción no puede dejarlo anclado en una mueca: el reloj de ánimo tiene que
    // seguir corriendo y devolverlo a reposo por su cuenta.
    const a = makeActor(5)
    advance(a, 0)
    react(a, 'susto', 1000)
    hasta(a, 1016, 1800)
    assert.ok(!enNeutro(a))
    // No se le exige estar en reposo en un instante cualquiera —el personaje sigue
    // haciendo sus propias excursiones, que es lo que se quiere— sino PASAR por él.
    let volvio = false
    for (let t = 1816; t <= 60000 && !volvio; t += 16) {
      advance(a, t)
      if (enNeutro(a)) volvio = true
    }
    assert.ok(volvio, 'se quedó anclado en la mueca de la reacción')
  })

  it('un nombre que no existe no toca nada', () => {
    const a = makeActor(5)
    advance(a, 0)
    react(a, 'alegría', 1000)
    hasta(a, 1016, 1800)
    const antes = { ...a.mood, moodAt: a.moodAt }
    assert.equal(react(a, 'euforia', 1800), false)
    assert.deepEqual({ ...a.mood, moodAt: a.moodAt }, antes)
  })

  it('sin `t`, usa el último instante que vio el actor', () => {
    // El host tiene rig.now(), pero desde consola es cómodo no pasarlo.
    const a = makeActor(5)
    advance(a, 4321)
    react(a, 'duda')
    assert.equal(a.moodAt, 4321)
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
