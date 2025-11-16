# 開発進捗ログ - 2025-11-16

## 実装完了事項

### ✅ タイトル画面・ポーズメニュー機能 (2025-11-16完了)
- タイトル画面（TitleScene）の実装
- ポーズメニュー（PauseMenu）の実装
- BGM管理システム（BGMManager）の実装
- ゲーム状態管理（GameStateManager）の実装
- バーチャルジョイスティックとタッチ操作対応
- Escキーでのポーズ機能
- マウス/タッチでの仮想ジョイスティック操作
- 攻撃ボタンのタッチ操作対応

### ✅ 修正済みの問題

1. **シーン遷移エラーの修正**
   - 問題: ストーリー終了後、存在しないシーンキー`game`に遷移しようとしていた
   - 原因: `intro.json`の`returnTo`が`"game"`になっていた
   - 解決: `intro.json`を修正して`"returnTo": "MainScene"`に変更
   - 修正ファイル: `public/assets/story/scripts/intro.json`

2. **BGMManagerのメソッド名不一致**
   - 問題: `BGMManager.ts`が`playBGM`/`stopBGM`を呼び出すが、`AudioBus.ts`では`playBgm`/`stopBgm`
   - 解決: `BGMManager.ts`のメソッド呼び出しを修正
   - 修正箇所:
     - 69行目: `this.audioBus.playBgm(bgmKey, { loop: true, fade: 1000 })`
     - 65行目、77行目、86行目: `this.audioBus.stopBgm({ fade: ... })`
   - 修正ファイル: `src/systems/BGMManager.ts`

## ✅ 解決済みの問題

### 3. **古いコンパイル済みJSファイルによるキャッシュ問題** (2025-11-16解決)
- **症状**: BGMManager.tsの修正が反映されず、依然として`playBGM is not a function`エラーが発生
- **影響**: MainSceneのcreate()メソッドが途中で停止し、以下の問題が発生：
  - 画面が真っ暗（マップが描画されない）
  - プレイヤーが表示されない
  - BGMが再生されない
  - DialogUIは動作する（エラーより前に初期化されているため）

- **原因**: `src/`フォルダに古いコンパイル済みJSファイル（.js、.js.map）が大量に存在し、Viteがそれらを優先的に読み込んでいた
  - これらのファイルは以前に`tsc`コマンドで直接コンパイルされたもの（2025-11-16 05:48生成）
  - Viteは通常TypeScriptを動的にトランスパイルするが、同じフォルダにJSファイルが存在すると優先される

- **試行した対策（効果なし）**:
  1. ブラウザのハードリフレッシュ（Ctrl+Shift+R）
  2. 開発サーバーの再起動（複数回）
  3. dist/とnode_modules/.viteフォルダの削除
  4. 新しいポートでのサーバー起動（5173→5174→5175→5176→5177）
  5. ブラウザキャッシュの手動クリア指示
  6. シークレットモード/プライベートブラウジングの提案
  7. PC再起動

- **解決策**:
  ```bash
  # src/フォルダ内の全コンパイル済みJSファイルを削除
  find src -name "*.js" -delete
  find src -name "*.js.map" -delete

  # サーバーを再起動
  npm run dev
  ```

- **教訓**: ソースコードが正しいのに変更が反映されない場合、古いコンパイル済みファイルが残っていないか確認する

### 4. **ストーリー終了後のシーン遷移問題** (2025-11-16解決)
- **症状**: ゲームクリア/ゲームオーバー後、ストーリーが再生されるがMainSceneに戻らない
- **原因**: `clear.json`と`gameover.json`の`returnTo`が`"game"`になっていた
- **解決策**: `returnTo`を`"title"`に変更（StoryScene.endStoryで`"title"`の場合はTitleSceneに遷移）
- **修正ファイル**:
  - `public/assets/story/scripts/clear.json`
  - `public/assets/story/scripts/gameover.json`

### 5. **ポーズメニューの位置問題** (2025-11-16解決)
- **症状**: ポーズメニューの位置がプレイヤーの位置によって変わる
- **原因**: PauseMenuのcontainerに`setScrollFactor(0)`が設定されていなかった
- **解決策**: `this.container.setScrollFactor(0)`を追加してカメラ追従を無効化
- **修正ファイル**: `src/ui/PauseMenu.ts`

### 6. **ポーズ中のタッチ操作問題** (2025-11-16解決)
- **症状**: ポーズメニュー実装後、タッチ操作が動作しなくなった
- **原因**: ポーズ中もVirtualJoystickとAttackButtonが表示されたまま
- **解決策**: MainScene.update()でポーズメニュー表示中はタッチUIを非表示に
- **修正ファイル**:
  - `src/scenes/MainScene.ts`
  - `src/ui/VirtualJoystick.ts` (setVisibleメソッド追加)

### 7. **ポーズメニューのボタン当たり判定問題** (2025-11-16解決)
- **症状**: ポーズ画面でボタンを押せない。表示位置と当たり判定がずれている
- **原因**: `scrollFactor(0)`を使用すると、Phaserのインタラクティブシステムで表示位置とヒットエリアがずれる既知の問題
- **解決策**:
  - `scrollFactor`の使用を完全に廃止
  - `show()`メソッドでカメラの位置を取得: `camera.scrollX, camera.scrollY`
  - containerをカメラ位置に動的に配置: `container.setPosition(camera.scrollX, camera.scrollY)`
  - これにより表示位置と当たり判定が完全に一致
