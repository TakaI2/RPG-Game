// Enemy Editor - Vanilla JS
// LocalStorage key
const STORAGE_KEY = 'rpg-enemy-defs'

// アニメ定義: アニメ名 → { row, colStart, colEnd }
// スプライトシート: 1024×256, 64×64フレーム, 16列×4行
// row0=up, row1=left, row2=down, row3=right
const ANIM_DEFS = {
  idle: { row: 2, colStart: 0, colEnd: 3 },
  walk: { row: 2, colStart: 4, colEnd: 7 },
  atk:  { row: 2, colStart: 8, colEnd: 11 },
}

const SHEET_COLS = 16
const FRAME_SIZE = 64
const STATES_ARCHER = ['patrol', 'aim', 'shoot', 'cooldown', 'return']
const STATES_MAGE   = ['patrol', 'aim', 'cast', 'shoot', 'cooldown', 'return']
const STATES_BRUTE  = ['patrol', 'windup', 'dash', 'recover', 'return']
const STATES_BLOB   = ['patrol', 'chase', 'attack', 'return']

/** -------------------------------------------------- *
 *  State
 * -------------------------------------------------- */
let defs = []
let selectedId = null
let currentAnimType = 'idle'
let animInterval = null
let animFrame = 0
let spriteImage = null

/** -------------------------------------------------- *
 *  Init
 * -------------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  loadFromStorage()
  renderCharList()
  bindEvents()
})

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    defs = raw ? JSON.parse(raw) : []
  } catch {
    defs = []
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defs))
  setStatus('LocalStorageに保存しました')
}

function setStatus(msg) {
  document.getElementById('statusText').textContent = msg
}

/** -------------------------------------------------- *
 *  Event Bindings
 * -------------------------------------------------- */
function bindEvents() {
  document.getElementById('btnNew').addEventListener('click', createNew)
  document.getElementById('btnSave').addEventListener('click', () => {
    collectCurrentDef()
    saveToStorage()
  })
  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('fileInput').click()
  })
  document.getElementById('fileInput').addEventListener('change', onImport)
  document.getElementById('btnExport').addEventListener('click', onExport)

  // アニメ切替ボタン
  document.querySelectorAll('.anim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.anim-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentAnimType = btn.dataset.anim
      animFrame = 0
      startAnim()
    })
  })

  // リアルタイムプレビュー更新
  document.getElementById('fieldSpriteKey').addEventListener('input', () => {
    loadSprite(document.getElementById('fieldSpriteKey').value.trim())
  })
}

/** -------------------------------------------------- *
 *  CRUD
 * -------------------------------------------------- */
function createNew() {
  const newDef = {
    id: `enemy_${Date.now()}`,
    name: '新しい敵',
    enemyType: 'archer',
    spriteKey: 'vamp1',
    animPrefix: 'archer',
    stats: {
      hp: 25, speed: 160, sight: 360,
      cooldownTime: 2000, aimDuration: 600,
      castDuration: 400, dashSpeed: 480,
    },
    dialogs: {},
  }
  defs.push(newDef)
  renderCharList()
  selectDef(newDef.id)
}

function selectDef(id) {
  collectCurrentDef()
  selectedId = id
  renderCharList()
  const def = defs.find(d => d.id === id)
  if (!def) return
  showEditor(def)
}

function deleteDef(id, event) {
  event.stopPropagation()
  if (!confirm(`「${defs.find(d => d.id === id)?.name ?? id}」を削除しますか？`)) return
  defs = defs.filter(d => d.id !== id)
  if (selectedId === id) {
    selectedId = null
    hideEditor()
  }
  renderCharList()
  setStatus('削除しました')
}

/** -------------------------------------------------- *
 *  Render Char List
 * -------------------------------------------------- */
function renderCharList() {
  const list = document.getElementById('charList')
  list.innerHTML = ''

  defs.forEach(def => {
    const item = document.createElement('div')
    item.className = 'char-item' + (def.id === selectedId ? ' selected' : '')
    item.addEventListener('click', () => selectDef(def.id))

    const icon = document.createElement('div')
    icon.className = 'char-icon'
    const miniCanvas = document.createElement('canvas')
    miniCanvas.width = 32
    miniCanvas.height = 32
    icon.appendChild(miniCanvas)
    item.appendChild(icon)
    drawMiniSprite(miniCanvas, def.spriteKey)

    const name = document.createElement('span')
    name.className = 'char-name'
    name.textContent = def.name || def.id

    const type = document.createElement('span')
    type.className = 'char-type'
    type.textContent = def.enemyType

    const btnDel = document.createElement('button')
    btnDel.className = 'btn-delete'
    btnDel.textContent = '✕'
    btnDel.title = '削除'
    btnDel.addEventListener('click', e => deleteDef(def.id, e))

    item.appendChild(name)
    item.appendChild(type)
    item.appendChild(btnDel)
    list.appendChild(item)
  })
}

/** -------------------------------------------------- *
 *  Show / Hide Editor
 * -------------------------------------------------- */
