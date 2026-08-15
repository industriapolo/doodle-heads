// Nariz: una línea en L que baja del entrecejo y engancha a un lado.
// Es la parte más barata del set y sin embargo la que más "cara" añade.

import { interior } from '../style/stroke.js'

export const PARAMS = {
  type: { options: ['line', 'bridge'], default: 'line', label: 'Tipo' },
  startY: { min: 0.14, max: 0.44, default: 0.26, step: 0.01, label: 'Arranque' },
  length: { min: 0.20, max: 0.56, default: 0.38, step: 0.01, label: 'Largo' },
  hookWidth: { min: 0.02, max: 0.18, default: 0.075, step: 0.005, label: 'Ancho del gancho' },
  hookSide: { options: ['left', 'right'], default: 'left', label: 'Lado del gancho' },
  offsetX: { min: -0.08, max: 0.08, default: 0, step: 0.005, label: 'Desplazamiento X' },
  tilt: { min: -8, max: 8, default: 0, step: 0.5, unit: '°', label: 'Inclinación' },
}

export function randomize(rng) {
  return {
    type: rng.weighted({ line: 3, bridge: 1 }),
    startY: rng.range(0.18, 0.36),
    // arranca en el entrecejo (~23%) y en las refs llega casi a la boca: por debajo
    // de 0.32 se queda flotando en mitad de la cara
    length: rng.range(0.34, 0.54),
    hookWidth: rng.range(0.04, 0.13),
    hookSide: rng.pick(['left', 'right']),
    offsetX: rng.range(-0.05, 0.05),
    tilt: rng.range(-5, 5),
  }
}

export function draw(ctx, faceBox, p, palette, rng) {
  const nx = faceBox.cx + faceBox.w * p.offsetX
  const y0 = faceBox.y + faceBox.h * p.startY
  const y1 = y0 + faceBox.h * p.length
  const hw = faceBox.w * p.hookWidth
  const dir = p.hookSide === 'left' ? -1 : 1
  const lean = Math.tan((p.tilt * Math.PI) / 180) * (y1 - y0)

  const path = new Path2D()
  path.moveTo(nx, y0)
  path.lineTo(nx + lean, y1)
  path.lineTo(nx + lean + dir * hw, y1)
  path.lineTo(nx + lean + dir * hw, y1 - hw * 0.55)

  interior(ctx, palette)
  ctx.stroke(path)

  // variante bridge: el travesaño del entrecejo de la imagen 3
  if (p.type === 'bridge') {
    const bw = faceBox.w * 0.06
    const bridge = new Path2D()
    bridge.moveTo(nx - bw, y0)
    bridge.lineTo(nx + bw, y0)
    interior(ctx, palette, 0.85)
    ctx.stroke(bridge)
  }

  return { tipX: nx + lean, tipY: y1, endY: y1 }
}
