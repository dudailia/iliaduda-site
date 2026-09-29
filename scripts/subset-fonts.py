"""
How public/fonts was made, and how to make it again.

The site's two faces are Source Serif 4 (4.004, at optical size 14) and Source
Code Pro (1.026), variable in weight, from the Google Fonts repository
(github.com/google/fonts, ofl/sourceserif4 and ofl/sourcecodepro).

- *-latin-var.woff2: LATIN below: Basic Latin, Latin-1's symbols (not its
  accented letters, which no page shows), General Punctuation, €, ™, the up and
  down arrows, the minus and division slash, and σ, which the home page's
  subtitle uses. Loaded on every page, so it carries only what the site sets:
  dropping the accented letters took 15,556 B off every page (M10). A page that
  shows one fails tests/e2e/fonts.spec.ts; add it to LATIN and run this.
- *-extra-var.woff2: the Greek and mathematical characters the papers use, and
  a few more likely soon. app/globals.css declares them as further faces of the
  same two families with a unicode-range, so a browser fetches them only on a
  page that shows one of their characters; the home page never does.

tests/e2e/fonts.spec.ts fails if a page shows a character neither file holds.
Adding one: put it in EXTRA, run this, and widen the unicode-range in
app/globals.css to match.

    python3 scripts/subset-fonts.py <dir with SourceSerif4[opsz,wght].ttf and SourceCodePro[wght].ttf>
"""

import io
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

LATIN = set(range(0x20, 0x7F)) | set(range(0xA0, 0xC0)) | {0xD7, 0xF7} | set(range(0x2000, 0x2070)) | {0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, ord('σ')}
EXTRA = 'λμΣβθρφηγκΔα' + '≥≤∂≈√∞' + '→' + '₂' + '₽'

src = sys.argv[1]
faces = [
    (f'{src}/SourceSerif4[opsz,wght].ttf', {'opsz': 14}, 'public/fonts/source-serif-4-latin-var.woff2', 'public/fonts/source-serif-4-extra-var.woff2'),
    (f'{src}/SourceCodePro[wght].ttf', {}, 'public/fonts/source-code-pro-latin-var.woff2', 'public/fonts/source-code-pro-extra-var.woff2'),
]

for path, pin, latin, extra in faces:
    shipped = TTFont(latin)
    features = sorted({r.FeatureTag for t in ('GSUB', 'GPOS') if t in shipped for r in shipped[t].table.FeatureList.FeatureRecord})
    names = sorted({n.nameID for n in shipped['name'].names})
    for out, chars in ((latin, LATIN), (extra, {ord(c) for c in EXTRA})):
        font = TTFont(path)
        if pin:
            # Pinned in memory, fontTools' lazily loaded variations lose glyphs; a round trip through bytes keeps them.
            pinned = io.BytesIO()
            instancer.instantiateVariableFont(font, pin).save(pinned)
            pinned.seek(0)
            font = TTFont(pinned)
        opts = subset.Options()
        opts.layout_features = features
        opts.flavor = 'woff2'
        opts.name_IDs = names
        opts.name_languages = ['*']
        opts.notdef_outline = True
        opts.recalc_average_width = False
        opts.hinting = True
        opts.glyph_names = False
        opts.drop_tables += ['DSIG']
        s = subset.Subsetter(opts)
        s.populate(unicodes=sorted(c for c in chars if c in font.getBestCmap()))
        s.subset(font)
        # The fallback's size-adjust is derived from this; keep the shipped file's.
        font['OS/2'].xAvgCharWidth = shipped['OS/2'].xAvgCharWidth
        font.flavor = 'woff2'
        font.save(out)
        print(out)
