import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelter, apply } from '../src/shelter-state.js';
import { shelterProjection, freeShelterCell } from '../src/shelter-projection.js';
const a='ownerAa123456789',b='guestBb987654321';
const put=(mark,slot,cell,kind,rot)=>({type:'place',mark,slot,piece:{kind,cell,rot}});
test('별도 쉼터의 칸 점유만 캐릭터 충돌 자료로 변환',()=>{
  let s=apply(createShelter(a),b,{type:'join',mark:'wind'});
  s=apply(s,a,put('tree','0','1_2','stool',1));
  s=apply(s,b,put('wind','0','2_3','plant',2));
  const p=shelterProjection(s);
  assert.deepEqual(p.state.spaces.main.objects['tree-0'],{id:'tree-0',part:'stool',x:1,y:2,rot:1});
  assert.equal(p.derived.occ.main.furniture.get('2,3'),'wind-0');
  assert.equal(p.state.house.level,2);
  p.state.spaces.main.objects['tree-0'].rot=0;
  assert.equal(s.items.tree['0'].rot,1);
});
test('친구가 내가 있는 칸에 배치하면 빈 칸으로 피함',()=>{
  const s=apply(createShelter(a),a,put('tree','0','1_2','lamp',0));
  assert.equal(freeShelterCell(s,3.5,0.5),null);
  const [x,z]=freeShelterCell(s,1.5,2.5);
  assert.equal(s.cells[Math.floor(x)+'_'+Math.floor(z)],undefined);
  assert.equal(Math.hypot(x-1.5,z-2.5),1);
});
