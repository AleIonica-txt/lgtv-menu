# Empaqueta la app para la tele: junta los <script src="js/..."> de index.html en js/app.js y mete la
# hoja de estilos dentro del HTML (token.js queda aparte: lo escribe token.sh en la tele). En este motor web cada fichero local cuesta del orden de 100 ms al
# arrancar, así que menos ficheros = menú antes en pantalla. Trabaja sobre una copia (la de build.sh).
# Uso: python3 -I tools/bundle.py <carpeta de la app copiada>
import os
import re
import sys

app = sys.argv[1]
index = os.path.join(app, "index.html")
html = open(index, encoding="utf-8").read()

scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
with open(os.path.join(app, "js", "app.js"), "w", encoding="utf-8") as out:
    for src in scripts:
        out.write(f"// ---- {src} ----\n")
        out.write(open(os.path.join(app, src), encoding="utf-8").read())
        out.write("\n;\n")
for src in scripts:
    os.remove(os.path.join(app, src))
# El bloque de etiquetas <script> consecutivas pasa a ser una sola.
html = re.sub(r'(?:[ \t]*<script src="js/[^"]+"></script>\n?)+', '  <script src="js/app.js"></script>\n', html)

for href in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html):
    css = open(os.path.join(app, href), encoding="utf-8").read()
    html = html.replace(f'<link rel="stylesheet" href="{href}">', f"<style>\n{css}</style>")
    os.remove(os.path.join(app, href))

open(index, "w", encoding="utf-8").write(html)
print(f"empaquetado: {len(scripts)} scripts en js/app.js, estilos dentro de index.html")
