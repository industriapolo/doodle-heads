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
  hover** (atención, con doble parpadeo) y **al click** (sorpresa o alegría, a suertes),
  y al pulsar a uno **los vecinos se giran a mirarlo** 900 ms (`lookAtAll`, radio 700 px).
  Re-sortear un personaje ya no es el click: es el botón ↻ de su celda. El rig no sabe
  que existe un ratón — el index traduce píxeles a objetivo y llama a
  `react(a, nombre, rig.now())`.
- **Reacciones** (`REACTIONS` en `rig.js`): tabla APARTE de la deriva, con envolvente
  propia (ataque/sostenido/suelta) y canales que la deriva no tiene — `eyeOpen` (el ojo
  se abre en la sorpresa, se cierra al reír), `cigDrop` (el cigarrillo se despega del
  labio y la boca puede abrirse) y `bounce` (golpe de escala del dibujo, lo pinta el
  host desde la barbilla).
- **Dibujo en dos mitades**: `drawStatic` (capas 0–4) y `drawLive` (5–13); el index
  cachea la primera por personaje. `draw` sigue siendo la cara entera, y es lo que usan
  las previews y los tests. Medido: repintar las capas vivas de los 30 cuesta 10 ms
  frente a 52 la cara entera.
- **Voz** (`src/parts/voice.js` + `src/anim/speech.js`): cada personaje habla en un
  balbuceo sin idioma sintetizado por código, sin un solo asset de audio. La frase es un
  dato (sílabas con tono, apertura y ataque); tocarla es del host. En el index, click =
  reacción + frase, y la boca la sigue. Botón «sonido» en la cabecera, y ♪ por celda para
  re-sortear solo la voz. La receta de síntesis está **elegida y cerrada** (pulso glotal,
  articulación con cierre, melodía de curva): ya no hay ejes ni banco de comparación.
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

Ordenado por lo que bloquea a lo demás, no por tamaño.

1. **Sacar el script del index a módulos de host.** Son ~460 líneas de script en un
   solo fichero, y es el host de TODO: formato de seeds, turnos de frase, doble
   caché de capas, bounce, coro, audio perezoso, tres fuentes de estilo. Cada capa
   nueva cae ahí. Toca hacerlo justo ANTES de la siguiente capa que lo engorde, sin
   mover ni una responsabilidad de sitio. (`rig.js`, con 644 líneas, no tiene el
   mismo problema: es largo pero es una sola cosa, el tiempo de la cara.)
2. **Personalidades como datos.** Hoy la deriva (`MOODS`) y las reacciones
   (`REACTIONS`) son iguales para los treinta. Que un personaje sea más nervioso o
   más plácido debería ser un juego de bandas suyo, como su cara y su voz — y por
   tanto salir de su seed. Es la continuación natural de `voiceSeed`.
3. **Busto.** Cuello y hombros: es lo que convierte una cabeza flotante en alguien.
   El esqueleto de la referencia 4 (brazos de línea, camiseta con gráfico) es el
   modelo.
4. **Trabajo de ojo de Jorge**, que no bloquea a nadie pero lleva esperando desde
   Fase 1: el «test del tercero» contra las referencias (criterio §8 del kickoff), y
   capturar como configuraciones las bandas que salgan buenas. Compose con las refs
   abajo, forzar arquetipos, guardar seeds con ★.

