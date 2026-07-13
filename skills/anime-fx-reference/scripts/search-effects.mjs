#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest/ai-catalog.json'), 'utf8'));
const API = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest/effects.json'), 'utf8'));
const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest/recipes.json'), 'utf8'));
const apiById = new Map(API.effects.map((effect) => [effect.id, effect]));

function usage(code = 0) {
  const output = `Usage:
  node skills/anime-fx-reference/scripts/search-effects.mjs --query <text> [options]
  node skills/anime-fx-reference/scripts/search-effects.mjs --id <effect.id> [--format json]
  node skills/anime-fx-reference/scripts/search-effects.mjs --type recipe --query <page intent>

Options:
  --query <text>       Natural-language intent
  --id <id>            Exact effect or recipe lookup
  --type <type>        effect or recipe (default effect)
  --role <role>        bg, hero, component, text-enter, text-exit, text-emphasis, transition
  --runtime <runtime>  dom, svg, canvas, three, shader, webgl
  --target <target>    html, video, react, vue, svelte, canvas-video
  --weight <weight>    light, medium, heavy
  --limit <1..10>      Result count (default 3)
  --format <format>    text or json (default text)
  --list               List all IDs for the selected type
  --help               Show this help`;
  console[code ? 'error' : 'log'](output);
  process.exit(code);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--list') result.list = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) usage(2);
      result[key] = value;
      index += 1;
    } else usage(2);
  }
  return result;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function grams(value) {
  const raw = String(value || '').toLowerCase();
  const result = new Set();
  for (const word of raw.match(/[a-z0-9][a-z0-9._-]*/g) || []) {
    result.add(word);
    for (const part of word.split(/[._-]/)) if (part.length > 1) result.add(part);
  }
  for (const sequence of raw.match(/[\p{Script=Han}]+/gu) || []) {
    if (sequence.length <= 4) result.add(sequence);
    for (let size = 2; size <= Math.min(4, sequence.length); size += 1) {
      for (let index = 0; index <= sequence.length - size; index += 1) result.add(sequence.slice(index, index + size));
    }
  }
  return result;
}

