// Ojos. La construcción sale del esquema de Jorge, no de un óvalo genérico:
//
//   1. el blanco es un SEGMENTO CIRCULAR — recta arriba (la cuerda), arco de círculo
//      abajo, y la pupila se apoya en la recta
//   2. encima se superpone una ELIPSE más estrecha que la cuerda
//   3. copia A, recortada CONTRA el ojo → pliegue arriba y ojera abajo
//   4. copia B, la MISMA elipse recortada CON el ojo → los trozos de dentro, que
//      cierran las comisuras
//
// Lo que gana: el pliegue y la ojera no son curvas sueltas que puedan
// desincronizarse — comparten centro y radios por definición. Eso es lo que hace que
// se lean como un mismo globo ocular.
//
// Que la elipse sea más estrecha que la cuerda es lo que deja asomar los piquitos de
// las comisuras: salen solos de la intersección, no se dibujan.

import { interior } from '../style/stroke.js'
import { randomizerFor } from '../core/params.js'

export const PARAMS = {
  eyeWidth: { min: 0.14, max: 0.44, range: [0.25, 0.43], step: 0.01, label: 'Ancho (cuerda)' },
  depth: { min: 0.015, max: 0.12, range: [0.025, 0.115], step: 0.005, label: 'Apertura (flecha del arco)' },
  tilt: { min: -18, max: 18, range: [-2, 1], step: 0.5, unit: '°', label: 'Inclinación' },
  spacing: { min: 0.01, max: 0.24, range: [0.1, 0.18], step: 0.01, label: 'Separación' },
  offsetY: { min: 0.24, max: 0.62, range: [0.34, 0.46], step: 0.01, label: 'Altura' },
  browGap: { min: 0, max: 0.16, range: [0.01, 0.14], step: 0.005, label: 'Hueco bajo la ceja' },

  // --- la elipse ---------------------------------------------------------
  // CONDICIÓN DEL RECORTE LATERAL: su punto más ancho tiene que caer DENTRO del blanco,
  // o sea por encima del arco. Si es muy ancha o su centro muy bajo, los costados se
  // escapan por debajo, no hay nada que recortar y los dos arcos se sueldan en un aro.
  // Con `gapAngle` por encima de unos pocos grados eso ya no puede pasar.
  ringRx: { min: 0.4, max: 1.15, range: [0.68, 0.80], step: 0.01, label: 'Radio horizontal (× media cuerda)' },
  ringRy: { min: 0.2, max: 1.6, range: [0.42, 0.56], step: 0.01, label: 'Radio vertical (× media cuerda)' },
  ringCy: { min: -1.5, max: 3, range: [0.20, 0.36], step: 0.02, label: 'Centro Y (× flecha)' },
  // El hueco entre los dos arcos. Con solo el recorte por intersección sería una
  // consecuencia de la geometría y tendería a cerrarse; así es un número que se pide.
  gapAngle: { min: 0, max: 70, range: [24, 38], step: 1, unit: '°', label: 'Apertura del hueco' },
  innerCopy: { options: ['si', 'no'], pool: { si: 1, no: 0 }, label: 'Copia interior' },

  bagLines: { min: 0, max: 3, range: [0, 2], step: 1, int: true, label: 'Bolsas concéntricas extra' },
  bagStep: { min: 0.02, max: 0.5, range: [0.10, 0.16], step: 0.01, label: 'Paso entre concéntricas' },

  // La sombra usa las MISMAS elipses, rellenas. Ligada al resto: mover un radio la
  // mueve. No sale siempre — es una probabilidad, como el cigarrillo.
  shadow: { type: 'bool', p: 0.35, label: 'Probabilidad de sombra' },
  shadowRing: { min: 0, max: 3, range: [1, 2], step: 1, int: true, label: 'Anillo que la limita' },
  shadowTone: { options: ['media', 'fuerte'], pool: { media: 3, fuerte: 1 }, label: 'Tono de la sombra' },

  pupilSize: { min: 0.03, max: 0.22, range: [0.03, 0.17], step: 0.005, label: 'Tamaño pupila' },
  pupilX: { min: -1, max: 1, range: [-0.75, 1], step: 0.05, label: 'Mirada X' },
  // `accent` apagado: en la paleta magenta daba ojos rojos. No lo borro porque la
  // referencia del esqueleto sí los lleva — se enciende desde el panel.
  sclera: { options: ['white', 'accent'], pool: { white: 1, accent: 0 }, label: 'Esclerótica' },
  // El blanco solo ocupa el área CENTRAL, la que delimitan los costados de la elipse.
  // Las comisuras que quedan fuera van en `eyeCorner`, un tono propio: con skinShadow
  // desaparecían sobre la sombra plana lateral de la cara, que es ese mismo tono.
  cornerShade: { options: ['si', 'no'], pool: { si: 1, no: 0 }, label: 'Comisuras en sombra' },

  // UN canal de cierre, no dos. Antes `lidCoverage` y `depth` colapsaban los dos el
  // blanco a cero por caminos distintos. `blink` cierra y `blinkPivot` decide hacia
  // dónde: 0 sube el arco y el ojo acaba en recta a lo ancho completo; 1 baja la
  // cuerda y acaba en el arco curvo.
  blink: { min: 0, max: 1, range: [0, 0], step: 0.01, label: 'Cierre' },
  blinkPivot: { min: 0, max: 1, range: [0, 0.15], step: 0.05, label: 'Hacia dónde cierra' },

  // Pestañas: rayitas cortas sobre la mitad EXTERIOR del pliegue, apuntando hacia
  // fuera por la normal — como los ticks de la geisha y la jeune fille. Por defecto
  // no salen: las reparte el arquetipo.
  lashes: { type: 'bool', p: 0, label: 'Probabilidad de pestañas' },
  lashCount: { min: 1, max: 5, range: [2, 3], step: 1, int: true, label: 'Nº de pestañas' },
  lashLen: { min: 0.04, max: 0.2, range: [0.07, 0.12], step: 0.005, label: 'Largo de pestaña' },

  lineWeight: { min: 0.5, max: 12, range: [4.1, 4.1], step: 0.1, label: 'Grosor del ojo' },
  detailWeight: { min: 0.5, max: 12, range: [3.2, 3.2], step: 0.1, label: 'Grosor de los arcos' },

  // Mirada vertical. Va AQUÍ ABAJO y no junto a `pupilX`, que es donde pediría el
  // sentido común, porque el orden de declaración de PARAMS es el orden de las tiradas
  // del rng: `sample` recorre las entradas en orden y pide una a cada una, banda cerrada
  // incluida. Meter un parámetro en medio corre la secuencia de todos los que van
  // detrás y repinta el ojo de TODAS las seeds guardadas. Al final no corre nada.
  //
  // Como `blink`, es un canal del rig: banda [0, 0], no se sortea. −1 arriba, +1 abajo.
  pupilY: { min: -1, max: 1, range: [0, 0], step: 0.05, label: 'Mirada Y' },
}

