import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelter, readShelter, validate, apply, inverseOf, changedFriendPieces, validCell, MARKS } from '../src/shelter-state.js';
const A = 'ownerAa123456789', B = 'guestBb987654321', C = 'friendCc12345678', D = 'friendDd12345678', E = 'friendEe12345678';
const place = (mark, slot, cell, kind = 'stool', rot = 0) => ({ type:'place', mark, slot, piece:{ kind, cell, rot } });
const joined = () => apply(createShelter(A), B, { type:'join', mark:'wind' });
const same = (a,b) => { assert.deepEqual(a.members,b.members); assert.deepEqual(a.items,b.items); assert.deepEqual(a.cells,b.cells); };

test('개설·참여: 같은 UID는 한 표식, 최대 네 자리', () => {
  let s = joined();
  assert.equal(validate(s, B, { type:'join', mark:'star' }).ok, false);
  assert.equal(validate(s, C, { type:'join', mark:'wind' }).ok, false);
  s = apply(s, C, { type:'join', mark:'star' });
  s = apply(s, D, { type:'join', mark:'moon' });
  assert.ok(MARKS.every(mark => !validate(s,E,{type:'join',mark}).ok));
  assert.deepEqual(readShelter(s), s);
});
test('입구와 겹친 칸, 일곱 번째 슬롯, 남의 표식, 잘못된 종류/회전 거부', () => {
  let s = joined();
  assert.equal(validCell('3_0'), false);
  assert.equal(validCell('4_1'), false);
  assert.equal(validCell('8_0'), false);
  for (const cmd of [place('tree','0','3_0'), place('tree','0','8_0'), place('tree','6','0_0'),
    place('wind','0','0_0'), place('tree','0','0_0','table'), place('tree','0','0_0','stool',4)])
    assert.equal(validate(s,A,cmd).ok,false);
  for (let i=0;i<6;i++) s=apply(s,A,place('tree',String(i),i+'_2'));
  assert.equal(validate(s,A,place('tree','0','0_3')).ok,false);
  assert.equal(validate(s,B,place('wind','0','0_2')).ok,false);
  assert.equal(Object.keys(s.items.tree).length,6);
  assert.deepEqual(readShelter(s),s);
});
test('배치·이동·회전·치우기·참여·빈 자리 나가기의 반대 명령', () => {
  let s=createShelter(A);
  const execute=(uid,cmd)=>{
    const prior=structuredClone(s); const back=inverseOf(s,uid,cmd);
    const next=apply(s,uid,cmd); same(s,prior);
    same(apply(next,uid,back),prior); s=next;
  };
  execute(B,{type:'join',mark:'wind'});
  execute(A,place('tree','0','0_0'));
  execute(A,{type:'move',mark:'tree',slot:'0',expect:s.items.tree['0'],piece:{kind:'stool',cell:'1_0',rot:1}});
  execute(A,{type:'rotate',mark:'tree',slot:'0',expect:s.items.tree['0'],piece:{kind:'stool',cell:'1_0',rot:2}});
  execute(A,{type:'remove',mark:'tree',slot:'0',expect:s.items.tree['0']});
  execute(B,{type:'leave',mark:'wind'});
  assert.deepEqual(readShelter(s),s);
});
test('낡은 이동·반대 명령과 다른 회원의 가구 변경 거부', () => {
  const s=apply(joined(),A,place('tree','0','0_0'));
  const cmd={type:'move',mark:'tree',slot:'0',expect:s.items.tree['0'],piece:{kind:'stool',cell:'1_0',rot:0}};
  const back=inverseOf(s,A,cmd);
  const moved=apply(s,A,cmd);
  assert.equal(validate(moved,A,cmd).ok,false);
  assert.equal(validate(moved,B,back).ok,false);
  const blocked=apply(moved,B,place('wind','0','0_0'));
  assert.equal(validate(blocked,A,back).ok,false);
  assert.equal(validate(blocked,B,{type:'leave',mark:'wind'}).ok,false);
  assert.equal(validate(blocked,A,{type:'leave',mark:'tree'}).ok,false);
});
test('서버 상태 판독: 고아 점유·누락·중복 회원·알 수 없는 버전을 덮지 않는다', () => {
  const s=apply(joined(),A,place('tree','0','0_0'));
  for (const corrupt of [
    {...s,version:2}, {...s,cells:{}}, {...s,cells:{...s.cells,'1_0':{mark:'tree',slot:'0'}}},
    {...s,members:{tree:A,wind:A}}, {...s,items:{...s.items,star:{}}},
  ]) assert.throws(()=>readShelter(corrupt), /쉼터 정보/);
});
test('친구의 새 배치·옮긴 것만 비교하고 최초 방문과 내 가구는 제외', () => {
  const s=joined();
  const next=apply(apply(s,A,place('tree','0','0_0')),B,place('wind','0','1_0'));
  assert.deepEqual(changedFriendPieces(null,next,A),[]);
  assert.deepEqual(changedFriendPieces(s,next,A),[{mark:'wind',slot:'0'}]);
  assert.deepEqual(changedFriendPieces(next,next,A),[]);
  const moved=apply(next,B,{type:'move',mark:'wind',slot:'0',expect:next.items.wind['0'],piece:{kind:'stool',cell:'2_0',rot:0}});
  assert.deepEqual(changedFriendPieces(next,moved,A),[{mark:'wind',slot:'0'}]);
});
