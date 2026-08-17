# Handoff — masas de pelo y barba: sistema replanteado

El sistema elipse+parches se retiró entero. Las masas ya no aproximan la silueta de la
cabeza: **la heredan**. La versión con el problema abierto y el primer parche están en el
historial de git.

## Por qué se replanteó

Dos generaciones de fallo con la cúpula elíptica:

1. La elipse no puede encajar con un rectángulo redondeado de radios distintos por lado
   → esquinas de cráneo asomando (franjas de piel).
2. El parche de cobertura (`min()` contra las esquinas infladas) garantizaba cubrir pero
   producía siluetas quebradas: muescas y escalones en las sienes con `tilt`/`sideDrop`,
   cuñas sueltas, muros verticales en el empalme con el flequillo.

La causa de fondo: la cúpula colgaba de la línea base del flequillo
(`y = baseline(cos a) − sin·domeH`), así que cualquier caída lateral de la base hundía
también la silueta superior. Dos responsabilidades en una curva.

## El sistema nuevo

**`shellBetween(pts, radii, o, yL, yR, part)`** en `src/style/stroke.js` — al lado de
`roundedPolyPath`, que es quien define esa geometría. Devuelve el tramo del contorno
desplazado `o` hacia fuera entre dos costuras laterales: por la coronilla (`crown`) o
por la mandíbula (`jaw`). Los arcos de esquina se desplazan sobre su círculo real
(mismo centro, radio + o, misma tangencia y clamp que `arcTo`).

`head.build()` expone `pts` y `radii` en la geometría; no hay más acoplamiento.

- **Masa de pelo** (`hair.drawMass`): casquete `crown` entre `baseline(−1)` y
  `baseline(+1)`, remuestreado a `topSpikes·2` tramos con los picos sobre la normal
  local (verticales en la coronilla, tumbados en las sienes), cerrado por el zigzag del
  flequillo, que corre exactamente entre las dos costuras. La `baseline` sigue siendo la
  única línea del flequillo (bow/tilt/caída u⁴ intactos), pero ya solo manda en el
  borde inferior — la silueta superior es de la cabeza.
- **Barba de masa** (nueva): casquete `jaw` con vuelo propio, cerrado por un borde
  dentado hacia el pómulo. `beardStyle` elige `rayitas` (el hatching de siempre) o
  `masa`. Topes: la nariz (`noseKeepOut`) y el borde bajo de la oreja (la masa vuela
  por fuera de la silueta; sin tope pintaría sobre el lóbulo). Los pasa `character.js`.

Clamps de seguridad: las costuras del pelo no suben por encima de la coronilla ni bajan
de `0.72·h` (zona de mandíbula), y el flequillo nunca sube por encima del vuelo del
casquete (`topY + 4`) — si lo hiciera, la masa se invertiría y el relleno se agujerea.

## Verificación

- Test geométrico (consola de compose): contorno de cabeza por ray-casting, exigiendo
  que todo punto por encima del flequillo local caiga dentro de la masa. Bandas por
  defecto: **0 fallos en 190 caras** (el sistema viejo: 53%).
- Estrés (esquinas casi cuadradas, asimetría al tope, tilt/drop a rango completo de
  slider): los puntos que el test marca son piel legítima bajo el flequillo real
  (artefacto de la aproximación de `u` del test); las tiras visuales de esos mismos
  seeds salen limpias.
- Visual: crestas, `curva`, `curva-picos`, barridos extremos, barbas de masa con gafas
  y cigarro. `previews/hair.html` (nueva) para iterar pelo+barba aislados.

## Cambios de esa misma sesión en el index

- Sin flotación (se retiró de `rig.js`: movía las cards y se solapaban).
- Cards a hueso: sin gap ni radios en el grid.
- Marco de dibujo a `0.99` (antes `0.88`): cabezas ~14% más grandes. Una cresta muy
  larga en una cabeza muy alta puede rozar el borde del lienzo; asumido.

## Guardarraíles que siguen vigentes

- Los laterales (patillas) van recortados a la cabeza; las masas vuelan a propósito.
- El vuelo incluye `geo.lean`.
- El reparto de ancho entre ojos y laterales vive en `character.js`.
- La barba (de rayitas y de masa) no crece sobre la nariz.
- El flequillo no llega a la ceja (`hairBottom`), sombra incluida.
- La sombra del flequillo y la raya (`parting`) trabajan sobre el `path` único de la
  masa: cualquier rediseño tiene que seguir devolviendo UNA forma cerrada.
