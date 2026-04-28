# RPG Game (Phaser 3 + Vite + TypeScript)

見下ろし型2DアクションRPGです。マップ移動、ストーリーシステム、NPC会話、敵AI、ボス戦などの機能を実装しています。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. アセットファイルの配置

このプロジェクトでは、ファイルサイズの大きいアセット（背景画像、立ち絵、BGM、SE）をGitリポジトリから除外しています。
ゲームを実行する前に、以下のディレクトリに対応するアセットファイルを配置してください。

```
public/assets/story/
├── scripts/          # ストーリースクリプト（JSON） ← Git管理対象
├── bg/              # 背景画像（PNG形式） ← Git除外
├── portraits/       # 立ち絵画像（PNG形式、透過対応） ← Git除外
├── bgm/             # BGMファイル（MP3形式） ← Git除外
└── se/              # SEファイル（MP3形式） ← Git除外
```

詳細は `public/assets/story/README.md` を参照してください。

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173/Game_RPG/` にアクセスしてゲームを開始します。

## 主要機能

### タイトル画面 / ポーズメニュー
- タイトル画像・プレイボタンによるゲーム開始
- ESCキーでのポーズ／再開
- タイトルに戻るボタン

### ゲームフロー管理システム（章立て対応）
- `public/assets/gameflows/gameflow.json` によるゲーム全体フローの一元管理
- **章（Chapter）単位**でマップ・ストーリーをグループ管理
  - `chapters[]` 配列で章を定義（id・label・start・stories）
  - `goto_chapter` アクションで章遷移が可能
- マップごとのBGM・ボス有無・イベントトリガーを宣言的に定義
- **ゲームフローエディタ** (`tools/gameflow-editor/`) でGUI編集可能
  - 「章管理」パネルで章ID・ラベル・ストーリーリスト・ロード画像を設定
  - 保存時にグラフ上の全Storyノードを自動収集して `stories` に反映

### チャプターローディング画面
- Play ボタン押下 → `ChapterLoadingScene` → `MainScene` の流れ
- `public/assets/images/loading_images/` に配置した画像をランダム表示
- その間に章内の全ストーリーアセット（背景・立ち絵・BGM・SE）を事前ロード
- プログレスバー＋パーセント表示（ゲーム起動時と同形式）
- ロード完了後400ms表示してから遷移

### マップ移動システム（ポータルスプライト）
- 複数のマップ間を移動可能（`demo_map` ⇔ `boss_map`）
- **ポータルスプライト**（`door.png`）への物理オーバーラップで即テレポート
  - マップJSON（`portals: [{x, y}]`）で位置を管理
  - `gameflow.json`（`portals: [{targetMap, targetX, targetY}]`）で目的地を管理
  - `PortalManager` が起動時にインデックス突合して統合
- マップごとに異なる敵・NPC配置

### ストーリーシステム
- イントロ、クリア、ゲームオーバー各種ストーリー
- イベントトリガーによるストーリー再生
- 立ち絵・背景・BGM・SEを使った演出
- 右下スキップボタン（どのストーリーでも任意のタイミングで動作）
- 背景・立ち絵はリニアフィルタで高画質表示（ゲームのピクセルアートモードと独立）

#### ストーリースクリプトコマンド一覧

| コマンド | 主なパラメータ | 説明 |
|----------|--------------|------|
| `say` | `name`, `lines`, `portrait` | セリフ表示（クリックで進む） |
| `bg` | `name`, `x`, `y`, `scaleX`, `scaleY`, `fade` | 背景画像を変更 |
| `portrait.show` | `portrait`, `x`, `y`, `scale` | 立ち絵を表示 |
| `portrait.hide` | — | 立ち絵を非表示 |
| `bgm.play` | `name`, `loop`, `volume`, `fade` | BGMを再生 |
| `bgm.stop` | `fade` | BGMを停止 |
| `bgm.cross` | `from`, `to`, `time` | BGMをクロスフェード |
| `se` | `name`, `loop` | 効果音を再生 |
| `se.stop` | `name` | ループSEを停止 |
| `fade.in` | `color`, `duration`, `alpha` | 指定色のオーバーレイをフェードイン |
| `fade.out` | `duration` | オーバーレイをフェードアウト |
| `delay` | `duration` | 指定ms待機してから次のコマンドへ |
| `end` | `returnTo` | ストーリー終了・次のシーンへ遷移 |

### NPC会話システム
- マップごとに配置されるNPC
- 会話ウィンドウとタイプライター表示
- 外部JSONによる会話データ管理

### 敵AIシステム
- 4種類の敵タイプ（Blob / Archer / Mage / Brute）
- 巡回 → 索敵 → 攻撃 → クールダウン のステートマシン
- 種類ごとに異なる攻撃パターン（弓・魔法弾・突進）

### 敵キャラ個性システム（enemy-defs）
- `public/assets/enemies/enemy-defs.json` でキャラクター定義を管理
- スポーン時に `enemyDefId` を指定することで、固有の敵を配置
- 各敵の **ステータス**（HP・速度・視野距離など）を個別オーバーライド
- 各敵の **スプライト**（`spriteKey`）を個別指定——def に合わせたアニメーションセットを自動生成
- **セリフ吹き出しシステム**（`EnemySpeech`）
  - ステート別にセリフ行を定義（patrol / aim / windup / cooldown / return など）
  - ステートに入るたびに**順番に異なるセリフ**を表示（循環）
  - `intervalMs` 指定で長いステートでもループ発話
  - フェードアウト付き吹き出し表示

### エネミーエディタ（`tools/enemy-editor/`）
- Catppuccin Mochaテーマのブラウザ内GUIツール
- キャラクター定義（名前・敵タイプ・スプライト・ステータス・セリフ）を編集
- スプライトプレビュー（idle / walk / atk アニメーション切替）
- LocalStorageに自動保存、JSONエクスポートで `public/assets/enemies/` に配置

### マップエディタ（`tools/map-editor/`）
- マップのタイル・壁・敵スポーン・ポータルを GUI 編集
- enemy-editor と LocalStorage 連携——敵スポーン配置時にキャラ選択モーダルを表示
- **ポータル配置モード**：🚪ボタンで選択、クリックで配置、右クリックで削除
- JSONエクスポートで `public/assets/maps/` に配置

### ボスエディタ（`tools/boss-editor/`）
- ボスごとの JSON（`public/assets/bosses/{id}.json`）を GUI 編集
- **基本情報タブ**：スプライトプレビュー（idle / walk / atk アニメーション切替）
- **カットインタブ**：カットイン画像のドラッグ配置・スケール調整プレビュー
- **攻撃パターンタブ**：
  - 弾テクスチャキーをボス固有フォルダ（`assets/images/boss/{id}/`）からドロップダウン選択
  - 弾テクスチャプレビュー：128×64px（横2コマ）アニメ自動再生・FPS調整・停止切替
  - SEキーを `assets/sounds/se/` から datalist で選択、▶ ボタンでテスト再生
- **テストタブ**：マップ・出現位置を指定してエディタ内でボス戦を直接プレイ可能
- ボス画像はボスIDごとのサブフォルダ（`assets/images/boss/{bossId}/`）で管理
- 「ゲームに保存」でイメージフォルダも自動生成

### アニメーションシステム
- 64×64px スプライトシート対応（16列×4行）
- 歩行・攻撃・ひんし・死亡アニメーション（4方向）
- 各敵の `animKey` によりキャラ固有スプライトで再生
- チョロマキー（RGB(0,254,0) → 透過）処理

### BGMシステム
- `AudioBus` による統合音声管理
- マップ遷移時の自動BGM切替・フェードイン
- **iOS Safari対応**：OGGと同名のM4Aファイルを同フォルダに配置することで自動フォールバック再生

## プロジェクト構造

```
RPGGame/
├── public/
│   └── assets/
│       ├── enemies/          # 敵定義JSON（enemy-defs.json）
│       ├── maps/             # マップデータ（JSON）
│       ├── npcs/             # NPC設定（JSON）
│       ├── bosses/           # ボス設定（JSON）
│       ├── gameflows/        # ゲームフロー設定（gameflow.json）
│       ├── images/
│       │   ├── boss/         # ボス関連画像（ボスIDごとにサブフォルダ）
│       │   │   └── {bossId}/ # カットイン画像・弾テクスチャ
│       │   ├── loading_images/ # チャプターロード画面の背景画像
│       │   └── ...           # その他スプライト
│       └── story/            # ストーリーアセット
│           ├── scripts/      # ストーリースクリプト（Git管理）
│           ├── bg/           # 背景画像（Git除外）
│           ├── portraits/    # 立ち絵（Git除外）
│           ├── bgm/          # BGM（Git除外）
│           └── se/           # SE（Git除外）
├── src/
│   ├── scenes/               # Phaserシーン
│   │   ├── LoadingScene.ts      # アセット読み込み・chroma key処理
│   │   ├── TitleScene.ts        # タイトル画面
│   │   ├── ChapterLoadingScene.ts # 章切り替えロード画面
│   │   ├── MainScene.ts         # メインゲームループ
│   │   └── StoryScene.ts        # ストーリーシーン
│   ├── systems/              # ゲームシステム
│   │   ├── AnimationManager.ts
│   │   ├── AudioBus.ts
│   │   ├── BossSpeechBubble.ts
│   │   ├── EnemyAI.ts        # 敵AI・型定義・enemy-defs統合
│   │   ├── EnemySpeech.ts    # 敵セリフ吹き出し
│   │   ├── EventTriggerManager.ts
│   │   ├── GameFlowManager.ts
│   │   ├── NPCManager.ts
│   │   ├── PauseMenu.ts
│   │   └── PortalManager.ts  # ポータルスプライト管理・物理オーバーラップ
│   └── story/                # ストーリー管理
└── tools/                    # 開発支援ツール（ブラウザGUI）
    ├── boss-editor/          # ボスエディタ（テストプレイ機能付き）
    ├── enemy-editor/         # 敵キャラ定義エディタ
    ├── gameflow-editor/      # ゲームフローエディタ
    ├── map-editor/           # マップエディタ
    ├── npc-editor/           # NPCエディタ
    ├── portal-editor/        # ポータルエディタ
    ├── story-editor/         # ストーリーエディタ
    └── tileset-editor/       # タイルセットエディタ
