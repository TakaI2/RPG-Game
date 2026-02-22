// Gameflow Editor - vanilla JS, no dependencies
// Catppuccin Mocha theme

// ─── Constants ───────────────────────────────────────────────────────────────
const NODE_W      = 220;
const HEADER_H    = 36;
const PORT_H      = 28;
const PORT_RADIUS = 6;
const PORT_STEP   = PORT_H;

const NODE_COLORS = {
  start: '#a6e3a1',
  map:   '#89b4fa',
  story: '#cba6f7',
  bgm:   '#f5c2e7',
  exit:  '#f38ba8',
};

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  /** @type {Array<{id:string, type:string, x:number, y:number, data:object}>} */
  nodes: [],
  /** @type {Array<{id:string, fromNode:string, fromPort:string, toNode:string, toPort:string}>} */
  edges: [],
  /** @type {string|null} */
  selectedId: null,
  pan:  { x: 100, y: 80 },
  zoom: 1.0,
  /** @type {{nodeId:string, offsetX:number, offsetY:number}|null} */
  dragging: null,
  /** @type {{fromNode:string, fromPort:string, cursorX:number, cursorY:number}|null} */
  pendingEdge: null,
  /** Whether space key is held */
  spaceDown: false,
  /** Whether middle-mouse is panning */
  midPan: false,
  midPanStart: null,
  panStart: null,
  /** Source filename */
  fileName: 'gameflow.json',
  /** Incrementing id counter */
  _nextId: 1,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() {
  return 'n' + (state._nextId++);
}

