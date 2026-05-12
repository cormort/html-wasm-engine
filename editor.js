(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, ms = 300) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); };
  
  const storage = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
  };

  // ---------- Tabs 系統 ----------
  const Tabs = {
    list: [], activeId: null,
    load() {
      this.list = storage.get('heu_tabs_v2', [{ id: uid(), name: 'index.html', mode: 'html', content: '<h1>Hello</h1>' }]);
      this.activeId = storage.get('heu_active_tab', this.list[0].id);
    },
    save() { storage.set('heu_tabs_v2', this.list); storage.set('heu_active_tab', this.activeId); },
    get active() { return this.list.find(t => t.id === this.activeId); },
    setActive(id) { this.activeId = id; this.save(); App.renderTabs(); App.editor.setValue(this.active.content, this.active.mode); },
    add(name, mode, content) { 
        const t = { id: uid(), name, mode, content }; 
        this.list.push(t); this.setActive(t.id); 
    },
    remove(id) {
      if(this.list.length <= 1) return;
      this.list = this.list.filter(t => t.id !== id);
      if(this.activeId === id) this.activeId = this.list[0].id;
      this.save(); App.renderTabs(); App.editor.setValue(this.active.content, this.active.mode);
    }
  };

  // ---------- 編輯器適配器 ----------
  class CodeMirrorAdapter {
    constructor(host) { this.cm = CodeMirror.fromTextArea($('#cm-textarea'), { lineNumbers: true, mode: 'htmlmixed', theme: 'default' }); }
    getValue() { return this.cm.getValue(); }
    setValue(v, m) { this.cm.setOption('mode', m==='js'?'javascript':m); this.cm.setValue(v || ''); }
    jumpTo(line) { this.cm.setCursor(line, 0); this.cm.focus(); this.cm.scrollIntoView({line, ch:0}, 200); }
    refresh() { this.cm.refresh(); }
    setTheme(t) { this.cm.setOption('theme', t); }
  }

  // ---------- Rust 驅動的結構導覽 ----------
  const Outline = {
    async build(filter, isMd, text) {
      const container = $('#outline-container');
      if (isMd || !window.WasmEngine) return;

      try {
        // 🚀 呼叫 Rust 引擎進行精準 DOM 解析
        const data = window.WasmEngine.get_dom_outline(text, filter);
        const items = JSON.parse(data);

        container.innerHTML = items.length ? items.map(item => `
          <a class="outline-item" data-line="${item.line}">
            <small>${item.tag}</small> ${item.label}
          </a>
        `).join('') : '<div class="muted">無符合項目</div>';

        $$('#outline-container a').forEach(a => a.addEventListener('click', () => {
          App.editor.jumpTo(parseInt(a.dataset.line));
        }));
      } catch (e) { console.error("Outline Error:", e); }
    }
  };

  // ---------- App 核心 ----------
  const App = {
    async boot() {
      Tabs.load();
      this.renderTabs();
      this.editor = new CodeMirrorAdapter();
      this.editor.setValue(Tabs.active.content, Tabs.active.mode);
      this.bindEvents();
      this.updatePreview();
    },

    renderTabs() {
      const box = $('#tabs'); box.innerHTML = '';
      Tabs.list.forEach(t => {
        const div = document.createElement('div');
        div.className = `tab ${t.id === Tabs.activeId ? 'active' : ''}`;
        div.innerHTML = `<span>${t.name}</span><b onclick="event.stopPropagation();Tabs.remove('${t.id}')">×</b>`;
        div.onclick = () => Tabs.setActive(t.id);
        box.appendChild(div);
      });
    },

    bindEvents() {
      // 萃取按鈕
      $('#btn-extract-css')?.addEventListener('click', () => {
        const res = window.WasmEngine.extract_structure(this.editor.getValue(), 'style');
        Tabs.add('extracted.css', 'css', res);
      });

      $('#btn-extract-js')?.addEventListener('click', () => {
        const res = window.WasmEngine.extract_structure(this.editor.getValue(), 'script');
        Tabs.add('extracted.js', 'js', res);
      });

      $('#btn-extract-func')?.addEventListener('click', () => {
        const res = window.WasmEngine.extract_functions(this.editor.getValue());
        Tabs.add('functions.js', 'js', res);
        toast('🦀 函式已萃取至新分頁');
      });

      $('#btn-extract-body')?.addEventListener('click', () => {
        const res = window.WasmEngine.extract_structure(this.editor.getValue(), 'body');
        Tabs.add('ui_structure.html', 'html', res);
      });

      // 導覽更新
      $('#nav-filter').onchange = () => this.updateOutline();
      $('#btn-refresh-outline').onclick = () => this.updateOutline();

      // 編輯器變動
      this.editor.cm.on('change', debounce(() => {
        Tabs.active.content = this.editor.getValue();
        Tabs.save();
        this.updatePreview();
        this.updateOutline();
      }, 500));
    },

    updatePreview() { 
      $('#preview').srcdoc = this.editor.getValue(); 
    },
    
    updateOutline() { 
      Outline.build($('#nav-filter').value, false, this.editor.getValue()); 
    }
  };

  window.App = App; window.Tabs = Tabs;
  window.addEventListener('load', () => App.boot());
})();
