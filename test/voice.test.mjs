// Tests de la VOZ. Aquí no suena nada y no hace falta: `phrase()` devuelve datos, y el
// ritmo y la melodía de una frase se comprueban leyendo números. Lo que no se puede
// testear así es si suena bien — eso es oído de Jorge, en `previews/voice.html`.
//
// Lo que sí se puede fijar por escrito:
//  · determinismo por (seed, k) — es la promesa: la frase 3 de un personaje es siempre
//    la misma frase 3, no dependa de cuántos clicks lleve encima.
//  · que las sílabas no se solapen ni se salgan de sus bandas: una `open` fuera de [0, 1]
//    no da error, da una boca torcida; un tono de 4 kHz no da error, da un pitido.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { makeRng } from '../src/core/prng.js'
import { makeCharacter, SALT } from '../src/core/character.js'
import * as voice from '../src/parts/voice.js'

/** El rng de la frase `k` de un personaje, tal y como lo compone el host. */
const rngDeFrase = (seed, k) => makeRng(seed).fork(SALT.voice).fork(k)
const frase = (seed, k) => voice.phrase(makeCharacter(seed).voice, rngDeFrase(seed, k))

const SEEDS = [0, 1, 7, 42, 0xabc123, 0xffffff]

describe('voice: la frase es determinista', () => {
  it('misma seed y misma k dan la misma frase', () => {
    for (const s of SEEDS) {
      assert.deepEqual(frase(s, 0), frase(s, 0), `la seed ${s} no es estable`)
      assert.deepEqual(frase(s, 5), frase(s, 5))
    }
  })

  it('otra k da otra frase', () => {
    // Si no, un personaje repetiría la misma frase toda la sesión.
    for (const s of SEEDS) {
      assert.notDeepEqual(frase(s, 0), frase(s, 1), `la seed ${s} dice siempre lo mismo`)
    }
  })

  it('dos personajes no dicen lo mismo', () => {
    const dichas = new Set(SEEDS.map((s) => JSON.stringify(frase(s, 0))))
    assert.equal(dichas.size, SEEDS.length)
  })

  it('pedir la frase no consume nada: el orden de los clicks da igual', () => {
    // El host pide `fork(k)`, no tira de una secuencia compartida. Pedir la 7 antes que
    // la 2 tiene que dar exactamente lo mismo que al revés.
    const enOrden = [0, 1, 2, 3].map((k) => frase(42, k))
    const desordenado = [3, 1, 0, 2].map((k) => frase(42, k))
    assert.deepEqual(desordenado, [enOrden[3], enOrden[1], enOrden[0], enOrden[2]])
  })
})

