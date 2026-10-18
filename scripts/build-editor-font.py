#!/usr/bin/env python3
"""Keep Whyte's text/metrics/layout and append Zojer outlines for native plain-text inputs.

Requires fonttools==4.67.0. Outputs a private app asset, not a redistributable typeface.
"""
from pathlib import Path
from copy import deepcopy
from fontTools.ttLib import TTFont
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.recordingPen import RecordingPen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/fonts'
body = TTFont(ASSETS / 'ABCWhyteEdu-Book.otf', recalcTimestamp=False)
symbols = TTFont(ASSETS / 'ZojerSymbols-Regular.ttf')
assert body['head'].unitsPerEm == symbols['head'].unitsPerEm == 1000
original_order = body.getGlyphOrder()[:]
original_cmap = body.getBestCmap().copy()
original_metrics = body['hmtx'].metrics.copy()
original_glyphs = body.getGlyphSet()
drawings = {}
for name in original_order:
    pen = RecordingPen(); original_glyphs[name].draw(pen); drawings[name] = pen.value
cff = body['CFF '].cff
top = cff.topDictIndex[0]
order = original_order[:]
mapping = {}
for cp, source_name in symbols.getBestCmap().items():
    if cp == 0x20:
        continue  # Retain Whyte's word spacing.
    name = f'zojer{cp:04X}'
    assert name not in order
    width, lsb = symbols['hmtx'][source_name]
    pen = T2CharStringPen(width - top.Private.nominalWidthX, symbols.getGlyphSet())
    symbols.getGlyphSet()[source_name].draw(pen)
    charstring = pen.getCharString(private=top.Private, globalSubrs=cff.GlobalSubrs)
    index = top.CharStrings.charStringsIndex
    top.CharStrings.charStrings[name] = len(index)
    index.append(charstring)
    order.append(name)
    body['hmtx'][name] = (width, lsb)
    mapping[cp] = name
top.charset = order
body.setGlyphOrder(order)
for table in body['cmap'].tables:
    if table.isUnicode() and table.format in (4, 12):
        table.cmap.update(mapping)
for table in symbols['cmap'].tables:
    if table.format == 14:
        body['cmap'].tables.append(deepcopy(table))
# A distinct app-local name prevents colliding with the unmodified body face.
family = 'Jera Editor'
for name_id, value in {1: family, 2: 'Regular', 3: 'JeraEditor-0.005', 4: family+' Regular', 6: 'JeraEditor-Regular', 16: family, 17: 'Regular'}.items():
    for platform, encoding, language in [(3, 1, 0x409), (1, 0, 0)]:
        body['name'].setName(value, name_id, platform, encoding, language)
cff.fontNames = ['JeraEditor-Regular']
top.FamilyName = family
top.FullName = family + ' Regular'
if 'DSIG' in body:
    del body['DSIG']  # The original signature cannot describe a modified font.
body['head'].modified = 3875040000
body['OS/2'].recalcUnicodeRanges(body)
target = ASSETS / 'JeraEditor-Regular.otf'
body.save(target)
with TTFont(target, checkChecksums=2) as result:
    assert result.getBestCmap() == original_cmap | mapping
    for name in original_order:
        pen = RecordingPen(); result.getGlyphSet()[name].draw(pen)
        assert pen.value == drawings[name], name
        assert result['hmtx'][name] == original_metrics[name], name
    for cp, name in mapping.items():
        assert result.getGlyphSet()[name].width == symbols['hmtx'][symbols.getBestCmap()[cp]][0]
print(f'Built {target.name}: {len(mapping)} symbols; original lettering and spacing verified')
