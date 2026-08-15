// Cejas: rectángulos macizos. El parámetro emocional principal y, medido contra las
// referencias, el rasgo que más varía entre personajes — de ahí que `width` sea param
// de pleno derecho y no una constante.
//
// Todas las medidas son fracciones del `faceBox` (ancho = ancho de cabeza).

export const PARAMS = {
  preset: {
    options: ['auto', 'neutral', 'cansado', 'molesto', 'sorpresa'],
    default: 'auto',
    label: 'Expresión',
  },
  width: { min: 0.20, max: 0.50, default: 0.38, step: 0.01, label: 'Ancho de ceja' },
  thickness: { min: 0.05, max: 0.20, default: 0.12, step: 0.005, label: 'Grosor' },
  gap: { min: 0, max: 0.18, default: 0.05, step: 0.005, label: 'Separación' },
  offsetY: { min: 0.02, max: 0.32, default: 0.11, step: 0.01, label: 'Altura' },
  tilt: { min: -20, max: 20, default: 0, step: 1, unit: '°', label: 'Inclinación' },
  asymmetry: { min: 0, max: 12, default: 2, step: 0.5, unit: '°', label: 'Asimetría' },
}

// Convención: tilt positivo = extremo INTERIOR hacia abajo (cara de cabreo).
export const PRESETS = {
  neutral: { tilt: 0 },
  cansado: { tilt: -13 }, // extremo exterior caído
  molesto: { tilt: 13 }, // extremo interior caído
  sorpresa: { tilt: -4, offsetY: 0.04 }, // cejas arriba del todo
}

export function randomize(rng) {
  const preset = rng.weighted({ neutral: 3, cansado: 3, molesto: 2, sorpresa: 1 })
  return {
    preset,
    width: rng.range(0.26, 0.47),
    thickness: rng.range(0.08, 0.17),
    gap: rng.range(0.015, 0.13),
    offsetY: rng.range(0.05, 0.24),
    tilt: rng.range(-6, 6), // se suma al del preset
    asymmetry: rng.range(0, 6),
  }
}

/** Geometría sin dibujar. El pelo la necesita para saber dónde parar. */
export function build(faceBox, p) {
  const preset = p.preset === 'auto' ? null : PRESETS[p.preset]
  const tilt = (preset?.tilt ?? 0) + p.tilt
  const offsetY = preset?.offsetY ?? p.offsetY

  const gap = faceBox.w * p.gap
  // el par de cejas nunca puede desbordar la cabeza
  const maxW = (faceBox.w * 0.94 - gap) / 2
  const bw = Math.min(faceBox.w * p.width, maxW)
  const bh = faceBox.h * p.thickness
  const top = faceBox.y + faceBox.h * offsetY

  return {
    tilt,
    bw,
    bh,
    top,
    // los ojos se cuelgan de aquí: la ceja marca dónde acaba la zona de frente
    bottom: top + bh,
    innerLeft: faceBox.cx - gap / 2,
    innerRight: faceBox.cx + gap / 2,
  }
}

export function draw(ctx, faceBox, p, palette, rng) {
  const g = build(faceBox, p)

  ctx.fillStyle = palette.solid
  // izquierda: rotación positiva baja su extremo derecho, que es el interior
  slab(ctx, g.innerLeft - g.bw, g.top, g.bw, g.bh, g.tilt + p.asymmetry)
  slab(ctx, g.innerRight, g.top, g.bw, g.bh, -g.tilt)

  return g
}

function slab(ctx, x, y, w, h, deg) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}
