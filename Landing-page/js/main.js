const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const visible = (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;

function on(target, type, handler, options) {
  if (target) target.addEventListener(type, handler, options);
}

function trapFocus(container) {
  const handle = (e) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter(visible);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  on(container, 'keydown', handle);
  return () => container.removeEventListener('keydown', handle);
}

function lockScroll() {
  const scrollY = window.scrollY;
  const prev = {
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    overflow: document.body.style.overflow,
  };
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.position = prev.position;
    document.body.style.top = prev.top;
    document.body.style.width = prev.width;
    document.body.style.overflow = prev.overflow;
    window.scrollTo(0, scrollY);
  };
}

function createLayer({ overlay, initialFocus }) {
  let releaseFocus = null;
  let releaseScroll = null;

  const open = () => {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-active'));
    overlay.removeAttribute('aria-hidden');
    releaseScroll = lockScroll();
    releaseFocus = trapFocus(overlay);
    const target = (initialFocus && overlay.querySelector(initialFocus)) || overlay.querySelector(FOCUSABLE);
    if (target) target.focus({ preventScroll: true });
  };

  const close = () => {
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    if (releaseFocus) releaseFocus();
    if (releaseScroll) releaseScroll();
    releaseFocus = null;
    releaseScroll = null;
    setTimeout(() => {
      if (!overlay.classList.contains('is-active')) overlay.hidden = true;
    }, 400);
  };

  const closeIfActive = () => {
    if (overlay.classList.contains('is-active')) close();
  };

  on(overlay, 'click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') closeIfActive();
  });

  return { open, close, closeIfActive };
}

function initNav() {
  const toggle = document.querySelector('.header__toggle');
  const nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;

  const scrim = document.createElement('div');
  scrim.className = 'nav-scrim';
  document.body.appendChild(scrim);

  let releaseScroll = null;
  let releaseFocus = null;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    nav.classList.toggle('is-active', open);
    scrim.classList.toggle('is-active', open);
    if (open) {
      releaseScroll = lockScroll();
      releaseFocus = trapFocus(nav);
      const first = nav.querySelector(FOCUSABLE);
      if (first) first.focus({ preventScroll: true });
    } else {
      if (releaseFocus) releaseFocus();
      if (releaseScroll) releaseScroll();
      releaseFocus = null;
      releaseScroll = null;
    }
  };

  const isOpen = () => nav.classList.contains('is-active');

  on(toggle, 'click', () => setOpen(!isOpen()));
  on(scrim, 'click', () => setOpen(false));
  on(nav, 'click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });
  on(window, 'resize', () => {
    if (isOpen() && window.innerWidth > 640) setOpen(false);
  });
}

function initHeaderScroll() {
  const header = document.querySelector('.header');
  if (!header) return;
  let ticking = false;
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 50);
    ticking = false;
  };
  on(
    window,
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

function initPopup() {
  const overlay = document.getElementById('graduation-popup');
  if (!overlay) return;
  const layer = createLayer({ overlay, initialFocus: '#popup-close' });
  const delay = Number(overlay.dataset.delay || 1000);
  setTimeout(layer.open, delay);
}

function initBankModal() {
  const overlay = document.getElementById('bank-modal-overlay');
  if (!overlay) return null;
  return createLayer({ overlay, initialFocus: '#bank-modal-close' });
}

async function postToGasAppsScript(form) {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form).entries()) params.append(key, value);
  if (form.dataset.source) params.append('_source', form.dataset.source);
  if (form.dataset.page) params.append('_page', form.dataset.page);

  const response = await fetch(form.action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params.toString(),
    keepalive: true,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!data) throw new Error('Resposta inesperada do servidor');
  if (data.result !== 'success') {
    const detail = data.error && (data.error.message || data.error.name);
    throw new Error(detail || 'O servidor recusou o envio');
  }
  return data;
}

function setFormState(form, state) {
  const btn = form.querySelector('button[type="submit"]');
  const error = form.parentElement.querySelector('[data-form-error]');
  if (btn) {
    btn.disabled = state === 'loading';
    btn.textContent = state === 'loading' ? btn.dataset.labelLoading || 'Enviando...' : btn.dataset.labelIdle || 'Enviar';
  }
  if (error) {
    error.hidden = state !== 'error';
    if (state === 'error') error.focus();
  }
}

