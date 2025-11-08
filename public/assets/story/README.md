# ストーリーアセット（除外ファイル）

このディレクトリには以下のアセットファイルが必要ですが、ファイルサイズが大きいためGitリポジトリには含まれていません。

## 必要なディレクトリ構成

```
story/
├── scripts/          # ストーリースクリプト（JSON） ← Git管理対象
│   ├── intro.json
│   ├── clear.json
│   ├── gameover.json
│   └── priest_event.json
├── bg/              # 背景画像（約118MB） ← Git除外
│   └── （21種類のPNG画像）
├── portraits/       # 立ち絵画像 ← Git除外
│   ├── priest.png
│   └── witch.png
├── bgm/             # BGMファイル ← Git除外
│   ├── opening.mp3
│   ├── battle.mp3
│   └── ending.mp3
└── se/              # SEファイル ← Git除外
    ├── decision.mp3
    ├── door.mp3
    └── footstep.mp3
```

## 開発環境でのセットアップ

1. 上記のディレクトリを作成
2. 対応するアセットファイルを配置
3. ゲームを起動

## アセット仕様

- **背景画像**: PNG形式、1920×1080推奨
- **立ち絵**: PNG形式（透過対応）
- **BGM**: MP3形式
- **SE**: MP3形式

## 注意事項

アセットファイルは著作権により保護されている場合があります。使用する際は適切なライセンスを確認してください。