function genEdgeId() {
  return 'e' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/** @param {string} id @returns {{id:string,type:string,x:number,y:number,data:object}|undefined} */
function findNode(id) {
  return state.nodes.find(n => n.id === id);
}

/** @param {string} id @returns {{id:string,fromNode:string,fromPort:string,toNode:string,toPort:string}|undefined} */
function findEdge(id) {
  return state.edges.find(e => e.id === id);
}

/**
 * Returns list of port definitions for a node.
 * Each port: { id, label, side: 'input'|'output' }
 */
function getPortDefs(node) {
  const ports = [];
  switch (node.type) {
    case 'start':
      ports.push({ id: 'out', label: 'out → Story', side: 'output' });
      break;
    case 'map': {
      ports.push({ id: 'in',             label: 'in',            side: 'input' });
      ports.push({ id: 'onEnter',        label: 'onEnter →',     side: 'output' });
      ports.push({ id: 'onPlayerDefeat', label: 'onPlayerDefeat →', side: 'output' });
      if (node.data.hasBoss) {
        ports.push({ id: 'onBossDefeat', label: 'onBossDefeat →', side: 'output' });
      }
      const triggers = node.data.eventTriggers || [];
      triggers.forEach((t, i) => {
        if (t.type === 'story') {
          ports.push({ id: `trigger_${i}`, label: `trigger[${i}]: ${t.storyId || '?'} →`, side: 'output' });
        } else if (t.type === 'teleport') {
          ports.push({ id: `trigger_${i}`, label: `teleport[${i}]: ${t.targetMap || '?'} →`, side: 'output' });
        }
      });
      break;
    }
    case 'story':
      ports.push({ id: 'in',   label: 'in',     side: 'input' });
      ports.push({ id: 'then', label: 'then →', side: 'output' });
      break;
    case 'bgm':
      // no ports
      break;
    case 'exit':
      ports.push({ id: 'in', label: 'in', side: 'input' });
      break;
  }
  return ports;
}

/** Returns {x, y} of port center in canvas-transform space */
function getPortPos(nodeId, portId) {
  const node = findNode(nodeId);
  if (!node) return { x: 0, y: 0 };
  const ports = getPortDefs(node);
  const inputs  = ports.filter(p => p.side === 'input');
  const outputs = ports.filter(p => p.side === 'output');

  const inputIdx  = inputs.findIndex(p => p.id === portId);
  const outputIdx = outputs.findIndex(p => p.id === portId);

  if (inputIdx >= 0) {
    return {
      x: node.x,
      y: node.y + HEADER_H + inputIdx * PORT_STEP + PORT_STEP / 2,
    };
  }
  if (outputIdx >= 0) {
    return {
      x: node.x + NODE_W,
      y: node.y + HEADER_H + outputIdx * PORT_STEP + PORT_STEP / 2,
    };
  }
  return { x: node.x, y: node.y };
}

function nodeHeight(node) {
  const ports = getPortDefs(node);
  const inputs  = ports.filter(p => p.side === 'input').length;
  const outputs = ports.filter(p => p.side === 'output').length;
  return HEADER_H + Math.max(inputs, outputs) * PORT_STEP + 8;
}

// ─── DOM References ───────────────────────────────────────────────────────────
const canvasContainer = document.getElementById('canvas-container');
const canvasTransform = document.getElementById('canvas-transform');
const edgesSvg        = document.getElementById('edges-svg');
const nodesLayer      = document.getElementById('nodes-layer');
const propertiesContent = document.getElementById('properties-content');

// ─── Render ───────────────────────────────────────────────────────────────────
function applyTransform() {
  canvasTransform.style.transform =
    `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}

function renderAll() {
  renderNodes();
  renderEdges();
  updateStatus();
}

function renderNodes() {
  nodesLayer.innerHTML = '';
  for (const node of state.nodes) {
    const div = buildNodeEl(node);
    nodesLayer.appendChild(div);
  }
}

function buildNodeEl(node) {
  const ports  = getPortDefs(node);
  const inputs  = ports.filter(p => p.side === 'input');
  const outputs = ports.filter(p => p.side === 'output');
  const h      = nodeHeight(node);

  const div = document.createElement('div');
  div.className = `node node-type-${node.type}${state.selectedId === node.id ? ' selected' : ''}`;
  div.style.left   = node.x + 'px';
  div.style.top    = node.y + 'px';
  div.style.height = h + 'px';
  div.dataset.nodeId = node.id;

  // Header
  const header = document.createElement('div');
  header.className = 'node-header';
  const badge = document.createElement('span');
  badge.className = 'node-type-badge';
  badge.textContent = node.type;
  const title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = getNodeTitle(node);
  header.appendChild(badge);
  header.appendChild(title);
  div.appendChild(header);

  // Ports
  const portsDiv = document.createElement('div');
  portsDiv.className = 'node-ports';
  portsDiv.style.position = 'relative';
  const rowCount = Math.max(inputs.length, outputs.length);
  for (let i = 0; i < rowCount; i++) {
    // input side
    if (inputs[i]) {
      const row = document.createElement('div');
      row.className = 'node-port-row input-row';
      const dot = document.createElement('div');
      dot.className = 'port-dot input-port';
      dot.dataset.nodeId = node.id;
      dot.dataset.portId = inputs[i].id;
      dot.dataset.portSide = 'input';
      const lbl = document.createElement('span');
      lbl.className = 'port-label';
      lbl.textContent = inputs[i].label;
      row.appendChild(dot);
      row.appendChild(lbl);
      portsDiv.appendChild(row);
    } else if (outputs[i]) {
      // empty input slot (spacer to align)
      const row = document.createElement('div');
      row.className = 'node-port-row input-row';
      portsDiv.appendChild(row);
    }
  }
  // output side – overlay on same rows
  // We need to render output ports on right side; use absolute positioning inside portsDiv
  portsDiv.style.minHeight = rowCount * PORT_STEP + 'px';
  outputs.forEach((p, i) => {
    const dot = document.createElement('div');
    dot.className = 'port-dot output-port';
    dot.dataset.nodeId = node.id;
    dot.dataset.portId = p.id;
    dot.dataset.portSide = 'output';
    dot.style.position = 'absolute';
    dot.style.right  = '-6px';
    dot.style.top    = (i * PORT_STEP + PORT_STEP / 2 - PORT_RADIUS) + 'px';
    portsDiv.appendChild(dot);
    // label
    const lbl = document.createElement('span');
    lbl.className = 'port-label output-row';
    lbl.textContent = p.label;
    lbl.style.position = 'absolute';
    lbl.style.right = '12px';
    lbl.style.top   = (i * PORT_STEP + PORT_STEP / 2 - 9) + 'px';
    lbl.style.textAlign = 'right';
    portsDiv.appendChild(lbl);
  });

  div.appendChild(portsDiv);

  // Footer info
  const footer = document.createElement('div');
  footer.className = 'node-footer';
  footer.textContent = getNodeFooter(node);
  div.appendChild(footer);

  return div;
}

function getNodeTitle(node) {
  switch (node.type) {
    case 'start':  return 'Start';
    case 'map':    return node.data.id || '(no id)';
    case 'story':  return node.data.storyId || '(no id)';
    case 'bgm':    return node.data.key || '(no key)';
    case 'exit':   return 'Exit';
    default:       return node.type;
  }
}

function getNodeFooter(node) {
  switch (node.type) {
    case 'map': {
      const et = (node.data.eventTriggers || []).length;
      return `bgm: ${node.data.bgm || '-'}  triggers: ${et}`;
    }
    case 'story':
      return `then: ${node.data.thenAction || 'stay'}`;
    case 'bgm':
      return node.data.url || '';
    default:
      return '';
  }
}

function renderEdges() {
  edgesSvg.innerHTML = '';

  for (const edge of state.edges) {
    const from = getPortPos(edge.fromNode, edge.fromPort);
    const to   = getPortPos(edge.toNode, edge.toPort);
    const path = makeCubicPath(from, to);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path);
    el.classList.add(state.selectedId === edge.id ? 'edge-selected' : 'edge-default');
    el.dataset.edgeId = edge.id;
    edgesSvg.appendChild(el);
  }

  // Pending edge preview
  if (state.pendingEdge) {
    const from = getPortPos(state.pendingEdge.fromNode, state.pendingEdge.fromPort);
    // Convert cursor (viewport) to canvas-transform space
    const cx = (state.pendingEdge.cursorX - state.pan.x) / state.zoom;
    const cy = (state.pendingEdge.cursorY - state.pan.y) / state.zoom;
    const path = makeCubicPath(from, { x: cx, y: cy });
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path);
    el.classList.add('edge-pending');
    edgesSvg.appendChild(el);
  }
}

function makeCubicPath(from, to) {
  const dx = Math.abs(to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y} ${to.x - dx} ${to.y} ${to.x} ${to.y}`;
}

function updateStatus() {
  document.getElementById('status-zoom').textContent  = `zoom ${Math.round(state.zoom * 100)}%`;
  document.getElementById('status-nodes').textContent = `nodes: ${state.nodes.length}`;
  document.getElementById('status-edges').textContent = `edges: ${state.edges.length}`;
}

// ─── Properties Panel ─────────────────────────────────────────────────────────
function renderProperties() {
  if (!state.selectedId) {
    propertiesContent.innerHTML = '<p class="placeholder">ノードを選択してください</p>';
    return;
  }

  const node = findNode(state.selectedId);
  if (node) {
    renderNodeProperties(node);
    return;
  }
  const edge = findEdge(state.selectedId);
  if (edge) {
    propertiesContent.innerHTML = `
      <div class="prop-section-title">Edge</div>
      <div class="prop-group">
        <label>From</label>
        <input readonly value="${edge.fromNode} : ${edge.fromPort}">
      </div>
      <div class="prop-group">
        <label>To</label>
        <input readonly value="${edge.toNode} : ${edge.toPort}">
      </div>
      <p style="font-size:0.78rem;color:#6c7086;margin-top:8px;">Delete キーで削除</p>
    `;
    return;
  }
  propertiesContent.innerHTML = '<p class="placeholder">ノードを選択してください</p>';
}

function renderNodeProperties(node) {
  let html = '';

  switch (node.type) {
    case 'start':
      html = `
        <div class="prop-section-title">Start</div>
        <div class="prop-group">
          <label>開始 Story</label>
          <input readonly value="${node.data.storyRef || '(エッジで接続)'}">
        </div>
        <p style="font-size:0.78rem;color:#6c7086;margin-top:8px;">out ポートから Story ノードに接続してください</p>
      `;
      break;

    case 'exit':
      html = `<div class="prop-section-title">Exit</div>
        <p style="font-size:0.85rem;color:#a6adc8;padding:8px 0;">ゲーム終了ノード</p>`;
      break;

    case 'map':
      html = buildMapProps(node);
      break;

    case 'story':
      html = buildStoryProps(node);
      break;

    case 'bgm':
      html = buildBgmProps(node);
      break;
  }

  propertiesContent.innerHTML = html;
  bindPropertyHandlers(node);
}

function buildMapProps(node) {
  const bgmKeys = state.nodes
    .filter(n => n.type === 'bgm')
    .map(n => `<option value="${escHtml(n.data.key)}"${node.data.bgm === n.data.key ? ' selected' : ''}>${escHtml(n.data.key)}</option>`)
    .join('');
  const bgmBlank = node.data.bgm ? '' : ' selected';

  let triggerRows = '';
  const triggers = node.data.eventTriggers || [];
  triggers.forEach((t, i) => {
    if (t.type === 'story') {
      triggerRows += `
        <tr data-ti="${i}">
          <td>${i}</td>
          <td><select class="trig-type" data-ti="${i}">
            <option value="story" selected>story</option>
            <option value="teleport">teleport</option>
          </select></td>
          <td><input class="trig-val" data-ti="${i}" value="${escHtml(t.storyId||'')}" placeholder="storyId"></td>
          <td><button class="btn-del-trigger" data-ti="${i}">✕</button></td>
        </tr>`;
    } else {
      triggerRows += `
        <tr data-ti="${i}">
          <td>${i}</td>
          <td><select class="trig-type" data-ti="${i}">
            <option value="story">story</option>
            <option value="teleport" selected>teleport</option>
          </select></td>
          <td><input class="trig-val" data-ti="${i}" value="${escHtml(t.targetMap||'')}" placeholder="targetMap"></td>
          <td><button class="btn-del-trigger" data-ti="${i}">✕</button></td>
        </tr>`;
    }
  });

  return `
    <div class="prop-section-title">Map</div>
    <div class="prop-group">
      <label>Map ID</label>
      <input id="prop-map-id" value="${escHtml(node.data.id||'')}">
    </div>
    <div class="prop-group">
      <label>BGM</label>
      <select id="prop-map-bgm">
        <option value=""${bgmBlank}>(なし)</option>
        ${bgmKeys}
      </select>
    </div>
    <div class="prop-group">
      <div class="checkbox-row">
        <input type="checkbox" id="prop-map-hasboss"${node.data.hasBoss ? ' checked' : ''}>
        <label for="prop-map-hasboss">hasBoss</label>
      </div>
    </div>
    <div class="prop-section-title">Event Triggers</div>
    <table class="trigger-table">
      <thead><tr><th>#</th><th>Type</th><th>Value</th><th></th></tr></thead>
      <tbody id="trigger-tbody">${triggerRows}</tbody>
    </table>
    <button class="btn-add-trigger" id="btn-add-trigger">+ トリガー追加</button>
  `;
}

function buildStoryProps(node) {
  return `
    <div class="prop-section-title">Story</div>
    <div class="prop-group">
      <label>Story ID</label>
      <input id="prop-story-id" value="${escHtml(node.data.storyId||'')}">
    </div>
    <div class="prop-group">
      <label>Then Action</label>
      <select id="prop-story-then">
        <option value="stay"${node.data.thenAction === 'stay' ? ' selected' : ''}>stay</option>
        <option value="goto_map"${node.data.thenAction === 'goto_map' ? ' selected' : ''}>goto_map</option>
        <option value="exit"${node.data.thenAction === 'exit' ? ' selected' : ''}>exit</option>
      </select>
    </div>
    <p style="font-size:0.78rem;color:#6c7086;margin-top:6px;">then の遷移先は then ポートからエッジで接続してください</p>
  `;
}

function buildBgmProps(node) {
  return `
    <div class="prop-section-title">BGM</div>
    <div class="prop-group">
      <label>Key</label>
      <input id="prop-bgm-key" value="${escHtml(node.data.key||'')}">
    </div>
    <div class="prop-group">
      <label>URL</label>
      <input id="prop-bgm-url" value="${escHtml(node.data.url||'')}">
    </div>
  `;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindPropertyHandlers(node) {
  const listen = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  };

  if (node.type === 'map') {
    listen('prop-map-id', 'input', e => {
      node.data.id = e.target.value;
      renderNodes(); // update title
    });
    listen('prop-map-bgm', 'change', e => {
      node.data.bgm = e.target.value;
      renderNodes();
    });
    listen('prop-map-hasboss', 'change', e => {
      node.data.hasBoss = e.target.checked;
      renderAll();
    });
    // Trigger table
    const tbody = document.getElementById('trigger-tbody');
    if (tbody) {
      tbody.addEventListener('change', e => {
        const ti = parseInt(e.target.dataset.ti);
        if (isNaN(ti)) return;
        const triggers = node.data.eventTriggers || [];
        if (e.target.classList.contains('trig-type')) {
          const prev = triggers[ti];
          if (e.target.value === 'story') {
            triggers[ti] = { type: 'story', storyId: '', x: prev.x||0, y: prev.y||0, once: true, marker: true, then: { action: 'stay' } };
          } else {
            triggers[ti] = { type: 'teleport', targetMap: '', targetX: 0, targetY: 0, x: prev.x||0, y: prev.y||0, once: false, marker: true, markerColor: 'green' };
          }
          renderAll();
          renderNodeProperties(node);
        } else if (e.target.classList.contains('trig-val')) {
          if (triggers[ti].type === 'story') triggers[ti].storyId = e.target.value;
          else triggers[ti].targetMap = e.target.value;
          renderAll();
        }
      });
      tbody.addEventListener('click', e => {
        if (e.target.classList.contains('btn-del-trigger')) {
          const ti = parseInt(e.target.dataset.ti);
          node.data.eventTriggers.splice(ti, 1);
          // Remove edges connected to this trigger port (and renumber)
          state.edges = state.edges.filter(ed => !(ed.fromNode === node.id && ed.fromPort === `trigger_${ti}`));
          renderAll();
          renderNodeProperties(node);
        }
      });
    }
    const addBtn = document.getElementById('btn-add-trigger');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (!node.data.eventTriggers) node.data.eventTriggers = [];
        node.data.eventTriggers.push({ type: 'story', storyId: '', x: 0, y: 0, once: true, marker: true, then: { action: 'stay' } });
        renderAll();
        renderNodeProperties(node);
      });
    }
  }

  if (node.type === 'story') {
    listen('prop-story-id', 'input', e => {
      node.data.storyId = e.target.value;
      renderNodes();
    });
    listen('prop-story-then', 'change', e => {
      node.data.thenAction = e.target.value;
      renderNodes();
    });
  }

  if (node.type === 'bgm') {
    listen('prop-bgm-key', 'input', e => {
      node.data.key = e.target.value;
      renderNodes();
    });
    listen('prop-bgm-url', 'input', e => {
      node.data.url = e.target.value;
      renderNodes();
    });
  }
}

