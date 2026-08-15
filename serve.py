#!/usr/bin/env python3
"""Servidor estático de desarrollo, sin caché.

`python3 -m http.server` no manda ningún header Cache-Control — solo Last-Modified.
Chrome aplica entonces caché heurística y puede servir los ES modules de memoria sin
revalidar: editas un módulo, recargas, y el navegador sigue ejecutando el viejo. Con
imports de namespace eso no da error de carga, da `undefined` en una propiedad y una
página en blanco a mitad de arranque.

Uso:  python3 serve.py [puerto]
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_response(self, *args, **kwargs):
        # sin Last-Modified no hay caché heurística que valga
        super().send_response(*args, **kwargs)

    def send_header(self, keyword, value):
        if keyword == "Last-Modified":
            return
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        if "GET" in (args[0] if args else ""):
            return  # silencio para las peticiones normales
        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"doodle-heads → http://localhost:{port}/previews/compose.html")
        print("(sin caché: edita un módulo y recarga normal, sin Cmd+Shift+R)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
