// Random determinista. Misma seed = misma secuencia, siempre.

/** mulberry32: PRNG de 32 bits, rápido y con distribución suficiente para dibujo. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Envuelve un mulberry32 con los helpers que usan los módulos.
 * Cada parte recibe uno de estos como `rng`.
 */
export function makeRng(seed) {
  const next = mulberry32(seed)

  const rng = {
    seed,
    /** float en [0,1) */
    next,
    /** float en [min,max) */
    range: (min, max) => min + next() * (max - min),
    /** entero en [min,max] inclusive */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** true con probabilidad p */
    chance: (p) => next() < p,
    /** un elemento del array */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /**
     * Elige de un mapa {valor: peso}. Para distribuciones sesgadas
     * (p.ej. el cigarrillo, que es firma de estilo y debe salir a menudo).
     */
    weighted: (weights) => {
      const entries = Object.entries(weights)
      const total = entries.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [value, w] of entries) {
        r -= w
        if (r <= 0) return value
      }
      return entries[entries.length - 1][0]
    },
    /** derivado independiente, para que una parte no desplace la secuencia de otra */
    fork: (salt = 0) => makeRng((seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0),
  }

  return rng
}

/** Seed aleatoria legible, para mostrarla bajo cada personaje. */
export function randomSeed() {
  return Math.floor(Math.random() * 0xffffff)
}