- **修正ファイル**: `src/ui/PauseMenu.ts`

## 🔧 現在調査中の問題 (2025-11-16)

### 問題1: タイトル画面の表示問題
- **症状**: ゲームクリア/ゲームオーバー後、タイトル画面には遷移するが背景とボタンが表示されない
- **現象**:
  - TitleScene.create()は正常に呼ばれている（ログで確認）
  - ボタンがあるべき位置をクリックするとゲームが開始される（UIは存在する）
  - カメラの背景色を赤に設定しても表示されない
- **試した対策**:
  - StoryScene.endStory()のcleanup処理をshutdownイベントに委譲
  - TitleScene.create()をシンプル化し、シーンとカメラを明示的にアクティブ化
- **ステータス**: 継続調査中（次回セッションで対応予定）

## ファイル変更履歴

### 修正済みファイル (2025-11-16)
- `src/scenes/StoryScene.ts` - シーン遷移ロジック追加、cleanup処理をshutdownイベントに委譲
- `src/scenes/TitleScene.ts` - デバッグコード削除、シンプル化、シーン・カメラの明示的アクティブ化
- `public/assets/story/scripts/intro.json` - returnToを"game"から"MainScene"に変更
- `public/assets/story/scripts/clear.json` - returnToを"game"から"title"に変更
- `public/assets/story/scripts/gameover.json` - returnToを"game"から"title"に変更
- `src/systems/BGMManager.ts` - メソッド名をplayBgm/stopBgmに修正
- `src/ui/PauseMenu.ts` - scrollFactor廃止、カメラ位置に合わせた動的配置に変更
- `src/scenes/MainScene.ts` - ポーズ中のタッチUI非表示処理追加
- `src/ui/VirtualJoystick.ts` - setVisibleメソッド追加

### 新規作成ファイル (2025-11-16)
- `src/scenes/TitleScene.ts` - タイトル画面シーン
- `src/ui/PauseMenu.ts` - ポーズメニューUI
- `src/systems/BGMManager.ts` - BGM管理システム
- `src/systems/GameStateManager.ts` - ゲーム状態管理
- `src/ui/VirtualJoystick.ts` - 仮想ジョイスティック
- `src/ui/AttackButton.ts` - タッチ攻撃ボタン
- `PROGRESS_LOG.md` - このファイル
- `test_11_16.txt` - テスト結果記録

## システム設計メモ

- ストーリーのJSONはあくまで仮のもの
- **システム（コード）の設計を優先**
- JSONの文法はシステムに合わせて変更する

---

## トラブルシューティング知見

### 「コードは正しいのに変更が反映されない」場合のチェックリスト

このチェックリストは、ソースコードを修正したのに変更が反映されない問題に遭遇した際の診断手順です。

#### 1. ブラウザキャッシュの確認（最初に試す）
- [ ] ハードリフレッシュ（Ctrl+Shift+R / Cmd+Shift+R）
- [ ] 開発者ツールのNetworkタブで「Disable cache」を有効化
- [ ] シークレットモード/プライベートブラウジングで開く

#### 2. 開発サーバーの再起動
- [ ] サーバーを停止して再起動
- [ ] 別のポートで起動してみる

#### 3. ビルドキャッシュのクリア
- [ ] `node_modules/.vite`フォルダを削除
- [ ] `dist`フォルダを削除（存在する場合）

#### 4. **古いコンパイル済みファイルの確認（重要！）**
```bash
# src/フォルダ内にJSファイルが存在しないか確認
find src -name "*.js" -o -name "*.js.map"

# 存在する場合は削除
find src -name "*.js" -delete
find src -name "*.js.map" -delete
```

**理由**: Viteプロジェクトでは、TypeScriptファイルと同じフォルダにJSファイルが存在すると、Viteがそちらを優先的に読み込む場合があります。これは`tsc`コマンドを直接実行した際に生成されることがあります。

#### 5. TypeScript設定の確認
- [ ] `tsconfig.json`の`outDir`が正しく設定されているか
- [ ] `tsconfig.json`が`src`フォルダに出力していないか

#### 6. インポートパスの確認
- [ ] 相対パスが正しいか
- [ ] ファイル名の大文字小文字が一致しているか

#### 7. 最終手段
- [ ] PC/システム全体を再起動
- [ ] `node_modules`を削除して`npm install`を再実行

### エラーメッセージの読み方

- **ソースマップの行番号**: エラーメッセージに表示される`ファイル名.ts:行番号`は、ソースマップを通じてマッピングされた行番号です。実際に実行されているJavaScriptコードは、古いトランスパイル結果の可能性があります。

- **確認方法**: ブラウザの開発者ツールのSourcesタブで、実際にロードされているファイルの内容を直接確認することで、最新のコードが読み込まれているか検証できます。

### 予防策

- **Viteプロジェクトでは`tsc`を直接実行しない**: ビルドは`npm run build`（`tsc -b && vite build`）を使用し、`tsc`単独での実行は避ける
- **`.gitignore`の設定**: `src/**/*.js`と`src/**/*.js.map`を追加して、誤ってコミットしないようにする
