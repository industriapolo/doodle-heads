# HANDOFF — estado del proyecto (ago 2026)

Documento para arrancar sesión nueva. La arquitectura y las reglas viven en
`CLAUDE.md` — esto es el estado: qué hay, qué queda, y cómo se trabaja.

## Qué hay (Fase 1 del kickoff: completa)

- **Generador**: 30 caras únicas y reproducibles por seed, mismo estilo de mano.
  Composición en `src/core/character.js`; un módulo por parte en `src/parts/`.
- **Masas de pelo**: pelo, barba, melena y moño son casquetes del contorno real de la
  cabeza (`shellBetween` en `src/style/stroke.js`). Cuatro flequillos (`pico`, `curva`,
  `curva-picos`, `cortinas`), mechones claros opcionales, crestas, palillos de moño.
  La historia de por qué se llegó aquí: `HANDOFF-pelo.md`.
- **Arquetipos** (`src/core/archetypes.js`): `clasico`/`mujer` correlacionan partes
  poniendo bandas DEBAJO de las del panel. Regla clave: una banda del panel solo pisa
  al arquetipo si difiere de la declarada del módulo — donde está de fábrica, manda el
  arquetipo — y como el panel ya solo guarda lo que difiere, «de fábrica» y «no tocado»
  son lo mismo. Mujer = melena/moño/cortinas + ceja fina + labios + pestañas + rubor/pecas
  + cara estrecha, todo sesgos, nada muros.
- **Rig** (`src/anim/rig.js`): parpadeo, mirada, y ánimo de 10 estados con nombre (un
  solo estado con 5 canales: cejas tilt/lift/raise + boca curve/open) — mayoría del
  tiempo en neutro, excursiones con retorno. Reloj propio: `startRig` devuelve
  `{ now, running, pause, resume, stop }` y pausar lo congela. Humo del cigarro
  (`src/anim/smoke.js`): una línea ondulante a 25fps sobre blit de la cara cacheada. Con
  cigarrillo, la boca anula la apertura y atenúa la curva.
- **Interactividad del coro** (index): los treinta **miran al puntero**
  (`a.gazeTarget`, suavizado exponencial; `eyes.pupilX`/`pupilY`), **reaccionan al
  hover** (atención) y **al click** (sorpresa o alegría, a suertes). Re-sortear un
  personaje ya no es el click: es el botón ↻ de su celda. El rig no sabe que existe un
  ratón — el index traduce píxeles a objetivo y llama a `react(a, nombre, rig.now())`.
- **Dibujo en dos mitades**: `drawStatic` (capas 0–4) y `drawLive` (5–13); el index
  cachea la primera por personaje. `draw` sigue siendo la cara entera, y es lo que usan
  las previews y los tests. Medido: repintar las capas vivas de los 30 cuesta 10 ms
  frente a 52 la cara entera.
- **Estilo global en la paleta**: color paramétrico HSL, grano+viñeta
  (`src/style/finish.js`), trazo `lapiz` opt-in (dash+alpha+repaso, en `stroke.js`).
- **Configuraciones** (`previews/configs.js`): DIFFS con nombre contra las bandas
  declaradas — «Póster granulado» + los 4 esquemas clásicos (solo color). Desplegable en
  los paneles y en el index. Cargar una manda sobre los módulos que NOMBRA (se resetean
  a declarado y se les aplica su diff); los que no nombra se quedan como estén.
- **Index**: grid responsive a prueba de pantalla (el canvas fluye como imagen; el
  aire vive dentro del dibujo), selector de fuente de estilo (composer en vivo /
  configuración con nombre), seeds guardados con ★ y copiar al portapapeles.

## Qué queda

1. **Calibración fina contra las referencias** — el «test del tercero» (criterio §8
   del kickoff). Trabajo de ojo de Jorge: compose con las refs abajo, forzar
   arquetipos, guardar seeds ★ y capturar bandas buenas como configuraciones.
2. **Fase 2 del kickoff** (sin empezar): export PNG por seed desde el index; props
   sobre la cabeza (nubes, árboles, skyline — la frente bajo la cúpula alta está
   reservada para esto); escena con viñeta circular; cuerpo completo; integración
   con el juego.

## Cómo se trabaja

- `python3 serve.py` — arranca en el 8137, que es el puerto de siempre (ya es el
  default; no hace falta pasarlo). NUNCA `python3 -m http.server` (caché, ver
  CLAUDE.md), y nunca dos puertos a la vez: `localStorage` es por origen.
- `previews/compose.html` — panel completo. `previews/hair.html` — pelo/barba
  aislados. `head`, `eyes`, `brows`, `mouth` y `hatching` — partes sueltas.
  `index.html` — rejilla viva. En `previews/_archivo/` queda `eye-lab.html`: es el
  laboratorio con el que se diseñó el ojo, con su propia copia de PARAMS. Esa
  construcción ya vive en `eyes.js` y la preview viva es `eyes.html`, así que el
  laboratorio se lee, no se toca.