// Dónde puede llegar la pupila, medido en radios de pupila:
//  · en reposo se APOYA en la cuerda — asoma por debajo, con un 27,5 % de su diámetro ya
//    tapado por el párpado. Eso no es un accidente, es la construcción del ojo.
//  · hacia abajo, hasta que roza el arco del blanco.
//  · hacia arriba, hasta esconder `PUPIL_HIDE` de su diámetro bajo el párpado. Se recorta
//    contra el blanco visible, así que lo que queda es una uña de pupila pegada a la
//    cuerda: eso es lo que se lee como ojo en blanco.
const PUPIL_REST = 0.45
const PUPIL_HIDE = 0.72

export const randomize = randomizerFor(PARAMS)

/** Segmento circular: cuerda en y=0 de largo w, arco de flecha `sag` hacia abajo. */
function segment(w, sag) {
  const half = w / 2
  const R = (sag * sag + half * half) / (2 * sag)
  const cy = -(R - sag)
  const path = new Path2D()
  path.moveTo(-half, 0)
  path.arc(0, cy, R, Math.atan2(R - sag, -half), Math.atan2(R - sag, half), true)
  return path
}

const sealed = (open) => {
  const p = new Path2D()
  p.addPath(open)
  p.closePath()
  return p
}

/** El complemento de un path: todo menos él. Con evenodd, un rect enorme + el path. */
function outside(path) {
  const o = new Path2D()
  o.rect(-4000, -4000, 8000, 8000)
  o.addPath(path)
  return o
}

