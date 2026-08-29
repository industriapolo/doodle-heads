// Tests del generador. `node --test` desde la raíz — sin dependencias, sin bundler y sin
// package.json: Node detecta el módulo por la sintaxis y descubre este fichero solo.
//
// Se usa la forma sin argumentos a propósito: `node --test test/` funcionaba en Node 22 y
// en Node 25 ya no (el directorio como posicional se intenta cargar como módulo y revienta
// con MODULE_NOT_FOUND). `node --test` a secas va en todas y recoge los ficheros nuevos.
//
// `makeCharacter` corre en Node sin canvas porque nadie toca `document` en el cuerpo de
// un módulo (finish.js solo lo usa dentro de sus funciones). Eso es lo que hace que el
// SORTEO sea testeable sin navegador. El DIBUJO no lo es: para eso está la verificación
// geométrica por ray-casting en la consola de compose (ver HANDOFF-pelo.md).
//
// Qué cubre y por qué:
//  · determinismo — es la promesa del proyecto: una seed guardada tiene que seguir
//    dando la misma cara dentro de un año.
//  · contrato de PARAMS — un `range` fuera de sus topes o un `pool` con una clave que
//    no existe en `options` no da error: da un slider mentiroso o un peso que se ignora.
//  · arquetipo — lo que habría cazado el hallazgo 1 de la auditoría: rasgos sorteados
//    que luego no se dibujan.
//  · diff panel/arquetipo — que una banda de fábrica no pueda hacerse pasar por
//    dirección de arte y borrar el sesgo del arquetipo (hallazgo 2 de la auditoría).

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeCharacter } from '../src/core/character.js'
import { bandsOf } from '../src/core/params.js'
import * as hair from '../src/parts/hair.js'
import * as palettes from '../src/style/palettes.js'
import * as archetypes from '../src/core/archetypes.js'

const AQUI = import.meta.dirname
const N = 2000 // seeds por muestreo: suficiente para que un 1 % se vea, rápido de correr

/** Los 2000 personajes de fábrica, sorteados una vez y compartidos por los tests. */
const POBLACION = Array.from({ length: N }, (_, s) => makeCharacter(s))
const MUJERES = POBLACION.filter((c) => c.arquetipo === 'mujer')

// ---------------------------------------------------------------------------

describe('determinismo', () => {
  it('la misma seed da el mismo personaje', () => {
    for (const seed of [0, 1, 42, 0xabc123, 0xffffff]) {
      assert.equal(
        JSON.stringify(makeCharacter(seed)),
        JSON.stringify(makeCharacter(seed)),
        `la seed ${seed} no es estable entre dos llamadas`
      )
    }
  })

  it('makeCharacter(0xabc123) sigue dando el personaje de referencia', () => {
    // Fixture capturado ANTES del refactor de SALT (auditoría del 28 ago 2026), byte a
    // byte. Es el candado de las seeds guardadas: los salts de `rng.fork` son parte del
    // formato, así que tocar uno cambia esta cara — y todas las demás.
    //
    // Si este test se pone rojo y el cambio era a propósito, hay que decir en voz alta
    // que las seeds guardadas ya no valen. Regenerar el fixture sin más es tirar el
    // trabajo de dirección de arte de Jorge.
    //
    // Se ha regenerado UNA vez, al añadir `eyes.pupilY` (ago 2026), y solo tras comprobar
    // clave a clave que la única diferencia era la clave nueva con valor 0: ningún valor
    // existente se movió. Ese es el listón para volver a tocarlo. Se pudo porque el
    // parámetro se declaró AL FINAL de su PARAMS — el orden de declaración es el orden de
    // las tiradas del rng, así que en medio habría corrido todo lo que va detrás.
    const esperado = readFileSync(join(AQUI, 'fixtures/character-0xabc123.json'), 'utf8')
    const obtenido = JSON.stringify(makeCharacter(0xabc123), null, 2) + '\n'
    assert.equal(obtenido, esperado)
  })

  it('cada parte va por su carril: añadir un sorteo a una no mueve a las demás', () => {
    // Es lo que compran los `fork(SALT.x)`. Si esto falla, alguien pasó a consumir la
    // secuencia compartida y cualquier parámetro nuevo en una parte repintará a todos
    // los personajes guardados.
    const a = makeCharacter(7)
    const b = makeCharacter(7)
    assert.deepEqual(a.head, b.head)
    assert.notEqual(
      JSON.stringify(a.head),
      JSON.stringify(a.ears),
      'dos partes con el mismo resultado exacto huele a fork compartido'
    )
  })
})

// ---------------------------------------------------------------------------

// Se enumera el directorio en vez de listar los módulos a mano: una parte nueva entra en
// el test sola. Es justo el caso en el que a nadie se le ocurriría añadirla. El import
// dinámico va aquí arriba y no dentro del `describe` porque el callback es síncrono.
const MODULOS = []
for (const f of readdirSync(join(AQUI, '../src/parts')).sort()) {
  if (f.endsWith('.js')) MODULOS.push([`parts/${f}`, await import(`../src/parts/${f}`)])
}
MODULOS.push(['style/palettes.js', palettes])
MODULOS.push(['core/archetypes.js', archetypes])

