---
name: horror-effects
description: 
---
このスキルは、カード型のホラー小説や怪談に、視覚的な恐怖演出（CSSアニメーション）を組み込むためのものです。
以下のCSSスタイルシートを本の先頭（通常は1ページ目）の `<style>` タグ内に記述し、各クラスを要素に適用して使用します。

### 1. 提供されるCSSスタイル
```css
@keyframes redFlash {
  0% { background-color: rgba(255, 0, 0, 0.8); }
  100% { background-color: transparent; }
}
@keyframes glitch {
  0% { transform: translate(0) }
  20% { transform: translate(-2px, 2px) }
  40% { transform: translate(-2px, -2px) }
  60% { transform: translate(2px, 2px) }
  80% { transform: translate(2px, -2px) }
  100% { transform: translate(0) }
}
@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); filter: brightness(1.2); }
  100% { transform: scale(1); }
}
@keyframes heartbeat {
  0% { transform: scale(1); }
  14% { transform: scale(1.1); }
  28% { transform: scale(1); }
  42% { transform: scale(1.1); }
  70% { transform: scale(1); }
}

.effect-flash {
  animation: redFlash 0.5s ease-out;
}
.effect-glitch {
  display: inline-block;
  animation: glitch 0.15s infinite;
  color: #ff3333;
  font-weight: bold;
  text-shadow: 2px 2px 0px black;
}
.effect-heartbeat {
  animation: heartbeat 1.2s infinite;
}
.effect-pulse {
  animation: pulse 3s infinite alternate;
}
.flashlight-bg {
  background: radial-gradient(circle 120px at 50% 50%, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.95) 100%);
  padding: 10px;
  border-radius: 8px;
}
.horror-title {
  font-family: 'Courier New', Courier, monospace;
  color: #ff0000;
  text-shadow: 0 0 8px #ff0000;
}
```

### 2. 各効果の適用ルール
- **赤フラッシュ (`effect-flash`)**: ページを開いた瞬間に画面を赤く染める。`<div class="effect-flash"></div>` のように、ページの最上部に空のdivを挿入して使用。
- **文字グリッチ (`effect-glitch`)**: 恐怖のセリフや不吉なキーワードを不気味に震えさせる。`<span class="effect-glitch">震えるテキスト</span>` のように適用。
- **心拍・脈動 (`effect-heartbeat` / `effect-pulse`)**: 緊張感の高まるシーンで、画面や特定のブロックをドクンドクンと脈打たせる。
- **懐中電灯エフェクト (`flashlight-bg`)**: 視界を狭め、暗闇を照らす演出。`<div class="flashlight-bg">内容</div>` でテキストを囲んで使用。