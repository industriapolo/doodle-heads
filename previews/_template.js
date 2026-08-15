// Motor de previews. Cada previews/<parte>.html importa su módulo y llama a mountPreview().
//
// El panel de sliders se autogenera desde el schema PARAMS del módulo (§7.1). Cada control
// tiene un candado: suelto = el valor se randomiza por celda; fijo = el valor del slider se
// aplica a las 30 celdas. Eso es lo que permite calibrar un parámetro dejando variar el resto.

import { makeRng, randomSeed } from '../src/core/prng.js'
import { setupCanvas, clear, box, LOGICAL } from '../src/core/canvas.js'
import { PALETTES, PALETTE_NAMES, DEFAULT_PALETTE } from '../src/style/palettes.js'

const CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #17191c; color: #d6d9dc; display: flex; height: 100vh; overflow: hidden;
  }
  #main { flex: 1; overflow: auto; padding: 16px; }
  #head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  #head h1 { font-size: 14px; font-weight: 600; margin: 0; letter-spacing: .04em; text-transform: uppercase; }
  #grid { display: grid; gap: 10px; }
  .cell { position: relative; cursor: pointer; line-height: 0; }
  .cell canvas { display: block; border-radius: 3px; }
  .cell span {
    position: absolute; left: 4px; bottom: 3px; font-size: 9px; line-height: 1;
    color: #fff; background: rgba(0,0,0,.55); padding: 2px 4px; border-radius: 2px;
    opacity: 0; transition: opacity .12s; pointer-events: none;
  }
  .cell:hover span { opacity: 1; }
  #panel {
    width: 290px; flex: none; background: #1e2125; border-left: 1px solid #2c3036;
    padding: 16px; overflow-y: auto;
  }
  #panel h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8b9198; margin: 0 0 12px; }
  .row { margin-bottom: 13px; }
  .row label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #a8aeb5; margin-bottom: 4px; }
  .row label .val { margin-left: auto; color: #e8ebee; font-variant-numeric: tabular-nums; }
  .row input[type=range] { width: 100%; accent-color: #E5117F; }
  .row.locked label { color: #E5117F; }
  .lock {
    width: 13px; height: 13px; flex: none; margin: 0; accent-color: #E5117F; cursor: pointer;
  }
  button, select {
    background: #2c3036; color: #d6d9dc; border: 1px solid #3b4149; border-radius: 4px;
    padding: 5px 10px; font: inherit; font-size: 11px; cursor: pointer;
  }
  button:hover, select:hover { background: #363b42; }
  #refs { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
  #refs img { height: 150px; border-radius: 3px; border: 1px solid #2c3036; cursor: zoom-in; }
  #refs img.zoom { height: 420px; }
  .hint { color: #6d7379; font-size: 10px; margin-top: 10px; line-height: 1.5; }
`

/**
 * @param opts.title      título de la preview
 * @param opts.params     schema PARAMS del módulo
 * @param opts.randomize  (rng) => params
 * @param opts.draw       (ctx, box, params, palette, rng) => void
 * @param opts.cols       columnas del grid (default 6)
 * @param opts.rows       filas (default 5)
 * @param opts.cell       lado de cada canvas en px (default 190)
 * @param opts.inset      margen del box dentro del canvas, 0..0.4 (default 0.08)
 * @param opts.refs       ['../referencias/x.jpg', ...] tiras de referencia para comparar
 */
export function mountPreview(opts) {
  const {
    title = 'preview',
    params = {},
    randomize = () => ({}),
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
        <button id="unlock">soltar todo</button>
        <button id="zoom">zoom</button>
      </div>
      <div id="grid"></div>
      <div id="refs"></div>
    </div>
    <div id="panel">
      <h2>Parámetros</h2>
      <div id="controls"></div>
      <p class="hint">
        Marca el candado para fijar un parámetro en las 30 celdas.<br>
        Click en una celda = nueva seed solo para ella.
      </p>
    </div>
  `

  const gridEl = document.getElementById('grid')
  gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`

  // Zoom: el grid de 30 sirve para juzgar variedad, pero para calibrar estilo hay que ver
  // el trazo a tamaño real — una celda de 190px muestra 800 unidades lógicas al 24%,
  // y a esa escala cualquier hatching se apelmaza aunque esté bien.
  let zoomed = false
  function applyLayout() {
    const c = zoomed ? 2 : cols
    const size = zoomed ? 460 : cell
    gridEl.style.gridTemplateColumns = `repeat(${c}, ${size}px)`
    for (const entry of cells) entry.ctx = setupCanvas(entry.canvas, size)
    renderAll()
  }

  // --- celdas -------------------------------------------------------------
  const cells = []
  for (let i = 0; i < cols * rows; i++) {
    const wrap = document.createElement('div')
    wrap.className = 'cell'
    const canvas = document.createElement('canvas')
    const seedEl = document.createElement('span')
    wrap.append(canvas, seedEl)
    gridEl.append(wrap)

    const entry = { canvas, seedEl, ctx: setupCanvas(canvas, cell), seed: randomSeed() }
    wrap.addEventListener('click', () => {
      entry.seed = randomSeed()
      renderCell(entry)
    })
    cells.push(entry)
  }

  // --- controles ----------------------------------------------------------
  const controlsEl = document.getElementById('controls')
  const locks = {} // nombre -> { locked, value }

  for (const [name, def] of Object.entries(params)) {
    const row = document.createElement('div')
    row.className = 'row'
    const label = document.createElement('label')
    const lock = document.createElement('input')
    lock.type = 'checkbox'
    lock.className = 'lock'
    lock.title = 'fijar en todas las celdas'
    const text = document.createElement('span')
    text.textContent = def.label || name
    const valEl = document.createElement('span')
    valEl.className = 'val'
    label.append(lock, text, valEl)

    let input
    if (def.options) {
      input = document.createElement('select')
      for (const o of def.options) {
        const opt = document.createElement('option')
        opt.value = o
        opt.textContent = o
        input.append(opt)
      }
      input.value = def.default
    } else if (def.type === 'bool') {
      input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = !!def.default
    } else {
      input = document.createElement('input')
      input.type = 'range'
      input.min = def.min
      input.max = def.max
      input.step = def.step ?? (def.max - def.min) / 100
      input.value = def.default
    }

    const readValue = () =>
      def.options ? input.value : def.type === 'bool' ? input.checked : parseFloat(input.value)

    const showValue = () => {
      const v = readValue()
      valEl.textContent = typeof v === 'number' ? fmt(v) + (def.unit || '') : String(v)
    }

    locks[name] = { locked: false, get value() { return readValue() } }

    const sync = () => {
      showValue()
      row.classList.toggle('locked', locks[name].locked)
      renderAll()
    }
    lock.addEventListener('change', () => { locks[name].locked = lock.checked; sync() })
    input.addEventListener('input', () => {
      // tocar un control lo fija automáticamente: es lo que quieres el 100% de las veces
      if (!locks[name].locked) { locks[name].locked = true; lock.checked = true }
      sync()
    })

    showValue()
    row.append(label, input)
    controlsEl.append(row)
  }

  // --- paleta -------------------------------------------------------------
  const palEl = document.getElementById('pal')
  for (const name of PALETTE_NAMES) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = PALETTES[name].label
    palEl.append(opt)
  }
  palEl.value = DEFAULT_PALETTE
  palEl.addEventListener('change', renderAll)

  document.getElementById('regen').addEventListener('click', () => {
    for (const c of cells) c.seed = randomSeed()
    renderAll()
  })
  document.getElementById('zoom').addEventListener('click', () => {
    zoomed = !zoomed
    applyLayout()
  })
  document.getElementById('unlock').addEventListener('click', () => {
    for (const name of Object.keys(locks)) locks[name].locked = false
    for (const el of controlsEl.querySelectorAll('.lock')) el.checked = false
    for (const el of controlsEl.querySelectorAll('.row')) el.classList.remove('locked')
    renderAll()
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
  const drawBox = box(LOGICAL * inset, LOGICAL * inset, LOGICAL * (1 - 2 * inset), LOGICAL * (1 - 2 * inset))

  function resolveParams(rng) {
    const p = randomize(rng)
    for (const [name, lock] of Object.entries(locks)) {
      if (lock.locked) p[name] = lock.value
    }
    return p
  }

  function renderCell(entry) {
    const palette = PALETTES[palEl.value]
    const rng = makeRng(entry.seed)
    const p = resolveParams(rng)
    clear(entry.ctx, palette.bg)
    draw(entry.ctx, drawBox, p, palette, rng.fork(99), entry.seed)
    entry.seedEl.textContent = entry.seed.toString(16)
  }

  function renderAll() {
    for (const c of cells) renderCell(c)
  }

  renderAll()
  window.__preview = { cells, renderAll, locks }
}

function fmt(v) {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(Math.abs(v) < 1 ? 3 : 1).replace(/\.?0+$/, '')
}