describe('contrato de PARAMS', () => {
  it('todos los módulos esperados están en el barrido', () => {
    // Si un import silencioso se cae, el bucle de abajo pasaría en verde sobre nada.
    assert.ok(MODULOS.length >= 12, `solo ${MODULOS.length} módulos barridos`)
  })

  for (const [nombre, mod] of MODULOS) {
    describe(nombre, () => {
      it('exporta PARAMS', () => {
        assert.ok(mod.PARAMS, `${nombre} no exporta PARAMS`)
      })

      for (const [param, def] of Object.entries(mod.PARAMS || {})) {
        if (def.options) {
          it(`${param}: el pool solo pesa opciones que existen`, () => {
            for (const clave of Object.keys(def.pool || {})) {
              assert.ok(
                def.options.includes(clave),
                `pool tiene "${clave}", que no está en options [${def.options}] — ` +
                  `ese peso no se aplica a nada y no da ningún error`
              )
            }
          })
          it(`${param}: algún peso es mayor que cero`, () => {
            const pesos = Object.values(def.pool || { x: 1 })
            assert.ok(
              pesos.some((w) => w > 0),
              'con todos los pesos a 0 el sorteo cae al reparto uniforme de golpe'
            )
          })
        } else if (def.type === 'bool') {
          it(`${param}: la probabilidad está en [0, 1]`, () => {
            const p = def.p ?? 0.5
            assert.ok(p >= 0 && p <= 1, `p = ${p}`)
          })
        } else {
          it(`${param}: la banda cabe dentro de los topes del slider`, () => {
            const [lo, hi] = def.range || [def.min, def.max]
            assert.equal(typeof def.min, 'number', 'falta min')
            assert.equal(typeof def.max, 'number', 'falta max')
            assert.ok(lo <= hi, `range invertido: [${lo}, ${hi}]`)
            assert.ok(
              lo >= def.min && hi <= def.max,
              `range [${lo}, ${hi}] se sale de [${def.min}, ${def.max}] — el panel ` +
                `recortaría al mover el slider y el valor cambiaría solo con tocarlo`
            )
          })
        }
      }
    })
  }
})

// ---------------------------------------------------------------------------

describe(`arquetipo, con bandas de fábrica (${N} seeds)`, () => {
  it('hay muestra suficiente de los dos arquetipos', () => {
    assert.ok(MUJERES.length > 500, `solo ${MUJERES.length} mujeres en ${N} seeds`)
    assert.ok(POBLACION.length - MUJERES.length > 500, 'apenas hay clásicos')
  })

  it('ninguna mujer lleva barba', () => {
    const conBarba = MUJERES.filter((c) => c.hair.beardCoverage > 0.05)
    assert.equal(conBarba.length, 0, `seeds: ${conBarba.slice(0, 5).map((c) => c.seed)}`)
  })

  it('ninguna mujer sortea melena o moño invisibles', () => {
    // HALLAZGO 1 de la auditoría. `drawBack` y el moño exigen `mode: 'solid'`: sin corona
    // sólida se sortean y no se dibujan, sin error y sin hueco que lo delate. Este es el
    // test que lo habría cazado, y el que impide que vuelva.
    const invisibles = MUJERES.filter(
      (c) => (c.hair.backHair || c.hair.bun) && c.hair.mode !== 'solid'
    )
    assert.equal(
      invisibles.length,
      0,
      `${invisibles.length} mujeres con melena/moño invisible. Mira el pool de ` +
        `hair.mode en el overlay de mujer (archetypes.js): tiene que dejar solo solid.`
    )
  })

  it('los invisibles que quedan son todos clásicos — hueco conocido, sin arreglar', () => {
    // No es una fuga nueva: el clásico sortea melena (p 0.04) y moño (p 0.02) sobre un
    // pool de pelo que incluye radial y bald, así que a veces caen sobre una cabeza sin
    // corona sólida. Son ~2 % del total y NO se tocó en esta sesión: arreglarlo es mover
    // valores de sorteo del clásico, y eso es una decisión de dirección de arte.
    //
    // El test no lo bendice: lo fija por escrito y hace ruido si crece de sitio.
    const invisibles = POBLACION.filter(
      (c) => (c.hair.backHair || c.hair.bun) && c.hair.mode !== 'solid'
    )
    for (const c of invisibles) {
      assert.equal(
        c.arquetipo,
        'clasico',
        `seed ${c.seed}: un invisible que NO es clásico — eso sí es una regresión`
      )
    }
    console.log(
      `      · ${invisibles.length}/${N} invisibles residuales (clásico con melena/moño ` +
        `sobre pelo no sólido)`
    )
  })

  it('la mujer lleva melena la mayoría de las veces, y visible', () => {
    // El marcador principal del arquetipo. Sortearla al 85 % y dibujarla al 10 % era
    // exactamente el hallazgo 1; aquí sorteo y dibujo son ya la misma cifra.
    const conMelena = MUJERES.filter((c) => c.hair.backHair)
    const pct = (100 * conMelena.length) / MUJERES.length
    assert.ok(pct > 70, `solo el ${pct.toFixed(1)} % de las mujeres lleva melena`)
    assert.ok(
      conMelena.every((c) => c.hair.mode === 'solid'),
      'hay melena sorteada sobre pelo no sólido'
    )
  })
})

