// Color. Ya no son cuatro esquemas cerrados: es una familia DERIVADA de unos pocos
// números en HSL, declarados como PARAMS igual que cualquier otra parte.
//
// Por qué HSL y no diez colores sueltos: con diez selectores planos, desplazar una piel
// hacia el naranja obliga a mover diez valores de forma coherente, y en cuanto uno se
// desincroniza la cara se cae. Derivando, el tono de piel es UN número — y como es un
// param con banda, abrirla da una piel distinta por cara sin código nuevo.
//
// Los cuatro esquemas de siempre siguen aquí, pero como PRESETS de parámetros: cargan
// valores en los sliders en vez de imponer colores.

import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  // --- piel --------------------------------------------------------------
  // El tono es CIRCULAR pero la banda interpola en linea recta: para cruzar el 0 hay que
  // poder pedir 330→400, no 330→40 — que baja por el 180 y se pasea por cianes y verdes.
  // De ahi el recorrido mas alla de 360; hsl() ya hace el modulo.
  skinHue: { min: 0, max: 420, range: [330, 330], step: 1, unit: '°', label: 'Tono de piel' },
  skinSat: { min: 0, max: 100, range: [64, 64], step: 1, unit: '%', label: 'Saturación de piel' },
  skinLight: { min: 25, max: 98, range: [87, 87], step: 1, unit: '%', label: 'Luz de piel' },

  // Las sombras son PASOS relativos, no colores absolutos: así una piel oscura no se
  // queda con las sombras aplastadas contra el negro.
  shadowStep: { min: 2, max: 24, range: [11.5, 11.5], step: 0.5, unit: '%', label: 'Paso de sombra' },
  shadowSat: { min: -30, max: 30, range: [-11.5, -11.5], step: 0.5, unit: '%', label: 'Saturación por paso' },

  // --- línea -------------------------------------------------------------
  // Es lo que sostiene el "misma mano", así que la luz lleva techo bajo: si se lava,
  // los 30 personajes dejan de parecer del mismo dibujante.
  lineLight: { min: 2, max: 34, range: [21, 21], step: 1, unit: '%', label: 'Luz de línea' },
  lineSat: { min: 0, max: 100, range: [68, 68], step: 1, unit: '%', label: 'Saturación de línea' },
  lineHueShift: { min: -60, max: 60, range: [-8, -8], step: 1, unit: '°', label: 'Desvío de tono de línea' },

  // --- acento ------------------------------------------------------------
  accentHue: { min: 0, max: 420, range: [329, 329], step: 1, unit: '°', label: 'Tono de acento' },
  accentSat: { min: 0, max: 100, range: [86, 86], step: 1, unit: '%', label: 'Saturación de acento' },
  accentLight: { min: 15, max: 80, range: [48, 48], step: 1, unit: '%', label: 'Luz de acento' },

  // --- comisura del ojo ---------------------------------------------------
  eyeCornerSat: { min: -20, max: 60, range: [6, 6], step: 1, unit: '%', label: 'Saturación de comisura' },
  eyeCornerLight: { min: -30, max: 10, range: [-5, -5], step: 1, unit: '%', label: 'Luz de comisura' },

  // --- fondo -------------------------------------------------------------
  // Con la banda cerrada el fondo es común a toda la rejilla. Abrirla convierte el grid
  // en mosaico: cada cara con el suyo. No hace falta nada más.
  bgHue: { min: 0, max: 420, range: [0, 0], step: 1, unit: '°', label: 'Tono de fondo' },
  bgSat: { min: 0, max: 100, range: [0, 0], step: 1, unit: '%', label: 'Saturación de fondo' },
  bgLight: { min: 0, max: 100, range: [100, 100], step: 1, unit: '%', label: 'Luz de fondo' },
}

