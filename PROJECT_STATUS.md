# RPGGame プロジェクト進捗状況

**更新日時**: 2026-02-22（本日更新）
**現在のフェーズ**: ゲームフロー一元管理・バグ修正完了 → 新キャラアセット統合・改修実装フェーズ
**現在のブランチ**: `feature/title-screen-and-pause-menu`

---

## 📈 進捗状況

- ✅ 完了済み機能: 8個
- 🚧 調査中の問題: 0個（全解決）
- ⏳ 未統合アセット: 6ファイル（新キャラクタースプライトなど）

**全体進捗: 約90%**

---

## ✅ 完了済み機能

| # | 機能 | 状態 |
|---|------|------|
| 1 | タイトル画面実装 | ✅ 完了 |
| 2 | ポーズメニュー実装 | ✅ 完了 |
| 3 | BGM管理システム | ✅ 完了 |
| 4 | タッチ操作対応（仮想ジョイスティック・攻撃ボタン） | ✅ 完了 |
| 5 | ボスバトルシステム | ✅ 完了 |
| 6 | ストーリーシステム | ✅ 完了 |
| 7 | ゲーム状態管理システム | ✅ 完了 |
| 8 | ゲームフロー一元管理システム（gameflow.json） | ✅ 完了 |

---

## 🔧 解決済み問題

| 問題 | 解決策 | 解決日 |
|------|--------|--------|
| 古いコンパイル済みJSファイル問題 | `find src -name '*.js' -delete` で全削除 | 2025-11-16 |
| ストーリー終了後のシーン遷移 | returnToを'title'に変更 | 2025-11-16 |
| ポーズメニューの位置ずれ | setScrollFactor(0)を追加 | 2025-11-16 |
| ポーズメニューのボタン当たり判定ずれ | show()時にカメラ位置基準で動的配置 | 2025-11-16 |
| dying状態でのdead遷移バグ | 修正済み | 最新コミット |
| BGMマップ再生なし | BGMManager の `story-end`→`story:end` イベント名統一 | 2026-02-22 |
| 2回目プレイ時マップ非表示 | `walls` を optional 型に変更、`create()` でリセット | 2026-02-22 |

---

## 🚨 現在の問題

現在、未解決の問題はありません。

---

## 📦 未統合アセット（要対応）

| ファイル | 内容 |
|---------|------|
| `ArisaPlus.png` | 新キャラクタースプライト |
| `Belladonna.png` | 新キャラクタースプライト |
| `Girl_plus.png` | 新キャラクタースプライト |
| `vamp2.png` | 新キャラクタースプライト |
| `rayout.apd / rayout.png` | レイアウトファイル |
| `enemy改修案.txt` | エネミー改修仕様（未実装） |
| `player改修案2_15.txt` | プレイヤー改修仕様（未実装） |
| `player改修案2_18.txt` | プレイヤー改修仕様・追記版（未実装） |
| `story改修案2_18.txt` | ストーリー/エンディング改修仕様（未実装） |

---

## 📅 開発スケジュール

```mermaid
gantt
    title RPGGame 開発スケジュール
    dateFormat YYYY-MM-DD
    section Phase 1 基盤構築
    タイトル/ポーズメニュー/BGM    :done, phase1a, 2025-10-18, 2025-11-16
    ボスバトル/ストーリー           :done, phase1b, 2025-10-18, 2025-11-16
    section Phase 2 グラフィック刷新
    プレイヤーグラフィック刷新      :done, phase2a, 2025-11-17, 2026-02-01
    エネミーグラフィック刷新        :done, phase2b, 2025-11-17, 2026-02-01
    ストーリーエディタ開発          :done, phase2c, 2025-11-17, 2026-02-01
    section Phase 3 バグ修正・仕上げ
    タイトル画面表示バグ修正        :done, phase3a, 2026-02-18, 2026-02-18
    ゲームフロー一元管理実装        :done, phase3b, 2026-02-20, 2026-02-22
    BGM/再起動バグ修正             :done, phase3c, 2026-02-22, 2026-02-22
    ストーリー/エンディング改修     :active, phase3d, 2026-02-22, 2026-02-28
    新キャラアセット統合            :phase3c, 2026-02-20, 2026-03-05
    プレイヤー/エネミー改修         :phase3d, 2026-03-01, 2026-03-10
    section Phase 4 完成
    最終テスト・リリース            :phase4, 2026-03-10, 2026-03-15
```

---

## 🎯 次にやるべきタスク（優先度順）

1. **[高] ストーリー/エンディング改修** - `story改修案2_18.txt` の仕様（マップ別BAD END/GOOD END）を実装
2. **[高] 新キャラアセットの統合** - ArisaPlus/Belladonna/Girl_plus/vamp2 をゲームに組み込む
3. **[中] player/enemy改修案の実装** - `player改修案2_15.txt` / `player改修案2_18.txt` / `enemy改修案.txt` の内容を確認・実装
4. **[低] feature/title-screen-and-pause-menu をmainにマージ** - 現ブランチの安定化後

---

## 📝 最近のコミット履歴

| コミット | 説明 |
|---------|------|
| (2026-02-22) | Fix: BGMマップ再生バグ・2回目プレイ時マップ非表示バグ修正 |
| (2026-02-22) | Feat: ゲームフロー一元管理システム実装（gameflow.json） |
| (2026-02-18) | Fix: タイトル画面の表示バグ修正（MainScene paused状態がTitleSceneを隠す問題） |
| 3ba6bfc | Fix: dying状態でのdead遷移バグ修正とエネミーHP値の引き上げ |
| 2c36c16 | Revamp enemy graphics: new sprites with chroma key, idle/dying/dead animations |
| 132eb26 | Revamp player graphics: hero.png with chroma key and new animations |
| fb7cd82 | Fix story editor preview to match game coordinates |
| 79234f5 | Replace UI buttons with custom image assets |