function intersectionCount(left, right) {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

const roleAliases = {
  background: ['bg'],
  content: ['component', 'text-enter', 'text-emphasis'],
  enter: ['text-enter'],
  entrance: ['text-enter'],
  exit: ['text-exit'],
  emphasis: ['text-emphasis'],
  text: ['text-enter', 'text-exit', 'text-emphasis'],
  transition: ['transition']
};

const runtimeAliases = {
  canvas: ['canvas2d'],
  threejs: ['three'],
  webgl: ['webgl', 'shader', 'three'],
  css: ['css-filter', 'dom']
};

function allowedValues(raw, aliases) {
  if (!raw) return null;
  const key = String(raw).toLowerCase();
  return aliases[key] || [key];
}

function matchesFilters(effect, options) {
  const roles = allowedValues(options.role, roleAliases);
  const runtimes = allowedValues(options.runtime, runtimeAliases);
  if (roles && !roles.includes(effect.role)) return false;
  if (runtimes && !runtimes.some((runtime) => effect.runtimes.includes(runtime))) return false;
  if (options.weight && effect.weight !== options.weight) return false;
  if (options.target && ![...effect.directTargets, ...effect.adaptationTargets].includes(options.target)) return false;
  return true;
}

const intentRules = [
  { terms: ['水墨', '文化', '中文', '纸张', '文学', '档案'], suite: 'inkPaper', reason: '匹配水墨/中文文化语境' },
  { terms: ['科技', '未来', 'ai', '系统', '信号', '发布'], suite: 'techNoir', reason: '匹配科技与发布语境' },
  { terms: ['高级', '精致', '产品', '玻璃', '空间ui', '通透'], suite: 'appleGlass', reason: '匹配高级产品与玻璃语境' }
];

const roleIntentRules = [
  { terms: ['背景', '氛围', '底图'], roles: ['bg'], reason: '匹配背景角色' },
  { terms: ['主视觉', 'hero', '封面', '揭晓'], roles: ['hero'], reason: '匹配主视觉角色' },
  { terms: ['入场', '出现', '显露'], roles: ['text-enter', 'component'], reason: '匹配入场角色' },
  { terms: ['离场', '退出', '消失', '收走'], roles: ['text-exit'], reason: '匹配离场角色' },
  { terms: ['强调', '重点', '高亮', '指标'], roles: ['text-emphasis'], reason: '匹配强调角色' },
  { terms: ['数据', '百分比', '数字', '金额'], roles: ['component', 'text-emphasis'], reason: '匹配数据展示角色' },
  { terms: ['转场', '切页', '过渡'], roles: ['transition', 'hero'], reason: '匹配转场角色' }
];

function scoreEffect(effect, query) {
  const queryNormalized = normalize(query);
  const queryGrams = grams(query);
  let score = 0;
  const reasons = [];
  const addField = (values, weight, label, cap = 4) => {
    const fieldGrams = grams(values.join(' '));
    const count = Math.min(intersectionCount(queryGrams, fieldGrams), cap);
    if (count > 0) {
      score += count * weight;
      reasons.push(`${label}命中`);
    }
  };

  if (queryNormalized === normalize(effect.id)) {
    score += 1000;
    reasons.push('精确 ID');
  } else if (queryNormalized.includes(normalize(effect.id)) || normalize(effect.id).includes(queryNormalized)) {
    score += 80;
    reasons.push('效果 ID 命中');
  }
  addField(effect.bestFor, 12, '适用场景');
  addField(effect.mood, 10, '视觉情绪');
  addField(effect.keywords, 5, '关键词', 6);
  addField([effect.summary], 3, '运动描述', 6);

  for (const rule of intentRules) {
    if (rule.terms.some((term) => queryNormalized.includes(normalize(term))) && effect.suites.includes(rule.suite)) {
      score += 18;
      reasons.push(rule.reason);
    }
  }
  for (const rule of roleIntentRules) {
    if (rule.terms.some((term) => queryNormalized.includes(normalize(term))) && rule.roles.includes(effect.role)) {
      score += 20;
      reasons.push(rule.reason);
    }
  }
  if (['不喧宾夺主', '克制', '轻量', '低调', '已有重型', '已经有重型', '已有hero'].some((term) => queryNormalized.includes(normalize(term)))) {
    if (effect.weight === 'light') {
      score += 28;
      reasons.push('匹配克制/轻量要求');
    } else if (effect.weight === 'heavy') {
      score -= 32;
      reasons.push('heavy 与克制/已有主视觉要求冲突');
    }
  }
  const avoidHits = effect.avoidWhen.filter((item) => intersectionCount(queryGrams, grams(item)) >= 2);
  if (avoidHits.length) {
    score -= Math.min(avoidHits.length * 6, 18);
    reasons.push('存在需复核的禁区语义');
  }
  return { score, reasons: [...new Set(reasons)] };
}

function compactResult(effect, scored) {
  const direct = effect.directTargets;
  return {
    id: effect.id,
    score: scored.score,
    confidence: scored.score >= 70 ? 'high' : scored.score >= 30 ? 'medium' : 'low',
    matchReasons: scored.reasons,
    summary: effect.summary,
    role: effect.role,
    temporal: effect.temporal,
    weight: effect.weight,
    runtimes: effect.runtimes,
    dependencies: effect.dependencies,
    recommendedMode: direct.includes('html') ? 'reuse for HTML/video; adapt for framework-native ownership' : 'adapt',
    bestFor: effect.bestFor,
    avoidWhen: effect.avoidWhen,
    pairsWith: effect.pairsWith,
    source: effect.source,
    example: effect.example,
    preview: effect.preview,
    anchorCase: effect.anchorCase
  };
}

function printText(results) {
  if (!results.length) {
    console.log('No matching AnimeFX effects. Treat the closest motion as a new derived effect and label it explicitly.');
    return;
  }
  for (const [index, effect] of results.entries()) {
    console.log(`${index + 1}. ${effect.id} — ${effect.summary}`);
    console.log(`   Match: ${effect.matchReasons.join('；') || 'explicit filters'} (score ${effect.score})`);
    if (effect.confidence === 'low') console.log('   Confidence: low — use only as the closest reference and label any new motion as derived.');
    console.log(`   Contract: role=${effect.role}, temporal=${effect.temporal}, weight=${effect.weight}, runtime=${effect.runtimes.join('+')}`);
    console.log(`   Use: ${effect.recommendedMode}`);
    console.log(`   API: ${effect.example}`);
    console.log(`   Source: ${effect.source.file} :: ${effect.source.symbol}`);
    console.log(`   Evidence: ${effect.preview} | ${effect.anchorCase}`);
    if (effect.pairsWith.length) console.log(`   Pair with: ${effect.pairsWith.join(', ')}`);
    if (effect.avoidWhen.length) console.log(`   Avoid when: ${effect.avoidWhen.join('；')}`);
  }
}

const recipeTypeLabels = {
  cover: '封面',
  coverHero: '主视觉封面',
  data: '数据页',
  list: '列表页',
  end: '结尾页',
  copy: '文案页'
};

const recipeTypeTerms = {
  cover: ['封面', '开场', '标题页', '发布页'],
  coverHero: ['主视觉', 'hero', '强封面', '发布主视觉'],
  data: ['数据', '指标', '百分比', '数字', '图表', '数据页'],
  list: ['列表', '清单', '步骤', '要点', '功能'],
  end: ['结尾', '收尾', '结束', 'cta', '关注'],
  copy: ['文案', '正文', '内容', '说明', '玻璃卡片']
};

const recipeSuiteTerms = {
  techNoir: ['科技', '未来', '系统', '信号', '黑红', '故障'],
  inkPaper: ['水墨', '文化', '纸张', '中文', '文学', '留白'],
  appleGlass: ['高级', '产品', '玻璃', '空间ui', '通透', '苹果']
};

function recipeDetail(recipe) {
  return {
    kind: 'recipe',
    id: recipe.id,
    summary: `${recipeTypeLabels[recipe.type] || recipe.type}的确定性效果编排。`,
    exampleTheme: recipe.exampleTheme,
    type: recipe.type,
    duration: recipe.duration,
    template: recipe.template,
    roles: recipe.roles,
    contentSlots: recipe.contentSlots,
    effects: recipe.effects.map((use) => ({ fx: use.fx, target: use.target, at: use.at, params: use.params || {} })),
    demo: `demos/recipes/${recipe.id}.html`,
    preview: `previews/recipes/${recipe.id}.png`,
    apiTruth: 'manifest/recipes.json'
  };
}

function scoreRecipe(recipe, query) {
  const normalized = normalize(query);
  let score = 0;
  const reasons = [];
  if (normalized === normalize(recipe.id)) { score += 1000; reasons.push('精确 ID'); }
  if ((recipeTypeTerms[recipe.type] || []).some((term) => normalized.includes(normalize(term)))) {
    score += 36; reasons.push(`匹配${recipeTypeLabels[recipe.type] || recipe.type}任务`);
  }
  if ((recipeSuiteTerms[recipe.exampleTheme] || []).some((term) => normalized.includes(normalize(term)))) {
    score += 8; reasons.push(`demo 夹具与查询语境相近（不作为风格推荐）`);
  }
  const queryGrams = grams(query);
  const effectHits = recipe.effects.filter((use) => normalized.includes(normalize(use.fx)) || queryGrams.has(use.fx.split('.')[1].toLowerCase())).length;
  if (effectHits) { score += effectHits * 10; reasons.push('命中编排内效果'); }
  return { score, reasons };
}

function searchRecipes(options) {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 3)));
  if (!Number.isFinite(limit)) usage(2);
  return RECIPES.recipes
    .map((recipe) => ({ recipe, scored: options.query ? scoreRecipe(recipe, options.query) : { score: 1, reasons: [] } }))
    .filter(({ scored }) => !options.query || scored.score > 0)
    .sort((left, right) => right.scored.score - left.scored.score || left.recipe.id.localeCompare(right.recipe.id))
    .slice(0, limit)
    .map(({ recipe, scored }) => ({ ...recipeDetail(recipe), score: scored.score, matchReasons: scored.reasons }));
}