export const randomize = randomizerFor(PARAMS)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)`

/** Construye los tokens de color a partir de los parámetros. */
export function buildPalette(p) {
  const h = p.skinHue
  const lineH = h + p.lineHueShift
  const line = hsl(lineH, p.lineSat, p.lineLight)

  return {
    bg: hsl(p.bgHue, p.bgSat, p.bgLight),
    skin: hsl(h, p.skinSat, p.skinLight),
    skinShadow: hsl(h, p.skinSat + p.shadowSat, p.skinLight - p.shadowStep),
    skinDeep: hsl(h, p.skinSat + p.shadowSat * 2, p.skinLight - p.shadowStep * 2),
    // más cromática que skinShadow y más clara, para que no la devore la sombra plana
    // lateral de la cara — que es skinShadow y se la tragaría
    eyeCorner: hsl(h, p.skinSat + p.eyeCornerSat, p.skinLight + p.eyeCornerLight),
    line,
    solid: hsl(lineH, p.lineSat, Math.max(2, p.lineLight - 3)),
    hatch: line,
    accent: hsl(p.accentHue, p.accentSat, p.accentLight),
    // clavado: es el blanco del ojo, y dejarlo variar da ojos de colores raros
    accent2: '#FFFFFF',
  }
}

// Los cuatro esquemas, ahora como juegos de PARÁMETROS. Medidos sobre los colores
// calibrados contra las referencias, así que reproducen los de siempre.
export const PRESETS = {
  magenta: {
    label: 'Magenta',
    skinHue: 330, skinSat: 64, skinLight: 87,
    shadowStep: 11.5, shadowSat: -11.5,
    lineLight: 21, lineSat: 68, lineHueShift: -8,
    accentHue: 329, accentSat: 86, accentLight: 48,
    eyeCornerSat: 6, eyeCornerLight: -5,
    bgHue: 0, bgSat: 0, bgLight: 100,
  },
  'verde-noche': {
    label: 'Verde noche',
    skinHue: 135, skinSat: 56, skinLight: 78,
    shadowStep: 12.5, shadowSat: -6,
    // en esta paleta la línea es NEGRA, no un verde oscuro: saturación 0
    lineLight: 7, lineSat: 0, lineHueShift: 0,
    accentHue: 141, accentSat: 62, accentLight: 61,
    eyeCornerSat: 6, eyeCornerLight: -5,
    bgHue: 127, bgSat: 25, bgLight: 65,
  },
  'gris-cian': {
    label: 'Gris cian',
    skinHue: 195, skinSat: 8, skinLight: 81,
    shadowStep: 13, shadowSat: 1,
    lineLight: 15, lineSat: 12, lineHueShift: 2,
    accentHue: 180, accentSat: 71, accentLight: 53,
    eyeCornerSat: 10, eyeCornerLight: -4,
    bgHue: 200, bgSat: 9, bgLight: 32,
  },
  'azul-noche': {
    label: 'Azul noche',
    skinHue: 60, skinSat: 6, skinLight: 88,
    shadowStep: 12, shadowSat: 0,
    lineLight: 10, lineSat: 0, lineHueShift: 0,
    accentHue: 217, accentSat: 62, accentLight: 56,
    eyeCornerSat: 8, eyeCornerLight: -5,
    bgHue: 0, bgSat: 0, bgLight: 15,
  },
}

export const PALETTE_NAMES = Object.keys(PRESETS)
export const DEFAULT_PALETTE = 'magenta'

/** Bandas de un preset, listas para volcar en el panel. */
export function presetBands(name) {
  const preset = PRESETS[name] || PRESETS[DEFAULT_PALETTE]
  const bands = {}
  for (const key of Object.keys(PARAMS)) bands[key] = [preset[key], preset[key]]
  return bands
}

/** Paleta ya construida, por nombre. La usan las previews de partes sueltas. */
export function getPalette(name) {
  return buildPalette(PRESETS[name] || PRESETS[DEFAULT_PALETTE])
}

/** Mapa de paletas construidas, para el desplegable de las previews. */
export const PALETTES = Object.fromEntries(
  PALETTE_NAMES.map((n) => [n, { ...getPalette(n), label: PRESETS[n].label }])
)

export function pickPalette(rng) {
  return PALETTES[rng.pick(PALETTE_NAMES)]
}
