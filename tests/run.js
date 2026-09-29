/*
 * Тесты RU Apps AdBlock.
 *   node tests/run.js            — запустить (Node 18+, без зависимостей)
 *   node tests/run.js --update   — пересчитать эталоны после НАМЕРЕННОГО изменения поведения скрипта
 *
 * Что проверяется:
 *   1. Модуль: регулярные выражения, адреса скрипта, список расшифровки; версия одинакова в скрипте, модуле и README.
 *   2. Поведение по приложениям — явные проверки (WB Кошелёк, AliExpress, DDX Fitness, Яндекс Go…).
 *   3. Эталоны: типовые ответы всех приложений; результат скрипта сверяется с сохранённым отпечатком —
 *      любое незапланированное изменение поведения сразу видно.
 *   4. Случайные ответы: скрипт не падает, вызывает $done ровно один раз и отдаёт корректный JSON.
 * Скрипт запускается так же, как в Shadowrocket: глобальные $request / $response / $argument / $done / $httpClient.
 */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'ru-adblock.js'), 'utf8');
const MOD = fs.readFileSync(path.join(ROOT, 'RU-Apps-AdBlock.sgmodule'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const CODE = new vm.Script(SRC, { filename: 'ru-adblock.js' });
const UPDATE = process.argv.indexOf('--update') !== -1;
const RAW = 'https://raw.githubusercontent.com/Melidovskiy/ru-apps-adblock/main/';

// ── запуск скрипта как в Shadowrocket ──
function run(fx) {
  const logs = [], all = [], http = [];
  const ctx = {
    $request: { url: fx.url, method: fx.method || 'GET', headers: fx.headers || fx.reqHeaders || {} },
    $argument: fx.argument === undefined ? 'debug' : fx.argument,
    $done: (r) => all.push(r),
    console: { log: (s) => logs.push(String(s)) },
  };
  if (!fx.request) {
    const body = typeof fx.body === 'string' ? fx.body : JSON.stringify(fx.body);
    ctx.$response = { status: 200, headers: fx.resHeaders || { 'Content-Type': 'application/json' }, body: body };
  }
  if (fx.http !== undefined) ctx.$httpClient = { get: (opts, cb) => { http.push(opts); const h = fx.http; if (h === 'never') return; cb(h.err || null, h.resp || null, h.body); } };
  vm.createContext(ctx);
  CODE.runInContext(ctx, { timeout: 10000 });
  return { result: all[0], calls: all.length, all: all, logs: logs, http: http };
}

let fail = 0, n = 0;
function group(name) { console.log('\n' + name); }
function report(name, ok, err, logs) {
  n++; if (!ok) fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (err ? ' — ' + err : ''));
  if (!ok && logs) logs.forEach((l) => console.log('        ' + String(l).slice(0, 400)));
}
// проверка ответа: check(разобранный результат | null, текст результата | null, полный результат запуска)
function t(name, fx, check) {
  let r, p = null, out = null, ok = false, err = '';
  try {
    r = run(fx);
    out = r.result && typeof r.result.body === 'string' ? r.result.body : null;
    try { p = out ? JSON.parse(out) : null; } catch (e) { p = 'PARSE-ERROR'; }
    ok = check(p, out, r) !== false;
  } catch (e) { err = e.message; }
  report(name, ok, err, r && r.logs);
}
// проверка произвольной функцией
function tx(name, fn) { let ok = false, err = ''; try { ok = fn() !== false; } catch (e) { err = e.message; } report(name, ok, err); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' ожидалось ' + JSON.stringify(b).slice(0, 300) + ', получено ' + JSON.stringify(a).slice(0, 300)); }
const clone = (x) => JSON.parse(JSON.stringify(x));

// ═════════════════════ 1. Модуль ═════════════════════
group('1. Модуль');
tx('M1 версия одинакова в скрипте, модуле и значке README', () => {
  const s = (SRC.match(/RU Apps AdBlock v(\d+\.\d+)/) || [])[1];
  const m = (MOD.match(/^#!name=RU Apps AdBlock v(\d+\.\d+)/m) || [])[1];
  const r = (README.match(/badge\/version-(\d+\.\d+)-/) || [])[1];
  if (!s || !m || !r) throw new Error('версия не найдена: скрипт ' + s + ', модуль ' + m + ', README ' + r);
  eq([m, r], [s, s], 'версии');
});
const scriptLines = MOD.split('\n').filter((l) => /^[\w-]+ = type=http-(request|response),/.test(l));
tx('M2 строки [Script]: шаблоны — корректные регулярные выражения', () => {
  if (scriptLines.length < 3) throw new Error('строк [Script]: ' + scriptLines.length);
  scriptLines.forEach((l) => { const p = (l.match(/pattern=(.*?),requires-body/) || [])[1]; if (!p) throw new Error('нет pattern: ' + l.slice(0, 60)); new RegExp(p); });
});
tx('M3 строки [Script]: скрипт берётся из этого репозитория', () => {
  scriptLines.forEach((l) => eq((l.match(/script-path=([^,]+)/) || [])[1], RAW + 'ru-adblock.js', l.split(' =')[0]));
});
tx('M4 [URL Rewrite]: корректные выражения и типы', () => {
  const sec = MOD.split(/^\[URL Rewrite\]\s*$/m)[1].split(/^\[MITM\]\s*$/m)[0].split('\n').filter((l) => /^\^/.test(l));
  if (!sec.length) throw new Error('нет правил');
  sec.forEach((l) => { const i = l.lastIndexOf(' - '); new RegExp(l.slice(0, i)); if (!/^(reject|reject-img|reject-dict|reject-array|reject-200)$/.test(l.slice(i + 3))) throw new Error('тип: ' + l.slice(i + 3)); });
});
tx('M5 [MITM]: список хостов дописывается (%APPEND%), без повторов', () => {
  const h = (MOD.match(/^hostname = %APPEND% (.+)$/m) || [])[1];
  if (!h) throw new Error('нет hostname = %APPEND%');
  const list = h.split(/,\s*/);
  list.forEach((x) => { if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)) throw new Error('странный хост: ' + x); });
  if (new Set(list).size !== list.length) throw new Error('повторы');
});
tx('M6 в файлах репозитория нет сертификатов и адресов Gist', () => {
  [['ru-adblock.js', SRC], ['RU-Apps-AdBlock.sgmodule', MOD], ['README.md', README]].forEach(([f, s]) => {
    if (/ca-p12\s*=|ca-passphrase\s*=|BEGIN (RSA |EC )?PRIVATE KEY/.test(s)) throw new Error('секрет в ' + f);
    if (/gist\.githubusercontent\.com/.test(s)) throw new Error('адрес Gist в ' + f);
  });
});
tx('M7 маршрутизация адресов: что идёт в скрипт, что отклоняется', () => {
  const pat = new RegExp((MOD.match(/^RU-AdBlock = type=http-response,pattern=(.*?),requires-body/m) || [])[1]);
  const rw = MOD.split('\n').filter((l) => /^\^/.test(l)).map((l) => new RegExp(l.slice(0, l.lastIndexOf(' - '))));
  const inScript = ['https://wapi.aliexpress.ru/mobile-layout/home/fusion', 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=/my',
    'https://finance.wb.ru/api/offers-api/v1/product/offers', 'https://mobileapi.ddxfitness.ru/stories?x=1', 'https://tc.mobile.yandex.net/4.0/urbanads/sdk?'];
  const notScript = ['https://mobileapi.ddxfitness.ru/v2/employees/positions?x', 'https://api.finance.ozon.ru/mobile/obank/features', 'https://www.gosuslugi.ru/'];
  inScript.forEach((u) => { if (!pat.test(u)) throw new Error('не идёт в скрипт: ' + u); });
  notScript.forEach((u) => { if (pat.test(u)) throw new Error('лишний в скрипте: ' + u); });
  if (!rw.some((re) => re.test('https://mobileapi.ddxfitness.ru/mobile_banners?request_source=mobile_app'))) throw new Error('баннеры DDX не отклоняются');
});

