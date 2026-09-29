/*
 * RU Apps AdBlock v3.20 — фильтр ответов для Shadowrocket (type=http-response, requires-body=true)
 * Ozon / Wildberries / Яндекс Маркет / Яндекс Go / Avito / СДЭК / Почта России / AliExpress / DDX Fitness
 *
 * Как находит рекламу: по закону о маркировке (38-ФЗ, ОРД) каждое объявление несёт токен erid
 * и пометку «Реклама»/«Ad» с данными рекламодателя — всё это приходит в JSON вместе с объявлением.
 *
 * Что удаляется: найдя маркер, скрипт поднимается от него вверх до ближайшего элемента списка,
 * в котором есть картинка/видео (то есть до самой карточки/баннера), и удаляет этот элемент.
 * Если в карточке картинки нет — удаляется наименьший элемент с маркером. Если после удаления
 * список опустел (карусель из одной рекламы) — удаляется и сам блок.
 *
 * v3.2: исправлены ложные срабатывания v3 (offerId/supplierId/sellerId содержат «erId»);
 *       удаляется карточка целиком, а не только плашка «Ad»; баннеры WB фильтруются по маркерам
 *       (схема ответа сохраняется); защита 64-битных чисел работает и внутри вложенного JSON;
 *       диагностика структуры для WB и Почты.
 *
 * v3.3: Яндекс Go — лента плиток (products_widget: рестораны, товары, реклама) удаляется целиком;
 *       поиск, адреса и навигация главного экрана остаются.
 * v3.4: адреса с портом (:443) — Почта России; Go — удаляется вся лента (секции с плитками
 *       tap_product/товары/рестораны); WB/СДЭК/Почта — снят лимит 60% (там реклама = почти весь ответ);
 *       маркер ordBannerMark (ОРД-маркировка WB); Почта: adv.get.banners -> пусто, спецпредложения — вон.
 * v3.5: Avito — рекламный блок embeddedAdvBanner целиком; нельзя убрать карточку — не трогаем и
 *       надпись «Реклама» (реклама без пометки хуже); Почта — выключаются advertisingSettings;
 *       СДЭК — блок-лента с общей пометкой erid (Горячие предложения) очищается, плитки dashboards не трогаем.
 * v3.6: Почта — пустой список баннеров приложение считает ошибкой («Баннер не загрузился»),
 *       поэтому вместо рекламы отдаётся один невидимый баннер (прозрачная картинка, без ссылки);
 *       СДЭК — очистка ленты только для главной (screen=MOBILE_MAIN), раздел «Шопинг» не трогаем.
 * v3.7: WB — слоты большого слайдера, шапки под поиском и «Мой WB» очищаются целиком; чтобы WB не
 *       подставлял свой запасной баннер «Everything you need is here», в слот кладётся один невидимый
 *       баннер (прозрачная картинка, без ссылки). Диагностика apps-config WB (поиск флага запасного баннера).
 * v3.8: WB — в apps-config выключаются все флаги показа баннеров/слайдеров (enableBannerLC, enableBannerOnSearch…),
 *       чтобы блоки не рисовались вовсе; Почта — из описания главного экрана (get.blocks) убираются блоки
 *       BANNERS / ADVERTISING / ADVERTISING_2 (карусель и места рекламы Яндекса) целиком.
 * v3.9: WB — конфиг применяется со следующего запуска, поэтому запрос конфига идёт без If-None-Match
 *       (приложение всегда получает изменённую копию); выключаются рекомендации в «Мой WB»
 *       (enableRecInLk, enableSimilarGoodsCarouselInLK) и шапка-реклама главной (enableMainPageCustomHeader,
 *       «находки из Китая»); диапазоны показа баннеров ЛК/доставки/поиска -> «никому»; из списка флагов убраны
 *       технические (New…/Logic/Refresh/Control…), чтобы не менять поведение приложения.
 *       Лента «Selected for you» в профиле (recom/personal … search, запрос профиля) -> пустая.
 * v3.10: Ozon — в профиле (страница /my) убирается лента «Подобрали по вашим интересам» (виджет
 *       shelf.infiniteScroll) и ссылка на её следующие страницы; главная Ozon и остальной профиль не меняются.
 * v3.11: Ozon — промо-плашка внизу профиля (cms.uWidgetObject, «Ozon Travel −3000 ₽…») и лишние отступы под ней.
 *       AliExpress (aer.acs / wapi.aliexpress.ru) — реклама по маркировке + блоки профиля по заголовку:
 *       «Товары от партнеров», «Вы смотрели», «Одна цена», «Рекомендуем вам»; пункты меню профиля не трогаются.
 * v3.12: AliExpress — блок = виджет целиком (не только заголовок), только профиль и корзина (главная, «Ниже рынка»,
 *       история не трогаются); полка p4p-only-shelf и рекомендации корзины — пустые. Ozon — рекомендации в избранном
 *       и корзине («Подобрали для вас», «Вы смотрели»), слайдер «Товары за 1 ₽» в профиле. Маркет — «Достойны
 *       сердечка» (избранное), «Может пригодиться» (корзина). Avito — «Похожие объявления» в избранном.
 * v3.13: Маркет — лента рекомендаций = секция FeedboxSection (в избранном и корзине) убирается целиком;
 *       Avito — после заголовка «Похожие объявления» убираются и все объявления подборки, плюс рекламные места
 *       (banner/bannerCode) в списке избранного; Ozon — ячейка «Лента обзоров» в профиле.
 * v3.14: Ozon Банк (вкладка ₽, страницы /finance/…) — баннер-карусель наверху («Товары за 1 ₽ за покупки по вашей
 *       карте», виджет skeeter.fintabBannerPriority) убирается целиком; счета, QR-код, «Пополнить» и раздел
 *       «Товары за 1 ₽» ниже не трогаются.
 * v3.15: WB Кошелёк (finance.wb.ru / wb-wallet.wildberries.ru) — промо-карусель Банка («Накопительный счёт» и соседние
 *       карточки; картинки из папки bi-crm-…) убирается вместе с пустой рамкой; баланс, кнопки, «Savings»/«Loans» не
 *       трогаются. На этих хостах работает только это правило (без общего поиска рекламы); для диагностики в лог
 *       пишется структура ответа, ответы Кошелька целиком не пишутся.
 * v3.16: WB Кошелёк — карусель на главной приходит из offers-api (место BANNER_CAROUSEL_MAIN_SCREEN, карточки «Реклама»):
 *       все места BANNER_* -> пустые списки, в остальных убираются предложения с пометкой «Реклама». Ozon Банк — экран банка
 *       теперь на api.finance.ozon.ru / xapi.ozon.ru: убираются виджеты adBanner / skeeter.…Banner…, в лог — устройство
 *       ответа. В лог не пишутся номера счетов из адреса.
 * v3.17: DDX Fitness (mobileapi.ddxfitness.ru) — карусель баннеров на главной: списки banner(s) и виджеты с типом …banner…,
 *       сторис не трогаются. Ozon Банк — экран банка это веб-страница, данные с api.finance.ozon.ru (xapi.ozon.ru оказался
 *       телеметрией и больше не расшифровывается).
 * v3.18: AliExpress — на главной убирается полка плиток под иконками категорий («Звёздные купоны», витрины брендов:
 *       виджет со списком stories); в ленте «Для вас» после удаления рекламы товары снова раскладываются по два в ряд
 *       (одиночный товар в ряду приложение рисовало широкой карточкой). DDX Fitness: баннеры отсекает правило модуля.
 *       Ozon Банк: api.finance.ozon.ru не расшифровать (сертификат российского УЦ), его правила убраны.
 * v3.19: DDX Fitness — крупные ответы (сторис, тренеры, видео, абонементы, настройки) обрывались при расшифровке и без
 *       скрипта: их сервер отдаёт сжатыми (gzip), и такие ответы до приложения не доходили. Из запросов DDX убирается
 *       Accept-Encoding (фаза запроса) — сервер отвечает без сжатия. Сторис на главной: список в ответе /stories -> пустой
 *       (именно пустой ответ, а не ошибка: при ошибке приложение показывает сторис из своего кэша).
 * v3.20: DDX Fitness — дело оказалось не в сжатии: и без него те же ответы обрываются при расшифровке. GET-запросы DDX
 *       скрипт повторяет сам ($httpClient, обычная проверка сертификата) и отдаёт приложению полученный ответ (сторис —
 *       пустым списком); при ошибке запрос идёт как обычно. Яндекс Go, экран доставки: рекламный баннер (элемент
 *       type=urban-ads) убирается; ответ рекламной сети 4.0/urbanads/… можно очищать целиком.
 *
 * Страховки: тело не меняется, если ничего не найдено; подъём вверх не выше блока в 20% ответа;
 * один удаляемый элемент не больше 40% ответа; если суммарно удаляется больше 60% — ответ как есть.
 * argument=debug — писать в лог, что и откуда удалено.
 */
