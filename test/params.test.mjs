// Tests de `touchedBands` — la función que decide qué banda está DIRIGIDA y cuál está de
// fábrica. Es la pieza de la que cuelgan el panel (qué persiste, qué exporta) y
// `character.js` (qué pisa al arquetipo), así que se prueba sola y aparte.
//
// Lo que se está comprando aquí: que una banda que nadie ha movido no pueda hacerse pasar
// por dirección de arte. La versión vieja comparaba con `JSON.stringify` exacto y un
// `p + 1e-8` bastaba para borrar el arquetipo sin un solo error a la vista.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { bandsOf, touchedBands, exportBands, sample } from '../src/core/params.js'
import { makeRng } from '../src/core/prng.js'

const AQUI = import.meta.dirname

// PARAMS de juguete: cubre los tres tipos y deja los números a la vista.
const PARAMS = {
  ancho: { min: 0, max: 1, range: [0.2, 0.8], step: 0.01, label: 'Ancho' },
  tipo: { options: ['line', 'stitch'], pool: { line: 3, stitch: 2 }, label: 'Tipo' },
  cigarrillo: { type: 'bool', p: 0.45, label: 'Cigarrillo' },
}

describe('touchedBands', () => {
  it('las bandas declaradas no están tocadas', () => {
    assert.deepEqual(touchedBands(PARAMS, bandsOf(PARAMS)), {})
  })

  it('sin bandas, o con un objeto vacío, no hay nada tocado', () => {
    assert.deepEqual(touchedBands(PARAMS, undefined), {})
    assert.deepEqual(touchedBands(PARAMS, null), {})
    assert.deepEqual(touchedBands(PARAMS, {}), {})
  })

  it('un cambio deja pasar SOLO esa clave', () => {
    const bands = bandsOf(PARAMS)
    bands.ancho = [0.3, 0.8]
    assert.deepEqual(touchedBands(PARAMS, bands), { ancho: [0.3, 0.8] })
  })

  it('numérico: por debajo de medio paso no es un toque, por encima sí', () => {
    // Medio paso es lo más que puede moverse una banda sin que la haya movido una mano:
    // es lo que cuadricula el navegador al asignar un valor a un `input[type=range]`. El
    // panel ya no escribe ese valor cuadriculado —al construirse solo pinta— así que hoy
    // esto es cinturón además de tirantes: cubre las bandas que llegan por otros caminos,
    // como una config escrita a mano o un almacén viejo.
    const casi = bandsOf(PARAMS)
    casi.ancho = [0.2 + 0.004, 0.8 - 0.004] // paso 0.01 → medio paso 0.005
    assert.deepEqual(touchedBands(PARAMS, casi), {})

    const roce = bandsOf(PARAMS)
    roce.ancho = [0.2 + 1e-8, 0.8]
    assert.deepEqual(touchedBands(PARAMS, roce), {}, 'el roce de 1e-8 era LA trampa')

    const movido = bandsOf(PARAMS)
    movido.ancho = [0.2 + 0.006, 0.8]
    assert.deepEqual(touchedBands(PARAMS, movido), { ancho: movido.ancho })
  })

  it('numérico: cada tirador cuenta por su lado', () => {
    const soloHi = bandsOf(PARAMS)
    soloHi.ancho = [0.2, 0.5]
    assert.deepEqual(Object.keys(touchedBands(PARAMS, soloHi)), ['ancho'])
  })

  it('booleano: 1e-8 no es un toque; un cambio de verdad sí', () => {
    const roce = bandsOf(PARAMS)
    roce.cigarrillo = { p: 0.45 + 1e-8 }
    assert.deepEqual(touchedBands(PARAMS, roce), {})

    const movido = bandsOf(PARAMS)
    movido.cigarrillo = { p: 0.5 }
    assert.deepEqual(touchedBands(PARAMS, movido), { cigarrillo: { p: 0.5 } })
  })

  it('lista: cualquier peso distinto cuenta, y se compara exacto', () => {
    const igual = bandsOf(PARAMS)
    assert.deepEqual(touchedBands(PARAMS, igual), {})

    const apagada = bandsOf(PARAMS)
    apagada.tipo = { line: 3, stitch: 0 }
    assert.deepEqual(touchedBands(PARAMS, apagada), { tipo: { line: 3, stitch: 0 } })

    const roce = bandsOf(PARAMS)
    roce.tipo = { line: 3.0000001, stitch: 2 }
    assert.deepEqual(
      Object.keys(touchedBands(PARAMS, roce)),
      ['tipo'],
      'en los pesos no hay tolerancia: el panel escribe enteros, no arrastra el slider'
    )
  })

  it('lista: falta una clave o sobra una obsoleta', () => {
    // Ausente y peso 0 son lo mismo — `sample` filtra los pesos que no son > 0.
    const sinCero = { ...bandsOf(PARAMS), tipo: { line: 3, stitch: 2, extra: 0 } }
    assert.deepEqual(touchedBands(PARAMS, sinCero), {})

    // Pero una opción muerta con peso sigue saliendo sorteada, así que cuenta como toque.
    const zombi = { ...bandsOf(PARAMS), tipo: { line: 3, stitch: 2, zigzag: 4 } }
    assert.deepEqual(Object.keys(touchedBands(PARAMS, zombi)), ['tipo'])
  })

  it('las claves que ya no existen en PARAMS se descartan', () => {
    // El caso de un `localStorage` de hace tres versiones. Colarlas en el sorteo es ruido
    // que no se puede ni ver ni corregir desde el panel.
    const viejo = { ...bandsOf(PARAMS), parametroBorrado: [1, 2], otro: { p: 0.9 } }
    assert.deepEqual(touchedBands(PARAMS, viejo), {})
  })

  it('una banda con la forma cambiada cuenta como toque, no revienta', () => {
    // No debería pasar nunca; si pasa, mejor que la mande el panel a que tire la página.
    assert.deepEqual(Object.keys(touchedBands(PARAMS, { ancho: 0.5 })), ['ancho'])
    assert.deepEqual(Object.keys(touchedBands(PARAMS, { cigarrillo: [0, 1] })), ['cigarrillo'])
    assert.deepEqual(Object.keys(touchedBands(PARAMS, { tipo: [1, 2] })), ['tipo'])
  })

  it('un parámetro sin `step` usa 1e-6 como paso', () => {
    const P = { x: { min: 0, max: 10, range: [1, 2] } }
    assert.deepEqual(touchedBands(P, { x: [1 + 1e-9, 2] }), {})
    assert.deepEqual(Object.keys(touchedBands(P, { x: [1.001, 2] })), ['x'])
  })
})

