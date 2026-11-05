/** A minimal binary glTF writer: one mesh and node per surface, indexed triangles, no materials or textures. */
export interface GlbSurface {
  readonly id: string;
  readonly name: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  /** Optional per-vertex RGB in the range 0 to 1, for tissue patterning. */
  readonly colors?: Float32Array;
  /** Optional per-vertex fur length factor and direction, read by the coat display. */
  readonly fur?: Float32Array;
  /** Optional per-vertex fibre direction and tendon weight, read by the muscle display. */
  readonly fibre?: Float32Array;
}

const align = (value: number, to: number) => (value + to - 1) - ((value + to - 1) % to);

export function writeGlb(surfaces: readonly GlbSurface[], generator: string): Buffer {
  const views: object[] = [];
  const accessors: object[] = [];
  const meshes: object[] = [];
  const nodes: object[] = [];
  const parts: Buffer[] = [];
  let offset = 0;
  const pushBytes = (bytes: Buffer, target: number): number => {
    const padded = align(offset, 4);
    if (padded > offset) { parts.push(Buffer.alloc(padded - offset)); offset = padded; }
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    parts.push(bytes); offset += bytes.length;
    return views.length - 1;
  };
  const bytesOf = (array: Float32Array | Uint32Array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  surfaces.forEach((surface, index) => {
    const count = surface.positions.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < surface.positions.length; i += 3) for (let k = 0; k < 3; k++) {
      const value = surface.positions[i + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
    const attribute = (array: Float32Array, type: string, extra: object = {}) => {
      accessors.push({ bufferView: pushBytes(bytesOf(array), 34962), componentType: 5126, count: array.length / (type === 'VEC3' ? 3 : type === 'VEC4' ? 4 : 1), type, ...extra });
      return accessors.length - 1;
    };
    const attributes: Record<string, number> = {
      POSITION: attribute(surface.positions, 'VEC3', { min, max }),
      NORMAL: attribute(surface.normals, 'VEC3'),
    };
    if (surface.colors) attributes.COLOR_0 = attribute(surface.colors, 'VEC3');
    if (surface.fur) attributes._FUR = attribute(surface.fur, 'VEC4');
    if (surface.fibre) attributes._FIBER = attribute(surface.fibre, 'VEC4');
    accessors.push({ bufferView: pushBytes(bytesOf(surface.indices), 34963), componentType: 5125, count: surface.indices.length, type: 'SCALAR' });
    meshes.push({ name: surface.name, primitives: [{ attributes, indices: accessors.length - 1, mode: 4 }] });
    nodes.push({ name: surface.id, mesh: index, extras: { structureId: surface.id } });
    void count;
  });
  const padded = align(offset, 4);
  if (padded > offset) { parts.push(Buffer.alloc(padded - offset)); offset = padded; }
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0', generator },
    scene: 0, scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes, meshes, accessors, bufferViews: views, buffers: [{ byteLength: offset }],
  }), 'utf8');
  const jsonPadded = Buffer.concat([json, Buffer.alloc(align(json.length, 4) - json.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + offset, 8);
  const jsonHead = Buffer.alloc(8); jsonHead.writeUInt32LE(jsonPadded.length, 0); jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8); binHead.writeUInt32LE(offset, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHead, jsonPadded, binHead, ...parts]);
}
