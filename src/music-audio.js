// 실제 녹음의 박자를 오디오 시계로 재생한다. 최초 터치 전에는 AudioContext를 만들지 않는다.
import { NOTES,validNote,validNotes } from './music-state.js';
export function createKalimbaAudio(){
  let ctx=null,master=null,muted=false,epoch=0,frame=0,playing=false,played=0;
  const voices=new Set();
  async function unlock(){
    try{
      if(!ctx){
        const Context=window.AudioContext||window.webkitAudioContext;
        if(!Context)return false;
        ctx=new Context();
        master=ctx.createGain();master.gain.value=muted?0:0.55;
        const comp=ctx.createDynamicsCompressor();
        comp.threshold.value=-15;comp.ratio.value=3;master.connect(comp).connect(ctx.destination);
      }
      if(ctx.state!=='running')await ctx.resume();
      return ctx.state==='running';
    }catch{return false;}
  }
  function pluck(note,start){
    if(!ctx||!validNote(note))return;
    const hz=440*Math.pow(2,(NOTES[note].midi-69)/12);
    // 금속 떨림의 맑은 기본음과 짧게 감쇠하는 비정수배 배음. 긴 신스 패드처럼 끌지 않는다.
    const length=1.05-(note/7)*0.27;
    const gain=ctx.createGain();gain.gain.value=0;gain.connect(master);
    const parts=[[1,0.24,length],[2.01,0.09,length*0.45],[3.04,0.036,length*0.24],[4.17,0.013,0.11]];
    const sources=[];
    for(const [ratio,volume,decay] of parts){
      const osc=ctx.createOscillator(),env=ctx.createGain();
      osc.type='sine';osc.frequency.value=hz*ratio;
      env.gain.setValueAtTime(0.0001,start);
      env.gain.exponentialRampToValueAtTime(volume,start+0.005);
      env.gain.exponentialRampToValueAtTime(0.0001,start+decay);
      osc.connect(env).connect(gain);osc.start(start);osc.stop(start+decay+0.03);sources.push(osc);
    }
    gain.gain.setValueAtTime(1,start);
    const voice={gain,sources};voices.add(voice);played++;
    sources[0].onended=()=>{voices.delete(voice);gain.disconnect();};
  }
  function stop(){
    epoch++;playing=false;cancelAnimationFrame(frame);
    if(ctx){
      for(const v of voices){
        try{v.gain.gain.cancelScheduledValues(ctx.currentTime);v.gain.gain.setValueAtTime(0,ctx.currentTime);}catch{}
        for(const osc of v.sources)try{osc.stop(ctx.currentTime);}catch{}
      }
    }
    voices.clear();
  }
  return {
    get state(){return ctx?.state||'idle';},get playing(){return playing;},get played(){return played;},
    get muted(){return muted;},
    setMuted(value){muted=!!value;if(ctx)master.gain.setTargetAtTime(muted?0:0.55,ctx.currentTime,0.015);},
    async note(note){
      const ticket=epoch;if(!validNote(note)||!(await unlock())||ticket!==epoch)return false;
      pluck(note,ctx.currentTime+0.006);return true;
    },
    async play(notes,{onNote=()=>{},onEnd=()=>{}}={}){
      if(!validNotes(notes))return false;
      stop();const ticket=epoch;
      if(!(await unlock())||ticket!==epoch)return false;
      const start=ctx.currentTime+0.055;let scheduled=0,shown=0;
      playing=true;
      function tick(){
        if(ticket!==epoch)return;
        const elapsed=(ctx.currentTime-start)*1000;
        // 미리 120ms만 예약. 화면의 음표는 실제 오디오 시계에 맞춘다.
        while(scheduled<notes.length&&notes[scheduled][0]<=elapsed+120){
          const [at,note]=notes[scheduled++];pluck(note,Math.max(ctx.currentTime+0.003,start+at/1000));
        }
        while(shown<notes.length&&notes[shown][0]<=elapsed)onNote(notes[shown++][1]);
        if(elapsed>=notes[notes.length-1][0]+1100){playing=false;onEnd();return;}
        frame=requestAnimationFrame(tick);
      }
      tick();return true;
    },
    stop,
  };
}