// ─── Selection ────────────────────────────────────────────────────────────────
function select(id) {
  state.selectedId = id;
  renderNodes();
  renderEdges();
  renderProperties();
}

function deselect() {
  state.selectedId = null;
  renderNodes();
  renderEdges();
  renderProperties();
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

// Canvas pointer events
canvasContainer.addEventListener('pointerdown', onCanvasPointerDown);
canvasContainer.addEventListener('pointermove', onCanvasPointerMove);
canvasContainer.addEventListener('pointerup',   onCanvasPointerUp);
canvasContainer.addEventListener('wheel', onCanvasWheel, { passive: false });

// Keyboard
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup',   onKeyUp);

function onKeyDown(e) {
  if (e.code === 'Space') {
    // Don't trigger if focus is on an input
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT') return;
    e.preventDefault();
    state.spaceDown = true;
    canvasContainer.style.cursor = 'grab';
  }
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    deleteSelected();
  }
}

function onKeyUp(e) {
  if (e.code === 'Space') {
    state.spaceDown = false;
    canvasContainer.style.cursor = '';
  }
}

function deleteSelected() {
  if (!state.selectedId) return;
  const node = findNode(state.selectedId);
  if (node) {
    // Remove node and all its edges
    state.nodes = state.nodes.filter(n => n.id !== state.selectedId);
    state.edges = state.edges.filter(e => e.fromNode !== state.selectedId && e.toNode !== state.selectedId);
    state.selectedId = null;
    renderAll();
    renderProperties();
    return;
  }
  const edge = findEdge(state.selectedId);
  if (edge) {
    state.edges = state.edges.filter(e => e.id !== state.selectedId);
    state.selectedId = null;
    renderAll();
    renderProperties();
  }
}

