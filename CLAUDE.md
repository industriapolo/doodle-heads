# doodle-heads — contexto de proyecto

Generador procedural de cabezas/personajes en el estilo gráfico de Jorge.
Spec completa: `generador-personajes-kickoff.md`. Referencias visuales: `referencias/`.

## Regla de oro

**Cero assets de imagen.** Todo se dibuja por código en canvas 2D. Las 4 ilustraciones de
`referencias/` sirven solo para dirigir el estilo — nunca se cargan en runtime.

## Stack

ES modules nativos, sin bundler ni dependencias. Canvas 2D puro — **three.js está descartado
en Fase 1** (blink/gaze/float/smoke son 2D triviales). Se sirve con:

    python3 serve.py

**No usar `python3 -m http.server`**: no manda `Cache-Control`, así que Chrome aplica caché
heurística y sirve los ES modules de memoria sin revalidar. Editas un módulo, recargas, y
sigue corriendo el viejo — y con imports de namespace eso no da error de carga, da
`undefined` en una propiedad y una página en blanco a medio arrancar. `serve.py` manda
`no-store` y quita `Last-Modified`.

## Arquitectura

1. **Un módulo por parte.** `src/parts/*.js`, uno por rasgo. Nunca un monolito.
2. **Una preview por módulo.** `previews/*.js` renderiza ~30 variantes + sliders. El estilo se
   itera ahí, aislado, antes de componer.
3. **Params serializables.** Un personaje completo = un objeto plano de números y strings.
4. **Estilo centralizado.** Colores y grosores viven en `src/style/`. Ninguna parte los hardcodea.
5. **Determinismo por seed.** Todo random pasa por `mulberry32`. Misma seed = mismo personaje.

### Contrato de módulo

Los rangos de sorteo son **datos declarados**, no código. Eso es lo que permite que la UI
los lea y los edite: dirigir el generador es mover una banda, no editar un fichero.

```js
export const PARAMS = {
  // numérico: min/max son los topes del slider, range es la banda de sorteo
  width: { min: 0.20, max: 0.50, range: [0.26, 0.47], step: 0.01, label: 'Ancho' },
  // de lista: pesos por opción
  type:  { options: ['line', 'stitch'], pool: { line: 3, stitch: 2 }, label: 'Tipo' },
  // booleano: probabilidad, no un sí/no fijo
  cigarette: { type: 'bool', p: 0.45, label: 'Probabilidad de cigarrillo' },
}
export const randomize = randomizerFor(PARAMS)   // src/core/params.js
export function draw(ctx, box, params, palette, rng) { ... }
```

`randomize(rng, bands)` acepta bandas que sobreescriben las declaradas — así el panel de
previews dirige las 30 celdas sin tocar el código. El botón **copiar rangos** escupe las
bandas afinadas para fijarlas aquí.

`character.js` solo pide `randomize()` a cada parte y compone. No conoce los rangos.

### Construcción del ojo

No es una almendra. Sale de mirar las referencias:

- el blanco es un **segmento circular**: recta arriba, arco de círculo abajo, donde la
  recta es la **cuerda** de ese círculo
- la **pupila se apoya en la recta**, no flota en el centro
- por encima, y separada por piel, va otra **línea arqueada**: no es el borde del blanco,
  es el pliegue del párpado, y su trabajo es insinuar que el globo sigue redondo por detrás

El parpadeo cae solo de esta geometría: la cuerda baja hacia el arco y el blanco se cierra
a cero. `lidCoverage` (0 = abierto, 1 = cerrado) es ese único número, y el pliegue lo
acompaña a mitad de recorrido.

### Layout: `faceBox`, no la caja de cabeza

`head.js` devuelve un **`faceBox`** — la zona de cara por debajo de la cúpula. Los rasgos se
posicionan como % de `faceBox`, nunca de la altura total de cabeza: las cúpulas varían mucho
con `cornerRadius` y los rasgos migrarían solos al variar la silueta.

Proporciones medidas sobre las refs (% de `faceBox`):
cejas 8–22% · ojos 38–52% · nariz hasta 72–80% · boca 80–88%.

`faceBox` arranca en `y + topRadius * 0.75`. La altura sobrante de la cúpula es espacio de
frente/pelo — que es exactamente para lo que la usan las referencias (ciudad, cerebro, parque
encima de la cabeza). Por eso los rasgos cuelgan del `faceBox` y no de la caja de cabeza:
así una cúpula alta añade frente en vez de empujar la cara hacia abajo.

### Orden de capas

```
bg → orejas → relleno cabeza → sombra plana → hatching superficie/pelo
   → barba → cejas → ojos → nariz → boca+cigarro → RE-TRAZO del contorno
```

Las orejas van **detrás** de la cabeza. El re-trazo final del contorno impide que el hatching
se coma la silueta.

## Decisiones de estilo cerradas

- **`wobble` = 0.** Los contornos de las refs son vector limpio. El aire de "hecho a mano" vive
  entero en el jitter interno de `hatching.js` (ángulo y largo por raya), no en la silueta.
- **El color de línea varía por paleta.** No asumir negro: en `magenta` la línea es plum
  (`#5B1140`), en `verde-noche` es negra (`#111111`).
- **El cigarrillo es firma de estilo**, no un caso raro — sale en 2 de las 3 refs de cabeza.
  Probabilidad alta en el `randomize` de `mouth.js`.
- **Cejas: `width` es el parámetro más expresivo.** Varía entre 30% y 46% del ancho de cabeza
  entre las refs. La spec original no lo contemplaba.

## Animación

Un **único `requestAnimationFrame` compartido** recorre los ~30 personajes. Nunca un rAF por
personaje. El cacheo de capas estáticas en offscreen canvas queda diferido hasta que el grid
baje de 60fps.

## Escala de trabajo

Espacio lógico **800×800** para todo dibujo. `core/canvas.js` escala por `devicePixelRatio`;
los módulos dibujan siempre en coordenadas lógicas y nunca tocan el DPR.
