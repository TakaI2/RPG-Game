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

window.saveToGame = saveToGame
