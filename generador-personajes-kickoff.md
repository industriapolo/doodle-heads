# Generador procedural de personajes — Documento de arranque
**Proyecto:** doodle-heads (nombre de trabajo) · **Versión:** v0.1 · **Fecha:** 2026-08-15
**Referencia:** técnica del hilo de @albertobeicas (Canvas 2D + three.js, cero assets, Claude como par de programación dirigido por referencias visuales)

---

## 1. Objetivo y alcance

**Fase 1 (este documento):** generador procedural de cabezas/personajes en el estilo gráfico de Jorge — línea vectorial uniforme, rellenos planos, paleta duotono, textura por hatching. Resultado final: una página que renderiza un grid de N personajes únicos (seed aleatoria) con animación de vida (parpadeo, humo, flotación sutil).

**Fuera de alcance en Fase 1:** props de escena (nubes, árboles, ciudad, viñeta circular), cuerpos completos, exportación, interactividad más allá de regenerar. Se listan como Fase 2 al final.

**Regla de oro:** cero assets de imagen. Todo se dibuja por código sobre canvas. Las referencias visuales (las 4 ilustraciones) se usan solo para dirigir a Claude, nunca se cargan en runtime.

## 2. Principios de arquitectura

1. **Un módulo por parte.** Cada parte del personaje es un archivo independiente que exporta una función `draw(ctx, params)`. Nunca un monolito.
2. **Una preview por módulo.** Cada módulo tiene su página HTML que renderiza ~30 variantes con seeds distintas y sliders para sus parámetros. Se itera el estilo ahí, aislado, antes de componer.
3. **Params serializables.** Cada parte se define por un objeto plano de parámetros (números, strings, seeds). Un personaje completo = un JSON. Esto permite guardar, reproducir y mutar personajes.
4. **Estilo centralizado.** Grosores de trazo, paletas y motor de hatching viven en `style/` y se importan; ninguna parte hardcodea colores ni grosores.
5. **Determinismo por seed.** Todo random pasa por un PRNG con seed (mulberry32 o similar). Misma seed = mismo personaje, siempre.
6. **Canvas 2D primero, three.js después.** Las partes se pintan en canvas 2D (texturas). three.js entra solo en el módulo de rig/composición (Fase 1.4) para animar. Si la animación resulta viable con canvas 2D puro + requestAnimationFrame, three.js es opcional — decidir en ese momento, no antes.

## 3. Estructura del repo

```
doodle-heads/
├── CLAUDE.md                  # resumen de este documento para contexto de Claude Code
├── index.html                 # grid final de personajes (Fase 1.4)
├── src/
│   ├── core/
│   │   ├── prng.js            # random con seed
│   │   └── character.js       # ensamblaje: params globales → llama a cada parte
│   ├── style/
│   │   ├── palettes.js        # paletas duotono (ver §4)
│   │   ├── stroke.js          # utilidades de trazo: grosor, esquinas, wobble opcional
│   │   └── hatching.js        # motor de rayitas (ver §5)
│   ├── parts/
│   │   ├── head.js
│   │   ├── brows.js
│   │   ├── eyes.js
│   │   ├── nose.js
│   │   ├── mouth.js
│   │   ├── ears.js
│   │   └── hair.js            # pelo/barba vía hatching
│   └── anim/
│       └── rig.js             # estados y timeline de animación
├── previews/
│   ├── _template.html         # base: grid 6×5 de canvases + panel de sliders
│   ├── hatching.html
│   ├── head.html
│   ├── brows.html
│   ├── eyes.html
│   ├── nose.html
│   ├── mouth.html
│   ├── ears.html
│   ├── hair.html
│   └── compose.html           # personajes completos estáticos
└── refs/                      # las 4 ilustraciones (solo para mostrar a Claude, no runtime)
```

Sin bundler ni dependencias en Fase 1: ES modules nativos, se abre con un servidor estático (`npx serve` o similar). three.js, si entra, vía import map desde CDN.

## 4. Sistema de estilo — tokens

Derivado de las 4 referencias:

