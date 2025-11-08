### RPGGame: 構成と仕様まとめ

本ドキュメントは、現在のフォルダ構成と主要仕様・システム概要を一覧化したものです。

---

## フォルダ構成（抜粋）

```text
RPGGame/
├─ ANIMATION_SPRITES_UPDATE.md
├─ ENEMY_UPDATE_SPEC.md
├─ PROJECT_STRUCTURE_AND_SPEC.md
├─ README.md
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ editor/
│  ├─ map-editor.html
│  └─ maptip/
│     ├─ Nglass.png
│     └─ Nwater.png
├─ public/
│  └─ favicon.svg
├─ src/
│  ├─ main.ts
│  ├─ config.ts
│  ├─ scenes/
│  │  └─ MainScene.ts
│  ├─ systems/
│  │  ├─ AnimationManager.ts
│  │  ├─ Dialog.ts
│  │  ├─ EnemyAI.ts
│  │  ├─ NPCManager.ts
│  │  ├─ Projectile.ts
│  │  └─ Tilemap.ts
│  ├─ ui/
│  │  └─ MessageWindow.ts
│  ├─ types/
│  │  └─ global.d.ts
│  └─ assets/
│     ├─ images/        # プレイヤ・敵・弾丸など
│     ├─ enemies/       # 敵仕様JSON
│     ├─ maps/          # マップJSON（demo_map.json 他）
│     ├─ dialog/        # 会話スクリプトJSON
│     ├─ npcs/          # NPC構成JSON
│     └─ ivent_img/     # イベント用画像
└─ node_modules/
```

---

## 実行・ビルド

- 開発サーバ: `npm run dev`（デフォルト `http://localhost:5173`）
- ビルド: `npm run build`（`tsc -b` → `vite build`）
- プレビュー: `npm run preview`

主要設定:

```json
// package.json（抜粋）
{
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview" },
  "dependencies": { "phaser": "^3.80.1" },
  "devDependencies": { "typescript": "^5.6.2", "vite": "^5.4.0" }
}
```

```ts
// vite.config.ts（抜粋）
export default defineConfig({ server: { port: 5173 }, build: { sourcemap: true } })
```

```json
// tsconfig.json（抜粋）
{ "compilerOptions": { "target": "ES2020", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "resolveJsonModule": true, "lib": ["ES2020","DOM"] }, "include": ["src"] }
```

---

## ゲーム仕様（現状）

- 解像度: 1920×1080、Scale.FIT、中央寄せ
- 入力: 十字キーで8方向移動、Spaceで攻撃/会話、Rでリスタート
- カメラ: `CAMERA.lerpX/Y = 0.12`、プレイヤ追従
- 物理: Arcade（重力0）
- マップ: JSONから読み込み（`src/assets/maps/demo_map.json`）→床/壁生成
- 会話: 外部JSON（例: `src/assets/dialog/npc1.json`, `merchant.json`）＋下部UI表示・タイプ出力
- NPC: `npcs.json`に基づく生成・当たり判定・会話トリガ
- 敵AI: 複数同時管理。巡回/追跡/攻撃の状態遷移ベース
- アニメ: 64×64スプライトシート（プレイヤ/敵）。歩行・攻撃の4方向。攻撃判定は特定フレームの　み有効化
- 飛び道具: 矢・魔法弾（誘導）。寿命管理・壁/プレイヤ衝突で消滅
- **HPシステム**: プレイヤーHP表示（左上固定）、ダメージ処理、ゲームオーバー機能
- **ダメージ処理**: 無敵時間、色変化、HP減少時のゲームオーバー判定

参考ドキュメント:
- `README.md`: 起動方法とアニメ更新仕様の要約
- `ANIMATION_SPRITES_UPDATE.md`: 64×64スプライト/アニメ定義・Tiled運用
- `ENEMY_UPDATE_SPEC.md`: Archer/Mage/Brute追加、矢/誘導弾仕様

---

## エントリ/シーン/システム概要

- `src/main.ts`
  - Phaserゲームインスタンス生成。`scene: [MainScene]`、`Scale.FIT`、`pixelArt: true`。

