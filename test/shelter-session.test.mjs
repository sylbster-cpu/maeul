import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelter, apply } from '../src/shelter-state.js';
import { createShelterSession } from '../src/shelter-session.js';
const A='ownerAa123456789',B='guestBb987654321',ID='AbCdEf0123456789GhIj';
const initial=()=>apply(createShelter(A),B,{type:'join',mark:'wind'});
const put=(mark,slot,cell)=>({type:'place',mark,slot,piece:{kind:'stool',cell,rot:0}});
function setup(){
  let recv,connection,resolve,reject,stopped=0,latest=initial();
  const changes=[];
  const service={uid:A,watch(_id,cb,cs){recv=cb;connection=cs;return()=>{stopped++;};},
    command(){return new Promise((r,j)=>{resolve=r;reject=j;});},async get(){return latest;}};
  const session=createShelterSession({service,id:ID,initial:latest,onState:(s,origin)=>changes.push([s.revision,origin])});
  session.start();
  return {session,changes,receive(s){latest=s;recv(s);},status(ok){connection(ok);},resolve(s){latest=s;resolve(s);},reject(e){reject(e);},get stopped(){return stopped;}};
}
test('저장 중 화면은 그대로이고 구독으로 온 더 새 판은 성공 뒤에 적용',async()=>{
  const t=setup(),s=t.session.state,own=apply(s,A,put('tree','0','0_0')),remote=apply(own,B,put('wind','0','1_0'));
  const pending=t.session.command(put('tree','0','0_0'));
  assert.equal(t.session.state.revision,s.revision);
  await assert.rejects(t.session.command(put('tree','1','2_0')),/저장을 확인/);
  t.receive(remote);assert.equal(t.session.state.revision,s.revision);
  t.resolve(own);await pending;
  assert.deepEqual(t.changes,[[2,'own'],[3,'remote']]);
  assert.equal(t.session.state.revision,3);
  t.receive(own);assert.equal(t.session.state.revision,3);
});
test('충돌 거절 뒤 최신 서버 판만 반영, 실패한 내 가구는 없음',async()=>{
  const t=setup(),s=t.session.state,remote=apply(s,B,put('wind','0','0_0'));
  const pending=t.session.command(put('tree','0','0_0'));
  t.receive(remote);t.reject(new Error('같은 칸'));
  await assert.rejects(pending,/같은 칸/);
  assert.deepEqual(t.session.state.items.tree,{});
  assert.equal(t.session.state.cells['0_0'].mark,'wind');
});
test('연결이 끊기면 쓰기 차단, 뒤에 받은 판은 활성화 후 표시',async()=>{
  const t=setup(),s=t.session.state;
  t.status(false);await assert.rejects(t.session.command(put('tree','0','0_0')),/연결/);
  t.session.setActive(false);t.receive(apply(s,B,put('wind','0','0_0')));
  assert.equal(t.session.state.revision,s.revision);
  t.session.setActive(true);assert.equal(t.session.state.revision,s.revision+1);
  t.session.close();assert.equal(t.stopped,1);
});
