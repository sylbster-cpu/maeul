import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelter, apply, memberMark } from '../src/shelter-state.js';
import { createShelterService } from '../src/shelter-service.js';

const A='ownerAa123456789', B='guestBb987654321', C='thirdCc123456789';
const ID='AbCdEf0123456789GhIj';
const put=(mark,slot,cell)=>({type:'place',mark,slot,piece:{kind:'stool',cell,rot:0}});
const denied=()=>Object.assign(new Error('permission denied'),{code:'permission-denied'});

// 이전 판에 대한 첫 쓰기가 규칙에서 거절된 상황을 재현한다.
// 실제 Firestore 동시 쓰기는 별도 에뮬레이터 시험이 검사한다.
function mock(initial,{beforeWrite=()=>{},alwaysDeny=false}={}){
  let state=structuredClone(initial),calls=0,reads=0;
  const snap=(s)=>({exists:()=>true,data:()=>structuredClone(s)});
  const api={
    doc:(_db,_collection,id)=>id,serverTimestamp:()=>null,
    async getDocFromServer(){ reads++; return snap(state); },
    async runTransaction(_db,fn){
      calls++;
      const prior=structuredClone(state);
      let pending;
      const result=await fn({get:async()=>snap(prior),set:(_target,data)=>{pending=data;}});
      if(pending){
        const changed=beforeWrite(structuredClone(state),calls);
        if(changed) state=changed;
        if(alwaysDeny || state.revision!==prior.revision) throw denied();
        const {updatedAt,...next}=pending;
        state=next;
      }
      return result;
    }
  };
  return {service:uid=>createShelterService({uid,db:{},api}),get state(){return state;},get calls(){return calls;},get reads(){return reads;}};
}
const initial=()=>apply(createShelter(A),B,{type:'join',mark:'wind'});
test('판이 바뀐 권한 거절은 최신 상태로 검증하여 다른 칸에 성공',async()=>{
  const m=mock(initial(),{beforeWrite:(s,n)=>n===1?apply(s,A,put('tree','0','0_0')):null});
  const result=await m.service(B).command(ID,put('wind','0','1_0'));
  assert.equal(m.calls,2); assert.equal(m.reads,1);
  assert.deepEqual(result.cells,{'0_0':{mark:'tree',slot:'0'},'1_0':{mark:'wind',slot:'0'}});
});
test('같은 칸 충돌은 다시 쓰지 않고 규칙의 이유를 알려 준다',async()=>{
  const m=mock(initial(),{beforeWrite:(s,n)=>n===1?apply(s,A,put('tree','0','0_0')):null});
  await assert.rejects(m.service(B).command(ID,put('wind','0','0_0')),/이미 가구가 있는 칸/);
  assert.equal(m.calls,1); assert.equal(m.reads,1);
});
test('판 번호가 그대로인 실제 권한 오류는 재시도하지 않는다',async()=>{
  const m=mock(initial(),{alwaysDeny:true});
  await assert.rejects(m.service(B).command(ID,put('wind','0','1_0')),e=>e.code==='permission-denied');
  assert.equal(m.calls,1); assert.equal(m.reads,1);
});
test('다른 친구가 먼저 참여하면 빈 표식을 다시 고른다',async()=>{
  const m=mock(createShelter(A),{beforeWrite:(s,n)=>n===1?apply(s,B,{type:'join',mark:'wind'}):null});
  const result=await m.service(C).join(ID);
  assert.equal(memberMark(result,B),'wind'); assert.equal(memberMark(result,C),'star');
  assert.equal(m.calls,2); assert.equal(m.reads,1);
});
test('같은 UID의 다른 탭이 먼저 참여했다면 중복 쓰지 않는다',async()=>{
  const m=mock(createShelter(A),{beforeWrite:(s,n)=>n===1?apply(s,B,{type:'join',mark:'wind'}):null});
  const result=await m.service(B).join(ID);
  assert.equal(memberMark(result,B),'wind'); assert.equal(m.calls,1); assert.equal(m.reads,1);
});
test('연속 판 변경은 세 번에서 멈추고 재시도 안내',async()=>{
  const m=mock(initial(),{beforeWrite:(s,n)=>apply(s,A,put('tree',String(n-1),String(n-1)+'_2'))});
  await assert.rejects(m.service(B).command(ID,put('wind','0','7_7')),/잠시 뒤 다시/);
  assert.equal(m.calls,3); assert.equal(m.reads,3);
});
test('다른 탭이 기존 가구를 바꾼 경우 오래된 이동을 다시 적용하지 않는다',async()=>{
  const s=apply(initial(),B,put('wind','0','0_0'));
  const old=s.items.wind['0'];
  const m=mock(s,{beforeWrite:(state,n)=>n===1?apply(state,B,{type:'rotate',mark:'wind',slot:'0',expect:old,piece:{...old,rot:1}}):null});
  await assert.rejects(m.service(B).command(ID,{type:'move',mark:'wind',slot:'0',expect:old,piece:{...old,cell:'1_0'}}),/가구가 이미 바뀌었습니다/);
  assert.equal(m.calls,1); assert.equal(m.state.items.wind['0'].rot,1);
});
