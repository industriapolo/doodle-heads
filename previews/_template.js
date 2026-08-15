// Motor de previews.
//
// El panel no fija valores: fija BANDAS. Cada parámetro numérico tiene dos tiradores y las
// 30 celdas sortean dentro de la banda. Colapsar la banda a cero equivale a fijar el valor,
// así que esto sustituye al candado. Lo que se dirige es la distribución, no una instancia.
//
// Los parámetros de lista no admiten banda: llevan una casilla por opción.
// Los booleanos tampoco: llevan un slider de probabilidad.

import { makeRng, randomSeed } from '../src/core/prng.js'
import { setupCanvas, clear, box, LOGICAL } from '../src/core/canvas.js'
import { PALETTES, PALETTE_NAMES, DEFAULT_PALETTE } from '../src/style/palettes.js'
import { bandsOf, exportBands } from '../src/core/params.js'

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
    mount(opts)
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
  } = opts

  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`)
  document.title = `${title} — doodle-heads`

  document.body.innerHTML = `
    <div id="main">
      <div id="head">
        <h1>${title}</h1>
        <button id="regen">regenerar</button>
        <select id="pal"></select>
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
        Click en una celda = nueva seed solo para ella.
      </p>
      <textarea id="out" readonly></textarea>
    </div>
  `

  const STORE = `doodle-bands:${title}`

  // Un grupo es un bloque del panel. Varios grupos pueden compartir `bandKey` y escribir
  // en el mismo módulo — así "Pelo" y "Barba" se leen separados aunque los dos vivan
  // en hair.js.
  const keyOf = (g) => g.bandKey || g.name

  // --- bandas -------------------------------------------------------------
  const declared = () => {
    const b = {}
    for (const g of groups) b[keyOf(g)] = { ...(b[keyOf(g)] || {}), ...bandsOf(g.params) }
    return b
  }
  let bands = declared()
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (saved) for (const k of Object.keys(bands)) if (saved[k]) Object.assign(bands[k], saved[k])
  } catch {}

  const persist = () => {
    try { localStorage.setItem(STORE, JSON.stringify(bands)) } catch {}
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
    wrap.addEventListener('click', () => { entry.seed = randomSeed(); renderCell(entry) })
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
        box.append(controlFor(keyOf(g), name, def))
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
    label.textContent = def.label || name
    const val = document.createElement('span')
    val.className = 'val'
    head.append(label, val)
    row.append(head)

    // --- lista: casilla por opción ---
    if (def.options) {
      const wrap = document.createElement('div')
      wrap.className = 'opts'
      const pool = bands[groupName][name]
      for (const opt of def.options) {
        const l = document.createElement('label')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = (pool[opt] ?? 0) > 0
        l.classList.toggle('on', cb.checked)
        l.append(cb, document.createTextNode(opt))
        cb.addEventListener('change', () => {
          const base = def.pool?.[opt] ?? 1
          pool[opt] = cb.checked ? base : 0
          l.classList.toggle('on', cb.checked)
          sync()
        })
        wrap.append(l)
      }
      row.append(wrap)
      const sync = () => {
        const on = def.options.filter((o) => (pool[o] ?? 0) > 0)
        val.textContent = on.length === def.options.length ? 'todas' : `${on.length}/${def.options.length}`
        commit()
      }
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
      const sync = () => {
        const p = parseFloat(input.value)
        bands[groupName][name] = { p }
        fill.style.left = '0%'
        fill.style.width = p * 100 + '%'
        val.textContent = Math.round(p * 100) + '%'
        commit()
      }
      input.addEventListener('input', sync)
      sync()
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

    const sync = (moved) => {
      let a = parseFloat(lo.value)
      let b = parseFloat(hi.value)
      // el tirador que mueves empuja al otro, nunca lo cruza
      if (a > b) {
        if (moved === 'lo') { b = a; hi.value = b } else { a = b; lo.value = a }
      }
      bands[groupName][name] = [a, b]
      const span = def.max - def.min
      fill.style.left = ((a - def.min) / span) * 100 + '%'
      fill.style.width = ((b - a) / span) * 100 + '%'
      const u = def.unit || ''
      val.textContent = a === b ? `${fmt(a)}${u}` : `${fmt(a)} – ${fmt(b)}${u}`
      row.classList.toggle('fixed', a === b)
      commit()
    }
    lo.addEventListener('input', () => sync('lo'))
    hi.addEventListener('input', () => sync('hi'))
    sync()
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
  palEl.addEventListener('change', renderAll)

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
    const code = groups
      .map((g) => `// ── ${g.label || g.name} (${keyOf(g)}.js) ──\n${exportBands(g.params, bands[keyOf(g)])}`)
      .join('\n\n')
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
}

const el = (tag, cls) => {
  const n = document.createElement(tag)
  n.className = cls
  return n
}

function fmt(v) {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(Math.abs(v) < 1 ? 3 : 1).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}
