# Handoff — la masa de pelo está rota

Documento para retomar en sesión nueva. El resto del generador está bien; **el problema
está acotado a la silueta de la masa de pelo** (`mode: 'solid'`) en `src/parts/hair.js`.

## El síntoma

En muchas caras asoma una **franja de piel entre el pelo y el contorno de la cabeza**, casi
siempre en una de las dos esquinas de arriba. Se ve como una media luna blanca pegada al
borde del cráneo. No es un problema de color ni de capas: **el pelo no llega a cubrir la
cabeza**.

Reproducir: `python3 serve.py` → `previews/compose.html` → en el bloque PELO deja solo
`solid`. Sale en un tercio largo de las caras. Empeora al subir `Asimetría` (bloque CABEZA).

## La causa que creo que es

**La cúpula del pelo es una elipse. La parte de arriba de la cabeza es un rectángulo
redondeado. No encajan.**

- `head.build()` (`src/parts/head.js`) construye la cabeza con `roundedPolyPath` y **un
  radio por esquina**. La asimetría hace además que los dos radios de arriba sean
  distintos: `rTopL = rTop*(1 - asym*3)`, `rTopR = rTop*(1 + asym*3)`.
- `hair.drawMass()` construye la cúpula muestreando **una elipse simétrica** centrada en
  `headBox.cx + lean`, de semiejes `halfW` y `domeH`.

Cuando una esquina de la cabeza es más cuadrada que la elipse (radio pequeño), **la cabeza
sobresale del pelo por esa esquina**. El `overhang` (0.01–0.035 del ancho) no da para
taparlo. Y como la asimetría hace las dos esquinas distintas, casi siempre falla una sola —
que es exactamente lo que se ve.

**No está verificado.** Es la hipótesis con la que empezaría, y encaja con que el defecto
sea asimétrico y empeore con `Asimetría`.

## Cómo está construida la masa hoy

`drawMass()` en `src/parts/hair.js`. Un solo `Path2D` cerrado, en este orden:

1. **Silueta de arriba** — elipse muestreada en `n = topSpikes*2` puntos. Los índices
   impares salen disparados hacia fuera (`topSpikeDepth`) y eso hace los picos. El sesgo
   `spikeSide`/`spikeAsym` los apaga en un lado.
2. **Flequillo** — zigzag de derecha a izquierda sobre una línea base.
3. `closePath()`.

Aparte, **dos piezas laterales** (`sidePath()`), objetos independientes, que se rellenan
recortadas a la silueta de la cabeza.

La pieza clave es `baseline(u)`, con `u` de −1 (izquierda) a +1 (derecha):

```js
baseline(u) = fringeY
            + (sideY - fringeY) * u**4   // caída en las sienes
            + bow * (1 - u*u)            // curva del flequillo
            + tilt * u                   // barrido diagonal
```

La usan **los dos tramos**: el flequillo directamente, y la cúpula como
`y = baseline(cos a) - sin(a) * (domeH + pico)`. Así los extremos de la cúpula caen justo
donde arranca el flequillo. `domeH = baseline(0) - topY`.

## Qué se intentó en esta sesión, y qué NO repetir

Tres cambios encadenados. Los dos primeros arreglaron fallos reales; **el tercero es el que
dejó el pelo peor que al principio**.

1. **Caída lateral con `u**6`** para que no hundiera el centro. → Con 20–30 tramos, `u**6`
   resuelve toda la caída en dos muestras y sale un **acantilado**. Corregido a `u**4`.
   *No volver a subir el exponente sin subir también el muestreo.*

2. **Línea base compartida** entre cúpula y flequillo. → Arregló un **muro vertical** real:
   antes la cúpula acababa en `fringeY` y el flequillo arrancaba en
   `fringeY + caída + barrido`, con un salto de hasta 330 unidades entre ambos. *Este
   arreglo hay que conservarlo.*

3. **Pero se coló el alto de la cúpula en esa base.** `domeH` se medía desde `fringeY`, así
   que la curva y el barrido bajaban también el punto más alto y el pelo dejaba la
   coronilla al aire. Se corrigió a `domeH = baseline(0) - topY`. **Eso tapó la coronilla
   pero no las esquinas**, que es el estado actual.