- `src/scenes/MainScene.ts`
  - preload: スプライト/弾/NPC画像、会話JSON、マップJSON読込
  - create:
    - アニメ生成（プレイヤ/各敵）
    - タイルマップ構築（`Tilemap.buildMapFromJSON`）→`walls`作成
    - プレイヤ生成・HP/速度・アニメ初期化、カメラ/物理境界設定
    - `DialogUI` と `NPCManager` 初期化、NPCロード/衝突
    - **HP表示UI作成**（左上固定、カメラ追従なし）
    - 敵スポーン（マップJSONの`enemySpawns`）＋ Archer/Mage/Brute 生成
    - 攻撃ヒットボックスと敵への被弾処理、Brute接触ダメージ
    - Space: 会話進行 or 近接攻撃
  - update:
    - **ゲームオーバー時は全処理停止**
    - 会話中は入力停止/アニメ一時停止
    - 誘導弾更新、飛び道具と壁/プレイヤの衝突チェック
    - **飛び道具衝突時のダメージ処理**（HP減少、無敵時間、ゲームオーバー判定）
    - 入力から速度計算→移動/歩行アニメ切替
    - 既存敵＋新規敵（Archer/Mage/Brute）のAI/アニメ更新
  - **新機能**:
    - `createHPDisplay()`: HP表示UI作成（バー形式、色変化）
    - `updateHPDisplay()`: HP表示更新
    - `triggerGameOver()`: ゲームオーバー画面表示、Rキーでリスタート

- `src/systems/AnimationManager.ts`
  - 64×64行列前提のプレイヤ/敵アニメの一括作成、移動ベクトルから方向判定

- `src/systems/EnemyAI.ts`
  - 汎用敵AI（巡回→追跡→攻撃→帰還）。Archer/Mage/Bruteの型/生成関数・個別`update*AI`を提供

- `src/systems/Projectile.ts`
  - 矢（直射）・魔法弾（誘導）の生成と更新、寿命/衝突ハンドリング
  - `Projectile`型: `damage`, `bornAt`, `life`プロパティ
  - `HomingOrb`型: 誘導機能付き魔法弾、ターゲット追従

- `src/systems/Tilemap.ts`
  - `demo_map.json`フォーマット（cols/rows/tiles/enemySpawns）から床タイル/壁`StaticGroup`を生成

- `src/systems/Dialog.ts` / `src/ui/MessageWindow.ts`
  - 下部メッセージUI、名前表示、タイプ出力、ページ送り

- `src/systems/NPCManager.ts`
  - `npcs.json`定義のNPCを生成、会話トリガ、プレイヤとの距離で相互作用

---

## アセットとデータ

- 画像（`src/assets/images/`）: `player_hero.png`, `enemy_blob.png`, `enemy_archer.png`, `enemy_mage.png`, `enemy_brute.png`, `arrow.png`, `magic_orb.png`, `npc_*` など
- 会話（`src/assets/dialog/`）: `npc1.json`, `merchant.json` など
- NPC（`src/assets/npcs/npcs.json`）: 配置/見た目/会話キーなど
- マップ（`src/assets/maps/`）: `demo_map.json`（壁=1/床=0の2次元配列、`enemySpawns`含む）
- イベント画像（`src/assets/ivent_img/`）: ストーリー演出用画像一式

---

## 拡張ポイント（計画/メモ）

- アニメ: idle/ダッシュ/被ダメ/コンボ等の列追加、アトラス化
- UI: ミニマップ、インベントリ、スコア表示
- ストーリー: 会話分岐/フラグ管理、セーブ/ロード
- マップ: Tiled移行（タイルセット名/衝突プロパティ運用）、スポーンポイント活用
- ゲームシステム: レベルアップ、アイテム収集、敵の種類増加

---

## 既知の前提/注意

- 画像は64×64のスプライトシート（横4×縦8）を前提。`row*4 + col`でフレーム計算
- 攻撃判定はアニメの中間フレームでのみ有効化（体感改善）
- Arcade Physics使用のため、ヒットボックスは`Physics.Arcade.Body`で有効/無効を切替
- **ダメージ処理**: 無敵時間中は重複ダメージを防ぐ、HPは0未満にならないよう制限
- **ゲームオーバー**: HP=0で発動、Rキーでリスタート、ゲームオーバー中は全処理停止
- **HP表示**: 左上固定（カメラ追従なし）、HP値に応じて色変化（白→オレンジ→赤）


