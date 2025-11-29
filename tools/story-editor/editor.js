/**
 * Story Editor for RPG Game
 * ストーリースクリプトをビジュアルに編集するためのツール
 */

// アセットのベースパス（相対パス）
const ASSET_BASE = '../../public/assets/story';

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
  initElements();
  initEventListeners();
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
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', importJSON);
  document.getElementById('btn-export').addEventListener('click', exportJSON);

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
      document.getElementById('file-input').click();
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
}

// 立ち絵のドラッグ処理
function initPortraitDrag() {
  const portrait = elements.previewPortrait;
  const container = document.getElementById('preview-container');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  portrait.addEventListener('mousedown', (e) => {
    if (state.selectedIndex < 0) return;
    const cmd = state.script[state.selectedIndex];
    if (cmd.op !== 'say' || !cmd.portrait) return;

    isDragging = true;
    portrait.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;

    const rect = portrait.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    startLeft = rect.left - containerRect.left + rect.width / 2;
    startTop = rect.top - containerRect.top + rect.height / 2;

    elements.positionIndicator.style.display = 'block';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const containerRect = container.getBoundingClientRect();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // プレビュー座標からゲーム座標に変換（1920x1080基準）
    const scaleX = 1920 / containerRect.width;
    const scaleY = 1080 / containerRect.height;

    const newX = Math.round((startLeft + dx) * scaleX);
    const newY = Math.round((startTop + dy) * scaleY);

    // 現在のコマンドを更新
    const cmd = state.script[state.selectedIndex];
    cmd.portraitX = newX;
    cmd.portraitY = newY;

    // プレビューを更新
    updatePreviewPortrait(cmd);
    elements.positionIndicator.textContent = `X: ${newX}, Y: ${newY}`;

    // プロパティパネルを更新
    const xInput = document.getElementById('prop-portraitX');
    const yInput = document.getElementById('prop-portraitY');
    if (xInput) xInput.value = newX;
    if (yInput) yInput.value = newY;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      portrait.classList.remove('dragging');
      elements.positionIndicator.style.display = 'none';
    }
  });
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

// JSONインポート
function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      state.storyId = data.id || file.name.replace('.json', '');
      state.script = data.script || [];
      state.selectedIndex = state.script.length > 0 ? 0 : -1;
      elements.storyIdInput.value = state.storyId;
      renderTimeline();
      updatePreview();
      renderProperties();
      console.log('Imported:', state.storyId, state.script.length, 'commands');
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
    case 'end':
      return `→ ${cmd.returnTo || 'MainScene'}`;
    default:
      return JSON.stringify(cmd);
  }
}

// プレビュー更新
function updatePreview() {
  if (state.selectedIndex < 0 || state.selectedIndex >= state.script.length) {
    elements.previewBg.style.backgroundImage = '';
    elements.previewPortrait.style.display = 'none';
    elements.previewName.textContent = '';
    elements.previewText.textContent = '';
    document.getElementById('preview-dialog').style.display = 'none';
    return;
  }

  // 現在位置までの状態を累積
  let currentBg = '';
  let currentPortrait = null;
  let currentSay = null;

  for (let i = 0; i <= state.selectedIndex; i++) {
    const cmd = state.script[i];
    if (cmd.op === 'bg') {
      currentBg = cmd.name;
    }
    if (cmd.op === 'say') {
      currentSay = cmd;
      if (cmd.portrait) {
        currentPortrait = cmd;
      } else {
        currentPortrait = null;
      }
    }
  }

  // 背景
  if (currentBg) {
    elements.previewBg.style.backgroundImage = `url('${ASSET_BASE}/bg/${currentBg}')`;
  } else {
    elements.previewBg.style.backgroundImage = '';
  }

  // 立ち絵
  if (currentPortrait && currentPortrait.portrait) {
    updatePreviewPortrait(currentPortrait);
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

function updatePreviewPortrait(cmd) {
  const container = document.getElementById('preview-container');
  const containerRect = container.getBoundingClientRect();

  elements.previewPortrait.src = `${ASSET_BASE}/portraits/${cmd.portrait}`;

  // ゲーム座標からプレビュー座標に変換
  const gameX = cmd.portraitX ?? 960;
  const gameY = cmd.portraitY ?? 540;
  const scale = cmd.portraitScale ?? 1.0;

  const previewX = (gameX / 1920) * 100;
  const previewY = (gameY / 1080) * 100;

  elements.previewPortrait.style.left = `${previewX}%`;
  elements.previewPortrait.style.top = `${previewY}%`;
  elements.previewPortrait.style.transform = `translate(-50%, -50%) scale(${scale})`;
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
      <input type="text" id="prop-portrait" value="${escapeHtml(cmd.portrait || '')}" data-prop="portrait" placeholder="例: priest.png">
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
  return `
    <div class="prop-group">
      <label>背景ファイル</label>
      <input type="text" id="prop-name" value="${escapeHtml(cmd.name || '')}" data-prop="name" placeholder="例: bad1.png">
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
  return `
    <div class="prop-group">
      <label>BGMファイル</label>
      <input type="text" id="prop-name" value="${escapeHtml(cmd.name || '')}" data-prop="name" placeholder="例: bgm1.ogg">
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
  return `
    <div class="prop-group">
      <label>効果音ファイル</label>
      <input type="text" id="prop-name" value="${escapeHtml(cmd.name || '')}" data-prop="name" placeholder="例: footstep.mp3">
    </div>
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
