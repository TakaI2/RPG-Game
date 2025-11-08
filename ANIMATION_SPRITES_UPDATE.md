# Animation & Sprite Update Guide (64×64, Phaser + Tiled)

## 概要
本アップデートでは、**64×64 px** 基準で以下を追加しました。
- プレイヤー＆敵の**スプライトシート**（4方向×各4コマの歩行 & 攻撃）
- **64×64 タイルセット**（Tiled対応）
- Phaser での **アニメ定義テンプレ** と **Tiled マップ読込**の手順

---

## 追加アセット
```
src/assets/images/
  tileset_64.png     # 64×64 タイルセット（8×8タイル＝512×512）
  player_hero.png    # プレイヤー 8行×4列（32フレーム）
  enemy_blob.png     # 敵 8行×4列（32フレーム）
src/assets/maps/
  dungeon01.json     # Tiled JSON（例）
```

### スプライトシートのレイアウト（共通：横4×縦8）
| Row | 種別          | 方向     | 備考                    |
|-----|---------------|----------|-------------------------|
| 0   | walk          | down     | フレーム 0..3           |
| 1   | walk          | left     | フレーム 4..7           |
| 2   | walk          | right    | フレーム 8..11          |
| 3   | walk          | up       | フレーム 12..15         |
| 4   | attack        | down     | フレーム 16..19         |
| 5   | attack        | left     | フレーム 20..23         |
| 6   | attack        | right    | フレーム 24..27         |
| 7   | attack        | up       | フレーム 28..31         |

> インデックスは `row * 4 + col`（col: 0..3）。例：`walk_right` の2コマ目は `2*4 + 1 = 9`。

---

## Phaser: 読み込み & アニメ定義

### preload（読み込み）
```ts
// tiles & map
this.load.image('tiles-64', 'src/assets/images/tileset_64.png');
this.load.tilemapTiledJSON('dungeon01', 'src/assets/maps/dungeon01.json');

// sprites (64×64)
this.load.spritesheet('hero', 'src/assets/images/player_hero.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('blob', 'src/assets/images/enemy_blob.png', { frameWidth: 64, frameHeight: 64 });
```

### create（アニメ定義）
```ts
const row = (r: number, frames = 4) => Array.from({length: frames}, (_, i) => r*4 + i);

// Player (hero)
this.anims.create({ key: 'hero-walk-down',  frames: row(0).map(f=>({ key:'hero', frame:f })), frameRate: 10, repeat: -1 });
this.anims.create({ key: 'hero-walk-left',  frames: row(1).map(f=>({ key:'hero', frame:f })), frameRate: 10, repeat: -1 });
this.anims.create({ key: 'hero-walk-right', frames: row(2).map(f=>({ key:'hero', frame:f })), frameRate: 10, repeat: -1 });
this.anims.create({ key: 'hero-walk-up',    frames: row(3).map(f=>({ key:'hero', frame:f })), frameRate: 10, repeat: -1 });

this.anims.create({ key: 'hero-atk-down',   frames: row(4).map(f=>({ key:'hero', frame:f })), frameRate: 14, repeat: 0 });
this.anims.create({ key: 'hero-atk-left',   frames: row(5).map(f=>({ key:'hero', frame:f })), frameRate: 14, repeat: 0 });
this.anims.create({ key: 'hero-atk-right',  frames: row(6).map(f=>({ key:'hero', frame:f })), frameRate: 14, repeat: 0 });
this.anims.create({ key: 'hero-atk-up',     frames: row(7).map(f=>({ key:'hero', frame:f })), frameRate: 14, repeat: 0 });

// Enemy (blob)
this.anims.create({ key: 'blob-walk-down',  frames: row(0).map(f=>({ key:'blob', frame:f })), frameRate: 8, repeat: -1 });
this.anims.create({ key: 'blob-walk-left',  frames: row(1).map(f=>({ key:'blob', frame:f })), frameRate: 8, repeat: -1 });
this.anims.create({ key: 'blob-walk-right', frames: row(2).map(f=>({ key:'blob', frame:f })), frameRate: 8, repeat: -1 });
this.anims.create({ key: 'blob-walk-up',    frames: row(3).map(f=>({ key:'blob', frame:f })), frameRate: 8, repeat: -1 });

this.anims.create({ key: 'blob-atk-down',   frames: row(4).map(f=>({ key:'blob', frame:f })), frameRate: 10, repeat: 0 });
this.anims.create({ key: 'blob-atk-left',   frames: row(5).map(f=>({ key:'blob', frame:f })), frameRate: 10, repeat: 0 });
this.anims.create({ key: 'blob-atk-right',  frames: row(6).map(f=>({ key:'blob', frame:f })), frameRate: 10, repeat: 0 });
this.anims.create({ key: 'blob-atk-up',     frames: row(7).map(f=>({ key:'blob', frame:f })), frameRate: 10, repeat: 0 });
```

