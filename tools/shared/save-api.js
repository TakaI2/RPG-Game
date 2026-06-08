/**
 * ゲームアセットへの保存ユーティリティ
 * POST /api/save-asset を通じて public/assets/ に直接書き込む
 */
async function saveToGame(assetPath, jsonData) {
  const content = JSON.stringify(jsonData, null, 2)

  try {
    const res = await fetch('/api/save-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: assetPath, content })
    })

    const result = await res.json()

    if (result.ok) {
      showToast(`✅ ゲームに保存しました: ${assetPath}`, 'success')
    } else {
      throw new Error(result.error || 'Unknown error')
    }
  } catch (err) {
    console.warn('saveToGame failed, falling back to download:', err)
    const filename = assetPath.split('/').pop()
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    showToast(`⚠️ 手動配置が必要: ${filename} を ${assetPath} に配置してください`, 'warning')
  }
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('save-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'save-toast'
  const colors = type === 'success'
    ? 'background:#1e3a28; color:#a6e3a1; border:1px solid #a6e3a1;'
    : 'background:#3a2a1a; color:#fab387; border:1px solid #fab387;'
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px;
    padding:12px 20px; border-radius:8px;
    font-size:0.9rem; font-family:'Segoe UI','Meiryo',sans-serif;
    z-index:9999; max-width:420px; word-break:break-all;
    box-shadow:0 4px 12px rgba(0,0,0,0.4); transition:opacity 0.3s;
    ${colors}
  `
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 3500)
}

async function listAssets(folder) {
  const res = await fetch(`/api/list-assets?folder=${encodeURIComponent(folder)}`)
  const result = await res.json()
  if (!result.ok) throw new Error(result.error || 'Failed to list assets')
  return result.files
}

async function loadAsset(assetPath) {
  const res = await fetch(`/api/load-asset?path=${encodeURIComponent(assetPath)}`)
  const result = await res.json()
  if (!result.ok) throw new Error(result.error || 'Failed to load asset')
  return JSON.parse(result.content)
}

function openFileBrowser(folder, onSelect) {
  const existing = document.getElementById('file-browser-modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'file-browser-modal'
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.7);
    display:flex; align-items:center; justify-content:center; z-index:10000;
  `

  const modal = document.createElement('div')
  modal.style.cssText = `
    background:#1e1e2e; border:1px solid #45475a; border-radius:12px;
    padding:24px; min-width:360px; max-width:480px; color:#cdd6f4;
    font-family:'Segoe UI','Meiryo',sans-serif;
  `

  const title = document.createElement('div')
  title.textContent = `\uD83D\uDCC2 ${folder}`
  title.style.cssText = 'font-size:0.85rem; color:#a6adc8; margin-bottom:16px;'
  modal.appendChild(title)

  const list = document.createElement('ul')
  list.style.cssText = 'list-style:none; margin:0 0 16px; padding:0; max-height:320px; overflow-y:auto;'
  modal.appendChild(list)

  const closeBtn = document.createElement('button')
  closeBtn.textContent = 'キャンセル'
  closeBtn.style.cssText = `
    padding:6px 16px; background:#313244; color:#cdd6f4;
    border:1px solid #45475a; border-radius:6px; cursor:pointer; font-size:0.9rem;
  `
  closeBtn.onclick = () => overlay.remove()
  modal.appendChild(closeBtn)

  overlay.appendChild(modal)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)

  listAssets(folder).then(files => {
    if (files.length === 0) {
      const empty = document.createElement('li')
      empty.textContent = 'ファイルがありません'
      empty.style.cssText = 'color:#6c7086; padding:8px;'
      list.appendChild(empty)
      return
    }
    files.forEach(filename => {
      const li = document.createElement('li')
      li.textContent = filename
      li.style.cssText = `
        padding:10px 12px; cursor:pointer; border-radius:6px;
        margin-bottom:4px; font-size:0.95rem; transition:background 0.15s;
      `
      li.onmouseenter = () => { li.style.background = '#313244' }
      li.onmouseleave = () => { li.style.background = '' }
      li.onclick = () => {
        overlay.remove()
        loadAsset(`${folder}/${filename}`)
          .then(data => onSelect(data, filename))
          .catch(err => alert('読み込みエラー: ' + err.message))
      }
      list.appendChild(li)
    })
  }).catch(err => {
    const errItem = document.createElement('li')
    errItem.textContent = 'エラー: ' + err.message
    errItem.style.cssText = 'color:#f38ba8; padding:8px;'
    list.appendChild(errItem)
  })
}

window.saveToGame = saveToGame
window.listAssets = listAssets
window.loadAsset = loadAsset
window.openFileBrowser = openFileBrowser
