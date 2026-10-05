// ==UserScript==
// @name         VERDICT · Входящие
// @namespace    verdict.br.forum.inbox
// @version      2.0.0
// @description  Обращения пользователей VERDICT из почты разработчика в одной панели.
// @author       VERDICT
// @match        https://forum.blackrussia.online/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/Jeredpoi/Br-script/main/verdict-inbox.meta.js
// @downloadURL  https://raw.githubusercontent.com/Jeredpoi/Br-script/main/verdict-inbox.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

// входящие для разработчика: обращения лежат в Google-таблице (server/verdict-mail.gs),
// адрес почты и ключ вводятся один раз и хранятся только в этом скрипте
(function () {
    'use strict';

    const KINDS = {
        idea: ['Идея', '#ffd166'],
        bug: ['Ошибка', '#e5484d'],
        tpl: ['Шаблоны', '#2fbf71'],
        theme: ['Тема или фон', '#a970ff'],
        other: ['Другое', '#3aa0ff']
    };
    const STATES = { new: 'Новое', work: 'В работе', done: 'Готово' };
    const POLL = 5 * 60 * 1000;

    const store = {
        get: (k, d) => {
            try {
                const v = GM_getValue('inbox.' + k);
                return v === undefined ? d : JSON.parse(v);
            } catch {
                return d;
            }
        },
        set: (k, v) => GM_setValue('inbox.' + k, JSON.stringify(v))
    };
    const esc = s =>
        String(s ?? '').replace(
            /[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const kindOf = k => KINDS[k] || [k || 'Другое', '#8d919c'];
    const when = iso => {
        const d = new Date(iso);
        return isNaN(d)
            ? ''
            : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    // запрос к почте с ключом разработчика
    function call(body) {
        const cfg = store.get('cfg', {});
        return new Promise((res, rej) => {
            if (!cfg.url || !cfg.key) return rej(new Error('Почта не настроена'));
            GM_xmlhttpRequest({
                method: 'POST',
                url: cfg.url,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                data: JSON.stringify(Object.assign({ key: cfg.key }, body)),
                timeout: 30000,
                onload: r => {
                    let j = null;
                    try {
                        j = JSON.parse(r.responseText);
                    } catch {
                        /* не JSON */
                    }
                    if (!j) return rej(new Error('Почта не ответила (проверь адрес)'));
                    if (j.error) return rej(new Error(j.error));
                    res(j);
                },
                onerror: () => rej(new Error('Нет связи с почтой')),
                ontimeout: () => rej(new Error('Почта долго не отвечает'))
            });
        });
    }

    // присланные шаблоны → файл для импорта во вкладке «Ответы»
    function packsOf(tpls) {
        const by = {};
        tpls.forEach(t => {
            const p = t.pack || {};
            const id = String(p.id || 'shared');
            (by[id] = by[id] || {
                id,
                name: p.name || 'Присланные',
                match: p.match || '',
                kind: p.kind || 'any',
                items: []
            }).items.push(t.item || {});
        });
        return { type: 'packs', packs: Object.values(by) };
    }

    function download(name, data) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    const CSS = `
:host { all: initial; font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif; color: #e8e9ed; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.fab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 12px;
  background: rgba(14,15,20,.82); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(14px); box-shadow: 0 14px 30px -14px #000; font-weight: 650; }
.fab .n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: #e5484d; color: #fff; font-size: 11px; display: grid; place-items: center; }
.fab .n[hidden] { display: none; }
.panel { position: fixed; right: 18px; bottom: 68px; z-index: 2147483000; width: min(920px, calc(100vw - 36px)); height: min(640px, calc(100vh - 100px)); display: flex;
  border-radius: 16px; overflow: hidden; background: rgba(14,15,20,.94); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(20px); box-shadow: 0 30px 70px -20px #000; }
.list { width: 330px; flex: none; display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,.07); }
.head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.07); font-weight: 750; }
.head .sp { flex: 1; }
.tabs { display: flex; gap: 4px; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.07); }
.tab { white-space: nowrap; padding: 4px 9px; border-radius: 999px; color: #a7aab4; font-weight: 650; font-size: 12px; }
.tab.on { color: #fff; background: rgba(255,255,255,.08); }
.items { flex: 1; overflow: auto; padding: 6px; }
.it { width: 100%; text-align: left; display: block; padding: 9px 10px; border-radius: 10px; }
.it:hover, .it.on { background: rgba(255,255,255,.06); }
.it .t { display: flex; align-items: center; gap: 7px; font-weight: 650; }
.it .t span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.it .m { margin-top: 3px; font-size: 11.5px; color: #8d919c; display: flex; gap: 8px; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #e5484d; }
.kind { padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
.view { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.body { flex: 1; overflow: auto; padding: 16px 18px; }
.body h3 { margin: 0 0 4px; font-size: 15px; }
.meta { color: #8d919c; font-size: 12px; margin-bottom: 14px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.meta a { color: #8cc4ff; }
.msg { padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.06); }
.msg blockquote { margin: 8px 0; padding: 8px 10px; border-left: 3px solid #2fbf71; background: rgba(255,255,255,.03); border-radius: 8px; }
.tpl { margin-top: 14px; padding: 10px 12px; border-radius: 12px; border: 1px dashed rgba(47,191,113,.45); }
.tpl b { color: #2fbf71; }
.foot { padding: 12px 14px; border-top: 1px solid rgba(255,255,255,.07); display: flex; flex-direction: column; gap: 8px; }
textarea { width: 100%; min-height: 70px; resize: vertical; padding: 9px 11px; border-radius: 10px; font: inherit; color: inherit; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); outline: none; }
textarea:focus { border-color: rgba(140,196,255,.5); }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.btn { padding: 7px 12px; border-radius: 9px; background: rgba(255,255,255,.07); font-weight: 650; }
.btn:hover { background: rgba(255,255,255,.12); }
.btn.pri { background: #2f6fdf; color: #fff; }
.btn.on { box-shadow: inset 0 0 0 1px currentColor; }
@media (max-width: 700px) {
  .panel { flex-direction: column; }
  .list { width: auto; max-height: 42%; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.07); }
}
.empty { margin: auto; color: #8d919c; text-align: center; padding: 30px; }
.err { color: #ff8a8a; }
.inp { width: 100%; padding: 8px 10px; border-radius: 9px; font: inherit; color: inherit; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); outline: none; }
.setup { margin: auto; width: min(420px, 90%); display: flex; flex-direction: column; gap: 10px; }
.setup p { margin: 0; color: #a7aab4; font-size: 12.5px; }
.diff { margin-top: 8px; display: grid; gap: 6px; font-size: 12.5px; }
.diff .was { color: #a7aab4; text-decoration: line-through; text-decoration-color: rgba(229,72,77,.6); }
.reply { margin-top: 10px; padding: 9px 12px; border-radius: 10px; background: rgba(47,111,223,.12); border-left: 2px solid #2f6fdf; }
.reply small { color: #8d919c; }
`;

    function start() {
        const host = document.createElement('div');
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${CSS}</style><button class="fab">Входящие VERDICT <span class="n" hidden></span></button>`;
        document.body.appendChild(host);
        const fab = root.querySelector('.fab');

        let items = [];
        let panel = null;
        let filter = 'new';
        let current = null;

        function badge() {
            const n = items.filter(it => it.state === 'new').length;
            const el = fab.querySelector('.n');
            el.hidden = !n;
            el.textContent = n;
        }

        async function refresh() {
            if (!store.get('cfg', {}).key) return;
            try {
                items = (await call({ action: 'list' })).items || [];
                badge();
                if (panel) drawList();
            } catch (e) {
                if (panel) panel.querySelector('.items').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
            }
        }

        function drawList() {
            const box = panel.querySelector('.items');
            const shown = items.filter(it => filter === 'all' || it.state === filter);
            panel.querySelectorAll('.tab').forEach(t => {
                const n = t.dataset.f === 'all' ? items.length : items.filter(it => it.state === t.dataset.f).length;
                t.textContent = `${t.dataset.f === 'all' ? 'Все' : STATES[t.dataset.f]} ${n}`;
                t.classList.toggle('on', t.dataset.f === filter);
            });
            box.innerHTML = shown.length
                ? ''
                : `<div class="empty">${items.length ? 'Здесь пусто' : 'Обращений пока нет'}</div>`;
            shown.forEach(it => {
                const [kn, kc] = kindOf(it.kind);
                const b = document.createElement('button');
                b.className = 'it' + (current && current.id === it.id ? ' on' : '');
                b.innerHTML = `<div class="t">${it.state === 'new' ? '<i class="dot"></i>' : ''}<span>${esc(it.title || 'Без темы')}</span></div>
                    <div class="m"><span class="kind" style="--c:${kc}">${esc(kn)}</span><span>${esc(it.nick || 'аноним')}</span><span>${esc(when(it.at))}</span></div>`;
                b.onclick = () => show(it);
                box.appendChild(b);
            });
        }

        function show(it) {
            current = it;
            drawList();
            const view = panel.querySelector('.view');
            const [kn, kc] = kindOf(it.kind);
            let tpls = [];
            try {
                tpls = it.tpls ? JSON.parse(it.tpls) : [];
            } catch {
                tpls = [];
            }
            if (!Array.isArray(tpls)) tpls = [];
            tpls = tpls.filter(t => t && typeof t === 'object' && t.item && typeof t.item === 'object');
            view.innerHTML = `<div class="body">
                  <h3>${esc(it.title || 'Без темы')}</h3>
                  <div class="meta"><span class="kind" style="--c:${kc}">${esc(kn)}</span><span>от <b>${esc(it.nick || 'аноним')}</b></span><span>${esc(when(it.at))}</span></div>
                  <div class="msg">${esc(it.text).replace(/\n/g, '<br>')}</div>
                  ${
                      tpls.length
                          ? `<div class="tpl"><b>Шаблоны: ${tpls.length}</b>${tpls
                                .map(
                                    t => `<div class="diff"><div><b>${esc((t.pack && t.pack.name) || '')} › ${esc(t.item.title)}</b> ${t.before !== null && t.before !== undefined ? '· правка стандартного' : '· новый'}</div>
                                ${t.before !== null && t.before !== undefined ? `<div class="was">${esc(t.before)}</div>` : ''}<div>${esc(t.item.text)}</div></div>`
                                )
                                .join('')}
                    <div class="row" style="margin-top:10px"><button class="btn" data-a="json">Скачать JSON для импорта</button></div></div>`
                          : ''
                  }
                  ${it.diag ? `<div class="meta" style="margin-top:12px">${esc(it.diag)}</div>` : ''}
                  ${(it.replies || []).map(r => `<div class="reply"><small>Твой ответ · ${esc(when(r.at))}</small><div>${esc(r.text).replace(/\n/g, '<br>')}</div></div>`).join('')}
                </div>
                <div class="foot">
                  <div class="row">${Object.entries(STATES)
                      .map(([k, v]) => `<button class="btn ${it.state === k ? 'on' : ''}" data-st="${k}">${v}</button>`)
                      .join('')}</div>
                  <textarea placeholder="Ответ придёт пользователю прямо в скрипт"></textarea>
                  <div class="row"><button class="btn pri" data-a="send">Ответить</button><span class="note" style="color:#8d919c;font-size:12px"></span></div>
                </div>`;
            const note = view.querySelector('.note');
            view.querySelectorAll('[data-st]').forEach(b => {
                b.onclick = async () => {
                    try {
                        await call({ action: 'state', id: it.id, state: b.dataset.st });
                        it.state = b.dataset.st;
                        badge();
                        if (current === it) show(it);
                    } catch (e) {
                        note.textContent = e.message;
                    }
                };
            });
            const json = view.querySelector('[data-a="json"]');
            if (json) json.onclick = () => download(`verdict-${it.nick || 'user'}-${it.id}.json`, packsOf(tpls));
            view.querySelector('[data-a="send"]').onclick = async e => {
                const ta = view.querySelector('textarea');
                const text = ta.value.trim();
                if (!text) return;
                e.target.disabled = true;
                note.textContent = 'Отправляю…';
                try {
                    await call({ action: 'reply', id: it.id, text });
                    it.replies = (it.replies || []).concat({ at: new Date().toISOString(), text });
                    if (it.state === 'new') it.state = 'work';
                    badge();
                    if (current === it) show(it);
                } catch (err) {
                    note.textContent = 'Не отправилось: ' + err.message;
                    e.target.disabled = false;
                }
            };
        }

        // адрес почты и ключ: один раз, хранятся только в этом скрипте
        function setup(view, msg) {
            const cfg = store.get('cfg', {});
            view.innerHTML = `<div class="setup">
                  <b>Подключить почту</b>
                  <p>Адрес веб-приложения из Google Apps Script и ключ из журнала функции setup() (см. server/README.md).</p>
                  <input class="inp" data-f="url" placeholder="https://script.google.com/macros/s/…/exec">
                  <input class="inp" data-f="key" placeholder="Ключ">
                  <div class="row"><button class="btn pri" data-a="save">Сохранить</button><span class="note err">${esc(msg || '')}</span></div>
                </div>`;
            view.querySelector('[data-f="url"]').value = cfg.url || '';
            view.querySelector('[data-f="key"]').value = cfg.key || '';
            view.querySelector('[data-a="save"]').onclick = () => {
                const url = view.querySelector('[data-f="url"]').value.trim();
                const key = view.querySelector('[data-f="key"]').value.trim();
                if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) || !key) {
                    view.querySelector('.note').textContent = 'Нужен адрес https://script.google.com/… и ключ';
                    return;
                }
                store.set('cfg', { url, key });
                view.innerHTML = '<div class="empty">Выбери обращение слева</div>';
                refresh();
            };
        }

        function toggle() {
            if (panel) {
                panel.remove();
                panel = null;
                return;
            }
            panel = document.createElement('div');
            panel.className = 'panel';
            panel.innerHTML = `<div class="list">
                  <div class="head">Входящие VERDICT<span class="sp"></span><button class="btn" data-a="cfg" title="Адрес и ключ почты">⚙</button><button class="btn" data-a="reload">Обновить</button></div>
                  <div class="tabs">${['new', 'work', 'done', 'all'].map(f => `<button class="tab" data-f="${f}"></button>`).join('')}</div>
                  <div class="items"><div class="empty">Загружаю…</div></div>
                </div>
                <div class="view"><div class="empty">Выбери обращение слева</div></div>`;
            root.appendChild(panel);
            panel.querySelectorAll('.tab').forEach(t => {
                t.onclick = () => {
                    filter = t.dataset.f;
                    drawList();
                };
            });
            panel.querySelector('[data-a="reload"]').onclick = refresh;
            panel.querySelector('[data-a="cfg"]').onclick = () => setup(panel.querySelector('.view'));
            if (!store.get('cfg', {}).key) {
                panel.querySelector('.items').innerHTML = '<div class="empty">Сначала подключи почту</div>';
                setup(panel.querySelector('.view'));
            } else refresh();
        }

        fab.onclick = toggle;
        refresh();
        setInterval(refresh, POLL);
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
