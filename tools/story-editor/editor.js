/**
 * Story Editor for RPG Game
 * ストーリースクリプトをビジュアルに編集するためのツール
 */

// アセットのベースパス（相対パス）
const ASSET_BASE = '../../public/assets/story';

// BGMファイル一覧（起動時に /api/list-assets から取得）
let bgmFiles = []

async function loadBgmFiles() {
  try {
    const res = await fetch('/api/list-assets?folder=assets/story/bgm')
    const json = await res.json()
    if (json.ok) {
      bgmFiles = json.files.filter(f => /\.(ogg|mp3|wav)$/i.test(f))
    }
  } catch (e) {}
}

// 立ち絵ファイル一覧（起動時に /api/list-assets から取得）
let portraitFiles = []

async function loadPortraitFiles() {
  try {
    const res = await fetch('/api/list-assets?folder=assets/story/portraits')
    const json = await res.json()
    if (json.ok) {
      portraitFiles = json.files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    }
  } catch (e) {}
}

// SEファイル一覧（起動時に /api/list-assets から取得）
let seFiles = []

async function loadSeFiles() {
  try {
    const res = await fetch('/api/list-assets?folder=assets/story/se')
    const json = await res.json()
    if (json.ok) {
      seFiles = json.files.filter(f => /\.(ogg|mp3|wav)$/i.test(f))
    }
  } catch (e) {}
}

// 背景ファイル一覧（起動時に /api/list-assets から取得）
let bgFiles = []

async function loadBgFiles() {
  try {
    const res = await fetch('/api/list-assets?folder=assets/story/bg')
    const json = await res.json()
    if (json.ok) {
      bgFiles = json.files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    }
  } catch (e) {}
}

let bgmPreviewAudio = null
function playBgmPreview(filename) {
  if (bgmPreviewAudio) { bgmPreviewAudio.pause(); bgmPreviewAudio = null }
  if (!filename) return
  bgmPreviewAudio = new Audio(`${ASSET_BASE}/bgm/${filename}`)
  bgmPreviewAudio.play().catch(() => {})
}
function stopBgmPreview() {
  if (bgmPreviewAudio) { bgmPreviewAudio.pause(); bgmPreviewAudio = null }
}

let sePreviewAudio = null
function playSePreview(filename) {
  if (sePreviewAudio) { sePreviewAudio.pause(); sePreviewAudio = null }
  if (!filename) return
  sePreviewAudio = new Audio(`${ASSET_BASE}/se/${filename}`)
  sePreviewAudio.play().catch(() => {})
}
function stopSePreview() {
  if (sePreviewAudio) { sePreviewAudio.pause(); sePreviewAudio = null }
}

// ゲーム画面サイズ（config.tsと同じ）
const GAME_W = 1920;
const GAME_H = 1080;

// エディタの状態
const state = {
  storyId: 'new_story',
  script: [],
  selectedIndex: -1,
  isPlaying: false,
  playInterval: null
};

// DOM要素
const elements = {
  timeline: null,
  previewBg: null,
  previewPortrait: null,
  previewName: null,
  previewText: null,
  previewIndex: null,
  propertiesContent: null,
  storyIdInput: null,
  modal: null,
  positionIndicator: null
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  loadBgmFiles()
  loadPortraitFiles()
  loadSeFiles()
  loadBgFiles()
  initElements();
  initEventListeners();
  initBgDrag();
  renderTimeline();
  updatePreview();
});

function initElements() {
  elements.timeline = document.getElementById('timeline');
  elements.previewBg = document.getElementById('preview-bg');
  elements.previewPortrait = document.getElementById('preview-portrait');
  elements.previewName = document.getElementById('preview-name');
  elements.previewText = document.getElementById('preview-text');
  elements.previewIndex = document.getElementById('preview-index');
  elements.propertiesContent = document.getElementById('properties-content');
  elements.storyIdInput = document.getElementById('story-id');
  elements.modal = document.getElementById('modal-add-command');
  elements.positionIndicator = document.getElementById('position-indicator');
}