- `node --test` desde la raíz — determinismo, contrato de PARAMS, estadística de
  arquetipos sobre 2000 seeds y los TIEMPOS del rig. Sin dependencias. Cubre el SORTEO y
  la animación, no el dibujo; lo geométrico sigue siendo el ray-casting en la consola de
  compose. `node --test test/` NO vale en Node 25 (el directorio como posicional
  revienta): sin argumentos.
- **Cómo se prueba la interactividad.** El rAF no dispara en el navegador de Claude, así
  que ahí NO se ve moverse nada: la animación se comprueba simulándola —`advance(a, t)`
  frame a frame, `react(a, nombre, t)`, `mirarA({x, y})` desde `window.__rig`— y midiendo
  el estado, o con los tests de `test/rig.test.mjs`, que sustituyen el rAF por una cola
  gobernada por el test. Lo que se mueve de verdad hay que mirarlo en Chrome: dejar
  `python3 serve.py` levantado y abrir `index.html`. El contador de la cabecera es el
  juez — fps y caras repintadas por frame.
- Ciclo de dirección de arte: afinar bandas en compose → «copiar rangos» → pegar a
  Claude con un nombre → queda como configuración en `previews/configs.js`.
- Seeds buenos: ★ en el index → «guardados · copiar» → pegar a Claude.
- El index en modo «estilo: composer» se sincroniza en vivo con el panel (evento
  storage + focus). OJO: localStorage es por ORIGEN — un solo servidor levantado, o
  composer e index pueden mirar almacenes distintos.

## Trampas conocidas (no reaprender por las malas)

- **Panel vs arquetipo**: el panel y las configuraciones guardan SOLO lo que difiere de
  la banda declarada por el módulo (`touchedBands` en `params.js`), y ese diff es lo
  único que pisa al arquetipo — donde el panel está de fábrica, manda el overlay. Si un
  rasgo opt-in "no sale", mirar qué filas del panel llevan punto magenta: son las
  tocadas, y una de ellas lo está pisando. El ↺ de la fila la devuelve a fábrica.
  Escribir una banda de fábrica dentro de una config apaga el arquetipo en ese parámetro
  sin decirlo: por eso «copiar rangos» exporta solo lo tocado.
  (Hasta ago 2026 el panel persistía TODAS las bandas y el diff era un `JSON.stringify`
  exacto: sumar 1e-8 a una probabilidad hundía la melena en mujeres del 85 % al 10 %, y
  medio paso de slider hacía lo mismo sin que nadie tocara nada. Cerrado — hallazgo 2 de
  `AUDITORIA-2026-08-28.md`, con test en `test/character.test.mjs`.)
- **Opciones opt-in con peso 0** (labios, ceja fina, lápiz, cortinas en hombres): el
  panel les da peso 1 al marcarlas (`|| 1`, no `?? 1` — hubo bug).
- **setupCanvas fija width/height inline en px**: cualquier host que quiera canvas
  fluido debe pisar ese inline (el index lo hace). Fue LA causa de meses de "cards
  que se solapan".
- **El rAF no dispara en el panel de navegador de Claude**: la animación se valida
  simulando `advance(a, t)` a mano o en Chrome de verdad. Ese panel además reporta
  `innerWidth: 0`, así que el grid colapsa a una columna y las medidas de posición de
  celda que salgan de ahí no valen para nada.
- **Un canal nuevo del rig se declara AL FINAL de su PARAMS**: el orden de declaración es
  el orden de las tiradas del rng (`sample` pide una por entrada, banda cerrada incluida),
  así que meterlo en medio corre la secuencia de todo lo que va detrás y repinta esa parte
  en todas las seeds guardadas.
- **Una sombra es algo que le pasa a la PIEL**: `skinDeep` es más oscuro que la piel pero
  más CLARO que la tinta, así que cualquier sombra pintada sobre la barba de masa no
  oscurece — abre un agujero claro. La barba se pinta la primera de `drawMass` y las
  sombras van después, así que hay que descontarla del recorte a mano (ya se hace con la
  sombra proyectada del pelo). Con la barba de rayitas no pasa: ahí debajo hay piel.
- **Blend modes sobre un canvas blitado**: el acabado (grano `overlay`, viñeta `multiply`)
  da unas pocas unidades distintas sobre un canvas que ha recibido un `drawImage` que
  sobre uno pintado del tirón. Invisible, pero es la razón de que el grano del index no
  sea byte a byte el de compose. Sin acabado, el blit es exacto.
- Verificación geométrica de masas: test de cobertura por ray-casting +
  `isPointInPath` en consola de compose (ver historia en `HANDOFF-pelo.md`).

## Estado de git

- `main` = todo lo anterior fusionado (fast-forward desde la rama de trabajo
  `claude/stoic-chandrasekhar-23b928`, ago 2026).
- La versión pre-rediseño del pelo quedó en `390037a` por si hay arqueología.