**Paletas (duotono/monocromo + acento):**
```
verde-noche:   bg #8FBC94 · piel #A8D5AC · línea #1E3A2F · acento #FFFFFF
gris-cian:     bg #4A5459 · piel #C9CFD1 · línea #2B3134 · acento #35E0E0
magenta:       bg #FFFFFF · piel #F2C7DC · línea #4A1230 · acento #E8138C
azul-noche:    bg #111111 · piel #E8E8E4 · línea #1A1A1A · acento #4A7FD4
```
(Valores aproximados de partida — se calibran contra las referencias en la primera sesión con el eyedropper. Cada paleta define además 1-2 tonos intermedios para sombras planas.)

**Trazo:**
- Contorno principal: grosor uniforme, ~5-7px a resolución de trabajo 800×800, `lineJoin: round`, `lineCap: round`.
- Líneas interiores (nariz, párpados, arrugas): ~60% del grosor del contorno.
- `wobble`: parámetro global 0–0.05 que desplaza puntos de los paths con ruido. **Default 0** (acabado vectorial limpio, fiel a las referencias). Se prueba 0.02-0.03 en la preview de ojos y se decide viendo. La decisión se anota en CLAUDE.md.

**Fondo por personaje:** color plano de paleta. La viñeta circular con degradado de las refs es Fase 2.

## 5. Spec por módulo

Cada módulo exporta `draw(ctx, box, params)` donde `box` es el rectángulo asignado por el ensamblador. Parámetros con rango y default. Todos reciben `seed`.

### 5.0 hatching.js (motor, se construye primero)
La textura firma del estilo: rayitas cortas de densidad variable (barba, pelo, orejas, sombreados).
- `angle` (grados, default 15): dirección base de las rayas. Soporta modo `radial` (rayas que irradian de un punto, como el pelo de la imagen 3).
- `density` (0–1): rayas por unidad de área.
- `length` y `lengthJitter`: largo base y variación por raya.
- `angleJitter` (grados): desviación aleatoria por raya (default ±8°).
- `edgeFade` (0–1): la densidad cae hacia el borde de la máscara (como la barba, que se disuelve).
- Recibe una máscara (path) y solo pinta dentro.
- **Criterio de aceptación:** en la preview, una mancha de hatching al lado de un recorte de la barba de la imagen 1 debe leerse como "misma mano".

### 5.1 head.js
Rectángulo redondeado alto, ligeramente asimétrico, contorno grueso.
- `width/height ratio` (0.62–0.78), `cornerRadius` superior e inferior independientes, `asymmetry` (0–0.06, desplaza sutilmente los lados), `jawInset` (estrechamiento inferior opcional, ver imagen 2).
- Relleno: color piel de paleta + zona de sombra plana opcional (mejilla/lateral).

### 5.2 brows.js
Rectángulos negros macizos. El parámetro emocional principal.
- `thickness` (alto de la ceja, generoso: 8–14% de la altura de cabeza), `tilt` (−15° a +15°), `gap` (separación entre cejas), `offsetY` (altura sobre los ojos), `asymmetry` (tilt independiente por ceja).
- Presets de expresión: `neutral`, `cansado` (tilt exterior caído), `molesto` (tilt interior caído), `sorpresa` (offsetY alto).

### 5.3 eyes.js
Párpado caído sobre ojo almendrado, bolsas marcadas, pupila pequeña.
- `lidCoverage` (0.3–0.65, default 0.5): cuánto tapa el párpado.
- `eyeWidth`, `eyeSpacing`, `pupilSize` (pequeña, 10–18% del ojo), `pupilPosition` (mirada, x/y −1 a 1).
- `bagLines` (0–2): líneas de bolsa/ojera bajo el ojo.
- `sclera`: blanco o acento de paleta (los ojos cian de la imagen 2, eléctricos de la 4).
- Es la parte con más estados de animación: ver §6.

### 5.4 nose.js
Una línea en L que baja del entrecejo.
- `length` (larga, 30–45% de la cara), `hookWidth` (ancho del gancho inferior), `tilt` sutil.
- Variante `bridge`: línea vertical de arranque en el entrecejo (imagen 3).

### 5.5 mouth.js
Pequeña y minimal.
- `type`: `line` | `frown` | `tiny-o` | `stitch` (la x cosida de las imágenes 2 y 3).
- `width` (pequeña, 8–18% de la cara), `offsetX` (descentrada opcional).
- `cigarette` (bool): palito blanco con punta de acento + emisor de humo (partícula para §6).

### 5.6 ears.js
Semicírculos laterales con hatching interior.
- `size`, `offsetY`, `hatchDensity` (reutiliza hatching.js).