function showEditor(def) {
  document.getElementById('emptyState').style.display = 'none'
  const content = document.getElementById('editorContent')
  content.style.display = 'flex'

  document.getElementById('fieldId').value = def.id
  document.getElementById('fieldName').value = def.name || ''
  document.getElementById('fieldEnemyType').value = def.enemyType || 'archer'
  document.getElementById('fieldSpriteKey').value = def.spriteKey || ''
  document.getElementById('fieldAnimPrefix').value = def.animPrefix || ''

  const s = def.stats || {}
  document.getElementById('statHp').value = s.hp ?? 25
  document.getElementById('statSpeed').value = s.speed ?? 160
  document.getElementById('statSight').value = s.sight ?? 360
  document.getElementById('statCooldownTime').value = s.cooldownTime ?? 2000
  document.getElementById('statAimDuration').value = s.aimDuration ?? 600
  document.getElementById('statCastDuration').value = s.castDuration ?? 400
  document.getElementById('statDashSpeed').value = s.dashSpeed ?? 480
  document.getElementById('statHitSound').value = def.hitSound || ''
  document.getElementById('statAttackSound').value = def.attackSound || ''

  renderDialogStates(def)
  loadSprite(def.spriteKey)

  // enemyType切替でダイアログ再描画
  document.getElementById('fieldEnemyType').onchange = () => {
    const tempDef = collectCurrentDefDry()
    renderDialogStates(tempDef)
  }
}

function hideEditor() {
  document.getElementById('emptyState').style.display = 'flex'
  document.getElementById('editorContent').style.display = 'none'
  stopAnim()
}

/** -------------------------------------------------- *
 *  Collect current form values → defs[]
 * -------------------------------------------------- */
function collectCurrentDef() {
  if (!selectedId) return
  const idx = defs.findIndex(d => d.id === selectedId)
  if (idx < 0) return
  defs[idx] = collectCurrentDefDry()
  renderCharList()
}

function collectCurrentDefDry() {
  const id = document.getElementById('fieldId').value.trim()
  const def = {
    id: id || selectedId,
    name: document.getElementById('fieldName').value.trim(),
    enemyType: document.getElementById('fieldEnemyType').value,
    spriteKey: document.getElementById('fieldSpriteKey').value.trim(),
    animPrefix: document.getElementById('fieldAnimPrefix').value.trim(),
    stats: {
      hp:           parseInt(document.getElementById('statHp').value) || 25,
      speed:        parseInt(document.getElementById('statSpeed').value) || 160,
      sight:        parseInt(document.getElementById('statSight').value) || 360,
      cooldownTime: parseInt(document.getElementById('statCooldownTime').value) || 2000,
      aimDuration:  parseInt(document.getElementById('statAimDuration').value) || 600,
      castDuration: parseInt(document.getElementById('statCastDuration').value) || 400,
      dashSpeed:    parseInt(document.getElementById('statDashSpeed').value) || 480,
    },
    dialogs: collectDialogs(),
  }
  const hitSound = document.getElementById('statHitSound').value.trim()
  const attackSound = document.getElementById('statAttackSound').value.trim()
  if (hitSound)    def.hitSound    = hitSound
  if (attackSound) def.attackSound = attackSound
  if (id && id !== selectedId) {
    selectedId = id
  }
  return def
}

function collectDialogs() {
  const result = {}
  document.querySelectorAll('.dialog-state-item').forEach(item => {
    const state = item.dataset.state
    const intervalInput = item.querySelector('.interval-input')
    const lineInputs = item.querySelectorAll('.line-input')
    const lines = Array.from(lineInputs).map(inp => inp.value.trim()).filter(l => l.length > 0)
    if (lines.length === 0) return
    const entry = { lines }
    const intervalMs = parseInt(intervalInput.value)
    if (!isNaN(intervalMs) && intervalMs > 0) entry.intervalMs = intervalMs
    result[state] = entry
  })
  return result
}

/** -------------------------------------------------- *
 *  Dialog States UI
 * -------------------------------------------------- */
function getStatesForType(type) {
  switch (type) {
    case 'mage':  return STATES_MAGE
    case 'brute': return STATES_BRUTE
    case 'blob':  return STATES_BLOB
    default:      return STATES_ARCHER
  }
}

