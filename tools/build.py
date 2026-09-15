#!/usr/bin/env python3
"""Gera index.html (Vercel) e artifact.html (Claude Artifact) a partir de body.html.

body.html tem apenas o conteudo da pagina. O index.html e um documento completo.
O artifact.html nao leva doctype, head nem body, porque a plataforma de Artifacts
acrescenta esse esqueleto no momento da publicacao.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
body = (ROOT / "body.html").read_text(encoding="utf-8").strip()

TITLE = "Protótipo Timesheet Fiori"
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Archivo:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600'
         '&family=IBM+Plex+Mono:wght@400;500&display=swap">')

index = f"""<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{TITLE}</title>
<meta name="description" content="Protótipo de registo de horas a projetos, extensão Fiori, com ausências e assistente conversacional.">
{FONTS}
<link rel="stylesheet" href="styles.css">
<style>
  :root{{padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px); color-scheme:light dark}}
  body{{margin:0; font:14px/1.5 system-ui, sans-serif}}
  img{{max-width:100%}}
  [hidden]{{display:none !important}}
</style>
</head>
<body>
{body}
<script src="app.js"></script>
</body>
</html>
"""

artifact = f"""<title>{TITLE}</title>
{FONTS}
<link rel="stylesheet" href="styles.css">
{body}
<script src="app.js"></script>
"""

(ROOT / "index.html").write_text(index, encoding="utf-8")
(ROOT / "artifact.html").write_text(artifact, encoding="utf-8")
print("index.html e artifact.html gerados a partir de body.html")
