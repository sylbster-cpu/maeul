// 모델 묶기: src/parts.js 가 가리키는 glTF 모델을 읽어 assets/models.json 하나로 만든다.
// 사용법: node tools/pack-models.mjs   (부품을 추가하거나 모델을 바꾼 뒤 실행)
// 원본(assets-src/묶음이름/모델이름.gltf 와 .bin)이 없는 모델은 이미 묶어 둔 것을 그대로 쓴다.
// 그래서 원본 모델을 빼고 나눠 준 사본에서도 새 모델만 넣고 실행하면 된다. (.glb 는 아직 읽지 못한다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { PARTS, EXTRA_MODELS } from '../src/parts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets-src');
const OUT = path.join(root, 'assets');

const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(json, buffers, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const Ctor = COMPONENTS[acc.componentType];
  const n = TYPE_SIZE[acc.type];
  const buf = buffers[view.buffer];
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || Ctor.BYTES_PER_ELEMENT * n;
  const out = new Ctor(acc.count * n);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const get = {
    5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
    5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
  }[acc.componentType];
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) out[i * n + c] = get(base + i * stride + c * Ctor.BYTES_PER_ELEMENT);
  }
  return out;
}

function packModel(ref) {
  const [pack, name] = ref.split('/');
  const file = path.join(SRC, pack, name + '.gltf');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const buffers = json.buffers.map((b) => fs.readFileSync(path.join(SRC, pack, b.uri)));
  const pos = [], nrm = [], uv = [], idx = [];

  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else {
      local.compose(
        new THREE.Vector3(...(node.translation || [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
        new THREE.Vector3(...(node.scale || [1, 1, 1])),
      );
    }
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
      for (const prim of json.meshes[node.mesh].primitives) {
        const p = readAccessor(json, buffers, prim.attributes.POSITION);
        const n = readAccessor(json, buffers, prim.attributes.NORMAL);
        const t = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, buffers, prim.attributes.TEXCOORD_0) : new Float32Array((p.length / 3) * 2);
        const baseIndex = pos.length / 3;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.length; i += 3) {
          v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(world); pos.push(v.x, v.y, v.z);
          v.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(normalMatrix).normalize(); nrm.push(v.x, v.y, v.z);
        }
        for (let i = 0; i < t.length; i++) uv.push(t[i]);
        if (prim.indices !== undefined) { for (const k of readAccessor(json, buffers, prim.indices)) idx.push(baseIndex + k); }
        else { for (let k = 0; k < p.length / 3; k++) idx.push(baseIndex + k); }
      }
    }
    for (const child of node.children || []) visit(child, world);
  };
  const scene = json.scenes[json.scene || 0];
  for (const n of scene.nodes) visit(n, new THREE.Matrix4());

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], pos[i + c]); max[c] = Math.max(max[c], pos[i + c]); }
  const round = (a) => a.map((x) => Math.round(x * 1000) / 1000);
  const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
  const big = pos.length / 3 > 65535;
  return {
    tex: pack,
    pos: b64(new Float32Array(pos)), nrm: b64(new Float32Array(nrm)), uv: b64(new Float32Array(uv)),
    idx: b64(big ? new Uint32Array(idx) : new Uint16Array(idx)), idx32: big,
    min: round(min), max: round(max), tris: idx.length / 3,
  };
}

const refs = new Set(EXTRA_MODELS);
for (const part of Object.values(PARTS)) for (const key of ['model', 'leaf']) if (part[key]) refs.add(part[key]);

fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'models.json');
const previous = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const models = {};
const packs = new Set();
const missing = [];
console.log('모델'.padEnd(34), '크기(가로 x 높이 x 깊이)'.padEnd(26), '삼각형', '  출처');
for (const ref of [...refs].sort()) {
  const [pack, name] = ref.split('/');
  const hasSource = fs.existsSync(path.join(SRC, pack, name + '.gltf'));
  if (!hasSource && !previous[ref]) { missing.push(ref); continue; }
  const m = hasSource ? packModel(ref) : previous[ref];
  models[ref] = m;
  if (hasSource) packs.add(m.tex);
  const size = m.max.map((x, i) => (x - m.min[i]).toFixed(2));
  console.log(ref.padEnd(36), `${size[0]} x ${size[1]} x ${size[2]}`.padEnd(30), String(m.tris).padEnd(6), hasSource ? '원본' : '기존 묶음');
}
if (missing.length) {
  console.error(`\n원본 모델 파일이 없습니다. 아래 위치에 .gltf 와 .bin 을 넣어 주세요:\n${missing.map((r) => `  assets-src/${r}.gltf`).join('\n')}`);
  process.exit(1);
}
for (const pack of packs) {
  const texName = fs.readdirSync(path.join(SRC, pack)).find((f) => f.endsWith('.png'));
  if (texName) fs.copyFileSync(path.join(SRC, pack, texName), path.join(OUT, `tex_${pack}.png`));
  else if (!fs.existsSync(path.join(OUT, `tex_${pack}.png`))) {
    console.error(`\n텍스처가 없습니다: assets-src/${pack}/ 에 모델과 함께 받은 .png 를 넣어 주세요`);
    process.exit(1);
  }
}
fs.writeFileSync(outFile, JSON.stringify(models));
console.log(`\n${Object.keys(models).length}개 모델 → assets/models.json (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