function renderDialogStates(def) {
  const container = document.getElementById('dialogStates')
  container.innerHTML = ''

  const type = def.enemyType || 'archer'
  const states = getStatesForType(type)
  const dialogs = def.dialogs || {}

  states.forEach(state => {
    const entry = dialogs[state] || { lines: [] }
    const item = document.createElement('div')
    item.className = 'dialog-state-item'
    item.dataset.state = state

    // Header
    const header = document.createElement('div')
    header.className = 'dialog-state-header'

    const stateLabel = document.createElement('span')
    stateLabel.className = 'state-name'
    stateLabel.textContent = state
    header.appendChild(stateLabel)

    const intervalWrap = document.createElement('div')
    intervalWrap.className = 'interval-wrap'

    const intervalLabel = document.createElement('label')
    intervalLabel.textContent = 'intervalMs:'
    intervalWrap.appendChild(intervalLabel)

    const intervalInput = document.createElement('input')
    intervalInput.type = 'number'
    intervalInput.className = 'interval-input'
    intervalInput.placeholder = '省略=変化時1回'
    intervalInput.min = '0'
    if (entry.intervalMs) intervalInput.value = entry.intervalMs
    intervalWrap.appendChild(intervalInput)

    header.appendChild(intervalWrap)
    item.appendChild(header)

    // Lines
    const linesDiv = document.createElement('div')
    linesDiv.className = 'dialog-lines'

    const addLine = (text = '') => {
      const row = document.createElement('div')
      row.className = 'dialog-line-row'

      const inp = document.createElement('input')
      inp.type = 'text'
      inp.className = 'line-input'
      inp.placeholder = 'セリフを入力...'
      inp.value = text
      row.appendChild(inp)

      const delBtn = document.createElement('button')
      delBtn.className = 'btn-del-line'
      delBtn.textContent = '✕'
      delBtn.addEventListener('click', () => row.remove())
      row.appendChild(delBtn)

      linesDiv.insertBefore(row, addLineBtn)
    }

    const addLineBtn = document.createElement('button')
    addLineBtn.className = 'btn-add-line'
    addLineBtn.textContent = '+ 行追加'
    addLineBtn.addEventListener('click', () => addLine())
    linesDiv.appendChild(addLineBtn)

    ;(entry.lines || []).forEach(line => addLine(line))

    item.appendChild(linesDiv)
    container.appendChild(item)
  })
}

/** -------------------------------------------------- *
 *  Sprite Preview
 * -------------------------------------------------- */
function loadSprite(spriteKey) {
  if (!spriteKey) {
    clearCanvas()
    return
  }

  const img = new Image()
  img.src = `../../public/assets/images/${spriteKey}.png`
  img.onload = () => {
    spriteImage = img
    animFrame = 0
    startAnim()
    setStatus(`スプライト読み込み完了: ${spriteKey}.png`)
  }
  img.onerror = () => {
    spriteImage = null
    clearCanvas()
    setStatus(`スプライトが見つかりません: ${spriteKey}.png`)
  }
}

function clearCanvas() {
  const canvas = document.getElementById('spriteCanvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#11111b'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function startAnim() {
  stopAnim()
  if (!spriteImage) {
    clearCanvas()
    return
  }
  const animDef = ANIM_DEFS[currentAnimType] || ANIM_DEFS.idle
  const totalFrames = animDef.colEnd - animDef.colStart + 1
  animFrame = 0

  animInterval = setInterval(() => {
    drawFrame(animDef, animFrame)
    animFrame = (animFrame + 1) % totalFrames
  }, 1000 / 8) // 8fps
}

function stopAnim() {
  if (animInterval) {
    clearInterval(animInterval)
    animInterval = null
  }
}

function drawFrame(animDef, frame) {
  const canvas = document.getElementById('spriteCanvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#11111b'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (!spriteImage) return

  const col = animDef.colStart + frame
  const frameIndex = animDef.row * SHEET_COLS + col
  const srcX = (frameIndex % SHEET_COLS) * FRAME_SIZE
  const srcY = Math.floor(frameIndex / SHEET_COLS) * FRAME_SIZE

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    spriteImage,
    srcX, srcY, FRAME_SIZE, FRAME_SIZE,
    0, 0, canvas.width, canvas.height
  )
}

function drawMiniSprite(canvas, spriteKey) {
  if (!spriteKey) return
  const img = new Image()
  img.src = `../../public/assets/images/${spriteKey}.png`
  img.onload = () => {
    const frameIndex = 2 * SHEET_COLS + 0
    const srcX = (frameIndex % SHEET_COLS) * FRAME_SIZE
    const srcY = Math.floor(frameIndex / SHEET_COLS) * FRAME_SIZE
    const c = canvas.getContext('2d')
    c.clearRect(0, 0, canvas.width, canvas.height)
    c.imageSmoothingEnabled = false
    c.drawImage(img, srcX, srcY, FRAME_SIZE, FRAME_SIZE, 0, 0, canvas.width, canvas.height)
  }
}

/** -------------------------------------------------- *
 *  Import / Export
 * -------------------------------------------------- */
function onImport(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result)
      if (!Array.isArray(imported)) throw new Error('配列形式ではありません')
      defs = imported
      selectedId = null
      hideEditor()
      renderCharList()
      setStatus(`インポート完了: ${defs.length}件`)
    } catch (err) {
      alert('インポートエラー: ' + err.message)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

function onExport() {
  collectCurrentDef()
  const json = JSON.stringify(defs, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'enemy-defs.json'
  a.click()
  URL.revokeObjectURL(url)
  setStatus('エクスポートしました（public/assets/enemies/ に配置してください）')
}
