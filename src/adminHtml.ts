export const ADMIN_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>پنل مدیریت ربات املاک | Hydra-Sender Admin</title>
  <style>
    :root {
      --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --muted: #475569;
      --primary: #1a73e8; --primary-hover: #1557b0; --success: #16a34a;
      --warn: #ea580c; --danger: #dc2626; --border: #e2e8f0;
    }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif; }
    body { margin: 0; background: var(--bg); color: var(--text); line-height: 1.6; }
    header {
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;
    }
    header h1 { margin: 0; font-size: 1.25rem; color: var(--text); }
    .header-controls { display: flex; gap: 0.75rem; align-items: center; }
    nav[role="tablist"] {
      display: flex; gap: 0.5rem; background: var(--surface);
      padding: 0.5rem 1.5rem; border-bottom: 1px solid var(--border); overflow-x: auto;
    }
    nav[role="tablist"] button {
      background: transparent; border: none; border-bottom: 3px solid transparent;
      padding: 0.6rem 1rem; cursor: pointer; font-weight: 600; color: var(--muted);
    }
    nav[role="tablist"] button[aria-selected="true"] {
      color: var(--primary); border-bottom-color: var(--primary);
    }
    main { max-width: 1200px; margin: 1.5rem auto; padding: 0 1.5rem; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
    .kpi-val { font-size: 1.75rem; font-weight: 700; color: var(--primary); }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.75rem; border-bottom: 1px solid var(--border); text-align: right; }
    th { background: #f1f5f9; font-weight: 600; }
    .btn {
      background: var(--primary); color: #fff; border: none; border-radius: 0.375rem;
      padding: 0.5rem 1rem; cursor: pointer; font-size: 0.875rem; font-weight: 600;
    }
    .btn-outline { background: transparent; color: var(--primary); border: 1px solid var(--primary); }
    .badge { padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .badge-live { background: #dcfce7; color: #166534; }
    .badge-backfill { background: #ffedd5; color: #9a3412; }
    dialog {
      border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.5rem;
      max-width: 680px; width: 95%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
    }
    dialog::backdrop { background: rgba(15, 23, 42, 0.5); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
    input, select { padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.375rem; }
    #toast-region {
      position: fixed; bottom: 1rem; left: 1rem; background: #0f172a; color: #fff;
      padding: 0.75rem 1.25rem; border-radius: 0.375rem; display: none; z-index: 9999;
    }
  </style>
</head>
<body>
  <header>
    <h1>پنل مدیریت ربات املاک</h1>
    <div class="header-controls" id="header-status">
      <span id="api-connection-badge" class="badge badge-backfill">در انتظار اتصال...</span>
      <button class="btn btn-outline" onclick="openAuthDialog()">🔑 تنظیم کلید API و آدرس سرور</button>
    </div>
  </header>

  <dialog id="auth-dialog">
    <h3>تنظیمات اتصال به Cloudflare Worker</h3>
    <div class="form-group" style="margin-bottom:0.75rem;">
      <label>آدرس سرور Worker (API Base URL):</label>
      <input type="url" id="cfg-worker-url" value="https://hydra-bot.a77aslani.workers.dev" />
    </div>
    <div class="form-group" style="margin-bottom:1rem;">
      <label>توکن مدیریت (ADMIN_MASTER_TOKEN):</label>
      <input type="password" id="cfg-admin-token" placeholder="توکن امنیتی ادمین را وارد کنید..." />
    </div>
    <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
      <button class="btn" onclick="saveAuthConfig()">ذخیره و اتصال</button>
      <button class="btn btn-outline" onclick="document.getElementById('auth-dialog').close()">انصراف</button>
    </div>
  </dialog>

  <dialog id="rule-dialog">
    <h3 id="rule-dialog-title">ایجاد / ویرایش قانون فیلتر دو مرحله‌ای دیوار</h3>
    <form id="rule-form" onsubmit="submitRuleForm(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>عنوان فیلتر:</label>
          <input type="text" id="r-name" required placeholder="مثلاً: آپارتمان ۲ خواب سعادت‌آباد" />
        </div>
        <div class="form-group">
          <label>کانال مقصد (@somechannel):</label>
          <input type="text" id="r-channel" required placeholder="@my_estate_channel" />
        </div>
        <div class="form-group">
          <label>نوع معامله و ملک (Stage 1):</label>
          <select id="r-category">
            <option value="apartment-sell|BUY|APARTMENT">فروش آپارتمان (apartment-sell)</option>
            <option value="apartment-rent|RENT|APARTMENT">اجاره آپارتمان (apartment-rent)</option>
            <option value="buy-residential|BUY|ALL_RESIDENTIAL">فروش مسکونی/ویلایی (buy-residential)</option>
            <option value="residential-rent|RENT|ALL_RESIDENTIAL">اجاره مسکونی (residential-rent)</option>
            <option value="buy-commercial-property|BUY|COMMERCIAL">فروش اداری/تجاری (buy-commercial-property)</option>
          </select>
        </div>
        <div class="form-group">
          <label>کد محله‌ها (جداشده با کاما):</label>
          <input type="text" id="r-districts" placeholder="82,920" value="82,920" />
        </div>
        <div class="form-group">
          <label>حداکثر بودجه خرید / رهن (تومان):</label>
          <input type="number" id="r-max-budget" value="10000000000" />
        </div>
        <div class="form-group">
          <label>حداکثر اجاره ماهانه (تومان - ویژه اجاره):</label>
          <input type="number" id="r-max-rent" value="0" />
        </div>
        <div class="form-group">
          <label>بازه متراژ (حداقل - حداکثر متر مربع):</label>
          <div style="display:flex; gap:0.25rem;">
            <input type="number" id="r-min-area" placeholder="حداقل (100)" value="100" style="width:50%" />
            <input type="number" id="r-max-area" placeholder="حداکثر (130)" value="130" style="width:50%" />
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
          <label>تعداد آگهی موجود برای Backfill اولیه:</label>
          <input type="number" id="r-backfill" min="0" max="100" value="30" />
        </div>
      </div>
      <h4>فیلترهای مرحله دوم (Stage 2: اسکلت، جهت، کابینت، تأسیسات و امکانات)</h4>
      <div class="form-grid">
        <div class="form-group">
          <label>نوع اسکلت:</label>
          <select id="r-skeleton">
            <option value="">همه (فرقی ندارد)</option>
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
            <option value="DUAL">دوکله (شمالی-جنوبی)</option>
          </select>
        </div>
        <div class="form-group">
          <label>جنس کابینت:</label>
          <select id="r-cabinet">
            <option value="">همه</option>
            <option value="HIGH_GLOSS">های‌گلاس (High Gloss)</option>
            <option value="MEMBRANE_WOOD">ممبران / چوب / نئوکلاسیک</option>
            <option value="MDF">ام‌دی‌اف (MDF)</option>
          </select>
        </div>
        <div class="form-group">
          <label>سیستم سرمایش و گرمایش (HVAC):</label>
          <select id="r-hvac">
            <option value="">همه سیستم‌ها</option>
            <option value="DUCT_SPLIT|FLOOR_HEATING">داکت اسپلیت + گرمایش از کف</option>
            <option value="SPLIT_AC|PACKAGE_RADIATOR">کولر گازی + پکیج و رادیاتور</option>
            <option value="WATER_COOLER|PACKAGE_RADIATOR">کولر آبی + پکیج</option>
          </select>
        </div>
      </div>
      <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">
        <label><input type="checkbox" id="r-parking" checked /> پارکینگ الزامی</label>
        <label><input type="checkbox" id="r-elevator" checked /> آسانسور الزامی</label>
        <label><input type="checkbox" id="r-storage" checked /> انباری الزامی</label>
        <label><input type="checkbox" id="r-balcony" /> بالکن الزامی</label>
      </div>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button type="submit" class="btn">🚀 ذخیره فیلتر و شروع Backfill</button>
        <button type="button" class="btn btn-outline" onclick="document.getElementById('rule-dialog').close()">بستن</button>
      </div>
    </form>
  </dialog>

  <nav role="tablist" aria-label="بخش‌های پنل مدیریت">
    <button role="tab" aria-selected="true" onclick="switchTab('overview', this)">📊 داشبورد و وضعیت صف</button>
    <button role="tab" aria-selected="false" onclick="switchTab('rules', this)">🎯 فیلترهای ۲ مرحله‌ای و Backfill</button>
    <button role="tab" aria-selected="false" onclick="switchTab('channels', this)">📢 کانال‌های تلگرام (@channel)</button>
    <button role="tab" aria-selected="false" onclick="switchTab('subscriptions', this)">💎 مدیریت کاربران و اشتراک‌ها</button>
    <button role="tab" aria-selected="false" onclick="switchTab('simulator', this)">🧪 تست امتیاز تطابق و Card View</button>
  </nav>

  <main>
    <div id="main-content"></div>
  </main>

  <div id="toast-region" aria-live="polite"></div>

  <script>
    const state = {
      workerUrl: localStorage.getItem('hydra_worker_url') || window.location.origin,
      token: localStorage.getItem('hydra_admin_token') || '',
      activeTab: 'overview',
      overview: { activeSubscriptions: 0, activeChannels: 0, backfillRules: 0, liveRules: 0, adsSentToday: 0 },
      rules: []
    };

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
      await fetchDashboardData();
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
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    async function fetchDashboardData() {
      const badge = document.getElementById('api-connection-badge');
      try {
        const data = await apiCall('/api/admin/overview');
        Object.assign(state, data);
        badge.textContent = 'متصل به Worker و D1';
        badge.className = 'badge badge-live';
      } catch (err) {
        badge.textContent = 'نیاز به تنظیم توکن ادمین';
        badge.className = 'badge badge-backfill';
      }
      renderActiveTab();
    }

    function switchTab(tabId, btnEl) {
      state.activeTab = tabId;
      document.querySelectorAll('nav[role="tablist"] button').forEach(b => b.setAttribute('aria-selected', 'false'));
      btnEl.setAttribute('aria-selected', 'true');
      renderActiveTab();
    }

    function renderActiveTab() {
      const container = document.getElementById('main-content');
      if (state.activeTab === 'overview') {
        container.innerHTML = \`
          <div class="kpi-grid">
            <div class="card"><div>کاربران دارای اشتراک فعال</div><div class="kpi-val">\${state.overview.activeSubscriptions}</div></div>
            <div class="card"><div>کانال‌های متصل (@channel)</div><div class="kpi-val">\${state.overview.activeChannels}</div></div>
            <div class="card"><div>فیلترهای استریم لحظه‌ای (LIVE)</div><div class="kpi-val">\${state.overview.liveRules}</div></div>
            <div class="card"><div>فیلترهای در حال آرشیو (BACKFILL)</div><div class="kpi-val">\${state.overview.backfillRules}</div></div>
            <div class="card"><div>آگهی‌های ارسال‌شده ۲۴ ساعت اخیر</div><div class="kpi-val">\${state.overview.adsSentToday}</div></div>
          </div>
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">مدیریت سریع فیلترهای دو مرحله‌ای دیوار</h3>
              <button class="btn" onclick="document.getElementById('rule-dialog').showModal()">➕ افزودن فیلتر دو مرحله‌ای جدید</button>
            </div>
          </div>
        \`;
      } else if (state.activeTab === 'rules') {
        const rowsHtml = (state.rules || []).map(r => \`
          <tr>
            <td>\${r.name}</td>
            <td><code>\${r.chat_id || r.channel_id}</code></td>
            <td><code>\${r.divar_category_slug}</code></td>
            <td>\${Math.round((r.tolerance_pct || 0.15) * 100)}٪</td>
            <td>\${r.min_match_score}٪</td>
            <td><span class="badge \${r.phase === 'LIVE' ? 'badge-live' : 'badge-backfill'}">\${r.phase || 'BACKFILL'}</span></td>
            <td>\${r.backfill_dispatched_count || 0} / \${r.backfill_target_count || 30}</td>
          </tr>
        \`).join('');
        container.innerHTML = \`
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
              <h3 style="margin:0;">لیست فیلترهای ثبت‌شده</h3>
              <button class="btn" onclick="document.getElementById('rule-dialog').showModal()">➕ تعریف فیلتر جدید</button>
            </div>
            <table>
              <thead>
                <tr><th>نام فیلتر</th><th>کانال مقصد</th><th>دسته دیوار</th><th>تلورانس</th><th>حداقل امتیاز</th><th>فاز فعلی</th><th>پیشرفت Backfill</th></tr>
              </thead>
              <tbody>\${rowsHtml || '<tr><td colspan="7">هنوز فیلتری ثبت نشده است.</td></tr>'}</tbody>
            </table>
          </div>
        \`;
      } else {
        container.innerHTML = '<div class="card"><p>برای مدیریت کامل از طریق API به سرور متصل شوید.</p></div>';
      }
    }

    async function submitRuleForm(e) {
      e.preventDefault();
      const [slug, dealType, propType] = document.getElementById('r-category').value.split('|');
      const payload = {
        name: document.getElementById('r-name').value,
        channel_chat_id: document.getElementById('r-channel').value,
        divar_category_slug: slug,
        deal_type: dealType,
        property_type: propType,
        districts: document.getElementById('r-districts').value.split(',').map(s => s.trim()).filter(Boolean),
        max_budget: Number(document.getElementById('r-max-budget').value),
        max_rent: Number(document.getElementById('r-max-rent').value),
        min_area: Number(document.getElementById('r-min-area').value),
        max_area: Number(document.getElementById('r-max-area').value),
        tolerance_pct: Number(document.getElementById('r-tolerance').value),
        min_match_score: Number(document.getElementById('r-min-score').value),
        backfill_target_count: Number(document.getElementById('r-backfill').value),
        stage2_filters: {
          parking: document.getElementById('r-parking').checked,
          elevator: document.getElementById('r-elevator').checked,
          storage: document.getElementById('r-storage').checked,
          balcony: document.getElementById('r-balcony').checked
        }
      };
      try {
        await apiCall('/api/admin/rules', { method: 'POST', body: JSON.stringify(payload) });
        document.getElementById('rule-dialog').close();
        notify('فیلتر جدید با موفقیت ثبت شد و فاز BACKFILL آغاز گردید.');
        await fetchDashboardData();
      } catch (err) {
        notify('خطا در ذخیره فیلتر: ابتدا توکن ادمین را تنظیم کنید.');
      }
    }

    fetchDashboardData();
  </script>
</body>
</html>`;