### 5.7 hair.js
Pelo por hatching sobre la zona superior de la cabeza + barba en mandíbula/mejillas.
- `hairline` (altura y curva), `mode`: `radial` (imagen 3) | `directional` | `bald+fringe`.
- `beardCoverage` (0–1) con `edgeFade` alto.
- Todo delega en hatching.js; este módulo solo define máscaras.

## 6. Composición y animación (Fase 1.4)

**character.js:** recibe `{seed, palette}` → deriva params de cada parte con el PRNG (dentro de los rangos de §5) → layout vertical fijo (proporciones de las refs: cejas al ~38% de altura, ojos al ~48%, nariz 48–70%, boca ~78%) → llama a cada `draw()` en orden (piel → sombras → hatching → rasgos → contorno).

**rig.js — estados de vida:**
- `blink`: párpado a 100% durante 100–140ms, intervalo aleatorio 2–7s por personaje (desincronizado por seed).
- `gaze`: la pupila deriva a una posición nueva cada 3–10s con easing suave.
- `smoke`: si hay cigarrillo, partículas de humo — círculos blancos semitransparentes que ascienden con ruido y crecen (como la voluta de la imagen 1).
- `float`: oscilación vertical sutil de todo el personaje (amplitud 1–2%, periodo 3–5s, fase por seed) — la flotación del esqueleto de la imagen 4.
- Implementación: re-render por frame de las capas dinámicas. Optimización (cachear capas estáticas en offscreen canvas) solo si el grid de 30 va por debajo de 60fps — no antes.

**index.html:** grid responsive de 24–36 personajes, botón "regenerar", click en un personaje = nueva seed solo para él. Cada personaje muestra su seed (para poder guardar los buenos).

## 7. Orden de prompts — Sesión 1 en Claude Code

Cada paso = un prompt. No avanzar al siguiente sin validar la preview en navegador. Adjuntar las 4 referencias en el paso 0 y re-adjuntar la relevante cuando se itere estilo.

0. **Contexto:** pegar CLAUDE.md (versión condensada de este doc) + las 4 imágenes. Pedir solo confirmación de comprensión y dudas, sin código.
1. **Esqueleto:** estructura de carpetas, prng.js, palettes.js con las 4 paletas calibradas contra las imágenes, stroke.js, y previews/_template.html (grid de canvases + sliders autogenerados desde una definición de params).
2. **hatching.js + su preview.** Iterar aquí hasta pasar el criterio de §5.0. Es la base de todo lo demás.
3. **head.js + preview.** Validar silueta y peso del contorno contra las refs.
4. **eyes.js + brows.js + previews.** La sesión de estilo importante. Probar aquí wobble 0 vs 0.02 y decidir. Validar que los presets de expresión de cejas funcionan.
5. **nose.js, mouth.js, ears.js, hair.js + previews.** Con el lenguaje ya calibrado, deberían salir en pocas iteraciones.
6. **character.js + compose.html.** Personajes completos estáticos. Ajustar layout y jerarquía de capas.
7. **rig.js + index.html.** Blink primero (validar que da la sensación de "alive"), luego gaze, float y smoke.

**Feedback de estilo a Claude:** siempre concreto y con la referencia delante. Formato útil: "compara tu output con la imagen N: [diferencia observada]. Ajusta [parámetro/técnica]". Evitar "no me convence" sin diagnóstico.

## 8. Criterios de aceptación de Fase 1

1. Un grid de 30 personajes donde ninguno se repite y todos se reconocen como el mismo estilo/mano.
2. Puestos al lado de las 4 referencias, un tercero no distingue cuáles rasgos son generados y cuáles dibujados (test de la parte, no de la ilustración completa).
3. Parpadeo desincronizado que produce el efecto "they are alive" del hilo.
4. Cada personaje reproducible por su seed.
5. Repo sin un solo archivo de imagen fuera de /refs.

## 9. Fase 2 (backlog, no empezar)

- Props del mundo sobre la cabeza: nubes abullonadas con contorno blanco, árboles paramétricos, skyline, fuente.
- Escena: viñeta circular con degradado, estrellitas ×/+, luna.
- Cuerpo completo (esqueleto de la imagen 4: brazos de línea, camiseta con gráfico).
- Export a PNG/SVG por personaje; export de spritesheet.
- Conexión con Harmonices/juego .io: personajes como unidades, estados de animación por acción.
