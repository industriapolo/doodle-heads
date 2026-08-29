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

La banda declarada es el **punto de referencia**: el panel y las configuraciones guardan
solo lo que **difiere** de ella (`touchedBands`, en `params.js`), y eso es exactamente lo
que pisa al arquetipo — donde el panel no ha tocado nada, manda el overlay del arquetipo.
Escribir una banda de fábrica es apagar el arquetipo en ese parámetro sin decirlo. La
tolerancia es medio paso de slider, que es lo que el navegador cuadricula él solo al
abrir el panel; por debajo de eso la diferencia no la ha puesto una mano.

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

**Mirada: los dos ejes no son iguales, y no deben serlo.** El ojo es unas cuatro veces más
ancho que hondo, así que la pupila recorre ~112 px lógicos de lado a lado y ~34 de arriba
abajo. Eso ya es el «los ojos giran más de lo que suben»: volver a recortar la vertical en
el host lo dejaba en 15 contra 112 y el eje no se leía. Los dos extremos verticales se
miden igual —cuánto del diámetro se esconde bajo un párpado— con un suelo en píxeles para
que una pupila pequeña no desaparezca al mirar arriba.

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
personaje. Y la regla de fondo no es cachear, es **no repintar lo que no ha cambiado**: en
reposo se animan ~4 caras de 30 por frame y las otras 26 se saltan enteras.

**El reloj es del rig, no del navegador.** `startRig` cuenta desde su propio arranque y
devuelve `{ now, running, pause, resume, stop }`; pausar lo congela y reanudar lo continúa.
Con el reloj de rAF, una pausa larga dejaba todas las citas vencidas y los treinta
parpadeaban a coro al volver. `now()` es lo que hay que pasarle a `react`.

**Dos funciones de dibujo, no una.** `character.js` exporta `drawStatic` (capas 0–4:
melena, orejas, cabeza, hatching, re-trazo) y `drawLive` (5–13, todo lo que un canal del
rig puede mover, más el acabado, que va sobre el lienzo entero). `draw` sigue existiendo
como composición de las dos: las previews y los tests la usan tal cual.

**La caché es del host, no del módulo.** El index guarda `drawStatic` en un offscreen por
personaje y la invalida solo en `reseed`; en cada repintado blitea eso y ejecuta `drawLive`
encima. Repintar las capas vivas de los 30 cuesta 10 ms; la cara entera, 52.

Corolario del reparto: **el layout sale del personaje y solo del personaje**. Los overrides
del rig son canales de DIBUJO, no de composición — si movieran el layout, la capa cacheada
y la viva dejarían de cuadrar. Tenía que ser así porque las orejas son capa estática y
cuelgan de la altura de los ojos.

**Deriva y reacción son cosas distintas, y tienen tablas distintas.** `MOODS` es la
deriva: lo que hacen treinta caras de fondo sin que canse — amplitudes del orden del 1 %
de la altura de la cara y transiciones de 700 ms. `REACTIONS` es contestar a alguien:
tabla aparte, envolvente propia (ataque rápido, sostenido, suelta lenta) y amplitudes 2,5×
en la ceja. Calibrar las dos con los mismos números fue el error original: a los 100 ms de
un click la cara llevaba un 4 % del recorrido y la reacción se perdía dentro de la deriva.

Dos reglas que las mantienen separadas sin que se estorben: la suelta va al **ánimo vivo**,
no al neutro —reaccionar no puede borrarle el humor de fondo al personaje— y mientras hay
una reacción la deriva **no arranca excursiones nuevas** (la que esté en vuelo sí termina;
cortarla daría el salto que la envolvente existe para evitar).

`a.mood` es la deriva y `a.expr` es lo que se dibuja: de `expr` salen `overridesFor` y la
firma de repintado.

**Canales del rig.** Son params con banda cerrada: no se sortean, los mueve el rig por
`overridesFor`. Hoy: `eyes.blink`, `eyes.pupilX`, `eyes.pupilY`, `eyes.eyeOpen`, los
`mood*` de ceja y boca, y `mouth.cigDrop`. Ojo con el reposo: casi todos reposan en 0,
pero `eyeOpen` reposa en **1** — es un multiplicador, no un delta. Añadir uno pide
declararlo **al final** de su PARAMS — el orden de declaración es el orden de las tiradas
del rng, así que en medio corre la secuencia de todo lo que va detrás y repinta esa parte
en todas las seeds guardadas.

**`bounce` no es un canal del personaje.** Es una transformación del lienzo entero
—escala desde la barbilla— y por eso la aplica el HOST, a la estática y a la viva con la
misma transformación, no `character.js`. Lo que se escala es el dibujo dentro del canvas:
el DOM no se mueve nunca (mover las celdas fue la flotación que se quitó por solaparlas).

**El host manda los datos del mundo; el rig decide la cara.** El rig no sabe que existe un
ratón: sabe seguir `a.gazeTarget` (un punto en [−1, 1], suavizado exponencial), sabe
`react(a, nombre, t)` (abrir la envolvente de una reacción con nombre) y sabe `lookAtAll`
(el coro: quién de una lista de posiciones mira hacia un punto y por cuánto tiempo).
Traducir píxeles a eso, y decidir que un hover «merece atención», es del index. Cuánto se
levanta una ceja para eso no sale nunca de `rig.js`.

Los objetivos de mirada con caducidad (`gazeHold`) los vence el rig, no el host: el reloj
es suyo, y el host solo repinta cuando algo cambia — no tiene tic con el que soltarlos.

## Escala de trabajo

Espacio lógico **800×800** para todo dibujo. `core/canvas.js` escala por `devicePixelRatio`;
los módulos dibujan siempre en coordenadas lógicas y nunca tocan el DPR.
