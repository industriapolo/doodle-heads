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
  arquetipo. Mujer = melena/moño/cortinas + ceja fina + labios + pestañas + rubor/pecas
  + cara estrecha, todo sesgos, nada muros.
- **Rig** (`src/anim/rig.js`): parpadeo, mirada, y ánimo de 10 estados (un solo estado
  con 5 canales: cejas tilt/lift/raise + boca curve/open) — mayoría del tiempo en
  neutro, excursiones con retorno. Humo del cigarro (`src/anim/smoke.js`): una línea
  ondulante a 25fps sobre blit de la cara cacheada. Con cigarrillo, la boca anula la
  apertura y atenúa la curva.
- **Estilo global en la paleta**: color paramétrico HSL, grano+viñeta
  (`src/style/finish.js`), trazo `lapiz` opt-in (dash+alpha+repaso, en `stroke.js`).
- **Configuraciones** (`previews/configs.js`): juegos de bandas con nombre —
  «Póster granulado» + los 4 esquemas clásicos (solo color). Desplegable en los
  paneles y en el index.
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

- `python3 serve.py 8137` — NUNCA `python3 -m http.server` (caché, ver CLAUDE.md).
- `previews/compose.html` — panel completo. `previews/hair.html` — pelo/barba
  aislados. `previews/eye-lab.html` y demás — partes sueltas. `index.html` — rejilla
  viva.
- Ciclo de dirección de arte: afinar bandas en compose → «copiar rangos» → pegar a
  Claude con un nombre → queda como configuración en `previews/configs.js`.
- Seeds buenos: ★ en el index → «guardados · copiar» → pegar a Claude.
- El index en modo «estilo: composer» se sincroniza en vivo con el panel (evento
  storage + focus). OJO: localStorage es por ORIGEN — un solo servidor levantado, o
  composer e index pueden mirar almacenes distintos.

## Trampas conocidas (no reaprender por las malas)

- **Panel vs arquetipo**: el panel persiste TODAS las bandas; el diff contra las
  declaradas (en `character.js`) es lo que deja respirar al arquetipo. Si un rasgo
  opt-in "no sale", mirar si una banda del panel difiere de fábrica y lo pisa.
- **Opciones opt-in con peso 0** (labios, ceja fina, lápiz, cortinas en hombres): el
  panel les da peso 1 al marcarlas (`|| 1`, no `?? 1` — hubo bug).
- **setupCanvas fija width/height inline en px**: cualquier host que quiera canvas
  fluido debe pisar ese inline (el index lo hace). Fue LA causa de meses de "cards
  que se solapan".
- **El rAF no dispara en el panel de navegador de Claude**: la animación se valida
  simulando `advance(a, t)` a mano o en Chrome de verdad.
- Verificación geométrica de masas: test de cobertura por ray-casting +
  `isPointInPath` en consola de compose (ver historia en `HANDOFF-pelo.md`).

## Estado de git

- `main` = todo lo anterior fusionado (fast-forward desde la rama de trabajo
  `claude/stoic-chandrasekhar-23b928`, ago 2026).
- La versión pre-rediseño del pelo quedó en `390037a` por si hay arqueología.
