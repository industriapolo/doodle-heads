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
//
// La banda declarada no es solo el valor inicial: es el PUNTO DE REFERENCIA. Todo lo que
// guarda el panel (localStorage, «copiar rangos», las configuraciones) es el diff contra
// ella — ver `touchedBands`.

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

/**
 * Las entradas de `bands` que DIFIEREN de la banda declarada. El resto se descarta.
 *
 * Es la pieza que separa «el panel no lo ha tocado» de «el panel lo ha dirigido», y de
 * ella cuelgan tres cosas que tienen que decir lo mismo o el generador miente: lo que el
 * panel persiste, lo que exporta «copiar rangos», y lo que en `character.js` pisa al
 * arquetipo. Por eso hay UNA función y no tres comparaciones parecidas: la vieja era un
 * `JSON.stringify` exacto dentro de `character.js`, y bastaba un `p + 1e-8` para que una
 * banda de fábrica se hiciera pasar por dirección de arte y borrara el arquetipo en
 * silencio.
 *
 * La tolerancia numérica es MEDIO PASO de slider porque el navegador cuadricula el valor
 * del `input[type=range]` al grid de `step` al asignarlo: una banda declarada que no cae
 * en el grid vuelve del panel movida, sin que nadie la haya tocado, y como mucho por medio
 * paso. Por debajo de eso la diferencia no puede venir de una mano.
 *
 * Las claves que ya no existen en PARAMS se descartan: son restos de un `localStorage`
 * viejo, y colarlas en el sorteo es ruido que nadie puede ver ni corregir desde el panel.
 */
export function touchedBands(PARAMS, bands) {
  const out = {}
  if (!PARAMS || !bands) return out
  for (const [name, def] of Object.entries(PARAMS)) {
    const b = bands[name]
    if (b === undefined || b === null) continue
    if (differs(def, b)) out[name] = b
  }
  return out
}

// El `+ EPS` no es holgura, es ruido de coma flotante: hay bandas declaradas que caen
// EXACTAMENTE en medio paso del grid (`hair.fringeShadow` 0.015 con paso 0.002), y en
// binario ese medio paso sale un pelo por encima de `step / 2`. Sin el epsilon esas filas
// nacerían marcadas como tocadas nada más abrir el panel.
const EPS = 1e-9
const SIN_STEP = 1e-6 // paso supuesto cuando el parámetro no declara ninguno

function differs(def, b) {
  if (def.options) {
    if (typeof b !== 'object' || Array.isArray(b)) return true
    const pool = def.pool || uniformPool(def.options)
    // Se compara la UNIÓN de claves, no solo las opciones vivas: un peso guardado para
    // una opción que el módulo ya no declara sigue pesando en `sample`, así que cuenta
    // como toque. Ausente y 0 son lo mismo — `sample` filtra los pesos que no son > 0.
    for (const k of new Set([...Object.keys(pool), ...Object.keys(b)])) {
      if ((b[k] ?? 0) !== (pool[k] ?? 0)) return true
    }
    return false
  }
  if (def.type === 'bool') {
    if (typeof b?.p !== 'number') return true
    return Math.abs(b.p - (def.p ?? 0.5)) > SIN_STEP
  }
  if (!Array.isArray(b) || b.length < 2) return true
  const [lo, hi] = def.range || [def.min, def.max]
  const tol = (def.step ?? SIN_STEP) / 2 + EPS
  return Math.abs(b[0] - lo) > tol || Math.abs(b[1] - hi) > tol
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

/**
 * Serializa las bandas como código pegable, para fijar la dirección de arte en el repo.
 * Los parámetros que `bands` no trae se saltan: así se le puede pasar directamente el
 * resultado de `touchedBands` y sale solo lo dirigido.
 */
export function exportBands(PARAMS, bands) {
  const lines = []
  for (const [name, def] of Object.entries(PARAMS)) {
    const b = bands[name]
    if (b === undefined || b === null) continue
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