/**
 * Altura del centro de la pupila, en el marco de la cuerda (y=0 = cuerda, +y = abajo).
 *
 * El tope de abajo se mide contra el blanco EN REPOSO, no contra el que hay al parpadear:
 * si no, cerrar el ojo arrastraría la pupila hacia arriba y la mirada se movería sola con
 * cada pestañeo. Lo que se va con el párpado es el recorte, no la posición.
 *
 * Y hay que topar ese tope: con el ojo poco abierto y la pupila grande, `sag − pr` cae
 * por encima del reposo y «mirar abajo» subiría la pupila.
 */
function pupilCy(pr, sag, pupilY = 0) {
  const reposo = pr * PUPIL_REST
  if (!pupilY) return reposo
  const abajo = Math.max(reposo, sag - pr)
  const arriba = pr * (1 - 2 * PUPIL_HIDE)
  return reposo + (pupilY > 0 ? pupilY * (abajo - reposo) : -pupilY * (arriba - reposo))
}

/** Geometría de los dos ojos, sin dibujar. rig.js la necesita para la mirada. */
export function build(faceBox, p) {
  const w = faceBox.w * p.eyeWidth
  const depth = faceBox.h * p.depth
  const gap = faceBox.w * p.spacing
  const cy = faceBox.y + faceBox.h * p.offsetY
  return {
    w,
    depth,
    left: { cx: faceBox.cx - gap / 2 - w / 2, cy, dir: -1 },
    right: { cx: faceBox.cx + gap / 2 + w / 2, cy, dir: 1 },
  }
}

/**
 * Cuánto sobresale el ojo POR ENCIMA de la cuerda, en fracción de faceBox.h.
 *
 * Lo que hay que colgar de la ceja no es la cuerda: es el punto más alto del pliegue,
 * que queda por encima. Y depende del ANCHO del ojo, porque los radios de la elipse se
 * miden en media cuerda — en ojos anchos sube lo bastante como para meterse en la ceja.
 */
export function topExtent(faceBox, p) {
  const ry = ((faceBox.w * p.eyeWidth) / 2) * p.ringRy
  const ecy = faceBox.h * p.depth * p.ringCy
  return Math.max(0, (ry - ecy) / faceBox.h)
}

export function draw(ctx, faceBox, p, palette, rng) {
  const g = build(faceBox, p)
  for (const side of [g.left, g.right]) eye(ctx, side, g.w, g.depth, p, palette)
  return g
}

