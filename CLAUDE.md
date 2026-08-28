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
2. **Una preview por módulo.** `previews/*.html` renderiza ~30 variantes + sliders. El estilo
   se itera ahí, aislado, antes de componer.

   Con preview propia: `head`, `hair` (pelo+barba), `eyes`, `brows`, `mouth` y `hatching`.
   Nariz, orejas, barbilla, mejillas, gafas y paleta **no la tienen**: se afinan desde
   `compose.html`, que ya monta sus sliders. No es deuda — son rasgos que solo se juzgan
   en la cara entera: una nariz aislada no dice nada sobre si cae bien entre los ojos, y
   la paleta se ve en el conjunto o no se ve. La regla es «ningún módulo sin sliders», no
   «un fichero por módulo».
3. **Params serializables.** Un personaje completo = un objeto plano de números y strings.
4. **Estilo centralizado.** Colores y grosores viven en `src/style/`. Ninguna parte los hardcodea.

### Color

No son esquemas cerrados: es una familia **derivada en HSL** de unos pocos números, con
sus `PARAMS` como cualquier parte. Con diez colores sueltos, desplazar una piel hacia el
naranja obligaría a mover diez valores de forma coherente y bastaría con que uno se
desincronizara para que la cara se cayera. Derivando, el tono de piel es **un número**.

Consecuencias, todas gratis por ser params con banda:
- **Piel distinta por cara**: abrir la banda de `skinHue`.
- **Fondo común o mosaico**: banda de `bgHue/Sat/Light` cerrada o abierta. No hay switch.
- Las sombras son **pasos relativos**, no colores: una piel oscura no se queda con las
  sombras aplastadas contra el negro.
- El tono es **circular** y la banda interpola recto, así que los sliders de tono llegan
  a 420°: para cruzar el 0 se pide 330→400, no 330→40 — que baja por el 180 y se pasea
  por cianes y verdes.

Los cuatro esquemas de siempre viven como **presets de parámetros**: el desplegable
vuelca sus valores en los sliders y desde ahí se afina.
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

No es una almendra. Es un segmento circular con una elipse recortada encima:

1. el blanco es un **segmento circular** — recta arriba (la **cuerda**), arco de círculo
   abajo, y la **pupila se apoya en la recta**, no flota en el centro
2. encima se superpone una **elipse más estrecha que la cuerda**
3. **copia A**, recortada *contra* el ojo → pliegue arriba y ojera abajo
4. **copia B**, la *misma* elipse recortada *con* el ojo → los trozos de dentro, que
   cierran las comisuras

El pliegue y la ojera **no son curvas sueltas**: comparten centro y radios por definición,
y eso es lo que hace que se lean como un mismo globo. Los piquitos de las comisuras salen
solos de la intersección — no se dibujan.

Dos recortes se suman en la copia A: el **angular** (`gapAngle`) decide el hueco entre los
dos arcos y es un número que se pide; el de **intersección** garantiza que nada cruce por
dentro del blanco. Sin el angular, el hueco depende de la geometría y los arcos tienden a
soldarse en un aro.

**Cierre: un solo canal.** `blink` (0–1) cierra y `blinkPivot` decide hacia dónde — 0 sube
el arco y el ojo acaba en recta a lo ancho completo, 1 baja la cuerda y acaba en el arco
curvo. `depth` es solo la apertura en reposo.

Los recortes de la copia A y de la sombra van contra la forma **en reposo**, no la actual:
contra la actual, al cerrarse no quedaría nada que recortar y saldría el aro entero
rodeando un ojo cerrado. La copia B sí va contra el blanco **visible**, porque está sobre
el globo y tiene que irse con el párpado.

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
bg → orejas → relleno cabeza → sombra plana → hatching pelo/barba de rayitas
   → RE-TRAZO del contorno → sombra de cejas → masas (barba y pelo planos)
   → ojos → nariz → boca+cigarro → hoyuelo → gafas → cejas macizas
   → acabado (grano+viñeta, style/finish.js) → humo del cigarro (anim/smoke.js)
```

El acabado y el estilo de trazo (`limpio`/`lapiz`) son params de la PALETA: son estilo
global, y la paleta ya llega a todas las funciones de trazo. El humo lo pinta el host
(index) encima del blit de la cara cacheada — ver el compositor de index.html.

Las orejas van **detrás** de la cabeza. El re-trazo del contorno impide que el hatching se
coma la silueta, y va ANTES de las masas: masas y patillas sobresalen de la silueta a
propósito y el contorno no puede cruzarles por encima.

### Masas de pelo y barba

Son **casquetes del contorno real de la cabeza** (`shellBetween` en `src/style/stroke.js`,
sobre los `pts` + `radii` que expone `head.build`): el pelo por la coronilla cerrado por el
flequillo, la barba por la mandíbula cerrada por un dentado. Nada aproxima la silueta con
otra forma — se hereda, y así encaja con cualquier radio de esquina y cualquier asimetría.
La historia de por qué (dos generaciones de fallos con una cúpula elíptica) está en
`HANDOFF-pelo.md`.

## Decisiones de estilo cerradas

- **Sin wobble en la silueta.** Los contornos de las refs son vector limpio. El aire de "hecho
  a mano" vive entero en el jitter interno de `hatching.js` (ángulo y largo por raya), no en la
  silueta. Hubo una constante `WOBBLE = 0` en `stroke.js`: se borró por muerta — la decisión es
  no tener el parámetro, no tenerlo a cero.
- **El color de línea varía por paleta.** No asumir negro: en `magenta` la línea es plum,
  en `verde-noche` es negra. En el sistema paramétrico eso es un solo número
  (`lineSat`), no dos paletas distintas.
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
