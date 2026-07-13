/*!
 * anime-fx.js — 小红书图文视频「anime.js v4 动效预设库」
 * ------------------------------------------------------------------
 * 目标:把验证过的 anime.js 效果固化成「一行可调用」的预设,并自动接好
 * HyperFrames 的确定性逐帧渲染契约(__hfAnime / __timelines 桩 / engine.pause)。
 * 调用方再也不用碰那些 plumbing,也不用重新推导参数。
 *
 * 依赖:页面须先加载 anime.js v4 UMD(window.anime)。
 *   <script src="https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js"></script>
 *   <script src="../lib/anime-fx/anime-fx.js"></script>
 *
 * 用法:
 *   AnimeFX.init('myCompId', 7);                 // 1) 一次:装就绪桩 + 关引擎
 *   AnimeFX.text.scrambleIn('#title', {seed:7}); // 2) 调效果(自动注册)
 *   AnimeFX.grid.ripple('#bg', {cols:16,rows:9});
 *   AnimeFX.finalize();                          // 3) 全部定格到 0
 *
 * 设计约定:
 *   - 每个效果都 return 它创建的 anime 实例(失败 return null),并已 push 进 __hfAnime。
 *   - 所有随机都走内置 seeded RNG(mulberry32),HF 禁 Math.random,确定性必须保证。
 *   - 通用选项 `at`(ms):效果起始时间偏移,默认 0。
 *   - 每个效果独立 try/catch,单点失败不拖垮整条合成。
 */
