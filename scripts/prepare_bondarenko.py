"""Generate the pinned Bondarenko apical equation adaptation without executing C.

Original integration code: MIT, Qasim Hussain. Generated model mathematics:
CC BY 3.0, with the source authors and changes credited in the model notice.
Network acquisition is deliberately separate. Only the two exact local originals
are accepted by prepare(); the parser accepts a closed mathematical C subset.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RAW_XML = ROOT / 'data/raw/bondarenko2004-apical.cellml'
RAW_C = ROOT / 'data/raw/bondarenko2004-apical-generated.c'
MODULE = ROOT / 'src/models/bondarenko-apical.ts'
OUTPUT = ROOT / 'public/models/bondarenko-apical'
MAX_SOURCE_BYTES = 256 * 1024
XML_BYTES = 180679
XML_SHA256 = '65dafa8b5a00b9fe98ab70ba453afe321c06e41bf9a01fb31b7e689732cb4176'
C_BYTES = 41257
C_SHA256 = '421aacd776c15bdab78c85c36df791fd27e07872af9297764168e0f9f35a525c'
ADAPTATION_BYTES = 25153
ADAPTATION_SHA256 = '055d314f5f05d3fbe1cea5be1505ddc8d1c01ca97dcd5def50d091b9519dcee9'
REVISION = '94d9d4f47495d86fec040f5439c7e3a4ffccb611'
EXPOSURE = 'https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e'
MODEL_NAME = 'bondarenko_szigeti_bett_kim_rasmusson_2004_apical.cellml'
MODEL_URL = f'{EXPOSURE}/{MODEL_NAME}'
XML_URL = ('https://models.physiomeproject.org/workspace/'
           f'bondarenko_szigeti_bett_kim_rasmusson_2004/rawfile/{REVISION}/{MODEL_NAME}')
C_URL = f'{MODEL_URL}/@@cellml_codegen/C/raw'
LICENSE_URL = 'https://creativecommons.org/licenses/by/3.0/'
COUNTS = {'STATES': 41, 'RATES': 41, 'ALGEBRAIC': 71, 'CONSTANTS': 73}
ARRAY_NAMES = {'STATES': 'states', 'RATES': 'rates', 'ALGEBRAIC': 'algebraic', 'CONSTANTS': 'constants'}
FUNCTIONS = {'exp': ('Math.exp', 1), 'log': ('Math.log', 1),
             'floor': ('Math.floor', 1), 'pow': ('Math.pow', 2)}
MAX_TOKENS = 30000
MAX_EXPRESSION_DEPTH = 80
TOKEN = re.compile(r'\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|'
                   r'([A-Za-z_][A-Za-z_0-9]*)|(&&|\|\||<=|>=|==|!=|[+*/<>()\[\],?:;=\-]))', re.ASCII)
PRECEDENCE = {'||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4,
              '+': 5, '-': 5, '*': 6, '/': 6}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def pinned(body: bytes, size: int, digest: str) -> None:
    require(isinstance(body, bytes) and 0 < len(body) <= MAX_SOURCE_BYTES, 'Source byte bound failed')
    require(len(body) == size and hashlib.sha256(body).hexdigest() == digest, 'Pinned source identity mismatch')


class ExpressionParser:
    """Parse only numeric expressions, fixed array reads and four math functions.

    Each node is a tuple; no dynamic lookup, imports, C execution, Python eval or
    JavaScript eval is used. Operators retain the original C grouping and order.
    """
    def __init__(self, text: str):
        self.tokens: list[str] = []
        pos = 0
        while pos < len(text):
            if not text[pos:].strip():
                break
            match = TOKEN.match(text, pos)
            require(match is not None, 'Unsupported expression token')
            self.tokens.append(next(value for value in match.groups() if value is not None))
            require(len(self.tokens) <= MAX_TOKENS, 'Expression token bound failed')
            pos = match.end()
        self.pos = 0

    def peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def take(self, expected: str | None = None) -> str:
        token = self.peek()
        require(token is not None and (expected is None or token == expected), 'Malformed numeric expression')
        self.pos += 1
        return token

    def expression(self, minimum: int = 0, depth: int = 0) -> tuple:
        require(depth <= MAX_EXPRESSION_DEPTH, 'Expression depth bound failed')
        token = self.take()
        if token in ('+', '-'):
            left = ('unary', token, self.expression(7, depth + 1))
        elif token == '(':
            left = self.expression(0, depth + 1)
            self.take(')')
        elif re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', token, re.ASCII):
            require(math.isfinite(float(token)), 'Numeric literal must be finite')
            left = ('number', token)
        elif token == 'VOI':
            left = ('time',)
        elif token in COUNTS:
            self.take('[')
            index_text = self.take()
            require(re.fullmatch(r'0|[1-9]\d*', index_text, re.ASCII) is not None, 'Array index must be a fixed integer')
            require(len(index_text) <= 3, 'Array index bound failed')
            index = int(index_text)
            require(index < COUNTS[token], 'Array index bound failed')
            self.take(']')
            left = ('read', token, index)
        elif token in FUNCTIONS:
            self.take('(')
            arguments = [self.expression(0, depth + 1)]
            while self.peek() == ',':
                self.take(',')
                require(len(arguments) < 2, 'Math function arity failed')
                arguments.append(self.expression(0, depth + 1))
            self.take(')')
            require(len(arguments) == FUNCTIONS[token][1], 'Math function arity failed')
            left = ('call', token, tuple(arguments))
        else:
            raise ValueError('Unsupported expression identifier')
        while self.peek() in PRECEDENCE and PRECEDENCE[self.peek()] >= minimum:
            operator = self.take()
            right = self.expression(PRECEDENCE[operator] + 1, depth + 1)
            left = ('binary', operator, left, right)
        if minimum == 0 and self.peek() == '?':
            self.take('?')
            yes = self.expression(0, depth + 1)
            self.take(':')
            no = self.expression(0, depth + 1)
            left = ('conditional', left, yes, no)
        return left

    def parse(self) -> tuple:
        result = self.expression()
        require(self.peek() is None, 'Unexpected expression suffix')
        pending = [(result, 0)]
        while pending:
            node, depth = pending.pop()
            require(depth <= MAX_EXPRESSION_DEPTH, 'Expression depth bound failed')
            if node[0] in ('number', 'time', 'read'):
                continue
            children = node[2] if node[0] == 'call' else (node[2],) if node[0] == 'unary' else node[2:] if node[0] == 'binary' else node[1:]
            pending.extend((child, depth + 1) for child in children)
        return result


def reads(node: tuple) -> set[tuple[str, int]]:
    kind = node[0]
    if kind == 'read':
        return {(node[1], node[2])}
    if kind in ('number', 'time'):
        return set()
    if kind == 'call':
        children = node[2]
    elif kind == 'unary':
        children = (node[2],)
    elif kind == 'binary':
        children = (node[2], node[3])
    else:
        children = node[1:]
    result: set[tuple[str, int]] = set()
    for child in children:
        result.update(reads(child))
    return result


def has_time(node: tuple) -> bool:
    if node[0] == 'time':
        return True
    if node[0] in ('number', 'read'):
        return False
    children = node[2] if node[0] == 'call' else (node[2],) if node[0] == 'unary' else node[2:] if node[0] == 'binary' else node[1:]
    return any(has_time(child) for child in children)


def emit(node: tuple) -> str:
    kind = node[0]
    if kind == 'number':
        return node[1]
    if kind == 'time':
        return 'tMs'
    if kind == 'read':
        return f'{ARRAY_NAMES[node[1]]}[{node[2]}]'
    if kind == 'call':
        return f'{FUNCTIONS[node[1]][0]}({", ".join(emit(child) for child in node[2])})'
    if kind == 'unary':
        return f'({node[1]}{emit(node[2])})'
    if kind == 'binary':
        operator = {'==': '===', '!=': '!=='}.get(node[1], node[1])
        return f'({emit(node[2])} {operator} {emit(node[3])})'
    return f'({emit(node[1])} ? {emit(node[2])} : {emit(node[3])})'


def parse_c(source: bytes) -> dict[str, list[tuple[str, int, tuple]]]:
    """Validate the whole generated input, including unused computeVariables."""
    require(isinstance(source, bytes) and 0 < len(source) <= MAX_SOURCE_BYTES, 'Source byte bound failed')
    try:
        text = source.decode('ascii')
    except UnicodeDecodeError:
        raise ValueError('Generated C must be ASCII') from None
    text = re.sub(r'/\*[^*]*(?:\*(?!/)[^*]*)*\*/', '', text)
    require('/*' not in text and '*/' not in text, 'Malformed source comment')
    pattern = re.compile(r'void\s+(initConsts|computeRates|computeVariables)\(([^()]*)\)\s*\{([^{}]*)\}', re.ASCII)
    matches = list(pattern.finditer(text))
    require([match[1] for match in matches] == ['initConsts', 'computeRates', 'computeVariables'], 'Unexpected generated function inventory')
    require(not pattern.sub('', text).strip(), 'Unsupported generated C outside functions')
    signatures = {
        'initConsts': 'double*CONSTANTS,double*RATES,double*STATES',
        'computeRates': 'doubleVOI,double*CONSTANTS,double*RATES,double*STATES,double*ALGEBRAIC',
        'computeVariables': 'doubleVOI,double*CONSTANTS,double*RATES,double*STATES,double*ALGEBRAIC',
    }
    result = {}
    for match in matches:
        name, signature, body = match.groups()
        require(re.sub(r'\s+', '', signature) == signatures[name], 'Unexpected generated function signature')
        statements = body.split(';')
        require(not statements[-1].strip(), 'Generated assignment terminator missing')
        allowed = {'STATES', 'CONSTANTS'} if name == 'initConsts' else {'RATES', 'ALGEBRAIC'} if name == 'computeRates' else {'ALGEBRAIC'}
        available = set() if name == 'initConsts' else {(array, i) for array in ('STATES', 'CONSTANTS') for i in range(COUNTS[array])}
        assigned: set[tuple[str, int]] = set()
        parsed = []
        for statement in statements[:-1]:
            left = re.fullmatch(r'\s*(STATES|CONSTANTS|RATES|ALGEBRAIC)\[(0|[1-9]\d*)\]\s*=\s*(.*?)\s*', statement, re.S | re.ASCII)
            require(left is not None, 'Only explicit numeric assignments are supported')
            array, index_text, expression = left.groups()
            require(len(index_text) <= 3, 'Assignment target bound failed')
            index = int(index_text)
            require(array in allowed and index < COUNTS[array], 'Assignment target bound failed')
            target = (array, index)
            require(target not in assigned, 'Repeated assignment target')
            node = ExpressionParser(expression).parse()
            require(reads(node).issubset(available), 'Assignment reads an unavailable value')
            require(name != 'initConsts' or not has_time(node), 'Initializer cannot read time')
            parsed.append((array, index, node))
            assigned.add(target)
            available.add(target)
        expected = {(array, i) for array in allowed for i in range(COUNTS[array])}
        require(assigned == expected, 'Generated assignment coverage mismatch')
        result[name] = parsed
    return result


def state_metadata(source: bytes) -> list[dict]:
    text = source.decode('ascii')
    entries = re.findall(r'^ \* STATES\[(\d+)\] is ([A-Za-z_][A-Za-z_0-9]*) in component ([A-Za-z_][A-Za-z_0-9]*) \(([A-Za-z_][A-Za-z_0-9]*)\)\.$', text, re.M | re.ASCII)
    require(len(entries) == COUNTS['STATES'], 'State metadata inventory mismatch')
    records = sorted(({'index': int(i), 'name': name, 'component': component, 'unit': unit} for i, name, component, unit in entries), key=lambda row: row['index'])
    require([row['index'] for row in records] == list(range(COUNTS['STATES'])), 'State metadata index mismatch')
    return records


def validate_xml(source: bytes) -> None:
    pinned(source, XML_BYTES, XML_SHA256)
    root = ET.fromstring(source)
    ns = {'m': 'http://www.w3.org/1998/Math/MathML'}
    require(len(root.findall('.//m:apply[m:diff]', ns)) == COUNTS['STATES'], 'CellML differential-state count mismatch')


def make_module(source: bytes) -> bytes:
    pinned(source, C_BYTES, C_SHA256)
    functions = parse_c(source)
    metadata = state_metadata(source)
    lines = [
        '// SPDX-License-Identifier: CC-BY-3.0',
        '// Bondarenko et al. (2004), apical mouse ventricular-myocyte equations.',
        '// Adapted from pinned Physiome CellML generated C without changing equations.',
        '// See public/models/bondarenko-apical/LICENSE.md for attribution and limits.',
        '// Generated by scripts/prepare_bondarenko.py; do not edit numeric assignments.',
        '',
        'export const APICAL_STATE_COUNT = 41;',
        'export const APICAL_ALGEBRAIC_COUNT = 71;',
        'export const APICAL_CONSTANT_COUNT = 73;',
        "export const APICAL_SOURCE_C_SHA256 = '" + C_SHA256 + "';",
        'export const APICAL_STATE_INDICES = Object.freeze({ Vm: 0, Cai: 1, Cass: 2 });',
        "export const APICAL_OUTPUT_UNITS = Object.freeze({ time: 'millisecond', Vm: 'millivolt', Cai: 'micromolar', Cass: 'micromolar' });",
        'export const APICAL_STIMULUS_INDICES = Object.freeze({ startMs: 12, endMs: 13, periodMs: 14, durationMs: 15, amplitudePaPerPf: 16 });',
        'export const APICAL_SOURCE_STIMULUS = Object.freeze({ startMs: 20, endMs: 100000, periodMs: 71.43, durationMs: 0.5, amplitudePaPerPf: -80, temperatureK: 298 });',
        'export const APICAL_STATE_METADATA = Object.freeze([',
    ]
    lines.extend('  Object.freeze(' + json.dumps(row, separators=(',', ':')) + '),' for row in metadata)
    lines.extend([
        '] as const);',
        '',
        '/** Exact source initial conditions and constants. No equilibrium is inferred. */',
        'export function createApicalModel(): { states: Float64Array; constants: Float64Array } {',
        '  const states = new Float64Array(APICAL_STATE_COUNT);',
        '  const constants = new Float64Array(APICAL_CONSTANT_COUNT);',
    ])
    lines.extend(f'  {ARRAY_NAMES[array]}[{index}] = {emit(node)};' for array, index, node in functions['initConsts'])
    lines.extend([
        '  return { states, constants };',
        '}',
        '',
        'function overlaps(a: Float64Array, b: Float64Array): boolean {',
        '  return a.buffer === b.buffer && a.byteOffset < b.byteOffset + b.byteLength && b.byteOffset < a.byteOffset + a.byteLength;',
        '}',
        '',
        '/** In-place source equations; caller owns integration, convergence and failure checks.',
        ' * Both output buffers are overwritten completely. Inputs are never mutated.',
        ' * Source removable singularities are preserved, without numerical regularization.',
        ' * No allocations occur for valid calls. This function is not a physiological solver.',
        ' */',
        'export function computeApicalRates(tMs: number, states: Float64Array, rates: Float64Array, algebraic: Float64Array, constants: Float64Array): void {',
        '  if (!Number.isFinite(tMs) || !(states instanceof Float64Array) || states.length !== APICAL_STATE_COUNT',
        '      || !(rates instanceof Float64Array) || rates.length !== APICAL_STATE_COUNT',
        '      || !(algebraic instanceof Float64Array) || algebraic.length !== APICAL_ALGEBRAIC_COUNT',
        '      || !(constants instanceof Float64Array) || constants.length !== APICAL_CONSTANT_COUNT',
        '      || overlaps(states, rates) || overlaps(states, algebraic) || overlaps(constants, rates)',
        '      || overlaps(constants, algebraic) || overlaps(rates, algebraic)) {',
        "    throw new RangeError('Invalid apical model buffers or time.');",
        '  }',
    ])
    lines.extend(f'  {ARRAY_NAMES[array]}[{index}] = {emit(node)};' for array, index, node in functions['computeRates'])
    lines.extend(['}', ''])
    module = '\n'.join(lines).encode('ascii')
    pinned(module, ADAPTATION_BYTES, ADAPTATION_SHA256)
    return module


def make_manifest(module: bytes) -> dict:
    pinned(module, ADAPTATION_BYTES, ADAPTATION_SHA256)
    return {
        'schemaVersion': 'mousebio.cellular-model.v1',
        'id': 'bondarenko2004-apical-v1',
        'title': 'Bondarenko 2004 mouse apical ventricular-myocyte model',
        'classification': 'source-parameterized-cellular-model',
        'species': 'Mus musculus',
        'scope': 'One parameterized apical ventricular myocyte, without anatomical registration or contraction mechanics.',
        'source': {
            'citation': 'Bondarenko VE, Szigeti GP, Bett GCL, Kim SJ, Rasmusson RL. Computer model of action potential of mouse ventricular myocytes. Am J Physiol Heart Circ Physiol. 2004;287:H1378-H1403. doi:10.1152/ajpheart.00185.2003.',
            'repositoryCitation': 'Lloyd CM, Lawson JR, Hunter PJ, Nielsen PF. The CellML Model Repository. Bioinformatics. 2008;24(18):2122-2123. doi:10.1093/bioinformatics/btn390.',
            'cellmlCredits': ['Catherine Lloyd', 'Penny J Noble', 'James R Lawson'],
            'exposure': EXPOSURE,
            'revision': REVISION,
            'license': 'CC-BY-3.0',
            'licenseUrl': LICENSE_URL,
            'licenseEvidenceUrl': f'{MODEL_URL}/license_citation',
            'accessDate': '2026-10-30',
            'cellml': {'url': XML_URL, 'bytes': XML_BYTES, 'sha256': XML_SHA256},
            'generatedC': {'url': C_URL, 'bytes': C_BYTES, 'sha256': C_SHA256},
        },
        'adaptation': {
            'file': 'src/models/bondarenko-apical.ts', 'bytes': len(module),
            'sha256': hashlib.sha256(module).hexdigest(),
            'method': 'Closed-subset translation of explicit numeric assignments, preserving order, arithmetic grouping, initial values and source stimulus inequalities; no downloaded code is executed.',
            'modifications': ['C arrays and math functions translated to Float64Array and JavaScript Math.',
                              'Fixed buffer and aliasing guards added.',
                              'Source contact metadata, editor headers and unrelated model variants omitted.',
                              'No equation, parameter, temperature correction or singularity regularization added.'],
        },
        'counts': {'states': 41, 'algebraic': 71, 'constants': 73},
        'outputs': {'time': {'unit': 'millisecond'}, 'Vm': {'stateIndex': 0, 'unit': 'millivolt'},
                    'Cai': {'stateIndex': 1, 'unit': 'micromolar'}, 'Cass': {'stateIndex': 2, 'unit': 'micromolar'}},
        'sourceProtocol': {'stimulusStartMs': 20, 'stimulusEndMs': 100000, 'periodMs': 71.43,
                           'durationMs': 0.5, 'amplitudePaPerPf': -80, 'temperatureK': 298,
                           'initialVmMillivolt': -82.4202, 'initialCaiMicromolar': 0.115001,
                           'initialCassMicromolar': 0.115001, 'stimulusAlgebraicIndex': 0},
        'validation': {
            'sourceReported': 'The repository curator reports that the apical CellML runs in OpenCell and COR to reproduce action-potential traces from Figure 16 of the publication.',
            'independentApplicationValidation': False,
            'solverIncluded': True,
            'equationModuleStandaloneSolver': False,
            'integration': {'file': 'src/domain/cardiac-cell.ts', 'method': 'Dormand-Prince 5(4)',
                            'variants': ['archived-source', 'balanced-transition'],
                            'transitionModification': 'Optional IC_Na2 influx substitution: gamma_Na4 * C_Na2 instead of gamma_Na4 * IC_Na2. Computational inference, not independently physiologically validated.'},
            'sourceGeneratedPythonReference': {'method': 'VODE BDF', 'absoluteTolerance': 1e-6,
                                                'relativeTolerance': 1e-6, 'maximumStepMs': 1},
        },
        'limitations': [
            'Outputs are model predictions, not observed physiology or validation of the selected anatomical specimen.',
            'The source temperature is 298 K; no conversion to body temperature is supplied.',
            'An apical single-cell action-potential model does not simulate contraction, organ motion, whole-heart conduction, vessel flow or whole-body physiology.',
            'No accepted spatial registration to anatomical meshes, vessel paths or nerve paths is supplied.',
            'The source has stiff dynamics and stimulus discontinuities; solver and protocol convergence must be checked independently.',
            'The generated Python template uses a 0-10 ms output interval before the 20 ms first stimulus; it is not a paced reference trace.',
            'Removable rate-expression singularities are retained exactly and may produce nonfinite output at special voltages.',
        ],
    }


LICENSE_NOTICE = '''# Bondarenko apical cellular model

The adapted model mathematics in `src/models/bondarenko-apical.ts` are licensed
under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
This source-specific license applies separately from the application's original MIT integration code.

Bondarenko VE, Szigeti GP, Bett GCL, Kim SJ, Rasmusson RL. Computer model of
action potential of mouse ventricular myocytes. *American Journal of Physiology,
Heart and Circulatory Physiology*. 2004;287:H1378-H1403.
[doi:10.1152/ajpheart.00185.2003](https://doi.org/10.1152/ajpheart.00185.2003).

The adaptation uses the [Physiome apical CellML exposure](https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e/bondarenko_szigeti_bett_kim_rasmusson_2004_apical.cellml/view),
workspace revision `94d9d4f47495d86fec040f5439c7e3a4ffccb611`, accessed 30 October 2026.
The exposure's [license statement](https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e/bondarenko_szigeti_bett_kim_rasmusson_2004_apical.cellml/license_citation)
specifies CC BY 3.0. CellML metadata credit Catherine Lloyd, Penny J Noble and
James R Lawson. The original XML retains its COR editor notice, Copyright
2002-2007 Dr Alan Garny; editor software is not part of this adaptation.

Lloyd CM, Lawson JR, Hunter PJ, Nielsen PF. The CellML Model Repository.
*Bioinformatics*. 2008;24(18):2122-2123.
[doi:10.1093/bioinformatics/btn390](https://doi.org/10.1093/bioinformatics/btn390).

Qasim Hussain adapted the generated C assignments into TypeScript using fixed
Float64Array buffers and JavaScript Math functions. Original assignment order,
arithmetic grouping, numeric initial conditions, parameters, source stimulus
boundaries and unregularized rate expressions are retained. Buffer guards and
source metadata exports were added. Contact metadata and editor headers were
omitted from the public derivative. The scripts that prepare and check this
adaptation are original MIT integration code.

This is a parameterized single mouse apical ventricular-myocyte model at the
source temperature of 298 K. Its predicted voltage and calcium concentrations
are not experimental observations, anatomical cellular detail, contraction,
whole-heart conduction, vessel flow or a complete organism simulation. It has no
accepted registration to the anatomical references. The repository curator's
reported Figure 16 reproduction is source-reported; this adaptation alone does
not establish independent physiological validation. The application supplies a
separate bounded numerical integrator and an explicitly labeled optional
balanced-transition substitution in the IC_Na2 derivative. Its mathematical
modification and derived reference traces retain CC BY 3.0. See
`docs/cardiac-cell-model.md` for the source defect and integration limits.
Stimulus discontinuities, stiffness, convergence and possible nonfinite values
at source rate-expression singularities require explicit solver checks.

The manifest retains exact source hashes, units, protocol and the adaptation
identity. Original XML and generated C remain in ignored local raw storage and
are not distributed with the source or web package.
'''


def prepare(check: bool = False) -> dict:
    xml, source = RAW_XML.read_bytes(), RAW_C.read_bytes()
    validate_xml(xml)
    module = make_module(source)
    manifest = make_manifest(module)
    files = {MODULE: module, OUTPUT / 'manifest.json': (json.dumps(manifest, indent=2) + '\n').encode('utf8'),
             OUTPUT / 'LICENSE.md': LICENSE_NOTICE.encode('utf8')}
    if check:
        for path, body in files.items():
            require(path.is_file() and path.read_bytes() == body, 'Prepared model differs from the pinned originals')
    else:
        for path, body in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare existing outputs without changing them')
    args = parser.parse_args()
    result = prepare(args.check)
    print(json.dumps({'model': result['id'], 'moduleBytes': result['adaptation']['bytes'],
                      'moduleSha256': result['adaptation']['sha256'], 'states': result['counts']['states']}))
