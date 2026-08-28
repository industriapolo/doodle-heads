// Los rangos de sorteo son DATOS, no código.
//
// Antes cada módulo llevaba su `randomize()` con las bandas escritas a mano dentro. Eso
// impedía que la UI las leyera o las editara. Ahora cada parámetro declara su banda en
// PARAMS y el sorteo es una función compartida — así dirigir el generador es mover una
// banda, no editar un fichero.
//
// Forma de un PARAMS:
//   numérico   { min, max, range: [lo, hi], step, label, unit, int? }
//   de lista   { options: [...], pool: { opción: peso } }
//   booleano   { type: 'bool', p: 0.45 }   ← p = probabilidad, no un sí/no fijo
//
// `min`/`max` son los topes duros del slider; `range` es la banda de la que se sortea.

/** Banda de sorteo declarada por cada parámetro. Es lo que la UI edita. */
export function bandsOf(PARAMS) {
  if (!PARAMS || typeof PARAMS !== 'object') {
    throw new TypeError(
      'bandsOf() recibió ' + PARAMS + '. Suele ser un PARAMS que el módulo ya no exporta ' +
      '(o un módulo viejo en la caché del navegador).'
    )
  }
  const bands = {}
  for (const [name, def] of Object.entries(PARAMS)) {
    if (def.options) bands[name] = { ...(def.pool || uniformPool(def.options)) }
    else if (def.type === 'bool') bands[name] = { p: def.p ?? 0.5 }
    else bands[name] = [...(def.range || [def.min, def.max])]
  }
  return bands
}

/** Sortea un juego de parámetros. `bands` sobreescribe las bandas declaradas. */
export function sample(PARAMS, rng, bands = {}) {
  const out = {}
  for (const [name, def] of Object.entries(PARAMS)) {
    if (def.options) {
      const pool = bands[name] || def.pool || uniformPool(def.options)
      const live = Object.fromEntries(Object.entries(pool).filter(([, w]) => w > 0))
      out[name] = rng.weighted(Object.keys(live).length ? live : uniformPool(def.options))
    } else if (def.type === 'bool') {
      out[name] = rng.chance(bands[name]?.p ?? def.p ?? 0.5)
    } else {
      const [lo, hi] = bands[name] || def.range || [def.min, def.max]
      out[name] = def.int ? rng.int(Math.round(lo), Math.round(hi)) : rng.range(lo, hi)
    }
  }
  return out
}

/** Crea el `randomize(rng)` de un módulo desde su PARAMS. */
export function randomizerFor(PARAMS) {
  return (rng, bands) => sample(PARAMS, rng, bands)
}

/** Serializa las bandas como código pegable, para fijar la dirección de arte en el repo. */
export function exportBands(PARAMS, bands) {
  const lines = []
  for (const [name, def] of Object.entries(PARAMS)) {
    const b = bands[name]
    if (def.options) {
      lines.push(`  ${key(name)}: { pool: ${JSON.stringify(b)} },`)
    } else if (def.type === 'bool') {
      lines.push(`  ${key(name)}: { p: ${round(b.p)} },`)
    } else {
      lines.push(`  ${key(name)}: { range: [${round(b[0])}, ${round(b[1])}] },`)
    }
  }
  return lines.join('\n')
}

const uniformPool = (options) => Object.fromEntries(options.map((o) => [o, 1]))
const round = (v) => +Number(v).toFixed(4)
const key = (n) => (/^[a-zA-Z_$][\w$]*$/.test(n) ? n : JSON.stringify(n))
