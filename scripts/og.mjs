// Genera las dos fotos del repo: `og.png` (la vista previa al compartir, 1200×630, desde
// `scripts/og.html`) y `docs/demo.png` (la del README, el index de verdad).
//
//     python3 serve.py          # en otra terminal
//     node scripts/og.mjs
//
// Sin dependencias, como todo lo demás: conduce el Chrome que ya está instalado en modo
// headless. La alternativa habitual sería Playwright, pero eso significa un `package.json`
// y un `node_modules` en un repo cuya primera línea presume de no tener ninguno — y para
// hacer UNA foto no compensa.
//
// `og.png` no es un asset de la app: nadie lo carga en runtime, solo lo nombra la cabecera
// de `index.html` para que LinkedIn y compañía tengan algo que enseñar. La regla de oro
// («cero assets de imagen») sigue intacta.

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

const BASE = process.env.OG_BASE || 'http://127.0.0.1:8137'

// Dos fotos, y hacen cosas distintas:
//  · `og.png` es la TARJETA: solo caras, tamaño fijo de formato, seeds a dedo para que
//    salga siempre igual. La leen LinkedIn y compañía desde fuera.
//  · `docs/demo.png` es la foto del README: el index de verdad, con su cabecera y su
//    línea de contexto, para que se vea la página y no solo el dibujo. Esa sí sortea
//    seeds nuevas en cada captura, y da igual — es ilustrativa, no una referencia.
const FOTOS = [
  { url: `${BASE}/scripts/og.html`, salida: '../og.png', ancho: 1200, alto: 630, exacto: true },
  { url: `${BASE}/index.html`, salida: '../docs/demo.png', ancho: 1280, alto: 860, exacto: false },
]

// Dónde suele estar Chrome. Si no está en ninguno, se puede pasar a mano:
//     CHROME="/ruta/al/navegador" node scripts/og.mjs
const CANDIDATOS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

async function buscarChrome() {
  for (const ruta of CANDIDATOS) {
    try {
      await readFile(ruta)
      return ruta
    } catch {
      // `readFile` sobre un binario grande es caro pero esto corre una vez al año;
      // lo que importa es distinguir «existe» de «no existe» sin añadir dependencias.
    }
  }
  throw new Error(
    `No encuentro Chrome. Probé:\n  ${CANDIDATOS.join('\n  ')}\n` +
      `Pásalo a mano con CHROME=/ruta/al/navegador`
  )
}

async function vivo(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

const chrome = await buscarChrome()
if (!(await vivo(`${BASE}/index.html`))) {
  console.error(`No responde ${BASE}. Levanta el servidor:  python3 serve.py`)
  process.exit(1)
}

const dir = await mkdtemp(join(tmpdir(), 'doodle-og-'))
try {
  for (const foto of FOTOS) {
    const tmp = join(dir, 'shot.png')
    // `--virtual-time-budget` adelanta el reloj de la página hasta que se queda quieta,
    // así que no hay que adivinar un `sleep`: los módulos se cargan, se dibujan las caras
    // y entonces dispara. Y `--force-device-scale-factor=1` para que los píxeles pedidos
    // sean los píxeles que salen.
    await ejecutar(chrome, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${foto.ancho},${foto.alto}`,
      '--virtual-time-budget=8000',
      `--screenshot=${tmp}`,
      foto.url,
    ])
    const png = await readFile(tmp)

    // Las dimensiones salen de la cabecera IHDR del PNG: bytes 16–23, big-endian. Se
    // comprueban porque una captura del tamaño equivocado no se nota hasta que la tarjeta
    // sale recortada en LinkedIn, y para entonces ya está publicada.
    const ancho = png.readUInt32BE(16)
    const alto = png.readUInt32BE(20)
    if (foto.exacto && (ancho !== foto.ancho || alto !== foto.alto)) {
      throw new Error(`${foto.salida} salió ${ancho}×${alto} y tenía que ser ${foto.ancho}×${foto.alto}`)
    }

    const destino = new URL(foto.salida, import.meta.url).pathname
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, png)
    console.log(`${foto.salida.replace('../', '')} · ${ancho}×${alto} · ${(png.length / 1024).toFixed(0)} KB`)
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}