Del backlog de Fase 2 siguen en pie el export PNG por seed, los props sobre la cabeza
(la frente bajo la cúpula alta está reservada para eso) y la escena con viñeta
circular. Lo que **no** está en pie es «integración con el juego»: el generador es
independiente y no se orienta a ninguna experiencia concreta — puede acabar en
cualquiera, y atarlo a una decidiría hoy cosas que no hay que decidir.

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
- **Cómo se afina la voz**: `previews/voice.html`. «recorrer» toca las treinta seguidas
  con 0,4 s de silencio — es la prueba de conjunto: que no se confundan entre sí y que
  ninguna chirríe de más. «misma frase» clava el turno en 0, así que cada pasada dice
  exactamente lo mismo que la anterior; sin eso no se sabe si lo que cambió fue el slider
  o el sorteo. **«A/B»** toca la frase 0 del personaje bajo el ratón con la receta vieja
  (`src/anim/_archivo/speech-v1.js`) y luego con la de ahora: comparar de memoria no vale,
  entre una escucha y la siguiente el oído se acostumbra. Las bandas se copian con
  «copiar rangos» como las de cualquier parte.
  Aquí NO hay test que valga: si suena bien o mal lo dice el oído de Jorge. Claude solo
  puede medir con un OfflineAudioContext, y con cuidado — la derivada de la onda está
  dominada por la propia fuente, y un salto de amplitud medido en un ataque de ruido solo
  mide el ruido. Lo que sí distingue un click: el salto de un seguidor de picos EXCLUYENDO
  los ataques. Y la lección que costó dos rondas: para cambiar la receta hay que poder
  comparar A/B **el mismo material**, o no se está midiendo ningún eje. El banco que se
  usó para elegirla está en el commit `dfc1636` por si hay que rehacerlo.
- **Otra voz sin tocar la cara**: el botón ♪ de cada celda del index re-sortea solo
  `voiceSeed`. La cara no se mueve y la caché de capas estáticas no se tira.
- Seeds buenos: ★ en el index → «guardados · copiar» → pegar a Claude. El formato es
  `seed` a secas, o `seed:voiceSeed` (hex) cuando la voz se ha re-sorteado con ♪. Se leen
  los dos, y solo se escribe el largo cuando hace falta: una lista de caras sin tocar la
  voz sigue siendo lo que era.
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
- **La deriva y las reacciones NO comparten calibración**: `MOODS` está afinado para que
  treinta caras hagan muecas de fondo sin cansar; con esos mismos números, contestar a un
  click no se ve. Si una reacción «no se percibe», mirar `REACTIONS`, no `MOODS`.
- **Un canal nuevo del rig se declara AL FINAL de su PARAMS**: el orden de declaración es
  el orden de las tiradas del rng (`sample` pide una por entrada, banda cerrada incluida),
  así que meterlo en medio corre la secuencia de todo lo que va detrás y repinta esa parte
  en todas las seeds guardadas.
- **Una sombra es algo que le pasa a la PIEL**: `skinDeep` es más oscuro que la piel pero
  más CLARO que la tinta, así que cualquier sombra pintada sobre la barba de masa no
  oscurece — abre un agujero claro. La barba se pinta la primera de `drawMass` y las
  sombras van después, así que hay que descontarla del recorte a mano (ya se hace con la
  sombra proyectada del pelo). Con la barba de rayitas no pasa: ahí debajo hay piel.
- **El ruido del sintetizador es determinista** (mulberry32, no `Math.random`). Con ruido
  aleatorio la misma frase sonaba distinta en cada recarga: inofensivo al oído, pero hace
  imposible saber si un cambio mejoró algo o solo cambió el ruido. Costó dos medidas
  contradictorias descubrirlo.
- **`.nojekyll` en la raíz es imprescindible**, y está vacío a propósito (GitHub Pages
  solo mira que exista). Sin él, Pages pasa el repo por Jekyll, que ignora todo lo que
  empieza por `_`: desaparecerían `previews/_template.js`, `previews/_scene.js` y
  `previews/_archivo/`, y las previews publicadas se romperían sin que el repo local diera
  ninguna señal. Si alguna vez las previews fallan solo en la URL publicada, mirar eso.
- **El generador no carga Web Audio**: `speech.js` solo lo importan `index.html` y
  `previews/voice.html`. Dibujar una cara no puede depender de que exista un
  AudioContext, y un AudioContext no se puede crear fuera de un gesto del usuario.
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