(function (global) {
  'use strict';

  var A = global.anime;
  if (!A) { console.error('[animefx] anime.js 未加载，请先引入 anime.js v4'); }

  // 构建兼容:set 在 afxSet(命名空间)或 A.set(顶层);svg helpers 在 A.svg 或顶层。
  // 4.5.0 UMD 两种写法都有,这里取存在的那个,让库对不同 anime 构建都稳(也消除 review 误报)。
  var afxSet = (A && A.utils && A.utils.set) ? A.utils.set : (A ? A.set : function () {});
  var afxSvg = (A && A.svg) ? A.svg : (A || {});

  // ---- 内部状态 ----
  var _compId = null;
  var _durationMs = 0;
  var _hf = function () { global.__hfAnime = global.__hfAnime || []; return global.__hfAnime; };

  // 官方契约:禁无限循环。loop:true → 按合成时长 / 单次迭代算出覆盖全片的有限次数。
  function autoLoop(loop, iterMs) {
    if (loop === true) {
      if (_durationMs > 0 && iterMs > 0) return Math.max(1, Math.ceil(_durationMs / iterMs) + 1);
      return 20; // init 未给时长时的兜底
    }
    return loop; // 已是数字 / 0 → 原样
  }

  // 确定性随机(mulberry32):同 seed → 同序列,可逐帧 seek
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 注册实例到 HyperFrames 的 anime 适配器。
  // anime.js v4 的独立 Animation.seek(t) 会忽略实例 `_delay`：例如 delay:2200 的
  // 动画 seek(500) 已经走到本地 500ms。这与 HF/本库把所有实例按「合成全局时间」
  // seek 的契约冲突。注册时只对带 delay 的独立实例包一层全局→本地换算；Timeline
  // 用 .add(..., at) 把偏移写在子项位置里，_delay=0，不经过这层换算。
  function reg(inst) {
    if (!inst) return null;
    var at = Math.max(0, Number(inst._delay) || 0);
    if (at > 0 && !inst.__afxGlobalSeek) {
      var rawSeek = inst.seek;
      inst.__afxGlobalSeek = true;
      inst.__afxAt = at;
      inst.seek = function (globalTime, muteCallbacks) {
        var localTime = Math.max(0, (Number(globalTime) || 0) - at);
        return rawSeek.call(inst, localTime, muteCallbacks);
      };
    }
    _hf().push(inst);
    return inst;
  }

  // 独立预览兜底:直接用浏览器双击打开本 HTML(没有 HyperFrames 驱动)时,
  // 用自带 rAF 循环按真实流逝时间 seek 所有实例,让动画照常播放并循环。
  // 仅当检测不到 HyperFrames 运行时才启动 —— 绝不干扰 HF 的渲染/预览(那时由 HF 独占驱动)。
  function maybeStandalonePreview(list) {
    if (!list || !list.length || typeof window.requestAnimationFrame !== 'function') return;
    setTimeout(function () {
      // 在 HyperFrames 里(渲染/Studio 预览)→ 保持由 HF seek,自己不动
      if (window.__hyperframes || window.__hfRuntimeTeardown || window.__player || window.__renderReady) return;
      // 优先用 init 声明的合成时长。单个 anime 实例的 duration 不一定
      // 包含 delay/at，只取实例最大值会让晚入场或出场效果永远走不到。
      var maxDur = _durationMs > 0 ? _durationMs : 0;
      for (var i = 0; i < list.length; i++) { try { maxDur = Math.max(maxDur, list[i].duration || 0); } catch (e) {} }
      if (!(maxDur > 0)) maxDur = 6000;
      var t0 = null;
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var t = (ts - t0) % maxDur;
        for (var j = 0; j < list.length; j++) { try { list[j].seek(t); } catch (e) {} }
        window.requestAnimationFrame(frame);
      }
      window.requestAnimationFrame(frame);
    }, 100);
  }

  // 取 scrambleText(顶层或 text 命名空间)
  function getScramble() { return A.scrambleText || (A.text && A.text.scrambleText); }
  // 取 split(顶层或 text 命名空间)
  function doSplit(target, opts) {
    if (A.splitText) return A.splitText(target, opts);
    if (A.text && A.text.splitText) return A.text.splitText(target, opts);
    // anime.js <=4.5 兼容兜底；text.split 已弃用，仅在旧构建中调用。
    if (A.text && A.text.split) return A.text.split(target, opts);
    return { chars: [], words: [], lines: [] };
  }

  var DEFAULT_CHARS = '01#%＠ABXKQΔΣ力效感速势率';

  // scrambleOut 用的无状态哈希：由 seed/frame/index 直接得到字符，
  // 不依赖上一帧 RNG 状态，因此 HyperFrames 任意 seek 都得到同一画面。
  function seededChar(chars, seed, frame, index) {
    var x = (seed ^ Math.imul(frame + 1, 0x45d9f3b) ^ Math.imul(index + 1, 0x27d4eb2d)) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = (x ^ (x >>> 16)) >>> 0;
    return chars.charAt(x % chars.length);
  }

  // ============================================================
  // 生命周期
  // ============================================================
  var FX = {
    /** 装就绪桩 + 关引擎。compId 须与合成 root 的 data-composition-id 一致;durationSec 为合成时长。 */
    init: function (compId, durationSec) {
      _compId = compId;
      _durationMs = (durationSec || 0) * 1000;
      try { A.engine && A.engine.pause && A.engine.pause(); } catch (e) {}
      global.__timelines = global.__timelines || {};
      global.__timelines[compId] = {
        seek: function () {}, pause: function () {}, play: function () {},
        totalTime: function () { return 0; },
        duration: function () { return durationSec; },
        totalDuration: function () { return durationSec; }
      };
      global.__hfAnime = global.__hfAnime || [];
      return FX;
    },
    /** 全部实例定格到 0,消除字体/布局就绪前的首帧闪现。 */
    finalize: function () {
      var list = _hf();
      for (var i = 0; i < list.length; i++) {
        try { list[i].pause(); list[i].seek(0); } catch (e) {}
      }
      maybeStandalonePreview(list);
      return FX;
    },
    /** 手动注册自定义 anime 实例(高级:自己写的效果也想交给 HF seek)。 */
    register: reg,
    rng: rng
  };

  // ============================================================
  // ① 文字类
  // ============================================================
  FX.text = {
    /** 乱码解码入场。target 元素的最终文字=其当前 innerHTML(或传 text 覆盖)。 */
    scrambleIn: function (target, o) {
      try {
        o = Object.assign({ chars: DEFAULT_CHARS, revealRate: 14, settleDuration: 420,
          seed: 7, duration: 2000, at: 0, loop: 0, loopDelay: 700, text: undefined }, o || {});
        var scr = getScramble(); if (!scr) throw new Error('scrambleText 不可用');
        var p = { chars: o.chars, revealRate: o.revealRate, settleDuration: o.settleDuration, seed: o.seed };
        if (o.text != null) p.text = o.text;
        return reg(A.animate(target, {
          innerHTML: scr(p), duration: o.duration, delay: o.at,
          ease: 'linear', loop: o.loop, loopDelay: o.loopDelay
        }));
      } catch (e) { console.error('[anime-fx] text.scrambleIn', e); return null; }
    },

    /** 关键词轮播解码(官网「animate anything」同款)。words: 字符串数组。 */
    scrambleCycle: function (target, words, o) {
      try {
        o = Object.assign({ chars: DEFAULT_CHARS, revealRate: 16, seed: 7,
          scrambleDur: 1200, hold: 900, at: 0, loop: true }, o || {});
        var scr = getScramble(); if (!scr) throw new Error('scrambleText 不可用');
        // 无限循环 → 折算成覆盖全片的有限次数(官方契约),创建时就定好
        var iterMs = words.length * (o.scrambleDur + o.hold);
        var tl = A.createTimeline({ autoplay: false, loop: autoLoop(o.loop, iterMs) });
        var t = o.at;
        words.forEach(function (w, i) {
          tl.add(target, {
            innerHTML: scr({ text: w, chars: o.chars, revealRate: o.revealRate, seed: o.seed + i }),
            duration: o.scrambleDur, ease: 'linear'
          }, t);
          t += o.scrambleDur + o.hold;
        });
        return reg(tl);
      } catch (e) { console.error('[anime-fx] text.scrambleCycle', e); return null; }
    },

    /** 逐字浮入(split → 中心 stagger)。 */
    charsReveal: function (target, o) {
      try {
        o = Object.assign({ from: 'center', step: 34, duration: 760, ease: 'outExpo',
          y: 44, rotate: 6, at: 0 }, o || {});
        var chars = (doSplit(target, { chars: true, words: true }).chars) || [];
        if (!chars.length) throw new Error('split 无字符');
        afxSet(chars, { opacity: 0, translateY: o.y, rotate: o.rotate });
        return reg(A.animate(chars, {
          opacity: [0, 1], y: [o.y, 0], rotate: [o.rotate, 0],
          duration: o.duration, ease: o.ease,
          delay: A.stagger(o.step, { from: o.from, start: o.at })
        }));
      } catch (e) { console.error('[anime-fx] text.charsReveal', e); return null; }
    },

    /** 逐词上浮(标题入场)。 */
    wordsAppear: function (target, o) {
      try {
        o = Object.assign({ step: 75, duration: 900, ease: 'outQuint', y: 18, at: 0 }, o || {});
        var words = (doSplit(target, { words: true }).words) || [];
        if (!words.length) throw new Error('split 无词');
        afxSet(words, { opacity: 0, translateY: o.y });
        return reg(A.animate(words, {
          opacity: [0, 1], y: [o.y, 0], duration: o.duration, ease: o.ease,
          delay: A.stagger(o.step, { start: o.at, ease: 'outIn(2)' })
        }));
      } catch (e) { console.error('[anime-fx] text.wordsAppear', e); return null; }
    },

    /** 数字滚动递增。从 from 滚到 to，逐帧更新 textContent。decimals 小数位，separator 千分位，prefix/suffix 前后缀。 */
    countUp: function (target, o) {
      try {
        o = Object.assign({ from: 0, to: 100, duration: 1600, ease: 'out(3)',
          decimals: 0, prefix: '', suffix: '', separator: false, at: 0 }, o || {});
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) throw new Error('元素不存在: ' + target);
        var fmt = function (n) {
          var s = Number(n).toFixed(o.decimals);
          if (o.separator) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
          return o.prefix + s + o.suffix;
        };
        var driver = { v: o.from };
        var render = function () { el.textContent = fmt(driver.v); };
        var inst = A.animate(driver, { v: [o.from, o.to], duration: o.duration, delay: o.at,
          ease: o.ease, onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] text.countUp', e); return null; }
    },

    /** 高亮扫过。用线性渐变当「记号笔」铺在文字背后，背景宽度 0→100% 从左扫出（inline span 也稳）。 */
    highlightSweep: function (target, o) {
      try {
        o = Object.assign({ color: '#FFE14D', height: '42%', vpos: '86%', duration: 560, ease: 'inOutQuad', at: 0 }, o || {});
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) throw new Error('元素不存在: ' + target);
        el.style.backgroundImage = 'linear-gradient(' + o.color + ',' + o.color + ')';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = '0 ' + o.vpos;
        el.style.webkitBoxDecorationBreak = 'clone'; el.style.boxDecorationBreak = 'clone';
        var driver = { w: 0 };
        var render = function () { el.style.backgroundSize = driver.w + '% ' + o.height; };
        render();
        return reg(A.animate(driver, { w: [0, 100], duration: o.duration, delay: o.at, ease: o.ease, onUpdate: render, onRender: render }));
      } catch (e) { console.error('[anime-fx] text.highlightSweep', e); return null; }
    },

    /** 通用文字出场：淡出并上移，step>0 时可对多元素 stagger。 */
    exitFade: function (target, o) {
      try {
        o = Object.assign({ y: -24, duration: 480, ease: 'inQuart', step: 0,
          from: 'first', at: 0 }, o || {});
        var delay = o.step > 0
          ? A.stagger(o.step, { from: o.from, start: o.at })
          : o.at;
        return reg(A.animate(target, {
          opacity: [1, 0], y: [0, o.y], duration: o.duration,
          delay: delay, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] text.exitFade', e); return null; }
    },

    /** 确定性乱码出场：原文→乱码→消失。seed 必传。 */
    scrambleOut: function (target, o) {
      try {
        o = Object.assign({ chars: DEFAULT_CHARS, seed: null, duration: 1200,
          ease: 'linear', at: 0, text: undefined }, o || {});
        if (o.seed == null) throw new Error('scrambleOut 必须传 seed');
        if (!o.chars || !o.chars.length) throw new Error('chars 不能为空');
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) throw new Error('元素不存在: ' + target);
        var original = o.text != null ? String(o.text) : el.textContent;
        var driver = { t: 0 };
        var render = function () {
          var p = Math.max(0, Math.min(1, driver.t));
          var frame = Math.floor(p * 48);
          var scramble = Math.max(0, Math.min(1, (p - 0.08) / 0.62));
          var out = '';
          for (var i = 0; i < original.length; i++) {
            var ch = original.charAt(i);
            if (/\s/.test(ch) || scramble < (i + 1) / (original.length + 2) * 0.72) out += ch;
            else out += seededChar(o.chars, o.seed >>> 0, frame, i);
          }
          el.textContent = p >= 0.999 ? '' : out;
          el.style.opacity = String(p < 0.68 ? 1 : Math.max(0, 1 - (p - 0.68) / 0.32));
        };
        render();
        return reg(A.animate(driver, { t: [0, 1], duration: o.duration, delay: o.at,
          ease: o.ease, onRender: render, onUpdate: render }));
      } catch (e) { console.error('[anime-fx] text.scrambleOut', e); return null; }
    }
  };

  // ============================================================
  // ② 阵列 / 群组类
  // ============================================================
  FX.grid = {
    /** 网格中心涟漪。target 为容器;自动注入 cols×rows 个 .afx-dot。 */
    ripple: function (target, o) {
      try {
        o = Object.assign({ cols: 16, rows: 9, step: 120, duration: 580, from: 'center', at: 0,
          gap: 14, radius: 2, colorFrom: '#EDEDED', colorTo: '#E5251D',
          scale: [0.4, 1.2], opacity: [0.18, 1], loop: 16, alternate: true, ease: 'inOutSine' }, o || {});
        var box = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!box) throw new Error('容器不存在: ' + target);
        box.innerHTML = '';
        box.style.display = 'grid';
        box.style.gap = o.gap + 'px';
        box.style.gridTemplateColumns = 'repeat(' + o.cols + ', 1fr)';
        for (var i = 0; i < o.cols * o.rows; i++) {
          var d = document.createElement('div');
          d.className = 'afx-dot';
          d.style.cssText = 'width:100%;aspect-ratio:1/1;border-radius:' + o.radius +
            'px;background:' + o.colorFrom + ';transform-origin:center;will-change:transform,opacity,background-color;';
          box.appendChild(d);
        }
        return reg(A.animate(box.querySelectorAll('.afx-dot'), {
          scale: o.scale, opacity: o.opacity,
          backgroundColor: [o.colorFrom, o.colorTo],
          delay: A.stagger(o.step, { grid: [o.cols, o.rows], from: o.from, start: o.at }),
          duration: o.duration, ease: o.ease, loop: o.loop, alternate: o.alternate
        }));
      } catch (e) { console.error('[anime-fx] grid.ripple', e); return null; }
    }
  };

  FX.stagger = {
    /** 卡片弹簧错落入场(spring,带回弹)。selector 命中多个元素。 */
    cardsSpring: function (selector, o) {
      try {
        o = Object.assign({ from: 'center', step: 130, y: 60, scale: 0.86,
          stiffness: 120, damping: 11, mass: 1, at: 0 }, o || {});
        var ease;
        try {
          var springFactory = A.spring || A.createSpring;
          ease = springFactory({ stiffness: o.stiffness, damping: o.damping, mass: o.mass });
        }
        catch (e) { ease = 'outBack(1.7)'; }
        // 预隐藏,避免入场前闪现
        try { afxSet(selector, { opacity: 0 }); } catch (e) {}
        return reg(A.animate(selector, {
          opacity: [0, 1], y: [o.y, 0], scale: [o.scale, 1],
          ease: ease, duration: 900,
          delay: A.stagger(o.step, { from: o.from, start: o.at })
        }));
      } catch (e) { console.error('[anime-fx] stagger.cardsSpring', e); return null; }
    },

    /** 数值波(官网 transformStagger):某变换的「区间」本身按缓动在元素间分布,持续起伏。 */
    wave: function (selector, o) {
      try {
        o = Object.assign({ prop: 'y', range: [0, -28], waveEase: 'inOutSine', from: 'center',
          step: 60, duration: 700, loop: 14, alternate: true, ease: 'inOutSine', at: 0 }, o || {});
        var ts = function (value, ease, from2) {
          return function (el, i, t) { return A.stagger(value, { ease: ease, from: from2 })(el, i, t); };
        };
        var params = {
          delay: A.stagger(o.step, { from: o.from, start: o.at }),
          duration: o.duration, ease: o.ease, loop: o.loop, alternate: o.alternate
        };
        params[o.prop] = ts(o.range, o.waveEase, o.from);
        return reg(A.animate(selector, params));
      } catch (e) { console.error('[anime-fx] stagger.wave', e); return null; }
    },

    /** 清单逐条入场。多条列表项从一侧滑入+淡入，逐条 stagger。x<0 从左滑，设 y 则纵向。 */
    listCascade: function (selector, o) {
      try {
        o = Object.assign({ from: 'first', step: 110, x: -30, y: 0, duration: 620, ease: 'outExpo', at: 0 }, o || {});
        try { afxSet(selector, { opacity: 0 }); } catch (e) {}
        return reg(A.animate(selector, {
          opacity: [0, 1], x: [o.x, 0], y: [o.y, 0],
          duration: o.duration, ease: o.ease,
          delay: A.stagger(o.step, { from: o.from, start: o.at })
        }));
      } catch (e) { console.error('[anime-fx] stagger.listCascade', e); return null; }
    },

    /** 清单逆向出场：从最后一项开始，逐条滑出并淡出。 */
    cascadeOut: function (selector, o) {
      try {
        o = Object.assign({ from: 'last', step: 110, x: -30, y: 0,
          duration: 480, ease: 'inQuart', at: 0 }, o || {});
        return reg(A.animate(selector, {
          opacity: [1, 0], x: [0, o.x], y: [0, o.y],
          duration: o.duration, ease: o.ease,
          delay: A.stagger(o.step, { from: o.from, start: o.at })
        }));
      } catch (e) { console.error('[anime-fx] stagger.cascadeOut', e); return null; }
    }
  };

  // ============================================================
  // ③ SVG / 形状类
  // ============================================================
  FX.svg = {
    /** 路径描边生长(像手写划出)。target 为带 stroke 的 path/line。 */
    draw: function (target, o) {
      try {
        o = Object.assign({ at: 0, duration: 720, ease: 'inOutQuad' }, o || {});
        var drawable = afxSvg.createDrawable(target);
        return reg(A.animate(drawable, { draw: ['0 0', '0 1'], duration: o.duration, delay: o.at, ease: o.ease }));
      } catch (e) { console.error('[anime-fx] svg.draw', e); return null; }
    },

    /** 形状形变。from=源 path,to=目标 path 选择器。 */
    morph: function (fromTarget, toSelector, o) {
      try {
        o = Object.assign({ at: 0, duration: 1400, ease: 'inOutQuad', loop: 8, alternate: true }, o || {});
        return reg(A.animate(fromTarget, {
          d: afxSvg.morphTo(toSelector), duration: o.duration, delay: o.at,
          ease: o.ease, loop: o.loop, alternate: o.alternate
        }));
      } catch (e) { console.error('[anime-fx] svg.morph', e); return null; }
    }
  };

  FX.shape = {
    /** 方↔圆 形变 + 旋转脉冲。 */
    morphSquareCircle: function (target, o) {
      try {
        o = Object.assign({ duration: 1300, rotate: 90, scale: 1.5, ease: 'inOutQuad',
          loop: 8, alternate: true, at: 0 }, o || {});
        return reg(A.animate(target, {
          borderRadius: ['0%', '50%'], rotate: [0, o.rotate], scale: [1, o.scale],
          duration: o.duration, delay: o.at, ease: o.ease, loop: o.loop, alternate: o.alternate
        }));
      } catch (e) { console.error('[anime-fx] shape.morphSquareCircle', e); return null; }
    }
  };

  // ============================================================
  // ⑥ 数据可视化类(图表)
  // ============================================================
  FX.chart = {
    /** 条形图增长。条元素 scaleX(或 scaleY)0→1 长出，逐条 stagger。终值尺寸由 HTML/CSS 给。 */
    barGrow: function (selector, o) {
      try {
        o = Object.assign({ axis: 'x', step: 120, duration: 900, ease: 'outExpo', from: 'first', at: 0 }, o || {});
        var prop = o.axis === 'y' ? 'scaleY' : 'scaleX';
        var origin = o.axis === 'y' ? 'bottom center' : 'left center';
        var els = (typeof selector === 'string') ? document.querySelectorAll(selector) : selector;
        for (var i = 0; i < els.length; i++) { els[i].style.transformOrigin = origin; els[i].style.willChange = 'transform'; }
        var p = { duration: o.duration, ease: o.ease, delay: A.stagger(o.step, { from: o.from, start: o.at }) };
        p[prop] = [0, 1];
        return reg(A.animate(els, p));
      } catch (e) { console.error('[anime-fx] chart.barGrow', e); return null; }
    },

    /** 环形进度/占比。给一个带 stroke 的 <circle>/<path>(环)，描边从 0 画到 percent%。 */
    donutDraw: function (target, o) {
      try {
        o = Object.assign({ percent: 75, duration: 1200, ease: 'out(3)', at: 0 }, o || {});
        var pct = Math.max(0, Math.min(100, o.percent)) / 100;
        var drawable = afxSvg.createDrawable(target);
        return reg(A.animate(drawable, { draw: ['0 0', '0 ' + pct], duration: o.duration, delay: o.at, ease: o.ease }));
      } catch (e) { console.error('[anime-fx] chart.donutDraw', e); return null; }
    }
  };

  // ============================================================
  // ⑦ 转场类(遮罩擦除)
  // ============================================================
  FX.transition = {
    /** 擦除转场。在 target 上盖一块「盖板」(默认白，与卡底色一致)，盖板 scaleX/Y 1→0 退去，露出 target。
        dir: left/right/up/down = 揭开方向。cover = 盖板色(非白底卡要传)。用 transform，渲染稳。 */
    wipe: function (target, o) {
      try {
        o = Object.assign({ dir: 'left', duration: 700, ease: 'inOutQuad', at: 0, cover: '#fff' }, o || {});
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) throw new Error('元素不存在: ' + target);
        if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
        var originMap = { left: 'right center', right: 'left center', up: 'center bottom', down: 'center top' };
        var vertical = (o.dir === 'up' || o.dir === 'down');
        var cover = document.createElement('div');
        cover.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;background:' + o.cover +
          ';transform-origin:' + (originMap[o.dir] || 'right center') + ';z-index:5;will-change:transform;';
        el.appendChild(cover);
        var driver = { s: 1 };
        var render = function () { cover.style.transform = (vertical ? 'scaleY(' : 'scaleX(') + driver.s + ')'; };
        render();
        return reg(A.animate(driver, { s: [1, 0], duration: o.duration, delay: o.at, ease: o.ease, onUpdate: render, onRender: render }));
      } catch (e) { console.error('[anime-fx] transition.wipe', e); return null; }
    },

    /**
     * 玻璃卡片转场:一块「液态玻璃卡片」从舞台底部升到居中,用 `backdrop-filter` 折射它
     * **背后**的内容(渐变/标题/底图都会被玻璃弯曲、微凸、带厚边)。复用 glassReveal 的位移
     * 贴图与滤镜装配,但作为 backdrop-filter 套在卡片上(SourceGraphic = 背景)。卡片本身用
     * CSS blur+saturate 做磨砂(只作用卡片区域,不糊整图),加描边/高光/投影做玻璃体积。
     *
     * 入场用 anime 驱动卡片 transform(确定性、可 HF 逐帧导出)。卡片 `content`(可选 HTML)
     * 随卡片移动且保持清晰(不被折射),适合放标题/标签。
     *
     * 舞台 `stage` 须有明确宽高;本方法会给它设 `overflow:hidden`(否则升起前卡片露在底部)。
     * preset: 'apple'(温润磨砂,默认) | 'vivid'(清透强折射)。from: 'bottom'(默认) | 'top'。
     */
    glassRise: function (stage, o) {
      try {
        o = o || {};
        var preset = GLASS_PRESETS[o.preset] || GLASS_PRESETS.apple;
        var box = (typeof stage === 'string') ? document.querySelector(stage) : stage;
        if (!box) throw new Error('舞台不存在: ' + stage);
        var SW = box.clientWidth, SH = box.clientHeight;
        if (!SW || !SH) throw new Error('舞台需有明确宽高');
        if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.style.overflow = 'hidden';

        var cardW = o.cardW || Math.round(SW * 0.66);
        var cardH = o.cardH || Math.round(SH * 0.42);
        var radius = o.radius != null ? o.radius : Math.round(Math.min(cardW, cardH) * 0.12);

        // 卡片光学:低 curvature(微凸)+ 强 bend(玻璃厚边 meniscus),整卡铺满折射(depth 高)
        var dispScale = o.dispScale != null ? o.dispScale : 34;
        var dispersion = o.dispersion != null ? o.dispersion : preset.dispersion;
        var specular = o.specular != null ? o.specular : 0.7;
        var mapShape = Object.assign({
          depth: 0.95, curvature: 0.14, softEdge: true, clipToShape: true,
          sheen: 0.4, sheenWidth: Math.max(4, Math.round(Math.min(cardW, cardH) * 0.04)), sheenFalloff: 1.6,
          glow: 0.1, glowSpread: 1.0, bend: 0.5, bendWidth: 0.1, sheenAngle: 32
        }, o.map || {}, { lensHalfWidth: cardW / 2, lensHalfHeight: cardH / 2, borderRadius: radius });

        // 1) 贴图 + 滤镜(整卡铺满 → feImage 固定在 0,0)
        var mapUrl = genLensMap(o.mapSize || 512, mapShape);
        var f = buildGlassFilter({
          regionW: cardW, regionH: cardH, lensW: cardW, lensH: cardH,
          mapUrl: mapUrl, dispScale: dispScale, dispersion: dispersion, frost: 0, specular: specular
        });
        f.feImage.setAttribute('x', '0'); f.feImage.setAttribute('y', '0');

        // 2) 玻璃卡片 DOM(磨砂走 CSS,只作用 backdrop)
        var frost = o.frost != null ? o.frost : (o.preset === 'vivid' ? 2 : 8);
        var saturate = o.saturate != null ? o.saturate : 1.15;
        var tint = o.tint != null ? o.tint : 'rgba(255,255,255,.06)';
        var restTop = Math.round((SH - cardH) / 2 + (o.restY || 0));
        var leftPos = Math.round((SW - cardW) / 2 + (o.restX || 0));
        var bf = (frost > 0 ? ('blur(' + frost + 'px) ') : '') + (saturate !== 1 ? ('saturate(' + saturate + ') ') : '') + 'url(#' + f.id + ')';
        var card = document.createElement('div');
        card.setAttribute('data-afx-glass-card', f.id);
        card.style.cssText = 'position:absolute;left:' + leftPos + 'px;top:' + restTop + 'px;width:' + cardW + 'px;height:' + cardH + 'px;' +
          'border-radius:' + radius + 'px;background:' + tint + ';overflow:hidden;' +
          'border:1px solid rgba(255,255,255,.28);' +
          'box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 24px rgba(255,255,255,.06),0 30px 80px rgba(0,0,0,.45);' +
          'backdrop-filter:' + bf + ';-webkit-backdrop-filter:' + bf + ';will-change:transform;';
        if (o.content) {
          var inner = document.createElement('div');
          if (o.contentClass) inner.className = o.contentClass;
          inner.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;' +
            'align-items:' + (o.align || 'flex-start') + ';padding:' + (o.pad || '0 56px') + ';';
          inner.innerHTML = o.content;
          card.appendChild(inner);
        }
        box.appendChild(card);

        // 3) 入场:从舞台外(底/顶)滑到居中。anime 驱动 transform,确定性可导出。
        var fromBottom = o.from !== 'top';
        var startOffset = fromBottom ? (SH - restTop + 40) : -(restTop + cardH + 40);
        var period = o.period || 1200;
        afxSet(card, { y: startOffset });
        var inst = A.animate(card, {
          y: [startOffset, 0],
          duration: period, delay: o.at || 0, ease: o.ease || 'outExpo',
          loop: o.mode === 'breathe' ? autoLoop(true, period * 2) : (o.loop || 0),
          alternate: o.mode === 'breathe'
        });
        return reg(inst);
      } catch (e) { console.error('[anime-fx] transition.glassRise', e); return null; }
    }
  };

  // ============================================================
  // ⑧ 卡片 / 图片运动类
  // ============================================================
  FX.card = {
    /** Ken Burns 缓慢推拉/平移，给图片/卡注入呼吸感。默认时长=合成时长(全程)。 */
    kenBurns: function (target, o) {
      try {
        o = Object.assign({ scaleFrom: 1.0, scaleTo: 1.12, panX: 0, panY: -14,
          duration: _durationMs || 6000, ease: 'inOutSine', at: 0, loop: 0, alternate: false }, o || {});
        try { afxSet(target, { transformOrigin: 'center center' }); } catch (e) {}
        return reg(A.animate(target, {
          scale: [o.scaleFrom, o.scaleTo], x: [0, o.panX], y: [0, o.panY],
          duration: o.duration, delay: o.at, ease: o.ease, loop: o.loop, alternate: o.alternate
        }));
      } catch (e) { console.error('[anime-fx] card.kenBurns', e); return null; }
    }
  };

  // ============================================================
  // ⑤ 拆解类(官网 hero 同源思路:沿景深拉开分层 = 爆炸图)
  // ============================================================
  FX.explode = {
    /**
     * 2.5D 分层拆解(CSS 3D 爆炸图)。target=舞台容器;其子层(默认 .afx-layer)沿 Z 轴从合拢→炸开。
     * 舞台自动加 perspective + 倾斜,层叠子元素拉开景深;若层内有 .afx-label 子元素则随后淡入(技术标注感)。
     * 默认一次性炸开并停住;loop+alternate 可做「呼吸式」开合。
     */
    layers: function (target, o) {
      try {
        o = Object.assign({
          layerSel: '.afx-layer', labelSel: '.afx-label',
          spread: 90, perspective: 1500, tiltX: 16, tiltY: -24,
          from: 'first', step: 95, duration: 1100, ease: 'outExpo',
          rise: 0, center: true, at: 0, loop: 0, alternate: false
        }, o || {});
        var stage = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!stage) throw new Error('舞台不存在: ' + target);
        stage.style.transformStyle = 'preserve-3d';
        stage.style.transform = 'perspective(' + o.perspective + 'px) rotateX(' + o.tiltX + 'deg) rotateY(' + o.tiltY + 'deg)';
        var layers = stage.querySelectorAll(o.layerSel);
        var n = layers.length;
        if (!n) throw new Error('无层: ' + o.layerSel);
        var c = o.center ? (n - 1) / 2 : 0;
        layers.forEach(function (el, i) {
          el.style.willChange = 'transform, opacity';
          el.setAttribute('data-afx-z', ((i - c) * o.spread).toFixed(2));
        });
        afxSet(layers, { z: 0, opacity: 0 });
        var anim = A.animate(layers, {
          z: function (el) { return +el.getAttribute('data-afx-z'); },
          translateY: [0, o.rise],
          opacity: [0, 1],
          duration: o.duration, ease: o.ease,
          delay: A.stagger(o.step, { from: o.from, start: o.at }),
          loop: o.loop, alternate: o.alternate
        });
        reg(anim);
        var labels = stage.querySelectorAll(o.labelSel);
        if (labels.length) {
          afxSet(labels, { opacity: 0 });
          reg(A.animate(labels, {
            opacity: [0, 1], translateX: [-10, 0],
            duration: 520, ease: 'outExpo',
            delay: A.stagger(o.step, { from: o.from, start: o.at + o.duration * 0.55 })
          }));
        }
        return anim;
      } catch (e) { console.error('[anime-fx] explode.layers', e); return null; }
    }
  };

  // ============================================================
  // ④ Canvas 类(官网精髓:anime 驱动数值 + onRender 逐帧重绘)
  // ============================================================
  FX.canvas = {
    /**
     * 粒子场背景。canvasSel 为 <canvas>(须有 width/height 属性)。
     * anime 只驱动一个 driver.t(0→1 循环),onRender 里按 t + 每粒子 seeded 相位重绘。
     * link:true 时连近邻成网(官网常见「星座」效果)。
     */
    particles: function (canvasSel, o) {
      try {
        o = Object.assign({ count: 80, color: '#E5251D', radius: [1, 5], drift: 46, speed: 1,
          seed: 1, period: 6000, loop: true, link: false, linkDist: 140, linkColor: 'rgba(229,37,29,.18)',
          bg: null, at: 0 }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv || !cv.getContext) throw new Error('canvas 不存在: ' + canvasSel);
        var ctx = cv.getContext('2d');
        var W = cv.width, H = cv.height;
        var rand = rng(o.seed);
        var ps = [];
        for (var i = 0; i < o.count; i++) {
          ps.push({
            x: rand() * W, y: rand() * H,
            r: o.radius[0] + rand() * (o.radius[1] - o.radius[0]),
            ax: (0.3 + rand() * 0.7) * o.drift, ay: (0.3 + rand() * 0.7) * o.drift,
            fx: 0.6 + rand() * 1.6, fy: 0.6 + rand() * 1.6,
            ph: rand() * 6.2832
          });
        }
        var driver = { t: 0 };
        var TWO_PI = 6.2832;
        function draw() {
          if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H); }
          else ctx.clearRect(0, 0, W, H);
          var a = driver.t * TWO_PI;
          for (var j = 0; j < ps.length; j++) {
            var p = ps[j];
            var x = ((p.x + Math.cos(a * p.fx + p.ph) * p.ax) % W + W) % W;
            var y = ((p.y + Math.sin(a * p.fy + p.ph) * p.ay) % H + H) % H;
            p._x = x; p._y = y;
          }
          if (o.link) {
            ctx.strokeStyle = o.linkColor; ctx.lineWidth = 1;
            for (var m = 0; m < ps.length; m++) {
              for (var n = m + 1; n < ps.length; n++) {
                var dx = ps[m]._x - ps[n]._x, dy = ps[m]._y - ps[n]._y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < o.linkDist) {
                  ctx.globalAlpha = 1 - dist / o.linkDist;
                  ctx.beginPath(); ctx.moveTo(ps[m]._x, ps[m]._y); ctx.lineTo(ps[n]._x, ps[n]._y); ctx.stroke();
                }
              }
            }
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = o.color;
          for (var k = 0; k < ps.length; k++) {
            ctx.beginPath(); ctx.arc(ps[k]._x, ps[k]._y, ps[k].r, 0, TWO_PI); ctx.fill();
          }
        }
        var inst = A.animate(driver, {
          t: [0, 1], duration: o.period, delay: o.at, ease: 'linear', loop: autoLoop(o.loop, o.period),
          onRender: draw, onUpdate: draw
        });
        draw();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] canvas.particles', e); return null; }
    },

    /** 流场线条背景。多条 sum-of-sines 波形随 driver.t 流动，像流场/声波丝带。深色背景上最高级。 */
    flowField: function (canvasSel, o) {
      try {
        o = Object.assign({ lines: 9, color: 'rgba(229,37,29,.5)', lineWidth: 2, amp: 60,
          speed: 1, period: 8000, seed: 3, bg: null, at: 0 }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv || !cv.getContext) throw new Error('canvas 不存在: ' + canvasSel);
        var ctx = cv.getContext('2d'); var W = cv.width, H = cv.height;
        var rand = rng(o.seed);
        var L = [];
        for (var i = 0; i < o.lines; i++) {
          L.push({ y: (i + 0.5) / o.lines * H, ph: rand() * 6.2832, f1: 0.8 + rand() * 1.5, f2: 1.5 + rand() * 2 });
        }
        var driver = { t: 0 };
        function draw() {
          if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
          var a = driver.t * 6.2832 * o.speed;
          ctx.lineWidth = o.lineWidth; ctx.strokeStyle = o.color;
          for (var i = 0; i < L.length; i++) {
            var ln = L[i]; ctx.beginPath();
            for (var x = 0; x <= W; x += 8) {
              var yy = ln.y + Math.sin(x / W * 6.2832 * ln.f1 + a + ln.ph) * o.amp * 0.6
                            + Math.sin(x / W * 6.2832 * ln.f2 - a * 0.7 + ln.ph) * o.amp * 0.4;
              if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
            }
            ctx.stroke();
          }
        }
        var inst = A.animate(driver, { t: [0, 1], duration: o.period, delay: o.at, ease: 'linear',
          loop: autoLoop(true, o.period), onRender: draw, onUpdate: draw });
        draw();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] canvas.flowField', e); return null; }
    }
  };

  // ============================================================
  // ⑨ Three.js 类(实验):anime 驱动 driver.t + Three 渲染 → seek 可复现
  // ============================================================
  FX.three = {
    /**
     * 3D 轨道晶格:用 Three.js InstancedMesh 生成盒子阵列,anime 驱动 t 后逐帧 render。
     * 用法:ESM import three 后调用 AnimeFX.three.orbitGrid('#canvas', THREE, opts)。
     */
    orbitGrid: function (canvasSel, THREE, o) {
      try {
        if (!THREE) throw new Error('THREE 未传入');
        o = Object.assign({
          cols: 11, rows: 7, depth: 3, spacing: 1.08, cube: 0.62,
          bg: '#08090b', color: '#f4f3f0', accent: '#E5251D', muted: '#3b3d42',
          cameraZ: 10.5, fov: 42, period: 5200, seed: 7, pixelRatio: 1, at: 0
        }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv) throw new Error('canvas 不存在: ' + canvasSel);
        var W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
        if (!W || !H) throw new Error('canvas 需有明确宽高');
        cv.width = W; cv.height = H;

        var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
        renderer.setPixelRatio(o.pixelRatio);
        renderer.setSize(W, H, false);
        renderer.setClearColor(new THREE.Color(o.bg), 1);

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(o.fov, W / H, 0.1, 100);
        camera.position.set(0, 0, o.cameraZ);
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        var light = new THREE.DirectionalLight(0xffffff, 1.7);
        light.position.set(3, 5, 7);
        scene.add(light);

        var total = o.cols * o.rows * o.depth;
        var geo = new THREE.BoxGeometry(o.cube, o.cube, o.cube);
        // 几何体没有顶点色属性,开 vertexColors 会把实例色乘成全黑;
        // setColorAt 的实例色不依赖该开关。
        var mat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.42, metalness: 0.18
        });
        var mesh = new THREE.InstancedMesh(geo, mat, total);
        scene.add(mesh);

        var dummy = new THREE.Object3D();
        var c1 = new THREE.Color(o.color), c2 = new THREE.Color(o.accent), c3 = new THREE.Color(o.muted);
        var rand = rng(o.seed);
        var pts = [];
        for (var z = 0; z < o.depth; z++) {
          for (var y = 0; y < o.rows; y++) {
            for (var x = 0; x < o.cols; x++) {
              var px = (x - (o.cols - 1) / 2) * o.spacing;
              var py = ((o.rows - 1) / 2 - y) * o.spacing;
              var pz = (z - (o.depth - 1) / 2) * o.spacing * 0.9;
              pts.push({ x: px, y: py, z: pz, phase: rand() * 6.2832, ring: Math.sqrt(px * px + py * py + pz * pz) });
            }
          }
        }

        var driver = { t: 0 };
        function draw() {
          var t = driver.t, spin = t * 6.2832;
          mesh.rotation.y = Math.sin(spin) * 0.34 + spin * 0.08;
          mesh.rotation.x = Math.cos(spin * 0.76) * 0.18;
          for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            var wave = Math.sin(spin * 1.25 + p.phase + p.ring * 0.7);
            var pulse = 0.56 + 0.44 * ((wave + 1) / 2);
            dummy.position.set(p.x, p.y, p.z + wave * 0.72);
            dummy.rotation.set(spin * 0.45 + p.phase, spin * 0.32, spin * 0.24 + p.ring);
            dummy.scale.setScalar(pulse);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            var color = (i % 7 === 0) ? c2 : ((wave > 0.58) ? c1 : c3);
            mesh.setColorAt(i, color);
          }
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          renderer.render(scene, camera);
        }

        var inst = A.animate(driver, {
          t: [0, 1], duration: o.period, delay: o.at, ease: 'linear',
          loop: autoLoop(true, o.period), onRender: draw, onUpdate: draw
        });
        draw();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] three.orbitGrid', e); return null; }
    },

    /**
     * 3D 粒子形态场:Points 在 sphere / torus / box / helix 之间循环 morph。
     * 作为背景时不要依赖鼠标交互;所有运动由 driver.t 和 seed 决定。
     */
    particleMorph: function (canvasSel, THREE, o) {
      try {
        if (!THREE) throw new Error('THREE 未传入');
        o = Object.assign({
          count: 3200, size: 0.028, bg: '#f4f3f0', color: '#0a0a0a', accent: '#E5251D',
          cameraZ: 7, fov: 55, period: 9600, spin: 0.26, seed: 1, pixelRatio: 1, at: 0
        }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv) throw new Error('canvas 不存在: ' + canvasSel);
        var W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
        if (!W || !H) throw new Error('canvas 需有明确宽高');
        cv.width = W; cv.height = H;

        var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
        renderer.setPixelRatio(o.pixelRatio);
        renderer.setSize(W, H, false);
        renderer.setClearColor(new THREE.Color(o.bg), 1);
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(o.fov, W / H, 0.1, 100);
        camera.position.z = o.cameraZ;

        var rand = rng(o.seed);
        var N = o.count;
        function sphere() {
          var a = new Float32Array(N * 3);
          for (var i = 0; i < N; i++) {
            var u = rand() * 2 - 1, th = rand() * 6.2832, r = 2.55;
            var s = Math.sqrt(1 - u * u);
            a[i * 3] = Math.cos(th) * s * r; a[i * 3 + 1] = Math.sin(th) * s * r; a[i * 3 + 2] = u * r;
          }
          return a;
        }
        function torus() {
          var a = new Float32Array(N * 3);
          for (var i = 0; i < N; i++) {
            var u = (i / N) * 6.2832 * 16, v = rand() * 6.2832, R = 1.85, rr = 0.62;
            a[i * 3] = (R + rr * Math.cos(v)) * Math.cos(u);
            a[i * 3 + 1] = (R + rr * Math.cos(v)) * Math.sin(u);
            a[i * 3 + 2] = rr * Math.sin(v);
          }
          return a;
        }
        function box() {
          var a = new Float32Array(N * 3);
          for (var i = 0; i < N; i++) {
            var f = Math.floor(rand() * 6), u = rand() * 4 - 2, v = rand() * 4 - 2, s = 2;
            var x = 0, y = 0, z = 0;
            if (f < 2) { x = f === 0 ? s : -s; y = u; z = v; }
            else if (f < 4) { y = f === 2 ? s : -s; x = u; z = v; }
            else { z = f === 4 ? s : -s; x = u; y = v; }
            a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
          }
          return a;
        }
        function helix() {
          var a = new Float32Array(N * 3);
          for (var i = 0; i < N; i++) {
            var t = (i / N) * 6.2832 * 5.2, r = 2.2;
            a[i * 3] = Math.cos(t) * r; a[i * 3 + 1] = (i / N - 0.5) * 6.2; a[i * 3 + 2] = Math.sin(t) * r;
          }
          return a;
        }
        var shapes = [sphere(), torus(), box(), helix()];
        var pos = new Float32Array(N * 3);
        var colors = new Float32Array(N * 3);
        var base = new THREE.Color(o.color), acc = new THREE.Color(o.accent);
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        var mat = new THREE.PointsMaterial({ vertexColors: true, size: o.size, sizeAttenuation: true });
        var pts = new THREE.Points(geo, mat);
        scene.add(pts);

        var driver = { t: 0 };
        function draw() {
          var phase = driver.t * shapes.length;
          var aIdx = Math.floor(phase) % shapes.length;
          var bIdx = (aIdx + 1) % shapes.length;
          var k = phase - Math.floor(phase);
          k = k * k * (3 - 2 * k);
          var A0 = shapes[aIdx], B0 = shapes[bIdx];
          for (var i = 0; i < pos.length; i += 3) {
            var j = i / 3, shimmer = Math.sin(driver.t * 6.2832 * 2 + j * 0.017) * 0.07;
            pos[i] = A0[i] + (B0[i] - A0[i]) * k;
            pos[i + 1] = A0[i + 1] + (B0[i + 1] - A0[i + 1]) * k + shimmer;
            pos[i + 2] = A0[i + 2] + (B0[i + 2] - A0[i + 2]) * k;
            var c = j % 13 === 0 ? acc : base;
            colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
          }
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
          pts.rotation.y = driver.t * 6.2832 * o.spin;
          pts.rotation.x = Math.sin(driver.t * 6.2832) * 0.16;
          renderer.render(scene, camera);
        }
        var inst = A.animate(driver, { t: [0, 1], duration: o.period, delay: o.at, ease: 'linear',
          loop: autoLoop(true, o.period), onRender: draw, onUpdate: draw });
        draw();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] three.particleMorph', e); return null; }
    },

    /**
     * 3D 点阵波场:首页 hero 风格的大面积 Points 地形波,适合放在标题背后。
     */
    waveField: function (canvasSel, THREE, o) {
      try {
        if (!THREE) throw new Error('THREE 未传入');
        o = Object.assign({
          cols: 100, rows: 48, gap: 0.34, size: 0.028, bg: '#f4f3f0', color: '#0a0a0a',
          accent: '#E5251D', camera: [0, 2.2, 9], fov: 60, amp: 0.58, period: 9000,
          fog: 0.085, pixelRatio: 1, at: 0
        }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv) throw new Error('canvas 不存在: ' + canvasSel);
        var W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
        if (!W || !H) throw new Error('canvas 需有明确宽高');
        cv.width = W; cv.height = H;
        var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
        renderer.setPixelRatio(o.pixelRatio);
        renderer.setSize(W, H, false);
        renderer.setClearColor(new THREE.Color(o.bg), 1);
        var scene = new THREE.Scene();
        // 指数雾:远端点淡入背景 → 出地平线消隐、去掉原版顶部那条糊死的黑带
        if (o.fog > 0) scene.fog = new THREE.FogExp2(new THREE.Color(o.bg), o.fog);
        var camera = new THREE.PerspectiveCamera(o.fov, W / H, 0.1, 100);
        camera.position.set(o.camera[0], o.camera[1], o.camera[2]);
        camera.lookAt(0, 0, 0);

        var total = o.cols * o.rows;
        var pos = new Float32Array(total * 3);
        var baseX = new Float32Array(total), baseZ = new Float32Array(total), dist = new Float32Array(total);
        var k = 0;
        for (var x = 0; x < o.cols; x++) {
          for (var z = 0; z < o.rows; z++) {
            var px = (x - o.cols / 2) * o.gap;
            var pz = (z - o.rows / 2) * o.gap;
            baseX[k] = px; baseZ[k] = pz; dist[k] = Math.sqrt(px * px + pz * pz);
            pos[k * 3] = px; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = pz; k++;
          }
        }
        var col = new Float32Array(total * 3);
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        // 逐点上色 + 透明 → 波谷淡入背景、波峰压深;否则全是同一档黑点,看不出起伏
        var mat = new THREE.PointsMaterial({
          vertexColors: true, size: o.size, sizeAttenuation: true,
          transparent: true, depthWrite: false
        });
        var points = new THREE.Points(geo, mat);
        scene.add(points);
        var cInk = new THREE.Color(o.color), cBg = new THREE.Color(o.bg), cAcc = new THREE.Color(o.accent);

        var driver = { t: 0 };
        function draw() {
          var time = driver.t * 6.2832;
          var arr = geo.attributes.position.array, carr = geo.attributes.color.array;
          for (var i = 0; i < total; i++) {
            var raw = Math.sin(dist[i] * 0.7 - time * 1.4) * 0.55 + Math.sin(baseX[i] * 0.3 + time) * 0.2;
            arr[i * 3] = baseX[i];
            arr[i * 3 + 1] = raw * o.amp;
            arr[i * 3 + 2] = baseZ[i];
            var t01 = raw / 0.75; if (t01 < -1) t01 = -1; else if (t01 > 1) t01 = 1; t01 = (t01 + 1) * 0.5;
            var e = t01 * t01 * (3 - 2 * t01);           // smoothstep:把波谷点压向背景色 → "消失"
            var r = cBg.r + (cInk.r - cBg.r) * e, g = cBg.g + (cInk.g - cBg.g) * e, bl = cBg.b + (cInk.b - cBg.b) * e;
            if (t01 > 0.86) {                              // 最高的波峰点缀红色 accent
              var kk = (t01 - 0.86) / 0.14;
              r += (cAcc.r - r) * kk; g += (cAcc.g - g) * kk; bl += (cAcc.b - bl) * kk;
            }
            carr[i * 3] = r; carr[i * 3 + 1] = g; carr[i * 3 + 2] = bl;
          }
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
          points.rotation.y = Math.sin(time * 0.1) * 0.15;
          renderer.render(scene, camera);
        }
        var inst = A.animate(driver, { t: [0, 1], duration: o.period, delay: o.at, ease: 'linear',
          loop: autoLoop(true, o.period), onRender: draw, onUpdate: draw });
        draw();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] three.waveField', e); return null; }
    },

    /**
     * 真·GPU 流体墨(GPGPU Navier-Stokes):移植自 amix「Ink in Water」的稳定流体解算器
     * (Stam stable-fluids:advection → vorticity confinement → Jacobi 压力投影 → 梯度消散)。
     * 墨被注入流场后会真实地扩散、卷出墨丝、再随耗散淡去。
     *
     * 与库内其他效果不同:流体是「有状态」的,第 N 帧依赖第 N-1 帧。为保持确定性 + 可逐帧导出:
     *   - 固定步长(fps)+ 帧计数推进,不读真实时钟;
     *   - autoStir 自动注墨用 seeded RNG,同 seed → 同序列;
     *   - 任意「往回 seek」会从第 0 帧重算(顺序导出/播放则每帧只前进一步,开销极小)。
     * 默认无鼠标交互(导出友好);传 interactive:true 可在浏览器里额外开指针搅动。
     */
    inkFluid: function (canvasSel, THREE, o) {
      try {
        if (!THREE) throw new Error('THREE 未传入');
        o = Object.assign({
          bg: '#f4f3f0', color: '#0b0b0d', curl: 26, ink: 0.16, fade: 1.0, velFade: 0.45,
          flow: 0.85, splatForce: 6000, fps: 60, simRes: 128, dyeRes: 512, pressIter: 22,
          seed: 19, period: 9000, pixelRatio: 1.5, interactive: false, at: 0
        }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv) throw new Error('canvas 不存在: ' + canvasSel);
        var W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
        if (!W || !H) throw new Error('canvas 需有明确宽高');
        cv.width = W; cv.height = H;

        var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(o.pixelRatio, (global.devicePixelRatio || 1)));
        renderer.setSize(W, H, false);
        if (THREE.LinearSRGBColorSpace) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        // ── 全屏 quad 管线 ──
        var fsCam = new THREE.Camera();
        var fsScene = new THREE.Scene();
        var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        fsScene.add(quad);
        function blit(material, target) { quad.material = material; renderer.setRenderTarget(target || null); renderer.render(fsScene, fsCam); }

        var VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
        function mat(frag, uniforms) { return new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VERT, fragmentShader: 'precision highp float;\nvarying vec2 vUv;\n' + frag, depthTest: false, depthWrite: false }); }

        function makeRT(w, h) {
          var t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
            wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
          t.texture.generateMipmaps = false; return t;
        }
        function dbl(w, h) { var a = makeRT(w, h), b = makeRT(w, h); return { width: w, height: h,
          get read() { return a; }, get write() { return b; }, swap: function () { var t = a; a = b; b = t; } }; }

        // 仿真栅格保持画面长宽比
        function res(base) { var a = W / H; if (a < 1) a = 1 / a; var mn = Math.round(base), mx = Math.round(base * a);
          return W > H ? { w: mx, h: mn } : { w: mn, h: mx }; }
        var SIM = res(o.simRes), DYE = res(o.dyeRes);
        var simTexel = new THREE.Vector2(1 / SIM.w, 1 / SIM.h);
        var aspect = W / H;

        var velocity = dbl(SIM.w, SIM.h), dye = dbl(DYE.w, DYE.h);
        var divergence = makeRT(SIM.w, SIM.h), curlRT = makeRT(SIM.w, SIM.h), pressure = dbl(SIM.w, SIM.h);

        var advectMat = mat(
          'uniform sampler2D uVelocity, uSource; uniform vec2 texelSize; uniform float dt, dissipation;' +
          'void main(){ vec2 coord = vUv - dt * texture2D(uVelocity,vUv).xy * texelSize;' +
          ' gl_FragColor = texture2D(uSource,coord) / (1.0 + dissipation*dt); }',
          { uVelocity: { value: null }, uSource: { value: null }, texelSize: { value: simTexel }, dt: { value: 0.016 }, dissipation: { value: 0.2 } });

        var divMat = mat(
          'uniform sampler2D uVelocity; uniform vec2 texelSize;' +
          'void main(){ float L=texture2D(uVelocity,vUv-vec2(texelSize.x,0.0)).x; float R=texture2D(uVelocity,vUv+vec2(texelSize.x,0.0)).x;' +
          ' float B=texture2D(uVelocity,vUv-vec2(0.0,texelSize.y)).y; float T=texture2D(uVelocity,vUv+vec2(0.0,texelSize.y)).y;' +
          ' gl_FragColor=vec4(0.5*(R-L+T-B),0.0,0.0,1.0); }',
          { uVelocity: { value: null }, texelSize: { value: simTexel } });

        var curlMat = mat(
          'uniform sampler2D uVelocity; uniform vec2 texelSize;' +
          'void main(){ float L=texture2D(uVelocity,vUv-vec2(texelSize.x,0.0)).y; float R=texture2D(uVelocity,vUv+vec2(texelSize.x,0.0)).y;' +
          ' float B=texture2D(uVelocity,vUv-vec2(0.0,texelSize.y)).x; float T=texture2D(uVelocity,vUv+vec2(0.0,texelSize.y)).x;' +
          ' gl_FragColor=vec4(0.5*((R-L)-(T-B)),0.0,0.0,1.0); }',
          { uVelocity: { value: null }, texelSize: { value: simTexel } });

        var vortMat = mat(
          'uniform sampler2D uVelocity, uCurl; uniform vec2 texelSize; uniform float curl, dt;' +
          'void main(){ float L=texture2D(uCurl,vUv-vec2(texelSize.x,0.0)).x; float R=texture2D(uCurl,vUv+vec2(texelSize.x,0.0)).x;' +
          ' float B=texture2D(uCurl,vUv-vec2(0.0,texelSize.y)).x; float T=texture2D(uCurl,vUv+vec2(0.0,texelSize.y)).x; float C=texture2D(uCurl,vUv).x;' +
          ' vec2 force=0.5*vec2(abs(T)-abs(B), abs(R)-abs(L)); force/=length(force)+1e-4; force*=curl*C; force.y*=-1.0;' +
          ' vec2 vel=texture2D(uVelocity,vUv).xy + force*dt; gl_FragColor=vec4(clamp(vel,-1000.0,1000.0),0.0,1.0); }',
          { uVelocity: { value: null }, uCurl: { value: null }, texelSize: { value: simTexel }, curl: { value: o.curl }, dt: { value: 0.016 } });

        var pressMat = mat(
          'uniform sampler2D uPressure, uDivergence; uniform vec2 texelSize;' +
          'void main(){ float L=texture2D(uPressure,vUv-vec2(texelSize.x,0.0)).x; float R=texture2D(uPressure,vUv+vec2(texelSize.x,0.0)).x;' +
          ' float B=texture2D(uPressure,vUv-vec2(0.0,texelSize.y)).x; float T=texture2D(uPressure,vUv+vec2(0.0,texelSize.y)).x; float d=texture2D(uDivergence,vUv).x;' +
          ' gl_FragColor=vec4((L+R+B+T-d)*0.25,0.0,0.0,1.0); }',
          { uPressure: { value: null }, uDivergence: { value: null }, texelSize: { value: simTexel } });

        var gradMat = mat(
          'uniform sampler2D uPressure, uVelocity; uniform vec2 texelSize;' +
          'void main(){ float L=texture2D(uPressure,vUv-vec2(texelSize.x,0.0)).x; float R=texture2D(uPressure,vUv+vec2(texelSize.x,0.0)).x;' +
          ' float B=texture2D(uPressure,vUv-vec2(0.0,texelSize.y)).x; float T=texture2D(uPressure,vUv+vec2(0.0,texelSize.y)).x;' +
          ' vec2 vel=texture2D(uVelocity,vUv).xy - 0.5*vec2(R-L,T-B); gl_FragColor=vec4(vel,0.0,1.0); }',
          { uPressure: { value: null }, uVelocity: { value: null }, texelSize: { value: simTexel } });

        var clearMat = mat(
          'uniform sampler2D uTexture; uniform float value; void main(){ gl_FragColor=value*texture2D(uTexture,vUv); }',
          { uTexture: { value: null }, value: { value: 0.8 } });

        var splatMat = mat(
          'uniform sampler2D uTarget; uniform float aspectRatio, radius; uniform vec3 color; uniform vec2 point;' +
          'void main(){ vec2 p=vUv-point; p.x*=aspectRatio; vec3 splat=exp(-dot(p,p)/radius)*color;' +
          ' gl_FragColor=vec4(texture2D(uTarget,vUv).xyz+splat,1.0); }',
          { uTarget: { value: null }, aspectRatio: { value: 1 }, radius: { value: 0.0025 }, color: { value: new THREE.Vector3() }, point: { value: new THREE.Vector2() } });

        // 输出走 LinearSRGBColorSpace = 着色器值原样写入画布(不做 linear→sRGB 编码),
        // 所以这里要喂「字面 sRGB 分量」而非 THREE.Color(会把 hex 当 sRGB 转成 linear → 画布偏暗、
        // 跟周围 CSS #f4f3f0 对不上)。直接解析 hex 保证像素级匹配参考站。
        function hex01(h) {
          h = String(h || '').trim().replace('#', '');
          if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
          var n = parseInt(h, 16) || 0;
          return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        }
        var displayMat = mat(
          'uniform sampler2D uDye; uniform vec3 paper, ink;' +
          'void main(){ float c=texture2D(uDye,vUv).x; float a=clamp(1.0-exp(-c*2.3),0.0,1.0);' +
          ' vec3 col=mix(paper,ink,a); vec2 q=vUv-0.5; col*=1.0-0.10*dot(q,q); gl_FragColor=vec4(col,1.0); }',
          { uDye: { value: null }, paper: { value: hex01(o.bg) }, ink: { value: hex01(o.color) } });

        function splatRadius() { var r = 0.0022; if (aspect > 1) r *= aspect; return r; }
        function splat(x, y, dx, dy, ink) {
          splatMat.uniforms.aspectRatio.value = aspect;
          splatMat.uniforms.radius.value = splatRadius();
          splatMat.uniforms.point.value.set(x, y);
          splatMat.uniforms.uTarget.value = velocity.read.texture;
          splatMat.uniforms.color.value.set(dx, dy, 0.0);
          blit(splatMat, velocity.write); velocity.swap();
          splatMat.uniforms.uTarget.value = dye.read.texture;
          splatMat.uniforms.color.value.set(ink, ink, ink);
          blit(splatMat, dye.write); dye.swap();
        }
        function clearField(field) {
          clearMat.uniforms.value.value = 0.0;
          clearMat.uniforms.uTexture.value = field.read.texture;
          blit(clearMat, field.write); field.swap();
        }

        // 确定性自动注墨:由帧号调度(不读时钟),seeded RNG → 同 seed 可复现
        var stirSeed = (o.seed * 101 + 7) >>> 0;
        var rndStir, nextStir;
        function seedInitial() {
          for (var kk = 0; kk < 5; kk++) { var a = kk / 5 * 6.2832; splat(0.5 + Math.cos(a) * 0.12, 0.5 + Math.sin(a) * 0.12, Math.cos(a) * 220, Math.sin(a) * 220, 0.22); }
        }
        function reset() {
          clearField(velocity); clearField(dye); clearField(pressure);
          rndStir = rng(stirSeed); nextStir = 0; simFrame = 0;
          seedInitial();
        }
        function autoStir(frame) {
          if (o.flow <= 0) return;
          if (frame < nextStir) return;
          nextStir = frame + Math.round((1.3 + rndStir() * 1.6) * o.fps);
          var x = 0.2 + rndStir() * 0.6, y = 0.2 + rndStir() * 0.6, a = rndStir() * 6.2832, s = (70 + rndStir() * 110) * o.flow;
          splat(x, y, Math.cos(a) * s, Math.sin(a) * s, o.ink * 0.9);
        }
        // 浏览器实时预览的可选指针搅动(导出/HF 驱动时不触发)
        var queue = [];
        if (o.interactive && cv.addEventListener) {
          var pX = 0, pY = 0, hasPrev = false;
          var toUV = function (e) { var b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, 1.0 - (e.clientY - b.top) / b.height]; };
          cv.addEventListener('pointermove', function (e) {
            var uv = toUV(e), x = uv[0], y = uv[1];
            if (hasPrev) { var dx = (x - pX) * o.splatForce, dy = (y - pY) * o.splatForce;
              dx = Math.max(-440, Math.min(440, dx)); dy = Math.max(-440, Math.min(440, dy));
              if (Math.abs(dx) + Math.abs(dy) > 0.5) queue.push([x, y, dx, dy, o.ink]); }
            pX = x; pY = y; hasPrev = true;
          });
          cv.addEventListener('pointerleave', function () { hasPrev = false; });
        }

        var dt = 1 / o.fps;
        var simFrame = 0;
        var totalFrames = Math.max(1, Math.round((o.period / 1000) * o.fps));
        function stepOnce() {
          for (var qi = 0; qi < queue.length; qi++) { var s = queue[qi]; splat(s[0], s[1], s[2], s[3], s[4]); }
          queue.length = 0;
          autoStir(simFrame);

          curlMat.uniforms.uVelocity.value = velocity.read.texture; blit(curlMat, curlRT);
          vortMat.uniforms.uVelocity.value = velocity.read.texture; vortMat.uniforms.uCurl.value = curlRT.texture;
          vortMat.uniforms.curl.value = o.curl; vortMat.uniforms.dt.value = dt;
          blit(vortMat, velocity.write); velocity.swap();

          divMat.uniforms.uVelocity.value = velocity.read.texture; blit(divMat, divergence);
          clearMat.uniforms.uTexture.value = pressure.read.texture; clearMat.uniforms.value.value = 0.8;
          blit(clearMat, pressure.write); pressure.swap();
          pressMat.uniforms.uDivergence.value = divergence.texture;
          for (var pi = 0; pi < o.pressIter; pi++) { pressMat.uniforms.uPressure.value = pressure.read.texture; blit(pressMat, pressure.write); pressure.swap(); }
          gradMat.uniforms.uPressure.value = pressure.read.texture; gradMat.uniforms.uVelocity.value = velocity.read.texture;
          blit(gradMat, velocity.write); velocity.swap();

          advectMat.uniforms.dt.value = dt;
          advectMat.uniforms.uVelocity.value = velocity.read.texture; advectMat.uniforms.uSource.value = velocity.read.texture;
          advectMat.uniforms.dissipation.value = o.velFade; blit(advectMat, velocity.write); velocity.swap();
          advectMat.uniforms.uVelocity.value = velocity.read.texture; advectMat.uniforms.uSource.value = dye.read.texture;
          advectMat.uniforms.dissipation.value = o.fade; blit(advectMat, dye.write); dye.swap();
        }

        var driver = { t: 0 };
        function draw() {
          var target = Math.round(driver.t * totalFrames);
          if (target < simFrame) reset();        // 往回 seek → 从头重算(确定性)
          while (simFrame < target) { stepOnce(); simFrame++; }
          displayMat.uniforms.uDye.value = dye.read.texture;
          blit(displayMat, null);
        }
        reset();                                  // 装入开局 5 笔种子墨
        draw();
        var inst = A.animate(driver, { t: [0, 1], duration: o.period, delay: o.at, ease: 'linear',
          loop: autoLoop(true, o.period), onRender: draw, onUpdate: draw });
        return reg(inst);
      } catch (e) { console.error('[anime-fx] three.inkFluid', e); return null; }
    }
  };

  // ============================================================
  // 液态玻璃工具(hero.glassReveal 用):位移贴图生成 + SVG 滤镜组装
  // 移植自 samasante/liquid-glass · displacement.ts(纯 canvas,无 React)。
  // R/G = X/Y 位移(128=中性),B = 镜面 mask。只算左上 1/4 再镜像。
  // ============================================================
  var _ERF_K = Math.sqrt(Math.PI);
  function _erf(x) { return Math.tanh(_ERF_K * x); }
  function _encAxis(s) { return ((0.5 + s) * 255 + 0.5) | 0; }
  function _encSpec(s) { return (127 * s + 128 + 0.5) | 0; }
  function _domeMean(R, H) { return H > 0 ? (R - Math.sqrt(R * R - H * H)) / H : 0; }
  function _domeConsts(capDepth, halfW, halfH) {
    var cap = Math.max(0.01, Math.min(capDepth, Math.min(halfW, halfH) - 1));
    var Rx = (halfW * halfW + cap * cap) / (2 * cap);
    var Ry = (halfH * halfH + cap * cap) / (2 * cap);
    var meanX = _domeMean(Rx, halfW), meanY = _domeMean(Ry, halfH);
    return { Rx: Rx, Ry: Ry, scaleX: meanX > 0 ? 0.5 / meanX : 1, scaleY: meanY > 0 ? 0.5 / meanY : 1 };
  }
  function _domeGrad(distance, R, scale) {
    var inside = Math.min(distance, R * (1 - 1e-3));
    return (inside / Math.sqrt(R * R - inside * inside)) * scale;
  }

  // 生成液态玻璃位移贴图(返回 PNG dataURL)。形状/光学不随帧变 → 每个效果只调一次。
  function genLensMap(size, shape) {
    var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    var ctx = cv.getContext('2d'); var image = ctx.createImageData(size, size);
    var halfW = shape.lensHalfWidth, halfH = shape.lensHalfHeight, borderRadius = shape.borderRadius;
    var depth = shape.depth;
    var clipToShape = shape.clipToShape !== false, softEdge = shape.softEdge !== false;
    var sheenAngle = shape.sheenAngle != null ? shape.sheenAngle : 45;
    var glow = shape.glow || 0, glowSpread = shape.glowSpread != null ? shape.glowSpread : 1;
    var glowFalloff = shape.glowFalloff != null ? shape.glowFalloff : 1.5;
    var sheen = shape.sheen || 0, sheenWidth = shape.sheenWidth != null ? shape.sheenWidth : 3;
    var sheenFalloff = shape.sheenFalloff != null ? shape.sheenFalloff : 1.5;
    var curvature = shape.curvature || 0, splay = shape.splay || 0;
    var bend = shape.bend || 0, bendWidth = shape.bendWidth != null ? shape.bendWidth : 0.16;
    var data = image.data, half = size >> 1;
    var radius = Math.min(borderRadius, Math.min(halfW, halfH));
    var minHalf = Math.min(halfW, halfH);
    var depthPx = Math.min(depth * minHalf, minHalf - 1);
    var innerHalfW = Math.max(0, halfW - depthPx), innerHalfH = Math.max(0, halfH - depthPx);
    var innerRadius = Math.max(0, Math.min(borderRadius, Math.min(innerHalfW, innerHalfH)));
    var falloff = depthPx > 0 ? Math.SQRT1_2 / depthPx : 1e6;
    var hasSpecular = glow > 0 || sheen > 0;
    var angle = sheenAngle * Math.PI / 180, cosA = Math.cos(angle), sinA = Math.sin(angle);
    var edgeInv = sheenWidth > 0 ? 1 / sheenWidth : 0;
    var glowReachInv = 1 / Math.max(2, glowSpread * Math.min(halfW, halfH));
    var stepX = (2 * halfW) / size, stepY = (2 * halfH) / size;
    var invW = 1 / halfW, invH = 1 / halfH;
    var hasDome = curvature > 0, domeCap = curvature * Math.min(halfW, halfH);
    var hasSplay = splay > 0;
    var hasEdgeRefract = bend > 0, erInv = 1 / Math.max(2, bendWidth * Math.min(halfW, halfH));
    var dome = hasDome ? _domeConsts(domeCap, halfW, halfH) : null;
    function cornerDistance(ox, oy) { return (ox > 0 || oy > 0) ? Math.sqrt(ox * ox + oy * oy) : 0; }
    var lut = null;
    if (hasDome) {
      lut = new Float32Array(half);
      var r2 = dome.Rx * dome.Rx, rMax = dome.Rx * (1 - 1e-3);
      for (var lc = 0; lc < half; lc++) {
        var lpx = -((lc + 0.5) * stepX - halfW);
        var lcl = lpx < rMax ? lpx : rMax;
        lut[lc] = (lcl / Math.sqrt(r2 - lcl * lcl)) * dome.scaleX;
      }
    }
    var splayHalf = 0.5 * Math.min(halfW, halfH), splayInv = splayHalf > 0 ? 1 / splayHalf : 0;
    var sheenNorm = Math.SQRT1_2;
    for (var row = 0; row < half; row++) {
      var mirrorRow = size - 1 - row;
      var py = -((row + 0.5) * stepY - halfH);
      var edgeY = py - halfH + radius;
      var innerEdgeY = softEdge ? py - innerHalfH + innerRadius : 0;
      var dirYBase = hasDome ? _domeGrad(py, dome.Ry, dome.scaleY) : (py * invH > 1 ? 1 : py * invH);
      var normY = py * invH > 1 ? 1 : py * invH;
      var splayY = hasSplay ? Math.max(0, 1 - (halfH - py) * splayInv) : 0;
      var rowBase = row * size, mirrorRowBase = mirrorRow * size;
      for (var col = 0; col < half; col++) {
        var mirrorCol = size - 1 - col;
        var px = -((col + 0.5) * stepX - halfW);
        var edgeX = px - halfW + radius;
        var sdf = cornerDistance(edgeX > 0 ? edgeX : 0, edgeY > 0 ? edgeY : 0)
          + (edgeX > edgeY ? (edgeX > 0 ? 0 : edgeX) : (edgeY > 0 ? 0 : edgeY)) - radius;
        var i00 = (rowBase + col) * 4, i01 = (rowBase + mirrorCol) * 4,
            i10 = (mirrorRowBase + col) * 4, i11 = (mirrorRowBase + mirrorCol) * 4;
        if (clipToShape && sdf >= 0) {
          var nb = [i00, i01, i10, i11];
          for (var ni = 0; ni < 4; ni++) { var idx = nb[ni]; data[idx] = 128; data[idx + 1] = 128; data[idx + 2] = 128; data[idx + 3] = 255; }
          continue;
        }
        var dirX = lut ? lut[col] : (px * invW > 1 ? 1 : px * invW);
        var dirY = dirYBase;
        if (hasSplay) {
          var yAtt = splayY * splay, xAtt = Math.max(0, 1 - (halfW - px) * splayInv) * splay;
          if (yAtt > 0.001 || xAtt > 0.001) {
            var prevX = dirX, prevY = dirY;
            dirX = prevX * (1 - yAtt); dirY = prevY * (1 - xAtt);
            var prevLen = Math.sqrt(prevX * prevX + prevY * prevY), nextLen = Math.sqrt(dirX * dirX + dirY * dirY);
            if (nextLen > 0.001) { var rstr = prevLen / nextLen; dirX *= rstr; dirY *= rstr; }
          }
        }
        var edgeOpacity = 1;
        if (softEdge) {
          var ix = px - innerHalfW + innerRadius;
          var innerSdf = cornerDistance(ix > 0 ? ix : 0, innerEdgeY > 0 ? innerEdgeY : 0)
            + (ix > innerEdgeY ? (ix > 0 ? 0 : ix) : (innerEdgeY > 0 ? 0 : innerEdgeY)) - innerRadius;
          edgeOpacity = 0.5 * (1 + _erf(innerSdf * falloff));
        }
        var dx = 0.5 * dirX * edgeOpacity, dy = 0.5 * dirY * edgeOpacity;
        if (hasEdgeRefract) {
          var s = sdf < 0 ? Math.max(0, 1 + sdf * erInv) : 0;
          if (s > 0) {
            var len = Math.sqrt(dirX * dirX + dirY * dirY);
            if (len > 1e-4) { var m = 6.75 * s * s * (1 - s), a = (0.5 * bend * m * edgeOpacity) / len; dx += dirX * a; dy += dirY * a; }
          }
        }
        var specMain = 0, specCross = 0;
        if (hasSpecular) {
          var normX = px * invW > 1 ? 1 : px * invW;
          var axisMain = Math.min(1, Math.abs(normX * cosA + normY * sinA) * sheenNorm);
          var axisCross = Math.min(1, Math.abs(normX * cosA - normY * sinA) * sheenNorm);
          if (sheen > 0) {
            var band = sdf < 0 ? Math.max(0, 1 + sdf * edgeInv) : 0;
            var b = sheen * Math.pow(band, sheenFalloff);
            specMain += b * (0.16 + 0.84 * Math.pow(axisMain, 1.6));
            specCross += b * (0.16 + 0.84 * Math.pow(axisCross, 1.6));
          }
          if (glow > 0) {
            var reach = sdf < 0 ? Math.min(1, -sdf * glowReachInv) : 1;
            var tt = 1 - reach, g = glow * Math.pow(tt * tt * (3 - 2 * tt), glowFalloff) * edgeOpacity;
            specMain += g * (0.6 + 0.4 * axisMain); specCross += g * (0.6 + 0.4 * axisCross);
          }
          if (specMain > 1) specMain = 1; else if (specMain < -1) specMain = -1;
          if (specCross > 1) specCross = 1; else if (specCross < -1) specCross = -1;
        }
        var rPos = _encAxis(dx), rNeg = _encAxis(-dx), gPos = _encAxis(dy), gNeg = _encAxis(-dy);
        var bMain = _encSpec(specMain), bCross = _encSpec(specCross);
        data[i00] = rPos; data[i00 + 1] = gPos; data[i00 + 2] = bMain; data[i00 + 3] = 255;
        data[i01] = rNeg; data[i01 + 1] = gPos; data[i01 + 2] = bCross; data[i01 + 3] = 255;
        data[i10] = rPos; data[i10 + 1] = gNeg; data[i10 + 2] = bCross; data[i10 + 3] = 255;
        data[i11] = rNeg; data[i11 + 1] = gNeg; data[i11 + 2] = bMain; data[i11 + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return cv.toDataURL();
  }

  // SVG 命名空间助手 + 唯一 id 计数(避免一页多个玻璃效果撞 filter id)
  var SVGNS = 'http://www.w3.org/2000/svg';
  var _glassId = 0;
  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // 组装液态玻璃 SVG 滤镜,挂进 document,返回 { id, feImage, dispNodes }。
  // 折射目标(SourceGraphic)= 应用此滤镜的元素;贴图只覆盖 lens 矩形,其余中性灰不位移。
  function buildGlassFilter(opt) {
    var id = 'afx-glass-' + (++_glassId);
    var svg = svgEl('svg', { width: '0', height: '0', 'aria-hidden': 'true' });
    svg.style.position = 'absolute'; svg.style.width = '0'; svg.style.height = '0';
    var defs = svgEl('defs');
    var filter = svgEl('filter', {
      id: id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB', x: '0', y: '0', width: String(opt.regionW), height: String(opt.regionH)
    });
    var src = 'SourceGraphic';
    // 磨砂:先把折射源高斯模糊。⚠️ 已知局限——blur 作用在整个 SourceGraphic 上,而
    // lens 外位移为 0,所以 frost>0 会糊「整个 target」而非只糊玻璃下方。真磨砂需再加
    // 一层随帧移动的 lens 形状 mask 把结果裁切回玻璃区(roadmap 收尾项);故预设暂置 0。
    if (opt.frost > 0) {
      filter.appendChild(svgEl('feGaussianBlur', { 'in': 'SourceGraphic', stdDeviation: String(opt.frost), result: 'blurred' }));
      src = 'blurred';
    }
    filter.appendChild(svgEl('feFlood', { 'flood-color': 'rgb(128,128,128)', 'flood-opacity': '1', result: 'mapBg' }));
    var feImage = svgEl('feImage', { preserveAspectRatio: 'none', result: 'rawMap' });
    feImage.setAttribute('href', opt.mapUrl);
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', opt.mapUrl); // 老内核兜底
    feImage.setAttribute('width', String(opt.lensW));
    feImage.setAttribute('height', String(opt.lensH));
    filter.appendChild(feImage);
    filter.appendChild(svgEl('feComposite', { 'in': 'rawMap', in2: 'mapBg', operator: 'over', result: 'map' }));
    var dispNodes = [];
    var SPREAD = 0.22;
    if (opt.dispersion > 0) {
      var passes = [
        { scale: opt.dispScale * (1 + SPREAD * 0.5 * opt.dispersion), mat: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'refractR' },
        { scale: opt.dispScale, mat: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'refractG' },
        { scale: opt.dispScale * (1 - SPREAD * 0.5 * opt.dispersion), mat: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'refractB' }
      ];
      for (var p = 0; p < 3; p++) {
        var dn = svgEl('feDisplacementMap', { 'in': src, in2: 'map', scale: String(passes[p].scale), xChannelSelector: 'R', yChannelSelector: 'G' });
        filter.appendChild(dn); dispNodes.push(dn);
        filter.appendChild(svgEl('feColorMatrix', { type: 'matrix', values: passes[p].mat, result: passes[p].result }));
      }
      filter.appendChild(svgEl('feComposite', { 'in': 'refractR', in2: 'refractG', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'refractRG' }));
      filter.appendChild(svgEl('feComposite', { 'in': 'refractRG', in2: 'refractB', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0', result: 'lensOut' }));
    } else {
      var dn0 = svgEl('feDisplacementMap', { 'in': src, in2: 'map', scale: String(opt.dispScale), xChannelSelector: 'R', yChannelSelector: 'G', result: 'lensOut' });
      filter.appendChild(dn0); dispNodes.push(dn0);
    }
    // 镜面高光:从贴图 B 通道提白,加性叠到折射结果上
    if (opt.specular > 0) {
      filter.appendChild(svgEl('feColorMatrix', {
        'in': 'map', type: 'matrix',
        values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ' + opt.specular + ' 0 ' + (-128 / 255 * opt.specular),
        result: 'sheenMask'
      }));
      filter.appendChild(svgEl('feComposite', { 'in': 'sheenMask', in2: 'lensOut', operator: 'arithmetic', k1: '0', k2: '1', k3: '1', k4: '0' }));
    }
    defs.appendChild(filter); svg.appendChild(defs); document.body.appendChild(svg);
    return { id: id, svg: svg, feImage: feImage, dispNodes: dispNodes };
  }

  // 液态玻璃光学预设
  var GLASS_PRESETS = {
    // 强透镜液感:穹顶放大 + 明显色散,小红书/抖音封面级冲击
    vivid: {
      dispScale: 120, dispersion: 0.55, frost: 0, specular: 1, brightness: 0,
      map: { depth: 0.7, curvature: 0.55, softEdge: true, clipToShape: true,
        sheen: 0.45, sheenWidth: 14, sheenFalloff: 1.5, glow: 0.14, glowSpread: 0.9,
        bend: 0.4, bendWidth: 0.18, sheenAngle: 35 }
    },
    // Apple Liquid Glass 质感:温润、低色散、不吵闹。frost 暂置 0(见下方注释:
    // frost>0 会糊整个 target,真磨砂需 lens 形状裁切,列入 roadmap 收尾项)。
    apple: {
      dispScale: 66, dispersion: 0.16, frost: 0, specular: 0.8, brightness: 0,
      map: { depth: 0.85, curvature: 0.4, softEdge: true, clipToShape: true,
        sheen: 0.32, sheenWidth: 10, sheenFalloff: 1.7, glow: 0.18, glowSpread: 1.05,
        bend: 0.22, bendWidth: 0.16, sheenAngle: 35 }
    }
  };

  // ============================================================
  // ⑩ 主视觉 Hero 类(占满画面的中心特效)
  // ============================================================
  FX.hero = {
    /**
     * 网格爆破:把舞台的平面视觉切成 cols×rows 瓦片,每片飞到不同景深+旋转炸开(3D 立体拆解),再 collapse 重组。
     * 视觉来源:opts.background(CSS background-image 字符串,可多层渐变/图片) 或舞台已有背景。
     * mode: 'breathe'(开合呼吸循环,默认) | 'detonate'(炸开停住) | 'assemble'(由散聚合)。
     */
    gridDetonate: function (stage, o) {
      try {
        o = Object.assign({
          cols: 6, rows: 8, background: null, baseColor: '#111',
          perspective: 1200, tiltX: 0, tiltY: 0,
          spreadXY: 90, spreadZ: 420, rotRange: 62,
          from: 'center', step: 22, duration: 1500, ease: 'inOutQuint',
          mode: 'breathe', loop: 0, seed: 7, at: 0, dimOnBlow: 0.92
        }, o || {});
        var box = (typeof stage === 'string') ? document.querySelector(stage) : stage;
        if (!box) throw new Error('舞台不存在: ' + stage);
        var W = box.clientWidth, H = box.clientHeight;
        if (!W || !H) throw new Error('舞台需有明确宽高');
        var tileW = W / o.cols, tileH = H / o.rows;
        if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.style.transformStyle = 'preserve-3d';
        box.style.perspective = o.perspective + 'px';
        if (o.tiltX || o.tiltY) box.style.transform = 'rotateX(' + o.tiltX + 'deg) rotateY(' + o.tiltY + 'deg)';
        var bgImg = o.background || window.getComputedStyle(box).backgroundImage;
        box.style.background = o.baseColor;          // 舞台底色(瓦片缝隙/炸开后透出)
        box.innerHTML = '';
        var rand = rng(o.seed);
        var cx = (o.cols - 1) / 2, cy = (o.rows - 1) / 2;
        var tiles = [];
        for (var r = 0; r < o.rows; r++) {
          for (var c = 0; c < o.cols; c++) {
            var t = document.createElement('div');
            t.style.cssText = 'position:absolute;left:' + (c * tileW) + 'px;top:' + (r * tileH) + 'px;' +
              'width:' + tileW + 'px;height:' + tileH + 'px;background-color:' + o.baseColor + ';' +
              'background-image:' + bgImg + ';background-repeat:no-repeat;background-size:' + W + 'px ' + H + 'px;' +
              'background-position:' + (-c * tileW) + 'px ' + (-r * tileH) + 'px;will-change:transform,opacity;';
            t.setAttribute('data-tx', ((c - cx) * o.spreadXY * (0.6 + rand() * 0.8)).toFixed(1));
            t.setAttribute('data-ty', ((r - cy) * o.spreadXY * (0.6 + rand() * 0.8)).toFixed(1));
            t.setAttribute('data-tz', ((rand() * 2 - 1) * o.spreadZ).toFixed(1));
            t.setAttribute('data-rx', ((rand() * 2 - 1) * o.rotRange).toFixed(1));
            t.setAttribute('data-ry', ((rand() * 2 - 1) * o.rotRange).toFixed(1));
            box.appendChild(t);
            tiles.push(t);
          }
        }
        var kx = function (el) { return +el.getAttribute('data-tx'); };
        var ky = function (el) { return +el.getAttribute('data-ty'); };
        var kz = function (el) { return +el.getAttribute('data-tz'); };
        var krx = function (el) { return +el.getAttribute('data-rx'); };
        var kry = function (el) { return +el.getAttribute('data-ry'); };
        var delay = A.stagger(o.step, { from: o.from, grid: [o.cols, o.rows], start: o.at });
        var inst;
        if (o.mode === 'assemble') {
          afxSet(tiles, { x: kx, y: ky, z: kz, rotateX: krx, rotateY: kry, opacity: o.dimOnBlow });
          inst = A.animate(tiles, { x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0, opacity: 1,
            duration: o.duration, ease: o.ease, delay: delay });
        } else {
          inst = A.animate(tiles, { x: kx, y: ky, z: kz, rotateX: krx, rotateY: kry, opacity: o.dimOnBlow,
            duration: o.duration, ease: o.ease, delay: delay,
            loop: o.mode === 'breathe' ? autoLoop(true, o.duration * 2) : o.loop,
            alternate: o.mode === 'breathe' });
        }
        return reg(inst);
      } catch (e) { console.error('[anime-fx] hero.gridDetonate', e); return null; }
    },

    /**
     * 条板揭幕(主视觉入场):把舞台的主视觉用 N 条板盖住,逐条收起露出底下的视觉。
     * 视觉来源:opts.background(CSS background-image 串)或舞台已有背景。
     * mode: 'reveal'(收起露出,默认) | 'cover'(由空到盖上) | 'breathe'(开合循环)。
     */
    slatReveal: function (stage, o) {
      try {
        o = Object.assign({
          count: 7, orientation: 'vertical', background: null, baseColor: '#111',
          from: 'first', step: 90, duration: 760, ease: 'inOutQuint', mode: 'reveal', at: 0
        }, o || {});
        var box = (typeof stage === 'string') ? document.querySelector(stage) : stage;
        if (!box) throw new Error('舞台不存在: ' + stage);
        var W = box.clientWidth, H = box.clientHeight;
        if (!W || !H) throw new Error('舞台需有明确宽高');
        if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.style.overflow = 'hidden';
        box.style.backgroundImage = o.background || window.getComputedStyle(box).backgroundImage;
        box.style.backgroundSize = 'cover'; box.style.backgroundPosition = 'center';
        box.innerHTML = '';
        var vert = o.orientation !== 'horizontal';
        var size = (vert ? W : H) / o.count;
        var slats = [];
        for (var i = 0; i < o.count; i++) {
          var s = document.createElement('div');
          var origin = vert ? (i % 2 ? 'left' : 'right') : (i % 2 ? 'top' : 'bottom');
          s.style.cssText = 'position:absolute;background:' + o.baseColor + ';transform-origin:' + origin +
            ';will-change:transform;' + (vert
              ? 'top:0;height:100%;left:' + (i * size) + 'px;width:' + (size + 1) + 'px;'
              : 'left:0;width:100%;top:' + (i * size) + 'px;height:' + (size + 1) + 'px;');
          box.appendChild(s); slats.push(s);
        }
        var prop = vert ? 'scaleX' : 'scaleY';
        var params = { duration: o.duration, ease: o.ease, delay: A.stagger(o.step, { from: o.from, start: o.at }) };
        if (o.mode === 'cover') { var init = {}; init[prop] = 0; afxSet(slats, init); params[prop] = [0, 1]; }
        else if (o.mode === 'breathe') { params[prop] = [1, 0]; params.loop = autoLoop(true, o.duration * 2); params.alternate = true; }
        else { params[prop] = [1, 0]; }
        return reg(A.animate(slats, params));
      } catch (e) { console.error('[anime-fx] hero.slatReveal', e); return null; }
    },

    /**
     * 粒子汇聚(主视觉):粒子从四散位置向中心汇聚(可成团/成环),再(呼吸模式)散开。
     * canvasSel 须有 width/height 属性。anime 驱动 driver.t,onRender 逐帧重绘 → seek 可复现。
     * mode: 'breathe'(聚散循环,默认) | 'assemble'(聚拢停住) | 'disperse'(散开)。shape: 'disc' | 'ring'。
     */
    converge: function (canvasSel, o) {
      try {
        o = Object.assign({
          count: 130, color: '#E5251D', radius: [1, 3.4], shape: 'disc',
          seed: 5, period: 2600, mode: 'breathe', ease: 'inOutQuint',
          link: false, linkDist: 64, linkColor: 'rgba(229,37,29,.28)', bg: null, at: 0
        }, o || {});
        var cv = (typeof canvasSel === 'string') ? document.querySelector(canvasSel) : canvasSel;
        if (!cv || !cv.getContext) throw new Error('canvas 不存在: ' + canvasSel);
        var ctx = cv.getContext('2d'); var W = cv.width, H = cv.height;
        var rand = rng(o.seed);
        var cx = W / 2, cy = H / 2, R = Math.min(W, H);
        var ps = [];
        for (var i = 0; i < o.count; i++) {
          var ta = rand() * 6.2832;
          var tr = o.shape === 'ring' ? R * 0.32 : rand() * R * 0.12;
          ps.push({
            sx: rand() * W, sy: rand() * H,
            tx: cx + Math.cos(ta) * tr, ty: cy + Math.sin(ta) * tr,
            r: o.radius[0] + rand() * (o.radius[1] - o.radius[0])
          });
        }
        var driver = { t: 0 };
        function draw() {
          if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
          var e = driver.t, j, p;
          for (j = 0; j < ps.length; j++) { p = ps[j]; p._x = p.sx + (p.tx - p.sx) * e; p._y = p.sy + (p.ty - p.sy) * e; }
          if (o.link) {
            ctx.strokeStyle = o.linkColor; ctx.lineWidth = 1;
            for (var m = 0; m < ps.length; m++) for (var n = m + 1; n < ps.length; n++) {
              var dx = ps[m]._x - ps[n]._x, dy = ps[m]._y - ps[n]._y, dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < o.linkDist) {
                ctx.globalAlpha = (1 - dist / o.linkDist) * e;
                ctx.beginPath(); ctx.moveTo(ps[m]._x, ps[m]._y); ctx.lineTo(ps[n]._x, ps[n]._y); ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = o.color;
          for (var k = 0; k < ps.length; k++) { ctx.beginPath(); ctx.arc(ps[k]._x, ps[k]._y, ps[k].r, 0, 6.2832); ctx.fill(); }
        }
        var inst = A.animate(driver, {
          t: o.mode === 'disperse' ? [1, 0] : [0, 1], duration: o.period, delay: o.at, ease: o.ease,
          loop: o.mode === 'breathe' ? autoLoop(true, o.period * 2) : 0,
          alternate: o.mode === 'breathe', onRender: draw, onUpdate: draw
        });
        draw();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] hero.converge', e); return null; }
    },

    /**
     * 光圈绽放(主视觉/转场):放射状叶片像镜头光圈一样从中心旋开/闭合,露出或遮住底图。
     * 视觉来源:opts.background(CSS background-image 串)或舞台已有背景。
     * mode: 'reveal'(旋开露出,默认) | 'cover'(旋合盖住) | 'breathe'(开合循环)。
     */
    irisBloom: function (stage, o) {
      try {
        o = Object.assign({
          blades: 12, background: null, baseColor: '#08090b', bladeColor: '#E5251D',
          bladeAltColor: 'rgba(255,255,255,.9)', center: [0.5, 0.5], startAngle: -90,
          twist: 22, scaleFrom: 1.14, scaleTo: 0.05, step: 34, duration: 980,
          ease: 'inOutQuint', mode: 'reveal', from: 'center', at: 0
        }, o || {});
        var box = (typeof stage === 'string') ? document.querySelector(stage) : stage;
        if (!box) throw new Error('舞台不存在: ' + stage);
        var W = box.clientWidth, H = box.clientHeight;
        if (!W || !H) throw new Error('舞台需有明确宽高');
        if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.style.overflow = 'hidden';
        box.style.backgroundColor = o.baseColor;
        box.style.backgroundImage = o.background || window.getComputedStyle(box).backgroundImage;
        box.style.backgroundSize = 'cover';
        box.style.backgroundPosition = 'center';
        box.innerHTML = '';

        var cx = W * o.center[0], cy = H * o.center[1];
        var R = Math.sqrt(W * W + H * H);
        var span = 360 / o.blades;
        var blades = [];
        for (var i = 0; i < o.blades; i++) {
          var a0 = (o.startAngle + i * span - span * 0.58) * Math.PI / 180;
          var a1 = (o.startAngle + i * span + span * 0.58) * Math.PI / 180;
          var p0x = cx + Math.cos(a0) * R, p0y = cy + Math.sin(a0) * R;
          var p1x = cx + Math.cos(a1) * R, p1y = cy + Math.sin(a1) * R;
          var b = document.createElement('div');
          b.style.cssText = 'position:absolute;inset:0;background:' + (i % 2 ? o.bladeAltColor : o.bladeColor) +
            ';clip-path:polygon(' + (cx / W * 100) + '% ' + (cy / H * 100) + '%,' +
            (p0x / W * 100) + '% ' + (p0y / H * 100) + '%,' +
            (p1x / W * 100) + '% ' + (p1y / H * 100) + '%);' +
            'transform-origin:' + (cx / W * 100) + '% ' + (cy / H * 100) + '%;' +
            'mix-blend-mode:' + (o.blend || 'normal') + ';will-change:transform,opacity;';
          box.appendChild(b);
          blades.push(b);
        }

        var delay = A.stagger(o.step, { from: o.from, start: o.at });
        var params = { duration: o.duration, ease: o.ease, delay: delay };
        if (o.mode === 'cover') {
          afxSet(blades, { scale: o.scaleTo, rotate: o.twist, opacity: 0.15 });
          params.scale = [o.scaleTo, o.scaleFrom];
          params.rotate = [o.twist, 0];
          params.opacity = [0.15, 1];
        } else {
          params.scale = [o.scaleFrom, o.scaleTo];
          params.rotate = [0, o.twist];
          params.opacity = [1, 0];
          if (o.mode === 'breathe') {
            params.loop = autoLoop(true, o.duration * 2);
            params.alternate = true;
          }
        }
        return reg(A.animate(blades, params));
      } catch (e) { console.error('[anime-fx] hero.irisBloom', e); return null; }
    },

    /**
     * 点阵脉冲(主视觉/信号场):生成 cols×rows 点阵,用 timeline 串联多段 stagger 传播。
     * 适合数据/AI/系统感封面。mode: 'breathe'(循环,默认) | 'reveal'(入场定格) | 'disperse'(收束消失)。
     */
    matrixPulse: function (stage, o) {
      try {
        o = Object.assign({
          cols: 11, rows: 7, gap: 10, dot: 22, radius: 4, roundRadius: '50%',
          bg: '#08090b', color: '#f4f3f0', accent: '#E5251D', muted: '#3b3d42',
          from: 'center', axis: 'x', step: 32, period: 4200, ease: 'inOut(3)',
          mode: 'breathe', loop: true, at: 0
        }, o || {});
        var box = (typeof stage === 'string') ? document.querySelector(stage) : stage;
        if (!box) throw new Error('舞台不存在: ' + stage);
        var W = box.clientWidth, H = box.clientHeight;
        if (!W || !H) throw new Error('舞台需有明确宽高');
        if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.style.overflow = 'hidden';
        box.style.background = o.bg;
        box.innerHTML = '';

        var grid = document.createElement('div');
        var dotSize = Math.max(2, +o.dot || 22);
        var gap = Math.max(0, +o.gap || 0);
        grid.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
          'display:grid;grid-template-columns:repeat(' + o.cols + ',' + dotSize + 'px);gap:' + gap +
          'px;will-change:transform;';
        box.appendChild(grid);

        var dots = [];
        for (var i = 0; i < o.cols * o.rows; i++) {
          var d = document.createElement('div');
          d.style.cssText = 'width:' + dotSize + 'px;height:' + dotSize + 'px;background:' + o.color +
            ';border-radius:' + o.radius + 'px;will-change:transform,opacity,background-color,border-radius;';
          grid.appendChild(d);
          dots.push(d);
        }

        var u = o.period / 4200;
        var delayCenter = A.stagger(o.step, { grid: [o.cols, o.rows], from: o.from });
        var tl = A.createTimeline({ autoplay: false, loop: o.mode === 'breathe' ? autoLoop(o.loop, o.period) : 0, defaults: { ease: o.ease } });
        var t = o.at;
        var rowWave = A.stagger(o.step * 0.9, { grid: [o.cols, o.rows], axis: o.axis });

        tl.add(dots, {
          scale: [0, 1], opacity: [0, 1], duration: 700 * u,
          delay: A.stagger(o.step, { grid: [o.cols, o.rows], from: 'center' })
        }, t);

        t += 860 * u;
        tl.add(dots, {
          rotate: '1turn', borderRadius: [o.radius + 'px', o.roundRadius],
          backgroundColor: function (el, i) { return i % 5 === 0 ? o.accent : o.color; },
          duration: 900 * u, delay: A.stagger(o.step * 0.72, { grid: [o.cols, o.rows], from: 'first' })
        }, t);

        t += 650 * u;
        tl.add(dots, {
          scale: [1, 0.34, 1], duration: 780 * u,
          delay: A.stagger(o.step, { grid: [o.cols, o.rows], from: 'last' })
        }, t);

        t += 650 * u;
        tl.add(dots, {
          y: [0, -dotSize * 0.72, 0], backgroundColor: [o.accent, o.color],
          duration: 760 * u, delay: rowWave
        }, t);

        t += 520 * u;
        tl.add(dots, {
          backgroundColor: [o.color, o.muted, o.accent, o.color],
          scale: [1, 1.16, 1], duration: 820 * u, delay: delayCenter
        }, t);

        if (o.mode === 'disperse' || o.mode === 'breathe') {
          t += 880 * u;
          tl.add(dots, {
            scale: [1, 0], opacity: [1, 0.12], duration: 620 * u,
            delay: A.stagger(o.step * 0.82, { grid: [o.cols, o.rows], from: 'edges' })
          }, t);
        }

        return reg(tl);
      } catch (e) { console.error('[anime-fx] hero.matrixPulse', e); return null; }
    },

    /**
     * 隧道穿越(主视觉/转场):一组同心框从中心不断放大并淡出,层层向镜头逼近 → 无限缩放门。
     * 适合开场/封面/转场大招。stage 须有明确宽高。shape: 'rect' | 'circle'。
     */
    tunnel: function (stage, o) {
      try {
        o = Object.assign({
          rings: 9, base: 0.18, maxScale: 7, color: 'rgba(255,255,255,.85)', accent: '#E5251D',
          shape: 'rect', thickness: 2, period: 3600, spin: 18, seed: 7, bg: null, at: 0
        }, o || {});
        var box = (typeof stage === 'string') ? document.querySelector(stage) : stage;
        if (!box) throw new Error('舞台不存在: ' + stage);
        var W = box.clientWidth, H = box.clientHeight;
        if (!W || !H) throw new Error('舞台需有明确宽高');
        if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.style.overflow = 'hidden';
        if (o.bg) { box.style.backgroundImage = o.bg; box.style.backgroundSize = 'cover'; box.style.backgroundPosition = 'center'; }
        box.innerHTML = '';
        var baseSize = Math.min(W, H) * o.base;
        var rad = o.shape === 'circle' ? '50%' : '0';
        var rings = [];
        for (var i = 0; i < o.rings; i++) {
          var d = document.createElement('div');
          d.style.cssText = 'position:absolute;left:50%;top:50%;width:' + baseSize + 'px;height:' + baseSize +
            'px;margin-left:' + (-baseSize / 2) + 'px;margin-top:' + (-baseSize / 2) +
            'px;box-sizing:border-box;border:' + o.thickness + 'px solid ' + (i % 2 ? o.accent : o.color) +
            ';border-radius:' + rad + ';will-change:transform,opacity;';
          box.appendChild(d); rings.push(d);
        }
        return reg(A.animate(rings, {
          scale: [0.2, o.maxScale], opacity: [1, 0], rotate: [0, o.spin],
          duration: o.period, ease: 'linear', delay: A.stagger(o.period / o.rings, { start: o.at }),
          loop: autoLoop(true, o.period)
        }));
      } catch (e) { console.error('[anime-fx] hero.tunnel', e); return null; }
    },

    /**
     * 液态玻璃标题(主视觉 Hero):一块圆角玻璃 lens 在 target 上漂移,把 target 里的
     * 真实文字/视觉折射弯曲 —— 穹顶放大、RGB 色散、镜面高光。移植自 samasante/liquid-glass
     * 的 SVG feDisplacementMap 技术(纯 vanilla,无 React),lens 位置由确定性 driver 驱动
     * (不读真实时钟),可逐帧 HF 导出 MP4。
     *
     * target:被折射的元素(内含标题文字),滤镜直接 filter:url() 套它身上。
     * 玻璃体积块(puck)作为兄弟节点叠在 target 上方,跟随 lens 移动。
     *
     * preset: 'vivid'(强透镜液感,默认) | 'apple'(温润磨砂质感)。
     * mode:   'drift'(8 字循环漂移,默认) | 'sweep'(左→右扫一次揭幕)。
     * 任意 map/光学参数可在 opts 顶层覆盖预设。
     */
    glassReveal: function (target, o) {
      try {
        o = o || {};
        var preset = GLASS_PRESETS[o.preset] || GLASS_PRESETS.vivid;
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) throw new Error('target 不存在: ' + target);
        var parent = el.offsetParent || el.parentElement;
        if (!parent) throw new Error('target 需有定位父级');
        var W = el.clientWidth, H = el.clientHeight;
        if (!W || !H) throw new Error('target 需有明确宽高');

        // 几何(px 全尺寸)→ 贴图用半尺寸
        var lensW = o.lensW || Math.round(W * 0.52);
        var lensH = o.lensH || Math.round(H * 0.30);
        var radius = o.radius != null ? o.radius : Math.round(Math.min(lensW, lensH) * 0.48);
        // shape:'circle' → 正圆玻璃(直径取 lensW/lensH 或 min(W,H)*0.34,圆角=半径)
        if (o.shape === 'circle') {
          var dia = o.lensW || o.lensH || Math.round(Math.min(W, H) * 0.34);
          lensW = dia; lensH = dia; radius = dia / 2;
        }
        var halfW = lensW / 2, halfH = lensH / 2;
        var mapSize = o.mapSize || 512;

        // 光学:预设 ⊕ 顶层覆盖
        var dispScale = o.dispScale != null ? o.dispScale : preset.dispScale;
        var dispersion = o.dispersion != null ? o.dispersion : preset.dispersion;
        var frost = o.frost != null ? o.frost : preset.frost;
        var specular = o.specular != null ? o.specular : preset.specular;
        var mapShape = Object.assign({}, preset.map, o.map || {}, {
          lensHalfWidth: halfW, lensHalfHeight: halfH, borderRadius: radius
        });

        // 1) 生成贴图(一次)
        var mapUrl = genLensMap(mapSize, mapShape);

        // 2) 组装滤镜并套到 target
        var f = buildGlassFilter({
          regionW: W, regionH: H, lensW: lensW, lensH: lensH,
          mapUrl: mapUrl, dispScale: dispScale, dispersion: dispersion, frost: frost, specular: specular
        });
        var prevFilter = el.style.filter;
        el.style.filter = (prevFilter ? prevFilter + ' ' : '') + 'url(#' + f.id + ')';

        // 3) 玻璃体积块(可关:puck:false)
        var puck = null;
        if (o.puck !== false) {
          if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
          puck = document.createElement('div');
          puck.setAttribute('data-afx-glass-puck', f.id);
          puck.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform;' +
            'width:' + lensW + 'px;height:' + lensH + 'px;border-radius:' + radius + 'px;' +
            'border:1px solid rgba(255,255,255,.22);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 0 rgba(255,255,255,.12),0 18px 50px rgba(0,0,0,.32);' +
            'background:linear-gradient(135deg,rgba(255,255,255,.10),rgba(255,255,255,0) 40%);';
          parent.appendChild(puck);
        }
        // target 在 parent 内的偏移(puck 与 lens 同坐标系对齐)
        var baseX = el.offsetLeft, baseY = el.offsetTop;

        // 4) 轨迹:把 lens 中心放到 (cx,cy),更新 feImage 与 puck
        var mode = o.mode || 'drift';
        var driftX = o.driftX != null ? o.driftX : 0.30;   // 横向幅度(W 的比例)
        var driftY = o.driftY != null ? o.driftY : 0.16;   // 竖向幅度(H 的比例)
        function place(t) {
          var cx, cy;
          if (mode === 'sweep') {
            var e = t < 0 ? 0 : (t > 1 ? 1 : t);
            var es = e * e * (3 - 2 * e);                   // smoothstep 揭幕
            cx = halfW + es * (W - lensW);
            cy = H * 0.5;
          } else {
            var ex = t * 6.2832;
            cx = W * 0.5 + Math.cos(ex) * W * driftX;
            cy = H * 0.5 + Math.sin(ex * 2) * H * driftY;
          }
          var lx = cx - halfW, ly = cy - halfH;
          f.feImage.setAttribute('x', String(lx));
          f.feImage.setAttribute('y', String(ly));
          if (puck) puck.style.transform = 'translate(' + (baseX + lx) + 'px,' + (baseY + ly) + 'px)';
        }

        // 5) 确定性 driver
        var period = o.period || (mode === 'sweep' ? 2600 : 8000);
        var driver = { t: 0 };
        var inst = A.animate(driver, {
          t: [0, 1], duration: period, delay: o.at || 0,
          ease: mode === 'sweep' ? 'inOutQuint' : 'linear',
          loop: mode === 'sweep' ? (o.loop != null ? o.loop : 0) : autoLoop(true, period),
          onRender: function () { place(driver.t); }, onUpdate: function () { place(driver.t); }
        });
        place(0);
        return reg(inst);
      } catch (e) { console.error('[anime-fx] hero.glassReveal', e); return null; }
    }
  };

  // ============================================================
  // ⑪ AnimeFX 3.0 · 图片 / 贴纸 / UI / 镜头与补充效果
  // ============================================================
  function afxEl(target) { return typeof target === 'string' ? document.querySelector(target) : target; }
  function afxNodes(target) {
    if (typeof target === 'string') return Array.prototype.slice.call(document.querySelectorAll(target));
    if (target && typeof target.length === 'number' && !target.nodeType) return Array.prototype.slice.call(target);
    return target ? [target] : [];
  }
  function afxDriver(duration, at, ease, render, loop, alternate) {
    var d = { t: 0 };
    var inst = A.animate(d, { t: [0, 1], duration: duration, delay: at || 0, ease: ease || 'linear',
      loop: loop || 0, alternate: !!alternate,
      onRender: function () { render(d); }, onUpdate: function () { render(d); } });
    render(d); return reg(inst);
  }
  function afxPositioned(el) { if (el && window.getComputedStyle(el).position === 'static') el.style.position = 'relative'; }
  function afxRoughPath(from, to, curve, seed) {
    var rand = rng(seed || 7), x1 = from[0], y1 = from[1], x2 = to[0], y2 = to[1];
    var mx = (x1 + x2) / 2 + (rand() - .5) * curve, my = (y1 + y2) / 2 + (rand() - .5) * curve;
    return 'M' + x1 + ' ' + y1 + ' Q' + mx.toFixed(2) + ' ' + my.toFixed(2) + ' ' + x2 + ' ' + y2;
  }
  FX.image = {
    /** 图片容器级 clip-path 揭示；不承担全屏 hero。 */
    maskReveal: function (target, o) {
      try {
        o = Object.assign({ mode: 'circle', from: 'center', duration: 1100, ease: 'outExpo', at: 0 }, o || {});
        var el = afxEl(target);
        if (!el) throw new Error('图片不存在');
        var starts = {
          circle: 'circle(0% at 50% 50%)',
          slat: 'inset(0 100% 0 0)',
          diagonal: 'polygon(0 0,0 0,0 100%,0 100%)',
          blinds: 'inset(0 0 100% 0)'
        };
        var ends = {
          circle: 'circle(75% at 50% 50%)',
          slat: 'inset(0 0% 0 0)',
          diagonal: 'polygon(0 0,100% 0,100% 100%,0 100%)',
          blinds: 'inset(0 0 0% 0)'
        };
        el.style.willChange = 'clip-path';
        return reg(A.animate(el, {
          clipPath: [starts[o.mode] || starts.circle, ends[o.mode] || ends.circle],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] image.maskReveal', e); return null; }
    },

    /** 子层 data-depth 驱动的确定性往复视差。 */
    parallaxLayers: function (target, o) {
      try {
        o = Object.assign({ period: 5200, amplitude: 28, seed: 7, ease: 'inOutSine', loop: true, at: 0 }, o || {});
        var el = afxEl(target);
        var layers = el ? el.querySelectorAll('[data-depth]') : [];
        if (!layers.length) throw new Error('缺少 data-depth 子层');
        var driver = { t: 0 };
        function render() {
          for (var i = 0; i < layers.length; i++) {
            var d = Number(layers[i].dataset.depth || i + 1);
            layers[i].style.transform = 'translate3d(' + (driver.t * o.amplitude * d).toFixed(2) + 'px,'
              + (-driver.t * o.amplitude * d * .45).toFixed(2) + 'px,0) scale(' + (1 + d * .015).toFixed(3) + ')';
          }
        }
        var inst = A.animate(driver, {
          t: [0, 1], duration: o.period, delay: o.at, ease: o.ease,
          loop: autoLoop(o.loop, o.period), alternate: true,
          onRender: render, onUpdate: render
        });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] image.parallaxLayers', e); return null; }
    },

    /** 焦点拉入/拉出：模糊 + 不透明度联动。 */
    focusPull: function (target, o) {
      try {
        o = Object.assign({ blur: 18, direction: 'in', duration: 1000, ease: 'outQuart', at: 0 }, o || {});
        var incoming = o.direction !== 'out';
        return reg(A.animate(target, {
          opacity: incoming ? [0.45, 1] : [1, .45],
          filter: incoming ? ['blur(' + o.blur + 'px)', 'blur(0px)'] : ['blur(0px)', 'blur(' + o.blur + 'px)'],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] image.focusPull', e); return null; }
    },

    /** 多张图片从叠堆散开归位。 */
    stackShuffle: function (target, o) {
      try {
        o = Object.assign({ count: 4, rotateSpread: 14, step: 120, distance: 90, duration: 900, ease: 'outExpo', at: 0 }, o || {});
        var items = afxNodes(target).slice(0, o.count);
        return reg(A.animate(items, {
          opacity: [0, 1],
          x: function (_, i) { return [(i - (items.length - 1) / 2) * o.distance, 0]; },
          y: [45, 0],
          rotate: function (_, i) { return [(i - (items.length - 1) / 2) * o.rotateSpread, (i - (items.length - 1) / 2) * 3]; },
          delay: A.stagger(o.step, { start: o.at }),
          duration: o.duration, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] image.stackShuffle', e); return null; }
    },

    /** 前后对比擦除，第二个子元素为「after」层，可选分割手柄。 */
    compareWipe: function (target, o) {
      try {
        o = Object.assign({ direction: 'horizontal', handle: true, percent: 72, duration: 1400, ease: 'inOutQuad', at: 0 }, o || {});
        var el = afxEl(target), top = el && el.children[1];
        if (!el || !top) throw new Error('需要 before/after 两个子元素');
        afxPositioned(el);
        top.style.position = 'absolute';
        top.style.inset = '0';
        var handle = null;
        if (o.handle) {
          handle = document.createElement('i');
          handle.style.cssText = 'position:absolute;z-index:5;background:currentColor;pointer-events:none;'
            + (o.direction === 'vertical' ? 'left:0;right:0;height:2px;' : 'top:0;bottom:0;width:2px;');
          el.appendChild(handle);
        }
        function render(d) {
          var p = d.t * o.percent;
          top.style.clipPath = o.direction === 'vertical'
            ? 'inset(0 0 ' + (100 - p) + '% 0)'
            : 'inset(0 ' + (100 - p) + '% 0 0)';
          if (handle) {
            if (o.direction === 'vertical') handle.style.top = p + '%';
            else handle.style.left = p + '%';
          }
        }
        return afxDriver(o.duration, o.at, o.ease, render);
      } catch (e) { console.error('[anime-fx] image.compareWipe', e); return null; }
    },

    /** 双色调过渡：由灰褐向原色回落。 */
    duotoneShift: function (target, o) {
      try {
        o = Object.assign({ colorA: '#1a1d22', colorB: '#aeb5bd', duration: 1200, ease: 'inOutQuad', at: 0 }, o || {});
        var el = afxEl(target);
        el.style.backgroundColor = o.colorB;
        el.style.mixBlendMode = 'normal';
        return reg(A.animate(el, {
          filter: ['grayscale(1) sepia(.8) contrast(1.15)', 'grayscale(0) sepia(0) contrast(1)'],
          opacity: [.82, 1],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] image.duotoneShift', e); return null; }
    }
  };

  Object.assign(FX.transition, {
    /** 两页并排推移，overshoot 给一点惯性回弹。 */
    swipePush: function (target, o) {
      try {
        o = Object.assign({ direction: 'left', overshoot: 0.04, duration: 900, ease: 'outExpo', at: 0 }, o || {});
        var el = afxEl(target), pages = el ? el.children : [];
        if (pages.length < 2) throw new Error('需要两个页面子元素');
        var vertical = /up|down/.test(o.direction);
        var sign = /left|up/.test(o.direction) ? -1 : 1;
        var d = { p: 0 };
        function render() {
          var p = d.p + Math.sin(d.p * Math.PI) * o.overshoot;
          var a = -p * sign * 100, b = (1 - p) * sign * 100;
          pages[0].style.transform = (vertical ? 'translateY(' : 'translateX(') + a + '%)';
          pages[1].style.transform = (vertical ? 'translateY(' : 'translateX(') + b + '%)';
        }
        var inst = A.animate(d, { p: [0, 1], duration: o.duration, delay: o.at, ease: o.ease, onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] transition.swipePush', e); return null; }
    },

    /** 向锚点元素中心「穿越」放大。 */
    zoomThrough: function (target, o) {
      try {
        o = Object.assign({ anchor: null, scale: 4, duration: 1000, ease: 'inExpo', at: 0 }, o || {});
        var el = afxEl(target), anchor = afxEl(o.anchor) || el;
        if (!el) throw new Error('舞台不存在');
        var er = el.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
        var ox = (ar.left + ar.width / 2 - er.left) / er.width * 100;
        var oy = (ar.top + ar.height / 2 - er.top) / er.height * 100;
        el.style.transformOrigin = ox + '% ' + oy + '%';
        return reg(A.animate(el, { scale: [1, o.scale], opacity: [1, .25], duration: o.duration, delay: o.at, ease: o.ease }));
      } catch (e) { console.error('[anime-fx] transition.zoomThrough', e); return null; }
    },

    /** clip-path 形状变形转场。 */
    maskMorph: function (target, o) {
      try {
        // shapeFrom/shapeTo 需用同一种 clip-path 函数(如 circle→circle)才能数值插值;
        // 混用(circle→inset)会退化为 50% 处的离散跳变。
        o = Object.assign({ shapeFrom: 'circle(0% at 50% 50%)', shapeTo: 'circle(120% at 50% 50%)', duration: 1100, ease: 'inOutQuad', at: 0 }, o || {});
        return reg(A.animate(target, { clipPath: [o.shapeFrom, o.shapeTo], duration: o.duration, delay: o.at, ease: o.ease }));
      } catch (e) { console.error('[anime-fx] transition.maskMorph', e); return null; }
    },

    /** 两页模糊交叉溶解，overlap 控制入场提前量。 */
    blurDissolve: function (target, o) {
      try {
        o = Object.assign({ blur: 18, overlap: 0.35, duration: 1000, ease: 'inOutQuad', at: 0 }, o || {});
        var el = afxEl(target), pages = el ? el.children : [];
        if (pages.length < 2) throw new Error('需要两个页面子元素');
        pages[1].style.position = 'absolute';
        pages[1].style.inset = '0';
        var out = reg(A.animate(pages[0], {
          opacity: [1, 0], filter: ['blur(0px)', 'blur(' + o.blur + 'px)'],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
        reg(A.animate(pages[1], {
          opacity: [0, 1], filter: ['blur(' + o.blur + 'px)', 'blur(0px)'],
          duration: o.duration, delay: o.at + o.duration * (1 - o.overlap), ease: o.ease
        }));
        return out;
      } catch (e) { console.error('[anime-fx] transition.blurDissolve', e); return null; }
    },

    /** 条板依次扫过覆盖。 */
    slatSweep: function (target, o) {
      try {
        o = Object.assign({ count: 8, direction: 'left', cover: '#536170', step: 55, duration: 620, ease: 'inOutQuad', at: 0 }, o || {});
        var el = afxEl(target);
        afxPositioned(el);
        var vertical = /left|right/.test(o.direction), list = [];
        for (var i = 0; i < o.count; i++) {
          var slat = document.createElement('i');
          slat.style.cssText = 'position:absolute;z-index:20;background:' + o.cover + ';'
            + (vertical
              ? 'top:' + (i / o.count * 100) + '%;left:0;width:100%;height:' + (100 / o.count + .2) + '%;transform-origin:left center;'
              : 'left:' + (i / o.count * 100) + '%;top:0;height:100%;width:' + (100 / o.count + .2) + '%;transform-origin:center top;');
          el.appendChild(slat);
          list.push(slat);
        }
        return reg(A.animate(list, {
          scaleX: vertical ? [0, 1] : 1,
          scaleY: vertical ? 1 : [0, 1],
          delay: A.stagger(o.step, { start: o.at }),
          duration: o.duration, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] transition.slatSweep', e); return null; }
    },

    /** 甩镜转场：出页拖尾模糊、入页从反方向甩入。 */
    whipPan: function (target, o) {
      try {
        o = Object.assign({ direction: 'left', smear: 18, duration: 620, ease: 'inOutQuart', at: 0 }, o || {});
        var el = afxEl(target), pages = el ? el.children : [];
        if (pages.length < 2) throw new Error('需要两个页面子元素');
        var sign = o.direction === 'right' ? 1 : -1;
        pages[1].style.position = 'absolute';
        pages[1].style.inset = '0';
        afxSet(pages[1], { x: -sign * 100 + '%' });
        var out = reg(A.animate(pages[0], {
          x: [0, sign * 110 + '%'], filter: ['blur(0px)', 'blur(' + o.smear + 'px)'],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
        reg(A.animate(pages[1], {
          x: [-sign * 110 + '%', '0%'], filter: ['blur(' + o.smear + 'px)', 'blur(0px)'],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
        return out;
      } catch (e) { console.error('[anime-fx] transition.whipPan', e); return null; }
    }
  });

  Object.assign(FX.text, {
    /** 打字机键入；deleteTo>0 时打完 hold 后回删到 deleteTo 个字符(删除更快)。光标闪烁由时间轴推导,确定性。 */
    typeCursor: function (target, o) {
      try {
        o = Object.assign({ speed: 70, cursor: '▋', deleteTo: 0, hold: 600, duration: 2200, at: 0 }, o || {});
        var el = afxEl(target);
        var text = String(o.text != null ? o.text : el.textContent);
        var n = text.length;
        var typeMs = n * o.speed;
        var deletes = (o.deleteTo > 0 && o.deleteTo < n);
        var delCharMs = o.speed * 0.6;
        var delMs = deletes ? (n - o.deleteTo) * delCharMs : 0;
        var total = Math.max(o.duration, typeMs + o.hold + delMs);
        var d = { t: 0 };
        function render() {
          var ms = d.t * total, count;
          if (ms <= typeMs) count = Math.min(n, Math.floor(ms / o.speed));
          else if (ms <= typeMs + o.hold) count = n;
          else if (deletes) count = Math.max(o.deleteTo, n - Math.floor((ms - typeMs - o.hold) / delCharMs));
          else count = n;
          var blink = Math.floor(ms / 260) % 2 ? '' : o.cursor;
          el.textContent = text.slice(0, count) + blink;
        }
        var inst = A.animate(d, { t: [0, 1], duration: total, delay: o.at, ease: 'linear', onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] text.typeCursor', e); return null; }
    },

    /** 手绘圈注/下划线/方框/箭头。preserveAspectRatio=none 让路径随容器纵横比拉伸,宽中文标题也能整段包住。 */
    annotate: function (target, o) {
      try {
        o = Object.assign({ style: 'circle', color: '#536170', roughness: 7, seed: 7, duration: 900, at: 0 }, o || {});
        var el = afxEl(target);
        if (!el) throw new Error('文字不存在');
        afxPositioned(el);
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.cssText = 'position:absolute;inset:-14%;width:128%;height:128%;overflow:visible;pointer-events:none';
        var d = o.style === 'underline' ? 'M5 80 Q25 72 48 81 T95 78'
          : o.style === 'box' ? 'M5 10 L94 7 L96 91 L7 94 Z'
          : o.style === 'arrow' ? 'M8 82 Q55 90 88 18 M75 25 L88 18 L91 34'
          : 'M50 5 C84 4 98 22 94 54 C91 88 66 98 35 93 C5 88 -4 62 7 32 C15 12 29 6 50 5 Z';
        var p = document.createElementNS(svg.namespaceURI, 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', o.color);
        p.setAttribute('stroke-width', '3');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(p);
        el.appendChild(svg);
        return FX.svg.draw(p, { duration: o.duration, at: o.at, ease: 'outQuad' });
      } catch (e) { console.error('[anime-fx] text.annotate', e); return null; }
    },

    /** 多行文字逐行揭示，mask=true 时行内溢出裁剪。 */
    linesReveal: function (target, o) {
      try {
        o = Object.assign({ step: 130, mask: true, y: 24, duration: 720, ease: 'outExpo', at: 0 }, o || {});
        var el = afxEl(target);
        var lines = el ? Array.prototype.slice.call(el.children) : [];
        if (!lines.length && el) {
          lines = String(el.textContent).split(/\n+/).filter(Boolean).map(function (line) {
            var span = document.createElement('span');
            span.textContent = line;
            span.style.display = 'block';
            el.appendChild(span);
            return span;
          });
          if (el.firstChild && el.firstChild.nodeType === 3) el.removeChild(el.firstChild);
        }
        if (o.mask) lines.forEach(function (line) { line.style.overflow = 'hidden'; });
        return reg(A.animate(lines, {
          opacity: [0, 1], y: [o.y, 0],
          delay: A.stagger(o.step, { start: o.at }),
          duration: o.duration, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] text.linesReveal', e); return null; }
    },

    /** 按 beats 时间点做节拍脉冲缩放。 */
    kineticBeat: function (target, o) {
      try {
        o = Object.assign({ beats: [0, 420, 840, 1260], scale: 1.32, duration: 1650, at: 0 }, o || {});
        var el = afxEl(target), d = { t: 0 };
        function render() {
          var ms = d.t * o.duration, impulse = 0;
          for (var i = 0; i < o.beats.length; i++) {
            var dt = Math.abs(ms - o.beats[i]);
            if (dt < 180) impulse = Math.max(impulse, (1 - dt / 180));
          }
          el.style.transform = 'scale(' + (1 + impulse * (o.scale - 1)).toFixed(3) + ')';
        }
        var inst = A.animate(d, { t: [0, 1], duration: o.duration, delay: o.at, ease: 'linear', onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] text.kineticBeat', e); return null; }
    },

    /** 逐位机械滚轮:每位是纵向 0-9 滚动列,高位先停低位后停;小数点静态。列数按 from/to 两端最大位数建,负号槽在任一端为负时预留(混号时随当前值显隐)。DOM 实现,确定性。 */
    numberOdometer: function (target, o) {
      try {
        o = Object.assign({ from: 0, to: 1280, duration: 1600, decimals: 0, ease: 'out(3)', at: 0 }, o || {});
        var el = afxEl(target);
        if (!el) throw new Error('目标不存在');
        var fromV = Number(o.from), toV = Number(o.to);
        var strFrom = Math.abs(fromV).toFixed(o.decimals);
        var strTo = Math.abs(toV).toFixed(o.decimals);
        var dotFrom = strFrom.indexOf('.'), dotTo = strTo.indexOf('.');
        var intLen = Math.max(dotFrom < 0 ? strFrom.length : dotFrom, dotTo < 0 ? strTo.length : dotTo, 1);
        var pvMin = Math.pow(10, -o.decimals);
        el.textContent = '';
        el.style.display = 'inline-flex';
        el.style.alignItems = 'stretch';
        el.style.lineHeight = '1';
        var cols = [];
        var signEl = null;
        var alwaysNeg = fromV < 0 && toV < 0;
        if (fromV < 0 || toV < 0) {
          signEl = document.createElement('span');
          signEl.style.cssText = 'display:inline-block;width:.62em;text-align:center';
          signEl.textContent = alwaysNeg ? '-' : (fromV < 0 ? '-' : '');
          el.appendChild(signEl);
        }
        function addCol(exp) {
          var col = document.createElement('span');
          col.style.cssText = 'display:inline-block;overflow:hidden;height:1em;width:.62em;text-align:center';
          var strip = document.createElement('span');
          strip.style.cssText = 'display:block;will-change:transform';
          for (var dnum = 0; dnum <= 10; dnum++) {
            var cell = document.createElement('span');
            cell.style.cssText = 'display:block;height:1em';
            cell.textContent = String(dnum % 10);
            strip.appendChild(cell);
          }
          col.appendChild(strip);
          el.appendChild(col);
          cols.push({ strip: strip, pv: Math.pow(10, exp) });
        }
        for (var hi = intLen - 1; hi >= 0; hi--) addCol(hi);
        if (o.decimals > 0) {
          var dotEl = document.createElement('span');
          dotEl.textContent = '.';
          el.appendChild(dotEl);
          for (var lo = 1; lo <= o.decimals; lo++) addCol(-lo);
        }
        var driver = { v: fromV };
        function render() {
          var v = Math.abs(driver.v);
          if (signEl && !alwaysNeg) signEl.textContent = driver.v < 0 ? '-' : '';
          for (var c = 0; c < cols.length; c++) {
            var pv = cols[c].pv;
            var q = v / pv + 1e-9;
            var digit = Math.floor(q) % 10;
            var frac = q - Math.floor(q);
            var carry = pv <= pvMin + 1e-12 ? frac : Math.min(1, Math.max(0, (frac - 0.9) / 0.1));
            var pos = digit + carry;
            cols[c].strip.style.transform = 'translateY(' + (-pos).toFixed(4) + 'em)';
          }
        }
        var inst = A.animate(driver, { v: [fromV, toV], duration: o.duration, delay: o.at, ease: o.ease, onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] text.numberOdometer', e); return null; }
    }
  });

  FX.sticker = {
    /** 贴纸弹入：轻微旋转 + 回弹缩放。 */
    popIn: function (target, o) {
      try {
        o = Object.assign({ rotate: -8, overshoot: 1.18, duration: 760, ease: 'outBack(1.8)', at: 0 }, o || {});
        return reg(A.animate(target, {
          opacity: [0, 1], scale: [.25, o.overshoot, 1], rotate: [o.rotate, 0],
          duration: o.duration, delay: o.at, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] sticker.popIn', e); return null; }
    },

    /** 手绘箭头描画（带箭头头部）。 */
    arrowDraw: function (target, o) {
      try {
        o = Object.assign({ from: [8, 82], to: [90, 18], curve: 36, color: '#536170', seed: 7, duration: 900, at: 0 }, o || {});
        var el = afxEl(target);
        afxPositioned(el);
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
        var path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', afxRoughPath(o.from, o.to, o.curve, o.seed)
          + ' M' + (o.to[0] - 12) + ' ' + (o.to[1] + 2) + ' L' + o.to[0] + ' ' + o.to[1] + ' L' + (o.to[0] - 3) + ' ' + (o.to[1] + 12));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', o.color);
        path.setAttribute('stroke-width', '3');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
        el.appendChild(svg);
        return FX.svg.draw(path, { duration: o.duration, at: o.at });
      } catch (e) { console.error('[anime-fx] sticker.arrowDraw', e); return null; }
    },

    /** 印章猛击落下，可选轻微震动。 */
    stampPunch: function (target, o) {
      try {
        o = Object.assign({ rotate: -10, impact: 1.16, duration: 720, shake: true, at: 0 }, o || {});
        var inst = reg(A.animate(target, {
          opacity: [0, 1], scale: [2.6, o.impact, 1], rotate: [o.rotate * 1.6, o.rotate],
          duration: o.duration, delay: o.at, ease: 'outBack(1.4)'
        }));
        if (o.shake && FX.camera) FX.camera.shake(afxEl(target).parentElement, { intensity: 7, duration: 420, seed: 7, at: o.at + 260 });
        return inst;
      } catch (e) { console.error('[anime-fx] sticker.stampPunch', e); return null; }
    },

    /** Emoji 迸射（canvas，seeded 确定性发散）。 */
    emojiBurst: function (target, o) {
      try {
        o = Object.assign({ emojis: ['★', '●', '✦', '＋'], count: 22, seed: 7, duration: 1400, gravity: 120, color: '#111', size: [10, 24], at: 0 }, o || {});
        var cv = afxEl(target), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
        var rand = rng(o.seed), ps = [];
        for (var i = 0; i < o.count; i++) {
          ps.push({ a: rand() * Math.PI * 2, s: 80 + rand() * 170, r: o.size[0] + rand() * (o.size[1] - o.size[0]), e: o.emojis[i % o.emojis.length] });
        }
        var d = { t: 0 };
        function render() {
          ctx.clearRect(0, 0, W, H);
          for (var j = 0; j < ps.length; j++) {
            var p = ps[j], t = d.t;
            var x = W / 2 + Math.cos(p.a) * p.s * t;
            var y = H / 2 + Math.sin(p.a) * p.s * t + o.gravity * t * t;
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = o.color;
            ctx.font = p.r + 'px system-ui';
            ctx.fillText(p.e, x, y);
          }
          ctx.globalAlpha = 1;
        }
        var inst = A.animate(d, { t: [0, 1], duration: o.duration, delay: o.at, ease: 'outQuad', onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] sticker.emojiBurst', e); return null; }
    },

    /** 胶带贴附：从上方按角度贴下。 */
    tapeStick: function (target, o) {
      try {
        o = Object.assign({ angle: -8, texture: '#c7ccd2', width: 110, height: 28, duration: 700, at: 0 }, o || {});
        var el = afxEl(target);
        afxPositioned(el);
        var tape = document.createElement('i');
        tape.style.cssText = 'position:absolute;z-index:8;left:50%;top:-10px;width:' + o.width + 'px;height:' + o.height
          + 'px;background:' + o.texture + ';opacity:.86;transform:translateX(-50%) rotate(' + o.angle
          + 'deg);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)';
        el.appendChild(tape);
        return reg(A.animate(tape, {
          opacity: [0, .86], scaleX: [.2, 1], y: [-18, 0],
          duration: o.duration, delay: o.at, ease: 'outBack(1.4)'
        }));
      } catch (e) { console.error('[anime-fx] sticker.tapeStick', e); return null; }
    }
  };

  FX.ui = {
    /** 手机框：外壳 + 刘海，整体入场。 */
    phoneFrame: function (target, o) {
      try {
        o = Object.assign({ screens: [], switchFx: 'fade', radius: 34, duration: 1000, at: 0 }, o || {});
        var el = afxEl(target);
        el.style.cssText += ';position:relative;border:10px solid #252a31;border-radius:' + o.radius
          + 'px;box-shadow:0 24px 70px rgba(0,0,0,.28);overflow:hidden;background:#eef0f2';
        if (o.screens.length && !el.children.length) {
          o.screens.forEach(function (content, i) {
            var screen = document.createElement('div');
            screen.innerHTML = content;
            screen.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;padding:32px;background:'
              + (i % 2 ? '#aeb6bf' : '#e1e4e7') + ';color:#171a1f;font-weight:800;' + (i ? 'transform:translateX(100%)' : '');
            el.appendChild(screen);
          });
        }
        var notch = document.createElement('i');
        notch.style.cssText = 'position:absolute;z-index:8;left:50%;top:7px;transform:translateX(-50%);width:32%;height:18px;border-radius:999px;background:#252a31';
        el.appendChild(notch);
        return reg(A.animate(el, {
          opacity: [0, 1], scale: [.78, 1], y: [50, 0], rotateY: [-12, 0],
          duration: o.duration, delay: o.at, ease: 'outExpo'
        }));
      } catch (e) { console.error('[anime-fx] ui.phoneFrame', e); return null; }
    },

    /** 手势滑动指示点，沿 path 往复。 */
    gestureSwipe: function (target, o) {
      try {
        o = Object.assign({ path: [[18, 72], [82, 28]], repeat: 2, duration: 1100, color: '#536170', at: 0 }, o || {});
        var el = afxEl(target);
        afxPositioned(el);
        var dot = document.createElement('i');
        dot.style.cssText = 'position:absolute;z-index:10;width:28px;height:28px;margin:-14px;border-radius:50%;background:'
          + o.color + ';box-shadow:0 0 0 8px rgba(83,97,112,.18)';
        el.appendChild(dot);
        var d = { t: 0 }, a = o.path[0], b = o.path[o.path.length - 1];
        function render() {
          dot.style.left = (a[0] + (b[0] - a[0]) * d.t) + '%';
          dot.style.top = (a[1] + (b[1] - a[1]) * d.t) + '%';
          dot.style.opacity = String(Math.sin(d.t * Math.PI));
        }
        var inst = A.animate(d, {
          t: [0, 1], duration: o.duration, delay: o.at, ease: 'inOutSine',
          loop: o.repeat, alternate: false, onRender: render, onUpdate: render
        });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] ui.gestureSwipe', e); return null; }
    },

    /** 聊天气泡逐条播出。 */
    chatPlayback: function (target, o) {
      try {
        o = Object.assign({ messages: ['你好，欢迎体验', '向左滑动即可继续', '一切都已准备好'], typing: true, step: 620, duration: 720, at: 0 }, o || {});
        var el = afxEl(target);
        el.innerHTML = '';
        var bubbles = o.messages.map(function (message, i) {
          var b = document.createElement('div');
          b.textContent = message;
          b.style.cssText = 'max-width:78%;margin:8px ' + (i % 2 ? '0 8px auto' : 'auto 8px 0')
            + ';padding:12px 16px;border-radius:18px;background:' + (i % 2 ? '#d9dde2' : '#536170')
            + ';color:' + (i % 2 ? '#171a1f' : '#fff') + ';';
          el.appendChild(b);
          return b;
        });
        return reg(A.animate(bubbles, {
          opacity: [0, 1], y: [18, 0], scale: [.92, 1],
          delay: A.stagger(o.step, { start: o.at }),
          duration: o.duration, ease: 'outBack(1.3)'
        }));
      } catch (e) { console.error('[anime-fx] ui.chatPlayback', e); return null; }
    },

    /** 通知从顶部落下、悬停后收起。 */
    notifyDrop: function (target, o) {
      try {
        o = Object.assign({ hold: 1200, icon: '●', text: '新消息已到达', duration: 700, at: 0 }, o || {});
        var el = afxEl(target);
        afxPositioned(el);
        var n = document.createElement('div');
        n.innerHTML = '<b>' + o.icon + '</b><span>' + o.text + '</span>';
        n.style.cssText = 'position:absolute;z-index:12;left:8%;right:8%;top:6%;display:flex;gap:10px;align-items:center;padding:13px 16px;border-radius:14px;background:rgba(245,246,247,.92);color:#171a1f;box-shadow:0 16px 40px rgba(0,0,0,.18);backdrop-filter:blur(12px)';
        el.appendChild(n);
        return reg(A.animate(n, {
          opacity: [0, 1, 1, 0], y: [-60, 0, 0, -60],
          duration: o.duration + o.hold + o.duration, delay: o.at, ease: 'inOutQuad'
        }));
      } catch (e) { console.error('[anime-fx] ui.notifyDrop', e); return null; }
    },

    /** 光标沿 path 移动，clicks 时间点做点按缩放。 */
    cursorClick: function (target, o) {
      try {
        o = Object.assign({ path: [[15, 20], [70, 62]], clicks: [.72], duration: 1600, color: '#171a1f', at: 0 }, o || {});
        var el = afxEl(target);
        afxPositioned(el);
        var cursor = document.createElement('i');
        cursor.textContent = '◆';
        cursor.style.cssText = 'position:absolute;z-index:10;color:' + o.color + ';font-size:22px;transform:translate(-50%,-50%) rotate(-18deg)';
        el.appendChild(cursor);
        var d = { t: 0 }, a = o.path[0], b = o.path[o.path.length - 1];
        function render() {
          cursor.style.left = (a[0] + (b[0] - a[0]) * d.t) + '%';
          cursor.style.top = (a[1] + (b[1] - a[1]) * d.t) + '%';
          var s = 1;
          for (var i = 0; i < o.clicks.length; i++) if (Math.abs(d.t - o.clicks[i]) < .06) s = .68;
          cursor.style.transform = 'translate(-50%,-50%) rotate(-18deg) scale(' + s + ')';
        }
        var inst = A.animate(d, { t: [0, 1], duration: o.duration, delay: o.at, ease: 'inOutSine', onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] ui.cursorClick', e); return null; }
    }
  };

  Object.assign(FX.chart, {
    /** 折线描画;area=true 时在折线下方生成闭合渐变填充区,随描画同步淡入。 */
    lineDraw: function (target, o) {
      try {
        o = Object.assign({ points: [[8, 82], [28, 58], [48, 68], [68, 30], [92, 18]], area: true, dotStep: 110, color: '#536170', duration: 1200, at: 0 }, o || {});
        var svg = afxEl(target), ns = 'http://www.w3.org/2000/svg';
        if (!svg || svg.namespaceURI !== ns) throw new Error('目标必须是 SVG');
        var line = 'M' + o.points.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L');
        if (o.area) {
          var vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
          var baseY = (vb.length === 4 && vb.every(isFinite)) ? vb[1] + vb[3] : 100;
          var first = o.points[0], last = o.points[o.points.length - 1];
          var areaPath = document.createElementNS(ns, 'path');
          areaPath.setAttribute('d', line + ' L' + last[0] + ' ' + baseY + ' L' + first[0] + ' ' + baseY + ' Z');
          areaPath.style.fill = o.color;
          areaPath.style.fillOpacity = '0.16';
          areaPath.style.stroke = 'none';
          areaPath.style.opacity = '0';
          svg.appendChild(areaPath);
          reg(A.animate(areaPath, { opacity: [0, 1], duration: o.duration, delay: o.at, ease: 'inOutQuad' }));
        }
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', line);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', o.color);
        path.setAttribute('stroke-width', '3');
        svg.appendChild(path);
        var dots = o.points.map(function (p) {
          var c = document.createElementNS(ns, 'circle');
          c.setAttribute('cx', p[0]);
          c.setAttribute('cy', p[1]);
          c.setAttribute('r', '2.5');
          c.setAttribute('fill', o.color);
          svg.appendChild(c);
          return c;
        });
        var inst = FX.svg.draw(path, { duration: o.duration, at: o.at });
        reg(A.animate(dots, {
          opacity: [0, 1], scale: [0, 1],
          delay: A.stagger(o.dotStep, { start: o.at + o.duration * .45 }),
          duration: 420, ease: 'outBack(1.5)'
        }));
        return inst;
      } catch (e) { console.error('[anime-fx] chart.lineDraw', e); return null; }
    },

    /** 多条进度条依次填充。 */
    progressStack: function (target, o) {
      try {
        o = Object.assign({ values: [86, 72, 54], step: 160, duration: 1100, ease: 'outExpo', at: 0 }, o || {});
        var bars = afxNodes(target);
        bars.forEach(function (bar, i) {
          bar.style.transformOrigin = 'left center';
          bar.style.width = (o.values[i % o.values.length] || 0) + '%';
        });
        return reg(A.animate(bars, {
          scaleX: [0, 1],
          delay: A.stagger(o.step, { start: o.at }),
          duration: o.duration, ease: o.ease
        }));
      } catch (e) { console.error('[anime-fx] chart.progressStack', e); return null; }
    },

    /** 条形竞赛;相邻 frame 之间宽度做 inOutQuad 连续过渡,排位按当前段起点帧、在段边界换位,数值按段中点切换;单帧数据直接静态渲染。 */
    rankRace: function (target, o) {
      try {
        o = Object.assign({ frames: [[82, 66, 48], [58, 92, 72], [74, 68, 96]], duration: 2400, step: 800, at: 0 }, o || {});
        var bars = afxNodes(target), d = { t: 0 };
        var N = o.frames.length;
        if (!N) throw new Error('frames 不能为空');
        function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
        function render() {
          if (N < 2) {
            var only = o.frames[0];
            for (var j = 0; j < bars.length; j++) {
              var v = only[j] || 0;
              bars[j].style.width = v + '%';
              bars[j].style.order = String(-Math.round(v));
              bars[j].textContent = String(v);
            }
            return;
          }
          var scaled = d.t * (N - 1);
          var seg = Math.min(N - 2, Math.max(0, Math.floor(scaled)));
          var local = Math.min(1, Math.max(0, scaled - seg));
          var e = ease(local);
          var from = o.frames[seg], to = o.frames[seg + 1];
          var label = local < 0.5 ? from : to;
          var ord = local >= 1 ? to : from;
          for (var i = 0; i < bars.length; i++) {
            var a = from[i] || 0, b = to[i] || 0;
            var w = a + (b - a) * e;
            bars[i].style.width = w.toFixed(2) + '%';
            bars[i].style.order = String(-Math.round(ord[i] || 0));
            bars[i].textContent = String(label[i] || 0);
          }
        }
        var inst = A.animate(d, { t: [0, 1], duration: o.duration, delay: o.at, ease: 'linear', onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] chart.rankRace', e); return null; }
    },

    /** 象形计数：填充前 value 个图标。 */
    pictoCount: function (target, o) {
      try {
        o = Object.assign({ total: 10, value: 7, icon: '●', color: '#536170', muted: '#c8cdd3', step: 70, duration: 420, at: 0 }, o || {});
        var el = afxEl(target);
        el.innerHTML = '';
        var icons = [];
        for (var i = 0; i < o.total; i++) {
          var s = document.createElement('span');
          s.textContent = o.icon;
          s.style.cssText = 'display:inline-block;margin:4px;color:' + (i < o.value ? o.color : o.muted);
          el.appendChild(s);
          icons.push(s);
        }
        return reg(A.animate(icons.slice(0, o.value), {
          opacity: [.2, 1], scale: [.4, 1],
          delay: A.stagger(o.step, { start: o.at }),
          duration: o.duration, ease: 'outBack(1.5)'
        }));
      } catch (e) { console.error('[anime-fx] chart.pictoCount', e); return null; }
    }
  });

  FX.camera = {
    /** 虚拟镜头缩放/平移;按 keyframes 的 at(0-1) 定位区段并在段内线性插值,at 缺省时回退均分。 */
    zoomPan: function (target, o) {
      try {
        o = Object.assign({ keyframes: [{ at: 0, x: 0, y: 0, scale: 1 }, { at: 1, x: -4, y: 3, scale: 1.18 }], duration: 2600, ease: 'inOutSine', at: 0 }, o || {});
        var el = afxEl(target), frames = o.keyframes, d = { t: 0 };
        var n = frames.length;
        var ats = frames.map(function (f, i) { return (typeof f.at === 'number') ? f.at : (n > 1 ? i / (n - 1) : 0); });
        function render() {
          var t = d.t, i = 0;
          while (i < n - 2 && t > ats[i + 1]) i++;
          var a = frames[i], b = frames[i + 1] || a;
          var span = (ats[i + 1] != null ? ats[i + 1] : ats[i]) - ats[i];
          var local = span ? Math.min(1, Math.max(0, (t - ats[i]) / span)) : 0;
          var x = a.x + (b.x - a.x) * local;
          var y = a.y + (b.y - a.y) * local;
          var s = a.scale + (b.scale - a.scale) * local;
          el.style.transform = 'translate3d(' + x + '%,' + y + '%,0) scale(' + s + ')';
        }
        var inst = A.animate(d, { t: [0, 1], duration: o.duration, delay: o.at, ease: o.ease, onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] camera.zoomPan', e); return null; }
    },

    /** seeded 相机震动，随时间指数衰减。 */
    shake: function (target, o) {
      try {
        o = Object.assign({ intensity: 12, decay: 3, seed: 7, duration: 620, at: 0 }, o || {});
        var el = afxEl(target), d = { t: 0 }, rand = rng(o.seed), samples = [];
        for (var i = 0; i < 32; i++) samples.push([rand() * 2 - 1, rand() * 2 - 1]);
        function render() {
          var index = Math.min(samples.length - 1, Math.floor(d.t * samples.length));
          var amp = o.intensity * Math.pow(1 - d.t, o.decay), p = samples[index];
          el.style.transform = 'translate3d(' + (p[0] * amp).toFixed(2) + 'px,' + (p[1] * amp).toFixed(2) + 'px,0)';
        }
        var inst = A.animate(d, { t: [0, 1], duration: o.duration, delay: o.at, ease: 'linear', onRender: render, onUpdate: render });
        render();
        return reg(inst);
      } catch (e) { console.error('[anime-fx] camera.shake', e); return null; }
    }
  };

  // ============================================================
  // ⑫ WebGL Shader 背景(内置 WebGL shader 引擎的 30 种风格)
  // ------------------------------------------------------------
  // 依赖(在本文件之前引入):
  //   <script src="../lib/afx-shaders.umd.js"></script>    // window.AFXShaders(内核)
  //   <script src="../lib/shader-fx-config.js"></script>    // window.AFX_SHADER_CONFIG(参数映射表)
  // 二者由 `node tools/build-shaders.mjs` 从 npm 包生成,纯离线、双击即播。
  //
  // 与其它效果不同:shader 不走 anime seek,而是 ShaderMount 自带 WebGL rAF 自播
  //   —— 双击预览/实时背景零接线即动。需要 HyperFrames 确定性逐帧导出时,
  //      handle.setSpeed(0) 后每帧 handle.setFrame(ms) 手动驱动即可复现。
  //
  //   var h = AnimeFX.shader.meshGradient('#bg', { colors:['#e0eaff','#241d9a'], swirl:.4 });
  //   h.setUniforms({ swirl: 1 });   // 实时改数值/颜色
  //   h.setSpeed(0.3);  h.dispose();
  // ============================================================
  var _baseTexPromise = null;

  // 任意来源 → 已解码的 HTMLImageElement(失败 resolve(null),绝不抛)
  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      if (typeof src !== 'string') {
        if (src.tagName === 'CANVAS') {
          var ci = new Image();
          ci.onload = function () { resolve(ci); };
          ci.onerror = function () { resolve(null); };
          try { ci.src = src.toDataURL(); } catch (e) { resolve(null); }
          return;
        }
        if (src.complete && src.naturalWidth) { resolve(src); return; }
        src.onload = function () { resolve(src); };
        src.onerror = function () { resolve(null); };
        if (!src.src) resolve(null);
        return;
      }
      var img = new Image();
      try { var u = new URL(src, location.href); if (u.origin !== location.origin) img.crossOrigin = 'anonymous'; } catch (e) {}
      img.onload = function () { resolve(img); };
      img.onerror = function () { console.warn('[anime-fx] shader 图片加载失败: ' + src); resolve(null); };
      img.src = src;
    });
  }

  // 共享纹理(整库只加载一次):噪声图(多效果用)+ 空像素(image 占位,保证 uniform location 存在)
  function ensureBaseTex(PS) {
    if (_baseTexPromise) return _baseTexPromise;
    _baseTexPromise = Promise.all([loadImage(PS.getShaderNoiseTexture()), loadImage(PS.emptyPixel)])
      .then(function (r) { return { noise: r[0], empty: r[1] }; });
    return _baseTexPromise;
  }

  function numOr(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }

  // 按 config 的声明式规则,把「友好参数」翻译成 GLSL uniforms(复刻 React 组件的映射)
  function buildUniforms(PS, cfg, p, tex) {
    var u = {};
    for (var i = 0; i < cfg.rules.length; i++) {
      var r = cfg.rules[i];
      var v = p[r.from];
      switch (r.kind) {
        case 'colorArray': u[r.u] = (v || []).map(PS.getShaderColorFromString); break;
        case 'colorCount': u[r.u] = (v || []).length; break;
        case 'color': u[r.u] = PS.getShaderColorFromString(v == null ? '#00000000' : v); break;
        case 'enum': u[r.u] = numOr((PS[r.table] || {})[v], 0); break;
        case 'fit': u[r.u] = numOr((PS.ShaderFitOptions || {})[v], 1); break;
        case 'bool': u[r.u] = !!(tex.image && tex.image !== tex.empty); break;   // u_isImage:仅真实图为 true
        case 'noise': if (tex.noise) u[r.u] = tex.noise; break;
        case 'image': u[r.u] = tex.image || tex.empty; break;
        default: if (v !== undefined) u[r.u] = v; break;                          // pass:数值/布尔原样
      }
    }
    return u;
  }

  var SH = {
    /** 通用挂载:AnimeFX.shader.mount('#bg', 'meshGradient', {...})。返回 handle(带 .ready Promise)。 */
    mount: function (target, key, params) {
      var handle = { key: key, el: null, mount: null, ready: null, _q: [], _params: null, _cfg: null, _tex: null };
      // mount 就绪前调用的方法先入队,构建完再补跑
      function withMount(fn) { if (handle.mount) fn(); else handle._q.push(fn); }
      handle.setSpeed = function (s) { withMount(function () { handle.mount.setSpeed(s); }); return handle; };
      handle.setFrame = function (ms) { withMount(function () { handle.mount.setFrame(ms); }); return handle; };
      handle.dispose = function () { withMount(function () { handle.mount.dispose(); }); return handle; };
      handle.setUniforms = function (part) {
        if (!part) return handle;
        var route = {}, k;
        for (k in part) {
          if (!Object.prototype.hasOwnProperty.call(part, k)) continue;
          if (k === 'speed') handle.setSpeed(part[k]);
          else if (k === 'frame') handle.setFrame(part[k]);
          else if (k === 'image') console.warn('[anime-fx] shader.setUniforms:image 热更新暂不支持,请重新 mount');
          else route[k] = part[k];
        }
        var hasRoute = false; for (k in route) { hasRoute = true; break; }
        if (hasRoute) {
          Object.assign(handle._params, route);
          withMount(function () {
            handle.mount.setUniforms(buildUniforms(global.AFXShaders, handle._cfg, handle._params, handle._tex || {}));
          });
        }
        return handle;
      };

      try {
        var PS = global.AFXShaders, CFG = global.AFX_SHADER_CONFIG;
        if (!PS || !PS.ShaderMount) throw new Error('未加载 afx-shaders.umd.js(缺 window.AFXShaders)');
        if (!CFG) throw new Error('未加载 shader-fx-config.js(缺 window.AFX_SHADER_CONFIG)');
        var cfg = CFG[key];
        if (!cfg) throw new Error('未知 shader "' + key + '"。可用:' + Object.keys(CFG).join(', '));
        var el = (typeof target === 'string') ? document.querySelector(target) : target;
        if (!el) throw new Error('目标元素不存在: ' + target);
        handle.el = el; handle._cfg = cfg;
        var p = Object.assign({}, cfg.defaults, params || {});
        handle._params = p;
        var needsNoise = false, imgRule = null;
        for (var i = 0; i < cfg.rules.length; i++) {
          if (cfg.rules[i].kind === 'noise') needsNoise = true;
          if (cfg.rules[i].kind === 'image') imgRule = cfg.rules[i];
        }
        var needsImg = !!imgRule;
        if (cfg.needsImage && !p.image) {
          console.warn('[anime-fx] shader "' + key + '" 建议传 image 参数;未传时用空占位(部分效果退化为程序化外观)。');
        }
        // 载入并(按需)预处理用户图。liquidMetal/gemSmoke/heatmap 的 u_image 在官方
        // React 组件里要先过 toProcessed*(Poisson/边缘/模糊),否则观感与官方不等价 ——
        // 这里复刻同一契约:传 URL/Blob 时跑处理器,拿回 pngBlob→objectURL→纹理,用完即撤。
        function resolveUserImage() {
          if (!imgRule || !p.image) return Promise.resolve(null);
          var proc = imgRule.proc;
          if (proc && typeof PS[proc] === 'function') {
            if (typeof p.image !== 'string' && !(typeof Blob !== 'undefined' && p.image instanceof Blob)) {
              console.warn('[anime-fx] shader "' + key + '" 的 ' + proc + ' 预处理只接受 URL/Blob,当前输入用原图,观感可能与官方不一致');
              return loadImage(p.image);
            }
            return PS[proc](p.image).then(function (res) {
              var blob = res && (res.pngBlob || res.blob);
              if (!blob) throw new Error(proc + ' 未返回 blob');
              var url = URL.createObjectURL(blob);
              return loadImage(url).then(function (im) { URL.revokeObjectURL(url); return im; });
            }).catch(function (e) {
              console.warn('[anime-fx] shader "' + key + '" 图像预处理(' + proc + ')失败,退回原图', e);
              return loadImage(p.image);
            });
          }
          return loadImage(p.image);
        }
        handle.ready = ensureBaseTex(PS).then(function (base) {
          var tex = { noise: needsNoise ? base.noise : null, empty: base.empty, image: null };
          return resolveUserImage().then(function (im) {
            tex.image = im || (needsImg ? base.empty : null);
            handle._tex = tex;
            var gl = p.gl || { alpha: true, premultipliedAlpha: true, antialias: true };
            handle.mount = new PS.ShaderMount(
              el, PS[cfg.frag], buildUniforms(PS, cfg, p, tex), gl,
              (p.speed != null ? p.speed : 0), (p.frame != null ? p.frame : 0),
              (p.minPixelRatio != null ? p.minPixelRatio : 2),
              (p.maxPixelCount != null ? p.maxPixelCount : undefined)
            );
            for (var j = 0; j < handle._q.length; j++) { try { handle._q[j](); } catch (e) {} }
            handle._q.length = 0;
            return handle;
          });
        }).catch(function (e) { console.error('[anime-fx] shader.' + key + ' 初始化失败', e); return handle; });
      } catch (e) {
        console.error('[anime-fx] shader.mount', e);
        handle.ready = Promise.resolve(handle);
      }
      return handle;
    },
    /** 列出全部可用效果 key。 */
    list: function () { var C = global.AFX_SHADER_CONFIG; return C ? Object.keys(C) : []; },
    /** 取某效果的默认参数(副本,可改后传回 mount)。 */
    defaults: function (key) {
      var C = global.AFX_SHADER_CONFIG; var c = C && C[key];
      return c ? JSON.parse(JSON.stringify(c.defaults)) : null;
    }
  };

  // 为每个效果生成同名便捷方法:AnimeFX.shader.meshGradient(el, params) 等
  (function () {
    var C = global.AFX_SHADER_CONFIG;
    if (!C) return;
    Object.keys(C).forEach(function (key) {
      if (SH[key]) return;
      SH[key] = function (target, params) { return SH.mount(target, key, params); };
    });
  })();

  FX.shader = SH;

  global.AnimeFX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
