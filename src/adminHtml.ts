export const ADMIN_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>پنل مدیریت ربات املاک هیدرا | Hydra-Sender Admin</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    :root {
      --bg: #f8fafc;
      --bg-gradient: radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.05) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(14, 165, 233, 0.05) 0px, transparent 50%);
      --surface: #ffffff;
      --surface-card: #ffffff;
      --surface-subtle: #f1f5f9;
      --surface-hover: #e2e8f0;
      --surface-active: #cbd5e1;
      --text: #0f172a;
      --text-secondary: #334155;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --border-focus: #3b82f6;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --primary-light: #eff6ff;
      --primary-glow: rgba(37, 99, 235, 0.25);
      --success: #16a34a;
      --success-light: #dcfce7;
      --warn: #d97706;
      --warn-light: #fef3c7;
      --danger: #dc2626;
      --danger-light: #fee2e2;
      --sheypoor: #0284c7;
      --sheypoor-light: #e0f2fe;
      --divar: #e11d48;
      --divar-light: #ffe4e6;
      --card-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
      --card-shadow-hover: 0 16px 28px -4px rgba(15, 23, 42, 0.1), 0 6px 12px -2px rgba(15, 23, 42, 0.05);
      --input-bg: #ffffff;
      --header-bg: rgba(255, 255, 255, 0.88);
      --dialog-backdrop: rgba(15, 23, 42, 0.65);
      --code-bg: #f1f5f9;
      --code-text: #0f172a;
      --badge-muted-bg: #f1f5f9;
      --badge-muted-text: #475569;
    }
    [data-theme="dark"] {
      --bg: #090d16;
      --bg-gradient: radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(99, 102, 241, 0.07) 0px, transparent 50%);
      --surface: #111827;
      --surface-card: #151f32;
      --surface-subtle: #0f172a;
      --surface-hover: #1e293b;
      --surface-active: #334155;
      --text: #f8fafc;
      --text-secondary: #cbd5e1;
      --text-muted: #94a3b8;
      --border: #26334d;
      --border-focus: #38bdf8;
      --primary: #38bdf8;
      --primary-hover: #0284c7;
      --primary-light: #082f49;
      --primary-glow: rgba(56, 189, 248, 0.35);
      --success: #34d399;
      --success-light: rgba(16, 185, 129, 0.16);
      --warn: #fbbf24;
      --warn-light: rgba(245, 158, 11, 0.16);
      --danger: #f87171;
      --danger-light: rgba(239, 68, 68, 0.16);
      --sheypoor: #38bdf8;
      --sheypoor-light: rgba(56, 189, 248, 0.16);
      --divar: #fb7185;
      --divar-light: rgba(244, 63, 94, 0.16);
      --card-shadow: 0 8px 24px -2px rgba(0, 0, 0, 0.5);
      --card-shadow-hover: 0 20px 36px -4px rgba(0, 0, 0, 0.65);
      --input-bg: #0f172a;
      --header-bg: rgba(17, 24, 39, 0.88);
      --dialog-backdrop: rgba(0, 0, 0, 0.85);
      --code-bg: #0f172a;
      --code-text: #38bdf8;
      --badge-muted-bg: #1e293b;
      --badge-muted-text: #94a3b8;
    }
    * {
      box-sizing: border-box;
      font-family: 'Vazirmatn', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    html, body {
      margin: 0; padding: 0; min-height: 100vh;
      background: var(--bg); background-image: var(--bg-gradient);
      color: var(--text); line-height: 1.6;
      transition: background-color 0.25s ease, color 0.25s ease;
      -webkit-font-smoothing: antialiased;
    }
    header {
      background: var(--header-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border); padding: 0.85rem 1.75rem;
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;
      position: sticky; top: 0; z-index: 100;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      transition: background-color 0.25s ease, border-color 0.25s ease;
    }
    header h1 {
      margin: 0; font-size: 1.25rem; font-weight: 800; color: var(--text);
      display: flex; align-items: center; gap: 0.6rem;
      background: linear-gradient(135deg, var(--primary), #818cf8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .header-controls { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .theme-toggle-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 38px; height: 38px; padding: 0; border-radius: 50%; font-size: 1.15rem; cursor: pointer;
      background: var(--surface-subtle); border: 1px solid var(--border); color: var(--text);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .theme-toggle-btn:hover {
      background: var(--surface-hover); transform: rotate(45deg) scale(1.08);
      border-color: var(--primary);
    }
    nav[role="tablist"] {
      display: flex; gap: 0.35rem; background: var(--surface);
      padding: 0.5rem 1.75rem; border-bottom: 1px solid var(--border);
      overflow-x: auto; scrollbar-width: none;
      transition: background-color 0.25s ease, border-color 0.25s ease;
    }
    nav[role="tablist"]::-webkit-scrollbar { display: none; }
    nav[role="tablist"] button {
      background: transparent; border: none; border-bottom: 3px solid transparent;
      padding: 0.65rem 1.1rem; cursor: pointer; font-weight: 600; color: var(--text-muted); font-size: 0.92rem;
      white-space: nowrap; border-radius: 0.5rem 0.5rem 0 0;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    nav[role="tablist"] button[aria-selected="true"] {
      color: var(--primary); border-bottom-color: var(--primary);
      background: var(--primary-light);
    }
    nav[role="tablist"] button:hover {
      color: var(--text); background: var(--surface-hover);
    }
    main {
      max-width: 1320px; margin: 1.5rem auto; padding: 0 1.5rem;
    }
    #main-content > div {
      animation: tabEntrance 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes tabEntrance {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .kpi-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.1rem; margin-bottom: 1.5rem;
    }
    .card {
      background: var(--surface-card); border: 1px solid var(--border); border-radius: 0.85rem;
      padding: 1.35rem; margin-bottom: 1.35rem; box-shadow: var(--card-shadow);
      position: relative; overflow: hidden;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .card:hover {
      box-shadow: var(--card-shadow-hover);
      border-color: rgba(56, 189, 248, 0.3);
      transform: translateY(-2px);
    }
    .kpi-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--primary), #818cf8);
    }
    .kpi-card:nth-child(2)::before { background: linear-gradient(90deg, #10b981, #06b6d4); }
    .kpi-card:nth-child(3)::before { background: linear-gradient(90deg, #8b5cf6, #ec4899); }
    .kpi-card:nth-child(4)::before { background: linear-gradient(90deg, #f59e0b, #ef4444); }
    .kpi-card:nth-child(5)::before { background: linear-gradient(90deg, #3b82f6, #10b981); }
    .kpi-title { font-size: 0.84rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem; }
    .kpi-val { font-size: 2rem; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.875rem; }
    th, td { padding: 0.8rem 0.85rem; text-align: right; }
    th {
      background: var(--surface-subtle); font-weight: 700; color: var(--text-secondary);
      border-bottom: 2px solid var(--border); font-size: 0.82rem;
    }
    th:first-child { border-top-right-radius: 0.5rem; }
    th:last-child { border-top-left-radius: 0.5rem; }
    td { border-bottom: 1px solid var(--border); color: var(--text); }
    tr:hover td { background: var(--surface-hover); }
    .btn {
      background: var(--primary); color: #fff; border: none; border-radius: 0.5rem;
      padding: 0.55rem 1rem; cursor: pointer; font-size: 0.85rem; font-weight: 700;
      display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 2px 4px var(--primary-glow);
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 4px 8px var(--primary-glow); }
    .btn:active { transform: translateY(0); }
    .btn-outline {
      background: transparent; color: var(--primary); border: 1.5px solid var(--primary);
      box-shadow: none;
    }
    .btn-outline:hover { background: var(--primary-light); }
    .btn-sm { padding: 0.3rem 0.65rem; font-size: 0.78rem; border-radius: 0.4rem; }
    .btn-danger { background: var(--danger); color: #fff; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.25); }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success { background: var(--success); color: #fff; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.25); }
    .btn-success:hover { background: #15803d; }
    .badge {
      padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700;
      display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap;
    }
    .badge-live { background: var(--success-light); color: var(--success); border: 1px solid var(--success); }
    .badge-backfill { background: var(--warn-light); color: var(--warn); border: 1px solid var(--warn); }
    .badge-warn { background: var(--warn-light); color: var(--warn); border: 1px solid var(--warn); }
    .badge-danger { background: var(--danger-light); color: var(--danger); border: 1px solid var(--danger); }
    .badge-muted { background: var(--badge-muted-bg); color: var(--badge-muted-text); border: 1px solid var(--border); }
    .badge-sheypoor { background: var(--sheypoor-light); color: var(--sheypoor); border: 1.5px solid var(--sheypoor); font-weight: 800; }
    .badge-divar { background: var(--divar-light); color: var(--divar); border: 1.5px solid var(--divar); font-weight: 800; }
    dialog {
      background: var(--surface); color: var(--text);
      border: 1px solid var(--border); border-radius: 0.85rem; padding: 1.75rem;
      max-width: 800px; width: 95%; max-height: 90vh; overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    dialog[open] { animation: modalEntrance 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes modalEntrance {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    dialog::backdrop { background: var(--dialog-backdrop); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.95rem; margin-bottom: 1rem; }
    @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
    .form-group label { font-size: 0.84rem; font-weight: 700; color: var(--text); }
    input, select, textarea {
      padding: 0.6rem 0.8rem; border: 1.5px solid var(--border); border-radius: 0.5rem;
      font-size: 0.875rem; background: var(--input-bg); color: var(--text);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }
    code {
      background: var(--code-bg); color: var(--code-text);
      padding: 0.15rem 0.4rem; border-radius: 0.35rem; font-size: 0.82rem; font-family: monospace;
      border: 1px solid var(--border);
    }
    #toast-region {
      position: fixed; bottom: 1.5rem; left: 1.5rem; background: #0f172a; color: #fff;
      padding: 0.85rem 1.4rem; border-radius: 0.6rem; display: none; z-index: 99999;
      box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.35); font-size: 0.88rem; font-weight: 600;
      animation: tabEntrance 0.25s ease-out;
    }
    .telegram-card-preview {
      background: #182533; color: #f5f5f5; border-radius: 0.75rem; padding: 1.35rem;
      font-family: 'Vazirmatn', system-ui, -apple-system, sans-serif; line-height: 1.7; white-space: pre-wrap;
      direction: rtl; text-align: right; margin-top: 1rem; border: 1px solid #2b3b4d; font-size: 0.9rem;
    }
    .telegram-btn-preview {
      display: inline-block; background: #2b5278; color: #fff; text-decoration: none;
      padding: 0.55rem 1rem; border-radius: 0.45rem; margin-top: 0.75rem; font-size: 0.85rem; font-weight: 700;
      transition: background 0.15s ease;
    }
    .telegram-btn-preview:hover { background: #3b6b99; }
    .score-box {
      display: inline-flex; align-items: center; justify-content: center;
      width: 52px; height: 52px; border-radius: 50%; font-weight: 800; font-size: 1.15rem;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    }
    .score-box.pass { background: var(--success-light); color: var(--success); border: 2px solid var(--success); }
    .score-box.fail { background: var(--danger-light); color: var(--danger); border: 2px solid var(--danger); }
    .actions-cell { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
    .empty-state { text-align: center; padding: 3rem 1rem; color: var(--text-muted); font-weight: 500; }
    #rule-map, #sim-map {
      height: 270px; width: 100%; border-radius: 0.6rem; border: 1px solid var(--border);
      margin-top: 0.4rem; z-index: 1;
    }
    .map-controls-bar { display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 0.4rem; }
    /* Live Activity Feed Styles & Animations */
    .live-pulse-dot {
      display: inline-block; width: 11px; height: 11px; border-radius: 50%;
      background: #22c55e; position: relative;
      animation: pulseGlow 2s infinite;
    }
    @keyframes pulseGlow {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.75); }
      70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    .activity-row-new {
      animation: newRowFlash 2.5s ease-out;
    }
    @keyframes newRowFlash {
      0% { background: rgba(56, 189, 248, 0.35); }
      100% { background: transparent; }
    }
    .filter-chip {
      padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700;
      cursor: pointer; border: 1.5px solid var(--border); background: var(--surface-subtle); color: var(--text-muted);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .filter-chip:hover {
      background: var(--surface-hover); color: var(--text); border-color: var(--primary);
    }
    .filter-chip.active {
      background: var(--primary); color: #fff; border-color: var(--primary);
      box-shadow: 0 2px 6px var(--primary-glow);
    }
    /* Adaptive UI Box Cards for Forms & Modals */
    .box-info {
      background: var(--primary-light); border: 1.5px solid var(--border);
      border-radius: 0.6rem; padding: 0.95rem; margin-bottom: 1rem;
    }
    .box-info h4 { margin: 0 0 0.4rem 0; font-size: 0.9rem; color: var(--primary); font-weight: 700; }
    .box-danger {
      background: var(--danger-light); border: 1.5px solid var(--danger);
      border-radius: 0.6rem; padding: 0.95rem; margin-bottom: 1rem;
    }
    .box-danger h4 { margin: 0 0 0.4rem 0; font-size: 0.9rem; color: var(--danger); font-weight: 700; }
    .box-danger label { color: var(--danger); }
    .box-neutral {
      background: var(--surface-subtle); border: 1.5px solid var(--border);
      border-radius: 0.6rem; padding: 0.95rem; margin-bottom: 1rem;
    }
    .box-neutral h4 { margin: 0 0 0.4rem 0; font-size: 0.9rem; color: var(--text); font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <h1>🏢 پنل هوشمند ربات املاک هیدرا</h1>
    <div class="header-controls">
      <span id="api-connection-badge" class="badge badge-backfill">در انتظار اتصال...</span>
      <button class="btn btn-outline btn-sm" onclick="triggerCronTick()" title="اجرای فوری بررسی و ارسال آگهی‌ها">⚡ اجرای کرون‌تیک</button>
      <button class="btn btn-outline btn-sm" onclick="openAuthDialog()">🔑 تنظیمات اتصال و توکن</button>
      <button class="theme-toggle-btn" id="theme-toggle" onclick="toggleTheme()" title="تغییر حالت تاریک / روشن">🌓</button>
    </div>
  </header>

  <!-- Auth Settings Dialog -->
  <dialog id="auth-dialog">
    <h3 style="margin-top:0;">تنظیمات اتصال به سرور Worker و دیتابیس</h3>
    <div class="form-group" style="margin-bottom:0.75rem;">
      <label>آدرس سرور Worker (API Base URL):</label>
      <input type="url" id="cfg-worker-url" value="https://hydra-bot.a77aslani.workers.dev" />
    </div>
    <div class="form-group" style="margin-bottom:1rem;">
      <label>توکن ادمین سیستم (ADMIN_MASTER_TOKEN):</label>
      <input type="password" id="cfg-admin-token" placeholder="توکن امنیتی ادمین را وارد کنید..." />
    </div>
    <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
      <button class="btn" onclick="saveAuthConfig()">ذخیره و اتصال</button>
      <button class="btn btn-outline" onclick="document.getElementById('auth-dialog').close()">انصراف</button>
    </div>
  </dialog>

  <!-- Rule Add / Edit Dialog -->
  <dialog id="rule-dialog">
    <h3 id="rule-dialog-title" style="margin-top:0;">تعریف فیلتر دو مرحله‌ای هوشمند (دیوار و شیپور)</h3>
    <form id="rule-form" onsubmit="submitRuleForm(event)">
      <input type="hidden" id="r-edit-id" value="" />

      <!-- Data Sources: Divar & Sheypoor -->
      <div style="background:var(--surface-subtle); padding:0.85rem; border-radius:0.5rem; margin-bottom:1rem; border:1px solid var(--border);">
        <h4 style="margin:0 0 0.4rem 0; font-size:0.88rem; color:var(--text);">📡 منابع استخراج آگهی (Data Sources):</h4>
        <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 0.6rem 0;">
          سامانه‌های مورد نظر جهت پایش، ارزیابی و استخراج آگهی‌های این فیلتر را انتخاب کنید:
        </p>
        <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:0.45rem; font-size:0.86rem; font-weight:600; cursor:pointer;">
            <input type="checkbox" id="r-source-divar" checked />
            <span style="color:var(--divar); font-weight:700;">🟢 سامانه دیوار (Divar)</span>
          </label>
          <label style="display:flex; align-items:center; gap:0.45rem; font-size:0.86rem; font-weight:600; cursor:pointer;">
            <input type="checkbox" id="r-source-sheypoor" checked />
            <span style="color:var(--sheypoor); font-weight:700;">🔵 سامانه شیپور (Sheypoor)</span>
          </label>
        </div>
      </div>
      
      <!-- Core Information -->
      <div class="form-grid">
        <div class="form-group">
          <label>عنوان فیلتر:</label>
          <input type="text" id="r-name" required placeholder="مثلاً: آپارتمان شخصی علی‌آباد کتول" />
        </div>
        <div class="form-group">
          <label>کانال تلگرام مقصد (@channel یا شناسه عددی):</label>
          <input type="text" id="r-channel" list="channel-datalist" required placeholder="@aliabadmelk" />
          <datalist id="channel-datalist"></datalist>
          <small style="color:var(--text-muted); font-size:0.75rem;">می‌توانید کانال را تایپ کنید یا از کانال‌های متصل انتخاب نمایید.</small>
        </div>
        <div class="form-group">
          <label>نوع معامله و ملک (Stage 1):</label>
          <select id="r-category">
            <option value="apartment-sell|BUY|APARTMENT">فروش آپارتمان مسکونی (apartment-sell)</option>
            <option value="apartment-rent|RENT|APARTMENT">رهن و اجاره آپارتمان (apartment-rent)</option>
            <option value="buy-residential|BUY|ALL_RESIDENTIAL">فروش مسکونی / ویلایی / کلنگی (buy-residential)</option>
            <option value="residential-rent|RENT|ALL_RESIDENTIAL">رهن و اجاره مسکونی / ویلا (residential-rent)</option>
            <option value="buy-commercial-property|BUY|COMMERCIAL">فروش تجاری خدماتی / مغازه (buy-commercial-property)</option>
            <option value="rent-commercial-property|RENT|COMMERCIAL">اجاره تجاری / مغازه (rent-commercial-property)</option>
          </select>
        </div>
        <div class="form-group">
          <label>کد شهر دیوار (۸۲۳ = علی‌آباد کتول، ۱ = تهران):</label>
          <input type="text" id="r-city-id" value="823" placeholder="823" />
        </div>
        <div class="form-group">
          <label>حداکثر بودجه خرید / ودیعه رهن (تومان):</label>
          <input type="number" id="r-max-budget" value="10000000000" />
        </div>
        <div class="form-group">
          <label>حداکثر اجاره ماهانه (تومان - ویژه اجاره):</label>
          <input type="number" id="r-max-rent" value="0" />
        </div>
        <div class="form-group">
          <label>بازه متراژ (حداقل - حداکثر متر مربع):</label>
          <div style="display:flex; gap:0.35rem;">
            <input type="number" id="r-min-area" placeholder="حداقل (75)" value="75" style="width:50%" />
            <input type="number" id="r-max-area" placeholder="حداکثر (250)" value="250" style="width:50%" />
          </div>
        </div>
        <div class="form-group">
          <label>درصد تلورانس بودجه و متراژ (۱۰٪ تا ۱۵٪):</label>
          <select id="r-tolerance">
            <option value="0.10">۱۰٪ تلورانس</option>
            <option value="0.12">۱۲٪ تلورانس</option>
            <option value="0.15" selected>۱۵٪ تلورانس (پیشنهادی)</option>
          </select>
        </div>
        <div class="form-group">
          <label>حداقل امتیاز تطابق (Match Score %):</label>
          <input type="number" id="r-min-score" min="40" max="100" value="65" />
        </div>
        <div class="form-group">
          <label>سقف سن آگهی در دیوار (ساعت گذشته):</label>
          <input type="number" id="r-max-age" min="1" max="720" value="24" title="فقط آگهی‌های ۲۴ ساعت گذشته دیوار ارسال شوند" />
        </div>
      </div>

      <!-- Feature 1: Map Polygon Boundary -->
      <div class="box-neutral">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <h4>🗺 تعیین محدوده جغرافیایی خط‌کشی‌شده روی نقشه (Polygon):</h4>
          <span id="polygon-status-badge" class="badge badge-muted">بدون مرزبندی (کل شهر)</span>
        </div>
        <p style="font-size:0.8rem; color:var(--text-muted); margin:0.25rem 0 0.5rem 0;">
          روی نقشه کلیک کنید تا رأس‌های محدوده مورد نظر (مانند نقشه دیوار در علی‌آباد کتول و مزرعه کتول) ترسیم شوند.
        </p>
        <div id="rule-map"></div>
        <div class="map-controls-bar">
          <div style="display:flex; gap:0.35rem;">
            <button type="button" class="btn btn-outline btn-sm" onclick="clearRulePolygon()">🗑 حذف مرزبندی</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="centerMapOnAliabad()">🎯 مرکز علی‌آباد کتول</button>
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">با کلیک مکرر روی نقشه چندضلعی دلخواه خود را رسم کنید.</span>
        </div>
        <textarea id="r-polygon-json" style="width:100%; height:55px; font-size:0.75rem; font-family:monospace; margin-top:0.4rem; display:none;" placeholder="مختصات چندضلعی [[lat, lon], ...]"></textarea>
      </div>

      <!-- Feature 2: Anti-Agency Filter -->
      <div class="box-danger">
        <h4>🚫 فیلتر حذف آگهی‌های دلال‌ها، املاک و مشاورین (فقط شخصی مالک):</h4>
        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.875rem; font-weight:600; cursor:pointer;">
          <input type="checkbox" id="r-exclude-agency" checked />
          عدم ارسال آگهی‌های دارای کلمات املاک، مشاور، بنگاه، دپارتمان، همکار و... (فقط آگهی‌های شخصی مالک)
        </label>
        <div class="form-group" style="margin-top:0.5rem;">
          <label style="font-size:0.78rem;">کلمات کلیدی ممنوعه (جداشده با کاما):</label>
          <input type="text" id="r-negative-words" value="املاک, مشاور, مشاورین, بنگاه, دپارتمان, دفتر املاک, همکار, همکاران, کمیسیون, آژانس املاک, کارگزاری" />
        </div>
      </div>

      <!-- Feature 3: Stage 2 Features -->
      <div class="box-neutral">
        <h4>فیلترهای مرحله دوم (امکانات، اسکلت، جهت):</h4>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:0.6rem;">
          <label><input type="checkbox" id="r-parking" checked /> پارکینگ الزامی</label>
          <label><input type="checkbox" id="r-elevator" checked /> آسانسور الزامی</label>
          <label><input type="checkbox" id="r-storage" checked /> انباری الزامی</label>
          <label><input type="checkbox" id="r-balcony" /> بالکن الزامی</label>
        </div>
        <div class="form-grid" style="margin-bottom:0;">
          <div class="form-group">
            <label>نوع اسکلت سازه:</label>
            <select id="r-skeleton">
              <option value="">فرقی ندارد (همه)</option>
              <option value="CONCRETE">بتنی (CONCRETE)</option>
              <option value="STEEL">فلزی (STEEL)</option>
            </select>
          </div>
          <div class="form-group">
            <label>جهت ساختمان:</label>
            <select id="r-direction">
              <option value="">همه جهات</option>
              <option value="NORTH">شمالی</option>
              <option value="SOUTH">جنوبی</option>
              <option value="DUAL">دوکله / دو نبش</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Feature 4: Telegram Inline Keyboard Buttons -->
      <div class="box-info">
        <h4>🔘 دکمه‌های شیشه‌ای زیر پست تلگرام (Inline Buttons):</h4>
        <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 0.6rem 0;">
          دکمه‌های مورد نظر برای نمایش در انتهای پست‌های ارسالی به کانال تلگرام را انتخاب کنید:
        </p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.6rem;">
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:500; cursor:pointer;">
            <input type="checkbox" id="r-btn-divar" checked />
            🔗 مشاهده آگهی در دیوار
          </label>
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:500; cursor:pointer;">
            <input type="checkbox" id="r-btn-map" checked />
            🗺 موقعیت روی نقشه
          </label>
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:500; cursor:pointer;">
            <input type="checkbox" id="r-btn-score" checked />
            📊 درصد تطابق
          </label>
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:500; cursor:pointer;">
            <input type="checkbox" id="r-btn-contact" checked />
            📞 تماس با ما
          </label>
        </div>
      </div>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button type="submit" class="btn" id="btn-save-rule">🚀 ذخیره فیلتر</button>
        <button type="button" class="btn btn-outline" onclick="document.getElementById('rule-dialog').close()">انصراف</button>
      </div>
    </form>
  </dialog>

  <!-- Channel Add Dialog -->
  <dialog id="channel-dialog">
    <h3 style="margin-top:0;">اتصال کانال تلگرام جدید</h3>
    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:-0.5rem;">
      توجه: قبل از اتصال، ابتدا ربات را در کانال خود مدیر (Admin) کرده و مجوز ارسال پیام (Post Messages) بدهید.
    </p>
    <form id="channel-form" onsubmit="submitChannelForm(event)">
      <div class="form-group" style="margin-bottom:0.75rem;">
        <label>شناسه چت یا آی‌دی عمومی کانال:</label>
        <input type="text" id="ch-chat-id" required placeholder="@aliabadmelk یا -100xxxxxxxxxx" />
      </div>
      <div class="form-group" style="margin-bottom:1rem;">
        <label>عنوان نمایشی کانال:</label>
        <input type="text" id="ch-title" placeholder="مثلاً: املاک امیران علی‌آباد کتول" />
      </div>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button type="submit" class="btn">ثبت و اتصال کانال</button>
        <button type="button" class="btn btn-outline" onclick="document.getElementById('channel-dialog').close()">انصراف</button>
      </div>
    </form>
  </dialog>

  <!-- Subscription Grant Dialog -->
  <dialog id="sub-dialog">
    <h3 style="margin-top:0;">اعطا / تمدید اشتراک کاربر</h3>
    <form id="sub-form" onsubmit="submitSubForm(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>شناسه عددی تلگرام کاربر (Telegram ID):</label>
          <input type="number" id="sub-tg-id" required placeholder="7309329010" />
        </div>
        <div class="form-group">
          <label>نقش در سیستم (Role):</label>
          <select id="sub-role">
            <option value="USER">کاربر عادی (USER)</option>
            <option value="ADMIN">مدیر (ADMIN)</option>
            <option value="SUPERADMIN">مدیر ارشد (SUPERADMIN)</option>
          </select>
        </div>
        <div class="form-group">
          <label>پلن اشتراک:</label>
          <select id="sub-plan-id">
            <option value="FREE_TRIAL">تست رایگان (۳ روزه)</option>
            <option value="BASIC_MONTH">پایه ماهانه (شخصی - ۳۰ روزه)</option>
            <option value="PRO_MONTH" selected>حرفه‌ای مشاورین املاک (۳۰ روزه)</option>
            <option value="AGENCY_VIP">ویژه آژانس‌های املاک (۹۰ روزه)</option>
          </select>
        </div>
        <div class="form-group">
          <label>مدت اعتبار (روز):</label>
          <input type="number" id="sub-duration-days" value="30" min="1" max="365" />
        </div>
      </div>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button type="submit" class="btn">اعطای اشتراک</button>
        <button type="button" class="btn btn-outline" onclick="document.getElementById('sub-dialog').close()">انصراف</button>
      </div>
    </form>
  </dialog>

  <!-- Navigation Tab Bar -->
  <nav role="tablist" aria-label="بخش‌های پنل مدیریت">
    <button role="tab" id="tab-overview" aria-selected="true" onclick="switchTab('overview')">📊 داشبورد و وضعیت صف</button>
    <button role="tab" id="tab-rules" aria-selected="false" onclick="switchTab('rules')">🎯 فیلترهای ۲ مرحله‌ای و نقشه</button>
    <button role="tab" id="tab-channels" aria-selected="false" onclick="switchTab('channels')">📢 کانال‌های تلگرام (@channel)</button>
    <button role="tab" id="tab-subscriptions" aria-selected="false" onclick="switchTab('subscriptions')">💎 کاربران و اشتراک‌ها</button>
    <button role="tab" id="tab-simulator" aria-selected="false" onclick="switchTab('simulator')">🧪 تست قالب جدید و شبیه‌ساز</button>
  </nav>

  <!-- Main Container -->
  <main>
    <div id="main-content"></div>
  </main>

  <div id="toast-region" aria-live="polite"></div>

  <script>
    const state = {
      workerUrl: localStorage.getItem('hydra_worker_url') || window.location.origin,
      token: localStorage.getItem('hydra_admin_token') || 'hydra_admin_master_778899',
      activeTab: 'overview',
      overview: { activeSubscriptions: 0, activeChannels: 0, backfillRules: 0, liveRules: 0, adsSentToday: 0 },
      rules: [],
      recentSent: [],
      channels: [],
      users: [],
      plans: []
    };

    // Global Leaflet map variables
    let ruleMap = null;
    let rulePolygonLayer = null;
    let rulePoints = [];

    function notify(msg) {
      const el = document.getElementById('toast-region');
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function openAuthDialog() {
      document.getElementById('cfg-worker-url').value = state.workerUrl;
      document.getElementById('cfg-admin-token').value = state.token;
      document.getElementById('auth-dialog').showModal();
    }

    async function saveAuthConfig() {
      state.workerUrl = document.getElementById('cfg-worker-url').value.replace(/\\/$/, '');
      state.token = document.getElementById('cfg-admin-token').value.trim();
      localStorage.setItem('hydra_worker_url', state.workerUrl);
      localStorage.setItem('hydra_admin_token', state.token);
      document.getElementById('auth-dialog').close();
      await fetchCurrentTabData();
      notify('تنظیمات اتصال سرور و توکن ذخیره شد.');
    }

    async function apiCall(path, options = {}) {
      const res = await fetch(state.workerUrl + path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.token,
          ...(options.headers || {})
        }
      });
      if (!res.ok) {
        let errText = 'HTTP ' + res.status;
        try {
          const errJson = await res.json();
          if (errJson.error) errText = errJson.error;
        } catch (_) {}
        throw new Error(errText);
      }
      return res.json();
    }

    async function triggerCronTick() {
      try {
        notify('در حال ارسال درخواست اجرای Cron Tick...');
        await apiCall('/api/internal/cron-tick', { method: 'POST' });
        notify('✅ اجرای کرون با موفقیت آغاز شد.');
        setTimeout(fetchCurrentTabData, 2500);
      } catch (e) {
        notify('خطا در اجرای کرون: ' + e.message);
      }
    }

    function switchTab(tabId) {
      if (livePollTimer) {
        clearInterval(livePollTimer);
        livePollTimer = null;
      }
      if (activityObserver) {
        activityObserver.disconnect();
        activityObserver = null;
      }
      state.activeTab = tabId;
      document.querySelectorAll('nav[role="tablist"] button').forEach(b => {
        b.setAttribute('aria-selected', b.id === 'tab-' + tabId ? 'true' : 'false');
      });
      fetchCurrentTabData();
    }

    async function fetchCurrentTabData() {
      const badge = document.getElementById('api-connection-badge');
      try {
        if (state.activeTab === 'overview') {
          const data = await apiCall('/api/admin/overview');
          state.overview = data.overview || state.overview;
          state.rules = data.rules || [];
          state.recentSent = data.recentSent || [];
        } else if (state.activeTab === 'rules') {
          const data = await apiCall('/api/admin/rules');
          state.rules = data.rules || [];
        } else if (state.activeTab === 'channels') {
          const data = await apiCall('/api/admin/channels');
          state.channels = data.channels || [];
        } else if (state.activeTab === 'subscriptions') {
          const data = await apiCall('/api/admin/subscriptions');
          state.users = data.users || [];
          state.plans = data.plans || [];
        }
        badge.textContent = 'متصل به سرور و دیتابیس D1';
        badge.className = 'badge badge-live';
      } catch (err) {
        badge.textContent = 'خطا در ارتباط با سرور: ' + err.message;
        badge.className = 'badge badge-danger';
      }
      renderActiveTab();
    }

    function renderActiveTab() {
      const container = document.getElementById('main-content');
      if (state.activeTab === 'overview') {
        renderOverviewTab(container);
      } else if (state.activeTab === 'rules') {
        renderRulesTab(container);
      } else if (state.activeTab === 'channels') {
        renderChannelsTab(container);
      } else if (state.activeTab === 'subscriptions') {
        renderSubscriptionsTab(container);
      } else if (state.activeTab === 'simulator') {
        renderSimulatorTab(container);
      }
    }

    // TAB 1: OVERVIEW & LIVE ENDLESS ACTIVITY FEED
    let activityState = {
      offset: 0,
      limit: 20,
      total: 0,
      hasMore: true,
      isLoading: false,
      filter: 'ALL',
      latestDiscovered: 0,
      items: []
    };
    let activityObserver = null;
    let livePollTimer = null;

    function renderActivityRow(item, isNew = false) {
      const isSheypoor = String(item.post_token || '').startsWith('sp_');
      const cleanId = String(item.post_token || '').replace(/^sp_/, '');
      const directUrl = isSheypoor
        ? 'https://www.sheypoor.com/v/' + cleanId
        : 'https://divar.ir/v/' + item.post_token;
      const sourceBadge = isSheypoor
        ? '<span class="badge badge-sheypoor">🔵 شیپور</span>'
        : '<span class="badge badge-divar">🟢 دیوار</span>';

      let statusBadge = '';
      if (item.status === 'SENT') {
        statusBadge = '<span class="badge badge-live">🟢 ارسال‌شده</span>';
      } else if (item.status === 'QUEUED') {
        statusBadge = '<span class="badge badge-backfill">🟡 در صف ارسال</span>';
      } else if (item.status === 'SKIPPED') {
        statusBadge = '<span class="badge badge-muted">⚪ رد شده در فیلتر</span>';
      } else {
        statusBadge = '<span class="badge badge-danger">🔴 ناموفق</span>';
      }

      const score = Number(item.match_score) || 0;
      const scoreBadge = score >= 80
        ? '<span class="badge badge-live">' + score + '٪</span>'
        : (score >= 65 ? '<span class="badge badge-warn">' + score + '٪</span>' : '<span class="badge badge-danger">' + score + '٪</span>');

      const timeSec = item.sent_at || item.discovered_at || 0;
      const timeStr = timeSec > 0
        ? new Date(timeSec * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '-';

      const newClass = isNew ? ' class="activity-row-new"' : '';

      return '<tr' + newClass + ' data-status="' + item.status + '">' +
        '<td>' + sourceBadge + '</td>' +
        '<td><a href="' + directUrl + '" target="_blank" style="color:var(--primary); text-decoration:underline; font-weight:600;"><code>' + item.post_token + '</code> ↗</a></td>' +
        '<td>' + (item.rule_name || '-') + '</td>' +
        '<td><code>' + (item.chat_id || '-') + '</code></td>' +
        '<td>' + scoreBadge + '</td>' +
        '<td>' + timeStr + '</td>' +
        '<td>' + statusBadge + '</td>' +
      '</tr>';
    }

    function renderFilteredActivities() {
      const tbody = document.getElementById('activity-table-body');
      if (!tbody) return;
      const filtered = activityState.filter === 'ALL'
        ? activityState.items
        : activityState.items.filter(x => x.status === activityState.filter);

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">هیچ فعالیتی با وضعیت انتخاب‌شده ثبت نشده است.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(item => renderActivityRow(item)).join('');
      }
    }

    function setActivityFilter(filterName) {
      activityState.filter = filterName;
      document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.id === 'chip-' + filterName);
      });
      renderFilteredActivities();
    }

    async function loadMoreActivities(isInitial = false) {
      if (activityState.isLoading || (!activityState.hasMore && !isInitial)) return;
      activityState.isLoading = true;
      const sentinel = document.getElementById('activity-sentinel');
      if (sentinel) sentinel.innerHTML = '<span class="live-pulse-dot" style="margin-left:6px;"></span> در حال بارگذاری فعالیت‌های بیشتر...';

      try {
        const data = await apiCall('/api/admin/activities?offset=' + activityState.offset + '&limit=' + activityState.limit);
        const newItems = data.activities || [];
        activityState.total = data.total || 0;
        activityState.hasMore = data.hasMore === true;
        activityState.offset += newItems.length;

        for (const item of newItems) {
          if (!activityState.items.some(x => x.rule_id === item.rule_id && x.post_token === item.post_token)) {
            activityState.items.push(item);
            if (item.discovered_at > activityState.latestDiscovered) {
              activityState.latestDiscovered = item.discovered_at;
            }
          }
        }

        renderFilteredActivities();

        const counter = document.getElementById('activity-total-counter');
        if (counter) counter.textContent = activityState.items.length + ' از ' + activityState.total + ' فعالیت';

        if (sentinel) {
          if (activityState.hasMore) {
            sentinel.innerHTML = '⬇️ برای مشاهده موارد بیشتر اسکرول کنید';
          } else {
            sentinel.innerHTML = '✅ تمامی فعالیت‌ها بارگذاری شدند (پایان لیست)';
          }
        }
      } catch (err) {
        if (sentinel) sentinel.innerHTML = 'خطا در بارگذاری فعالیت‌ها: ' + err.message;
      } finally {
        activityState.isLoading = false;
      }
    }

    async function pollNewActivities() {
      if (state.activeTab !== 'overview' || activityState.isLoading) return;
      if (activityState.latestDiscovered <= 0) return;

      try {
        const data = await apiCall('/api/admin/activities?since=' + activityState.latestDiscovered);
        const fresh = data.activities || [];
        if (fresh.length > 0) {
          let added = 0;
          const tbody = document.getElementById('activity-table-body');
          for (const item of fresh.reverse()) {
            if (!activityState.items.some(x => x.rule_id === item.rule_id && x.post_token === item.post_token)) {
              activityState.items.unshift(item);
              if (item.discovered_at > activityState.latestDiscovered) {
                activityState.latestDiscovered = item.discovered_at;
              }
              if (tbody && (activityState.filter === 'ALL' || activityState.filter === item.status)) {
                const tempDiv = document.createElement('tbody');
                tempDiv.innerHTML = renderActivityRow(item, true);
                if (tbody.firstChild) {
                  tbody.insertBefore(tempDiv.firstChild, tbody.firstChild);
                } else {
                  tbody.appendChild(tempDiv.firstChild);
                }
              }
              added++;
            }
          }
          if (added > 0) {
            activityState.total += added;
            const counter = document.getElementById('activity-total-counter');
            if (counter) counter.textContent = activityState.items.length + ' از ' + activityState.total + ' فعالیت';
          }
        }
      } catch (_) {}
    }

    function reloadActivities() {
      activityState.offset = 0;
      activityState.total = 0;
      activityState.hasMore = true;
      activityState.items = [];
      activityState.latestDiscovered = 0;
      loadMoreActivities(true);
    }

    function renderOverviewTab(container) {
      container.innerHTML = \`
        <div class="kpi-grid">
          <div class="card kpi-card">
            <div class="kpi-title">کاربران دارای اشتراک فعال</div>
            <div class="kpi-val">\${state.overview.activeSubscriptions}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-title">کانال‌های متصل (@channel)</div>
            <div class="kpi-val">\${state.overview.activeChannels}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-title">فیلترهای لحظه‌ای فعال (LIVE)</div>
            <div class="kpi-val">\${state.overview.liveRules}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-title">فیلترهای در حال آرشیو (BACKFILL)</div>
            <div class="kpi-val">\${state.overview.backfillRules}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-title">آگهی‌های ارسالی امروز (۲۴ ساعت)</div>
            <div class="kpi-val">\${state.overview.adsSentToday}</div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <h3 style="margin:0;">🚀 عملیات سریع سیستم</h3>
            <div style="display:flex; gap:0.5rem;">
              <button class="btn" onclick="openCreateRuleModal()">➕ تعریف فیلتر دو مرحله‌ای جدید</button>
              <button class="btn btn-outline" onclick="triggerCronTick()">⚡ اجرای فوری پایش دیوار و شیپور (Cron Tick)</button>
            </div>
          </div>
          <p style="color:var(--text-muted); font-size:0.875rem; margin:0;">
            سیستم به صورت خودکار هر ۱ دقیقه یک‌بار توسط Cron Trigger آگهی‌های جدید دیوار و شیپور را دریافت کرده و پس از فیلتر محدوده نقشه و حذف املاک به کانال تلگرام ارسال می‌کند.
          </p>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:0.75rem;">
            <div style="display:flex; align-items:center; gap:0.6rem;">
              <span class="live-pulse-dot"></span>
              <h3 style="margin:0;">📋 جریان زنده و آخرین فعالیت‌های ربات (Live Activity Feed)</h3>
              <span id="activity-total-counter" class="badge badge-live">در حال بارگذاری...</span>
            </div>
            <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
              <button class="filter-chip active" id="chip-ALL" onclick="setActivityFilter('ALL')">همه</button>
              <button class="filter-chip" id="chip-SENT" onclick="setActivityFilter('SENT')">🟢 ارسال‌شده</button>
              <button class="filter-chip" id="chip-QUEUED" onclick="setActivityFilter('QUEUED')">🟡 در صف</button>
              <button class="filter-chip" id="chip-SKIPPED" onclick="setActivityFilter('SKIPPED')">⚪ رد شده</button>
              <button class="btn btn-outline btn-sm" onclick="reloadActivities()" title="بروزرسانی مجدد">🔄 تازه‌سازی</button>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>سامانه</th>
                  <th>آگهی و لینک مستقیم</th>
                  <th>نام فیلتر</th>
                  <th>کانال مقصد</th>
                  <th>درصد تطابق</th>
                  <th>زمان</th>
                  <th>وضعیت عملیات</th>
                </tr>
              </thead>
              <tbody id="activity-table-body">
              </tbody>
            </table>
          </div>
          <div id="activity-sentinel" style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">
            در حال بارگذاری فعالیت‌ها...
          </div>
        </div>
      \`;

      reloadActivities();

      if (activityObserver) activityObserver.disconnect();
      activityObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && activityState.hasMore && !activityState.isLoading) {
          loadMoreActivities();
        }
      }, { threshold: 0.1 });

      const sentinel = document.getElementById('activity-sentinel');
      if (sentinel) activityObserver.observe(sentinel);

      if (livePollTimer) clearInterval(livePollTimer);
      livePollTimer = setInterval(pollNewActivities, 6500);
    }

    // TAB 2: RULES
    function renderRulesTab(container) {
      const rows = (state.rules || []).map(r => {
        let polyCount = 0;
        try {
          const p = JSON.parse(r.geo_polygon_json || '[]');
          if (Array.isArray(p)) polyCount = p.length;
        } catch(_) {}

        let sourceBadges = '';
        if (r.source_divar !== 0) sourceBadges += '<span class="badge badge-divar" style="margin-left:4px;">🟢 دیوار</span>';
        if (r.source_sheypoor !== 0) sourceBadges += '<span class="badge badge-sheypoor">🔵 شیپور</span>';
        if (!sourceBadges) sourceBadges = '<span class="badge badge-danger">بدون منبع!</span>';

        return \`
          <tr>
            <td>
              <strong>\${r.name}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">شهر: \${r.city_ids_json === '["823"]' ? 'علی‌آباد کتول' : r.city_ids_json}</div>
              <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">\${sourceBadges}</div>
            </td>
            <td><code>\${r.chat_id || r.channel_id}</code></td>
            <td>\${r.divar_category_slug}</td>
            <td>
              \${r.deal_type === 'RENT' ? 'رهن: ' + (r.max_budget ? (r.max_budget / 1000000).toLocaleString('fa-IR') + ' م' : 'آزاد') : 'بودجه: ' + (r.max_budget ? (r.max_budget / 1000000).toLocaleString('fa-IR') + ' م' : 'آزاد')}
              <br/><span style="font-size:0.78rem; color:var(--text-muted);">\${r.min_area || 0} تا \${r.max_area || '∞'} متر</span>
            </td>
            <td>
              \${polyCount >= 3 ? '<span class="badge badge-live">📍 مرزبندی (' + polyCount + ' نقطه)</span>' : '<span class="badge badge-muted">کل شهر</span>'}
              <br/>
              \${r.exclude_agency !== 0 ? '<span class="badge badge-warn" style="margin-top:0.2rem;">🚫 حذف املاک</span>' : '<span class="badge badge-muted">همه آگهی‌ها</span>'}
            </td>
            <td>
              <span class="badge \${r.phase === 'LIVE' ? 'badge-live' : 'badge-backfill'}">\${r.phase || 'BACKFILL'}</span>
              <div style="font-size:0.75rem; color:var(--text-muted);">سقف سن: \${r.max_post_age_hours || 24} ساعت</div>
            </td>
            <td>
              <span class="badge \${r.is_active ? 'badge-live' : 'badge-danger'}">\${r.is_active ? 'فعال' : 'غیرفعال'}</span>
            </td>
            <td>
              <div class="actions-cell">
                <button class="btn btn-outline btn-sm" onclick="toggleRuleActive('\${r.id}')" title="فعال / غیرفعال">
                  \${r.is_active ? '⏸ غیرفعال' : '▶️ فعال'}
                </button>
                <button class="btn btn-outline btn-sm" onclick="openEditRuleModal('\${r.id}')" title="ویرایش پارامترها">✏️ ویرایش</button>
                <button class="btn btn-outline btn-sm" onclick="resetRuleBackfill('\${r.id}')" title="شروع مجدد دریافت آرشیو">🔄 ریست آرشیو</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRule('\${r.id}')" title="حذف فیلتر">🗑</button>
              </div>
            </td>
          </tr>
        \`;
      }).join('');

      container.innerHTML = \`
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <h3 style="margin:0;">🎯 لیست فیلترهای استخراج و ارسال هوشمند</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0 0 0;">
                پایش دیوار بر اساس بودجه، متراژ، محدوده خط‌کشی‌شده روی نقشه و حذف خودکار مشاورین و آژانس‌های املاک.
              </p>
            </div>
            <button class="btn" onclick="openCreateRuleModal()">➕ تعریف فیلتر دو مرحله‌ای جدید</button>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>نام فیلتر</th>
                  <th>کانال مقصد</th>
                  <th>دسته دیوار</th>
                  <th>بودجه و متراژ</th>
                  <th>محدوده و فیلتر مشاور</th>
                  <th>فاز و سن آگهی</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                \${rows || '<tr><td colspan="8" class="empty-state">هنوز فیلتری تعریف نشده است. با زدن دکمه بالا اولین فیلتر را بسازید.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    // Leaflet Map Logic for Rule Dialog
    function initRuleMap(initialPoints = []) {
      const container = document.getElementById('rule-map');
      if (!container) return;

      if (!ruleMap) {
        // Center on Aliabad Katul (36.9025, 54.8558)
        ruleMap = L.map('rule-map').setView([36.9025, 54.8558], 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(ruleMap);

        ruleMap.on('click', function(e) {
          const lat = parseFloat(e.latlng.lat.toFixed(6));
          const lng = parseFloat(e.latlng.lng.toFixed(6));
          rulePoints.push([lat, lng]);
          updatePolygonDisplay();
        });
      }

      rulePoints = initialPoints;
      updatePolygonDisplay();

      setTimeout(() => {
        if (ruleMap) ruleMap.invalidateSize();
      }, 250);
    }

    function updatePolygonDisplay() {
      if (!ruleMap) return;
      if (rulePolygonLayer) {
        ruleMap.removeLayer(rulePolygonLayer);
        rulePolygonLayer = null;
      }

      const badge = document.getElementById('polygon-status-badge');
      const textarea = document.getElementById('r-polygon-json');

      if (rulePoints.length >= 3) {
        rulePolygonLayer = L.polygon(rulePoints, {
          color: '#2563eb',
          weight: 3,
          fillColor: '#3b82f6',
          fillOpacity: 0.25
        }).addTo(ruleMap);
        ruleMap.fitBounds(rulePolygonLayer.getBounds(), { padding: [20, 20] });
        if (badge) {
          badge.textContent = '📍 ' + rulePoints.length + ' نقطه مرزبندی فعال';
          badge.className = 'badge badge-live';
        }
        if (textarea) textarea.value = JSON.stringify(rulePoints);
      } else if (rulePoints.length > 0) {
        rulePolygonLayer = L.polyline(rulePoints, { color: '#ea580c', weight: 2, dashArray: '5, 5' }).addTo(ruleMap);
        if (badge) {
          badge.textContent = rulePoints.length + ' نقطه تعیین شده (حداقل ۳ رأس نیاز است)';
          badge.className = 'badge badge-warn';
        }
        if (textarea) textarea.value = JSON.stringify(rulePoints);
      } else {
        if (badge) {
          badge.textContent = 'بدون مرزبندی (کل شهر)';
          badge.className = 'badge badge-muted';
        }
        if (textarea) textarea.value = '';
      }
    }

    function clearRulePolygon() {
      rulePoints = [];
      updatePolygonDisplay();
    }

    function centerMapOnAliabad() {
      if (ruleMap) ruleMap.setView([36.9025, 54.8558], 13);
    }

    function updateChannelDatalist() {
      const dl = document.getElementById('channel-datalist');
      if (!dl) return;
      dl.innerHTML = (state.channels || []).map(function(ch) {
        return '<option value="' + ch.chat_id + '">' + (ch.title || ch.chat_id) + '</option>';
      }).join('');
    }

    function openCreateRuleModal() {
      updateChannelDatalist();
      document.getElementById('rule-dialog-title').textContent = 'تعریف فیلتر دو مرحله‌ای دیوار';
      document.getElementById('r-edit-id').value = '';
      document.getElementById('r-name').value = '';
      document.getElementById('r-channel').readOnly = false;
      document.getElementById('r-channel').value = (state.channels && state.channels.length > 0) ? state.channels[0].chat_id : '@aliabadmelk';
      document.getElementById('r-city-id').value = '823';
      document.getElementById('r-max-budget').value = '10000000000';
      document.getElementById('r-max-rent').value = '0';
      document.getElementById('r-min-area').value = '75';
      document.getElementById('r-max-area').value = '250';
      document.getElementById('r-tolerance').value = '0.15';
      document.getElementById('r-min-score').value = '65';
      document.getElementById('r-max-age').value = '24';
      document.getElementById('r-exclude-agency').checked = true;
      document.getElementById('r-negative-words').value = 'املاک, مشاور, مشاورین, بنگاه, دپارتمان, دفتر املاک, همکار, همکاران, کمیسیون, آژانس املاک, کارگزاری';
      document.getElementById('r-parking').checked = true;
      document.getElementById('r-elevator').checked = true;
      document.getElementById('r-storage').checked = true;
      document.getElementById('r-balcony').checked = false;
      document.getElementById('r-skeleton').value = '';
      document.getElementById('r-direction').value = '';
      document.getElementById('r-source-divar').checked = true;
      document.getElementById('r-source-sheypoor').checked = true;
      document.getElementById('r-btn-divar').checked = true;
      document.getElementById('r-btn-map').checked = true;
      document.getElementById('r-btn-score').checked = true;
      document.getElementById('r-btn-contact').checked = true;
      document.getElementById('btn-save-rule').textContent = '🚀 ذخیره فیلتر و شروع پایش';

      document.getElementById('rule-dialog').showModal();
      initRuleMap([]);
    }

    function openEditRuleModal(ruleId) {
      updateChannelDatalist();
      const r = (state.rules || []).find(x => x.id === ruleId);
      if (!r) return;
      document.getElementById('rule-dialog-title').textContent = 'ویرایش فیلتر: ' + r.name;
      document.getElementById('r-edit-id').value = r.id;
      document.getElementById('r-name').value = r.name || '';
      document.getElementById('r-channel').readOnly = false;
      document.getElementById('r-channel').value = r.chat_id || r.channel_id || '';

      const selectCat = document.getElementById('r-category');
      const targetVal = (r.divar_category_slug || '') + '|' + (r.deal_type || '') + '|' + (r.property_type || '');
      for (let i = 0; i < selectCat.options.length; i++) {
        if (selectCat.options[i].value === targetVal) selectCat.selectedIndex = i;
      }

      let cityIds = ['823'];
      try { cityIds = JSON.parse(r.city_ids_json || '["823"]'); } catch(_) {}
      document.getElementById('r-city-id').value = cityIds.join(',');

      document.getElementById('r-max-budget').value = r.max_budget || 0;
      document.getElementById('r-max-rent').value = r.max_rent || 0;
      document.getElementById('r-min-area').value = r.min_area || 0;
      document.getElementById('r-max-area').value = r.max_area || 0;
      document.getElementById('r-tolerance').value = String(r.tolerance_pct || 0.15);
      document.getElementById('r-min-score').value = r.min_match_score || 65;
      document.getElementById('r-max-age').value = r.max_post_age_hours || 24;

      document.getElementById('r-exclude-agency').checked = r.exclude_agency !== 0;
      let negWords = [];
      try { negWords = JSON.parse(r.negative_keywords_json || '[]'); } catch(_) {}
      document.getElementById('r-negative-words').value = negWords.length > 0
        ? negWords.join(', ')
        : 'املاک, مشاور, مشاورین, بنگاه, دپارتمان, دفتر املاک, همکار, همکاران, کمیسیون, آژانس املاک, کارگزاری';

      let stage2 = {};
      try { stage2 = JSON.parse(r.stage2_filters_json || '{}'); } catch(_) {}
      document.getElementById('r-parking').checked = stage2.parking !== false;
      document.getElementById('r-elevator').checked = stage2.elevator !== false;
      document.getElementById('r-storage').checked = stage2.storage !== false;
      document.getElementById('r-balcony').checked = !!stage2.balcony;
      document.getElementById('r-skeleton').value = stage2.skeleton || '';
      document.getElementById('r-direction').value = stage2.direction || '';

      document.getElementById('r-source-divar').checked = r.source_divar !== 0;
      document.getElementById('r-source-sheypoor').checked = r.source_sheypoor !== 0;
      document.getElementById('r-btn-divar').checked = r.show_btn_divar !== 0;
      document.getElementById('r-btn-map').checked = r.show_btn_map !== 0;
      document.getElementById('r-btn-score').checked = r.show_btn_score !== 0;
      document.getElementById('r-btn-contact').checked = r.show_btn_contact !== 0;

      let initialPoints = [];
      try {
        const parsed = JSON.parse(r.geo_polygon_json || '[]');
        if (Array.isArray(parsed)) initialPoints = parsed;
      } catch(_) {}

      document.getElementById('btn-save-rule').textContent = '💾 ذخیره تغییرات';
      document.getElementById('rule-dialog').showModal();
      initRuleMap(initialPoints);
    }

    async function submitRuleForm(e) {
      e.preventDefault();
      const editId = document.getElementById('r-edit-id').value;
      const [slug, dealType, propType] = document.getElementById('r-category').value.split('|');
      const negativeWordsArray = document.getElementById('r-negative-words').value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        name: document.getElementById('r-name').value.trim(),
        channel_chat_id: document.getElementById('r-channel').value.trim(),
        divar_category_slug: slug,
        deal_type: dealType,
        property_type: propType,
        city_ids: document.getElementById('r-city-id').value.split(',').map(s => s.trim()).filter(Boolean),
        max_budget: Number(document.getElementById('r-max-budget').value),
        max_rent: Number(document.getElementById('r-max-rent').value),
        min_area: Number(document.getElementById('r-min-area').value),
        max_area: Number(document.getElementById('r-max-area').value),
        tolerance_pct: Number(document.getElementById('r-tolerance').value),
        min_match_score: Number(document.getElementById('r-min-score').value),
        max_post_age_hours: Number(document.getElementById('r-max-age').value) || 24,
        exclude_agency: document.getElementById('r-exclude-agency').checked ? 1 : 0,
        negative_keywords: negativeWordsArray,
        geo_polygon_json: rulePoints.length >= 3 ? JSON.stringify(rulePoints) : null,
        show_btn_divar: document.getElementById('r-btn-divar').checked ? 1 : 0,
        show_btn_map: document.getElementById('r-btn-map').checked ? 1 : 0,
        show_btn_score: document.getElementById('r-btn-score').checked ? 1 : 0,
        show_btn_contact: document.getElementById('r-btn-contact').checked ? 1 : 0,
        source_divar: document.getElementById('r-source-divar').checked ? 1 : 0,
        source_sheypoor: document.getElementById('r-source-sheypoor').checked ? 1 : 0,
        stage2_filters: {
          parking: document.getElementById('r-parking').checked,
          elevator: document.getElementById('r-elevator').checked,
          storage: document.getElementById('r-storage').checked,
          balcony: document.getElementById('r-balcony').checked,
          skeleton: document.getElementById('r-skeleton').value || undefined,
          direction: document.getElementById('r-direction').value || undefined
        }
      };

      try {
        if (editId) {
          await apiCall('/api/admin/rules/' + editId, { method: 'PUT', body: JSON.stringify(payload) });
          notify('✅ فیلتر با موفقیت ویرایش شد.');
        } else {
          payload.backfill_target_count = 30;
          await apiCall('/api/admin/rules', { method: 'POST', body: JSON.stringify(payload) });
          notify('🚀 فیلتر جدید ثبت شد و فاز پایش آغاز گردید.');
        }
        document.getElementById('rule-dialog').close();
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    async function toggleRuleActive(ruleId) {
      try {
        await apiCall('/api/admin/rules/' + ruleId + '/toggle', { method: 'POST' });
        notify('وضعیت فیلتر تغییر کرد.');
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    async function resetRuleBackfill(ruleId) {
      if (!confirm('آیا مطمئنید می‌خواهید آرشیو این فیلتر از ابتدا دوباره خوانده شود؟')) return;
      try {
        await apiCall('/api/admin/rules/' + ruleId + '/reset-backfill', { method: 'POST' });
        notify('🔄 فاز آرشیو با موفقیت ریست شد.');
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    async function deleteRule(ruleId) {
      if (!confirm('آیا از حذف کامل این فیلتر اطمینان دارید؟')) return;
      try {
        await apiCall('/api/admin/rules/' + ruleId, { method: 'DELETE' });
        notify('🗑 فیلتر با موفقیت حذف شد.');
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    // TAB 3: CHANNELS
    function renderChannelsTab(container) {
      const rows = (state.channels || []).map(ch => \`
        <tr>
          <td>
            <strong>\${ch.title || ch.chat_id}</strong>
            <br/><code>\${ch.chat_id}</code>
          </td>
          <td>\${ch.owner_name || ch.owner_username || ('ID: ' + ch.owner_user_id)}</td>
          <td>\${ch.rule_count || 0} فیلتر</td>
          <td>
            <span class="badge \${ch.bot_is_admin ? 'badge-live' : 'badge-danger'}">
              \${ch.bot_is_admin ? 'ادمین است' : 'نیازمند ادمین'}
            </span>
          </td>
          <td>
            <span class="badge \${ch.is_enabled ? 'badge-live' : 'badge-muted'}">
              \${ch.is_enabled ? 'فعال' : 'غیرفعال'}
            </span>
          </td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-outline btn-sm" onclick="toggleChannel('\${ch.id}')">
                \${ch.is_enabled ? '⏸ غیرفعال' : '▶️ فعال'}
              </button>
              <button class="btn btn-outline btn-sm" onclick="testChannelSend('\${ch.chat_id}')" title="ارسال پیام آزمایشی به این کانال برای اطمینان از دسترسی">
                📨 تست ارسال
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteChannel('\${ch.id}')">🗑 حذف</button>
            </div>
          </td>
        </tr>
      \`).join('');

      container.innerHTML = \`
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <h3 style="margin:0;">📢 کانال‌های متصل تلگرام (@channel)</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0 0 0;">
                کانال‌هایی که فیلترهای ملکی آگهی‌های منطبق را در آن‌ها با قالب حرفه‌ای امیران منتشر می‌کنند.
              </p>
            </div>
            <button class="btn" onclick="document.getElementById('channel-dialog').showModal()">➕ اتصال کانال جدید</button>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>کانال تلگرام</th>
                  <th>مالک کانال</th>
                  <th>تعداد فیلترها</th>
                  <th>دسترسی ربات</th>
                  <th>وضعیت انتشار</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                \${rows || '<tr><td colspan="6" class="empty-state">هنوز هیچ کانالی متصل نشده است. ابتدا کانال جدید ثبت کنید.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function submitChannelForm(e) {
      e.preventDefault();
      const payload = {
        chat_id: document.getElementById('ch-chat-id').value.trim(),
        title: document.getElementById('ch-title').value.trim()
      };
      try {
        await apiCall('/api/admin/channels', { method: 'POST', body: JSON.stringify(payload) });
        notify('✅ کانال با موفقیت متصل شد.');
        document.getElementById('channel-dialog').close();
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا در اتصال کانال: ' + err.message);
      }
    }

    async function toggleChannel(chId) {
      try {
        await apiCall('/api/admin/channels/' + chId + '/toggle', { method: 'POST' });
        notify('وضعیت کانال تغییر یافت.');
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    async function deleteChannel(chId) {
      if (!confirm('آیا از حذف این کانال اطمینان دارید؟ فیلترهای مرتبط نیز ممکن است غیرفعال شوند.')) return;
      try {
        await apiCall('/api/admin/channels/' + chId, { method: 'DELETE' });
        notify('🗑 کانال با موفقیت حذف شد.');
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    async function testChannelSend(chatId) {
      if (!confirm('آیا می‌خواهید یک پیام آزمایشی به کانال ' + chatId + ' ارسال کنید؟')) return;
      try {
        notify('در حال ارسال پیام تست به ' + chatId + '...');
        const res = await apiCall('/api/admin/test-channel-message', {
          method: 'POST',
          body: JSON.stringify({ chat_id: chatId })
        });
        if (res.ok) {
          notify('✅ پیام تست با موفقیت به کانال ارسال شد!');
        } else {
          notify('❌ خطا در ارسال تلگرام: ' + (res.result?.description || 'نامشخص'));
        }
      } catch (err) {
        notify('❌ خطا: ' + err.message);
      }
    }

    // TAB 4: SUBSCRIPTIONS & USERS
    function renderSubscriptionsTab(container) {
      const rows = (state.users || []).map(u => \`
        <tr>
          <td>
            <strong>\${u.full_name || 'کاربر'}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">ID: <code>\${u.telegram_id}</code> \${u.username ? '@' + u.username : ''}</div>
          </td>
          <td><span class="badge \${u.role === 'SUPERADMIN' ? 'badge-danger' : (u.role === 'ADMIN' ? 'badge-warn' : 'badge-muted')}">\${u.role}</span></td>
          <td><strong>\${u.plan_name || 'فاقد اشتراک فعال'}</strong></td>
          <td>
            <span class="badge \${u.sub_status === 'ACTIVE' ? 'badge-live' : 'badge-danger'}">
              \${u.sub_status === 'ACTIVE' ? 'فعال' : 'منقضی / نامشخص'}
            </span>
          </td>
          <td>\${u.searches_used_today || 0} / \${u.daily_ad_quota || 0}</td>
          <td>\${u.expires_at ? new Date(u.expires_at * 1000).toLocaleDateString('fa-IR') : '-'}</td>
          <td>
            <span class="badge \${u.is_banned ? 'badge-danger' : 'badge-live'}">
              \${u.is_banned ? 'مسدود شده' : 'مجاز'}
            </span>
          </td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-outline btn-sm" onclick="openGrantSubModal(\${u.telegram_id}, '\${u.role}')">💎 اعطای اشتراک</button>
              <button class="btn btn-outline btn-sm" onclick="toggleUserBan(\${u.telegram_id})">
                \${u.is_banned ? '🟢 رفع مسدودیت' : '🔴 مسدود'}
              </button>
            </div>
          </td>
        </tr>
      \`).join('');

      container.innerHTML = \`
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <h3 style="margin:0;">💎 مدیریت کاربران، نقش‌ها و اشتراک‌ها</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0 0 0;">
                اعطای دستی اشتراک به مشاورین، تعیین دسترسی ادمین و مدیریت مسدودیت.
              </p>
            </div>
            <button class="btn" onclick="openGrantSubModal('', 'USER')">➕ اعطای اشتراک دستی به کاربر جدید</button>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>مشخصات کاربر</th>
                  <th>نقش سیستم</th>
                  <th>پلن اشتراک</th>
                  <th>وضعیت اشتراک</th>
                  <th>مصرف / سهمیه روزانه</th>
                  <th>تاریخ انقضا</th>
                  <th>وضعیت دسترسی</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                \${rows || '<tr><td colspan="8" class="empty-state">هنوز کاربری ثبت نشده است. با زدن دکمه بالا اشتراک اعطا کنید.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    function openGrantSubModal(tgId, currentRole) {
      document.getElementById('sub-tg-id').value = tgId || '';
      document.getElementById('sub-role').value = currentRole || 'USER';
      document.getElementById('sub-dialog').showModal();
    }

    async function submitSubForm(e) {
      e.preventDefault();
      const payload = {
        telegram_id: Number(document.getElementById('sub-tg-id').value),
        role: document.getElementById('sub-role').value,
        plan_id: document.getElementById('sub-plan-id').value,
        duration_days: Number(document.getElementById('sub-duration-days').value)
      };
      try {
        await apiCall('/api/admin/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
        notify('✅ اشتراک و دسترسی کاربر با موفقیت ثبت شد.');
        document.getElementById('sub-dialog').close();
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا در اعطای اشتراک: ' + err.message);
      }
    }

    async function toggleUserBan(userId) {
      try {
        await apiCall('/api/admin/users/' + userId + '/toggle-ban', { method: 'POST' });
        notify('وضعیت مسدودیت کاربر به روز شد.');
        await fetchCurrentTabData();
      } catch (err) {
        notify('خطا: ' + err.message);
      }
    }

    // TAB 5: SIMULATOR
    function renderSimulatorTab(container) {
      container.innerHTML = \`
        <div class="card">
          <h3 style="margin:0 0 0.5rem 0;">🧪 شبیه‌ساز زنده ارزیابی آگهی دیوار و پیش‌نمایش قالب جدید کانال</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 1rem 0;">
            توکن هر آگهی در دیوار را وارد کرده و نحوه اعمال فیلتر مرزبندی نقشه، فیلتر حذف مشاورین املاک و فرمت نهایی پیام کانال را بررسی نمایید.
          </p>

          <div class="form-grid">
            <div class="form-group">
              <label>توکن آگهی دیوار یا آدرس کامل آن:</label>
              <input type="text" id="sim-token" placeholder="مثال: gap-CaAd یا https://divar.ir/v/..." value="" />
            </div>
            <div class="form-group">
              <label>نوع معامله برای تست:</label>
              <select id="sim-deal-type">
                <option value="BUY">فروش مسکونی / تجاری (BUY)</option>
                <option value="RENT">رهن و اجاره (RENT)</option>
              </select>
            </div>
            <div class="form-group">
              <label>حداکثر بودجه خرید / رهن (تومان):</label>
              <input type="number" id="sim-max-budget" value="10000000000" />
            </div>
            <div class="form-group">
              <label>بازه متراژ (حداقل - حداکثر):</label>
              <div style="display:flex; gap:0.35rem;">
                <input type="number" id="sim-min-area" value="70" style="width:50%" />
                <input type="number" id="sim-max-area" value="250" style="width:50%" />
              </div>
            </div>
            <div class="form-group">
              <label>حداکثر سن آگهی در دیوار (ساعت گذشته):</label>
              <input type="number" id="sim-max-age" value="24" />
            </div>
            <div class="form-group">
              <label>حداقل امتیاز قبولی تطابق (Match Score %):</label>
              <input type="number" id="sim-min-score" value="65" />
            </div>
          </div>

          <div class="box-danger" style="padding:0.75rem; margin-bottom:0.75rem;">
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; font-weight:700; cursor:pointer;">
              <input type="checkbox" id="sim-exclude-agency" checked />
              فعال‌سازی فیلتر حذف آگهی‌های املاک، مشاور و دلال (عدم تایید در صورت وجود کلمات ممنوعه)
            </label>
          </div>

          <div class="box-info" style="padding:0.75rem; margin-bottom:1rem;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--primary); margin-bottom:0.4rem;">🔘 تست دکمه‌های شیشه‌ای در پیش‌نمایش:</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.5rem;">
              <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; cursor:pointer;">
                <input type="checkbox" id="sim-btn-divar" checked /> 🔗 مشاهده در دیوار
              </label>
              <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; cursor:pointer;">
                <input type="checkbox" id="sim-btn-map" checked /> 🗺 موقعیت روی نقشه
              </label>
              <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; cursor:pointer;">
                <input type="checkbox" id="sim-btn-score" checked /> 📊 درصد تطابق
              </label>
              <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; cursor:pointer;">
                <input type="checkbox" id="sim-btn-contact" checked /> 📞 تماس با ما
              </label>
            </div>
          </div>

          <button class="btn" style="padding:0.6rem 1.25rem;" onclick="runSimulation()">🔍 آنالیز زنده آگهی دیوار و پیش‌نمایش خروجی تلگرام</button>
        </div>

        <div id="sim-results" style="display:none;" class="card">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:1rem; margin-bottom:1rem;">
            <div style="display:flex; align-items:center; gap:1rem;">
              <div id="sim-score-box" class="score-box"></div>
              <div>
                <h3 id="sim-title" style="margin:0;">-</h3>
                <div id="sim-status-text" style="font-size:0.88rem; font-weight:600; margin-top:0.2rem;"></div>
              </div>
            </div>
            <div id="sim-reasons" style="font-size:0.82rem; color:var(--text-muted);"></div>
          </div>

          <div class="kpi-grid" style="margin-bottom:1rem;">
            <div class="card" style="margin:0; background:var(--surface-subtle);">
              <div class="kpi-title">امتیاز مالی و بودجه</div>
              <div class="kpi-val" id="sim-score-budget">-</div>
            </div>
            <div class="card" style="margin:0; background:var(--surface-subtle);">
              <div class="kpi-title">امتیاز متراژ و تلورانس</div>
              <div class="kpi-val" id="sim-score-area">-</div>
            </div>
            <div class="card" style="margin:0; background:var(--surface-subtle);">
              <div class="kpi-title">امتیاز امکانات مرحله ۲</div>
              <div class="kpi-val" id="sim-score-specs">-</div>
            </div>
          </div>

          <h4 style="margin:0 0 0.5rem 0;">📱 پیش‌نمایش دقیق پست ارسالی به کانال تلگرام (Card View):</h4>
          <div id="sim-telegram-card" class="telegram-card-preview"></div>
          <div id="sim-telegram-link" style="margin-top:0.5rem;"></div>
        </div>
      \`;
    }

    async function runSimulation() {
      let rawToken = document.getElementById('sim-token').value.trim();
      if (!rawToken) {
        notify('لطفاً توکن یا آدرس یک آگهی در دیوار را وارد کنید.');
        return;
      }
      const urlMatch = rawToken.match(/\\/v\\/[^\\/]+\\/([^\\/\\?#]+)/) || rawToken.match(/\\/v\\/([^\\/\\?#]+)/);
      if (urlMatch) rawToken = urlMatch[1];

      const payload = {
        token: rawToken,
        deal_type: document.getElementById('sim-deal-type').value,
        max_budget: Number(document.getElementById('sim-max-budget').value),
        min_area: Number(document.getElementById('sim-min-area').value),
        max_area: Number(document.getElementById('sim-max-area').value),
        tolerance_pct: 0.15,
        min_match_score: Number(document.getElementById('sim-min-score').value),
        max_post_age_hours: Number(document.getElementById('sim-max-age').value) || 24,
        exclude_agency: document.getElementById('sim-exclude-agency').checked ? 1 : 0,
        show_btn_divar: document.getElementById('sim-btn-divar') ? (document.getElementById('sim-btn-divar').checked ? 1 : 0) : 1,
        show_btn_map: document.getElementById('sim-btn-map') ? (document.getElementById('sim-btn-map').checked ? 1 : 0) : 1,
        show_btn_score: document.getElementById('sim-btn-score') ? (document.getElementById('sim-btn-score').checked ? 1 : 0) : 1,
        show_btn_contact: document.getElementById('sim-btn-contact') ? (document.getElementById('sim-btn-contact').checked ? 1 : 0) : 1
      };

      try {
        notify('در حال استخراج اطلاعات آگهی از دیوار و ارزیابی...');
        const res = await apiCall('/api/admin/test-score', { method: 'POST', body: JSON.stringify(payload) });
        
        document.getElementById('sim-results').style.display = 'block';
        const match = res.matchResult;
        const scoreBox = document.getElementById('sim-score-box');
        scoreBox.textContent = match.score + '٪';
        scoreBox.className = 'score-box ' + (match.eligible ? 'pass' : 'fail');

        document.getElementById('sim-title').textContent = res.ad.title || 'آگهی دیوار';
        const statusEl = document.getElementById('sim-status-text');
        if (match.eligible) {
          statusEl.textContent = '✅ واجد شرایط ارسال به کانال (تطابق کامل)';
          statusEl.style.color = 'var(--success)';
        } else {
          statusEl.textContent = '❌ رد شده در فیلتر: ' + (match.reasons || []).join('، ');
          statusEl.style.color = 'var(--danger)';
        }

        document.getElementById('sim-score-budget').textContent = (match.budgetScore || 0) + ' / 35';
        document.getElementById('sim-score-area').textContent = (match.areaScore || 0) + ' / 25';
        document.getElementById('sim-score-specs').textContent = (match.specsScore || 0) + ' / 40';

        const cardBody = res.cardPreview?.body || {};
        const textContent = cardBody.caption || cardBody.text || '';

        let photoMarkup = '';
        if (cardBody.media && Array.isArray(cardBody.media)) {
          photoMarkup = '<div style="display:flex; gap:6px; overflow-x:auto; margin-bottom:12px; padding-bottom:6px;">' +
            cardBody.media.map(m => '<img src="' + m.media + '" style="height:150px; border-radius:8px; object-fit:cover; border:1px solid #cbd5e1;" />').join('') +
            '</div>';
        } else if (cardBody.photo) {
          photoMarkup = '<img src="' + cardBody.photo + '" style="width:100%; max-height:280px; border-radius:8px; object-fit:cover; margin-bottom:12px; border:1px solid #cbd5e1;" />';
        } else if (res.ad?.imageUrls && res.ad.imageUrls.length > 0) {
          photoMarkup = '<div style="display:flex; gap:6px; overflow-x:auto; margin-bottom:12px; padding-bottom:6px;">' +
            res.ad.imageUrls.map(u => '<img src="' + u + '" style="height:150px; border-radius:8px; object-fit:cover; border:1px solid #cbd5e1;" />').join('') +
            '</div>';
        }

        const formattedText = (textContent || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/&lt;b&gt;/g, '<b>')
          .replace(/&lt;\\/b&gt;/g, '</b>')
          .replace(/&lt;i&gt;/g, '<i>')
          .replace(/&lt;\\/i&gt;/g, '</i>')
          .replace(/&lt;code&gt;/g, '<code>')
          .replace(/&lt;\\/code&gt;/g, '</code>')
          .replace(/&lt;a href="([^"]+)"&gt;/g, '<a href="$1" target="_blank" style="color:#0284c7; text-decoration:underline;">')
          .replace(/&lt;\\/a&gt;/g, '</a>')
          .replace(/\\n/g, '<br/>');

        document.getElementById('sim-telegram-card').innerHTML = photoMarkup + formattedText;

        const keyboard = cardBody.reply_markup?.inline_keyboard || [];
        let buttonsHtml = '';
        if (keyboard.length > 0) {
          buttonsHtml = '<div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">';
          for (const row of keyboard) {
            buttonsHtml += '<div style="display:flex; gap:6px; flex-wrap:wrap;">';
            for (const btn of row) {
              const href = btn.url ? ('href="' + btn.url + '" target="_blank"') : 'href="javascript:void(0)"';
              buttonsHtml += '<a ' + href + ' class="telegram-btn-preview" style="flex:1; min-width:130px; text-align:center;">' + btn.text + '</a>';
            }
            buttonsHtml += '</div>';
          }
          buttonsHtml += '</div>';
        }
        document.getElementById('sim-telegram-link').innerHTML = buttonsHtml;
        notify('تحلیل و ارزیابی آگهی انجام شد.');
      } catch (err) {
        notify('خطا در ارزیابی آگهی: ' + err.message);
      }
    }


    // Dark / Light Theme logic
    function initTheme() {
      const saved = localStorage.getItem('hydra_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      setTheme(saved);
    }
    function setTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('hydra_theme', theme);
      const btn = document.getElementById('theme-toggle');
      if (btn) {
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک';
      }
    }
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    }

    initTheme();

    // Start initial tab load
    fetchCurrentTabData();
  </script>
</body>
</html>`;
