# Auditoría — doodle-heads (28 ago 2026)

Alcance: código (`src/`, `previews/`, `index.html`, `serve.py`), documentación (`CLAUDE.md`, `HANDOFF*.md`, kickoff), estado de git y del directorio. 4.911 líneas, cero dependencias. Además del código leído, se ejecutó un harness en Node sobre `makeCharacter` (2.000 seeds) para medir determinismo, rangos y distribución de rasgos; los porcentajes de abajo salen de ahí.

## Veredicto

El proyecto está sano y es coherente con su propia arquitectura: un módulo por parte, rangos como datos, coherencia entre partes centralizada en `character.js`, estilo en `src/style/`, determinismo por seed (verificado: misma seed → mismo objeto), y todos los `range` declarados caen dentro de sus `min/max`. La Fase 1 del kickoff está cumplida en lo técnico. Lo que hay son tres problemas de fondo que conviene cerrar antes de Fase 2, y una capa de deuda menor.

## Hallazgos por prioridad

### 1. El arquetipo `mujer` sortea melena y moño que luego no se dibujan (alta)

`drawBack` y el moño exigen `mode: 'solid'`, pero el overlay de `mujer` deja `radial: 1` en el pool de modo (`archetypes.js:40`). Resultado medido: un 6,7 % de todos los personajes lleva `backHair: true` invisible y un 2,1 % un moño invisible; dicho de otro modo, una de cada seis mujeres pierde el marcador principal del arquetipo. Decisión tuya: o `radial: 0` en el overlay de mujer (lo más simple, coherente con las cuatro refs, todas de masa), o que la melena no exija corona sólida (CLAUDE.md lo descarta: «peluca flotando»).

### 2. La trampa panel/arquetipo es más fina de lo que dice el HANDOFF (alta) — CERRADO (29 ago 2026)

El diff contra las bandas declaradas es exacto (`JSON.stringify`). Medido: con `backHair.p = 0.12` (fábrica) las mujeres llevan melena el 85 %; con `p = 0.12000001` cae al 10 %. Cualquier roce de un slider, o cambiar un `range` en el código con bandas viejas en `localStorage`, pisa el arquetipo sin ninguna señal. Además `configs.js` guarda TODAS las bandas (`poster-granulado` incluye `head.ratio: [0.58, 0.82]`, que es fábrica): en cuanto cambies un rango declarado, esa config lo «toca» y anula el arquetipo en ese parámetro.

Propuesta: que el panel persista y exporte solo lo que difiere de lo declarado (el `declared()` ya existe en `_template.js`), marcando visualmente las filas tocadas con un botón de reset por fila. Con eso el diff en `character.js` deja de ser una trampa y pasa a ser el contrato.

**Cerrado el 29 ago 2026.** La comparación vive ahora en `touchedBands` (`src/core/params.js`), una sola, y la usan `character.js`, el panel y las configuraciones. Con tolerancia: medio paso de slider en los numéricos —que es lo que el navegador cuadricula él solo al asignar el valor de un `input[type=range]`, y lo que hacía nacer tocadas a `hair.fringeShadow` y `glasses.bridgeDrop`—, 1e-6 en las probabilidades, exacta en los pesos. El panel persiste y exporta solo el diff, marca cada fila tocada con un punto y le pone un ↺; al cargar, un almacén viejo se migra pasándolo por la misma función (medido en compose: 4.350 bytes con las 173 bandas → 31 con el único toque de verdad, y las claves obsoletas fuera). `poster-granulado` migrada de 148 bandas a 46 —`head.ratio` incluido—, y la regla de carga de una config (manda sobre los módulos que NOMBRA; los que no nombra no se tocan) escrita en la cabecera de `configs.js`.

La medida que abría este hallazgo se da la vuelta: con `backHair.p + 1e-8` la melena en mujeres se queda en 84,9 %, no cae al 10 %. Queda fijado en `test/character.test.mjs` («diff panel / arquetipo»), junto con medio paso de slider, una clave obsoleta de un `localStorage` viejo, y la otra mitad del contrato — con `p: 0.5` el panel tiene que seguir mandando. La regla suelta se prueba en `test/params.test.mjs`, que además barre los módulos reales para que ninguna banda declarada nazca marcada como tocada.

### 3. La verificación vive fuera del repo (media)

El test de cobertura por ray-casting de `HANDOFF-pelo.md` («0 fallos en 190 caras») existe solo como snippet de consola: no está en ningún fichero. Y no hay ningún test automatizable. El harness de esta auditoría demuestra que `makeCharacter` corre en Node sin canvas (solo hay que no tocar `document`), así que un `test/` con `node --test` cuesta poco: determinismo, rangos dentro de topes, pools con claves válidas, el diff panel/arquetipo, y la estadística de rasgos (que es lo que habría detectado el hallazgo 1). El test geométrico de masas puede vivir como `previews/_coverage.js` importable desde consola.

### 4. Rendimiento: el coste por repintado es el del dibujo entero (media) — CERRADO (29 ago 2026)

Cada cambio de cara (parpadeo ≈ 7 frames, ánimo ≈ 42, mirada ≈ 23) re-ejecuta `draw` completo, hatching incluido: `edgeField` crea un canvas, aplica `filter: blur` y hace `getImageData` por cada llamada a `hatch` (hasta dos por cara). Hoy el contador del index lo absorbe, y la decisión de diferir el cacheo de capas sigue siendo correcta; solo dejo apuntado dónde cortar cuando haga falta: las capas 0–4 (melena, orejas, cabeza, hatching, re-trazo) no dependen de ningún canal del rig, y la sombra de cejas es lo único animado que queda por debajo de las masas. Cachear 0–4 como offscreen por personaje es el 80 % del ahorro con el 20 % del trabajo.

