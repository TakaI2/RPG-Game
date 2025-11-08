# 敵キャラ追加・飛び道具仕様（Archer・Mage・Brute / Arrow・Homing Orb）

対象プロジェクト: Top‑Down Adventure (Phaser + Vite + TS)

---

## 1. 追加アセット（配置）
```
src/assets/images/
  enemy_archer.png   # 64×64, 8行×4列（歩行4×攻撃4）
  enemy_brute.png    # 同上
  enemy_mage.png     # 同上
  arrow.png          # 矢（単発画像 64×64）
  magic_orb.png      # 魔法弾（単発画像 64×64, 透過グロー）

src/assets/audio/     # ← 任意で用意（差し替えやすい構成）
  sfx_arrow.ogg
  sfx_orb.ogg
```

- **スプライトの行割り当て**（共通）：
  - row0..3 = walk（down/left/right/up）
  - row4..7 = attack（down/left/right/up）
  - フレームは列4コマ。`index = row*4 + col`

---

## 2. 読み込みとアニメ定義（Phaser）

```ts
// preload
this.load.spritesheet('archer', 'src/assets/images/enemy_archer.png', { frameWidth:64, frameHeight:64 });
this.load.spritesheet('brute',  'src/assets/images/enemy_brute.png',  { frameWidth:64, frameHeight:64 });
this.load.spritesheet('mage',   'src/assets/images/enemy_mage.png',   { frameWidth:64, frameHeight:64 });

this.load.image('arrow', 'src/assets/images/arrow.png');
this.load.image('orb',   'src/assets/images/magic_orb.png');

// （任意）音：あとから差し替え簡単にするためキーを固定
this.load.audio('sfx_arrow', 'src/assets/audio/sfx_arrow.ogg');
this.load.audio('sfx_orb',   'src/assets/audio/sfx_orb.ogg');
```

```ts
// create（共通アニメ生成）
const row = (r:number)=>Array.from({length:4},(_,i)=>r*4+i);
['archer','brute','mage'].forEach(key=>{
  ['down','left','right','up'].forEach((dir, i)=>{
    this.anims.create({ key:`${key}-walk-${dir}`, frames:row(i).map(f=>({key,frame:f})), frameRate:8, repeat:-1 });
    this.anims.create({ key:`${key}-atk-${dir}`,  frames:row(i+4).map(f=>({key,frame:f})), frameRate:12, repeat:0 });
  });
});
```

---

## 3. 敵タイプ別 概要

### 3.1 Archer（弓兵：遠距離）
- **状態**: `patrol → aim → shoot → cooldown → patrol`
- **射程/視界**: `sight`（例: 360px）でプレイヤー検出
- **行動**: 撃つ時は停止 → `arrow` をプレイヤー方向に直射
- **音**: `this.sound.play('sfx_arrow', { volume: 0.7 })`

**発射実装（例）**
```ts
function fireArrow(scene:Phaser.Scene, from:Phaser.GameObjects.Sprite, to:Phaser.GameObjects.Sprite, speed=420){
  const v = new Phaser.Math.Vector2(to.x-from.x, to.y-from.y).normalize().scale(speed);
  const proj = scene.physics.add.image(from.x, from.y, 'arrow');
  proj.setVelocity(v.x, v.y).setData('dmg', 1).setSize(32,16).setOffset(16,24);
  scene.time.delayedCall(2500, ()=>proj.destroy()); // 寿命
  scene.sound?.play('sfx_arrow', { volume: 0.7 });
  return proj;
}
```

### 3.2 Mage（メイジ：誘導魔法）
- **状態**: `patrol → aim → cast → shoot → cooldown`
- **行動**: **誘導弾**（`orb`）を発射。一定寿命で消滅。
- **パラメータ**:
  - `speed`: 初速（例: 220）
  - `turnRate`: 旋回速度（rad/s 相当、例: 6.0）
  - `life`: 弾寿命（ms、例: 3000）
- **音**: `this.sound.play('sfx_orb', { volume: 0.6 })`

**誘導弾 実装（例）**
```ts
type HomingOrb = Phaser.Physics.Arcade.Image & {
  target: Phaser.GameObjects.Sprite | null;
  speed: number;
  turnRate: number; // per second
  bornAt: number;
  life: number;
};

function fireHomingOrb(scene:Phaser.Scene, from:Phaser.GameObjects.Sprite, target:Phaser.GameObjects.Sprite, speed=220, turnRate=6.0, life=3000){
  const orb = scene.physics.add.image(from.x, from.y, 'orb') as HomingOrb;
  orb.target = target; orb.speed = speed; orb.turnRate = turnRate; orb.bornAt = scene.time.now; orb.life = life;

  const dir = new Phaser.Math.Vector2(target.x-from.x, target.y-from.y).normalize();
  orb.setVelocity(dir.x*speed, dir.y*speed);

  scene.sound?.play('sfx_orb', { volume: 0.6 });

  (scene as any).homingOrbs = (scene as any).homingOrbs ?? [];
  (scene as any).homingOrbs.push(orb);
  return orb;
}

function updateHomingOrbs(scene:Phaser.Scene){
  const list: HomingOrb[] = (scene as any).homingOrbs ?? [];
  const now = scene.time.now;
  list.forEach((orb, idx)=>{
    if (now - orb.bornAt > orb.life) { orb.destroy(); list[idx]=null as any; return; }
    if (!orb.active || !orb.target || !orb.target.active) return;

    const desired = new Phaser.Math.Vector2(orb.target.x - orb.x, orb.target.y - orb.y).normalize();
    const cur = new Phaser.Math.Vector2(orb.body.velocity.x, orb.body.velocity.y).normalize();
    const maxTurn = orb.turnRate * (scene.game.loop.delta / 1000);
    const angle = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.BetweenPoints({x:0,y:0}, desired) - Phaser.Math.Angle.BetweenPoints({x:0,y:0}, cur));
    const clamped = Phaser.Math.Clamp(angle, -maxTurn, maxTurn);
    const newDir = cur.clone().rotate(clamped).normalize();
    orb.setVelocity(newDir.x * orb.speed, newDir.y * orb.speed);
  });
  for (let i=list.length-1;i>=0;i--) if (!list[i] || !list[i].active) list.splice(i,1);
}
```

**シーン `update()` で呼ぶ**
```ts
update(){ updateHomingOrbs(this); }
```

### 3.3 Brute（近接突進）
- **状態**: `patrol → windup(溜め) → dash(突進) → recover(硬直)`

---

## 4. サウンド差し替え運用
- キー（`sfx_arrow`, `sfx_orb`）は固定。ファイル置換だけで差し替え可。
- 再生時に `volume|rate|detune` などを渡して微調整可能。

---

## 5. 衝突・寿命の基本
- `scene.time.delayedCall(ms, () => projectile.destroy())`
- `physics.add.collider(projectile, walls, () => projectile.destroy())`
- `physics.add.overlap(projectile, player, () => { player.hp--; projectile.destroy(); })`

---

## 6. Tiled配置
- `objects`レイヤに `archer_spawn` / `mage_spawn` / `brute_spawn` のPointを設置 → 生成時に読み込み。

map-editor.htmlにおいても、敵の種類に応じたチップを配置できるように改造。
