// Genera `og.png` (1200×630), la vista previa al compartir, a partir de `scripts/og.html`.
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
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

const URL_PAGINA = process.env.OG_URL || 'http://127.0.0.1:8137/scripts/og.html'
const SALIDA = new URL('../og.png', import.meta.url).pathname
const ANCHO = 1200
const ALTO = 630

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
if (!(await vivo(URL_PAGINA))) {
  console.error(`No responde ${URL_PAGINA}. Levanta el servidor:  python3 serve.py`)
  process.exit(1)
}

const dir = await mkdtemp(join(tmpdir(), 'doodle-og-'))
try {
  // `--virtual-time-budget` adelanta el reloj de la página hasta que se queda quieta, así
  // que no hay que adivinar un `sleep`: los módulos se cargan, se dibujan las caras y
  // entonces dispara. Y `--force-device-scale-factor=1` para que 1200×630 sean 1200×630.
  await ejecutar(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${ANCHO},${ALTO}`,
    '--virtual-time-budget=8000',
    `--screenshot=${join(dir, 'og.png')}`,
    URL_PAGINA,
  ])
  const png = await readFile(join(dir, 'og.png'))

  // Las dimensiones salen de la cabecera IHDR del PNG: bytes 16–23, big-endian. Se
  // comprueban porque una captura del tamaño equivocado no se nota hasta que la tarjeta
  // sale recortada en LinkedIn, y para entonces ya está publicada.
  const ancho = png.readUInt32BE(16)
  const alto = png.readUInt32BE(20)
  if (ancho !== ANCHO || alto !== ALTO) {
    throw new Error(`La captura salió ${ancho}×${alto} y tenía que ser ${ANCHO}×${ALTO}`)
  }

  await writeFile(SALIDA, png)
  console.log(`og.png · ${ancho}×${alto} · ${(png.length / 1024).toFixed(0)} KB`)
} finally {
  await rm(dir, { recursive: true, force: true })
}
