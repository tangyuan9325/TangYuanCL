import type {MascotSound} from '@shared/mascots'

/**
 * 合成一段「手掌拍击」音色：干的宽频脆响 + 短促皮肤质感的体声，不依赖任何音频采样文件。
 *
 * 分层（三路叠加，最后统一 attack 包络与限幅）：
 *   crack  — 去掉低频后的噪声，快衰减，给出「啪」的脆边；
 *   smack  — 高通残留（presence），中速衰减，给出接触面的皮肤感；
 *   body   — 150Hz 带降调正弦，慢衰减，给出短促的低频体感。
 *
 * 随机源是固定种子的 xorshift32，保证每次运行输出逐样本一致（可复现、可测试）。
 * 输出长度固定为 sampleRate * SLAP_DURATION 秒，峰值归一化到 SLAP_PEAK。
 */
const SLAP_DURATION = 0.075 // 秒
const SLAP_PEAK = 0.92
const SLAP_SEED = 0x6b616d75 // ASCII: 'k','a','m','u' → "kamu"

export function slapSamples(sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.ceil(sampleRate * SLAP_DURATION))
  // xorshift32 状态；初值固定，保证确定性输出
  let seed = SLAP_SEED
  // 两个一阶低通的输出状态：low≈260Hz 体感底、presence≈5200Hz 裂响残留
  let low = 0
  let presence = 0
  // 一阶低通系数：alpha 越大越平滑；按截止频率从采样率推导
  const lowAlpha = Math.exp(-2 * Math.PI * 260 / sampleRate)
  const presenceAlpha = Math.exp(-2 * Math.PI * 5200 / sampleRate)
  for (let i = 0; i < samples.length; i++) {
    // xorshift32：三步移位得到伪随机整数
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    const t = i / sampleRate
    // 无符号右移归一化到 [-1, 1)
    const noise = (seed >>> 0) / 0x80000000 - 1
    low = low * lowAlpha + noise * (1 - lowAlpha)
    presence = presence * presenceAlpha + (noise - low) * (1 - presenceAlpha)
    // attack：0.7ms 线性淡入，避免开头爆音
    const attack = Math.min(1, t / 0.0007)
    const crack = (noise - low) * 0.62 * Math.exp(-t * 180)
    const smack = presence * 0.45 * Math.exp(-t * 67)
    // 带降调正弦：瞬时频率从 150Hz 扫到 0（t 系数 -400），给出短促低频体感
    const body = Math.sin(2 * Math.PI * (150 * t - 400 * t * t)) * 0.07 * Math.exp(-t * 105)
    samples[i] = attack * (crack + smack + body)
  }
  // 峰值归一化：仅在超过阈值时整体缩放，保留原始动态
  const peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0)
  if (peak > SLAP_PEAK) {
    for (let i = 0; i < samples.length; i++) samples[i] *= SLAP_PEAK / peak
  }
  return samples
}
export type MascotAudioPreparation={phase:'pending'|'ended'|'cancelled'|'timeout'|'failed';startedAt:number;at:number;audioTime:number;zeroGain:number}
export class MascotAudio {
 private context?:AudioContext;private buffer?:AudioBuffer;private gain?:GainNode
 private primer?:ConstantSourceNode;private primed=false
 private bufferPrepared=false;private preparing?:Promise<void>;private finishPreparation?:((phase:MascotAudioPreparation['phase'])=>void)
 private voices=new Set<AudioBufferSourceNode>();private next=0;private played=0;private closed=false;private paused=false
 private suspending?:Promise<void>
 constructor(private prefs:()=>MascotSound,private stats:(played:number,voices:number)=>void,private active:()=>boolean=()=>true,private preparationStats:(event:MascotAudioPreparation)=>void=()=>{}){}
 private allowed(){return!this.closed&&!this.paused&&this.active()}
 private stateChanged=()=>{if(this.context?.state==='running'&&!this.allowed())this.suspend(this.context)}
 private stopPrimer(){
  const source=this.primer;if(!source)return;this.primer=undefined;source.onended=null
  try{source.stop()}catch{}source.disconnect()
 }
 private primeOutput(context:AudioContext){
  if(this.primed||!this.gain||!this.allowed()||context.state!=='running')return
  // The first real LOGO activation opens the native output graph once. This
  // source is exactly digital silence, never a slap or an extra queued contact.
  const source=context.createConstantSource(),when=context.currentTime
  source.offset.value=0;source.connect(this.gain);this.primer=source
  source.onended=()=>{source.disconnect();if(this.primer===source)this.primer=undefined}
  try{source.start(when);source.stop(when+.05);this.primed=true}catch(error){this.stopPrimer();throw error}
 }
 private prepareBuffer(context:AudioContext):Promise<void>{
  if(this.preparing)return this.preparing
  if(this.bufferPrepared||!this.buffer||!this.allowed()||context.state!=='running')return Promise.resolve()
  const source=context.createBufferSource(),zeroGain=context.createGain(),startedAt=performance.now()
  // Exercise the same real sample and first-contact resampling path, but through
  // an independent, permanently zero output. It is never a contact or a voice.
  source.buffer=this.buffer;source.playbackRate.value=.95;zeroGain.gain.value=0
  Object.defineProperty(source,'kamuclInitialization',{value:Object.freeze({role:'silent-slap-buffer',zeroGain})})
  source.connect(zeroGain);zeroGain.connect(context.destination)
  const operation=new Promise<void>(resolve=>{
   let done=false,timer:ReturnType<typeof setTimeout>|undefined
   const finish=(phase:MascotAudioPreparation['phase'])=>{
    if(done)return;done=true;clearTimeout(timer);source.onended=null
    if(phase!=='ended')try{source.stop()}catch{}
    source.disconnect();zeroGain.disconnect();this.finishPreparation=undefined
    this.preparationStats({phase,startedAt,at:performance.now(),audioTime:context.currentTime,zeroGain:zeroGain.gain.value});resolve()
   }
   this.finishPreparation=finish;source.onended=()=>finish('ended')
   this.preparationStats({phase:'pending',startedAt,at:startedAt,audioTime:context.currentTime,zeroGain:zeroGain.gain.value})
   // Natural audio completion is the only success condition; this is a device
   // failure bound, not a fixed wait pretending initialization succeeded.
   timer=setTimeout(()=>finish('timeout'),1500)
   try{source.start(context.currentTime);this.bufferPrepared=true}catch{finish('failed')}
  }).finally(()=>{if(this.preparing===operation)this.preparing=undefined})
  this.preparing=operation;return operation
 }
 private suspend(context:AudioContext){
  if(context.state==='closed'||this.suspending)return
  // A pending resume can finish after suspend. Guard both the resulting state
  // event and the completed operation, without spinning on an unavailable device.
  const pending=context.suspend().then(()=>{
   if(this.suspending===pending)this.suspending=undefined
   if(context===this.context&&!this.allowed()&&context.state==='running')this.suspend(context)
  },()=>{if(this.suspending===pending)this.suspending=undefined})
  this.suspending=pending
 }
 async unlock(){
  if(this.closed||!this.active()){if(this.context)this.suspend(this.context);return}
  this.paused=false
  try{
   if(!this.context){
    const context=this.context=new AudioContext({latencyHint:'interactive'})
    context.addEventListener('statechange',this.stateChanged)
    this.buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.075),context.sampleRate)
    this.buffer.copyToChannel(new Float32Array(slapSamples(context.sampleRate)),0)
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=10;limiter.ratio.value=8;limiter.attack.value=.001;limiter.release.value=.04
    this.gain=context.createGain();this.gain.connect(limiter);limiter.connect(context.destination)
   }
   const context=this.context
   // A quick foreground transition can overtake an earlier suspend request.
   // Finish that request before deciding whether the current context needs resume.
   if(this.suspending)await this.suspending
   if(!this.allowed()){this.suspend(context);return}
   if(context.state==='suspended')await context.resume()
   if(!this.allowed())this.suspend(context)
   else{this.primeOutput(context);await this.prepareBuffer(context);if(!this.allowed())this.suspend(context)}
  }catch{/* Audio device availability must not block interaction or persistence. */}
 }
 /** Returns the visual-clock delay to the very same scheduled contact sound. */
 play(approachMs=0):number {
  const prefs=this.prefs(),context=this.context
  const lead=Math.max(0,Math.min(150,approachMs))/1000
  if(!this.allowed()||this.preparing||prefs.muted||!prefs.volume||!context||context.state!=='running'||!this.buffer||!this.gain)return lead*1000
  this.gain.gain.setTargetAtTime(prefs.volume*.75,context.currentTime,.004)
  const source=context.createBufferSource();source.buffer=this.buffer;source.playbackRate.value=1+(this.played%5-2)*.025;source.connect(this.gain)
  if(this.voices.size>=24){const oldest=this.voices.values().next().value;try{oldest?.stop()}catch{}}
  this.voices.add(source)
  source.onended=()=>{source.disconnect();this.voices.delete(source);this.stats(this.played,this.voices.size)}
  // One sparse pointer event can cross all seven hips. Spread the pops into a
  // short roll instead of combining seven identical samples into one loud pop.
  const earliest=context.currentTime+lead,start=Math.max(earliest,Math.min(this.next,earliest+.12))
  this.next=start+.015;source.start(start);this.played++;this.stats(this.played,this.voices.size)
  return (start-context.currentTime)*1000
 }
 update(){if(this.gain&&this.context)this.gain.gain.setTargetAtTime(this.prefs().muted?0:this.prefs().volume*.75,this.context.currentTime,.004)}
 pause(){this.paused=true;this.next=0;this.stopPrimer();this.finishPreparation?.('cancelled');for(const source of this.voices){try{source.stop()}catch{}}if(this.context)this.suspend(this.context)}
 async dispose(){this.closed=true;this.pause();const context=this.context;await context?.close().catch(()=>{});context?.removeEventListener('statechange',this.stateChanged);this.context=undefined;this.buffer=undefined;this.gain=undefined}
}