function printRecipes(results) {
  if (!results.length) {
    console.log('No matching AnimeFX recipes. Search individual effects or create a new composition explicitly.');
    return;
  }
  for (const [index, recipe] of results.entries()) {
    console.log(`${index + 1}. ${recipe.id} — ${recipe.summary}`);
    console.log(`   Match: ${recipe.matchReasons.join('；') || 'explicit filters'} (score ${recipe.score})`);
    console.log(`   Contract: type=${recipe.type}, duration=${recipe.duration}ms, roles=${recipe.roles.join(',')}, contentSlots=${recipe.contentSlots.join(',')}`);
    console.log(`   Demo fixture: ${recipe.exampleTheme} (rendering evidence only; inject target-project style)`);
    console.log(`   Sequence: ${recipe.effects.map((use) => `${use.fx}@${use.at}ms`).join(' → ')}`);
    console.log(`   Evidence: ${recipe.preview} | ${recipe.demo}`);
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.help) usage(0);
const searchType = options.type || 'effect';
if (!['effect', 'recipe'].includes(searchType)) usage(2);
if (options.list) {
  const ids = searchType === 'recipe' ? RECIPES.recipes.map((recipe) => recipe.id) : CATALOG.effects.map((effect) => effect.id);
  console.log(options.format === 'json' ? JSON.stringify(ids, null, 2) : ids.join('\n'));
  process.exit(0);
}
if (options.id) {
  if (searchType === 'recipe') {
    const recipe = RECIPES.recipes.find((item) => item.id === options.id);
    if (!recipe) { console.error(`Unknown AnimeFX recipe: ${options.id}`); process.exit(1); }
    const detail = recipeDetail(recipe);
    if (options.format === 'json') console.log(JSON.stringify(detail, null, 2));
    else printRecipes([{ ...detail, score: 1000, matchReasons: ['精确 ID'] }]);
    process.exit(0);
  }
  const effect = CATALOG.effects.find((item) => item.id === options.id);
  if (!effect) {
    console.error(`Unknown AnimeFX effect: ${options.id}`);
    process.exit(1);
  }
  const detail = { ...effect, params: apiById.get(effect.id).params };
  if (options.format === 'json') console.log(JSON.stringify(detail, null, 2));
  else printText([compactResult(effect, { score: 1000, reasons: ['精确 ID'] })]);
  process.exit(0);
}
if (!options.query && !options.role && !options.runtime && !options.target && !options.weight) usage(2);

if (searchType === 'recipe') {
  const results = searchRecipes(options);
  if (options.format === 'json') console.log(JSON.stringify(results, null, 2));
  else printRecipes(results);
  process.exit(0);
}

const limit = Math.max(1, Math.min(10, Number(options.limit || 3)));
if (!Number.isFinite(limit)) usage(2);
const results = CATALOG.effects
  .filter((effect) => matchesFilters(effect, options))
  .map((effect) => ({ effect, scored: options.query ? scoreEffect(effect, options.query) : { score: 1, reasons: [] } }))
  .filter(({ scored }) => !options.query || scored.score > 0)
  .sort((left, right) => right.scored.score - left.scored.score || left.effect.id.localeCompare(right.effect.id))
  .slice(0, limit)
  .map(({ effect, scored }) => compactResult(effect, scored));

if (options.format === 'json') console.log(JSON.stringify(results, null, 2));
else printText(results);
