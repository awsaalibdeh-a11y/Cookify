(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('cookify.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cookify.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  sort: '<path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2M9 2h6"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
  swap: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  chef: '<path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6zM6 17h12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- state ---------- */
const SEED = window.__SEED__;
const CATS = SEED.categories;
const catById = id => CATS.find(c => c.id === id);
const DEFAULT_PROFILE = { allergens: [], diet: 'none', avoid: [], hideUnsafe: false };
const S = {
  custom: store.get('custom', []), edits: store.get('edits', {}), hidden: store.get('hidden', []),
  profile: store.get('profile', null), fav: store.get('fav', []), list: store.get('list', []),
  plan: store.get('plan', {}), swaps: store.get('swaps', {}), notes: store.get('notes', {}),
  units: store.get('units', 'us'), servings: {}, checked: {},
  ui: { cat: 'all', q: '', sel: null, quick: false, safeOnly: false, sort: 'title', swapOpen: null },
};
const persist = (...keys) => keys.forEach(k => store.set(k, S[k]));
const P = () => S.profile || DEFAULT_PROFILE;

const allRecipes = () => [
  ...SEED.recipes.filter(r => !S.hidden.includes(r.id)).map(r => S.edits[r.id] || r),
  ...S.custom,
];
const byId = id => allRecipes().find(r => r.id === id);

/* ---------- ingredient parsing & units ---------- */
const VULGAR = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8' };
const UNITS = {
  cup: 'cup', cups: 'cup', c: 'cup', tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', g: 'g', gram: 'g', grams: 'g', kg: 'kg',
  ml: 'ml', l: 'l', liter: 'l', liters: 'l',
};
const numTok = t => {
  const parts = t.trim().split(/\s+/);
  return parts.reduce((sum, p) => {
    if (p.includes('/')) { const [a, b] = p.split('/'); return sum + a / b; }
    return sum + parseFloat(p);
  }, 0);
};
function parseIng(raw) {
  let s = String(raw).trim().replace(/(\d)?\s?([¼½¾⅓⅔⅛⅜])/g, (m, d, f) => (d ? d + ' ' : '') + VULGAR[f]);
  const NUM = '(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.?\\d+)';
  const m = s.match(new RegExp(`^${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?\\s*`));
  if (!m) return { q: null, u: '', n: s, raw };
  const q = Math.max(numTok(m[1]), m[2] ? numTok(m[2]) : 0);
  let rest = s.slice(m[0].length), u = '';
  const w = rest.match(/^([a-zA-Z]+)\.?(?:\s+|$)/);
  if (w && UNITS[w[1].toLowerCase()]) { u = UNITS[w[1].toLowerCase()]; rest = rest.slice(w[0].length); }
  return { q, u, n: rest.trim(), raw };
}
const FR = [[1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾']];
function fmtNum(x) {
  if (x <= 0) return '0';
  let w = Math.floor(x + 1e-6), f = x - w;
  if (f < 0.06) return String(w || 0);
  if (f > 0.94) return String(w + 1);
  let best = null;
  for (const [v, sym] of FR) if (Math.abs(f - v) < 0.05) best = sym;
  if (best) return (w ? w : '') + best;
  return String(Math.round(x * 10) / 10);
}
const METRIC_R = n => n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
function convert(q, u, mode) {
  if (mode === 'metric') {
    if (u === 'cup') return [METRIC_R(q * 240), 'ml'];
    if (u === 'tbsp') return [METRIC_R(q * 15), 'ml'];
    if (u === 'tsp') return [METRIC_R(q * 5), 'ml'];
    if (u === 'oz') return [METRIC_R(q * 28.35), 'g'];
    if (u === 'lb') { const g = q * 453.6; return g >= 1000 ? [Math.round(g / 10) / 100, 'kg'] : [METRIC_R(g), 'g']; }
    if (u === 'ml' && q >= 1000) return [q / 1000, 'l'];
    if (u === 'g' && q >= 1000) return [q / 1000, 'kg'];
    return [q, u];
  }
  if (u === 'g') { const oz = q / 28.35; return oz >= 16 ? [oz / 16, 'lb'] : [oz, 'oz']; }
  if (u === 'kg') return [q * 2.2046, 'lb'];
  if (u === 'ml') { if (q < 15) return [q / 5, 'tsp']; if (q < 60) return [q / 15, 'tbsp']; return [q / 240, 'cup']; }
  if (u === 'l') return [q * 4.2268, 'cup'];
  return [q, u];
}
function fmtIng(ing, factor = 1) {
  if (ing.q == null) return ing.n;
  let [q, u] = convert(ing.q * factor, ing.u, S.units);
  const numStr = (u === 'g' || u === 'ml' || u === 'kg' || u === 'l') && S.units === 'metric' ? String(Math.round(q * 100) / 100) : fmtNum(q);
  const unit = u === 'cup' && q > 1.06 ? 'cups' : u;
  return `${numStr}${unit ? ' ' + unit : ''} ${ing.n}`.trim();
}
const fmtTime = m => !m ? '' : m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`;

/* ---------- allergen engine ---------- */
const A = {
  milk: { label: 'Dairy', icon: '🥛', re: /\b(milk|buttermilk|butter|cheese|cream|yogh?urt|parmesan|mozzarella|cheddar|feta|ricotta|mascarpone|ghee|whey|casein|custard|halloumi|gruy[eè]re|paneer|queso|half[- ]and[- ]half|cr[eè]me fra[iî]che|kefir|pesto)\b/,
    ex: /\b(coconut|almond|oat|soy|rice|cashew|hemp) (milk|cream|yogh?urt)|cream of tartar|(cocoa|peanut|almond|cashew|sunflower seed|seed|nut|apple) butter|butternut|butter beans?|butterhead|butter lettuce/g,
    free: /(dairy|lactose|milk)[- ]free|non-?dairy|vegan|plant[- ]based/ },
  egg: { label: 'Eggs', icon: '🥚', re: /\b(eggs?|mayonnaise|mayo|aioli|meringue)\b/, ex: /flax eggs?|chia eggs?/g, free: /egg[- ]free|vegan/ },
  peanut: { label: 'Peanuts', icon: '🥜', re: /\b(peanuts?|groundnuts?)\b/, free: /peanut[- ]free/ },
  treenut: { label: 'Tree nuts', icon: '🌰', re: /\b(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|pine nuts?|brazil nuts?|mixed nuts|nutella|pesto|marzipan)\b/, free: /nut[- ]free/ },
  soy: { label: 'Soy', icon: '🫘', re: /\b(soy|soya|tofu|edamame|miso|tempeh|tamari|shoyu|teriyaki)\b/, free: /soy[- ]free/ },
  gluten: { label: 'Gluten / wheat', icon: '🌾', re: /\b(flour|bread|breadcrumbs?|panko|pasta|spaghetti|penne|fettuccine|linguine|macaroni|noodles?|orzo|couscous|tortillas?|pita|naan|buns?|rolls?|wheat|barley|rye|soy sauce|worcestershire|croutons?|crackers?|pastry|pie crust|dough|seitan|udon|ramen|lasagn?a|baguette|ciabatta|brioche|bagels?|biscuits?|graham|beer|semolina|farro)\b/,
    ex: /rice noodles?|rice paper|corn tortillas?|(almond|coconut|rice|chickpea|corn|tapioca|buckwheat) flour|cornflour/g, free: /gluten[- ]free/ },
  fish: { label: 'Fish', icon: '🐟', re: /\b(salmon|tuna|cod|halibut|tilapia|trout|sardines?|anchov(y|ies)|mahi|snapper|sea bass|haddock|fish|worcestershire)\b/, free: /vegan|fish[- ]free/ },
  shellfish: { label: 'Shellfish', icon: '🦐', re: /\b(shrimps?|prawns?|crab|lobster|scallops?|clams?|mussels?|oysters?|crawfish|crayfish)\b/, free: /vegan|shellfish[- ]free/ },
  sesame: { label: 'Sesame', icon: '🌱', re: /\b(sesame|tahini|hummus|za'?atar)\b/, free: /sesame[- ]free/ },
  meat: { label: 'Meat', icon: '🥩', pseudo: true, re: /\b(chicken|turkey|duck|beef|steak|brisket|pork|bacon|ham|prosciutto|sausage|chorizo|lamb|veal|venison|meatballs?|pepperoni|salami)\b/, free: /vegan|vegetarian|plant[- ]based|meat[- ]?(less|free)/ },
  honey: { label: 'Honey', icon: '🍯', pseudo: true, re: /\bhoney\b/, free: /vegan/ },
};
const ALLERGEN_IDS = Object.keys(A).filter(k => !A[k].pseudo);
const label = id => id.startsWith('avoid:') ? id.slice(6) : (A[id] ? A[id].label : id);
function tagsOf(text) {
  const t = String(text).toLowerCase(), out = [];
  for (const [id, a] of Object.entries(A)) {
    if (a.free && a.free.test(t)) continue;
    if (a.re.test(a.ex ? t.replace(a.ex, ' ') : t)) out.push(id);
  }
  return out;
}
function bannedSet() {
  const p = P(), b = new Set(p.allergens);
  if (p.diet === 'pescatarian') b.add('meat');
  if (p.diet === 'vegetarian' || p.diet === 'vegan') ['meat', 'fish', 'shellfish'].forEach(x => b.add(x));
  if (p.diet === 'vegan') ['milk', 'egg', 'honey'].forEach(x => b.add(x));
  return b;
}
function hitsFor(text) {
  const banned = bannedSet(), hits = tagsOf(text).filter(t => banned.has(t)), low = String(text).toLowerCase();
  for (const w of P().avoid) if (w && low.includes(w.toLowerCase())) hits.push('avoid:' + w);
  return hits;
}
const LABEL = /chocolate|broth|stock|sausage|bacon|sauce|salsa|dressing|chips|bouillon|seasoning|curry powder|pesto|mustard|vinegar|baking powder/i;
const profileActive = () => { const p = P(); return p.allergens.length || p.avoid.length || p.diet !== 'none'; };

const SUBS = [
  { re: /soy sauce|tamari|shoyu/i, to: 'coconut aminos', note: 'Soy-free and gluten-free, a little sweeter.' },
  { re: /soy sauce/i, to: 'tamari (gluten-free soy sauce)', note: 'Gluten-free, but still soy.' },
  { re: /\bbutter\b(?! (beans?|lettuce))/i, to: 'dairy-free butter', note: 'Use a 1:1 swap.' },
  { re: /\bbutter\b(?! (beans?|lettuce))/i, to: 'olive oil', note: 'Use about 3/4 the amount.' },
  { re: /(?<!butter)\bmilk\b/i, to: 'oat milk', note: 'Closest in taste and texture.' },
  { re: /(?<!butter)\bmilk\b/i, to: 'unsweetened coconut milk', note: 'Richer, mild coconut flavour.' },
  { re: /buttermilk/i, to: 'oat milk + 1 tbsp lemon juice per cup', note: 'Let it sit 5 minutes to curdle.' },
  { re: /sour cream/i, to: 'dairy-free sour cream', note: '' },
  { re: /cream cheese/i, to: 'dairy-free cream cheese', note: '' },
  { re: /(heavy |whipping )?(?<!sour )cream(?! cheese)/i, to: 'full-fat coconut cream', note: 'Chill the can and use the thick part.' },
  { re: /yogh?urt/i, to: 'coconut yogurt', note: '' },
  { re: /parmesan/i, to: 'nutritional yeast', note: 'Cheesy and savoury, sprinkle to taste.', whole: true },
  { re: /cheese|mozzarella|cheddar|feta|ricotta/i, to: 'dairy-free cheese', note: 'Shreds and melts best in the vegan-cheese aisle.', whole: true },
  { re: /\beggs?\b/i, to: 'flax eggs (1 tbsp ground flax + 3 tbsp water each)', note: 'Best for baking and binding.' },
  { re: /\beggs?\b/i, to: 'unsweetened applesauce (1/4 cup per egg)', note: 'Adds moisture in baked goods.' },
  { re: /mayo|mayonnaise/i, to: 'vegan mayo', whole: true },
  { re: /(all-purpose |plain |bread )?flour/i, to: 'gluten-free 1:1 flour blend', note: 'Look for one containing xanthan gum.' },
  { re: /breadcrumbs?|panko/i, to: 'gluten-free breadcrumbs' },
  { re: /(spaghetti|penne|fettuccine|linguine|macaroni|orzo|pasta)/i, to: 'gluten-free $&', note: 'Corn/rice pasta; rinse if it gets sticky.' },
  { re: /(egg |wheat |lo mein |ramen |udon )?noodles?/i, to: 'rice noodles', whole: true, note: 'Naturally gluten-free and egg-free.' },
  { re: /(flour )?tortillas?/i, to: 'corn tortillas', whole: true },
  { re: /\b(buns?|bread|rolls?|pita|naan|baguette|ciabatta|bagels?|brioche)\b/i, to: 'gluten-free $&' },
  { re: /peanut butter/i, to: 'sunflower seed butter', note: 'Nut-free with a similar creamy texture.', whole: true },
  { re: /(almond|cashew) butter/i, to: 'sunflower seed butter', whole: true },
  { re: /peanuts?(?! butter)/i, to: 'toasted pumpkin seeds', whole: true, note: 'Crunchy and nut-free.' },
  { re: /(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|pine nuts?)(?! (milk|butter|flour))/i, to: 'toasted pumpkin seeds', whole: true, note: 'Crunchy and nut-free.' },
  { re: /almond flour/i, to: 'sunflower seed flour', whole: true },
  { re: /almond milk/i, to: 'oat milk', whole: true },
  { re: /tahini/i, to: 'sunflower seed butter', whole: true },
  { re: /sesame oil/i, to: 'avocado oil', whole: true },
  { re: /sesame seeds?/i, to: 'poppy seeds', whole: true },
  { re: /fish sauce/i, to: 'coconut aminos + splash of lime juice', whole: true },
  { re: /worcestershire/i, to: 'coconut aminos + 1 tsp vinegar', whole: true },
  { re: /honey/i, to: 'maple syrup', whole: true, note: 'Use the same amount.' },
  { re: /^(?!.*(broth|stock|bouillon)).*(chicken|turkey|beef|pork|lamb|steak|sausage|bacon|ham)/i, to: 'extra-firm tofu, cubed', whole: true },
  { re: /^(?!.*(broth|stock|bouillon)).*(chicken|turkey|beef|pork|lamb|steak|sausage|bacon|ham)/i, to: 'canned chickpeas, drained', whole: true },
  { re: /^(?!.*(broth|stock|bouillon)).*(chicken|turkey|beef|pork|lamb|steak|sausage|bacon|ham)/i, to: 'portobello or king oyster mushrooms, sliced', whole: true },
  { re: /(chicken|beef) (broth|stock)/i, to: 'vegetable broth', whole: true },
  { re: /(salmon|tuna|cod|halibut|tilapia|trout|shrimps?|prawns?|crab|scallops?|lobster)/i, to: 'boneless skinless chicken breast', whole: true },
  { re: /(salmon|tuna|cod|halibut|tilapia|trout|shrimps?|prawns?|crab|scallops?|lobster)/i, to: 'extra-firm tofu, cubed', whole: true },
  { re: /(salmon|tuna|cod|halibut|tilapia|trout|shrimps?|prawns?|crab|scallops?|lobster)/i, to: 'hearts of palm, sliced', whole: true },
];
function subsFor(name) {
  const out = [], seen = new Set();
  for (const s of SUBS) {
    if (!s.re.test(name)) continue;
    const cand = s.whole ? s.to : name.replace(s.re, s.to);
    if (seen.has(cand) || hitsFor(cand).length) continue;
    seen.add(cand); out.push({ name: cand, note: s.note || '' });
  }
  return out;
}
function analyze(r) {
  const sw = S.swaps[r.id] || {};
  let status = 'safe';
  const items = r.ingredients.map((raw, i) => {
    const orig = parseIng(raw), swapped = sw[i] != null, ing = { ...orig, n: swapped ? sw[i] : orig.n };
    const hits = hitsFor(ing.n), it = { i, orig, ing, swapped, hits, subs: [] };
    if (hits.length) {
      it.subs = subsFor(ing.n);
      status = it.subs.length ? (status === 'unsafe' ? 'unsafe' : 'swap') : 'unsafe';
    }
    return it;
  });
  return { items, status };
}
const statusOf = r => profileActive() ? analyze(r).status : 'safe';
const STATUS_TEXT = { safe: 'Safe for you', swap: 'Swap needed', unsafe: 'Contains allergen' };

/* ---------- rendering: sidebar ---------- */
const root = { side: $('#side'), list: $('#list'), detail: $('#detail'), app: $('#app') };
function setPane(p) { root.app.dataset.pane = p; }

function renderSide() {
  const recipes = allRecipes(), counts = {};
  recipes.forEach(r => counts[r.cat] = (counts[r.cat] || 0) + 1);
  const p = P(), n = p.allergens.length + p.avoid.length + (p.diet !== 'none' ? 1 : 0);
  const tile = (id, name, emoji, h, cls = '', count = null) =>
    `<button class="tile ${cls} ${S.ui.cat === id ? 'on' : ''}" style="--h:${h}" data-act="cat" data-id="${id}"><span class="em">${emoji}</span>${count != null ? `<span class="ct">${count}</span>` : ''}<span class="lb">${esc(name)}</span></button>`;
  const safeCount = profileActive() ? recipes.filter(r => statusOf(r) !== 'unsafe').length : recipes.length;
  root.side.innerHTML = `
    <div class="brand"><div class="logo">C</div><b>Cookify</b>
      <button class="ibtn" data-act="profile" title="Allergy & diet profile" aria-label="Allergy and diet profile">${ic('shield')}${n ? `<span class="dot">${n}</span>` : ''}</button>
      <button class="ibtn" data-act="shop" title="Shopping list" aria-label="Shopping list">${ic('cart')}${S.list.filter(i => !i.done).length ? `<span class="dot" style="background:var(--accent-strong)">${S.list.filter(i => !i.done).length}</span>` : ''}</button>
      <button class="ibtn" data-act="planner" title="Meal planner" aria-label="Meal planner">${ic('cal')}</button>
      <button class="ibtn primary" data-act="new" title="Add recipe" aria-label="Add recipe">${ic('plus')}</button>
    </div>
    <div class="tiles">
      ${tile('all', 'All recipes', '🍽️', 100, 'special', recipes.length)}
      ${tile('fav', 'Saved', '⭐', 48, 'fav', S.fav.filter(id => byId(id)).length)}
      ${profileActive() ? tile('safe', 'Safe for me', '🛡️', 150, 'safe', safeCount) : ''}
      ${CATS.map(c => tile(c.id, c.name, c.emoji, c.h, '', counts[c.id] || 0)).join('')}
    </div>
    <p style="color:var(--muted);font-size:12px;margin:16px 4px 4px">Allergen checks read ingredient names only. Always check packaged-food labels.</p>`;
}

/* ---------- rendering: list ---------- */
function visibleRecipes() {
  const u = S.ui, prof = P();
  const tokens = u.q.toLowerCase().split(/\s+/).filter(Boolean);
  let rs = allRecipes();
  if (u.cat === 'fav') rs = rs.filter(r => S.fav.includes(r.id));
  else if (u.cat !== 'all' && u.cat !== 'safe') rs = rs.filter(r => r.cat === u.cat);
  if (tokens.length) rs = rs.filter(r => {
    const hay = (r.title + ' ' + r.ingredients.join(' ') + ' ' + (catById(r.cat)?.name || '')).toLowerCase();
    return tokens.every(t => hay.includes(t));
  });
  if (u.quick) rs = rs.filter(r => r.time && r.time <= 30);
  const st = new Map(rs.map(r => [r.id, statusOf(r)]));
  let hidden = 0;
  if (u.cat === 'safe' || u.safeOnly || prof.hideUnsafe) {
    const before = rs.length;
    rs = rs.filter(r => (u.cat === 'safe' || u.safeOnly) ? st.get(r.id) !== 'unsafe' : st.get(r.id) !== 'unsafe');
    hidden = before - rs.length;
  }
  rs.sort(u.sort === 'time' ? (a, b) => (a.time || 999) - (b.time || 999) : (a, b) => a.title.localeCompare(b.title));
  return { rs, st, hidden };
}
function thumb(r, cls = 'thumb') {
  const h = catById(r.cat)?.h ?? 100;
  return `<span class="${cls}" style="--h:${h};${r.image ? `background-image:url('${esc(r.image)}')` : ''}">${r.image ? '' : esc(r.emoji || catById(r.cat)?.emoji || '🍽️')}</span>`;
}
function renderList() {
  const u = S.ui, { rs, st, hidden } = visibleRecipes();
  const title = u.cat === 'all' ? 'All recipes' : u.cat === 'fav' ? 'Saved' : u.cat === 'safe' ? 'Safe for me' : catById(u.cat)?.name || '';
  const active = profileActive();
  const focus = document.activeElement && document.activeElement.id === 'q';
  root.list.innerHTML = `
    <div class="lhead"><button class="tbtn back" data-act="toside" aria-label="Back">${ic('back')}</button>
      <div class="grow"><h2>${esc(title)}</h2><small>${rs.length} recipe${rs.length === 1 ? '' : 's'}</small></div>
      <button class="tbtn" data-act="sort" title="Sort: ${u.sort === 'title' ? 'A–Z' : 'quickest'}" aria-label="Change sort order">${ic('sort')}</button></div>
    <label class="search">${ic('search')}<input id="q" type="search" placeholder="Search recipes or ingredients" value="${esc(u.q)}" autocomplete="off"></label>
    <div class="chips">
      ${active ? `<button class="chip" data-act="safeonly" aria-pressed="${u.safeOnly}">${ic('shield')} Safe only</button>` : ''}
      <button class="chip" data-act="quick" aria-pressed="${u.quick}">${ic('clock')} Under 30 min</button>
      <span class="chip" style="border:0;background:none;color:var(--muted)">Sorted ${u.sort === 'title' ? 'A–Z' : 'by time'}</span>
    </div>
    ${hidden && !u.safeOnly && u.cat !== 'safe' ? `<div class="banner">${ic('shield')}<span>${hidden} recipe${hidden > 1 ? 's' : ''} hidden by your profile.</span><button data-act="showhidden">Show</button></div>` : ''}
    <div class="rows">${rs.map(r => `
      <button class="row ${S.ui.sel === r.id ? 'on' : ''}" data-act="open" data-id="${esc(r.id)}">${thumb(r)}
        <span class="t"><b>${esc(r.title)}</b><small>${esc(fmtTime(r.time))}${r.time && r.source ? ' · ' : ''}${esc(r.source || '')}</small></span>
        ${active ? `<span class="badge ${st.get(r.id)}">${STATUS_TEXT[st.get(r.id)]}</span>` : ''}</button>`).join('')}</div>
    ${rs.length ? '' : `<div class="empty"><div class="big">🍽️</div><p>${u.q ? 'Nothing matches that search.' : 'No recipes here yet.'}</p><button class="gbtn" data-act="new">${ic('plus')} Add a recipe</button></div>`}`;
  if (focus) { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------- rendering: detail ---------- */
function renderDetail() {
  const r = S.ui.sel && byId(S.ui.sel);
  if (!r) {
    root.detail.innerHTML = `<div class="empty" style="padding-top:20vh"><div class="big">👩‍🍳</div><h2 style="margin:8px 0">Pick something to cook</h2>
      <p>Set your allergies and diet, and every recipe is checked ingredient by ingredient.</p>
      <button class="gbtn" data-act="profile">${ic('shield')} Set up my profile</button></div>`;
    return;
  }
  const scroll = root.detail.scrollTop;
  const cat = catById(r.cat), h = cat?.h ?? 100;
  const serves = S.servings[r.id] || r.serves || 4, factor = serves / (r.serves || serves);
  const { items, status } = analyze(r), active = profileActive();
  const tags = [...new Set(items.flatMap(it => tagsOf(it.ing.n)))];
  const hitSet = bannedSet();
  const checked = S.checked[r.id] || {};
  const bad = items.filter(it => it.hits.length);
  const isFav = S.fav.includes(r.id);
  let safeHtml = '';
  if (!active) safeHtml = `<div class="safebox none">${ic('shield')}<div>Tell Cookify about your allergies and diet to check this recipe. <button data-act="profile">Set up profile</button></div></div>`;
  else if (status === 'safe') safeHtml = `<div class="safebox safe">${ic('check')}<div><b>Safe for your profile.</b> No ingredients match your allergens or diet.</div></div>`;
  else if (status === 'swap') safeHtml = `<div class="safebox swap">${ic('swap')}<div><b>Needs ${bad.length} swap${bad.length > 1 ? 's' : ''}.</b> Ingredients highlighted below conflict with your profile, and each has a safe substitute.</div></div>`;
  else safeHtml = `<div class="safebox unsafe">${ic('alert')}<div><b>Not safe as written.</b> ${bad.some(b => !b.subs.length) ? 'At least one ingredient has no safe substitute we can suggest.' : ''} Look for a different recipe or adapt it carefully.</div></div>`;

  root.detail.innerHTML = `<div class="dwrap">
    <div class="dtop"><button class="tbtn back" data-act="tolist" aria-label="Back">${ic('back')}</button>
      <span class="pill">${esc(cat?.name || 'Recipe')}</span><span class="grow"></span>
      <button class="tbtn" data-act="print" title="Print" aria-label="Print">${ic('print')}</button>
      <button class="tbtn" data-act="share" title="Share" aria-label="Share">${ic('share')}</button>
      <button class="tbtn" data-act="copy" title="Copy ingredients" aria-label="Copy ingredients">${ic('copy')}</button>
      <button class="gbtn" data-act="edit">${ic('edit')} Edit</button></div>
    <div class="hero" style="--h:${h};${r.image ? `background-image:url('${esc(r.image)}')` : ''}">${r.image ? '' : `<span class="em">${esc(r.emoji || cat?.emoji || '🍽️')}</span>`}
      <button class="star ${isFav ? 'on' : ''}" data-act="fav" aria-label="${isFav ? 'Remove from saved' : 'Save recipe'}" aria-pressed="${isFav}">${ic('star')}</button></div>
    <div class="dbody">
      <h1>${esc(r.title)}</h1>
      <div class="meta">
        ${r.time ? `<span class="mchip">${ic('clock')} ${esc(fmtTime(r.time))}</span>` : ''}
        <span class="mchip">${ic('users')} Serves ${serves}</span>
        ${r.source ? `<span class="mchip">${esc(r.source)}</span>` : ''}
        <button class="switch" data-act="cook" aria-label="Start cook mode">Cook Mode <i></i></button>
      </div>
      ${safeHtml}
      ${tags.length ? `<div class="contains">Contains: ${tags.map(t => `<span class="tag ${hitSet.has(t) ? 'hit' : ''}">${A[t].icon} ${A[t].label}</span>`).join('')}</div>` : `<div class="contains">No common allergens detected.</div>`}
      <h3 class="sec">Ingredients</h3>
      <div class="stepper"><button data-act="serv" data-d="-1" aria-label="Fewer servings">−</button><span>${ic('users')} Serves ${serves}</span><button data-act="serv" data-d="1" aria-label="More servings">+</button></div>
      <button class="obtn" data-act="units" style="margin-left:6px;padding:5px 12px">${S.units === 'us' ? 'US → Metric' : 'Metric → US'}</button>
      <ul class="ings">${items.map(it => {
        const hit = it.hits.length, open = S.ui.swapOpen === it.i;
        const txt = fmtIng(it.ing, factor);
        return `<li class="ing ${hit ? 'flag' : ''}"><label><input type="checkbox" data-act="chk" data-i="${it.i}" ${checked[it.i] ? 'checked' : ''}><span class="txt">${hit ? `<b>${esc(txt)}</b>` : esc(txt)}${!hit && active && LABEL.test(it.ing.n) ? ' <span class="tag" title="Packaged versions can contain hidden allergens">Check label</span>' : ''}</span></label>
          ${it.swapped ? `<div class="swapped">Swapped from <s>${esc(it.orig.n)}</s> · <button data-act="undo" data-i="${it.i}">Undo</button></div>` : ''}
          ${hit ? `<div class="warn">${ic('alert')} Conflicts with: ${it.hits.map(x => esc(label(x))).join(', ')}
            ${it.subs.length ? `<button data-act="swapopen" data-i="${it.i}">${open ? 'Hide swaps' : `Find a swap (${it.subs.length})`}</button>` : '<b>No safe swap found</b>'}</div>` : ''}
          ${hit && open ? `<div class="subs">${it.subs.map((s, j) => `<button class="sub" data-act="applyswap" data-i="${it.i}" data-j="${j}"><span>${esc(s.name)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span><span class="use">Use this</span></button>`).join('')}</div>` : ''}</li>`;
      }).join('')}</ul>
      <h3 class="sec">Directions</h3>
      <ol class="steps">${r.steps.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
      <div class="notes-wrap"><h3 class="sec">My notes</h3><textarea class="notes" data-notes="${esc(r.id)}" placeholder="Tweaks, timings, who liked it…">${esc(S.notes[r.id] || '')}</textarea></div>
      <div class="actions">
        <button class="gbtn" data-act="cook">${ic('chef')} Start cooking</button>
        <button class="obtn" data-act="addlist">${ic('cart')} Add to shopping list</button>
        <button class="obtn" data-act="addplan">${ic('cal')} Add to plan</button></div>
    </div></div>`;
  root.detail.scrollTop = scroll;
}

/* ---------- modals ---------- */
const modalEl = $('#modal');
let modalFn = null;
function showModal(fn) { modalFn = fn; modalEl.classList.add('open'); refreshModal(); }
function refreshModal() {
  if (!modalFn) return;
  const st = modalEl.firstElementChild ? modalEl.firstElementChild.scrollTop : 0;
  modalEl.innerHTML = modalFn();
  if (modalEl.firstElementChild) modalEl.firstElementChild.scrollTop = st;
}
function closeModal() {
  const wasProfile = modalFn && modalFn === profileModal;
  modalFn = null; modalEl.classList.remove('open'); modalEl.innerHTML = '';
  if (wasProfile) { if (!S.profile) S.profile = { ...DEFAULT_PROFILE }; persist('profile'); renderAll(); }
}
const sheet = (title, body, foot = '', wide = false) => `<div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="tbtn" data-act="close" aria-label="Close">${ic('x')}</button></header><div class="body">${body}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;

function profileModal() {
  const p = P(), first = !S.profile;
  return sheet(first ? 'Welcome to Cookify' : 'Allergies & diet', `
    <p class="help">${first ? 'Tell me what to avoid and I will check every ingredient, warn you, and suggest safe swaps. ' : ''}Everything stays on this device.</p>
    <h3 class="sec" style="margin-top:6px">I'm allergic to</h3>
    <div class="agrid">${ALLERGEN_IDS.map(id => `<button class="abtn" data-act="tgl-allergen" data-id="${id}" aria-pressed="${p.allergens.includes(id)}"><span>${A[id].icon}</span>${A[id].label}</button>`).join('')}</div>
    <h3 class="sec">Diet</h3>
    <div class="agrid">${[['none', 'No restriction', '🍽️'], ['pescatarian', 'Pescatarian', '🐟'], ['vegetarian', 'Vegetarian', '🥕'], ['vegan', 'Vegan', '🌱']].map(([id, n, e]) => `<button class="abtn diet" data-act="diet" data-id="${id}" aria-pressed="${p.diet === id}"><span>${e}</span>${n}</button>`).join('')}</div>
    <h3 class="sec">Also avoid</h3>
    <div class="inline"><input id="avoidIn" placeholder="e.g. cilantro, mushrooms, nightshades" aria-label="Ingredient to avoid"><button class="obtn" data-act="addavoid">Add</button></div>
    <div class="avoidtags">${p.avoid.map((w, i) => `<span class="tag hit">${esc(w)} <button data-act="rmavoid" data-i="${i}" aria-label="Remove ${esc(w)}">${ic('x')}</button></span>`).join('')}</div>
    <div class="switchrow"><div><b>Hide unsafe recipes</b><div style="color:var(--muted);font-size:13px">Recipes with an unfixable conflict disappear from lists.</div></div>
      <button class="abtn diet" style="min-width:74px;justify-content:center" data-act="hideunsafe" aria-pressed="${p.hideUnsafe}">${p.hideUnsafe ? 'On' : 'Off'}</button></div>
    <p class="help" style="margin-top:14px">Cookify reads ingredient names and can't see hidden ingredients in packaged foods or cross-contact in kitchens. For serious allergies always read labels and follow your doctor's advice.</p>`,
    `<button class="gbtn" data-act="close">${first ? 'Start cooking' : 'Done'}</button>`);
}

function shopModal() {
  const AISLES = [['Produce', /lettuce|spinach|tomato|onion|garlic|pepper|carrot|celery|cucumber|potato|potatoes|lemon|lime|avocado|banana|basil|parsley|dill|thyme|rosemary|cabbage|zucchini|beans?\b.*trimmed|green beans|corn|ginger|herb|fruit|apple|berr/i],
    ['Meat & seafood', /chicken|beef|pork|steak|sausage|bacon|salmon|shrimp|fish|turkey|lamb|ham\b/i],
    ['Dairy & eggs', /milk|butter|cheese|cream|yogh?urt|egg/i],
    ['Pantry', /flour|sugar|salt|pepper|oil|vinegar|sauce|rice|pasta|spaghetti|noodles|beans|chickpeas|broth|stock|spice|powder|paprika|cumin|oregano|baking|honey|syrup|vanilla|chips|tortilla|bread|baguette|cornstarch|tomatoes|olives|peanut|almond|walnut|sesame|coconut/i]];
  const aisle = it => (AISLES.find(([, re]) => re.test(it.n)) || ['Other'])[0];
  const groups = {};
  S.list.forEach((it, i) => (groups[aisle(it)] ||= []).push([it, i]));
  const order = ['Produce', 'Meat & seafood', 'Dairy & eggs', 'Pantry', 'Other'];
  const body = S.list.length ? order.filter(a => groups[a]).map(a => `<div class="aisle">${a}</div>${groups[a].map(([it, i]) => `<div class="li ${it.done ? 'done' : ''}"><input type="checkbox" data-act="listchk" data-i="${i}" ${it.done ? 'checked' : ''} aria-label="Got it"><span>${esc(fmtIng(it))}</span><button class="tbtn" data-act="listdel" data-i="${i}" aria-label="Remove">${ic('x')}</button></div>`).join('')}`).join('')
    : `<div class="empty"><div class="big">🛒</div><p>Your list is empty. Open a recipe and choose “Add to shopping list”.</p></div>`;
  return sheet('Shopping list', `<div class="inline" style="margin-bottom:6px"><input id="listIn" placeholder="Add an item" aria-label="Add an item"><button class="obtn" data-act="listadd">Add</button></div>${body}`,
    S.list.length ? `<button class="obtn" data-act="listcopy">${ic('copy')} Copy</button><button class="obtn" data-act="listclear">Clear checked</button><button class="obtn" data-act="listall">Clear all</button>` : '');
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function plannerModal() {
  const body = DAYS.map(d => `<div class="day"><b>${d}</b><div class="meals">${(S.plan[d] || []).map((id, i) => { const r = byId(id); if (!r) return ''; const s = statusOf(r);
    return `<span class="meal"><button data-act="open" data-id="${esc(id)}" style="font-weight:600">${esc(r.emoji || '')} ${esc(r.title)}</button>${profileActive() ? `<span class="badge ${s}">${STATUS_TEXT[s]}</span>` : ''}<button class="x" data-act="planrm" data-d="${d}" data-i="${i}" aria-label="Remove">${ic('x')}</button></span>`; }).join('') || '<span style="color:var(--muted)">Nothing planned</span>'}</div></div>`).join('');
  return sheet('Meal planner', `<p class="help">Plan your week, then send every ingredient to your shopping list. Open a recipe and choose “Add to plan”.</p>${body}`,
    `<button class="obtn" data-act="planclear">Clear week</button><button class="gbtn" data-act="plantolist">${ic('cart')} Add week to shopping list</button>`, true);
}
let planTarget = null;
function planPickModal() {
  const r = byId(planTarget);
  return sheet('Add to plan', `<p class="help">Which day are you cooking <b>${esc(r?.title || '')}</b>?</p><div class="daypick">${DAYS.map(d => `<button data-act="planpick" data-d="${d}">${d}</button>`).join('')}</div>`);
}

function formModal(r) {
  const editing = !!r;
  const v = r || { title: '', cat: S.ui.cat && catById(S.ui.cat) ? S.ui.cat : CATS[0].id, emoji: '', time: '', serves: 4, source: '', image: '', ingredients: [], steps: [] };
  return sheet(editing ? 'Edit recipe' : 'Add a recipe', `
    ${editing ? '' : `<div class="field"><label>Import from a web page</label><div class="inline"><input id="impUrl" type="url" placeholder="https://… any recipe page"><button class="obtn" data-act="import">Import</button></div><div class="err" id="impErr"></div></div>`}
    <form id="rform" autocomplete="off">
    <div class="field"><label for="f-title">Title</label><input id="f-title" name="title" required value="${esc(v.title)}"></div>
    <div class="three"><div class="field"><label for="f-emoji">Emoji</label><input id="f-emoji" name="emoji" maxlength="4" value="${esc(v.emoji)}" placeholder="🍲"></div>
      <div class="field"><label for="f-cat">Category</label><select id="f-cat" name="cat">${CATS.map(c => `<option value="${c.id}" ${c.id === v.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-src">Source</label><input id="f-src" name="source" value="${esc(v.source)}" placeholder="grandma"></div></div>
    <div class="two"><div class="field"><label for="f-time">Minutes</label><input id="f-time" name="time" type="number" min="0" value="${esc(v.time)}"></div>
      <div class="field"><label for="f-serves">Serves</label><input id="f-serves" name="serves" type="number" min="1" value="${esc(v.serves)}"></div></div>
    <div class="field"><label for="f-img">Photo URL (optional)</label><input id="f-img" name="image" type="url" value="${esc(v.image || '')}"></div>
    <div class="field"><label for="f-ing">Ingredients (one per line)</label><textarea id="f-ing" name="ingredients" required placeholder="2 cups flour&#10;1 tsp salt">${esc(v.ingredients.join('\n'))}</textarea></div>
    <div class="field"><label for="f-steps">Directions (one step per line)</label><textarea id="f-steps" name="steps" required>${esc(v.steps.join('\n'))}</textarea></div>
    </form>`,
    `${editing ? `<button class="obtn" style="color:var(--bad);margin-right:auto" data-act="delete">${ic('trash')} Delete</button>` : ''}<button class="obtn" data-act="close">Cancel</button><button class="gbtn" data-act="saveform">Save recipe</button>`);
}
let editingId = null;

/* ---------- toast, timers, wake lock ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
let audio, TID = 0;
const TIMERS = [];
function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(d => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination); o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.2); });
  } catch { /* audio unavailable */ }
}
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function startTimer(sec, name) {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume && audio.resume(); } catch { /* ignore */ }
  TIMERS.push({ id: ++TID, end: Date.now() + sec * 1000, name, done: false }); renderTimers(); toast(`Timer started: ${mmss(sec)}`);
}
function renderTimers() {
  $('#timers').innerHTML = TIMERS.map(t => { const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    return `<div class="timer ${t.done ? 'done' : ''}">${ic('timer')}<span>${t.done ? 'Done!' : mmss(left)}</span><small>${esc(t.name)}</small><button data-act="rmtimer" data-id="${t.id}" aria-label="Dismiss timer">${ic('x')}</button></div>`; }).join('');
}
setInterval(() => {
  if (!TIMERS.length) return;
  TIMERS.forEach(t => { if (!t.done && Date.now() >= t.end) { t.done = true; beep(); toast(`Timer done: ${t.name}`); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } });
  renderTimers();
}, 500);
let wake = null;
async function wakeOn() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { /* denied */ } }
function wakeOff() { try { wake && wake.release(); } catch { /* ignore */ } wake = null; }

/* ---------- cook mode ---------- */
const COOK = { id: null, step: 0, ing: false };
const cookEl = $('#cook');
function timeIn(step) {
  const m = step.match(/(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i);
  if (!m) return null;
  const n = Math.max(+m[1], +(m[2] || 0)), u = m[3].toLowerCase();
  return { sec: u.startsWith('h') ? n * 3600 : u.startsWith('m') ? n * 60 : n, text: m[0] };
}
function renderCook() {
  const r = byId(COOK.id); if (!r) return;
  const n = r.steps.length, step = r.steps[COOK.step], t = timeIn(step);
  const { items } = analyze(r), serves = S.servings[r.id] || r.serves || 4, factor = serves / (r.serves || serves);
  cookEl.innerHTML = `
    <div class="chead"><button class="tbtn" data-act="cookexit" aria-label="Exit cook mode">${ic('x')}</button><b>${esc(r.title)}</b>
      <button class="obtn" data-act="cooking" aria-pressed="${COOK.ing}">${ic('list')} Ingredients</button></div>
    <div class="cbar"><i style="width:${((COOK.step + 1) / n) * 100}%"></i></div>
    <div class="cbody"><div class="cstep"><div class="n">Step ${COOK.step + 1} of ${n}</div><p>${esc(step)}</p>
      ${t ? `<button class="gbtn" data-act="cooktimer" data-sec="${t.sec}">${ic('timer')} Start ${mmss(t.sec)} timer</button>` : ''}</div></div>
    <div class="cing ${COOK.ing ? 'open' : ''}"><ul>${items.map(it => `<li>${esc(fmtIng(it.ing, factor))}</li>`).join('')}</ul></div>
    <div class="cfoot"><button data-act="cookprev" ${COOK.step === 0 ? 'disabled' : ''}>Back</button>
      <button class="next" data-act="${COOK.step === n - 1 ? 'cookexit' : 'cooknext'}">${COOK.step === n - 1 ? 'Finish 🎉' : 'Next step'}</button></div>`;
}
function openCook(id) { COOK.id = id; COOK.step = 0; COOK.ing = false; cookEl.classList.add('open'); renderCook(); wakeOn(); }
function closeCook() { cookEl.classList.remove('open'); cookEl.innerHTML = ''; COOK.id = null; wakeOff(); }

/* ---------- shopping list logic ---------- */
function addToList(r, mult = 1) {
  const serves = S.servings[r.id] || r.serves || 4, factor = (serves / (r.serves || serves)) * mult;
  analyze(r).items.forEach(({ ing }) => {
    const [q, u] = ing.q == null ? [null, ''] : [ing.q * factor, ing.u];
    const key = ing.n.toLowerCase().replace(/,.*$/, '').trim();
    const hit = q != null && S.list.find(x => !x.done && x.q != null && x.u === u && x.key === key);
    if (hit) hit.q += q; else S.list.push({ q, u, n: ing.n, key, done: false });
  });
  persist('list'); renderSide();
}

/* ---------- actions ---------- */
const ACT = {
  cat(t) { S.ui.cat = t.dataset.id; S.ui.q = ''; renderSide(); renderList(); setPane('list'); root.list.scrollTop = 0; },
  open(t) { closeModalQuiet(); openRecipe(t.dataset.id); },
  toside() { setPane('cats'); }, tolist() { setPane('list'); },
  sort() { S.ui.sort = S.ui.sort === 'title' ? 'time' : 'title'; renderList(); },
  quick() { S.ui.quick = !S.ui.quick; renderList(); },
  safeonly() { S.ui.safeOnly = !S.ui.safeOnly; renderList(); },
  showhidden() { S.profile = { ...P(), hideUnsafe: false }; persist('profile'); renderAll(); },
  fav() { const id = S.ui.sel; S.fav = S.fav.includes(id) ? S.fav.filter(x => x !== id) : [...S.fav, id]; persist('fav'); renderDetail(); renderSide(); if (S.ui.cat === 'fav') renderList(); },
  serv(t) { const r = byId(S.ui.sel); S.servings[r.id] = Math.max(1, (S.servings[r.id] || r.serves || 4) + +t.dataset.d); renderDetail(); },
  units() { S.units = S.units === 'us' ? 'metric' : 'us'; persist('units'); renderDetail(); },
  chk(t) { const id = S.ui.sel; (S.checked[id] ||= {})[t.dataset.i] = t.checked; },
  swapopen(t) { const i = +t.dataset.i; S.ui.swapOpen = S.ui.swapOpen === i ? null : i; renderDetail(); },
  applyswap(t) {
    const r = byId(S.ui.sel), it = analyze(r).items[+t.dataset.i], sub = it.subs[+t.dataset.j];
    (S.swaps[r.id] ||= {})[it.i] = sub.name; S.ui.swapOpen = null; persist('swaps'); toast(`Swapped to ${sub.name}`); renderDetail(); renderList();
  },
  undo(t) { const id = S.ui.sel; delete (S.swaps[id] || {})[t.dataset.i]; persist('swaps'); renderDetail(); renderList(); },
  cook() { openCook(S.ui.sel); },
  cookexit() { closeCook(); }, cooknext() { COOK.step++; renderCook(); }, cookprev() { COOK.step--; renderCook(); },
  cooking() { COOK.ing = !COOK.ing; renderCook(); },
  cooktimer(t) { const r = byId(COOK.id); startTimer(+t.dataset.sec, `${r.title} · step ${COOK.step + 1}`); },
  rmtimer(t) { const i = TIMERS.findIndex(x => x.id === +t.dataset.id); if (i > -1) TIMERS.splice(i, 1); renderTimers(); },
  print() { window.print(); },
  async share() {
    const r = byId(S.ui.sel), url = location.href.split('#')[0] + '#r=' + encodeURIComponent(r.id);
    try { if (navigator.share) { await navigator.share({ title: r.title, text: `${r.title} on Cookify`, url }); return; } await navigator.clipboard.writeText(url); toast('Link copied'); } catch { /* cancelled */ }
  },
  async copy() {
    const r = byId(S.ui.sel), serves = S.servings[r.id] || r.serves || 4, f = serves / (r.serves || serves);
    try { await navigator.clipboard.writeText(r.title + '\n\n' + analyze(r).items.map(i => '• ' + fmtIng(i.ing, f)).join('\n')); toast('Ingredients copied'); } catch { toast('Copy failed'); }
  },
  addlist() { const r = byId(S.ui.sel); addToList(r); toast('Added to shopping list'); },
  addplan() { planTarget = S.ui.sel; showModal(planPickModal); },
  planpick(t) { const d = t.dataset.d; (S.plan[d] ||= []).push(planTarget); persist('plan'); toast(`Planned for ${d}`); closeModal(); },
  planrm(t) { S.plan[t.dataset.d].splice(+t.dataset.i, 1); persist('plan'); refreshModal(); },
  planclear() { S.plan = {}; persist('plan'); refreshModal(); },
  plantolist() { let n = 0; Object.values(S.plan).flat().forEach(id => { const r = byId(id); if (r) { addToList(r); n++; } }); toast(n ? `Added ${n} recipe${n > 1 ? 's' : ''} to your list` : 'Plan is empty'); if (n) showModal(shopModal); },
  planner() { showModal(plannerModal); }, shop() { showModal(shopModal); },
  listchk(t) { S.list[+t.dataset.i].done = t.checked; persist('list'); refreshModal(); renderSide(); },
  listdel(t) { S.list.splice(+t.dataset.i, 1); persist('list'); refreshModal(); renderSide(); },
  listadd() { const inp = $('#listIn'), v = inp.value.trim(); if (!v) return; const ing = parseIng(v); S.list.push({ q: ing.q, u: ing.u, n: ing.n, key: ing.n.toLowerCase(), done: false }); persist('list'); refreshModal(); renderSide(); $('#listIn').focus(); },
  listclear() { S.list = S.list.filter(i => !i.done); persist('list'); refreshModal(); renderSide(); },
  listall() { S.list = []; persist('list'); refreshModal(); renderSide(); },
  async listcopy() { try { await navigator.clipboard.writeText(S.list.filter(i => !i.done).map(i => '• ' + fmtIng(i)).join('\n')); toast('List copied'); } catch { toast('Copy failed'); } },
  profile() { showModal(profileModal); },
  'tgl-allergen'(t) { const p = { ...P() }, id = t.dataset.id; p.allergens = p.allergens.includes(id) ? p.allergens.filter(x => x !== id) : [...p.allergens, id]; S.profile = p; persist('profile'); refreshModal(); },
  diet(t) { S.profile = { ...P(), diet: t.dataset.id }; persist('profile'); refreshModal(); },
  hideunsafe() { S.profile = { ...P(), hideUnsafe: !P().hideUnsafe }; persist('profile'); refreshModal(); },
  addavoid() { const v = $('#avoidIn').value.split(',').map(x => x.trim()).filter(Boolean); if (!v.length) return; S.profile = { ...P(), avoid: [...new Set([...P().avoid, ...v])] }; persist('profile'); refreshModal(); $('#avoidIn').focus(); },
  rmavoid(t) { const a = [...P().avoid]; a.splice(+t.dataset.i, 1); S.profile = { ...P(), avoid: a }; persist('profile'); refreshModal(); },
  new() { editingId = null; showModal(() => formModal(null)); },
  edit() { editingId = S.ui.sel; showModal(() => formModal(byId(editingId))); },
  async import() {
    const url = $('#impUrl').value.trim(), err = $('#impErr'), btn = $('[data-act=import]');
    err.textContent = ''; btn.textContent = 'Importing…'; btn.disabled = true;
    try {
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Import failed');
      const f = $('#rform').elements;
      f.title.value = d.title; f.time.value = d.time || ''; f.serves.value = d.serves || 4; f.source.value = d.source || '';
      f.image.value = d.image || ''; f.ingredients.value = d.ingredients.join('\n'); f.steps.value = d.steps.join('\n');
      toast('Imported. Review and save.');
    } catch (e) { err.textContent = e.message; }
    btn.textContent = 'Import'; btn.disabled = false;
  },
  saveform() {
    const form = $('#rform'); if (!form.reportValidity()) return;
    const f = form.elements;
    const lines = s => s.split('\n').map(x => x.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
    const rec = { id: editingId || 'c' + Date.now().toString(36), title: f.title.value.trim(), cat: f.cat.value, emoji: f.emoji.value.trim(), time: +f.time.value || 0,
      serves: +f.serves.value || 4, source: f.source.value.trim(), image: f.image.value.trim(), ingredients: lines(f.ingredients.value), steps: lines(f.steps.value) };
    if (editingId) {
      const ci = S.custom.findIndex(r => r.id === editingId);
      if (ci > -1) S.custom[ci] = rec; else S.edits[editingId] = rec;
      delete S.swaps[editingId]; persist('swaps');
    } else S.custom.push(rec);
    persist('custom', 'edits'); closeModal(); S.ui.cat = 'all'; S.ui.q = ''; renderAll(); openRecipe(rec.id); toast('Recipe saved');
  },
  delete() {
    if (!confirm('Delete this recipe?')) return;
    const id = editingId, ci = S.custom.findIndex(r => r.id === id);
    if (ci > -1) S.custom.splice(ci, 1); else { S.hidden.push(id); delete S.edits[id]; }
    S.fav = S.fav.filter(x => x !== id); persist('custom', 'edits', 'hidden', 'fav');
    closeModal(); S.ui.sel = null; renderAll(); setPane('list'); toast('Recipe deleted');
  },
  close() { closeModal(); },
};
function closeModalQuiet() { if (modalFn) closeModal(); }

function openRecipe(id) {
  S.ui.sel = id; S.ui.swapOpen = null;
  const r = byId(id);
  if (r && S.ui.cat !== 'all' && S.ui.cat !== 'fav' && S.ui.cat !== 'safe' && r.cat !== S.ui.cat) S.ui.cat = r.cat;
  renderSide(); renderList(); renderDetail(); setPane('detail'); root.detail.scrollTop = 0;
  history.replaceState(null, '', '#r=' + encodeURIComponent(id));
}
function renderAll() { renderSide(); renderList(); renderDetail(); }

document.addEventListener('click', e => {
  if (e.target === modalEl) { closeModal(); return; }
  const t = e.target.closest('[data-act]'); if (!t) return;
  const fn = ACT[t.dataset.act]; if (fn) fn(t, e);
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.ui.q = e.target.value; renderList(); }
  else if (e.target.dataset && e.target.dataset.notes) { S.notes[e.target.dataset.notes] = e.target.value; persist('notes'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (cookEl.classList.contains('open')) closeCook(); else if (modalFn) closeModal(); return; }
  if (e.key === 'Enter' && e.target.id === 'avoidIn') { e.preventDefault(); ACT.addavoid(); }
  if (e.key === 'Enter' && e.target.id === 'listIn') { e.preventDefault(); ACT.listadd(); }
  if (cookEl.classList.contains('open') && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
    const n = byId(COOK.id).steps.length;
    if ((e.key === 'ArrowRight' || e.key === ' ') && COOK.step < n - 1) { e.preventDefault(); ACT.cooknext(); }
    if (e.key === 'ArrowLeft' && COOK.step > 0) ACT.cookprev();
  }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && COOK.id) wakeOn(); });

/* ---------- boot ---------- */
renderAll();
const m = location.hash.match(/#r=(.+)/);
if (m && byId(decodeURIComponent(m[1]))) openRecipe(decodeURIComponent(m[1]));
if (!S.profile) showModal(profileModal);
})();
