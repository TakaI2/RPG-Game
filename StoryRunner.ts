// systems/StoryRunner.ts
import { AudioBus } from './AudioBus'
type Op = any;

export class StoryRunner {
  private scene: Phaser.Scene
  private audio: AudioBus
  private vars: Record<string, any> = {}
  private pc = 0
  private script: Op[] = []
  private onSay!: (payload: any) => Promise<void>
  private onEnd!: (ret: string) => void

  constructor(scene: Phaser.Scene, audio: AudioBus){
    this.scene = scene; this.audio = audio
  }
  load(json: any){
    this.vars = { ...(json.vars ?? {}) }
    this.script = json.script ?? []
    this.pc = 0
  }
  hooks(h: { onSay: (p:any)=>Promise<void>, onEnd: (rtn:string)=>void }) {
    this.onSay = h.onSay; this.onEnd = h.onEnd
  }

  async step(){ // Spaceで呼ぶ
    while (this.pc < this.script.length){
      const op = this.script[this.pc++]
      switch(op.op){
        case 'bg': this.scene.cameras.main.fadeIn(op.fade ?? 0); /* set bg image */ break
        case 'say': await this.onSay(op); return              // 台詞で一旦停止（次のSpaceまで）
        case 'choice': { const goto = await this.choice(op); this.jump(goto); return }
        case 'label': break
        case 'goto': this.jump(op.name); break
        case 'set': this.vars[op.name] = op.value; break
        case 'if': this.evalIf(op); break
        case 'bgm.play': this.audio.playBgm(op.name, op); break
        case 'bgm.stop': this.audio.stopBgm(op); break
        case 'bgm.cross': this.audio.cross(op.from, op.to, op.time, op.loop ?? true); break
        case 'se': this.audio.se(op.name); break
        case 'end': this.onEnd(op.returnTo ?? 'game'); return
        default: break
      }
    }
  }

  private jump(label: string){
    const idx = this.script.findIndex(x => x.op === 'label' && x.name === label)
    if (idx >= 0) this.pc = idx + 1
  }
  private evalIf(op:any){
    // 簡易評価（eval不使用）
    const ok = this.evalCond(op.cond)
    const block = ok ? (op.then ?? []) : (op.else ?? [])
    this.script.splice(this.pc, 0, ...block) // インライン展開
  }
  private evalCond(expr: string): boolean {
    // 例: "metNpc == true && hasKey != false"
    const v = (n:string)=> (this.vars[n] ?? false)
    // 簡易パーサでも良いし、比較だけの小実装でもOK。ここは割愛（実装時は安全に）
    return !!(expr.replace(/\s+/g,'')
      .replace(/([a-zA-Z_]\w*)/g, (_,k)=> JSON.stringify(v(k)))
      .replace(/==/g,'===').replace(/!=/g,'!=='));
  }
  private async choice(op:any): Promise<string>{
    // あなたの DialogUI / ChoiceUI に合わせて実装
    // 戻りは遷移先ラベル名
    return new Promise(resolve=>{
      // UI生成 → 決定時 resolve(item.goto)
    })
  }
}
