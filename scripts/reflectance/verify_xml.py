#!/usr/bin/env python3
"""Independently compare published phone points directly with original XML."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--xml-source', type=Path, default=Path('/Volumes/dav/黄海波/反射率.xml'))
args = parser.parse_args()
content = args.xml_source.read_bytes()
if b'<!DOCTYPE' in content or b'<!ENTITY' in content:
    raise ValueError('XML entity declarations are not accepted')
xml = ET.fromstring(content)
root = Path(__file__).resolve().parents[2]
spec = json.loads(Path(__file__).with_name('raw-spec.json').read_text())
index = json.loads((root / 'data/reflectance/index.json').read_text())
points = 0
for mapping in spec['samples']:
    original = next(e for e in xml.iter(mapping['recordTag']) if e.get('ID') == mapping['recordId'])
    assert original.get('Name') == mapping['expectedName']
    phone = next(p for p in index['phones'] if p['id'] == mapping['phoneId'])
    assert phone['deviceType'] == 'phone'
    condition = next(c for c in phone['conditions'] if c['id'] == mapping['conditionId'])
    for method, kind in [('SCI', 'total'), ('SCE', 'diffuse')]:
        node = original.find(method + '/Reflectances')
        start, end, step = (int(node.get(k)) for k in ['MinWavelength', 'MaxWavelength', 'WavelengthStep'])
        fractions = [float(value) for value in node.text.split(';')]
        curve = condition['curves'][kind]
        assert len(curve['samples']) == len(fractions) == (end - start) // step + 1
        assert curve['sourceKind'] == 'instrument-xml' and curve['digitized'] is False
        for i, (wave, value) in enumerate(curve['samples']):
            assert wave == start + i * step and value == fractions[i] * 100
            points += 1
assert all(p['id'] not in spec['excludedDeviceIds'] for p in index['phones'])
assert {p['id'] for p in index['phones']} == {s['phoneId'] for s in spec['samples']}
print(f'Independent XML → published JSON: {points} original points identical; {len(index["phones"])} phones')