### 再生例
```ts
// 移動中
hero.play('hero-walk-right', true);

// 攻撃（終了後に待機へ）
hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
  hero.play('hero-walk-down');
});
hero.play('hero-atk-down');
```

---

## 攻撃判定とアニメ同期（推奨）
**当たり判定発生フレーム**のみヒットボックスを有効化します。体感が大幅に向上します。

```ts
hero.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
  if (anim.key.startsWith('hero-atk-')) {
    const f = frame.index % 4; // 0..3
    const active = (f === 1 || f === 2); // 真ん中の2フレームのみ有効など
    hitbox.body.enable = active;
  }
});
```

---

## Tiled: 64×64 マップ対応
1. **Map**: Orthogonal / 64×64 タイル / 例: 100×100 タイル  
2. **Tileset**: `tileset_64.png`（Tile 64/64、Margin 0、Spacing 0）  
   - 衝突させたいタイルに `collide=true`（bool）
3. **Layers（例）**: `ground`, `walls`, `decor`, `objects`  
   - `objects` に `player_spawn`, `npc_spawn`, `enemy_spawn`（Point）を配置
4. **Export**: `src/assets/maps/dungeon01.json`

### Phaserでの読み込みと衝突設定
```ts
const map = this.make.tilemap({ key: 'dungeon01' });
const tiles = map.addTilesetImage('tileset_64', 'tiles-64'); // Tiledのタイルセット名に一致
const ground = map.createLayer('ground', tiles, 0, 0);
const walls  = map.createLayer('walls',  tiles, 0, 0);
walls.setCollisionByProperty({ collide: true });

this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
this.physics.add.collider(hero, walls);
```

### スポーンの読み込み
```ts
const objs = map.getObjectLayer('objects');
const spawnOf = (name: string) => objs.objects.filter(o => o.name === name);

const p = spawnOf('player_spawn')[0];
const eSpawns = spawnOf('enemy_spawn');
const center = (x:number,y:number) => ({ x:x+32, y:y+32 }); // 64px の中心寄せ

const heroPos = p ? center(p.x!, p.y!) : { x: 96, y: 96 };
hero.setPosition(heroPos.x, heroPos.y);

eSpawns.forEach(s => {
  const pos = center(s.x!, s.y!);
  const en = this.physics.add.sprite(pos.x, pos.y, 'blob');
  this.physics.add.collider(en, walls);
  // AIリストに追加
});
```

---

## トラブルシュート
- **タイルセット名不一致**: `addTilesetImage('Tiledの名前', 'Phaserのキー')` の第1引数がTiled側と一致しているか確認。  
- **衝突しない**: `setCollisionByProperty({ collide: true })` を使う場合、タイル画像にプロパティを付けたか確認。  
- **座標がずれる**: オブジェクトレイヤのPointは左上基準。中心合わせなら `+32`。

---

## 次の拡張候補
- 歩行4方向の**アニメ補間**（アイドル/ダッシュ追加）
- 斜め方向アニメ（行追加 or ミラー利用）
- **コンボ/溜め/弾き**など攻撃バリエーションの行追加
- Aseprite/TexturePackerで**アトラス化**して管理しやすくする
