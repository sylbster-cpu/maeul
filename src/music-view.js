// 기존 마을 캐릭터가 작은 악기를 쥐고 연주한다. 게임의 저장 상태와는 분리한다.
import * as THREE from './three.js';
import { buildFigure } from './character.js';
export function createMusicView(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xdce8c9);
  scene.add(new THREE.HemisphereLight(0xfff5dc,0x91b284,2));
  const sun=new THREE.DirectionalLight(0xffefd5,2.2);sun.position.set(-3,6,5);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:0.1,far:20});sun.shadow.mapSize.set(512,512);sun.shadow.normalBias=0.025;
  scene.add(sun);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,0.1,40);
  camera.position.set(2.7,2.6,6);camera.lookAt(0,0.9,0);camera.updateMatrixWorld();
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...extra});
  const grass=mat(0xb1cd91),wood=mat(0xb7834e),edge=mat(0x845b37),metal=mat(0xe6d6ac,{metalness:.55,roughness:.35});
  const skin=mat(0xf4cfa4),leaf=mat(0x64995e),stone=mat(0xc6c6a6);
  function mesh(parent,geometry,material,x,y,z){
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  mesh(scene,new THREE.CylinderGeometry(3.25,3.4,.16,48),grass,0,-.08,0);
  for(const [x,z,s] of [[-1.65,-1.5,1],[1.8,-1.45,.85],[-2.4,-.45,.65]]){
    mesh(scene,new THREE.CylinderGeometry(.09,.14,1.05,8),edge,x,.52*s,z).scale.setScalar(s);
    mesh(scene,new THREE.IcosahedronGeometry(.65,1),leaf,x,1.15*s,z).scale.setScalar(s);
  }
  for(const [x,z] of [[1.4,.6],[-1.45,.65],[.9,-1.55]])mesh(scene,new THREE.DodecahedronGeometry(.18,0),stone,x,.08,z).scale.y=.6;
  const figure=buildFigure();scene.add(figure);figure.rotation.y=.24;
  const instrument=new THREE.Group();instrument.position.set(0,.94,.46);instrument.rotation.x=-.18;figure.add(instrument);
  mesh(instrument,new THREE.BoxGeometry(.59,.5,.13),edge,0,0,0);
  mesh(instrument,new THREE.BoxGeometry(.55,.46,.15),wood,0,0,.035);
  mesh(instrument,new THREE.CylinderGeometry(.08,.08,.015,24),edge,0,-.12,.12).rotation.x=Math.PI/2;
  mesh(instrument,new THREE.BoxGeometry(.48,.035,.025),metal,0,.13,.13);
  const tines=[];
  for(let i=0;i<8;i++){
    const len=.23+(7-i)*.018;
    tines.push(mesh(instrument,new THREE.BoxGeometry(.034,len,.024),metal,(i-3.5)*.058,.14-len/2,.14));
  }
  const hands=[];
  for(const side of [-1,1]){
    const arm=mesh(figure,new THREE.CapsuleGeometry(.10,.29,3,8),figure.userData.body.material,side*.34,.79,.28);
    arm.rotation.set(-.85,0,side*.5);
    const hand=mesh(instrument,new THREE.SphereGeometry(.105,12,8),skin,side*.28,-.06,.16);hands.push(hand);
  }
  const glints=[],glintGeo=new THREE.OctahedronGeometry(.038);
  for(let i=0;i<12;i++){
    const m=mesh(scene,glintGeo,new THREE.MeshBasicMaterial({color:i%2?0xf6d49a:0x75a87a,transparent:true,opacity:0}),0,0,0);
    m.visible=false;glints.push({m,age:2});
  }
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let note=-1,age=9,frame=0,last=performance.now();
  function resize(){
    const r=canvas.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height),a=w/h;
    renderer.setSize(w,h,false);const hh=Math.max(1.44,1.85/a);
    Object.assign(camera,{left:-hh*a,right:hh*a,top:hh,bottom:-hh});camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function pulse(n){
    note=n;age=0;
    if(!reduced){const p=glints.find(g=>g.age>=1)||glints[0];p.age=0;p.x=(n-3.5)*.1;p.m.position.set(p.x,1.7,.35);p.m.visible=true;p.m.material.opacity=.85;}
  }
  function draw(now){
    const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;age+=dt;
    const k=Math.max(0,1-age/.19);
    figure.rotation.z=reduced?0:(note<4?1:-1)*k*.025;
    instrument.rotation.x=-.18+(reduced?0:k*.04);
    for(let i=0;i<8;i++)tines[i].position.z=.14+(i===note&&!reduced?Math.sin(age*65)*k*.026:0);
    hands[0].position.z=.16+(note>=0&&note<4&&!reduced?k*.095:0);
    hands[1].position.z=.16+(note>=4&&!reduced?k*.095:0);
    for(const p of glints){
      if(p.age>=1){p.m.visible=false;continue;}
      p.age+=dt;p.m.position.y=1.7+p.age*.55;p.m.position.x=p.x+Math.sin(p.age*2)*.08;
      p.m.material.opacity=.85*Math.max(0,1-p.age);p.m.rotation.y+=dt;
    }
    renderer.render(scene,camera);frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return {pulse,dispose(){cancelAnimationFrame(frame);observer.disconnect();renderer.dispose();}};
}