describe('voice: la frase está bien formada', () => {
  const TODAS = []
  for (const s of SEEDS) for (let k = 0; k < 8; k++) TODAS.push({ s, k, v: makeCharacter(s).voice, f: frase(s, k) })

  it('hay muestra suficiente', () => {
    assert.equal(TODAS.length, SEEDS.length * 8)
  })

  it('el número de sílabas es el que pide la voz', () => {
    for (const { v, f } of TODAS) assert.equal(f.syllables.length, Math.round(v.length))
  })

  it('las sílabas van en orden y no se solapan', () => {
    for (const { s, k, f } of TODAS) {
      let fin = 0
      for (const sy of f.syllables) {
        assert.ok(sy.t >= fin - 1e-9, `seed ${s}/k${k}: una sílaba pisa a la anterior`)
        assert.ok(sy.dur > 0, `seed ${s}/k${k}: sílaba de duración ${sy.dur}`)
        fin = sy.t + sy.dur
      }
    }
  })

  it('`open` está en [0, 1] y `vowel` también', () => {
    for (const { f } of TODAS) {
      for (const sy of f.syllables) {
        assert.ok(sy.open >= 0 && sy.open <= 1, `open = ${sy.open}`)
        assert.ok(sy.vowel >= 0 && sy.vowel <= 1, `vowel = ${sy.vowel}`)
      }
    }
  })

  it('el ataque es uno de los tres que entiende el sintetizador', () => {
    for (const { f } of TODAS) {
      for (const sy of f.syllables) {
        assert.ok(['none', 'noise', 'pop', 'nasal'].includes(sy.onset), `onset = ${sy.onset}`)
      }
    }
  })

  it('los tonos se quedan en el rango audible de una voz', () => {
    for (const { s, k, f } of TODAS) {
      for (const sy of f.syllables) {
        for (const hz of [sy.pitch, sy.pitchEnd]) {
          assert.ok(Number.isFinite(hz), `seed ${s}/k${k}: tono ${hz}`)
          assert.ok(hz >= 60 && hz <= 1200, `seed ${s}/k${k}: tono ${hz.toFixed(0)} Hz`)
        }
      }
    }
  })

  it('la duración total cuadra con velocidad y longitud', () => {
    // Es lo que hace que `rate` signifique algo: si la frase durase el doble de lo que
    // dicen sus sílabas por segundo, el slider mentiría.
    //
    // La banda es asimétrica y no por descuido: hacia arriba se pueden acumular el acento
    // (×1.5) y el arrastre de la queja (×2) en la MISMA sílaba, la última. Medido sobre
    // 1200 frases, el peor caso queda en 1,58.
    for (const { s, k, v, f } of TODAS) {
      const razon = f.dur / (v.length / v.rate)
      assert.ok(razon > 0.7 && razon < 1.7, `seed ${s}/k${k}: ${(razon * 100).toFixed(0)} % de lo esperado`)
    }
  })

  it('hay UNA sílaba acentuada por frase, y no es la primera', () => {
    // Una frase con todas las sílabas iguales no tiene ritmo, tiene pulso. Y empezar
    // acentuado suena a orden, no a comentario.
    for (const { s, k, f } of TODAS) {
      const acentos = f.syllables.filter((sy) => sy.acento)
      assert.equal(acentos.length, 1, `seed ${s}/k${k}: ${acentos.length} acentos`)
      if (f.syllables.length > 2) {
        assert.notEqual(f.syllables[0].acento, true, `seed ${s}/k${k}: acento en la primera`)
      }
    }
  })

  it('la acentuada dura más, abre más y se sale de la melodía', () => {
    // Se mide en conjunto y no frase a frase: con el arrastre de la queja, una última
    // sílaba sin acento puede durar más que la acentuada de su propia frase.
    let durAc = 0, durOtras = 0, nAc = 0, nOtras = 0
    let openAc = 0, openOtras = 0
    for (const { v, f } of TODAS) {
      const paso = 1 / v.rate
      for (const sy of f.syllables) {
        if (sy.acento) { durAc += sy.dur / paso; openAc += sy.open; nAc++ }
        else { durOtras += sy.dur / paso; openOtras += sy.open; nOtras++ }
      }
    }
    const mediaAc = durAc / nAc
    const mediaOtras = durOtras / nOtras
    assert.ok(mediaAc > mediaOtras * 1.25, `acentuada ${mediaAc.toFixed(2)} vs resto ${mediaOtras.toFixed(2)}`)
    assert.ok(openAc / nAc > openOtras / nOtras + 0.1, 'la acentuada no abre más la boca')
  })

  it('hay una pausa ANTES del acento', () => {
    // Un acento no es solo una sílaba más larga: es también el hueco que la anuncia.
    let hueco = 0, nHueco = 0, otros = 0, nOtros = 0
    for (const { v, f } of TODAS) {
      const paso = 1 / v.rate
      const i = f.syllables.findIndex((sy) => sy.acento)
      for (let j = 0; j < f.syllables.length - 1; j++) {
        const g = (f.syllables[j + 1].t - (f.syllables[j].t + f.syllables[j].dur)) / paso
        if (j === i - 1) { hueco += g; nHueco++ } else { otros += g; nOtros++ }
      }
    }
    assert.ok(nHueco > 20, 'no hay muestra suficiente de pausas antes del acento')
    assert.ok(hueco / nHueco > (otros / nOtros) * 1.3, `pausa ${(hueco/nHueco).toFixed(3)} vs ${(otros/nOtros).toFixed(3)}`)
  })

  it('la queja arrastra la última sílaba y la pregunta sube', () => {
    // Las tres curvas tienen que ser distinguibles por los números, o no lo serán por el
    // oído. Se comparan con la MISMA voz, cambiando solo el contorno.
    const base = { ...makeCharacter(42).voice, length: 6, pitchRange: 8 }
    const de = (contour) => voice.phrase({ ...base, contour }, makeRng(1))
    const ultima = (f) => f.syllables[f.syllables.length - 1]

    const afirma = de('afirma')
    const pregunta = de('pregunta')
    const queja = de('queja')

    assert.ok(ultima(queja).dur > ultima(afirma).dur * 1.6, 'la queja no arrastra')
    assert.ok(ultima(pregunta).pitchEnd > ultima(pregunta).pitch, 'la pregunta no sube al final')
    assert.ok(ultima(afirma).pitchEnd < ultima(afirma).pitch, 'la afirmación no baja al final')
    assert.ok(
      ultima(queja).pitchEnd / ultima(queja).pitch < ultima(afirma).pitchEnd / ultima(afirma).pitch,
      'la queja no cae más que la afirmación'
    )
  })

  it('el tono no da escalones entre sílabas', () => {
    // La melodía es una CURVA de frase, no una nota por sílaba. Con notas sueltas el tono
    // saltaba 2,4 semitonos de media al pasar de una a la siguiente, y una sucesión de
    // notas afinadas es lo que más suena a robot. Este número es el que no puede volver a
    // subir: si alguien devuelve el tono a las sílabas, aquí se ve.
    const st = (a, b) => Math.abs(12 * Math.log2(a / b))
    const saltos = []
    for (const { f } of TODAS) {
      for (let i = 0; i < f.syllables.length - 1; i++) {
        saltos.push(st(f.syllables[i + 1].pitch, f.syllables[i].pitchEnd))
      }
    }
    const medio = saltos.reduce((a, b) => a + b, 0) / saltos.length
    assert.ok(medio < 1.2, `el tono salta ${medio.toFixed(2)} st entre sílabas`)
  })

  it('la curva pasa por donde dice el contorno', () => {
    // La curva no puede haberse comido la puntuación de la frase: una pregunta sigue
    // acabando más arriba de donde empezó, y una afirmación más abajo.
    const base = { ...makeCharacter(42).voice, length: 6, pitchRange: 8 }
    const de = (contour) => voice.phrase({ ...base, contour }, makeRng(1))
    for (const [contour, sube] of [['pregunta', true], ['afirma', false]]) {
      const f = de(contour)
      const ini = f.syllables[0].pitch
      const fin = f.syllables[f.syllables.length - 1].pitchEnd
      assert.equal(fin > ini, sube, `${contour}: ${ini.toFixed(0)} → ${fin.toFixed(0)} Hz`)
    }
  })

  it('una voz de una sola sílaba no revienta', () => {
    const f = voice.phrase({ ...makeCharacter(7).voice, length: 1 }, makeRng(3))
    assert.equal(f.syllables.length, 1)
    assert.ok(f.dur > 0)
  })

  it('con recorrido melódico cero, solo se mueve el acento', () => {
    // `pitchRange` a cero apaga la melodía, pero NO el acento: son dos cosas. El acento
    // son 2 semitonos absolutos —una sílaba destacada existe también en una voz plana— y
    // la curva los reparte suavemente entre sus vecinas. Nada más puede moverse.
    const v = { ...makeCharacter(7).voice, pitchRange: 0 }
    const f = voice.phrase(v, makeRng(3))
    for (const sy of f.syllables) {
      for (const hz of [sy.pitch, sy.pitchEnd]) {
        const st = Math.abs(12 * Math.log2(hz / v.pitch))
        assert.ok(st <= 2.001, `sin recorrido, una sílaba se fue ${st.toFixed(2)} st`)
      }
    }
    const conAcento = f.syllables.find((sy) => sy.acento)
    assert.ok(conAcento.pitch > v.pitch, 'el acento no levanta el tono')
  })
})