function initEventListeners() {
  // ファイル操作
  document.getElementById('btn-new').addEventListener('click', newStory);
  document.getElementById('btn-import').addEventListener('click', () => {
    openFileBrowser('assets/story/scripts', loadStoryData);
  });
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('btn-save-to-game').addEventListener('click', () => {
    const data = { id: state.storyId, script: state.script };
    window.saveToGame(`assets/story/scripts/${state.storyId}.json`, data);
  });

  // コマンド追加
  document.getElementById('btn-add-command').addEventListener('click', showAddModal);
  document.getElementById('btn-cancel-add').addEventListener('click', hideAddModal);
  document.querySelectorAll('.cmd-btn').forEach(btn => {
    btn.addEventListener('click', () => addCommand(btn.dataset.cmd));
  });

  // プレビュー操作
  document.getElementById('btn-prev').addEventListener('click', prevPreview);
  document.getElementById('btn-next').addEventListener('click', nextPreview);
  document.getElementById('btn-play').addEventListener('click', togglePlay);

  // ストーリーID
  elements.storyIdInput.addEventListener('input', (e) => {
    state.storyId = e.target.value;
  });

  // 立ち絵のドラッグ
  initPortraitDrag();

  // モーダル外クリックで閉じる
  elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) hideAddModal();
  });

  // プレビューオプション
  document.getElementById('toggle-safe-area').addEventListener('change', (e) => {
    const guide = document.getElementById('safe-area-guide');
    guide.classList.toggle('hidden', !e.target.checked);
  });

  document.getElementById('toggle-grid').addEventListener('change', (e) => {
    const container = document.getElementById('preview-container');
    container.classList.toggle('show-grid', e.target.checked);
  });

  // キーボードショートカット
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      exportJSON();
    }
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      openFileBrowser('assets/story/scripts', loadStoryData);
    }
    if (e.key === 'ArrowUp' && state.selectedIndex > 0) {
      selectCommand(state.selectedIndex - 1);
    }
    if (e.key === 'ArrowDown' && state.selectedIndex < state.script.length - 1) {
      selectCommand(state.selectedIndex + 1);
    }
    if (e.key === 'Delete' && state.selectedIndex >= 0) {
      deleteCommand(state.selectedIndex);
    }
  });

  // ウィンドウリサイズ時にプレビューを再描画
  window.addEventListener('resize', () => {
    updatePreview();
  });
}

// 立ち絵のドラッグ処理
function initPortraitDrag() {
  const portrait = elements.previewPortrait;
  const container = document.getElementById('preview-container');
  let isDragging = false;
  let startMouseX, startMouseY, startGameX, startGameY;

  portrait.addEventListener('mousedown', (e) => {
    if (state.selectedIndex < 0) return;
    const cmd = state.script[state.selectedIndex];
    const isPortraitCmd = cmd.op === 'portrait.show' || (cmd.op === 'say' && cmd.portrait);
    if (!isPortraitCmd) return;

    isDragging = true;
    portrait.classList.add('dragging');
    startMouseX = e.clientX;
    startMouseY = e.clientY;

    // 現在のゲーム座標を保存
    if (cmd.op === 'portrait.show') {
      startGameX = cmd.x ?? (GAME_W / 2);
      startGameY = cmd.y ?? (GAME_H / 2);
    } else {
      startGameX = cmd.portraitX ?? (GAME_W / 2);
      startGameY = cmd.portraitY ?? (GAME_H / 2);
    }

    elements.positionIndicator.style.display = 'block';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const containerRect = container.getBoundingClientRect();
    const mouseDx = e.clientX - startMouseX;
    const mouseDy = e.clientY - startMouseY;

    // マウス移動量をゲーム座標に変換
    const previewScale = containerRect.width / GAME_W;
    const gameDx = mouseDx / previewScale;
    const gameDy = mouseDy / previewScale;

    const newX = Math.round(startGameX + gameDx);
    const newY = Math.round(startGameY + gameDy);

    const cmd = state.script[state.selectedIndex];
    if (cmd.op === 'portrait.show') {
      cmd.x = newX;
      cmd.y = newY;
      updatePreviewPortrait({ portrait: cmd.portrait, portraitX: newX, portraitY: newY, portraitScale: cmd.scale });
      const xInput = document.getElementById('prop-x');
      const yInput = document.getElementById('prop-y');
      if (xInput) xInput.value = newX;
      if (yInput) yInput.value = newY;
    } else {
      cmd.portraitX = newX;
      cmd.portraitY = newY;
      updatePreviewPortrait(cmd);
      const xInput = document.getElementById('prop-portraitX');
      const yInput = document.getElementById('prop-portraitY');
      if (xInput) xInput.value = newX;
      if (yInput) yInput.value = newY;
    }
    elements.positionIndicator.textContent = `X: ${newX}, Y: ${newY}`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      portrait.classList.remove('dragging');
      elements.positionIndicator.style.display = 'none';
    }
  });

  // ホイールで立ち絵スケール変更
  portrait.addEventListener('wheel', (e) => {
    if (state.selectedIndex < 0) return;
    const cmd = state.script[state.selectedIndex];
    const isPortraitCmd = cmd.op === 'portrait.show' || (cmd.op === 'say' && cmd.portrait);
    if (!isPortraitCmd) return;
    e.preventDefault();

    const step = 0.05;
    const delta = e.deltaY > 0 ? -step : step;

    if (cmd.op === 'portrait.show') {
      cmd.scale = Math.max(0.1, Math.min(5.0, +((cmd.scale ?? 1.0) + delta).toFixed(2)));
      updatePreviewPortrait({ portrait: cmd.portrait, portraitX: cmd.x, portraitY: cmd.y, portraitScale: cmd.scale });
      const scaleInput = document.getElementById('prop-scale');
      if (scaleInput) scaleInput.value = cmd.scale;
    } else {
      cmd.portraitScale = Math.max(0.1, Math.min(5.0, +((cmd.portraitScale ?? 1.0) + delta).toFixed(2)));
      updatePreviewPortrait(cmd);
      const scaleInput = document.getElementById('prop-portraitScale');
      if (scaleInput) scaleInput.value = cmd.portraitScale;
    }
  }, { passive: false });
}