Nota aparte: `edgeField` depende de `ctx.filter`, que en Safari viejos no existe; ahí el edge fade desaparece en silencio. Irrelevante mientras la herramienta sea local en Chrome.

**Cerrado el 29 ago 2026, por donde decía el propio hallazgo.** `character.js` exporta ahora `drawStatic` (capas 0–4) y `drawLive` (5–13), y `draw` se conserva como composición de las dos para que las previews y los tests no cambien. El index cachea la estática en un offscreen por personaje y la invalida solo en `reseed`. Medido sobre los 30: repintar las capas vivas cuesta 12 ms frente a 51,9 ms la cara entera, un 77 % menos. Eso es lo que da margen para que los treinta repinten a la vez cuando la mirada sigue al puntero — 10,4 ms por frame, techo de 96 fps.

De paso quedó medida otra cifra que estaba mal en la documentación: en reposo no se animan «una o dos caras de treinta» sino 3,9. No es de este cambio; sumar los tres ciclos (parpadeo, mirada, ánimo) da un 13 % de ocupación por cara.

### 5. El rig se sincroniza al reanudar (baja) — CERRADO (29 ago 2026)

`makeActor` reparte los desfases iniciales en ms absolutos del reloj de rAF. Tras «pausar»/«reanudar», todos los temporizadores quedan en el pasado y los 30 parpadean, miran y cambian de ánimo en el mismo frame; luego se vuelven a dispersar. Arreglo: que `startRig` mida el tiempo desde su propio arranque, o que al reanudar desplace los `*From/*Next` por la duración de la pausa.

**Cerrado el 29 ago 2026** por la primera de las dos vías. `startRig` cuenta desde su propio arranque y devuelve el mando del bucle (`{ now, running, pause, resume, stop }`) en vez de una función de parada; pausar congela el reloj y reanudar lo continúa. `redraw` recibe también ese tiempo, no el del navegador: el humo se mide con `a.smokeAt` en la misma escala y si no, la voluta pegaría un salto en cada reanudación.

La cifra del hallazgo, verificada antes de tocar nada: en el primer frame tras reanudar, 30/30 parpadeando, 27/30 moviendo la mirada y 20/30 cambiando de humor. El test (`test/rig.test.mjs`) sustituye el rAF por una cola gobernada por el test, que es lo que permite mentirle al rig sobre el reloj del navegador, y se escribió en rojo antes del arreglo.

### 6. Deriva entre documentación y código (baja)

- `HANDOFF-pelo.md` dice «marco de dibujo a 0.99»; `index.html` usa 0.86 (7 % de margen por lado).
- `CLAUDE.md` habla de `previews/*.js`; son `.html`. Y la regla «una preview por módulo» no se cumple para nariz, orejas, barbilla, mejillas, gafas ni paleta (los cubre `compose`). O se relaja la regla en el doc o se añaden.
- `serve.py` arranca en 8080 por defecto; el HANDOFF manda 8137. Con `localStorage` por origen, dos servidores en puertos distintos es exactamente la trampa que el propio HANDOFF avisa. Poner 8137 como default cierra el agujero.
- `HANDOFF.md` presenta `eye-lab.html` como preview de parte suelta. Es un laboratorio con su propia copia de PARAMS («No toca eyes.js»), previo a integrar la construcción en `eyes.js`. Ya integrada, es un duplicado que va a derivar; `eyes.html` ya cumple su papel. Archivar o borrar.

### 7. Higiene del repo (baja)

- `.claude/worktrees/stoic-chandrasekhar-23b928/` es una copia completa del repo (1,4 MB, refs incluidas) de una worktree que git marca `prunable`. `git worktree prune` y borrar el directorio.
- Cuatro capturas de pantalla del 18 ago en `referencias/` sin trackear y sin usar en ninguna preview. Decidir: entran en la lista de `refs` de `compose.html` o se borran.
- Exports sin ningún uso: `pickPalette`, `WOBBLE`, `subBox`, `defaults`, `fillAndStroke`, `smoothPath`. Y un `// eslint-disable-line` en `hair.js:399` sin ESLint en el proyecto.
- Los salts de `rng.fork` (1…14) están duplicados a mano entre `makeCharacter` y `draw` (`character.js`), con 8 y 13 usados solo en `draw`. Reutilizar uno por error correlaría el sorteo de una parte con el jitter de dibujo de otra sin que nada avise. Una constante `SALT = { head: 1, ears: 2, … }` lo resuelve.

### 8. Observaciones de sorteo (sin acción obligatoria)

`directional` tiene peso 0 en el pool de pelo, así que `hairAngle` es un parámetro muerto por defecto. El cigarrillo sale igual en mujeres (43 %) que en hombres; la fumadora lo avala, pero es una decisión de estilo que conviene tomar a conciencia. Mujeres con barba: 0 casos en 2.000 seeds, como debe ser.

## Distribución medida (bandas de fábrica, 2.000 seeds)

| Rasgo | % |
|---|---|
| Arquetipo clásico / mujer | 59,5 / 40,5 |
| Pelo solid / radial / bald | 66,0 / 24,8 / 9,2 |
| Cigarrillo | 43,5 |
| Gafas | 27,6 |
| Barba de masa | 11,2 |
| Melena sorteada e invisible | 6,7 |
| Moño sorteado e invisible | 2,1 |

## Orden sugerido

Primero el 1 (una línea) y el 7 (limpieza mecánica). Después el 2 y el 3 juntos, porque el test del diff panel/arquetipo es lo que impide que el 2 vuelva. El 5 y el 6 son ratos sueltos. El 4 se queda como está hasta que el contador del index diga lo contrario. Con eso el repo queda listo para arrancar Fase 2 (export PNG por seed, props sobre la frente) sin deuda arrastrada.
