// Hydra Real Estate Bot — Live Simulator, Telemetry Feed, Theme Switcher & Onboarding Modal
const BOT_USERNAME = 'hydrasendertelBot';

const SIM_PROPERTIES = {
  BUY: {
    divar: {
      sourceLabel: 'دیوار (Divar)',
      badgeClass: 'badge-divar',
      title: 'آپارتمان ۱۱۵ متری ۲ خواب کلید نخورده',
      city: 'علی‌آباد کتول · خیابان پاسداران',
      price: 4_850_000_000,
      priceText: '۴ میلیارد و ۸۵۰ میلیون تومان',
      area: 115,
      buildYear: '۱۴۰۲',
      specs: ['پارکینگ دارد ✅', 'آسانسور دارد ✅', 'اسکلت بتنی', 'کابینت های‌گلاس'],
      photos: '🖼 آلبوم ۶ تصویری · قیمت متری ۴۲.۱ میلیون'
    },
    sheypoor: {
      sourceLabel: 'شیپور (Sheypoor)',
      badgeClass: 'badge-sheypoor',
      title: 'ویلایی ۲۲۰ متری دربست با سند تک‌برگ',
      city: 'گرگان / علی‌آباد کتول · خیابان فرهنگ',
      price: 5_400_000_000,
      priceText: '۵ میلیارد و ۴۰۰ میلیون تومان',
      area: 140,
      buildYear: '۱۳۹۹',
      specs: ['سند تک‌برگ رسمی', 'حیاط اختصاصی', 'جهت شمالی', 'پکیج و شوفاژ'],
      photos: '🖼 آلبوم ۴ تصویری · بازسازی شده'
    },
    agency: {
      sourceLabel: 'دیوار (املاک)',
      badgeClass: 'badge-gold',
      title: 'آپارتمان ۱۱۰ متری — مشاور املاک ستاره',
      city: 'علی‌آباد کتول · مرکز شهر',
      price: 4_700_000_000,
      priceText: '۴ میلیارد و ۷۰۰ میلیون تومان',
      area: 110,
      buildYear: '۱۴۰۱',
      specs: ['⚠️ کلمه کلیدی: مشاور املاک', 'business_type: real_estate'],
      photos: '🚫 شناسایی خودکار آگهی بنگاهی'
    }
  },
  RENT: {
    divar: {
      sourceLabel: 'دیوار (Divar)',
      badgeClass: 'badge-divar',
      title: 'آپارتمان ۱۰۰ متری شیک رهن کامل / قابل تبدیل',
      city: 'علی‌آباد کتول · خیابان جنگلده',
      price: 450_000_000,
      priceText: '۴۵۰ میلیون رهن (بدون اجاره)',
      area: 100,
      buildYear: '۱۴۰۱',
      specs: ['پارکینگ اختصاصی ✅', 'تخلیه فوری', 'انباری دارد ✅', 'کف سرامیک'],
      photos: '🖼 آلبوم ۵ تصویری · آگهی شخصی'
    },
    sheypoor: {
      sourceLabel: 'شیپور (Sheypoor)',
      badgeClass: 'badge-sheypoor',
      title: 'واحد ۱۲۵ متری ۳ خواب طبقه دوم',
      city: 'علی‌آباد کتول · بلوار مزرعه کتول',
      price: 520_000_000,
      priceText: '۳۵۰ میلیون ودیعه + ۵.۱ میلیون اجاره',
      area: 125,
      buildYear: '۱۴۰۰',
      specs: ['آسانسور دارد ✅', 'کولر گازی اسپلیت', '۲ واحدی', 'جهت جنوبی'],
      photos: '🖼 آلبوم ۳ تصویری · رهن معادل ۵۲۰ میلیون'
    },
    agency: {
      sourceLabel: 'شیپور (املاک)',
      badgeClass: 'badge-gold',
      title: 'رهن و اجاره ویلایی — دپارتمان املاک پارس',
      city: 'علی‌آباد کتول · شهرک بهارستان',
      price: 480_000_000,
      priceText: '۴۸۰ میلیون رهن کامل',
      area: 130,
      buildYear: '۱۳۹۷',
      specs: ['⚠️ شناسایی برچسب دپارتمان / مشاور', 'isShopProfile: true'],
      photos: '🚫 حذف از صف انتشار کانال شخصی'
    }
  }
};

