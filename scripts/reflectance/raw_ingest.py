#!/usr/bin/env python3
"""Import only reviewed smartphone reflectance samples from a ThreeNH job."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data' / 'reflectance'
RAW = DATA / 'raw' / 'phone-samples.json'
SPEC = Path(__file__).with_name('raw-spec.json')
SOURCE_ID = 'instrument-xml-phone-samples'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(path):
    content = path.read_bytes()
    if b'<!DOCTYPE' in content or b'<!ENTITY' in content:
        raise ValueError('XML entity declarations are not accepted')
    root = ET.fromstring(content)
    if root.tag != 'ThreeNHJob':
        raise ValueError('Expected a ThreeNHJob XML')
    approved = read(SPEC)
    samples = []
    for mapping in approved['samples']:
        matches = [e for e in root.iter(mapping['recordTag']) if e.get('ID') == mapping['recordId']]
        if len(matches) != 1 or matches[0].get('Name') != mapping['expectedName']:
            raise ValueError(f'Sample identity changed: {mapping}')
        element = matches[0]
        spectra = {}
        for method in ('SCI', 'SCE'):
            node = element.find(method)
            if node is None or node.get('IsReflectance') != 'True' or element.get('IsTransmission') != 'False':
                raise ValueError('Expected reflectance rather than transmission or emission')
            values = node.find('Reflectances')
            start, end, step = (int(values.get(k)) for k in ('MinWavelength', 'MaxWavelength', 'WavelengthStep'))
            fractions = [float(v) for v in values.text.split(';')]
            wavelengths = list(range(start, end + 1, step))
            if len(fractions) != len(wavelengths) or any(not 0 <= v <= 1 for v in fractions):
                raise ValueError('Invalid reflectance fraction grid')
            spectra[method] = {'rangeNm': [start, end], 'sampleStepNm': step,
                               'reflectanceFractions': fractions}
        samples.append({**mapping, 'sourceName': element.get('Name'),
                        'measuredAt': element.get('DateTime'),
                        'instrument': {k: element.get(k) for k in ('Instrument', 'OpticalStruct', 'MeasurementCaliber', 'UV', 'LensPosition')},
                        'spectra': spectra})
    return {'schemaVersion': 1, 'sourceKind': 'instrument-xml', 'sourceFilename': path.name,
            'sourceSha256': hashlib.sha256(content).hexdigest(), 'sourceBytes': len(content),
            'format': {'root': root.tag, 'version': root.get('Version')},
            'units': {'wavelength': 'nm', 'reflectance': 'fraction'},
            'percentConversionFactor': 100, 'samples': samples}


def apply_index(index):
    if not RAW.exists():
        return index
    raw = read(RAW)
    result = copy.deepcopy(index)
    excluded = set(read(SPEC)['excludedDeviceIds'])
    phones = {p['id']: p for p in result['phones'] if p['id'] not in excluded}
    for phone in phones.values():
        phone['deviceType'] = 'phone'
        for condition in phone['conditions']:
            for curve in condition['curves'].values():
                curve.update(sourceKind='png-digitized', sampleStepNm=2)
    for sample in raw['samples']:
        pid = sample['phoneId']
        phone = phones.setdefault(pid, {'id': pid, 'name': sample['phoneName'], 'deviceType': 'phone',
                                       'availability': 'complete', 'conditions': []})
        if sample.get('panel'):
            phone['panel'] = sample['panel']
        condition = next((c for c in phone['conditions'] if c['id'] == sample['conditionId']), None)
        if condition is None:
            condition = {'id': sample['conditionId'], 'curves': {}}
            phone['conditions'].append(condition)
        prior = condition['curves']
        condition.update(label=sample['conditionLabel'], sourceIds=[SOURCE_ID],
                         rawSampleId=sample['recordId'], sourceName=sample['sourceName'],
                         measuredAt=sample['measuredAt'])
        for method, kind in (('SCI', 'total'), ('SCE', 'diffuse')):
            spectrum = sample['spectra'][method]
            start, end = spectrum['rangeNm']
            step = spectrum['sampleStepNm']
            samples = [[start + i * step, value * 100] for i, value in enumerate(spectrum['reflectanceFractions'])]
            previous = prior.get(kind, {})
            curve = {'kind': kind, 'label': '全反射' if kind == 'total' else '漫反射',
                     'method': method, 'methodNote': 'ThreeNH XML IsReflectance=True',
                     'rangeNm': [start, end], 'coverageSpansNm': [[start, end]], 'samples': samples,
                     'digitized': False, 'sourceKind': 'instrument-xml', 'sampleStepNm': step,
                     'maxSampleGapNm': step, 'allowsLongGap': False,
                     'rawSampleId': sample['recordId'], 'sourceName': sample['sourceName'],
                     'measuredAt': sample['measuredAt'], 'instrument': sample['instrument'],
                     'sourceId': SOURCE_ID, 'sourceFile': 'raw/phone-samples.json',
                     'sourceRelativePath': raw['sourceFilename'], 'sourceSha256': raw['sourceSha256'],
                     'sourceValueUnit': 'fraction', 'percentConversionFactor': 100}
            if previous.get('legendLabelPercent') is not None:
                curve['legendLabelPercent'] = previous['legendLabelPercent']
                curve['corroboratingPngSourceId'] = previous['sourceId']
            condition['curves'][kind] = curve
        phone['availability'] = 'complete'
    for phone in phones.values():
        phone['conditions'].sort(key=lambda c: (c['id'] != 'as-measured', c['id']))
    png_digitization = result.pop('digitization', None)
    if png_digitization:
        result['corroboration'] = {'pngDigitization': png_digitization,
                                   'note': 'PNG extraction estimates apply only to corroborating plots or png-digitized fallback curves, not instrument accuracy.'}
    result.update(schemaVersion=2, phoneCount=len(phones), phones=list(phones.values()),
                  sourceKinds=sorted({c['sourceKind'] for p in phones.values() for q in p['conditions'] for c in q['curves'].values()}),
                  sampling={'sourceKind': 'instrument-xml',
                            'method': 'Original ThreeNH XML Reflectances points; fraction multiplied by 100',
                            'gridIsInstrumentSampling': True,
                            'sampleStepsNm': sorted({v['sampleStepNm'] for s in raw['samples'] for v in s['spectra'].values()}),
                            'methods': ['SCI', 'SCE'], 'interpolatedPointsAdded': False},
                  rawSource='raw/phone-samples.json', rawSourceSha256=raw['sourceSha256'],
                  excludedDevices=[{'id': 'ipad-pro-11-m4', 'reason': 'tablet; phone-only display'}])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('ingest', 'check'))
    parser.add_argument('--xml-source', type=Path, default=Path('/Volumes/dav/黄海波/反射率.xml'))
    args = parser.parse_args()
    extracted = extract(args.xml_source)
    if args.action == 'ingest':
        write(RAW, extracted)
        manifest = read(DATA / 'source-manifest.json')
        manifest['rawSource'] = {'id': SOURCE_ID, 'sourceKind': 'instrument-xml',
                                 'exportFile': 'raw/phone-samples.json', 'exportSha256': digest(RAW),
                                 'sourceFilename': extracted['sourceFilename'],
                                 'sourceSha256': extracted['sourceSha256'], 'sourceBytes': extracted['sourceBytes'],
                                 'sampleCount': len(extracted['samples']),
                                 'phoneCount': len({s['phoneId'] for s in extracted['samples']})}
        write(DATA / 'source-manifest.json', manifest)
        import rebuild
        write(DATA / 'index.json', rebuild.build_index(read(rebuild.SPEC_PATH), manifest))
    else:
        if extracted != read(RAW):
            raise ValueError('Original XML and exported smartphone samples differ')
        published = read(DATA / 'index.json')
        point_count = 0
        for sample in extracted['samples']:
            phone = next(p for p in published['phones'] if p['id'] == sample['phoneId'])
            condition = next(c for c in phone['conditions'] if c['id'] == sample['conditionId'])
            for method, kind in (('SCI', 'total'), ('SCE', 'diffuse')):
                values = sample['spectra'][method]
                expected = [[values['rangeNm'][0] + i * values['sampleStepNm'], v * 100]
                            for i, v in enumerate(values['reflectanceFractions'])]
                if expected != condition['curves'][kind]['samples']:
                    raise ValueError('Published point differs from original XML')
                point_count += len(expected)
        print(f'XML → smartphone export → published JSON: {point_count} points identical')


if __name__ == '__main__':
    main()
