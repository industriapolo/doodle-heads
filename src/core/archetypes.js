// Arquetipos: la correlación entre partes.
//
// El peligro de meter rasgos femeninos como params sueltos es la sopa — pestañas con
// barba, melena con patillas de boxeador. La coherencia entre partes es trabajo del
// nivel personaje, así que aquí: un arquetipo sorteable (con pool editable, como todo)
// que pone un juego de bandas POR PARTE **debajo** de las del panel. Los sliders
// siempre ganan: el arquetipo sesga, no manda.
//
// No es un switch estético: dentro de cada arquetipo sigue sorteándose todo. Y las
// bandas son sesgos, no muros — un `clasico` con melena existe, solo que poco.

import { randomizerFor } from './params.js'

export const PARAMS = {
  arquetipo: {
    options: ['clasico', 'mujer'],
    pool: { clasico: 3, mujer: 2 },
    label: 'Arquetipo',
  },
}

export const randomize = randomizerFor(PARAMS)

// Las bandas de cada arquetipo, en el formato del panel. Medidas contra las cuatro
// referencias de mujer (geisha, morada, fumadora, jeune fille):
//  · cara más estrecha y barbilla más redonda — ratio abajo, bottomRadius arriba
//  · melena trasera casi siempre; barba nunca; sin patilla bajo la oreja
//  · ceja fina de arco (el marcador más fuerte de las refs), silueta de pelo suave
export const BANDS = {
  clasico: {
    hair: { backHair: { p: 0.04 } }, // el rockero existe, pero es raro
  },
  mujer: {
    head: {
      ratio: [0.54, 0.68],
      bottomRadius: [0.045, 0.09],
      jawInset: [0, 0.12],
    },
    hair: {
      mode: { solid: 5, radial: 1, directional: 0, bald: 0 },
      backHair: { p: 0.85 },
      bun: { p: 0.3 },
      beardCoverage: [0, 0],
      topSpikeDepth: [0, 0.06],
      fringeShape: { pico: 1, curva: 3, 'curva-picos': 2 },
      sideburn: [0, 0],
      sideLength: [0.4, 0.85],
    },
    brows: {
      style: { maciza: 1, fina: 4 },
      thickness: [0.035, 0.08],
      width: [0.2, 0.4],
    },
    eyes: {
      lashes: { p: 0.7 },
    },
    mouth: {
      type: { line: 2, frown: 1, 'tiny-o': 0.5, labios: 4 },
      width: [0.09, 0.19],
      lipFull: [0.65, 0.95],
    },
    cheeks: {
      type: { nada: 2, rubor: 2, pecas: 1 },
    },
  },
}