function initTheme() {
  const saved = localStorage.getItem('hydra_site_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hydra_site_theme', next);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

function startTelemetryTicker() {
  const rows = Array.from(document.querySelectorAll('.feed-item'));
  if (!rows.length) return;
  let activeIdx = 0;
  setInterval(() => {
    rows.forEach((r, i) => r.classList.toggle('active', i === activeIdx));
    activeIdx = (activeIdx + 1) % rows.length;
  }, 2400);
}

function initSimulator() {
  const dealEl = document.getElementById('simDealGroup');
  const srcEl = document.getElementById('simSourceGroup');
  const budgetSlider = document.getElementById('simBudget');
  const tolSlider = document.getElementById('simTol');
  const antiAgencyCheckbox = document.getElementById('simAntiAgency');
  if (!dealEl || !budgetSlider || !tolSlider) return;

  let deal = 'BUY';
  let source = 'divar';

  function formatToman(val, isRent) {
    if (isRent) return `${Math.round(val / 1_000_000)} میلیون تومان رهن معادل`;
    return `${(val / 1_000_000_000).toFixed(2)} میلیارد تومان`;
  }

  function renderSim() {
    const tol = Number(tolSlider.value);
    const antiAgency = antiAgencyCheckbox.checked;
    const isRent = deal === 'RENT';

    if (isRent && Number(budgetSlider.max) > 2_000_000_000) {
      budgetSlider.min = '200000000';
      budgetSlider.max = '900000000';
      budgetSlider.step = '25000000';
      budgetSlider.value = '500000000';
    } else if (!isRent && Number(budgetSlider.max) <= 2_000_000_000) {
      budgetSlider.min = '2000000000';
      budgetSlider.max = '9000000000';
      budgetSlider.step = '100000000';
      budgetSlider.value = '5000000000';
    }

    const maxBudget = Number(budgetSlider.value);
    document.getElementById('simBudgetVal').textContent = formatToman(maxBudget, isRent);
    document.getElementById('simTolVal').textContent = `±${tol}٪`;

    const pool = SIM_PROPERTIES[deal];
    const item = antiAgency && source === 'agency' ? pool.agency : (pool[source] || pool.divar);

    let eligible = true;
    let score = 96;
    let statusBadge = '🎯 ۹۶٪ تطابق · ارسال به کانال';
    let badgeTone = 'badge-ok';

    if (item === pool.agency && antiAgency) {
      eligible = false;
      score = 0;
      statusBadge = '🛡 مسدود شده توسط فیلتر ضداملاک';
      badgeTone = 'badge-divar';
    } else {
      const upper = maxBudget * (1 + tol / 100);
      if (item.price > upper) {
        eligible = false;
        score = 38;
        statusBadge = '⛔ خارج از سقف بودجه + تلورانس';
        badgeTone = 'badge-gold';
      } else if (item.price > maxBudget) {
        const overRatio = (item.price - maxBudget) / (upper - maxBudget + 1);
        score = Math.max(66, Math.round(92 - overRatio * 24));
        statusBadge = `🎯 ${score}٪ تطابق (در بازه تلورانس ±${tol}٪)`;
        badgeTone = 'badge-gold';
      } else {
        score = 98;
        statusBadge = '🎯 ۹۸٪ تطابق · ایده‌آل و آماده ارسال';
      }
    }

    document.getElementById('cardSourceBadge').className = `badge ${item.badgeClass}`;
    document.getElementById('cardSourceBadge').textContent = item.sourceLabel;
    document.getElementById('cardScoreBadge').className = `badge ${badgeTone}`;
    document.getElementById('cardScoreBadge').textContent = statusBadge;
    document.getElementById('cardTitle').textContent = item.title;
    document.getElementById('cardCity').textContent = `📍 ${item.city}  ·  ${item.photos}`;
    document.getElementById('cardPrice').textContent = item.priceText;
    document.getElementById('cardArea').textContent = `${item.area} متر · ساخت ${item.buildYear}`;

    const specsWrap = document.getElementById('cardSpecs');
    specsWrap.innerHTML = item.specs
      .map((s) => `<div class="tg-spec">${s}</div>`)
      .join('');

    const footerNote = document.getElementById('cardDecisionNote');
    footerNote.textContent = eligible
      ? `✅ نمره نهایی ${score} از ۱۰۰ ≥ ۶۵ — آماده صف ارسال تلگرام به @aliabadmelk`
      : 'ℹ️ وضعیت: SKIPPED در D1 (از ارسال آگهی نامرتبط/بنگاهی جلوگیری شد)';
  }

  dealEl.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      dealEl.querySelectorAll('.chip').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      deal = btn.dataset.deal;
      renderSim();
    });
  });

  srcEl.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      srcEl.querySelectorAll('.chip').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      source = btn.dataset.source;
      renderSim();
    });
  });

  budgetSlider.addEventListener('input', renderSim);
  tolSlider.addEventListener('input', renderSim);
  antiAgencyCheckbox.addEventListener('change', renderSim);
  renderSim();
}

function initWizard() {
  const overlay = document.getElementById('wizardOverlay');
  if (!overlay) return;

  const openButtons = document.querySelectorAll('.open-wizard');
  const closeBtn = document.getElementById('wizardClose');
  const submitBtn = document.getElementById('wizardSubmit');

  function openModal(presetPlan) {
    if (presetPlan) {
      const sel = document.getElementById('wizPlan');
      if (sel) sel.value = presetPlan;
    }
    overlay.classList.add('open');
  }

  function closeModal() {
    overlay.classList.remove('open');
  }

  openButtons.forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.plan || ''));
  });
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const ch = (document.getElementById('wizChannel')?.value || '@mychannel').trim();
      const city = document.getElementById('wizCity')?.value || '823';
      const plan = document.getElementById('wizPlan')?.value || 'FREE_TRIAL';
      const url = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(`web_${plan}_${city}_${ch.replace(/[^a-zA-Z0-9@_]/g, '')}`)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      closeModal();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  startTelemetryTicker();
  initSimulator();
  initWizard();
});
