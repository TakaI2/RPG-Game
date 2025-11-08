import Phaser from 'phaser'
import { AudioBus } from './AudioBus'

/**
 * ストーリースクリプト実行エンジン（M2: 完全版）
 * 対応命令: say, bg, bgm.*, se, end
 */

type StoryOp = {
  op: string
  [key: string]: unknown
}

type SayPayload = {
  name: string
  lines: string[]
  portrait?: string
  portraitX?: number
  portraitY?: number
  portraitScale?: number
}

type BgPayload = {
  name: string
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  fade?: number
}

export class StoryRunner {
  private scene: Phaser.Scene
  private audio: AudioBus
  private script: StoryOp[] = []
  private pc = 0 // Program Counter
  private onSay!: (payload: SayPayload) => Promise<void>
  private onBg!: (payload: BgPayload) => Promise<void>
  private onEnd!: (returnTo: string) => void

  constructor(scene: Phaser.Scene, audio: AudioBus) {
    this.scene = scene
    this.audio = audio
  }

  /**
   * JSONスクリプトをロード
   */
  load(json: { script: StoryOp[] }) {
    this.script = json.script ?? []
    this.pc = 0
  }

  /**
   * コールバックを設定
   */
  hooks(h: {
    onSay: (p: SayPayload) => Promise<void>
    onBg: (p: BgPayload) => Promise<void>
    onEnd: (rtn: string) => void
  }) {
    this.onSay = h.onSay
    this.onBg = h.onBg
    this.onEnd = h.onEnd
  }

  /**
   * 1ステップ実行（Spaceキーで呼ばれる）
   */
  async step() {
    console.log('[StoryRunner] step() called, pc:', this.pc)
    while (this.pc < this.script.length) {
      const op = this.script[this.pc++]
      console.log('[StoryRunner] Executing op:', op.op, 'at pc:', this.pc - 1)

      switch (op.op) {
        case 'bg': {
          // 背景変更
          await this.onBg({
            name: op.name as string,
            x: op.x as number | undefined,
            y: op.y as number | undefined,
            scaleX: op.scaleX as number | undefined,
            scaleY: op.scaleY as number | undefined,
            fade: op.fade as number | undefined
          })
          break // 次の命令へ（sayではないので停止しない）
        }

        case 'say': {
          // セリフ表示（一時停止）
          console.log('[StoryRunner] Executing say:', { name: op.name, lines: op.lines })
          await this.onSay({
            name: op.name as string,
            lines: op.lines as string[],
            portrait: op.portrait as string | undefined,
            portraitX: op.portraitX as number | undefined,
            portraitY: op.portraitY as number | undefined,
            portraitScale: op.portraitScale as number | undefined
          })
          console.log('[StoryRunner] say completed, returning to wait for next step()')
          return // 次のSpaceキーまで待機
        }

        case 'bgm.play': {
          this.audio.playBgm(op.name as string, {
            loop: op.loop as boolean | undefined,
            volume: op.volume as number | undefined,
            fade: op.fade as number | undefined
          })
          break
        }

        case 'bgm.stop': {
          this.audio.stopBgm({
            fade: op.fade as number | undefined
          })
          break
        }

        case 'bgm.cross': {
          this.audio.cross(
            op.from as string,
            op.to as string,
            op.time as number,
            op.loop as boolean | undefined ?? true
          )
          break
        }

        case 'se': {
          this.audio.se(op.name as string)
          break
        }

        case 'end': {
          // ストーリー終了
          this.onEnd(op.returnTo as string ?? 'game')
          return
        }

        default:
          console.warn(`[StoryRunner] Unknown op: ${op.op}`)
          break
      }
    }
  }

  /**
   * スクリプトが終了したか
   */
  isFinished(): boolean {
    return this.pc >= this.script.length
  }
}
