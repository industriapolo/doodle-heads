// Silueta de cabeza: rectángulo alto de esquinas redondeadas, con cúpula arriba y
// mandíbula achaflanada abajo. Es la única parte que además de dibujar DEVUELVE geometría:
// el `faceBox` sobre el que se posiciona todo lo demás, y el `path` que hace de máscara
// para el hatching de pelo y barba.

import { roundedPolyPath, outline } from '../style/stroke.js'
import { box } from '../core/canvas.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  ratio: { min: 0.58, max: 0.82, range: [0.58, 0.82], step: 0.01, label: 'Ratio ancho/alto' },
  topRadius: { min: 0.05, max: 0.5, range: [0.36, 0.5], step: 0.01, label: 'Radio cúpula' },
  bottomRadius: { min: 0.02, max: 0.35, range: [0.02, 0.04], step: 0.01, label: 'Radio barbilla' },
  jawInset: { min: 0, max: 0.22, range: [0, 0.22], step: 0.01, label: 'Estrechamiento mandíbula' },
  chinHeight: { min: 0.06, max: 0.28, range: [0.11, 0.21], step: 0.01, label: 'Altura del chaflán' },
  asymmetry: { min: 0, max: 0.06, range: [0, 0.015], step: 0.005, label: 'Asimetría' },
  shadowSide: {
    options: ['none', 'left', 'right'],
    pool: { none: 0, left: 1, right: 0 },
    label: 'Sombra plana',
  },
  shadowWidth: { min: 0.08, max: 0.45, range: [0.13, 0.45], step: 0.01, label: 'Ancho de sombra' },
  fill: { min: 0.82, max: 0.98, range: [0.92, 0.98], step: 0.01, label: 'Ocupación del marco' },
  lineWeight: { min: 0.5, max: 16, range: [6, 6], step: 0.1, label: 'Grosor del contorno' },
}

export const randomize = randomizerFor(PARAMS)

/**
 * Geometría sin dibujar. character.js la necesita antes de pintar nada: el faceBox
 * posiciona los rasgos y el path enmascara el hatching.
 *
 * @returns { path, headBox, faceBox }
 */
export function build(frame, p) {
  const h = frame.h * p.fill
  const w = Math.min(h * p.ratio, frame.w * p.fill)
  const x = frame.cx - w / 2
  const y = frame.cy - h / 2

  const rTop = p.topRadius * w
  const rBot = p.bottomRadius * w
  const chin = p.chinHeight * h
  const inset = p.jawInset * w

  // La asimetría inclina levemente el eje: el borde superior se desplaza y los radios
  // difieren por lado. Es lo que evita que 30 cabezas se lean como la misma plantilla.
  const a = p.asymmetry * w
  const rTopL = rTop * (1 - p.asymmetry * 3)
  const rTopR = rTop * (1 + p.asymmetry * 3)

  const pts = [
    { x: x + a, y },                          // sup izq
    { x: x + w + a, y },                      // sup der
    { x: x + w, y: y + h - chin },            // arranque del chaflán der
    { x: x + w - inset, y: y + h },           // inf der
    { x: x + inset, y: y + h },               // inf izq
    { x, y: y + h - chin },                   // arranque del chaflán izq
  ]

  const path = roundedPolyPath(pts, [rTopL, rTopR, rBot * 1.4, rBot, rBot, rBot * 1.4])

  const headBox = box(x, y, w, h)

  // faceBox: la zona por debajo de la cúpula. Los rasgos NO pueden colgar de la altura
  // total de cabeza — con radios de cúpula entre 0.14 y 0.46 migrarían solos.
  const faceTop = y + rTop * 0.75
  const faceBox = box(x, faceTop, w, y + h - faceTop)

  return { path, headBox, faceBox, pts }
}

/** Pinta a partir de geometría ya calculada. character.js la necesita antes de dibujar. */
export function paint(ctx, g, p, palette) {
  const { path, headBox } = g

  ctx.fillStyle = palette.skin
  ctx.fill(path)

  // sombra plana lateral, recortada a la silueta
  if (p.shadowSide !== 'none') {
    ctx.save()
    ctx.clip(path)
    ctx.fillStyle = palette.skinShadow
    const sw = headBox.w * p.shadowWidth
    const sx = p.shadowSide === 'right' ? headBox.right - sw : headBox.x
    ctx.fillRect(sx, headBox.y - 10, sw, headBox.h + 20)
    ctx.restore()
  }

  outline(ctx, palette, p.lineWeight)
  ctx.stroke(path)

  return g
}

export function draw(ctx, frame, p, palette, rng) {
  return paint(ctx, build(frame, p), p, palette)
}

/** Re-traza el contorno por encima de todo, para que el hatching no se coma la silueta. */
export function restroke(ctx, geometry, palette, width) {
  outline(ctx, palette, width)
  ctx.stroke(geometry.path)
}