// 背景のドラッグ＆ホイール処理
function initBgDrag() {
  const bg = elements.previewBg;
  const container = document.getElementById('preview-container');
  let isDragging = false;
  let startMouseX, startMouseY, startGameX, startGameY;

  bg.addEventListener('mousedown', (e) => {
    if (state.selectedIndex < 0) return;
    const cmd = state.script[state.selectedIndex];
    if (cmd.op !== 'bg') return;

    isDragging = true;
    bg.classList.add('dragging');
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startGameX = cmd.x ?? 0;
    startGameY = cmd.y ?? 0;

    elements.positionIndicator.style.display = 'block';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const containerRect = container.getBoundingClientRect();
    const previewScale = containerRect.width / GAME_W;
    const newX = Math.round(startGameX + (e.clientX - startMouseX) / previewScale);
    const newY = Math.round(startGameY + (e.clientY - startMouseY) / previewScale);

    const cmd = state.script[state.selectedIndex];
    cmd.x = newX;
    cmd.y = newY;
    updatePreviewBg(cmd);

    const xInput = document.getElementById('prop-x');
    const yInput = document.getElementById('prop-y');
    if (xInput) xInput.value = newX;
    if (yInput) yInput.value = newY;

    elements.positionIndicator.textContent = `X: ${newX}, Y: ${newY}`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      bg.classList.remove('dragging');
      elements.positionIndicator.style.display = 'none';
    }
  });

  // ホイールで背景スケール変更（scaleX/scaleY を均等に）
  bg.addEventListener('wheel', (e) => {
    if (state.selectedIndex < 0) return;
    const cmd = state.script[state.selectedIndex];
    if (cmd.op !== 'bg') return;
    e.preventDefault();

    const step = 0.05;
    const delta = e.deltaY > 0 ? -step : step;
    const newScale = Math.max(0.1, Math.min(5.0, +((cmd.scaleX ?? 1.0) + delta).toFixed(2)));
    cmd.scaleX = newScale;
    cmd.scaleY = newScale;
    updatePreviewBg(cmd);

    const scaleXInput = document.getElementById('prop-scaleX');
    const scaleYInput = document.getElementById('prop-scaleY');
    if (scaleXInput) scaleXInput.value = newScale;
    if (scaleYInput) scaleYInput.value = newScale;
  }, { passive: false });
}

// 新規ストーリー
function newStory() {
  if (state.script.length > 0 && !confirm('現在の内容を破棄して新規作成しますか？')) {
    return;
  }
  state.storyId = 'new_story';
  state.script = [];
  state.selectedIndex = -1;
  elements.storyIdInput.value = state.storyId;
  renderTimeline();
  updatePreview();
  renderProperties();
}

// ストーリーデータ読み込み（APIファイルブラウザ用）
function loadStoryData(data, filename) {
  state.storyId = data.id || filename.replace('.json', '');
  state.script = data.script || [];
  state.selectedIndex = state.script.length > 0 ? 0 : -1;
  elements.storyIdInput.value = state.storyId;
  renderTimeline();
  updatePreview();
  renderProperties();
  console.log('Loaded:', state.storyId, state.script.length, 'commands');
}

