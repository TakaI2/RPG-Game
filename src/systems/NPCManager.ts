import Phaser from 'phaser'
import { TILE } from '../config'
import { EnemySpeech } from './EnemySpeech'
import type DialogUI from './Dialog'
import type { DialogData } from './Dialog'
import type { NPCDef, NPCSpawn } from '../types/NPCTypes'

interface NPCInstance {
  sprite: Phaser.Physics.Arcade.Sprite
  def: NPCDef
  speech: EnemySpeech
  patrolStartX: number
  patrolDir: number
}

export type NPCManagerHandle = {
  loadFromSpawns: (spawns: NPCSpawn[], defs: NPCDef[]) => void
  update: () => void
  tryInteract: (player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, maxDistance?: number) => boolean
  setupCollisions: (player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) => Phaser.Physics.Arcade.Collider[]
  destroy: () => void
}

export function createNPCManager(scene: Phaser.Scene, ui: DialogUI): NPCManagerHandle {
  const instances: NPCInstance[] = []

  function destroyAll(): void {
    instances.forEach(inst => {
      inst.speech.destroy()
      if (inst.sprite.active) inst.sprite.destroy()
    })
    instances.length = 0
  }

  function loadFromSpawns(spawns: NPCSpawn[], defs: NPCDef[]): void {
    destroyAll()
    const defMap = new Map(defs.map(d => [d.id, d]))

    spawns.forEach(spawn => {
      const def = defMap.get(spawn.npcDefId)
      if (!def) {
        console.warn(`[NPCManager] NPC def not found: ${spawn.npcDefId}`)
        return
      }

      const x = spawn.x * TILE + TILE / 2
      const y = spawn.y * TILE + TILE / 2

      const sprite = scene.physics.add.sprite(x, y, def.spriteKey)
      sprite.setImmovable(true)
      ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false

      if (def.animated) {
        const animKey = `npc_anim_${def.id}`
        if (!scene.anims.exists(animKey)) {
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(def.spriteKey, {
              start: 0,
              end: (def.frameCount ?? 4) - 1,
            }),
            frameRate: def.frameRate ?? 6,
            repeat: -1,
          })
        }
        sprite.play(animKey)
      }

      const speech = new EnemySpeech(scene)
      if (def.speechLines && def.speechLines.length > 0) {
        speech.startLoop(
          sprite as unknown as Phaser.GameObjects.Sprite,
          def.speechLines,
          2000,
          def.speechIntervalMs ?? 5000
        )
      }

      instances.push({
        sprite,
        def,
        speech,
        patrolStartX: x,
        patrolDir: 1,
      })
    })
  }

  function update(): void {
    instances.forEach(inst => {
      if (!inst.sprite.active) return

      if (inst.def.movement === 'patrol') {
        const speed = inst.def.patrolSpeed ?? 60
        const rangePx = (inst.def.patrolRange ?? 3) * TILE
        const dist = inst.sprite.x - inst.patrolStartX

        if (dist >= rangePx) inst.patrolDir = -1
        else if (dist <= -rangePx) inst.patrolDir = 1

        inst.sprite.setVelocityX(speed * inst.patrolDir)
        inst.sprite.setFlipX(inst.patrolDir < 0)
      } else {
        inst.sprite.setVelocity(0, 0)
      }

      inst.speech.update(inst.sprite as unknown as Phaser.GameObjects.Sprite)
    })
  }

  function tryInteract(
    player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    maxDistance = 80
  ): boolean {
    for (const inst of instances) {
      const dist = Phaser.Math.Distance.Between(
        player.x, player.y, inst.sprite.x, inst.sprite.y
      )
      if (dist < maxDistance) {
        const lines = inst.def.dialogLines
        if (lines && lines.length > 0) {
          const data: DialogData = { lines }
          ui.show(inst.def.name, data)
          return true
        }
      }
    }
    return false
  }

  function setupCollisions(
    player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  ): Phaser.Physics.Arcade.Collider[] {
    return instances.map(inst => scene.physics.add.collider(player, inst.sprite))
  }

  return { loadFromSpawns, update, tryInteract, setupCollisions, destroy: destroyAll }
}
