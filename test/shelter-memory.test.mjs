import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelter, apply } from '../src/shelter-state.js';
import { shelterRoomId, shelterLink, createShelterMemory } from '../src/shelter-memory.js';
const ID='AbCdEf0123456789GhIj',A='ownerAa123456789',B='guestBb987654321';
function storage(){
  const map=new Map([['house-lab-web:save','house']]);
  return {map,getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
test('초대 주소는 지정 형식만 허용하고 정식 주소를 복사',()=>{
  assert.equal(shelterRoomId(''),null);
  assert.equal(shelterRoomId('#room='+ID),ID);
  assert.equal(shelterLink(ID),'https://sylbster-cpu.github.io/maeul/shelter.html#room='+ID);
  for(const x of ['#room=bad','#visit='+ID,'#room='+ID+'?x=1'])assert.throws(()=>shelterRoomId(x));
});
test('같은 UID의 생성 주소를 기억하고 생성 완료 후에만 비움',()=>{
  const s=storage(),m=createShelterMemory(s,A);
  assert.ok(m.reserve(ID));assert.equal(m.pending(),ID);
  assert.equal(createShelterMemory(s,B).pending(),null);
  assert.ok(m.complete(ID));assert.equal(m.pending(),null);assert.equal(m.recent(),ID);
  assert.equal(s.map.get('house-lab-web:save'),'house');
});
test('재방문 기억은 UID와 방으로 분리하고 오래된 판으로 덮지 않음',()=>{
  const s=storage(),m=createShelterMemory(s,A),old=createShelter(A),next=apply(old,B,{type:'join',mark:'wind'});
  assert.equal(m.seen(ID),null);assert.ok(m.remember(ID,next));
  assert.equal(m.remember(ID,old),false);assert.equal(m.seen(ID).revision,1);
  assert.equal(createShelterMemory(s,B).seen(ID),null);
  assert.equal(m.seen('ZyXwVu9876543210TsRq'),null);
});
test('저장소가 막혀도 개인 상태를 건드리거나 성공으로 표시하지 않음',()=>{
  const m=createShelterMemory(null,A);
  assert.equal(m.reserve(ID),false);assert.equal(m.complete(ID),false);assert.equal(m.seen(ID),null);
});