// ═════════════════════ 2. Поведение по приложениям ═════════════════════
group('2. WB Кошелёк');
{
const CRM = (x) => 'https://static-basket-03.wbbasket.ru/vol46/bi-crm-wb-bank/' + x + '.png';
const FIN = 'https://finance.wb.ru/api/v1/wallet/main?lang=en';
const WAL = 'https://wb-wallet.wildberries.ru/api/v2/screen';

// ── WB ──
const carousel = { type: 'crmCarousel', autoScroll: 5, items: [
  { id: 'a1', title: 'Кэшбэк 10%', subtitle: 'на покупки', image: CRM('aaa'), deeplink: 'wbx://x', bg: '#333' },
  { id: 'a2', title: 'Накопительный счёт', subtitle: 'Откройте и получайте 13% годовых на ежедневный остаток', image: CRM('01a0393d-6311-7164-b3f3-fc137c1b80df'), deeplink: 'wbx://savings', bg: '#3a2f2a' },
  { id: 'a3', title: 'Вклад', subtitle: 'до 14,7%', image: CRM('ccc'), deeplink: 'wbx://dep' }] };
const tiles = { type: 'tiles', items: [
  { title: 'Savings', subtitle: 'Accounts, deposits, and investments', amount: 0, amountText: '0 ₽', icon: 'https://static-basket-01.wbbasket.ru/vol46/wb-bank-icons/savings.png', footer: 'Open a deposit: Up to 14.7% per year' },
  { title: 'Loans', subtitle: 'For any purpose', icon: 'https://static-basket-01.wbbasket.ru/vol46/wb-bank-icons/loans.png' }] };
const balance = { type: 'balance', title: 'Wallet balance', amount: 0, currency: 'RUB', card: { last4: '0000', ps: 'mir', image: 'https://static-basket-01.wbbasket.ru/vol46/cards/mir.png' },
  promo: { text: 'Получите до 100 000 ₽ с WB Кэш', deeplink: 'wbx://cash' } };
const screen = () => ({ data: { accountId: 1, widgets: [{ type: 'header', title: 'wb кошелёк', status: 'ULTIMATE' }, { type: 'discount', value: 3 },
  JSON.parse(JSON.stringify(balance)), JSON.parse(JSON.stringify(carousel)), JSON.parse(JSON.stringify(tiles))] } });

t('W1 carousel widget removed, rest intact', { url: FIN, body: screen() }, (p) => {
  const w = p.data.widgets;
  eq(w.map(x => x.type), ['header', 'discount', 'balance', 'tiles']);
  eq(w[2], balance, 'balance'); eq(w[3], tiles, 'tiles');
});
t('W1b same on wb-wallet host with :443', { url: 'https://wb-wallet.wildberries.ru:443/api/v2/screen', body: screen() }, (p) => {
  eq(p.data.widgets.map(x => x.type), ['header', 'discount', 'balance', 'tiles']);
});
t('W2 dedicated banners endpoint -> empty list', { url: FIN.replace('main', 'banners'), body: { banners: carousel.items, placement: 'wallet' } }, (p) => {
  eq(p, { banners: [], placement: 'wallet' });
});
t('W3 image variants -> banner and wrapper removed', { url: FIN, body: { blocks: [
  { type: 'promo', items: [{ title: 'Накопительный счёт', images: [{ url: CRM('x@2x'), scale: 2 }, { url: CRM('x@3x'), scale: 3 }] }] },
  { type: 'other', items: [{ title: 'History', icon: 'https://static-basket-01.wbbasket.ru/vol46/icons/h.png' }] }] } }, (p) => {
  eq(p.blocks.map(b => b.type), ['other']);
});
t('W4 mixed carousel -> keep', { url: FIN, body: { widgets: [{ type: 'carousel', items: [carousel.items[1],
  { title: 'Распродажа', image: 'https://static-basket-03.wbbasket.ru/vol48/marketing-creative-api/banners/z.webp' }] }, tiles] } }, (p, out) => p === null);
t('W5 tiles with CRM icons and amounts -> keep', { url: FIN, body: { widgets: [{ type: 'tiles', items: [
  { title: 'Savings', amountText: '0 ₽', icon: CRM('i1') }, { title: 'Loans', balance: 0, icon: CRM('i2') }] }] } }, (p) => p === null);
t('W6 CRM image directly in a widget among others -> keep', { url: FIN, body: { widgets: [
  { type: 'balance', title: 'Wallet balance', promoImage: CRM('p') }, { type: 'discount', value: 3 }] } }, (p) => p === null);
t('W7 nested JSON string + 64-bit ids preserved', { url: WAL,
  body: '{"id":40817810000000000001,"payload":' + JSON.stringify(JSON.stringify({ widgets: [{ type: 'discount', value: 3, uid: 1 }, carousel] })) + '}' }, (p, out) => {
  if (out.indexOf('40817810000000000001') === -1) throw new Error('big id lost: ' + out.slice(0, 80));
  const inner = JSON.parse(p.payload);
  eq(inner.widgets.map(x => x.type), ['discount']);
});
t('W8 no CRM -> untouched', { url: FIN, body: { data: { widgets: [balance, tiles] } } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('W9 ad markers on finance host are NOT touched by generic scan', { url: FIN, body: { items: [{ title: 'Реклама', image: 'https://x.ru/a.jpg', erid: '2Vtzq1234' }, { title: 'b', image: 'https://x.ru/b.jpg' }, { title: 'c', image: 'https://x.ru/c.jpg' }] } }, (p) => p === null);
t('W10 no SMALL dump of wallet bodies', { url: FIN, body: { balance: 12345, card: '0000' } }, (p, out, r) => !r.logs.some(l => /SMALL/.test(l)));
t('W11 carousel wrapper with images is kept (only cards go)', { url: FIN, body: { widgets: [{ type: 'discount', value: 3 },
  { type: 'carousel', bgImage: 'https://static-basket-01.wbbasket.ru/vol46/bg/x.png', items: carousel.items }] } }, (p) => {
  eq(p.widgets[1].items, []); eq(p.widgets.length, 2);
});

// ── WB offers-api (структура из лога v3.15) ──
const OFF = 'https://finance.wb.ru/api/offers-api/v1/product/offers';
const offer = (title, img, ad, extra) => Object.assign({ content: { title: title, subtitle: 'подзаголовок', image: img,
  disclaimer: ad ? { text: 'Реклама', bottomSheet: { title: 'Рекламное объявление', bodyHtml: '<p>ООО «Капибара». Подробнее…</p>' } } : null },
  productName: 'SAVINGS', priority: 1, contentId: 'c-' + title.length, clientOfferId: 'o-' + title.length, applicationId: null, closable: true,
  analyticsData: { campaign: 'x' }, actionType: 'DEEPLINK' }, extra || {});
const offersBody = () => ({ offers: {
  BANNER_MIMICRY_SELF_TRANSFER_BANK_SELECTION: [offer('13% годовых по накопительному счёту', CRM('m1'), true)],
  BANNER_CAROUSEL_MAIN_SCREEN: [offer('Накопительный счёт', CRM('01a0393d'), true), offer('Кэшбэк', CRM('k'), true), offer('Вклад', CRM('v'), true),
    offer('Просто настройте автопополнение из других банков', 'https://static-basket-01.wbbasket.ru/vol124/commerce-department-qr/q.png', true)],
  BANNER_MIMICRY_TRANSFER_BANK_SELECTION: [offer('Предложите другу стать клиентом', null, true, { content: { title: 'Предложите другу стать клиентом', benefits: [{ icon: CRM('b'), title: '+1000' }] } })],
  PERSONAL_OFFERS: [offer('Кредитная карта', 'https://static-basket-01.wbbasket.ru/vol46/icons/c.png', true), offer('Ваш вклад', 'https://static-basket-01.wbbasket.ru/vol46/icons/d.png', false)],
  EMPTY_ONE: [] } });
t('W12 offers-api: all BANNER_* emptied, ad offers dropped elsewhere', { url: OFF, body: offersBody() }, (p) => {
  eq(Object.keys(p.offers), ['BANNER_MIMICRY_SELF_TRANSFER_BANK_SELECTION', 'BANNER_CAROUSEL_MAIN_SCREEN', 'BANNER_MIMICRY_TRANSFER_BANK_SELECTION', 'PERSONAL_OFFERS', 'EMPTY_ONE']);
  eq(p.offers.BANNER_CAROUSEL_MAIN_SCREEN, []); eq(p.offers.BANNER_MIMICRY_SELF_TRANSFER_BANK_SELECTION, []); eq(p.offers.BANNER_MIMICRY_TRANSFER_BANK_SELECTION, []);
  eq(p.offers.PERSONAL_OFFERS.map(o => o.content.title), ['Ваш вклад']);
});
t('W13 offers-api with no ads -> untouched', { url: OFF, body: { offers: { PERSONAL_OFFERS: [offer('Ваш вклад', null, false)] } } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('W14 other finance endpoints unaffected by offers rule', { url: 'https://finance.wb.ru/api/product/v2/find-products?include=ACCOUNTS', body: { offers: { BANNER_X: [offer('x', null, true)] }, account_products: [] } }, (p) => p === null);
t('W15 account number in path is masked in logs', { url: 'https://finance.wb.ru/api/reports/v1/accounts/40817810000000000009/interest-earned', body: { interest: 0 } }, (p, out, r) =>
  r.logs.length > 0 && r.logs.every(l => l.indexOf('40817810000000000009') === -1) && r.logs.some(l => /accounts\/#\//.test(l)));
}

group('2. AliExpress');
{

// ── AliExpress: главная ──
const HOME = 'https://wapi.aliexpress.ru/mobile-layout/home/fusion';
const img = (x) => 'https://ae04.alicdn.com/kf/' + x + '.png';
const diamonds = { uuid: 'u1', name: 'HomeDiamondsV3', vertical: 'home', version: 1, state: { data: { diamonds: [
  { link: 'aer://hits', image: img('hit'), segmentedTitle: [{ text: 'Хиты' }] }, { link: 'aer://low', image: img('low'), segmentedTitle: [{ text: 'Ниже рынка' }] }],
  aboveBanner: { image: img('days'), aerTracking: { banner_id: 31716 } } } }, props: {}, staticProps: {}, asyncType: null };
const stories = { uuid: 'u2', name: 'HomeStoriesV2', vertical: 'home', version: 1, state: { data: { stories: [
  { title: 'Звёздные купоны', imageUrl: img('star'), link: 'aer://story/1', activityId: 1, storyType: 'PROMO' },
  { title: 'baseus', imageUrl: img('baseus'), link: 'aer://story/2', activityId: 2, storyType: 'BRAND' },
  { title: '70mai', imageUrl: img('70mai'), link: 'aer://story/3', activityId: 3, storyType: 'BRAND' }] } }, props: {}, staticProps: {}, asyncType: null };
const tabs = { uuid: 'u3', name: 'HomeFeedTabs', vertical: 'home', version: 1, state: { data: { tabs: [{ activeState: { element: [{ image: img('t1'), id: 'sale' }] } }] } }, props: {}, staticProps: {}, asyncType: null };
const homeBody = (kids) => ({ alias: 'home', layout: { widgetInstances: [{ uuid: 'root', name: 'HomeRoot', vertical: 'home', props: {}, children: kids }] },
  i18n: { translates: { bx_monetization_ad_mark: 'Реклама' } }, time: 1 });

t('A1 home: stories shelf widget removed, categories/tabs intact', { url: HOME, body: homeBody([clone(diamonds), clone(stories), clone(tabs)]) }, (p) => {
  const ch = p.layout.widgetInstances[0].children;
  eq(ch.map(w => w.name), ['HomeDiamondsV3', 'HomeFeedTabs']);
  eq(ch[0], diamonds); eq(ch[1], tabs);
  eq(p.i18n, { translates: { bx_monetization_ad_mark: 'Реклама' } });
});
t('A2 home without stories -> untouched', { url: HOME, body: homeBody([clone(diamonds), clone(tabs)]) }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('A3 home: empty stories list -> untouched', { url: HOME, body: homeBody([clone(diamonds), { uuid: 's', name: 'HomeStoriesV2', state: { data: { stories: [] } } }]) }, (p, out, r) => p === null);
t('A4 stories on other pages (not home) untouched by this rule', { url: 'https://wapi.aliexpress.ru/mobile-layout/pdp-v3', body: homeBody([clone(diamonds), clone(stories)]) }, (p, out, r) => p === null);

// ── AliExpress: лента «Для вас» ──
const JFY = 'https://wapi.aliexpress.ru/aer-jsonapi/bx/mobile/recommend/v3/just-for-you-new-ru-sell';
let pid = 0;
function prod(ad) {
  pid++;
  const tr = { x_ad: ad ? '1' : '0' };
  if (ad) tr.biz = 'ad';
  return { product: { productId: 1005000000000000 + pid, title: 'Товар ' + pid, images: [{ url: img('p' + pid), size: { w: 1, h: 1 } }],
    price: { value: 100 + pid }, trace: { utLogMap: clone(tr) }, trackInfo: { productExposure: { params: { utLogMap: clone(tr) } } } } };
}
const row = (a, b, extra) => Object.assign({ rowV2: Object.assign({ items: [a, b].filter(Boolean) }, extra || {}) });
function feed(spec) { pid = 0; return { data: { items: spec.map(r => row(...r.map(ad => prod(ad)))), nextPageToken: 'abc' } }; }
const ids = (p) => p.data.items.map(r => r.rowV2.items.map(x => x.product.title.replace('Товар ', '')).join('+'));

t('A5 feed: two ads in different rows -> 8 organic products in 4 full rows, order kept', { url: JFY, body: feed([[0, 0], [0, 1], [0, 0], [1, 0], [0, 0]]) }, (p) => {
  eq(ids(p), ['1+2', '3+5', '6+8', '9+10']); eq(p.data.nextPageToken, 'abc');
});
t('A6 feed: odd organic count -> last single product dropped (no wide card)', { url: JFY, body: feed([[0, 0], [0, 1], [0, 0]]) }, (p) => {
  eq(ids(p), ['1+2', '3+5']);
});
t('A7 feed: whole row of ads -> row gone, rest untouched', { url: JFY, body: feed([[0, 0], [1, 1], [0, 0]]) }, (p) => {
  eq(ids(p), ['1+2', '5+6']);
});
t('A8 feed without ads -> untouched', { url: JFY, body: feed([[0, 0], [0, 0], [0, 0]]) }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('A9 feed without ads but a native single row -> untouched (only after a removal)', { url: JFY, body: feed([[0, 0], [0], [0, 0]]) }, (p, out, r) => p === null);
t('A10 products are moved as-is (big ids, tracking intact)', { url: JFY, body: feed([[0, 1], [0, 0]]) }, (p, out) => {
  const src = feed([[0, 1], [0, 0]]);
  eq(p.data.items[0].rowV2.items[0], src.data.items[0].rowV2.items[0]);
  eq(p.data.items[0].rowV2.items[1], src.data.items[1].rowV2.items[0]);
  if (!/"productId":1005000000000001[,}]/.test(out)) throw new Error('64-bit id changed');
});
t('A11 row-level props stay on their rows', { url: JFY, body: (() => { const f = feed([[0, 1], [0, 0], [0, 0]]); f.data.items.forEach((r, i) => { r.rowV2.rowId = 'r' + i; }); return f; })() }, (p) => {
  eq(p.data.items.map(r => r.rowV2.rowId), ['r0', 'r1']); eq(ids(p), ['1+3', '4+5']);
});
t('A12 nothing left but one product -> feed empty, no wide card', { url: JFY, body: (() => { const f = feed([[0, 1]]); f.data.meta = { pad: 'x'.repeat(3000) }; return f; })() }, (p) => { eq(p.data.items, []); eq(p.data.meta.pad.length, 3000); });

const pad = (f) => { f.data.meta = { pad: 'x'.repeat(4000) }; return f; };
t('A13 every row lost one product -> products paired again', { url: JFY, body: pad(feed([[0, 1], [1, 0], [0, 1]])) }, (p) => { eq(ids(p), ['1+4']); });
t('A14 single-column feed (all rows of 1) -> ad removed, no repack into pairs', { url: JFY, body: pad(feed([[0], [1], [0], [0]])) }, (p) => {
  eq(ids(p), ['1', '3', '4']);
});
t('A15 rows mixed with other feed items: non-row items stay in place', { url: JFY, body: (() => { const f = feed([[0, 1], [0, 0], [0, 0]]); f.data.items.splice(1, 0, { header: { title: 'Для вас' } }); return pad(f); })() }, (p) => {
  eq(p.data.items.map(x => x.rowV2 ? 'row' : 'hdr'), ['row', 'hdr', 'row']); eq(p.data.items[0].rowV2.items.length, 2); eq(p.data.items[2].rowV2.items.length, 2);
});
// ── хосты, снятые со скрипта ──
t('G1 DDX: response passed as is (old module)', { url: 'https://mobileapi.ddxfitness.ru/mobile_banners?request_id=1', body: { session_id: 's', request_id: 'r', data: [{ type: 'banner', image: img('b'), erid: '2VtzqwAbc' }] } },
  (p, out, r) => p === null && JSON.stringify(r.result) === '{}' && r.calls === 1);
t('G2 Ozon bank host: response passed as is (old module)', { url: 'https://api.finance.ozon.ru/mobile/obank/features', body: { layout: [{ component: 'adBanner', stateId: 'b' }], widgetStates: { b: '{"title":"Реклама"}' } } },
  (p, out, r) => p === null && JSON.stringify(r.result) === '{}' && r.calls === 1);
t('G3 DDX non-json also passes', { url: 'https://mobileapi.ddxfitness.ru/videos', body: 'x' }, (p, out, r) => p === null && r.calls === 1);
}

group('2. DDX Fitness: фаза запроса и сторис');
{
const ST = 'https://mobileapi.ddxfitness.ru/stories?is_guest=false&user_id=1&os=ios&request_source=mobile_app';
const img = (x) => 'https://storage.yandexcloud.net/ddx/' + x + '.png';
const story = (t) => ({ id: 1, title: t, preview: img(t), slides: [{ image: img(t + '1') }] });

// ── фаза запроса ──
const H = { 'user-agent': 'ios,3.10.9 (stable)', 'accept-encoding': 'gzip', host: 'mobileapi.ddxfitness.ru', authorization: 'Bearer x', ddx_install_id: 'i', 'content-language': 'en_US' };
t('R1 DDX request: Accept-Encoding removed, other headers intact', { request: true, url: 'https://mobileapi.ddxfitness.ru/v2/employees/positions?club_id=1', reqHeaders: Object.assign({}, H) }, (p, out, r) => {
  const h = r.result && r.result.headers; if (!h) throw new Error('no headers: ' + JSON.stringify(r.result));
  const e = Object.assign({}, H); delete e['accept-encoding']; eq(h, e); return r.calls === 1;
});
t('R2 DDX request, header in other case', { request: true, url: 'https://mobileapi.ddxfitness.ru/stories', reqHeaders: { 'Accept-Encoding': 'gzip, deflate', Host: 'x' } }, (p, out, r) => { eq(r.result, { headers: { Host: 'x' } }); });
t('R3 DDX request without Accept-Encoding -> unchanged', { request: true, url: 'https://mobileapi.ddxfitness.ru/users/1', reqHeaders: { host: 'x' } }, (p, out, r) => { eq(r.result, {}); });
t('R4 other host request -> unchanged', { request: true, url: 'https://api.ozon.ru/api/x', reqHeaders: { 'accept-encoding': 'gzip' } }, (p, out, r) => { eq(r.result, {}); });
t('R5 WB config request still drops If-None-Match only', { request: true, url: 'https://apps-config.wildberries.ru/config/api/v1/config?x=1', reqHeaders: { 'If-None-Match': 'W/1', 'accept-encoding': 'gzip', a: 'b' } }, (p, out, r) => {
  eq(r.result, { headers: { 'accept-encoding': 'gzip', a: 'b' } });
});

// ── сторис ──
t('S1 stories list emptied, ids kept', { url: ST, body: { session_id: 's', request_id: 'r', data: [story('Приводи родителей'), story('Правила клуба')] } }, (p) => {
  eq(p, { session_id: 's', request_id: 'r', data: [] });
});
t('S2 data object with several lists', { url: ST, body: { session_id: 's', data: { stories: [story('a')], groups: [{ items: [story('b')] }], total: 2 } } }, (p) => {
  eq(p, { session_id: 's', data: { stories: [], groups: [], total: 2 } });
});
t('S3 already empty -> untouched', { url: ST, body: { session_id: 's', request_id: 'r', data: [] } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('S4 top-level array', { url: 'https://mobileapi.ddxfitness.ru/stories/', body: [story('a'), story('b')] }, (p) => { eq(p, []); });
t('S5 other lists at top level (no data key)', { url: ST, body: { session_id: 's', request_id: 'r', items: [story('a')] } }, (p) => { eq(p, { session_id: 's', request_id: 'r', items: [] }); });
t('S6 big ids preserved', { url: ST, body: '{"session_id":"s","request_id":12345678901234567890,"data":[{"id":98765432109876543210}]}' }, (p, out) => {
  if (out !== '{"session_id":"s","request_id":12345678901234567890,"data":[]}') throw new Error(out);
});
t('S7 non-json stories -> pass', { url: ST, body: 'oops' }, (p, out, r) => p === null && r.calls === 1);
t('S8 /stories_v2 and /stories/1 are not the list endpoint -> untouched', { url: 'https://mobileapi.ddxfitness.ru/stories/1', body: { data: [story('a')] } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('S9 other DDX responses untouched even with ad markers', { url: 'https://mobileapi.ddxfitness.ru/v2/employees/positions?club_id=1', body: { data: [{ name: 'Тренер', photo: img('t'), erid: '2VtzqwAbc', label: 'Реклама' }] } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('S10 Ozon bank host still untouched', { url: 'https://api.finance.ozon.ru/mobile/obank/features', body: { layout: [{ component: 'adBanner' }] } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('S11 no T-Bank special handling left: shopping host goes through the generic path', { url: 'https://shopping.t-bank-app.ru/api/v1/sphere/gallery', body: { items: [{ title: 'x', image: img('x') }] } }, (p, out, r) => r.calls === 1);
}

group('2. DDX Fitness: повтор запросов; Яндекс Go');
{
const runReq = (fx) => { const r = run(Object.assign({ request: true }, fx)); return { calls: r.all, logs: r.logs, http: r.http }; };
const H = { 'user-agent': 'ios,3.10.9 (stable)', 'accept-encoding': 'gzip', host: 'mobileapi.ddxfitness.ru', authorization: 'Bearer x', ddx_install_id: 'i' };
const Hx = { 'user-agent': 'ios,3.10.9 (stable)', host: 'mobileapi.ddxfitness.ru', authorization: 'Bearer x', ddx_install_id: 'i' };
const POS = 'https://mobileapi.ddxfitness.ru/v2/employees/positions?club_id=1&position_names=%D0%A2&sort_by=random&count=10';
const okResp = (body, extra) => ({ resp: { status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': '999', 'Content-Encoding': 'gzip', Connection: 'close', 'X-Req': 'r' }, extra || {}) }, body });

tx('X1 GET relayed: same url, headers w/o accept-encoding + marker; response handed to the app', () => {
  const body = JSON.stringify({ session_id: 's', data: [{ id: 1, name: 'Тренер', photo: 'https://storage.yandexcloud.net/ddx/t.png' }] });
  const r = runReq({ url: POS, headers: Object.assign({}, H), http: okResp(body) });
  eq(r.http.length, 1); eq(r.http[0].url, POS); eq(r.http[0].headers, Object.assign({}, Hx, { 'X-RuAdb': '1' }));
  eq(r.calls, [{ response: { status: 200, headers: { 'Content-Type': 'application/json', 'X-Req': 'r' }, body: body } }]);
});
tx('X2 /stories relayed and emptied (schema kept)', () => {
  const body = '{"session_id":"s","request_id":"r","data":[{"id":1,"title":"Приводи родителей"},{"id":2,"title":"Правила клуба"}]}';
  const r = runReq({ url: 'https://mobileapi.ddxfitness.ru/stories?is_guest=false&user_id=1', headers: Object.assign({}, H), http: okResp(body) });
  eq(r.calls.length, 1); eq(r.calls[0].response.body, '{"session_id":"s","request_id":"r","data":[]}');
  if (!r.logs.some(l => /stories emptied \.data\[2\]/.test(l))) throw new Error('log: ' + r.logs.join(' | '));
});
tx('X3 relay error -> request goes as is (without accept-encoding)', () => {
  const r = runReq({ url: POS, headers: Object.assign({}, H), http: { err: 'timeout' } });
  eq(r.calls, [{ headers: Hx }]);
});
tx('X4 POST is never relayed', () => {
  const r = runReq({ url: 'https://mobileapi.ddxfitness.ru/users/1/bookings', method: 'POST', headers: Object.assign({}, H), http: okResp('{}') });
  eq(r.http.length, 0); eq(r.calls, [{ headers: Hx }]);
});
tx('X5 own repeated request (marker) -> not relayed again, marker stripped', () => {
  const r = runReq({ url: POS, headers: Object.assign({ 'X-RuAdb': '1' }, H), http: okResp('{}') });
  eq(r.http.length, 0); eq(r.calls, [{ headers: Hx }]);
});
tx('X6 /mobile_banners is not relayed (module rejects it)', () => {
  const r = runReq({ url: 'https://mobileapi.ddxfitness.ru/mobile_banners?request_source=mobile_app', headers: Object.assign({}, H), http: okResp('{}') });
  eq(r.http.length, 0); eq(r.calls, [{ headers: Hx }]);
});
tx('X7 no $httpClient -> as is', () => { const r = runReq({ url: POS, headers: Object.assign({}, H) }); eq(r.calls, [{ headers: Hx }]); });
tx('X8 non-200 passed through with body', () => {
  const r = runReq({ url: POS, headers: Object.assign({}, H), http: { resp: { status: 401, headers: { 'Content-Type': 'application/json' } }, body: '{"error":"token"}' } });
  eq(r.calls, [{ response: { status: 401, headers: { 'Content-Type': 'application/json' }, body: '{"error":"token"}' } }]);
});
tx('X9 stories: 64-bit ids kept', () => {
  const r = runReq({ url: 'https://mobileapi.ddxfitness.ru/stories', headers: {}, http: okResp('{"request_id":12345678901234567890,"data":[{"id":98765432109876543210}]}') });
  eq(r.calls[0].response.body, '{"request_id":12345678901234567890,"data":[]}');
});
tx('X10 stories not json -> body as is', () => {
  const r = runReq({ url: 'https://mobileapi.ddxfitness.ru/stories', headers: {}, http: okResp('<html>') });
  eq(r.calls[0].response.body, '<html>');
});
tx('X11 statusCode field (other clients) supported', () => {
  const r = runReq({ url: POS, headers: {}, http: { resp: { statusCode: 200, headers: {} }, body: '[]' } });
  eq(r.calls, [{ response: { status: 200, headers: {}, body: '[]' } }]);
});
tx('X12 callback never fires -> script does not call $done early (Shadowrocket timeout decides)', () => {
  const r = runReq({ url: POS, headers: {}, http: 'never' }); eq(r.calls.length, 0);
});
tx('X13 non-DDX request untouched even with $httpClient', () => {
  const r = runReq({ url: 'https://api.ozon.ru/x', headers: Object.assign({}, H), http: okResp('{}') }); eq(r.http.length, 0); eq(r.calls, [{}]);
});
tx('X14 WB config request unchanged', () => {
  const r = runReq({ url: 'https://apps-config.wildberries.ru/config/api/v1/config?x', headers: { 'If-None-Match': '1', a: 'b' }, http: okResp('{}') });
  eq(r.http.length, 0); eq(r.calls, [{ headers: { a: 'b' } }]);
});

// ── Яндекс Go ──
const DEL = 'https://tc.mobile.yandex.net/4.0/cargo-c2c/v1/delivery/state?block_id=russia%25go';
const pad = 'x'.repeat(3000);
const blocks = () => [{ type: 'text_widget', text: 'Ready for collection' }, { type: 'list_item', title: 'Route' },
  { type: 'urban-ads', block_id: 'R-M-123', height: 180 }, { type: 'separator' }, { type: 'barcode', value: '123', note: pad }];
t('Y1 delivery: urban-ads element removed, rest intact', { url: DEL, body: { state: { screen: { items: blocks() } } } }, (p) => {
  eq(p.state.screen.items.map(x => x.type), ['text_widget', 'list_item', 'separator', 'barcode']);
});
t('Y2 urban-ads inside a wrapper -> wrapper list element removed', { url: DEL, body: { items: [{ type: 'card', content: { type: 'urban-ads', id: 'a' } }, { type: 'barcode', note: pad }] } }, (p) => {
  eq(p.items.map(x => x.type), ['barcode']);
});
t('Y3 no urban-ads -> untouched', { url: DEL, body: { items: [{ type: 'text_widget', note: pad }] } }, (p, out, r) => p === null && JSON.stringify(r.result) === '{}');
t('Y4 urbanads/sdk: whole ad response may go (no 60% abort)', { url: 'https://tc.mobile.yandex.net/4.0/urbanads/sdk?', body: { ads: [{ title: 'Avito Авто', image: 'https://avatars.mds.yandex.net/a.png', label: 'Реклама', erid: '2VtzqwAbc' }], ttl: 60 } }, (p, out, r) => {
  if (!p) throw new Error('not modified: ' + r.logs.join(' | ')); eq(p.ads, []); eq(p.ttl, 60);
});
t('Y5 urban-ads type on other Go screens untouched by this rule', { url: 'https://tc.mobile.yandex.net/4.0/other/state', body: { items: [{ type: 'urban-ads' }, { type: 'x', note: pad }] } }, (p, out, r) => p === null);
}

// ═════════════════════ 3. Эталоны ═════════════════════
group('3. Эталоны типовых ответов');
const FIXTURES = (function () {
// Synthetic responses that exercise every existing branch of ru-adblock.js (v3.14).
const J = JSON.stringify;
const IMG = (n) => 'https://static-basket-03.wbbasket.ru/vol48/marketing-creative-api/banners/' + n + '.webp';

const wbBanner = (n, ad) => ({
  isBigSale: false, isMarketing: !!ad, params: ad ? { query: 'erid=2TKWBEVtyFW&bid=4ce8' } : {},
  smallPromoCatalogParams: null, endTime: '2026-10-01T00:00:00Z', advParams: ad ? 'a=1' : '',
  ordBannerMark: ad ? 'ООО "МЕРКУРИЙ", ИНН 7017452826, ЕРИД 2TKWBEVtyFW' : '',
  href: ad ? '/api/seller/187993?erid=2TKWBEVtyFW&bid=4ce8' : '/catalog/x', bid: 'b' + n, type: 1,
  srcPath: '/vol48/marketing-creative-api/banners/' + n + '.webp', src: IMG(n), logs: 'l', promoName: 'p' + n,
});

return [
  // ── WB apps-config: request phase and response ──
  { name: 'wb-config-request', request: true, url: 'https://apps-config.wildberries.ru/config/api/v2/config?v=782000&l=ru&t=ios',
    reqHeaders: { 'If-None-Match': 'W/"abc"', 'Accept': '*/*', 'If-Modified-Since': 'x' } },
  { name: 'wb-config-request-nocache', request: true, url: 'https://apps-config.wildberries.ru/config/api/v2/config?v=782000&l=ru&t=ios',
    reqHeaders: { 'Accept': '*/*' } },
  { name: 'other-request', request: true, url: 'https://api-ios.wildberries.ru/__internal/x' },
  { name: 'wb-config', url: 'https://apps-config.wildberries.ru/config/api/v2/config?v=782000&l=ru&t=ios',
    body: { data: { enableBannerLC: true, enableTopSliderOnMain: true, enableNewBannerLogic: true, hideAllBanners: false,
      enableRecInLk: true, enableSimilarGoodsCarouselInLK: true, enableMainPageCustomHeader: true,
      bannerLCRange: [{ fromId: 0, toId: 99 }], marketingSliderUserRange: [{ fromId: 1, toId: 1 }],
      mainPageCustomHeader: { logo: 'x' }, nested: { enableBottomSlider: { enabled: true }, showBannerX: false },
      disableBannersOnMain: false, enableSomethingElse: true, walletCrmCarouselEnabled: true, bigId: 12345678901234567890 } } },
  { name: 'wb-config-reactive', url: 'https://apps-config.wildberries.ru/config/api/v2/reactive?l=ru&v=782000&t=ios',
    body: { data: { enableFoo: true } } },

  // ── WB recommendations ──
  { name: 'wb-recs-profile', url: 'https://api-ios.wildberries.ru/__internal/recom/personal/ru/male/v8/search?ab_vis_ali_heating=9000&dest=123589330&lang=en&locale=ru&mdg=123&resultset=catalog&hide_vflags=35188667056128&hide_dtype=11&page=1&sort=popular&ldg=1282;1283;1286;1326&curr=rub&spp=40&appType=64&query=129865263',
    body: '{"metadata":{"name":"129865263","total":100},"products":[{"id":1234567890123456789,"name":"x"},{"id":2,"name":"y"}]}' },
  { name: 'wb-recs-main', url: 'https://api-ios.wildberries.ru/__internal/recom/personal/ru/male/v8/search?appType=64&curr=rub&dest=123589330&hide_dtype=11&hide_vflags=35188667056128&lang=en&ldg=1282;1283;1286;1326&locale=ru&mdg=123&page=1&query=129865263&resultset=catalog&sort=popular&spp=40&ab_vis_ali_heating=9000',
    body: '{"metadata":{},"products":[{"id":98765432109876543210,"name":"a","image":"https://basket-01.wbbasket.ru/a.webp","log":{"tp":"c","erid":"2TKWBEhmYU8abc"}},{"id":2,"name":"b","image":"https://basket-01.wbbasket.ru/b.webp"},{"id":3,"name":"c","image":"https://basket-01.wbbasket.ru/c.webp"}]}' },

  // ── WB banners ──
  { name: 'wb-banners-main', url: 'https://banners-bt.wildberries.ru/api/v5/main?ab_testid=no_ali_shelfs&uclusters=3',
    body: { data: { topSliderNF: [wbBanner(1, true), wbBanner(2, false), wbBanner(3, true)], searchSliderNF: [wbBanner(4, true)],
      smallTiles: [wbBanner(5, true), wbBanner(6, false)], promoInCatalogMenu: [{ src: IMG(7), href: '/eapteka?entry_point=catalog', text: 'Аптека' }],
      marketingSlider: [Object.assign(wbBanner(8, true), { htmlData: '<b>x</b>', htmlSrc: 'x' })] }, state: 0, rv: 0 } },
  { name: 'wb-banners-basket', url: 'https://banners-bt.wildberries.ru/api/v1/basket?ab_testid=no_ali_shelfs',
    body: { data: { topSlider: [], giftBanners: [] }, state: 0, rv: 0 } },
  { name: 'wb-home-small', url: 'https://home-service.wildberries.ru/home-service/api/v1/home',
    body: { state: 0, data: { isAuthenticated: true, shippingNotifications: [] } } },
  { name: 'wb-static-json', url: 'https://static-basket-01.wbbasket.ru/vol4/data/some.json',
    body: { items: [{ img: 'https://x.ru/y.jpg', label: 'Реклама' }, { img: 'https://x.ru/z.jpg', label: 'ok' }, { img: 'https://x.ru/w.jpg', label: 'ok2' }] } },
  { name: 'wb-marketing-info', url: 'https://marketing-info.wildberries.ru/marketing-info/api/v6/info?curr=rub',
    body: { isCash: false, personalDiscount: 3, payments: [{ id: 1, name: 'Card' }] } },

  // ── Ozon ──
  { name: 'ozon-my', url: 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fmy',
    body: { layout: [
      { component: 'userProfile', stateId: 'userProfile-1-default-1', name: 'profile.userInfo' },
      { component: 'separator', name: 'separator' },
      { component: 'alertSlider', stateId: 'alert-7-default-1', name: 'alert.placementSlider' },
      { component: 'common.cellList', stateId: 'cell-8-default-1', name: 'common.cellList' },
      { component: 'separator', name: 'separator' },
      { component: 'shelf', stateId: 'shelf-2-default-1', name: 'shelf.infiniteScroll' },
      { component: 'uWidgetObject', stateId: 'cms-3-default-1', name: 'cms.uWidgetObject' },
      { component: 'separator', name: 'separator' }, { component: 'separator', name: 'separator' }],
      widgetStates: {
        'userProfile-1-default-1': J({ name: 'Иван', id: 12345678901234567 }),
        'alert-7-default-1': J({ items: [{ title: 'Товары за 1 ₽', image: 'https://ir.ozone.ru/a.jpg' }] }),
        'cell-8-default-1': J({ items: [{ title: 'Лента обзоров' }] }),
        'shelf-2-default-1': J({ title: 'Подобрали по вашим интересам', items: [{ image: 'https://ir.ozone.ru/x.jpg' }] }),
        'cms-3-default-1': J({ text: 'Ozon Travel −3000 ₽' }) },
      nextPage: '/my?layout_container=pagination_app_my_account&layout_page_index=2' } },
  { name: 'ozon-my-paged', url: 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fmy%3Flayout_container%3Dpagination_app_my_account%26layout_page_index%3D2',
    body: { layout: [{ component: 'shelf', stateId: 's-1', name: 'shelf.infiniteScroll' }], widgetStates: { 's-1': J({ items: [1] }) },
      nextPage: '/my?layout_container=pagination_app_my_account&layout_page_index=3' } },
  { name: 'ozon-cart-paged', url: 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fcart%3Flayout_container%3DRecomsInCartPaginator%26layout_page_index%3D2',
    body: { layout: [{ component: 'shelf', stateId: 's-1' }], widgetStates: { 's-1': '{"items":[1]}' },
      nextPage: '/cart?layout_container=RecomsInCartPaginator&layout_page_index=3' } },
  { name: 'ozon-fav', url: 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fmy%2Ffavorites',
    body: { layout: [{ component: 'favList', stateId: 'f-1' }, { component: 'textBlock', stateId: 't-1' }, { component: 'shelf', stateId: 's-2' }],
      widgetStates: { 'f-1': J({ items: [{ image: 'https://ir.ozone.ru/f.jpg' }] }), 't-1': J({ text: 'Подобрали для вас' }), 's-2': J({ items: [] }) } } },
  { name: 'ozon-finance', url: 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Ffinance%2Fbanklanding',
    body: { layout: [{ component: 'separator', name: 'separator' }, { component: 'adBanner', stateId: 'skeeter-1', name: 'skeeter.fintabBannerPriority' },
      { component: 'accounts', stateId: 'skeeter-2', name: 'skeeter.fintabAccounts' }],
      widgetStates: { 'skeeter-1': J({ items: [{ image: 'https://ir.ozone.ru/b.jpg', title: 'Товары за 1 ₽' }] }), 'skeeter-2': J({ balance: 0 }) } } },
  { name: 'ozon-home', url: 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fhome',
    body: { layout: [{ component: 'banner', stateId: 'bannerVideo-123-default-1', name: 'banner' }, { component: 'tileGrid', stateId: 'tileGrid-5-default-1' }, { component: 'x', stateId: 'x-9-default-1' }],
      widgetStates: {
        'bannerVideo-123-default-1': J({ items: [{ image: 'https://ir.ozone.ru/c.jpg', erid: '2VtzqxAbCd', advertiser: 'ООО Рога' }] }),
        'tileGrid-5-default-1': J({ items: [{ image: 'https://ir.ozone.ru/p1.jpg', title: 'Товар', badge: 'Реклама' }, { image: 'https://ir.ozone.ru/p2.jpg', title: 'Товар 2' }, { image: 'https://ir.ozone.ru/p3.jpg', title: 'Товар 3' }] }),
        'x-9-default-1': J({ items: [{ image: 'https://ir.ozone.ru/p4.jpg', title: 'Товар 4' }, { image: 'https://ir.ozone.ru/p5.jpg', title: 'Товар 5' }, { image: 'https://ir.ozone.ru/p6.jpg', title: 'Товар 6' }, { image: 'https://ir.ozone.ru/p7.jpg', title: 'Товар 7' }] }) } } },
  { name: 'ozon-widget', url: 'https://api.ozon.ru/api/composer-api.bx/widget/json/v2?widgetStateId=x',
    body: { widgetStates: { 'a-1': J({ items: [{ image: 'https://ir.ozone.ru/a.jpg', isAd: true }, { image: 'https://ir.ozone.ru/b.jpg' }, { image: 'https://ir.ozone.ru/c.jpg' }] }) } } },

  // ── Яндекс Маркет / Go ──
  { name: 'ym-fav', url: 'https://mapi.market.yandex.net/api/screen/favourites',
    body: { result: { sections: [{ type: 'HeaderSection', id: 1 }, { type: 'ProductsSection', items: [{ img: 'https://avatars.mds.yandex.net/a' }] },
      { type: 'FeedboxSection', items: [{ img: 'https://avatars.mds.yandex.net/b' }] }] }, shared: { divData: { feedbox_header: 'Достойны сердечка' } } } },
  { name: 'ym-cart', url: 'https://mapi.market.yandex.net/api/screen/cart',
    body: { result: { sections: [{ type: 'CartSection', items: [{ img: 'https://avatars.mds.yandex.net/a' }] }, { type: 'FeedboxSection', items: [] }] } } },
  { name: 'ym-other', url: 'https://mapi.market.yandex.net/api/screen/main',
    body: { result: { sections: [{ type: 'BannerSection', items: [{ img: 'https://avatars.mds.yandex.net/a', label: 'Реклама' }, { img: 'https://avatars.mds.yandex.net/c' }, { img: 'https://avatars.mds.yandex.net/d' }] }] } } },
  { name: 'go-layout', url: 'https://tc.mobile.yandex.net/mlutp/v1/widgets/layout/main',
    body: { ui: { sections: [{ type: 'search', content: [{ text: 'Куда' }] },
      { type: 'products_widget', content: [{ image: 'https://avatars.mds.yandex.net/x', actions: { tap: 'tap_product' } }] },
      { type: 'shortcuts', content: [{ image: 'https://a.ru/x.png', actions: { a: 'service_shortcut' } }, { image: 'https://a.ru/y.png', actions: { a: 'service_shortcut' } }] }] } } },

  // ── Avito ──
  { name: 'avito-fav', url: 'https://app.avito.ru/api/5/favorites/items/widgets',
    body: { result: { items: [{ type: 'item', image: 'https://img.avito.st/1.jpg', title: 'Диван' }, { type: 'item', image: 'https://img.avito.st/0.jpg', title: 'Кресло' },
      { banner: { list: [{ avito: { bannerCode: 'x', advRequestId: 'y' } }] } },
      { type: 'header', title: 'Похожие объявления' }, { type: 'item', image: 'https://img.avito.st/2.jpg', title: 'Стул' }, { type: 'item', image: 'https://img.avito.st/3.jpg', title: 'Стол' }] } } },
  { name: 'avito-main', url: 'https://app.avito.ru/api/11/main?x=1',
    body: { result: { items: [{ type: 'item', value: { image: 'https://img.avito.st/1.jpg' } }, { type: 'item', value: { image: 'https://img.avito.st/4.jpg' } },
      { type: 'widget', value: { embeddedAdvBanner: { code: 'x', image: 'https://img.avito.st/ad.jpg' } } }, { type: 'yandex_ad', value: { image: 'https://img.avito.st/5.jpg' } }] } } },

  // ── AliExpress ──
  { name: 'ae-profile', url: 'https://aer.acs.aliexpress.ru/mobile-layout/profile',
    body: { data: { children: [
      { uuid: 'u1', name: 'ProfileHeader', children: [{ uuid: 'u2', name: 'Menu', props: { items: [{ title: 'Мои заказы' }] } }] },
      { uuid: 'u3', name: 'Container', children: [{ uuid: 'u4', name: 'Title', props: { title: 'Рекомендуем вам' } }, { uuid: 'u5', name: 'RecommendWaterfall', props: { items: [{ image: 'https://ae04.alicdn.com/x.jpg' }] } }] },
      { uuid: 'u6', name: 'Viewed', props: { title: 'Вы смотрели', items: [{ image: 'https://ae04.alicdn.com/y.jpg' }] } },
      { uuid: 'u7', name: 'Settings', props: { title: 'Настройки и данные' } }] }, i18n: { recTitle: 'Рекомендуем вам' } } },
  { name: 'ae-shelf', url: 'https://aer.acs.aliexpress.ru/recommend/v1/p4p-only-shelf', body: { data: { items: [{ id: 1 }, { id: 2 }] } } },
  { name: 'ae-cart', url: 'https://aer.acs.aliexpress.ru/mobile-layout/shopcartFusion',
    body: { data: { children: [{ uuid: 'c1', name: 'CartList', props: { items: [{ image: 'https://ae04.alicdn.com/c.jpg' }] } }] }, i18n: { cartRecTitle: 'Рекомендуем вам' } } },

  // ── Почта / СДЭК ──
  { name: 'pochta-banners', url: 'https://mobileapp.russianpost.ru/mobile-api/method/1.0/adv.get.banners?x=1',
    body: { banners: [{ id: 1, image: 'https://mobileapp.russianpost.ru/mobile-api/method/1.0/adv.get.image/1', link: 'https://ad.x', title: 'Реклама', erid: 'abc123', n: 5 }, { id: 2 }] } },
  { name: 'pochta-blocks', url: 'https://mobileapp.russianpost.ru/mobile-api/method/2.0/get.blocks',
    body: { blocks: { BANNERS: { a: 1 }, ADVERTISING: { b: 2 }, ADVERTISING_2: { b: 3 }, TRACKING: { c: 3 } }, dynamicBlocks: [{ title: 'x', banners: [1] }] } },
  { name: 'pochta-settings', url: 'https://mobileapp.russianpost.ru/mobile-api/method/1.0/application.settings',
    body: { showBanners: true, yandexAdsEnabled: true, other: true, advertisingSettings: { enabled: true, blockId: 'R-M-123-4', list: [1, 2] } } },
  { name: 'cdek-main-feed', url: 'https://my.cdek.ru/api/product-aggregator/v1/feed?screen=MOBILE_MAIN&x=1',
    body: { data: { adTag: { erid: '2VtzqvXXXX', label: 'Реклама' }, items: [{ id: 1, title: 't' }] } } },
  { name: 'cdek-dashboards', url: 'https://my.cdek.ru/api/dashboards/v1/main', body: { items: [{ erid: 'abcd1234', image: 'https://x.ru/y.png' }] } },
  { name: 'cdek-shop', url: 'https://my.cdek.ru/api/product-aggregator/v1/feed?screen=SHOPPING',
    body: { data: { items: [{ id: 1, image: 'https://x.ru/1.png', erid: '2Vtzq1234' }, { id: 2, image: 'https://x.ru/2.png' }, { id: 3, image: 'https://x.ru/3.png' }] } } },

  // ── мелочи ──
  { name: 'non-json', url: 'https://api-ios.wildberries.ru/__internal/x', body: '<html>hi</html>' },
  { name: 'empty', url: 'https://api-ios.wildberries.ru/__internal/x', body: '' },
  { name: 'bad-json', url: 'https://api-ios.wildberries.ru/__internal/x', body: '{"a":' },
  { name: 'no-debug', argument: '', url: 'https://banners-bt.wildberries.ru/api/v5/main', body: { data: { topSliderNF: [wbBanner(1, true)] } } },
];

})();
const EXPECTED = {
  "wb-config-request": "c5c877087083424f",
  "wb-config-request-nocache": "bf957bba944c69b6",
  "other-request": "bf957bba944c69b6",
  "wb-config": "d995dbcb79448150",
  "wb-config-reactive": "bf957bba944c69b6",
  "wb-recs-profile": "0ae6ddfea6c12b46",
  "wb-recs-main": "bf957bba944c69b6",
  "wb-banners-main": "ae4a9a9aac355fe2",
  "wb-banners-basket": "bf957bba944c69b6",
  "wb-home-small": "bf957bba944c69b6",
  "wb-static-json": "d2650ebde0c4d541",
  "wb-marketing-info": "bf957bba944c69b6",
  "ozon-my": "aba19057cfbb598e",
  "ozon-my-paged": "598012891ff7094d",
  "ozon-cart-paged": "598012891ff7094d",
  "ozon-fav": "a97d17df3c5d7909",
  "ozon-finance": "09993c329c987dfb",
  "ozon-home": "614d1b6d3ed265cb",
  "ozon-widget": "4991c401cd958eac",
  "ym-fav": "b79b786cd05a8e69",
  "ym-cart": "b002182dd9955385",
  "ym-other": "041b0b657382de31",
  "go-layout": "1d69ae80a17f8191",
  "avito-fav": "68808063bd1798a6",
  "avito-main": "ee82997c5331cca4",
  "ae-profile": "170d393f3ce7f82d",
  "ae-shelf": "93a42215c0f24c73",
  "ae-cart": "80d82f488c9e1746",
  "pochta-banners": "e5945adede88f5b5",
  "pochta-blocks": "a75c6e1d00a5b407",
  "pochta-settings": "aa9c481bfa9d899f",
  "cdek-main-feed": "7e082d9a7ec87d24",
  "cdek-dashboards": "bf957bba944c69b6",
  "cdek-shop": "e734c32ff9783cd4",
  "non-json": "bf957bba944c69b6",
  "empty": "bf957bba944c69b6",
  "bad-json": "bf957bba944c69b6",
  "no-debug": "3535e3871d08e4aa",
};
const digest = (r) => crypto.createHash('sha256').update(JSON.stringify({ result: r.result, calls: r.calls })).digest('hex').slice(0, 16);
const fresh = {};
FIXTURES.forEach((fxt) => {
  let d = 'ERROR';
  try { d = digest(run(fxt)); } catch (e) { d = 'ERROR ' + e.message; }
  fresh[fxt.name] = d;
  if (!UPDATE) report('E ' + fxt.name, EXPECTED[fxt.name] === d, EXPECTED[fxt.name] === undefined ? 'нет эталона (запустите с --update)' : (EXPECTED[fxt.name] === d ? '' : 'результат изменился'));
});
if (UPDATE) { console.log('\nНовые эталоны — вставьте вместо EXPECTED:\n' + JSON.stringify(fresh, null, 2)); }

// ═════════════════════ 4. Случайные ответы ═════════════════════
group('4. Случайные ответы');
tx('F1 любой ответ: $done ровно один раз, результат — корректный JSON', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, pick = (a) => a[Math.floor(rnd() * a.length)];
  const KEYS = ['id', 'title', 'name', 'image', 'items', 'data', 'widgets', 'children', 'erid', 'isAd', 'label', 'type', 'component',
    'banner', 'banners', 'offers', 'stateId', 'layout', 'widgetStates', 'rowV2', 'product', 'stories', 'state', 'widgetInstances', 'uuid'];
  const STRS = ['Реклама', 'Ad', 'ad', 'ok', 'erid: 2VtzqwAbc', 'https://x.ru/a.jpg', 'https://x.ru/p?erid=2TKWBzzzz', 'Рекламодатель ООО',
    'Похожие объявления', 'Рекомендуем вам', 'urban-ads', 'adBanner', 'products_widget', 'x', ''];
  const gen = (d) => { const r = rnd();
    if (d > 5 || r < 0.25) { const q = rnd(); return q < 0.55 ? pick(STRS) : q < 0.75 ? Math.floor(rnd() * 1000) : q < 0.85 ? rnd() < 0.5 : q < 0.9 ? null : 12345678901234567 + Math.floor(rnd() * 1000); }
    if (r < 0.55) { const a = []; for (let i = Math.floor(rnd() * 5); i > 0; i--) a.push(gen(d + 1)); return a; }
    const o = {}; for (let i = 1 + Math.floor(rnd() * 5); i > 0; i--) o[pick(KEYS)] = gen(d + 1); return o; };
  const HOSTS = ['https://api-ios.wildberries.ru/__internal/recom/x', 'https://banners-bt.wildberries.ru/api/v5/main', 'https://apps-config.wildberries.ru/config/api/v2/config?v=1',
    'https://finance.wb.ru/api/offers-api/v1/product/offers', 'https://api.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fmy',
    'https://mapi.market.yandex.net/api/screen/favourites', 'https://tc.mobile.yandex.net/mlutp/v1/widgets/layout/x', 'https://tc.mobile.yandex.net/4.0/cargo-c2c/v1/delivery/state',
    'https://app.avito.ru/api/5/favorites/items/widgets', 'https://mobileapp.russianpost.ru/mobile-api/method/1.0/adv.get.banners', 'https://my.cdek.ru/api/product-aggregator/v1/feed?screen=MOBILE_MAIN',
    'https://aer.acs.aliexpress.ru/mobile-layout/profile', 'https://wapi.aliexpress.ru/mobile-layout/home/fusion', 'https://wapi.aliexpress.ru/aer-jsonapi/bx/mobile/recommend/v3/just-for-you',
    'https://mobileapi.ddxfitness.ru/stories'];
  for (let i = 0; i < 1500; i++) {
    const url = pick(HOSTS); let body = gen(0); if (!body || typeof body !== 'object') body = { data: body };
    const r = run({ url: url, body: body, argument: '' });
    if (r.calls !== 1) throw new Error('$done вызван ' + r.calls + ' раз: ' + url);
    if (r.result && r.result.body !== undefined) JSON.parse(r.result.body);
  }
});
tx('F2 лента AliExpress: после удаления рекламы ряды полные, порядок товаров сохранён', () => {
  let bad = 0; const N = 1500;
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let mod = 0;
  for (let it = 0; it < N; it++) {
    let pid = 0; const per = rnd() < 0.85 ? 2 : (rnd() < 0.5 ? 1 : 3);
    const nrows = 1 + Math.floor(rnd() * 12), organic = [];
    const items = [];
    for (let r = 0; r < nrows; r++) {
      if (rnd() < 0.08) items.push({ banner: { title: 'x' } });
      const row = [];
      for (let c = 0; c < per; c++) { pid++; const ad = rnd() < 0.2; if (!ad) organic.push(pid);
        row.push({ product: { productId: 1005000000000000 + pid, t: 'p' + pid, image: 'https://ae04.alicdn.com/kf/' + pid + '.png', trace: ad ? { biz: 'ad' } : { biz: 'jfy' } } }); }
      items.push({ rowV2: { items: row, idx: r } });
    }
    const body = { data: { items, meta: { pad: 'x'.repeat(2500) } } };
    const r = run({ url: 'https://wapi.aliexpress.ru/aer-jsonapi/bx/mobile/recommend/v3/just-for-you-new-ru-sell', body, argument: '' });
    if (r.calls !== 1) { bad++; console.log('CALLS'); continue; }
    if (!r.result || r.result.body === undefined) continue;   // рекламы нет — ответ не меняется
    mod++;
    let p; try { p = JSON.parse(r.result.body); } catch (e) { bad++; console.log('BADJSON'); continue; }
    const rows = p.data.items.filter(x => x.rowV2);
    const got = []; rows.forEach(x => x.rowV2.items.forEach(y => got.push(+String(y.product.productId).slice(-3))));
    if (per >= 2 && rows.some(x => x.rowV2.items.length !== per)) { bad++; console.log('INCOMPLETE ROW', per, JSON.stringify(rows.map(x => x.rowV2.items.length))); }
    const exp = organic.slice(0, got.length);
    if (JSON.stringify(got) !== JSON.stringify(exp)) { bad++; console.log('ORDER', JSON.stringify(got), JSON.stringify(organic)); }
    const lost = organic.length - got.length;
    if (per >= 2 ? lost > per - 1 || lost < 0 : lost !== 0) { bad++; console.log('LOST', lost, per); }
    if (p.data.items.filter(x => x.banner).length !== items.filter(x => x.banner).length) { bad++; console.log('BANNER ITEM LOST'); }
    if (!/"productId":10050000000000\d\d/.test(r.result.body) && got.length) { bad++; console.log('BIGINT'); }
  }
  if (bad) throw new Error('нарушений: ' + bad);
});

console.log('\n' + (fail ? 'ПРОВАЛЕНО: ' + fail + ' из ' + n : 'Все проверки пройдены: ' + n));
process.exit(fail ? 1 : 0);
