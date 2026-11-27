// 독립 쉼터 장면. 집을 읽거나 쓰지 않고 기존 캐릭터와 가구 모델을 재사용한다.
import * as THREE from './three.js';
import { PARTS } from './parts.js';
import { createCharacter } from './character.js';
import { ENTRANCE } from './shelter-state.js';
import { shelterProjection, freeShelterCell } from './shelter-projection.js';

export function createShelterView({ canvas, assets, initial }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9e8bd);
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,90);
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sky = new THREE.HemisphereLight(0xfff8e9,0x9bbd88,1.45);
  const sun = new THREE.DirectionalLight(0xffefd7,2.2);
  sun.position.set(-5,18,-9); sun.target.position.set(4,0,4); sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-11,right:11,top:11,bottom:-11,near:1,far:45});
  sun.shadow.mapSize.set(1024,1024); sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.035;
  scene.add(sky,sun,sun.target);
  const cube=new THREE.BoxGeometry(1,1,1);
  const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:0.9});
  const grass=mat(0x9fbd80), earth=mat(0x917e57), path=mat(0xdcc79e);
  const tiles=[0xa9cb86,0xaccd88,0xb0d08b,0xa5c781].map(mat);
  function box(parent,material,sx,sy,sz,x,y,z) {
    const node=new THREE.Mesh(cube,material);
    node.scale.set(sx,sy,sz); node.position.set(x,y,z);
    node.receiveShadow=true; node.castShadow=true; parent.add(node); return node;
  }
  box(scene,grass,40,0.22,40,4,-0.44,4);
  box(scene,earth,8.26,0.27,8.26,4,-0.17,4);
  for(let z=0;z<8;z++) for(let x=0;x<8;x++) {
    const key=x+'_'+z;
    box(scene,ENTRANCE.includes(key)?path:tiles[(x*7+z*3)%tiles.length],1,0.06,1,x+0.5,-0.03,z+0.5);
  }
  box(scene,path,2,0.07,1.55,4,-0.07,-0.78);
  const trunk=mat(0x96714b), leaves=[0x548c59,0x6da261,0x86b86c].map(mat);
  const trunkGeo=new THREE.CylinderGeometry(0.18,0.28,1.65,7), leafGeo=new THREE.IcosahedronGeometry(1,1);
  function tree(x,z,scale) {
    const group=new THREE.Group();
    const stem=new THREE.Mesh(trunkGeo,trunk); stem.position.y=0.8;
    group.add(stem);
    for (let i=0;i<3;i++) {
      const crown=new THREE.Mesh(leafGeo,leaves[i]); crown.position.set((i-1)*0.35,1.8+i*0.48,(i%2-0.5)*0.22);
      crown.scale.set(0.92-i*0.16,0.88-i*0.09,0.86-i*0.14); group.add(crown);
    }
    group.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
    group.position.set(x,0,z); group.scale.setScalar(scale);scene.add(group);
  }
  // 숲 풍경은 배치 칸 밖에만 놓는다. 입구와 화면 앞쪽을 가리지 않는다.
  for(const [x,z,s] of [[-1.05,6.8,1.05],[-0.5,9.15,1.25],[2.1,9.5,0.8],[6.5,9.5,1],[9.1,8.5,1.1]])tree(x,z,s);
  const rock=mat(0xb6b5a0), stoneGeo=new THREE.DodecahedronGeometry(0.26,0);
  for(const [x,z,s] of [[-0.6,3.1,1],[8.65,2.5,0.8],[8.8,3.2,1.2],[0.4,-0.45,0.7],[7.5,-0.55,0.75]]) {
    const n=new THREE.Mesh(stoneGeo,rock);n.position.set(x,0.09,z);n.scale.set(s,s*0.65,s);n.castShadow=true;scene.add(n);
  }
  const gridPoints=[];
  for(let i=0;i<=8;i++)gridPoints.push(i,0.012,0,i,0.012,8,0,0.012,i,8,0.012,i);
  const gridGeo=new THREE.BufferGeometry();gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(gridPoints,3));
  const grid=new THREE.LineSegments(gridGeo,new THREE.LineBasicMaterial({color:0x52734f,transparent:true,opacity:0.35}));grid.visible=false;scene.add(grid);
  const objects=new THREE.Group();scene.add(objects);
  const rings=new THREE.Group();scene.add(rings);
  const ringGeo=new THREE.RingGeometry(0.36,0.43,32);
  const highlightMat=new THREE.MeshBasicMaterial({color:0xffedb2,transparent:true,opacity:0.52,depthWrite:false,side:THREE.DoubleSide});
  const selectedMat=new THREE.MeshBasicMaterial({color:0xfff8da,transparent:true,opacity:0.9,depthWrite:false,side:THREE.DoubleSide});
  const selectedRing=new THREE.Mesh(ringGeo,selectedMat);selectedRing.rotation.x=-Math.PI/2;selectedRing.visible=false;scene.add(selectedRing);
  let projection=shelterProjection(initial),current=initial;
  const listeners=new Set();
  const collisionStore={get state(){return projection.state;},get derived(){return projection.derived;},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
  const character=createCharacter({view:{scene},store:collisionStore,assets,start:{x:3.5,z:0.5},place:'main'});
  let highlighted=[],highlightUntil=0,selection=null;
  const nodes=new Map();
  function ringAt(piece,material){
    const [x,z]=piece.cell.split('_').map(Number);
    const n=new THREE.Mesh(ringGeo,material);n.rotation.x=-Math.PI/2;n.position.set(x+0.5,0.024,z+0.5);return n;
  }
  function refreshSelection(){
    const p=selection&&current.items[selection.mark]?.[selection.slot];
    selectedRing.visible=!!p;
    if(p){const [x,z]=p.cell.split('_').map(Number);selectedRing.position.set(x+0.5,0.027,z+0.5);}
  }
  function sync(state) {
    current=state;projection=shelterProjection(state);
    objects.clear();rings.clear();nodes.clear();
    for(const [mark,slots] of Object.entries(state.items))for(const [slot,p] of Object.entries(slots)){
      const [x,z]=p.cell.split('_').map(Number),part=PARTS[p.kind];
      const group=new THREE.Group(),model=assets.mesh(part.model);
      model.scale.setScalar(part.scale||1);model.position.set(...(part.offset||[0,0,0]));
      group.position.set(x+0.5,0,z+0.5);group.rotation.y=p.rot*Math.PI/2;group.userData={mark,slot};
      group.add(model);objects.add(group);nodes.set(mark+'-'+slot,group);
    }
    if(performance.now()<highlightUntil)for(const entry of highlighted){
      const piece=state.items[entry.mark]?.[entry.slot];if(piece)rings.add(ringAt(piece,highlightMat));
    }
    refreshSelection();
    scene.updateMatrixWorld(true);
    character.stop();
    for(const fn of listeners)fn();
    const safe=freeShelterCell(state,character.pos.x,character.pos.z);
    if(safe)character.teleport(...safe);
  }
  function setHighlights(entries) {
    highlighted=entries.slice();highlightUntil=performance.now()+5500;rings.clear();
    for(const entry of highlighted){
      const piece=current.items[entry.mark]?.[entry.slot];if(piece)rings.add(ringAt(piece,highlightMat));
    }
  }
  function resize() {
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(1,rect.width),h=Math.max(1,rect.height),aspect=w/h;
    renderer.setSize(w,h,false);
    const halfW=Math.max(6.35,5.5*aspect),halfH=halfW/aspect;
    Object.assign(camera,{left:-halfW,right:halfW,top:halfH,bottom:-halfH});
    camera.position.set(4+13,13,4-16);camera.lookAt(4,0.6,4);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  resize();sync(initial);
  function point(x,y,z){
    const v=new THREE.Vector3(x,y,z).project(camera),r=canvas.getBoundingClientRect();
    return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
  }
  function hit(clientX,clientY) {
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(pointer,camera);
    const found=ray.intersectObjects(objects.children,true)[0];
    if(found){let node=found.object;while(node.parent!==objects&&node.parent)node=node.parent;
      if(node.parent===objects)return {item:{...node.userData},cell:current.items[node.userData.mark]?.[node.userData.slot]?.cell};
    }
    const ground=ray.ray.intersectPlane(plane,new THREE.Vector3());
    if(!ground||ground.x<0||ground.x>=8||ground.z<0||ground.z>=8)return null;
    return {cell:Math.floor(ground.x)+'_'+Math.floor(ground.z)};
  }
  let frame=0,last=performance.now();
  function draw(now){
    const dt=Math.min(0.04,Math.max(0,(now-last)/1000));last=now;
    character.update(dt,null);
    if(rings.children.length){
      const remaining=highlightUntil-now;
      if(remaining<=0)rings.clear();
      else highlightMat.opacity=(calm?0.5:0.48+0.09*Math.sin(now/380))*Math.min(1,remaining/1300);
    }
    renderer.render(scene,camera);frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return { sync, hit, setHighlights, character,
    select(value){selection=value;refreshSelection();},
    buildMode(value){grid.visible=value;},
    projectCell(cell){const [x,z]=cell.split('_').map(Number);return point(x+0.5,0,z+0.5);},
    projectItem(mark,slot){const node=nodes.get(mark+'-'+slot);if(!node)return null;
      const p=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());return point(p.x,p.y,p.z);},
    get highlighted(){return rings.children.length;},
    dispose(){cancelAnimationFrame(frame);observer.disconnect();renderer.dispose();}
  };
}
