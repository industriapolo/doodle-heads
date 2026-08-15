# doodle-heads — contexto de proyecto

Generador procedural de cabezas/personajes en el estilo gráfico de Jorge.
Spec completa: `generador-personajes-kickoff.md`. Referencias visuales: `referencias/`.

## Regla de oro

**Cero assets de imagen.** Todo se dibuja por código en canvas 2D. Las 4 ilustraciones de
`referencias/` sirven solo para dirigir el estilo — nunca se cargan en runtime.

## Stack

ES modules nativos, sin bundler ni dependencias. Canvas 2D puro — **three.js está descartado
en Fase 1** (blink/gaze/float/smoke son 2D triviales). Se sirve con un servidor estático:

    python3 -m http.server 8080

## Arquitectura

1. **Un módulo por parte.** `src/parts/*.js`, uno por rasgo. Nunca un monolito.
2. **Una preview por módulo.** `previews/*.js` renderiza ~30 variantes + sliders. El estilo se
   itera ahí, aislado, antes de componer.
3. **Params serializables.** Un personaje completo = un objeto plano de números y strings.
4. **Estilo centralizado.** Colores y grosores viven en `src/style/`. Ninguna parte los hardcodea.
5. **Determinismo por seed.** Todo random pasa por `mulberry32`. Misma seed = mismo personaje.

### Contrato de módulo

Cada parte exporta tres cosas:

```js
export const PARAMS = {                  // schema → sliders autogenerados
  width: { min: 0.30, max: 0.48, default: 0.38, step: 0.01, label: 'Ancho' },
}
export function randomize(rng) { ... }   // el módulo es dueño de sus rangos
export function draw(ctx, box, params, palette) { ... }
```

`character.js` solo pide `randomize()` a cada parte y compone. No conoce los rangos.

### Layout: `faceBox`, no la caja de cabeza

`head.js` devuelve un **`faceBox`** — la zona de cara por debajo de la cúpula. Los rasgos se
posicionan como % de `faceBox`, nunca de la altura total de cabeza: las cúpulas varían mucho
con `cornerRadius` y los rasgos migrarían solos al variar la silueta.

Proporciones medidas sobre las refs (% de `faceBox`):
cejas 18–34% · ojos 40–52% · nariz hasta 72–80% · boca 80–88%.

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
