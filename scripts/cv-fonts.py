"""
Static instances of the site's two faces, for the résumé PDF only (scripts/cv-pdf.mjs).

Chromium prints a variable font as Type 3: the PDF's text still extracts, but some résumé screeners and viewers
handle Type 3 badly. Printed from fixed instances of the same fonts, at the weights /cv sets (the serif at 400, 600
and 700, the mono at 400), it embeds them as ordinary TrueType, with the same outlines and the same metrics, so the
page lays out exactly as it does on screen. The web pages keep the variable files.

    python3 scripts/cv-fonts.py
"""

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FACES = [
    ('public/fonts/source-serif-4-latin-var.woff2', 'serif', (400, 600, 700)),
    ('public/fonts/source-code-pro-latin-var.woff2', 'mono', (400,)),
]

for src, name, weights in FACES:
    for w in weights:
        font = instancer.instantiateVariableFont(TTFont(src), {'wght': w}, updateFontNames=True)
        if name == 'mono':
            # The variable file's default is ExtraLight, and its STAT table names the instance after it: named here.
            table = font['name']
            for nid in (16, 17):
                table.removeNames(nameID=nid)
            for nid, text in ((1, 'Source Code Pro'), (2, 'Regular'), (4, 'Source Code Pro Regular'), (6, 'SourceCodePro-Regular')):
                table.setName(text, nid, 3, 1, 0x409)
                table.setName(text, nid, 1, 0, 0)
        font.flavor = 'woff2'
        out = f'scripts/cv-fonts/{name}-{w}.woff2'
        font.save(out)
        print(out)
