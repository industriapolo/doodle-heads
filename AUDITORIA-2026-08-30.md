# Auditoría — doodle-heads (30 ago 2026)

Segunda auditoría. La primera (28 ago, `AUDITORIA-2026-08-28.md`) cubrió el generador; desde entonces han entrado 27 commits en cinco frentes: contrato del panel, interactividad, reacciones, voz y dos vueltas de afinado de la voz. Esta cubre lo nuevo: `rig.js` (644 líneas), `speech.js` (450), `voice.js` (205), `index.html` (539), y sus tests (1.430 líneas, 30 suites, todo en verde). Se ejecutaron además verificaciones en Node sobre 500–2.000 seeds; los números de abajo salen de ahí.

## Veredicto

La salud del proyecto es mejor que hace dos días, y no solo porque haya más: la disciplina ha subido. Los commits de la voz documentan sus propios diagnósticos fallidos («arreglé lo que sabía medir y no lo que suena mal»), los cambios de receta mantienen el orden de tiradas del rng para que un A/B mida un solo eje, y las fronteras se han respetado en todas las capas nuevas: el rig no sabe que existe un ratón ni un altavoz, el generador no carga Web Audio, y compose sigue intacto. No hay ningún bug funcional que reportar. Lo que hay es **un estado provisional deliberado** (la voz) cuyo cierre depende de tu oído, no de más código, y algo de crecimiento que pide orden antes de la siguiente capa.

## Hallazgos

### 1. La voz está en un compás de espera que solo tú puedes cerrar (la prioridad)

El banco de recetas de `voice.html` es, por declaración propia del commit, «andamio, no arquitectura»: cinco recetas sobre tres ejes (fuente glotal, articulación, melodía continua), la v1 archivada como referencia del A/B, y `createSpeech`/`phrase` con opciones que solo existen para poder comparar. Todo eso debe desaparecer cuando elijas.

Los datos que hay para tu decisión: la melodía continua reduce el salto de tono entre sílabas de 2,46 a 0,52 semitonos (verificado en esta auditoría sobre 500 seeds, mismo material salvo el tono), y el silencio entre sílabas de la receta glotal está en el rango de la v1 que sí sonaba articulada.

Mientras tanto hay una **incoherencia real**: el index toca `glotal` a secas (melodía de saltos), pero el banco de `voice.html` arranca por defecto en `glotal+melodía`. Lo que audicionas en la preview no es lo que suena en el index. No es un bug — el commit lo declara provisional — pero significa que la comparación que hagas en la preview no describe el producto hasta que se consolide.

La sesión de cierre, cuando tengas la receta elegida: fijarla como única (sin `opts` en `createSpeech` ni `melodia` en `phrase`), borrar el banco, `speech-v1.js` y el A/B, y dejar `voice.html` como preview de afinado normal (bandas + recorrer + misma frase). Es una sesión corta y deja el módulo en el estado del resto del proyecto.

### 2. Los documentos de estado se han quedado atrás (media)

`HANDOFF.md` está actualizado en «Qué hay» pero su «Qué queda» es el de hace una semana: no menciona la decisión de la voz (que es EL pendiente real), y sigue listando «integración con el juego» dentro de Fase 2 cuando decidiste que este proyecto es independiente del juego musical y no debe orientarse ahí. El kickoff arrastra la misma frase. Es el tipo de deriva que la primera auditoría encontró en pequeño y que conviene cortar pronto: el HANDOFF es lo que arranca cada sesión nueva, y un pendiente equivocado ahí acaba en trabajo equivocado.

### 3. `index.html` está llegando a su techo como fichero único (media)

539 líneas de las cuales ~460 son script: formato de seeds guardados con voz (`seed:voiceSeed`), turnos de frase, doble caché de capas, transformación del bounce, coro, audio perezoso, tres fuentes de estilo. Sigue siendo legible porque está bien comentado, pero es el host de todo y cada capa nueva cae aquí. Antes de la siguiente que lo toque (murmullo de fondo, personalidades), vale la pena sacar el script a módulos de host — `src/host/` o simplemente `index.js` — sin cambiar ni una responsabilidad. `rig.js`, con 644 líneas, no tiene el mismo problema: es largo pero es una sola cosa (el tiempo de la cara), y partirlo hoy separaría cosas que se leen juntas.

### 4. Detalles menores, ninguno urgente

- Cuando el coro termina (los 900 ms de mirar al pulsado), los vecinos vuelven al vagabundeo aunque el puntero siga quieto encima de la página: `mirarA` solo se re-aplica en `pointermove`. Un ratón inmóvil deja de ser mirado tras un click cercano. Arreglo de tres líneas (recordar el último puntero y re-aplicarlo al vencer un `gazeHold`), pero decidir si el gesto actual ya te gusta es previo.
- El doble parpadeo de la atención resetea un parpadeo normal que esté a medias (`react` pisa `blinkAt`). Cosmético e invisible en la práctica.
- `MOOD_NAMES` se exporta y nadie lo importa. La primera auditoría purgó seis de estos; este nació después.
- El `+1e-9` de `params.js` (EPS del panel) sigue pendiente de su arreglo de raíz: que el `sync` inicial del panel no escriba en `bands`. Anotado desde la sesión 2.
- `eyes.js` va por 337 líneas y es el candidato a fichero denso de la próxima tanda de crecimiento (blink, pivot, eyeOpen, pestañas, sombra, comisuras). Nada que hacer aún; vigilarlo.

## Verificado en esta auditoría

Determinismo intacto: `voiceSeed` ausente o igual al seed produce exactamente el personaje de antes; un `voiceSeed` distinto cambia `voice` y nada más. El material de la frase (duraciones, vocales, ataques, aperturas) es idéntico entre los dos modos de melodía, que es lo que hace honesto el A/B. Los topes de Hz no se alcanzan en 500 seeds con bandas de fábrica. Los 339→ tests actuales pasan en 0,6 s.

## Orden sugerido

1. **Tu oído**: sesión de escucha en `voice.html` con el banco, y elegir receta. Sin eso, todo lo demás de voz está congelado.
2. **Consolidación de la voz** (hallazgo 1) + poner al día HANDOFF y kickoff (hallazgo 2) en la misma sesión: cerrar y documentar el cierre es un solo movimiento.
3. **Extraer el script del index** (hallazgo 3) justo antes de la siguiente capa de host, no antes.
4. Los menores del hallazgo 4, como relleno de cualquier sesión que pase por esos ficheros.

Después de eso, el camino que quedó acordado: personalidades como datos, busto, y los dos trabajos de ojo que siguen esperando desde Fase 1 — el «test del tercero» contra las referencias y la captura de configuraciones buenas.