```

## 開発ツールの使い方

すべてのエディタは `npm run dev` 起動後、ブラウザでアクセスして使用します。

| ツール | URL |
|--------|-----|
| ゲーム本体 | `http://localhost:5173/htdocs/Game_RPG/` |
| ハブ（エディタ一覧） | `http://localhost:5173/tools/` |
| ボスエディタ | `http://localhost:5173/tools/boss-editor/` |
| マップエディタ | `http://localhost:5173/tools/map-editor/` |
| エネミーエディタ | `http://localhost:5173/tools/enemy-editor/` |
| NPCエディタ | `http://localhost:5173/tools/npc-editor/` |
| ゲームフローエディタ | `http://localhost:5173/tools/gameflow-editor/` |
| ストーリーエディタ | `http://localhost:5173/tools/story-editor/` |
| タイルセットエディタ | `http://localhost:5173/tools/tileset-editor/` |
| ポータルエディタ | `http://localhost:5173/tools/portal-editor/` |

> すべてのエディタは `/api/save-asset` 経由でゲームアセットに直接書き込みます。`npm run dev` が必要です。

### 敵キャラ追加の流れ

1. **エネミーエディタ** でキャラを作成 → 「ゲームに保存」
2. **マップエディタ** で敵スポーンを配置 → キャラ選択モーダルで対象キャラを選択 → 「ゲームに保存」
3. ゲームをリロードすると指定キャラが固定位置にスポーン

