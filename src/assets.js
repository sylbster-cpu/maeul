// 묶어 둔 모델(assets/models.json)과 텍스처를 불러와 three.js 기하와 재질로 만든다.
import * as THREE from './three.js';

function decode(base64, Type) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Type(bytes.buffer);
}

export async function loadAssets(base = 'assets/') {
  const response = await fetch(base + 'models.json');
  if (!response.ok) throw new Error('모델 묶음을 불러오지 못했습니다');
  const raw = await response.json();

  const packs = [...new Set(Object.values(raw).map((m) => m.tex))];
  const loader = new THREE.TextureLoader();
  const materials = {};
  await Promise.all(packs.map(async (pack) => {
    const tex = await loader.loadAsync(`${base}tex_${pack}.png`);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    materials[pack] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  }));

  const models = {};
  for (const [name, m] of Object.entries(raw)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(decode(m.pos, Float32Array), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(decode(m.nrm, Float32Array), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(decode(m.uv, Float32Array), 2));
    geometry.setIndex(new THREE.BufferAttribute(decode(m.idx, m.idx32 ? Uint32Array : Uint16Array), 1));
    geometry.computeBoundingBox();
    models[name] = { geometry, material: materials[m.tex], min: m.min, max: m.max };
  }

  return {
    models,
    // 모델 하나를 새 Mesh 로 만든다. 기하와 재질은 함께 쓴다.
    mesh(name) {
      const m = models[name];
      if (!m) throw new Error(`모델이 없습니다: ${name}`);
      const mesh = new THREE.Mesh(m.geometry, m.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}
