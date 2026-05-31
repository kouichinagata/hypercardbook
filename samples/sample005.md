---
id: markdown-easy-intro-2025
title: Markdownかんたん入門
theme_color: gold
author: 縦長Learning編集部
play_mode: book
---

Page 1:
<svg style="position: absolute; width: 0; height: 0;">
  <defs>
    <filter id="chalk-filter">
      <feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" />
      <feDisplacementMap in="SourceGraphic" scale="5" />
    </filter>
    <filter id="chalk-filter-rough">
      <feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" />
      <feDisplacementMap in="SourceGraphic" scale="10" />
    </filter>
  </defs>
</svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard {
  background: #0d1b10; color: #ffffff;
  font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif;
  line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%;
}
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-white-rough { font-family: 'Caveat', cursive; color: #ffffff; filter: url(#chalk-filter-rough); text-shadow: 0 0 6px rgba(255,255,255,0.4); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalk-orange { font-family: 'Caveat', cursive; color: #ffa500; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 165, 0, 0.3); }
.chalk-yellow-green { font-family: 'Caveat', cursive; color: #a3e24c; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(163, 226, 76, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.hero-section { text-align: center; padding: 20px; }
.hero-title { font-size: 2.8rem; font-weight: 700; line-height: 1.3; margin-bottom: 20px; }
.chalk-divider { width: 6rem; height: 0.2rem; background-color: rgba(255,255,255,0.7); border-radius: 9999px; margin: 1.5rem auto; filter: url(#chalk-filter); }
.hero-description { font-size: 1.4rem; line-height: 1.6; margin-bottom: 1.5rem; }
.chalk-dots { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; }
.dot { width: 0.5rem; height: 0.5rem; background-color: rgba(255,255,255,0.6); border-radius: 50%; filter: url(#chalk-filter); }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
.lesson-card, .practice-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title, .practice-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-result { font-size: 1.1rem; line-height: 1.5; margin-top: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: 4px; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
.practice-desc { font-size: 1.2rem; margin-bottom: 1rem; }
.practice-list { font-size: 1.1rem; line-height: 1.8; }
.quote-section { text-align: center; width: 100%; }
.summary-title { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
.quote-text { font-size: 1.3rem; margin-bottom: 1rem; line-height: 1.6; }
.quote-author { font-size: 1.1rem; margin-bottom: 2rem; }
.summary-tips { padding: 1.2rem; background-color: rgba(0, 0, 0, 0.2); border-radius: 6px; border: 1px dashed rgba(255, 255, 255, 0.2); text-align: left; }
.tip-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem; text-align: center; }
.tip-item { font-size: 1rem; line-height: 1.6; margin-bottom: 0.4rem; }
@media (max-width: 480px) {
  .hero-title { font-size: 2.2rem; }
  .hero-description { font-size: 1.1rem; }
  .section-title { font-size: 1.5rem; }
  .explanation-text { font-size: 1.1rem; }
  .lesson-card, .practice-card { padding: 1rem; }
  .lesson-title, .practice-title { font-size: 1.2rem; }
  .lesson-desc { font-size: 1.1rem; }
}
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="hero-section">
        <h1 class="hero-title chalk-white-rough">
          Markdownって<br/>
          なあに？
        </h1>
        <div class="chalk-divider chalk-white"></div>
        <p class="hero-description chalk-cyan">
          かんたんな記号だけで<br/>きれいな文章が書ける魔法だよ！
        </p>
      </div>
    </div>
  </div>
</div>

Page 2:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter><filter id="chalk-filter-rough"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="10" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.hero-section { text-align: center; padding: 20px; }
.hero-description { font-size: 1.4rem; line-height: 1.6; margin-bottom: 1.5rem; }
.chalk-dots { display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem; }
.dot { width: 0.5rem; height: 0.5rem; background-color: rgba(255,255,255,0.6); border-radius: 50%; filter: url(#chalk-filter); }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="hero-section">
        <p class="hero-description chalk-yellow">
          むずかしい設定はナシ！
        </p>
        <p class="hero-description chalk-white">
          いくつかのルールを覚えるだけで、<br/>だれでもすぐに使えます。
        </p>
        <div class="chalk-dots">
          <span class="dot chalk-white"></span>
          <span class="dot chalk-white"></span>
          <span class="dot chalk-white"></span>
        </div>
      </div>
    </div>
  </div>
</div>

Page 3:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン1：見出し</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            見出しを作るときは<br/>「#」という記号を使うよ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 4:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">書き方</h3>
          <p class="lesson-desc chalk-pink">
            # 大きな見出し<br/>
            ## 中くらいの見出し<br/>
            ### 小さな見出し
          </p>
          <p class="lesson-note chalk-cyan">
            ※「#」のあとに半角スペースを入れてね！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 5:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-result { font-size: 1.1rem; line-height: 1.5; margin-top: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: 4px; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">できあがり</h3>
          <p class="lesson-desc chalk-cyan">
            # の数が多くなるほど、<br/>
            見出しのサイズが小さくなるよ。
          </p>
          <p class="lesson-result chalk-white">
            本やノートの「章」や「しおり」のようにつかおう！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 6:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン2：文字の強調</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            大切な言葉を目立たせる<br/>かんたんな方法だよ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 7:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-result { font-size: 1.1rem; line-height: 1.5; margin-top: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: 4px; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">太字にする</h3>
          <p class="lesson-desc chalk-pink">
            **太字にしたい文字**
          </p>
          <p class="lesson-result chalk-white">
            星マーク2つ（アスタリスク）で<br/>囲むと太字になるよ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 8:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow-green { font-family: 'Caveat', cursive; color: #a3e24c; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(163, 226, 76, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-result { font-size: 1.1rem; line-height: 1.5; margin-top: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: 4px; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">斜めにする（斜体）</h3>
          <p class="lesson-desc chalk-yellow-green">
            *斜めにしたい文字*
          </p>
          <p class="lesson-result chalk-white">
            星マーク1つで囲むと<br/>文字が少しななめになるよ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 9:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン3：リスト</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            箇条書きや、やることリストを<br/>きれいに並べよう！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 10:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">普通の箇条書き</h3>
          <p class="lesson-desc chalk-pink">
            - りんご<br/>
            - バナナ<br/>
            - みかん
          </p>
          <p class="lesson-note chalk-cyan">
            行の最初に「-（ハイフン）」と<br/>半角スペースを書くよ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 11:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">番号つきリスト</h3>
          <p class="lesson-desc chalk-yellow">
            1. 学校に行く<br/>
            2. 宿宿題をする<br/>
            3. ごはんを食べる
          </p>
          <p class="lesson-note chalk-cyan">
            順番が大切なときは、<br/>数字と「.（ドット）」を使おう！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 12:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン4：リンク</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            クリックすると他のホームページに<br/>ジャンプする設定だよ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 13:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">書き方</h3>
          <p class="lesson-desc chalk-pink">
            [表示する名前](ウェブのURL)
          </p>
          <p class="lesson-note chalk-white">
            [ ] の中に文字を、<br/>
            ( ) の中にURLをかくのがコツ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 14:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-result { font-size: 1.1rem; line-height: 1.5; margin-top: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: 4px; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">できあがりの例</h3>
          <p class="lesson-desc chalk-cyan">
            [Googleで検索する](https://google.com)
          </p>
          <p class="lesson-result chalk-white">
            これをクリックすると、<br/>
            Googleのページが開くよ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 15:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン5：画像</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            文章の中に写真やイラストを<br/>表示させてみよう！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 16:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">書き方</h3>
          <p class="lesson-desc chalk-pink">
            ![画像の説明](画像のURL)
          </p>
          <p class="lesson-note chalk-white">
            リンクの書き方の前に、<br/>
            びっくりマーク「!」をつけるだけ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 17:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow-green { font-family: 'Caveat', cursive; color: #a3e24c; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(163, 226, 76, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">画像の説明って？</h3>
          <p class="lesson-desc chalk-yellow-green">
            もし画像がうまく読み込めなかったとき、<br/>
            代わりに表示される文字のことだよ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 18:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン6：引用</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            本に書いてある言葉などを<br/>紹介するときに使うよ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 19:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">書き方</h3>
          <p class="lesson-desc chalk-pink">
            &gt; これは引用した文章です。
          </p>
          <p class="lesson-note chalk-cyan">
            行のはじめに「&gt;」を書くよ。<br/>
            枠で囲まれておしゃれに表示されるんだ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 20:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">レッスン7：改行と段落</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-yellow">
            文章を読みやすくするために<br/>スペースを空ける方法だよ！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 21:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
.lesson-note { font-size: 1rem; line-height: 1.4; margin-top: 0.8rem; opacity: 0.9; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">段落を分ける</h3>
          <p class="lesson-desc chalk-pink">
            1つ目の段落<br/>
            <br/>
            2つ目の段落
          </p>
          <p class="lesson-note chalk-white">
            あいだに「空っぽの行」を<br/>1行はさむと、新しい段落になるよ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 22:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow-green { font-family: 'Caveat', cursive; color: #a3e24c; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(163, 226, 76, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.lesson-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.lesson-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.lesson-desc { font-size: 1.2rem; line-height: 1.6; margin-bottom: 0.8rem; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="lesson-card">
          <h3 class="lesson-title chalk-white">改行する</h3>
          <p class="lesson-desc chalk-yellow-green">
            行の終わりに「半角スペース」を<br/>
            2つ入れると改行できるよ。
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 23:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalk-underline { width: 5rem; height: 0.1rem; background-color: rgba(255,255,255,0.5); margin: 0 auto 20px auto; filter: url(#chalk-filter); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.section-title { font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 10px; }
.lesson-explanation { text-align: center; margin-bottom: 20px; }
.explanation-text { font-size: 1.2rem; line-height: 1.6; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <h2 class="section-title chalk-white">練習してみよう！</h2>
        <div class="chalk-underline chalk-white"></div>
        <div class="lesson-explanation">
          <p class="explanation-text chalk-cyan">
            覚えたルールを使って、<br/>
            かんたんなクイズに挑戦！
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 24:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.practice-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.practice-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.practice-desc { font-size: 1.2rem; margin-bottom: 1rem; }
.practice-list { font-size: 1.1rem; line-height: 1.8; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="practice-card">
          <h3 class="practice-title chalk-white">練習問題 1</h3>
          <p class="practice-desc chalk-pink">
            自分のプロフィールを書いてみよう！
          </p>
          <p class="practice-list chalk-cyan">
            ・# で名前を書く<br/>
            ・## 好きなもの を書く<br/>
            ・- で好きな食べ物を3つ並べる
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 25:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalk-yellow-green { font-family: 'Caveat', cursive; color: #a3e24c; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(163, 226, 76, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.lessons-section { width: 100%; }
.practice-card { background: linear-gradient(135deg, #143016 0%, #1c4420 50%, #143016 100%); border: 6px solid #5a381b; box-shadow: inset 0 0 0 1px #734824, inset 0 0 0 3px #3d2512, 0 4px 10px rgba(0, 0, 0, 0.4); border-radius: 4px; padding: 1.5rem; position: relative; }
.practice-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
.practice-desc { font-size: 1.2rem; margin-bottom: 1rem; }
.practice-list { font-size: 1.1rem; line-height: 1.8; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="lessons-section">
        <div class="practice-card">
          <h3 class="practice-title chalk-white">練習問題 2</h3>
          <p class="practice-desc chalk-yellow">
            お気に入りの本を紹介しよう！
          </p>
          <p class="practice-list chalk-yellow-green">
            ・本の名前を **太字** にする<br/>
            ・&gt; で本の中のセリフを引用する<br/>
            ・[リンク] で本の紹介URLを貼る
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

Page 26:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-orange { font-family: 'Caveat', cursive; color: #ffa500; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 165, 0, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.quote-section { text-align: center; width: 100%; }
.summary-title { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
.quote-text { font-size: 1.3rem; margin-bottom: 1rem; line-height: 1.6; }
.quote-author { font-size: 1.1rem; margin-bottom: 2rem; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="quote-section">
        <h2 class="summary-title chalk-white">まとめ</h2>
        <p class="quote-text chalk-orange">
          Markdownを使うと、<br/>
          だれでもきれいで見やすい文章が<br/>
          あっという間に作れるよ！
        </p>
        <p class="quote-author chalk-white">
          ノートや日記、メッセージなどで<br/>
          たくさん使ってみてね！
        </p>
      </div>
    </div>
  </div>
</div>

Page 27:
<svg style="position: absolute; width: 0; height: 0;"><defs><filter id="chalk-filter"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="5" seed="2" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></defs></svg>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
.page-wrapper.blackboard { background: #0d1b10; color: #ffffff; font-family: 'Caveat', 'Comic Sans MS', cursive, 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; min-height: 100%; height: auto; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; width: 100%; }
.chalk-white { font-family: 'Caveat', cursive; color: #f8f9fa; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255,255,255,0.3); }
.chalk-pink { font-family: 'Caveat', cursive; color: #ffb3d9; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 179, 217, 0.3); }
.chalk-cyan { font-family: 'Caveat', cursive; color: #87ceeb; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(135, 206, 235, 0.3); }
.chalk-yellow { font-family: 'Caveat', cursive; color: #fff176; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 241, 118, 0.3); }
.chalk-orange { font-family: 'Caveat', cursive; color: #ffa500; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(255, 165, 0, 0.3); }
.chalk-yellow-green { font-family: 'Caveat', cursive; color: #a3e24c; filter: url(#chalk-filter); text-shadow: 0 0 4px rgba(163, 226, 76, 0.3); }
.chalkboard-frame { position: relative; width: 100%; min-height: 100%; height: auto; display: flex; flex-direction: column; justify-content: center; padding: 20px; }
.glossy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 60%); pointer-events: none; z-index: 1; }
.chalkboard-content { position: relative; z-index: 10; width: 100%; max-width: 600px; margin: 0 auto; }
.quote-section { text-align: center; width: 100%; }
.summary-tips { padding: 1.2rem; background-color: rgba(0, 0, 0, 0.2); border-radius: 6px; border: 1px dashed rgba(255, 255, 255, 0.2); text-align: left; }
.tip-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem; text-align: center; }
.tip-item { font-size: 1rem; line-height: 1.6; margin-bottom: 0.4rem; }
</style>
<div class="page-wrapper blackboard">
  <div class="chalkboard-frame">
    <div class="glossy-overlay"></div>
    <div class="chalkboard-content">
      <div class="quote-section">
        <div class="summary-tips">
          <p class="tip-title chalk-cyan">おさらいシート</p>
          <p class="tip-item chalk-pink">✓ # で見出し</p>
          <p class="tip-item chalk-yellow">✓ **太字** と *斜体*</p>
          <p class="tip-item chalk-cyan">✓ - でリスト作成</p>
          <p class="tip-item chalk-yellow-green">✓ [文字](URL) でリンク</p>
          <p class="tip-item chalk-orange">✓ &gt; で引用</p>
        </div>
      </div>
    </div>
  </div>
</div>