// JSONインポート（ローカルファイル fallback）
function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      loadStoryData(data, file.name);
    } catch (err) {
      alert('JSONの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // リセット
}

// JSONエクスポート
function exportJSON() {
  const data = {
    id: state.storyId,
    script: state.script
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.storyId}.json`;
  a.click();
  URL.revokeObjectURL(url);
  console.log('Exported:', state.storyId);
}

// コマンド追加モーダル
function showAddModal() {
  elements.modal.classList.remove('hidden');
}

function hideAddModal() {
  elements.modal.classList.add('hidden');
}

// コマンド追加
function addCommand(type) {
  hideAddModal();

  let newCmd;
  switch (type) {
    case 'say':
      newCmd = {
        op: 'say',
        name: '名前',
        lines: ['セリフを入力してください。']
      };
      break;
    case 'bg':
      newCmd = {
        op: 'bg',
        name: 'background.png',
        fade: 500
      };
      break;
    case 'bgm.play':
      newCmd = {
        op: 'bgm.play',
        name: 'bgm.ogg',
        loop: true,
        volume: 0.6,
        fade: 1000
      };
      break;
    case 'bgm.stop':
      newCmd = {
        op: 'bgm.stop',
        fade: 1000
      };
      break;
    case 'se':
      newCmd = {
        op: 'se',
        name: 'sound.mp3'
      };
      break;
    case 'portrait.show':
      newCmd = {
        op: 'portrait.show',
        portrait: 'character.png',
        x: 960,
        y: 800,
        scale: 1.0
      };
      break;
    case 'portrait.hide':
      newCmd = { op: 'portrait.hide' };
      break;
    case 'end':
      newCmd = {
        op: 'end',
        returnTo: 'MainScene'
      };
      break;
    default:
      return;
  }

  // 選択位置の次に挿入、または末尾に追加
  const insertIndex = state.selectedIndex >= 0 ? state.selectedIndex + 1 : state.script.length;
  state.script.splice(insertIndex, 0, newCmd);
  state.selectedIndex = insertIndex;

  renderTimeline();
  updatePreview();
  renderProperties();
}

// コマンド削除
function deleteCommand(index) {
  if (index < 0 || index >= state.script.length) return;
  if (!confirm('このコマンドを削除しますか？')) return;

  state.script.splice(index, 1);
  if (state.selectedIndex >= state.script.length) {
    state.selectedIndex = state.script.length - 1;
  }

  renderTimeline();
  updatePreview();
  renderProperties();
}

// コマンド移動
function moveCommand(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.script.length) return;

  [state.script[index], state.script[newIndex]] = [state.script[newIndex], state.script[index]];
  state.selectedIndex = newIndex;

  renderTimeline();
}

// コマンド選択
function selectCommand(index) {
  state.selectedIndex = index;
  renderTimeline();
  updatePreview();
  renderProperties();
}

// タイムライン描画
function renderTimeline() {
  elements.timeline.innerHTML = '';

  state.script.forEach((cmd, index) => {
    const item = document.createElement('div');
    item.className = `timeline-item cmd-${cmd.op.replace('.', '-')}${index === state.selectedIndex ? ' selected' : ''}`;
    item.addEventListener('click', () => selectCommand(index));

    const typeLabel = getCommandLabel(cmd.op);
    const preview = getCommandPreview(cmd);

    item.innerHTML = `
      <div class="cmd-type">${typeLabel}</div>
      <div class="cmd-preview">${preview}</div>
      <div class="cmd-actions">
        <button onclick="event.stopPropagation(); moveCommand(${index}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button onclick="event.stopPropagation(); moveCommand(${index}, 1)" ${index === state.script.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-delete" onclick="event.stopPropagation(); deleteCommand(${index})">×</button>
      </div>
    `;

    elements.timeline.appendChild(item);
  });

  // 選択アイテムをスクロール
  const selected = elements.timeline.querySelector('.selected');
  if (selected) {
    selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updatePreviewIndex();
}

function getCommandLabel(op) {
  const labels = {
    'say': '💬 セリフ',
    'bg': '🖼️ 背景',
    'bgm.play': '🎵 BGM再生',
    'bgm.stop': '⏹️ BGM停止',
    'bgm.cross': '🔀 BGMクロス',
    'se': '🔊 効果音',
    'portrait.show': '🧍 立ち絵表示',
    'portrait.hide': '🚫 立ち絵非表示',
    'end': '🏁 終了'
  };
  return labels[op] || op;
}

function getCommandPreview(cmd) {
  switch (cmd.op) {
    case 'say':
      return `${cmd.name}: ${(cmd.lines || [])[0] || '(空)'}`;
    case 'bg':
      return cmd.name || '(未設定)';
    case 'bgm.play':
      return cmd.name || '(未設定)';
    case 'bgm.stop':
      return `フェード: ${cmd.fade || 0}ms`;
    case 'se':
      return cmd.name || '(未設定)';
    case 'portrait.show':
      return `${cmd.portrait || '(未設定)'} (${cmd.x ?? 960}, ${cmd.y ?? 540}) ×${cmd.scale ?? 1.0}`;
    case 'portrait.hide':
      return '立ち絵を消す';
    case 'end':
      return `→ ${cmd.returnTo || 'MainScene'}`;
    default:
      return JSON.stringify(cmd);
  }
}

// プレビュー更新
function updatePreview() {
  if (state.selectedIndex < 0 || state.selectedIndex >= state.script.length) {
    elements.previewBg.style.display = 'none';
    elements.previewBg.src = '';
    elements.previewPortrait.style.display = 'none';
    elements.previewName.textContent = '';
    elements.previewText.textContent = '';
    document.getElementById('preview-dialog').style.display = 'none';
    return;
  }

  // 現在位置までの状態を累積
  let currentBgCmd = null;
  let currentPortrait = null;
  let currentSay = null;

  for (let i = 0; i <= state.selectedIndex; i++) {
    const cmd = state.script[i];
    if (cmd.op === 'bg') {
      currentBgCmd = cmd;
    }
    if (cmd.op === 'portrait.show') {
      currentPortrait = cmd;
    }
    if (cmd.op === 'portrait.hide') {
      currentPortrait = null;
    }
    if (cmd.op === 'say') {
      currentSay = cmd;
      if (cmd.portrait) {
        // sayにportrait指定があれば上書き
        currentPortrait = cmd;
      }
      // portrait指定なしは現在のcurrentPortraitを維持
    }
  }

  // 背景（ゲームと同じ座標系で配置）
  if (currentBgCmd && currentBgCmd.name) {
    updatePreviewBg(currentBgCmd);
    elements.previewBg.style.display = 'block';
  } else {
    elements.previewBg.style.display = 'none';
    elements.previewBg.src = '';
  }

  // 立ち絵
  if (currentPortrait && currentPortrait.portrait) {
    // portrait.show と say(legacy) で座標フィールド名が違うので正規化
    const portraitDisplay = currentPortrait.op === 'portrait.show'
      ? { portrait: currentPortrait.portrait, portraitX: currentPortrait.x, portraitY: currentPortrait.y, portraitScale: currentPortrait.scale }
      : currentPortrait;
    updatePreviewPortrait(portraitDisplay);
    elements.previewPortrait.style.display = 'block';
  } else {
    elements.previewPortrait.style.display = 'none';
  }

  // ダイアログ
  const dialog = document.getElementById('preview-dialog');
  if (currentSay) {
    dialog.style.display = 'block';
    elements.previewName.textContent = currentSay.name || '';
    elements.previewText.textContent = (currentSay.lines || []).join('\n');
  } else {
    dialog.style.display = 'none';
  }

  updatePreviewIndex();
}

/**
 * 背景画像のプレビュー更新
 * ゲームと同じ座標系（左上原点、ピクセル座標）で配置
 */
function updatePreviewBg(cmd) {
  const container = document.getElementById('preview-container');
  const containerRect = container.getBoundingClientRect();

  // プレビューコンテナのサイズからスケール係数を計算
  const previewScale = containerRect.width / GAME_W;

  elements.previewBg.src = `${ASSET_BASE}/bg/${cmd.name}`;

  // ゲーム座標を取得（デフォルトは0,0 = 左上原点）
  const gameX = cmd.x ?? 0;
  const gameY = cmd.y ?? 0;
  const scaleX = cmd.scaleX ?? 1.0;
  const scaleY = cmd.scaleY ?? 1.0;

  // プレビュー座標に変換
  const previewX = gameX * previewScale;
  const previewY = gameY * previewScale;
  const previewScaleX = scaleX * previewScale;
  const previewScaleY = scaleY * previewScale;

  // スタイルを設定（ゲームと同じく左上原点で配置）
  elements.previewBg.style.left = `${previewX}px`;
  elements.previewBg.style.top = `${previewY}px`;
  elements.previewBg.style.transform = `scale(${previewScaleX}, ${previewScaleY})`;
  elements.previewBg.style.transformOrigin = 'top left';
}

/**
 * 立ち絵のプレビュー更新
 * ゲームと同じ座標系（中心原点）で配置
 */
function updatePreviewPortrait(cmd) {
  const container = document.getElementById('preview-container');
  const containerRect = container.getBoundingClientRect();

  // プレビューコンテナのサイズからスケール係数を計算
  const previewScale = containerRect.width / GAME_W;

  elements.previewPortrait.src = `${ASSET_BASE}/portraits/${cmd.portrait}`;

  // ゲーム座標を取得（デフォルトは画面中央）
  const gameX = cmd.portraitX ?? (GAME_W / 2);
  const gameY = cmd.portraitY ?? (GAME_H / 2);
  const scale = cmd.portraitScale ?? 1.0;

  // プレビュー座標に変換
  const previewX = gameX * previewScale;
  const previewY = gameY * previewScale;
  const previewScaleValue = scale * previewScale;

  // スタイルを設定（ゲームと同じく中心原点で配置）
  elements.previewPortrait.style.left = `${previewX}px`;
  elements.previewPortrait.style.top = `${previewY}px`;
  elements.previewPortrait.style.transform = `translate(-50%, -50%) scale(${previewScaleValue})`;
  elements.previewPortrait.style.transformOrigin = 'center center';
}

function updatePreviewIndex() {
  const current = state.selectedIndex >= 0 ? state.selectedIndex + 1 : 0;
  const total = state.script.length;
  elements.previewIndex.textContent = `${current} / ${total}`;
}

// プレビュー操作
function prevPreview() {
  if (state.selectedIndex > 0) {
    selectCommand(state.selectedIndex - 1);
  }
}

function nextPreview() {
  if (state.selectedIndex < state.script.length - 1) {
    selectCommand(state.selectedIndex + 1);
  }
}

function togglePlay() {
  const btn = document.getElementById('btn-play');

  if (state.isPlaying) {
    clearInterval(state.playInterval);
    state.isPlaying = false;
    btn.textContent = '▶️ 再生';
  } else {
    state.isPlaying = true;
    btn.textContent = '⏸️ 停止';
    state.playInterval = setInterval(() => {
      if (state.selectedIndex < state.script.length - 1) {
        selectCommand(state.selectedIndex + 1);
      } else {
        togglePlay(); // 終端で停止
      }
    }, 1500);
  }
}

// プロパティパネル描画
function renderProperties() {
  if (state.selectedIndex < 0 || state.selectedIndex >= state.script.length) {
    elements.propertiesContent.innerHTML = '<p class="placeholder">コマンドを選択してください</p>';
    return;
  }

  const cmd = state.script[state.selectedIndex];
  let html = '';

  switch (cmd.op) {
    case 'say':
      html = renderSayProperties(cmd);
      break;
    case 'bg':
      html = renderBgProperties(cmd);
      break;
    case 'bgm.play':
      html = renderBgmPlayProperties(cmd);
      break;
    case 'bgm.stop':
      html = renderBgmStopProperties(cmd);
      break;
    case 'se':
      html = renderSeProperties(cmd);
      break;
    case 'portrait.show':
      html = renderPortraitShowProperties(cmd);
      break;
    case 'portrait.hide':
      html = '<p class="placeholder">立ち絵を非表示にします。プロパティはありません。</p>';
      break;
    case 'end':
      html = renderEndProperties(cmd);
      break;
    default:
      html = `<pre>${JSON.stringify(cmd, null, 2)}</pre>`;
  }

  elements.propertiesContent.innerHTML = html;

  // イベントリスナーを設定
  elements.propertiesContent.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', (e) => updateProperty(e.target));
    el.addEventListener('change', (e) => updateProperty(e.target));
  });

  // BGM試聴ボタン
  const btnBgmPlay = document.getElementById('btn-bgm-play')
  const btnBgmStop = document.getElementById('btn-bgm-stop')
  if (btnBgmPlay) {
    btnBgmPlay.addEventListener('click', () => {
      const filename = document.getElementById('prop-name')?.value
      playBgmPreview(filename)
    })
  }
  if (btnBgmStop) {
    btnBgmStop.addEventListener('click', stopBgmPreview)
  }

  // SE試聴ボタン
  const btnSePlay = document.getElementById('btn-se-play')
  const btnSeStop = document.getElementById('btn-se-stop')
  if (btnSePlay) {
    btnSePlay.addEventListener('click', () => {
      const filename = document.getElementById('prop-name')?.value
      playSePreview(filename)
    })
  }
  if (btnSeStop) {
    btnSeStop.addEventListener('click', stopSePreview)
  }
}

function renderSayProperties(cmd) {
  return `
    <div class="prop-group">
      <label>話者名</label>
      <input type="text" id="prop-name" value="${escapeHtml(cmd.name || '')}" data-prop="name">
    </div>
    <div class="prop-group">
      <label>セリフ（1行ずつ）</label>
      <textarea id="prop-lines" data-prop="lines">${(cmd.lines || []).join('\n')}</textarea>
      <div class="prop-hint">複数行で入力すると、ページ送りごとに表示されます</div>
    </div>
    <div class="prop-group">
      <label>立ち絵ファイル</label>
      ${(() => {
        const current = cmd.portrait || ''
        const options = portraitFiles.map(f =>
          `<option value="${escapeHtml(f)}" ${f === current ? 'selected' : ''}>${escapeHtml(f)}</option>`
        ).join('')
        const hasMatch = portraitFiles.includes(current)
        const extraOption = (!hasMatch && current)
          ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>` : ''
        return `<select id="prop-portrait" data-prop="portrait">
          <option value="">-- なし --</option>
          ${extraOption}${options}
        </select>`
      })()}
      <div class="prop-hint">空欄で立ち絵なし</div>
    </div>
    <div class="prop-row">
      <div class="prop-group">
        <label>立ち絵 X座標</label>
        <input type="number" id="prop-portraitX" value="${cmd.portraitX ?? 960}" data-prop="portraitX">
      </div>
      <div class="prop-group">
        <label>立ち絵 Y座標</label>
        <input type="number" id="prop-portraitY" value="${cmd.portraitY ?? 540}" data-prop="portraitY">
      </div>
    </div>
    <div class="prop-group">
      <label>立ち絵スケール</label>
      <input type="number" id="prop-portraitScale" value="${cmd.portraitScale ?? 1.0}" data-prop="portraitScale" step="0.1" min="0.1" max="3">
    </div>
  `;
}

function renderBgProperties(cmd) {
  const current = cmd.name || ''
  const options = bgFiles.map(f =>
    `<option value="${escapeHtml(f)}" ${f === current ? 'selected' : ''}>${escapeHtml(f)}</option>`
  ).join('')
  const hasMatch = bgFiles.includes(current)
  const extraOption = (!hasMatch && current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>` : ''
  return `
    <div class="prop-group">
      <label>背景ファイル</label>
      <select id="prop-name" data-prop="name">
        <option value="">-- 選択 --</option>
        ${extraOption}${options}
      </select>
    </div>
    <div class="prop-row">
      <div class="prop-group">
        <label>X座標</label>
        <input type="number" id="prop-x" value="${cmd.x ?? 0}" data-prop="x">
      </div>
      <div class="prop-group">
        <label>Y座標</label>
        <input type="number" id="prop-y" value="${cmd.y ?? 0}" data-prop="y">
      </div>
    </div>
    <div class="prop-row">
      <div class="prop-group">
        <label>X スケール</label>
        <input type="number" id="prop-scaleX" value="${cmd.scaleX ?? 1.0}" data-prop="scaleX" step="0.1">
      </div>
      <div class="prop-group">
        <label>Y スケール</label>
        <input type="number" id="prop-scaleY" value="${cmd.scaleY ?? 1.0}" data-prop="scaleY" step="0.1">
      </div>
    </div>
    <div class="prop-group">
      <label>フェード時間 (ms)</label>
      <input type="number" id="prop-fade" value="${cmd.fade ?? 0}" data-prop="fade" step="100" min="0">
    </div>
  `;
}

function renderBgmPlayProperties(cmd) {
  const current = cmd.name || ''
  const options = bgmFiles.map(f =>
    `<option value="${escapeHtml(f)}" ${f === current ? 'selected' : ''}>${escapeHtml(f)}</option>`
  ).join('')
  // リストにない値（手入力済み）は先頭に追加
  const hasMatch = bgmFiles.includes(current)
  const extraOption = (!hasMatch && current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
    : ''
  return `
    <div class="prop-group">
      <label>BGMファイル</label>
      <div class="se-input-row">
        <select id="prop-name" data-prop="name">
          <option value="">-- 選択 --</option>
          ${extraOption}
          ${options}
        </select>
        <button type="button" id="btn-bgm-play" title="試聴">▶</button>
        <button type="button" id="btn-bgm-stop" title="停止">■</button>
      </div>
    </div>
    <div class="prop-group">
      <label>ループ再生</label>
      <select id="prop-loop" data-prop="loop">
        <option value="true" ${cmd.loop !== false ? 'selected' : ''}>する</option>
        <option value="false" ${cmd.loop === false ? 'selected' : ''}>しない</option>
      </select>
    </div>
    <div class="prop-group">
      <label>音量 (0.0 - 1.0)</label>
      <input type="number" id="prop-volume" value="${cmd.volume ?? 0.6}" data-prop="volume" step="0.1" min="0" max="1">
    </div>
    <div class="prop-group">
      <label>フェードイン時間 (ms)</label>
      <input type="number" id="prop-fade" value="${cmd.fade ?? 0}" data-prop="fade" step="100" min="0">
    </div>
  `;
}

function renderBgmStopProperties(cmd) {
  return `
    <div class="prop-group">
      <label>フェードアウト時間 (ms)</label>
      <input type="number" id="prop-fade" value="${cmd.fade ?? 0}" data-prop="fade" step="100" min="0">
    </div>
  `;
}

function renderSeProperties(cmd) {
  const current = cmd.name || ''
  const options = seFiles.map(f =>
    `<option value="${escapeHtml(f)}" ${f === current ? 'selected' : ''}>${escapeHtml(f)}</option>`
  ).join('')
  const hasMatch = seFiles.includes(current)
  const extraOption = (!hasMatch && current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>` : ''
  return `
    <div class="prop-group">
      <label>効果音ファイル</label>
      <div class="se-input-row">
        <select id="prop-name" data-prop="name">
          <option value="">-- 選択 --</option>
          ${extraOption}${options}
        </select>
        <button type="button" id="btn-se-play" title="試聴">▶</button>
        <button type="button" id="btn-se-stop" title="停止">■</button>
      </div>
    </div>
  `;
}

function renderPortraitShowProperties(cmd) {
  return `
    <div class="prop-group">
      <label>立ち絵ファイル</label>
      <input type="text" id="prop-portrait" value="${escapeHtml(cmd.portrait || '')}" data-prop="portrait" placeholder="例: priest.png">
      <div class="prop-hint">portraits/ フォルダのファイル名</div>
    </div>
    <div class="prop-row">
      <div class="prop-group">
        <label>X座標</label>
        <input type="number" id="prop-x" value="${cmd.x ?? 960}" data-prop="x">
      </div>
      <div class="prop-group">
        <label>Y座標</label>
        <input type="number" id="prop-y" value="${cmd.y ?? 540}" data-prop="y">
      </div>
    </div>
    <div class="prop-group">
      <label>スケール</label>
      <input type="number" id="prop-scale" value="${cmd.scale ?? 1.0}" data-prop="scale" step="0.1" min="0.1" max="3">
    </div>
    <div class="prop-hint">設定後はportrait.hideまで表示し続けます。プレビューでドラッグして位置を調整できます。</div>
  `;
}

function renderEndProperties(cmd) {
  return `
    <div class="prop-group">
      <label>遷移先</label>
      <select id="prop-returnTo" data-prop="returnTo">
        <option value="MainScene" ${cmd.returnTo === 'MainScene' ? 'selected' : ''}>ゲーム画面 (MainScene)</option>
        <option value="TitleScene" ${cmd.returnTo === 'TitleScene' ? 'selected' : ''}>タイトル画面 (TitleScene)</option>
        <option value="title" ${cmd.returnTo === 'title' ? 'selected' : ''}>タイトル (title)</option>
        <option value="game" ${cmd.returnTo === 'game' ? 'selected' : ''}>ゲーム (game)</option>
        <option value="none" ${cmd.returnTo === 'none' ? 'selected' : ''}>なし (none)</option>
      </select>
    </div>
  `;
}

// プロパティ更新
function updateProperty(input) {
  if (state.selectedIndex < 0) return;

  const prop = input.dataset.prop;
  let value = input.value;

  // 型変換
  if (input.type === 'number') {
    value = parseFloat(value) || 0;
  } else if (prop === 'loop') {
    value = value === 'true';
  } else if (prop === 'lines') {
    value = value.split('\n').filter(line => line.trim() !== '');
  }

  // 空文字列の場合はプロパティを削除
  if (value === '' && prop !== 'lines') {
    delete state.script[state.selectedIndex][prop];
  } else {
    state.script[state.selectedIndex][prop] = value;
  }

  renderTimeline();
  updatePreview();
}

// ユーティリティ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// グローバル関数として公開（HTMLから呼び出し用）
window.moveCommand = moveCommand;
window.deleteCommand = deleteCommand;
