// Motor de previews.
//
// El panel no fija valores: fija BANDAS. Cada parámetro numérico tiene dos tiradores y las
// 30 celdas sortean dentro de la banda. Colapsar la banda a cero equivale a fijar el valor,
// así que esto sustituye al candado. Lo que se dirige es la distribución, no una instancia.
//
// Los parámetros de lista no admiten banda: llevan una casilla por opción.
// Los booleanos tampoco: llevan un slider de probabilidad.
//
// En memoria las bandas están COMPLETAS (declaradas + lo tocado); lo que sale del panel
// —lo que persiste y lo que exporta «copiar rangos»— es solo el DIFF contra lo declarado.
// Esa asimetría es el contrato entero:
//   · `character.js` deja pasar al arquetipo justo donde el panel no ha tocado nada, así
//     que persistir bandas de fábrica equivale a borrar el arquetipo en silencio.
//   · cambiar un `range` en un módulo se ve en el panel con solo recargar, en vez de
//     quedar enterrado bajo una copia vieja en `localStorage`.
// Lo tocado se marca con un punto en la etiqueta y lleva su propio ↺.

import { makeRng, randomSeed } from '../src/core/prng.js'
import { setupCanvas, clear, box, LOGICAL } from '../src/core/canvas.js'
import { PALETTES, PALETTE_NAMES, DEFAULT_PALETTE } from '../src/style/palettes.js'
import { bandsOf, exportBands, touchedBands } from '../src/core/params.js'

const CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin:0; font:13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    background:#17191c; color:#d6d9dc; display:flex; height:100vh; overflow:hidden;
  }
  #main { flex:1; overflow:auto; padding:16px; }
  #head { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
  #head h1 { font-size:14px; font-weight:600; margin:0 6px 0 0; letter-spacing:.04em; text-transform:uppercase; }
  #grid { display:grid; gap:10px; }
  .cell { position:relative; cursor:pointer; line-height:0; }
  .cell canvas { display:block; border-radius:3px; }
  .cell span {
    position:absolute; left:4px; bottom:3px; font-size:9px; line-height:1; color:#fff;
    background:rgba(0,0,0,.55); padding:2px 4px; border-radius:2px; opacity:0;
    transition:opacity .12s; pointer-events:none;
  }
  .cell:hover span { opacity:1; }
  #panel { width:320px; flex:none; background:#1e2125; border-left:1px solid #2c3036; padding:14px; overflow-y:auto; }
  .group > h2 {
    font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:#E5117F;
    margin:16px 0 9px; padding-bottom:5px; border-bottom:1px solid #2c3036;
  }
  .group:first-child > h2 { margin-top:0; }
  .row { margin-bottom:11px; }
  .row .head { display:flex; align-items:baseline; gap:6px; font-size:11px; color:#a8aeb5; margin-bottom:3px; }
  .row .head .val { margin-left:auto; color:#e8ebee; font-variant-numeric:tabular-nums; font-size:10px; }
  .row.fixed .head .val { color:#E5117F; }
  /* Tocada = difiere de la banda declarada por el módulo. Discreto a propósito: lo que
     se lee de un vistazo es CUÁNTAS filas llevan punto, no cuál. */
  .row.touched .head .lab::before { content:'•'; color:#E5117F; margin-right:4px; }
  .row .undo {
    padding:0 4px; margin-left:6px; font-size:11px; line-height:1.3; border-radius:3px;
    background:none; border:none; color:#6d7379; visibility:hidden;
  }
  .row .undo:hover { background:none; color:#E5117F; }
  .row.touched .undo { visibility:visible; }

  .dual { position:relative; height:20px; }
  .dual .track { position:absolute; top:8px; left:0; right:0; height:4px; background:#343a41; border-radius:2px; }
  .dual .fill  { position:absolute; top:8px; height:4px; background:#E5117F; border-radius:2px; }
  .dual input {
    position:absolute; left:0; top:0; width:100%; height:20px; margin:0;
    background:none; pointer-events:none; -webkit-appearance:none; appearance:none;
  }
  .dual input::-webkit-slider-thumb {
    -webkit-appearance:none; pointer-events:auto; width:13px; height:13px; border-radius:50%;
    background:#f7f8f9; border:2px solid #E5117F; cursor:grab; margin-top:0;
  }
  .dual input::-webkit-slider-runnable-track { height:20px; background:none; }

  .opts { display:flex; flex-wrap:wrap; gap:4px; }
  .opts label {
    font-size:10px; padding:3px 7px; border-radius:3px; border:1px solid #3b4149;
    background:#24282d; color:#8b9198; cursor:pointer; user-select:none;
  }
  .opts label.on { background:#E5117F; border-color:#E5117F; color:#fff; }
  .opts input { display:none; }

  button, select {
    background:#2c3036; color:#d6d9dc; border:1px solid #3b4149; border-radius:4px;
    padding:5px 9px; font:inherit; font-size:11px; cursor:pointer;
  }
  button:hover, select:hover { background:#363b42; }
  #refs { display:flex; gap:8px; margin-top:18px; flex-wrap:wrap; }
  #refs img { height:150px; border-radius:3px; border:1px solid #2c3036; cursor:zoom-in; }
  #refs img.zoom { height:520px; }
  .hint { color:#6d7379; font-size:10px; margin-top:14px; line-height:1.6; }
  #out {
    width:100%; height:150px; margin-top:10px; display:none; background:#141618; color:#9fb3a8;
    border:1px solid #2c3036; border-radius:4px; font:11px/1.5 ui-monospace, monospace; padding:8px;
  }
`

/**
 * @param opts.groups [{ name, label, params }] — cada grupo es un módulo
 * @param opts.draw   (ctx, box, bands, palette, rng, seed) => void
 *                    `bands` viene indexado por nombre de grupo; se lo pasas tal cual
 *                    al randomize del módulo.
 */
export function mountPreview(opts) {
  try {
    return mount(opts)
  } catch (err) {
    // Una preview que falla a medias deja la página muda: panel vacío, grid vacío, y a
    // adivinar. Que se vea el error donde se está mirando.
    showError(err)
    throw err
  }
}

function showError(err) {
  const pre = document.createElement('pre')
  pre.style.cssText =
    'position:fixed;inset:0;z-index:99;margin:0;padding:24px;overflow:auto;' +
    'background:#2a1218;color:#ff9db4;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap'
  pre.textContent =
    `La preview no arrancó.\n\n${err?.stack || err}\n\n` +
    `Si acabas de cambiar un módulo, lo más probable es caché del navegador:\n` +
    `arranca con  python3 serve.py  (no manda caché) o recarga con Cmd+Shift+R.`
  document.body.append(pre)
}

function mount(opts) {
  const {
    title = 'preview',
    groups = [],
    draw,
    cols = 6,
    rows = 5,
    cell = 190,
    inset = 0.08,
    refs = [],
    onPalette = null,
    // Qué pasa al pulsar una celda. Por defecto, seed nueva solo para ella; una preview
    // puede quedárselo para otra cosa (voice.html hace hablar al personaje).
    onCell = null,
    hint = null,
    configs = null, // { nombre: { label, bands } } — juegos completos de bandas guardados
    // En las previews de partes sueltas el desplegable de paletas ELIGE la paleta con la
    // que se pinta. En las de personaje completo (compose, hair) el color ya es
    // paramétrico y los esquemas viven como configuraciones: el desplegable sobra.
    paletteSelect = true,
  } = opts

  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`)
  document.title = `${title} — doodle-heads`

  document.body.innerHTML = `
    <div id="main">
      <div id="head">
        <h1>${title}</h1>
        <button id="regen">regenerar</button>
        <select id="pal"></select>
        <select id="cfg" style="display:none"></select>
        <button id="zoom">zoom</button>
        <button id="reset">rangos por defecto</button>
        <button id="copy">copiar rangos</button>
      </div>
      <div id="grid"></div>
      <div id="refs"></div>
    </div>
    <div id="panel">
      <div id="controls"></div>
      <p class="hint">
        Cada parámetro tiene DOS tiradores: las 30 celdas sortean dentro de esa banda.<br>
        Junta los dos tiradores para fijar un valor.<br>
        ${hint || 'Click en una celda = nueva seed solo para ella.'}
      </p>
      <textarea id="out" readonly></textarea>
    </div>
  `

  const STORE = `doodle-bands:${title}`

  // Un grupo es un bloque del PANEL; un módulo es dónde vive el parámetro. No tienen por
  // qué coincidir, en los dos sentidos:
  //   · varios bloques sobre un módulo → `bandKey` ("Pelo" y "Barba" salen de hair.js)
  //   · un bloque sobre varios módulos → nombre cualificado "head.lineWeight"
  //     (la sección de grosores junta el trazo de siete partes distintas)
  const keyOf = (g) => g.bandKey || g.name
  const route = (g, name) => {
    const i = name.indexOf('.')
    return i < 0 ? [keyOf(g), name] : [name.slice(0, i), name.slice(i + 1)]
  }

  // Índice módulo → params, resuelto una sola vez. De aquí salen tanto las bandas
  // iniciales como la exportación, así que las dos rutas ven exactamente lo mismo.
  const defsByKey = {}
  for (const g of groups) {
    for (const [name, def] of Object.entries(g.params)) {
      const [k, pname] = route(g, name)
      ;(defsByKey[k] ||= {})[pname] = def
    }
  }

  // --- bandas -------------------------------------------------------------
  // En memoria, completas: declaradas + lo tocado. Fuera, solo el diff.
  const declared = () =>
    Object.fromEntries(Object.entries(defsByKey).map(([k, defs]) => [k, bandsOf(defs)]))
  const declaredOne = (k, name) => bandsOf({ [name]: defsByKey[k][name] })[name]
  const isTouched = (k, name) =>
    name in touchedBands({ [name]: defsByKey[k][name] }, { [name]: bands[k][name] })

  /** Lo que difiere de lo declarado, por módulo. Los módulos sin nada tocado no salen. */
  const diff = () => {
    const out = {}
    for (const [k, defs] of Object.entries(defsByKey)) {
      const d = touchedBands(defs, bands[k])
      if (Object.keys(d).length) out[k] = d
    }
    return out
  }

  let bands = declared()
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
    // `touchedBands` en la carga es también la MIGRACIÓN: un almacén viejo trae todas las
    // bandas, y las que coinciden con lo declarado se caen aquí. Las que difieren se
    // quedan — no hay forma de distinguirlas de un toque de verdad, y para eso está
    // «rangos por defecto». Las claves que el módulo ya no declara se van con ellas.
    if (saved) for (const k of Object.keys(bands)) Object.assign(bands[k], touchedBands(defsByKey[k], saved[k]))
  } catch {}

  const persist = () => {
    try { localStorage.setItem(STORE, JSON.stringify(diff())) } catch {}
  }

  // --- grid ---------------------------------------------------------------
  const gridEl = document.getElementById('grid')
  const cells = []
  let zoomed = false

  for (let i = 0; i < cols * rows; i++) {
    const wrap = document.createElement('div')
    wrap.className = 'cell'
    const canvas = document.createElement('canvas')
    const seedEl = document.createElement('span')
    wrap.append(canvas, seedEl)
    gridEl.append(wrap)
    const entry = { canvas, seedEl, ctx: setupCanvas(canvas, cell), seed: randomSeed() }
    wrap.addEventListener('click', () => {
      if (onCell) return onCell(entry)
      entry.seed = randomSeed()
      renderCell(entry)
    })
    cells.push(entry)
  }

  function applyLayout() {
    const c = zoomed ? 2 : cols
    const size = zoomed ? 460 : cell
    gridEl.style.gridTemplateColumns = `repeat(${c}, ${size}px)`
    for (const e of cells) e.ctx = setupCanvas(e.canvas, size)
    renderAll()
  }

  // --- controles ----------------------------------------------------------
  const controlsEl = document.getElementById('controls')

  function buildControls() {
    controlsEl.innerHTML = ''
    for (const g of groups) {
      const box = document.createElement('div')
      box.className = 'group'
      if (groups.length > 1 || g.label) {
        const h = document.createElement('h2')
        h.textContent = g.label || g.name
        box.append(h)
      }
      for (const [name, def] of Object.entries(g.params)) {
        const [k, pname] = route(g, name)
        box.append(controlFor(k, pname, def))
      }
      controlsEl.append(box)
    }
  }

  function controlFor(groupName, name, def) {
    const row = document.createElement('div')
    row.className = 'row'
    const head = document.createElement('div')
    head.className = 'head'
    const label = document.createElement('span')
    label.className = 'lab'
    label.textContent = def.label || name
    const val = document.createElement('span')
    val.className = 'val'
    // Un ↺ por fila, no solo el «rangos por defecto» global: sin él, deshacer un tanteo
    // obliga a acertar el valor de fábrica a ojo — y fallar por un paso deja la fila
    // tocada, que es justo lo que le quita el mando al arquetipo.
    const undo = document.createElement('button')
    undo.className = 'undo'
    undo.textContent = '↺'
    undo.title = 'volver a la banda declarada por el módulo'
    head.append(label, val, undo)
    row.append(head)
    // Se recalcula en cada `sync`, que es el único sitio donde se escribe la banda.
    const markTouched = () => row.classList.toggle('touched', isTouched(groupName, name))

    // --- lista: casilla por opción ---
    if (def.options) {
      const wrap = document.createElement('div')
      wrap.className = 'opts'
      const pool = bands[groupName][name]
      const boxes = []
      for (const opt of def.options) {
        const l = document.createElement('label')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = (pool[opt] ?? 0) > 0
        l.classList.toggle('on', cb.checked)
        l.append(cb, document.createTextNode(opt))
        cb.addEventListener('change', () => {
          // `|| 1` y no `?? 1`: las opciones opt-in declaran peso 0 (labios, lapiz,
          // ceja fina) y con `??` marcar su casilla las dejaba en 0 — apagadas
          const base = def.pool?.[opt] || 1
          pool[opt] = cb.checked ? base : 0
          l.classList.toggle('on', cb.checked)
          sync()
        })
        boxes.push([opt, cb, l])
        wrap.append(l)
      }
      row.append(wrap)
      const sync = () => {
        const on = def.options.filter((o) => (pool[o] ?? 0) > 0)
        val.textContent = on.length === def.options.length ? 'todas' : `${on.length}/${def.options.length}`
        markTouched()
        commit()
      }
      undo.addEventListener('click', () => {
        // EN SITIO: las casillas guardan esta misma referencia. Reasignar `bands[k][name]`
        // las dejaría escribiendo en un pool huérfano.
        const d = declaredOne(groupName, name)
        for (const k of Object.keys(pool)) delete pool[k]
        Object.assign(pool, d)
        for (const [opt, cb, l] of boxes) {
          cb.checked = (pool[opt] ?? 0) > 0
          l.classList.toggle('on', cb.checked)
        }
        sync()
      })
      sync()
      return row
    }

    // --- booleano: probabilidad ---
    if (def.type === 'bool') {
      const dual = document.createElement('div')
      dual.className = 'dual'
      const track = el('div', 'track')
      const fill = el('div', 'fill')
      const input = document.createElement('input')
      input.type = 'range'
      input.min = 0; input.max = 1; input.step = 0.01
      input.value = bands[groupName][name].p
      dual.append(track, fill, input)
      row.append(dual)
      // PINTAR y ESCRIBIR son dos cosas. Al construir el panel solo se pinta: escribir
      // metería en `bands` el valor que el navegador ha cuadriculado al asignarlo al
      // slider, y eso es una banda que nadie ha tocado haciéndose pasar por dirección de
      // arte. Solo el evento `input` —una mano en el tirador— escribe.
      const pinta = () => {
        const p = parseFloat(input.value)
        fill.style.left = '0%'
        fill.style.width = p * 100 + '%'
        val.textContent = Math.round(p * 100) + '%'
        markTouched()
      }
      const sync = () => {
        bands[groupName][name] = { p: parseFloat(input.value) }
        pinta()
        commit()
      }
      input.addEventListener('input', sync)
      undo.addEventListener('click', () => {
        // el ↺ sí escribe: devuelve la banda declarada, exacta, no la que dé el slider
        bands[groupName][name] = declaredOne(groupName, name)
        input.value = bands[groupName][name].p
        pinta()
        commit()
      })
      pinta()
      return row
    }

    // --- numérico: banda de dos tiradores ---
    const dual = document.createElement('div')
    dual.className = 'dual'
    const track = el('div', 'track')
    const fill = el('div', 'fill')
    const lo = document.createElement('input')
    const hi = document.createElement('input')
    const step = def.step ?? (def.max - def.min) / 100
    for (const s of [lo, hi]) {
      s.type = 'range'
      s.min = def.min
      s.max = def.max
      s.step = step
    }
    lo.value = bands[groupName][name][0]
    hi.value = bands[groupName][name][1]
    dual.append(track, fill, lo, hi)
    row.append(dual)

    // Igual que en los booleanos: al construir solo se PINTA. El navegador cuadricula el
    // valor al asignarlo al `input[type=range]`, así que escribirlo de vuelta metía en
    // `bands` una banda movida que nadie había tocado — y eso, en `character.js`, apaga
    // al arquetipo en ese parámetro. Era la razón de ser del epsilon de `touchedBands`.
    const pinta = () => {
      const [a, b] = bands[groupName][name]
      const span = def.max - def.min
      fill.style.left = ((a - def.min) / span) * 100 + '%'
      fill.style.width = ((b - a) / span) * 100 + '%'
      const u = def.unit || ''
      val.textContent = a === b ? `${fmt(a)}${u}` : `${fmt(a)} – ${fmt(b)}${u}`
      row.classList.toggle('fixed', a === b)
      markTouched()
    }
    const sync = (moved) => {
      let a = parseFloat(lo.value)
      let b = parseFloat(hi.value)
      // el tirador que mueves empuja al otro, nunca lo cruza
      if (a > b) {
        if (moved === 'lo') { b = a; hi.value = b } else { a = b; lo.value = a }
      }
      bands[groupName][name] = [a, b]
      pinta()
      commit()
    }
    lo.addEventListener('input', () => sync('lo'))
    hi.addEventListener('input', () => sync('hi'))
    undo.addEventListener('click', () => {
      const d = declaredOne(groupName, name)
      bands[groupName][name] = d
      lo.value = d[0]
      hi.value = d[1]
      pinta()
      commit()
    })
    pinta()
    return row
  }

  // durante la construcción no queremos 40 re-renders
  let building = true
  function commit() {
    if (building) return
    persist()
    renderAll()
  }

  // --- paleta y botones ---------------------------------------------------
  const palEl = document.getElementById('pal')
  for (const n of PALETTE_NAMES) {
    const o = document.createElement('option')
    o.value = n
    o.textContent = PALETTES[n].label
    palEl.append(o)
  }
  palEl.value = DEFAULT_PALETTE
  if (!paletteSelect) palEl.style.display = 'none'
  palEl.addEventListener('change', () => {
    // Con `onPalette`, el desplegable deja de imponer un esquema cerrado y pasa a ser un
    // cargador de PRESETS: vuelca valores en las bandas y desde ahí se afina.
    if (onPalette) {
      Object.assign(bands, onPalette(palEl.value, bands) || {})
      persist()
      building = true
      buildControls()
      building = false
    }
    renderAll()
  })

  // --- configuraciones: diffs con nombre -----------------------------------
  // Como el cargador de presets de paleta, pero para TODO el panel: vuelca las bandas
  // guardadas (previews/configs.js) y desde ahí se afina. Solo aplica las claves que
  // esta preview conoce, así la misma config sirve en compose y en previews parciales.
  //
  // La unidad de carga es el MÓDULO, no el parámetro: los que la config nombra se
  // devuelven a lo declarado y encima se aplica su diff; los que no nombra no se tocan.
  // Sin ese reseteo, cargar dos configs seguidas dejaría mezclados los parámetros que
  // la segunda no menciona, y no habría forma de volver a ninguna de las dos.
  const cfgEl = document.getElementById('cfg')
  if (configs && Object.keys(configs).length) {
    cfgEl.style.display = ''
    const ph = document.createElement('option')
    ph.value = ''
    ph.textContent = 'configuración…'
    cfgEl.append(ph)
    for (const [n, c] of Object.entries(configs)) {
      const o = document.createElement('option')
      o.value = n
      o.textContent = c.label || n
      cfgEl.append(o)
    }
    cfgEl.addEventListener('change', () => {
      const c = configs[cfgEl.value]
      if (!c) return
      for (const k of Object.keys(bands)) {
        if (!c.bands[k]) continue
        bands[k] = bandsOf(defsByKey[k])
        // copia, no referencia: los controles mutan las bandas en sitio y sin esto
        // afinarían la CONFIG en memoria en vez de la sesión
        for (const [pname, b] of Object.entries(touchedBands(defsByKey[k], c.bands[k])))
          bands[k][pname] = Array.isArray(b) ? [...b] : { ...b }
      }
      persist()
      building = true
      buildControls()
      building = false
      renderAll()
    })
  }

  document.getElementById('regen').addEventListener('click', () => {
    for (const c of cells) c.seed = randomSeed()
    renderAll()
  })
  document.getElementById('zoom').addEventListener('click', () => { zoomed = !zoomed; applyLayout() })
  document.getElementById('reset').addEventListener('click', () => {
    bands = declared()
    localStorage.removeItem(STORE)
    building = true
    buildControls()
    building = false
    renderAll()
  })

  const outEl = document.getElementById('out')
  document.getElementById('copy').addEventListener('click', () => {
    // se exporta por MÓDULO, no por bloque del panel: un bloque puede mezclar varios.
    // Y solo lo tocado: volcar bandas de fábrica en un `range` es fijar por escrito algo
    // que nadie decidió, y en una configuración además borra el arquetipo en ese
    // parámetro. Lo que no sale es lo que sigue mandando el módulo.
    const cuerpo = Object.entries(defsByKey)
      .map(([k, defs]) => [k, exportBands(defs, touchedBands(defs, bands[k]))])
      .filter(([, body]) => body)
      .map(([k, body]) => `// ── ${k}.js ──\n${body}`)
      .join('\n\n')
    const code =
      '// solo bandas que difieren de las declaradas\n\n' +
      (cuerpo || '// (nada tocado: el panel está entero de fábrica)')
    outEl.value = code
    outEl.style.display = 'block'
    outEl.select()
    navigator.clipboard?.writeText(code).catch(() => {})
  })

  // --- referencias --------------------------------------------------------
  const refsEl = document.getElementById('refs')
  for (const src of refs) {
    const img = document.createElement('img')
    img.src = src
    img.addEventListener('click', () => img.classList.toggle('zoom'))
    refsEl.append(img)
  }

  // --- render -------------------------------------------------------------
  const drawBox = box(
    LOGICAL * inset, LOGICAL * inset,
    LOGICAL * (1 - 2 * inset), LOGICAL * (1 - 2 * inset)
  )

  function renderCell(entry) {
    const palette = PALETTES[palEl.value]
    clear(entry.ctx, palette.bg)
    draw(entry.ctx, drawBox, bands, palette, makeRng(entry.seed), entry.seed)
    entry.seedEl.textContent = entry.seed.toString(16)
  }

  function renderAll() {
    for (const c of cells) renderCell(c)
  }

  buildControls()
  building = false
  applyLayout()
  window.__preview = { cells, renderAll, bands }
  return window.__preview
}

const el = (tag, cls) => {
  const n = document.createElement(tag)
  n.className = cls
  return n
}

function fmt(v) {
  if (Number.isInteger(v)) return String(v)
  // Un decimal para valores ≥1 mentía: 1.05 se mostraba como "1.1" y no cuadraba con
  // lo que el slider estaba mandando de verdad.
  return v.toFixed(3).replace(/\.?0+$/, '')
}
