// 画像やJSONをimportする場合に備えた拡張（必要に応じて）
declare module '*.png' {
  const content: string
  export default content
}

declare module '*.json' {
  const value: any
  export default value
}