(function () {
  var url = ($request && $request.url) || '';
  var DEBUG = typeof $argument === 'string' && $argument.indexOf('debug') !== -1;
  var m = url.match(/^https?:\/\/([^\/?#]+)([^?#]*)/) || [];
  var host = (m[1] || '').replace(/:\d+$/, '');
  var path = m[2] || '';
  var TAG = '[RU-AdBlock] ' + host + path.replace(/\d{12,}/g, '#').slice(0, 80);   // номера счетов в адресе — не в лог

  function log(s) { try { console.log(TAG + ' ' + s); } catch (e) {} }
  function pass(reason) { if (DEBUG && reason) log(reason); $done({}); }

  // ───────── 64-битные числа: в кавычки до парсинга (только вне строк), обратно после ─────────
  var BIG = '__RUADB_BIG__';
  function protectBig(s) {
    if (!/\d{16}/.test(s)) return s;
    var chunks = [], last = 0, n = s.length, inStr = false;
    for (var i = 0; i < n; i++) {
      var c = s.charCodeAt(i);
      if (inStr) { if (c === 92) { i++; continue; } if (c === 34) inStr = false; continue; }
      if (c === 34) { inStr = true; continue; }
      if ((c >= 48 && c <= 57) || c === 45) {
        var j = i + 1;
        while (j < n) { var d = s.charCodeAt(j); if (d >= 48 && d <= 57) j++; else break; }
        var nc = s.charCodeAt(j);
        if (nc === 46 || nc === 101 || nc === 69) {
          while (j < n) { var e = s.charCodeAt(j); if ((e >= 48 && e <= 57) || e === 46 || e === 101 || e === 69 || e === 43 || e === 45) j++; else break; }
          i = j - 1; continue;
        }
        if (j - i - (c === 45 ? 1 : 0) >= 16) { chunks.push(s.slice(last, i), '"' + BIG + s.slice(i, j) + '"'); last = j; }
        i = j - 1;
      }
    }
    if (!chunks.length) return s;
    chunks.push(s.slice(last));
    return chunks.join('');
  }
  var BIG_RE = new RegExp('"' + BIG + '(-?\\d+)"', 'g');
  function restoreBig(s) { return s.indexOf(BIG) === -1 ? s : s.replace(BIG_RE, '$1'); }

  // DDX Fitness, сторис на главной («Приводи родителей», «Правила клуба»…): ответ /stories {session_id, request_id, data}.
  // Списки сторис -> пустые, остальное (и схема ответа) — как было. Ошибка вместо ответа не годится: тогда приложение
  // показывает сторис из своего кэша.
  var DDX_STORIES_PATH = /^\/stories\/?$/;
  function ddxStories(d) {
    var r = { data: d, n: 0, at: [] };
    var emp = function (h, k, p) { if (Array.isArray(h[k]) && h[k].length) { r.n += h[k].length; r.at.push(p + '[' + h[k].length + ']'); h[k] = []; } };
    if (Array.isArray(d)) { if (d.length) { r.n = d.length; r.at.push('[' + d.length + ']'); r.data = []; } }
    else if (d && typeof d === 'object') {
      if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) { for (var k in d.data) emp(d.data, k, '.data.' + k); }
      else for (var t in d) if (!/^(session_id|request_id)$/.test(t)) emp(d, t, '.' + t);
    }
    return r;
  }

  // ───────── фаза запроса (type=http-request) ─────────
  // WB apps-config: без If-None-Match / If-Modified-Since сервер всегда отдаёт конфиг целиком (а не 304),
  // значит, приложение каждый раз сохраняет копию, уже изменённую этим скриптом.
  // DDX Fitness: при расшифровке крупные ответы сервера DDX обрываются (сервер закрывает соединение, Shadowrocket такой
  // ответ приложению не отдаёт): тренеры в «Календаре», видео, абонементы, настройки, сторис. Поэтому GET-запрос DDX
  // скрипт повторяет сам ($httpClient, сертификат проверяется как обычно) и отдаёт приложению полученный ответ
  // (сторис — с пустым списком). Если повтор не удался — запрос идёт как обычно. Список баннеров (/mobile_banners)
  // не повторяется: его отклоняет правило модуля.
  if (typeof $response === 'undefined' || !$response) {
    if (/^apps-config\.wildberries\.ru$/.test(host)) {
      var rh = ($request && $request.headers) || {}, nh = {}, cut = [];
      for (var hk in rh) {
        if (/^(if-none-match|if-modified-since)$/i.test(hk)) { cut.push(hk); continue; }
        nh[hk] = rh[hk];
      }
      if (cut.length) { if (DEBUG) log('request: removed ' + cut.join(',') + ' -> full config'); return $done({ headers: nh }); }
    }
    if (/^mobileapi\.ddxfitness\.ru$/.test(host)) {
      var dh = ($request && $request.headers) || {}, dnh = {}, mine = false, dcut = 0;
      for (var dk in dh) {
        if (/^accept-encoding$/i.test(dk)) { dcut++; continue; }          // ответ без сжатия — его проще разобрать (сторис)
        if (/^x-ruadb$/i.test(dk)) { mine = true; dcut++; continue; }     // это повтор самого скрипта, если он пришёл сюда же
        dnh[dk] = dh[dk];
      }
      var asIs = function () { return dcut ? $done({ headers: dnh }) : $done({}); };
      var dm = String(($request && $request.method) || 'GET').toUpperCase();
      if (mine || dm !== 'GET' || /^\/mobile_banners/.test(path) || typeof $httpClient === 'undefined' || !$httpClient ||
          typeof $httpClient.get !== 'function') return asIs();
      var rq = {}; for (var rk in dnh) rq[rk] = dnh[rk];
      rq['X-RuAdb'] = '1';
      var t0 = new Date().getTime();
      $httpClient.get({ url: url, headers: rq, timeout: 12 }, function (err, resp, rb) {
        var st = resp && +(resp.status || resp.statusCode);
        if (err || !st || typeof rb !== 'string') {
          if (DEBUG) log('relay failed (' + String(err || 'no response').slice(0, 120) + ') -> as is');
          return asIs();
        }
        var oh = {}, rsh = resp.headers || {};
        for (var ok in rsh) if (!/^(content-length|content-encoding|transfer-encoding|connection|keep-alive)$/i.test(ok)) oh[ok] = rsh[ok];
        var ob = rb, note = '';
        if (DDX_STORIES_PATH.test(path) && st === 200) {
          try {
            var sr = ddxStories(JSON.parse(protectBig(rb)));
            if (sr.n) { ob = restoreBig(JSON.stringify(sr.data)); note = ' | stories emptied ' + sr.at.join(','); }
          } catch (e) { note = ' | stories: not json'; }
        }
        if (DEBUG) log('relay ' + st + ' ' + rb.length + 'b ' + (new Date().getTime() - t0) + 'ms' + note);
        $done({ response: { status: st, headers: oh, body: ob } });
      });
      return;
    }
    return $done({});
  }

  // DDX Fitness: из ответов обрабатывается только список сторис (/stories, см. ниже). Экран Ozon Банка не обрабатывается
  // (с модулем v3.17 его ответы ещё приходят сюда). Остальное с этих хостов — как есть, без общего поиска рекламы.
  var IS_DDX_STORIES = /^mobileapi\.ddxfitness\.ru$/.test(host) && DDX_STORIES_PATH.test(path);
  if (/^(mobileapi\.ddxfitness\.ru|api\.finance\.ozon\.ru)$/.test(host) && !IS_DDX_STORIES) return pass('host not handled');

  // WB Кошелёк (finance.wb.ru / wb-wallet.wildberries.ru): только свои правила, без общего поиска рекламы, см. ниже
  var IS_WB_FIN = /^(finance\.wb\.ru|wb-wallet\.wildberries\.ru)$/.test(host);

  var body = $response && $response.body;
  if (typeof body !== 'string' || body.length < 2) return pass('empty/binary body');
  var c0 = body.replace(/^\s+/, '').charAt(0);
  if (c0 !== '{' && c0 !== '[') {
    var rsh = $response.headers || {}, ctype = '';
    for (var rk in rsh) if (/^content-type$/i.test(rk)) ctype = String(rsh[rk]);
    return pass('not json' + (IS_WB_FIN ? ' (' + (ctype || '?') + ', ' + body.length + 'b)' : ''));
  }

  var data;
  try { data = JSON.parse(protectBig(body)); } catch (e) { return pass('json parse error'); }

  // DDX Fitness: сторис (если ответ дошёл сюда, а не через повтор в фазе запроса) — см. ddxStories
  if (IS_DDX_STORIES) {
    var ds = ddxStories(data);
    if (DEBUG) log('DDX stories: ' + (ds.n ? 'emptied ' + ds.at.join(',') : 'nothing to empty') + ' | top=' +
                   (Array.isArray(ds.data) ? '[array]' : Object.keys(ds.data || {}).join('/')));
    if (!ds.n) return $done({});
    return $done({ body: restoreBig(JSON.stringify(ds.data)) });
  }

  var isAvito = /(^|\.)avito\.ru$/.test(host);
  var IS_ALI = /(^|\.)aliexpress\.(ru|com)$/.test(host);
  var IS_YM = /^mapi\.market\.yandex\.net$/.test(host);
  // WB apps-config: выключаем флаги показа баннеров/слайдеров, чтобы блоки не рисовались совсем (без пустого места)
  function camelWords(k) {
    return String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }
  function hasAny(ws, list) { for (var i = 0; i < ws.length; i++) if (list.indexOf(ws[i]) !== -1) return true; return false; }
  // Флаг показа баннеров/слайдеров: enable*/show* -> false, disable*/hide* -> true.
  // Технические флаги (новая логика, обновление, логирование, контекст, редизайн, служебные баннеры корзины)
  // не трогаем: они выбирают вариант поведения, а не «показывать или нет».
  var WB_FLAG_SKIP = ['confirm', 'claims', 'limit', 'deeplink', 'routing', 'service', 'force', 'pixel', 'caching',
    'scroll', 'animation', 'duration', 'delay', 'reordering', 'separation', 'aggr', 'check', 'new', 'logic', 'refresh',
    'log', 'logging', 'passing', 'pause', 'redesign', 'control', 'gateway', 'photo', 'select', 'media', 'image', 'view',
    'change', 'details', 'intervals', 'reduced', 'spacing', 'ears', 'abtesting', 'ab', 'employee', 'test', 'fullscreen',
    'video', 'link', 'pin'];
  function wbBannerFlag(k) {
    var w = camelWords(k);
    if (!hasAny(w, ['banner', 'banners', 'slider', 'sliders'])) return 0;
    if (hasAny(w, WB_FLAG_SKIP)) return 0;
    if (w[0] === 'disable' || w[0] === 'hide') return 2;              // disable* -> true
    if (w[0] === 'enable' || w[0] === 'show' || w[0] === 'is' || w[0] === 'use') return 1; // enable* -> false
    return 0;
  }
  // Точечно (имена из конфига WB 7.8): рекомендации в «Мой WB», шапка-реклама главной («находки из Китая»)
  var WB_FORCE = { hideAllBanners: true, enableRecInLk: false, enableSimilarGoodsCarouselInLK: false,
                   enableMainPageCustomHeader: false };
  // Кому показывать: [{fromId,toId}] по id пользователя. [{1,1}] — так сам WB выключает функцию.
  var WB_RANGE_OFF = /^(bannerLCRange|AdvertisingBannerDeliveryRange|advertisingBannerDeliveryNNSZRange|marketingSliderUserRange|contextBannersInSearchRange|htmlVastBannersRange)$/;
  var WB_DROP_OBJ = /^(mainPageCustomHeader)$/;
  if (/^apps-config\.wildberries\.ru$/.test(host) && data && typeof data === 'object') {
    var flipped = [], cfgOther = [];
    (function walkCfg(n, d) {
      if (d > 8 || !n || typeof n !== 'object' || Array.isArray(n)) return;
      for (var ck in n) {
        var cv = n[ck];
        var forced = Object.prototype.hasOwnProperty.call(WB_FORCE, ck);
        var mode = forced ? (WB_FORCE[ck] ? 2 : 1) : wbBannerFlag(ck);
        if (WB_DROP_OBJ.test(ck) && cv && typeof cv === 'object') { delete n[ck]; flipped.push('-' + ck); continue; }
        if (WB_RANGE_OFF.test(ck) && Array.isArray(cv)) {
          var off = cv.length === 1 && cv[0] && cv[0].fromId === 1 && cv[0].toId === 1;
          if (!off) { n[ck] = [{ fromId: 1, toId: 1 }]; flipped.push(ck + '=off'); }
          continue;
        }
        if (mode && typeof cv === 'boolean') {
          var want = mode === 2;
          if (cv !== want) { n[ck] = want; flipped.push(ck); }
        } else if (mode && cv && typeof cv === 'object' && typeof cv.enabled === 'boolean') {
          var want2 = mode === 2;
          if (cv.enabled !== want2) { cv.enabled = want2; flipped.push(ck + '.enabled'); }
        } else if (cv && typeof cv === 'object') walkCfg(cv, d + 1);
        if (DEBUG && cfgOther.length < 60 && /(^|[a-z])(Rec|Recom|Recommend)[A-Z]|Lk$|LK$|InLk|InLK|Profile[A-Z]|CustomHeader/.test(ck) &&
            (typeof cv === 'boolean' || typeof cv === 'number'))
          cfgOther.push(ck + '=' + cv);
      }
    })(data, 0);
    if (DEBUG) {
      var fl = flipped.join(',');
      if (!fl) log('CONFIG: nothing to change');
      for (var ci = 0; ci < fl.length; ci += 1800) log('CONFIG changed(' + flipped.length + ') ' + fl.slice(ci, ci + 1800));
      if (cfgOther.length) log('CONFIG rec/lk: ' + cfgOther.join(' ; ').slice(0, 1800));
    }
    if (!flipped.length) return $done({});
    return $done({ body: restoreBig(JSON.stringify(data)) });
  }

  // ───────── WB: лента «Selected for you» в профиле (Мой WB) ─────────
  // Главная и профиль берут одну и ту же персональную выдачу recom/personal/…/search?query=<id>.
  // Главная собирает параметры по алфавиту (appType, curr, dest … spp; ab_* — в конце),
  // профиль — в случайном порядке. Пустой список — штатное состояние («нет рекомендаций»).
  function queryKeysSorted(u) {
    var q = u.split('?')[1] || '', keys = [];
    q.split('&').forEach(function (p) { var kk = p.split('=')[0]; if (kk && !/^ab_/i.test(kk)) keys.push(kk); });
    if (keys.length < 6) return true; // мало данных — считаем «главной» и не трогаем
    for (var i = 1; i < keys.length; i++) if (keys[i - 1] > keys[i]) return false;
    return true;
  }
  if (/^api-ios\.wildberries\.ru$/.test(host) && /\/__internal\/recom\/personal\/[^\/]+\/[^\/]+\/v\d+\/search$/.test(path) &&
      /[?&]query=\d+(&|$)/.test(url) && data && typeof data === 'object' && Array.isArray(data.products)) {
    var sorted = queryKeysSorted(url);
    if (DEBUG) log('RECS ' + (sorted ? 'main (sorted params) -> keep' : 'profile (unsorted params) -> empty') +
                   ' products=' + data.products.length + ' meta=' + JSON.stringify(data.metadata || null).slice(0, 300));
    if (!sorted && data.products.length) {
      data.products = [];
      if (data.metadata && typeof data.metadata === 'object') for (var mk in data.metadata) if (/^total$/i.test(mk) && typeof data.metadata[mk] === 'number') data.metadata[mk] = 0;
      if (typeof data.total === 'number') data.total = 0;
      return $done({ body: restoreBig(JSON.stringify(data)) });
    }
    // лента главной — дальше обычная проверка на рекламные карточки
  }

  var IS_POCHTA = /(^|\.)russianpost\.ru$/.test(host);
  var IS_WB_BANNERS = /^banners-bt\.wildberries\.ru$/.test(host);
  var IS_CDEK = /(^|\.)cdek\.ru$/.test(host);
  // Где реклама — это почти весь ответ (баннерные сервисы), лимиты «не больше 40/60%» мешают
  // Яндекс Go: ответ рекламной сети (4.0/urbanads/…) — это только реклама (баннер «Реклама» на экране доставки и др.)
  var GO_URBANADS = /^tc\.mobile\.yandex\.net$/.test(host) && /\/urbanads\//.test(path);
  var GO_DELIVERY = /^tc\.mobile\.yandex\.net$/.test(host) && /\/cargo-c2c\/v\d+\/delivery\/state$/.test(path);
  var RELAXED = IS_WB_BANNERS || IS_CDEK || IS_POCHTA || GO_URBANADS;
  var ELEM_CAP = RELAXED ? 0.98 : 0.4, ABORT_CAP = RELAXED ? 1.01 : 0.6, CLIMB_CAP = RELAXED ? 0.9 : 0.35;
  // Почта: ответ, целиком состоящий из рекламы -> все списки пустые (схема сохраняется)
  var STRIP = false;
  var POCHTA_BANNERS = IS_POCHTA && /adv\.get\.banners/i.test(path);
  // Avito: виджет ленты с ключом вида embeddedAdvBanner / advBanner — рекламный блок целиком
  var AVITO_BLOCK_KEY = isAvito ? /adv\w*banner|banner\w*adv/i : null;
  // СДЭК: плитки главного экрана (кнопки «Отправить», «Шопинг»…) — не трогаем, чтобы не было дыр в сетке
  if (IS_CDEK && /\/dashboards/i.test(path)) return pass('cdek dashboards: skip');
  var GO_LAYOUT = /^tc\.mobile\.yandex\.net$/.test(host) && /\/mlutp\/v\d+\/widgets\/layout\//.test(path);
  // Лента плиток Go: products_widget (+ похожие *_widget с товарами/местами/рекомендациями)
  var BLOCK_TYPE = GO_LAYOUT ? /^[a-z_]*(product|place|restaurant|eats|goods|offer|feed|recommend|shelf|market|lavka)[a-z_]*_widget$/i : null;
  var PROBE = /(^|\.)(wildberries|wb|wbbasket|russianpost|cdek|avito|aliexpress)\.ru$/.test(host) || GO_LAYOUT || GO_URBANADS || GO_DELIVERY;
  var TOTAL = body.length;
  var stats = { removed: 0, bytes: 0, blockBytes: 0, blocks: [], reasons: {}, skippedBig: 0, targets: [] };

  // ───────── Ozon: рекомендации в профиле, избранном и корзине; баннер Ozon Банка ─────────
  // Страницы composer: url=/my (профиль), /my/favorites (избранное), /cart (корзина). Рекомендации — виджеты
  // shelf.infiniteScroll и отдельные страницы-продолжения (layout_container = pagination_app_my_account /
  // recoms_pagination_favorites_app / RecomsInCartPaginator): такие страницы отдаются пустыми, ссылки на них убираются.
  // В профиле ещё: промо-слайдер alert.placementSlider («Товары за 1 ₽», «Совместный счёт») и нижняя плашка
  // cms.uWidgetObject. Главная Ozon (/home) не трогается.
  // Ozon Банк (вкладка ₽): страница /finance/… (без входа в банк — /finance/banklanding) или любая страница с виджетами
  // skeeter.fintab…: убирается только баннер-карусель наверху (skeeter.fintabBannerPriority, component=adBanner —
  // «Товары за 1 ₽ за покупки по вашей карте»). Разделитель перед ним остаётся (это граница шапки), счета, QR-код,
  // «Пополнить», раздел «Товары за 1 ₽» с поиском и товарами ниже — без изменений.
  var OZ_BANK_BANNER = /^skeeter\.fintab\w*Banner/i;
  // имя виджета composer: поле name, а если его нет — name из widgetTrackingInfo (строка-JSON или объект)
  function ozWName(w) {
    if (!w || typeof w !== 'object' || Array.isArray(w)) return '';
    if (typeof w.name === 'string') return w.name;
    var ti = w.widgetTrackingInfo;
    if (typeof ti === 'string' && ti.length < 20000) { var tm = ti.match(/"name"\s*:\s*"([^"\\]+)"/); return tm ? tm[1] : ''; }
    if (ti && typeof ti === 'object' && typeof ti.name === 'string') return ti.name;
    return '';
  }
  function ozIsBankBanner(w) {
    if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
    var nm = ozWName(w);
    if (OZ_BANK_BANNER.test(nm)) return true;
    // тот же баннер под другим именем: component=adBanner у виджета вкладки Банка (skeeter.…)
    return typeof w.component === 'string' && /^adBanner$/i.test(w.component) && /^skeeter\./i.test(nm);
  }
  function ozIsBankPage(p, d) {
    if (/^\/finance(\/|$)/i.test(p)) return true;
    if (p === '/home' || !d || typeof d !== 'object' || !Array.isArray(d.layout)) return false;   // главную не трогаем
    for (var i = 0; i < d.layout.length && i < 300; i++) if (/^skeeter\.fintab/i.test(ozWName(d.layout[i]))) return true;
    return false;
  }
  var OZ_PAGE_URL = null;
  if (/^api\.ozon\.ru$/.test(host) && /\/composer-api\.bx\/page\/json\/v\d+$/.test(path)) {
    var ozu = url.match(/[?&]url=([^&#]*)/);
    if (ozu) { try { OZ_PAGE_URL = decodeURIComponent(ozu[1]); } catch (e) { OZ_PAGE_URL = ozu[1]; } }
  }
  var OZ_PATH = OZ_PAGE_URL === null ? '' : (OZ_PAGE_URL.split('?')[0].replace(/\/+$/, '') || '/');
  var OZ_KIND = OZ_PATH === '/my' ? 'my' : OZ_PATH === '/my/favorites' ? 'fav' : OZ_PATH === '/cart' ? 'cart' :
                (OZ_PAGE_URL !== null && ozIsBankPage(OZ_PATH, data)) ? 'bank' : null;
  var OZ_BANK = OZ_KIND === 'bank';
  var OZ_RECS_CONT = /layout_container(=|%3D)(pagination_app_my_account|recoms_pagination_favorites_app|RecomsInCartPaginator)(?![A-Za-z0-9_])/i;
  if (OZ_KIND && data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.layout)) {
    var ozStates = (data.widgetStates && typeof data.widgetStates === 'object') ? data.widgetStates : {};
    var ozPaged = !OZ_BANK && OZ_RECS_CONT.test(OZ_PAGE_URL);
    var ozIdxM = OZ_PAGE_URL.match(/layout_page_index=(\d+)/);
    var ozNextIdx = (ozIdxM ? +ozIdxM[1] : 1) + 1;
    var ozGone = [], ozLayoutLog = [], ozPromoLog = [];
    var OZ_FEED_NAME = /^shelf\.infiniteScroll/i;
    var OZ_MY_PROMO = /^(cms\.uWidgetObject|alert\.placementSlider)$/i;
    var OZ_FEED_TITLE = /подобрали (по вашим интересам|для вас)/i;
    var ozIsSep = function (w) { return w && typeof w === 'object' && /separator/i.test(String(w.component || '') + ' ' + String(w.name || '')); };
    var ozDropState = function (w) {
      var sid = w && w.stateId;
      if (typeof sid === 'string' && ozStates[sid] !== undefined) { stats.blockBytes += size(ozStates[sid]); delete ozStates[sid]; }
      ozGone.push(String((w && (w.name || w.component)) || '?'));
    };
    var ozText = function (w) {
      var s = '';
      try { s = JSON.stringify(w); } catch (e) {}
      if (typeof w.stateId === 'string' && ozStates[w.stateId] !== undefined) {
        var st = ozStates[w.stateId];
        if (typeof st === 'string' && st.length < 20000) { try { st = JSON.stringify(JSON.parse(st)); } catch (e) {} s += st; }
        else if (st && typeof st === 'object') { try { var js = JSON.stringify(st); if (js.length < 20000) s += js; } catch (e) {} }
      }
      return s;
    };
    var ozIsFeed = function (w) {
      if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
      // Ozon Банк: только баннер-карусель, остальные правила (ленты, заголовки) здесь не применяются
      if (OZ_BANK) {
        if (!ozIsBankBanner(w)) return false;
        if (DEBUG) ozPromoLog.push(ozWName(w) + '=' + ozText(w).slice(0, 300));
        return true;
      }
      if (typeof w.name === 'string' && OZ_FEED_NAME.test(w.name)) return true;
      if (OZ_KIND === 'my' && typeof w.name === 'string' && OZ_MY_PROMO.test(w.name)) {
        if (DEBUG) ozPromoLog.push(w.name + '=' + ozText(w).slice(0, 300));
        return true;
      }
      // профиль: ячейка «Лента обзоров» (common.cellList)
      if (OZ_KIND === 'my' && /cellList/i.test(String(w.component || '') + String(w.name || '')) && /лента обзоров/i.test(ozText(w))) return true;
      // отдельный заголовок ленты (небольшой виджет с этим текстом)
      return (typeof w.component === 'string' || typeof w.stateId === 'string') && OZ_FEED_TITLE.test(ozText(w));
    };
    if (DEBUG) for (var zl = 0; zl < data.layout.length; zl++) { var zw = data.layout[zl]; ozLayoutLog.push(String((zw && (zw.name || zw.component)) || '?')); }
    if (ozPaged) {
      // страница-продолжение рекомендаций: в ней только рекомендации -> пустая
      for (var zp = 0; zp < data.layout.length; zp++) ozDropState(data.layout[zp]);
      data.layout = [];
    } else {
      (function ozWalk(arr, d) {
        if (d > 8 || !Array.isArray(arr)) return;
        for (var i = arr.length - 1; i >= 0; i--) {
          var w = arr[i];
          if (ozIsFeed(w)) {
            var cut = 1;
            if (!OZ_BANK && i > 0 && ozIsSep(arr[i - 1])) { cut = 2; i--; } // отступ-разделитель перед блоком — тоже
            var gone = arr.splice(i, cut);
            for (var g = 0; g < gone.length; g++) ozDropState(gone[g]);
            // два разделителя подряд на месте блока -> один
            while (i > 0 && i < arr.length && ozIsSep(arr[i - 1]) && ozIsSep(arr[i])) ozDropState(arr.splice(i, 1)[0]);
            continue;
          }
          if (w && typeof w === 'object') for (var wk in w) if (Array.isArray(w[wk])) ozWalk(w[wk], d + 1);
        }
      })(data.layout, 0);
      // хвост страницы: после удалений внизу остались одни разделители -> убрать (лишний отступ)
      if (ozGone.length && !OZ_BANK) while (data.layout.length > 1 && ozIsSep(data.layout[data.layout.length - 1])) ozDropState(data.layout.pop());
    }
    // ссылки на (следующие) страницы рекомендаций -> убрать, чтобы приложение их не догружало
    var ozNextKeys = [], ozSeen = [];
    var OZ_NEXT = new RegExp('layout_page_index(=|%3D)' + ozNextIdx + '(?!\\d)', 'i');
    if (!OZ_BANK) (function ozNoMore(o, d, p) {
      if (d > 6 || !o || typeof o !== 'object') return;
      for (var k in o) {
        var v = o[k];
        if (d === 0 && k === 'widgetStates') continue;                   // состояния виджетов не трогаем
        if (typeof v === 'string' && v.length < 8000 && OZ_RECS_CONT.test(v)) {
          if (!ozPaged || OZ_NEXT.test(v) || /^next/i.test(k)) { delete o[k]; ozNextKeys.push(p + k); }
          else if (ozSeen.length < 5) ozSeen.push(p + k);
        } else if (v && typeof v === 'object') ozNoMore(v, d + 1, p + k + '.');
      }
    })(data, 0, '');
    if (ozGone.length || ozNextKeys.length) {
      stats.removed += ozGone.length + ozNextKeys.length;
      stats.reasons['ozon-' + OZ_KIND + (OZ_BANK ? '-banner' : '-recs')] = ozGone.length;
      if (ozNextKeys.length) stats.reasons['ozon-next'] = ozNextKeys.join('/');
      stats.blocks.push('ozon-' + OZ_KIND + ':' + ozGone.join('+'));
    }
    if (DEBUG) log('OZON ' + OZ_PAGE_URL.slice(0, 70) + ': layout=' + ozLayoutLog.join(',').slice(0, 900) +
                   ' | removed=' + (ozGone.join(',') || '-') + ' | next-link=' + (ozNextKeys.join(',') || '-') +
                   (ozSeen.length ? ' | other-links=' + ozSeen.join(',') : '') + ' | top=' + Object.keys(data).join('/') +
                   (ozPromoLog.length ? ' | promo: ' + ozPromoLog.join(' ; ') : ''));
  }

  // ───────── маркеры рекламы ─────────
  var LABELS = { 'реклама': 1, 'ad': 1, 'ads': 1, 'advertisement': 1, 'sponsored': 1,
                 'спонсорский товар': 1, 'социальная реклама': 1, 'промо-реклама': 1 };
  var LABEL_PREFIX = /^(реклама|социальная реклама)[\s.,:;·|—-]/i;
  var ERID_TEXT = /(^|[^a-zа-яё])(erid|ерид)\s*[:=]\s*\S/i;
  var ERID_PARAM = /[?&](erid|ad_erid)=[^&\s]{4,}/i;
  var ADVERTISER = /рекламодател/i;
  var KEY_BOOL = isAvito ? null
    : /^(is_?)?(ad|adv|advert|advertising|advertisement|ads|sponsored|promoted|promo_?ad)$/i;
  var KEY_ADVERT_ID = isAvito ? null : /^(advertId|advert_id|advertID|advId|adv_id)$/;
  var KEY_ADINFO = isAvito ? null
    : /^(ad_?(label|marker|mark|disclaimer|badge)|adv_?(label|marker|info|badge)|advertiser(_?(info|name|data))?)$/i;
  var AVITO_TYPE = /banner|adfox|yandex_?ad|mytarget|dfp|^ads?$|^promo/i;

  // Ключ = набор слов (camelCase / snake_case): «adErid» -> [ad, erid]; «offerId» -> [offer, id]
  function keyHasWord(k, word) {
    var t = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase().split(/[^a-z0-9а-яё]+/);
    for (var i = 0; i < t.length; i++) if (t[i] === word) return true;
    return false;
  }

  function textReason(s) {
    if (typeof s !== 'string' || s.length > 400) return null;
    var t = s.trim();
    if (LABELS[t.toLowerCase()] && t !== 'AD') return 'label:' + t;
    if (LABEL_PREFIX.test(t)) return 'label-prefix';
    if (ERID_TEXT.test(t)) return 'erid-text';
    if (ERID_PARAM.test(t)) return 'erid-url';
    if (ADVERTISER.test(t)) return 'advertiser-text';
    return null;
  }

  var POCHTA_ADV = /\/specialoffers\/|adv\.get\.image/i;
  function leafReason(k, v) {
    if (v === null || v === undefined || v === false || v === '' || v === 0) return null;
    // ОРД-маркировка баннера (WB: ordBannerMark = «ООО …, ИНН …, ЕРИД …»)
    if (typeof v === 'string' && v.length > 3 && keyHasWord(k, 'ord') && (keyHasWord(k, 'mark') || keyHasWord(k, 'label') || keyHasWord(k, 'info')))
      return 'key:' + k;
    if (IS_POCHTA && typeof v === 'string' && POCHTA_ADV.test(v)) return 'pochta-adv';
    if (keyHasWord(k, 'erid') && (typeof v === 'string' ? v.length >= 4 : typeof v === 'number')) return 'key:' + k;
    if (KEY_BOOL && (v === true || v === 1) && KEY_BOOL.test(k)) return 'flag:' + k;
    if (KEY_ADVERT_ID && KEY_ADVERT_ID.test(k)) return 'key:' + k;
    if (KEY_ADINFO && KEY_ADINFO.test(k) && (typeof v === 'string' ? v.length > 0 : true)) return 'key:' + k;
    if (isAvito && typeof v === 'string' && /^(type|widgetType|widget_type|kind|viewType|view_type|template|component|layoutType)$/.test(k) && AVITO_TYPE.test(v)) return 'avito-type:' + v;
    return textReason(v);
  }

  // ───────── «есть ли картинка/видео» ─────────
  var VIS_KEY = /(image|img|picture|photo|video|banner|cover|background|thumb|poster|preview|media|lottie|gif)/i;
  var VIS_KEY_EXCL = /(colou?r|style|tint|alpha|size|width|height|radius|border|type|position|align|mode|scale|ratio|aspect|opacity|count|enabled|visible|hidden|text|title)/i;
  var IMG_URL = /^https?:\/\/\S+(\.(jpe?g|png|webp|gif|avif|heic|svg|mp4|webm|m3u8|mov)(\?|#|$)|avatars\.mds\.yandex\.net|\/get-[a-z]|ir\.ozone\.ru|img\.avito\.st|wbbasket\.ru|geobasket\.ru|wbstatic)/i;
  var VIS_TYPE = /^(image|remote_image|video|gif|picture|lottie|animation|banner)$/i;
  var visMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function hasVisual(root) {
    if (visMemo && visMemo.has(root)) return visMemo.get(root);
    var stack = [root], budget = 5000, found = false;
    while (stack.length && budget-- > 0 && !found) {
      var n = stack.pop();
      if (Array.isArray(n)) {
        for (var i = 0; i < n.length; i++) {
          var x = n[i];
          if (typeof x === 'string') { if (IMG_URL.test(x)) { found = true; break; } }
          else if (x && typeof x === 'object') stack.push(x);
        }
      } else if (n && typeof n === 'object') {
        if (typeof n.type === 'string' && VIS_TYPE.test(n.type)) { found = true; break; }
        for (var k in n) {
          var v = n[k];
          if (typeof v === 'string') {
            if (IMG_URL.test(v) || (VIS_KEY.test(k) && !VIS_KEY_EXCL.test(k) && v.length >= 3 && !/\s/.test(v))) { found = true; break; }
          } else if (v && typeof v === 'object') stack.push(v);
        }
      }
    }
    if (visMemo) visMemo.set(root, found);
    return found;
  }

  var sizeMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  function size(x) {
    if (sizeMemo && x && typeof x === 'object' && sizeMemo.has(x)) return sizeMemo.get(x);
    var s = 0; try { s = JSON.stringify(x).length; } catch (e) {}
    if (sizeMemo && x && typeof x === 'object') sizeMemo.set(x, s);
    return s;
  }

  // ───────── вложенный JSON в строках (Ozon widgetStates): раскрыть -> обработать -> собрать ─────────
  var hydrated = []; // [{owner, key, obj}] в порядке раскрытия (внешние раньше)
  var hydratedSet = typeof WeakSet === 'function' ? new WeakSet() : null;
  function looksJSON(s) {
    if (typeof s !== 'string' || s.length < 20) return false;
    var a = s.charAt(0), z = s.charAt(s.length - 1);
    return (a === '{' && z === '}') || (a === '[' && z === ']');
  }
  function hydrate(node, depth) {
    if (depth > 60 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) hydrate(node[i], depth + 1); return; }
    for (var k in node) {
      var v = node[k];
      if (looksJSON(v)) {
        var p; try { p = JSON.parse(protectBig(v)); } catch (e) { p = null; }
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          node[k] = p; hydrated.push({ owner: node, key: k, obj: p });
          if (hydratedSet) hydratedSet.add(p);
          hydrate(p, depth + 1);
          continue;
        }
      }
      if (v && typeof v === 'object') hydrate(v, depth + 1);
    }
  }
  hydrate(data, 0);
  if (DEBUG && PROBE) probe();
  function isHydrated(o) { return hydratedSet ? hydratedSet.has(o) : false; }

  // ───────── Яндекс Go: лента плиток целиком ─────────
  // ui.sections[] — секции главного экрана. Лента = секция, где ≥2 плиток с картинкой и действием
  // «открыть товар/ресторан» (tap_product, /card/, eats…), либо секция с типом products_widget/GoFeed/feed.
  var GO_TILE_ACTION = /tap_product|tap_place|tap_restaurant|%2Fcard%2F|\/card\/|place_slug|restaurant|eats[^"]{0,60}(place|slug|restaurant)/i;
  function isGoFeedSection(sec) {
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) return false;
    var tag = [sec.type, sec.origType, sec.customType, sec.id].filter(function (x) { return typeof x === 'string'; }).join(' ');
    if (/products_widget|GoFeed|(^|[\s_:.-])feed($|[\s_:.-])/i.test(tag)) return true;
    var content = sec.content;
    if (!Array.isArray(content) || content.length < 2) return false;
    var tiles = 0;
    for (var j = 0; j < content.length; j++) {
      var it = content[j];
      if (!it || typeof it !== 'object') continue;
      var acts = '';
      try { acts = JSON.stringify(it.actions || {}); } catch (e) {}
      if (/service_shortcut/i.test(acts)) return false; // кнопки сервисов (Такси, Еда, Лавка…) — это навигация
      if (GO_TILE_ACTION.test(acts) && hasVisual(it)) tiles++;
    }
    return tiles >= 2;
  }
  if (GO_LAYOUT && data && data.ui && Array.isArray(data.ui.sections)) {
    var secs = data.ui.sections, keepSecs = [], feedIdx = [];
    for (var si = 0; si < secs.length; si++) { if (isGoFeedSection(secs[si])) feedIdx.push(si); else keepSecs.push(secs[si]); }
    if (feedIdx.length) {
      if (keepSecs.length) {
        // главный экран: секции ленты убираем, поиск/адреса/навигация остаются
        for (var fi = 0; fi < feedIdx.length; fi++) stats.blockBytes += size(secs[feedIdx[fi]]);
        data.ui.sections = keepSecs;
      } else {
        // ответ-страница ленты: секцию оставляем, но без плиток
        for (var fj = 0; fj < feedIdx.length; fj++) {
          var fs = secs[feedIdx[fj]];
          if (Array.isArray(fs.content)) { stats.blockBytes += size(fs.content); fs.content = []; }
        }
      }
      stats.removed += feedIdx.length;
      stats.reasons['go-feed'] = feedIdx.length;
      stats.blocks.push('go-feed:' + feedIdx.join('/') + (keepSecs.length ? '' : ' (emptied)'));
    }
  }

  function strip(node, depth) {
    if (depth > 60 || !node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) if (node[i] && typeof node[i] === 'object') { stats.removed += node.length; stats.bytes += size(node); return []; }
      return node;
    }
    for (var k in node) node[k] = strip(node[k], depth + 1);
    return node;
  }
  if (STRIP) { data = strip(data, 0); stats.reasons['strip'] = stats.removed; }

  // ───────── проход 1: найти маркеры и выбрать, что удалять ─────────
  // unit = элемент массива (объект) или раскрытое JSON-значение; только их можно удалять
  var targets = [];        // {kind:'arr'|'json', parent, key, node, units, idx, pathStr}
  var targetNodes = typeof Set === 'function' ? new Set() : null;
  var stepStack = [];      // [{parent, key, node, unit, kind}]
  var rootHits = [];       // маркеры вне любого списка (метка на весь ответ)

  function pathString(steps) {
    var s = '';
    for (var i = 0; i < steps.length; i++) s += typeof steps[i].key === 'number' ? '[' + steps[i].key + ']' : '.' + steps[i].key;
    return s.length > 90 ? '…' + s.slice(-89) : s;
  }

  function onHit(reason, leafStep) {
    stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
    var steps = leafStep ? stepStack.concat([leafStep]) : stepStack.slice();
    var units = [];
    for (var i = steps.length - 1; i >= 0; i--) if (steps[i].unit) units.push(steps[i]);
    if (!units.length) { rootHits.push(reason); return; }
    var pick = 0, capBlocked = false;
    if (!hasVisual(units[0].node)) {
      for (var j = 1; j < units.length && j <= 8; j++) {
        var sz = size(units[j].node);
        if ((sz > TOTAL * CLIMB_CAP && sz > 3000) || (!RELAXED && sz > 200000)) { capBlocked = hasVisual(units[j].node); break; }
        if (hasVisual(units[j].node)) { pick = j; break; }
      }
    }
    // карточка с картинкой слишком большая, а без неё удалилась бы только надпись «Реклама» — не трогаем
    if (pick === 0 && capBlocked) { stats.reasons['skip-label-only'] = (stats.reasons['skip-label-only'] || 0) + 1; return; }
    var u = units[pick];
    if (targetNodes && targetNodes.has(u.node)) return;
    if (targetNodes) targetNodes.add(u.node);
    targets.push({ kind: u.kind, parent: u.parent, key: u.key, node: u.node, units: units, idx: pick,
                   pathStr: pathString(steps.slice(0, steps.indexOf(u) + 1)) });
  }

  // Целый блок по типу (лента Go): удаляем ближайший элемент списка, который его содержит
  function onBlock(typeName) {
    var u = null;
    for (var i = stepStack.length - 1; i >= 0; i--) if (stepStack[i].unit) { u = stepStack[i]; break; }
    if (!u) { stats.blocks.push(typeName + ':no-list'); return false; }
    // не удаляем, если после удаления от ответа ничего не останется (значит, это и есть весь экран)
    if (TOTAL - size(u.node) < 200) { stats.blocks.push(typeName + ':whole-response'); return false; }
    if (targetNodes && targetNodes.has(u.node)) return true;
    if (targetNodes) targetNodes.add(u.node);
    var units = [];
    for (var j = stepStack.length - 1; j >= 0; j--) if (stepStack[j].unit) units.push(stepStack[j]);
    targets.push({ kind: u.kind, parent: u.parent, key: u.key, node: u.node, units: units, idx: 0, block: true,
                   pathStr: pathString(stepStack.slice(0, stepStack.indexOf(u) + 1)) + ' (' + typeName + ')' });
    stats.reasons['block:' + typeName] = (stats.reasons['block:' + typeName] || 0) + 1;
    return true;
  }

  function scan(node, depth) {
    if (depth > 80) return;
    if (BLOCK_TYPE && !Array.isArray(node) && typeof node.type === 'string' && BLOCK_TYPE.test(node.type)) {
      if (onBlock(node.type)) return;
    }
    if (AVITO_BLOCK_KEY && !Array.isArray(node)) {
      for (var bk in node) {
        if (AVITO_BLOCK_KEY.test(bk) && node[bk] && typeof node[bk] === 'object') { if (onBlock(bk)) return; }
      }
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var ch = node[i];
        if (typeof ch === 'string') {
          var r = textReason(ch) || (IS_POCHTA && POCHTA_ADV.test(ch) ? 'pochta-adv' : null);
          if (r) onHit(r, null);
        } else if (ch && typeof ch === 'object') {
          stepStack.push({ parent: node, key: i, node: ch, unit: !Array.isArray(ch), kind: 'arr' });
          scan(ch, depth + 1);
          stepStack.pop();
        }
      }
      return;
    }
    for (var k in node) {
      var v = node[k];
      if (v && typeof v === 'object') {
        var hyd = isHydrated(v);
        stepStack.push({ parent: node, key: k, node: v, unit: hyd, kind: hyd ? 'json' : 'obj' });
        scan(v, depth + 1);
        stepStack.pop();
      } else {
        var rr = leafReason(k, v);
        if (rr) onHit(rr, null);
      }
    }
  }
  // WB: слоты, где пустой список = запасной баннер приложения. Запоминаем исходный первый баннер.
  var WB_SLOT = /^(topSliderNF|searchSliderNF|bannersLKNF|bannersDeliveryNF)$/;
  var WB_BLANK_URL = 'https://banners-bt.wildberries.ru/_ruadb/blank.png';
  var wbSlots = [];
  if (IS_WB_BANNERS && data && typeof data === 'object') {
    var holders = [data]; if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) holders.push(data.data);
    holders.forEach(function (h) {
      for (var sk in h) if (WB_SLOT.test(sk) && Array.isArray(h[sk]) && h[sk].length && h[sk][0] && typeof h[sk][0] === 'object')
        wbSlots.push({ holder: h, key: sk, n: h[sk].length, proto: JSON.parse(JSON.stringify(h[sk][0])) });
    });
  }
  function wbInvisible(o, k, d) {
    if (d > 6) return o;
    if (Array.isArray(o)) return [];
    if (o && typeof o === 'object') {
      var out = {};
      for (var kk in o) {
        if (/^html(Data|Src)$/i.test(kk)) continue;              // HTML-баннер -> делаем обычным картинкой
        if (/^(advParams|ordBannerMark)$/.test(kk)) { out[kk] = ''; continue; } // как у нерекламных баннеров
        out[kk] = wbInvisible(o[kk], kk, d + 1);
      }
      return out;
    }
    if (typeof o === 'string') {
      if (/^src$/i.test(k)) return WB_BLANK_URL;
      if (/^srcPath$/i.test(k)) return '/_ruadb/blank.png';
      if (/time|date/i.test(k)) return o;                          // даты не ломаем
      return '';
    }
    return o;                                                      // числа/булевы как есть
  }

  // AliExpress: полка «Товары от партнеров» (p4p-only-shelf — только оплаченные показы) и рекомендации корзины -> пусто
  if (IS_ALI && /\/recommend\/(v\d+\/p4p-only-shelf|shopping-cart\/v\d+)$/.test(path) && data && data.data &&
      Array.isArray(data.data.items) && data.data.items.length) {
    stats.blockBytes += size(data.data.items); stats.removed += data.data.items.length;
    stats.reasons['ae-recs-empty'] = data.data.items.length; data.data.items = [];
  }

  // AliExpress, главная (mobile-layout/home/fusion): полка плиток под иконками категорий — «Звёздные купоны» и витрины
  // брендов (baseus, 70mai, OnePlus…). Это виджет главной со списком state.data.stories (в логе v3.17 — 18 плиток);
  // убирается весь виджет. Иконки категорий (diamonds), вкладки и лента «Для вас» не трогаются.
  if (IS_ALI && /^\/mobile-layout\/home\/fusion$/.test(path) && data && data.layout && Array.isArray(data.layout.widgetInstances)) {
    var aeHomeGone = [], aeHomeAll = [];
    data.layout.widgetInstances.forEach(function (wi) {
      var ch = wi && wi.children;
      if (!Array.isArray(ch)) return;
      for (var i = ch.length - 1; i >= 0; i--) {
        var w = ch[i], sd = w && w.state && w.state.data;
        var nm = w && typeof w.name === 'string' ? w.name : '?';
        if (sd && typeof sd === 'object' && Array.isArray(sd.stories) && sd.stories.length) {
          stats.blockBytes += size(w); stats.removed++;
          aeHomeGone.push(nm + '(' + sd.stories.length + ')'); ch.splice(i, 1);
          continue;
        }
        if (DEBUG) aeHomeAll.unshift(nm + (sd && typeof sd === 'object' && !Array.isArray(sd) ? '[' + Object.keys(sd).slice(0, 6).join('/') + ']' : ''));
      }
    });
    if (aeHomeGone.length) { stats.reasons['ae-home-stories'] = aeHomeGone.length; stats.blocks.push('ae-home:' + aeHomeGone.join('+')); }
    if (DEBUG) log('AE home: removed ' + (aeHomeGone.join(',') || '-') + ' | other widgets: ' + (aeHomeAll.join(',') || '-').slice(0, 1200));
  }

  // Яндекс Go, экран доставки (cargo-c2c/…/delivery/state): рекламный баннер («Реклама», под кнопками Route / Help / Play) —
  // элемент экрана с type=urban-ads (саму рекламу приложение берёт из 4.0/urbanads/…). Убирается ближайший к нему
  // элемент списка (сам виджет или его обёртка, не больше 30% ответа); остальной экран не трогается.
  if (GO_DELIVERY && data && typeof data === 'object') {
    var uaHits = [], uaLog = [];
    (function uaWalk(n, d, st) {
      if (d > 40 || !n || typeof n !== 'object') return;
      var arr = Array.isArray(n), ks = arr ? null : Object.keys(n), len = arr ? n.length : ks.length;
      for (var i = 0; i < len; i++) {
        var k = arr ? i : ks[i], v = n[k];
        if (!v || typeof v !== 'object') continue;
        st.push({ parent: n, key: k, node: v, inArr: arr });
        if (!Array.isArray(v) && typeof v.type === 'string' && /^urban[-_]?ads?$/i.test(v.type)) uaHits.push(st.slice());
        else uaWalk(v, d + 1, st);
        st.pop();
      }
    })(data, 0, []);
    uaHits.forEach(function (stk) {
      for (var j = stk.length - 1; j >= 0; j--) if (stk[j].inArr) {
        var u = stk[j], at = u.parent.indexOf(u.node), sz = size(u.node);
        if (at < 0) return;
        if (sz > TOTAL * 0.3) { uaLog.push(pathString(stk.slice(0, j + 1)) + ' too-big ' + sz + 'b'); return; }
        var nb = [];
        for (var q = Math.max(0, at - 2); q <= Math.min(u.parent.length - 1, at + 2); q++) {
          var el = u.parent[q]; nb.push(q === at ? '*' : String((el && typeof el === 'object' && (el.type || el.id)) || '?').slice(0, 30));
        }
        u.parent.splice(at, 1); stats.removed++; stats.blockBytes += sz;
        uaLog.push(pathString(stk.slice(0, j + 1)) + ' (' + sz + 'b; around: ' + nb.join(',') + ')');
        return;
      }
      uaLog.push('no list around ' + pathString(stk));
    });
    if (uaHits.length) stats.reasons['go-urban-ads'] = uaHits.length;
    if (DEBUG) log('GO delivery: urban-ads ' + (uaLog.join(' ; ') || 'not found'));
  }

  // Яндекс Маркет: лента рекомендаций = секция FeedboxSection. В избранном это «Достойны сердечка», в корзине —
  // «Может пригодиться» (заголовок лежит в shared.divData.feedbox_header…, сама лента — в этой секции). Секция убирается.
  if (IS_YM && /\/api\/screen\/(favourites|cart)$/.test(path) && data && typeof data === 'object') {
    var ymGone = [], ymSecs = null;
    (function ymWalk(n, d) {
      if (d > 8 || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        var isSecList = false;
        for (var i = 0; i < n.length && i < 100; i++) if (n[i] && typeof n[i].type === 'string' && /[a-z]Section$/.test(n[i].type)) { isSecList = true; break; }
        if (isSecList) {
          if (!ymSecs) ymSecs = n.map(function (x) { return x && typeof x === 'object' ? String(x.type || '?') + '(' + size(x) + ')' : '?'; }).join(',');
          for (var j = n.length - 1; j >= 0; j--) if (n[j] && n[j].type === 'FeedboxSection') {
            stats.blockBytes += size(n[j]); ymGone.push('FeedboxSection(' + size(n[j]) + ')'); n.splice(j, 1);
          }
          return;
        }
        for (var q = 0; q < n.length && q < 100; q++) ymWalk(n[q], d + 1);
        return;
      }
      for (var k in n) ymWalk(n[k], d + 1);
    })(data, 0);
    if (ymGone.length) { stats.removed += ymGone.length; stats.reasons['ym-feedbox'] = ymGone.length; stats.blocks.push('ym:' + ymGone.join('+')); }
    if (DEBUG) log('YM sections: ' + (ymSecs || '-').slice(0, 800) + ' | removed: ' + (ymGone.join(',') || '-'));
  }

  // ───────── общие помощники (WB Кошелёк) ─────────
  // обход всех строк; st — цепочка предков [{parent, key, node, inArr}] (живая: сохранять копией)
  function eachString(root, fn) {
    var st = [];
    (function walk(n, d) {
      if (d > 60 || !n || typeof n !== 'object') return;
      var arr = Array.isArray(n), ks = arr ? null : Object.keys(n), len = arr ? n.length : ks.length;
      for (var i = 0; i < len; i++) {
        var k = arr ? i : ks[i], v = n[k];
        if (typeof v === 'string') fn(v, st, k);
        else if (v && typeof v === 'object') { st.push({ parent: n, key: k, node: v, inArr: arr }); walk(v, d + 1); st.pop(); }
      }
    })(root, 0);
  }
  // ближайший (снизу) шаг цепочки, который — объект-элемент списка
  function listItemAt(st, from) {
    for (var i = from; i >= 0; i--) if (st[i].inArr && !Array.isArray(st[i].node)) return i;
    return -1;
  }
  // короткая подпись элемента для лога: первый заголовок/текст
  function firstText(o) {
    var t = '';
    eachString(o, function (s, st, k) {
      if (!t && typeof k === 'string' && /title|header|name|text|label|caption/i.test(k) && s.length <= 60 && !/^https?:|^\w+:\/\//.test(s)) t = s;
    });
    return t;
  }
  // после изменения узла сбросить запомненные размер и «есть ли картинка»
  function fresh(x) { if (visMemo) visMemo['delete'](x); if (sizeMemo) sizeMemo['delete'](x); }

  // ───────── WB Кошелёк: промо-карусель Банка («Накопительный счёт» и соседние карточки) ─────────
  // Экран Кошелька получает данные с finance.wb.ru / wb-wallet.wildberries.ru. Карточки карусели — промо CRM Банка: их
  // картинки лежат в папке bi-crm-… (static-basket-03.wbbasket.ru/vol46/bi-crm-wb-bank/<id>.png — в логе v3.14).
  // Карточка = наименьший элемент списка со ссылкой на такую картинку. Убираются только карточки из списков, где ВСЕ
  // элементы такие (карусель, а не список виджетов/плиток), каждая не больше 8 КБ и без сумм («0 ₽», amount/balance).
  // Опустевший список -> убирается и элемент, в котором он лежит, если от него осталась пустая рамка (до 3 КБ, без
  // картинок). Баланс, кнопки, «Savings», «Loans» не трогаются; общий поиск рекламы на этих хостах не запускается.
  var WB_CRM_IMG = /(^|\/)bi-crm-[\w-]+\//i;
  var MONEY_KEY = /(^|[a-z_])(balance|amount|sum)$/i;
  var MONEY_STR = /^[\d\s.,]*\d[\d\s.,]*(₽|руб\.?|rub)$/i;   // \s в JS включает и неразрывные пробелы
  function hasMoney(o) {
    var found = false;
    (function walk(n, d) {
      if (found || d > 10 || !n || typeof n !== 'object') return;
      var arr = Array.isArray(n), ks = arr ? null : Object.keys(n), len = arr ? n.length : ks.length;
      for (var i = 0; i < len && !found; i++) {
        var k = arr ? '' : ks[i], v = arr ? n[i] : n[k];
        if (typeof v === 'string') found = MONEY_STR.test(v.trim()) || (MONEY_KEY.test(k) && /^-?\d+([.,]\d+)?$/.test(v));
        else if (typeof v === 'number') found = MONEY_KEY.test(k);
        else walk(v, d + 1);
      }
    })(o, 0);
    return found;
  }
  // Карусель на главной Кошелька приходит отдельным ответом offers-api (…/api/offers-api/v1/product/offers, в логе v3.15):
  // {offers: {<место показа>: [предложения]}}; карусель — BANNER_CAROUSEL_MAIN_SCREEN (карточки с пометкой «Реклама»),
  // рекламные строки в списке банков при переводе — BANNER_MIMICRY_…. Все места BANNER_* -> пустые списки; в остальных
  // местах убираются только предложения с пометкой «Реклама» (content.disclaimer).
  if (IS_WB_FIN && /\/offers-api\/v\d+\/product\/offers$/.test(path) && data && data.offers && typeof data.offers === 'object' &&
      !Array.isArray(data.offers)) {
    var wbOff = [];
    for (var pk in data.offers) {
      var pl = data.offers[pk];
      if (!Array.isArray(pl) || !pl.length) continue;
      if (/^BANNER_/i.test(pk)) {
        stats.blockBytes += size(pl); stats.removed += pl.length; wbOff.push(pk + ':' + pl.length); data.offers[pk] = [];
        continue;
      }
      var plKeep = [];
      for (var oi = 0; oi < pl.length; oi++) {
        var disc = pl[oi] && pl[oi].content && pl[oi].content.disclaimer;
        if (textReason(disc && typeof disc === 'object' ? disc.text : disc)) { stats.removed++; continue; }
        plKeep.push(pl[oi]);
      }
      if (plKeep.length !== pl.length) { wbOff.push(pk + ':' + (pl.length - plKeep.length) + ' ad'); data.offers[pk] = plKeep; }
    }
    if (wbOff.length) { stats.reasons['wb-offers'] = wbOff.join(','); stats.blocks.push('wb-offers'); }
    if (DEBUG) log('WBFIN offers: ' + Object.keys(data.offers).join(',').slice(0, 600) + ' | emptied: ' + (wbOff.join(', ') || '-'));
  }
  if (IS_WB_FIN && data && typeof data === 'object') {
    var crmCards = [], crmSeen = [], crmLog = [], crmDirs = {};
    eachString(data, function (s, st, k) {
      if (DEBUG) {
        var dm = s.match(/\/(vol\d+\/[\w.-]+)\/[^\/?#]*\.(png|jpe?g|webp|gif|svg|json)(\?|#|$)/i);
        if (dm) crmDirs[dm[1]] = (crmDirs[dm[1]] || 0) + 1;
      }
      if (!WB_CRM_IMG.test(s)) return;
      var ci = listItemAt(st, st.length - 1);
      if (ci < 0) { if (crmLog.length < 6) crmLog.push('not-in-list ' + pathString(st) + '.' + k); return; }
      if (crmSeen.indexOf(st[ci].node) !== -1) return;
      crmSeen.push(st[ci].node);
      crmCards.push(st.slice(0, ci + 1));
    });
    // карточки по спискам
    var crmLists = [];
    crmCards.forEach(function (cs) {
      var step = cs[cs.length - 1];
      for (var a = 0; a < crmLists.length; a++) if (crmLists[a].arr === step.parent) { crmLists[a].cards.push(step.node); return; }
      crmLists.push({ arr: step.parent, cards: [step.node], up: cs.slice(0, cs.length - 1) });
    });
    var crmGone = 0;
    crmLists.forEach(function (g) {
      var arr = g.arr, where = pathString(g.up) || '(root)', objs = 0, i;
      for (i = 0; i < arr.length; i++) if (arr[i] && typeof arr[i] === 'object' && !Array.isArray(arr[i])) objs++;
      if (g.cards.length < objs) {
        var other = [];
        for (i = 0; i < arr.length && other.length < 4; i++) if (g.cards.indexOf(arr[i]) === -1) other.push('«' + (firstText(arr[i]) || '?') + '»');
        crmLog.push(where + ': mixed ' + g.cards.length + '/' + objs + ' -> keep (other: ' + other.join(',') + ')');
        return;
      }
      for (i = 0; i < g.cards.length; i++) {
        var csz = size(g.cards[i]);
        if (csz > 8000) { crmLog.push(where + ': card ' + csz + 'b too big -> keep'); return; }
        if (hasMoney(g.cards[i])) { crmLog.push(where + ': «' + (firstText(g.cards[i]) || '?') + '» has amounts -> keep'); return; }
      }
      var names = [];
      for (i = 0; i < g.cards.length; i++) {
        var at = arr.indexOf(g.cards[i]);
        if (at < 0) continue;
        names.push(firstText(g.cards[i]) || '?');
        stats.blockBytes += size(g.cards[i]); arr.splice(at, 1); stats.removed++; crmGone++;
      }
      var msg = where + ': -' + names.length + ' «' + names.join('», «') + '»';
      // список опустел -> элемент, в котором он лежит напрямую (и сам — элемент списка), если это пустая рамка
      var up = g.up, lvl = 0;
      while (arr.length === 0 && lvl++ < 3 && up.length >= 2) {
        var arrStep = up[up.length - 1], wrapStep = up[up.length - 2];
        if (!wrapStep.inArr || wrapStep.node !== arrStep.parent || Array.isArray(wrapStep.node)) break;
        var w = wrapStep.node;
        fresh(w);
        var wsz = size(w);
        if (wsz > 3000 || hasVisual(w)) { msg += ' | wrapper kept (' + wsz + 'b' + (hasVisual(w) ? ', has images' : '') + ')'; break; }
        var wat = wrapStep.parent.indexOf(w);
        if (wat < 0) break;
        wrapStep.parent.splice(wat, 1); stats.blockBytes += wsz; stats.removed++;
        msg += ' +wrapper ' + pathString(up.slice(0, up.length - 1)) + ' (' + wsz + 'b)';
        arr = wrapStep.parent; up = up.slice(0, up.length - 2);
      }
      crmLog.push(msg);
    });
    if (crmGone) { stats.reasons['wb-wallet-promo'] = crmGone; stats.blocks.push('wb-wallet:crm'); }
    if (DEBUG) {
      var dirs = []; for (var dk in crmDirs) dirs.push(dk + '×' + crmDirs[dk]);
      log('WBFIN crm: ' + (crmLog.join(' ; ') || 'no bi-crm images') + ' | img dirs: ' + (dirs.join(', ') || '-'));
    }
  }

  if (!STRIP && !POCHTA_BANNERS && !IS_WB_FIN) scan(data, 0);

  // ───────── Блоки-рекомендации по заголовку ─────────
  // AliExpress, профиль (mobile-layout/profile) и корзина (mobile-layout/shopcartFusion): блок = виджет (объект с uuid+name
  //   в списке children, не корень страницы); «Товары от партнеров», «Вы смотрели», «Одна цена», «Рекомендуем вам»,
  //   а также виджеты рекомендаций по имени (…Recommend…, …Waterfall…, …P4p…). Пункты меню профиля не трогаются.
  // Яндекс Маркет, избранное и корзина (api/screen/favourites|cart): блок = секция экрана (type …Section):
  //   «Достойны сердечка», «Может пригодиться».
  // Avito, избранное (favorites/items/widgets): «Похожие объявления».
  var TB = null, tbLog = [];
  if (IS_ALI && /^\/mobile-layout\/(profile|shopcartFusion)$/.test(path))
    TB = { tag: 'AE', maxFrac: 0.95,
           titles: /^(рекомендуем вам|товары от партн[её]ров|вы смотрели|одна цена)[.:!]?$/i,
           keep: /служба поддержки|справка aliexpress|настройки и данные|купоны|мои отзывы|вопросы и ответы|награда каждый день|мои заказы/i,
           nameRe: /(Recommend|Recs(?![a-z])|Waterfall|P4p|P4P)/,
           isBlock: function (st) { var n = st.node; return st.inArr && st.arrKey === 'children' && n && typeof n.uuid === 'string' && typeof n.name === 'string'; } };
  else if (isAvito && /\/favorites\/items\/(widgets|list)$/.test(path))
    TB = { tag: 'AV', maxFrac: 1.01, allowWhole: true, titles: /^похожие объявления$/i, keep: null,
           isBlock: function (st) { return st.inArr && st.node && typeof st.node === 'object' && !Array.isArray(st.node) && hasVisual(st.node); } };
  if (TB && data && typeof data === 'object') {
    var tbStack = [], tbHits = [], tbNamed = [], tbNames = [];
    var tbNorm = function (x) { return String(x).replace(/\s+/g, ' ').trim(); };
    (function tbWalk(n, d, arrKey) {
      if (d > 60 || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        for (var i = 0; i < n.length; i++) {
          var c = n[i];
          if (c && typeof c === 'object') {
            var st = { parent: n, key: i, node: c, inArr: true, arrKey: arrKey, unit: !Array.isArray(c), kind: 'arr' };
            tbStack.push(st);
            if (TB.nameRe && TB.isBlock(st)) {
              if (TB.nameRe.test(c.name)) tbNamed.push(tbStack.slice());
              if (DEBUG && tbNames.length < 60) tbNames.push(c.name);
            }
            tbWalk(c, d + 1, null);
            tbStack.pop();
          } else if (typeof c === 'string' && c.length < 60 && TB.titles.test(tbNorm(c))) {
            tbHits.push({ title: tbNorm(c), stack: tbStack.slice(), path: pathString(tbStack), holder: n, key: i });
          }
        }
        return;
      }
      for (var k in n) {
        var v = n[k];
        if (typeof v === 'string') {
          if (v.length < 60 && TB.titles.test(tbNorm(v))) tbHits.push({ title: tbNorm(v), stack: tbStack.slice(), path: pathString(tbStack) + '.' + k, holder: n, key: k });
        } else if (v && typeof v === 'object') {
          tbStack.push({ parent: n, key: k, node: v, inArr: false, arrKey: null, unit: false, kind: 'obj' });
          tbWalk(v, d + 1, Array.isArray(v) ? k : null);
          tbStack.pop();
        }
      }
    })(data, 0, null);
    var tbChoose = function (stack) {
      for (var j = stack.length - 1; j >= 0; j--) if (TB.isBlock(stack[j])) {
        var b = j;
        if (TB.tag === 'AE') {
          // блок внутри небольшого виджета-контейнера (заголовок + карусель, до 3 виджетов) -> убираем контейнер
          // целиком, иначе остаётся карусель без заголовка или пустая рамка. Контейнер с пунктами профиля — нет.
          for (;;) {
            var par = -1;
            for (var q = b - 1; q >= 0; q--) if (TB.isBlock(stack[q])) { par = q; break; }
            if (par < 0 || stack[par].node.children !== stack[b].parent || stack[b].parent.length > 3) break;
            var pj = ''; try { pj = JSON.stringify(stack[par].node); } catch (e) {}
            if (TB.keep.test(pj) || size(stack[par].node) > TOTAL * 0.5) break;
            b = par;
          }
        }
        return b;
      }
      return -1;
    };
    var tbAdd = function (stack, b, title, why) {
      var st = stack[b], sz = size(st.node);
      if (sz > TOTAL * TB.maxFrac) { tbLog.push('«' + title + '» too-big ' + sz + 'b'); return false; }
      if (!TB.allowWhole && TOTAL - sz < 200) { tbLog.push('«' + title + '» whole-response'); return false; }
      if (TB.keep) { var js = ''; try { js = JSON.stringify(st.node); } catch (e) {} if (TB.keep.test(js)) { tbLog.push('«' + title + '» keep (profile menu inside)'); return false; } }
      if (targetNodes && targetNodes.has(st.node)) return true;
      if (targetNodes) targetNodes.add(st.node);
      var units = []; for (var u = b; u >= 0; u--) if (stack[u].inArr) units.push(stack[u]);
      targets.push({ kind: 'arr', parent: st.parent, key: st.key, node: st.node, units: units, idx: 0, block: true,
                     pathStr: TB.tag + ' «' + title + '» ' + why });
      stats.reasons[TB.tag.toLowerCase() + '-block'] = (stats.reasons[TB.tag.toLowerCase() + '-block'] || 0) + 1;
      tbLog.push('«' + title + '» ' + why + ' ' + pathString(stack.slice(0, b + 1)) + ' (' + sz + 'b' +
                 (st.node.name ? ' ' + st.node.name : st.node.type ? ' ' + st.node.type : '') + ')');
      return true;
    };
    // заголовок в маленьком элементе, а товары — в следующем элементе того же списка -> убрать оба
    var tbWithNext = function (stack, b, title) {
      var st = stack[b];
      if (hasVisual(st.node) || size(st.node) > 4000 || !Array.isArray(st.parent)) return;
      var sib = st.parent[st.key + 1];
      if (!sib || typeof sib !== 'object' || Array.isArray(sib) || !hasVisual(sib)) return;
      var sibStep = { parent: st.parent, key: st.key + 1, node: sib, inArr: true, arrKey: st.arrKey, unit: true, kind: 'arr' };
      if (TB.tag !== 'AV' && !TB.isBlock(sibStep)) return;
      tbAdd(stack.slice(0, b).concat([sibStep]), b, title, 'next');
    };
    tbHits.forEach(function (h) {
      var b = tbChoose(h.stack);
      if (b >= 0) { if (tbAdd(h.stack, b, h.title, 'block')) tbWithNext(h.stack, b, h.title); return; }
      // AliExpress: заголовок «Рекомендуем вам» у корзины лежит только в переводах -> пустая строка
      if (TB.tag === 'AE' && /i18n/.test(h.path) && typeof h.key === 'string' && /rec/i.test(h.key)) {
        h.holder[h.key] = ''; stats.removed++; stats.reasons['ae-title-off'] = (stats.reasons['ae-title-off'] || 0) + 1;
        tbLog.push('«' + h.title + '» i18n ' + h.key + ' -> ""'); return;
      }
      // Avito: заголовок — отдельный элемент списка избранного; всё, что идёт после него, — похожие объявления
      if (TB.tag === 'AV') {
        for (var j = h.stack.length - 1; j >= 0; j--) if (h.stack[j].inArr) {
          var hs = h.stack[j], arr = hs.parent, cnt = 0, outer = [];
          for (var u = j - 1; u >= 0; u--) if (h.stack[u].inArr) outer.push(h.stack[u]);
          if (size(hs.node) > 2000 || !Array.isArray(arr)) { if (tbAdd(h.stack, j, h.title, 'title')) tbWithNext(h.stack, j, h.title); return; }
          for (var x = hs.key; x < arr.length; x++) {
            var el = arr[x];
            if (!el || typeof el !== 'object' || (targetNodes && targetNodes.has(el))) continue;
            if (targetNodes) targetNodes.add(el);
            var st2 = { parent: arr, key: x, node: el, inArr: true, unit: true, kind: 'arr' };
            targets.push({ kind: 'arr', parent: arr, key: x, node: el, units: [st2].concat(outer), idx: 0, block: true, pathStr: 'AV «' + h.title + '» tail' });
            cnt++;
          }
          stats.reasons['av-block'] = (stats.reasons['av-block'] || 0) + cnt;
          tbLog.push('«' + h.title + '» title+tail ' + pathString(h.stack.slice(0, j + 1)) + ' -> ' + cnt + ' items (of ' + arr.length + ')');
          return;
        }
      }
      tbLog.push('«' + h.title + '» no-block ' + h.path);
    });
    // Avito: рекламные места в списке избранного (banner: {list: [{avito|buzzoola: {bannerCode…}}]}) -> убрать
    if (TB.tag === 'AV') (function avSlots(n, d) {
      if (d > 4 || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        for (var i = 0; i < n.length; i++) {
          var el = n[i];
          if (el && typeof el === 'object' && !Array.isArray(el) && el.banner && typeof el.banner === 'object') {
            var bj = ''; try { bj = JSON.stringify(el.banner); } catch (e) {}
            if (/bannerCode|advRequestId/.test(bj) && !(targetNodes && targetNodes.has(el))) {
              if (targetNodes) targetNodes.add(el);
              targets.push({ kind: 'arr', parent: n, key: i, node: el, units: [{ parent: n, key: i, node: el, inArr: true, unit: true, kind: 'arr' }], idx: 0, block: true, pathStr: 'AV ad-slot' });
              stats.reasons['av-ad-slot'] = (stats.reasons['av-ad-slot'] || 0) + 1;
              continue;
            }
          }
          avSlots(el, d + 1);
        }
        return;
      }
      for (var k in n) avSlots(n[k], d + 1);
    })(data, 0);
    tbNamed.forEach(function (stack) {
      var b = tbChoose(stack);
      if (b >= 0 && !(targetNodes && targetNodes.has(stack[b].node))) tbAdd(stack, b, stack[stack.length - 1].node.name, 'name');
    });
    if (DEBUG) {
      if (tbNames.length) log(TB.tag + ' widgets: ' + tbNames.join(',').slice(0, 1200));
      log(TB.tag + ' blocks: ' + (tbLog.join(' ; ') || 'no titles found').slice(0, 1800));
    }
  }

  if (wbSlots.length) {
    var slotLog = [];
    wbSlots.forEach(function (sl) {
      var cur = sl.holder[sl.key];
      var left = Array.isArray(cur) ? cur.length : 0;
      stats.removed += left; // оставшиеся (не помеченные) баннеры слота тоже убираем
      sl.holder[sl.key] = [wbInvisible(sl.proto, '', 0)];
      slotLog.push(sl.key + ':' + sl.n + '->blank');
    });
    stats.reasons['wb-slots'] = wbSlots.length;
    stats.blocks.push(slotLog.join(','));
  }

  // СДЭК: метка рекламы висит на весь ответ (data.adTag.erid у ленты «Горячие предложения») -> списки пустые
  if (IS_CDEK && /screen=MOBILE_MAIN/i.test(url) && rootHits.length && !targets.length &&
      rootHits.some(function (r) { return /erid|label/i.test(r); })) {
    data = strip(data, 0);
    stats.reasons['whole-response-ad'] = rootHits.length;
  }

  // Почта: настройки рекламы (рекламная сеть Яндекса в карусели) -> выключить
  function neutralize(o, d) {
    var n = 0;
    if (d > 8 || !o || typeof o !== 'object') return 0;
    for (var k in o) {
      var v = o[k];
      if (v === true) { o[k] = false; n++; }
      else if (typeof v === 'string' && /^(R-M-|R-IM-|demo-|adf-|ca-app-pub)/i.test(v)) { o[k] = ''; n++; }
      else if (Array.isArray(v)) { if (v.length) { o[k] = []; n++; } }
      else if (v && typeof v === 'object') n += neutralize(v, d + 1);
    }
    return n;
  }
  // Почта: карусель баннеров. Пустой список = «Баннер не загрузился» + бесконечные перезапросы,
  // поэтому оставляем ОДИН баннер-пустышку: картинка -> адрес, который модуль превращает в прозрачный 1px,
  // ссылки и тексты — пустые. Сам баннер (его id) приложение подгружает через adv.get.image -> тоже прозрачный.
  var BLANK_IMG = 'https://mobileapp.russianpost.ru/app/specialoffers/_blank.png';
  function blankBanner(o, d) {
    if (d > 6 || !o || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.length ? [blankBanner(o[0], d + 1)] : o;
    var out = {};
    for (var k in o) {
      var v = o[k];
      if (typeof v === 'string') {
        if (/image|img|picture|icon|photo|banner/i.test(k)) out[k] = BLANK_IMG;
        else if (/^(https?:|[a-z][a-z0-9+.-]*:\/\/)/i.test(v) || /link|url|href|deeplink|action|target/i.test(k)) out[k] = '';
        else if (/title|text|subtitle|description|label|name|advert|erid|legal|disclaimer|caption|marker|info/i.test(k)) out[k] = '';
        else out[k] = v;
      } else if (v && typeof v === 'object') out[k] = blankBanner(v, d + 1);
      else out[k] = v;
    }
    return out;
  }
  if (POCHTA_BANNERS && data && Array.isArray(data.banners) && data.banners.length) {
    if (DEBUG) log('banners BEFORE: ' + JSON.stringify(data.banners).slice(0, 900));
    stats.removed += data.banners.length;
    data.banners = [blankBanner(data.banners[0], 0)];
    stats.reasons['pochta-invisible-banner'] = 1;
  }
  if (IS_POCHTA && /get\.blocks/i.test(path) && data && data.blocks && typeof data.blocks === 'object' && !Array.isArray(data.blocks)) {
    var dropped = [];
    for (var bk2 in data.blocks) {
      if (/^(BANNERS?|ADVERTISING(_\d+)?|ADS?|ADV[A-Z_\d]*)$/i.test(bk2)) {
        if (DEBUG) log('drop block ' + bk2 + ': ' + JSON.stringify(data.blocks[bk2]).slice(0, 500));
        delete data.blocks[bk2]; dropped.push(bk2); stats.removed++;
      }
    }
    if (dropped.length) stats.reasons['pochta-blocks-off'] = dropped.join('/');
  }
  if (IS_POCHTA && /get\.blocks/i.test(path) && DEBUG && data && data.blocks && typeof data.blocks === 'object')
    log('blocks keys: ' + Object.keys(data.blocks).join(',') + ' | dynamicBlocks: ' +
        (Array.isArray(data.dynamicBlocks) ? data.dynamicBlocks.map(function (b) { return (b && b.title || '?') + '(' + (b && b.banners ? b.banners.length : 0) + ')'; }).join(', ') : '-'));
  if (IS_POCHTA && /application\.settings/i.test(path) && data && typeof data === 'object') {
    if (DEBUG) log('settings keys: ' + Object.keys(data).join(','));
    for (var sk in data) {
      if (data[sk] === true && hasAny(camelWords(sk), ['banner', 'banners', 'adv', 'advertising', 'ads', 'ad', 'promo', 'yandex'])) { data[sk] = false; stats.removed++; stats.reasons['settings-off:' + sk] = 1; }
    }
  }
  if (IS_POCHTA && /application\.settings/i.test(path) && data && data.advertisingSettings && typeof data.advertisingSettings === 'object') {
    if (DEBUG) log('advertisingSettings BEFORE: ' + JSON.stringify(data.advertisingSettings).slice(0, 1500));
    var nOff = neutralize(data.advertisingSettings, 0);
    if (nOff) { stats.removed += nOff; stats.reasons['adv-settings-off'] = nOff; }
  }

  // AliExpress: списки рядов товаров (rowV2) и размер полного ряда — до удаления (перекладка рядов — ниже)
  var aeRowLists = [];
  if (IS_ALI && targets.length && data && typeof data === 'object') (function aeFind(n, d) {
    if (d > 8 || !n || typeof n !== 'object') return;
    if (!Array.isArray(n)) { for (var k in n) aeFind(n[k], d + 1); return; }
    var per = 0, rows = 0;
    for (var i = 0; i < n.length; i++) {
      var rw = n[i] && n[i].rowV2;
      if (rw && typeof rw === 'object' && Array.isArray(rw.items)) { rows++; if (rw.items.length > per) per = rw.items.length; }
      else aeFind(n[i], d + 1);
    }
    if (rows && per >= 2 && per <= 4) aeRowLists.push({ list: n, per: per });
  })(data, 0);

  // ───────── проход 2: удалить ─────────
  function isInsideOtherTarget(t) {
    if (!targetNodes) return false;
    for (var i = t.idx + 1; i < t.units.length; i++) if (targetNodes.has(t.units[i].node)) return true;
    return false;
  }

  // Ozon: удалить элементы, ссылающиеся на удалённый stateId
  function unlinkRefs(node, key) {
    var found = 0;
    (function walk(n, depth) {
      if (depth > 60 || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        for (var i = n.length - 1; i >= 0; i--) {
          var el = n[i];
          if (el && typeof el === 'object' && !Array.isArray(el)) {
            var hit = false;
            for (var kk in el) if (el[kk] === key) { hit = true; break; }
            if (hit) { n.splice(i, 1); found++; continue; }
          }
          walk(el, depth + 1);
        }
        return;
      }
      for (var k in n) walk(n[k], depth + 1);
    })(node, 0);
    return found;
  }

  var byArray = typeof Map === 'function' ? new Map() : null;
  var jsonRemovals = [];
  var emptiedCandidates = [];

  function queue(t) {
    var sz = size(t.node);
    if (!t.block && sz > TOTAL * ELEM_CAP) { stats.skippedBig++; return false; }
    if (t.kind === 'arr') {
      var set = byArray.get(t.parent);
      if (!set) { set = { idx: {}, list: [] }; byArray.set(t.parent, set); }
      if (!set.idx[t.key]) { set.idx[t.key] = 1; set.list.push(t); }
    } else if (t.kind === 'json') {
      jsonRemovals.push(t);
    }
    return true;
  }

  for (var ti = 0; ti < targets.length; ti++) {
    var t = targets[ti];
    if (isInsideOtherTarget(t)) continue;
    queue(t);
  }

  function applyRemovals() {
    byArray.forEach(function (set, arr) {
      var before = arr.length;
      var list = set.list.sort(function (a, b) { return b.key - a.key; });
      for (var i = 0; i < list.length; i++) {
        var tt = list[i];
        // индекс мог сдвинуться после удалений в этом же списке на прошлом проходе -> ищем элемент заново
        var at = arr[tt.key] === tt.node ? tt.key : arr.indexOf(tt.node);
        if (at < 0) continue;
        if (tt.block) stats.blockBytes += size(tt.node); else stats.bytes += size(tt.node);
        arr.splice(at, 1);
        stats.removed++;
        if (stats.targets.length < 6) stats.targets.push(tt.pathStr);
      }
      if (before > 0 && arr.length === 0 && !list[0].block) emptiedCandidates.push(list[0]);
    });
    byArray.clear();
    for (var j = 0; j < jsonRemovals.length; j++) {
      var jt = jsonRemovals[j];
      if (jt.parent[jt.key] !== jt.node) continue;
      // отвязываем только по «айдишным» ключам вида bannerVideo-123-default-1, не по data/payload
      var idLike = typeof jt.key === 'string' && jt.key.length >= 8 && /\d/.test(jt.key) && /[-_.]/.test(jt.key);
      var refs = idLike ? unlinkRefs(data, jt.key) : 0;
      if (refs > 0) {
        stats.bytes += size(jt.node);
        delete jt.parent[jt.key];
        stats.removed += 1 + refs;
        if (stats.targets.length < 6) stats.targets.push(jt.pathStr + ' (+' + refs + ' ref)');
      } else if (jt.idx > 0 && jt.units[0].kind === 'arr') {
        queue({ kind: 'arr', parent: jt.units[0].parent, key: jt.units[0].key, node: jt.units[0].node,
                units: jt.units, idx: 0, pathStr: jt.pathStr + ' (fallback)' });
      }
    }
    jsonRemovals = [];
  }

  if (byArray) {
    applyRemovals();
    // карусель/полка, состоявшая только из рекламы -> убрать и её
    var em = emptiedCandidates; emptiedCandidates = [];
    for (var ei = 0; ei < em.length; ei++) {
      var et = em[ei], next = et.units[et.idx + 1];
      if (!next) continue;
      if (size(next.node) > TOTAL * CLIMB_CAP) continue;
      queue({ kind: next.kind, parent: next.parent, key: next.key, node: next.node, units: et.units,
              idx: et.idx + 1, pathStr: et.pathStr + ' (empty parent)' });
    }
    applyRemovals();
  }

  // AliExpress, ленты товаров по два в ряд (data.items[].rowV2.items — «Для вас» на главной и т. п.): после удаления
  // рекламного товара в ряду остаётся один товар, и приложение рисует его широкой карточкой («картинка слева, текст
  // справа»). Товары перекладываются по порядку в ряды по два (сколько было в полном ряду до удаления), неполный
  // последний ряд убирается. Только в ответах, где что-то удалено, — остальные ленты не меняются.
  if (stats.removed) aeRowLists.forEach(function (rl) {
    var n = rl.list, per = rl.per, rows = [], pool = [], odd = 0, i;
    for (i = 0; i < n.length; i++) {
      var rw = n[i] && n[i].rowV2;
      if (rw && typeof rw === 'object' && Array.isArray(rw.items)) { rows.push(n[i]); if (rw.items.length !== per) odd++; pool = pool.concat(rw.items); }
    }
    if (!odd) return;
    var keep = pool.length - pool.length % per, q = 0;
    for (i = keep; i < pool.length; i++) { stats.blockBytes += size(pool[i]); stats.removed++; }
    for (i = 0; i < n.length; i++) {
      if (rows.indexOf(n[i]) === -1) continue;
      if (q < keep) { n[i].rowV2.items = pool.slice(q, q + per); fresh(n[i].rowV2); fresh(n[i]); q += per; }
      else { n.splice(i, 1); i--; }
    }
    stats.reasons['ae-rows'] = (stats.reasons['ae-rows'] || 0) + odd;
    if (DEBUG) log('AE rows: ' + odd + ' of ' + rows.length + ' incomplete -> ' + (keep / per) + ' rows by ' + per +
                   (pool.length > keep ? ', last ' + (pool.length - keep) + ' dropped' : ''));
  });

  // ───────── диагностика структуры (WB, Почта) ─────────
  function probe() {
    var arrays = [], marks = [], seen = {};
    (function walk(n, p, depth) {
      if (depth > 40 || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) {
        var gp = p + '[]';
        if (n.length && n[0] && typeof n[0] === 'object' && !Array.isArray(n[0]) && !seen[gp] && arrays.length < 12) {
          var vis = 0;
          for (var i = 0; i < n.length && i < 30; i++) if (n[i] && typeof n[i] === 'object' && hasVisual(n[i])) vis++;
          if (vis) { seen[gp] = 1; arrays.push(gp + ' n=' + n.length + ' vis=' + vis + ' keys=' + Object.keys(n[0]).slice(0, 14).join('/')); }
        }
        for (var j = 0; j < n.length && j < 40; j++) {
          if (typeof n[j] === 'string') { if (/реклам|erid|ерид|рекламодател/i.test(n[j]) && marks.length < 8) marks.push(gp + '="' + n[j].slice(0, 50) + '"'); }
          else walk(n[j], gp, depth + 1);
        }
        return;
      }
      for (var k in n) {
        var v = n[k];
        if (typeof v === 'string' || typeof v === 'boolean') {
          if (marks.length < 8 && !(IS_WB_FIN && /operation|transaction|history|statement|payment/i.test(p)) &&   // операции банка — не в лог
              (/реклам|erid|ерид|рекламодател|sponsor/i.test(String(v)) || /(^|[^a-z])(ad|adv|advert|erid|promo|banner)([^a-z]|$)/i.test(k.replace(/([a-z])([A-Z])/g, '$1_$2'))))
            marks.push(p + '.' + k + '=' + String(v).slice(0, 50));
        } else if (v && typeof v === 'object') walk(v, p + '.' + k, depth + 1);
      }
    })(data, '', 0);
    var widgets = [];
    (function walkW(n, p, depth) {
      if (depth > 40 || !n || typeof n !== 'object' || widgets.length >= 15) return;
      if (Array.isArray(n)) { for (var i = 0; i < n.length && i < 80; i++) walkW(n[i], p + '[' + i + ']', depth + 1); return; }
      if (typeof n.type === 'string' && /(_widget|_shortcut|Section|Scaffold)$/.test(n.type)) widgets.push(p + '=' + n.type);
      for (var k in n) if (n[k] && typeof n[k] === 'object') walkW(n[k], p + '.' + k, depth + 1);
    })(data, '', 0);
    var top = Array.isArray(data) ? '[array n=' + data.length + ']' : Object.keys(data).slice(0, 12).join('/');
    log('PROBE size=' + TOTAL + ' top=' + top + ' | widgets: ' + (widgets.join(' ; ') || '-') +
        ' | lists: ' + (arrays.join(' ; ') || '-') + ' | marks: ' + (marks.join(' ; ') || '-'));
  }

  function summary(x) {
    var names = {};
    (function scanNames(n, d) {
      if (d > 6 || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (var i = 0; i < n.length && i < 60; i++) scanNames(n[i], d + 1); return; }
      ['type', 'component', 'widget', 'name', 'template', 'kind', 'viewType', 'layout'].forEach(function (f) {
        if (typeof n[f] === 'string' && n[f].length < 60) names[f + '=' + n[f]] = 1;
      });
      for (var k in n) scanNames(n[k], d + 1);
    })(x, 0);
    return Object.keys(names).slice(0, 40).join(', ');
  }

  // (ответы Кошелька целиком не пишем: там данные счёта)
  if (DEBUG && /(^|\.)(wildberries|wb)\.ru$/.test(host) && TOTAL < 1500 && !/adult-subjects/.test(path) && !IS_WB_FIN) log('SMALL ' + body.slice(0, 1400));
  if (DEBUG && /^marketing-info\.wildberries\.ru$/.test(host) && data && typeof data === 'object' && !Array.isArray(data))
    log('MINFO keys: ' + Object.keys(data).join(',').slice(0, 1500));
  if (DEBUG && IS_WB_BANNERS && data && typeof data === 'object') {
    var hs = [data]; if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) hs.push(data.data);
    var left = [];
    hs.forEach(function (h) {
      for (var lk in h) if (Array.isArray(h[lk]) && h[lk].length && h[lk][0] && typeof h[lk][0] === 'object' && !WB_SLOT.test(lk))
        left.push(lk + '[' + h[lk].length + ']: ' + h[lk].slice(0, 4).map(function (b) {
          return String(b.promoName || b.text || b.alt || b.actionName || b.href || '?').slice(0, 30) + (b.ordBannerMark ? '(ORD)' : '');
        }).join(' / '));
    });
    if (left.length) log('LEFT ' + left.join(' ; ').slice(0, 1800));
  }
  if (!stats.removed) {
    if (DEBUG) log('nothing removed' + (stats.blocks.length ? ' blocks=' + stats.blocks.join(',') : '') + (stats.skippedBig ? ' (skipped big: ' + stats.skippedBig + ')' : '') +
                   (Object.keys(stats.reasons).length ? ' hits=' + JSON.stringify(stats.reasons) : '') + (PROBE ? '' : ' | ' + summary(data)));
    return $done({});
  }
  if (stats.bytes > TOTAL * ABORT_CAP) {
    log('ABORT: would remove ' + Math.round(stats.bytes * 100 / TOTAL) + '% of response');
    return $done({});
  }

  for (var h = hydrated.length - 1; h >= 0; h--) {
    var hd = hydrated[h];
    if (hd.owner[hd.key] === hd.obj) hd.owner[hd.key] = restoreBig(JSON.stringify(hd.obj));
  }
  var out = restoreBig(JSON.stringify(data));
  if (DEBUG) log('removed=' + stats.removed + ' bytes=' + stats.bytes + (stats.blockBytes ? ' block-bytes=' + stats.blockBytes : '') + '/' + TOTAL +
                 ' reasons=' + JSON.stringify(stats.reasons) + (stats.blocks.length ? ' blocks=' + stats.blocks.join(',') : '') + ' at=' + stats.targets.join(' | '));
  $done({ body: out });
})();