function onCanvasPointerDown(e) {
  // Middle mouse → pan
  if (e.button === 1) {
    e.preventDefault();
    state.midPan = true;
    state.midPanStart = { mx: e.clientX, my: e.clientY, px: state.pan.x, py: state.pan.y };
    canvasContainer.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;

  // Space + left drag → pan
  if (state.spaceDown) {
    state.panStart = { mx: e.clientX, my: e.clientY, px: state.pan.x, py: state.pan.y };
    canvasContainer.setPointerCapture(e.pointerId);
    canvasContainer.style.cursor = 'grabbing';
    return;
  }

  const target = e.target;

  // Click on output port → start edge
  if (target.classList.contains('port-dot') && target.dataset.portSide === 'output') {
    e.stopPropagation();
    const rect = canvasContainer.getBoundingClientRect();
    state.pendingEdge = {
      fromNode: target.dataset.nodeId,
      fromPort: target.dataset.portId,
      cursorX: e.clientX - rect.left,
      cursorY: e.clientY - rect.top,
    };
    canvasContainer.setPointerCapture(e.pointerId);
    return;
  }

  // Click on node header → drag node
  const nodeEl = target.closest('.node');
  if (nodeEl && !target.classList.contains('port-dot')) {
    const nodeId = nodeEl.dataset.nodeId;
    const node   = findNode(nodeId);
    if (!node) return;
    select(nodeId);
    const rect  = canvasContainer.getBoundingClientRect();
    const cx    = (e.clientX - rect.left - state.pan.x) / state.zoom;
    const cy    = (e.clientY - rect.top  - state.pan.y) / state.zoom;
    state.dragging = { nodeId, offsetX: cx - node.x, offsetY: cy - node.y };
    canvasContainer.setPointerCapture(e.pointerId);
    return;
  }

  // Click on edge
  const edgeEl = target.closest('path[data-edge-id]');
  if (edgeEl) {
    select(edgeEl.dataset.edgeId);
    return;
  }

  // Click on canvas background → deselect
  deselect();
}

function onCanvasPointerMove(e) {
  const rect = canvasContainer.getBoundingClientRect();

  if (state.midPan) {
    state.pan.x = state.midPanStart.px + (e.clientX - state.midPanStart.mx);
    state.pan.y = state.midPanStart.py + (e.clientY - state.midPanStart.my);
    applyTransform();
    return;
  }

  if (state.panStart) {
    state.pan.x = state.panStart.px + (e.clientX - state.panStart.mx);
    state.pan.y = state.panStart.py + (e.clientY - state.panStart.my);
    applyTransform();
    return;
  }

  if (state.pendingEdge) {
    state.pendingEdge.cursorX = e.clientX - rect.left;
    state.pendingEdge.cursorY = e.clientY - rect.top;
    renderEdges();
    return;
  }

  if (state.dragging) {
    const cx = (e.clientX - rect.left - state.pan.x) / state.zoom;
    const cy = (e.clientY - rect.top  - state.pan.y) / state.zoom;
    const node = findNode(state.dragging.nodeId);
    if (node) {
      node.x = cx - state.dragging.offsetX;
      node.y = cy - state.dragging.offsetY;
      renderAll();
    }
  }
}

function onCanvasPointerUp(e) {
  const rect = canvasContainer.getBoundingClientRect();

  if (state.midPan) {
    state.midPan = false;
    state.midPanStart = null;
    return;
  }

  if (state.panStart) {
    state.panStart = null;
    canvasContainer.style.cursor = state.spaceDown ? 'grab' : '';
    return;
  }

  if (state.pendingEdge) {
    // Check if released on an input port
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    const hit = hitTestInputPort(ex, ey);
    if (hit && hit.nodeId !== state.pendingEdge.fromNode) {
      // Avoid duplicate edges
      const exists = state.edges.some(
        ed => ed.fromNode === state.pendingEdge.fromNode &&
              ed.fromPort === state.pendingEdge.fromPort &&
              ed.toNode   === hit.nodeId &&
              ed.toPort   === hit.portId
      );
      if (!exists) {
        state.edges.push({
          id: genEdgeId(),
          fromNode: state.pendingEdge.fromNode,
          fromPort: state.pendingEdge.fromPort,
          toNode:   hit.nodeId,
          toPort:   hit.portId,
        });
      }
    }
    state.pendingEdge = null;
    renderAll();
    return;
  }

  state.dragging = null;
}

/**
 * Returns { nodeId, portId } if cursor (in canvas-container coords) is within a port dot.
 * Only checks input ports.
 */
function hitTestInputPort(cx, cy) {
  // Convert to canvas-transform space
  const wx = (cx - state.pan.x) / state.zoom;
  const wy = (cy - state.pan.y) / state.zoom;

  for (const node of state.nodes) {
    const ports  = getPortDefs(node);
    const inputs = ports.filter(p => p.side === 'input');
    inputs.forEach((p, i) => {
      // port dot center
    });
    for (let i = 0; i < inputs.length; i++) {
      const px = node.x;
      const py = node.y + HEADER_H + i * PORT_STEP + PORT_STEP / 2;
      const dist = Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);
      if (dist <= PORT_RADIUS + 8) {
        return { nodeId: node.id, portId: inputs[i].id };
      }
    }
  }
  return null;
}

