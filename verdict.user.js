// ==UserScript==
// @name         VERDICT — быстрые ответы для администрации Black Russia
// @namespace    verdict.br.forum
// @version      1.10.14
// @description  Готовые ответы над полем ввода, смена статуса темы, свои шаблоны и фоны для форума Black Russia.
// @author       Максим Паль!?
// @match        https://forum.blackrussia.online/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      speller.yandex.net
// @connect      unsplash.com
// @connect      images.unsplash.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      raw.githubusercontent.com
// @connect      prnt.sc
// @connect      prntscr.com
// @connect      ibb.co
// @connect      imgbb.com
// @connect      postimg.cc
// @connect      postimages.org
// @connect      yapx.ru
// @connect      imgur.com
// @connect      skr.sh
// @connect      gyazo.com
// @connect      iimg.su
// @connect      imgbox.com
// @connect      radikal.cloud
// @connect      fastpic.org
// @connect      *
// @run-at       document-start
// @noframes
// @updateURL    https://raw.githubusercontent.com/Jeredpoi/Br-script/main/verdict.meta.js
// @downloadURL  https://raw.githubusercontent.com/Jeredpoi/Br-script/main/verdict.user.js
// @license      Proprietary, © VERDICT. Копирование и выдача за своё запрещены.
// ==/UserScript==

// собирается из src/*.js через build.sh
// телеметрии нет, данные лежат локально; наружу: спеллер Яндекса (по кнопке), фото с Unsplash,
// почта разработчика (только обращения из вкладки «Связь» и ответы на них)

(function () {
'use strict';
// ядро
const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
if (W.__verdictLoaded) return;
W.__verdictLoaded = true;

const BRAND = Object.freeze({
    name: 'VERDICT',
    author: 'Максим Паль!?', // должен совпадать с @author в шапке скрипта
    tagline: 'Быстрые ответы · Black Russia',
    namespace: 'verdict.br.forum',
    version: '1.10.14', // подставляет build.sh из @version
    // откуда ставятся обновления (build.sh, UPDATE_BASE)
    update: 'https://raw.githubusercontent.com/Jeredpoi/Br-script/main',
    build: 'VRD-7Q4K-2026',
    // mail: адрес почты разработчика (Google Apps Script из server/), telegram и vk для ссылок во вкладке «Связь»
    dev: {
        mail: 'https://script.google.com/macros/s/AKfycbx-yEBIw_o_NKjnie7loXBJbcawRA0nU-eCHAKe9DHcxWyRrMhhvJo_DShtxZFJPiHT2Q/exec',
        telegram: '',
        vk: ''
    },
    // фоны от разработчика во вкладке «Темы»: { name, url, accent, accent2, fx }
    gallery: []
});

// хранилище: GM_*, если нет, то localStorage
const Store = {
    // фото с картинками весят мегабайты, их разбираем один раз
    _big: {},
    get(key, def) {
        if (key === 'photos') return this._big.photos || (this._big.photos = this.read(key, def));
        return this.read(key, def);
    },
    read(key, def) {
        try {
            if (typeof GM_getValue === 'function') {
                const raw = GM_getValue('vd.' + key);
                if (raw === undefined || raw === null) return def;
                return typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
        } catch {
            /* ignore */
        }
        try {
            const raw = localStorage.getItem('vd.' + key);
            return raw === null ? def : JSON.parse(raw);
        } catch {
            return def;
        }
    },
    set(key, value) {
        if (key === 'photos') this._big.photos = value;
        const raw = JSON.stringify(value);
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue('vd.' + key, raw);
                return;
            }
        } catch {
            /* ignore */
        }
        try {
            localStorage.setItem('vd.' + key, raw);
        } catch {
            /* ignore */
        }
    }
};

const VERDICTS = {
    approve: { label: 'Одобрено', tail: 'Одобрено.', icon: 'check', color: '#2fbf71' },
    deny: { label: 'Отказано', tail: 'Отказано.', icon: 'x', color: '#e5484d' },
    review: {
        label: 'На рассмотрении',
        tail: 'На рассмотрении.',
        icon: 'clock',
        color: '#f5a524'
    },
    close: { label: 'Закрыто', tail: 'Закрыто.', icon: 'lock', color: '#8b8f9a' },
    tech: { label: 'Тех. специалисту', tail: 'Передано техническому специалисту.', icon: 'wrench', color: '#3aa0ff' },
    ga: { label: 'ГА', tail: 'Передано Главному администратору.', icon: 'crown', color: '#ff7a45' },
    kp: { label: 'КП', tail: 'Передано Команде проекта.', icon: 'users', color: '#a970ff' },
    watched: { label: 'Рассмотрено', tail: 'Рассмотрено.', icon: 'eye', color: '#22b8a8' },
    zga: { label: 'ЗГА', tail: 'Передано Заместителю Главного администратора.', icon: 'star', color: '#ff9f43' },
    cur: { label: 'Куратору', tail: 'Передано куратору.', icon: 'badge', color: '#f5c542' },
    spec: {
        label: 'Спец. администратору',
        tail: 'Передано Специальному администратору.',
        icon: 'shield',
        color: '#ef5da8'
    },
    none: { label: 'Без статуса', tail: '', icon: 'pen', color: '#c9ccd3' }
};
const VERDICT_ORDER = [
    'approve',
    'deny',
    'review',
    'close',
    'watched',
    'tech',
    'cur',
    'zga',
    'ga',
    'spec',
    'kp',
    'none'
];
// цвет итоговой строки для статусов, которых нет в палитрах ответа
// итоговая строка зависит от раздела: «жалоба одобрена», «заявка отклонена»…
const KIND_TAILS = {
    complaint: { approve: 'Жалоба одобрена.', deny: 'В жалобе отказано.' },
    appeal: { approve: 'Обжалование одобрено.', deny: 'В обжаловании отказано.' },
    app: { approve: 'Заявка одобрена.', deny: 'Заявка отклонена.' },
    bio: { approve: 'Биография одобрена.', deny: 'Биография отклонена.' }
};
// разделы, для которых итоговую строку можно задать отдельно
const TAIL_KINDS = { complaint: 'Жалобы', appeal: 'Обжалования', app: 'Заявки', bio: 'Биографии' };
// итоговая строка: своя для раздела → своя общая → стандартная для раздела → стандартная
const Tails = {
    std(kind, v) {
        return (KIND_TAILS[kind] && KIND_TAILS[kind][v]) || (VERDICTS[v] || VERDICTS.none).tail;
    },
    get(kind, v) {
        const own = Settings.get().answer.tails;
        const t = (kind && own[kind + '.' + v]) || own[v];
        if (!t) return this.std(kind, v);
        return t.trim() === '-' ? '' : t;
    }
};
// строгие формулировки передачи: старые и свои варианты («Передали ГА», «Передано Главному Администратору») приводятся к ним
const STRICT_TAILS = [
    [/^переда\S*\s+(тему\s+|жалобу\s+|обращение\s+)?(на\s+рассмотрение\s+)?(главному\s+администратору|га)\.?$/i, 'Передано Главному администратору.'],
    [/^переда\S*\s+(тему\s+|жалобу\s+|обращение\s+)?(на\s+рассмотрение\s+)?(заместителю\s+главного\s+администратора|зга)\.?$/i, 'Передано Заместителю Главного администратора.'],
    [/^переда\S*\s+(тему\s+|жалобу\s+|обращение\s+)?(на\s+рассмотрение\s+)?(тех\.?\s*|техническому\s+)специалисту\.?$/i, 'Передано техническому специалисту.'],
    [/^переда\S*\s+(тему\s+|жалобу\s+|обращение\s+)?(на\s+рассмотрение\s+)?(команде\s+проекта|кп)\.?$/i, 'Передано Команде проекта.'],
    [/^переда\S*\s+(тему\s+|жалобу\s+|обращение\s+)?(на\s+рассмотрение\s+)?(спец\.?\s*|специальному\s+)администратору\.?$/i, 'Передано Специальному администратору.']
];
const strictTail = t => {
    const s = String(t || '').trim();
    const hit = STRICT_TAILS.find(([re]) => re.test(s));
    return hit ? hit[1] : t;
};
const VERDICT_BASE = { watched: 'approve', zga: 'ga', cur: 'review', spec: 'ga' };

const DEFAULT_SETTINGS = {
    accent: '#e5484d',
    theme: {
        enabled: true,
        wall: { kind: 'gen', gen: 'nightroad', seed: 1907 },
        rotate: 'off', // off | visit | hour
        dim: 0.55,
        blur: 0, // размытие под блоками красиво, но на слабых ПК прокрутка падает в разы
        glass: 0.3, // плотность блоков форума (1 — непрозрачные)
        menuGlass: 0.82, // плотность меню и окон
        perf: 'auto', // auto | quality | fast — см. Perf
        grain: true,
        fx: { effect: 'none', intensity: 0.6, tod: 'auto', lightning: true },
        liveSpeed: 1
    },
    answer: {
        style: 'classic', // classic | card | strict | compact
        palette: 'classic',
        font: 'Verdana',
        size: '4',
        greet: true,
        mention: true,
        signature: '',
        banner: '',
        tails: {} // свои итоговые строки: 'approve' для всех разделов, 'complaint.approve' только для жалоб
    },
    status: {
        apply: true, // менять статус темы после отправки ответа
        confirmInstant: true,
        map: {
            approve: { prefix: 8, open: false, sticky: false },
            deny: { prefix: 4, open: false, sticky: false },
            review: { prefix: 2, open: false, sticky: true },
            close: { prefix: 7, open: false, sticky: false },
            tech: { prefix: 13, open: false, sticky: true },
            ga: { prefix: 12, open: false, sticky: true },
            kp: { prefix: 10, open: false, sticky: true },
            watched: { prefix: 9, open: false, sticky: false },
            zga: { prefix: 12, open: false, sticky: true },
            cur: { prefix: 2, open: false, sticky: true },
            spec: { prefix: 11, open: false, sticky: true }
        }
    },
    colors: { accent2: '', header: '', blocks: '', border: '', buttons: '', links: '', gradients: true },
    role: '', // уровень: ga | curator | deputy | senior | watcher | admin | jmod | custom
    roleDir: '', // направление: admin | orgs | ap | forum
    roleOrg: '', // фракция для направления «Организаций»
    packVis: {}, // ручные правки видимости разделов поверх должности
    verdictVis: {}, // ручные правки видимости вердиктов
    hiddenItems: [], // ответы, скрытые кнопкой «глаз»
    autograph: { style: 'classic', custom: '' },
    threadAge: true, // сколько прошло с создания темы
    nickCopy: true, // ники Имя_Фамилия в постах подсвечены и копируются по клику
    imgPreview: true, // ссылки на фото открываются в окне быстрого просмотра
    skipLeave: true, // без страницы «Пожалуйста, будьте осторожны» перед внешними ссылками
    qnav: { on: true, counts: true, place: 'top', items: [], groups: [] }, // быстрая навигация в шапке: { id, name, url, group }
    stats: true, // анонимная отметка «скрипт запущен» раз в день, видна разработчику как число пользователей
    permCheck: true, // прятать панель в разделах, где нет прав модератора
    openOn: 'hover', // hover — списки открываются при наведении, click — только по нажатию
    barStyle: 'docked', // docked — панель встроена в редактор, card — отдельной карточкой
    hints: true,
    shortcodes: true,
    hotkeys: true,
    launcher: true
};

function deepMerge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    // значение другого типа (битый или подделанный файл) не принимаем
    if (over !== undefined && over !== null && base !== null && typeof base !== 'object' && typeof over !== typeof base)
        return base;
    if (base && typeof base === 'object') {
        const out = {};
        for (const k of Object.keys(base)) out[k] = deepMerge(base[k], over ? over[k] : undefined);
        if (over && typeof over === 'object') for (const k of Object.keys(over)) if (!(k in base)) out[k] = over[k];
        return out;
    }
    return over === undefined ? base : over;
}

const Settings = {
    _v: null,
    get() {
        return (
            this._v ||
            (this._v = this.clean(deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), Store.get('settings', {}))))
        );
    },
    // цвета и префиксы попадают в HTML и CSS, поэтому из хранилища и импорта берём только корректные
    clean(s) {
        const hex = /^#[0-9a-f]{3,8}$/i;
        if (!hex.test(s.accent)) s.accent = DEFAULT_SETTINGS.accent;
        for (const k of Object.keys(s.colors))
            if (k !== 'gradients' && s.colors[k] && !hex.test(s.colors[k])) s.colors[k] = '';
        for (const v of Object.keys(s.status.map)) {
            const m = s.status.map[v];
            if (!VERDICTS[v] || !m || typeof m !== 'object') {
                delete s.status.map[v];
                continue;
            }
            m.prefix = Math.max(0, parseInt(m.prefix, 10) || 0);
            m.open = !!m.open;
            m.sticky = !!m.sticky;
        }
        const q = s.qnav;
        if (!q || typeof q !== 'object') s.qnav = { on: true, items: [], groups: [] };
        else {
            q.on = q.on !== false;
            q.counts = q.counts !== false;
            if (q.place === 'staff') q.place = 'top';
            if (!['top', 'nav', 'sub'].includes(q.place)) q.place = 'top';
            const str = v => (typeof v === 'string' ? v : '');
            q.items = (Array.isArray(q.items) ? q.items : [])
                .filter(i => i && typeof i === 'object')
                .map(i => ({
                    id: str(i.id) || 'q' + U.uid(),
                    name: str(i.name).slice(0, 40),
                    url: str(i.url),
                    group: str(i.group)
                }));
            q.groups = [
                ...new Set(
                    (Array.isArray(q.groups) ? q.groups : [])
                        .filter(g => typeof g === 'string' && g.trim())
                        .map(g => g.trim().slice(0, 24))
                )
            ];
        }
        const t = s.answer.tails;
        if (!t || typeof t !== 'object' || Array.isArray(t)) s.answer.tails = {};
        else
            for (const k of Object.keys(t)) {
                const v = k.split('.').pop();
                if (!VERDICTS[v] || typeof t[k] !== 'string') delete t[k];
                else t[k] = t[k].slice(0, 200);
            }
        const w = s.theme.wall;
        if (!w || typeof w !== 'object' || (w.kind === 'url' && !/^(https:|data:image\/)/.test(String(w.url))))
            s.theme.wall = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.theme.wall));
        return s;
    },
    save() {
        Store.set('settings', this._v);
        Bus.emit('settings');
    },
    patch(fn) {
        fn(this.get());
        this.save();
    }
};

// экономный режим: без blur, погода и живой фон в низком разрешении; auto включает сам при лагах
const Perf = {
    light() {
        const p = Settings.get().theme.perf;
        if (p === 'fast') return true;
        if (p === 'quality') return false;
        return Store.get('perfAuto', '') === 'fast';
    },
    // время кадров в покое и при первых прокрутках (blur тормозит на скролле)
    probe(onSlow) {
        if (Settings.get().theme.perf !== 'auto' || Store.get('perfAuto', '')) return;
        const weak = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
        if (weak) return this.decide(true, onSlow);
        const slow = times => {
            times.sort((a, b) => a - b);
            return times[Math.floor(times.length * 0.75)] > 24;
        };
        const sample = (count, done) => {
            const times = [];
            let last = 0;
            const tick = now => {
                // кадры при свёрнутой вкладке не считаем
                if (last && !document.hidden && now - last < 500) times.push(now - last);
                last = now;
                if (times.length < count) requestAnimationFrame(tick);
                else done(times);
            };
            requestAnimationFrame(tick);
        };
        setTimeout(
            () =>
                sample(120, idle => {
                    if (slow(idle)) return this.decide(true, onSlow);
                    // кадры считаем только пока идёт прокрутка; без прокрутки цикл не крутится
                    const moving = [];
                    let lastScroll = 0,
                        running = false;
                    const loop = prev => now => {
                        if (now - lastScroll > 150) {
                            running = false;
                            return;
                        }
                        if (prev && !document.hidden && now - prev < 500) moving.push(now - prev);
                        if (moving.length >= 90) {
                            removeEventListener('scroll', onScroll);
                            this.decide(slow(moving), onSlow);
                            return;
                        }
                        requestAnimationFrame(loop(now));
                    };
                    const onScroll = () => {
                        lastScroll = performance.now();
                        if (!running) {
                            running = true;
                            requestAnimationFrame(loop(0));
                        }
                    };
                    addEventListener('scroll', onScroll, { passive: true });
                }),
            2500
        );
    },
    decide(isSlow, onSlow) {
        if (Settings.get().theme.perf !== 'auto') return;
        Store.set('perfAuto', isSlow ? 'fast' : 'quality');
        if (isSlow) onSlow();
    },
    reset() {
        Store.set('perfAuto', '');
    }
};

const Bus = {
    _h: {},
    on(ev, fn) {
        (this._h[ev] = this._h[ev] || []).push(fn);
    },
    off(ev, fn) {
        this._h[ev] = (this._h[ev] || []).filter(f => f !== fn);
    },
    emit(ev, data) {
        (this._h[ev] || []).forEach(fn => {
            try {
                fn(data);
            } catch (e) {
                console.error('[VERDICT]', e);
            }
        });
    }
};

const U = {
    esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    },
    uid() {
        return Math.random().toString(36).slice(2, 9);
    },
    debounce(fn, ms) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    },
    ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
        else fn();
    },
    h(html) {
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    },
    norm(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/ё/g, 'е');
    },
    // нечёткий поиск: символы запроса по порядку, бонус за начало слова
    fuzzy(query, text) {
        const q = U.norm(query).replace(/\s+/g, ''),
            t = U.norm(text);
        if (!q) return 1;
        if (t.includes(U.norm(query).trim())) return 100 - t.indexOf(U.norm(query).trim());
        let ti = 0,
            score = 0;
        for (const ch of q) {
            const idx = t.indexOf(ch, ti);
            if (idx < 0) return 0;
            score += idx === 0 || t[idx - 1] === ' ' ? 3 : 1;
            ti = idx + 1;
        }
        return score;
    },
    hexA(hex, a) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return `rgba(229,72,77,${a})`;
        const n = parseInt(m[1], 16);
        return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    }
};

// Иконки 24×24, обводка 1.8
const ICONS = {
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 00-5 5L4.5 15.5a2.1 2.1 0 003 3l5-5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    crown: '<path d="M4 17.5h16M5 15l-1-8 5 4 3-6 3 6 5-4-1 8z"/>',
    users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><path d="M15.5 6.2a3 3 0 010 5.6M17.5 14.8c1.6.6 2.7 2 3 4.2"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
    upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14"/>',
    send: '<path d="M4 12l16-7.5L13.5 20l-2.5-6.5z"/><path d="M11 13.5l9-9"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    bulb: '<path d="M9 17.5h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
    star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    chat: '<path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    palette:
        '<path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a3.5 3.5 0 003.5-3.5c0-5.2-3.8-9.5-8.5-9.5z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7.3" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7.3" r="1.2" fill="currentColor"/>',
    forward: '<path d="M14 5l6 6-6 6"/><path d="M20 11H9a5 5 0 00-5 5v3"/>',
    heart: '<path d="M12 19.5S4 15 4 9.5A4 4 0 0112 7a4 4 0 018 2.5C20 15 12 19.5 12 19.5z"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3 3.7M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    badge: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><circle cx="12" cy="10" r="2.6"/><path d="M8 16.5c.7-1.6 2.2-2.4 4-2.4s3.3.8 4 2.4"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 00.6-8A6 6 0 006.2 9.7 4.4 4.4 0 007 18.5z"/>',
    storm: '<path d="M7 15.5a4.3 4.3 0 01-.8-8.5 6 6 0 0111.4 1.1 3.8 3.8 0 01-.1 7.4"/><path d="M12.5 12l-2.5 4h3.5l-2.5 4.5"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
    moon: '<path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    logo: '<path d="M4 5l8 14 8-14" stroke-width="2.4"/><path d="M8.6 5L12 11l3.4-6" stroke-width="1.6" opacity=".55"/>'
};
function icon(name, size = 16) {
    return `<svg class="vi" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// <color>, чтобы переменные цветов анимировались
(function registerColorProps() {
    if (!window.CSS || !CSS.registerProperty) return;
    [
        '--acc',
        '--acc2',
        '--vd-acc',
        '--vd-acc2',
        '--vd-head',
        '--vd-block',
        '--vd-border',
        '--vd-btn',
        '--vd-link'
    ].forEach(name => {
        try {
            // начальные значения как у стандартной темы: при выключенной теме var(--vd-acc, …) иначе давал прозрачный цвет
            const init = {
                '--vd-block': '#16181f',
                '--vd-head': '#16181f',
                '--vd-border': '#2a2d36',
                '--vd-link': '#7cb7ff'
            };
            CSS.registerProperty({ name, syntax: '<color>', inherits: true, initialValue: init[name] || '#e5484d' });
        } catch {
            /* ignore */
        }
    });
})();
const hsl = {
    from(hex) {
        const n = parseInt(hex.slice(1), 16),
            r = (n >> 16) / 255,
            g = ((n >> 8) & 255) / 255,
            b = (n & 255) / 255;
        const mx = Math.max(r, g, b),
            mn = Math.min(r, g, b),
            l = (mx + mn) / 2,
            d = mx - mn;
        let h = 0,
            s = 0;
        if (d) {
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
        }
        return [h, s, l];
    },
    to(h, s, l) {
        h = ((h % 360) + 360) % 360;
        const k = n => (n + h / 30) % 12,
            a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return (
            '#' +
            [f(0), f(8), f(4)]
                .map(x =>
                    Math.round(x * 255)
                        .toString(16)
                        .padStart(2, '0')
                )
                .join('')
        );
    },
    rotate(hex, deg, dl = 0) {
        const [h, s, l] = this.from(hex);
        return this.to(h + deg, s, Math.max(0.15, Math.min(0.85, l + dl)));
    }
};

// база ответов
// пак = набор ответов для раздела форума
//   match: регулярка по крошкам и заголовку темы
//   kind:  complaint | appeal | app | bio | any
//   hint:  признак анализатора (noproof, form, late...), cue: слова в тексте
// переменные в тексте: {greeting} {user} {nick} {admin} {date} {time} {target} {cursor}
const it = (verdict, title, text, extra) => Object.assign({ verdict, title, text }, extra || {});

const DEFAULT_PACKS = [
    {
        id: 'common',
        name: 'Общие',
        match: '',
        kind: 'any',
        items: [
            it('none', 'Приветствие и свой текст', '{cursor}', { key: 'текст' }),
            it(
                'review',
                'Взято на рассмотрение',
                'Тема на рассмотрении.',
                { key: 'рас' }
            ),
            it(
                'tech',
                'Передано техническому специалисту',
                'Ожидайте ответа в этой теме.',
                {
                    key: 'тех',
                    cue: '(^|[^а-яa-z])баг|не работает|пропал[аио]?([^а-яa-z]|$)|вылет|техническ|не начислил|не пришл'
                }
            ),
            it(
                'ga',
                'Передано Главному администратору',
                'Ожидайте ответа в этой теме.',
                { key: 'га' }
            ),
            it(
                'kp',
                'Передано Команде проекта',
                'Ожидайте ответа в этой теме.',
                { key: 'кп' }
            ),
            it(
                'close',
                'Не тот раздел',
                'Тема создана не в том разделе.',
                { key: 'раздел' }
            ),
            it(
                'close',
                'Дубликат темы',
                'Дубликат темы.',
                { key: 'дуб' }
            ),
            it('close', 'Тема не по назначению', 'Тема не относится к разделу.', {
                key: 'оффтоп'
            }),
            it('close', 'Закрыто по просьбе автора', 'Закрыто по просьбе автора.', { key: 'просьба' }),
            it(
                'deny',
                'Не по форме',
                'Обращение не по форме. Форма — в закреплённой теме раздела.',
                { key: 'форма', hint: 'form' }
            ),
            it(
                'cur',
                'Передано куратору организаций',
                'Ожидайте ответа в этой теме.',
                { key: 'курорг', tail: 'Передано куратору организаций.' }
            ),
            it(
                'cur',
                'Передано куратору администрации',
                'Ожидайте ответа в этой теме.',
                { key: 'куради', tail: 'Передано куратору администрации.' }
            ),
            it(
                'cur',
                'Передано куратору АП',
                'Ожидайте ответа в этой теме.',
                { key: 'курап', tail: 'Передано куратору АП.' }
            ),
            it(
                'zga',
                'Передано ЗГА',
                'Ожидайте ответа в этой теме.',
                { key: 'зга' }
            ),
            it(
                'zga',
                'Передано ЗГА ГОСС и ОПГ',
                'Ожидайте ответа в этой теме.',
                { key: 'згаопг', tail: 'Передано ЗГА по ГОСС и ОПГ.' }
            ),
            it(
                'spec',
                'Передано спец. администратору',
                'Ожидайте ответа в этой теме.',
                { key: 'спец' }
            )
        ]
    },
    {
        id: 'players',
        name: 'Жалобы на игроков',
        match: 'жалоб[аы]? на игрок',
        kind: 'complaint',
        items: [
            it(
                'approve',
                'DM — убийство без причины',
                'Игрок получит наказание: Jail на 90 минут. Нарушение пункта 2.19 правил сервера.',
                { key: 'дм', cue: 'убил|убийств|(^|[^а-яa-z])(дм|dm)([^а-яa-z]|$)' }
            ),
            it(
                'approve',
                'Mass DM',
                'Игрок получит наказание: Warn. Нарушение пункта 2.20 правил сервера.',
                { key: 'мдм', cue: '(^|[^а-яa-z])(масс? ?дм|mass ?dm)([^а-яa-z]|$)' }
            ),
            it(
                'approve',
                'Mass DM — блокировка',
                'Игрок получит наказание: блокировка аккаунта на 3 дня. Нарушение пункта 2.20 правил сервера.',
                { key: 'мдмбан' }
            ),
            it(
                'approve',
                'DM / таран на работе',
                'Игрок получит наказание: блокировка аккаунта на 3 дня. Нарушение пункта 2.19 правил сервера.',
                { key: 'таран', cue: 'таран|дальнобой|автобус|водолаз' }
            ),
            it(
                'approve',
                'DB — урон транспортом',
                'Игрок получит наказание: Jail на 60 минут. Нарушение пункта 2.13 правил сервера.',
                { key: 'дб', cue: 'сбил|задавил|переехал|(^|[^а-яa-z])(дб|db)([^а-яa-z]|$)' }
            ),
            it(
                'approve',
                'TK — убийство своего',
                'Игрок получит наказание: Jail на 60 минут. Нарушение пункта 2.15 правил сервера.',
                {
                    key: 'тк',
                    cue: 'тимкил|(^|[^а-яa-z])(тк|tk)([^а-яa-z]|$)|своего сотрудника|члена (своей )?организации'
                }
            ),
            it(
                'approve',
                'TK — два и более убийства',
                'Игрок получит наказание: Warn. Нарушение пункта 2.15 правил сервера.',
                { key: 'тк2' }
            ),
            it(
                'approve',
                'SK — убийство на спавне',
                'Игрок получит наказание: Jail на 60 минут. Нарушение пункта 2.16 правил сервера.',
                { key: 'ск', cue: 'спавн|на респе|(^|[^а-яa-z])(ск|sk)([^а-яa-z]|$)' }
            ),
            it(
                'approve',
                'SK — два и более убийства',
                'Игрок получит наказание: Warn. Нарушение пункта 2.16 правил сервера.',
                { key: 'ск2' }
            ),
            it(
                'approve',
                'PG — PowerGaming',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.01 правил сервера.',
                { key: 'пг', cue: 'пауэр|power ?gaming|(^|[^а-яa-z])(пг|pg)([^а-яa-z]|$)' }
            ),
            it(
                'approve',
                'MG — MetaGaming',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 2.18 правил сервера.',
                { key: 'мг', cue: 'метагейм|meta ?gaming|(^|[^а-яa-z])(мг|mg)([^а-яa-z]|$)' }
            ),
            it(
                'approve',
                'NonRP поведение',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.01 правил сервера.',
                { key: 'нрп', cue: 'non ?rp|нон ?рп|н[ео]н?[ -]?рп|неадекват' }
            ),
            it(
                'approve',
                'NonRP вождение',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.03 правил сервера.',
                { key: 'вожд', cue: 'вожден|ездил|встречк|дрифт|nonrp drive|езд[аеуы]' }
            ),
            it(
                'approve',
                'Поля на рабочем транспорте',
                'Игрок получит наказание: Jail на 60 минут. Нарушение пункта 2.47 правил сервера.',
                { key: 'поля', cue: 'по полю|по полям' }
            ),
            it(
                'approve',
                'Рабочий транспорт в личных целях',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.11 правил сервера.',
                { key: 'раб', cue: 'рабоч(ий|ем) (транспорт|машин)|фракционн(ый|ом) транспорт' }
            ),
            it(
                'approve',
                'Уход от RP',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.02 правил сервера.',
                { key: 'уход', cue: 'уход от|ушел от|вышел из игры|ливнул|(^|[^а-яa-z])офф|отключился' }
            ),
            it(
                'approve',
                'Уход от RP — Warn',
                'Игрок получит наказание: Warn. Нарушение пункта 2.02 правил сервера.',
                { key: 'уходв' }
            ),
            it(
                'approve',
                'Уход от задержания',
                'Игрок получит наказание: Warn. Нарушение пункта 2.02 правил сервера.',
                { key: 'задерж', cue: 'от задержания|от ареста|ушел в афк|вышел при задержании' }
            ),
            it(
                'approve',
                'Помеха RP-процессу',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.01 правил сервера.',
                { key: 'помеха', cue: 'помех|мешал' }
            ),
            it(
                'approve',
                'Помеха игрокам (перекрытие)',
                'Игрок получит наказание: блокировка аккаунта на 3 дня. Нарушение пункта 2.04 правил сервера.',
                { key: 'перекр', cue: 'перекрыл|перекрыт|загородил' }
            ),
            it(
                'approve',
                'AFK без ESC',
                'Игрок получит наказание: Kick. Нарушение пункта 2.07 правил сервера.',
                { key: 'афк', cue: 'афк|afk' }
            ),
            it(
                'approve',
                'Аморальные действия',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.08 правил сервера.',
                { key: 'аморал', cue: 'аморал|домогал|пошлост' }
            ),
            it(
                'approve',
                'Обман в /do',
                'Игрок получит наказание: Jail на 30 минут. Нарушение пункта 2.10 правил сервера.',
                {
                    key: 'обмандо',
                    cue: '(^|[^а-яa-z])/?do([^а-яa-z]|$).*(обман|соврал)|(обман|соврал).*(^|[^а-яa-z])/?do([^а-яa-z]|$)'
                }
            ),
            it(
                'approve',
                'Обман / мошенничество',
                'Игрок получит наказание: бессрочная блокировка аккаунта (PermBan). Нарушение пункта 2.05 правил сервера. Разблокировка — только после возврата имущества.',
                { key: 'обман', cue: 'обман|кинул|развел|скам|мошен' }
            ),
            it(
                'approve',
                'Попытка обмана',
                'Игрок получит наказание: блокировка аккаунта на 15 дней. Нарушение пункта 2.05 правил сервера.',
                { key: 'попобман', cue: 'попыт(ка|ался) обман|хотел обмануть' }
            ),
            it(
                'approve',
                'Долг не возвращён',
                'Игрок получит наказание: блокировка аккаунта на 30 дней. Нарушение пункта 2.57 правил сервера.',
                { key: 'долг', cue: 'долг(?!о)|в долг|занял (у|деньг|мне)|не вернул|займ' }
            ),
            it(
                'approve',
                'Долг больше 5 млн',
                'Игрок получит наказание: бессрочная блокировка аккаунта (PermBan). Нарушение пункта 2.57 правил сервера.',
                { key: 'долг5' }
            ),
            it(
                'approve',
                'Слив склада',
                'Игрок получит наказание: блокировка аккаунта на 30 дней. Нарушение пункта 2.09 правил сервера.',
                { key: 'склад', cue: 'склад|слил' }
            ),
            it(
                'approve',
                'Помеха медиа-лицам',
                'Игрок получит наказание: блокировка аккаунта на 7 дней. Нарушение пункта 2.12 правил сервера.',
                { key: 'стрим', cue: 'стрим|блогер|ютубер' }
            ),
            it(
                'approve',
                'Оскорбление',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.03 правил сервера.',
                { key: 'оск', cue: 'оскорб|обозвал|послал|материл|матом' }
            ),
            it(
                'approve',
                'Токсичность в IC-чате',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.24 правил сервера.',
                { key: 'токс', cue: 'токсич|униж' }
            ),
            it(
                'approve',
                'Упоминание родных',
                'Игрок получит наказание: Mute на 300 минут. Нарушение пункта 3.04 правил сервера.',
                {
                    key: 'родня',
                    cue: 'родн|(^|[^а-яa-z])мат(ь|ери)([^а-яa-z]|$)|(^|[^а-яa-z])мам[уаеы]|отц|родител|(^|[^а-яa-z])(mq|rnq)([^а-яa-z]|$)'
                }
            ),
            it(
                'approve',
                'Упоминание родных — блокировка',
                'Игрок получит наказание: блокировка аккаунта на 7 дней. Нарушение пункта 3.04 правил сервера.',
                { key: 'родняб' }
            ),
            it(
                'approve',
                'OOC-угрозы',
                'Игрок получит наказание: Mute на 120 минут. Нарушение пункта 2.37 правил сервера.',
                { key: 'угроз', cue: 'угрож|угроз' }
            ),
            it(
                'approve',
                'Угрозы жизни и здоровью',
                'Игрок получит наказание: блокировка аккаунта на 7 дней. Нарушение пункта 2.37 правил сервера.',
                { key: 'угрозб' }
            ),
            it(
                'approve',
                'Оскорбление администрации',
                'Игрок получит наказание: Mute на 180 минут. Нарушение пункта 2.54 правил сервера.',
                { key: 'оскадм' }
            ),
            it(
                'approve',
                'Капс / флуд',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пунктов 3.02 / 3.05 правил сервера.',
                { key: 'флуд', cue: 'капс|caps|флуд|(^|[^а-яa-z])спам' }
            ),
            it(
                'approve',
                'Злоупотребление символами',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.06 правил сервера.',
                { key: 'симв' }
            ),
            it(
                'approve',
                'Транслит',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.20 правил сервера.',
                { key: 'трансл', cue: 'транслит' }
            ),
            it(
                'approve',
                'Политика / религия в чате',
                'Игрок получит наказание: Mute на 180 минут. Нарушение пункта 3.18 правил сервера.',
                { key: 'полит', cue: 'полит|религ|нацио' }
            ),
            it(
                'approve',
                'Объявления в госучреждении',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.22 правил сервера.',
                { key: 'объяв' }
            ),
            it(
                'approve',
                'Мат в VIP-чате',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.23 правил сервера.',
                { key: 'вип', cue: 'вип|vip' }
            ),
            it(
                'approve',
                'Музыка в голосовом чате',
                'Игрок получит наказание: Mute на 60 минут. Нарушение пункта 3.14 правил сервера.',
                { key: 'музыка', cue: 'музык' }
            ),
            it(
                'approve',
                'Посторонние шумы',
                'Игрок получит наказание: Mute на 30 минут. Нарушение пункта 3.16 правил сервера.',
                { key: 'шум', cue: 'шум|орал|кричал' }
            ),
            it(
                'approve',
                'Изменение голоса',
                'Игрок получит наказание: Mute на 60 минут. Нарушение пункта 3.19 правил сервера.',
                { key: 'голос', cue: 'голосов(ой|ую) (прог|измен)|войсчейнджер|voice ?changer' }
            ),
            it(
                'approve',
                'Деструктив против проекта',
                'Игрок получит наказание: Mute на 300 минут. Нарушение пункта 2.40 правил сервера.',
                { key: 'дестр' }
            ),
            it(
                'approve',
                'Реклама',
                'Игрок получит наказание: блокировка аккаунта на 7 дней. Нарушение пункта 2.31 правил сервера.',
                { key: 'рекл', cue: 'реклам' }
            ),
            it(
                'approve',
                'Реклама промокодов',
                'Игрок получит наказание: блокировка аккаунта на 15 дней. Нарушение пункта 3.21 правил сервера.',
                { key: 'промо', cue: 'промокод' }
            ),
            it(
                'approve',
                'Выдавал себя за администратора',
                'Игрок получит наказание: блокировка аккаунта на 7 дней и чёрный список сервера. Нарушение пункта 3.10 правил сервера.',
                { key: 'фейк', cue: 'выдавал себя|представился администратор|притворял' }
            ),
            it(
                'approve',
                'Обман командами',
                'Игрок получит наказание: блокировка аккаунта на 15 дней. Нарушение пункта 3.11 правил сервера.',
                { key: 'команд', cue: '/pay|/sellmycar' }
            ),
            it(
                'approve',
                'Слив в глобальный чат',
                'Игрок получит наказание: бессрочная блокировка аккаунта (PermBan). Нарушение пункта 3.08 правил сервера.',
                { key: 'слив' }
            ),
            it(
                'approve',
                'Продажа / покупка валюты',
                'Игрок получит наказание: бессрочная блокировка аккаунта (PermBan) с обнулением аккаунта и занесением в чёрный список проекта. Нарушение пункта 2.28 правил сервера.',
                { key: 'валюта', cue: 'продаж[аеу] вирт|куп(ил|ить) вирт|за реальные|за рубли' }
            ),
            it(
                'approve',
                'Задержание в казино / на аукционе',
                'Игрок получит наказание: Warn. Нарушение пункта 2.50 правил сервера.',
                { key: 'казино', cue: 'казино|аукцион' }
            ),
            it(
                'approve',
                'Неадекватные аксессуары',
                'Игрок получит наказание: обнуление аксессуаров. Нарушение пункта 2.52 правил сервера.',
                { key: 'акс', cue: 'аксессуар' }
            ),
            it(
                'approve',
                'Запрещённое название',
                'Игрок получит наказание: принудительная смена названия. Нарушение пункта 2.53 правил сервера.',
                { key: 'назв' }
            ),
            it(
                'approve',
                'Ник не по правилам',
                'Игрок получит наказание: устное замечание и смена никнейма. Нарушение пунктов 4.06–4.08 правил сервера.',
                { key: 'никнрп' }
            ),
            it(
                'approve',
                'Оскорбительный ник',
                'Игрок получит наказание: бессрочная блокировка аккаунта (PermBan). Нарушение пункта 4.09 правил сервера.',
                { key: 'никоск' }
            ),
            it(
                'approve',
                'Передача имущества между аккаунтами',
                'Игрок получит наказание: Warn. Нарушение пункта 4.05 правил сервера.',
                { key: 'перед', cue: 'твинк|передал (дом|бизнес|азс|машин)' }
            ),
            it(
                'approve',
                'Ущерб экономике',
                'Игрок получит наказание: блокировка аккаунта на 30 дней. Нарушение пункта 2.30 правил сервера.',
                { key: 'эконом', cue: 'раздава' }
            ),
            it(
                'approve',
                'Злоупотребление нарушениями',
                'Игрок получит наказание: блокировка аккаунта на 7 дней. Нарушение пункта 2.39 правил сервера.',
                { key: 'злоуп' }
            ),
            it(
                'approve',
                'Стороннее ПО / читы',
                'Игрок получит наказание: блокировка аккаунта на 30 дней. Нарушение пункта 2.22 правил сервера.',
                {
                    key: 'чит',
                    cue: '(^|[^а-яa-z])чит|софт|(^|[^а-яa-z])(аим|aim|вх|wh)([^а-яa-z]|$)|сторонн|телепорт|спидхак'
                }
            ),
            it(
                'approve',
                'Читы — PermBan',
                'Игрок получит наказание: бессрочная блокировка аккаунта (PermBan). Нарушение пункта 2.22 правил сервера.',
                { key: 'читпб' }
            ),
            it(
                'approve',
                'Багоюз',
                'Игрок получит наказание: Warn. Нарушение пункта 2.21 правил сервера.',
                { key: 'баг', cue: '(^|[^а-яa-z])баг' }
            ),
            it(
                'approve',
                'Багоюз — блокировка',
                'Игрок получит наказание: блокировка аккаунта на 15 дней. Нарушение пункта 2.21 правил сервера.',
                { key: 'багбан' }
            ),
            it(
                'approve',
                'Багоюз анимации',
                'Игрок получит наказание: Jail на 120 минут. Нарушение пункта 2.55 правил сервера.',
                { key: 'сбив', cue: 'сбив|анимац' }
            ),
            it(
                'deny',
                'Нет доказательств',
                'Нет доказательств.',
                { key: 'нд', hint: 'noproof' }
            ),
            it(
                'deny',
                'Недостаточно доказательств',
                'Недостаточно доказательств.',
                { key: 'недост' }
            ),
            it(
                'deny',
                'Нужны тайм-коды',
                'Нет тайм-кодов: видео длиннее 3 минут.',
                { key: 'тайм', hint: 'timecode' }
            ),
            it(
                'deny',
                'Доказательства обрезаны',
                'Доказательства обрезаны.',
                { key: 'обрез' }
            ),
            it('deny', 'Нет /time', 'На доказательствах нет /time.', {
                key: 'тайм2'
            }),
            it('deny', 'Нарушений не выявлено', 'Нарушений со стороны игрока нет.', {
                key: 'нн'
            }),
            it(
                'deny',
                'Срок подачи истёк',
                'Срок подачи жалобы (72 часа) истёк.',
                { key: 'срок', hint: 'late' }
            ),
            it(
                'deny',
                'Жалоба от третьего лица',
                'Жалобы от третьих лиц не принимаются.',
                { key: '3л', hint: 'thirdparty' }
            ),
            it(
                'deny',
                'Неверный ник нарушителя',
                'Ник нарушителя указан неверно.',
                { key: 'ник' }
            ),
            it(
                'deny',
                'Доказательства не на хостинге',
                'Доказательства нужно загрузить на хостинг (YouTube, Imgur, Яндекс Диск).',
                { key: 'хост' }
            ),
            it('deny', 'Игрок уже наказан', 'Игрок уже наказан за это нарушение.', {
                key: 'уже',
                cue: 'уже (наказан|получил|сидит)'
            }),
            it(
                'deny',
                'Не по форме',
                'Жалоба не по форме. Форма — в закреплённой теме раздела.',
                { key: 'форма', hint: 'form' }
            ),
            it(
                'review',
                'Запрошен ответ нарушителя',
                'Запрошено объяснение у второй стороны.',
                { key: 'запрос', open: true }
            ),
            it(
                'deny',
                'Нужна видеозапись',
                'Нужна видеозапись ситуации.',
                { key: 'фрапс', hint: 'screens' }
            ),
            it(
                'deny',
                'Доказательства отредактированы',
                'Доказательства отредактированы.',
                { key: 'ред' }
            ),
            it(
                'deny',
                'Плохое качество',
                'Доказательства плохого качества.',
                { key: 'кач' }
            ),
            it(
                'deny',
                'Ссылки не открываются',
                'Ссылки на доказательства не открываются.',
                { key: 'ссыл' }
            ),
            it(
                'deny',
                'Доказательства из соцсетей',
                'Доказательства из соцсетей не принимаются.',
                { key: 'соц', hint: 'social' }
            ),
            it(
                'deny',
                'Это в обжалования',
                'Для снижения наказания обратитесь в раздел «Обжалование наказаний».',
                { key: 'вобж', cue: 'снизить|снять наказ|согласен с наказ|обжал' }
            )
        ]
    },
    {
        id: 'admins',
        name: 'Жалобы на администрацию',
        match: 'жалоб[аы]? на (администрац|админ)',
        kind: 'complaint',
        items: [
            it(
                'approve',
                'Администратор будет наказан',
                'Администратор получит наказание.',
                { key: 'адмнак' }
            ),
            it('approve', 'Проведена беседа', 'С администратором будет проведена беседа.', {
                key: 'беседа'
            }),
            it('approve', 'Наказание будет снято', 'Наказание будет снято.', {
                key: 'снять'
            }),
            it('deny', 'Наказание выдано верно', 'Наказание выдано верно.', { key: 'верно' }),
            it('deny', 'Нарушений не выявлено', 'Нарушений со стороны администратора нет.', {
                key: 'нн'
            }),
            it(
                'deny',
                'Нет доказательств',
                'Нет доказательств.',
                { key: 'нд', hint: 'noproof' }
            ),
            it('deny', 'Не по форме', 'Жалоба не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it(
                'review',
                'Запрошен ответ администратора',
                'Запрошено объяснение у администратора.',
                { key: 'запрос', open: true }
            ),
            it(
                'close',
                'Не является администратором',
                'Игрок не является администратором.',
                { key: 'неадм' }
            ),
            it(
                'approve',
                'Беседа без снятия наказания',
                'Наказание остаётся в силе.',
                { key: 'беседа2' }
            ),
            it(
                'watched',
                'Администратор снят',
                'Администратор снят с должности.',
                { key: 'снят', tail: 'Рассмотрено.' }
            ),
            it(
                'deny',
                'Прошло больше 48 часов',
                'Срок подачи жалобы (48 часов) истёк.',
                { key: 'срок', hint: 'late' }
            ),
            it('deny', 'Нет /time', 'На доказательствах нет /time.', {
                key: 'тайм2'
            }),
            it(
                'deny',
                'Жалоба от третьего лица',
                'Жалобу подаёт только наказанный игрок.',
                { key: '3л', hint: 'thirdparty' }
            ),
            it(
                'deny',
                'Нужна видеозапись',
                'Нужна видеозапись ситуации.',
                { key: 'фрапс', hint: 'screens' }
            ),
            it(
                'deny',
                'Запись обрезана',
                'Запись обрезана.',
                { key: 'обрез' }
            ),
            it(
                'deny',
                'Доказательства отредактированы',
                'Доказательства отредактированы.',
                { key: 'ред' }
            ),
            it(
                'deny',
                'Плохое качество',
                'Доказательства плохого качества.',
                { key: 'кач' }
            ),
            it(
                'deny',
                'Ссылки не открываются',
                'Ссылки на доказательства не открываются.',
                { key: 'ссыл' }
            ),
            it(
                'deny',
                'Доказательства из соцсетей',
                'Доказательства из соцсетей не принимаются.',
                { key: 'соц', hint: 'social' }
            ),
            it(
                'deny',
                'Нужен скриншот блокировки',
                'Приложите скриншот окна блокировки.',
                { key: 'бан', hint: 'ban' }
            ),
            it(
                'deny',
                'Наказание от тех. специалиста',
                'Наказание выдано техническим специалистом. Обратитесь в раздел жалоб на технических специалистов.',
                { key: 'втех', cue: 'тех[.]? ?спец|техническ' }
            ),
            it(
                'deny',
                'Это в обжалования',
                'Для снижения наказания обратитесь в раздел «Обжалование наказаний».',
                { key: 'вобж', cue: 'снизить|согласен с наказ|обжал' }
            )
        ]
    },
    {
        id: 'leaders',
        name: 'Жалобы на лидеров',
        match: 'жалоб[аы]? на (лидер|руковод)',
        kind: 'complaint',
        items: [
            it('approve', 'Лидер будет наказан', 'Лидер получит наказание.', {
                key: 'лиднак'
            }),
            it('approve', 'Беседа с лидером', 'С лидером будет проведена беседа.', { key: 'беседа' }),
            it('deny', 'Нарушений не выявлено', 'Нарушений со стороны лидера нет.', { key: 'нн' }),
            it(
                'deny',
                'Нет доказательств',
                'Нет доказательств.',
                { key: 'нд', hint: 'noproof' }
            ),
            it(
                'deny',
                'Внутренний конфликт организации',
                'Вопрос решается руководством организации.',
                { key: 'внутр' }
            ),
            it(
                'review',
                'Запрошен ответ лидера',
                'Запрошено объяснение у лидера.',
                { key: 'запрос', open: true }
            )
        ]
    },
    {
        id: 'agents',
        name: 'Жалобы на агентов поддержки',
        match: 'агент|поддержк',
        kind: 'complaint',
        items: [
            it(
                'approve',
                'Агент будет наказан',
                'Агент поддержки получит наказание.',
                { key: 'агнак' }
            ),
            it('approve', 'Беседа с агентом', 'С агентом поддержки будет проведена беседа.', {
                key: 'беседа'
            }),
            it('approve', 'Агент будет снят', 'Агент поддержки будет снят с должности.', { key: 'снят' }),
            it('deny', 'Нарушений не выявлено', 'Агент поддержки ответил верно.', {
                key: 'нн'
            }),
            it(
                'deny',
                'Нет доказательств',
                'Нет доказательств.',
                { key: 'нд', hint: 'noproof' }
            ),
            it('deny', 'Не по форме', 'Жалоба не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it(
                'review',
                'Запрошен ответ агента',
                'Запрошено объяснение у агента поддержки.',
                { key: 'запрос', open: true }
            )
        ]
    },
    {
        id: 'appeals',
        name: 'Обжалования',
        match: 'обжалов',
        kind: 'appeal',
        items: [
            it('approve', 'Наказание снято', 'Наказание снято.', {
                key: 'снято'
            }),
            it('approve', 'Наказание снижено', 'Наказание снижено.', {
                key: 'сниж'
            }),
            it('deny', 'Наказание выдано верно', 'Наказание выдано верно.', {
                key: 'верно'
            }),
            it('deny', 'Не подлежит обжалованию', 'Наказание не подлежит обжалованию.', { key: 'непод' }),
            it('deny', 'Подаёт не владелец', 'Обжалование подаёт только владелец аккаунта.', { key: 'влад' }),
            it('deny', 'Нет доказательств', 'Нет доказательств.', {
                key: 'нд',
                hint: 'noproof'
            }),
            it('deny', 'Не по форме', 'Обжалование не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it(
                'review',
                'Запрошены доказательства',
                'Запрошены доказательства у администратора.',
                { key: 'запрос' }
            ),
            it(
                'review',
                'Прикрепите ВКонтакте',
                'Прикрепите ссылку на страницу ВКонтакте.',
                { key: 'вк', open: true, hint: 'novk' }
            ),
            it(
                'review',
                'Смена ника — разбан на 24 часа',
                'Аккаунт разблокирован на 24 часа: смените ник и пришлите доказательство в эту тему. Иначе блокировка вернётся без права обжалования.',
                {
                    key: 'ник',
                    open: true,
                    cue: 'смен[а-я]* ник|ник[а-я]* смен|оскорбительн[а-я]* ник|запрещенн[а-я]* ник|рп ник'
                }
            ),
            it('deny', 'Не готовы снизить', 'Оснований для снижения наказания нет.', {
                key: 'неснизим'
            }),
            it(
                'deny',
                'Сначала верните имущество',
                'Обжалование за обман рассматривается только после возврата имущества. Подаёт пострадавший.',
                { key: 'обман', cue: 'обман|вернул|верну|компенс|ущерб' }
            ),
            it(
                'deny',
                'Уже минимальное наказание',
                'Наказание уже минимальное.',
                { key: 'мин' }
            ),
            it(
                'deny',
                'Доказательства из соцсетей',
                'Доказательства из соцсетей не принимаются.',
                { key: 'соц', hint: 'social' }
            ),
            it(
                'deny',
                'Не согласны — в жалобы',
                'При несогласии с наказанием подайте жалобу на администратора.',
                { key: 'вжб', cue: 'не соглас|несправедлив|ошибочн|ни за что|без причины' }
            )
        ]
    },
    {
        id: 'apps',
        name: 'Заявки на должность',
        match: 'заявк',
        kind: 'app',
        items: [
            it(
                'approve',
                'Заявка одобрена',
                'Свяжитесь с руководством в игре.',
                { key: 'ок' }
            ),
            it(
                'approve',
                'Одобрено — собеседование',
                'Время собеседования будет назначено руководством.',
                { key: 'соб' }
            ),
            it(
                'deny',
                'Ссылки не открываются',
                'Ссылки на скриншоты не открываются.',
                { key: 'ссыл', hint: 'noproof' }
            ),
            it('deny', 'Нет /time на скриншотах', 'На скриншотах нет /time.', {
                key: 'тайм'
            }),
            it('deny', 'Не подходит по уровню', 'Не хватает уровня или игрового стажа.', {
                key: 'лвл'
            }),
            it(
                'deny',
                'Проблемы с мед. картой / лицензиями',
                'Мед. карта или лицензии не подходят.',
                { key: 'мед' }
            ),
            it('deny', 'Есть активные наказания', 'Есть активное наказание.', {
                key: 'нак'
            }),
            it(
                'deny',
                'Слабая мотивация',
                'Мотивация раскрыта слишком коротко.',
                { key: 'мотив', hint: 'short' }
            ),
            it('deny', 'Не по форме', 'Заявка не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it('review', 'Заявка на рассмотрении', 'Заявка на рассмотрении.', { key: 'рас' })
        ]
    },
    {
        id: 'staff',
        name: 'Жалобы на состав организации',
        match: 'жалоб[аы]? на (старш[а-я]* |младш[а-я]* )?(состав|сотрудник)',
        kind: 'complaint',
        items: [
            it('approve', 'Выговор сотруднику', 'Сотрудник получит выговор.', {
                key: 'выговор'
            }),
            it('approve', 'Сотрудник понижен', 'Сотрудник будет понижен.', {
                key: 'пониж'
            }),
            it('approve', 'Сотрудник уволен', 'Сотрудник будет уволен.', { key: 'увол' }),
            it(
                'approve',
                'Беседа с сотрудником',
                'С сотрудником будет проведена беседа.',
                { key: 'беседа' }
            ),
            it(
                'deny',
                'Нарушений не выявлено',
                'Нарушений устава нет.',
                {
                    key: 'нн'
                }
            ),
            it(
                'deny',
                'Нет доказательств',
                'Нет доказательств.',
                { key: 'нд', hint: 'noproof' }
            ),
            it(
                'deny',
                'Нужна видеозапись',
                'Нужна видеозапись ситуации.',
                { key: 'фрапс', hint: 'screens' }
            ),
            it('deny', 'Нет /time', 'На доказательствах нет /time.', {
                key: 'тайм2'
            }),
            it(
                'deny',
                'Срок подачи истёк',
                'Срок подачи жалобы истёк.',
                { key: 'срок', hint: 'late' }
            ),
            it('deny', 'Жалоба от третьего лица', 'Жалобы от третьих лиц не принимаются.', {
                key: '3л',
                hint: 'thirdparty'
            }),
            it(
                'deny',
                'Не сотрудник организации',
                'Игрок не состоит в организации.',
                { key: 'несотр' }
            ),
            it('deny', 'Не по форме', 'Жалоба не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it(
                'review',
                'Запрошено объяснение сотрудника',
                'Запрошено объяснение у сотрудника.',
                { key: 'запрос', open: true }
            ),
            it(
                'cur',
                'Передано следящим',
                'Ожидайте ответа в этой теме.',
                { key: 'след', tail: 'Передано следящим за организацией.' }
            )
        ]
    },
    {
        id: 'reports',
        name: 'Рапорты организации',
        match: '^(?!.*жалоб).*(рапорт|младший состав|старший состав|личный кабинет)',
        kind: 'any',
        items: [
            it(
                'approve',
                'Рапорт одобрен',
                'Обратитесь к руководству в игре.',
                { key: 'рап' }
            ),
            it(
                'approve',
                'Звание присвоено',
                'Звание будет присвоено.',
                { key: 'звание' }
            ),
            it(
                'approve',
                'Принят на стажировку',
                'Вы приняты на стажировку.',
                { key: 'стаж' }
            ),
            it(
                'approve',
                'Восстановлен в звании',
                'Звание будет восстановлено.',
                { key: 'восст' }
            ),
            it('approve', 'Перевод одобрен', 'Перевод одобрен.', {
                key: 'перевод'
            }),
            it('approve', 'Взыскание снято', 'Взыскание снято.', {
                key: 'взыск'
            }),
            it('approve', 'Сотрудник будет наказан', 'Сотрудник получит взыскание.', {
                key: 'сотрнак'
            }),
            it(
                'deny',
                'Не выполнены требования',
                'Требования для рапорта не выполнены.',
                { key: 'треб' }
            ),
            it(
                'deny',
                'Мало отыгранного времени',
                'Недостаточно отыгранного времени.',
                { key: 'время' }
            ),
            it('deny', 'Нет мест', 'Свободных мест нет.', {
                key: 'мест'
            }),
            it('deny', 'Есть взыскание', 'Есть действующее взыскание.', {
                key: 'есть'
            }),
            it('deny', 'Нарушений не выявлено', 'Нарушений устава нет.', {
                key: 'нн'
            }),
            it('deny', 'Не по форме', 'Рапорт не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it('review', 'Рапорт на рассмотрении', 'Рапорт на рассмотрении.', { key: 'рас' })
        ]
    },
    {
        id: 'bio',
        name: 'RP-биографии',
        match: 'биограф',
        kind: 'bio',
        items: [
            it('approve', 'Биография одобрена', 'Требования соблюдены.', { key: 'ок' }),
            it(
                'deny',
                'Мало информации',
                'Биография слишком короткая.',
                { key: 'мало', hint: 'short' }
            ),
            it('deny', 'Много ошибок', 'Много ошибок в тексте.', { key: 'ошиб' }),
            it('deny', 'Копирование', 'Биография скопирована из другого источника.', { key: 'копи' }),
            it('deny', 'Несоответствие дат и возраста', 'Даты не сходятся с возрастом персонажа.', {
                key: 'даты'
            }),
            it(
                'deny',
                'Нереалистичный сюжет',
                'Нереалистичный сюжет.',
                { key: 'нереал' }
            ),
            it('deny', 'Не по форме', 'Биография не по форме. Форма — в закреплённой теме раздела.', {
                key: 'форма',
                hint: 'form'
            }),
            it('review', 'Биография на рассмотрении', 'Биография на рассмотрении.', { key: 'рас' })
        ]
    }
];

// паки пользователя, при первом запуске копия стандартных
const Packs = {
    _v: null,
    all() {
        if (this._v) return this._v;
        const saved = Store.get('packs', null);
        this._v = Array.isArray(saved) && saved.length ? saved : this.fresh();
        // разделы, появившиеся в обновлении; удалённые пользователем не возвращаем
        const seen = Store.get('packsSeen', null) || this._v.map(p => p.id);
        const fresh = this.fresh().filter(p => !seen.includes(p.id) && !this._v.some(x => x.id === p.id));
        if (fresh.length) {
            this._v.push(...fresh);
            Store.set('packs', this._v);
        }
        Store.set('packsSeen', [...new Set(seen.concat(DEFAULT_PACKS.map(p => p.id)))]);
        // то же для отдельных ответов внутри существующих разделов
        const sig = (pid, it) => pid + '::' + it.title;
        const allSigs = DEFAULT_PACKS.flatMap(p => p.items.map(i => sig(p.id, i)));
        const seenItems = Store.get('itemsSeen', null);
        if (seenItems) {
            let added = 0;
            DEFAULT_PACKS.forEach(dp => {
                const mine = this._v.find(p => p.id === dp.id);
                if (!mine) return;
                dp.items.forEach(i => {
                    if (seenItems.includes(sig(dp.id, i)) || mine.items.some(x => x.title === i.title)) return;
                    const copy = Object.assign(JSON.parse(JSON.stringify(i)), { id: dp.id + '-' + U.uid() });
                    // рядом с ответами того же вердикта, а не в конце списка
                    let at = -1;
                    mine.items.forEach((x, n) => {
                        if (x.verdict === copy.verdict) at = n;
                    });
                    if (at >= 0) mine.items.splice(at + 1, 0, copy);
                    else mine.items.push(copy);
                    added++;
                });
            });
            if (added) Store.set('packs', this._v);
        }
        Store.set('itemsSeen', [...new Set((seenItems || []).concat(allSigs))]);
        // тексты стандартных ответов, которые пользователь не менял, обновляем до новой версии
        const prevTexts = Store.get('defaultTexts', {});
        let updated = 0;
        DEFAULT_PACKS.forEach(dp => {
            const mine = this._v.find(p => p.id === dp.id);
            if (!mine) return;
            dp.items.forEach(d => {
                const prev = prevTexts[sig(dp.id, d)];
                const own = mine.items.find(x => x.title === d.title);
                if (own && prev !== undefined && own.text === prev && own.text !== d.text) {
                    own.text = d.text;
                    // вместе с текстом стандартного ответа обновляется и его итоговая строка
                    if (d.tail !== undefined) own.tail = d.tail;
                    else delete own.tail;
                    updated++;
                }
                // у неизменённых ответов обновляем и подсказку для подбора
                if (own && own.text === d.text && (own.cue || '') !== (d.cue || '')) {
                    if (d.cue) own.cue = d.cue;
                    else delete own.cue;
                    updated++;
                }
            });
        });
        Store.set(
            'defaultTexts',
            Object.fromEntries(DEFAULT_PACKS.flatMap(p => p.items.map(i => [sig(p.id, i), i.text])))
        );
        // деловой стиль итоговых строк: «Передали …» → «Передано …» (свои строки не трогаем)
        if (!Store.get('tailsBiz', false)) {
            this._v.forEach(p =>
                p.items.forEach(x => {
                    if (typeof x.tail === 'string' && /^Передали /.test(x.tail)) {
                        x.tail = x.tail.replace(/^Передали /, 'Передано ');
                        updated++;
                    }
                })
            );
            Store.set('tailsBiz', true);
        }
        // строгие формулировки передачи в шаблонах
        if (!Store.get('tailsStrict', false)) {
            this._v.forEach(p =>
                p.items.forEach(x => {
                    if (typeof x.tail === 'string' && strictTail(x.tail) !== x.tail) {
                        x.tail = strictTail(x.tail);
                        updated++;
                    }
                })
            );
            Store.set('tailsStrict', true);
        }
        // раздел для агентов поддержки убран
        if (!Store.get('dropSupport', false)) {
            this._v = this._v.filter(p => p.id !== 'support');
            Store.set('dropSupport', true);
            updated++;
        }
        if (updated) Store.set('packs', this._v);
        return this._v;
    },
    // ответы, после которых автор должен дописать в теме: тему не закрываем
    keepsOpen(item) {
        if (item.open) return true;
        return DEFAULT_PACKS.some(p => p.items.some(d => d.open && d.title === item.title));
    },
    // пакеты из файла: только ожидаемые поля и типы
    clean(list) {
        const str = v => (typeof v === 'string' ? v : '');
        return (Array.isArray(list) ? list : [])
            .filter(p => p && typeof p === 'object' && str(p.id))
            .map(p => ({
                id: str(p.id),
                name: str(p.name) || 'Без названия',
                match: str(p.match),
                kind: str(p.kind) || 'any',
                items: (Array.isArray(p.items) ? p.items : [])
                    .filter(i => i && typeof i === 'object' && str(i.title))
                    .map(i => {
                        const out = {
                            id: str(i.id) || p.id + '-' + U.uid(),
                            verdict: VERDICTS[i.verdict] ? i.verdict : 'none',
                            title: str(i.title),
                            text: str(i.text)
                        };
                        if (str(i.key)) out.key = str(i.key);
                        if (typeof i.tail === 'string') out.tail = i.tail;
                        if (str(i.hint)) out.hint = str(i.hint);
                        if (str(i.cue)) out.cue = str(i.cue);
                        if (i.open === true) out.open = true;
                        return out;
                    })
            }));
    },
    fresh() {
        return JSON.parse(JSON.stringify(DEFAULT_PACKS)).map(p => {
            p.items.forEach(i => {
                i.id = p.id + '-' + U.uid();
            });
            return p;
        });
    },
    save() {
        Store.set('packs', this._v);
        Bus.emit('packs');
    },
    reset() {
        this._v = this.fresh();
        this.save();
    },
    find(id) {
        return this.all().find(p => p.id === id);
    },
    // стандартная версия ответа (если он есть в наборе по умолчанию)
    defaultOf(pack, item) {
        const dp = DEFAULT_PACKS.find(p => p.id === pack.id);
        return (dp && dp.items.find(i => i.title === item.title)) || null;
    },
    isEdited(pack, item) {
        const d = this.defaultOf(pack, item);
        return (
            !!d &&
            (d.text !== item.text ||
                d.verdict !== item.verdict ||
                (d.tail || '') !== (item.tail || '') ||
                (d.key || '') !== (item.key || ''))
        );
    },
    // ответ создан или изменён пользователем
    isMine(pack, item) {
        return !this.defaultOf(pack, item) || this.isEdited(pack, item);
    },
    item(id) {
        for (const p of this.all()) {
            const i = p.items.find(x => x.id === id);
            if (i) return { pack: p, item: i };
        }
        return null;
    },
    // паки под текущую страницу (без «Общих»)
    detect(text) {
        const t = U.norm(text);
        return this.all().filter(p => {
            if (!p.match) return false;
            try {
                return new RegExp(p.match, 'i').test(t);
            } catch {
                return false;
            }
        });
    }
};

// счётчик использований ответов
const Usage = {
    _v: Store.get('usage', {}),
    bump(id) {
        this._v[id] = (this._v[id] || 0) + 1;
        Store.set('usage', this._v);
    },
    count(id) {
        return this._v[id] || 0;
    }
};

// должности
// должность = уровень + направление. ручные packVis/verdictVis/hiddenItems важнее, свои паки видны всегда

const DIRECTIONS = {
    admin: { name: 'Администрации', packs: ['common', 'players', 'admins', 'appeals'] },
    orgs: { name: 'Организаций', packs: ['common', 'leaders', 'staff', 'reports', 'apps', 'players'] },
    ap: { name: 'АП', packs: ['common', 'agents', 'apps'], hint: 'агенты поддержки' },
    forum: { name: 'ЗГКФ', packs: ['common', 'players', 'bio', 'apps'], hint: 'форум' }
};

const ORGS = { soc: 'Соц', crim: 'Крим', sil: 'Сил', law: 'Право', gibdd: 'ГИБДД', smi: 'СМИ', mo: 'МО' };

const LEVELS = {
    ga: { name: 'Главная администрация', icon: 'crown', packs: '*', hide: ['ga', 'zga'] },
    curator: { name: 'Куратор', icon: 'star', dirs: ['admin', 'orgs', 'forum'], hide: [] },
    deputy: { name: 'Заместитель куратора', icon: 'users', dirs: ['admin', 'orgs', 'ap'], hide: ['kp'] },
    senior: { name: 'Старший следящий', icon: 'eye', dirs: ['orgs', 'ap'], hide: ['kp'] },
    watcher: { name: 'Следящий', icon: 'eye', dirs: ['orgs', 'ap'], hide: ['kp'] },
    admin: {
        name: 'Администратор',
        icon: 'shield',
        packs: ['common', 'players', 'bio', 'apps'],
        hide: ['kp']
    },
    jmod: { name: 'Младший модератор', icon: 'badge', packs: ['common', 'players'], hide: ['ga', 'zga', 'spec', 'kp'] },
    custom: { name: 'Свой набор', icon: 'gear', packs: '*', hide: [] }
};

// роли из ранних сборок
const LEGACY_ROLES = {
    zga: { role: 'ga' },
    agent: { role: 'jmod' },
    leader: { role: 'watcher', roleDir: 'orgs' },
    curator: { role: 'curator', roleDir: 'admin' }
};

const Access = {
    migrate() {
        const s = Settings.get();
        if (LEGACY_ROLES[s.role] && !s.roleDir) Settings.patch(x => Object.assign(x, LEGACY_ROLES[s.role]));
    },
    level() {
        return LEVELS[Settings.get().role] || LEVELS.ga;
    },
    direction() {
        const L = this.level(),
            dir = Settings.get().roleDir;
        return L.dirs ? DIRECTIONS[L.dirs.includes(dir) ? dir : L.dirs[0]] : null;
    },
    // «Куратор Администрации», «Следящий · Крим», «Администратор»
    title() {
        const s = Settings.get(),
            L = this.level(),
            D = this.direction();
        if (!s.role) return '';
        if (!D) return L.name;
        if (s.roleDir === 'orgs' && ORGS[s.roleOrg]) return `${L.name} · ${ORGS[s.roleOrg]}`;
        return `${L.name} ${D.name}`;
    },
    defaultPacks() {
        const D = this.direction();
        return D ? D.packs : this.level().packs;
    },
    packVisible(p) {
        const s = Settings.get();
        if (p.id in s.packVis) return s.packVis[p.id];
        const packs = this.defaultPacks();
        if (packs === '*') return true;
        const isOwn = !DEFAULT_PACKS.some(d => d.id === p.id);
        return isOwn || packs.includes(p.id);
    },
    verdictVisible(v) {
        const s = Settings.get();
        if (v in s.verdictVis) return s.verdictVis[v];
        return !this.level().hide.includes(v);
    },
    itemVisible(item) {
        return !Settings.get().hiddenItems.includes(item.id) && this.verdictVisible(item.verdict);
    },
    hideItem(id) {
        Settings.patch(s => {
            if (!s.hiddenItems.includes(id)) s.hiddenItems.push(id);
        });
    },
    showItem(id) {
        Settings.patch(s => {
            s.hiddenItems = s.hiddenItems.filter(x => x !== id);
        });
    },
    setRole(role, roleDir = '', roleOrg = '') {
        Settings.patch(s => Object.assign(s, { role, roleDir, roleOrg, packVis: {}, verdictVis: {} }));
    }
};

// форум: контекст, анализ, отправка
const Page = {
    threadBase() {
        const m = location.pathname.match(/^(.*?\/threads\/[^/]+\/)/);
        return m ? m[1] : null;
    },
    isThread() {
        return !!this.threadBase();
    },
    // у модератора есть ссылка threads/x/edit или галочки inline-mod
    canModerate() {
        const base = this.threadBase();
        if (!base) return false;
        const id = (base.match(/\.(\d+)\/$/) || [])[1];
        const edit = [...document.querySelectorAll('a[href*="/threads/"][href*="/edit"]')].some(
            a => !id || a.getAttribute('href').includes('.' + id + '/')
        );
        return edit || !!document.querySelector('.js-inlineModToggle, [data-xf-init~="inline-mod"]');
    },
    crumbs() {
        const bc = document.querySelector('.p-breadcrumbs');
        return bc ? bc.textContent.replace(/\s+/g, ' ').trim() : '';
    },
    // заголовок без префикса: копия узла без .label и .label-append
    title() {
        const t = document.querySelector('.p-title-value');
        if (!t) return '';
        const copy = t.cloneNode(true);
        copy.querySelectorAll('.label, .label-append, .labelLink').forEach(n => n.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
    },
    prefixLabel() {
        const l = document.querySelector('.p-title-value .label');
        return l ? l.textContent.trim() : '';
    },
    author() {
        const el =
            document.querySelector('.p-description .username') ||
            document.querySelector('.message--post .message-name .username') ||
            document.querySelector('.message-inner .username');
        return el
            ? { id: el.getAttribute('data-user-id') || '0', name: el.textContent.trim() }
            : { id: '0', name: 'Пользователь' };
    },
    me() {
        const text = document.querySelector('.p-navgroup-link--user .p-navgroup-linkText');
        if (text && text.textContent.trim()) return text.textContent.trim();
        const img = document.querySelector('.p-navgroup-link--user img[alt]');
        return img ? img.getAttribute('alt').trim() : '';
    },
    firstPost() {
        if (/\/page-\d+/.test(location.pathname)) return null;
        return (
            document.querySelector('.message--post .message-body .bbWrapper') ||
            document.querySelector('.message-body .bbWrapper')
        );
    },
    // текст поста вместе со свёрнутыми спойлерами (innerText их пропускает)
    postText(body) {
        const c = body.cloneNode(true);
        c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
        c.querySelectorAll('div, p, li, blockquote, tr').forEach(b => b.append('\n'));
        return c.textContent;
    },
    // картинки, видео и вложения файлами (они лежат рядом с текстом поста, а не внутри)
    postMedia(body) {
        const inPost = body.querySelectorAll('img.bbImage, video, .bbMediaWrapper').length;
        const msg = body.closest('.message');
        const files = msg ? msg.querySelectorAll('.message-attachments .attachmentList li').length : 0;
        return inPost + files;
    },
    token() {
        const i = document.querySelector('input[name="_xfToken"]');
        return i ? i.value : W.XF && W.XF.config ? W.XF.config.csrf : '';
    }
};

// признаки темы; strong = почти точно этот ответ
const Analyzer = {
    run(packs) {
        const body = Page.firstPost();
        if (!body) return { hints: [], facts: [], tags: {}, text: '' };
        const text = Page.postText(body);
        const links = [...body.querySelectorAll('a[href]')]
            .map(a => a.href)
            .concat(text.match(/https?:\/\/\S+/g) || []);
        const uniq = [...new Set(links.filter(h => !/forum\.blackrussia\.online\/(members|threads|forums)/.test(h)))];
        // встроенные видео XF превращает в iframe, ссылки на них в тексте уже нет
        const embeds = [...body.querySelectorAll('iframe[src], [data-media-site-id]')].map(
            e => e.getAttribute('src') || 'embed:' + e.getAttribute('data-media-site-id')
        );
        const videos = uniq
            .filter(h =>
                /youtu\.?be|rutube|vk\.com\/(video|clip)|vkvideo|disk\.yandex|drive\.google|cloud\.mail/.test(h)
            )
            .concat(embeds);
        const kinds = new Set(packs.map(p => p.kind));
        // ссылка на свой ВК в обжаловании обязательна, это не соцсеть-доказательство
        const vkProfile = h => /vk\.com\/(?!wall|photo|album|video|clip)[\w.]+\/?(\?.*)?$/.test(h);
        const social = uniq.filter(
            h =>
                /(vk\.com|t\.me|instagram\.com|tiktok\.com|ok\.ru)\//.test(h) &&
                !videos.includes(h) &&
                !(kinds.has('appeal') && vkProfile(h))
        );
        const media = Page.postMedia(body);
        const numbered = (text.match(/^\s*\d{1,2}\s*[.)]/gm) || []).length;
        const words = (text.match(/[A-Za-zА-Яа-яЁё]{2,}/g) || []).length;
        const timecodes = /\b\d{1,2}:\d{2}\b/.test(text);
        const nicks = [...new Set(text.match(/\b[A-Z][a-z]{1,15}_[A-Z][a-z]{1,15}\b/g) || [])];
        const author = Page.author().name;
        const target = nicks.find(n => n !== author) || '';
        const facts = [],
            tags = {};
        const tag = (t, why, strong = false) => {
            tags[t] = { why, strong };
        };

        facts.push({ k: 'Ссылки', v: String(uniq.length + media) });
        if (nicks.length) facts.push({ k: 'Ники', v: nicks.slice(0, 3).join(', ') });
        facts.push({ k: 'Слов', v: String(words) });

        const evidence = ['complaint', 'appeal', 'app'].some(k => kinds.has(k));
        const proofs = uniq.length + media - social.length;
        if (evidence && uniq.length + media === 0) tag('noproof', 'В теме нет ни одной ссылки или вложения', true);
        if (kinds.has('complaint') && videos.length && !timecodes)
            tag('timecode', 'Есть видео, но не указаны тайм-коды (нужны, если видео > 3 мин)', true);
        const needNumbered = kinds.has('app') ? 5 : kinds.has('complaint') || kinds.has('appeal') ? 4 : 0;
        if (needNumbered && numbered < Math.min(needNumbered, 3))
            tag('form', `Найдено пунктов формы: ${numbered} из ~${needNumbered}`, true);
        if (kinds.has('bio') && words < 200) tag('short', `Всего ${words} слов — для биографии маловато`, true);
        if (evidence && social.length)
            tag('social', `Ссылка на соцсеть: ${social[0].replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}`, !proofs);
        if (kinds.has('complaint') && proofs > 0 && !videos.length) tag('screens', 'Только скриншоты, видео нет');
        const age = this.daysSince(text);
        if (evidence && age > 2) tag('late', `Самая поздняя дата в теме — ${age} дн. назад`);
        if (
            /(мо(й|его|ему|ей|ю)|наш(его|ему)?)\s+(друг|брат|знаком|товарищ|напарник)|за друга|от лица друга|друга наказали/i.test(
                text
            )
        )
            tag('thirdparty', 'Похоже, жалоба подана за другого человека');
        if (/заблокир|\bбан\b|забанил|блокировк/i.test(text)) tag('ban', 'Речь о блокировке аккаунта');
        if (kinds.has('appeal') && !uniq.some(vkProfile)) tag('novk', 'В обжаловании нет ссылки на ВКонтакте');
        const hints = Object.entries(tags)
            .filter(([, v]) => v.strong)
            .map(([t, v]) => ({ tag: t, why: v.why }));
        return { hints, facts, target, tags, text: U.norm(text) };
    },

    // сколько дней назад была самая поздняя дата вида 01.10 / 01.10.2026 в тексте
    daysSince(text) {
        const now = new Date();
        let last = null;
        // с годом это точно дата; без года месяц двумя цифрами и не «в 10.05», «время 10.05», «1.5 км»
        for (const m of text.matchAll(/(^|[^\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d.])/g)) {
            const [, , dd, mm, yy] = m;
            if (!yy) {
                if (mm.length < 2) continue;
                const before = text.slice(Math.max(0, m.index - 12), m.index + m[1].length).toLowerCase();
                const after = text.slice(m.index + m[0].length, m.index + m[0].length + 6).toLowerCase();
                if (/(^|[^а-яё])(врем[а-яё]*:?\s*|в\s)$/.test(before)) continue;
                if (/^\s*(км|м(?![а-я])|ч(?![а-я])|час|мин|сек|млн|тыс|руб|%)/.test(after)) continue;
            }
            const d = +dd,
                mo = +mm - 1;
            if (d < 1 || d > 31 || mo < 0 || mo > 11) continue;
            let y = yy ? +yy : now.getFullYear();
            if (y < 100) y += 2000;
            let dt = new Date(y, mo, d);
            if (!yy && dt > now) dt = new Date(y - 1, mo, d);
            if (dt > now || now - dt > 400 * 864e5) continue;
            if (!last || dt > last) last = dt;
        }
        return last ? Math.floor((now - last) / 864e5) : 0;
    }
};

// подходит ли ответ к теме: по hint и по словам cue
const Match = {
    of(item, pack, an) {
        if (!an || !an.tags) return null;
        // у старых сохранённых ответов hint/cue нет, берём из стандартных
        const d = pack && Packs.defaultOf(pack, item);
        const hint = item.hint || (d && d.hint);
        const t = hint && an.tags[hint];
        if (t) return { strong: t.strong, why: t.why };
        const cue = item.cue || (d && d.cue);
        if (!cue || !an.text) return null;
        let m;
        try {
            m = an.text.match(new RegExp(cue, 'i'));
        } catch {
            return null;
        }
        return m ? { strong: false, why: `В тексте: «${m[0].trim()}»` } : null;
    }
};

const ANSWER_PALETTES = {
    classic: {
        name: 'Классика',
        nick: '#4FA3FF',
        approve: '#00C853',
        deny: '#FF3B3B',
        review: '#FFB300',
        close: '#9E9E9E',
        tech: '#29B6F6',
        ga: '#FF7043',
        kp: '#B388FF',
        none: '#FFFFFF'
    },
    neon: {
        name: 'Неон',
        nick: '#00E5FF',
        approve: '#39FF14',
        deny: '#FF0055',
        review: '#FFEA00',
        close: '#B0BEC5',
        tech: '#00B0FF',
        ga: '#FF6D00',
        kp: '#E040FB',
        none: '#FFFFFF'
    },
    soft: {
        name: 'Пастель',
        nick: '#8AB4F8',
        approve: '#81C995',
        deny: '#F28B82',
        review: '#FDD663',
        close: '#BDC1C6',
        tech: '#78D9EC',
        ga: '#FCAD70',
        kp: '#C58AF9',
        none: '#FFFFFF'
    },
    strict: {
        name: 'Строгий',
        nick: '#D0D3DA',
        approve: '#2FBF71',
        deny: '#E5484D',
        review: '#F5A524',
        close: '#8B8F9A',
        tech: '#3AA0FF',
        ga: '#FF7A45',
        kp: '#A970FF',
        none: '#FFFFFF'
    },
    gold: {
        name: 'Золото',
        nick: '#FFD54F',
        approve: '#AEEA00',
        deny: '#FF5252',
        review: '#FFC400',
        close: '#BCAAA4',
        tech: '#4FC3F7',
        ga: '#FF9100',
        kp: '#EA80FC',
        none: '#FFFFFF'
    }
};

const ANSWER_STYLES = {
    classic: 'Классический (по центру)',
    card: 'Карточка (текст в цитате)',
    strict: 'Строгий (слева, с разделителем)',
    compact: 'Компактный (без приветствия)'
};

const CURSOR_MARK = '\u2063'; // место для курсора из {cursor}

const Answer = {
    greeting() {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return 'Доброе утро';
        if (h >= 12 && h < 17) return 'Добрый день';
        if (h >= 17 && h < 23) return 'Добрый вечер';
        return 'Доброй ночи';
    },
    vars(ctx) {
        const s = Settings.get().answer,
            pal = ANSWER_PALETTES[s.palette] || ANSWER_PALETTES.classic;
        const a = ctx.author || Page.author();
        const d = new Date();
        return {
            greeting: this.greeting(),
            nick: a.name,
            user:
                s.mention && a.id !== '0'
                    ? `[URL='${location.origin}/members/${a.id}/'][COLOR=${pal.nick}][B]${a.name}[/B][/COLOR][/URL]`
                    : `[COLOR=${pal.nick}][B]${a.name}[/B][/COLOR]`,
            admin: s.signature || Page.me() || 'Администрация',
            date: d.toLocaleDateString('ru-RU'),
            time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            target: ctx.target || 'нарушитель',
            cursor: CURSOR_MARK
        };
    },
    fill(text, v) {
        return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
    },

    build(item, ctx = {}) {
        const s = Settings.get().answer,
            pal = ANSWER_PALETTES[s.palette] || ANSWER_PALETTES.classic;
        const v = this.vars(ctx);
        const body = this.fill(item.text, v).trim();
        const found = item.id && Packs.item(item.id);
        const kind =
            ctx.kind || (found && found.pack.kind) || (item.id && String(item.id).startsWith('bio-') ? 'bio' : '');
        const rawTail = item.tail !== undefined ? item.tail : Tails.get(kind, item.verdict);
        const tailText = String(rawTail).trim() === '-' ? '' : this.fill(rawTail, v).trim();
        const tail = tailText
            ? `[COLOR=${pal[item.verdict] || pal[VERDICT_BASE[item.verdict]] || pal.none}][B]${tailText}[/B][/COLOR]`
            : '';
        // деловой стиль: всегда «Здравствуйте», без «доброй ночи»
        const greet = s.greet && s.style !== 'compact' ? `Здравствуйте, ${v.user}.` : '';
        const sig = s.signature ? `[I]С уважением, ${s.signature}.[/I]` : '';
        const blocks = [];
        if (s.banner) blocks.push(`[IMG]${s.banner}[/IMG]`);

        if (s.style === 'card') {
            if (greet) blocks.push(greet);
            blocks.push(`[QUOTE]${body}[/QUOTE]`);
            if (tail) blocks.push(tail);
        } else if (s.style === 'strict') {
            if (greet) blocks.push(greet);
            blocks.push(body);
            if (tail) blocks.push(`———————————\n${tail}`);
        } else {
            if (greet) blocks.push(greet);
            blocks.push(body);
            if (tail) blocks.push(tail);
        }
        if (sig) blocks.push(sig);

        let out = blocks.filter(Boolean).join('\n\n');
        if (s.size && s.size !== '4') out = `[SIZE=${s.size}]${out}[/SIZE]`;
        if (s.font) out = `[FONT=${s.font}]${out}[/FONT]`;
        const align = s.style === 'strict' ? '' : s.style === 'compact' ? '' : 'CENTER';
        return align ? `[${align}]${out}[/${align}]` : out;
    },
    // BBCode вставляем как текст, XF разберёт при отправке
    toEditorHtml(bb) {
        return bb
            .split('\n')
            .map(line => U.esc(line) || '<br>')
            .map(l => `<p>${l}</p>`)
            .join('');
    }
};

const Editor = {
    forms() {
        return [...document.querySelectorAll('form.js-quickReply, form[action$="/add-reply"]')].filter(
            (f, i, a) => a.indexOf(f) === i
        );
    },
    froala(form) {
        try {
            const XF = W.XF;
            if (!XF || !XF.getEditorInContainer) return null;
            let ed = null;
            try {
                ed = XF.getEditorInContainer(form);
            } catch {
                /* ignore */
            }
            if (!ed && W.jQuery) ed = XF.getEditorInContainer(W.jQuery(form));
            return ed && ed.ed ? ed.ed : null;
        } catch {
            return null;
        }
    },
    parts(form) {
        const el = form.querySelector('.fr-element');
        // режим BBCode / без Froala: видимое поле message или message_html
        const tas = [...form.querySelectorAll('textarea[name="message"], textarea[name="message_html"]')];
        const ta = tas.find(t => t.offsetParent !== null) || tas[0] || null;
        const richVisible = el && el.offsetParent !== null;
        return { el, ta, rich: !!richVisible };
    },
    isEmpty(form) {
        const { el, ta, rich } = this.parts(form);
        if (rich) return !(el.innerText || '').trim() && !el.querySelector('img');
        return !(ta && ta.value.trim());
    },
    getText(form) {
        const { el, ta, rich } = this.parts(form);
        return rich ? el.innerText : ta ? ta.value : '';
    },
    insert(form, bb, { replace } = {}) {
        const { el, ta, rich } = this.parts(form);
        const fr = this.froala(form);
        const doReplace = replace || this.isEmpty(form);
        if (rich) {
            const html = Answer.toEditorHtml(bb);
            if (fr && fr.html) {
                try {
                    if (doReplace) fr.html.set(html);
                    else {
                        if (!this._caretIn(el)) this._caretToEnd(el);
                        fr.html.insert(html);
                    }
                    fr.undo && fr.undo.saveStep();
                } catch {
                    this._domInsert(el, html, doReplace);
                }
            } else this._domInsert(el, html, doReplace);
            this._placeCursor(el);
        } else if (ta) {
            const clean = bb;
            if (doReplace) ta.value = clean;
            else {
                const s = ta.selectionStart ?? ta.value.length,
                    e = ta.selectionEnd ?? s;
                ta.value = ta.value.slice(0, s) + clean + ta.value.slice(e);
            }
            const ci = ta.value.indexOf(CURSOR_MARK);
            ta.value = ta.value.split(CURSOR_MARK).join('');
            ta.focus();
            const pos = ci >= 0 ? ci : ta.value.length;
            ta.setSelectionRange(pos, pos);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
    },
    _caretIn(el) {
        const sel = window.getSelection();
        return sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer);
    },
    _caretToEnd(el) {
        el.focus();
        const r = document.createRange(),
            sel = window.getSelection();
        r.selectNodeContents(el);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
    },
    _domInsert(el, html, replace) {
        if (!this._caretIn(el)) this._caretToEnd(el);
        el.focus();
        if (replace) el.innerHTML = html;
        else if (!document.execCommand('insertHTML', false, html)) el.insertAdjacentHTML('beforeend', html);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    },

    _placeCursor(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node,
            found = null;
        while ((node = walker.nextNode())) {
            const i = node.data.indexOf(CURSOR_MARK);
            if (i >= 0) {
                found = { node, i };
                break;
            }
        }
        el.focus();
        const sel = window.getSelection(),
            r = document.createRange();
        // лишние метки (несколько {cursor} в шаблоне) убираем, иначе уйдут в пост
        const extra = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = extra.nextNode()))
            if (t !== (found && found.node) && t.data.includes(CURSOR_MARK))
                t.data = t.data.split(CURSOR_MARK).join('');
        if (found) {
            found.node.data = found.node.data.split(CURSOR_MARK).join('');
            // «текст {cursor} текст»: два пробела подряд браузер схлопнет и съест набранный пробел
            const data = found.node.data;
            if (data[found.i - 1] === ' ' && data[found.i] === ' ')
                found.node.data = data.slice(0, found.i) + '\u00a0' + data.slice(found.i + 1);
            r.setStart(found.node, found.i);
        } else {
            r.selectNodeContents(el);
            r.collapse(false);
        }
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
    },

    eraseBeforeCaret(n) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const r = sel.getRangeAt(0);
        if (r.startContainer.nodeType !== 3 || r.startOffset < n) return;
        const del = document.createRange();
        del.setStart(r.startContainer, r.startOffset - n);
        del.setEnd(r.startContainer, r.startOffset);
        del.deleteContents();
    }
};

const Status = {
    async xf(url, fields) {
        const fd = new FormData();
        fd.append('_xfToken', Page.token());
        fd.append('_xfRequestUri', location.pathname + location.search);
        fd.append('_xfWithData', '1');
        fd.append('_xfResponseType', 'json');
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
        const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' });
        let json = null;
        try {
            json = await res.clone().json();
        } catch {
            /* ignore */
        }
        if (!res.ok || (json && json.status === 'error')) {
            const msg = json && json.errors ? [].concat(json.errors).join(' ') : `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return json;
    },
    // префикс, закрытие и закреп темы
    async apply(verdict, keepOpen = false) {
        const cfg = Settings.get().status.map[verdict];
        const base = Page.threadBase();
        if (!cfg || !base) return false;
        const title = Page.title();
        if (!title) throw new Error('не найден заголовок темы');
        await this.xf(base + 'edit', {
            prefix_id: String(cfg.prefix),
            title,
            discussion_open: cfg.open || keepOpen ? '1' : '0',
            sticky: cfg.sticky ? '1' : '0',
            // без _xfSet XenForo 2 не трогает галочки «открыта» и «закреплена»
            '_xfSet[discussion_open]': '1',
            '_xfSet[sticky]': '1'
        });
        return true;
    },
    async reply(bb) {
        const base = Page.threadBase();
        await this.xf(base + 'add-reply', { message: bb.replace(new RegExp(CURSOR_MARK, 'g'), '') });
    },

    async instant(item, ctx) {
        const bb = Answer.build(item, ctx);
        await this.reply(bb);
        Usage.bump(item.id);
        MyStats.add(item, ctx);
        // ответ уже в теме: ошибка статуса не должна выглядеть как неудачная отправка
        let statusError = null;
        if (Settings.get().status.apply && item.verdict !== 'none')
            await this.apply(item.verdict, Packs.keepsOpen(item)).catch(e => (statusError = e));
        if (statusError) {
            toast('Ответ отправлен, но статус не изменён: ' + statusError.message, 'err');
            setTimeout(() => location.reload(), 2500);
        } else location.reload();
    }
};

// предпросмотр
// рендер BBCode как в XF2, шрифт и цвета со страницы

const BB = {
    // [SIZE=1..7] в XenForo 2 = 9 / 10 / 12 / 15 / 18 / 22 / 26 px
    sizes: { 1: 9, 2: 10, 3: 12, 4: 15, 5: 18, 6: 22, 7: 26 },
    render(bb) {
        let s = U.esc(bb).replace(new RegExp(CURSOR_MARK, 'g'), '<span class="bb-cur"></span>');
        const rep = (re, fn) => {
            let prev;
            do {
                prev = s;
                s = s.replace(re, fn);
            } while (s !== prev);
        };
        const q = '(?:&#39;|&quot;)?';
        rep(/\[B\]([\s\S]*?)\[\/B\]/gi, '<b>$1</b>');
        rep(/\[I\]([\s\S]*?)\[\/I\]/gi, '<i>$1</i>');
        rep(/\[U\]([\s\S]*?)\[\/U\]/gi, '<u>$1</u>');
        rep(/\[S\]([\s\S]*?)\[\/S\]/gi, '<s>$1</s>');
        rep(/\[COLOR=(#[0-9a-f]{3,8}|[a-z]+)\]([\s\S]*?)\[\/COLOR\]/gi, '<span style="color:$1">$2</span>');
        rep(
            /\[SIZE=([1-7])\]([\s\S]*?)\[\/SIZE\]/gi,
            (m, n, t) => `<span style="font-size:${BB.sizes[n]}px">${t}</span>`
        );
        rep(/\[FONT=([\w\s-]+)\]([\s\S]*?)\[\/FONT\]/gi, '<span style="font-family:\'$1\'">$2</span>');
        rep(
            /\[(CENTER|LEFT|RIGHT)\]([\s\S]*?)\[\/\1\]/gi,
            (m, a, t) => `<div style="text-align:${a.toLowerCase()}">${t}</div>`
        );
        rep(
            new RegExp(`\\[URL=${q}([^\\]]*?)${q}\\]([\\s\\S]*?)\\[\\/URL\\]`, 'gi'),
            '<span class="bb-link">$2</span>'
        );
        rep(/\[URL\]([\s\S]*?)\[\/URL\]/gi, '<span class="bb-link">$1</span>');
        rep(/\[USER=\d+\]([\s\S]*?)\[\/USER\]/gi, '<span class="bb-link">@$1</span>');
        rep(
            new RegExp(`\\[QUOTE=${q}([^\\]]*?)${q}\\]([\\s\\S]*?)\\[\\/QUOTE\\]`, 'gi'),
            '<div class="bb-quote"><div class="bb-quote-head">$1 сказал(а):</div>$2</div>'
        );
        rep(/\[QUOTE\]([\s\S]*?)\[\/QUOTE\]/gi, '<div class="bb-quote">$1</div>');
        rep(
            new RegExp(`\\[SPOILER(?:=${q}([^\\]]*?)${q})?\\]([\\s\\S]*?)\\[\\/SPOILER\\]`, 'gi'),
            (m, t, body) =>
                `<div class="bb-spoiler"><span class="bb-spoiler-btn">Спойлер${t ? ': ' + t : ''}</span><div class="bb-spoiler-body">${body}</div></div>`
        );
        rep(/\[IMG(?:[^\]]*)\](https:\/\/[^\s[]+?)\[\/IMG\]/gi, '<img class="bb-img" src="$1" alt="">');
        return s
            .replace(/\n/g, '<br>')
            .replace(/(<\/div>)<br>/g, '$1')
            .replace(/<br>(<div)/g, '$1');
    }
};

const ForumLook = {
    _v: null,
    get() {
        if (this._v) return this._v;
        const body = document.querySelector('.message .bbWrapper');
        const msg = document.querySelector('.message-inner, .message');
        const css = el => (el ? getComputedStyle(el) : null);
        const b = css(body),
            m = css(msg);
        const solid = c => (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : '');
        this._v = {
            font: b ? b.fontFamily : '',
            size: b ? b.fontSize : '15px',
            line: b ? b.lineHeight : '1.55',
            color: b ? b.color : '',
            bg: solid(m && m.backgroundColor)
        };
        return this._v;
    }
};

// проверка RP-биографий
// правила 1.1-1.10 и форма; копирование и реализм автоматом не проверить, там пометка «проверь сам»

const BIO_FORM = [
    'Имя и фамилия',
    'Пол',
    'Возраст',
    'Национальность',
    'Образование',
    'Описание внешности',
    'Характер',
    'Детство',
    'Настоящее время',
    'Итог'
];

// как причина звучит в ответе игроку
const BIO_REASONS = {
    1.1: 'заголовок должен быть по форме «Биография | Nick_Name»',
    1.2: 'персонаж не может обладать сверхспособностями',
    1.3: 'нельзя писать биографию реального человека',
    1.4: 'биография должна быть написана самостоятельно',
    1.5: 'в тексте есть ошибки, перечитайте и исправьте',
    1.6: 'текст должен быть набран шрифтом Times New Roman или Verdana, размером от 15',
    1.7: 'нужны фотографии или другие материалы о персонаже',
    1.8: 'в биографии не должно быть того, что даёт повод нарушать правила',
    1.9: 'объём от 200 до 600 слов',
    '1.10': 'в биографии не должно быть противоречий',
    форма: 'заполните все пункты формы подачи'
};

const BIO_LIMITS = { minWords: 200, maxWords: 600, minFont: 15, fonts: /times new roman|verdana/i };

const BIO_PATTERNS = {
    powers: /сверхспособн|бессмерт|телепорт|телекинез|магическ|супергеро|читает мысли|невидимк/i,
    famous: /б[рэе]+д[аеу]? питт|аль капоне|илон[аеу]? маск|джонни депп|путин|навальн/i,
    violation: /убива\S* всех|маньяк|серийн\S* убийц|психическ\S* боль|ненавидит всех и убивает/i,
    grownUp: /университет|высше[ем] образовани|свой бизнес|бизнесмен|миллион|служил|армии|женат|замужем|работал/i
};

const BioCheck = {
    words(text) {
        return (text.match(/[A-Za-zА-Яа-яЁё0-9-]{2,}/g) || []).length;
    },

    // доля текста, набранного разрешённым шрифтом не мельче 15px
    fontShare(body) {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        const cache = new Map();
        let total = 0,
            good = 0,
            node;
        while ((node = walker.nextNode())) {
            const len = node.data.replace(/\s+/g, '').length;
            if (!len || node.parentElement.closest('.bbCodeBlock')) continue;
            const el = node.parentElement;
            if (!cache.has(el)) {
                const cs = getComputedStyle(el);
                const family = cs.fontFamily.split(',')[0].replace(/["']/g, '');
                cache.set(el, BIO_LIMITS.fonts.test(family) && parseFloat(cs.fontSize) >= BIO_LIMITS.minFont);
            }
            total += len;
            if (cache.get(el)) good += len;
        }
        return total ? good / total : 0;
    },

    run() {
        const body = Page.firstPost();
        if (!body) return null;
        const text = Page.postText(body);
        const title = Page.title();
        const res = [];
        const add = (rule, name, status, note) => res.push({ rule, name, status, note, reason: BIO_REASONS[rule] });

        const nick = title.match(/биография\s*\|\s*([A-Z][a-z]+[_ ][A-Z][a-z]+)/i);
        add('1.1', 'Заголовок «Биография | Nick_Name»', nick ? 'ok' : 'fail', nick ? nick[1] : `сейчас «${title}»`);

        add(
            '1.2',
            'Без сверхспособностей',
            BIO_PATTERNS.powers.test(text) ? 'warn' : 'ok',
            BIO_PATTERNS.powers.test(text) ? `есть «${text.match(BIO_PATTERNS.powers)[0]}» — проверь` : ''
        );
        add(
            '1.3',
            'Не биография реального человека',
            BIO_PATTERNS.famous.test(text) ? 'warn' : 'ok',
            BIO_PATTERNS.famous.test(text) ? `упоминается «${text.match(BIO_PATTERNS.famous)[0]}»` : ''
        );
        add('1.4', 'Не скопирована', 'manual', 'автоматически не проверить');

        const lowerStarts = (text.match(/[.!?]\s+[а-яё]/g) || []).length;
        const spaces = (text.match(/\s[,.!?]/g) || []).length;
        const sloppy = lowerStarts + spaces;
        add(
            '1.5',
            'Читабельно, без ошибок',
            sloppy > 6 ? 'warn' : 'ok',
            sloppy > 6
                ? `${lowerStarts} предл. с маленькой буквы, ${spaces} пробелов перед знаками`
                : 'грубых ошибок не видно'
        );

        const share = this.fontShare(body);
        add(
            '1.6',
            'Times New Roman или Verdana, от 15',
            share >= 0.9 ? 'ok' : share >= 0.5 ? 'warn' : 'fail',
            share >= 0.9 ? '' : `так набрано ${Math.round(share * 100)}% текста`
        );

        const media = Page.postMedia(body);
        add('1.7', 'Есть фото или материалы', media ? 'ok' : 'fail', media ? `${media} шт.` : '');

        add(
            '1.8',
            'Нет поводов нарушать правила',
            BIO_PATTERNS.violation.test(text) ? 'warn' : 'ok',
            BIO_PATTERNS.violation.test(text) ? `есть «${text.match(BIO_PATTERNS.violation)[0]}»` : ''
        );

        const words = this.words(text);
        add(
            '1.9',
            `Объём ${BIO_LIMITS.minWords}–${BIO_LIMITS.maxWords} слов`,
            words >= BIO_LIMITS.minWords && words <= BIO_LIMITS.maxWords ? 'ok' : 'fail',
            `сейчас ${words}`
        );

        const age = +((text.match(/возраст\D{0,12}(\d{1,3})/i) || [])[1] || 0);
        const young = age && age < 18 && BIO_PATTERNS.grownUp.test(text);
        add(
            '1.10',
            'Без противоречий',
            !age ? 'warn' : young || age > 90 ? 'warn' : 'ok',
            !age
                ? 'возраст не найден'
                : young
                  ? `${age} лет, но упоминается «${text.match(BIO_PATTERNS.grownUp)[0]}»`
                  : `возраст ${age}`
        );

        const missing = BIO_FORM.filter(f => !new RegExp(f.replace(/\s+/g, '\\s+'), 'i').test(text));
        add(
            'форма',
            'Все пункты формы',
            missing.length ? 'fail' : 'ok',
            missing.length ? 'нет: ' + missing.join(', ').toLowerCase() : ''
        );

        const count = st => res.filter(r => r.status === st).length;
        return { res, fails: count('fail'), warns: count('warn'), words, text };
    },

    reasons(report, statuses) {
        return report.res
            .filter(r => statuses.includes(r.status))
            .map(
                r =>
                    `• ${r.rule === 'форма' ? 'Форма' : 'Пункт ' + r.rule}: ${r.reason}${r.note ? ` (${r.note})` : ''}.`
            )
            .join('\n');
    },

    // ответы по итогам проверки, если ничего не нашлось, то {cursor} под свою причину
    answers(report) {
        const fails = this.reasons(report, ['fail']);
        const all = this.reasons(report, ['fail', 'warn']);
        return {
            deny: {
                id: 'bio-auto-deny',
                verdict: 'deny',
                title: 'Отказ по итогам проверки',
                text: `${fails || all || '{cursor}'}`
            },
            fix: {
                id: 'bio-auto-fix',
                verdict: 'review',
                title: 'На доработку',
                tail: 'На доработку — 24 часа.',
                open: true,
                text: `${all || '{cursor}'}\n\nНе исправлено за 24 часа — отказ.`
            },
            approve: {
                id: 'bio-auto-ok',
                verdict: 'approve',
                title: 'Биография одобрена',
                text: 'Требования соблюдены.'
            }
        };
    },

    // необязательная проверка орфографии через Яндекс.Спеллер (только по кнопке)
    spell(text) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function')
                return reject(new Error('менеджер скриптов не дал доступ к сети'));
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://speller.yandex.net/services/spellservice.json/checkText',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: 'lang=ru,en&options=4&text=' + encodeURIComponent(text.slice(0, 9500)),
                timeout: 15000,
                onload: r => {
                    try {
                        resolve(JSON.parse(r.responseText));
                    } catch {
                        reject(new Error('непонятный ответ спеллера'));
                    }
                },
                onerror: () => reject(new Error('нет связи со спеллером')),
                ontimeout: () => reject(new Error('спеллер не ответил'))
            });
        });
    }
};

// генеративные обои
// фоны рисуются в canvas по seed, один seed = одна картинка
// в углу метка VERDICT
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function noise2(seed) {
    const r = rng(seed),
        p = new Uint8Array(512),
        g = [];
    for (let i = 0; i < 256; i++) {
        p[i] = i;
        const a = r() * Math.PI * 2;
        g.push([Math.cos(a), Math.sin(a)]);
    }
    for (let i = 255; i > 0; i--) {
        const j = (r() * (i + 1)) | 0;
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (h, x, y) => {
        const v = g[h & 255];
        return v[0] * x + v[1] * y;
    };
    const n = (x, y) => {
        const X = Math.floor(x),
            Y = Math.floor(y),
            xf = x - X,
            yf = y - Y,
            xi = X & 255,
            yi = Y & 255;
        const u = fade(xf),
            v = fade(yf);
        const aa = p[p[xi] + yi],
            ab = p[p[xi] + yi + 1],
            ba = p[p[xi + 1] + yi],
            bb = p[p[xi + 1] + yi + 1];
        const x1 = dot(aa, xf, yf) + u * (dot(ba, xf - 1, yf) - dot(aa, xf, yf));
        const x2 = dot(ab, xf, yf - 1) + u * (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1));
        return x1 + v * (x2 - x1);
    };
    return (x, y, oct = 4) => {
        let s = 0,
            amp = 0.5,
            f = 1;
        for (let o = 0; o < oct; o++) {
            s += amp * n(x * f, y * f);
            amp *= 0.5;
            f *= 2;
        }
        return s;
    };
}
const PALETTES = [
    ['#0b0f1a', '#1b2a4a', '#3d5a99', '#ff4d6d', '#ffd6a5'],
    ['#07070b', '#2a0b2e', '#7a1c4b', '#ff3864', '#ffb86b'],
    ['#050a0a', '#0b2b26', '#14675b', '#2ec4b6', '#cbf3f0'],
    ['#0a0a0f', '#1d1b3a', '#4b3f9e', '#9d7bff', '#ffe1ff'],
    ['#0c0806', '#2b1810', '#7a3b1d', '#ff7a2f', '#ffd29d'],
    ['#05070d', '#0d1b2a', '#1b4965', '#5fa8d3', '#e0fbfc'],
    ['#0a0507', '#2d0a12', '#6b0f1a', '#e5484d', '#f8c8c8'],
    ['#06060a', '#141422', '#2e2e4f', '#7c7cff', '#d6d6ff']
];
const hexRgb = h => {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ramp = (pal, t) => {
    t = Math.max(0, Math.min(0.9999, t)) * (pal.length - 1);
    const i = Math.floor(t);
    return mix(hexRgb(pal[i]), hexRgb(pal[i + 1]), t - i);
};

const GENERATORS = {
    nightroad: {
        name: 'Ночная трасса',
        draw(c, w, h, r, pal) {
            const sky = c.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, pal[0]);
            sky.addColorStop(0.55, pal[1]);
            sky.addColorStop(0.62, pal[2]);
            c.fillStyle = sky;
            c.fillRect(0, 0, w, h);
            const hz = h * 0.6;
            for (let i = 0; i < 160; i++) {
                c.fillStyle = `rgba(255,255,255,${r() * 0.6})`;
                c.fillRect(r() * w, r() * hz * 0.8, 1.2, 1.2);
            }
            // город на горизонте
            for (let x = 0; x < w; ) {
                const bw = 20 + r() * 60,
                    bh = 20 + r() * h * 0.22;
                c.fillStyle = pal[0];
                c.fillRect(x, hz - bh, bw, bh);
                for (let wy = hz - bh + 6; wy < hz - 4; wy += 7)
                    for (let wx = x + 4; wx < x + bw - 4; wx += 6)
                        if (r() < 0.22) {
                            c.fillStyle = `rgba(255,214,165,${0.3 + r() * 0.6})`;
                            c.fillRect(wx, wy, 2, 3);
                        }
                x += bw + r() * 6;
            }
            c.fillStyle = pal[0];
            c.fillRect(0, hz, w, h - hz);
            // световые следы фар
            const vp = w * (0.35 + r() * 0.3);
            for (let i = 0; i < 26; i++) {
                const side = r() < 0.5 ? -1 : 1,
                    spread = (0.2 + r() * 1.1) * w;
                c.strokeStyle =
                    side < 0
                        ? `rgba(255,${60 + r() * 60},${80 + r() * 40},${0.35 + r() * 0.5})`
                        : `rgba(255,${210 + r() * 40},${160 + r() * 60},${0.35 + r() * 0.5})`;
                c.lineWidth = 1 + r() * 3.5;
                c.shadowColor = c.strokeStyle;
                c.shadowBlur = 18;
                c.beginPath();
                c.moveTo(vp, hz);
                c.lineTo(vp + side * spread, h + 20);
                c.stroke();
            }
            c.shadowBlur = 0;
            const glow = c.createRadialGradient(vp, hz, 0, vp, hz, w * 0.5);
            glow.addColorStop(0, U.hexA(pal[3], 0.35));
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = glow;
            c.fillRect(0, 0, w, h);
        }
    },
    aurora: {
        name: 'Аврора',
        draw(c, w, h, r, pal) {
            c.fillStyle = pal[0];
            c.fillRect(0, 0, w, h);
            for (let i = 0; i < 220; i++) {
                c.fillStyle = `rgba(255,255,255,${r() * 0.5})`;
                c.fillRect(r() * w, r() * h, 1, 1);
            }
            c.globalCompositeOperation = 'lighter';
            for (let b = 0; b < 6; b++) {
                const col = pal[2 + (b % 3)],
                    y0 = h * (0.2 + r() * 0.35),
                    amp = h * (0.05 + r() * 0.12),
                    f = 1 + r() * 3,
                    ph = r() * 6;
                for (let x = 0; x < w; x += 3) {
                    const y = y0 + Math.sin((x / w) * Math.PI * f + ph) * amp;
                    const g = c.createLinearGradient(x, y - h * 0.3, x, y);
                    g.addColorStop(0, 'rgba(0,0,0,0)');
                    g.addColorStop(0.75, U.hexA(col, 0.07 + r() * 0.05));
                    g.addColorStop(1, U.hexA(col, 0.16 + r() * 0.08));
                    c.fillStyle = g;
                    c.fillRect(x, y - h * 0.3, 3, h * 0.3 + 4);
                }
            }
            c.globalCompositeOperation = 'source-over';
            const g = c.createLinearGradient(0, h * 0.7, 0, h);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, pal[0]);
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
            c.fillStyle = pal[0];
            c.beginPath();
            c.moveTo(0, h);
            for (let x = 0; x <= w; x += 20)
                c.lineTo(x, h * 0.86 - Math.abs(Math.sin(x * 0.004 + r())) * h * 0.08 - r() * 6);
            c.lineTo(w, h);
            c.fill();
        }
    },
    synth: {
        name: 'Синтвейв',
        draw(c, w, h, r, pal) {
            const hz = h * 0.58,
                sky = c.createLinearGradient(0, 0, 0, hz);
            sky.addColorStop(0, pal[0]);
            sky.addColorStop(1, pal[2]);
            c.fillStyle = sky;
            c.fillRect(0, 0, w, hz);
            const cx = w * (0.3 + r() * 0.4),
                rad = h * 0.2;
            const sun = c.createLinearGradient(0, hz - rad * 2, 0, hz);
            sun.addColorStop(0, pal[4]);
            sun.addColorStop(1, pal[3]);
            c.fillStyle = sun;
            c.beginPath();
            c.arc(cx, hz, rad, Math.PI, 0);
            c.fill();
            c.fillStyle = pal[2];
            for (let i = 0; i < 7; i++) {
                const y = hz - rad * 0.12 - i * rad * 0.13;
                c.fillRect(cx - rad, y, rad * 2, 2 + i * 0.6);
            }
            c.fillStyle = pal[0];
            c.fillRect(0, hz, w, h - hz);
            c.strokeStyle = U.hexA(pal[3], 0.75);
            c.lineWidth = 1.3;
            c.shadowColor = pal[3];
            c.shadowBlur = 8;
            for (let i = 0; i < 18; i++) {
                const t = Math.pow(i / 18, 2.2),
                    y = hz + t * (h - hz);
                c.beginPath();
                c.moveTo(0, y);
                c.lineTo(w, y);
                c.stroke();
            }
            for (let i = -24; i <= 24; i++) {
                c.beginPath();
                c.moveTo(cx + i * 6, hz);
                c.lineTo(cx + i * w * 0.09, h);
                c.stroke();
            }
            c.shadowBlur = 0;
            c.fillStyle = pal[1];
            for (let x = 0; x < w; x += 2) {
                const m = Math.abs(Math.sin(x * 0.006 + r() * 0.02)) * h * 0.06 + Math.sin(x * 0.02) * 4;
                c.fillRect(x, hz - m, 2, m);
            }
        }
    },
    thunder: {
        name: 'Грозовая ночь',
        lowres: 0.5,
        // почти чёрное небо под анимированные молнии
        draw(c, w, h, r, pal, seed) {
            const n = noise2(seed),
                img = c.createImageData(w, h),
                d = img.data,
                sc = 3.2 / w;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const t = y / h,
                        v = Math.max(0, n(x * sc, y * sc * 1.6, 5) * 1.5 + 0.35) * Math.max(0, 1 - t * 1.25);
                    const i = (y * w + x) * 4;
                    d[i] = 3 + v * 22;
                    d[i + 1] = 4 + v * 24;
                    d[i + 2] = 8 + v * 34;
                    d[i + 3] = 255;
                }
            c.putImageData(img, 0, 0);
            const g = c.createLinearGradient(0, h * 0.75, 0, h);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,.9)');
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
        }
    },
    smoke: {
        name: 'Дым',
        lowres: true,
        draw(c, w, h, r, pal, seed) {
            const n = noise2(seed),
                m = noise2(seed + 7),
                img = c.createImageData(w, h),
                d = img.data,
                sc = 3 / w;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const qx = n(x * sc, y * sc, 3),
                        qy = m(x * sc + 5.2, y * sc + 1.3, 3);
                    const v = n(x * sc + 2.5 * qx, y * sc + 2.5 * qy, 5) * 1.4 + 0.45;
                    const col = ramp(pal, Math.max(0, v) * 0.95),
                        i = (y * w + x) * 4;
                    d[i] = col[0];
                    d[i + 1] = col[1];
                    d[i + 2] = col[2];
                    d[i + 3] = 255;
                }
            c.putImageData(img, 0, 0);
        }
    },
    rain: {
        name: 'Дождь на стекле',
        draw(c, w, h, r, pal) {
            const g = c.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, pal[1]);
            g.addColorStop(1, pal[0]);
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
            c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 70; i++) {
                const x = r() * w,
                    y = r() * h,
                    rad = 20 + r() * 90,
                    col = pal[2 + ((r() * 3) | 0)];
                const b = c.createRadialGradient(x, y, 0, x, y, rad);
                b.addColorStop(0, U.hexA(col, 0.25 + r() * 0.25));
                b.addColorStop(0.7, U.hexA(col, 0.08));
                b.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = b;
                c.beginPath();
                c.arc(x, y, rad, 0, 7);
                c.fill();
            }
            c.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 420; i++) {
                const x = r() * w,
                    y = r() * h,
                    s = 1 + r() * 3.2;
                c.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
                c.beginPath();
                c.ellipse(x, y, s, s * 1.25, 0, 0, 7);
                c.fill();
                if (r() < 0.12) {
                    c.fillRect(x - 0.5, y, 1, 20 + r() * 80);
                }
            }
        }
    },
    stars: {
        name: 'Созвездия',
        draw(c, w, h, r, pal) {
            const g = c.createRadialGradient(w * r(), h * r(), 0, w / 2, h / 2, w);
            g.addColorStop(0, pal[2]);
            g.addColorStop(0.5, pal[1]);
            g.addColorStop(1, pal[0]);
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
            for (let i = 0; i < 900; i++) {
                const s = r() < 0.97 ? 0.9 : 2;
                c.fillStyle = `rgba(255,255,255,${r() * 0.8})`;
                c.fillRect(r() * w, r() * h, s, s);
            }
            c.strokeStyle = U.hexA(pal[4], 0.35);
            c.lineWidth = 1;
            for (let k = 0; k < 7; k++) {
                let x = r() * w,
                    y = r() * h;
                c.beginPath();
                c.moveTo(x, y);
                const pts = 3 + ((r() * 5) | 0);
                for (let j = 0; j < pts; j++) {
                    x += (r() - 0.5) * 220;
                    y += (r() - 0.5) * 160;
                    c.lineTo(x, y);
                    c.fillStyle = pal[4];
                    c.fillRect(x - 1.5, y - 1.5, 3, 3);
                }
                c.stroke();
            }
        }
    },
    poly: {
        name: 'Полигоны',
        draw(c, w, h, r, pal) {
            const cols = 16,
                rows = 10,
                pts = [];
            for (let y = 0; y <= rows; y++)
                for (let x = 0; x <= cols; x++)
                    pts.push([
                        (x / cols) * w + (x % cols && (((r() - 0.5) * w) / cols) * 0.8),
                        (y / rows) * h + (y % rows && (((r() - 0.5) * h) / rows) * 0.8)
                    ]);
            const P = (x, y) => pts[y * (cols + 1) + x];
            const lx = r() * w,
                ly = r() * h * 0.5;
            for (let y = 0; y < rows; y++)
                for (let x = 0; x < cols; x++) {
                    const tri =
                        r() < 0.5
                            ? [
                                  [P(x, y), P(x + 1, y), P(x, y + 1)],
                                  [P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]
                              ]
                            : [
                                  [P(x, y), P(x + 1, y + 1), P(x, y + 1)],
                                  [P(x, y), P(x + 1, y), P(x + 1, y + 1)]
                              ];
                    for (const t of tri) {
                        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3,
                            cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
                        const dist = Math.hypot(cx - lx, cy - ly) / Math.hypot(w, h);
                        const col = ramp(pal, Math.max(0, 0.85 - dist * 1.4 + (r() - 0.5) * 0.12));
                        c.fillStyle = `rgb(${col})`;
                        c.strokeStyle = c.fillStyle;
                        c.beginPath();
                        c.moveTo(...t[0]);
                        c.lineTo(...t[1]);
                        c.lineTo(...t[2]);
                        c.closePath();
                        c.fill();
                        c.stroke();
                    }
                }
        }
    },
    dunes: {
        name: 'Дюны',
        draw(c, w, h, r, pal) {
            const sky = c.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, pal[4]);
            sky.addColorStop(0.45, pal[3]);
            sky.addColorStop(1, pal[2]);
            c.fillStyle = sky;
            c.fillRect(0, 0, w, h);
            c.fillStyle = U.hexA('#ffffff', 0.85);
            c.beginPath();
            c.arc(w * (0.2 + r() * 0.6), h * (0.2 + r() * 0.15), h * 0.06, 0, 7);
            c.fill();
            for (let l = 0; l < 6; l++) {
                const base = h * (0.42 + l * 0.1),
                    amp = h * (0.03 + r() * 0.05),
                    f = 1 + r() * 2,
                    ph = r() * 6;
                c.fillStyle = `rgb(${ramp(pal, 0.75 - l * 0.13)})`;
                c.beginPath();
                c.moveTo(0, h);
                for (let x = 0; x <= w; x += 8)
                    c.lineTo(x, base + Math.sin((x / w) * Math.PI * f + ph) * amp + Math.sin(x * 0.01 + l) * amp * 0.3);
                c.lineTo(w, h);
                c.fill();
            }
        }
    },
    neon: {
        name: 'Неон',
        draw(c, w, h, r, pal) {
            c.fillStyle = pal[0];
            c.fillRect(0, 0, w, h);
            c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 9; i++) {
                const col = pal[2 + ((r() * 3) | 0)];
                c.strokeStyle = U.hexA(col, 0.8);
                c.lineWidth = 2 + r() * 3;
                c.shadowColor = col;
                c.shadowBlur = 30;
                c.beginPath();
                const y = r() * h,
                    k = (r() - 0.5) * 1.2;
                c.moveTo(-50, y);
                c.bezierCurveTo(w * 0.3, y + k * h, w * 0.7, y - k * h, w + 50, y + (r() - 0.5) * h * 0.5);
                c.stroke();
            }
            c.shadowBlur = 0;
            c.globalCompositeOperation = 'source-over';
            const v = c.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
            v.addColorStop(0, 'rgba(0,0,0,0)');
            v.addColorStop(1, 'rgba(0,0,0,0.7)');
            c.fillStyle = v;
            c.fillRect(0, 0, w, h);
        }
    }
};

const Wallpaper = {
    _cache: new Map(),
    render(gen, seed, w = 1600, h = 900) {
        // версия в ключе: после обновления генераторов старая картинка из кэша не показывается
        const key = `${BRAND.version}:${gen}:${seed}:${w}x${h}`;
        if (this._cache.has(key)) {
            const hit = this._cache.get(key);
            this._cache.delete(key);
            this._cache.set(key, hit);
            return hit;
        }
        // готовый фон с прошлой страницы: рисование и сжатие в JPEG занимают ~100 мс на каждом переходе
        try {
            const saved = JSON.parse(localStorage.getItem('vd.wallgen') || 'null');
            if (saved && saved.k === key) {
                this._cache.set(key, saved.u);
                return saved.u;
            }
        } catch {
            /* хранилище недоступно */
        }
        const G = GENERATORS[gen === 'topo' ? 'relief' : gen] || GENERATORS.nightroad;
        const r = rng(seed),
            pal = PALETTES[seed % PALETTES.length];
        const scale = G.lowres === true ? 0.3 : G.lowres || 1;
        const cw = Math.round(w * scale),
            ch = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        G.draw(cv.getContext('2d'), cw, ch, r, pal, seed);
        let out = cv;
        if (scale !== 1) {
            out = document.createElement('canvas');
            out.width = w;
            out.height = h;
            const oc = out.getContext('2d');
            oc.imageSmoothingQuality = 'high';
            oc.drawImage(cv, 0, 0, w, h);
        }

        const oc = out.getContext('2d');
        oc.font = `600 ${Math.max(9, w / 140)}px system-ui, sans-serif`;
        oc.fillStyle = 'rgba(255,255,255,0.16)';
        oc.textAlign = 'right';
        oc.fillText(`${BRAND.name} · ${gen}#${seed}`, w - 14, h - 12);
        const url = out.toDataURL('image/jpeg', 0.9);
        this._cache.set(key, url);
        // запоминаем только фон страницы (большой размер), превью в настройках не храним
        if (w >= 1200)
            try {
                localStorage.setItem('vd.wallgen', JSON.stringify({ k: key, u: url }));
            } catch {
                /* мало места */
            }
        // большие фоны весят мегабайты, держим последние 24
        while (this._cache.size > 24) this._cache.delete(this._cache.keys().next().value);
        return url;
    },

    current() {
        const t = Settings.get().theme,
            wall = t.wall;
        if (t.rotate !== 'off') {
            const gens = Object.keys(GENERATORS);
            let seed;
            if (t.rotate === 'hour') seed = Math.floor(Date.now() / 3600000);
            else {
                // один фон на всю страницу, даже если тема применяется повторно
                if (!this._visit) {
                    this._visit = Store.get('visitSeed', 1) + 1;
                    Store.set('visitSeed', this._visit);
                }
                seed = this._visit;
            }
            const photos = Store.get('photos', []);
            const pool = gens.length + photos.length;
            const pick = seed % pool;
            if (pick >= gens.length) return photos[pick - gens.length].src;
            return this.render(gens[pick], (seed * 7919) % 100000);
        }
        if (wall.kind === 'url' && wall.url) return wall.url;
        if (wall.kind === 'photo') {
            const p = Store.get('photos', []).find(x => x.id === wall.id);
            if (p) return p.src;
        }
        return this.render(wall.gen || 'nightroad', wall.seed || 1);
    }
};

// фото тем: через GM_xmlhttpRequest (unsplash режет хотлинк) в data-URL.
// превью и текущий фон лежат в localStorage форума, а не в GM: GM-значения грузятся на каждой странице
const Photo = {
    _mem: new Map(),
    _wait: new Map(),
    MEM: 8,
    THUMBS: 40,
    local(key, value) {
        try {
            if (value === undefined) return JSON.parse(localStorage.getItem('vd.' + key) || 'null');
            if (value === null) localStorage.removeItem('vd.' + key);
            else localStorage.setItem('vd.' + key, JSON.stringify(value));
        } catch {
            // переполнено или запрещено, просто не кешируем
        }
        return null;
    },
    // текущий фон-фото: без аргумента прочитать, null удалить
    wall(v) {
        return this.local('wall', v);
    },
    remember(url, data) {
        this._mem.delete(url);
        this._mem.set(url, data);
        while (this._mem.size > this.MEM) this._mem.delete(this._mem.keys().next().value);
    },
    load(url, { thumb = false } = {}) {
        if (!/^https:/.test(url)) return Promise.resolve(url);
        if (this._mem.has(url)) return Promise.resolve(this._mem.get(url));
        if (this._wait.has(url)) return this._wait.get(url);
        const thumbs = thumb ? this.local('thumbs') || {} : null;
        if (thumbs && thumbs[url]) {
            this.remember(url, thumbs[url].d);
            return Promise.resolve(thumbs[url].d);
        }
        const job = this.fetch(url)
            .then(data => (thumb ? this.shrink(data, 320) : data))
            .then(data => {
                this.remember(url, data);
                if (thumb) {
                    const all = this.local('thumbs') || {};
                    all[url] = { d: data, t: Date.now() };
                    const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
                    keys.slice(this.THUMBS).forEach(k => delete all[k]);
                    this.local('thumbs', all);
                }
                return data;
            })
            .finally(() => this._wait.delete(url));
        this._wait.set(url, job);
        return job;
    },
    // превью пережимаем в маленький JPEG
    shrink(data, w) {
        return new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, w / img.width);
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k);
                c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                try {
                    res(c.toDataURL('image/jpeg', 0.72));
                } catch {
                    res(data);
                }
            };
            img.onerror = () => res(data);
            img.src = data;
        });
    },
    fetch(url) {
        // без GM_xmlhttpRequest остаётся обычная загрузка картинкой
        if (typeof GM_xmlhttpRequest !== 'function')
            return new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => res(url);
                img.onerror = () => rej(new Error('фото недоступно'));
                img.src = url;
            });
        return new Promise((res, rej) =>
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                timeout: 25000,
                onload: r => {
                    const blob = r.response;
                    if (r.status !== 200 || !blob || !/^image\//.test(blob.type || '')) {
                        rej(new Error('фото недоступно'));
                        return;
                    }
                    const fr = new FileReader();
                    fr.onload = () => res(fr.result);
                    fr.onerror = () => rej(new Error('фото не прочиталось'));
                    fr.readAsDataURL(blob);
                },
                onerror: () => rej(new Error('нет связи')),
                ontimeout: () => rej(new Error('долго не отвечает'))
            })
        );
    }
};

// живой рельеф
// высоты: 3D-шум Перлина, z = время. изолинии: marching squares с интерполяцией,
// каждая 5-я толще и со свечением

function noise3(seed) {
    const r = rng(seed),
        p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = (r() * (i + 1)) | 0;
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;
    const grad = (hash, x, y, z) => {
        const h = hash & 15,
            u = h < 8 ? x : y,
            v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return (h & 1 ? -u : u) + (h & 2 ? -v : v);
    };
    const noise = (x, y, z) => {
        const X = Math.floor(x) & 255,
            Y = Math.floor(y) & 255,
            Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = fade(x),
            v = fade(y),
            w = fade(z);
        const A = p[X] + Y,
            AA = p[A] + Z,
            AB = p[A + 1] + Z,
            B = p[X + 1] + Y,
            BA = p[B] + Z,
            BB = p[B + 1] + Z;
        return lerp(
            lerp(
                lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
                lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u),
                v
            ),
            lerp(
                lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
                lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u),
                v
            ),
            w
        );
    };
    return (x, y, z, oct = 4) => {
        let s = 0,
            amp = 0.5,
            f = 1;
        for (let o = 0; o < oct; o++) {
            s += amp * noise(x * f, y * f, z * f);
            amp *= 0.5;
            f *= 2;
        }
        return s;
    };
}

// рёбра клетки: 0 верх, 1 право, 2 низ, 3 лево; случай: TL=8 TR=4 BR=2 BL=1
const MS_CASES = [
    [],
    [[3, 2]],
    [[2, 1]],
    [[3, 1]],
    [[0, 1]],
    [
        [3, 0],
        [2, 1]
    ],
    [[0, 2]],
    [[3, 0]],
    [[3, 0]],
    [[0, 2]],
    [
        [0, 1],
        [3, 2]
    ],
    [[0, 1]],
    [[3, 1]],
    [[2, 1]],
    [[3, 2]],
    []
];

const Relief = {
    STEPS: 14, // сколько изолиний на всю высоту

    scene(seed, pal) {
        return { noise: noise3(seed), pal, line: hexRgb(pal[3]), glow: hexRgb(pal[4]) };
    },

    draw(ctx, w, h, sc, t = 0) {
        const cell = Math.max(4, Math.round(Math.min(w, h) / 110));
        const cols = Math.ceil(w / cell) + 1,
            rows = Math.ceil(h / cell) + 1;
        if (!sc.field || sc.field.length !== cols * rows) {
            sc.field = new Float32Array(cols * rows);
            // в воркере нет document
            sc.bg =
                typeof document === 'undefined' ? new OffscreenCanvas(cols, rows) : document.createElement('canvas');
            sc.bg.width = cols;
            sc.bg.height = rows;
            sc.img = sc.bg.getContext('2d').createImageData(cols, rows);
        }
        const f = sc.field,
            d = sc.img.data,
            k = 2.6 / Math.max(w, h),
            z = t * 0.045,
            ox = t * 0.012;
        const lo = hexRgb(sc.pal[0]),
            mid = hexRgb(sc.pal[1]),
            hi = hexRgb(sc.pal[2]);

        // поле высот и цвет низин/вершин
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const v = sc.noise(x * cell * k + ox, y * cell * k, z, 4) * 1.6 + 0.5;
                const i = y * cols + x;
                f[i] = v;
                const tt = Math.max(0, Math.min(1, v * 0.8));
                const col = tt < 0.5 ? mix(lo, mid, tt * 2) : mix(mid, hi, (tt - 0.5) * 2);
                d[i * 4] = col[0];
                d[i * 4 + 1] = col[1];
                d[i * 4 + 2] = col[2];
                d[i * 4 + 3] = 255;
            }
        }
        sc.bg.getContext('2d').putImageData(sc.img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sc.bg, 0, 0, cols * cell, rows * cell);

        // изолинии
        const minor = [],
            major = [];
        const S = this.STEPS;
        for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < cols - 1; x++) {
                const i = y * cols + x;
                const a = f[i],
                    b = f[i + 1],
                    c = f[i + 1 + cols],
                    dd = f[i + cols];
                const kMin = Math.ceil(Math.min(a, b, c, dd) * S),
                    kMax = Math.floor(Math.max(a, b, c, dd) * S);
                if (kMin > kMax) continue;
                const x0 = x * cell,
                    y0 = y * cell,
                    x1 = x0 + cell,
                    y1 = y0 + cell;
                for (let lv = kMin; lv <= kMax; lv++) {
                    const L = lv / S;
                    const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (dd > L ? 1 : 0);
                    const segs = MS_CASES[idx];
                    if (!segs.length) continue;
                    const out = lv % 5 === 0 ? major : minor;
                    const pt = e =>
                        e === 0
                            ? [x0 + (cell * (L - a)) / (b - a), y0]
                            : e === 1
                              ? [x1, y0 + (cell * (L - b)) / (c - b)]
                              : e === 2
                                ? [x0 + (cell * (L - dd)) / (c - dd), y1]
                                : [x0, y0 + (cell * (L - a)) / (dd - a)];
                    for (const [e1, e2] of segs) {
                        const p1 = pt(e1),
                            p2 = pt(e2);
                        out.push(p1[0], p1[1], p2[0], p2[1]);
                    }
                }
            }
        }
        const stroke = (arr, width, rgb, alpha) => {
            ctx.strokeStyle = `rgba(${rgb},${alpha})`;
            ctx.lineWidth = width;
            ctx.beginPath();
            for (let i = 0; i < arr.length; i += 4) {
                ctx.moveTo(arr[i], arr[i + 1]);
                ctx.lineTo(arr[i + 2], arr[i + 3]);
            }
            ctx.stroke();
        };
        const u = Math.max(1, Math.min(w, h) / 900);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        stroke(minor, 1.1 * u, sc.line, 0.5);
        stroke(major, 6 * u, sc.line, 0.1);
        stroke(major, 3 * u, sc.line, 0.22);
        stroke(major, 1.6 * u, mix(sc.line, sc.glow, 0.35), 0.95);

        // мягкая виньетка
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.45)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }
};

GENERATORS.relief = {
    name: 'Рельеф',
    live: true,
    draw(c, w, h, r, pal, seed) {
        Relief.draw(c, w, h, Relief.scene(seed, pal), 0);
    }
};

// код воркера собирается из тех же функций через toString
const reliefWorkerSource = () => `
const rng = ${rng};
const noise3 = ${noise3};
const hexRgb = ${hexRgb};
const mix = ${mix};
const MS_CASES = ${JSON.stringify(MS_CASES)};
const Relief = { STEPS: ${Relief.STEPS}, ${Relief.scene}, ${Relief.draw} };
const raf = self.requestAnimationFrame ? f => self.requestAnimationFrame(f) : f => setTimeout(() => f(performance.now()), 16);
let cv, ctx, sc, t = 0, speed = 0, last = 0, fps = 30;
const draw = () => Relief.draw(ctx, cv.width, cv.height, sc, t);
const tick = now => {
    raf(tick);
    if (!speed || now - last < 1000 / fps - 2) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt * speed;
    draw();
};
onmessage = e => {
    const m = e.data;
    if (m.canvas) {
        cv = m.canvas;
        ctx = cv.getContext('2d');
        sc = Relief.scene(m.seed, m.pal);
        raf(tick);
    }
    if (m.w) {
        cv.width = m.w;
        cv.height = m.h;
    }
    if (m.fps) fps = m.fps;
    if ('speed' in m) {
        speed = m.speed;
        last = 0;
    }
    if (cv) draw();
};
`;

// живой фон: рисуем в воркере, если нельзя, то в основном потоке
class LiveWall {
    constructor(canvas, seed) {
        this.cv = canvas;
        this.seed = seed;
        this.pal = PALETTES[seed % PALETTES.length];
        this.t = 0;
        this.last = 0;
        this.resize = U.debounce(() => this.fit(), 150);
        addEventListener('resize', this.resize);
        if (!this.startWorker()) this.startLocal();
    }
    startWorker() {
        if (!this.cv.transferControlToOffscreen || typeof Worker === 'undefined') return false;
        let url;
        try {
            url = URL.createObjectURL(new Blob([reliefWorkerSource()], { type: 'text/javascript' }));
            this.worker = new Worker(url);
        } catch {
            if (url) URL.revokeObjectURL(url);
            return false;
        }
        URL.revokeObjectURL(url);
        // воркер упал (например CSP), рисуем сами на новом холсте
        this.worker.onerror = () => {
            this.worker.terminate();
            this.worker = null;
            const fresh = this.cv.cloneNode(false);
            this.cv.replaceWith(fresh);
            this.cv = fresh;
            this.startLocal();
        };
        const off = this.cv.transferControlToOffscreen();
        this.speed = Settings.get().theme.liveSpeed;
        this.worker.postMessage(
            Object.assign({ canvas: off, seed: this.seed, pal: this.pal, speed: this.speed }, this.size()),
            [off]
        );
        // скорость меняется только из настроек — без опроса каждые полсекунды
        this.poll = 0;
        this.onSettings = () => {
            const sp = Settings.get().theme.liveSpeed;
            if (sp !== this.speed && this.worker) this.worker.postMessage({ speed: (this.speed = sp) });
        };
        Bus.on('settings', this.onSettings);
        return true;
    }
    // экономный режим: меньше пикселей и кадров, браузер растягивает холст сам
    size() {
        const k = Perf.light() ? 0.6 : 1;
        return { w: Math.round(innerWidth * k), h: Math.round(innerHeight * k), fps: k < 1 ? 30 : 60 };
    }
    startLocal() {
        this.ctx = this.cv.getContext('2d');
        this.scene = Relief.scene(this.seed, this.pal);
        this.fit();
        this.frame = this.frame.bind(this);
        this.raf = requestAnimationFrame(this.frame);
    }
    fit() {
        if (this.worker) {
            this.worker.postMessage(this.size());
            return;
        }
        if (!this.ctx) return;
        const { w, h } = this.size();
        this.cv.width = w;
        this.cv.height = h;
        Relief.draw(this.ctx, this.cv.width, this.cv.height, this.scene, this.t);
    }
    frame(now) {
        if (!this.cv) return;
        this.raf = requestAnimationFrame(this.frame);
        if (document.hidden) return;
        const speed = Settings.get().theme.liveSpeed;
        if (!speed || now - this.last < 1000 / (Perf.light() ? 30 : 60) - 2) return;
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.t += dt * speed;
        Relief.draw(this.ctx, this.cv.width, this.cv.height, this.scene, this.t);
    }
    stop() {
        cancelAnimationFrame(this.raf);
        if (this.onSettings) Bus.off('settings', this.onSettings);
        if (this.worker) this.worker.terminate();
        this.worker = null;
        removeEventListener('resize', this.resize);
        this.cv = null;
    }
}

// погода и время суток
// слой поверх фона; время суток меняет оттенок и цвет капель. стоит на скрытой вкладке и при reduced-motion
const FX_EFFECTS = {
    none: { name: 'Без эффекта', icon: 'x' },
    rain: { name: 'Дождь', icon: 'cloud' },
    lightning: { name: 'Молнии', icon: 'bolt' },
    storm: { name: 'Гроза с дождём', icon: 'storm' },
    snow: { name: 'Снег', icon: 'snow' },
    petals: { name: 'Лепестки', icon: 'spark' },
    fireflies: { name: 'Светлячки', icon: 'star' },
    newyear: { name: 'Новый год', icon: 'snow' },
    autumn: { name: 'Осень', icon: 'sun' }
};
const TOD = {
    names: { auto: 'По часам', morning: 'Утро', day: 'День', evening: 'Вечер', night: 'Ночь', off: 'Без оттенка' },
    icons: { auto: 'clock', morning: 'sun', day: 'sun', evening: 'moon', night: 'moon', off: 'x' },
    now() {
        const h = new Date().getHours();
        return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 22 ? 'evening' : 'night';
    },
    resolve(mode) {
        return mode === 'auto' ? this.now() : mode;
    },
    tint: {
        morning: 'linear-gradient(180deg, rgba(255,170,120,.20), rgba(255,130,170,.08) 55%, rgba(0,0,0,0))',
        day: 'linear-gradient(180deg, rgba(150,200,255,.10), rgba(0,0,0,0) 60%)',
        evening: 'linear-gradient(180deg, rgba(110,40,150,.26), rgba(255,110,60,.16) 65%, rgba(40,10,40,.22))',
        night: 'linear-gradient(180deg, rgba(1,2,10,.55), rgba(2,4,16,.38))',
        off: 'none'
    },
    drop: {
        morning: '255,226,214',
        day: '214,226,240',
        evening: '255,198,190',
        night: '168,190,255',
        off: '214,226,240'
    },
    flash: { morning: 0.18, day: 0.12, evening: 0.28, night: 0.42, off: 0.25 }
};

const Fx = {
    cv: null,
    c: null,
    raf: 0,
    parts: [],
    bolts: [],
    nextBolt: 0,
    last: 0,
    cfg: null,
    reduced() {
        try {
            return matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch {
            return false;
        }
    },
    updateTod() {
        const s = Settings.get();
        this.tod = TOD.resolve(s.theme.fx.tod);
        if (Theme.tod) Theme.tod.style.backgroundImage = s.theme.enabled ? TOD.tint[this.tod] : 'none';
    },
    sync() {
        const s = Settings.get(),
            cfg = s.theme.fx;
        const on = s.theme.enabled && cfg.effect !== 'none' && !this.reduced();
        this.cfg = cfg;
        this.tod = TOD.resolve(cfg.tod);
        if (Theme.tod) Theme.tod.style.backgroundImage = s.theme.enabled ? TOD.tint[this.tod] : 'none';
        if (!on) {
            this.stop();
            return;
        }
        if (!this.cv) {
            this.cv = document.createElement('canvas');
            this.cv.id = 'vd-fx';
            this.cv.setAttribute('aria-hidden', 'true');
            (Theme.wall && Theme.wall.parentNode ? Theme.wall.parentNode : document.body).insertBefore(
                this.cv,
                Theme.wall ? Theme.wall.nextSibling : null
            );
            this.c = this.cv.getContext('2d');
            addEventListener('resize', (this._rs = U.debounce(() => this.resize(), 150)));
            document.addEventListener(
                'visibilitychange',
                (this._vis = () => {
                    if (!document.hidden && this.cv) this.loop();
                })
            );
        }
        this.resize();
        this.seed(cfg.effect);
        this.cv.style.opacity = '1';
        if (!this.raf) this.loop();
    },
    stop() {
        if (!this.cv) return;
        const cv = this.cv;
        cv.style.opacity = '0';
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        removeEventListener('resize', this._rs);
        document.removeEventListener('visibilitychange', this._vis);
        this.cv = this.c = null;
        setTimeout(() => cv.remove(), 700);
        if (Theme.wall) Theme.wall.style.filter = '';
    },
    // в экономном режиме холст вдвое меньше, рисуем в тех же координатах через масштаб
    resize() {
        if (!this.cv) return;
        this.k = Perf.light() ? 0.5 : 1;
        this.w = innerWidth;
        this.h = innerHeight;
        this.cv.width = Math.round(this.w * this.k);
        this.cv.height = Math.round(this.h * this.k);
    },
    seed(effect) {
        const k = this.cfg.intensity,
            P = [];
        const n =
            { rain: 260, storm: 420, snow: 160, petals: 70, fireflies: 46, newyear: 150, autumn: 42 }[effect] || 0;
        for (let i = 0; i < Math.round(n * (0.3 + k)); i++) P.push(this.spawn(effect, true));
        this.parts = P;
        this.effect = effect;
        this.bolts = [];
        this.nextBolt = performance.now() + 700 + Math.random() * 1500;
        if (effect === 'fireflies' && !this.glowSprite) {
            const g = document.createElement('canvas');
            g.width = g.height = 32;
            const gc = g.getContext('2d'),
                rg = gc.createRadialGradient(16, 16, 0, 16, 16, 16);
            rg.addColorStop(0, 'rgba(255,250,200,1)');
            rg.addColorStop(0.25, 'rgba(255,230,120,.7)');
            rg.addColorStop(1, 'rgba(255,200,80,0)');
            gc.fillStyle = rg;
            gc.fillRect(0, 0, 32, 32);
            this.glowSprite = g;
        }
    },
    spawn(effect, anywhere) {
        const w = this.w,
            h = this.h,
            r = Math.random;
        const y = anywhere ? r() * h : -20 - r() * 60;
        switch (effect) {
            case 'rain':
            case 'storm':
                return {
                    x: r() * (w + 200),
                    y,
                    len: 12 + r() * 20,
                    v: (effect === 'storm' ? 1300 : 950) + r() * 450,
                    a: 0.18 + r() * 0.35
                };
            case 'newyear':
            case 'snow':
                return { x: r() * w, y, r: 0.8 + r() * 2.6, v: 25 + r() * 55, ph: r() * 6.28, a: 0.5 + r() * 0.5 };
            case 'petals':
                return {
                    x: r() * w,
                    y,
                    s: 3 + r() * 4,
                    v: 35 + r() * 55,
                    vx: 20 + r() * 50,
                    rot: r() * 6.28,
                    vr: (r() - 0.5) * 3,
                    ph: r() * 6.28,
                    col: ['255,143,184', '255,179,207', '255,209,225', '255,111,163'][(r() * 4) | 0]
                };
            case 'autumn':
                return {
                    x: r() * w,
                    y,
                    s: 7 + r() * 8,
                    v: 30 + r() * 45,
                    vx: -15 + r() * 40,
                    rot: r() * 6.28,
                    vr: (r() - 0.5) * 2.4,
                    ph: r() * 6.28,
                    col: ['214,92,30', '232,140,40', '186,52,32', '240,182,60', '150,82,40'][(r() * 5) | 0]
                };
            case 'fireflies':
                return {
                    x: r() * w,
                    y: h * (0.3 + r() * 0.7),
                    vx: (r() - 0.5) * 20,
                    vy: (r() - 0.5) * 14,
                    ph: r() * 6.28,
                    s: 6 + r() * 10
                };
        }
        return {};
    },
    drawSnow(dt) {
        const c = this.c;
        c.fillStyle = '#fff';
        for (const p of this.parts) {
            p.y += p.v * dt;
            p.ph += dt;
            p.x += Math.sin(p.ph) * 18 * dt;
            if (p.y > this.h + 10) Object.assign(p, this.spawn(this.effect, false));
            c.globalAlpha = p.a;
            c.beginPath();
            c.arc(p.x, p.y, p.r, 0, 6.29);
            c.fill();
        }
        c.globalAlpha = 1;
    },
    // лист: две дуги и прожилка, поворачивается и «переворачивается» по ph
    drawLeaf(p) {
        const c = this.c,
            s = p.s;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(1, Math.abs(Math.sin(p.ph)) * 0.7 + 0.3);
        c.fillStyle = `rgba(${p.col},.9)`;
        c.beginPath();
        c.moveTo(-s, 0);
        c.quadraticCurveTo(-s * 0.2, -s * 0.75, s, 0);
        c.quadraticCurveTo(-s * 0.2, s * 0.75, -s, 0);
        c.fill();
        c.strokeStyle = 'rgba(70,30,10,.45)';
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(-s * 1.25, 0);
        c.lineTo(s * 0.85, 0);
        c.stroke();
        c.restore();
    },
    // гирлянда провисает между точками крепления, лампочки мигают волной
    drawGarland(now) {
        const c = this.c,
            w = this.w,
            t = now / 1000;
        if (!this._bulb) {
            this._bulb = ['255,70,70', '255,200,60', '80,220,120', '90,160,255', '255,120,220'].map(col => {
                const g = document.createElement('canvas');
                g.width = g.height = 48;
                const gc = g.getContext('2d'),
                    rg = gc.createRadialGradient(24, 24, 0, 24, 24, 24);
                rg.addColorStop(0, 'rgba(255,255,255,1)');
                rg.addColorStop(0.18, `rgba(${col},1)`);
                rg.addColorStop(0.45, `rgba(${col},.35)`);
                rg.addColorStop(1, `rgba(${col},0)`);
                gc.fillStyle = rg;
                gc.fillRect(0, 0, 48, 48);
                return g;
            });
        }
        const span = Math.max(260, w / 4),
            sag = 26,
            step = 34;
        c.strokeStyle = 'rgba(20,24,20,.85)';
        c.lineWidth = 1.6;
        c.beginPath();
        for (let x0 = 0; x0 < w; x0 += span) {
            for (let x = 0; x <= span; x += 8) {
                const y = 6 + sag * Math.sin((Math.PI * x) / span);
                if (x === 0) c.moveTo(x0 + x, y);
                else c.lineTo(x0 + x, y);
            }
        }
        c.stroke();
        let i = 0;
        for (let x0 = 0; x0 < w; x0 += span)
            for (let x = step / 2; x < span; x += step, i++) {
                const y = 6 + sag * Math.sin((Math.PI * x) / span) + 5;
                const on = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 - i * 0.55));
                c.globalAlpha = on;
                c.drawImage(this._bulb[i % this._bulb.length], x0 + x - 14, y - 14, 28, 28);
            }
        c.globalAlpha = 1;
    },
    // молния: ломаный канал вниз с ветками до 4 уровней, рендер один раз, потом мигает
    clouds() {
        if (this._clouds && this._clouds.w === this.w) return this._clouds.cv;
        const cw = Math.ceil(this.w / 4),
            ch = Math.ceil(this.h / 4),
            cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        const n = noise2((Math.random() * 1e5) | 0),
            cc = cv.getContext('2d'),
            img = cc.createImageData(cw, ch),
            d = img.data;
        for (let y = 0; y < ch; y++)
            for (let x = 0; x < cw; x++) {
                const v = Math.max(0, n((x / cw) * 3.5, (y / ch) * 5, 5) * 1.6 + 0.3) * Math.max(0, 1 - (y / ch) * 1.1),
                    i = (y * cw + x) * 4;
                d[i] = 150;
                d[i + 1] = 165;
                d[i + 2] = 255;
                d[i + 3] = Math.min(255, v * 255);
            }
        cc.putImageData(img, 0, 0);
        this._clouds = { w: this.w, cv };
        return cv;
    },
    channel(x0, y0, maxY) {
        const segs = [];
        const grow = (x, y, ang, len, wd, al, depth) => {
            let run = 0;
            while (run < len && y < maxY && x > -60 && x < this.w + 60) {
                const step = 5 + Math.random() * 11;
                ang += (Math.random() - 0.5) * 1.1;
                ang += (Math.PI / 2 - ang) * (depth ? 0.08 : 0.16);
                const nx = x + Math.cos(ang) * step,
                    ny = y + Math.sin(ang) * step,
                    k = run / len;
                segs.push({
                    x1: x,
                    y1: y,
                    x2: nx,
                    y2: ny,
                    w: Math.max(0.35, wd * (1 - k * 0.65)),
                    a: al * (1 - k * 0.45)
                });
                if (depth < 4 && Math.random() < [0.075, 0.06, 0.045, 0.03][depth]) {
                    const side = Math.random() < 0.5 ? -1 : 1;
                    grow(
                        nx,
                        ny,
                        ang + side * (0.35 + Math.random() * 0.8),
                        (len - run) * (0.2 + Math.random() * 0.45),
                        wd * 0.48,
                        al * 0.62,
                        depth + 1
                    );
                }
                x = nx;
                y = ny;
                run += step;
            }
        };
        grow(x0, y0, Math.PI / 2 + (Math.random() - 0.5) * 0.7, (maxY - y0) * 1.5, 3.4, 1, 0);
        return segs;
    },
    renderChannel(segs) {
        const W2 = this.w,
            H2 = this.h;
        const cv = document.createElement('canvas');
        cv.width = W2;
        cv.height = H2;
        const o = cv.getContext('2d');
        // blur на весь слой сразу: фильтр на каждом отрезке стоил бы секунды
        const layer = (scale, col, k) => {
            const t = document.createElement('canvas');
            t.width = Math.ceil(W2 * k);
            t.height = Math.ceil(H2 * k);
            const tc = t.getContext('2d');
            tc.lineCap = 'round';
            tc.lineJoin = 'round';
            tc.scale(k, k);
            for (const sg of segs) {
                tc.strokeStyle = col(sg.a);
                tc.lineWidth = sg.w * scale;
                tc.beginPath();
                tc.moveTo(sg.x1, sg.y1);
                tc.lineTo(sg.x2, sg.y2);
                tc.stroke();
            }
            return t;
        };
        const blit = (t, blur) => {
            o.filter = blur ? `blur(${blur}px)` : 'none';
            o.drawImage(t, 0, 0, W2, H2);
            o.filter = 'none';
        };
        blit(
            layer(12, a => `rgba(80,100,255,${a * 0.1})`, 0.25),
            22
        );
        blit(
            layer(5, a => `rgba(140,165,255,${a * 0.32})`, 0.5),
            7
        );
        blit(
            layer(2, a => `rgba(205,215,255,${a * 0.85})`, 1),
            1.6
        );
        blit(
            layer(0.75, a => `rgba(255,255,255,${a})`, 1),
            0
        );
        return cv;
    },
    // застывшая молния для превью темы (сама гроза живая и на превью не видна)
    stillBolt(w, h, seed) {
        const key = `${w}x${h}#${seed}`;
        this._still = this._still || {};
        if (this._still[key]) return this._still[key];
        const random = Math.random;
        Math.random = rng(seed);
        try {
            const size = { w, h };
            const x0 = w * (0.3 + Math.random() * 0.4);
            const segs = this.channel.call(size, x0, -5, h * 0.95);
            return (this._still[key] = this.renderChannel.call(size, segs).toDataURL());
        } finally {
            Math.random = random;
        }
    },
    // подсветка туч вокруг точки удара
    cloudGlow(x, y, rad) {
        const w2 = Math.ceil(this.w / 2),
            h2 = Math.ceil(this.h / 2),
            cv = document.createElement('canvas');
        cv.width = w2;
        cv.height = h2;
        const g = cv.getContext('2d');
        g.drawImage(this.clouds(), 0, 0, w2, h2);
        g.globalCompositeOperation = 'destination-in';
        const rg = g.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, rad / 2);
        rg.addColorStop(0, 'rgba(0,0,0,1)');
        rg.addColorStop(0.5, 'rgba(0,0,0,.45)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, w2, h2);
        return cv;
    },
    // повторные разряды: [начало, длительность, яркость]
    flickerSeq() {
        const seq = [];
        let t = 0;
        const strokes = 2 + ((Math.random() * 4) | 0);
        for (let i = 0; i < strokes; i++) {
            const on = 0.04 + Math.random() * 0.06;
            seq.push([t, on, i === 0 ? 1 : 0.55 + Math.random() * 0.45]);
            t += on + 0.03 + Math.random() * 0.09;
        }
        return { seq, end: t + 0.55 };
    },
    level(b) {
        let v = 0;
        for (const [st, d, k] of b.seq) {
            if (b.t >= st && b.t < st + d) return k;
            if (b.t >= st + d) v = k * 0.16 * Math.exp(-(b.t - st - d) * 5); // послесвечение
        }
        return v;
    },
    bolt(sheet) {
        const w = this.w,
            h = this.h;
        const x0 = w * (0.08 + Math.random() * 0.84),
            y0 = -10 + Math.random() * h * 0.08;
        const toGround = Math.random() < 0.65;
        const { seq, end } = this.flickerSeq();
        const b = { t: 0, seq, end, x0, y0 };
        if (!sheet)
            b.cv = this.renderChannel(this.channel(x0, y0, toGround ? h + 20 : h * (0.45 + Math.random() * 0.3)));
        b.glow = this.cloudGlow(x0, y0 + h * 0.08, (sheet ? 0.7 : 0.5) * w);
        this.bolts.push(b);
    },
    drawBolts(dt) {
        const c = this.c;
        let peak = 0;
        this.bolts = this.bolts.filter(b => (b.t += dt) < b.end);
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (const b of this.bolts) {
            const L = this.level(b);
            peak = Math.max(peak, L);
            if (L <= 0.002) continue;
            c.globalAlpha = Math.min(1, L * 0.9);
            c.drawImage(b.glow, 0, 0, this.w, this.h);
            if (b.cv) {
                c.globalAlpha = Math.min(1, L * 1.1);
                c.drawImage(b.cv, 0, 0);
            }
        }
        c.restore();
        if (peak > 0.01) {
            c.fillStyle = `rgba(150,160,220,${peak * TOD.flash[this.tod] * 0.35})`;
            c.fillRect(0, 0, this.w, this.h);
        }
        // brightness на фоне перерисовывает всю страницу, в экономном режиме не трогаем
        if (Theme.wall && this.k === 1) Theme.wall.style.filter = peak > 0.01 ? `brightness(${1 + peak * 0.45})` : '';
    },
    stormTick(now) {
        if (now <= this.nextBolt) return;
        const sheet = Math.random() < 0.25;
        this.bolt(sheet);
        if (!sheet && Math.random() < 0.3) setTimeout(() => this.cv && this.bolt(), 120 + Math.random() * 380);
        this.nextBolt = now + (2200 + Math.random() * 6500) * (1.45 - this.cfg.intensity);
    },
    loop() {
        cancelAnimationFrame(this.raf);
        const step = now => {
            if (!this.cv) return;
            if (document.hidden) {
                this.raf = 0;
                return;
            }
            this.raf = requestAnimationFrame(step);
            // экономный: 30 fps
            if (this.k < 1 && this.last && now - this.last < 31) return;
            const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
            this.last = now;
            this.frame(dt, now);
        };
        this.last = 0;
        this.raf = requestAnimationFrame(step);
    },
    frame(dt, now) {
        const c = this.c,
            w = this.w,
            h = this.h,
            e = this.effect,
            tod = this.tod;
        c.setTransform(this.k, 0, 0, this.k, 0, 0);
        c.clearRect(0, 0, w, h);
        if (e === 'rain' || e === 'storm') {
            const col = TOD.drop[tod],
                slant = e === 'storm' ? 0.28 : 0.16;
            c.lineWidth = 1;
            c.lineCap = 'round';
            for (const p of this.parts) {
                p.y += p.v * dt;
                p.x -= p.v * slant * dt;
                if (p.y > h + 30 || p.x < -40) Object.assign(p, this.spawn(e, false));
                c.strokeStyle = `rgba(${col},${p.a})`;
                c.beginPath();
                c.moveTo(p.x, p.y);
                c.lineTo(p.x + p.len * slant, p.y - p.len);
                c.stroke();
            }
            if (e === 'storm' && this.cfg.lightning) {
                this.stormTick(now);
                this.drawBolts(dt);
            }
        } else if (e === 'lightning') {
            this.stormTick(now);
            this.drawBolts(dt);
        } else if (e === 'newyear') {
            this.drawSnow(dt);
            this.drawGarland(now);
        } else if (e === 'autumn') {
            for (const p of this.parts) {
                p.ph += dt * 1.3;
                p.y += p.v * dt;
                p.x += (p.vx + Math.sin(p.ph) * 40) * dt;
                p.rot += p.vr * dt;
                if (p.y > h + 30 || p.x > w + 40 || p.x < -40) Object.assign(p, this.spawn(e, false));
                this.drawLeaf(p);
            }
        } else if (e === 'snow') {
            c.fillStyle = '#fff';
            for (const p of this.parts) {
                p.y += p.v * dt;
                p.ph += dt;
                p.x += Math.sin(p.ph) * 18 * dt;
                if (p.y > h + 10) Object.assign(p, this.spawn(e, false));
                c.globalAlpha = p.a;
                c.beginPath();
                c.arc(p.x, p.y, p.r, 0, 6.29);
                c.fill();
            }
            c.globalAlpha = 1;
        } else if (e === 'petals') {
            for (const p of this.parts) {
                p.ph += dt * 1.6;
                p.y += p.v * dt;
                p.x += (p.vx + Math.sin(p.ph) * 30) * dt;
                p.rot += p.vr * dt;
                if (p.y > h + 20 || p.x > w + 30)
                    Object.assign(p, this.spawn(e, false), { x: Math.random() * w * 0.8 - w * 0.1 });
                c.save();
                c.translate(p.x, p.y);
                c.rotate(p.rot);
                c.scale(1, Math.abs(Math.sin(p.ph)) * 0.6 + 0.4);
                c.fillStyle = `rgba(${p.col},.85)`;
                c.beginPath();
                c.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, 6.29);
                c.fill();
                c.restore();
            }
        } else if (e === 'fireflies') {
            for (const p of this.parts) {
                p.ph += dt * (1 + p.s * 0.05);
                p.vx += (Math.random() - 0.5) * 30 * dt;
                p.vy += (Math.random() - 0.5) * 30 * dt;
                p.vx = Math.max(-25, Math.min(25, p.vx));
                p.vy = Math.max(-18, Math.min(18, p.vy));
                p.x = (p.x + p.vx * dt + w) % w;
                p.y = Math.max(h * 0.2, Math.min(h, p.y + p.vy * dt));
                c.globalAlpha = 0.25 + (Math.sin(p.ph) * 0.5 + 0.5) * 0.75;
                c.drawImage(this.glowSprite, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
            }
            c.globalAlpha = 1;
        }
    }
};

// живое фото: своё фото + анимация поверх (лучи, искры, разряды, звёзды)
// координаты в пикселях исходной картинки, фон растягивается как background-size: cover
const SCENE_TINTS = {
    winter: 'rgba(110,160,255,.13)',
    autumn: 'rgba(255,140,40,.12)'
};

class LiveScene {
    constructor(layer, sc) {
        // проверяем и тут: в хранилище могла лечь сцена из старой сборки
        this.sc = sc = Scene.clean(sc || {});
        this.cv = document.createElement('canvas');
        this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
        if (sc.tint && SCENE_TINTS[sc.tint]) {
            const tint = document.createElement('div');
            tint.style.cssText = `position:absolute;inset:0;background:${SCENE_TINTS[sc.tint]};mix-blend-mode:soft-light`;
            layer.appendChild(tint);
        }
        layer.appendChild(this.cv);
        this.c = this.cv.getContext('2d');
        this.sparks = [];
        this.arcs = [];
        this.pulses = (sc.beams || []).map(() => [Math.random(), Math.random() * 0.5 + 0.5]);
        this.stars = Array.from({ length: 70 }, () => [Math.random(), Math.random(), Math.random() * 6.28]);
        this.nextArc = 0;
        this.resize = U.debounce(() => this.fit(), 150);
        addEventListener('resize', this.resize);
        this.fit();
        this.frame = this.frame.bind(this);
        this.raf = requestAnimationFrame(this.frame);
    }
    fit() {
        if (!this.cv) return;
        this.k = Perf.light() ? 0.6 : 1;
        this.w = innerWidth;
        this.h = innerHeight;
        this.cv.width = Math.round(this.w * this.k);
        this.cv.height = Math.round(this.h * this.k);
        const { w: iw, h: ih } = this.sc;
        this.s = Math.max(this.w / iw, this.h / ih);
        this.ox = (this.w - iw * this.s) / 2;
        this.oy = (this.h - ih * this.s) / 2;
    }
    // точка картинки → экран
    p([x, y]) {
        return [this.ox + x * this.s, this.oy + y * this.s];
    }
    // точка на ломаной по доле длины u
    along(pts, u) {
        const seg = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            seg.push(d);
            total += d;
        }
        let left = u * total;
        for (let i = 0; i < seg.length; i++) {
            if (left <= seg[i] || i === seg.length - 1) {
                const k = seg[i] ? Math.min(1, left / seg[i]) : 0;
                const a = pts[i],
                    b = pts[i + 1];
                return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])];
            }
            left -= seg[i];
        }
        return [...pts[0], 0];
    }
    glow(x, y, r, rgb, a) {
        const c = this.c,
            g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.25, `rgba(${rgb},${a * 0.8})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // разряд: ломаная между двумя случайными точками зоны
    arc(zone) {
        const [x, y, w, h] = zone;
        const a = [x + Math.random() * w, y + Math.random() * h],
            b = [x + Math.random() * w, y + Math.random() * h];
        const pts = [a];
        const n = 8 + ((Math.random() * 8) | 0);
        for (let i = 1; i < n; i++) {
            const k = i / n;
            pts.push([
                a[0] + (b[0] - a[0]) * k + (Math.random() - 0.5) * 34,
                a[1] + (b[1] - a[1]) * k + (Math.random() - 0.5) * 34
            ]);
        }
        pts.push(b);
        return { pts, life: 0.12 + Math.random() * 0.18, t: 0 };
    }
    frame(now) {
        if (!this.cv) return;
        this.raf = requestAnimationFrame(this.frame);
        if (document.hidden) return;
        if (this.k < 1 && this.last && now - this.last < 31) return;
        const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
        this.last = now;
        const t = now / 1000,
            c = this.c,
            sc = this.sc,
            s = this.s;
        c.setTransform(this.k, 0, 0, this.k, 0, 0);
        c.clearRect(0, 0, this.w, this.h);
        c.globalCompositeOperation = 'lighter';

        // звёзды мерцают
        for (const st of this.stars) {
            const a = Math.max(0, Math.sin(t * 1.7 + st[2])) ** 6 * 0.8;
            if (a < 0.03) continue;
            const x = st[0] * this.w,
                y = st[1] * this.h;
            c.fillStyle = `rgba(200,220,255,${a})`;
            c.fillRect(x - 0.6, y - 4, 1.2, 8);
            c.fillRect(x - 4, y - 0.6, 8, 1.2);
        }

        // лучи: свечение пульсирует, по лучу бегут импульсы, вдоль летят искры
        (sc.beams || []).forEach((bm, i) => {
            const rgb = bm.color || '255,40,40';
            const pts = bm.pts.map(q => this.p(q));
            const pulse = 0.82 + 0.18 * Math.sin(t * 7 + i * 1.7) + (Math.random() - 0.5) * 0.06;
            const line = (wd, col) => {
                c.strokeStyle = col;
                c.lineWidth = wd;
                c.lineCap = 'round';
                c.beginPath();
                pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
                c.stroke();
            };
            const wd = (bm.width || 10) * s;
            line(wd * 2.6 * pulse, `rgba(${rgb},.07)`);
            line(wd * 1.1 * pulse, `rgba(${rgb},.18)`);
            line(wd * 0.32, `rgba(255,225,215,${0.35 * pulse})`);
            // импульсы от глаз наружу
            const ph = this.pulses[i];
            ph[0] = (ph[0] + dt * 0.55 * ph[1]) % 1;
            for (let k = 0; k < 3; k++) {
                const u = (ph[0] + k / 3) % 1;
                const [x, y, ang] = this.along(pts, u);
                const len = 90 * s;
                const g = c.createLinearGradient(x, y, x - Math.cos(ang) * len, y - Math.sin(ang) * len);
                g.addColorStop(0, `rgba(255,240,230,${0.75 * (1 - u * 0.6)})`);
                g.addColorStop(1, `rgba(${rgb},0)`);
                c.strokeStyle = g;
                c.lineWidth = wd * 0.55;
                c.beginPath();
                c.moveTo(x, y);
                c.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
                c.stroke();
                this.glow(x, y, wd * 1.6, rgb, 0.5 * (1 - u * 0.5));
            }
            // искры
            const rate = (sc.sparks ?? 1) * 70 * dt;
            for (let n = 0; n < rate; n++) {
                const u = Math.random() ** 0.6;
                const [x, y, ang] = this.along(pts, u);
                const side = ang + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2) + (Math.random() - 0.5) * 1.2;
                const sp = (40 + Math.random() * 160) * s;
                this.sparks.push({
                    x,
                    y,
                    vx: Math.cos(side) * sp + Math.cos(ang) * 60 * s,
                    vy: Math.sin(side) * sp + Math.sin(ang) * 60 * s,
                    life: 0.4 + Math.random() * 0.9,
                    t: 0,
                    rgb
                });
            }
            // сияние у глаз
            this.glow(...pts[0], (bm.eye || 26) * s * (1 + 0.25 * Math.sin(t * 9 + i)), rgb, 0.85);
        });

        // искры и угольки
        for (const sp of this.sparks) {
            sp.t += dt;
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.vx *= 0.96;
            sp.vy = sp.vy * 0.96 + 12 * dt;
            const a = Math.max(0, 1 - sp.t / sp.life);
            c.strokeStyle = `rgba(${sp.rgb},${a})`;
            c.lineWidth = 1.4;
            c.beginPath();
            c.moveTo(sp.x, sp.y);
            c.lineTo(sp.x - sp.vx * 0.03, sp.y - sp.vy * 0.03);
            c.stroke();
            if (a > 0.6) {
                c.fillStyle = `rgba(255,235,220,${a})`;
                c.fillRect(sp.x - 0.8, sp.y - 0.8, 1.6, 1.6);
            }
        }
        this.sparks = this.sparks.filter(sp => sp.t < sp.life).slice(-500);

        // электрические разряды
        const zones = sc.arcs || [];
        if (zones.length && now > this.nextArc) {
            const z = zones[(Math.random() * zones.length) | 0];
            const [x, y] = this.p([z[0], z[1]]);
            this.arcs.push(this.arc([x, y, z[2] * s, z[3] * s]));
            this.nextArc = now + 120 + Math.random() * 900;
        }
        for (const a of this.arcs) {
            a.t += dt;
            const on = Math.random() < 0.8 ? 1 - a.t / a.life : 0.2;
            for (const [wd, col] of [
                [9, `rgba(80,140,255,${0.12 * on})`],
                [3.5, `rgba(140,190,255,${0.45 * on})`],
                [1.2, `rgba(235,245,255,${0.95 * on})`]
            ]) {
                c.strokeStyle = col;
                c.lineWidth = wd;
                c.beginPath();
                a.pts.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
                c.stroke();
            }
        }
        this.arcs = this.arcs.filter(a => a.t < a.life);
        c.globalCompositeOperation = 'source-over';
    }
    stop() {
        cancelAnimationFrame(this.raf);
        removeEventListener('resize', this.resize);
        this.cv = null;
    }
}

// файл живого фона: { type: 'verdict-scene', name, image: data-URL, w, h, beams, arcs, sparks, tint, fx }
const Scene = {
    valid(d) {
        return (
            d &&
            d.type === 'verdict-scene' &&
            /^data:image\//.test(d.image || '') &&
            d.w > 0 &&
            d.h > 0 &&
            (!d.beams || Array.isArray(d.beams))
        );
    },
    // только числа и известные поля: файл приходит от другого человека
    clean(d) {
        const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
        const num = v => (Number.isFinite(+v) ? +v : 0);
        const pt = q => [num(q && q[0]), num(q && q[1])];
        const rgb = v => (/^\d{1,3},\d{1,3},\d{1,3}$/.test(String(v)) ? String(v) : '255,40,40');
        return {
            name: String(d.name || 'Живой фон').slice(0, 60),
            w: num(d.w),
            h: num(d.h),
            beams: (d.beams || [])
                .filter(b => b && Array.isArray(b.pts))
                .slice(0, 8)
                .map(b => ({
                    pts: b.pts.filter(Array.isArray).slice(0, 12).map(pt),
                    color: rgb(b.color),
                    width: Math.min(60, Math.max(1, num(b.width) || 10)),
                    eye: Math.min(120, Math.max(1, num(b.eye) || 26))
                }))
                .filter(b => b.pts.length >= 2),
            arcs: (Array.isArray(d.arcs) ? d.arcs : [])
                .filter(Array.isArray)
                .slice(0, 8)
                .map(z => [0, 1, 2, 3].map(i => Math.max(0, num(z[i])))),
            sparks: Math.min(3, Math.max(0, d.sparks === undefined ? 1 : num(d.sparks))),
            tint: own(SCENE_TINTS, d.tint) ? d.tint : '',
            fx: own(FX_EFFECTS, d.fx) ? d.fx : ''
        };
    }
};

// стили
// UI в Shadow DOM, стили форума не мешают
const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
:host, .v-root {
  --acc: #e5484d; --acc2: #e5484d; --acc-a: rgba(229,72,77,.16);
  transition: --acc .8s ease, --acc2 .8s ease;
  --bg: color-mix(in srgb, var(--acc) 4%, rgba(11,12,16,.9));
  --bg-2: color-mix(in srgb, var(--acc) 3%, #111217);
  --bg-3: color-mix(in srgb, var(--acc) 4%, #181a21);
  --bg-4: #1f212a;
  --line: rgba(255,255,255,.07); --line-2: rgba(255,255,255,.12);
  --tx: #eef0f4; --tx-2: #a6abb8; --tx-3: #6b7080;
  --r: 14px; --r-s: 9px;
  --ease: cubic-bezier(.2,.8,.2,1);
  --sh: 0 24px 60px -18px rgba(0,0,0,.75), 0 0 0 1px var(--line);
  --edge: linear-gradient(135deg, color-mix(in srgb, var(--acc) 55%, transparent), rgba(255,255,255,.06) 35%, rgba(255,255,255,.03) 65%, color-mix(in srgb, var(--acc2) 45%, transparent));
  font: 500 13px/1.45 "Inter", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
  color: var(--tx); -webkit-font-smoothing: antialiased;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
input, textarea, select { font: inherit; color: var(--tx); }
.vi { flex: none; display: block; }
.kbd { font: 600 10px/1 ui-monospace, Consolas, monospace; color: var(--tx-3); border: 1px solid var(--line-2); border-bottom-width: 2px; border-radius: 5px; padding: 3px 5px; }
.muted { color: var(--tx-3); }
.edge { position: relative; }
.edge::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: var(--edge); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
.vic { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); flex: none; }
.vic.sm { width: 18px; height: 18px; border-radius: 6px; }

/* панель над редактором */
.bar { margin: 0 0 10px; padding: 12px; border-radius: var(--r); background:
  radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 45%), var(--bg);
  /* без backdrop-filter: размытие под панелью пересчитывалось на каждом кадре прокрутки (с 60 до 12 к/с) */
  box-shadow: 0 10px 30px -14px rgba(0,0,0,.7); display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 9px; margin-right: 4px; }
.brand-mark { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; color: var(--acc); background: color-mix(in srgb, var(--acc) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--acc) 25%, transparent); }
.brand-name { font-weight: 800; letter-spacing: .2em; font-size: 11px; }
.brand-name small { display: block; letter-spacing: .02em; font-weight: 600; color: var(--tx-3); font-size: 10.5px; margin-top: 1px; }
.pack-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px; color: var(--tx-2); font-size: 11.5px; font-weight: 650; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
.pack-btn:hover { color: var(--tx); border-color: var(--line-2); }
.spacer { flex: 1; }
.icon-btn { width: 30px; height: 30px; display: inline-grid; place-items: center; border-radius: var(--r-s); color: var(--tx-2); transition: background .15s, color .15s; }
.icon-btn:hover { background: rgba(255,255,255,.07); color: var(--tx); }
.icon-btn.acc:hover { color: var(--acc); background: var(--acc-a); }
.verdicts { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px 0 7px; border-radius: 11px; background: rgba(255,255,255,.035); border: 1px solid var(--line); font-weight: 650; font-size: 12.5px; transition: background .18s, border-color .18s, transform .18s var(--ease), box-shadow .18s; }
.chip:hover, .chip.open { background: color-mix(in srgb, var(--c) 13%, rgba(255,255,255,.02)); border-color: color-mix(in srgb, var(--c) 50%, transparent); box-shadow: 0 8px 20px -12px var(--c); transform: translateY(-1px); }
.chip .cnt { color: var(--tx-3); font-size: 10.5px; font-weight: 700; margin-left: -2px; }
.chip .down { color: var(--tx-3); margin-left: -3px; }
.chip.ghost { background: none; border-style: dashed; }
.hints { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.hint { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px 0 5px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); color: var(--tx); background: color-mix(in srgb, var(--c) 9%, transparent); font-size: 12px; font-weight: 650; transition: background .15s; }
.hint:hover { background: color-mix(in srgb, var(--c) 20%, transparent); }
.hint-lead { display: inline-flex; align-items: center; gap: 6px; color: var(--tx-2); font-size: 11.5px; font-weight: 650; padding-right: 2px; }
.hint-lead .vi { color: #ffd166; }
.facts { display: flex; gap: 6px; }
.fact { display: inline-flex; gap: 6px; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; background: rgba(255,255,255,.04); color: var(--tx-3); font-size: 11px; font-weight: 600; }
.fact b { color: var(--tx-2); font-weight: 700; }
.pending { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 6px 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--c) 15%, transparent); color: var(--tx); font-size: 11.5px; font-weight: 650; }
.pending button { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; color: var(--tx-2); }
.pending button:hover { background: rgba(255,255,255,.1); }

/* встроенная панель: часть редактора форума */
.bar.docked { margin: 0; padding: 8px 10px; gap: 6px; border-radius: var(--host-r, 6px) var(--host-r, 6px) 0 0; background: var(--host-bg, var(--bg)); border: 1px solid var(--host-line, var(--line)); box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.bar.docked .chip { height: 32px; padding: 0 10px 0 5px; border-radius: 8px; background: transparent; border-color: transparent; }
.bar.docked .chip:hover, .bar.docked .chip.open { background: color-mix(in srgb, var(--c) 12%, transparent); border-color: color-mix(in srgb, var(--c) 30%, transparent); box-shadow: none; transform: none; }
.bar.docked .chip.ghost { border-style: solid; }
.bar.docked .pack-btn { background: transparent; border-color: transparent; }
.bar.docked .pack-btn:hover { background: rgba(255,255,255,.05); }
.bar.docked .hints-row { padding-top: 7px; border-top: 1px solid var(--host-line, var(--line)); }
.bar.docked .hint, .bar.docked .pending { height: 26px; }
.tools { display: flex; align-items: center; gap: 2px; flex: none; margin-left: auto; padding-left: 8px; align-self: flex-start; }
.bar-row > .verdicts { flex: 1 1 0; min-width: 0; }
.chip, .hint, .pack-btn { white-space: nowrap; }
.v-root { container-type: inline-size; }
/* вердикты всегда в одну строку: на средней ширине прячем счётчики и сжимаем отступы,
   на узкой — строка прокручивается */
.bar-row > .verdicts { flex-wrap: nowrap; }
@container (max-width: 1100px) {
  .bar .facts { display: none; }
}
@container (max-width: 980px) {
  .bar-row > .verdicts { gap: 2px; }
  .bar-row > .verdicts .chip .cnt { display: none; }
  .bar.docked .chip { padding: 0 8px 0 4px; gap: 6px; }
}
@container (max-width: 860px) {
  .bar-row > .verdicts { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .bar-row > .verdicts::-webkit-scrollbar { display: none; }
  .bar-row > .verdicts { -webkit-mask-image: linear-gradient(90deg, #000 82%, transparent); mask-image: linear-gradient(90deg, #000 82%, transparent); padding-right: 28px; }
}
@container (max-width: 620px) {
  .bar .hint-lead { display: none; }
  .bar .who { flex-basis: 100%; }
  .bar .hints-row .spacer { display: none; }
}

/* выбор ответа: список + живой предпросмотр */
.picker { position: fixed; z-index: 2147483000; display: flex; width: 720px; height: min(480px, 72vh); border-radius: 16px; background: color-mix(in srgb, var(--bg-2) calc(var(--ui-alpha, .96) * 100%), transparent); backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3); box-shadow: var(--sh); overflow: hidden; animation: pop .18s var(--ease); }
.picker.solo { width: 360px; }
@keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(.985); } }
.pk-list { width: 340px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--line); min-height: 0; }
.picker.solo .pk-list { width: 100%; border-right: 0; }
.pk-head { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-bottom: 1px solid var(--line); }
.pk-head .ttl { font-weight: 750; font-size: 12.5px; }
.pk-head .spacer { flex: 1; }
.pk-head .lnk { font-size: 11.5px; color: var(--tx-3); font-weight: 650; display: inline-flex; gap: 5px; align-items: center; padding: 5px 7px; border-radius: 7px; }
.pk-head .lnk:hover { color: var(--tx); background: rgba(255,255,255,.06); }
.pk-search { display: flex; align-items: center; gap: 8px; margin: 8px 8px 2px; padding: 0 10px; height: 34px; border-radius: 9px; background: rgba(255,255,255,.04); border: 1px solid var(--line); color: var(--tx-3); }
.pk-search:focus-within { border-color: color-mix(in srgb, var(--acc) 55%, transparent); }
.pk-search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font-size: 12.5px; }
.pk-items { flex: 1; overflow: auto; padding: 6px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent; }
.group-title { position: sticky; top: -6px; z-index: 1; padding: 9px 8px 5px; font-size: 10px; font-weight: 750; color: var(--tx-3); text-transform: uppercase; letter-spacing: .12em; background: color-mix(in srgb, var(--bg-2) 92%, transparent); backdrop-filter: blur(10px); }
.item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 9px; border-radius: 10px; text-align: left; transition: background .12s; }
.item:hover, .item.sel { background: rgba(255,255,255,.055); }
.item.sel { box-shadow: inset 2px 0 0 var(--c); }
.item .t { flex: 1; min-width: 0; }
.item .t b { display: block; font-weight: 650; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item .t small { display: block; color: var(--tx-3); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reply { margin: 2px 0 10px 34px; padding: 9px 12px; border-radius: 10px; font-size: 12.5px; background: rgba(255,255,255,.04); border-left: 2px solid var(--line-2); }
.reply.fresh { border-left-color: var(--acc); background: color-mix(in srgb, var(--acc) 8%, transparent); }
.reply div { margin-top: 4px; white-space: normal; }
.crop { position: relative; margin: 0 auto; user-select: none; touch-action: none; }
.crop canvas { display: block; border-radius: 8px; }
.crop-box { position: absolute; cursor: move; box-shadow: inset 0 0 0 2px #fff; border-radius: 6px; }
.crop-box.round { border-radius: 50%; }
.crop-box i { position: absolute; right: -7px; bottom: -7px; width: 14px; height: 14px; border-radius: 50%; background: #fff; cursor: nwse-resize; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.crop { overflow: hidden; }
.logo-prev { height: 56px; max-width: 240px; object-fit: contain; border-radius: 10px; background: rgba(255,255,255,.04); padding: 4px; }
.bbp-field { position: relative; }
.bbpop { position: absolute; z-index: 30; display: flex; align-items: center; gap: 3px; padding: 5px; border-radius: 11px; background: rgba(16,18,24,.97); border: 1px solid var(--line-2); box-shadow: 0 14px 34px -10px rgba(0,0,0,.8); white-space: nowrap; animation: bbp-in .12s ease-out; }
@keyframes bbp-in { from { opacity: 0; transform: translateY(4px); } }
.bbpop > button { min-width: 28px; height: 28px; padding: 0 6px; border-radius: 7px; background: transparent; border: 0; color: var(--tx, #e4e6eb); font-size: 12.5px; cursor: pointer; }
.bbpop > button:hover { background: rgba(255,255,255,.08); }
.bbp-sw { display: flex; gap: 3px; align-items: center; }
.bbp-sw button, .bbp-sw label { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,.15); background: var(--c); cursor: pointer; transition: transform .12s; }
.bbp-sw button:hover, .bbp-sw label:hover { transform: scale(1.2); }
.bbp-sw label { position: relative; overflow: hidden; background: conic-gradient(#e5484d, #f5c542, #2fbf71, #3aa0ff, #a970ff, #e5484d); }
.bbp-sw input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.bbp-sep { width: 1px; height: 18px; background: var(--line-2); margin: 0 3px; }
@media (max-width: 760px) { .bbpop { flex-wrap: wrap; white-space: normal; max-width: 100%; } }
.upd-card.on { border-color: color-mix(in srgb, var(--acc) 55%, transparent); background: color-mix(in srgb, var(--acc) 10%, transparent); }
.ms-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
.ms-kpi { padding: 14px; border-radius: var(--r); background: color-mix(in srgb, var(--acc) 7%, var(--bg-3, rgba(255,255,255,.03))); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
.ms-kpi span { font-size: 11px; color: var(--tx-3); text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
.ms-kpi b { font-size: 28px; line-height: 1.1; color: color-mix(in srgb, var(--acc) 55%, #fff); }
.ms-kpi small { font-size: 11px; color: var(--tx-3); min-height: 14px; }
.ms-chart { display: flex; align-items: flex-end; gap: 3px; height: 150px; padding: 12px 12px 6px; }
.ms-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; min-width: 0; }
.ms-col i { width: 100%; min-height: 2px; border-radius: 4px 4px 1px 1px; background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 80%, #fff), var(--acc)); opacity: .85; }
.ms-col:hover i { opacity: 1; }
.ms-col span { font-size: 9px; color: var(--tx-3); }
.ms-list { padding: 12px 14px; }
.ms-h { font-size: 11px; font-weight: 750; color: var(--tx-3); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; }
.ms-bar { display: grid; grid-template-columns: minmax(90px, 40%) 1fr 34px; gap: 8px; align-items: center; padding: 4px 0; font-size: 12.5px; }
.ms-bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-bar div { height: 8px; border-radius: 4px; background: rgba(255,255,255,.06); overflow: hidden; }
.ms-bar i { display: block; height: 100%; border-radius: 4px; }
.ms-bar b { text-align: right; }
@media (max-width: 760px) { .ms-kpis { grid-template-columns: repeat(2, 1fr); } .ms-col span { display: none; } }
.tl-list { padding: 4px 14px; }
.tl-row { display: grid; grid-template-columns: 190px 1fr; gap: 10px; align-items: center; padding: 6px 0; }
.tl-v { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; font-size: 12.5px; color: var(--c); min-width: 0; }
.tl-more { margin-top: 10px; }
.tl-more summary { cursor: pointer; color: var(--mut, #9aa0ab); font-size: 12.5px; padding: 6px 0; }
@media (max-width: 760px) { .tl-row { grid-template-columns: 1fr; gap: 4px; } }
.qn-list { padding: 4px 14px; }
.qn-row { display: grid; grid-template-columns: minmax(150px, 1.2fr) 2fr 150px auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
.qn-row:last-child { border-bottom: 0; }
.qn-row select.inp { width: 100%; min-width: 0; }
.qn-row .inp.bad { border-color: #e5484d; box-shadow: 0 0 0 3px rgba(229,72,77,.18); }
.qn-act { display: flex; gap: 2px; }
@media (max-width: 760px) { .qn-row { grid-template-columns: 1fr; } }
.no-perm { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 5px 6px 5px 11px; border-radius: 999px; font-size: 11.5px; color: var(--tx-3); background: rgba(255,255,255,.035); border: 1px solid var(--line); }
.no-perm button { padding: 3px 10px; border-radius: 999px; color: var(--tx-2); font-weight: 650; background: rgba(255,255,255,.06); }
.no-perm button:hover { color: var(--tx); background: rgba(255,255,255,.1); }
.item .fit-b { color: #ffd166; margin-right: 5px; text-shadow: 0 0 8px rgba(255,209,102,.6); }
.item.fit { background: color-mix(in srgb, var(--c) 6%, transparent); }
.item.fit .t small { color: color-mix(in srgb, var(--c) 45%, var(--tx-2)); }
.item.rec { box-shadow: inset 2px 0 0 #ffd166; }
.chip .fit-dot { position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--tx-2); box-shadow: 0 0 0 2px var(--bg); }
.chip .fit-dot.rec { background: #ffd166; box-shadow: 0 0 0 2px var(--bg), 0 0 8px #ffd166; }
.hint.maybe { border-style: dashed; background: transparent; }
.hint.more { padding: 0 10px 0 12px; color: var(--tx-2); border-style: dashed; background: transparent; }
.item .bolt { opacity: 0; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--tx-2); }
.item:hover .bolt, .item.sel .bolt { opacity: 1; }
/* на тач-экранах невидимые кнопки строки не должны ловить нажатия */
@media (hover: none) {
  .item .edit, .item .hide { display: none; }
  .item .bolt { opacity: 1; }
}
.item .bolt:hover { background: var(--acc-a); color: var(--acc); }
.pk-foot { padding: 8px 12px; border-top: 1px solid var(--line); color: var(--tx-3); font-size: 11px; display: flex; gap: 12px; flex-wrap: wrap; }
.pk-prev { flex: 1; min-width: 0; display: flex; flex-direction: column; background: radial-gradient(100% 80% at 100% 0%, color-mix(in srgb, var(--c, var(--acc)) 10%, transparent), transparent 60%); }
.pk-prev-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 0; font-size: 10px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; color: var(--tx-3); }
.pk-prev-body { flex: 1; overflow: auto; padding: 10px 14px; scrollbar-width: thin; }
.pk-actions { display: flex; gap: 8px; padding: 10px 14px 14px; }
.pk-actions .btn { flex: 1; }

/* предпросмотр */
.xf-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; font-size: 12px; }
.xf-label { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #fff; background: var(--c); }
.xf-title { font-weight: 650; color: var(--tx); }
.xf-body { padding: 14px 16px; border-radius: 10px; border: 1px solid var(--line); background: #17181d; font: 15px/1.55 "Segoe UI", Roboto, system-ui, sans-serif; color: #dfe2e8; word-wrap: break-word; }
.bb-link { color: #6cb4ff; }
.bb-quote { margin: 6px 0; padding: 8px 12px; border-left: 3px solid color-mix(in srgb, var(--acc) 60%, transparent); background: rgba(255,255,255,.035); border-radius: 0 6px 6px 0; text-align: left; }
.bb-quote-head { font-size: .85em; font-weight: 700; margin-bottom: 4px; color: var(--tx-2); }
.bb-spoiler { margin: 6px 0; text-align: left; }
.bb-spoiler-btn { display: inline-block; padding: 4px 10px; border-radius: 5px; font-size: 12px; font-weight: 650; background: rgba(255,255,255,.08); }
.bb-spoiler-body { margin-top: 6px; padding: 8px 10px; border: 1px dashed var(--line-2); border-radius: 6px; }
.bb-img { max-width: 100%; border-radius: 4px; }
.bb-cur { display: inline-block; width: 2px; height: 1.1em; vertical-align: -2px; background: var(--acc); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* модальные окна */
.scrim { position: fixed; inset: 0; z-index: 2147482990; background: rgba(4,5,8,.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: grid; place-items: start center; padding: 7vh 16px 16px; animation: fade .15s; }
@keyframes fade { from { opacity: 0; } }
.modal { width: min(980px, 100%); height: min(680px, 86vh); display: flex; flex-direction: column; background: color-mix(in srgb, var(--bg-2) calc(var(--ui-alpha, .96) * 100%), transparent); backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3); border-radius: 18px; box-shadow: var(--sh); overflow: hidden; animation: pop .2s var(--ease); }
.modal.sm { width: min(820px, 100%); height: auto; max-height: 88vh; }
.modal.pal { width: min(760px, 100%); height: auto; }
.m-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.m-title { font-weight: 800; font-size: 14px; }
.m-sub { color: var(--tx-3); font-size: 11.5px; }
.m-body { display: flex; min-height: 0; flex: 1; }
.side { width: 220px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--line); background: radial-gradient(140% 60% at 0% 0%, color-mix(in srgb, var(--acc) 12%, transparent), transparent 60%); }
.side-brand { display: flex; align-items: center; gap: 10px; padding: 16px 16px 14px; }
.side-brand .brand-mark { width: 34px; height: 34px; border-radius: 11px; }
.tabs { padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.tab { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; color: var(--tx-2); font-weight: 650; text-align: left; transition: background .15s, color .15s; }
.tab:hover { background: rgba(255,255,255,.04); color: var(--tx); }
.tab.on { background: rgba(255,255,255,.07); color: var(--tx); box-shadow: inset 2px 0 0 var(--acc); }
.tab.on .vi { color: var(--acc); }
.side-foot { padding: 12px 16px 16px; color: var(--tx-3); font-size: 11px; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pane { flex: 1; min-width: 0; overflow: auto; padding: 20px 22px 26px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent; }
.pane-title { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
.pane-sub { color: var(--tx-3); margin: 0 0 18px; font-size: 12.5px; }
.sec { margin-bottom: 22px; }
.sec h4 { margin: 0 0 10px; font-size: 10.5px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; color: var(--tx-3); display: flex; align-items: center; gap: 8px; }
.card { background: rgba(255,255,255,.025); border: 1px solid var(--line); border-radius: 12px; padding: 4px 14px; }
.row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
.row .lbl { flex: 1; }
.row .lbl small { display: block; color: var(--tx-3); font-size: 11.5px; }
.inp, select.inp, textarea.inp { width: 100%; background: rgba(0,0,0,.25); border: 1px solid var(--line-2); border-radius: var(--r-s); padding: 9px 11px; outline: none; transition: border-color .15s, box-shadow .15s; }
.inp:focus { border-color: color-mix(in srgb, var(--acc) 60%, transparent); box-shadow: 0 0 0 3px var(--acc-a); }
textarea.inp { min-height: 150px; resize: vertical; line-height: 1.5; }
select.inp { width: auto; min-width: 180px; }
.sw { position: relative; width: 38px; height: 22px; flex: none; border-radius: 99px; background: rgba(255,255,255,.12); transition: background .2s; }
.sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s var(--ease); box-shadow: 0 2px 4px rgba(0,0,0,.3); }
.sw.on { background: var(--acc); }
.sw.on::after { transform: translateX(16px); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 10px; background: rgba(255,255,255,.06); border: 1px solid var(--line); font-weight: 700; font-size: 12px; transition: background .15s, filter .15s, transform .15s; white-space: nowrap; }
.btn:hover { background: rgba(255,255,255,.1); }
.btn:active { transform: translateY(1px); }
.btn.pri { background: linear-gradient(140deg, var(--acc), color-mix(in srgb, var(--acc2) 82%, #000)); border-color: transparent; color: #fff; box-shadow: 0 8px 20px -10px var(--acc); }
.btn.pri:hover { filter: brightness(1.12); }
.btn.ghost { background: none; }
.btn.danger:hover { background: rgba(229,72,77,.15); color: #ff8a8d; }
.btn:disabled { opacity: .45; pointer-events: none; }
.btns { display: flex; gap: 8px; flex-wrap: wrap; }
input[type=range] { accent-color: var(--acc); width: 170px; }
input[type=color] { width: 30px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: none; cursor: pointer; }
.swatches { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.swatch { width: 24px; height: 24px; border-radius: 8px; background: var(--c); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
.swatch.on { box-shadow: 0 0 0 2px var(--bg-2), 0 0 0 4px var(--c); }
.seg { display: inline-flex; padding: 3px; border-radius: 10px; background: rgba(0,0,0,.25); border: 1px solid var(--line); }
.seg button { height: 28px; padding: 0 12px; border-radius: 7px; font-size: 12px; font-weight: 650; color: var(--tx-2); }
.seg button.on { background: rgba(255,255,255,.09); color: var(--tx); }

/* темы и фоны */
.walls { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.walls.big { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.wall { position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background: var(--bg-3) center/cover no-repeat; box-shadow: inset 0 0 0 1px var(--line); user-select: none; -webkit-user-drag: none; transition: transform .2s var(--ease), box-shadow .2s; }
.wall:hover { transform: translateY(-2px); }
.wall.loading::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.07) 50%, transparent 70%) 0 0/250% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -150% 0; } }
.wall.on { box-shadow: 0 0 0 2px var(--acc), 0 12px 26px -12px var(--acc); }
.wall .nm { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 10px 8px; font-size: 11.5px; font-weight: 700; background: linear-gradient(transparent, rgba(0,0,0,.8)); display: flex; align-items: center; gap: 7px; }
.wall .nm .muted { margin-left: auto; font-weight: 600; flex: none; white-space: nowrap; }
.wall .nm > span:not(.muted):not(.dotc) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wall .nm .dotc { width: 9px; height: 9px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
.wall .tagc { position: absolute; top: 8px; left: 8px; font-size: 10px; font-weight: 750; letter-spacing: .06em; padding: 3px 7px; border-radius: 6px; background: rgba(0,0,0,.55); backdrop-filter: blur(4px); }
.wall .act { position: absolute; top: 7px; right: 7px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
.wall:hover .act { opacity: 1; }
.wall .act button { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; background: rgba(0,0,0,.6); }
.wall .act button:hover { background: var(--acc); }
.wall.add { display: grid; place-items: center; color: var(--tx-3); border: 1px dashed var(--line-2); box-shadow: none; background: rgba(255,255,255,.02); }
.wall.add:hover { color: var(--tx); border-color: var(--acc); }

/* шаблоны */
.tpl-head { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.tpl-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; }
.tpl-row:hover { background: rgba(255,255,255,.035); }
.tpl-row .t { flex: 1; min-width: 0; }
.tpl-row .t b { font-weight: 650; }
.tpl-row .t small { display: block; color: var(--tx-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tag { font: 600 10.5px/1 ui-monospace, Consolas, monospace; color: var(--tx-2); background: rgba(255,255,255,.06); padding: 4px 6px; border-radius: 5px; }
.vars { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.vars button { font: 600 11px/1 ui-monospace, Consolas, monospace; padding: 5px 7px; border-radius: 6px; background: rgba(255,255,255,.06); color: var(--tx-2); }
.vars button:hover { color: var(--tx); background: var(--acc-a); }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.field > span { font-size: 11.5px; color: var(--tx-2); font-weight: 650; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.bb { padding: 12px; background: rgba(0,0,0,.3); border-radius: 10px; font: 12px/1.55 ui-monospace, Consolas, monospace; color: var(--tx-2); white-space: pre-wrap; word-break: break-word; }
.badge-warn { display: inline-flex; gap: 6px; align-items: center; padding: 4px 8px; border-radius: 6px; background: rgba(245,165,36,.14); color: #ffc65c; font-size: 11.5px; font-weight: 650; }
.about { display: flex; flex-direction: column; gap: 12px; color: var(--tx-2); }
.about b { color: var(--tx); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.pill { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px 0 8px; border-radius: 999px; border: 1px solid var(--line-2); font-weight: 650; font-size: 12px; color: var(--tx-2); }
.pill.on { border-color: color-mix(in srgb, var(--c, var(--acc)) 60%, transparent); background: color-mix(in srgb, var(--c, var(--acc)) 14%, transparent); color: var(--tx); }
.hero { display: flex; gap: 14px; align-items: center; padding: 16px; border-radius: 14px; margin-bottom: 18px; background: radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--acc) 22%, transparent), transparent 55%), rgba(255,255,255,.025); border: 1px solid var(--line); }
.hero .big { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; background: var(--acc-a); color: var(--acc); flex: none; }
.hero b { font-size: 14px; }
.hero p { margin: 2px 0 0; color: var(--tx-2); }
.hist { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.hist:last-child { border-bottom: 0; }
.hist a { color: var(--acc); text-decoration: none; font-weight: 650; }

/* цвета */
.cprev { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #07080b; }
.cp-head { padding: 10px 14px; font-size: 11px; font-weight: 800; letter-spacing: .12em; color: #e6e8ee; transition: background .8s; }
.cp-block { margin: 12px; padding: 14px; border-radius: 10px; border: 1px solid; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #dfe2e8; transition: background .8s, border-color .8s; }
.cp-btn { padding: 7px 14px; border-radius: 8px; color: #fff; font-weight: 700; font-size: 12px; white-space: nowrap; transition: background .8s; }
.cp-strip { height: 6px; transition: background .8s; }

/* должность */
.roles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.role-card { display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255,255,255,.025); transition: border-color .15s, background .15s, transform .15s var(--ease); }
.role-card:hover { border-color: var(--line-2); background: rgba(255,255,255,.05); transform: translateY(-1px); }
.role-card.on { border-color: color-mix(in srgb, var(--acc) 60%, transparent); background: var(--acc-a); }
.role-card .t b, .role-card > b { display: block; font-size: 13.5px; }
.role-card .t small { display: block; color: var(--tx-2); margin-top: 2px; }
.role-card .t em { display: block; font-style: normal; color: var(--tx-3); font-size: 11px; margin-top: 6px; }
.role-lnk { color: var(--acc); cursor: pointer; }
.role-lnk:hover { text-decoration: underline; }
.ag-prev { margin: 2px 0; max-height: 220px; overflow: auto; }
.who { font-size: 11.5px; font-weight: 600; color: var(--tx-3); margin-right: 4px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .edit { opacity: 0; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--tx-3); }
.item:hover .edit { opacity: 1; }
.item .edit:hover { background: rgba(255,255,255,.08); color: var(--tx); }
.item .hide { opacity: 0; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--tx-3); }
.item:hover .hide { opacity: 1; }
.item .hide:hover { background: rgba(255,255,255,.08); color: var(--tx); }
.toast-act { margin-left: 6px; padding: 5px 10px; border-radius: 8px; background: rgba(255,255,255,.08); font-weight: 700; font-size: 12px; }
.toast-act:hover { background: var(--acc); color: #fff; }
.toast-later { padding: 5px 8px; border-radius: 8px; background: transparent; color: var(--mut, #9aa0ab); font-size: 12px; }
.toast-later:hover { color: inherit; background: rgba(255,255,255,.06); }
.toast-act:hover { background: var(--acc); color: #fff; }
.fxgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.fxbtn { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--line); background: rgba(255,255,255,.025); font-weight: 650; text-align: left; }
.fxbtn:hover { border-color: var(--line-2); }
.fxbtn.on { border-color: color-mix(in srgb, var(--acc) 60%, transparent); background: var(--acc-a); }

/* уведомления, лаунчер */
.toasts { position: fixed; z-index: 2147483100; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
.toast { display: flex; align-items: center; gap: 10px; padding: 11px 15px 11px 11px; border-radius: 12px; background: color-mix(in srgb, var(--bg-3) calc(var(--ui-alpha, .96) * 100%), transparent); backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3); box-shadow: var(--sh); font-weight: 650; animation: pop .2s var(--ease); max-width: 400px; }
.launch { position: fixed; z-index: 2147482980; left: 18px; bottom: 18px; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: color-mix(in srgb, var(--acc) 75%, #fff); background: color-mix(in srgb, var(--acc) 8%, rgba(12,13,17,.88)); box-shadow: 0 0 0 1px rgba(255,255,255,.06); opacity: .6; transition: opacity .2s, transform .2s var(--ease); }
.launch:hover { opacity: 1; transform: translateY(-1px); }

@media (max-width: 760px) {
  .main { min-height: 0; }
  .row { flex-wrap: wrap; }
  .seg { flex-wrap: wrap; max-width: 100%; }
  .row select.inp { max-width: 100%; }
  .picker { width: calc(100vw - 20px) !important; }
  .pk-prev { display: none; }
  .pk-list { width: 100%; border-right: 0; }
  .m-body { flex-direction: column; }
  .side { width: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .side-brand, .side-foot { display: none; }
  .tabs { flex-direction: row; overflow-x: auto; padding: 8px; }
  .tab span { white-space: nowrap; }
  .grid2, .split, .roles { grid-template-columns: 1fr; }
  .facts { display: none; }
  .modal { height: 92vh; }
  .scrim { padding-top: 3vh; }
  .launch { left: 12px; bottom: 14px; width: 40px; height: 40px; border-radius: 12px; }
  .toasts { top: 12px; bottom: auto; right: 12px; left: 12px; align-items: stretch; }
}
`;

/* Тема самого форума: фон, стекло, акцент. Подключается отдельным <style> в <head>. */
// цвета элементов форума, пустое = авто
const COLOR_PARTS = [
    ['accent2', 'Второй акцент', 'Цвет, в который перетекает акцент в градиентах'],
    ['header', 'Шапка форума', 'Верхняя панель и меню'],
    ['blocks', 'Блоки и посты', 'Цвет «стекла» сообщений и списков'],
    ['border', 'Рамки', 'Контуры блоков и постов'],
    ['buttons', 'Кнопки', 'Кнопка «Ответить» и основные кнопки'],
    ['links', 'Ссылки', 'Ссылки в сообщениях']
];
const Colors = {
    get(s, k) {
        const c = s.colors || {},
            a = s.accent;
        if (c[k]) return c[k];
        // без ручной настройки поверхности слегка окрашены в цвета темы
        const a2 = c.accent2 || a;
        return {
            accent2: a,
            header: this.mix('#0b0c11', a, 0.1),
            blocks: this.mix('#0c0d12', a2, 0.07),
            border: this.mix('#ffffff', a2, 0.45),
            buttons: a,
            links: '#6cb4ff'
        }[k];
    },
    // смешать два #rrggbb, t = доля второго
    mix(x, y, t) {
        const p = h => {
            const v = String(h).replace('#', '');
            const f = v.length === 3 ? v.replace(/./g, '$&$&') : v.slice(0, 6);
            const n = parseInt(f, 16);
            return Number.isNaN(n) ? [128, 128, 128] : [n >> 16, (n >> 8) & 255, n & 255];
        };
        const A = p(x),
            B = p(y);
        return (
            '#' +
            A.map((c, i) =>
                Math.round(c + (B[i] - c) * t)
                    .toString(16)
                    .padStart(2, '0')
            ).join('')
        );
    },
    auto(s, k) {
        return !(s.colors || {})[k];
    }
};
function forumCss(s) {
    const t = s.theme,
        a = s.accent,
        C = k => Colors.get(s, k),
        g = (s.colors || {}).gradients !== false;
    const glass = Math.round(t.glass * 100);
    const light = Perf.light();
    const blur =
        t.blur && !light
            ? `backdrop-filter: blur(${t.blur}px) saturate(1.2); -webkit-backdrop-filter: blur(${t.blur}px) saturate(1.2);`
            : '';
    // blur над анимацией пересчитывается каждый кадр, при живом фоне без него
    const w = t.wall || {},
        gen = w.kind === 'gen' && typeof GENERATORS !== 'undefined' && GENERATORS[w.gen];
    const scene =
        w.kind === 'photo' && t.rotate === 'off' && Store.get('photos', []).some(p => p.id === w.id && p.scene);
    const animated =
        (gen && gen.live && t.liveSpeed > 0 && t.rotate === 'off') || scene || (t.fx && t.fx.effect !== 'none');
    const blockBlur = animated ? '' : blur;
    return `
:root { --vd-acc: ${a}; --vd-acc2: ${C('accent2')}; --vd-head: ${C('header')}; --vd-block: ${C('blocks')}; --vd-border: ${C('border')}; --vd-btn: ${C('buttons')}; --vd-link: ${C('links')};
  --vd-glass: color-mix(in srgb, var(--vd-block) ${glass}%, transparent); --vd-line: color-mix(in srgb, var(--vd-border) ${Colors.auto(s, 'border') ? 9 : 40}%, transparent);
  --vd-edge: ${g ? 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--vd-acc) 70%, transparent) 30%, color-mix(in srgb, var(--vd-acc2) 70%, transparent) 70%, transparent)' : 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--vd-acc) 60%, transparent), transparent)'}; }
#vd-wall::after { content: ""; position: absolute; inset: 0; z-index: 2; background: linear-gradient(180deg, rgba(5,6,9,${Math.min(0.95, t.dim + 0.1)}), rgba(5,6,9,${t.dim}) 30%, rgba(5,6,9,${Math.min(0.95, t.dim + 0.15)})); }
${t.grain ? `#vd-wall::before { content: ""; position: absolute; inset: 0; z-index: 3; opacity: .07; background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }` : ''}
/* тёмная подложка под фоном: пока картинка проявляется, не мелькает белое полотно браузера */
html { background: #07080b !important; }
body, .p-pageWrapper, .p-body, .p-body-inner, .uix_pageWrapper--fixed, .p-body-main, .p-body-content, .p-body-pageContent { background: transparent !important; }
body { color: #e4e6eb !important; }
a { transition: color .2s; }
/* выделение текста: плотная заливка и белый текст — видно на любом фоне */
::selection { background: color-mix(in srgb, var(--vd-acc) 78%, #1a1b20) !important; color: #fff !important; -webkit-text-fill-color: #fff !important; text-shadow: none !important; }
::-moz-selection { background: color-mix(in srgb, var(--vd-acc) 78%, #1a1b20) !important; color: #fff !important; text-shadow: none !important; }
/* на html: свойства наследуются, а правило «*» пересчитывалось бы для каждого элемента страницы */
html { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--vd-acc) 55%, transparent) transparent; }
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--vd-acc) 50%, transparent); border-radius: 9px; border: 2px solid transparent; background-clip: content-box; }

/* шапка и навигация */
/* меню форума, прилипшее при прокрутке: плотный фон, чтобы темы не просвечивали сквозь надписи */
.p-navSticky.is-sticky, .vd-stuck { background: color-mix(in srgb, var(--vd-head) 96%, #05060a) !important; box-shadow: 0 10px 24px -12px rgba(0,0,0,.85) !important; border-bottom: 1px solid color-mix(in srgb, var(--vd-acc) 30%, transparent) !important; }
.p-navSticky.is-sticky .p-nav, .p-navSticky.is-sticky .p-sectionLinks, .vd-stuck .p-nav, .vd-stuck .p-sectionLinks { background: transparent !important; }
/* верхняя панель модератора: стекло, линия цвета темы, ссылки-плашки */
.p-staffBar { background: color-mix(in srgb, var(--vd-head) 97%, #05060a) !important; border-bottom: 1px solid color-mix(in srgb, var(--vd-acc) 35%, transparent) !important; box-shadow: 0 8px 20px -14px rgba(0,0,0,.8); }
.p-staffBar-inner { min-height: 38px; }
.p-staffBar .p-staffBar-link, .p-staffBar a.p-navgroup-link { border-radius: 8px !important; padding: 5px 10px !important; color: #d6d8de !important; transition: background .15s, color .15s; }
.p-staffBar .p-staffBar-link:hover, .p-staffBar a.p-navgroup-link:hover { background: color-mix(in srgb, var(--vd-acc) 16%, transparent) !important; color: #fff !important; }
.p-staffBar .badge, .p-staffBar .badgeContainer::after { background: var(--vd-acc) !important; color: #fff !important; border-radius: 6px !important; }
.p-header, .p-nav, .p-sectionLinks, .uix_headerContainer {
  background: ${g ? `linear-gradient(90deg, color-mix(in srgb, var(--vd-head) ${glass}%, transparent), color-mix(in srgb, color-mix(in srgb, var(--vd-head) 80%, var(--vd-acc2)) ${glass}%, transparent))` : `color-mix(in srgb, var(--vd-head) ${glass}%, transparent)`} !important;
  ${blur}
}
.p-nav, .p-header { border-bottom: 1px solid var(--vd-line) !important; ${g ? 'border-image: linear-gradient(90deg, transparent, var(--vd-acc), var(--vd-acc2), transparent) 1 !important;' : ''} }
.p-navEl, .p-navEl-link { border-radius: 10px; transition: background .2s, color .2s; }
.p-navEl.is-selected, .p-navEl.is-selected .p-navEl-link, .tabs-tab.is-active {
  color: #fff !important; background: color-mix(in srgb, var(--vd-acc) 18%, transparent) !important; border-bottom-color: transparent !important;
  box-shadow: inset 0 -2px 0 var(--vd-acc) !important;
}
.p-navEl:hover, .p-navEl-link:hover { background: rgba(255,255,255,.06); }

/* заголовок страницы и хлебные крошки */
.p-title-value { color: #fff !important; text-shadow: 0 2px 18px rgba(0,0,0,.55); letter-spacing: .01em; }
.p-breadcrumbs > li > a, .p-breadcrumbs a {
  display: inline-block; padding: 3px 10px; border-radius: 999px; color: #c9ccd4 !important;
  background: rgba(10,11,15,.35); border: 1px solid var(--vd-line); transition: background .2s, color .2s;
}
.p-breadcrumbs a:hover { color: #fff !important; background: color-mix(in srgb, var(--vd-acc) 22%, transparent); }
.p-breadcrumbs > li:after, .p-breadcrumbs > li:before { opacity: .45; }

/* блоки-карточки */
.block-container, .message, .p-footer, .menu-content, .overlay-content, .memberTooltip, .p-body-sidebar .block-container, .blockMessage, .block-filterBar, .uix_extendedFooter {
  background-color: var(--vd-glass) !important;
  ${blockBlur}
}
/* подложки темы форума, иначе поверх стекла серые плашки */
.node-body, .node-main, .node-extra, .node-stats, .node-meta, .structItem-cell, .block-body, .block-row, .block-footer, .blockLink, .contentRow, .alert, .p-footer-inner, .p-footer-row, .p-footer-copyright, .uix_extendedFooter .pageContent, .uix_extendedFooterRow, .uix_extendedFooter .block-body { background-color: transparent !important; }
.blockLink { border-radius: 10px; transition: background .2s, color .2s; }
.blockLink:hover { background-color: color-mix(in srgb, var(--vd-acc) 10%, transparent) !important; }
.blockLink.is-selected { color: #fff !important; background-color: color-mix(in srgb, var(--vd-acc) 16%, transparent) !important; box-shadow: inset 3px 0 0 var(--vd-acc); }
.alert.is-unread, .block-row.is-unread { background-color: color-mix(in srgb, var(--vd-acc) 8%, transparent) !important; }
/* поиск в шапке */
.uix_searchBar input, .uix_searchBarInner, .uix_searchForm, .p-header-search input, input.input--search, input[type="search"] {
  background-color: rgba(8,9,13,.4) !important; border: 1px solid var(--vd-line) !important; border-radius: 12px !important; color: #eef0f4 !important;
}
.block-container, .message, .blockMessage {
  border: 1px solid var(--vd-line) !important; border-radius: 16px !important;
  background-image: var(--vd-edge), radial-gradient(120% 140px at 0 0, color-mix(in srgb, var(--vd-acc) 9%, transparent), transparent), linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0) 120px) !important;
  background-size: 100% 1px, auto, auto !important; background-repeat: no-repeat !important; background-position: top, 0 0, 0 0 !important;
  box-shadow: 0 24px 50px -28px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.05) !important;
}
.block-header, .block-minorHeader, .block-filterBar, .block-tabHeader {
  background: linear-gradient(90deg, color-mix(in srgb, var(--vd-acc) 13%, transparent), color-mix(in srgb, var(--vd-acc2) 4%, transparent) 55%, transparent) !important; border-bottom: 1px solid var(--vd-line) !important; color: #f1f2f5 !important;
  box-shadow: inset 3px 0 0 var(--vd-acc) !important;
}
.block-filterBar { font-size: 11.5px !important; }

/* разделы и темы */
.node, .structItem { background: transparent !important; border-color: var(--vd-line) !important; transition: background .2s; }
.node:hover, .structItem:hover { background: color-mix(in srgb, var(--vd-acc) 7%, transparent) !important; }
.node-icon i {
  display: inline-grid !important; place-items: center; width: 42px; height: 42px; border-radius: 13px; font-size: 20px !important; line-height: 1 !important;
  color: color-mix(in srgb, var(--vd-acc) 55%, #fff) !important;
  background: linear-gradient(140deg, color-mix(in srgb, var(--vd-acc) 26%, transparent), color-mix(in srgb, var(--vd-acc2) 12%, transparent)) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vd-acc) 38%, transparent), 0 8px 22px -10px var(--vd-acc) !important;
}
.node--read .node-icon i { color: #8a8e99 !important; background: rgba(255,255,255,.045) !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07) !important; }
.node-title a, .structItem-title a { color: #f3f4f7 !important; font-weight: 700; }
.node-title a:hover, .structItem-title a:hover { color: color-mix(in srgb, var(--vd-acc) 70%, #fff) !important; }
.node-stats, .node-extra-date, .structItem-minor, .structItem-cell--meta, .structItem-cell--latest { color: #a3a7b2 !important; }
.structItem.is-sticky, .structItem--sticky { border-left: 0 !important; box-shadow: inset 3px 0 0 var(--vd-acc); background: color-mix(in srgb, var(--vd-acc) 5%, transparent) !important; }
.structItem.is-unread .structItem-title a, .node--unread .node-title a { text-shadow: 0 0 18px color-mix(in srgb, var(--vd-acc) 35%, transparent); }
.node:hover .node-icon i { transform: translateY(-1px) scale(1.04); transition: transform .25s; }

/* префиксы */
.label {
  --l: #8b8f9a; border-radius: 999px !important; padding: 2px 10px !important; font-weight: 700 !important; letter-spacing: .01em;
  background: color-mix(in srgb, var(--l) 24%, rgba(12,13,17,.55)) !important; color: color-mix(in srgb, var(--l) 35%, #fff) !important;
  border: 1px solid color-mix(in srgb, var(--l) 55%, transparent) !important; box-shadow: 0 0 14px -4px color-mix(in srgb, var(--l) 70%, transparent);
}
.label--red { --l: #ff4b4b; } .label--orange { --l: #ff9a1f; } .label--yellow { --l: #ffd23f; } .label--green, .label--lightGreen { --l: #35d07f; }
.label--olive { --l: #a3c43a; } .label--blue, .label--royalBlue { --l: #4f8dff; } .label--skyBlue { --l: #3fc6ff; } .label--purple { --l: #a970ff; }
.label--gray, .label--silver { --l: #9aa0ab; } .label--primary, .label--accent { --l: var(--vd-acc); }

/* аватары, ники, плашки */
.avatar { border-radius: 50% !important; box-shadow: 0 0 0 2px rgba(255,255,255,.08); }
.message-avatar .avatar, .memberHeader-avatar .avatar { box-shadow: 0 0 0 3px var(--vd-glass), 0 0 0 5px color-mix(in srgb, var(--vd-acc) 75%, transparent), 0 10px 30px -8px color-mix(in srgb, var(--vd-acc) 60%, transparent) !important; }
.userBanner { border-radius: 999px !important; padding: 2px 10px !important; letter-spacing: .04em; box-shadow: 0 6px 16px -8px rgba(0,0,0,.8); }
.userTitle { color: #a8acb7 !important; }

/* посты */
.message-cell--user, .message-userArrow { background: linear-gradient(180deg, color-mix(in srgb, var(--vd-acc) 11%, transparent), color-mix(in srgb, var(--vd-acc2) 4%, transparent) 55%, transparent) !important; border-right: 1px solid var(--vd-line) !important; }
.message-userArrow { display: none !important; }
.message-cell--main, .message-content, .message-inner { background: transparent !important; }
.message-attribution, .message-attribution a { color: #9da1ac !important; border-color: var(--vd-line) !important; }
.message-body, .bbWrapper { color: #e7e9ee; }
.bbWrapper a, .bbWrapper a:visited { color: ${Colors.auto(s, 'links') ? 'color-mix(in srgb, var(--vd-acc) 45%, #8cc4ff)' : 'var(--vd-link)'} !important; }
.bbCodeBlock {
  border-radius: 12px !important; border: 1px solid var(--vd-line) !important; border-left: 3px solid var(--vd-acc) !important;
  background: rgba(8,9,13,.35) !important; overflow: hidden;
}
.bbCodeBlock-title { background: color-mix(in srgb, var(--vd-acc) 10%, transparent) !important; color: #d6d8de !important; font-weight: 700; }
.bbCodeBlock-content { background: transparent !important; }
.message-footer, .message-actionBar, .actionBar-action { color: #9da1ac !important; }
.actionBar-action:hover, .message-footer a:hover { color: color-mix(in srgb, var(--vd-acc) 70%, #fff) !important; }

/* кнопки, пагинация, поля */
.button, a.button, .button.button--link, .pageNav-page, .pageNav-jump {
  border-radius: 10px !important; background: rgba(255,255,255,.06) !important; border: 1px solid var(--vd-line) !important; color: #eef0f4 !important;
  transition: background .2s, transform .2s, box-shadow .2s;
}
.button:hover, .pageNav-page:hover, .pageNav-jump:hover { background: rgba(255,255,255,.11) !important; transform: translateY(-1px); }
.button--primary, .button.button--cta, .pageNav-page--current, .pageNav-page.pageNav-page--current {
  background: ${g ? 'linear-gradient(135deg, var(--vd-btn), var(--vd-acc2))' : 'var(--vd-btn)'} !important; border-color: transparent !important; color: #fff !important;
  box-shadow: 0 10px 24px -10px var(--vd-btn) !important;
}
.input, .fr-box, .fr-toolbar, textarea.input, select.input, .inputGroup .input {
  background-color: rgba(8,9,13,.45) !important; border-color: var(--vd-line) !important; color: #eef0f4 !important;
}
.input, .fr-box { border-radius: 12px !important; }
/* склеенные поля: префикс темы + заголовок, поиск + кнопка */
.inputGroup-text, .inputGroup .inputGroup-text {
  background-color: rgba(8,9,13,.45) !important; border: 1px solid var(--vd-line) !important; color: #eef0f4 !important; border-radius: 12px !important;
}
.inputGroup.inputGroup--joined > * { border-radius: 0 !important; }
.inputGroup.inputGroup--joined > :first-child { border-top-left-radius: 12px !important; border-bottom-left-radius: 12px !important; }
.inputGroup.inputGroup--joined > :last-child { border-top-right-radius: 12px !important; border-bottom-right-radius: 12px !important; }
.inputGroup--joined > .inputGroup-text + .input, .inputGroup--joined > .input + .inputGroup-text { border-left-width: 0 !important; }
.inputGroup-text .label { margin: 0 !important; }
.structItem--quickCreate, .structItem--quickCreate .structItem-cell { background: transparent !important; }
/* без overflow:hidden: иначе выпадающие меню редактора (размер, цвет) обрезаются */
.fr-box .fr-toolbar { border-top-left-radius: 12px !important; border-top-right-radius: 12px !important; }
.block-container > :first-child, .message-inner > :first-child { border-top-left-radius: 16px; border-top-right-radius: 16px; }
.block-container > :last-child { border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }
.message-cell--user { border-top-left-radius: 16px; border-bottom-left-radius: 16px; }
/* «Поделиться» и прочие блоки после постов не прилипают */
.blockMessage, .block-outer--after, .shareButtons { margin-top: 14px !important; }
/* меню на телефоне (выезжает слева): прозрачное стекло, пункты — кнопки в стиле тем */
.offCanvasMenu-content {
  background: linear-gradient(180deg, color-mix(in srgb, var(--vd-acc) 12%, transparent), transparent 260px), var(--vd-glass) !important;
  backdrop-filter: blur(22px) saturate(1.4) !important; -webkit-backdrop-filter: blur(22px) saturate(1.4) !important;
  border-right: 1px solid var(--vd-line) !important; box-shadow: 18px 0 50px -20px rgba(0,0,0,.8) !important; color: #eef0f4 !important;
}
.offCanvasMenu-header { background: transparent !important; border-bottom: 1px solid var(--vd-line) !important; color: #f1f2f5 !important; font-weight: 700 !important; }
.offCanvasMenu-list, .offCanvasMenu-subList, .offCanvasMenu-link, .offCanvasMenu-installBanner, .offCanvasMenu-row, .offCanvasMenu-separator { background: transparent !important; border-color: transparent !important; color: #e8eaef !important; }
.offCanvasMenu-list { padding: 8px 0 !important; }
.offCanvasMenu-linkHolder {
  margin: 6px 10px !important; border-radius: 12px !important; border: 1px solid var(--vd-line) !important;
  background: rgba(255,255,255,.045) !important; transition: background .2s, border-color .2s;
}
.offCanvasMenu-linkHolder:hover { background: color-mix(in srgb, var(--vd-acc) 12%, rgba(255,255,255,.04)) !important; }
.offCanvasMenu-linkHolder.is-selected { background: color-mix(in srgb, var(--vd-acc) 20%, transparent) !important; border-color: color-mix(in srgb, var(--vd-acc) 55%, transparent) !important; box-shadow: inset 3px 0 0 var(--vd-acc) !important; }
.offCanvasMenu-subList { margin: 0 10px 6px 26px !important; padding: 0 !important; }
.offCanvasMenu-subList .offCanvasMenu-link { margin: 4px 0 !important; padding: 9px 14px !important; border-radius: 10px !important; border: 1px solid var(--vd-line) !important; background: rgba(255,255,255,.03) !important; font-size: .95em; }
.offCanvasMenu-subList .offCanvasMenu-link:hover { background: color-mix(in srgb, var(--vd-acc) 12%, transparent) !important; }
.offCanvasMenu-link i, .offCanvasMenu-link .fa, .offCanvasMenu-link svg, .offCanvasMenu-splitToggle { color: color-mix(in srgb, var(--vd-acc) 60%, #fff) !important; }
.offCanvasMenu-installBanner, .offCanvasMenu-row:last-child { border-top: 1px solid var(--vd-line) !important; }
.offCanvasMenu .button, .offCanvasMenu-installBanner .button {
  background: color-mix(in srgb, var(--vd-acc) 85%, #000) !important; border: 0 !important; border-radius: 12px !important; color: #fff !important; font-weight: 700 !important;
  box-shadow: 0 8px 22px -10px color-mix(in srgb, var(--vd-acc) 80%, transparent) !important;
}
.offCanvasMenu-backdrop { background: rgba(0,0,0,.35) !important; }
/* телефон: карточки ровно по краям, текст не прилипает к рамке, блоки боковой колонки не налезают друг на друга */
@media (max-width: 760px) {
  .block-container, .blockMessage, .shareButtons { margin-left: 0 !important; margin-right: 0 !important; }
  .p-body-sidebar .block, .p-body-sidebar .uix_sidebarInner > .block { margin: 0 0 12px !important; }
  .p-body-sidebar .block-container { overflow: hidden; }
  .block-minorHeader, .block-header { margin: 0 !important; padding-left: 16px !important; padding-right: 16px !important; }
  .p-body-sidebar .block-body { padding: 0 !important; }
  .p-body-sidebar .block-row, .p-body-sidebar .block-footer { padding-left: 16px !important; padding-right: 16px !important; }
  .p-body-sidebar .block-row { padding-top: 10px !important; padding-bottom: 12px !important; }
  .p-body-sidebar .blockLink { padding: 10px 16px !important; margin: 0 !important; border-radius: 0 !important; }
  .p-body-sidebar .block-body > .blockLink + .blockLink { border-top: 1px solid var(--vd-line) !important; }
  .shareButtons { padding: 12px 16px !important; border-radius: 16px !important; }
  .block-outer, .block-outer--after { padding-left: 0 !important; padding-right: 0 !important; }
  /* место внизу под кнопки «наверх» и VERDICT */
  .p-footer { padding-bottom: 70px !important; }
  body { padding-bottom: 72px !important; }
}
.fr-toolbar { background: rgba(255,255,255,.03) !important; }
.input:focus, .fr-box.fr-focus, .input.is-focused { border-color: color-mix(in srgb, var(--vd-acc) 70%, transparent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--vd-acc) 22%, transparent) !important; }

/* меню и подсказки */
.menu-content, .overlay-content, .memberTooltip, .tooltip-content, .menu-content .menu-row, .menu-content .menu-header, .menu-content .menu-footer { background-color: color-mix(in srgb, var(--vd-block) ${Math.round(t.menuGlass * 100)}%, transparent) !important; }
.menu-content, .overlay-content, .memberTooltip, .tooltip-content { ${light || animated ? '' : 'backdrop-filter: blur(18px) saturate(1.3) !important; -webkit-backdrop-filter: blur(18px) saturate(1.3) !important;'} border-radius: 14px !important; border: 1px solid var(--vd-line) !important; box-shadow: 0 30px 60px -20px rgba(0,0,0,.85) !important; }
.menu-header { background: color-mix(in srgb, var(--vd-acc) 12%, transparent) !important; }
.menu-linkRow:hover, .menu-row:hover { background: color-mix(in srgb, var(--vd-acc) 12%, transparent) !important; }

${
    light
        ? `/* экономный режим: без больших теней */
.block-container, .message, .blockMessage { box-shadow: none !important; }
.node-icon i, .message-avatar .avatar, .memberHeader-avatar .avatar { box-shadow: none !important; }`
        : ''
}
/* подвал */
.p-footer { border-top: 1px solid var(--vd-line) !important; border-radius: 0 !important; background-image: var(--vd-edge) !important; background-size: 100% 1px !important; background-repeat: no-repeat !important; }
`;
}

// один разобранный лист стилей на все теневые корни (панели, окно настроек, автограф), а не копия в каждом
let uiSheet = null;
function uiStyles(root) {
    try {
        if (!uiSheet) {
            uiSheet = new CSSStyleSheet();
            uiSheet.replaceSync(UI_CSS);
        }
        root.adoptedStyleSheets = [uiSheet];
        return '';
    } catch {
        return `<style>${UI_CSS}</style>`;
    }
}

// интерфейс
// общий shadow root для попапов, модалок и тостов
const Layer = {
    _root: null,
    root() {
        if (this._root && this._root.host.isConnected) return this._root;
        const host = document.createElement('div');
        host.id = 'vd-layer';
        document.documentElement.appendChild(host);
        this._root = host.attachShadow({ mode: 'open' });
        this._root.innerHTML = `${uiStyles(this._root)}<div class="v-root"><div class="toasts"></div></div>`;
        applyAccent(this._root.querySelector('.v-root'));
        return this._root;
    },
    el() {
        return this.root().querySelector('.v-root');
    },
    add(node) {
        this.el().appendChild(node);
        return node;
    }
};
function applyAccent(el) {
    const a = Settings.get().accent;
    el.style.setProperty('--acc', a);
    el.style.setProperty('--acc-a', U.hexA(a, 0.16));
    el.style.setProperty('--acc2', Colors.get(Settings.get(), 'accent2'));
    el.style.setProperty('--ui-alpha', Settings.get().theme.menuGlass);
}
Bus.on('settings', () => {
    if (Layer._root) applyAccent(Layer.el());
    document
        .querySelectorAll('.vd-bar-host')
        .forEach(h => h.shadowRoot && applyAccent(h.shadowRoot.querySelector('.v-root')));
});

function toast(text, kind = 'ok', action) {
    const map = {
        ok: ['check', '#2fbf71'],
        err: ['x', '#e5484d'],
        info: ['spark', 'var(--acc)'],
        wait: ['clock', '#f5a524']
    };
    const [ic, c] = map[kind] || map.ok;
    const t = U.h(
        `<div class="toast"><span class="vic" style="--c:${c}">${icon(ic, 13)}</span><span>${U.esc(text)}</span>${action ? `<button class="toast-act">${U.esc(action.label)}</button>` : ''}${action && action.later ? `<button class="toast-later">Позже</button>` : ''}</div>`
    );
    if (action)
        t.querySelector('.toast-act').onclick = () => {
            action.run();
            t.remove();
        };
    if (action && action.later)
        t.querySelector('.toast-later').onclick = () => {
            action.later();
            t.remove();
        };
    Layer.root().querySelector('.toasts').appendChild(t);
    // важное уведомление висит, пока не ответишь
    if (action && action.sticky) return t;
    setTimeout(
        () => {
            t.style.transition = 'opacity .3s';
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 300);
        },
        kind === 'err' || action ? 5000 : 2600
    );
    return t;
}

function verdictOf(item) {
    return VERDICTS[item.verdict] || VERDICTS.none;
}
function vicon(v, sm) {
    const V = VERDICTS[v] || VERDICTS.none;
    return `<span class="vic ${sm ? 'sm' : ''}" style="--c:${V.color}">${icon(V.icon, sm ? 11 : 13)}</span>`;
}

// предпросмотр «как увидит игрок»
function postPreview(bb, verdict) {
    const look = ForumLook.get();
    const st = verdict && Settings.get().status.map[verdict];
    const V = VERDICTS[verdict];
    const status =
        st && Settings.get().status.apply
            ? `<div class="xf-status"><span class="xf-label" style="--c:${V.color}">${U.esc(V.label)}</span>
                 <span class="xf-title">${U.esc(Page.title() || 'Название темы')}</span>
                 <span class="muted">${st.open ? 'открыта' : 'закрыта'}${st.sticky ? ' · закреплена' : ''}</span></div>`
            : '';
    const style = [
        look.font && `font-family:${look.font}`,
        look.size && `font-size:${look.size}`,
        look.line && `line-height:${look.line}`,
        look.color && `color:${look.color}`,
        look.bg && `background:${look.bg}`
    ]
        .filter(Boolean)
        .join(';');
    return `${status}<div class="xf-body" style="${U.esc(style)}">${BB.render(bb)}</div>`;
}

function itemRow(item, pack, opts = {}) {
    const plain = String(item.text || '')
        .replace(/\{cursor\}/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    const fit = opts.fit;
    const badge = fit && fit.strong ? '<span class="fit-b" title="Рекомендуем">★</span>' : '';
    return U.h(`<button class="item ${fit ? 'fit' + (fit.strong ? ' rec' : '') : ''}" style="--c:${verdictOf(item).color}" ${fit ? `title="${U.esc(fit.why)}"` : ''}>
        ${vicon(item.verdict, true)}
        <span class="t"><b>${badge}${U.esc(item.title)}</b><small>${U.esc(opts.sub || (fit ? fit.why : '') || plain || 'Свой текст')}</small></span>
        ${item.key ? `<span class="kbd">/${U.esc(item.key)}</span>` : ''}
        ${opts.canEdit ? `<span class="edit" title="Изменить текст ответа">${icon('edit', 14)}</span>` : ''}
        ${opts.canHide ? `<span class="hide" title="Скрыть ответ (вернуть: Настройки › Должность)">${icon('eyeOff', 14)}</span>` : ''}
        ${opts.noBolt ? '' : `<span class="bolt" title="Отправить сразу (ответ + статус)">${icon('bolt', 14)}</span>`}
    </button>`);
}

// выбор ответа
const FIT_GROUP = 'Подходит к этой теме';
// поиск: точный шорткод > начало шорткода > слово в названии > нечёткое совпадение; свой раздел выше
function searchScore(q, e, local) {
    const qq = U.norm(q).replace(/^\//, ''),
        key = U.norm(e.item.key || ''),
        title = U.norm(e.item.title);
    let s = U.fuzzy(qq, `${e.item.title} ${e.item.key || ''} ${verdictOf(e.item).label} ${e.pack.name}`);
    if (key && key === qq) s = 1000;
    else if (key && key.startsWith(qq)) s = Math.max(s, 600);
    else if (title.startsWith(qq) || title.includes(' ' + qq)) s = Math.max(s, 300);
    if (s > 0 && local && local(e)) s += 100;
    return s;
}
// opts: title, color, iconName, entries [{item, pack}], group ('pack' | 'verdict'), ctx(),
//       onPick(item, instant), onStatusOnly, onHide, onEscape, search, solo, subOf(entry)
function buildPicker(opts) {
    const node = U.h(`<div class="picker ${opts.solo ? 'solo' : ''}" style="--c:${opts.color || 'var(--acc)'}">
        <div class="pk-list">
          ${
              opts.title
                  ? `<div class="pk-head"><span class="vic" style="--c:${opts.color}">${icon(opts.iconName || 'spark', 13)}</span><span class="ttl">${U.esc(opts.title)}</span><span class="spacer"></span>
            ${opts.onStatusOnly ? `<button class="lnk" data-a="status" title="Сменить статус темы, ничего не отвечая">${icon('bolt', 12)}только статус</button>` : ''}</div>`
                  : ''
          }
          ${opts.search ? `<label class="pk-search">${icon('search', 15)}<input placeholder="${U.esc(opts.placeholder || 'Поиск…')}"><span class="kbd">Esc</span></label>` : ''}
          <div class="pk-items"></div>
          ${opts.solo ? '' : '<div class="pk-foot"><span>Клик — вставить</span><span>⚡ / Shift — отправить сразу</span></div>'}
        </div>
        ${
            opts.solo
                ? ''
                : `<div class="pk-prev"><div class="pk-prev-head">${icon('eye', 13)}Как увидит игрок</div><div class="pk-prev-body"></div>
          <div class="pk-actions"><button class="btn" data-a="ins">${icon('pen', 14)}Вставить</button><button class="btn pri" data-a="send">${icon('send', 14)}Отправить</button></div></div>`
        }
    </div>`);
    const list = node.querySelector('.pk-items'),
        prev = node.querySelector('.pk-prev-body'),
        input = node.querySelector('.pk-search input');
    let shown = [],
        sel = 0;
    const select = i => {
        const rows = list.querySelectorAll('.item');
        if (!rows.length) {
            if (prev) prev.innerHTML = '<div class="muted">Ничего не нашлось</div>';
            return;
        }
        sel = (i + rows.length) % rows.length;
        rows.forEach((r, k) => r.classList.toggle('sel', k === sel));
        rows[sel].scrollIntoView({ block: 'nearest' });
        const e = shown[sel];
        if (prev && e) {
            node.style.setProperty('--c', verdictOf(e.item).color);
            prev.innerHTML = postPreview(Answer.build(e.item, opts.ctx ? opts.ctx() : {}), e.item.verdict);
        }
    };
    const draw = () => {
        const q = input ? input.value.trim() : '';
        shown = q
            ? opts.entries
                  .map(e => ({ e, s: searchScore(q, e, opts.local) }))
                  .filter(x => x.s > 0)
                  .sort((a, b) => b.s - a.s)
                  .map(x => x.e)
            : opts.mark
              ? Picker.byFit(opts.entries, opts.mark)
              : opts.entries.slice();
        list.innerHTML = '';
        let lastGroup = null;
        shown.forEach((e, i) => {
            const fit = opts.mark && opts.mark(e);
            const g =
                fit && opts.group !== 'none'
                    ? FIT_GROUP
                    : opts.group === 'pack'
                      ? e.pack.name
                      : opts.group === 'verdict'
                        ? verdictOf(e.item).label
                        : lastGroup === FIT_GROUP
                          ? 'Остальные'
                          : null;
            if (g && g !== lastGroup && !q) {
                list.appendChild(U.h(`<div class="group-title">${U.esc(g)}</div>`));
                lastGroup = g;
            }
            const row = itemRow(e.item, e.pack, {
                sub: opts.subOf ? opts.subOf(e) : null,
                fit,
                canHide: !!opts.onHide,
                canEdit: !!opts.onEdit,
                noBolt: opts.solo
            });
            row.addEventListener('mouseenter', () => select(i));
            row.addEventListener('click', ev => {
                if (ev.target.closest('.edit')) {
                    opts.onEdit(e.item, e.pack);
                    return;
                }
                if (ev.target.closest('.hide')) {
                    opts.entries = opts.entries.filter(x => x !== e);
                    opts.onHide(e.item);
                    draw();
                    return;
                }
                opts.onPick(e.item, !!ev.target.closest('.bolt') || ev.shiftKey);
            });
            list.appendChild(row);
        });
        if (!shown.length)
            list.innerHTML = `<div class="group-title">${q ? 'Ничего не нашлось' : 'Пока пусто, свой ответ можно добавить в настройках'}</div>`;
        select(0);
    };
    const s = node.querySelector('[data-a="status"]');
    if (s) s.onclick = () => opts.onStatusOnly();
    const ins = node.querySelector('[data-a="ins"]'),
        send = node.querySelector('[data-a="send"]');
    if (ins) ins.onclick = () => shown[sel] && opts.onPick(shown[sel].item, false);
    if (send) send.onclick = () => shown[sel] && opts.onPick(shown[sel].item, true);
    if (input) {
        input.addEventListener('input', draw);
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                select(sel + (e.key === 'ArrowDown' ? 1 : -1));
            } else if (e.key === 'Enter' && shown[sel]) {
                e.preventDefault();
                opts.onPick(shown[sel].item, e.shiftKey);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                opts.onEscape && opts.onEscape();
            }
        });
    }
    draw();
    return { node, focus: () => input && input.focus() };
}

const Picker = {
    cur: null,
    // подходящие наверх, рекомендованные первыми
    byFit(entries, mark) {
        const rank = e => {
            const m = mark(e);
            return m ? (m.strong ? 0 : 1) : 2;
        };
        return entries
            .map((e, i) => ({ e, r: rank(e), i }))
            .sort((a, b) => a.r - b.r || a.i - b.i)
            .map(x => x.e);
    },
    close() {
        if (this.cur) {
            this.cur.node.remove();
            this.cur.anchor && this.cur.anchor.classList.remove('open');
        }
        this.cur = null;
    },
    open(anchor, opts) {
        if (this.cur && this.cur.anchor === anchor) {
            if (this._focus && this.cur.focus) this.cur.focus();
            return;
        }
        this.close();
        const p = buildPicker(
            Object.assign({ onEscape: () => this.close() }, opts, {
                onPick: (item, instant) => {
                    this.close();
                    opts.onPick(item, instant);
                },
                onStatusOnly: opts.onStatusOnly
                    ? () => {
                          this.close();
                          opts.onStatusOnly();
                      }
                    : null
            })
        );
        const node = Layer.add(p.node),
            rect = anchor.getBoundingClientRect();
        const w = node.offsetWidth,
            h = node.offsetHeight;
        // под кнопкой или над ней, где больше места; если не влезает, ужимаем, но кнопку не закрываем
        const below = innerHeight - rect.bottom - 16,
            above = rect.top - 16;
        let top;
        if (h <= below) top = rect.bottom + 8;
        else if (h <= above) top = rect.top - h - 8;
        else {
            const room = Math.max(220, Math.max(below, above));
            node.style.height = room + 'px';
            top = below >= above ? rect.bottom + 8 : Math.max(8, rect.top - room - 8);
        }
        node.style.left = Math.max(10, Math.min(rect.left, innerWidth - w - 10)) + 'px';
        node.style.top = top + 'px';
        anchor.classList.add('open');
        this.cur = { node, anchor, focus: p.focus };
        if (this._focus) p.focus();
        node.addEventListener('mouseleave', () => this._armClose());
        node.addEventListener('mouseenter', () => this._cancelClose());
    },
    _armClose() {
        clearTimeout(this._t);
        // на телефоне после касания браузер шлёт mouseleave, список закрываться не должен
        if (Settings.get().openOn === 'click' || this._touch) return;
        // не закрываем, пока пользователь печатает в поиске
        this._t = setTimeout(() => {
            const a = this.cur && this.cur.node.querySelector('.pk-search input');
            if (a && a.value) return;
            this.close();
        }, 360);
    },
    _cancelClose() {
        clearTimeout(this._t);
    }
};
// при прокрутке список закрывается, иначе он висит отдельно от кнопки
addEventListener('scroll', () => Picker.cur && Picker.close(), { passive: true });
addEventListener('pointerdown', e => (Picker._touch = e.pointerType === 'touch'), true);
// клик мимо открытого списка закрывает его
addEventListener(
    'mousedown',
    e => {
        if (!Picker.cur) return;
        const path = e.composedPath();
        if (!path.includes(Picker.cur.node) && !path.includes(Picker.cur.anchor)) Picker.close();
    },
    true
);
document.addEventListener(
    'mousedown',
    e => {
        if (!Picker.cur) return;
        const path = e.composedPath();
        if (!path.includes(Picker.cur.node) && !path.includes(Picker.cur.anchor)) Picker.close();
    },
    true
);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (Picker.cur) {
        Picker.close();
        return;
    }
    if (!Layer._root) return;
    const scrims = Layer.el().querySelectorAll('.scrim');
    const top = scrims[scrims.length - 1];
    if (top) {
        top.remove();
        if (SettingsUI.scrim === top) SettingsUI.scrim = null;
    }
});

// панель над редактором
const PRIMARY = ['approve', 'deny', 'review', 'close'];
// «Рассмотрено» живёт под кнопкой «Закрыто»
const CHIP_VERDICTS = { close: ['close', 'watched'] };
const chipVerdicts = v => (CHIP_VERDICTS[v] || [v]).filter(x => x === v || Access.verdictVisible(x));
const FORWARD = ['tech', 'cur', 'zga', 'ga', 'spec', 'kp'];

class ReplyBar {
    constructor(form) {
        this.form = form;
        this.pending = null;
        this.packOverride = Store.get('packOverride:' + (Page.crumbs() || 'x'), null);
        this.mount();
        this.hookSubmit();
        Bus.on('packs', () => this.render());
        Bus.on('settings', () => {
            // должность могла поменять видимые разделы, а от них зависит разбор темы
            this.analysis = Analyzer.run(this.packs());
            if (!Settings.get().status.apply) this.pending = null;
            this.render();
        });
    }
    packs() {
        if (this.packOverride) {
            const p = Packs.find(this.packOverride);
            if (p) return [p];
        }
        const found = Packs.detect(Page.crumbs() + ' ' + Page.title());
        const vis = found.filter(p => Access.packVisible(p));
        this.hiddenHere = found.filter(p => !vis.includes(p));
        return vis;
    }
    entries(verdicts) {
        const packs = this.packs(),
            common = Packs.find('common');
        const list = [];
        // ответ из «Общих», который уже есть в разделе (например «Не по форме»), не дублируем
        const own = new Set(packs.flatMap(p => p.items.map(i => i.title)));
        packs.concat(common && !packs.includes(common) && Access.packVisible(common) ? [common] : []).forEach(p =>
            p.items.forEach(item => {
                if (!Access.itemVisible(item)) return;
                if (p === common && !packs.includes(common) && own.has(item.title)) return;
                if (!verdicts || verdicts.includes(item.verdict)) list.push({ item, pack: p });
            })
        );
        return list;
    }
    matchOf(e) {
        if (!Settings.get().hints) return null;
        if (!this._fit) this._fit = new Map();
        if (!this._fit.has(e.item.id)) this._fit.set(e.item.id, Match.of(e.item, e.pack, this.analysis));
        return this._fit.get(e.item.id);
    }
    fits(verdicts) {
        // «Не по форме» есть и в разделе, и в «Общих»
        const seen = new Set();
        return Picker.byFit(
            this.entries(verdicts).filter(e => this.matchOf(e)),
            e => this.matchOf(e)
        ).filter(e => !seen.has(e.item.title) && seen.add(e.item.title));
    }
    mount() {
        const anchor = this.form.querySelector('.fr-box') || Editor.parts(this.form).ta;
        const host = document.createElement('div');
        host.className = 'vd-bar-host';
        (anchor ? anchor.parentNode : this.form).insertBefore(host, anchor || this.form.firstChild);
        this.host = host;
        this.shadow = host.attachShadow({ mode: 'open' });
        this.shadow.innerHTML = `${uiStyles(this.shadow)}<div class="v-root"></div>`;
        this.root = this.shadow.querySelector('.v-root');
        applyAccent(this.root);
        // после отрисовки: чтение стилей до неё заставляло браузер пересчитать всю страницу раньше времени
        requestAnimationFrame(() => this.matchEditor());
        this.analysis = Analyzer.run(this.packs());
        const isBio = this.packs().some(p => p.kind === 'bio') || /биограф/i.test(Page.crumbs() + ' ' + Page.title());
        this.bio = isBio ? BioCheck.run() : null;
        this.render();
    }
    ctx() {
        // итоговая строка по разделу темы, даже для ответов из «Общих» и своих паков
        const sec = this.packs().find(p => p.kind && p.kind !== 'any');
        return {
            author: Page.author(),
            target: this.analysis && this.analysis.target,
            kind: sec ? sec.kind : '',
            section: sec ? sec.name : ''
        };
    }
    packLabel() {
        const packs = this.packs();
        if (packs.length) return packs.map(p => p.name).join(' + ');
        return this.hiddenHere && this.hiddenHere.length ? 'Раздел скрыт для твоей должности' : 'Раздел не определён';
    }
    // встроенная панель берёт фон, рамку и скругление у панели инструментов редактора форума
    matchEditor() {
        const box = this.form.querySelector('.fr-box') || Editor.parts(this.form).ta;
        const bar = this.form.querySelector('.fr-toolbar') || box;
        if (!box) return;
        const solid = c => (c && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c) ? c : '');
        const b = getComputedStyle(box),
            t = getComputedStyle(bar);
        const set = (k, v) => v && this.root.style.setProperty(k, v);
        set('--host-bg', solid(t.backgroundColor) || solid(b.backgroundColor));
        set('--host-line', solid(b.borderTopColor));
        set('--host-r', b.borderTopLeftRadius !== '0px' ? b.borderTopLeftRadius : '');
    }
    pickerOpts(extra) {
        return Object.assign(
            {
                ctx: () => this.ctx(),
                onPick: (item, instant) => this.pick(item, instant),
                mark: e => this.matchOf(e),
                search: true,
                placeholder: 'Найти причину…',
                onEdit: (item, pack) => {
                    Picker.close();
                    SettingsUI.editItem(item, pack);
                },
                onHide: item => {
                    Access.hideItem(item.id);
                    toast(`Скрыто: ${item.title}`, 'info', { label: 'Вернуть', run: () => Access.showItem(item.id) });
                }
            },
            extra
        );
    }
    render() {
        this._fit = null;
        const packs = this.packs();
        const s = Settings.get();
        this.blocked = s.permCheck && !this.forced && !Page.canModerate();
        if (this.blocked) {
            this.host.classList.remove('vd-docked');
            this.root.innerHTML = `<div class="no-perm">${icon('lock', 13)}<span>Здесь нет прав модератора, панель скрыта</span><button data-a="force">Показать</button></div>`;
            this.root.querySelector('[data-a="force"]').onclick = () => {
                this.forced = true;
                this.render();
            };
            return;
        }
        const count = vs => this.entries(vs).length;
        const fitDot = vs => {
            const f = this.fits(vs);
            if (!f.length) return '';
            const rec = f.some(e => this.matchOf(e).strong);
            return `<span class="fit-dot ${rec ? 'rec' : ''}" title="Подходят к этой теме: ${f.length}"></span>`;
        };
        const chip = v =>
            `<button class="chip" data-v="${v}" style="--c:${VERDICTS[v].color}">${vicon(v)}${VERDICTS[v].label}<span class="cnt">${count(chipVerdicts(v))}</span>${fitDot(chipVerdicts(v))}</button>`;
        const freq = this.entries().some(e => Usage.count(e.item.id) > 0);
        const fwChip = `<button class="chip" data-g="forward" style="--c:#3aa0ff"><span class="vic" style="--c:#3aa0ff">${icon('forward', 13)}</span>Передать<span class="cnt">${count(FORWARD.filter(v => Access.verdictVisible(v)))}</span>${fitDot(FORWARD.filter(v => Access.verdictVisible(v)))}${icon('down', 12).replace('class="vi"', 'class="vi down"')}</button>`;
        const docked = Settings.get().barStyle !== 'card';
        this.host.classList.toggle('vd-docked', docked);
        this.root.innerHTML = `<div class="bar ${docked ? 'docked' : 'edge'}">
            <div class="bar-row">
              <div class="verdicts">
              ${PRIMARY.filter(v => Access.verdictVisible(v))
                  .map(chip)
                  .join('')}
              ${FORWARD.some(v => Access.verdictVisible(v)) ? fwChip : ''}
              ${count(['none']) ? `<button class="chip ghost" data-v="none" style="--c:${VERDICTS.none.color}">${vicon('none')}Свой текст</button>` : ''}
              ${freq ? `<button class="chip ghost" data-g="freq" style="--c:var(--acc)"><span class="vic" style="--c:var(--acc)">${icon('star', 13)}</span>Частые</button>` : ''}
              </div>
              <span class="tools">
                <button class="icon-btn acc" data-a="idea" title="Предложить идею разработчику">${icon('bulb')}</button>
                <button class="icon-btn" data-a="search" title="Поиск ответа (Ctrl+K)">${icon('search')}</button>
                <button class="icon-btn" data-a="settings" title="Настройки VERDICT (Alt+V)">${icon('gear')}</button>
              </span>
            </div>
            <div class="bar-row hints-row"></div>
        </div>`;
        this.renderHints();
        const hoverOpen = (el, open) => {
            el.addEventListener('mouseenter', () => {
                Picker._cancelClose();
                if (Settings.get().openOn !== 'click') this._hov = setTimeout(open, 140);
            });
            el.addEventListener('mouseleave', () => {
                clearTimeout(this._hov);
                Picker._armClose();
            });
            el.addEventListener('click', () => {
                clearTimeout(this._hov);
                // в режиме «по нажатию» повторный клик закрывает список
                if (Settings.get().openOn === 'click' && Picker.cur && Picker.cur.anchor === el) Picker.close();
                else {
                    // открыли нажатием (мышью или Enter) — фокус в список, чтобы работали стрелки
                    Picker._focus = true;
                    open();
                    Picker._focus = false;
                }
            });
        };
        this.root.querySelectorAll('.chip[data-v]').forEach(ch => {
            const v = ch.dataset.v;
            hoverOpen(ch, () =>
                Picker.open(
                    ch,
                    this.pickerOpts({
                        title: VERDICTS[v].label,
                        color: VERDICTS[v].color,
                        iconName: VERDICTS[v].icon,
                        entries: this.entries(chipVerdicts(v)),
                        group: packs.length ? 'pack' : null,
                        onStatusOnly: s.status.map[v] ? () => this.statusOnly(v) : null
                    })
                )
            );
        });
        const fw = this.root.querySelector('[data-g="forward"]');
        if (fw)
            hoverOpen(fw, () =>
                Picker.open(
                    fw,
                    this.pickerOpts({
                        title: 'Передать',
                        color: '#3aa0ff',
                        iconName: 'forward',
                        entries: this.entries(FORWARD.filter(v => Access.verdictVisible(v))),
                        group: 'verdict'
                    })
                )
            );
        const fq = this.root.querySelector('[data-g="freq"]');
        if (fq)
            hoverOpen(fq, () =>
                Picker.open(
                    fq,
                    this.pickerOpts({
                        title: 'Частые',
                        color: Settings.get().accent,
                        iconName: 'star',
                        entries: this.entries()
                            .filter(x => Usage.count(x.item.id) > 0)
                            .sort((a, b) => Usage.count(b.item.id) - Usage.count(a.item.id))
                            .slice(0, 12),
                        subOf: e => `${verdictOf(e.item).label} · использован ${Usage.count(e.item.id)} раз`
                    })
                )
            );
        const on = (a, fn) => {
            const b = this.root.querySelector(`[data-a="${a}"]`);
            if (b) b.addEventListener('click', fn);
        };
        on('search', () => Palette.open(this));
        on('settings', () => SettingsUI.open());
        on('idea', () => SettingsUI.open('contact'));
    }
    renderHints() {
        const row = this.root.querySelector('.hints-row');
        if (!row) return;
        const parts = [
            `<span class="who">${U.esc(Answer.greeting())}, ${U.esc(Page.me() || 'администратор')} · <span class="role-lnk" data-a="role" title="Сменить должность">${U.esc(Access.title() || 'выбрать должность')}</span></span>`
        ];
        if (this.pending) {
            const v = VERDICTS[this.pending];
            parts.push(
                `<span class="pending" style="--c:${v.color}">${vicon(this.pending, true)}После отправки: ${U.esc(v.label)}<button data-a="unpend" title="Не менять статус">${icon('x', 12)}</button></span>`
            );
        }
        if (this.bio) {
            const b = this.bio;
            const c = b.fails ? VERDICTS.deny.color : b.warns ? VERDICTS.review.color : VERDICTS.approve.color;
            const okCount = b.res.filter(r => r.status === 'ok').length;
            parts.push(
                `<button class="hint" data-a="bio" style="--c:${c}" title="Проверка по правилам раздела">${icon('shield', 13)}Проверка биографии: ✓${okCount}${b.warns ? ' · ⚠' + b.warns : ''}${b.fails ? ' · ✗' + b.fails : ''}</button>`
            );
        }
        const s = Settings.get();
        if (s.hints && this.analysis) {
            const fits = this.fits();
            const sugg = fits.slice(0, 3).map(e => ({ e, m: this.matchOf(e) }));
            if (sugg.length) {
                parts.push(`<span class="hint-lead">${icon('bulb', 14)}Похоже:</span>`);
                sugg.forEach((x, i) =>
                    parts.push(
                        `<button class="hint ${x.m.strong ? '' : 'maybe'}" data-hint="${i}" style="--c:${verdictOf(x.e.item).color}" title="${U.esc(x.m.why)}">${vicon(x.e.item.verdict, true)}${U.esc(x.e.item.title)}</button>`
                    )
                );
                if (fits.length > sugg.length)
                    parts.push(
                        `<button class="hint more" data-a="fits" style="--c:var(--acc)" title="Все ответы, которые подходят к этой теме">Все подходящие · ${fits.length}${icon('down', 12)}</button>`
                    );
            }
            this._sugg = sugg;
            if (this.analysis.facts.length)
                parts.push(
                    `<span class="spacer"></span><span class="facts">${this.analysis.facts.map(f => `<span class="fact">${U.esc(f.k)} <b>${U.esc(f.v)}</b></span>`).join('')}</span>`
                );
        }
        parts.push(
            `${parts.some(p => p.includes('class="spacer"')) ? '' : '<span class="spacer"></span>'}<button class="pack-btn" data-a="pack" title="Сменить набор ответов">${U.esc(this.packLabel())}${icon('down', 12)}</button>`
        );
        row.innerHTML = parts.join('');
        row.style.display = parts.length ? '' : 'none';
        row.querySelectorAll('[data-hint]').forEach(b => {
            const e = this._sugg[+b.dataset.hint].e;
            b.addEventListener('click', () => this.pick(e.item, false));
        });
        const more = row.querySelector('[data-a="fits"]');
        if (more)
            more.onclick = () =>
                Picker.open(
                    more,
                    this.pickerOpts({
                        title: 'Подходит к этой теме',
                        color: Settings.get().accent,
                        iconName: 'bulb',
                        entries: this.fits(),
                        group: 'none'
                    })
                );
        const bio = row.querySelector('[data-a="bio"]');
        if (bio) bio.onclick = () => BioPanel.open(this);
        row.querySelector('[data-a="role"]').onclick = e => {
            e.stopPropagation();
            RolePicker.open();
        };
        row.querySelector('[data-a="pack"]').onclick = e => this.choosePack(e.currentTarget);
        const un = row.querySelector('[data-a="unpend"]');
        if (un)
            un.onclick = () => {
                this.pending = null;
                this.renderHints();
            };
    }
    choosePack(anchor) {
        const all = Packs.all().filter(p => p.id !== 'common');
        const entries = all.map(p => ({
            pack: p,
            item: {
                id: p.id,
                title: p.name,
                verdict: this.packOverride === p.id ? 'approve' : 'none',
                text: `${p.items.length} ответов${Access.packVisible(p) ? '' : ' · скрыт для должности'}`
            }
        }));
        entries.unshift({
            pack: { name: '' },
            item: {
                id: '',
                title: 'Автоопределение',
                verdict: !this.packOverride ? 'approve' : 'none',
                text: 'по разделу форума'
            }
        });
        Picker.open(anchor, {
            title: 'Набор ответов',
            color: Settings.get().accent,
            iconName: 'pen',
            entries,
            solo: true,
            onPick: item => {
                this.packOverride = item.id || null;
                Store.set('packOverride:' + (Page.crumbs() || 'x'), this.packOverride);
                this.analysis = Analyzer.run(this.packs());
                this.render();
            }
        });
    }
    async pick(item, instant) {
        if (this.blocked) return;
        if (instant) {
            if (item.text.includes('{cursor}')) {
                toast('В шаблоне есть место под свой текст, вставил в поле', 'info');
                instant = false;
            } else if (
                Settings.get().status.confirmInstant &&
                !confirm(`Отправить ответ «${item.title}» и поставить статус «${verdictOf(item).label}»?`)
            )
                return;
        }
        if (instant) {
            toast('Отправляю…', 'wait');
            try {
                await Status.instant(item, this.ctx());
            } catch (e) {
                toast('Не удалось отправить: ' + e.message, 'err');
            }
            return;
        }
        Editor.insert(this.form, Answer.build(item, this.ctx()));
        Usage.bump(item.id);
        // засчитаем в статистику, когда ответ действительно уйдёт
        this.lastItem = { item, ctx: this.ctx() };
        this.pending = Settings.get().status.apply && Settings.get().status.map[item.verdict] ? item.verdict : null;
        this.pendingOpen = Packs.keepsOpen(item);
        this.renderHints();
    }
    async statusOnly(v) {
        try {
            toast('Меняю статус…', 'wait');
            await Status.apply(v);
            location.reload();
        } catch (e) {
            toast('Статус не изменён: ' + e.message, 'err');
        }
    }
    // статус меняем только после успешной отправки ответа
    hookSubmit() {
        const after = () => {
            const v = this.pending;
            const st = Settings.get().status;
            if (!v || !st.apply || !st.map[v]) return;
            this.pending = null;
            this.renderHints();
            Status.apply(v, this.pendingOpen)
                .then(() => {
                    toast(`Статус: ${VERDICTS[v].label}`);
                    setTimeout(() => location.reload(), 700);
                })
                .catch(e => toast('Ответ отправлен, но статус не изменён: ' + e.message, 'err'));
        };
        const ok = data => data && data.status !== 'error' && !data.errors;
        // sent: true/false по ответу форума, null пока не пришёл
        const counted = () => {
            if (!this.lastItem) return;
            MyStats.add(this.lastItem.item, this.lastItem.ctx);
            this.lastItem = null;
        };
        const result = data => {
            this.sent = ok(data);
            if (this.sent) {
                counted();
                after();
            }
        };
        // XF 2.2 шлёт jQuery-событие, 2.3 обычное
        const $ = W.jQuery;
        if ($) $(this.form).on('ajax-submit:response', (e, data) => result(data));
        this.form.addEventListener('ajax-submit:response', e => result(e.detail && (e.detail.data || e.detail)));
        // запасной признак успеха: форум очищает поле ввода после отправки;
        // не очистилось (ошибка, короткий ответ) = статус не трогаем
        this.form.addEventListener('submit', () => {
            if (!this.pending && !this.lastItem) return;
            this.sent = null;
            let tries = 0;
            const check = () => {
                if ((!this.pending && !this.lastItem) || this.sent === false) return;
                if (Editor.isEmpty(this.form)) {
                    counted();
                    return after();
                }
                if (++tries < 16) setTimeout(check, 500);
            };
            setTimeout(check, 700);
        });
    }
}

// поиск Ctrl+K
const Palette = {
    open(bar) {
        bar = bar || Bars[0];
        if (!bar || bar.blocked) return;
        // уже открыт — просто вернуть фокус в поиск
        const opened = Layer._root && Layer._root.querySelector('.modal.pal input');
        if (opened) return opened.focus();
        Picker.close();
        const all = [];
        Packs.all()
            .filter(p => Access.packVisible(p))
            .forEach(p =>
                p.items.forEach(item => {
                    if (Access.itemVisible(item)) all.push({ item, pack: p });
                })
            );
        const local = bar ? new Set(bar.entries().map(e => e.item.id)) : new Set();
        all.sort(
            (a, b) => local.has(b.item.id) - local.has(a.item.id) || Usage.count(b.item.id) - Usage.count(a.item.id)
        );
        const scrim = U.h(`<div class="scrim"><div class="modal pal"></div></div>`);
        const close = () => scrim.remove();
        const p = buildPicker({
            local: e => local.has(e.item.id),
            entries: all,
            search: true,
            placeholder: 'Найти ответ: «нет док», «дм», «тайм-код»…',
            group: null,
            ctx: () => (bar ? bar.ctx() : {}),
            subOf: e => `${verdictOf(e.item).label} · ${e.pack.name}`,
            onPick: (item, instant) => {
                close();
                if (bar) bar.pick(item, instant);
                else toast('Откройте тему с полем ответа', 'info');
            },
            onEscape: close
        });
        p.node.style.cssText = 'position:relative;width:100%;height:min(520px,74vh);box-shadow:none;animation:none';
        scrim.querySelector('.modal').appendChild(p.node);
        scrim.addEventListener('mousedown', e => {
            if (e.target === scrim) close();
        });
        Layer.add(scrim);
        setTimeout(p.focus, 20);
    }
};

// шорткоды «/ключ» в редакторе
const Shortcodes = {
    attach(bar) {
        const handler = e => {
            if (!Settings.get().shortcodes || bar.blocked) return;
            const t = e.target;
            if (!t.closest || !t.closest('.fr-element')) return;
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const r = sel.getRangeAt(0);
            if (r.startContainer.nodeType !== 3) {
                this.hide();
                return;
            }
            const m = this.typed();
            if (!m) {
                this.hide();
                return;
            }
            const q = U.norm(m[1]);
            const list = bar
                .entries()
                .filter(x => x.item.key && U.norm(x.item.key).startsWith(q))
                .filter((x, i, arr) => arr.findIndex(y => y.item.title === x.item.title) === i)
                .slice(0, 8);
            if (!list.length) {
                this.hide();
                return;
            }
            this.show(bar, list, m[1].length + 1, r.getBoundingClientRect());
        };
        bar.form.addEventListener('input', handler);
        bar.form.addEventListener('mousedown', () => this.hide());
        bar.form.addEventListener('focusout', () => this.hide());
        bar.form.addEventListener('submit', () => this.hide());
        bar.form.addEventListener(
            'keydown',
            e => {
                if (!this.node) return;
                if (/^(ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(e.key)) {
                    this.hide();
                    return;
                }
                const rows = this.node.querySelectorAll('.item');
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    rows[this.sel].classList.remove('sel');
                    this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
                    rows[this.sel].classList.add('sel');
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    if (!this.typed()) {
                        this.hide();
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this.accept(this.sel);
                } else if (e.key === 'Escape') this.hide();
            },
            true
        );
    },
    // «/код» прямо перед кареткой, если он там есть
    typed() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const r = sel.getRangeAt(0);
        if (!r.collapsed || r.startContainer.nodeType !== 3) return null;
        return r.startContainer.data.slice(0, r.startOffset).match(/(?:^|\s)\/([0-9a-zа-яё]{1,15})$/i);
    },
    show(bar, list, eraseLen, rect) {
        this.hide();
        this.bar = bar;
        this.list = list;
        this.erase = eraseLen;
        this.sel = 0;
        this.node = Layer.add(
            U.h(
                `<div class="picker solo" style="width:330px;height:auto"><div class="pk-list"><div class="pk-items"></div><div class="pk-foot"><span><span class="kbd">Tab</span> вставить</span><span><span class="kbd">Esc</span> закрыть</span></div></div></div>`
            )
        );
        const l = this.node.querySelector('.pk-items');
        list.forEach(({ item, pack }, i) => {
            const row = itemRow(item, pack, { noBolt: true, sub: `${verdictOf(item).label} · ${pack.name}` });
            if (i === 0) row.classList.add('sel');
            row.addEventListener('mousedown', e => e.preventDefault());
            row.addEventListener('click', () => this.accept(i));
            l.appendChild(row);
        });
        const top =
            rect.bottom + 6 + this.node.offsetHeight > innerHeight
                ? rect.top - this.node.offsetHeight - 6
                : rect.bottom + 6;
        this.node.style.left = Math.max(12, Math.min(rect.left, innerWidth - 342)) + 'px';
        this.node.style.top = top + 'px';
    },
    accept(i) {
        const e = this.list[i];
        const m = this.typed();
        if (!e || !m || m[1].length + 1 !== this.erase) {
            this.hide();
            return;
        }
        Editor.eraseBeforeCaret(this.erase);
        this.hide();
        Editor.insert(this.bar.form, Answer.build(e.item, this.bar.ctx()));
        Usage.bump(e.item.id);
        const st = Settings.get().status;
        this.bar.pending = st.apply && st.map[e.item.verdict] ? e.item.verdict : null;
        this.bar.pendingOpen = Packs.keepsOpen(e.item);
        this.bar.renderHints();
    },
    hide() {
        if (this.node) {
            this.node.remove();
            this.node = null;
        }
    }
};

const Bars = [];

// выбор должности
const RoleForm = {
    render(box, onPick) {
        const s = Settings.get();
        const level = LEVELS[s.role] ? s.role : '';
        const L = LEVELS[level];
        const packName = id => (DEFAULT_PACKS.find(d => d.id === id) || {}).name;
        box.innerHTML = '';

        const levels = U.h('<div class="roles"></div>');
        Object.entries(LEVELS).forEach(([id, lv]) => {
            const card = U.h(`<button class="role-card ${id === level ? 'on' : ''}">
                <span class="vic" style="--c:var(--acc);width:36px;height:36px;border-radius:11px">${icon(lv.icon, 17)}</span>
                <span class="t"><b>${lv.name}</b><small>${lv.dirs ? 'Направления: ' + lv.dirs.map(d => DIRECTIONS[d].name).join(', ') : lv.packs === '*' ? 'Все разделы' : lv.packs.map(packName).join(', ')}</small></span>
            </button>`);
            card.onclick = () => {
                const dir = lv.dirs ? (lv.dirs.includes(s.roleDir) ? s.roleDir : lv.dirs[0]) : '';
                Access.setRole(id, dir, dir === 'orgs' ? s.roleOrg : '');
                onPick();
            };
            levels.appendChild(card);
        });
        box.appendChild(levels);

        const pills = (title, entries, current, pick) => {
            const sec = U.h(
                `<div class="sec" style="margin:16px 0 0"><h4>${title}</h4><div class="chips"></div></div>`
            );
            entries.forEach(([id, name]) => {
                const b = U.h(`<button class="pill ${id === current ? 'on' : ''}">${U.esc(name)}</button>`);
                b.onclick = () => {
                    pick(id);
                    onPick();
                };
                sec.lastElementChild.appendChild(b);
            });
            box.appendChild(sec);
        };
        if (L && L.dirs) {
            pills(
                'Направление',
                L.dirs.map(d => [d, DIRECTIONS[d].name + (DIRECTIONS[d].hint ? ` (${DIRECTIONS[d].hint})` : '')]),
                s.roleDir,
                d => Access.setRole(level, d, d === 'orgs' ? s.roleOrg : '')
            );
            if (s.roleDir === 'orgs') {
                pills('Фракция', [['', 'Все организации']].concat(Object.entries(ORGS)), s.roleOrg || '', o =>
                    Access.setRole(level, 'orgs', o)
                );
            }
        }
        if (level) {
            const packs = Access.defaultPacks();
            const hidden = LEVELS[level].hide.map(v => VERDICTS[v].label);
            box.appendChild(
                U.h(`<div class="muted" style="margin-top:14px;font-size:12px">
                <b style="color:var(--tx)">${U.esc(Access.title())}</b> — ${packs === '*' ? 'все разделы' : packs.map(packName).join(', ')}${hidden.length ? `; без «${hidden.join('», «')}»` : ''}.
            </div>`)
            );
        }
    }
};

const RolePicker = {
    open(first) {
        Picker.close();
        const scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal sm" style="width:min(820px,100%)">
            <div class="m-head">
              <span class="brand-mark" style="width:34px;height:34px;border-radius:10px">${icon('badge', 18)}</span>
              <div><div class="m-title">${first ? 'Кто ты на сервере?' : 'Должность'}</div>
                <div class="m-sub">Покажу только нужные разделы и вердикты. Поменять можно в любой момент.</div></div>
              <span style="flex:1"></span>
              <button class="btn pri" data-a="done">${icon('check', 14)}Готово</button>
            </div>
            <div class="pane"></div></div></div>`)
        );
        const pane = scrim.querySelector('.pane');
        const draw = () => RoleForm.render(pane, draw);
        draw();
        scrim.querySelector('[data-a="done"]').onclick = () => {
            if (!Settings.get().role) Access.setRole('ga');
            scrim.remove();
            toast(`Должность: ${Access.title()}`);
        };
    }
};

// окно проверки биографии
const BioPanel = {
    open(bar) {
        const report = (bar.bio = BioCheck.run());
        if (!report) return toast('Не нашёл первое сообщение темы', 'err');
        const mark = {
            ok: ['check', '#2fbf71'],
            warn: ['bulb', '#f5a524'],
            fail: ['x', '#e5484d'],
            manual: ['eye', '#8b8f9a']
        };
        const rows = report.res
            .map(r => {
                const [ic, c] = mark[r.status];
                return `<div class="row"><span class="vic sm" style="--c:${c}">${icon(ic, 11)}</span>
                    <div class="lbl"><b>${r.rule === 'форма' ? 'Форма' : r.rule}</b> · ${U.esc(r.name)}${r.note ? `<small>${U.esc(r.note)}</small>` : ''}</div></div>`;
            })
            .join('');
        const scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal sm">
            <div class="m-head"><span class="vic" style="--c:var(--acc);width:34px;height:34px;border-radius:10px">${icon('shield', 16)}</span>
              <div><div class="m-title">Проверка биографии</div>
                <div class="m-sub">${report.words} слов · нарушений ${report.fails}, сомнительно ${report.warns}</div></div>
              <span style="flex:1"></span><button class="icon-btn" data-a="x">${icon('x')}</button></div>
            <div class="pane">
              <div class="card">${rows}</div>
              <div class="sec" style="margin:14px 0 0"><div class="spell muted" style="font-size:12px"></div></div>
              <div class="btns" style="margin-top:14px">
                <button class="btn" data-a="spell">${icon('search', 14)}Орфография (Яндекс)</button>
                <span style="flex:1"></span>
                <button class="btn" data-a="approve">${icon('check', 14)}Одобрить</button>
                <button class="btn" data-a="fix">${icon('clock', 14)}На доработку</button>
                <button class="btn pri" data-a="deny">${icon('x', 14)}Отказать с причинами</button>
              </div>
            </div></div></div>`)
        );
        const close = () => scrim.remove();
        scrim.querySelector('[data-a="x"]').onclick = close;
        scrim.addEventListener('mousedown', e => e.target === scrim && close());
        const answers = BioCheck.answers(report);
        ['approve', 'fix', 'deny'].forEach(k => {
            scrim.querySelector(`[data-a="${k}"]`).onclick = () => {
                close();
                bar.pick(answers[k], false);
            };
        });
        const spellBox = scrim.querySelector('.spell');
        scrim.querySelector('[data-a="spell"]').onclick = async e => {
            const btn = e.currentTarget;
            btn.disabled = true;
            spellBox.textContent = 'Проверяю…';
            try {
                const errs = await BioCheck.spell(report.text);
                const uniq = [...new Map(errs.map(x => [x.word.toLowerCase(), x])).values()];
                spellBox.innerHTML = uniq.length
                    ? `<b style="color:var(--tx)">Похоже на ошибки: ${uniq.length}</b><br>` +
                      uniq
                          .slice(0, 20)
                          .map(x => `${U.esc(x.word)}${x.s && x.s[0] ? ' → ' + U.esc(x.s[0]) : ''}`)
                          .join(', ')
                    : 'Спеллер ошибок не нашёл.';
            } catch (err) {
                spellBox.textContent = 'Не получилось: ' + err.message;
            }
            btn.disabled = false;
        };
    }
};

// автограф в профиле
// строка автографа над полем на стене профиля
// переменные: {nick} владелец профиля, {admin}, {role}, {date}, {acc}, {acc2}

const AUTOGRAPH_STYLES = {
    classic: {
        name: 'Классика',
        text: '[CENTER][FONT=Georgia][SIZE=5][I]{nick}[/I][/SIZE]\n[SIZE=4]Спасибо за игру на нашем сервере! Удачи и хорошего RP.[/SIZE]\n\n[SIZE=3][I]— {admin}, {role} · {date}[/I][/SIZE][/FONT][/CENTER]'
    },
    neon: {
        name: 'Неон',
        text: '[CENTER][SIZE=5][B][COLOR={acc}]✦ {nick} ✦[/COLOR][/B][/SIZE]\n[COLOR=#d0d3da]Рад знакомству — пусть всё получается![/COLOR]\n[SIZE=3][COLOR={acc2}]— {admin} · {date}[/COLOR][/SIZE][/CENTER]'
    },
    signature: {
        name: 'Подпись',
        text: '[RIGHT][FONT=Georgia][I]С уважением,[/I]\n[SIZE=5][B]{admin}[/B][/SIZE]\n[SIZE=3][COLOR=#8b8f9a]{role} · {date}[/COLOR][/SIZE][/FONT][/RIGHT]'
    },
    minimal: { name: 'Минимал', text: '[I]Автограф: {admin} · {date}[/I]' },
    custom: { name: 'Свой', text: '' }
};

const Autograph = {
    // только сам ник: в заголовке профиля рядом лежит меню «Предыдущие имена» с текстом «Загрузка…»
    owner() {
        const u = document.querySelector('.memberHeader-name .username');
        if (u) return u.textContent.trim();
        const h = document.querySelector('.memberHeader-name');
        if (!h) return 'игрок';
        const own = [...h.childNodes]
            .filter(n => n.nodeType === 3)
            .map(n => n.nodeValue)
            .join('')
            .trim();
        return own || h.textContent.replace(/Предыдущие имена[\s\S]*$/, '').trim() || 'игрок';
    },
    template(style) {
        const a = Settings.get().autograph;
        if (style === 'custom') return a.custom || AUTOGRAPH_STYLES.classic.text;
        return (AUTOGRAPH_STYLES[style] || AUTOGRAPH_STYLES.classic).text;
    },
    build(style, nick) {
        const s = Settings.get();
        const vars = {
            nick: nick || this.owner(),
            admin: Page.me() || 'Администрация',
            role: Access.title() || 'Администрация',
            date: new Date().toLocaleDateString('ru-RU'),
            acc: s.accent,
            acc2: Colors.get(s, 'accent2')
        };
        return this.template(style).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    },
    isProfile() {
        return /^\/members\/[^/]+\.\d+\/?$/.test(location.pathname);
    },
    form() {
        return document.querySelector('form[action*="/members/"][action$="/post"]');
    }
};

class AutographBar {
    constructor(form) {
        this.form = form;
        const anchor = form.querySelector('.fr-box') || form.querySelector('textarea');
        const host = document.createElement('div');
        host.className = 'vd-bar-host';
        (anchor ? anchor.parentNode : form).insertBefore(host, anchor || form.firstChild);
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `${uiStyles(shadow)}<div class="v-root"></div>`;
        this.root = shadow.querySelector('.v-root');
        applyAccent(this.root);
        Bus.on('settings', () => this.render());
        this.render();
    }
    render() {
        const style = Settings.get().autograph.style;
        this.root.innerHTML = `<div class="bar edge">
            <div class="bar-row">
              <span class="who">Автограф для ${U.esc(Autograph.owner())}</span>
              <span class="chips">${Object.entries(AUTOGRAPH_STYLES)
                  .map(
                      ([id, st]) =>
                          `<button class="pill ${id === style ? 'on' : ''}" data-s="${id}">${st.name}</button>`
                  )
                  .join('')}</span>
              <span class="spacer"></span>
              <button class="icon-btn" data-a="settings" title="Настроить свой текст">${icon('gear')}</button>
            </div>
            <div class="xf-body ag-prev">${BB.render(Autograph.build(style))}</div>
            <div class="bar-row">
              <span class="spacer"></span>
              <button class="btn" data-a="insert">${icon('pen', 14)}Вставить</button>
              <button class="btn pri" data-a="send">${icon('send', 14)}Оставить сразу</button>
            </div>
        </div>`;
        this.root.querySelectorAll('[data-s]').forEach(b => {
            b.onclick = () => Settings.patch(x => (x.autograph.style = b.dataset.s));
        });
        this.root.querySelector('[data-a="settings"]').onclick = () => SettingsUI.open('autograph');
        this.root.querySelector('[data-a="insert"]').onclick = () => Editor.insert(this.form, Autograph.build(style));
        this.root.querySelector('[data-a="send"]').onclick = async e => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
                await Status.xf(this.form.action, { message: Autograph.build(style) });
                toast('Автограф оставлен');
                setTimeout(() => location.reload(), 700);
            } catch (err) {
                toast('Не получилось: ' + err.message, 'err');
                btn.disabled = false;
            }
        };
    }
}

function mountAutograph() {
    if (!Autograph.isProfile()) return;
    const form = Autograph.form();
    if (!form || form.__vd) return;
    if (!form.querySelector('.fr-box, textarea')) return;
    form.__vd = true;
    new AutographBar(form);
}

// свой логотип в шапке форума: фото обрезается рамкой, которую можно двигать и тянуть за угол
const Logo = {
    img() {
        return document.querySelector(
            '.p-header-logo img:not(#vd-logo-side), .uix_logo img:not(#vd-logo-side), .p-header-logo--image img:not(#vd-logo-side)'
        );
    },
    apply() {
        const img = this.img();
        if (!img) return;
        const data = Store.get('logo', null);
        if (!img.dataset.vdSrc) {
            img.dataset.vdSrc = img.getAttribute('src') || '';
            img.dataset.vdSrcset = img.getAttribute('srcset') || '';
            img.dataset.vdH = String(img.getBoundingClientRect().height || img.height || 0);
        }
        const h = Number(img.dataset.vdH) || 80;
        // вернуть стандартную картинку, если раньше подменяли
        const restore = () => {
            if (img.getAttribute('src') !== img.dataset.vdSrc) {
                img.src = img.dataset.vdSrc;
                if (img.dataset.vdSrcset) img.setAttribute('srcset', img.dataset.vdSrcset);
                img.removeAttribute('style');
            }
        };
        let side = document.getElementById('vd-logo-side');
        const style = el => {
            el.style.height = h + 'px';
            el.style.width = 'auto';
            el.style.maxWidth = 'none';
            el.style.objectFit = 'cover';
            el.style.borderRadius = data.round ? '50%' : '14px';
        };
        // «off»: фото сохранено, но стоит стандартный логотип
        if (!data || !data.src || data.mode === 'off') {
            if (side) side.remove();
            restore();
            return;
        }
        if (data.mode === 'replace') {
            if (side) side.remove();
            if (img.getAttribute('src') === data.src) return;
            img.removeAttribute('srcset');
            img.src = data.src;
            style(img);
            return;
        }
        // по умолчанию фото стоит рядом, название проекта остаётся
        restore();
        if (!side) {
            side = document.createElement('img');
            side.id = 'vd-logo-side';
            side.alt = '';
            img.before(side);
            const box = img.parentNode;
            box.style.display = 'inline-flex';
            box.style.alignItems = 'center';
            box.style.gap = '16px';
        }
        if (side.getAttribute('src') !== data.src) side.src = data.src;
        style(side);
    },
    // пропорции стандартного логотипа, чтобы рамка «как у логотипа» совпадала
    ratio() {
        const img = this.img();
        if (!img) return 3;
        const w = img.naturalWidth || img.width,
            h = img.naturalHeight || img.height;
        return w && h ? w / h : 3;
    },
    pick() {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = () => {
            const f = inp.files[0];
            if (!f) return;
            const img = new Image();
            img.onload = () => this.crop(img);
            img.onerror = () => toast('Не удалось открыть картинку', 'err');
            img.src = URL.createObjectURL(f);
        };
        inp.click();
    },
    crop(img) {
        const shapes = { square: ['Квадрат', 1], logo: ['Как у логотипа', this.ratio()], round: ['Круг', 1] };
        let shape = 'square';
        const scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal sm">
            <div class="m-head"><span class="vic" style="--c:var(--acc);width:34px;height:34px;border-radius:10px">${icon('image', 16)}</span>
              <div><div class="m-title">Логотип из фото</div><div class="m-sub">Двигай рамку, тяни за угол или крути колесо мыши</div></div>
              <span style="flex:1"></span><button class="icon-btn" data-a="x">${icon('x')}</button></div>
            <div class="pane">
              <div class="chips" style="margin-bottom:12px">${Object.entries(shapes)
                  .map(([k, [n]]) => `<button class="pill ${k === shape ? 'on' : ''}" data-s="${k}">${n}</button>`)
                  .join('')}</div>
              <div class="crop"><canvas></canvas><div class="crop-box"><i></i></div></div>
              <div class="btns" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-a="x">Отмена</button><button class="btn pri" data-a="ok">${icon('check', 14)}Поставить логотип</button></div>
            </div></div></div>`)
        );
        const wrap = scrim.querySelector('.crop'),
            cv = wrap.querySelector('canvas'),
            box = wrap.querySelector('.crop-box');
        // картинка вписывается в область просмотра
        const maxW = Math.min(560, innerWidth - 80),
            maxH = Math.min(380, innerHeight - 260);
        const k = Math.min(maxW / img.width, maxH / img.height, 1);
        cv.width = Math.round(img.width * k);
        cv.height = Math.round(img.height * k);
        const g = cv.getContext('2d');
        wrap.style.width = cv.width + 'px';
        wrap.style.height = cv.height + 'px';
        const r = { x: 0, y: 0, w: 0, h: 0 };
        const fit = () => {
            const ar = shapes[shape][1];
            r.w = Math.min(r.w || cv.width * 0.6, cv.width, cv.height * ar);
            r.h = r.w / ar;
            r.x = Math.max(0, Math.min(r.x, cv.width - r.w));
            r.y = Math.max(0, Math.min(r.y, cv.height - r.h));
            Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
            box.classList.toggle('round', shape === 'round');
            // всё вне рамки темнее, выбранная часть яркая
            g.drawImage(img, 0, 0, cv.width, cv.height);
            g.fillStyle = 'rgba(0,0,0,.6)';
            g.fillRect(0, 0, cv.width, cv.height);
            g.save();
            g.beginPath();
            if (shape === 'round') g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
            else g.rect(r.x, r.y, r.w, r.h);
            g.clip();
            g.drawImage(img, 0, 0, cv.width, cv.height);
            g.restore();
        };
        r.x = cv.width * 0.2;
        r.y = cv.height * 0.15;
        fit();
        let drag = null;
        const down = e => {
            const p = e.touches ? e.touches[0] : e;
            drag = { mode: e.target.tagName === 'I' ? 'size' : 'move', sx: p.clientX, sy: p.clientY, r: { ...r } };
            e.preventDefault();
        };
        const move = e => {
            if (!drag) return;
            const p = e.touches ? e.touches[0] : e;
            const dx = p.clientX - drag.sx,
                dy = p.clientY - drag.sy;
            if (drag.mode === 'move') {
                r.x = drag.r.x + dx;
                r.y = drag.r.y + dy;
            } else r.w = Math.max(30, drag.r.w + Math.max(dx, dy * shapes[shape][1]));
            fit();
        };
        const up = () => (drag = null);
        box.addEventListener('mousedown', down);
        box.addEventListener('touchstart', down, { passive: false });
        addEventListener('mousemove', move);
        addEventListener('touchmove', move, { passive: false });
        addEventListener('mouseup', up);
        addEventListener('touchend', up);
        wrap.addEventListener(
            'wheel',
            e => {
                e.preventDefault();
                const cx = r.x + r.w / 2,
                    cy = r.y + r.h / 2;
                r.w = Math.max(30, r.w * (e.deltaY < 0 ? 1.08 : 0.92));
                r.x = cx - r.w / 2;
                r.y = cy - r.w / shapes[shape][1] / 2;
                fit();
            },
            { passive: false }
        );
        const close = () => {
            removeEventListener('mousemove', move);
            removeEventListener('touchmove', move);
            removeEventListener('mouseup', up);
            removeEventListener('touchend', up);
            URL.revokeObjectURL(img.src);
            scrim.remove();
        };
        scrim.querySelectorAll('[data-a="x"]').forEach(b => (b.onclick = close));
        scrim.querySelectorAll('[data-s]').forEach(
            b =>
                (b.onclick = () => {
                    shape = b.dataset.s;
                    scrim.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b));
                    fit();
                })
        );
        scrim.querySelector('[data-a="ok"]').onclick = () => {
            // в шапке логотип около 90px, берём с запасом под чёткие экраны
            const H = 240,
                W = Math.round(H * shapes[shape][1]);
            const out = document.createElement('canvas');
            out.width = W;
            out.height = H;
            out.getContext('2d').drawImage(img, r.x / k, r.y / k, r.w / k, r.h / k, 0, 0, W, H);
            Store.set('logo', {
                src: out.toDataURL('image/jpeg', 0.9),
                round: shape === 'round',
                mode: (Store.get('logo', null) || {}).mode === 'replace' ? 'replace' : 'beside'
            });
            this.apply();
            close();
            if (SettingsUI.scrim) SettingsUI.draw();
            toast('Логотип поставлен');
        };
    },
    reset() {
        Store.set('logo', null);
        this.apply();
    }
};

// быстрая навигация в шапке форума: свои ссылки на разделы, похожие собираются в выпадающие группы
const QNAV_GROUPS = ['Жалобы', 'Обжалования', 'Заявки', 'Разделы'];
// заготовки: ссылки у каждого сервера свои, их подставляют в настройках или кнопкой «Добавить этот раздел»
const QNAV_PRESETS = [
    ['Жалобы на игроков', 'Жалобы'],
    ['Жалобы на администрацию', 'Жалобы'],
    ['Жалобы на лидеров', 'Жалобы'],
    ['Жалобы на агентов поддержки', 'Жалобы'],
    ['Жалобы на сотрудников', 'Жалобы'],
    ['Обжалования наказаний', 'Обжалования'],
    ['Заявки на лидеров', 'Заявки'],
    ['Заявки на агентов поддержки', 'Заявки'],
    ['RP-биографии', 'Разделы'],
    ['Рапорты', 'Разделы'],
    ['Админ-раздел', ''],
    ['Технический раздел', 'Разделы']
];

const QNav = {
    // стандартные группы и свои, добавленные в настройках
    groups() {
        const own = Settings.get().qnav.groups || [];
        return [...QNAV_GROUPS, ...own.filter(g => !QNAV_GROUPS.includes(g))];
    },
    items() {
        return (Settings.get().qnav.items || []).filter(i => i && i.name && i.url && this.safe(i.url));
    },
    // только ссылки этого форума
    safe(url) {
        try {
            return new URL(url, location.origin).origin === location.origin;
        } catch {
            return false;
        }
    },
    // путь раздела со слешем на конце: /forums/zhaloby.12 и /forums/zhaloby.12/ — одно и то же
    path(url) {
        try {
            const p = new URL(url, location.origin).pathname;
            return p.endsWith('/') ? p : p + '/';
        } catch {
            return '';
        }
    },
    active(url) {
        const p = this.path(url);
        const here = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
        return p.length > 1 && here.startsWith(p);
    },
    // раздел, в котором сейчас находишься (для «Добавить этот раздел»)
    here() {
        const m = location.pathname.match(/^(.*\/forums\/[^/]+\/)/);
        if (!m) return null;
        const title = (document.querySelector('.p-title-value') || {}).textContent || document.title;
        return { url: location.origin + m[1], name: title.trim().replace(/\s+/g, ' ').slice(0, 40) };
    },
    add(name, url, group = '') {
        Settings.patch(x => {
            const list = x.qnav.items;
            const same = list.find(i => i.url === url);
            if (same) Object.assign(same, { name, group });
            else list.push({ id: 'q' + U.uid(), name, url, group });
        });
    },
    mount() {
        const cfg = Settings.get().qnav;
        let bar = document.getElementById('vd-qnav');
        if (!cfg.on) {
            if (bar) bar.remove();
            this.pin(false);
            return;
        }
        const spot = this.spot(cfg.place);
        if (!spot) return;
        // место поменяли в настройках — переносим
        if (bar && bar.dataset.place !== spot.place) {
            bar.remove();
            bar = null;
        }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'vd-qnav';
            bar.dataset.place = spot.place;
            bar.className = 'vd-qnav--' + spot.place;
            if (spot.before) spot.host.insertBefore(bar, spot.before);
            else spot.host.appendChild(bar);
        }
        this.render(bar);
    },
    // где стоит панель: главное меню, верхняя панель модератора или строка под меню
    PLACES: { top: 'Закреплённая панель сверху', nav: 'В главном меню', sub: 'В строке под меню' },
    // закреплённая сверху: у модераторов — их верхняя панель, у остальных — своя такая же
    pin(on) {
        const staff = document.querySelector('.p-staffBar');
        document.documentElement.classList.toggle('vd-toppin', on);
        if (staff) staff.classList.toggle('vd-pinned', on);
        let tb = document.getElementById('vd-topbar');
        const sizeTo = el =>
            requestAnimationFrame(() =>
                document.documentElement.style.setProperty('--vd-top-h', (el ? el.offsetHeight : 0) + 'px')
            );
        if (!on || staff) {
            if (tb) tb.remove();
            sizeTo(on ? staff : null);
            return staff && on ? staff.querySelector('.p-staffBar-inner') || staff : null;
        }
        if (!tb) {
            tb = document.createElement('div');
            tb.id = 'vd-topbar';
            tb.innerHTML = '<div class="vd-topbar-inner"></div>';
            const wrap = document.querySelector('.p-pageWrapper') || document.body;
            wrap.insertBefore(tb, wrap.firstChild);
        }
        sizeTo(tb);
        return tb.firstChild;
    },
    spot(place) {
        if (place === 'staff') place = 'top';
        if (place === 'top') {
            const host = this.pin(true);
            if (host) return { place, host };
        } else this.pin(false);
        if (place === 'sub') {
            const host = document.querySelector('.p-sectionLinks-inner');
            if (host) return { place, host };
        }
        const nav = document.querySelector('.p-nav-inner') || document.querySelector('.p-nav');
        if (!nav) return null;
        return { place: 'nav', host: nav, before: nav.querySelector(':scope > .p-nav-opposite') };
    },
    render(bar) {
        const items = this.items();
        const here = this.here();
        const groups = new Map();
        const parts = [];
        items.forEach(i => {
            if (i.group) {
                if (!groups.has(i.group)) {
                    groups.set(i.group, []);
                    parts.push({ group: i.group });
                }
                groups.get(i.group).push(i);
            } else parts.push(i);
        });
        const keep = bar.querySelector('.vd-qn-track');
        const was = keep ? keep.scrollLeft : 0;
        bar.innerHTML =
            '<button type="button" class="vd-qn-arr l" title="Влево">‹</button><div class="vd-qn-track"></div><button type="button" class="vd-qn-arr r" title="Вправо">›</button>';
        const track = bar.querySelector('.vd-qn-track');
        parts.forEach(p => {
            // группа из одной ссылки — просто ссылка
            if (p.group && groups.get(p.group).length === 1) p = groups.get(p.group)[0];
            if (p.group && !p.id) {
                const list = groups.get(p.group);
                const on = list.some(i => this.active(i.url));
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'vd-qn' + (on ? ' on' : '');
                b.innerHTML = `${U.esc(p.group)}${this.badge(list)}<span class="vd-qn-car">▾</span>`;
                b.onclick = e => {
                    e.stopPropagation();
                    // повторный клик по открытой группе закрывает список
                    if (this._open === b) return this.close();
                    this.menu(b, list);
                };
                track.appendChild(b);
            } else {
                const a = document.createElement('a');
                a.className = 'vd-qn' + (this.active(p.url) ? ' on' : '');
                a.href = new URL(p.url, location.origin).href;
                // раздел сервера («Сервер №49 | KHABAROVSK») — компактный квадратик с номером, полное имя в подсказке
                const srv = p.name.match(/^\s*сервер\s*№?\s*(\d{1,3})\b/i);
                if (srv) {
                    a.classList.add('vd-qn-sq');
                    a.title = p.name;
                    a.textContent = srv[1];
                } else a.textContent = p.name;
                a.insertAdjacentHTML('beforeend', this.badge([p]));
                track.appendChild(a);
            }
        });
        // в разделе форума, которого ещё нет в навигации, — предложить добавить
        const herePath = here && this.path(here.url);
        if (here && !items.some(i => this.path(i.url) === herePath)) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'vd-qn vd-qn-add';
            add.title = 'Добавить этот раздел в быструю навигацию';
            add.textContent = '+ этот раздел';
            add.onclick = () => SettingsUI.open('qnav');
            track.appendChild(add);
        }
        if (!items.length && !here) {
            const hint = document.createElement('button');
            hint.type = 'button';
            hint.className = 'vd-qn vd-qn-add';
            hint.textContent = '+ быстрая навигация';
            hint.onclick = () => SettingsUI.open('qnav');
            track.appendChild(hint);
        }
        this.scroller(bar, track, was);
    },
    // кнопок больше, чем влезает: стрелки по краям, колесо мыши и свайп листают вбок
    scroller(bar, track, was) {
        const [l, r] = bar.querySelectorAll('.vd-qn-arr');
        const sync = () => {
            const max = track.scrollWidth - track.clientWidth;
            l.hidden = track.scrollLeft <= 2;
            r.hidden = track.scrollLeft >= max - 2;
            bar.classList.toggle('fl', !l.hidden);
            bar.classList.toggle('fr', !r.hidden);
        };
        const step = d => track.scrollBy({ left: d * Math.max(120, track.clientWidth * 0.7), behavior: 'smooth' });
        l.onclick = () => step(-1);
        r.onclick = () => step(1);
        track.addEventListener(
            'scroll',
            () => {
                sync();
                this.close();
            },
            { passive: true }
        );
        track.addEventListener(
            'wheel',
            e => {
                if (track.scrollWidth <= track.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                const max = track.scrollWidth - track.clientWidth;
                // упёрлись в край — колесо снова листает страницу
                if ((e.deltaY < 0 && track.scrollLeft <= 0) || (e.deltaY > 0 && track.scrollLeft >= max - 1)) return;
                e.preventDefault();
                track.scrollLeft += e.deltaY;
            },
            { passive: false }
        );
        if (this._ro) this._ro.disconnect();
        this._ro = new ResizeObserver(sync);
        this._ro.observe(track);
        // текущий раздел сразу виден
        const on = track.querySelector('.vd-qn.on');
        if (was) track.scrollLeft = was;
        else if (on && on.offsetLeft + on.offsetWidth > track.clientWidth) track.scrollLeft = on.offsetLeft - 24;
        sync();
    },
    // сколько открытых тем ждёт в разделе: первая страница раздела, раз в 5 минут
    COUNT_TTL: 5 * 60e3,
    badge(list) {
        if (!Settings.get().qnav.counts) return '';
        const c = Store.get('qncount', {}) || {};
        let n = 0,
            more = false,
            known = false;
        list.forEach(i => {
            const x = c[this.path(i.url)];
            if (!x) return;
            known = true;
            n += x.n;
            more = more || x.more;
        });
        if (!known) return '';
        const t = n + (more ? '+' : '');
        return `<span class="vd-qn-n${n ? ' hot' : ''}" title="Открытых тем, ждут ответа: ${t}">${t}</span>`;
    },
    // открытые и не закреплённые темы на странице списка
    countIn(doc, at = Date.now()) {
        const rows = [...doc.querySelectorAll('.structItem--thread')].filter(
            r =>
                !r.closest('.structItemContainer-group--sticky') &&
                !r.classList.contains('structItem--sticky') &&
                !r.querySelector('.structItem-status--locked, .structItem-status--sticky')
        );
        const all = doc.querySelectorAll(
            '.structItemContainer-group:not(.structItemContainer-group--sticky) .structItem--thread, .js-threadList .structItem--thread'
        ).length;
        const paged = !!doc.querySelector('.pageNav-page:not(.pageNav-page--current), .pageNav-jump--next');
        // все темы первой страницы открыты, а страниц больше — значит, открытых ещё больше
        return { n: rows.length, more: paged && rows.length > 0 && rows.length >= all, at };
    },
    async refreshCounts() {
        if (!Settings.get().qnav.counts || this._counting || document.hidden) return;
        this._counting = true;
        try {
            const c = Object.assign({}, Store.get('qncount', {}) || {});
            // время начала обхода: по нему следующий тик точно увидит запись устаревшей
            const started = Date.now();
            const paths = [...new Set(this.items().map(i => this.path(i.url)))].filter(p => /\/forums\//.test(p));
            // текущий раздел считаем прямо со страницы
            const herePath = this.here() && this.path(this.here().url);
            // только первая страница раздела без фильтров: со 2-й страницы или по префиксу число будет неверным
            const onFirst = herePath && location.pathname === herePath && !location.search;
            if (onFirst && paths.includes(herePath) && document.querySelector('.structItem--thread'))
                c[herePath] = this.countIn(document);
            let changed = !!(onFirst && paths.includes(herePath));
            for (const p of paths.slice(0, 12)) {
                // запас 30 с: иначе на следующем тике запись ещё «свежая» и обновление уходит на 10 минут
                if (c[p] && Date.now() - c[p].at < this.COUNT_TTL - 30e3) continue;
                try {
                    const r = await fetch(location.origin + p, { credentials: 'same-origin' });
                    if (!r.ok) continue;
                    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
                    c[p] = this.countIn(doc, started);
                    changed = true;
                } catch {
                    /* нет сети — попробуем в следующий раз */
                }
            }
            // чужие и удалённые разделы не храним
            Object.keys(c).forEach(k => paths.includes(k) || delete c[k]);
            if (changed) {
                Store.set('qncount', c);
                const bar = document.getElementById('vd-qnav');
                if (bar) this.render(bar);
            }
        } finally {
            this._counting = false;
        }
    },
    watchCounts() {
        if (this._cw) return;
        this._cw = true;
        setTimeout(() => this.refreshCounts(), 1500);
        setInterval(() => this.refreshCounts(), this.COUNT_TTL);
        document.addEventListener('visibilitychange', () => this.refreshCounts());
    },
    menu(anchor, list) {
        this.close();
        const m = document.createElement('div');
        m.id = 'vd-qnav-menu';
        list.forEach(i => {
            const a = document.createElement('a');
            a.href = new URL(i.url, location.origin).href;
            a.textContent = i.name;
            a.insertAdjacentHTML('beforeend', this.badge([i]));
            if (this.active(i.url)) a.className = 'on';
            m.appendChild(a);
        });
        document.body.appendChild(m);
        const r = anchor.getBoundingClientRect();
        m.style.top = r.bottom + 6 + 'px';
        m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
        anchor.classList.add('open');
        this._open = anchor;
        setTimeout(() => addEventListener('click', this._closer, { once: true }), 0);
    },
    _closer: () => QNav.close(),
    close() {
        const m = document.getElementById('vd-qnav-menu');
        if (m) m.remove();
        if (this._open) this._open.classList.remove('open');
        this._open = null;
    }
};
addEventListener('scroll', () => QNav.close(), { passive: true });

// всплывающее меню над выделенным текстом в поле с BBCode: цвет, жирный, курсив, размер
const BB_COLORS = [
    '#e5484d',
    '#ff7a45',
    '#f5c542',
    '#2fbf71',
    '#22b8a8',
    '#3aa0ff',
    '#a970ff',
    '#ff5fa2',
    '#ffffff',
    '#8b8f9a'
];
const BBPop = {
    attach(ta) {
        let pop = null;
        const hide = () => {
            if (pop) pop.remove();
            pop = null;
        };
        // обернуть выделение тегом; повторное нажатие того же тега снимает его
        const wrap = (open, close) => {
            const a = ta.selectionStart,
                b = ta.selectionEnd;
            let sel = ta.value.slice(a, b);
            const tag = open.match(/^\[(\w+)/)[1];
            const re = new RegExp(`^\\[${tag}(=[^\\]]*)?\\]([\\s\\S]*)\\[/${tag}\\]$`, 'i');
            let m = sel.match(re);
            // «[B]a[/B] и [B]b[/B]» — это два куска, а не один обёрнутый
            if (m && new RegExp(`\\[/${tag}\\]`, 'i').test(m[2])) m = null;
            sel =
                m && (open === `[${tag}]` || m[1] === open.slice(tag.length + 1, -1))
                    ? m[2]
                    : open + (m ? m[2] : sel) + close;
            ta.setRangeText(sel, a, b, 'select');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
            place();
        };
        const clear = () => {
            const a = ta.selectionStart,
                b = ta.selectionEnd;
            const plain = ta.value.slice(a, b).replace(/\[\/?(COLOR|B|I|U|S|SIZE|FONT)(=[^\]]*)?\]/gi, '');
            ta.setRangeText(plain, a, b, 'select');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
            place();
        };
        const build = () => {
            pop = U.h(`<div class="bbpop" role="toolbar">
                <span class="bbp-sw">${BB_COLORS.map(c => `<button data-c="${c}" style="--c:${c}" title="${c}"></button>`).join('')}<label title="Свой цвет"><input type="color" value="#f5c542"></label></span>
                <span class="bbp-sep"></span>
                <button data-t="B"><b>Ж</b></button><button data-t="I"><i>К</i></button><button data-t="U"><u>П</u></button>
                <span class="bbp-sep"></span>
                <button data-z="-" title="Меньше">A−</button><button data-z="+" title="Крупнее">A+</button>
                <button data-x title="Убрать оформление">${icon('x', 12)}</button></div>`);
            // не терять выделение при клике по меню
            pop.addEventListener('mousedown', e => {
                if (e.target.type !== 'color') e.preventDefault();
            });
            pop.querySelectorAll('[data-c]').forEach(
                b => (b.onclick = () => wrap(`[COLOR=${b.dataset.c}]`, '[/COLOR]'))
            );
            const pick = pop.querySelector('input[type=color]');
            pick.onchange = () => wrap(`[COLOR=${pick.value}]`, '[/COLOR]');
            pop.querySelectorAll('[data-t]').forEach(
                b => (b.onclick = () => wrap(`[${b.dataset.t}]`, `[/${b.dataset.t}]`))
            );
            pop.querySelectorAll('[data-z]').forEach(
                b =>
                    (b.onclick = () => {
                        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
                        // размер меняем, только если весь кусок одного размера
                        const whole = /^\[SIZE=(\d)\]([\s\S]*)\[\/SIZE\]$/i.exec(sel);
                        const own = whole && !/\[\/SIZE\]/i.test(whole[2]);
                        const cur = own ? +whole[1] : 4;
                        const n = Math.max(1, Math.min(7, cur + (b.dataset.z === '+' ? 1 : -1)));
                        const inner = own ? whole[2] : sel;
                        ta.setRangeText(
                            n === 4 ? inner : `[SIZE=${n}]${inner}[/SIZE]`,
                            ta.selectionStart,
                            ta.selectionEnd,
                            'select'
                        );
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        ta.focus();
                        place();
                    })
            );
            pop.querySelector('[data-x]').onclick = clear;
            ta.parentNode.insertBefore(pop, ta);
        };
        let at = null;
        const place = () => {
            if (!pop) return;
            const host = ta.offsetParent || ta.parentNode;
            const hr = host.getBoundingClientRect(),
                tr = ta.getBoundingClientRect();
            const x = at ? at.x : tr.left + 40,
                y = at ? at.y : tr.top + 8;
            const w = pop.offsetWidth;
            pop.style.left = Math.max(0, Math.min(x - hr.left - w / 2, hr.width - w)) + 'px';
            pop.style.top = Math.max(tr.top - hr.top - pop.offsetHeight - 6, y - hr.top - pop.offsetHeight - 10) + 'px';
        };
        const check = e => {
            if (ta.selectionStart === ta.selectionEnd) return hide();
            if (e && e.clientX) at = { x: e.clientX, y: e.clientY };
            if (!pop) build();
            place();
        };
        ta.addEventListener('mouseup', check);
        ta.addEventListener('keyup', e => {
            if (e.shiftKey || e.key === 'Shift' || (e.ctrlKey && e.key === 'a')) {
                at = null;
                check();
            } else if (ta.selectionStart === ta.selectionEnd) hide();
        });
        ta.addEventListener('blur', () =>
            setTimeout(() => {
                const r = ta.getRootNode();
                if (pop && !pop.contains(r.activeElement)) hide();
            }, 150)
        );
        ta.addEventListener('scroll', place);
    }
};

// возраст темы рядом с датой создания: «6д 9ч»; чем дольше тема ждёт, тем заметнее метка
const Age = {
    text(ms) {
        const m = Math.max(0, Math.floor(ms / 60000));
        if (m < 60) return m + 'м';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'ч ' + (m % 60) + 'м';
        const d = Math.floor(h / 24);
        return d + 'д ' + (h % 24) + 'ч';
    },
    level(ms) {
        const h = ms / 3600000;
        return h < 12 ? 'ok' : h < 48 ? 'warn' : 'late';
    },
    // дата создания: в списке тем и в шапке открытой темы
    targets() {
        const out = [];
        document.querySelectorAll('.structItem--thread').forEach(row => {
            if (row.querySelector('.structItem-status--locked')) return;
            const t = row.querySelector('.structItem-startDate time[data-time], .structItem-startDate time[datetime]');
            if (t) out.push([t, t.closest('.structItem-startDate')]);
        });
        const head = document.querySelector('.p-description time[data-time], .p-description time[datetime]');
        if (
            head &&
            !document.querySelector(
                '.p-body-header .structItem-status--locked, .blockStatus--locked, .blockStatus-message--locked'
            )
        ) {
            const li = head.closest('li') || head;
            out.push([head, li]);
        }
        return out;
    },
    created(t) {
        const s = Number(t.getAttribute('data-time'));
        return s ? s * 1000 : Date.parse(t.getAttribute('datetime')) || 0;
    },
    draw() {
        if (!Settings.get().threadAge) {
            document.querySelectorAll('.vd-age').forEach(e => e.remove());
            return;
        }
        const now = Date.now();
        this.targets().forEach(([t, place]) => {
            const at = this.created(t);
            if (!at) return;
            let b = place.nextElementSibling;
            if (!b || !b.classList.contains('vd-age')) {
                b = document.createElement(place.tagName === 'LI' ? 'li' : 'span');
                b.className = 'vd-age';
                place.after(b);
            }
            const ms = now - at;
            const txt = this.text(ms);
            if (b.dataset.t === txt) return;
            b.dataset.t = txt;
            b.dataset.l = this.level(ms);
            const lvl = { ok: 'свежая', warn: 'ждёт больше 12 часов', late: 'ждёт больше 2 суток' }[b.dataset.l];
            b.title = `С создания темы прошло ${txt} — ${lvl}. Кольцо заполняется за двое суток ожидания`;
            // кольцо заполняется за двое суток ожидания
            const pct = Math.max(4, Math.min(100, Math.round((ms / (48 * 3600e3)) * 100)));
            b.innerHTML = `<svg class="vd-age-ring" viewBox="0 0 20 20"><circle class="bg" cx="10" cy="10" r="7.5"/><circle class="fg" cx="10" cy="10" r="7.5" pathLength="100" stroke-dasharray="${pct} 100"/></svg>${txt}`;
        });
    },
    start() {
        this.draw();
        if (this._t) return;
        this._t = setInterval(() => document.hidden || this.draw(), 60000);
        Bus.on('settings', () => this.draw());
    }
};

// настройки
const SETTINGS_TABS = [
    ['role', 'badge', 'Должность', 'Какие разделы и вердикты показывать'],
    ['answers', 'pen', 'Ответы', 'Свои ответы и разделы, импорт и экспорт'],
    ['look', 'star', 'Оформление ответа', 'Как ответ выглядит в теме'],
    ['themes', 'palette', 'Темы', 'Готовые темы: фон, цвета и эффект'],
    ['colors', 'star', 'Цвета', 'Цвета отдельных элементов форума'],
    ['theme', 'image', 'Фоны и прозрачность', 'Фон, прозрачность, погода'],
    ['status', 'lock', 'Статусы и поведение', 'Префиксы, подсказки, горячие клавиши'],
    ['qnav', 'forward', 'Навигация', 'Быстрые кнопки разделов в шапке форума'],
    ['mystats', 'bolt', 'Моя статистика', 'Сколько ответов ты дал: по дням, вердиктам и разделам'],
    ['autograph', 'pen', 'Автограф', 'Подпись на стене профиля: стиль и свой текст'],
    ['contact', 'chat', 'Связь с разработчиком', 'Идеи, ошибки и свои шаблоны'],
    ['about', 'shield', 'О скрипте', 'Приватность и защита авторства']
];
// готовые темы; фото с Unsplash, авторы во вкладке «О скрипте»
const UNSPLASH = (id, w = 1920) => `https://unsplash.com/photos/${id}/download?force=true&w=${w}`;
// запасной фон, если фото не загрузилось
const CAT_FALLBACK = {
    storm: ['thunder', 77],
    city: ['nightroad', 1902],
    neon: ['neon', 1201],
    sky: ['stars', 1005],
    abstract: ['smoke', 1003],
    cars: ['nightroad', 1907],
    dev: ['relief', 2000]
};
const THEME_CATS = [
    ['storm', 'Гроза', 'storm'],
    ['city', 'Ночной город', 'moon'],
    ['neon', 'Неон и дождь', 'cloud'],
    ['sky', 'Небо и звёзды', 'star'],
    ['abstract', 'Абстракция', 'palette'],
    ['cars', 'Машины', 'bolt']
];
const ph = (cat, name, id, author, accent, accent2, fx, extra) =>
    Object.assign({ cat, name, photo: id, author, accent, accent2, fx }, extra || {});
const gn = (cat, name, gen, seed, accent, accent2, fx, extra) =>
    Object.assign({ cat, name, gen, seed, accent, accent2, fx }, extra || {});
const THEME_PRESETS = [
    gn('storm', 'Чёрная гроза', 'thunder', 77, '#8fa8ff', '#d6deff', 'lightning', {
        dim: 0.15,
        tod: 'night',
        star: true
    }),
    ph('storm', 'Гроза над городом', 'Qava0gzXYSo', 'Christian Lue', '#9db4ff', '#ffd27a', 'lightning', { dim: 0.35 }),
    ph('storm', 'Разряд', 'v501xq7qPaI', 'Unsplash', '#a970ff', '#3aa0ff', 'lightning', { dim: 0.3 }),
    ph('storm', 'Шторм', '3wnG56iHn2g', 'Slava Auchynnikau', '#7c9cff', '#c7d2ff', 'storm', { dim: 0.35 }),
    ph('storm', 'Молнии над полем', '2Qv41Ccof1Q', 'Unsplash', '#b388ff', '#8fa8ff', 'lightning', { dim: 0.35 }),

    gn('city', 'Black Russia', 'nightroad', 1902, '#e5484d', '#ff7a45', 'rain'),
    ph('city', 'Москва-Сити', 'iheEOFTXRPM', 'Nikita Karimov', '#3aa0ff', '#a970ff', 'none'),
    ph('city', 'Ночная Москва', '6zUdG9TbSfY', 'Aleksandr Popov', '#4fa3ff', '#14b8a6', 'snow'),
    ph('city', 'Москва с высоты', 'bwmkM2AR9tA', 'Platon Matakaev', '#ffb454', '#ff6a3d', 'none'),
    ph('city', 'Огни трассы', 'Gqx9V1Vsr3M', 'Maxim Tolchinskiy', '#ff4d4d', '#ffb020', 'none'),
    ph('city', 'Мокрый асфальт', 'F-iQE69s2ac', 'Margo Evardson', '#ff5a5a', '#7c7cff', 'rain'),
    ph('city', 'Серпантин', 'sMnbkGmCuNw', 'Unsplash', '#ffa94d', '#e5484d', 'none'),

    ph('neon', 'Токио под дождём', 'uZA3P4sA3tM', 'masahiro miyagi', '#ff4fa3', '#3ad1ff', 'rain'),
    ph('neon', 'Осака', 'G0KVzxBb2xo', 'Cuvii', '#ff6b6b', '#ffd166', 'rain'),
    ph('neon', 'Неоновая улица', 'GZIk-Sq9PGg', 'Nicolas Caetano', '#c56bff', '#3aa0ff', 'rain'),
    ph('neon', 'Дождь на стекле', 'Imvn4PWHPcQ', 'freestocks', '#ffb454', '#ff6a3d', 'rain'),
    ph('neon', 'Капли в темноте', 'Q8gsXy6C2g0', 'Edouard TAMBA', '#7c9cff', '#ff9ec2', 'rain'),

    ph('sky', 'Северное сияние', 'B-vjWtZLC9g', 'Unsplash', '#2fe0a0', '#7c7cff', 'snow'),
    ph('sky', 'Сияние над морем', 'bFkZVRP0VlQ', 'Unsplash', '#3ddc97', '#a970ff', 'none'),
    ph('sky', 'Млечный путь', 'UeRIcbTthwE', 'Filip Kvasnak', '#8fb6ff', '#c58af9', 'fireflies'),
    ph('sky', 'Над облаками', 'uj-w-v7OFT4', 'Chan Hoi', '#9db4ff', '#ffd6a5', 'none'),
    ph('sky', 'Звёзды над пиками', 'qNXhVgRfU0E', 'Venti Views', '#7c9cff', '#ffb454', 'none'),
    gn('sky', 'Космос', 'stars', 1005, '#5fa8d3', '#c58af9', 'snow'),

    gn('abstract', 'Рельеф', 'relief', 2000, '#ff4d6d', '#5b7bd6', 'none', { star: true }),
    gn('abstract', 'Рельеф: изумруд', 'relief', 2002, '#2ec4b6', '#cbf3f0', 'none'),
    gn('abstract', 'Рельеф: фиолет', 'relief', 2003, '#9d7bff', '#ffe1ff', 'none'),
    gn('abstract', 'Рельеф: закат', 'relief', 2004, '#ff7a2f', '#ffd29d', 'none'),
    ph('abstract', 'Красные волны', 'GycPY2LU2Ew', 'Pawel Czerwinski', '#e5484d', '#ff7a45', 'none'),
    ph('abstract', 'Линии', 'dFcotJdXzXw', 'Pawel Czerwinski', '#ff3b3b', '#ff9e7a', 'none'),
    ph('abstract', 'Жидкий металл', 'kCOWXaq56ho', 'Al Amin Mir', '#ff2d55', '#ff8a5b', 'none'),
    gn('abstract', 'Фиолетовый дым', 'smoke', 1003, '#9d7bff', '#ff8fd0', 'none'),
    gn('abstract', 'Синтвейв', 'synth', 1001, '#ff3864', '#ffb86b', 'none'),

    ph('cars', 'Неон и металл', '2QIQhVB4sOE', 'noir', '#ff3b8d', '#3ad1ff', 'none'),
    ph('cars', 'Гараж', '0eGRcXpR2_g', 'Komorebi Photo', '#ffb454', '#e5484d', 'none'),
    ph('cars', 'RS6', 'krETJVsnWeA', 'serjan midili', '#e5484d', '#8b8f9a', 'rain')
];
const ACCENTS = [
    '#e5484d',
    '#ff7a45',
    '#f5a524',
    '#2fbf71',
    '#14b8a6',
    '#3aa0ff',
    '#7c7cff',
    '#a970ff',
    '#ec4899',
    '#d0d3da'
];

const SettingsUI = {
    tab: 'role',
    open(tab) {
        Picker.close();
        // поиск Ctrl+K под настройками не нужен
        const pal = Layer._root && Layer._root.querySelector('.modal.pal');
        if (pal) pal.closest('.scrim').remove();
        if (tab) this.tab = tab;
        this.close();
        const off = !Integrity.ok();
        this.scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal">
            <div class="m-body">
              <aside class="side">
                <div class="side-brand"><span class="brand-mark">${icon('logo', 19)}</span><div><div class="m-title" style="letter-spacing:.18em">VERDICT</div><div class="m-sub">v${BRAND.version}</div></div></div>
                <nav class="tabs">
                  ${SETTINGS_TABS.map(([id, ic, nm]) => `<button class="tab" data-t="${id}">${icon(ic)}<span>${nm}</span></button>`).join('')}
                </nav>
                <div class="side-foot">${off ? `<span class="badge-warn">${icon('shield', 12)}Неофициальная копия</span>` : `${icon('shield', 12).replace('class="vi"', 'class="vi" style="display:inline;vertical-align:-2px"')} Оригинальная сборка`}</div>
              </aside>
              <div class="main">
                <div class="m-head"><div><div class="m-title" data-h="t"></div><div class="m-sub" data-h="s"></div></div><span style="flex:1"></span>
                  <button class="icon-btn" data-a="x" title="Закрыть (Esc)">${icon('x')}</button></div>
                <section class="pane"></section>
              </div>
            </div>
        </div></div>`)
        );
        this.scrim.addEventListener('mousedown', e => {
            if (e.target === this.scrim) this.close();
        });
        this.scrim.querySelector('[data-a="x"]').onclick = () => this.close();
        this.scrim.querySelectorAll('.tab').forEach(
            t =>
                (t.onclick = () => {
                    this.tab = t.dataset.t;
                    this.draw();
                })
        );
        this.draw();
    },
    close() {
        if (this.scrim) {
            this.scrim.remove();
            this.scrim = null;
        }
    },
    draw() {
        this.scrim.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.t === this.tab));
        const pane = this.scrim.querySelector('.pane');
        const meta = SETTINGS_TABS.find(t => t[0] === this.tab);
        this.scrim.querySelector('[data-h="t"]').textContent = meta[2];
        this.scrim.querySelector('[data-h="s"]').textContent = meta[3];
        const keep = this._lastTab === this.tab ? pane.scrollTop : 0;
        this._lastTab = this.tab;
        pane.innerHTML = '';
        this['tab_' + this.tab](pane);
        pane.scrollTop = keep;
    },

    sw(on, cb) {
        const b = U.h(`<button class="sw ${on ? 'on' : ''}" role="switch"></button>`);
        b.onclick = () => {
            b.classList.toggle('on');
            cb(b.classList.contains('on'));
        };
        return b;
    },
    row(title, sub, control) {
        const r = U.h(`<div class="row"><div class="lbl">${title}${sub ? `<small>${sub}</small>` : ''}</div></div>`);
        r.appendChild(control);
        return r;
    },
    sec(pane, title) {
        const s = U.h(`<div class="sec">${title ? `<h4>${title}</h4>` : ''}</div>`);
        pane.appendChild(s);
        return s;
    },
    card(pane, title) {
        const s = this.sec(pane, title);
        const c = U.h('<div class="card"></div>');
        s.appendChild(c);
        return c;
    },
    select(opts, val, cb) {
        const s = U.h(
            `<select class="inp">${Object.entries(opts)
                .map(([k, v]) => `<option value="${U.esc(k)}" ${k === val ? 'selected' : ''}>${U.esc(v)}</option>`)
                .join('')}</select>`
        );
        s.onchange = () => cb(s.value);
        return s;
    },

    /* Ответы: менеджер шаблонов */
    tab_answers(pane) {
        const edited = Packs.all().reduce((n, p) => n + p.items.filter(i => Packs.isEdited(p, i)).length, 0);
        if (edited) {
            const hint =
                U.h(`<div class="hero" style="padding:12px 14px"><span class="big" style="width:36px;height:36px">${icon('pen', 17)}</span>
                <div style="flex:1"><b>Ты переписал стандартных ответов: ${edited}</b><p>Можешь отправить правки, лучшие войдут в стандартные ответы.</p></div></div>`);
            const go = U.h(`<button class="btn pri">${icon('send', 14)}Отправить</button>`);
            go.onclick = () => ShareTemplates.open();
            hint.appendChild(go);
            pane.appendChild(hint);
        }
        const packs = Packs.all();
        this.packSel = this.packSel && Packs.find(this.packSel) ? this.packSel : packs[0].id;
        const head = U.h(`<div class="tpl-head"></div>`);
        head.appendChild(
            this.select(
                Object.fromEntries(packs.map(p => [p.id, `${p.name} (${p.items.length})`])),
                this.packSel,
                v => {
                    this.packSel = v;
                    this.draw();
                }
            )
        );
        const mk = (ic, txt, cls, fn) => {
            const b = U.h(`<button class="btn ${cls || ''}">${icon(ic, 14)}${txt}</button>`);
            b.onclick = fn;
            head.appendChild(b);
            return b;
        };
        mk('plus', 'Ответ', 'pri', () => this.editItem(null));
        mk('plus', 'Раздел', '', () => this.editPack(null));
        mk('edit', 'Раздел', 'ghost', () => this.editPack(this.packSel));
        if (this.packSel !== 'common')
            mk('trash', '', 'ghost danger', () => {
                const p = Packs.find(this.packSel);
                if (!confirm(`Удалить раздел «${p.name}» со всеми ответами?`)) return;
                Packs._v = Packs.all().filter(x => x !== p);
                this.packSel = null;
                Packs.save();
                this.draw();
            }).title = 'Удалить раздел';
        pane.appendChild(head);

        const pack = Packs.find(this.packSel);
        if (pack.match)
            pane.appendChild(
                U.h(
                    `<div class="muted" style="margin:-4px 0 12px;font-size:11.5px">Срабатывает, если в разделе/заголовке есть: <span class="tag">${U.esc(pack.match)}</span></div>`
                )
            );
        VERDICT_ORDER.forEach(v => {
            const items = pack.items.filter(i => i.verdict === v);
            if (!items.length) return;
            const s = this.sec(pane, `<span style="color:${VERDICTS[v].color}">●</span> ${VERDICTS[v].label}`);
            items.forEach(item => {
                const r =
                    U.h(`<div class="tpl-row"><span class="t"><b>${U.esc(item.title)}</b><small>${U.esc(item.text.replace(/\n/g, ' '))}</small></span>
                    ${Packs.isEdited(pack, item) ? '<span class="tag" style="color:var(--acc)">изменён</span><button class="icon-btn" data-a="r" title="Вернуть стандартный текст">' + icon('x', 15) + '</button>' : ''}
                    ${item.key ? `<span class="tag">/${U.esc(item.key)}</span>` : ''}
                    <button class="icon-btn" data-a="e" title="Изменить">${icon('edit', 15)}</button>
                    <button class="icon-btn" data-a="d" title="Удалить">${icon('trash', 15)}</button></div>`);
                r.querySelector('[data-a="e"]').onclick = () => this.editItem(item);
                const reset = r.querySelector('[data-a="r"]');
                if (reset)
                    reset.onclick = () => {
                        const d = Packs.defaultOf(pack, item);
                        Object.assign(item, { text: d.text, verdict: d.verdict, key: d.key || '' });
                        if (d.tail === undefined) delete item.tail;
                        else item.tail = d.tail;
                        Packs.save();
                        this.draw();
                    };
                r.querySelector('[data-a="d"]').onclick = () => {
                    if (!confirm(`Удалить ответ «${item.title}»?`)) return;
                    pack.items = pack.items.filter(x => x !== item);
                    Packs.save();
                    this.draw();
                };
                s.appendChild(r);
            });
        });

        const io = this.sec(pane, 'Поделиться и резервная копия');
        const btns = U.h(`<div class="btns"></div>`);
        const b = (ic, txt, fn, cls) => {
            const x = U.h(`<button class="btn ${cls || ''}">${icon(ic, 14)}${txt}</button>`);
            x.onclick = fn;
            btns.appendChild(x);
        };
        b('send', 'Отправить свои ответы', () => ShareTemplates.open(), 'pri');
        b('download', 'Экспорт ответов', () =>
            this.download(`verdict-answers-${Date.now()}.json`, {
                verdict: BRAND.build,
                type: 'packs',
                packs: Packs.all()
            })
        );
        b('upload', 'Импорт', () =>
            this.upload(data => {
                if (!data || data.type !== 'packs' || !Array.isArray(data.packs))
                    throw new Error('Это не файл ответов VERDICT');
                data.packs = Packs.clean(data.packs);
                if (!data.packs.length) throw new Error('В файле нет ответов');
                const mode = confirm('ОК — добавить к текущим, Отмена — заменить всё') ? 'merge' : 'replace';
                if (mode === 'replace') Packs._v = data.packs;
                else
                    data.packs.forEach(np => {
                        const ex = Packs.find(np.id);
                        if (ex)
                            np.items.forEach(i => {
                                const same = ex.items.find(x => x.title === i.title);
                                // ответ с тем же названием берём из файла: там могут быть твои правки
                                if (same) {
                                    Object.assign(same, { text: i.text, verdict: i.verdict, key: i.key || same.key });
                                    if (i.tail === undefined) delete same.tail;
                                    else same.tail = i.tail;
                                } else ex.items.push(Object.assign(i, { id: ex.id + '-' + U.uid() }));
                            });
                        else Packs.all().push(np);
                    });
                Packs.save();
                this.draw();
                toast('Ответы импортированы');
            })
        );
        b(
            'trash',
            'Сбросить к стандартным',
            () => {
                if (confirm('Вернуть стандартный набор? Ваши правки пропадут.')) {
                    Packs.reset();
                    this.draw();
                    toast('Готово');
                }
            },
            'danger'
        );
        io.appendChild(btns);
    },
    editItem(item, inPack) {
        const pack = inPack || Packs.find(this.packSel);
        const isNew = !item;
        const d = item ? Object.assign({}, item) : { verdict: 'deny', title: '', text: '', key: '' };
        const scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal sm">
            <div class="m-head"><span class="vic" style="--c:var(--acc);width:34px;height:34px;border-radius:10px">${icon('pen', 16)}</span><div><div class="m-title">${isNew ? 'Новый ответ' : 'Изменить ответ'}</div><div class="m-sub">${U.esc(pack.name)}</div></div><span style="flex:1"></span><button class="icon-btn" data-a="x">${icon('x')}</button></div>
            <div class="pane"><div class="split"><div>
              <div class="grid2">
                <label class="field"><span>Название (видно в меню)</span><input class="inp" data-f="title" maxlength="60"></label>
                <label class="field"><span>Шорткод: /…</span><input class="inp" data-f="key" maxlength="15" placeholder="например: нд"></label>
              </div>
              <div class="grid2">
                <label class="field"><span>Вердикт и статус темы</span><select class="inp" data-f="verdict">${VERDICT_ORDER.map(v => `<option value="${v}">${VERDICTS[v].label}</option>`).join('')}</select></label>
                <label class="field"><span>Итоговая строка (пусто — стандартная)</span><input class="inp" data-f="tail" placeholder=""></label>
              </div>
              <label class="field"><span>Текст ответа (BBCode можно)</span><textarea class="inp" data-f="text"></textarea>
                <div class="vars">${['greeting', 'user', 'nick', 'target', 'admin', 'date', 'time', 'cursor'].map(v => `<button data-var="${v}">{${v}}</button>`).join('')}</div>
              </label>
              </div><div>
              <div class="field"><span style="display:flex;align-items:center;justify-content:space-between">Как увидит игрок
                <span class="seg"><button data-m="view" class="on">Вид</button><button data-m="code">BBCode</button></span></span>
                <div class="pv"></div></div>
              </div></div>
              <div class="btns" style="justify-content:flex-end;margin-top:6px"><button class="btn ghost" data-a="x">Отмена</button><button class="btn pri" data-a="ok">${icon('check', 14)}Сохранить</button></div>
            </div></div></div>`)
        );
        const f = n => scrim.querySelector(`[data-f="${n}"]`);
        f('title').value = d.title;
        f('key').value = d.key || '';
        f('verdict').value = d.verdict;
        f('text').value = d.text;
        f('tail').value = d.tail !== undefined ? d.tail : '';
        // итоговая строка по умолчанию зависит от раздела
        const tailFor = v => Tails.get(pack.kind, v);
        f('tail').placeholder = tailFor(d.verdict);
        const pv = () => {
            f('tail').placeholder = tailFor(f('verdict').value) || '(без итоговой строки)';
            const tmp = { verdict: f('verdict').value, text: f('text').value, tail: f('tail').value || undefined };
            const bb = Answer.build(tmp, {
                author: { id: '0', name: 'Nick_Name' },
                target: 'Other_Player',
                kind: pack.kind
            });
            const box = scrim.querySelector('.pv');
            if (mode === 'code') box.innerHTML = `<div class="bb">${U.esc(bb.replace(CURSOR_MARK, '▮'))}</div>`;
            else box.innerHTML = postPreview(bb, tmp.verdict);
        };
        let mode = 'view';
        scrim.querySelectorAll('[data-m]').forEach(
            b =>
                (b.onclick = e => {
                    e.preventDefault();
                    mode = b.dataset.m;
                    scrim.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
                    pv();
                })
        );
        ['title', 'key', 'verdict', 'text', 'tail'].forEach(n => f(n).addEventListener('input', pv));
        f('text').parentNode.classList.add('bbp-field');
        BBPop.attach(f('text'));
        scrim.querySelectorAll('[data-var]').forEach(
            b =>
                (b.onclick = e => {
                    e.preventDefault();
                    const ta = f('text'),
                        s = ta.selectionStart,
                        ins = `{${b.dataset.var}}`;
                    ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd);
                    ta.focus();
                    ta.setSelectionRange(s + ins.length, s + ins.length);
                    pv();
                })
        );
        pv();
        const close = () => scrim.remove();
        scrim.querySelectorAll('[data-a="x"]').forEach(b => (b.onclick = close));
        scrim.querySelector('[data-a="ok"]').onclick = () => {
            const title = f('title').value.trim(),
                text = f('text').value;
            if (!title || !text.trim()) {
                toast('Заполните название и текст', 'err');
                return;
            }
            const out = item || { id: pack.id + '-' + U.uid() };
            out.title = title;
            out.text = text;
            out.verdict = f('verdict').value;
            out.key = f('key').value.trim().replace(/^\//, '');
            const tail = f('tail').value.trim();
            if (tail) out.tail = tail;
            else delete out.tail;
            if (isNew) pack.items.push(out);
            Packs.save();
            close();
            if (this.scrim) this.draw();
            toast('Сохранено');
        };
        setTimeout(() => f('title').focus(), 20);
    },
    editPack(id) {
        const pack = id ? Packs.find(id) : null;
        const name = prompt('Название раздела:', pack ? pack.name : '');
        if (!name) return;
        if (pack && pack.id === 'common') {
            pack.name = name;
            Packs.save();
            this.draw();
            return;
        }
        const match = prompt(
            'Слова/регулярка для автоопределения раздела (по «хлебным крошкам» и заголовку).\nНапример: жалоб.*игрок   или   заявк',
            pack ? pack.match : ''
        );
        if (match === null) return;
        try {
            new RegExp(match);
        } catch (e) {
            toast('Ошибка в регулярке: ' + e.message, 'err');
            return;
        }
        if (pack) {
            pack.name = name;
            pack.match = match;
        } else {
            const p = { id: 'p' + U.uid(), name, match, kind: 'any', items: [] };
            Packs.all().push(p);
            this.packSel = p.id;
        }
        Packs.save();
        this.draw();
    },

    /* Оформление ответа */
    tab_look(pane) {
        const s = Settings.get(),
            a = s.answer;
        const sec = this.card(pane, 'Стиль');
        const upd = fn => {
            Settings.patch(x => fn(x.answer));
            demo();
        };
        sec.appendChild(
            this.row(
                'Макет ответа',
                '',
                this.select(ANSWER_STYLES, a.style, v =>
                    upd(x => {
                        x.style = v;
                    })
                )
            )
        );
        sec.appendChild(
            this.row(
                'Цвета вердиктов',
                '',
                this.select(
                    Object.fromEntries(Object.entries(ANSWER_PALETTES).map(([k, p]) => [k, p.name])),
                    a.palette,
                    v =>
                        upd(x => {
                            x.palette = v;
                        })
                )
            )
        );
        sec.appendChild(
            this.row(
                'Шрифт',
                'Пусто = шрифт форума',
                this.select(
                    {
                        '': 'Как на форуме',
                        'Times New Roman': 'Times New Roman',
                        Georgia: 'Georgia',
                        Verdana: 'Verdana',
                        Arial: 'Arial',
                        'Courier New': 'Courier New'
                    },
                    a.font,
                    v =>
                        upd(x => {
                            x.font = v;
                        })
                )
            )
        );
        sec.appendChild(
            this.row(
                'Размер текста',
                '',
                this.select({ 3: 'Мелкий', 4: 'Обычный', 5: 'Крупный' }, a.size, v =>
                    upd(x => {
                        x.size = v;
                    })
                )
            )
        );
        sec.appendChild(
            this.row(
                'Приветствие',
                '«Здравствуйте, Ник.»',
                this.sw(a.greet, v =>
                    upd(x => {
                        x.greet = v;
                    })
                )
            )
        );
        sec.appendChild(
            this.row(
                'Ник автора ссылкой на профиль',
                '',
                this.sw(a.mention, v =>
                    upd(x => {
                        x.mention = v;
                    })
                )
            )
        );
        const sig = U.h(
            `<input class="inp" style="max-width:260px" placeholder="Например: Администратор Ivan_Petrov">`
        );
        sig.value = a.signature;
        sig.oninput = U.debounce(
            () =>
                upd(x => {
                    x.signature = sig.value.trim();
                }),
            300
        );
        sec.appendChild(this.row('Подпись', 'Добавляется в конце: «С уважением, …»', sig));
        const ban = U.h(`<input class="inp" style="max-width:260px" placeholder="https://… (картинка-шапка)">`);
        ban.value = a.banner;
        ban.oninput = U.debounce(
            () =>
                upd(x => {
                    x.banner = ban.value.trim();
                }),
            300
        );
        sec.appendChild(this.row('Баннер сверху', 'Необязательно', ban));
        this.tailsSection(pane);
        const d = this.sec(pane, 'Как увидит игрок');
        const box = U.h(`<div></div>`);
        d.appendChild(box);
        const demo = () => {
            const sample = Packs.all()
                .flatMap(p => p.items)
                .find(i => i.verdict === 'deny') || { verdict: 'deny', text: 'Пример текста' };
            box.innerHTML = postPreview(
                Answer.build(sample, { author: { id: '1', name: 'Nick_Name' } }),
                sample.verdict
            );
        };
        demo();
        this._tailDemo = demo;
    },

    // свои итоговые строки вердиктов: «Одобрено, тема закрыта.» → что угодно
    tailsSection(pane) {
        const own = Settings.get().answer.tails;
        const sec = this.sec(pane, 'Итоговые строки');
        sec.appendChild(
            U.h(
                `<div class="muted" style="margin:-4px 0 10px;font-size:11.5px">Строка в конце ответа. Пусто — стандартная, «-» — без строки. Работают {user}, {admin}, {date}. В самом ответе строку можно переписать отдельно.</div>`
            )
        );
        const input = (key, std) => {
            const i = U.h(`<input class="inp" maxlength="200">`);
            i.value = own[key] || '';
            i.placeholder = std || '(без строки)';
            i.oninput = U.debounce(() => {
                Settings.patch(x => {
                    const v = i.value.trim();
                    if (v) x.answer.tails[key] = v;
                    else delete x.answer.tails[key];
                });
                if (this._tailDemo) this._tailDemo();
            }, 300);
            return i;
        };
        const row = (key, v, label, std) => {
            const r = U.h(
                `<div class="tl-row"><span class="tl-v" style="--c:${VERDICTS[v].color}">${icon(VERDICTS[v].icon, 12)}${U.esc(label)}</span></div>`
            );
            r.appendChild(input(key, std));
            return r;
        };
        const box = U.h(`<div class="card tl-list"></div>`);
        VERDICT_ORDER.filter(v => v !== 'none').forEach(v =>
            box.appendChild(row(v, v, VERDICTS[v].label, VERDICTS[v].tail))
        );
        sec.appendChild(box);
        // одобрено/отказано по разделам: «Жалоба одобрена», «Заявка отклонена»
        const more = U.h(
            `<details class="tl-more"><summary>По разделам: жалобы, обжалования, заявки, биографии</summary><div class="card tl-list"></div></details>`
        );
        const inner = more.querySelector('.tl-list');
        Object.entries(TAIL_KINDS).forEach(([kind, name]) =>
            ['approve', 'deny'].forEach(v =>
                inner.appendChild(
                    row(kind + '.' + v, v, `${name}: ${VERDICTS[v].label.toLowerCase()}`, Tails.std(kind, v))
                )
            )
        );
        if (Object.keys(own).some(k => k.includes('.'))) more.open = true;
        sec.appendChild(more);
        const reset = U.h(
            `<button class="btn ghost" style="margin-top:10px">${icon('x', 14)}Вернуть стандартные</button>`
        );
        reset.onclick = () => {
            Settings.patch(x => (x.answer.tails = {}));
            this.draw();
        };
        if (Object.keys(own).length) sec.appendChild(reset);
    },

    fxSection(pane) {
        const fx = Settings.get().theme.fx;
        const sec = this.sec(pane, 'Погода и время суток');
        const grid = U.h(`<div class="fxgrid" style="margin-bottom:10px"></div>`);
        Object.entries(FX_EFFECTS).forEach(([id, e]) => {
            const b = U.h(
                `<button class="fxbtn ${fx.effect === id ? 'on' : ''}"><span class="vic" style="--c:var(--acc)">${icon(e.icon, 13)}</span>${e.name}</button>`
            );
            b.onclick = () => {
                Settings.patch(x => {
                    x.theme.fx.effect = id;
                });
                Fx.sync();
                this.draw();
            };
            grid.appendChild(b);
        });
        sec.appendChild(grid);
        if (Fx.reduced())
            sec.appendChild(
                U.h(
                    `<div class="badge-warn" style="margin-bottom:10px">В системе включено «уменьшить движение», анимации выключены</div>`
                )
            );
        const card = U.h(`<div class="card"></div>`);
        sec.appendChild(card);
        const seg = U.h(`<div class="seg"></div>`);
        Object.entries(TOD.names).forEach(([id, nm]) => {
            const b = U.h(`<button class="${fx.tod === id ? 'on' : ''}">${nm}</button>`);
            b.onclick = () => {
                Settings.patch(x => {
                    x.theme.fx.tod = id;
                });
                Fx.sync();
                this.draw();
            };
            seg.appendChild(b);
        });
        card.appendChild(
            this.row(
                'Время суток',
                fx.tod === 'auto'
                    ? `Сейчас: ${TOD.names[TOD.now()].toLowerCase()}, влияет на оттенок неба и цвет дождя`
                    : 'Оттенок неба и цвет дождя/вспышек',
                seg
            )
        );
        const r = U.h(`<input type="range" min="0.1" max="1" step="0.05" value="${fx.intensity}">`);
        r.oninput = U.debounce(() => {
            Settings.patch(x => {
                x.theme.fx.intensity = +r.value;
            });
            Fx.sync();
        }, 120);
        card.appendChild(this.row('Интенсивность', 'Сколько капель, снежинок, лепестков', r));
        if (fx.effect === 'storm')
            card.appendChild(
                this.row(
                    'Молнии',
                    'Вспышки и разряды во время грозы',
                    this.sw(fx.lightning, v => {
                        Settings.patch(x => {
                            x.theme.fx.lightning = v;
                        });
                        Fx.sync();
                    })
                )
            );
    },

    /* Должность */
    tab_role(pane) {
        const s = Settings.get();
        const roles = U.h('<div style="margin-bottom:22px"></div>');
        RoleForm.render(roles, () => this.draw());
        pane.appendChild(roles);
        const pk = this.card(pane, 'Разделы ответов');
        Packs.all().forEach(p =>
            pk.appendChild(
                this.row(
                    U.esc(p.name),
                    `${p.items.length} ответов`,
                    this.sw(Access.packVisible(p), v =>
                        Settings.patch(x => {
                            x.packVis[p.id] = v;
                        })
                    )
                )
            )
        );
        const vd = this.card(pane, 'Кнопки вердиктов');
        VERDICT_ORDER.forEach(v =>
            vd.appendChild(
                this.row(
                    `<span style="color:${VERDICTS[v].color}">●</span> ${VERDICTS[v].label}`,
                    '',
                    this.sw(Access.verdictVisible(v), on =>
                        Settings.patch(x => {
                            x.verdictVis[v] = on;
                        })
                    )
                )
            )
        );
        const hidden = s.hiddenItems.map(id => Packs.item(id)).filter(Boolean);
        const hs = this.card(pane, `Скрытые ответы (${hidden.length})`);
        if (!hidden.length)
            hs.appendChild(
                U.h(
                    `<div class="muted" style="padding:12px 0">Наведи на ответ в списке и нажми ${icon('eyeOff', 13).replace('class="vi"', 'class="vi" style="display:inline;vertical-align:-2px"')} — он пропадёт из меню. Вернуть можно здесь.</div>`
                )
            );
        hidden.forEach(({ item, pack }) => {
            const b = U.h(`<button class="btn">${icon('eye', 14)}Вернуть</button>`);
            b.onclick = () => {
                Access.showItem(item.id);
                this.draw();
            };
            hs.appendChild(this.row(U.esc(item.title), `${U.esc(pack.name)} · ${verdictOf(item).label}`, b));
        });
    },

    /* Готовые темы */
    themeSrc(p, w) {
        return p.photo ? UNSPLASH(p.photo, w) : p.url || null;
    },
    applyPreset(p) {
        Settings.patch(x => {
            x.accent = p.accent;
            x.theme.enabled = true;
            x.theme.rotate = 'off';
            x.colors.accent2 = p.accent2 || '';
            const src = this.themeSrc(p, 1920);
            const [fg, fs] = CAT_FALLBACK[p.cat] || CAT_FALLBACK.dev;
            x.theme.wall = src
                ? { kind: 'url', url: src, fb: { gen: fg, seed: fs } }
                : { kind: 'gen', gen: p.gen, seed: p.seed };
            x.theme.fx.effect = p.fx || 'none';
            // что тема не задаёт, возвращаем к умолчаниям, иначе тянется от прошлой темы
            x.theme.dim = p.dim !== undefined ? p.dim : DEFAULT_SETTINGS.theme.dim;
            x.theme.fx.tod = p.tod || DEFAULT_SETTINGS.theme.fx.tod;
        });
        Theme.apply();
        this.draw();
        toast(`Тема «${p.name}»`);
    },
    tab_themes(pane) {
        const s = Settings.get(),
            w = s.theme.wall;
        this.themeCat = this.themeCat || 'all';
        const gal = (BRAND.gallery || [])
            .filter(g => g && /^https:\/\//.test(g.url))
            .map(g => ({
                cat: 'dev',
                name: g.name || 'Фон',
                url: g.url,
                accent: g.accent || s.accent,
                accent2: g.accent2,
                fx: g.fx
            }));
        const cats = [['all', 'Все', 'spark']].concat(
            gal.length ? [['dev', 'От разработчика', 'heart']] : [],
            THEME_CATS
        );
        const bar = U.h(`<div class="chips" style="margin-bottom:16px"></div>`);
        cats.forEach(([id, nm, ic]) => {
            const b = U.h(`<button class="pill ${this.themeCat === id ? 'on' : ''}">${icon(ic, 13)}${nm}</button>`);
            b.onclick = () => {
                this.themeCat = id;
                this.draw();
            };
            bar.appendChild(b);
        });
        pane.appendChild(bar);
        const all = gal.concat(THEME_PRESETS);
        const groups =
            this.themeCat === 'all' ? cats.filter(c => c[0] !== 'all') : cats.filter(c => c[0] === this.themeCat);
        groups.forEach(([cid, cname]) => {
            const list = all.filter(p => p.cat === cid);
            if (!list.length) return;
            const sec = this.sec(pane, cname);
            const grid = U.h(`<div class="walls big"></div>`);
            sec.appendChild(grid);
            list.forEach(p => {
                const src = this.themeSrc(p, 1920);
                const on =
                    s.theme.enabled &&
                    s.accent === p.accent &&
                    (src
                        ? w.kind === 'url' && w.url === src
                        : w.kind === 'gen' && w.gen === p.gen && w.seed === p.seed);
                const fxName = p.fx && p.fx !== 'none' ? FX_EFFECTS[p.fx].name : '';
                const card =
                    U.h(`<div class="wall ${on ? 'on' : ''}" role="button" style="--c:${p.accent}" title="${p.author ? `Фото: ${U.esc(p.author)} / Unsplash` : 'Генеративный фон VERDICT'}">
                    ${p.star ? '<span class="tagc" style="background:var(--acc);color:#fff">★ ТОП</span>' : fxName ? `<span class="tagc">${icon(FX_EFFECTS[p.fx].icon, 10).replace('class="vi"', 'class="vi" style="display:inline;vertical-align:-1px"')} ${fxName}</span>` : ''}
                    <div class="nm"><span class="dotc"></span><span class="dotc" style="--c:${p.accent2 || p.accent};margin-left:-10px"></span><span>${p.name}</span>${p.photo ? '<span class="muted">фото</span>' : ''}</div></div>`);
                // молния живая, на превью рисуем застывшую
                const bolt = /lightning|storm/.test(p.fx || '') ? `url(${Fx.stillBolt(400, 225, p.seed || 7)}), ` : '';
                if (src) {
                    const [fg, fs] = CAT_FALLBACK[p.cat] || CAT_FALLBACK.dev;
                    card.style.backgroundImage = `${bolt}url(${Wallpaper.render(fg, fs, 400, 225)})`;
                    card.classList.add('loading');
                    Photo.load(this.themeSrc(p, 480), { thumb: true })
                        .then(data => {
                            card.style.backgroundImage = `${bolt}url("${data}")`;
                        })
                        .catch(() => {
                            const note = card.querySelector('.nm .muted');
                            if (note) note.textContent = 'нет фото';
                            card.title = 'Фото не загрузилось, будет генеративный фон';
                        })
                        .finally(() => card.classList.remove('loading'));
                } else
                    requestAnimationFrame(() => {
                        card.style.backgroundImage = `${bolt}url(${Wallpaper.render(p.gen, p.seed, 400, 225)})`;
                    });
                card.onclick = () => this.applyPreset(p);
                grid.appendChild(card);
            });
        });
    },

    /* Цвета */
    tab_colors(pane) {
        const s = Settings.get(),
            c = s.colors;
        const g = c.gradients !== false;
        const C = k => Colors.get(s, k);
        pane.appendChild(
            U.h(`<div class="hero" style="display:block">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><b>Предпросмотр</b><span class="muted" style="font-size:11.5px">цвета меняются плавно</span></div>
            <div class="cprev">
              <div class="cp-head" style="background:${g ? `linear-gradient(90deg, ${C('header')}, color-mix(in srgb, ${C('header')} 82%, ${C('accent2')}))` : C('header')};border-bottom:2px solid transparent;border-image:${g ? `linear-gradient(90deg, transparent, ${s.accent}, ${C('accent2')}, transparent) 1` : 'none'}">ГЛАВНАЯ · <span style="color:${s.accent}">ФОРУМЫ</span> · ЧТО НОВОГО</div>
              <div class="cp-block" style="background:${C('blocks')};border-color:${Colors.auto(s, 'border') ? 'rgba(255,255,255,.08)' : C('border')}">
                <div>Сообщение игрока со <span style="color:${C('links')};text-decoration:underline">ссылкой</span> на доказательства.</div>
                <span class="cp-btn" style="background:${g ? `linear-gradient(135deg, ${C('buttons')}, ${C('accent2')})` : C('buttons')}">Ответить</span>
              </div>
              <div class="cp-strip" style="background:linear-gradient(90deg, ${s.accent}, ${C('accent2')})"></div>
            </div></div>`)
        );
        const har = this.sec(pane, 'Быстрые сочетания от акцента');
        const hb = U.h(`<div class="chips"></div>`);
        const a = s.accent;
        [
            ['Один цвет', { accent2: '' }],
            ['Соседний', { accent2: hsl.rotate(a, 35) }],
            ['Контраст', { accent2: hsl.rotate(a, 180) }],
            ['Триада', { accent2: hsl.rotate(a, 120), buttons: hsl.rotate(a, 240) }],
            ['Закат', { accent2: '#ffb454', header: '#1a0d14' }],
            ['Неон', { accent2: '#3ad1ff', header: '#0a0b1a', links: '#ff7ad9' }],
            ['Лёд', { accent2: '#d6e4ff', blocks: '#0b1220', header: '#0a1428', border: '#8fb6ff' }]
        ].forEach(([nm, val]) => {
            const v2 = val.accent2 || a;
            const b = U.h(
                `<button class="pill"><span style="width:26px;height:12px;border-radius:6px;background:linear-gradient(90deg, ${a}, ${v2})"></span>${nm}</button>`
            );
            b.onclick = () => {
                Settings.patch(x => {
                    x.colors = Object.assign(
                        { gradients: x.colors.gradients },
                        { accent2: '', header: '', blocks: '', border: '', buttons: '', links: '' },
                        val
                    );
                });
                Theme.apply();
                this.draw();
            };
            hb.appendChild(b);
        });
        har.appendChild(hb);
        const card = this.card(pane, 'Элементы');
        card.appendChild(
            this.row(
                'Плавные градиенты',
                'Мягкий переход между разными цветами элементов',
                this.sw(g, v => {
                    Settings.patch(x => {
                        x.colors.gradients = v;
                    });
                    Theme.apply();
                    this.draw();
                })
            )
        );
        const acc = U.h(`<input type="color" value="${a}">`);
        const saveAcc = () => {
            Settings.patch(x => {
                x.accent = acc.value;
            });
            Theme.apply();
        };
        acc.oninput = U.debounce(saveAcc, 120);
        // перерисовка закрыла бы открытую палитру, поэтому только по change и после сохранения
        acc.onchange = () => {
            saveAcc();
            this.draw();
        };
        card.appendChild(this.row('Акцент', 'Главный цвет: выделения, активные вкладки, VERDICT', acc));
        COLOR_PARTS.forEach(([k, nm, sub]) => {
            const box = U.h(`<div class="btns" style="align-items:center"></div>`);
            const inp = U.h(`<input type="color" value="${/^#[0-9a-f]{6}$/i.test(C(k)) ? C(k) : '#ffffff'}">`);
            const save = () => {
                Settings.patch(x => {
                    x.colors[k] = inp.value;
                });
                Theme.apply();
            };
            inp.oninput = U.debounce(save, 120);
            inp.onchange = () => {
                save();
                this.draw();
            };
            const auto = U.h(
                `<button class="btn ghost" ${Colors.auto(s, k) ? 'disabled' : ''}>${Colors.auto(s, k) ? 'авто' : 'сбросить'}</button>`
            );
            auto.onclick = () => {
                Settings.patch(x => {
                    x.colors[k] = '';
                });
                Theme.apply();
                this.draw();
            };
            box.append(auto, inp);
            card.appendChild(this.row(nm, sub, box));
        });
    },

    /* Фон и тема форума */
    tab_theme(pane) {
        const s = Settings.get(),
            t = s.theme;
        const base = this.card(pane, 'Тема форума');
        base.appendChild(
            this.row(
                'Включить оформление VERDICT',
                'Фон, стекло, акцент на всём форуме',
                this.sw(t.enabled, v => {
                    Settings.patch(x => {
                        x.theme.enabled = v;
                    });
                    Theme.apply();
                })
            )
        );
        const sw = U.h(`<div class="swatches"></div>`);
        ACCENTS.forEach(c => {
            const b = U.h(
                `<button class="swatch ${c === s.accent ? 'on' : ''}" style="--c:${c}" title="${c}"></button>`
            );
            b.onclick = () => {
                Settings.patch(x => {
                    x.accent = c;
                });
                Theme.apply();
                this.draw();
            };
            sw.appendChild(b);
        });
        const custom = U.h(`<input type="color" value="${s.accent}">`);
        custom.onchange = () => {
            Settings.patch(x => {
                x.accent = custom.value;
            });
            Theme.apply();
            this.draw();
        };
        sw.appendChild(custom);
        base.appendChild(this.row('Акцентный цвет', '', sw));
        const rng = (min, max, step, val, fn) => {
            const r = U.h(`<input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`);
            r.oninput = U.debounce(() => {
                Settings.patch(x => fn(x.theme, +r.value));
                Theme.apply();
            }, 60);
            return r;
        };
        base.appendChild(
            this.row(
                'Затемнение фона',
                '',
                rng(0, 0.9, 0.05, t.dim, (x, v) => {
                    x.dim = v;
                })
            )
        );
        base.appendChild(
            this.row(
                'Прозрачность форума',
                'Насколько сквозь блоки и посты виден фон',
                rng(0.02, 0.7, 0.02, +(1 - t.glass).toFixed(2), (x, v) => {
                    x.glass = +(1 - v).toFixed(2);
                })
            )
        );
        base.appendChild(
            this.row(
                'Прозрачность меню',
                'Выпадающие меню форума и окна VERDICT',
                rng(0, 0.6, 0.02, +(1 - t.menuGlass).toFixed(2), (x, v) => {
                    x.menuGlass = +(1 - v).toFixed(2);
                })
            )
        );
        base.appendChild(
            this.row(
                'Размытие под блоками',
                'Красиво, но заметно тормозит прокрутку на слабых ПК. 0 — выключено',
                rng(0, 30, 1, t.blur, (x, v) => {
                    x.blur = v;
                })
            )
        );
        base.appendChild(
            this.row(
                'Плёночное зерно',
                '',
                this.sw(t.grain, v => {
                    Settings.patch(x => {
                        x.theme.grain = v;
                    });
                    Theme.apply();
                })
            )
        );
        const auto = Store.get('perfAuto', '');
        base.appendChild(
            this.row(
                'Производительность',
                t.perf === 'auto'
                    ? auto
                        ? `Авто: сейчас ${auto === 'fast' ? 'экономный' : 'качество'}`
                        : 'Авто: проверю плавность через пару секунд'
                    : t.perf === 'fast'
                      ? 'Без размытия, погода и живой фон легче'
                      : 'Полное размытие и эффекты, может тормозить на слабом ПК',
                this.select({ auto: 'Авто', quality: 'Качество', fast: 'Экономный' }, t.perf, v => {
                    Settings.patch(x => {
                        x.theme.perf = v;
                    });
                    if (v === 'auto') {
                        Perf.reset();
                        Perf.probe(() => {
                            Theme.lastKey = null;
                            Theme.apply();
                        });
                    }
                    Theme.lastKey = null;
                    Theme.apply();
                    this.draw();
                })
            )
        );
        base.appendChild(
            this.row(
                'Скорость живого фона',
                'Для «Рельефа», 0 = стоит',
                rng(0, 3, 0.25, t.liveSpeed, (x, v) => {
                    x.liveSpeed = v;
                })
            )
        );
        base.appendChild(
            this.row(
                'Смена фона',
                '',
                this.select(
                    { off: 'Не менять', visit: 'Новый при каждом заходе', hour: 'Новый каждый час' },
                    t.rotate,
                    v => {
                        Settings.patch(x => {
                            x.theme.rotate = v;
                        });
                        Theme.apply();
                    }
                )
            )
        );

        const lg = this.sec(pane, 'Логотип форума');
        const cur = Store.get('logo', null);
        const lrow = U.h(
            `<div class="btns" style="align-items:center">${cur ? `<img class="logo-prev" src="${cur.src}" alt="">` : '<span class="muted">Стандартный логотип Black Russia</span>'}</div>`
        );
        const up = U.h(`<button class="btn">${icon('upload', 14)}${cur ? 'Другое фото' : 'Своё фото'}</button>`);
        up.onclick = () => Logo.pick();
        lrow.appendChild(up);
        if (cur) {
            const back = U.h(`<button class="btn ghost">${icon('trash', 14)}Удалить фото</button>`);
            back.onclick = () => {
                Logo.reset();
                this.draw();
            };
            lrow.appendChild(back);
        }
        lg.appendChild(lrow);
        if (cur)
            lg.appendChild(
                this.row(
                    'Как поставить',
                    'Рядом — название проекта остаётся. «Стандартный» возвращает старый логотип, фото не удаляется',
                    this.select(
                        { beside: 'Рядом с логотипом', replace: 'Вместо логотипа', off: 'Стандартный логотип' },
                        cur.mode || 'beside',
                        v => {
                            Store.set('logo', Object.assign({}, Store.get('logo', {}), { mode: v }));
                            Logo.apply();
                        }
                    )
                )
            );
        this.fxSection(pane);
        const seeds = this._seeds || (this._seeds = {});
        const gen = this.sec(pane, 'Генеративные фоны');
        const grid = U.h(`<div class="walls"></div>`);
        gen.appendChild(grid);
        Object.entries(GENERATORS).forEach(([key, G], idx) => {
            const isCur = t.wall.kind === 'gen' && t.wall.gen === key;
            if (isCur) seeds[key] = t.wall.seed;
            const seed = seeds[key] || (seeds[key] = 1000 + idx * 137 + ((Math.random() * 9000) | 0));
            const card = U.h(
                `<div class="wall ${isCur ? 'on' : ''}" role="button"><div class="act"><button title="Другой вариант">${icon('dice', 14)}</button></div><div class="nm"><span>${G.name}</span><span class="muted">#${seed}</span></div></div>`
            );
            grid.appendChild(card);
            const paint = sd =>
                requestAnimationFrame(() => {
                    card.style.backgroundImage = `url(${Wallpaper.render(key, sd, 320, 180)})`;
                });
            paint(seed);
            card.onclick = e => {
                if (e.target.closest('.act')) {
                    const ns = (Math.random() * 100000) | 0;
                    seeds[key] = ns;
                    card.querySelector('.nm .muted').textContent = '#' + ns;
                    paint(ns);
                    if (card.classList.contains('on')) {
                        Settings.patch(x => {
                            x.theme.wall = { kind: 'gen', gen: key, seed: ns };
                        });
                        Theme.apply();
                    }
                    return;
                }
                Settings.patch(x => {
                    x.theme.wall = { kind: 'gen', gen: key, seed: seeds[key] || seed };
                    x.theme.rotate = 'off';
                });
                Theme.apply();
                this.draw();
            };
        });

        const ph = this.sec(pane, 'Свои фото');
        ph.appendChild(
            U.h(
                `<div class="muted" style="margin:-4px 0 10px;font-size:11.5px">Фото с компьютера хранятся только в твоём браузере и никуда не загружаются.</div>`
            )
        );
        const pg = U.h(`<div class="walls"></div>`);
        ph.appendChild(pg);
        const photos = Store.get('photos', []);
        photos.forEach(p => {
            const on = t.wall.kind === 'photo' && t.wall.id === p.id;
            const c = U.h(
                `<div class="wall ${on ? 'on' : ''}" role="button">${p.scene ? `<span class="tagc">${icon('spark', 10).replace('class="vi"', 'class="vi" style="display:inline;vertical-align:-1px"')} живой</span>` : ''}<div class="act"><button title="Удалить">${icon('trash', 13)}</button></div><div class="nm"><span>${U.esc(p.name || 'Фото')}</span></div></div>`
            );
            c.style.backgroundImage = `url("${p.src.replace(/"/g, '%22')}")`;
            c.onclick = e => {
                if (e.target.closest('.act')) {
                    Store.set(
                        'photos',
                        Store.get('photos', []).filter(x => x.id !== p.id)
                    );
                    if (on)
                        Settings.patch(x => {
                            x.theme.wall = DEFAULT_SETTINGS.theme.wall;
                        });
                    Theme.apply();
                    this.draw();
                    return;
                }
                Settings.patch(x => {
                    x.theme.wall = { kind: 'photo', id: p.id };
                    x.theme.rotate = 'off';
                });
                Theme.apply();
                this.draw();
            };
            pg.appendChild(c);
        });
        const addFile = U.h(
            `<div class="wall add" role="button"><span style="display:flex;flex-direction:column;align-items:center;gap:4px">${icon('upload', 18)}С компьютера</span></div>`
        );
        addFile.onclick = () => this.pickImage();
        const addUrl = U.h(
            `<div class="wall add" role="button"><span style="display:flex;flex-direction:column;align-items:center;gap:4px">${icon('plus', 18)}По ссылке</span></div>`
        );
        addUrl.onclick = () => {
            const url = prompt('Ссылка на картинку (https://…):');
            if (!url || !/^https:\/\//.test(url)) return;
            this.addPhoto(url, 'Фото по ссылке');
        };
        const addScene = U.h(
            `<div class="wall add" role="button" title="Файл .json с картинкой и анимацией"><span style="display:flex;flex-direction:column;align-items:center;gap:4px">${icon('spark', 18)}Живой фон</span></div>`
        );
        addScene.onclick = () =>
            this.upload(d => {
                if (!Scene.valid(d)) throw new Error('Это не файл живого фона VERDICT');
                const scene = Scene.clean(d);
                if (!scene.w || !scene.h) throw new Error('В файле нет размеров картинки');
                const id = 'p' + U.uid();
                // как и обычные фото: не больше 1920×1080 в JPEG, координаты сцены от размера не зависят
                this.shrinkImage(d.image).then(src => {
                    Store.set('photos', Store.get('photos', []).concat({ id, name: scene.name, src, scene }));
                    Settings.patch(x => {
                        x.theme.wall = { kind: 'photo', id };
                        x.theme.rotate = 'off';
                        x.theme.enabled = true;
                        if (scene.fx) x.theme.fx.effect = scene.fx;
                    });
                    Theme.apply();
                    this.draw();
                    toast(`Живой фон «${scene.name}»`);
                });
            });
        pg.appendChild(addFile);
        pg.appendChild(addUrl);
        pg.appendChild(addScene);
    },
    shrinkImage(src) {
        return new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, 1920 / img.width, 1080 / img.height);
                const cv = document.createElement('canvas');
                cv.width = Math.round(img.width * k);
                cv.height = Math.round(img.height * k);
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                res(cv.toDataURL('image/jpeg', 0.86));
            };
            img.onerror = () => res(src);
            img.src = src;
        });
    },
    pickImage() {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = () => {
            const f = inp.files[0];
            if (!f) return;
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, 1920 / img.width, 1080 / img.height);
                const cv = document.createElement('canvas');
                cv.width = Math.round(img.width * k);
                cv.height = Math.round(img.height * k);
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(img.src);
                this.addPhoto(cv.toDataURL('image/jpeg', 0.86), f.name.replace(/\.[^.]+$/, '').slice(0, 24));
            };
            img.onerror = () => toast('Не удалось открыть картинку', 'err');
            img.src = URL.createObjectURL(f);
        };
        inp.click();
    },
    addPhoto(src, name) {
        const photos = Store.get('photos', []);
        const p = { id: U.uid(), src, name };
        photos.push(p);
        Store.set('photos', photos);
        Settings.patch(x => {
            x.theme.wall = { kind: 'photo', id: p.id };
            x.theme.rotate = 'off';
        });
        Theme.apply();
        this.draw();
        toast('Фон добавлен');
    },

    /* Автограф */
    tab_autograph(pane) {
        const a = Settings.get().autograph;
        pane.appendChild(
            U.h(
                `<div class="muted" style="margin:-6px 0 14px;font-size:12px">Кнопка появляется на странице профиля над полем «Написать на стене». Пример ниже — для игрока Nick_Name.</div>`
            )
        );
        const grid = U.h('<div class="split" style="margin-bottom:18px"></div>');
        Object.entries(AUTOGRAPH_STYLES).forEach(([id, st]) => {
            const card = U.h(`<div class="role-card ${id === a.style ? 'on' : ''}" role="button" style="display:block">
                <b style="margin-bottom:8px">${st.name}</b>
                <div class="xf-body" style="font-size:13px;padding:10px 12px">${BB.render(Autograph.build(id, 'Nick_Name'))}</div></div>`);
            card.onclick = () => {
                Settings.patch(x => (x.autograph.style = id));
                this.draw();
            };
            grid.appendChild(card);
        });
        pane.appendChild(grid);
        const sec = this.sec(pane, 'Свой текст');
        const ta = U.h('<textarea class="inp" placeholder="BBCode и переменные"></textarea>');
        ta.value = a.custom || AUTOGRAPH_STYLES.classic.text;
        const vars = U.h(
            `<div class="vars">${['nick', 'admin', 'role', 'date', 'acc', 'acc2'].map(v => `<button data-var="${v}">{${v}}</button>`).join('')}</div>`
        );
        const prev = U.h('<div class="xf-body" style="margin-top:10px"></div>');
        const save = U.debounce(() => {
            Settings.patch(x => (x.autograph.custom = ta.value));
            prev.innerHTML = BB.render(Autograph.build('custom', 'Nick_Name'));
        }, 250);
        ta.oninput = save;
        vars.querySelectorAll('[data-var]').forEach(b => {
            b.onclick = () => {
                const at = ta.selectionStart;
                const ins = `{${b.dataset.var}}`;
                ta.value = ta.value.slice(0, at) + ins + ta.value.slice(ta.selectionEnd);
                ta.focus();
                ta.setSelectionRange(at + ins.length, at + ins.length);
                save();
            };
        });
        prev.innerHTML = BB.render(Autograph.build('custom', 'Nick_Name'));
        const hint = U.h(
            `<div class="muted" style="margin:-4px 0 8px;font-size:11.5px">Выдели часть текста — появится меню: цвет, жирный, курсив, размер.</div>`
        );
        const field = U.h('<div class="bbp-field"></div>');
        field.appendChild(ta);
        sec.append(hint, field, vars, prev);
        BBPop.attach(ta);
    },

    /* Статусы */
    tab_status(pane) {
        const s = Settings.get();
        const g = this.card(pane, 'Поведение');
        g.appendChild(
            this.row(
                'Менять статус темы после ответа',
                'Префикс, закрытие и закреп по вердикту',
                this.sw(s.status.apply, v =>
                    Settings.patch(x => {
                        x.status.apply = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Спрашивать перед мгновенной отправкой',
                'Кнопка ⚡ и Shift+клик',
                this.sw(s.status.confirmInstant, v =>
                    Settings.patch(x => {
                        x.status.confirmInstant = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Умные подсказки',
                'Анализ темы: нет доказательств, не по форме, тайм-коды…',
                this.sw(s.hints, v =>
                    Settings.patch(x => {
                        x.hints = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Шорткоды «/ключ» в поле ввода',
                'Напиши /нд и нажми Tab',
                this.sw(s.shortcodes, v =>
                    Settings.patch(x => {
                        x.shortcodes = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Горячие клавиши',
                'Ctrl+K — поиск ответа, Alt+V — настройки',
                this.sw(s.hotkeys, v =>
                    Settings.patch(x => {
                        x.hotkeys = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Кнопка VERDICT в углу',
                '',
                this.sw(s.launcher, v => {
                    Settings.patch(x => {
                        x.launcher = v;
                    });
                    Launcher.sync();
                })
            )
        );
        g.appendChild(
            this.row(
                'Проверять права',
                'Прятать панель в темах, где у тебя нет прав модератора',
                this.sw(s.permCheck, v =>
                    Settings.patch(x => {
                        x.permCheck = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Ники копируются по клику',
                'Ники вида Имя_Фамилия в постах и заголовке подсвечены, клик копирует ник',
                this.sw(s.nickCopy, v =>
                    Settings.patch(x => {
                        x.nickCopy = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Без предупреждения о внешних ссылках',
                'Страница «Пожалуйста, будьте осторожны!» с отсчётом 30 секунд пропускается — сразу открывается сайт',
                this.sw(s.skipLeave, v =>
                    Settings.patch(x => {
                        x.skipLeave = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Быстрый просмотр фото',
                'Ссылка на картинку (Imgur, prnt.sc, ibb.co, прямые .png/.jpg…) открывается в окне: колесо — масштаб, ← → — листать. Ctrl+клик — как раньше',
                this.sw(s.imgPreview, v =>
                    Settings.patch(x => {
                        x.imgPreview = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Сколько прошло с создания темы',
                'Метка рядом с датой: зелёная до 12 ч, жёлтая до 2 дней, потом красная. Закрытые темы без метки',
                this.sw(s.threadAge, v =>
                    Settings.patch(x => {
                        x.threadAge = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Списки ответов',
                'Когда раскрывать причины под кнопками вердиктов',
                this.select({ hover: 'При наведении', click: 'Только по нажатию' }, s.openOn, v =>
                    Settings.patch(x => {
                        x.openOn = v;
                    })
                )
            )
        );
        g.appendChild(
            this.row(
                'Панель ответов',
                'Встроенная выглядит как часть редактора',
                this.select({ docked: 'Встроенная в редактор', card: 'Отдельной карточкой' }, s.barStyle, v =>
                    Settings.patch(x => {
                        x.barStyle = v;
                    })
                )
            )
        );
        const m = this.card(pane, 'Префиксы форума');
        m.appendChild(
            U.h(
                `<div class="muted" style="padding:10px 0 4px;font-size:11.5px">ID префиксов берутся из адреса фильтра «prefix_id=…». Меняй, только если на твоём форуме они другие.</div>`
            )
        );
        Object.entries(s.status.map).forEach(([v, cfg]) => {
            const ctl =
                U.h(`<div class="btns" style="align-items:center"><input class="inp" type="number" min="0" style="width:72px" value="${cfg.prefix}" title="prefix_id">
                <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-k="open" ${cfg.open ? 'checked' : ''}>открыта</label>
                <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-k="sticky" ${cfg.sticky ? 'checked' : ''}>закреп</label></div>`);
            ctl.querySelector('input[type=number]').onchange = e =>
                Settings.patch(x => {
                    x.status.map[v].prefix = +e.target.value;
                });
            ctl.querySelectorAll('[data-k]').forEach(
                c =>
                    (c.onchange = () =>
                        Settings.patch(x => {
                            x.status.map[v][c.dataset.k] = c.checked;
                        }))
            );
            m.appendChild(this.row(`<span style="color:${VERDICTS[v].color}">●</span> ${VERDICTS[v].label}`, '', ctl));
        });
        const all = this.sec(pane, 'Все настройки');
        const btns = U.h(`<div class="btns"></div>`);
        const ex = U.h(`<button class="btn">${icon('download', 14)}Экспорт настроек</button>`);
        ex.onclick = () =>
            this.download(`verdict-settings-${Date.now()}.json`, {
                verdict: BRAND.build,
                type: 'settings',
                settings: Settings.get()
            });
        const im = U.h(`<button class="btn">${icon('upload', 14)}Импорт</button>`);
        im.onclick = () =>
            this.upload(d => {
                if (!d || d.type !== 'settings') throw new Error('Это не файл настроек VERDICT');
                if (!d.settings || typeof d.settings !== 'object') throw new Error('В файле нет настроек');
                Settings._v = Settings.clean(deepMerge(DEFAULT_SETTINGS, d.settings));
                Settings.save();
                Theme.apply();
                Launcher.sync();
                this.draw();
                toast('Настройки применены');
            });
        btns.append(ex, im);
        all.appendChild(btns);
    },

    /* О скрипте */
    tab_about(pane) {
        const ok = Integrity.ok();
        pane.appendChild(
            U.h(`<div class="about">
            <div class="row"><div class="lbl"><b>VERDICT</b> v${BRAND.version}<small>Сборка ${BRAND.build}</small></div>${ok ? `<span class="tag" style="color:#2fbf71">${icon('shield', 12).replace('class="vi"', 'class="vi" style="display:inline;vertical-align:-2px"')} оригинал</span>` : `<span class="badge-warn">Неофициальная копия</span>`}</div>
            <div><b>Приватность.</b> Настройки и шаблоны хранятся только в менеджере скриптов. Раз в день скрипт анонимно отмечается у разработчика (id установки, версия, должность, браузер, без ника), чтобы он видел, сколько людей пользуется VERDICT. Это можно выключить ниже. Ещё скрипт обращается к спеллеру Яндекса (по кнопке), к Unsplash за фото тем и к почте разработчика, когда ты сам отправляешь обращение.</div>
            <div><b>Как пользоваться.</b> Наведи или нажми на вердикт над полем ввода, откроется список ответов. Клик вставляет текст, ⚡ или Shift+клик сразу отправляет ответ и меняет статус. В поле работает «/ключ» + Tab, Ctrl+K открывает поиск.</div>
            <div><b>Подсказки.</b> Скрипт читает первое сообщение темы и поднимает наверх подходящие ответы: нет ссылок, не по форме, только скриншоты, старая дата, слова вроде «убил» или «оскорбил». Звёздочка значит «почти точно». Решаешь всё равно ты.</div>
            <div><b>Фото в темах.</b> Unsplash, бесплатная лицензия. Авторы: ${[...new Set(THEME_PRESETS.filter(p => p.author && p.author !== 'Unsplash').map(p => p.author))].map(U.esc).join(', ')}. Генеративные фоны, молнии и погода нарисованы кодом VERDICT.</div>
            <div class="muted">© VERDICT. Все права защищены. Копирование, переиздание и выдача за своё запрещены.</div>
        </div>`)
        );
        const upd = this.card(pane, 'Обновления');
        const latest = Updater.available();
        const ubtn = U.h(
            `<button class="btn ${latest ? 'pri' : ''}">${icon(latest ? 'download' : 'spark', 14)}${latest ? `Обновить до ${latest}` : 'Проверить'}</button>`
        );
        ubtn.onclick = async () => {
            if (Updater.available()) return Updater.install();
            ubtn.disabled = true;
            const v = await Updater.check(true);
            ubtn.disabled = false;
            if (!v) toast('Не удалось проверить обновления', 'err');
            else if (!Updater.available()) toast(`У тебя последняя версия ${BRAND.version}`);
            this.draw();
        };
        upd.appendChild(
            this.row(
                `Версия ${BRAND.version}`,
                latest
                    ? `Доступна версия ${latest}`
                    : 'Tampermonkey проверяет обновления сам, а скрипт напомнит, когда выйдет новая версия',
                ubtn
            )
        );
        const card = this.card(pane, 'Статистика');
        card.appendChild(
            this.row(
                'Отмечаться у разработчика',
                'Раз в день: id установки, версия, должность, браузер. Без ника и текстов',
                this.sw(Settings.get().stats, v =>
                    Settings.patch(x => {
                        x.stats = v;
                    })
                )
            )
        );
    },

    download(name, data) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    upload(cb) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json,.json';
        inp.onchange = () => {
            const f = inp.files[0];
            if (!f) return;
            f.text().then(t => {
                try {
                    cb(JSON.parse(t));
                } catch (e) {
                    toast(e.message, 'err');
                }
            });
        };
        inp.click();
    }
};

// вкладка «Навигация»: ссылки быстрой навигации
Object.assign(SettingsUI, {
    // спросить название и сохранить группу; вернуть название или ''
    newGroup() {
        const name = (prompt('Название группы, например: Жалобы КФ') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
        if (!name || name === '__new') return '';
        Settings.patch(x => {
            x.qnav.groups = x.qnav.groups || [];
            if (!QNav.groups().includes(name)) x.qnav.groups.push(name);
        });
        return name;
    },
    tab_qnav(pane) {
        const cfg = Settings.get().qnav;
        const save = fn => {
            Settings.patch(x => fn(x.qnav));
            this.draw();
        };
        const top = this.card(pane, 'Быстрая навигация');
        top.appendChild(
            this.row(
                'Показывать в шапке форума',
                'Кнопки разделов рядом с «Пользователи». Похожие собираются в выпадающие группы',
                this.sw(cfg.on, v => save(q => (q.on = v)))
            )
        );
        const places = Object.entries(QNav.PLACES)
            .filter(([k]) => k !== 'sub' || document.querySelector('.p-sectionLinks-inner'))
            .map(([k]) => k);
        top.appendChild(
            this.row(
                'Где показывать',
                places.length < 3
                    ? 'Строки под меню на этой странице нет — кнопки встанут в главное меню'
                    : 'Закреплённая панель всегда видна сверху при прокрутке. У модераторов закрепляется их верхняя панель',
                this.select(QNav.PLACES, cfg.place, v => save(q => (q.place = v)))
            )
        );
        top.appendChild(
            this.row(
                'Счётчики тем',
                'Сколько открытых тем ждёт ответа в разделе. Обновляется раз в 5 минут',
                this.sw(cfg.counts, v => {
                    save(q => (q.counts = v));
                    if (v) QNav.refreshCounts();
                })
            )
        );

        // текущий раздел форума одной кнопкой
        const here = QNav.here();
        if (here && !cfg.items.some(i => i.url && QNav.path(i.url) === QNav.path(here.url))) {
            const h = this.card(pane, 'Этот раздел');
            const box = U.h(`<div class="btns" style="align-items:center;padding:10px 0">
                <input class="inp" style="flex:1;min-width:160px" maxlength="40">
                <select class="inp" style="width:auto">${['', ...QNav.groups()].map(g => `<option value="${U.esc(g)}">${g ? 'Группа: ' + U.esc(g) : 'Без группы'}</option>`).join('')}</select>
                <button class="btn pri">${icon('plus', 14)}Добавить</button></div>`);
            const [name, group] = box.querySelectorAll('.inp');
            name.value = here.name;
            group.value = /жалоб/i.test(here.name)
                ? 'Жалобы'
                : /обжал/i.test(here.name)
                  ? 'Обжалования'
                  : /заявк/i.test(here.name)
                    ? 'Заявки'
                    : '';
            box.querySelector('.btn').onclick = () => {
                if (!name.value.trim()) return;
                QNav.add(name.value.trim(), here.url, group.value);
                this.draw();
                toast('Раздел добавлен в навигацию');
            };
            h.appendChild(box);
        }

        const list = this.sec(pane, 'Ссылки');
        list.appendChild(
            U.h(
                `<div class="muted" style="margin:-4px 0 10px;font-size:11.5px">Проще всего открыть нужный раздел своего сервера и нажать «+ этот раздел» в шапке. Ссылку можно и вставить вручную.</div>`
            )
        );
        const box = U.h(`<div class="card qn-list"></div>`);
        list.appendChild(box);
        cfg.items.forEach((it, idx) => {
            const ok = QNav.safe(it.url) && it.url;
            const row = U.h(`<div class="qn-row">
                <input class="inp" data-f="name" maxlength="40" placeholder="Название">
                <input class="inp${ok ? '' : ' bad'}" data-f="url" placeholder="https://forum.blackrussia.online/forums/…">
                <select class="inp" data-f="group">${['', ...QNav.groups()].map(g => `<option value="${U.esc(g)}">${U.esc(g) || 'Без группы'}</option>`).join('')}<option value="__new">＋ Новая группа…</option></select>
                <span class="qn-act"><button class="icon-btn" data-a="up" title="Выше">↑</button><button class="icon-btn" data-a="down" title="Ниже">↓</button><button class="icon-btn" data-a="del" title="Удалить">${icon('trash', 14)}</button></span>
            </div>`);
            const f = n => row.querySelector(`[data-f="${n}"]`);
            f('name').value = it.name;
            f('url').value = it.url || '';
            f('group').value = it.group || '';
            const upd = (k, v) =>
                Settings.patch(x => {
                    const t = x.qnav.items.find(i => i.id === it.id);
                    if (t) t[k] = v;
                });
            f('name').onchange = () => upd('name', f('name').value.trim());
            f('url').onchange = () => {
                const v = f('url').value.trim();
                if (v && !QNav.safe(v)) {
                    toast('Нужна ссылка на этот форум', 'err');
                    f('url').classList.add('bad');
                    return;
                }
                f('url').classList.toggle('bad', !v);
                upd('url', v);
            };
            f('group').onchange = () => {
                if (f('group').value !== '__new') return upd('group', f('group').value);
                const name = this.newGroup();
                if (name) save(q => (q.items.find(i => i.id === it.id).group = name));
                else f('group').value = it.group || '';
            };
            const move = d =>
                save(q => {
                    const j = idx + d;
                    if (j < 0 || j >= q.items.length) return;
                    [q.items[idx], q.items[j]] = [q.items[j], q.items[idx]];
                });
            row.querySelector('[data-a="up"]').onclick = () => move(-1);
            row.querySelector('[data-a="down"]').onclick = () => move(1);
            row.querySelector('[data-a="del"]').onclick = () =>
                save(q => (q.items = q.items.filter(i => i.id !== it.id)));
            box.appendChild(row);
        });
        if (!cfg.items.length)
            box.appendChild(
                U.h(
                    `<div class="muted" style="padding:14px 0">Пока пусто. Добавь заготовки ниже или свою ссылку.</div>`
                )
            );

        const btns = U.h(`<div class="btns" style="margin-top:10px"></div>`);
        const own = U.h(`<button class="btn">${icon('plus', 14)}Своя ссылка</button>`);
        own.onclick = () => save(q => q.items.push({ id: 'q' + U.uid(), name: 'Новая ссылка', url: '', group: '' }));
        btns.appendChild(own);
        list.appendChild(btns);

        // свои группы: «Жалобы КФ», «Мой сервер» — в шапке станут отдельными выпадающими кнопками
        const gs = this.sec(pane, 'Свои группы');
        gs.appendChild(
            U.h(
                `<div class="muted" style="margin:-4px 0 10px;font-size:11.5px">Ссылки с одной группой собираются в одну кнопку со списком. Группу ссылке выбирают в её строке выше.</div>`
            )
        );
        const gchips = U.h(`<div class="chips"></div>`);
        (cfg.groups || []).forEach(g => {
            const n = cfg.items.filter(i => i.group === g).length;
            const c = U.h(
                `<span class="pill on">${U.esc(g)}${n ? ` · ${n}` : ''}<button class="icon-btn" title="Удалить группу (ссылки останутся без группы)" style="width:20px;height:20px;margin-left:4px">${icon('x', 11)}</button></span>`
            );
            c.querySelector('button').onclick = () =>
                save(q => {
                    q.groups = q.groups.filter(x => x !== g);
                    q.items.forEach(i => {
                        if (i.group === g) i.group = '';
                    });
                });
            gchips.appendChild(c);
        });
        const addG = U.h(`<button class="pill">${icon('plus', 12)}Новая группа</button>`);
        addG.onclick = () => this.newGroup() && this.draw();
        gchips.appendChild(addG);
        gs.appendChild(gchips);

        const left = QNAV_PRESETS.filter(([n]) => !cfg.items.some(i => i.name === n));
        if (left.length) {
            const pre = this.sec(pane, 'Заготовки');
            pre.appendChild(
                U.h(
                    `<div class="muted" style="margin:-4px 0 10px;font-size:11.5px">Нажми, чтобы добавить, затем вставь ссылку на раздел своего сервера.</div>`
                )
            );
            const chips = U.h(`<div class="chips"></div>`);
            left.forEach(([n, g]) => {
                const c = U.h(`<button class="pill">${icon('plus', 12)}${U.esc(n)}</button>`);
                c.onclick = () => save(q => q.items.push({ id: 'q' + U.uid(), name: n, url: '', group: g }));
                chips.appendChild(c);
            });
            pre.appendChild(chips);
        }
    }
});

// связь с разработчиком
// обращения уходят на почту разработчика (BRAND.dev.mail), ответы приходят туда же
const FEEDBACK_KINDS = [
    { id: 'idea', label: 'Идея', icon: 'bulb', color: '#ffd166' },
    { id: 'bug', label: 'Ошибка', icon: 'x', color: '#e5484d' },
    { id: 'tpl', label: 'Шаблоны', icon: 'pen', color: '#2fbf71' },
    { id: 'theme', label: 'Тема или фон', icon: 'image', color: '#a970ff' },
    { id: 'other', label: 'Другое', icon: 'chat', color: '#3aa0ff' }
];

// почта разработчика: Google Apps Script (server/verdict-mail.gs), на форуме ничего не видно
const Mail = {
    url() {
        return BRAND.dev.mail || '';
    },
    // случайный id установки: по нему пользователь получает ответы на свои обращения
    uid() {
        let u = Store.get('fbUid', '');
        if (!/^[a-z0-9]{32}$/.test(u)) {
            const b = new Uint8Array(16);
            crypto.getRandomValues(b);
            u = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
            Store.set('fbUid', u);
        }
        return u;
    },
    call(body) {
        return new Promise((res, rej) => {
            if (!this.url()) return rej(new Error('Почта разработчика не настроена'));
            if (typeof GM_xmlhttpRequest !== 'function')
                return rej(new Error('Менеджер скриптов не даёт отправлять запросы'));
            GM_xmlhttpRequest({
                method: 'POST',
                url: this.url(),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                data: JSON.stringify(body),
                timeout: 30000,
                onload: r => {
                    let j = null;
                    try {
                        j = JSON.parse(r.responseText);
                    } catch {
                        /* не JSON */
                    }
                    if (!j) return rej(new Error('Почта не ответила'));
                    if (j.error) return rej(new Error(j.error));
                    res(j);
                },
                onerror: () => rej(new Error('Нет связи с почтой')),
                ontimeout: () => rej(new Error('Почта долго не отвечает'))
            });
        });
    }
};

// раз в день отметка «скрипт запущен»: id установки, версия, должность и браузер, без ника и текстов
const Stats = {
    ping() {
        if (!Settings.get().stats || !Mail.url()) return;
        const today = new Date().toISOString().slice(0, 10);
        // раз в день и сразу после обновления, чтобы в таблице была свежая версия
        if (Store.get('pingDay', '') === today && Store.get('pingV', '') === BRAND.version) return;
        Store.set('pingDay', today);
        Store.set('pingV', BRAND.version);
        const ua = navigator.userAgent;
        Mail.call({
            action: 'ping',
            uid: Mail.uid(),
            v: BRAND.version,
            role: Access.title() || 'не выбрана',
            br: ((ua.match(/(Edg|OPR|YaBrowser|Firefox|Chrome|Safari)\/\d+/) || ['?'])[0] || '?').replace('/', ' ')
        }).catch(() => Store.set('pingDay', ''));
    }
};

const Feedback = {
    configured() {
        return !!Mail.url();
    },
    diag() {
        const ua = navigator.userAgent;
        const browser = (ua.match(/(Edg|OPR|YaBrowser|Firefox|Chrome|Safari)\/[\d.]+/) || ['?'])[0];
        const mgr = typeof GM_info !== 'undefined' ? `${GM_info.scriptHandler || '?'} ${GM_info.version || ''}` : '?';
        return `VERDICT ${BRAND.version} (${BRAND.build}) · ${browser} · ${mgr} · ${innerWidth}×${innerHeight} · раздел: ${Page.crumbs().slice(-80) || '—'}`;
    },
    // шаблоны уходят данными: разработчик видит «было/стало» и забирает JSON для импорта
    templates(tpls) {
        return tpls.map(({ item, pack }) => {
            const d = Packs.defaultOf(pack, item);
            const edited = !!d && Packs.isEdited(pack, item);
            return {
                pack: { id: pack.id, name: pack.name, match: pack.match || '', kind: pack.kind || 'any' },
                item: {
                    title: item.title,
                    verdict: item.verdict,
                    text: item.text,
                    key: item.key || '',
                    tail: item.tail
                },
                before: edited ? d.text : null
            };
        });
    },
    async send(kind, title, text, opts = {}) {
        const tpls = opts.tpls && opts.tpls.length ? this.templates(opts.tpls) : null;
        const res = await Mail.call({
            action: 'send',
            uid: Mail.uid(),
            nick: Page.me(),
            kind,
            title: title.trim().slice(0, 100),
            text: text.trim(),
            tpls,
            diag: opts.diag ? this.diag() : ''
        });
        const hist = Store.get('fbHistory', []);
        hist.unshift({ id: res.id, at: Date.now(), kind, title: title.trim() });
        Store.set('fbHistory', hist.slice(0, 30));
        return res;
    },
    // ответы разработчика: раз в пару часов и при открытии вкладки «Связь»
    async check(force) {
        if (!this.configured() || !Store.get('fbHistory', []).length) return null;
        if (!force && Date.now() - Store.get('fbChecked', 0) < 2 * 3600e3) return null;
        Store.set('fbChecked', Date.now());
        const res = await Mail.call({ action: 'mine', uid: Mail.uid() });
        Store.set('fbMail', res.items || []);
        return res.items || [];
    },
    unseen() {
        const seen = new Set(Store.get('fbSeen', []));
        return Store.get('fbMail', []).flatMap(m =>
            (m.replies || []).filter(r => !seen.has(r.id)).map(r => ({ m, r }))
        );
    },
    markSeen() {
        const ids = Store.get('fbMail', []).flatMap(m => (m.replies || []).map(r => r.id));
        Store.set('fbSeen', ids.slice(-300));
    },
    async notify() {
        try {
            await this.check(false);
        } catch {
            return;
        }
        const fresh = this.unseen();
        if (fresh.length)
            toast(`Разработчик ответил: «${fresh[0].m.title}»`, 'info', {
                label: 'Открыть',
                run: () => SettingsUI.open('contact')
            });
    }
};

Object.assign(SettingsUI, {
    // обновление скрипта: последняя рассылка разработчика и кнопка «Обновить»
    updCard(pane) {
        const box = U.h(`<div class="card upd-card" style="padding:14px;margin-bottom:18px"></div>`);
        pane.appendChild(box);
        const draw = () => {
            const v = Updater.available();
            const n = Store.get('newsLast', null);
            const note =
                n && v && n.v === v && n.note ? `<div class="muted" style="margin-top:4px">${U.esc(n.note)}</div>` : '';
            box.classList.toggle('on', !!v);
            box.innerHTML = v
                ? `<div class="btns" style="align-items:center"><span class="vic" style="--c:var(--acc)">${icon('download', 14)}</span><div style="flex:1;min-width:160px"><b>Вышла новая версия ${U.esc(v)}</b><div class="muted" style="font-size:12px">У тебя ${U.esc(BRAND.version)}</div>${note}</div><button class="btn pri" data-a="upd">${icon('download', 14)}Обновить</button></div>`
                : `<div class="btns" style="align-items:center"><span class="vic" style="--c:#2fbf71">${icon('check', 14)}</span><div style="flex:1"><b>У тебя последняя версия ${U.esc(BRAND.version)}</b>${n && n.note && n.v === BRAND.version ? `<div class="muted" style="font-size:12px;margin-top:2px">Что нового: ${U.esc(n.note)}</div>` : ''}</div><button class="btn ghost" data-a="chk">Проверить</button></div>`;
            const u = box.querySelector('[data-a="upd"]');
            if (u) u.onclick = () => Updater.install();
            const c = box.querySelector('[data-a="chk"]');
            if (c)
                c.onclick = async () => {
                    c.disabled = true;
                    c.textContent = 'Проверяю…';
                    await Promise.all([Updater.news(true), Updater.check(true)]);
                    draw();
                    const err = Store.get('newsErr', '');
                    if (err)
                        toast(
                            err.includes('Неизвестное')
                                ? 'Почта разработчика ещё не обновлена, рассылка не работает'
                                : 'Почта не ответила: ' + err,
                            'err'
                        );
                    else if (!Updater.available()) toast('Обновлений нет');
                };
        };
        draw();
        // при открытии вкладки спрашиваем сразу, не дожидаясь плановой проверки
        Promise.all([Updater.news(true), Updater.check(false)]).then(() => box.isConnected && draw());
    },
    tab_contact(pane) {
        const dev = BRAND.dev;
        pane.appendChild(
            U.h(`<div class="hero"><span class="big">${icon('chat', 22)}</span><div><b>Написать разработчику</b>
            <p>Идея, ошибка, свой шаблон или фон. Сообщение уходит разработчику напрямую, на форуме его никто не увидит. Ответ появится здесь.</p></div></div>`)
        );
        this.updCard(pane);
        if (!this.fb) this.fb = { kind: 'idea', title: '', text: '', diag: true, tpl: '' };
        const fb = this.fb;

        if (!Feedback.configured()) {
            pane.appendChild(
                U.h(`<div class="card" style="padding:14px;margin-bottom:18px"><span class="badge-warn">${icon('shield', 12)}Почта разработчика ещё не настроена</span>
                <div class="muted" style="margin-top:8px;font-size:12px">Отправка заработает, когда в коде будет адрес почты <span class="tag">BRAND.dev.mail</span>. ${dev.telegram || dev.vk ? 'Пока можно написать по ссылкам ниже.' : ''}</div></div>`)
            );
        }

        const form = this.sec(pane, 'Обращение');
        const kinds = U.h(`<div class="chips" style="margin-bottom:12px"></div>`);
        FEEDBACK_KINDS.forEach(k => {
            const b = U.h(
                `<button class="pill ${fb.kind === k.id ? 'on' : ''}" style="--c:${k.color}"><span class="vic sm" style="--c:${k.color}">${icon(k.icon, 11)}</span>${k.label}</button>`
            );
            b.onclick = () => {
                fb.kind = k.id;
                this.draw();
            };
            kinds.appendChild(b);
        });
        form.appendChild(kinds);
        const ttl = U.h(
            `<label class="field"><span>Коротко о чём</span><input class="inp" maxlength="70" placeholder="${fb.kind === 'bug' ? 'Например: не меняется статус в жалобах на лидеров' : 'Например: добавить ответы для раздела «Обжалования ЧС»'}"></label>`
        );
        const inp = ttl.querySelector('input');
        inp.value = fb.title;
        inp.oninput = () => {
            fb.title = inp.value;
            check();
        };
        form.appendChild(ttl);
        const body = U.h(
            `<label class="field"><span>${fb.kind === 'bug' ? 'Что делал, что ожидал, что произошло' : 'Подробности'}</span><textarea class="inp" maxlength="3000"></textarea></label>`
        );
        const ta = body.querySelector('textarea');
        ta.value = fb.text;
        ta.oninput = () => {
            fb.text = ta.value;
            check();
        };
        form.appendChild(body);

        if (fb.kind === 'tpl') {
            const opts = { '': '— не прикладывать —' };
            Packs.all().forEach(p =>
                p.items.forEach(i => {
                    opts[i.id] = `${p.name} › ${i.title}`;
                })
            );
            const sel = this.select(opts, fb.tpl, v => {
                fb.tpl = v;
            });
            sel.style.width = '100%';
            const f = U.h(`<label class="field"><span>Приложить свой шаблон</span></label>`);
            f.appendChild(sel);
            form.appendChild(f);
        }
        const dg = U.h(`<div class="card" style="margin-bottom:14px"></div>`);
        dg.appendChild(
            this.row(
                'Приложить техданные',
                U.esc(Feedback.diag()),
                this.sw(fb.diag, v => {
                    fb.diag = v;
                })
            )
        );
        form.appendChild(dg);

        const btns = U.h(`<div class="btns"></div>`);
        const send = U.h(`<button class="btn pri">${icon('send', 14)}Отправить разработчику</button>`);
        const check = () => {
            send.disabled = !Feedback.configured() || fb.title.trim().length < 3 || fb.text.trim().length < 5;
        };
        check();
        send.onclick = async () => {
            send.disabled = true;
            try {
                const found = fb.tpl ? Packs.item(fb.tpl) : null;
                await Feedback.send(fb.kind, fb.title, fb.text, { diag: fb.diag, tpls: found ? [found] : [] });
                this.fb = null;
                toast('Отправлено, ответ появится во вкладке «Связь»');
                this.draw();
            } catch (e) {
                toast('Не отправилось: ' + e.message, 'err');
                check();
            }
        };
        btns.appendChild(send);
        if (dev.telegram) {
            const a = U.h(
                `<a class="btn" target="_blank" rel="noopener" href="https://t.me/${encodeURIComponent(dev.telegram.replace(/^@/, ''))}">${icon('send', 14)}Telegram</a>`
            );
            a.style.textDecoration = 'none';
            btns.appendChild(a);
        }
        if (dev.vk) {
            const a = U.h(
                `<a class="btn" target="_blank" rel="noopener" href="${/^https:\/\//.test(dev.vk) ? U.esc(dev.vk) : 'https://vk.com/' + encodeURIComponent(dev.vk)}">${icon('users', 14)}ВКонтакте</a>`
            );
            a.style.textDecoration = 'none';
            btns.appendChild(a);
        }
        form.appendChild(btns);

        const hist = Store.get('fbHistory', []);
        if (hist.length) {
            const h = this.card(pane, 'Мои обращения');
            const mail = new Map(Store.get('fbMail', []).map(m => [m.id, m]));
            const seen = new Set(Store.get('fbSeen', []));
            const STATE = { new: 'отправлено', work: 'в работе', done: 'готово' };
            hist.forEach(x => {
                const k = FEEDBACK_KINDS.find(z => z.id === x.kind) || FEEDBACK_KINDS[0];
                const m = mail.get(x.id);
                const replies = (m && m.replies) || [];
                h.appendChild(
                    U.h(
                        `<div class="hist"><span class="vic sm" style="--c:${k.color}">${icon(k.icon, 11)}</span><span style="flex:1;min-width:0">${U.esc(x.title)}<small class="muted" style="display:block">${new Date(x.at).toLocaleString('ru-RU')}</small></span>${m ? `<span class="tag">${STATE[m.state] || 'отправлено'}</span>` : ''}</div>`
                    )
                );
                replies.forEach(r =>
                    h.appendChild(
                        U.h(
                            `<div class="reply ${seen.has(r.id) ? '' : 'fresh'}"><b>Ответ разработчика</b> <small class="muted">${new Date(r.at).toLocaleString('ru-RU')}</small><div>${U.esc(r.text).replace(/\n/g, '<br>')}</div></div>`
                        )
                    )
                );
            });
            Feedback.markSeen();
            // подтягиваем свежие ответы и перерисовываем, если что-то изменилось
            if (!this._mailFetched) {
                this._mailFetched = true;
                const before = JSON.stringify(Store.get('fbMail', []));
                Feedback.check(true)
                    .then(items => {
                        if (items && JSON.stringify(items) !== before && this.tab === 'contact') this.draw();
                    })
                    .catch(() => {})
                    .finally(() => setTimeout(() => (this._mailFetched = false), 30000));
            }
        }
    }
});

// отправка своих шаблонов разработчику
const ShareTemplates = {
    open() {
        const rows = [];
        Packs.all().forEach(pack =>
            pack.items.forEach(item =>
                rows.push({ pack, item, mine: Packs.isMine(pack, item), edited: Packs.isEdited(pack, item) })
            )
        );
        const mineCount = rows.filter(r => r.mine).length;
        const scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal sm">
            <div class="m-head"><span class="vic" style="--c:var(--acc);width:34px;height:34px;border-radius:10px">${icon('send', 16)}</span>
              <div><div class="m-title">Отправить свои ответы</div><div class="m-sub">Свои ответы и правки стандартных уйдут разработчику. Лучшие формулировки попадут в стандартный набор у всех</div></div>
              <span style="flex:1"></span><button class="icon-btn" data-a="x">${icon('x')}</button></div>
            <div class="pane">
              ${Feedback.configured() ? '' : `<div class="badge-warn" style="margin-bottom:12px">${icon('shield', 12)}Почта разработчика не настроена, отправка недоступна</div>`}
              <div class="chips" style="margin-bottom:12px"><button class="pill on" data-f="mine">Мои и правки (${mineCount})</button><button class="pill" data-f="all">Все (${rows.length})</button></div>
              <div class="card tpl-pick" style="max-height:44vh;overflow:auto"></div>
              <label class="field" style="margin-top:14px"><span>Комментарий (зачем нужны, для какого раздела)</span><textarea class="inp" style="min-height:80px"></textarea></label>
              <div class="btns" style="justify-content:flex-end"><span class="muted" data-a="cnt" style="margin-right:auto;align-self:center"></span><button class="btn ghost" data-a="x">Отмена</button><button class="btn pri" data-a="send">${icon('send', 14)}Отправить</button></div>
            </div></div></div>`)
        );
        const box = scrim.querySelector('.tpl-pick'),
            sel = new Set(rows.filter(r => r.mine).map(r => r.item.id));
        let filter = 'mine';
        const count = () => {
            scrim.querySelector('[data-a="cnt"]').textContent = `Выбрано: ${sel.size}`;
            scrim.querySelector('[data-a="send"]').disabled = !sel.size || !Feedback.configured();
        };
        const draw = () => {
            box.innerHTML = '';
            const list = rows.filter(r => filter === 'all' || r.mine);
            if (!list.length)
                box.appendChild(
                    U.h(
                        `<div class="muted" style="padding:14px 0">Своих шаблонов пока нет. Создать можно во вкладке «Ответы».</div>`
                    )
                );
            list.forEach(r => {
                const cb = U.h(
                    `<input type="checkbox" ${sel.has(r.item.id) ? 'checked' : ''} style="accent-color:var(--acc);width:16px;height:16px">`
                );
                cb.onchange = () => {
                    cb.checked ? sel.add(r.item.id) : sel.delete(r.item.id);
                    count();
                };
                box.appendChild(
                    SettingsUI.row(
                        `${vicon(r.item.verdict, true).replace('class="vic sm"', 'class="vic sm" style="display:inline-grid;vertical-align:-4px;margin-right:6px"')}${U.esc(r.item.title)}`,
                        `${U.esc(r.pack.name)}${r.edited ? ' · правка стандартного' : r.mine ? ' · свой' : ''}`,
                        cb
                    )
                );
            });
            count();
        };
        scrim.querySelectorAll('[data-f]').forEach(
            b =>
                (b.onclick = () => {
                    filter = b.dataset.f;
                    scrim.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b));
                    draw();
                })
        );
        scrim.querySelectorAll('[data-a="x"]').forEach(b => (b.onclick = () => scrim.remove()));
        scrim.querySelector('[data-a="send"]').onclick = async e => {
            const btn = e.currentTarget;
            btn.disabled = true;
            const tpls = rows.filter(r => sel.has(r.item.id)).map(({ item, pack }) => ({ item, pack }));
            const note = scrim.querySelector('textarea').value.trim() || 'Так, по-моему, звучит лучше.';
            try {
                const edits = tpls.filter(t => Packs.isEdited(t.pack, t.item)).length;
                await Feedback.send(
                    'tpl',
                    edits ? `Правки ответов (${tpls.length})` : `Новые ответы (${tpls.length})`,
                    note,
                    { tpls, diag: false }
                );
                scrim.remove();
                toast('Шаблоны отправлены разработчику');
            } catch (err) {
                toast('Не отправилось: ' + err.message, 'err');
                btn.disabled = false;
            }
        };
        draw();
    }
};

// новая версия: раз в 2 часа читаем начало опубликованного verdict.user.js (только шапку)
const Updater = {
    ready() {
        return /^https:\/\//.test(BRAND.update || '');
    },
    newer(a, b) {
        const pa = String(a).split('.').map(Number),
            pb = String(b).split('.').map(Number);
        for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
        return false;
    },
    check(force) {
        if (!this.ready() || typeof GM_xmlhttpRequest !== 'function') return Promise.resolve(null);
        if (!force && Date.now() - Store.get('updChecked', 0) < 2 * 3600e3)
            return Promise.resolve(Store.get('updLatest', null));
        Store.set('updChecked', Date.now());
        return new Promise(res =>
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${BRAND.update}/verdict.user.js?t=${Date.now()}`,
                headers: { Range: 'bytes=0-1499' },
                timeout: 20000,
                onload: r => {
                    const m =
                        (r.status === 200 || r.status === 206) && /@version\s+([\d.]+)/.exec(r.responseText || '');
                    // не опускаем версию ниже разосланной: raw GitHub может отставать на несколько минут
                    if (m && !this.newer(Store.get('updLatest', '0.0.0'), m[1])) Store.set('updLatest', m[1]);
                    res(m ? m[1] : null);
                },
                onerror: () => res(null),
                ontimeout: () => res(null)
            })
        );
    },
    available() {
        const v = Store.get('updLatest', null);
        return v && this.newer(v, BRAND.version) ? v : null;
    },
    // Tampermonkey сам открывает страницу установки для ссылки на .user.js
    install() {
        if (this._toast) this._toast.remove();
        this._toast = null;
        window.open(`${BRAND.update}/verdict.user.js?t=${Date.now()}`, '_blank', 'noopener');
        toast('В открывшейся вкладке нажми «Обновить» — форум перезагрузится сам', 'info');
        // вернулся на вкладку форума после установки — перезагрузить, чтобы заработала новая версия
        Store.set('updAwait', Date.now());
        const back = () => {
            if (document.hidden) return;
            const at = Store.get('updAwait', 0);
            if (at && Date.now() - at > 2500 && Date.now() - at < 30 * 60e3) {
                document.removeEventListener('visibilitychange', back);
                removeEventListener('focus', back);
                location.reload();
            }
        };
        document.addEventListener('visibilitychange', back);
        addEventListener('focus', back);
    },
    // уведомление, разосланное разработчиком вручную: спрашиваем почту не чаще раза в 5 минут
    async news(force) {
        if (!Mail.url() || (!force && Date.now() - Store.get('newsChecked', 0) < 5 * 60e3)) return null;
        Store.set('newsChecked', Date.now());
        try {
            const r = await Mail.call({ action: 'news' }).catch(e => {
                Store.set('newsErr', e.message);
                throw e;
            });
            Store.set('newsErr', '');
            const n = r && r.news;
            // последняя рассылка видна во вкладке «Связь»
            if (n && /^\d+\.\d+\.\d+$/.test(n.v)) Store.set('newsLast', n);
            if (!n || !/^\d+\.\d+\.\d+$/.test(n.v) || !this.newer(n.v, BRAND.version)) return null;
            if (!Store.get('updLatest', null) || this.newer(n.v, Store.get('updLatest', '0.0.0')))
                Store.set('updLatest', n.v);
            // новая рассылка сбрасывает «Позже»
            if (Store.get('newsSeen', 0) !== n.at) {
                Store.set('newsSeen', n.at);
                Store.set('updSnooze', null);
            }
            return n;
        } catch {
            return null;
        }
    },
    async notify() {
        const n = await this.news();
        await this.check(false);
        const v = this.available();
        const snooze = Store.get('updSnooze', null);
        if (!v || this._shown === v || (snooze && snooze.v === v && Date.now() - snooze.at < 2 * 3600e3)) return;
        this._shown = v;
        const note = n && n.v === v && n.note ? ': ' + n.note : '';
        this._toast = toast(`Вышла новая версия VERDICT ${v}${note}`, 'info', {
            label: 'Обновить',
            sticky: true,
            run: () => this.install(),
            later: () => {
                this._shown = null;
                Store.set('updSnooze', { v, at: Date.now() });
            }
        });
    },
    // страница форума бывает открыта часами: проверяем и без перезагрузки
    // рассылка доходит за ~5 минут: проверяем по таймеру и когда возвращаешься на вкладку форума
    watch() {
        this.notify();
        setInterval(() => document.hidden || this.notify(), 5 * 60e3);
        document.addEventListener('visibilitychange', () => document.hidden || this.notify());
    }
};

// личная статистика: сколько ответов дал, по дням, вердиктам и разделам; хранится только у себя
const MyStats = {
    day(d = new Date()) {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },
    data() {
        const d = Store.get('mystats', null);
        return d && typeof d === 'object' && d.days ? d : { days: {} };
    },
    // один отправленный ответ
    add(item, ctx = {}) {
        if (!item || !item.verdict) return;
        const found = item.id && Packs.item(item.id);
        // раздел темы важнее пака ответа: ответ из «Общих» в жалобах считается как жалоба
        const sec = ctx.section || (found && found.pack.name) || 'Другое';
        const d = this.data();
        const k = this.day();
        const t = d.days[k] || (d.days[k] = { n: 0, v: {}, s: {} });
        t.n++;
        t.v[item.verdict] = (t.v[item.verdict] || 0) + 1;
        t.s[sec] = (t.s[sec] || 0) + 1;
        // держим полгода
        const keys = Object.keys(d.days).sort();
        while (keys.length > 190) delete d.days[keys.shift()];
        Store.set('mystats', d);
    },
    // сумма за последние n дней (0 — за всё время)
    sum(n) {
        const days = this.data().days;
        const from = n ? this.day(new Date(Date.now() - (n - 1) * 86400e3)) : '';
        const out = { n: 0, v: {}, s: {}, active: 0 };
        Object.entries(days).forEach(([k, t]) => {
            if (k < from) return;
            out.n += t.n;
            if (t.n) out.active++;
            Object.entries(t.v || {}).forEach(([x, c]) => (out.v[x] = (out.v[x] || 0) + c));
            Object.entries(t.s || {}).forEach(([x, c]) => (out.s[x] = (out.s[x] || 0) + c));
        });
        return out;
    },
    series(n) {
        const days = this.data().days;
        return Array.from({ length: n }, (_, i) => {
            const d = new Date(Date.now() - (n - 1 - i) * 86400e3);
            return { d, n: (days[this.day(d)] || {}).n || 0 };
        });
    },
    // текст для отчёта куратору
    report(n) {
        const s = this.sum(n);
        const v = VERDICT_ORDER.filter(x => s.v[x]).map(x => `${VERDICTS[x].label}: ${s.v[x]}`);
        const sec = Object.entries(s.s)
            .sort((a, b) => b[1] - a[1])
            .map(([k, c]) => `${k}: ${c}`);
        const who = Page.me() || '';
        return [
            `Отчёт ${who ? who + ' ' : ''}за ${n === 0 ? 'всё время' : n === 1 ? 'сегодня' : n + ' дн.'} (${new Date().toLocaleDateString('ru-RU')})`,
            `Всего ответов: ${s.n}`,
            v.length ? 'По вердиктам: ' + v.join(', ') : '',
            sec.length ? 'По разделам: ' + sec.join(', ') : ''
        ]
            .filter(Boolean)
            .join('\n');
    }
};

Object.assign(SettingsUI, {
    tab_mystats(pane) {
        const box = U.h(`<div class="ms"></div>`);
        pane.appendChild(box);
        const today = MyStats.sum(1),
            week = MyStats.sum(7),
            month = MyStats.sum(30),
            all = MyStats.sum(0);
        const kpi = (t, s, extra = '') =>
            `<div class="ms-kpi"><span>${t}</span><b>${s.n}</b><small>${extra}</small></div>`;
        box.innerHTML = `<div class="ms-kpis">
            ${kpi('Сегодня', today)}
            ${kpi('7 дней', week, week.active ? `~${Math.round(week.n / week.active)} в рабочий день` : '')}
            ${kpi('30 дней', month, `${month.active} дн. с ответами`)}
            ${kpi('Всего', all)}
          </div>`;
        // столбики за 30 дней
        const ser = MyStats.series(30);
        const max = Math.max(1, ...ser.map(x => x.n));
        const chart = this.sec(pane, 'Ответы по дням');
        chart.appendChild(
            U.h(
                `<div class="card ms-chart">${ser
                    .map(
                        x =>
                            `<div class="ms-col" title="${x.d.toLocaleDateString('ru-RU')}: ${x.n}"><i style="height:${Math.round((x.n / max) * 100)}%"></i><span>${x.d.getDate()}</span></div>`
                    )
                    .join('')}</div>`
            )
        );
        // вердикты и разделы за выбранный период
        let period = this._msPeriod ?? 7;
        const det = this.sec(pane, 'Разбивка');
        const seg = U.h(
            `<div class="seg" style="margin-bottom:12px">${[
                [1, 'Сегодня'],
                [7, '7 дней'],
                [30, '30 дней'],
                [0, 'Всё время']
            ]
                .map(([n, t]) => `<button data-p="${n}" class="${n === period ? 'on' : ''}">${t}</button>`)
                .join('')}</div>`
        );
        det.appendChild(seg);
        const body = U.h(`<div class="split"></div>`);
        det.appendChild(body);
        const bars = (rows, color) => {
            const m = Math.max(1, ...rows.map(r => r[1]));
            return rows.length
                ? rows
                      .map(
                          ([name, c, col]) =>
                              `<div class="ms-bar"><span>${U.esc(name)}</span><div><i style="width:${Math.round((c / m) * 100)}%;background:${col || color}"></i></div><b>${c}</b></div>`
                      )
                      .join('')
                : '<div class="muted" style="padding:8px 0">Пока пусто</div>';
        };
        const draw = () => {
            const s = MyStats.sum(period);
            const vr = VERDICT_ORDER.filter(x => s.v[x]).map(x => [VERDICTS[x].label, s.v[x], VERDICTS[x].color]);
            const sr = Object.entries(s.s).sort((a, b) => b[1] - a[1]);
            body.innerHTML = `<div class="card ms-list"><div class="ms-h">Вердикты</div>${bars(vr)}</div>
                <div class="card ms-list"><div class="ms-h">Разделы</div>${bars(sr, 'var(--acc)')}</div>`;
        };
        seg.querySelectorAll('[data-p]').forEach(
            b =>
                (b.onclick = () => {
                    period = this._msPeriod = +b.dataset.p;
                    seg.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b));
                    draw();
                })
        );
        draw();
        const act = U.h(`<div class="btns" style="margin-top:14px"></div>`);
        const copy = U.h(`<button class="btn pri">${icon('download', 14)}Скопировать отчёт</button>`);
        copy.onclick = async () => {
            const text = MyStats.report(period);
            try {
                await navigator.clipboard.writeText(text);
                toast('Отчёт скопирован');
            } catch {
                prompt('Скопируй отчёт', text);
            }
        };
        const reset = U.h(`<button class="btn ghost">${icon('trash', 14)}Сбросить</button>`);
        reset.onclick = () => {
            if (!confirm('Удалить всю свою статистику ответов?')) return;
            Store.set('mystats', null);
            this.draw();
        };
        act.append(copy, reset);
        det.appendChild(act);
        det.appendChild(
            U.h(
                `<div class="muted" style="margin-top:10px;font-size:11.5px">Считаются ответы, отправленные через панель VERDICT. Статистика хранится только в твоём браузере и никуда не отправляется.</div>`
            )
        );
    }
});

// ники вида Имя_Фамилия в постах и заголовке темы: подсветка и копирование по клику
const Nicks = {
    // латиница, одно подчёркивание; слева и справа не буквы, не цифры и не части ссылок
    re: /(^|[^A-Za-z0-9_./@#=&?-])([A-Za-z][A-Za-z0-9]{1,23}_[A-Za-z][A-Za-z0-9]{1,23})(?![A-Za-z0-9_@]|\.[A-Za-z0-9])/g,
    skip: 'a, code, pre, textarea, input, script, style, [contenteditable], .fr-box, .vd-nick, .bbCodeCode, .bbCodeSpoiler-button, .bbCodeInlineSpoiler, .message-signature',
    roots() {
        return document.querySelectorAll('.message-body .bbWrapper, .message-content .bbWrapper, .p-title-value');
    },
    scan() {
        if (!Settings.get().nickCopy) return;
        this.roots().forEach(root => {
            if (root.dataset.vdNicks) return;
            root.dataset.vdNicks = '1';
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: n =>
                    n.nodeValue.includes('_') && !(n.parentElement && n.parentElement.closest(this.skip))
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT
            });
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(n => this.wrap(n));
        });
    },
    wrap(node) {
        const text = node.nodeValue;
        this.re.lastIndex = 0;
        let m,
            last = 0,
            frag = null;
        while ((m = this.re.exec(text))) {
            frag = frag || document.createDocumentFragment();
            const start = m.index + m[1].length;
            if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
            const s = document.createElement('span');
            s.className = 'vd-nick';
            s.textContent = m[2];
            s.title = 'Нажми, чтобы скопировать ник';
            frag.appendChild(s);
            last = start + m[2].length;
        }
        if (!frag) return;
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.replaceWith(frag);
    },
    async copy(el) {
        const nick = el.textContent;
        try {
            await navigator.clipboard.writeText(nick);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = nick;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        el.classList.add('done');
        setTimeout(() => el.classList.remove('done'), 900);
        toast(`Ник скопирован: ${nick}`);
    },
    // выключили в настройках — вернуть обычный текст
    clear() {
        document.querySelectorAll('.vd-nick').forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
        this.roots().forEach(r => {
            delete r.dataset.vdNicks;
            r.normalize();
        });
    },
    start() {
        // перехват на этапе захвата: обработчики форума (спойлеры, ссылки) клик не получают
        document.addEventListener(
            'click',
            e => {
                const n = e.target.closest && e.target.closest('.vd-nick');
                if (!n) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                this.copy(n);
            },
            true
        );
        // новые посты (быстрый ответ, «показать ещё») подсвечиваем тоже
        new MutationObserver(U.debounce(() => this.scan(), 400)).observe(document.body, {
            childList: true,
            subtree: true
        });
        Bus.on('settings', () => (Settings.get().nickCopy ? this.scan() : this.clear()));
        this.scan();
    }
};

// быстрый просмотр фото: клик по ссылке на картинку в посте открывает окно просмотра вместо новой вкладки.
// Колесо — масштаб к курсору, перетаскивание — сдвиг, двойной клик — 100% / по размеру окна,
// ← → — другие фото этого поста, Esc или клик по фону — закрыть. Ctrl/Shift/средняя кнопка — как обычно.
const Lightbox = {
    IMG: /\.(png|jpe?g|gif|webp|bmp|avif)(\?[^#]*)?(#.*)?$/i,
    // страницы хостингов: картинку берём из og:image
    PAGES: /^(?:www\.)?(prnt\.sc|prntscr\.com|ibb\.co|imgbb\.com|postimg\.cc|postimages\.org|yapx\.ru|imgur\.com|skr\.sh|gyazo\.com|iimg\.su|imgbox\.com|radikal\.cloud|radikal\.ru|fastpic\.org|fastpic\.ru|joxi\.ru|joxi\.net|imageban\.ru|ipic\.su|funkyimg\.com|pixs\.ru|savepice\.ru|imgsh\.net|vfl\.ru|picshare\.ru|lightshot\.com|disk\.yandex\.ru|disk\.yandex\.com|yadi\.sk|cloud\.mail\.ru|photos\.app\.goo\.gl|ibb\.org|wertigo\.ru)$/i,
    // точно не фото — такие ссылки не проверяем
    NOT: /(^|\.)(vk\.com|vk\.ru|vkvideo\.ru|youtube\.com|youtu\.be|t\.me|telegram\.me|discord\.gg|twitch\.tv|tiktok\.com|ok\.ru|rutube\.ru|wikipedia\.org|blackrussia\.online|google\.com|github\.com|play\.google\.com|apps\.apple\.com)$/i,
    // ссылки в постах: обычный текст, карточки ссылок и разметка тем, где пост не в .bbWrapper
    SEL: '.bbWrapper a[href], .bbCodeBlock--unfurl a[href], .message-userContent a[href], .message-body a[href]',
    cache: new Map(),
    probes: new Map(),

    // настоящая ссылка: форум может заворачивать внешние ссылки в свой адрес-переходник (?to=, ?url=, proxy.php?link=)
    real(href) {
        try {
            const u = new URL(href, location.href);
            // переходник может быть и на другом адресе (away.…, link.…): разворачиваем любой, где внутри лежит ссылка
            if (u.hostname === location.hostname || /[?&/=](aHR0c|https?(:|%3A))/i.test(u.pathname + u.search)) {
                const web = v => (v && /^https?:\/\/[^\s]+$/i.test(v) ? v : null);
                for (const [, v] of u.searchParams) {
                    if (web(v)) return v;
                    // переходник с адресом в base64 (aHR0cHM6Ly8… = https://)
                    try {
                        const d = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
                        if (web(d)) return d;
                    } catch {
                        /* не base64 */
                    }
                }
                // адрес прямо в пути: /goto/https://…
                const m = decodeURIComponent(u.pathname + u.search).match(/https?:\/\/\S+/i);
                if (m) return m[0];
            }
            return u.href;
        } catch {
            return href;
        }
    },
    // адрес ссылки в посте: настоящий, а если форум спрятал его в своём переходнике — из текста ссылки
    url(a) {
        const r = this.real(a.href);
        let rh = '';
        try {
            rh = new URL(r).hostname;
        } catch {
            return r;
        }
        // ссылка ведёт на сам форум или его переходник (blackrussia.online) — настоящий адрес в тексте ссылки
        if (rh !== location.hostname && !/(^|\.)blackrussia\.online$/i.test(rh)) return r;
        for (const v of [a.dataset.url, a.textContent && a.textContent.trim()])
            if (v && /^https?:\/\/[^\s]+$/i.test(v)) {
                try {
                    if (!/(^|\.)blackrussia\.online$/i.test(new URL(v).hostname)) return v;
                } catch {
                    /* не адрес */
                }
            }
        return r;
    },
    external(href) {
        try {
            return new URL(this.real(href)).hostname !== location.hostname;
        } catch {
            return false;
        }
    },
    // неизвестный сайт: спрашиваем заголовки — если отдаёт картинку, это фото
    probe(url) {
        if (this.probes.has(url)) return this.probes.get(url);
        const p = new Promise(resolve => {
            if (typeof GM_xmlhttpRequest !== 'function') return resolve(null);
            let done = false;
            const fin = v => {
                if (!done) (done = true), resolve(v);
            };
            setTimeout(() => fin(null), 3000);
            GM_xmlhttpRequest({
                method: 'HEAD',
                url,
                timeout: 3000,
                onload: r => fin(/content-type:\s*image\//i.test(r.responseHeaders || '') ? r.finalUrl || url : null),
                onerror: () => fin(null),
                ontimeout: () => fin(null)
            });
        });
        this.probes.set(url, p);
        return p;
    },

    // прямая ссылка на картинку, обещание прямой ссылки или null; fetch = false — только проверить, без запросов
    resolve(href, fetch = true) {
        let u;
        try {
            u = new URL(href, location.href);
        } catch {
            return null;
        }
        if (!/^https?:$/.test(u.protocol)) return null;
        if (u.hostname === location.hostname) {
            const r = this.real(u.href);
            if (r === u.href) return null;
            u = new URL(r);
        }
        if (this.IMG.test(u.pathname)) return u.href;
        const host = u.hostname.toLowerCase();
        // Google Диск: превью файла
        const gd = host === 'drive.google.com' && u.pathname.match(/\/file\/d\/([\w-]{10,})/);
        if (gd) return `https://drive.google.com/thumbnail?id=${gd[1]}&sz=w2400`;
        // ВК и Telegram-CDN с картинками
        if (/(^|\.)userapi\.com$|(^|\.)vkuserphoto\.ru$|(^|\.)telesco\.pe$/.test(host)) return u.href;
        // imgur.com/ID — картинка лежит на i.imgur.com (альбомы /a/ и /gallery/ — через страницу)
        if (/^(www\.)?imgur\.com$/.test(host) && /^\/[A-Za-z0-9]{5,10}$/.test(u.pathname))
            return 'https://i.imgur.com' + u.pathname + '.png';
        if (host === 'i.imgur.com' || /(^|\.)(discordapp|discord)\.(com|net)$/.test(host) && /\/attachments\//.test(u.pathname))
            return u.href;
        if (this.PAGES.test(host) && u.pathname.length > 1) return fetch ? this.fromPage(u.href) : true;
        return null;
    },
    fromPage(url) {
        if (this.cache.has(url)) return this.cache.get(url);
        const p = new Promise(resolve => {
            if (typeof GM_xmlhttpRequest !== 'function') return resolve(null);
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: 10000,
                onload: r => {
                    const t = String(r.responseText || '');
                    const m =
                        t.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i) ||
                        t.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i) ||
                        t.match(/<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)/i) ||
                        t.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)/i) ||
                        // файлообменник без og:image: первая картинка-файл на странице
                        t.match(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|gif|webp)(?:\?[^"']*)?)["']/i);
                    // сайт сразу отдал саму картинку
                    if (!m && /content-type:\s*image\//i.test(r.responseHeaders || '')) return resolve(r.finalUrl || url);
                    try {
                        resolve(m ? new URL(m[1].replace(/&amp;/g, '&'), r.finalUrl || url).href : null);
                    } catch {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
        this.cache.set(url, p);
        return p;
    },

    links(post) {
        return [...post.querySelectorAll('a[href]')].filter(a => !a.closest('.message-signature') && (a.dataset.vdImg || this.resolve(this.url(a), false)));
    },

    // перейти по ссылке так, как просили (новая вкладка или эта), минуя страницу-предупреждение форума
    go(a, href) {
        if (a.target === '_blank' || a.closest('.bbWrapper')) window.open(href, '_blank', 'noopener');
        else location.href = href;
    },
    start() {
        document.addEventListener(
            'click',
            e => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                const a = e.target.closest && e.target.closest(this.SEL);
                if (!a || a.closest('.fr-box')) return;
                const st = Settings.get();
                const ext = this.external(this.url(a));
                // для разбора проблем: в консоли (F12) видно, как скрипт понял ссылку
                console.info('VERDICT ссылка:', a.href, '→', this.url(a), '| фото:', !!this.resolve(this.url(a), false), '| просмотр:', st.imgPreview);
                const post = a.closest('.message-body, .message-content, .message-userContent, .bbWrapper') || document.body;
                if (st.imgPreview && this.resolve(this.url(a), false) && !a.closest('.message-signature')) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const list = this.links(post);
                    this.open(list.map(x => this.url(x)), Math.max(0, list.indexOf(a)));
                    return;
                }
                if (!ext) return;
                const real = this.real(this.url(a));
                let host = '';
                try {
                    host = new URL(real).hostname;
                } catch {
                    /* ignore */
                }
                const unknown = st.imgPreview && !this.NOT.test(host) && !a.closest('.message-signature');
                if (!unknown && !st.skipLeave) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!unknown) return this.go(a, real);
                // неизвестный сайт: вдруг это фото без расширения в адресе
                this.probe(real).then(img => {
                    if (img) {
                        a.dataset.vdImg = img;
                        this.mark();
                        const list = this.links(post);
                        this.open(list.map(x => this.url(x)), Math.max(0, list.indexOf(a)));
                    } else this.go(a, st.skipLeave ? real : a.href);
                });
            },
            true
        );
        // подсказка на ссылках: значок «глаз» у ссылок на фото
        Bus.on('settings', () => this.mark());
        new MutationObserver(U.debounce(() => this.mark(), 500)).observe(document.body, { childList: true, subtree: true });
        this.mark();
    },
    mark() {
        const on = Settings.get().imgPreview;
        // ссылки на неизвестные сайты проверяем в фоне (не больше 30 за страницу): фото — получат значок
        if (on) {
            this._probed = this._probed || 0;
            document.querySelectorAll(this.SEL).forEach(a => {
                if (this._probed >= 30 || a.dataset.vdProbe || a.querySelector('img') || this.resolve(this.url(a), false) || !this.external(this.url(a))) return;
                const real = this.real(this.url(a));
                let host = '';
                try {
                    host = new URL(real).hostname;
                } catch {
                    return;
                }
                if (this.NOT.test(host)) return;
                a.dataset.vdProbe = '1';
                this._probed++;
                this.probe(real).then(img => {
                    if (img) {
                        a.dataset.vdImg = img;
                        this.mark();
                    }
                });
            });
        }
        document.querySelectorAll(this.SEL).forEach(a => {
            const want = on && !a.closest('.fr-box, .message-signature') && !a.querySelector('img') && !!(a.dataset.vdImg || this.resolve(this.url(a), false));
            if (want && !a.classList.contains('vd-imglink')) {
                a.classList.add('vd-imglink');
                a.title = 'Быстрый просмотр (Ctrl+клик — открыть в новой вкладке)';
            } else if (!want && a.classList.contains('vd-imglink')) {
                a.classList.remove('vd-imglink');
                a.removeAttribute('title');
            }
        });
        if (!document.getElementById('vd-imglink-css')) {
            const st = document.createElement('style');
            st.id = 'vd-imglink-css';
            st.textContent =
                'a.vd-imglink{cursor:zoom-in}a.vd-imglink::after{content:"";display:inline-block;width:.95em;height:.95em;margin-left:.3em;vertical-align:-.12em;opacity:.75;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z%27/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z%27/%3E%3C/svg%3E") center/contain no-repeat}';
            document.head.appendChild(st);
        }
    },

    // ── окно просмотра
    // пометки на фото: ручка, маркер, рамка, стрелка, текст и заметка. Хранятся у тебя, привязаны к ссылке на фото
    TOOLS: [
        ['move', 'Двигать фото (V)', '<path d="M12 2l3 3h-2v6h6V9l3 3-3 3v-2h-6v6h2l-3 3-3-3h2v-6H5v2l-3-3 3-3v2h6V5H9z"/>'],
        ['pen', 'Ручка (P)', '<path d="M3 21l1.2-4.6L16.6 4a2 2 0 012.8 0l.6.6a2 2 0 010 2.8L7.6 19.8z"/>'],
        ['mark', 'Маркер (M)', '<path d="M4 20h7l-2-2H6zM9 16l-2-2 9-9 4 4-9 9z"/>'],
        ['rect', 'Рамка (R)', '<path d="M3 5h18v14H3zm2 2v10h14V7z"/>'],
        ['arrow', 'Стрелка (A)', '<path d="M4 18.6L15.6 7H9V5h10v10h-2V8.4L5.4 20z"/>'],
        ['text', 'Текст (T)', '<path d="M4 4h16v4h-2V6h-5v12h2v2H9v-2h2V6H6v2H4z"/>']
    ],
    COLORS: ['#ff4d4f', '#ffd60a', '#34c759', '#4da3ff', '#ffffff'],
    tool: 'move',
    color: '#ff4d4f',

    open(urls, i) {
        this.close();
        this.urls = urls;
        this.i = i;
        const host = document.createElement('div');
        host.id = 'vd-lightbox';
        document.documentElement.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const acc = Settings.get().accent || '#e5484d';
        const ico = p => `<svg viewBox="0 0 24 24">${p}</svg>`;
        root.innerHTML = `<style>
            :host{all:initial}
            .bg{position:fixed;inset:0;z-index:2147483646;background:rgba(8,9,12,.88);backdrop-filter:blur(6px);
                font:13px/1.4 "Segoe UI",system-ui,sans-serif;color:#e8e9ec;animation:in .16s ease-out;overflow:hidden;user-select:none}
            @keyframes in{from{opacity:0}to{opacity:1}}
            .stage{position:absolute;inset:0;cursor:grab;touch-action:none}
            .stage.drag{cursor:grabbing}
            .stage.draw{cursor:crosshair}
            .stage.type{cursor:text}
            img,.ink{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;will-change:transform}
            img{-webkit-user-drag:none;box-shadow:0 18px 60px rgba(0,0,0,.6);border-radius:6px;transition:opacity .15s}
            .ink{pointer-events:none;overflow:visible}
            .snap img,.snap .ink{transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .15s}
            .bar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:8px;padding:10px 14px;
                background:linear-gradient(rgba(0,0,0,.6),transparent);z-index:3}
            .cnt{font-weight:700;min-width:46px}
            .src{flex:1;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .zoom{opacity:.8;min-width:48px;text-align:right}
            button{all:unset;cursor:pointer;padding:7px 11px;border-radius:9px;background:rgba(255,255,255,.1);font-weight:600;
                transition:background .12s}
            button:hover{background:${acc}}
            .nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;display:flex;
                align-items:center;justify-content:center;font-size:26px;padding:0;background:rgba(255,255,255,.08);z-index:2}
            .prev{left:16px}.next{right:16px}
            .msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
                text-align:center;z-index:1;pointer-events:none}
            .msg button{pointer-events:auto}
            .spin{width:34px;height:34px;border:3px solid rgba(255,255,255,.2);border-top-color:${acc};border-radius:50%;animation:sp .8s linear infinite}
            @keyframes sp{to{transform:rotate(360deg)}}
            .tools{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;
                padding:6px;border-radius:14px;background:rgba(22,24,30,.82);border:1px solid rgba(255,255,255,.1);
                box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(10px);z-index:3}
            .tools button{width:34px;height:34px;padding:0;display:grid;place-items:center;border-radius:10px;background:transparent}
            .tools button:hover{background:rgba(255,255,255,.1)}
            .tools button.on{background:${acc};color:#fff}
            .tools svg{width:18px;height:18px;fill:currentColor}
            .sep{width:1px;height:22px;background:rgba(255,255,255,.14);margin:0 4px}
            .sw{width:20px!important;height:20px!important;border-radius:50%!important;margin:0 3px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
            .sw.on{outline:2px solid #fff;outline-offset:2px;background:var(--c)!important}
            .tools button.sw:hover{background:var(--c)}
            .tools button[disabled]{opacity:.35;pointer-events:none}
            .note{position:absolute;right:16px;bottom:72px;width:280px;max-width:calc(100% - 32px);padding:10px;border-radius:14px;
                background:rgba(22,24,30,.9);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:3;
                display:none}
            .note.show{display:block;animation:in .14s ease-out}
            .note b{display:block;font-size:12px;opacity:.7;margin:0 0 6px 2px}
            textarea{all:unset;box-sizing:border-box;display:block;width:100%;min-height:110px;max-height:40vh;overflow:auto;padding:8px 10px;border-radius:9px;
                background:rgba(255,255,255,.06);font:13px/1.45 "Segoe UI",system-ui,sans-serif;color:#eef0f3;white-space:pre-wrap;user-select:text}
            textarea:focus{background:rgba(255,255,255,.1);box-shadow:0 0 0 1px ${acc}}
            .tin{position:absolute;z-index:4;min-width:60px;padding:2px 4px;border:0;outline:1px dashed rgba(255,255,255,.6);border-radius:4px;
                background:rgba(0,0,0,.35);font:700 22px/1.2 "Segoe UI",system-ui,sans-serif;user-select:text}
            .hint{position:absolute;bottom:62px;left:0;right:0;text-align:center;opacity:.45;font-size:12px;z-index:2;pointer-events:none}
            @media (max-width:640px){.bar button[data-a="copy"],.zoom,.hint{display:none}.tools{bottom:10px;max-width:calc(100% - 20px);overflow-x:auto}}
        </style>
        <div class="bg">
            <div class="stage"><img alt="" draggable="false"><svg class="ink" xmlns="http://www.w3.org/2000/svg"></svg></div>
            <div class="msg"><div class="spin"></div></div>
            <div class="bar">
                <span class="cnt"></span><span class="src"></span><span class="zoom"></span>
                <button data-a="fit" title="По размеру окна (0, двойной клик или нажатие колеса)">По размеру</button>
                <button data-a="copy">Копировать ссылку</button>
                <button data-a="tab">Открыть оригинал</button>
                <button data-a="x" title="Закрыть просмотр (Esc)">✕</button>
            </div>
            <button class="nav prev" data-a="prev">‹</button><button class="nav next" data-a="next">›</button>
            <div class="note"><b>Заметка к этому фото</b><textarea placeholder="Что видно на фото: время, ник, нарушение…"></textarea></div>
            <div class="tools">
                ${this.TOOLS.map(([k, t, p]) => `<button data-tool="${k}" title="${t}">${ico(p)}</button>`).join('')}
                <span class="sep"></span>
                ${this.COLORS.map(c => `<button class="sw" data-color="${c}" style="--c:${c};background:${c}" title="Цвет"></button>`).join('')}
                <span class="sep"></span>
                <button data-a="undo" title="Отменить (Ctrl+Z)">${ico('<path d="M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0120.4 16l2.4-.8A10.5 10.5 0 0012.5 8z"/>')}</button>
                <button data-a="clear" title="Стереть все пометки на этом фото">${ico('<path d="M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4z"/>')}</button>
                <button data-a="note" title="Заметка к фото">${ico('<path d="M5 3h10l4 4v14H5zm9 1.5V8h3.5zM8 11v2h8v-2zm0 4v2h6v-2z"/>')}</button>
            </div>
            <div class="hint">Колесо — масштаб · нажатие колеса — исходный вид · ← → — листать · Esc — закрыть</div>
        </div>`;
        this.host = host;
        this.$ = s => root.querySelector(s);
        const bg = this.$('.bg'),
            stage = this.$('.stage'),
            img = this.$('img');
        this.img = img;
        this.svg = this.$('.ink');
        root.addEventListener('click', e => {
            const t = e.target.closest('[data-tool]'),
                c = e.target.closest('[data-color]'),
                b = e.target.closest('[data-a]');
            if (t) return this.setTool(t.dataset.tool);
            if (c) return this.setColor(c.dataset.color);
            if (b) {
                e.stopPropagation();
                this.act(b.dataset.a);
            } else if ((e.target === bg || e.target === stage) && this.tool === 'move' && !this.moved) this.close();
        });
        stage.addEventListener('dblclick', e => {
            if (this.tool !== 'move') return;
            if (this.z < this.fitZ * 1.01) this.zoomAt(1, e.clientX, e.clientY, true);
            else this.fit(true);
        });
        stage.addEventListener(
            'wheel',
            e => {
                e.preventDefault();
                this.zoomAt(this.z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
            },
            { passive: false }
        );
        // браузер не должен «перетаскивать картинку» — иначе рисование и сдвиг обрываются
        stage.addEventListener('dragstart', e => e.preventDefault());
        // нажатие колеса — фото снова по центру и целиком
        stage.addEventListener('mousedown', e => e.button === 1 && e.preventDefault());
        stage.addEventListener('auxclick', e => e.button === 1 && e.preventDefault());
        stage.addEventListener('pointerdown', e => {
            if (e.button === 1) {
                e.preventDefault();
                return this.fit(true);
            }
            if (e.button !== 0 || !this.img.naturalWidth) return;
            if (this.tool === 'text') return this.textAt(e);
            e.preventDefault();
            stage.setPointerCapture(e.pointerId);
            if (this.tool !== 'move') {
                const p = this.pt(e);
                this.remember();
                this.cur = { t: this.tool, c: this.color, w: (this.tool === 'mark' ? 16 : 3.5) / this.z, p: this.tool === 'pen' || this.tool === 'mark' ? [p] : [p, p] };
                this.shapes.push(this.cur);
                this.draw();
                return;
            }
            this.drag = { x: e.clientX - this.x, y: e.clientY - this.y, sx: e.clientX, sy: e.clientY };
            this.moved = false;
            stage.classList.add('drag');
        });
        stage.addEventListener('pointermove', e => {
            if (this.cur) {
                const p = this.pt(e),
                    pts = this.cur.p;
                if (pts.length === 2 && (this.cur.t === 'rect' || this.cur.t === 'arrow')) pts[1] = p;
                else {
                    const l = pts[pts.length - 1];
                    if (Math.hypot(p[0] - l[0], p[1] - l[1]) * this.z < 2) return;
                    pts.push(p);
                }
                this.draw();
                return;
            }
            if (!this.drag) return;
            if (Math.abs(e.clientX - this.drag.sx) + Math.abs(e.clientY - this.drag.sy) > 4) this.moved = true;
            this.x = e.clientX - this.drag.x;
            this.y = e.clientY - this.drag.y;
            this.apply();
        });
        const up = () => {
            if (this.cur) {
                const s = this.cur;
                this.cur = null;
                // случайный клик без движения — не пометка
                const [a, b] = [s.p[0], s.p[s.p.length - 1]];
                if (s.p.length < 2 || Math.hypot(a[0] - b[0], a[1] - b[1]) * this.z < 3) {
                    if (s.t === 'pen' || s.t === 'mark') s.p.push([a[0] + 0.01, a[1]]);
                    else {
                        this.shapes.pop();
                        this.hist.pop();
                    }
                }
                this.draw();
                this.save();
                return;
            }
            this.drag = null;
            stage.classList.remove('drag');
            setTimeout(() => (this.moved = false), 0);
        };
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);
        const ta = this.$('textarea');
        ta.addEventListener('input', U.debounce(() => this.save(), 300));
        this.onKey = e => {
            // печатаешь в заметке или подписи — клавиши твои
            const typing = e.composedPath().some(n => n && (n.tagName === 'TEXTAREA' || n.tagName === 'INPUT'));
            if (typing) {
                if (e.key === 'Escape' && e.composedPath()[0] === ta) ta.blur();
                return;
            }
            const k = e.key.toLowerCase();
            const keys = { v: 'move', м: 'move', p: 'pen', з: 'pen', m: 'mark', ь: 'mark', r: 'rect', к: 'rect', a: 'arrow', ф: 'arrow', t: 'text', е: 'text' };
            if (e.key === 'Escape') this.close();
            else if (e.key === 'ArrowLeft') this.act('prev');
            else if (e.key === 'ArrowRight') this.act('next');
            else if (e.key === '0') this.fit(true);
            else if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я')) this.act('undo');
            else if (!e.ctrlKey && !e.metaKey && !e.altKey && keys[k]) this.setTool(keys[k]);
            else return;
            e.preventDefault();
            e.stopPropagation();
        };
        this.onResize = U.debounce(() => this.fit(), 120);
        addEventListener('keydown', this.onKey, true);
        addEventListener('resize', this.onResize);
        this.setTool(this.tool);
        this.setColor(this.color);
        this.show();
    },
    setTool(t) {
        this.tool = t;
        if (!this.host) return;
        this.$('.tools').querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
        const st = this.$('.stage');
        st.classList.toggle('draw', t !== 'move' && t !== 'text');
        st.classList.toggle('type', t === 'text');
    },
    setColor(c) {
        this.color = c;
        if (!this.host) return;
        this.$('.tools').querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === c));
    },
    // точка экрана → точка на фото (пометки живут в координатах фото и масштабируются вместе с ним)
    pt(e) {
        return [+((e.clientX - this.x) / this.z).toFixed(1), +((e.clientY - this.y) / this.z).toFixed(1)];
    },
    // подпись: поле ввода прямо на фото, Enter — готово, Esc — отмена
    textAt(e) {
        e.preventDefault();
        const old = this.$('.tin');
        if (old) return old.blur();
        const p = this.pt(e);
        const size = 22 / this.z;
        const inp = document.createElement('input');
        inp.className = 'tin';
        inp.style.left = e.clientX + 'px';
        inp.style.top = e.clientY - 16 + 'px';
        inp.style.color = this.color;
        inp.placeholder = 'Подпись…';
        this.$('.bg').appendChild(inp);
        let done = false;
        const finish = keep => {
            if (done) return;
            done = true;
            const v = inp.value.trim();
            inp.remove();
            if (!keep || !v) return;
            this.remember();
            this.shapes.push({ t: 'text', c: this.color, s: size, p: [[p[0], +(p[1] + size * 0.35).toFixed(1)]], v: v.slice(0, 200) });
            this.draw();
            this.save();
        };
        inp.addEventListener('keydown', k => {
            if (k.key === 'Enter') finish(true);
            else if (k.key === 'Escape') finish(false);
        });
        inp.addEventListener('blur', () => finish(true));
        setTimeout(() => inp.focus(), 0);
    },
    draw() {
        const svg = this.svg;
        if (!svg || !this.img.naturalWidth) return;
        const w = this.img.naturalWidth,
            h = this.img.naturalHeight;
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const line = s => `fill="none" stroke="${s.c}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"`;
        svg.innerHTML = this.shapes
            .map(s => {
                const c = /^#[0-9a-f]{6}$/i.test(s.c) ? s.c : '#ff4d4f';
                s = { ...s, c, w: +s.w || 3 };
                const P = s.p || [];
                if (s.t === 'pen' || s.t === 'mark')
                    return `<path d="M${P.map(q => q.join(' ')).join('L')}" ${line(s)}${s.t === 'mark' ? ' opacity=".38"' : ''}/>`;
                if (P.length < 2 && s.t !== 'text') return '';
                if (s.t === 'rect') {
                    const [a, b] = P;
                    return `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(a[0] - b[0])}" height="${Math.abs(a[1] - b[1])}" rx="${s.w}" ${line(s)}/>`;
                }
                if (s.t === 'arrow') {
                    const [a, b] = P;
                    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]),
                        L = s.w * 5;
                    const h1 = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)],
                        h2 = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)];
                    return `<path d="M${a.join(' ')}L${b.join(' ')}M${h1.join(' ')}L${b.join(' ')}L${h2.join(' ')}" ${line(s)}/>`;
                }
                if (s.t === 'text' && P[0])
                    return `<text x="${P[0][0]}" y="${P[0][1]}" font-size="${+s.s || 22}" font-weight="700" font-family="Segoe UI,system-ui,sans-serif" fill="${c}" stroke="rgba(0,0,0,.75)" stroke-width="${(+s.s || 22) * 0.16}" paint-order="stroke" stroke-linejoin="round">${U.esc(String(s.v || ''))}</text>`;
                return '';
            })
            .join('');
        this.$('[data-a="undo"]').disabled = !this.hist.length;
        this.$('[data-a="clear"]').disabled = !this.shapes.length;
    },
    // пометки хранятся по ссылке на фото: открыл тот же скрин позже — они на месте
    key() {
        return String(this.urls[this.i] || '').slice(0, 300);
    },
    load() {
        const all = Store.get('photoNotes', {}) || {};
        const d = all[this.key()] || {};
        this.shapes = Array.isArray(d.s) ? d.s : [];
        this.hist = [];
        const ta = this.$('textarea');
        ta.value = d.n || '';
        this.$('.note').classList.toggle('show', !!d.n);
        this.$('[data-a="note"]').classList.toggle('on', !!d.n);
    },
    save() {
        if (!this.host) return;
        const all = Store.get('photoNotes', {}) || {};
        const n = this.$('textarea').value;
        const k = this.key();
        if (!this.shapes.length && !n.trim()) delete all[k];
        else all[k] = { s: this.shapes, n, t: Date.now() };
        // храним последние 150 фото с пометками
        const keys = Object.keys(all);
        if (keys.length > 150)
            keys.sort((a, b) => (all[a].t || 0) - (all[b].t || 0))
                .slice(0, keys.length - 150)
                .forEach(x => delete all[x]);
        Store.set('photoNotes', all);
    },
    remember() {
        this.hist.push(JSON.stringify(this.shapes));
        if (this.hist.length > 60) this.hist.shift();
    },
    async show() {
        const n = this.urls.length,
            href = this.urls[this.i];
        this.$('.cnt').textContent = n > 1 ? `${this.i + 1} / ${n}` : '';
        this.$('.prev').style.display = this.$('.next').style.display = n > 1 ? '' : 'none';
        let host = '';
        try {
            host = new URL(href).hostname.replace(/^www\./, '');
        } catch {
            /* ignore */
        }
        this.$('.src').textContent = host;
        const tin = this.$('.tin');
        if (tin) tin.blur();
        this.load();
        this.svg.innerHTML = '';
        const msg = this.$('.msg');
        msg.innerHTML = '<div class="spin"></div>';
        msg.style.display = '';
        this.img.style.opacity = this.svg.style.opacity = '0';
        const token = (this.token = {});
        const el = [...document.querySelectorAll('a[data-vd-img]')].find(x => this.url(x) === href);
        const src = (el && el.dataset.vdImg) || (await this.resolve(href)) || (await this.probe(this.real(href)));
        if (token !== this.token || !this.img) return;
        if (!src) return this.fail(href);
        this.src = src;
        this.img.onload = () => {
            if (token !== this.token) return;
            msg.style.display = 'none';
            this.img.style.opacity = this.svg.style.opacity = '1';
            this.fit();
            this.draw();
        };
        this.img.onerror = () => token === this.token && this.fail(href);
        this.img.referrerPolicy = 'no-referrer';
        this.img.src = src;
        // соседние фото грузим заранее — листание без ожидания
        [this.i + 1, this.i - 1].forEach(k => {
            const u = this.urls[(k + n) % n];
            if (n > 1 && u)
                Promise.resolve(this.resolve(u)).then(s => {
                    if (s) new Image().src = s;
                });
        });
    },
    fail(href) {
        const msg = this.$('.msg');
        msg.style.display = '';
        msg.innerHTML = 'Не удалось показать фото.<br><br>';
        const b = document.createElement('button');
        b.textContent = 'Открыть в новой вкладке';
        b.onclick = () => window.open(href, '_blank', 'noopener');
        msg.appendChild(b);
    },
    // фото целиком и по центру; smooth — плавно, когда возвращаем из неудачного положения
    fit(smooth) {
        if (!this.img || !this.img.naturalWidth) return;
        const w = this.img.naturalWidth,
            h = this.img.naturalHeight;
        this.fitZ = Math.min(1, (innerWidth - 120) / w, (innerHeight - 170) / h);
        this.z = this.fitZ;
        this.x = (innerWidth - w * this.z) / 2;
        this.y = (innerHeight - h * this.z) / 2;
        if (smooth) {
            const bg = this.$('.bg');
            bg.classList.add('snap');
            clearTimeout(this._snap);
            this._snap = setTimeout(() => bg.classList.remove('snap'), 260);
        }
        this.apply();
    },
    zoomAt(z, cx, cy, exact) {
        if (!this.img || !this.img.naturalWidth) return;
        // отдалил до исходного размера и дальше — фото само встаёт по центру
        if (z <= this.fitZ * 1.001) return this.fit(true);
        z = Math.min(exact ? z : 8, z);
        this.x = cx - ((cx - this.x) * z) / this.z;
        this.y = cy - ((cy - this.y) * z) / this.z;
        this.z = z;
        this.apply();
    },
    apply() {
        const t = `translate(${this.x}px,${this.y}px) scale(${this.z})`;
        this.img.style.width = this.img.naturalWidth + 'px';
        this.img.style.transform = this.svg.style.transform = t;
        this.$('.zoom').textContent = Math.round(this.z * 100) + '%';
    },
    act(a) {
        const n = this.urls.length;
        if (a === 'x') this.close();
        else if (a === 'fit') this.fit(true);
        else if (a === 'tab') window.open(this.urls[this.i], '_blank', 'noopener');
        else if (a === 'copy') {
            navigator.clipboard.writeText(this.urls[this.i]).then(
                () => toast('Ссылка скопирована'),
                () => toast('Не удалось скопировать', 'err')
            );
        } else if (a === 'undo') {
            if (!this.hist.length) return;
            this.shapes = JSON.parse(this.hist.pop());
            this.draw();
            this.save();
        } else if (a === 'clear') {
            if (!this.shapes.length) return;
            this.remember();
            this.shapes = [];
            this.draw();
            this.save();
            toast('Пометки стёрты. Вернуть — Ctrl+Z', 'info');
        } else if (a === 'note') {
            const box = this.$('.note');
            const on = !box.classList.contains('show');
            box.classList.toggle('show', on);
            this.$('[data-a="note"]').classList.toggle('on', on);
            if (on) this.$('textarea').focus();
        } else if ((a === 'prev' || a === 'next') && n > 1) {
            const tin = this.$('.tin');
            if (tin) tin.blur();
            this.save();
            this.i = (this.i + (a === 'next' ? 1 : -1) + n) % n;
            this.show();
        }
    },
    close() {
        if (!this.host) return;
        const tin = this.$('.tin');
        if (tin) tin.blur();
        this.save();
        removeEventListener('keydown', this.onKey, true);
        removeEventListener('resize', this.onResize);
        this.host.remove();
        this.host = this.img = this.svg = null;
        this.token = null;
    }
};

// страница «Пожалуйста, будьте осторожны!» перед внешней ссылкой: сразу переходим по ссылке, без 30 секунд ожидания
const LeaveSkip = {
    done: false,
    // кнопка «Перейти на сайт» на странице «Пожалуйста, будьте осторожны!»
    button() {
        const els = document.querySelectorAll('a, button, [role="button"], .button, input[type="button"], input[type="submit"]');
        for (const el of els) if (/перейти\s+на\s+сайт/i.test(el.textContent || el.value || '')) return el;
        return null;
    },
    isWarning() {
        const t = (document.body && document.body.textContent) || '';
        return /будьте\s+осторожны/i.test(t) && /перенаправлен/i.test(t);
    },
    // запасной путь: ссылка из текста «Вы будете перенаправлены на сайт: …»
    target() {
        const m = ((document.body && document.body.innerText) || '').match(/перенаправлены\s+на\s+сайт:\s*(https?:\/\/\S+)/i);
        return m && m[1];
    },
    tryPass() {
        if (this.done || !document.body || !this.isWarning()) return false;
        const btn = this.button();
        if (btn) {
            this.done = true;
            // нажимаем кнопку сами — как будто нажал ты. Скрипт форума может повесить обработчик на кнопку
            // чуть позже, поэтому жмём ещё раз, когда страница догрузится
            const press = () => {
                const b = this.button();
                if (b) b.click();
            };
            press();
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', press, { once: true });
            addEventListener('load', press, { once: true });
            [150, 400].forEach(t => setTimeout(press, t));
            // кнопка не увела со страницы — переходим по адресу из кнопки или текста
            setTimeout(() => {
                const href = (btn.getAttribute && btn.getAttribute('href')) || this.target();
                if (href && /^https?:\/\//i.test(href)) location.replace(href);
            }, 900);
            return true;
        }
        const url = this.target();
        if (url) {
            this.done = true;
            location.replace(url);
            return true;
        }
        return false;
    },
    start() {
        if (!Settings.get().skipLeave) return;
        if (this.tryPass()) return;
        // страница ещё грузится — ловим кнопку, как только она появится
        const mo = new MutationObserver(() => this.tryPass() && mo.disconnect());
        mo.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), 15000);
    }
};
LeaveSkip.start();

// карточки ссылок (превью сайтов) с «кракозябрами» вида «ÐÑÐ¾…»: текст в UTF-8 прочитан как Windows-1252 — перекодируем
const Mojibake = {
    CP: { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f },
    fix(s) {
        if (!/[ÐÑ][\u0080-ÿŒ-™]/.test(s)) return s;
        const bytes = [];
        for (const ch of s) {
            const c = ch.codePointAt(0);
            if (c < 0x100) bytes.push(c);
            else if (this.CP[c] !== undefined) bytes.push(this.CP[c]);
            else return s;
        }
        try {
            const out = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
            return /[а-яё]/i.test(out) ? out : s;
        } catch {
            return s;
        }
    },
    scan() {
        document.querySelectorAll('.bbCodeBlock--unfurl .contentRow-header a, .bbCodeBlock--unfurl .contentRow-snippet, .bbCodeBlock--unfurl .contentRow-header').forEach(el => {
            el.childNodes.forEach(n => {
                if (n.nodeType === 3 && n.nodeValue) {
                    const v = this.fix(n.nodeValue);
                    if (v !== n.nodeValue) n.nodeValue = v;
                }
            });
        });
    },
    start() {
        this.scan();
        new MutationObserver(U.debounce(() => this.scan(), 500)).observe(document.body, { childList: true, subtree: true });
    }
};

// «Что нового»: после обновления скрипта при первом открытии форума — окно со списком изменений
const CHANGES = [
    ['1.10.14', ['Строгие формулировки передачи: «Передано Главному администратору.», «Передано техническому специалисту.» — старые и свои варианты исправлены сами']],
    ['1.10.13', ['Пометки на фото доказательств: ручка, маркер, рамка, стрелка, подпись, 5 цветов, отмена (Ctrl+Z). Сохраняются — откроешь фото снова, они на месте', 'Заметка к каждому фото', 'Отдалил колесом до конца или нажал колесо — фото встаёт по центру', 'Убрана кнопка «Выключить просмотр» из окна фото — выключается в настройках']],
    ['1.10.12', ['Раздел сервера в быстрой навигации — компактный квадратик с номером (например «49»)', 'Быстрый просмотр узнаёт ссылки, спрятанные в переходник на любом адресе']],
    ['1.10.11', ['Быстрый просмотр: фото с wertigo.ru и других файлообменников', 'Ссылки, которые форум прячет в свой переходник, тоже открываются просмотром']],
    ['1.10.10', ['Быстрый просмотр фото надёжнее: значок «глаз» и окно просмотра работают, даже если другая часть скрипта дала сбой']],
    ['1.10.9', ['Исправлено: на iPhone (Userscripts) оригинальный скрипт помечался «Неофициальной копией»']],
    ['1.10.8', ['На странице «Пожалуйста, будьте осторожны» скрипт сам моментально нажимает «Перейти на сайт»']],
    ['1.10.7', ['Быстрый просмотр открывает фото с любых сайтов: известные хостинги, Яндекс Диск, Google Диск, прямые ссылки без расширения', 'Внешние ссылки в постах открываются сразу, без страницы «Будьте осторожны»']],
    ['1.10.6', ['Меню на телефоне — прозрачное стекло, пункты в виде кнопок в стиле темы']],
    ['1.10.5', ['Страница «Пожалуйста, будьте осторожны» пропускается — внешняя ссылка открывается сразу (выключается в настройках)', 'Быстрый просмотр фото с iimg.su, imgbox, fastpic', 'Исправлены «кракозябры» в карточках ссылок', 'Внизу страницы на телефоне кнопки не закрывают подвал']],
    ['1.10.4', ['Меню форума на телефоне — в теме скрипта', 'Кнопка VERDICT прячется, пока открыто меню']],
    ['1.10.3', ['Выделенный текст хорошо видно: плотная заливка и белые буквы']],
    ['1.10.2', ['Ровная вёрстка на телефоне: отступы в карточках, блоки не налезают друг на друга', 'Кнопка VERDICT на телефоне — слева внизу']],
    ['1.10.1', ['Окно «Что нового» после обновления', 'После установки обновления форум перезагружается сам', 'В просмотре фото — кнопка «Выключить просмотр»']],
    ['1.10.0', ['Быстрый просмотр фото по ссылкам: Imgur, prnt.sc, ibb.co, прямые картинки', 'Масштаб колесом, перетаскивание, листание ← →', 'Фон снова 60 кадров в секунду']],
    ['1.9.9', ['Оптимизация фона и эффектов, без отрисовки в скрытой вкладке']],
    ['1.9.8', ['«Тема на рассмотрении.» вместо «Тема взята на рассмотрение.»']],
    ['1.9.7', ['Деловой стиль ответов: «Здравствуйте, Ник.», «Передано …», официальные формулировки']]
];
const WhatsNew = {
    start() {
        // до 1.10.1 версия не запоминалась: есть свои настройки — значит, это обновление с 1.10.0
        const seen = Store.get('seenVersion', null) || (Store.get('packs', null) ? '1.10.0' : null);
        Store.set('seenVersion', BRAND.version);
        Store.set('updAwait', null);
        // первая установка — без окна; после обновления — что изменилось с прошлой версии
        if (!seen || seen === BRAND.version || !Updater.newer(BRAND.version, seen)) return;
        const list = CHANGES.filter(([v]) => Updater.newer(v, seen) && !Updater.newer(v, BRAND.version));
        if (list.length) setTimeout(() => this.show(seen, list), 1200);
    },
    show(from, list) {
        const body = list
            .map(
                ([v, items]) => `<div class="card" style="margin-bottom:10px"><b>Версия ${U.esc(v)}</b>
                <ul style="margin:8px 0 0 18px;padding:0">${items.map(t => `<li style="margin:3px 0">${U.esc(t)}</li>`).join('')}</ul></div>`
            )
            .join('');
        const scrim = Layer.add(
            U.h(`<div class="scrim"><div class="modal sm" style="width:min(560px,100%)">
            <div class="m-head"><span class="vic" style="--c:var(--acc);width:34px;height:34px;border-radius:10px">${icon('logo', 18)}</span>
              <div><div class="m-title">VERDICT обновлён до ${U.esc(BRAND.version)}</div>
                <div class="m-sub">Было: ${U.esc(from)} · что нового</div></div>
              <span style="flex:1"></span><button class="icon-btn" data-a="x">${icon('x')}</button></div>
            <div class="pane">${body}
              <div class="btns" style="margin-top:6px"><span style="flex:1"></span><button class="btn pri" data-a="ok">Понятно</button></div>
            </div></div></div>`)
        );
        const close = () => scrim.remove();
        scrim.querySelector('[data-a="x"]').onclick = close;
        scrim.querySelector('[data-a="ok"]').onclick = close;
        scrim.addEventListener('mousedown', e => e.target === scrim && close());
    }
};

// запуск
// переименованная шапка = метка «Неофициальная копия»
const Integrity = {
    _ok: null,
    ok() {
        if (this._ok !== null) return this._ok;
        try {
            const info = typeof GM_info !== 'undefined' ? GM_info.script : null;
            if (!info) return (this._ok = true);
            // менеджеры скриптов на телефоне (Userscripts в Safari) отдают не все поля шапки:
            // пустое поле — не повод считать копию неофициальной, сверяем только то, что передано
            this._ok =
                (!info.name || /^VERDICT\b/.test(info.name)) &&
                (!info.namespace || info.namespace === BRAND.namespace) &&
                (!info.author || info.author === BRAND.author);
        } catch {
            this._ok = true;
        }
        return this._ok;
    }
};

// тема форума
const BASE_CSS = `
:root { transition: --vd-acc .8s ease, --vd-acc2 .8s ease, --vd-head .8s ease, --vd-block .8s ease, --vd-border .8s ease, --vd-btn .8s ease, --vd-link .8s ease; }
/* встроенная панель: редактор форума продолжается под ней без своего верхнего скругления */
.vd-bar-host.vd-docked + .fr-box, .vd-bar-host.vd-docked + textarea { border-top-left-radius: 0 !important; border-top-right-radius: 0 !important; border-top-width: 0 !important; }
.vd-bar-host.vd-docked + .fr-box .fr-toolbar { border-top-left-radius: 0 !important; border-top-right-radius: 0 !important; }
/* своё фото рядом с логотипом: оригинал не сжимается */
#vd-logo-side { flex: none; }
#vd-logo-side ~ img { flex: none; max-width: none !important; }
@media (max-width: 650px) { #vd-logo-side { height: 44px !important; max-width: 38vw !important; } }
/* ники Имя_Фамилия: клик копирует */
.vd-nick { cursor: copy; padding: 0 3px; margin: 0 -1px; border-radius: 4px; color: color-mix(in srgb, var(--vd-acc, #e5484d) 55%, #fff); background: color-mix(in srgb, var(--vd-acc, #e5484d) 13%, transparent);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--vd-acc, #e5484d) 45%, transparent); transition: background .15s, color .15s; }
.vd-nick:hover { background: color-mix(in srgb, var(--vd-acc, #e5484d) 26%, transparent); color: #fff; }
.vd-nick.done { background: rgba(47,191,113,.3); color: #fff; box-shadow: inset 0 -1px 0 #2fbf71; }
/* сколько прошло с создания темы */
.vd-age { --c: color-mix(in srgb, var(--vd-acc, #2fbf71) 60%, #ffffff);
  display: inline-flex !important; align-items: center; gap: 5px; margin-left: 6px; padding: 1px 8px 1px 3px; border-radius: 999px; vertical-align: middle; white-space: nowrap;
  font-weight: 700; font-size: 11px; line-height: 1.55; letter-spacing: .2px; color: color-mix(in srgb, var(--c) 45%, #fff);
  background: color-mix(in srgb, var(--vd-block, #1b1d24) 72%, transparent); border: 1px solid color-mix(in srgb, var(--c) 38%, transparent);
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--c) 9%, transparent); transition: color .3s, border-color .3s; }
.vd-age[data-l="warn"] { --c: color-mix(in srgb, var(--vd-acc, #e5484d) 30%, #f5a524); }
.vd-age[data-l="late"] { --c: color-mix(in srgb, var(--vd-acc, #e5484d) 35%, #ff4d4f); box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--c) 14%, transparent), 0 0 10px -3px color-mix(in srgb, var(--c) 65%, transparent); }
.vd-age-ring { width: 15px; height: 15px; transform: rotate(-90deg); flex: none; }
.vd-age-ring circle { fill: none; stroke-width: 3; }
.vd-age-ring .bg { stroke: color-mix(in srgb, var(--c) 22%, transparent); }
.vd-age-ring .fg { stroke: var(--c); stroke-linecap: round; transition: stroke-dasharray .6s ease; }
@media (prefers-reduced-motion: reduce) { .vd-age[data-l="late"] { animation: none; } }
.structItem-parts > li.vd-age::before, .listInline--bullet > li.vd-age::before { content: none !important; display: none !important; }
/* форум разрешает пунктам строки сжиматься (min-width:0): метка не должна ужиматься уже своего текста */
.vd-age { flex: none !important; min-width: max-content !important; max-width: none !important; overflow: visible !important; text-overflow: clip !important; box-sizing: border-box; }
/* быстрая навигация в шапке */
#vd-qnav { flex: 1 1 0; min-width: 0; position: relative; display: flex; align-items: center; padding: 0 8px; }
.p-nav-inner > .p-nav-scroller { flex: 0 1 auto; }
.vd-qn-track { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; padding: 2px 0; }
.vd-qn-track::-webkit-scrollbar { display: none; }
#vd-qnav.fl .vd-qn-track { -webkit-mask-image: linear-gradient(90deg, transparent, #000 36px); mask-image: linear-gradient(90deg, transparent, #000 36px); }
#vd-qnav.fr .vd-qn-track { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 36px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 36px), transparent); }
#vd-qnav.fl.fr .vd-qn-track { -webkit-mask-image: linear-gradient(90deg, transparent, #000 36px, #000 calc(100% - 36px), transparent); mask-image: linear-gradient(90deg, transparent, #000 36px, #000 calc(100% - 36px), transparent); }
.vd-qn-arr { flex: none; width: 26px; height: 26px; margin: 0 2px; border-radius: 50%; display: grid; place-items: center; padding: 0 0 2px; cursor: pointer; font: 700 18px/1 Arial, sans-serif; color: #fff;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); transition: background .15s; }
.vd-qn-arr:hover { background: color-mix(in srgb, var(--vd-acc, #e5484d) 40%, transparent); }
.vd-qn-arr[hidden] { display: none; }
@media (max-width: 650px) { #vd-qnav { display: none; } }
/* в верхней панели модератора и в строке под меню кнопки компактнее */
#vd-qnav.vd-qnav--top, #vd-qnav.vd-qnav--sub { margin-left: 10px; padding: 0 0 0 12px; border-left: 1px solid rgba(255,255,255,.12); align-self: stretch; }
.vd-qnav--top .vd-qn, .vd-qnav--sub .vd-qn { height: 24px; padding: 0 9px; border-radius: 7px; font-size: 11.5px; gap: 5px; }
.vd-qnav--top .vd-qn-arr, .vd-qnav--sub .vd-qn-arr { width: 22px; height: 22px; font-size: 15px; }
.vd-qnav--top .vd-qn-n, .vd-qnav--sub .vd-qn-n { height: 14px; min-width: 14px; font-size: 9.5px; }
.p-staffBar-inner, .p-sectionLinks-inner { display: flex; align-items: center; }
/* закреплённая панель сверху: остаётся на месте при прокрутке */
@media (min-width: 651px) { .p-staffBar.vd-pinned { position: sticky !important; top: 0; z-index: 450; } }
#vd-topbar { position: sticky; top: 0; z-index: 450; height: 38px; display: flex; align-items: center;
  background: color-mix(in srgb, var(--vd-head, #16181f) 97%, #05060a); border-bottom: 1px solid color-mix(in srgb, var(--vd-acc, #e5484d) 35%, transparent); box-shadow: 0 8px 20px -14px rgba(0,0,0,.8); }
.vd-topbar-inner { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 10px; height: 100%; display: flex; align-items: center; min-width: 0; }
#vd-topbar #vd-qnav { margin-left: 0; padding-left: 0; border-left: 0; }
/* липкое меню форума встаёт под закреплённую панель */
@media (min-width: 651px) { html.vd-toppin .p-navSticky, html.vd-toppin .uix_stickyBar { top: var(--vd-top-h, 38px) !important; } }
@media (max-width: 650px) { #vd-topbar { display: none; } }
.vd-qn { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 9px; font: 600 12.5px/1 inherit; color: #d6d8de !important; text-decoration: none !important; white-space: nowrap; cursor: pointer;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); transition: background .15s, border-color .15s, color .15s; }
.vd-qn:hover, .vd-qn.open { color: #fff !important; background: color-mix(in srgb, var(--vd-acc, #e5484d) 18%, transparent); border-color: color-mix(in srgb, var(--vd-acc, #e5484d) 45%, transparent); }
.vd-qn.on { color: #fff !important; background: color-mix(in srgb, var(--vd-acc, #e5484d) 26%, transparent); border-color: color-mix(in srgb, var(--vd-acc, #e5484d) 60%, transparent); }
.vd-qn-n { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; font-size: 10px; display: inline-grid; place-items: center; background: rgba(255,255,255,.1); }
.vd-qn-car { opacity: .6; font-size: 10px; }
.vd-qn .vd-qn-n { margin-left: 2px; }
.vd-qn-n.hot { background: color-mix(in srgb, var(--vd-acc, #e5484d) 75%, transparent); color: #fff; font-weight: 700; }
#vd-qnav-menu a { display: flex !important; align-items: center; justify-content: space-between; gap: 14px; }
.vd-qn.vd-qn-sq { position: relative; justify-content: center; margin-right: 6px; min-width: 30px; padding: 0 6px; font-weight: 800; font-variant-numeric: tabular-nums; }
.vd-qnav--top .vd-qn.vd-qn-sq, .vd-qnav--sub .vd-qn.vd-qn-sq { min-width: 24px; padding: 0 5px; }
.vd-qn-sq .vd-qn-n { position: absolute; top: -2px; right: -8px; margin: 0; height: 14px; min-width: 14px; font-size: 9px; padding: 0 3px; }
.vd-qn-add { border-style: dashed; color: #9aa0ab !important; background: transparent; }
#vd-qnav-menu { position: fixed; z-index: 2147482000; min-width: 220px; padding: 6px; border-radius: 12px; background: rgba(18,20,26,.96); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 20px 50px -12px rgba(0,0,0,.8); backdrop-filter: blur(16px); }
#vd-qnav-menu a { display: block; padding: 9px 12px; border-radius: 8px; color: #e4e6eb !important; text-decoration: none !important; font-size: 13px; }
#vd-qnav-menu a:hover, #vd-qnav-menu a.on { background: color-mix(in srgb, var(--vd-acc, #e5484d) 20%, transparent); color: #fff !important; }
#vd-wall, #vd-tod, #vd-fx { position: fixed; inset: 0; pointer-events: none; user-select: none; }
#vd-wall { z-index: -3; transform: scale(1.03); background: #07080b; opacity: 0; transition: opacity .8s ease, filter .12s linear; }
#vd-wall.on { opacity: 1; }
#vd-wall .vd-wl { position: absolute; inset: 0; background: center/cover no-repeat; opacity: 0; transition: opacity .9s ease; }
#vd-wall .vd-wl.on { opacity: 1; }
#vd-tod { z-index: -2; transition: background-image .8s, opacity .8s; }
#vd-fx { z-index: -1; width: 100%; height: 100%; transition: opacity .7s ease; }
html.vd-light #vd-wall { transform: none; }
html.vd-fading :is(.block-container, .message, .p-header, .p-nav, .p-sectionLinks, .p-footer, .structItem, .block-filterBar, .button--primary) {
  transition: background-color .8s ease, border-color .8s ease, backdrop-filter .8s ease, box-shadow .8s ease !important;
}
`;
const Theme = {
    style: null,
    wall: null,
    tod: null,
    lastKey: null,
    on: false,
    fade() {
        document.documentElement.classList.add('vd-fading');
        clearTimeout(this._ft);
        this._ft = setTimeout(() => document.documentElement.classList.remove('vd-fading'), 1000);
    },
    ensureBase() {
        if (document.getElementById('vd-base')) return true;
        const parent = document.head || document.documentElement;
        if (!parent) return false;
        const b = document.createElement('style');
        b.id = 'vd-base';
        b.textContent = BASE_CSS;
        parent.appendChild(b);
        return true;
    },
    apply() {
        if (!this.ensureBase()) {
            U.ready(() => this.apply());
            return;
        }
        const s = Settings.get();
        if (!s.theme.enabled) {
            if (!this.on) return;
            this.on = false;
            this.fade();
            if (this.wall) this.wall.classList.remove('on');
            if (this.tod) this.tod.style.opacity = '0';
            Fx.stop();
            if (this.live) {
                const live = this.live;
                this.live = null;
                setTimeout(() => live.stop(), 900);
            }
            const st = this.style;
            this.lastKey = null;
            setTimeout(() => {
                if (!Settings.get().theme.enabled && st) st.remove();
            }, 60);
            return;
        }
        this.on = true;
        document.documentElement.classList.toggle('vd-light', Perf.light());
        if (!this.style) {
            this.style = document.createElement('style');
            this.style.id = 'vd-theme';
        }
        this.fade();
        const parent = document.head || document.documentElement;
        if (this.style.parentNode !== parent) parent.appendChild(this.style);
        this.style.textContent = forumCss(s);
        const put = () => {
            if (!document.body) return;
            if (!this.wall || !this.wall.isConnected) {
                this.wall = document.createElement('div');
                this.wall.id = 'vd-wall';
                this.wall.setAttribute('aria-hidden', 'true');
                this.tod = document.createElement('div');
                this.tod.id = 'vd-tod';
                this.tod.setAttribute('aria-hidden', 'true');
                document.body.prepend(this.wall, this.tod);
            }
            requestAnimationFrame(() => {
                this.wall.classList.add('on');
                this.tod.style.opacity = '1';
            });
            const key = JSON.stringify(s.theme.wall) + s.theme.rotate + Perf.light();
            if (this.lastKey !== key) {
                this.lastKey = key;
                const w = s.theme.wall;
                const G = s.theme.rotate === 'off' && w.kind === 'gen' && GENERATORS[w.gen];
                const scene =
                    s.theme.rotate === 'off' &&
                    w.kind === 'photo' &&
                    Store.get('photos', []).find(p => p.id === w.id && p.scene);
                if (scene && !Fx.reduced()) this.setScene(scene);
                else if (G && G.live && !Fx.reduced()) this.setLive(w.seed);
                // фон рисуется после первой отрисовки страницы: генерация (~200 мс при первом заходе) не задерживает форум
                else
                    requestAnimationFrame(() =>
                        setTimeout(() => this.lastKey === key && this.setImage(Wallpaper.current()), 0)
                    );
            }
            Fx.sync();
        };
        if (document.body) put();
        else U.ready(put);
    },

    // новый слой проявляется поверх старого, старый удаляется после перехода
    swap(layer, live) {
        // старые слои запоминаем сразу, иначе следующий swap в том же кадре удалит новый слой
        const old = [...this.wall.querySelectorAll('.vd-wl')].filter(l => l !== layer);
        requestAnimationFrame(() => {
            // тему успели выключить: новый живой слой не запускаем
            if (!this.on) {
                if (live) live.stop();
                layer.remove();
                return;
            }
            layer.classList.add('on');
            const oldLive = this.live;
            this.live = live || null;
            setTimeout(() => {
                old.forEach(l => l.remove());
                if (oldLive) oldLive.stop();
            }, 1000);
        });
    },

    setLive(seed) {
        const layer = document.createElement('div');
        layer.className = 'vd-wl';
        const cv = document.createElement('canvas');
        cv.style.cssText = 'width:100%;height:100%;display:block';
        layer.appendChild(cv);
        this.wall.appendChild(layer);
        this._tok = (this._tok || 0) + 1;
        Photo.wall(null);
        this.swap(layer, new LiveWall(cv, seed));
    },

    // своё фото с анимацией поверх
    setScene(photo) {
        const layer = document.createElement('div');
        layer.className = 'vd-wl';
        layer.style.backgroundImage = `url("${photo.src.replace(/"/g, '%22')}")`;
        this.wall.appendChild(layer);
        this._tok = (this._tok || 0) + 1;
        Photo.wall(null);
        this.swap(layer, new LiveScene(layer, photo.scene));
    },

    setImage(src) {
        const layer = document.createElement('div');
        layer.className = 'vd-wl';
        this.wall.appendChild(layer);
        // пока фото грузилось, могли выбрать другой фон: тогда этот слой уже не нужен
        const tok = (this._tok = (this._tok || 0) + 1);
        const show = url => {
            if (tok !== this._tok || !layer.isConnected) return;
            layer.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
            this.swap(layer);
        };
        // текущий фон храним, чтобы при переходе по страницам он появлялся сразу
        if (!/^https:/.test(src)) Photo.wall(null);
        const saved = /^https:/.test(src) && Photo.wall();
        if (saved && saved.url === src) {
            show(saved.data);
            return;
        }
        Photo.load(src)
            .then(data => {
                if (/^https:/.test(src)) Photo.wall({ url: src, data });
                show(data);
            })
            .catch(() => {
                if (tok !== this._tok) return;
                const fb = Settings.get().theme.wall.fb || { gen: 'nightroad', seed: 1902 };
                show(Wallpaper.render(fb.gen, fb.seed));
                setTimeout(() => toast('Фото не загрузилось, поставил генеративный фон', 'err'), 400);
            });
    }
};
// время суток «по часам» пересчитывается раз в 10 минут
setInterval(() => {
    if (Settings.get().theme.fx.tod === 'auto') Fx.updateTod();
}, 600000);

const Launcher = {
    node: null,
    sync() {
        const on = Settings.get().launcher;
        if (!on) {
            if (this.node) this.node.remove();
            this.node = null;
            return;
        }
        if (this.node) return;
        this.node = Layer.add(
            U.h(`<button class="launch" title="Настройки VERDICT (Alt+V)">${icon('logo', 22)}</button>`)
        );
        this.node.onclick = () => SettingsUI.open();
        // открыто меню форума на телефоне — кнопку прячем, чтобы не лежала поверх пунктов меню
        if (!this._watch) {
            this._watch = true;
            const check = () => {
                if (!this.node) return;
                const open = !!document.querySelector('.offCanvasMenu.is-active, .offCanvasMenu.is-transitioning');
                this.node.style.display = open ? 'none' : '';
            };
            document.addEventListener('click', () => [60, 400].forEach(t => setTimeout(check, t)), true);
            document.addEventListener('touchend', () => setTimeout(check, 400), true);
        }
    }
};

function mountBars() {
    if (!Page.isThread()) return;
    Editor.forms().forEach(form => {
        if (form.__vd) return;
        if (!form.querySelector('.fr-box, textarea[name="message"], textarea[name="message_html"]')) return;
        form.__vd = true;
        const bar = new ReplyBar(form);
        Bars.push(bar);
        Shortcodes.attach(bar);
        if (!Settings.get().role && !mountBars.asked) {
            mountBars.asked = true;
            setTimeout(() => RolePicker.open(true), 600);
        }
    });
}

// прилипшее меню форума: на этом форуме оно липнет через CSS без класса is-sticky,
// поэтому сами отмечаем момент прилипания, чтобы дать ему плотный фон
const Stuck = {
    els() {
        return [...document.querySelectorAll('.p-navSticky, .uix_stickyBar')].filter(e =>
            /sticky|fixed/.test(getComputedStyle(e).position)
        );
    },
    check() {
        this._raf = 0;
        const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vd-top-h')) || 0;
        this._els.forEach(e => e.classList.toggle('vd-stuck', scrollY > 0 && e.getBoundingClientRect().top <= top + 1));
    },
    start() {
        this._els = this.els();
        if (!this._els.length) return;
        addEventListener('scroll', () => this._raf || (this._raf = requestAnimationFrame(() => this.check())), {
            passive: true
        });
        this.check();
    }
};

function boot() {
    Access.migrate();
    Perf.probe(() => {
        Theme.lastKey = null;
        Theme.apply();
        toast('Форум подтормаживал, включил экономный режим тем (Фоны и прозрачность)', 'info');
    });
    // прошлая сборка хранила превью и фон в GM, освобождаем
    if (!Store.get('phV2', false)) {
        THEME_PRESETS.filter(p => p.photo).forEach(p => Store.set('ph:' + UNSPLASH(p.photo, 480), null));
        Store.set('wallData', null);
        Store.set('phV2', true);
    }
    // шрифт ответа по умолчанию теперь Verdana
    if (!Store.get('fontV2', false)) {
        if (!Settings.get().answer.font) Settings.patch(x => (x.answer.font = 'Verdana'));
        Store.set('fontV2', true);
    }
    // старый дефолт плотности 0.78
    // размытие под блоками было включено по умолчанию и тормозило прокрутку: стандартное значение выключаем
    if (!Store.get('blurV3', false)) {
        Settings.patch(x => {
            if (x.theme.blur === 14) x.theme.blur = 0;
        });
        Store.set('blurV3', true);
    }
    if (!Store.get('qnavTopV1', false)) {
        Settings.patch(x => {
            if (x.qnav.place === 'nav' || x.qnav.place === 'staff') x.qnav.place = 'top';
        });
        Store.set('qnavTopV1', true);
    }
    if (!Store.get('glassV2', false)) {
        if (Settings.get().theme.glass === 0.78) Settings.patch(x => (x.theme.glass = 0.3));
        Store.set('glassV2', true);
    }
    // свои итоговые строки передачи — в строгой форме
    if (!Store.get('ownTailsStrict', false)) {
        Settings.patch(x => {
            for (const k of Object.keys(x.answer.tails || {})) x.answer.tails[k] = strictTail(x.answer.tails[k]);
        });
        Store.set('ownTailsStrict', true);
    }
    Theme.apply();
    U.ready(() => {
        Theme.apply();
        Launcher.sync();
        mountBars();
        mountAutograph();
        Logo.apply();
        QNav.mount();
        Bus.on('settings', () => QNav.mount());
        Stuck.start();
        // не срочное — когда браузер свободен, чтобы страница стала отзывчивой быстрее
        const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
        idle(
            () => {
                // каждая часть отдельно: ошибка в одной не выключает остальные (просмотр фото, «Что нового»…)
                [Age, Nicks, Lightbox, WhatsNew, Mojibake].forEach(m => {
                    try {
                        m.start();
                    } catch (err) {
                        console.warn('VERDICT:', err);
                    }
                });
                try {
                    QNav.watchCounts();
                } catch (err) {
                    console.warn('VERDICT:', err);
                }
            },
            { timeout: 1500 }
        );
        // ответы разработчика на обращения
        setTimeout(() => {
            Feedback.notify();
            Stats.ping();
            Updater.watch();
        }, 4000);
        // редактор XenForo появляется не сразу
        const mo = new MutationObserver(
            U.debounce(() => {
                mountBars();
                mountAutograph();
                Logo.apply();
                Nicks.scan();
            }, 250)
        );
        mo.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), 30000);
        document.addEventListener(
            'keydown',
            e => {
                if (!Settings.get().hotkeys) return;
                const k = e.key.toLowerCase();
                if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'л' || e.code === 'KeyK') && Bars.length) {
                    e.preventDefault();
                    e.stopPropagation();
                    Palette.open(Bars[0]);
                }
                if (e.altKey && (k === 'v' || k === 'м' || e.code === 'KeyV')) {
                    e.preventDefault();
                    SettingsUI.open();
                }
            },
            true
        );
        // фото и сгенерированные фоны не утаскиваются правым кликом/перетаскиванием из нашего UI
        const guard = e => {
            if (e.composedPath().some(n => n && n.classList && (n.classList.contains('wall') || n.id === 'vd-wall')))
                e.preventDefault();
        };
        document.addEventListener('contextmenu', guard, true);
        document.addEventListener('dragstart', guard, true);
    });
}

boot();

})();