function eye(ctx, side, w, sag, p, palette) {
  const { cx, cy } = side
  const half = w / 2

  // La cuerda y el arco convergen los dos hacia la misma altura `m`.
  const t = p.blink
  const m = sag * p.blinkPivot
  const chordY = t * m
  const sagNow = Math.max(0.6, sag * (1 - t)) // 0 exacto degenera el radio del arco

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((p.tilt * Math.PI) / 180)

  const rest = sealed(segment(w, sag)) // forma en REPOSO: la que manda en el recorte
  const nowOpen = segment(w, sagNow)
  const now = sealed(nowOpen)

  const rx = half * p.ringRx
  const ry = half * p.ringRy
  const ecy = sag * p.ringCy

  // --- sombra: la misma elipse, rellena -----------------------------------
  // Va la primera de todo, porque está sobre la piel. Solo por debajo de la cuerda: en
  // las referencias la zona entre cuerda y pliegue queda limpia.
  if (p.shadow) {
    const k = 1 + p.shadowRing * p.bagStep
    ctx.save()
    ctx.clip(outside(rest), 'evenodd')
    const debajo = new Path2D()
    debajo.rect(-4000, 0, 8000, 4000)
    ctx.clip(debajo)
    const mancha = new Path2D()
    mancha.ellipse(0, ecy, rx * k, ry * k, 0, 0, Math.PI * 2)
    ctx.fillStyle = p.shadowTone === 'fuerte' ? palette.skinDeep : palette.skinShadow
    ctx.fill(mancha)
    ctx.restore()
  }

  // --- blanco + pupila ----------------------------------------------------
  // Dos pasadas: todo en tono de comisura y encima el blanco recortado a la elipse.
  // Las líneas que separan las tres zonas son las de la copia interior, así que
  // coinciden solas — es la misma elipse.
  const blanco = p.sclera === 'accent' ? palette.accent : palette.accent2
  ctx.save()
  ctx.translate(0, chordY)
  ctx.clip(now)
  ctx.fillStyle = p.cornerShade === 'si' ? palette.eyeCorner : blanco
  ctx.fillRect(-w, -sag * 4, w * 2, sag * 8)
  if (p.cornerShade === 'si') {
    ctx.save()
    ctx.translate(0, -chordY) // la elipse vive en el marco sin desplazar
    const centro = new Path2D()
    centro.ellipse(0, ecy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = blanco
    ctx.fill(centro)
    ctx.restore()
  }
  const pr = (w * p.pupilSize) / 2
  ctx.fillStyle = palette.line
  ctx.beginPath()
  ctx.arc(p.pupilX * (half - pr * 2.2), pupilCy(pr, sag, p.pupilY), pr, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // --- copia A: recortada CONTRA el ojo -----------------------------------
  // Contra la forma en REPOSO, no la actual: si se recortara contra la actual, al
  // cerrarse no quedaría nada que recortar y saldría el aro entero rodeando un ojo
  // cerrado. Además el pliegue y la ojera no se mueven al parpadear.
  const gap = (p.gapAngle * Math.PI) / 180
  interior(ctx, palette, p.detailWeight)
  for (let i = 0; i <= p.bagLines; i++) {
    const k = 1 + i * p.bagStep
    ctx.save()
    ctx.clip(outside(rest), 'evenodd')

    // Cada arco en su propio Path2D: en el mismo, el segundo arrastraría una recta
    // desde donde acabó el primero.
    const abajo = new Path2D()
    abajo.ellipse(0, ecy, rx * k, ry * k, 0, gap, Math.PI - gap)
    ctx.stroke(abajo)

    if (i === 0) {
      // el pliegue, solo en la primera: si no, se acumulan pliegues sobre el ojo
      const arriba = new Path2D()
      arriba.ellipse(0, ecy, rx * k, ry * k, 0, Math.PI + gap, Math.PI * 2 - gap)
      ctx.stroke(arriba)
    }
    ctx.restore()
  }

  // --- copia B: la MISMA elipse recortada CON el ojo ----------------------
  // Cierra las comisuras por dentro. Sin recorte angular: aquí interesa justo lo que
  // deje la intersección. Y contra el blanco VISIBLE, no el de reposo — es un rasgo
  // sobre el globo, así que se va con el párpado.
  if (p.innerCopy === 'si') {
    ctx.save()
    ctx.translate(0, chordY)
    ctx.clip(now)
    ctx.translate(0, -chordY)
    const dentro = new Path2D()
    dentro.ellipse(0, ecy, rx, ry, 0, 0, Math.PI * 2)
    interior(ctx, palette, p.detailWeight)
    ctx.stroke(dentro)
    ctx.restore()
  }

  // --- las dos líneas del ojo, encima -------------------------------------
  ctx.save()
  ctx.translate(0, chordY)
  interior(ctx, palette, p.lineWeight)
  ctx.stroke(nowOpen)
  const chord = new Path2D()
  chord.moveTo(-half, 0)
  chord.lineTo(half, 0)
  ctx.stroke(chord)

  // --- pestañas: ANCLADAS A LA CUERDA, en su mitad exterior ---------------
  // Son parte del párpado, no del pliegue: viven sobre la línea horizontal del ojo
  // (los ticks de la geisha) y, como van dentro del marco desplazado por `chordY`,
  // bajan con el párpado al parpadear.
  if (p.lashes) {
    const nL = Math.max(1, Math.round(p.lashCount))
    const len = w * p.lashLen
    interior(ctx, palette, p.detailWeight)
    ctx.beginPath()
    for (let i = 0; i < nL; i++) {
      // repartidas por la mitad exterior de la cuerda, hacia la sien
      const x = side.dir * half * (0.45 + (0.45 * (i + 1)) / nL)
      ctx.moveTo(x, 0)
      ctx.lineTo(x + side.dir * len * 0.45, -len)
    }
    ctx.stroke()
  }
  ctx.restore()

  ctx.restore()
}