La lección: el fallo era **un empalme entre dos tramos** y se atacó cambiando **cómo se
construye la cúpula entera**. Demasiado alcance.

## La solución que propondría

**Dejar de construir la cúpula como una elipse independiente y derivarla de la propia
cabeza.** Así encaja por construcción, con cualquier radio de esquina y cualquier
asimetría, en vez de depender de que el vuelo sea suficiente.

Dos caminos, de menos a más trabajo:

### A — inflar el path de la cabeza (rápido, robusto)

La masa = *(silueta de cabeza escalada un poco desde su centro)* recortada a *(por encima
de la línea del flequillo)*, y encima los picos.

```js
ctx.save()
ctx.translate(headBox.cx, headBox.cy)
ctx.scale(1 + k, 1 + k)          // k ~ overhang
ctx.translate(-headBox.cx, -headBox.cy)
ctx.fill(geo.path)               // garantizado: contiene a la cabeza
ctx.restore()
```

Cubre siempre. Lo que hay que resolver es cómo cortarlo por abajo con el flequillo
dentado — probablemente recortando a un `Path2D` construido con la `baseline` actual.
Los picos de la silueta habría que añadirlos como una segunda pasada.

### B — construir la cúpula desde los puntos de la cabeza (más limpio)

`head.build()` ya devuelve `pts` (el polígono sin redondear) y conoce los radios. Exponer
también los radios y construir la cúpula del pelo con los **mismos puntos desplazados hacia
fuera**, aplicando los picos sobre esa forma. El pelo hereda la geometría de la cabeza en
vez de aproximarla.

Es más código pero deja el pelo atado a la cabeza de verdad, que es lo que falla ahora.

**Recomendación:** empezar por A para confirmar la hipótesis en cinco minutos. Si el defecto
desaparece, decidir si A vale como solución definitiva o se hace B.

## Antes de tocar nada: verificar la hipótesis

Vale la pena medirlo en vez de darlo por bueno. En la consola de `compose.html`:

```js
// ¿sobresale la cabeza del pelo por alguna esquina de arriba?
// Muestrear puntos del contorno de la cabeza por encima del flequillo y comprobar
// si caen dentro de la elipse de la cúpula.
```

Un atajo visual más rápido: subir `Asimetría` al máximo y `Radio cúpula` al mínimo
(esquinas más cuadradas). Si la hipótesis es buena, la franja de piel se dispara.

## Lo que NO hay que tocar

Estas piezas están verificadas en esta sesión y funcionan. Si el arreglo del pelo las
rompe, es que el arreglo está mal:

- **La costura cúpula/flequillo.** Los dos tramos comparten `baseline` y cierran sin salto.
- **Los laterales van recortados a la cabeza.** Sin eso se salen de la silueta por donde la
  mandíbula se estrecha y quedan colgando sobre el fondo.
- **El vuelo incluye la asimetría** (`geo.lean`), o el pelo se queda corto por el lado
  hacia el que se inclina la cabeza.
- **El reparto de ancho entre ojos y laterales**, en `character.js`. Sin él se montan.
  Cuando al lateral no le queda sitio decente **no se dibuja**: mejor sin patilla que con
  un hilo de tinta bajando por el borde de la cara.
- **La barba no crece sobre la nariz.**

## Contexto rápido del proyecto

- `python3 serve.py` — **no** `python3 -m http.server`, que no manda `Cache-Control` y
  sirve módulos viejos de caché.
- `previews/compose.html` — panel con todas las variables. `previews/eye-lab.html` —
  laboratorio del ojo. `index.html` — la rejilla animada.
- Los rangos de sorteo son **datos** en el `PARAMS` de cada módulo. El panel los edita y
  `copiar rangos` los exporta para fijarlos en el código.
- Toda relación entre partes vive en `src/core/character.js`. Los módulos son ciegos entre
  sí. Las alturas se resuelven **todas antes de dibujar**, porque las orejas van en la
  primera capa pero dependen de los ojos, que son de las últimas.
- El resto del detalle está en `CLAUDE.md`.