// ---------------------------------------------------------------------------

describe('diff panel / arquetipo', () => {
  // HALLAZGO 2 de la auditoría, ya cerrado. Lo que se prueba aquí es la regla que hace
  // respirar al arquetipo: una banda del panel solo lo pisa si DIFIERE de la declarada
  // por el módulo, con la tolerancia de `touchedBands`.
  //
  // Antes la comparación era un `JSON.stringify` exacto, y ese «solo si difiere» era una
  // trampa: sumar 1e-8 a una probabilidad — invisible en el panel, imposible de hacer a
  // propósito — devolvía la melena a la probabilidad de fábrica y borraba el sesgo del
  // arquetipo sin un solo error. Estos tests son los que impiden que vuelva.
  const melenaPct = (bands) => {
    let mujeres = 0
    let melena = 0
    for (let s = 0; s < N; s++) {
      const c = makeCharacter(s, bands)
      if (c.arquetipo !== 'mujer') continue
      mujeres++
      if (c.hair.backHair) melena++
    }
    return (100 * melena) / mujeres
  }

  const FABRICA = bandsOf(hair.PARAMS)
  const REFERENCIA = melenaPct(undefined) // sin bandas: el arquetipo manda, ~85 %

  it('pasar las bandas de fábrica es igual que no pasar nada (±3 puntos)', () => {
    const conFabrica = melenaPct({ hair: FABRICA })
    assert.ok(
      Math.abs(REFERENCIA - conFabrica) <= 3,
      `sin bandas ${REFERENCIA.toFixed(1)} % vs fábrica ${conFabrica.toFixed(1)} %`
    )
  })

  it('un roce de 1e-8 NO tumba el arquetipo: la melena sigue donde estaba', () => {
    // El caso exacto que medía la auditoría: 85 % → 10 % al sumar 1e-8. Hoy no se mueve.
    const rozado = { hair: { ...FABRICA, backHair: { p: FABRICA.backHair.p + 1e-8 } } }
    const pisado = melenaPct(rozado)
    assert.ok(
      Math.abs(REFERENCIA - pisado) <= 3,
      `el roce de 1e-8 movió la melena de ${REFERENCIA.toFixed(1)} % a ${pisado.toFixed(1)} %`
    )
    console.log(
      `      · melena en mujeres: ${REFERENCIA.toFixed(1)} % de fábrica, ` +
        `${pisado.toFixed(1)} % tras rozar el slider con 1e-8`
    )
  })

  it('medio paso de slider tampoco: es lo que cuadricula el navegador', () => {
    // `input.value = 0.015` con paso 0.002 vuelve como 0.016. Esa banda no la ha tocado
    // nadie, y antes contaba como dirección de arte igual que un tirón del slider.
    const medio = hair.PARAMS.sideLength.step / 2
    const [lo, hi] = FABRICA.sideLength
    const bands = { hair: { ...FABRICA, sideLength: [lo + medio, hi - medio] } }
    const pisado = melenaPct(bands)
    assert.ok(
      Math.abs(REFERENCIA - pisado) <= 3,
      `medio paso movió la melena de ${REFERENCIA.toFixed(1)} % a ${pisado.toFixed(1)} %`
    )
  })

  it('un cambio de verdad SÍ pisa al arquetipo', () => {
    // La otra mitad del contrato, y la razón de ser del diff: el panel manda. Con la
    // melena bajada a mano al 50 %, el 85 % del arquetipo tiene que caer.
    const dirigido = { hair: { ...FABRICA, backHair: { p: 0.5 } } }
    const pisado = melenaPct(dirigido)
    assert.ok(
      REFERENCIA - pisado > 20,
      `bajar backHair.p a 0.5 solo movió la melena de ${REFERENCIA.toFixed(1)} % ` +
        `a ${pisado.toFixed(1)} % — el panel dejó de mandar`
    )
  })

  it('una clave que ya no existe en el módulo no pisa nada', () => {
    // El `localStorage` de hace tres versiones. Antes entraba entera en el sorteo.
    const viejo = { hair: { ...FABRICA, parametroBorrado: [0, 1] } }
    assert.ok(Math.abs(REFERENCIA - melenaPct(viejo)) <= 3)
  })
})