// ---------------------------------------------------------------------------

// El import dinámico va fuera del `describe` porque su callback es síncrono: dentro, el
// `await` ni siquiera compila.
const MODULOS = []
for (const f of readdirSync(join(AQUI, '../src/parts')).sort()) {
  if (f.endsWith('.js')) MODULOS.push([`parts/${f}`, await import(`../src/parts/${f}`)])
}
MODULOS.push(['style/palettes.js', await import('../src/style/palettes.js')])
MODULOS.push(['core/archetypes.js', await import('../src/core/archetypes.js')])

describe('touchedBands sobre los módulos reales', () => {
  // El test de juguete de arriba prueba la regla; este prueba que la regla case con las
  // bandas que hay escritas de verdad. Un módulo con un `range` fuera del grid de su
  // `step` nacería marcado como tocado nada más abrir el panel.
  for (const [nombre, mod] of MODULOS) {
    it(`${nombre}: sus propias bandas no están tocadas`, () => {
      assert.deepEqual(touchedBands(mod.PARAMS, bandsOf(mod.PARAMS)), {})
    })

    it(`${nombre}: un paso de slider SÍ es un toque`, () => {
      // La otra mitad del contrato: la tolerancia de medio paso no puede tragarse un
      // movimiento de verdad. Mover un tirador un paso tiene que verse en todos los
      // parámetros, incluidos los de paso más fino.
      for (const [name, def] of Object.entries(mod.PARAMS)) {
        const b = bandsOf(mod.PARAMS)[name]
        if (!Array.isArray(b)) continue
        // se mueve hacia donde haya sitio: hay bandas que arrancan pegadas a su tope
        const cabeArriba = b[0] + def.step <= def.max
        const movida = { [name]: [b[0] + (cabeArriba ? def.step : -def.step), b[1]] }
        assert.ok(
          name in touchedBands(mod.PARAMS, movida),
          `${name}: un paso entero (${def.step}) no se detecta como toque`
        )
      }
    })
  }
})

// ---------------------------------------------------------------------------

describe('exportBands con solo lo tocado', () => {
  it('se salta lo que no viene, así que traga el diff tal cual', () => {
    const code = exportBands(PARAMS, { ancho: [0.3, 0.8] })
    assert.equal(code, '  ancho: { range: [0.3, 0.8] },')
  })

  it('un diff vacío no exporta nada', () => {
    assert.equal(exportBands(PARAMS, {}), '')
  })
})

describe('sample con un diff parcial', () => {
  it('lo que el diff no trae se sortea de la banda declarada', () => {
    // Es la otra mitad del contrato: si `sample` no cayera de vuelta en lo declarado,
    // persistir solo el diff dejaría medio personaje sin bandas.
    const completo = sample(PARAMS, makeRng(7), bandsOf(PARAMS))
    const conDiff = sample(PARAMS, makeRng(7), {})
    assert.deepEqual(conDiff, completo)
  })
})