function onCanvasWheel(e) {
  e.preventDefault();
  const rect   = canvasContainer.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(3.0, Math.max(0.2, state.zoom * factor));

  // Zoom towards cursor
  state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.zoom);
  state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.zoom);
  state.zoom  = newZoom;

  applyTransform();
  updateStatus();
}

// ─── Toolbar Buttons ──────────────────────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  state.fileName = file.name;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      deserialize(json);
      renderAll();
      renderProperties();
    } catch (err) {
      alert('JSONの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
  // Reset so same file can be re-loaded
  e.target.value = '';
});

document.getElementById('btn-save').addEventListener('click', () => {
  const json = serialize();
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = state.fileName;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-add-map').addEventListener('click', () => {
  addNode('map');
});
document.getElementById('btn-add-story').addEventListener('click', () => {
  addNode('story');
});
document.getElementById('btn-add-bgm').addEventListener('click', () => {
  addNode('bgm');
});
document.getElementById('btn-add-exit').addEventListener('click', () => {
  addNode('exit');
});

function addNode(type) {
  // Place near center of viewport
  const vw = canvasContainer.clientWidth;
  const vh = canvasContainer.clientHeight;
  const cx = (vw / 2 - state.pan.x) / state.zoom - NODE_W / 2;
  const cy = (vh / 2 - state.pan.y) / state.zoom - 50;

  const node = {
    id:   genId(),
    type,
    x:    Math.round(cx),
    y:    Math.round(cy),
    data: defaultData(type),
  };
  state.nodes.push(node);
  select(node.id);
  renderAll();
  renderProperties();
}