### ボス追加の流れ

1. **ボスエディタ** で「+ 新規」→ ID・ステータス・スプライトキー・攻撃パターンを設定
2. ボス画像（スプライト・カットイン・弾テクスチャ）を `public/assets/images/boss/{bossId}/` に配置
3. 「ゲームに保存」→ `public/assets/bosses/{id}.json` が生成、イメージフォルダも自動作成
4. **ゲームフローエディタ** でマップノードにボスを設定（`boss.configKey` を指定）
5. **テストタブ** でマップ・出現位置を選んで即テストプレイ

### ポータル追加の流れ

1. **マップエディタ** で 🚪 ポータルを配置 → 「ゲームに保存」
2. **ゲームフローエディタ** でマップノードの `portal_N` ピンを接続先マップの `in` へ接続 → 「ゲームに保存」
3. ゲームをリロードするとポータルスプライトが表示され、踏むとテレポート

## ビルド

```bash
npm run build
```

`dist/` フォルダに静的ファイルが出力されます。

## 技術スタック

- **Phaser 3** — ゲームエンジン
- **TypeScript 5** — プログラミング言語
- **Vite 5** — ビルドツール・開発サーバー

## GitHubへのプッシュ

`.gitignore` により以下のファイルは自動的に除外されます：

- `node_modules/` — 依存パッケージ
- `dist/` — ビルド出力
- `public/assets/story/bg/` — 背景画像
- `public/assets/story/portraits/` — 立ち絵
- `public/assets/story/bgm/` — BGM
- `public/assets/story/se/` — 効果音
- `.tmp/` — 一時ファイル・進捗記録

## 今後の実装予定

- プレイヤー攻撃モーションの拡充
- アイテム・インベントリシステム
- セーブ / ロード機能
- 追加マップ（村、ダンジョン）
