"""Closed-translation, provenance and numerical API checks; not biological validation."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

from prepare_bondarenko import (ADAPTATION_BYTES, ADAPTATION_SHA256, COUNTS, C_BYTES,
                               C_SHA256, ExpressionParser, LICENSE_NOTICE, MAX_SOURCE_BYTES,
                               MODEL_URL, MODULE, OUTPUT, RAW_C, RAW_XML, ROOT, XML_BYTES,
                               XML_SHA256, emit, make_manifest, make_module, parse_c,
                               pinned, prepare, state_metadata, validate_xml)


def minimal_c():
    """Complete synthetic statement inventory for testing the closed grammar."""
    init = '\n'.join(f'{array}[{i}] = 0;' for array in ('CONSTANTS', 'STATES') for i in range(COUNTS[array]))
    rates = '\n'.join(f'RATES[{i}] = STATES[0] + CONSTANTS[0];' for i in range(41))
    variables = '\n'.join(f'ALGEBRAIC[{i}] = 1;' for i in range(71))
    return (f'void initConsts(double* CONSTANTS, double* RATES, double *STATES){{{init}}}'
            f'void computeRates(double VOI,double* CONSTANTS,double* RATES,double* STATES,double* ALGEBRAIC){{{rates}{variables}}}'
            f'void computeVariables(double VOI,double* CONSTANTS,double* RATES,double* STATES,double* ALGEBRAIC){{{variables}}}').encode('ascii')


class BondarenkoTests(unittest.TestCase):
    def test_bundled_identity_units_license_and_unvalidated_scope(self):
        module = MODULE.read_bytes()
        manifest = json.loads((OUTPUT / 'manifest.json').read_text())
        self.assertEqual((len(module), hashlib.sha256(module).hexdigest()), (ADAPTATION_BYTES, ADAPTATION_SHA256))
        self.assertEqual(manifest, make_manifest(module))
        self.assertEqual(manifest['counts'], {'states': 41, 'algebraic': 71, 'constants': 73})
        self.assertEqual(manifest['source']['license'], 'CC-BY-3.0')
        self.assertEqual(manifest['source']['cellml']['sha256'], XML_SHA256)
        self.assertEqual(manifest['source']['generatedC']['sha256'], C_SHA256)
        self.assertEqual(manifest['sourceProtocol']['temperatureK'], 298)
        self.assertEqual(manifest['outputs']['Vm'], {'stateIndex': 0, 'unit': 'millivolt'})
        self.assertEqual(manifest['outputs']['Cai'], {'stateIndex': 1, 'unit': 'micromolar'})
        self.assertEqual(manifest['outputs']['Cass'], {'stateIndex': 2, 'unit': 'micromolar'})
        self.assertTrue(manifest['validation']['solverIncluded'])
        self.assertEqual(manifest['validation']['integration']['variants'], ['archived-source','balanced-transition'])
        self.assertFalse(manifest['validation']['independentApplicationValidation'])
        self.assertIn('Figure 16', manifest['validation']['sourceReported'])
        self.assertEqual((OUTPUT / 'LICENSE.md').read_text(), LICENSE_NOTICE)
        self.assertIn('Qasim Hussain adapted', LICENSE_NOTICE)
        self.assertNotIn(b'@', module)
        self.assertNotRegex(json.dumps(manifest), r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
        self.assertNotIn('@', LICENSE_NOTICE)

    def test_changed_source_or_adaptation_is_rejected_before_translation(self):
        with self.assertRaisesRegex(ValueError, 'identity'):
            make_module(b'void unknown(){}')
        with self.assertRaisesRegex(ValueError, 'identity'):
            make_manifest(MODULE.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'identity'):
            validate_xml(b'<model/>')
        with self.assertRaisesRegex(ValueError, 'bound'):
            parse_c(b' ' * (MAX_SOURCE_BYTES + 1))

    def test_complete_closed_subset_and_assignment_order(self):
        parsed = parse_c(minimal_c())
        self.assertEqual({name: len(rows) for name, rows in parsed.items()},
                         {'initConsts': 114, 'computeRates': 112, 'computeVariables': 71})
        source = minimal_c().replace(b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = ALGEBRAIC[70];')
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            parse_c(source)
        source = minimal_c().replace(b'STATES[0] = 0;', b'STATES[0] = VOI;')
        with self.assertRaisesRegex(ValueError, 'time'):
            parse_c(source)

    def test_unsupported_c_constructs_and_writes_fail_closed(self):
        substitutions = [
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = system(1);'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = STATES[1 + 2];'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = STATES[41];'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'STATES[0] = 1;'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = 0; RATES[0] = 1;'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'for (;;) RATES[0] = 1;'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = (RATES[1] = 1);'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b'RATES[0] = 1 /*'),
            (b'RATES[0] = STATES[0] + CONSTANTS[0];', b''),
        ]
        for old, new in substitutions:
            with self.subTest(replacement=new):
                with self.assertRaises(ValueError):
                    parse_c(minimal_c().replace(old, new))
        with self.assertRaises(ValueError):
            parse_c(minimal_c() + b'void unexpected(){}')
        with self.assertRaises(ValueError):
            parse_c(b'#include <stdlib.h>\n' + minimal_c())

    def test_expression_grouping_literals_math_and_arity(self):
        self.assertEqual(emit(ExpressionParser('1 - 2 - 3 * -4').parse()), '((1 - 2) - (3 * (-4)))')
        self.assertEqual(emit(ExpressionParser('pow(1.25e-3, 2) + exp(-VOI)').parse()),
                         '(Math.pow(1.25e-3, 2) + Math.exp((-tMs)))')
        self.assertEqual(emit(ExpressionParser('VOI >= 20 && VOI <= 20.5 ? -80 : 0').parse()),
                         '(((tMs >= 20) && (tMs <= 20.5)) ? (-80) : 0)')
        for text in ['eval(1)', 'pow(1)', 'exp(1, 2)', 'Math.exp(1)', 'STATES[x]', '1;2',
                     'STATES[0]++', '1 << 2', '1e9999999999', '(' * 90 + '1' + ')' * 90,
                     '+'.join(['1'] * 100), 'STATES[' + '9' * 5000 + ']']:
            with self.subTest(expression=text):
                with self.assertRaises(ValueError):
                    ExpressionParser(text).parse()

    @unittest.skipUnless(RAW_C.is_file() and RAW_XML.is_file(), 'Originals are intentionally absent from source distributions')
    def test_originals_reproduce_every_generated_output_without_changes(self):
        original = RAW_C.read_bytes()
        pinned(original, C_BYTES, C_SHA256)
        pinned(RAW_XML.read_bytes(), XML_BYTES, XML_SHA256)
        self.assertEqual(make_module(original), MODULE.read_bytes())
        self.assertEqual(len(state_metadata(original)), 41)
        parsed = parse_c(original)
        self.assertEqual([index for array, index, _ in parsed['computeRates'] if array == 'RATES'][-1], 0)
        prepare(check=True)
        self.assertEqual(hashlib.sha256(RAW_C.read_bytes()).hexdigest(), C_SHA256)
        self.assertEqual(hashlib.sha256(RAW_XML.read_bytes()).hexdigest(), XML_SHA256)

    def test_typescript_equations_initial_rates_stimulus_and_input_immutability(self):
        candidates = [os.environ.get('MOUSEBIO_NODE'), str(ROOT / '.tools/node/bin/node'), shutil.which('node')]
        node = next((candidate for candidate in candidates if candidate and Path(candidate).is_file()), None)
        if node is None or not (ROOT / 'node_modules/tsx').exists():
            self.skipTest('The optional TypeScript smoke check requires Node and installed tsx')
        # This executes our generated closed-subset adaptation, never downloaded C.
        code = r'''
import assert from 'node:assert/strict';
import {createApicalModel,computeApicalRates,APICAL_STATE_COUNT,APICAL_ALGEBRAIC_COUNT,APICAL_CONSTANT_COUNT,APICAL_STATE_INDICES,APICAL_STIMULUS_INDICES,APICAL_SOURCE_STIMULUS} from './src/models/bondarenko-apical.ts';
const {states,constants}=createApicalModel();
const rates=new Float64Array(41).fill(NaN), algebraic=new Float64Array(71).fill(NaN);
assert.equal(states.length, APICAL_STATE_COUNT); assert.equal(constants.length, APICAL_CONSTANT_COUNT);
assert.equal(algebraic.length, APICAL_ALGEBRAIC_COUNT);
assert.deepEqual(APICAL_STATE_INDICES,{Vm:0,Cai:1,Cass:2});
assert.equal(states[0],-82.4202); assert.equal(states[1],0.115001); assert.equal(states[2],0.115001);
for (const [key,index] of Object.entries(APICAL_STIMULUS_INDICES)) assert.equal(constants[index],APICAL_SOURCE_STIMULUS[key]);
const beforeStates=states.slice(), beforeConstants=constants.slice();
computeApicalRates(0,states,rates,algebraic,constants);
assert.ok(rates.every(Number.isFinite)); assert.ok(algebraic.every(Number.isFinite));
assert.equal(rates[36],0); assert.equal(algebraic[0],0);
assert.ok(Math.abs(rates[6]-(0.0327*states[1]*(70-states[6])-0.0196*states[6]))<1e-14);
assert.ok(Math.abs(rates[7]-(0.00237*states[1]*(140-states[7])-0.000032*states[7]))<1e-14);
const baseline=rates.slice();
for (const t of [20,20.25,20.5,91.43]) {
  computeApicalRates(t,states,rates,algebraic,constants);
  assert.equal(algebraic[0],-80); assert.ok(Math.abs(rates[0]-baseline[0]-80)<1e-12);
  for(let i=1;i<41;i++) assert.equal(rates[i],baseline[i]);
}
for (const t of [19.999999,20.500001,100001]) {
  computeApicalRates(t,states,rates,algebraic,constants); assert.equal(algebraic[0],0);
}
assert.deepEqual(states,beforeStates); assert.deepEqual(constants,beforeConstants);
assert.throws(()=>computeApicalRates(NaN,states,rates,algebraic,constants),RangeError);
assert.throws(()=>computeApicalRates(0,states,states,algebraic,constants),RangeError);
assert.throws(()=>computeApicalRates(0,states,new Float64Array(40),algebraic,constants),RangeError);
const storage=new ArrayBuffer((41+41+71+73)*8);
const s=new Float64Array(storage,0,41),r=new Float64Array(storage,41*8,41),a=new Float64Array(storage,82*8,71),c=new Float64Array(storage,153*8,73);
s.set(states);c.set(constants);computeApicalRates(0,s,r,a,c);
assert.deepEqual(s,states);assert.deepEqual(c,constants);assert.ok(r.every(Number.isFinite));
const singular=states.slice(); singular[0]=-26.5;
computeApicalRates(0,singular,rates,algebraic,constants);
assert.ok(!Number.isFinite(algebraic[8]));
console.log('apical numerical API checks passed');
'''
        result = subprocess.run([node, '--import', 'tsx', '--input-type=module', '-e', code],
                                cwd=ROOT, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, 'Generated adaptation numerical API check failed: ' + result.stderr[:1500])
        self.assertIn('apical numerical API checks passed', result.stdout)


if __name__ == '__main__':
    unittest.main()