function defaultData(type) {
  switch (type) {
    case 'map':   return { id: 'new_map', bgm: '', hasBoss: false, eventTriggers: [] };
    case 'story': return { storyId: 'new_story', thenAction: 'stay' };
    case 'bgm':   return { key: 'new_bgm', url: '' };
    case 'exit':  return {};
    case 'start': return {};
    default:      return {};
  }
}

// ─── Deserialize JSON → Graph ─────────────────────────────────────────────────
function deserialize(cfg) {
  state.nodes = [];
  state.edges = [];
  state.selectedId = null;
  state._nextId = 1;

  const positions = cfg._editorPositions || {};

  // Helper: get position or return null (for auto-layout)
  function pos(id) {
    return positions[id] || null;
  }

  const autoLayout = {
    bgmX: 80, bgmY: 60, bgmStep: 80,
    startX: 80, startY: 300,
    mapX: 350, mapY: 80, mapStep: 160,
    storyX: 640, storyY: 80, storyStep: 130,
    exitX: 930, exitY: 300,
  };

  // Story node deduplication: storyId → node id
  const storyNodeMap = {};

  function ensureStoryNode(storyId, thenAction) {
    // Shared key: same storyId gets same node (regardless of thenAction for multi-input)
    if (storyNodeMap[storyId]) return storyNodeMap[storyId];
    const p = pos(`story_${storyId}`) || { x: autoLayout.storyX, y: autoLayout.storyY };
    autoLayout.storyY += autoLayout.storyStep;
    const node = {
      id:   genId(),
      type: 'story',
      x:    p.x,
      y:    p.y,
      data: { storyId, thenAction: thenAction || 'stay' },
    };
    state.nodes.push(node);
    storyNodeMap[storyId] = node.id;
    return node.id;
  }

  function addEdge(fromNode, fromPort, toNode, toPort) {
    // Avoid duplicates
    if (state.edges.some(e => e.fromNode === fromNode && e.fromPort === fromPort && e.toNode === toNode && e.toPort === toPort)) return;
    state.edges.push({ id: genEdgeId(), fromNode, fromPort, toNode, toPort });
  }

  // Map node cache: mapId → node id
  const mapNodeMap = {};

  function ensureMapNode(mapId, mapData) {
    if (mapNodeMap[mapId]) return mapNodeMap[mapId];
    const p = pos(`map_${mapId}`) || { x: autoLayout.mapX, y: autoLayout.mapY };
    autoLayout.mapY += autoLayout.mapStep;
    const node = {
      id:   genId(),
      type: 'map',
      x:    p.x,
      y:    p.y,
      data: {
        id:            mapId,
        bgm:           mapData.bgm || '',
        hasBoss:       mapData.hasBoss || false,
        eventTriggers: mapData.eventTriggers ? JSON.parse(JSON.stringify(mapData.eventTriggers)) : [],
      },
    };
    state.nodes.push(node);
    mapNodeMap[mapId] = node.id;
    return node.id;
  }

  // Exit node (singleton)
  let exitNodeId = null;
  function ensureExitNode() {
    if (exitNodeId) return exitNodeId;
    const p = pos('exit') || { x: autoLayout.exitX, y: autoLayout.exitY };
    const node = { id: genId(), type: 'exit', x: p.x, y: p.y, data: {} };
    state.nodes.push(node);
    exitNodeId = node.id;
    return exitNodeId;
  }

  // BGM nodes
  if (cfg.assets && cfg.assets.bgm) {
    cfg.assets.bgm.forEach(b => {
      const p = pos(`bgm_${b.key}`) || { x: autoLayout.bgmX, y: autoLayout.bgmY };
      autoLayout.bgmY += autoLayout.bgmStep;
      state.nodes.push({ id: genId(), type: 'bgm', x: p.x, y: p.y, data: { key: b.key, url: b.url } });
    });
  }

  // Build map nodes first (so they exist for edges)
  if (cfg.maps) {
    for (const [mapId, mapData] of Object.entries(cfg.maps)) {
      ensureMapNode(mapId, mapData);
    }
  }

  // Helper: resolve thenConfig → edge from storyNode.then to target
  function resolveThen(storyNodeId, thenCfg) {
    if (!thenCfg) return;
    if (thenCfg.action === 'goto_map') {
      const targetMapNodeId = ensureMapNode(thenCfg.mapId, cfg.maps?.[thenCfg.mapId] || {});
      addEdge(storyNodeId, 'then', targetMapNodeId, 'in');
    } else if (thenCfg.action === 'exit') {
      addEdge(storyNodeId, 'then', ensureExitNode(), 'in');
    }
    // 'stay' → no edge
  }

  // Start node
  if (cfg.start) {
    const p = pos('start') || { x: autoLayout.startX, y: autoLayout.startY };
    const startNode = { id: genId(), type: 'start', x: p.x, y: p.y, data: {} };
    state.nodes.push(startNode);

    if (cfg.start.story) {
      const thenAction = cfg.start.then?.action || 'stay';
      const storyNodeId = ensureStoryNode(cfg.start.story, thenAction);
      addEdge(startNode.id, 'out', storyNodeId, 'in');
      resolveThen(storyNodeId, cfg.start.then);
    }
  }

  // Maps: wire ports
  if (cfg.maps) {
    for (const [mapId, mapData] of Object.entries(cfg.maps)) {
      const mapNodeId = mapNodeMap[mapId];

      // onEnter
      if (mapData.onEnter) {
        const sid = ensureStoryNode(mapData.onEnter.story, mapData.onEnter.then?.action);
        addEdge(mapNodeId, 'onEnter', sid, 'in');
        resolveThen(sid, mapData.onEnter.then);
      }

      // onPlayerDefeat
      if (mapData.onPlayerDefeat) {
        const sid = ensureStoryNode(mapData.onPlayerDefeat.story, mapData.onPlayerDefeat.then?.action);
        addEdge(mapNodeId, 'onPlayerDefeat', sid, 'in');
        resolveThen(sid, mapData.onPlayerDefeat.then);
      }

      // onBossDefeat
      if (mapData.onBossDefeat) {
        const sid = ensureStoryNode(mapData.onBossDefeat.story, mapData.onBossDefeat.then?.action);
        addEdge(mapNodeId, 'onBossDefeat', sid, 'in');
        resolveThen(sid, mapData.onBossDefeat.then);
      }

      // eventTriggers
      (mapData.eventTriggers || []).forEach((t, i) => {
        if (t.type === 'story') {
          const sid = ensureStoryNode(t.storyId, t.then?.action);
          addEdge(mapNodeId, `trigger_${i}`, sid, 'in');
          resolveThen(sid, t.then);
        } else if (t.type === 'teleport') {
          const targetMapNodeId = ensureMapNode(t.targetMap, cfg.maps?.[t.targetMap] || {});
          addEdge(mapNodeId, `trigger_${i}`, targetMapNodeId, 'in');
        }
      });
    }
  }
}

