# フォルダ構成テンプレ（Vite + TypeScript + Phaser）

最小限で**そのまま動く**テンプレです。`npm i && npm run dev`で起動できます。

---

## ディレクトリ構成（tree）

```
my-adventure/
├─ package.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vite.config.ts
├─ index.html
├─ public/
│  └─ favicon.svg
├─ src/
│  ├─ main.ts
│  ├─ config.ts
│  ├─ types/global.d.ts
│  ├─ scenes/
│  │  └─ MainScene.ts
│  ├─ systems/
│  │  ├─ Dialog.ts
│  │  ├─ EnemyAI.ts
│  │  └─ Tilemap.ts
│  ├─ ui/
│  │  └─ MessageWindow.ts
│  └─ assets/
│     ├─ images/
│     ├─ maps/
│     │  └─ demo_map.json
│     └─ dialog/
│        └─ npc1.json
└─ README.md
```

---

## package.json

```json
{
  "name": "my-adventure",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.80.1"
  },
  "devDependencies": {
    "typescript": "^5.6.2",
    "vite": "^5.4.0"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

---

## tsconfig.node.json

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

---

## vite.config.ts

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173 },
  build: { sourcemap: true }
})
```

---

## index.html

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Top‑Down Adventure</title>
    <style>
      html,body { margin:0; height:100%; background:#0b0f14; }
      #app { width:100vw; height:100vh; }
      canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

---

## src/config.ts

```ts
export const GAME_W = 1920
export const GAME_H = 1080
export const TILE = 32

export const CAMERA = {
  lerpX: 0.12,
  lerpY: 0.12
}
```

---

## src/types/global.d.ts

```ts
// 画像やJSONをimportする場合に備えた拡張（必要に応じて）
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.json' {
  const value: any
  export default value
}
```

---

## src/main.ts

```ts
import Phaser from 'phaser'
import { GAME_W, GAME_H } from './config'
import MainScene from './scenes/MainScene'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#081018',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { debug: false, gravity: { y: 0 } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MainScene]
})

export default game
```

---

## src/systems/Dialog.ts（簡易会話エンジン）

```ts
import Phaser from 'phaser'
import { GAME_W } from '../config'

export type DialogData = { portraitTint?: number; lines: string[] }

export default class DialogUI {
  private scene: Phaser.Scene
  private container!: Phaser.GameObjects.Container
  private nameText!: Phaser.GameObjects.Text
  private msgText!: Phaser.GameObjects.Text
  private portrait!: Phaser.GameObjects.Image

  private lines: string[] = []
  private idx = 0
  private typing = false
  private fullLine = ''

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.create()
  }

  private create() {
    const panel = this.scene.add.graphics()
    panel.fillStyle(0x000000, 0.65)
    panel.fillRoundedRect(0, 0, GAME_W - 80, 220, 12)
    panel.generateTexture('dialog_panel', GAME_W - 80, 220)
    panel.destroy()

    this.container = this.scene.add.container(40, 1080 - 40 - 220).setScrollFactor(0)
    const bg = this.scene.add.image(0, 0, 'dialog_panel').setOrigin(0, 0)
    this.portrait = this.scene.add.image(20, 10, 'portrait').setOrigin(0, 0)
    this.nameText = this.scene.add.text(240, 18, '???', { fontFamily: 'monospace', fontSize: '28px', color: '#aee2ff' })
    this.msgText = this.scene.add.text(240, 64, '', { fontFamily: 'monospace', fontSize: '30px', color: '#ffffff', wordWrap: { width: GAME_W - 360 } })

    this.container.add([bg, this.portrait, this.nameText, this.msgText])
    this.container.setDepth(1000).setVisible(false)
  }

  get visible() { return this.container.visible }

  show(name: string, data: DialogData) {
    this.lines = data.lines.slice()
    this.idx = 0
    this.nameText.setText(name)
    this.portrait.setTint(data.portraitTint ?? 0xffffff)
    this.container.setVisible(true)
    this.typeLine(this.lines[this.idx])
  }

  next() {
    if (this.typing) { this.typing = false; this.msgText.setText(this.fullLine); return }
    this.idx++
    if (this.idx >= this.lines.length) { this.container.setVisible(false); return }
    this.typeLine(this.lines[this.idx])
  }

  private typeLine(text: string) {
    this.typing = true
    this.fullLine = text
    this.msgText.setText('')

    const chars = [...text]
    let i = 0
    const timer = this.scene.time.addEvent({
      delay: 20,
      repeat: chars.length - 1,
      callback: () => {
        this.msgText.setText(this.msgText.text + chars[i])
        i++
        if (i >= chars.length) { this.typing = false; timer.remove() }
      }
    })
  }
}
```

---

## src/systems/EnemyAI.ts（巡回→追跡→攻撃）

```ts
import Phaser from 'phaser'

export type EnemyWithAI = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  state: 'patrol' | 'chase' | 'attack' | 'return'
  speed: number
  hp: number
  patrolPoints: Phaser.Math.Vector2[]
  patrolIndex: number
}

export function makeEnemy(scene: Phaser.Scene, x: number, y: number): EnemyWithAI {
  const en = scene.physics.add.sprite(x, y, 'enemy16').setScale(2) as EnemyWithAI
  en.state = 'patrol'
  en.speed = 180
  en.hp = 3
  en.patrolPoints = [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + 10 * 32, y)]
  en.patrolIndex = 0
  return en
}

export function updateEnemyAI(scene: Phaser.Scene, en: EnemyWithAI, player: Phaser.Physics.Arcade.Sprite) {
  if (!en.active) return
  const dist = Phaser.Math.Distance.Between(en.x, en.y, player.x, player.y)
  const vision = 220, attackR = 44

  const moveTowards = (target: Phaser.Math.Vector2 | Phaser.GameObjects.Sprite, speed: number) => {
    const tx = (target as any).x
    const ty = (target as any).y
    const v = new Phaser.Math.Vector2(tx - en.x, ty - en.y).normalize().scale(speed)
    en.setVelocity(v.x, v.y)
  }

  switch (en.state) {
    case 'patrol': {
      const target = en.patrolPoints[en.patrolIndex]
      moveTowards(target, en.speed * 0.7)
      if (Phaser.Math.Distance.Between(en.x, en.y, target.x, target.y) < 8) {
        en.patrolIndex = (en.patrolIndex + 1) % en.patrolPoints.length
      }
      if (dist < vision) en.state = 'chase'
      break
    }
    case 'chase': {
      moveTowards(player, en.speed)
      if (dist < attackR) en.state = 'attack'
      if (dist > vision * 1.4) en.state = 'return'
      break
    }
    case 'attack': {
      if (dist < attackR) {
        player.setTint(0xffaaaa)
        scene.time.delayedCall(120, () => player.clearTint())
      }
      en.state = 'chase'
      break
    }
    case 'return': {
      const home = en.patrolPoints[0]
      moveTowards(home, en.speed * 0.8)
      if (Phaser.Math.Distance.Between(en.x, en.y, home.x, home.y) < 12) en.state = 'patrol'
      if (dist < vision) en.state = 'chase'
      break
    }
  }
}
```

---

## src/ui/MessageWindow.ts（必要なら分離）

```ts
// 将来的に選択肢やレイアウトを拡張する場合のプレースホルダ
export {}
```

---

## src/scenes/MainScene.ts（タイルマップ + 複数敵 + 外部会話）

```ts
import Phaser from 'phaser'
import { GAME_W, GAME_H, TILE } from '../config'
import DialogUI from '../systems/Dialog'
import { updateEnemyAI, EnemyWithAI, makeEnemy } from '../systems/EnemyAI'
import { buildMapFromJSON } from '../systems/Tilemap'
import npc1 from '../assets/dialog/npc1.json'

export default class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private npc!: Phaser.Physics.Arcade.StaticSprite
  private enemies: EnemyWithAI[] = []
  private walls!: Phaser.Physics.Arcade.StaticGroup
  private hitbox!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body }
  private ui!: DialogUI

  constructor() { super('MainScene') }

  preload() {
    // プレースホルダ生成（同様）
    const g1 = this.make.graphics({ x: 0, y: 0, add: false })
    g1.fillStyle(0x56e39f, 1).fillRect(0, 0, 16, 16).generateTexture('player16', 16, 16).clear()

    const g2 = this.make.graphics({ x: 0, y: 0, add: false })
    g2.fillStyle(0x66ccff, 1).fillRect(0, 0, 16, 16).generateTexture('npc16', 16, 16).clear()

    const g3 = this.make.graphics({ x: 0, y: 0, add: false })
    g3.fillStyle(0xff5566, 1).fillRect(0, 0, 16, 16).generateTexture('enemy16', 16, 16).clear()

    const g4 = this.make.graphics({ x: 0, y: 0, add: false })
    g4.fillStyle(0x143d2a, 1).fillRect(0, 0, TILE, TILE).generateTexture('ground', TILE, TILE).clear()

    const g5 = this.make.graphics({ x: 0, y: 0, add: false })
    g5.fillStyle(0x3a3a4a, 1).fillRect(0, 0, TILE, TILE)
      .lineStyle(2, 0x2a2a36, 1).strokeRect(1, 1, TILE - 2, TILE - 2)
      .generateTexture('wall', TILE, TILE).clear()

    const g7 = this.make.graphics({ x: 0, y: 0, add: false })
    g7.fillStyle(0xffffff, 1).fillRect(0, 0, 200, 200).generateTexture('portrait', 200, 200).clear()

    // マップJSON（Viteでpublic扱いにしない場合はimportでOK）
    this.load.json('demo_map', 'src/assets/maps/demo_map.json')
  }

  create() {
    // タイルマップを読み込み→壁と床を配置
    const mapData = this.cache.json.get('demo_map')
    const { worldW, worldH, walls } = buildMapFromJSON(this, mapData)
    this.walls = walls

    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.physics.world.setBounds(0, 0, worldW, worldH)

    this.player = this.physics.add.sprite(40 * TILE, 40 * TILE, 'player16').setScale(2)
    ;(this.player as any).speed = 260
    ;(this.player as any).hp = 5
    this.player.setCollideWorldBounds(true)

    this.npc = this.physics.add.staticSprite(42 * TILE, 40 * TILE, 'npc16').setScale(2)

    // 敵複数生成（例: JSONのenemySpawnsから）
    const spawns = mapData.enemySpawns as { x: number, y: number }[] || []
    this.enemies = spawns.map(s => makeEnemy(this, s.x * TILE, s.y * TILE))
    if (this.enemies.length === 0) {
      // フォールバック
      this.enemies.push(makeEnemy(this, 50 * TILE, 45 * TILE))
      this.enemies.push(makeEnemy(this, 60 * TILE, 60 * TILE))
    }

    this.physics.add.collider(this.player, this.walls)
    this.enemies.forEach(en => this.physics.add.collider(en, this.walls))
    this.physics.add.collider(this.player, this.npc)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.hitbox = this.add.rectangle(0, 0, 28, 28, 0xffffff, 0) as any
    this.physics.add.existing(this.hitbox)
    ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(false)

    this.enemies.forEach(en => {
      this.physics.add.overlap(this.hitbox, en, () => {
        if (!en.getData('hitCool')) {
          en.hp -= 1
          en.setTint(0xffffaa)
          en.setData('hitCool', true)
          this.time.delayedCall(120, () => en.clearTint())
          this.time.delayedCall(250, () => en.setData('hitCool', false))
          if (en.hp <= 0) en.disableBody(true, true)
        }
      })
    })

    this.ui = new DialogUI(this)

    this.spaceKey.on('down', () => {
      if (this.ui.visible) { this.ui.next(); return }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y)
      if (d < 48) {
        this.ui.show('村人', npc1)
      } else {
        this.doAttack()
      }
    })
  }

  update() {
    if (this.ui.visible) { this.player.setVelocity(0); return }

    const speed: number = (this.player as any).speed
    const vx = (this.cursors.left?.isDown ? -1 : this.cursors.right?.isDown ? 1 : 0)
    const vy = (this.cursors.up?.isDown ? -1 : this.cursors.down?.isDown ? 1 : 0)
    const v = new Phaser.Math.Vector2(vx, vy)
    if (v.lengthSq() > 0) v.normalize().scale(speed)
    this.player.setVelocity(v.x, v.y)

    this.enemies.forEach(en => updateEnemyAI(this, en, this.player))
  }

  private doAttack() {
    const dir = this.getFacingVector()
    const off = 24
    this.hitbox.x = this.player.x + dir.x * off
    this.hitbox.y = this.player.y + dir.y * off
    ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(true)
    this.time.delayedCall(120, () => (this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(false))
    this.tweens.add({ targets: this.hitbox, scaleX: 1.2, scaleY: 1.2, yoyo: true, duration: 60 })
  }

  private getFacingVector() {
    if (this.cursors.left?.isDown) return new Phaser.Math.Vector2(-1, 0)
    if (this.cursors.right?.isDown) return new Phaser.Math.Vector2(1, 0)
    if (this.cursors.up?.isDown) return new Phaser.Math.Vector2(0, -1)
    if (this.cursors.down?.isDown) return new Phaser.Math.Vector2(0, 1)
    return new Phaser.Math.Vector2(0, 1)
  }
}
```

---

## public/favicon.svg（任意）

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#0b0f14"/><path d="M20 70 L50 20 L80 70 Z" fill="#56e39f"/></svg>
```

---

## README.md

```md
# Top-Down Adventure (Phaser + Vite + TS)

## 動かし方

```bash
npm i
npm run dev
```

`http://localhost:5173` にアクセス。

## 仕様（初期）
- 解像度: 1920x1080（Scale.FIT）
- 入力: 十字キーで8方向移動、Spaceで攻撃/会話
- 見下ろし縦横スクロール、簡易ダンジョン
- NPC会話（立ち絵/下部ウィンドウ/タイプ表示）
- ザコ敵AI（巡回→追跡→攻撃）
- **タイルマップJSON読み込み（`src/assets/maps/demo_map.json`）**
- **外部会話JSON（`src/assets/dialog/npc1.json`）**

## マップをTiledに置き換えるには
- Tiledで32x32ベースのマップを作成し、JSONでエクスポート
- `src/assets/maps/your_map.json` を配置
- `MainScene`の`this.load.json('demo_map', 'src/assets/maps/your_map.json')` に変更
- 衝突レイヤは`Tilemap.ts`内の`isWall`判定へ反映

## 今後の拡張
- スプライトシートによるアニメ
- 会話分岐/フラグ
- UI（HP/ミニマップ/インベントリ）
```
```bash
npm i
npm run dev
```

`http://localhost:5173` にアクセス。

## 仕様（初期）
- 解像度: 1920x1080（Scale.FIT）
- 入力: 十字キーで8方向移動、Spaceで攻撃/会話
- 見下ろし縦横スクロール、簡易ダンジョン
- NPC会話（立ち絵/下部ウィンドウ/タイプ表示）
- ザコ敵AI（巡回→追跡→攻撃）

## 今後の拡張
- Tiled導入（`src/assets/maps` にJSON配置、衝突レイヤ連携）
- スプライトシートによるアニメ
- 会話JSON外部化（`src/assets/dialog/*.json`）
- UI（HP/ミニマップ/インベントリ）
```

---

## src/systems/Tilemap.ts（JSON→床と壁を生成）

```ts
import Phaser from 'phaser'
import { TILE } from '../config'

/**
 * demo_map.json の形式
 * {
 *   "cols": 120, "rows": 120,
 *   "tiles": [ [0|1, ...], ... ], // 0=床, 1=壁
 *   "enemySpawns": [{"x":50,"y":45},{"x":60,"y":60}]
 * }
 */
export function buildMapFromJSON(scene: Phaser.Scene, data: any) {
  const cols: number = data.cols
  const rows: number = data.rows
  const tiles: number[][] = data.tiles

  const worldW = cols * TILE
  const worldH = rows * TILE

  // 背景（床）をタイルスプライトで塗る
  scene.add.tileSprite(worldW / 2, worldH / 2, worldW, worldH, 'ground')

  // 壁をStaticGroupで配置
  const walls = scene.physics.add.staticGroup()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (tiles[y][x] === 1) {
        walls.create(x * TILE + TILE / 2, y * TILE + TILE / 2, 'wall')
      }
    }
  }
  return { worldW, worldH, walls }
}
```

---

## src/assets/dialog/npc1.json（外部会話スクリプト）

```json
{
  "portraitTint": 6736895,
  "lines": [
    "やぁ、旅の者。ここは危険なダンジョンだ。",
    "スペースキーで剣を振れる。敵に近づきすぎるなよ。",
    "出口は北東あたりだ、気をつけて行け。"
  ]
}
```

---

## src/assets/maps/demo_map.json（簡易マップ）

```json
{
  "cols": 80,
  "rows": 80,
  "tiles": [
    // 最外周が壁、内部は床。いくつかの通路壁を置く
    // 生成を簡単にするため、ここではランレングス圧縮せず小さめの例にしています。
    // 実際に使うときはスクリプトで生成するかTiledに置き換えてください。
  ]
}
```

> **注**: `tiles` の中身は大きいため省略しています。動かすには、外周を1にした二次元配列を入れてください（例: rows×colsの配列で、`y==0||x==0||y==rows-1||x==cols-1`を1に、他0）。必要なら、自動生成スニペットをお渡しします。

