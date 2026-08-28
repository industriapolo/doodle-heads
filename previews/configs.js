// Configuraciones del composer: juegos de bandas con nombre, capturados con «copiar
// rangos» y guardados aquí para poder volver a ellos. El desplegable «configuración» del
// panel los vuelca en los sliders y desde ahí se afina.
//
// Son DIFFS contra las bandas declaradas por cada módulo, no juegos completos. Una banda
// que coincide con la de fábrica no se escribe: en `character.js` una banda solo pisa al
// arquetipo si difiere de la declarada, así que copiar valores de fábrica dentro de una
// config es apagar el arquetipo en ese parámetro sin decirlo. `poster-granulado` nació
// como volcado completo del panel y traía 148 bandas, de las que 102 eran de fábrica
// —`head.ratio: [0.58, 0.82]` entre ellas—; migrada al diff son 46.
//
// REGLA DE CARGA: una config manda sobre los MÓDULOS QUE NOMBRA. Esos se devuelven a lo
// declarado y encima se aplica su diff; los que no nombra se quedan como estén. Por eso
// los cuatro esquemas de color siguen siendo parciales (solo tocan `palette`) y
// `poster-granulado` es completo para los módulos que lista. Un módulo cuyo diff queda
// vacío no se lista: no tiene nada que decir, y listarlo solo serviría para arrastrar al
// arquetipo a fábrica.
//
// Formato: bandas por módulo, como las guarda el panel — numérico [lo, hi],
// lista { opción: peso }, booleano { p }.

import { PRESETS, presetBands } from '../src/style/palettes.js'

export const CONFIGS = {
  'poster-granulado': {
    label: 'Póster granulado',
    // Capturada por Jorge (ago 2026): fondos saturados y oscuros por cara, línea fina
    // con la tinta desviada hacia el naranja, grano fuerte con viñeta, y el trazo
    // sorteando limpio/lápiz al 50% (pool a ceros = reparto uniforme).
    bands: {
      palette: {
        skinHue: [317, 384],
        skinSat: [63, 96],
        skinLight: [70, 98],
        shadowStep: [9.5, 15.5],
        lineLight: [11, 22],
        lineSat: [23, 44],
        lineHueShift: [31, 42],
        accentHue: [0, 418],
        accentSat: [79, 84],
        accentLight: [38, 53],
        bgHue: [0, 420],
        bgSat: [30, 68],
        bgLight: [31, 62],
        grain: [0.6, 0.6],
        grainScale: [2.05, 3],
        vignette: [0.32, 0.5],
        strokeStyle: { limpio: 0, lapiz: 0 },
        sketchJitter: [4.4, 6],
        sketchAlpha: [1, 1],
      },
      head: {
        asymmetry: [0.025, 0.045],
        fill: [0.84, 0.94],
        lineWeight: [1.4, 3.3],
      },
      ears: {
        eyeAlign: [-0.01, 0.01],
        stretch: [0.9, 1.6],
        innerSize: [0.33, 0.58],
        innerRise: [-0.28, 0.34],
        innerTone: { media: 0, fuerte: 1 },
        lineWeight: [1.7, 3.6],
      },
      eyes: {
        eyeWidth: [0.25, 0.39],
        browGap: [0.015, 0.105],
        pupilSize: [0.06, 0.19],
        lineWeight: [2.7, 3.4],
        detailWeight: [1.8, 1.8],
      },
      nose: {
        stepWidth: [0.035, 0.095],
        stepDrop: [0.03, 0.1],
        lineWeight: [2.7, 2.7],
      },
      mouth: {
        type: { line: 3, frown: 2, 'tiny-o': 0 },
      },
      hair: {
        hairline: [0.11, 0.32],
        fringeShape: { pico: 2, curva: 2, 'curva-picos': 2 },
        fringeBow: [0.065, 0.195],
        fringeDepth: [0.015, 0.095],
        topSpikeDepth: [0, 0.172],
        spikeAsym: [0.05, 1],
        beardJags: [10, 12],
      },
      brows: {
        tilt: [-4, 2],
        asymmetry: [7.5, 12],
      },
    },
  },
}

// Los cuatro esquemas clásicos, como configuraciones de SOLO color: nombran `palette` y
// nada más, así que devuelven el bloque Color a lo declarado, le aplican su diff, y dejan
// el resto del panel donde estaba. Sustituyen al viejo desplegable de paletas del composer.
for (const [name, preset] of Object.entries(PRESETS)) {
  CONFIGS[`esquema-${name}`] = {
    label: `esquema ${preset.label}`,
    bands: { palette: presetBands(name) },
  }
}

export const CONFIG_NAMES = Object.keys(CONFIGS)