// ─── Serialize Graph → JSON ────────────────────────────────────────────────────
function serialize() {
  const result = {};

  // BGM assets
  const bgmNodes = state.nodes.filter(n => n.type === 'bgm');
  if (bgmNodes.length > 0) {
    result.assets = { bgm: bgmNodes.map(n => ({ key: n.data.key, url: n.data.url })) };
  }

  // Start
  const startNode = state.nodes.find(n => n.type === 'start');
  if (startNode) {
    const outEdge = state.edges.find(e => e.fromNode === startNode.id && e.fromPort === 'out');
    if (outEdge) {
      const storyNode = findNode(outEdge.toNode);
      if (storyNode && storyNode.type === 'story') {
        result.start = {
          story: storyNode.data.storyId,
          then: resolveThenConfig(storyNode),
        };
      }
    }
  }

  // Maps
  const mapNodes = state.nodes.filter(n => n.type === 'map');
  if (mapNodes.length > 0) {
    result.maps = {};
    for (const mapNode of mapNodes) {
      const mapId = mapNode.data.id;
      const mapObj = {
        bgm:     mapNode.data.bgm || null,
        onEnter: resolveMapPort(mapNode, 'onEnter'),
        hasBoss: mapNode.data.hasBoss || false,
        onPlayerDefeat: resolveMapPort(mapNode, 'onPlayerDefeat'),
      };
      if (mapNode.data.hasBoss) {
        mapObj.onBossDefeat = resolveMapPort(mapNode, 'onBossDefeat');
      }
      // eventTriggers
      const triggers = mapNode.data.eventTriggers || [];
      mapObj.eventTriggers = triggers.map((t, i) => {
        if (t.type === 'teleport') return { ...t };
        // story trigger: get then from connected story node's then port
        const trigEdge = state.edges.find(e => e.fromNode === mapNode.id && e.fromPort === `trigger_${i}`);
        if (trigEdge) {
          const storyNode = findNode(trigEdge.toNode);
          if (storyNode && storyNode.type === 'story') {
            return { ...t, storyId: storyNode.data.storyId, then: resolveThenConfig(storyNode) };
          }
        }
        return { ...t };
      });
      result.maps[mapId] = mapObj;
    }
  }

  // _editorPositions
  const editorPositions = {};
  for (const node of state.nodes) {
    const key = editorPosKey(node);
    editorPositions[key] = { x: node.x, y: node.y };
  }
  result._editorPositions = editorPositions;

  return result;
}

