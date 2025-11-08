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
- 4種類の敵タイプ（Blob、Archer、Mage、Brute）
- 巡回→追跡→攻撃のAI挙動
- マップごとのスポーン設定

### アニメーションシステム
- 64×64pxスプライトシート対応（8行×4列）
- 歩行・攻撃アニメーション（4方向）
- 攻撃判定とアニメの同期

## プロジェクト構造

```
RPGGame/
├── public/
│   └── assets/
│       ├── maps/             # マップデータ（JSON）
│       ├── npcs/             # NPC設定（JSON）
│       └── story/            # ストーリーアセット
│           ├── scripts/      # ストーリースクリプト（Git管理）
│           ├── bg/          # 背景画像（Git除外）
│           ├── portraits/   # 立ち絵（Git除外）
│           ├── bgm/         # BGM（Git除外）
│           └── se/          # SE（Git除外）
├── src/
│   ├── scenes/              # Phaserシーン
│   ├── systems/             # ゲームシステム
│   │   ├── EventTriggerManager.ts
│   │   ├── NPCManager.ts
│   │   └── EnemyAI.ts
│   └── story/               # ストーリー管理
└── .tmp/                    # 進捗記録（Git除外）
```

## GitHubへのプッシュ

このプロジェクトは重いアセットファイルを除外してGitHubにプッシュできます。

### 初回セットアップ

```bash
# Gitリポジトリの初期化（まだの場合）
git init

# 全ファイルをステージング（.gitignoreで除外されるファイルは自動的にスキップ）
git add .

# 初回コミット
git commit -m "Initial commit"

# リモートリポジトリの追加（GitHubでリポジトリを作成後）
git remote add origin https://github.com/your-username/your-repo.git

# プッシュ
git push -u origin main
```

### 除外されるファイル

`.gitignore`により以下のファイルは自動的に除外されます：

- `node_modules/` - 依存パッケージ
- `dist/` - ビルド出力
- `public/assets/story/bg/` - 背景画像
- `public/assets/story/portraits/` - 立ち絵
- `public/assets/story/bgm/` - BGM
- `public/assets/story/se/` - 効果音
- `.tmp/` - 一時ファイル・進捗記録

## ビルド

本番環境用のビルドを作成：

```bash
npm run build
```

`dist/`フォルダに静的ファイルが出力されます。

## 開発の進捗

詳細な開発進捗は以下のファイルで管理しています：

- `.tmp/progress.md` - 全体の進捗記録
- `.tmp/next_session.md` - 次回セッションの作業メモ

## 技術スタック

- **Phaser 3.80.1** - ゲームエンジン
- **TypeScript 5.6.3** - プログラミング言語
- **Vite 5.4.11** - ビルドツール

## 今後の実装予定

- ボス敵の実装
- 追加マップ（村、ダンジョン）
- アイテムシステム
- インベントリUI
- セーブ/ロード機能
