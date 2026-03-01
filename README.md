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

### ゲームフロー管理システム
- `public/assets/gameflow.json` によるゲーム全体フローの一元管理
- マップごとのBGM・ボス有無・イベントトリガーを宣言的に定義
- **ゲームフローエディタ** (`tools/gameflow-editor/`) でGUI編集可能

### マップ移動システム
- 複数のマップ間を移動可能（`demo_map` ⇔ `boss_map`）
- テレポートマーカーによる直感的な移動
- マップごとに異なる敵・NPC配置

### ストーリーシステム
- イントロ、クリア、ゲームオーバー各種ストーリー
- イベントトリガーによるストーリー再生
- 立ち絵・背景・BGM・SEを使った演出

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
  - ステート別にセリフ行を定義（patrol / aim / cooldown / return など）
  - `intervalMs` 指定で定期発話、未指定でステート変化時に1回発話
  - ランダム行選択・フェードアウト付き

### エネミーエディタ（`tools/enemy-editor/`）
- Catppuccin Mochaテーマのブラウザ内GUIツール
- キャラクター定義（名前・敵タイプ・スプライト・ステータス・セリフ）を編集
- スプライトプレビュー（idle / walk / atk アニメーション切替）
- LocalStorageに自動保存、JSONエクスポートで `public/assets/enemies/` に配置

### マップエディタ（`tools/map-editor/`）
- マップのタイル・壁・敵スポーン・NPCスポーン・テレポートを GUI 編集
- enemy-editor と LocalStorage 連携——敵スポーン配置時にキャラ選択モーダルを表示
- JSONエクスポートで `public/assets/maps/` に配置

### アニメーションシステム
- 64×64px スプライトシート対応（16列×4行）
- 歩行・攻撃・ひんし・死亡アニメーション（4方向）
- 各敵の `animKey` によりキャラ固有スプライトで再生
- チョロマキー（RGB(0,254,0) → 透過）処理

### BGMシステム
- `AudioBus` による統合音声管理
- マップ遷移時の自動BGM切替・フェードイン

## プロジェクト構造

```
RPGGame/
├── public/
│   └── assets/
│       ├── enemies/          # 敵定義JSON（enemy-defs.json）
│       ├── maps/             # マップデータ（JSON）
│       ├── npcs/             # NPC設定（JSON）
│       ├── bosses/           # ボス設定（JSON）
│       ├── images/           # スプライト画像
│       └── story/            # ストーリーアセット
│           ├── scripts/      # ストーリースクリプト（Git管理）
│           ├── bg/           # 背景画像（Git除外）
│           ├── portraits/    # 立ち絵（Git除外）
│           ├── bgm/          # BGM（Git除外）
│           └── se/           # SE（Git除外）
├── src/
│   ├── scenes/               # Phaserシーン
│   │   ├── LoadingScene.ts   # アセット読み込み・chroma key処理
│   │   ├── MainScene.ts      # メインゲームループ
│   │   └── TitleScene.ts     # タイトル画面
│   ├── systems/              # ゲームシステム
│   │   ├── AnimationManager.ts
│   │   ├── AudioBus.ts
│   │   ├── BossSpeechBubble.ts
│   │   ├── EnemyAI.ts        # 敵AI・型定義・enemy-defs統合
│   │   ├── EnemySpeech.ts    # 敵セリフ吹き出し
│   │   ├── EventTriggerManager.ts
│   │   ├── GameFlowManager.ts
│   │   ├── NPCManager.ts
│   │   └── PauseMenu.ts
│   └── story/                # ストーリー管理
└── tools/                    # 開発支援ツール（ブラウザGUI）
    ├── enemy-editor/         # 敵キャラ定義エディタ
    ├── gameflow-editor/      # ゲームフローエディタ
    └── map-editor/           # マップエディタ
```

## 開発ツールの使い方

`npm run dev` 起動後、各ツールはブラウザで直接開けます。

| ツール | URL |
|--------|-----|
| ゲーム本体 | `http://localhost:5173/Game_RPG/` |
| マップエディタ | `http://localhost:5173/tools/map-editor/` |
| エネミーエディタ | `http://localhost:5173/tools/enemy-editor/` |
| ゲームフローエディタ | `http://localhost:5173/tools/gameflow-editor/` |

### 敵キャラ追加の流れ

1. **エネミーエディタ** でキャラを作成 → Export → `public/assets/enemies/enemy-defs.json` に配置
2. **マップエディタ** で敵スポーンを配置 → キャラ選択モーダルで対象キャラを選択 → Export → `public/assets/maps/` に配置
3. ゲームをリロードすると指定キャラが固定位置にスポーン

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