function editorPosKey(node) {
  switch (node.type) {
    case 'start': return 'start';
    case 'exit':  return 'exit';
    case 'map':   return `map_${node.data.id}`;
    case 'story': return `story_${node.data.storyId}`;
    case 'bgm':   return `bgm_${node.data.key}`;
    default:      return node.id;
  }
}

/** Resolve a map port → { story, then } | null */
function resolveMapPort(mapNode, portId) {
  const edge = state.edges.find(e => e.fromNode === mapNode.id && e.fromPort === portId);
  if (!edge) return null;
  const storyNode = findNode(edge.toNode);
  if (!storyNode || storyNode.type !== 'story') return null;
  return { story: storyNode.data.storyId, then: resolveThenConfig(storyNode) };
}

/** Resolve Story node's then port → ThenConfig */
function resolveThenConfig(storyNode) {
  const thenEdge = state.edges.find(e => e.fromNode === storyNode.id && e.fromPort === 'then');
  if (!thenEdge) {
    return { action: storyNode.data.thenAction || 'stay' };
  }
  const target = findNode(thenEdge.toNode);
  if (!target) return { action: 'stay' };
  if (target.type === 'exit') return { action: 'exit' };
  if (target.type === 'map') return { action: 'goto_map', mapId: target.data.id, x: 10, y: 10 };
  return { action: storyNode.data.thenAction || 'stay' };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
applyTransform();
renderAll();
renderProperties();
