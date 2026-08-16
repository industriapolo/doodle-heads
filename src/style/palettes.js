// Paletas duotono, calibradas con eyedropper contra las 4 ilustraciones de `referencias/`.
//
// Ojo: `line` NO es siempre negro. En `magenta` la línea es plum oscuro; en `verde-noche`
// y `azul-noche` es negra de verdad. Ninguna parte debe asumir un color de línea.

export const PALETTES = {
  'verde-noche': {
    label: 'Verde noche',
    bg: '#8FBC94',
    skin: '#A9E7B9',
    skinShadow: '#7FCF95',
    skinDeep: '#5FB37A',
    eyeCorner: '#93DFAB',
    line: '#111111',
    solid: '#111111', // cejas macizas
    hatch: '#111111',
    accent: '#5FD98A',
    accent2: '#FFFFFF',
  },
  'gris-cian': {
    label: 'Gris cian',
    bg: '#4A5459',
    skin: '#CBD1D3',
    skinShadow: '#A8B1B4',
    skinDeep: '#8B9599',
    eyeCorner: '#B3C6CB',
    line: '#22282B',
    solid: '#1B2023',
    hatch: '#22282B',
    accent: '#33DCDC',
    accent2: '#FFFFFF',
  },
  magenta: {
    label: 'Magenta',
    bg: '#FFFFFF',
    skin: '#F3C9DE',
    skinShadow: '#E2A8C6',
    skinDeep: '#C97FA8',
    // Tono propio de las comisuras del ojo: más cromático que skinShadow y más claro,
    // para que se lea también sobre la sombra plana de la cara — que es skinShadow y
    // se la tragaría.
    eyeCorner: '#F1B1D3',
    line: '#5B1140',
    solid: '#4E1038',
    hatch: '#5B1140',
    accent: '#E5117F',
    accent2: '#FFFFFF',
  },
  'azul-noche': {
    label: 'Azul noche',
    bg: '#262626',
    skin: '#E2E2DE',
    skinShadow: '#C2C2BC',
    skinDeep: '#A0A09A',
    eyeCorner: '#D2D6D1',
    line: '#1A1A1A',
    solid: '#1A1A1A',
    hatch: '#1A1A1A',
    accent: '#4A7FD4',
    accent2: '#FFFFFF',
  },
}

export const PALETTE_NAMES = Object.keys(PALETTES)

export const DEFAULT_PALETTE = 'magenta'

export function getPalette(name) {
  return PALETTES[name] || PALETTES[DEFAULT_PALETTE]
}

export function pickPalette(rng) {
  return PALETTES[rng.pick(PALETTE_NAMES)]
}