function showSuccess(form) {
  const success = form.parentElement.querySelector('.contact-success-msg');
  if (success) {
    form.hidden = true;
    success.classList.add('is-active');
    success.removeAttribute('aria-hidden');
    success.setAttribute('tabindex', '-1');
    success.focus({ preventScroll: true });
    success.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function initRsvpForm() {
  const form = document.getElementById('rsvp-form');
  if (!form) return;

  on(form, 'submit', async (e) => {
    e.preventDefault();
    setFormState(form, 'loading');
    try {
      await postToGasAppsScript(form);
      form.reset();
      showSuccess(form);
    } catch (err) {
      setFormState(form, 'error');
      if (window.console) console.error('[rsvp]', err);
    }
  });
}

function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  on(form, 'submit', async (e) => {
    e.preventDefault();
    setFormState(form, 'loading');
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        let detail = '';
        try {
          const data = await response.json();
          detail = data.error || '';
        } catch (_) {
          detail = '';
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }
      form.reset();
      showSuccess(form);
    } catch (err) {
      setFormState(form, 'error');
      if (window.console) console.error('[contact]', err);
    }
  });

  on(document, 'click', (e) => {
    if (e.target.closest('[data-reset-form]')) {
      const target = document.getElementById(e.target.closest('[data-reset-form]').dataset.resetForm);
      if (!target) return;
      const success = target.parentElement.querySelector('.contact-success-msg');
      target.hidden = false;
      target.reset();
      setFormState(target, 'idle');
      if (success) {
        success.classList.remove('is-active');
        success.setAttribute('aria-hidden', 'true');
      }
      const first = target.querySelector(FOCUSABLE);
      if (first) first.focus();
    }
  });
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    ok ? resolve() : reject(new Error('copy-failed'));
  });
}

function initPixCards() {
  const grid = document.getElementById('gifts-grid');
  if (!grid) return;
  const bankModal = initBankModal();

  const CHECK = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.gift-card__copy-btn');
    if (!btn) return;
    const codeEl = document.getElementById(btn.dataset.pix);
    if (!codeEl) return;

    const original = btn.innerHTML;
    btn.disabled = true;
    try {
      await copyText(codeEl.textContent.trim());
      btn.classList.add('is-copied');
      btn.innerHTML = `${CHECK} Copiado!`;
    } catch (err) {
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.innerHTML = 'Selecione e copie manualmente';
    }
    setTimeout(() => {
      btn.classList.remove('is-copied');
      btn.innerHTML = original;
      btn.disabled = false;
    }, 2600);
    if (bankModal) setTimeout(bankModal.open, 450);
  });
}

function initCompanionCounter() {
  const field = document.getElementById('companions');
  const out = document.getElementById('companions-count');
  if (!field || !out) return;
  const update = () => {
    const names = field.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    out.textContent = String(1 + names.length);
  };
  on(field, 'input', update);
  update();
}

function initBankLinks() {
  const list = document.querySelector('.bank-list');
  if (!list) return;
  let timer = null;

  const clear = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  on(window, 'pagehide', clear);
  on(window, 'pageshow', clear);

  on(list, 'click', (e) => {
    const link = e.target.closest('.bank-btn');
    if (!link) return;
    const app = link.dataset.app;
    const web = link.dataset.web;
    if (!app) return;
    e.preventDefault();
    clear();

    let leftPage = false;
    const start = Date.now();
    timer = setInterval(() => {
      if (document.hidden) {
        leftPage = true;
        clear();
      } else if (Date.now() - start > 1500) {
        clear();
        if (!leftPage && web) window.open(web, '_blank', 'noopener');
      }
    }, 150);

    window.location.href = app;
  });
}

function init() {
  initNav();
  initHeaderScroll();
  initPopup();
  initContactForm();
  initRsvpForm();
  initCompanionCounter();
  initPixCards();
  initBankModal();
  initBankLinks();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
