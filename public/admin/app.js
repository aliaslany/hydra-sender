const state = {
  workerUrl: localStorage.getItem('hydra_worker_url') || window.location.origin,
  token: localStorage.getItem('hydra_admin_token') || '',
  activeTab: 'overview',
  overview: { activeSubscriptions: 0, activeChannels: 0, backfillRules: 0, liveRules: 0, errorRules: 0, adsSentToday: 0 },
  rules: [],
  channels: [],
  users: [],
  plans: [],
  logs: [],
  erroredRules: []
};

let ruleMap = null;
let rulePolygonLayer = null;
let rulePoints = [];
let simMap = null;
let simLayerGroup = null;

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeExternalUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) ? escapeHtml(s) : '#';
}

function notify(msg) {
  const el = document.getElementById('toast-region');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Theme Manager
function initTheme() {
  const saved = localStorage.getItem('hydra_theme') ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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

// Auth Modal & API Client
function openAuthDialog() {
  document.getElementById('cfg-worker-url').value = state.workerUrl;
  document.getElementById('cfg-admin-token').value = state.token;
  document.getElementById('auth-dialog').showModal();
}

async function saveAuthConfig() {
  state.workerUrl = document.getElementById('cfg-worker-url').value.replace(/\/$/, '');
  state.token = document.getElementById('cfg-admin-token').value.trim();
  localStorage.setItem('hydra_worker_url', state.workerUrl);
  if (state.token) {
    localStorage.setItem('hydra_admin_token', state.token);
  } else {
    localStorage.removeItem('hydra_admin_token');
  }
  document.getElementById('auth-dialog').close();
  await fetchCurrentTabData();
  notify('تنظیمات اتصال سرور و توکن ذخیره شد.');
}

async function apiCall(path, options = {}) {
  const res = await fetch(state.workerUrl + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { 'Authorization': 'Bearer ' + state.token } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    let errText = 'HTTP ' + res.status;
    try {
      const errJson = await res.json();
      if (errJson.error) errText = errJson.error;
    } catch (_) {}
    if (res.status === 401) {
      openAuthDialog();
    }
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
  if (!state.token) {
    badge.textContent = 'نیازمند ورود توکن ادمین';
    badge.className = 'badge badge-warn';
    renderActiveTab();
    openAuthDialog();
    return;
  }

  try {
    if (state.activeTab === 'overview') {
      const data = await apiCall('/api/admin/overview');
      state.overview = data.overview || state.overview;
      state.rules = data.rules || [];
    } else if (state.activeTab === 'rules') {
      const [rulesData, chData] = await Promise.all([
        apiCall('/api/admin/rules'),
        apiCall('/api/admin/channels')
      ]);
      state.rules = rulesData.rules || [];
      state.channels = chData.channels || [];
    } else if (state.activeTab === 'channels') {
      const data = await apiCall('/api/admin/channels');
      state.channels = data.channels || [];
    } else if (state.activeTab === 'subscriptions') {
      const data = await apiCall('/api/admin/subscriptions');
      state.users = data.users || [];
      state.plans = data.plans || [];
    } else if (state.activeTab === 'simulator') {
      if (state.rules.length === 0) {
        const data = await apiCall('/api/admin/rules');
        state.rules = data.rules || [];
      }
    } else if (state.activeTab === 'logs') {
      const data = await apiCall('/api/admin/logs');
      state.logs = data.logs || [];
      state.erroredRules = data.erroredRules || [];
    }
    badge.textContent = 'متصل به سرور و دیتابیس D1';
    badge.className = 'badge badge-live';
  } catch (err) {
    badge.textContent = 'خطا در ارتباط: ' + err.message;
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
  } else if (state.activeTab === 'logs') {
    renderLogsTab(container);
  }
}

// ==================================================
// TAB 1: OVERVIEW & SERVER-FILTERED ENDLESS FEED
// ==================================================
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
  const postToken = String(item.post_token || '');
  const isSheypoor = postToken.startsWith('sp_');
  const cleanId = postToken.replace(/^sp_/, '');
  const directUrl = isSheypoor
    ? 'https://www.sheypoor.com/v/' + encodeURIComponent(cleanId)
    : 'https://divar.ir/v/' + encodeURIComponent(postToken);
  const sourceBadge = isSheypoor
    ? '<span class="badge badge-sheypoor">🔵 شیپور</span>'
    : '<span class="badge badge-divar">🟢 دیوار</span>';

  let statusBadge = '';
  if (item.status === 'SENT') {
    statusBadge = '<span class="badge badge-live">🟢 ارسال‌شده</span>';
  } else if (item.status === 'QUEUED') {
    statusBadge = '<span class="badge badge-backfill">🟡 در صف ارسال</span>';
  } else if (item.status === 'SKIPPED') {
    statusBadge = '<span class="badge badge-muted">⚪ رد شده</span>';
  } else {
    statusBadge = '<span class="badge badge-danger">🔴 ناموفق</span>';
  }

  const errHtml = item.last_error_msg
    ? '<div class="error-subtext">' + escapeHtml(item.last_error_msg) + '</div>'
    : '';
  const retryBtn = item.status === 'FAILED'
    ? ' <button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="retrySingleFailed(\'' + escapeHtml(item.rule_id) + '\', \'' + escapeHtml(postToken) + '\')">🔄 تلاش مجدد</button>'
    : '';

  const score = Number(item.match_score) || 0;
  const scoreBadge = score >= 80
    ? '<span class="badge badge-live">' + score + '٪</span>'
    : (score >= 65 ? '<span class="badge badge-warn">' + score + '٪</span>' : '<span class="badge badge-danger">' + score + '٪</span>');

  const timeSec = item.sent_at || item.discovered_at || 0;
  const timeStr = timeSec > 0
    ? new Date(timeSec * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';

  const newClass = isNew ? ' class="activity-row-new"' : '';

  return '<tr' + newClass + ' data-status="' + escapeHtml(item.status) + '">' +
    '<td>' + sourceBadge + '</td>' +
    '<td><a href="' + directUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:underline; font-weight:600;"><code>' + escapeHtml(postToken) + '</code> ↗</a></td>' +
    '<td>' + escapeHtml(item.rule_name || '-') + '</td>' +
    '<td><code>' + escapeHtml(item.chat_id || '-') + '</code></td>' +
    '<td>' + scoreBadge + '</td>' +
    '<td>' + escapeHtml(timeStr) + '</td>' +
    '<td>' + statusBadge + errHtml + retryBtn + '</td>' +
  '</tr>';
}

function renderActivitiesTable() {
  const tbody = document.getElementById('activity-table-body');
  if (!tbody) return;
  if (activityState.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">هیچ فعالیتی با وضعیت انتخاب‌شده ثبت نشده است.</td></tr>';
  } else {
    tbody.innerHTML = activityState.items.map(item => renderActivityRow(item)).join('');
  }
}

function setActivityFilter(filterName) {
  activityState.filter = filterName;
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.id === 'chip-' + filterName);
  });
  reloadActivities();
}

async function loadMoreActivities(isInitial = false) {
  if (activityState.isLoading || (!activityState.hasMore && !isInitial)) return;
  if (!state.token) return;
  activityState.isLoading = true;
  const sentinel = document.getElementById('activity-sentinel');
  if (sentinel) sentinel.innerHTML = '<span class="live-pulse-dot" style="margin-left:6px;"></span> در حال بارگذاری فعالیت‌های بیشتر...';

  try {
    const statusParam = activityState.filter !== 'ALL' ? '&status=' + encodeURIComponent(activityState.filter) : '';
    const data = await apiCall('/api/admin/activities?offset=' + activityState.offset + '&limit=' + activityState.limit + statusParam);
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

    renderActivitiesTable();

    const counter = document.getElementById('activity-total-counter');
    if (counter) counter.textContent = activityState.items.length + ' از ' + activityState.total + ' فعالیت';

    if (sentinel) {
      sentinel.textContent = activityState.hasMore
        ? '⬇️ برای مشاهده موارد بیشتر اسکرول کنید'
        : '✅ تمامی فعالیت‌ها بارگذاری شدند (پایان لیست)';
    }
  } catch (err) {
    if (sentinel) sentinel.textContent = 'خطا در بارگذاری فعالیت‌ها: ' + err.message;
  } finally {
    activityState.isLoading = false;
  }
}

async function pollNewActivities() {
  if (state.activeTab !== 'overview' || activityState.isLoading || !state.token) return;
  if (activityState.latestDiscovered <= 0) return;

  try {
    const statusParam = activityState.filter !== 'ALL' ? '&status=' + encodeURIComponent(activityState.filter) : '';
    const data = await apiCall('/api/admin/activities?since=' + activityState.latestDiscovered + statusParam);
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
          if (tbody) {
            if (activityState.items.length === 1) tbody.innerHTML = '';
            const tempBody = document.createElement('tbody');
            tempBody.innerHTML = renderActivityRow(item, true);
            if (tbody.firstChild) {
              tbody.insertBefore(tempBody.firstChild, tbody.firstChild);
            } else {
              tbody.appendChild(tempBody.firstChild);
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

async function retrySingleFailed(ruleId, postToken) {
  try {
    await apiCall('/api/admin/activities/retry-failed', {
      method: 'POST',
      body: JSON.stringify({ rule_id: ruleId, post_token: postToken })
    });
    notify('🔄 آگهی در صف ارسال مجدد قرار گرفت.');
    reloadActivities();
  } catch (e) {
    notify('خطا: ' + e.message);
  }
}

async function retryAllRecentFailed() {
  try {
    const res = await apiCall('/api/admin/activities/retry-failed', { method: 'POST', body: '{}' });
    notify('🔄 تعداد ' + (res.requeued || 0) + ' آگهی ناموفق در صف ارسال مجدد قرار گرفتند.');
    if (state.activeTab === 'overview') reloadActivities();
    else fetchCurrentTabData();
  } catch (e) {
    notify('خطا: ' + e.message);
  }
}

function renderOverviewTab(container) {
  container.innerHTML = `
    <div class="kpi-grid">
      <div class="card kpi-card">
        <div class="kpi-title">کاربران دارای اشتراک فعال</div>
        <div class="kpi-val">${Number(state.overview.activeSubscriptions) || 0}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-title">کانال‌های متصل (@channel)</div>
        <div class="kpi-val">${Number(state.overview.activeChannels) || 0}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-title">فیلترهای لحظه‌ای فعال (LIVE)</div>
        <div class="kpi-val">${Number(state.overview.liveRules) || 0}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-title">فیلترهای در حال آرشیو (BACKFILL)</div>
        <div class="kpi-val">${Number(state.overview.backfillRules) || 0}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-title">آگهی‌های ارسالی امروز (۲۴ ساعت)</div>
        <div class="kpi-val">${Number(state.overview.adsSentToday) || 0}</div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
        <h3 style="margin:0;">🚀 عملیات سریع سیستم</h3>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button class="btn" onclick="openCreateRuleModal()">➕ تعریف فیلتر دو مرحله‌ای جدید</button>
          <button class="btn btn-outline" onclick="triggerCronTick()">⚡ اجرای فوری پایش دیوار و شیپور</button>
          <button class="btn btn-outline" onclick="retryAllRecentFailed()">🔄 ارسال مجدد ناموفق‌ها</button>
        </div>
      </div>
      <p style="color:var(--text-muted); font-size:0.875rem; margin:0;">
        سیستم به صورت خودکار هر ۱ دقیقه یک‌بار آگهی‌های جدید دیوار و شیپور را استخراج و پس از فیلتر نقشه، حذف دلال‌ها و حذف آگهی‌های تکراری بین دو پلتفرم به کانال تلگرام ارسال می‌کند.
      </p>
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:0.75rem;">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <span class="live-pulse-dot"></span>
          <h3 style="margin:0;">📋 جریان زنده و آخرین فعالیت‌های ربات (Endless Feed)</h3>
          <span id="activity-total-counter" class="badge badge-live">در حال بارگذاری...</span>
        </div>
        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
          <button class="filter-chip ${activityState.filter === 'ALL' ? 'active' : ''}" id="chip-ALL" onclick="setActivityFilter('ALL')">همه</button>
          <button class="filter-chip ${activityState.filter === 'SENT' ? 'active' : ''}" id="chip-SENT" onclick="setActivityFilter('SENT')">🟢 ارسال‌شده</button>
          <button class="filter-chip ${activityState.filter === 'QUEUED' ? 'active' : ''}" id="chip-QUEUED" onclick="setActivityFilter('QUEUED')">🟡 در صف</button>
          <button class="filter-chip ${activityState.filter === 'SKIPPED' ? 'active' : ''}" id="chip-SKIPPED" onclick="setActivityFilter('SKIPPED')">⚪ رد شده</button>
          <button class="filter-chip ${activityState.filter === 'FAILED' ? 'active' : ''}" id="chip-FAILED" onclick="setActivityFilter('FAILED')">🔴 ناموفق</button>
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
          <tbody id="activity-table-body"></tbody>
        </table>
      </div>
      <div id="activity-sentinel" style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">
        در حال بارگذاری فعالیت‌ها...
      </div>
    </div>
  `;

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

// ==================================================
// TAB 2: RULES & POLYGON MAP
// ==================================================
function renderRulesTab(container) {
  const rows = (state.rules || []).map(r => {
    let polyCount = 0;
    try {
      const p = JSON.parse(r.geo_polygon_json || '[]');
      if (Array.isArray(p)) polyCount = p.length;
    } catch (_) {}

    let sourceBadges = '';
    if (r.source_divar !== 0) sourceBadges += '<span class="badge badge-divar" style="margin-left:4px;">🟢 دیوار</span>';
    if (r.source_sheypoor !== 0) sourceBadges += '<span class="badge badge-sheypoor">🔵 شیپور</span>';
    if (!sourceBadges) sourceBadges = '<span class="badge badge-danger">بدون منبع!</span>';

    const budgetLabel = r.deal_type === 'RENT'
      ? 'رهن: ' + (r.max_budget ? Math.round(r.max_budget / 1000000).toLocaleString('fa-IR') + ' م' : 'آزاد')
      : 'بودجه: ' + (r.max_budget ? Math.round(r.max_budget / 1000000).toLocaleString('fa-IR') + ' م' : 'آزاد');

    const healthHtml = Number(r.is_auto_paused) === 1
      ? '<div class="error-subtext">⛔ توقف خودکار (' + Number(r.consecutive_errors || 0) + ' خطا)</div>'
      : (r.last_error_msg ? '<div class="error-subtext">' + escapeHtml(r.last_error_msg) + '</div>' : '');

    return `
      <tr>
        <td>
          <strong>${escapeHtml(r.name)}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">شهر: ${escapeHtml(r.city_ids_json === '["823"]' ? 'علی‌آباد کتول' : r.city_ids_json)}</div>
          <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">${sourceBadges}</div>
        </td>
        <td><code>${escapeHtml(r.chat_id || r.channel_id)}</code></td>
        <td><code>${escapeHtml(r.divar_category_slug)}</code></td>
        <td>
          ${escapeHtml(budgetLabel)}
          <br/><span style="font-size:0.78rem; color:var(--text-muted);">${Number(r.min_area) || 0} تا ${r.max_area ? Number(r.max_area) : '∞'} متر</span>
        </td>
        <td>
          ${polyCount >= 3 ? '<span class="badge badge-live">📍 مرزبندی (' + polyCount + ' نقطه)</span>' : '<span class="badge badge-muted">کل شهر</span>'}
          <br/>
          ${r.exclude_agency !== 0 ? '<span class="badge badge-warn" style="margin-top:0.2rem;">🚫 حذف املاک</span>' : '<span class="badge badge-muted">همه آگهی‌ها</span>'}
        </td>
        <td>
          <span class="badge ${r.phase === 'ERROR' ? 'badge-danger' : (r.phase === 'LIVE' ? 'badge-live' : 'badge-backfill')}">${escapeHtml(r.phase || 'BACKFILL')}</span>
          <div style="font-size:0.75rem; color:var(--text-muted);">سقف سن: ${Number(r.max_post_age_hours) || 24} ساعت</div>
          ${healthHtml}
        </td>
        <td>
          <span class="badge ${r.is_active ? 'badge-live' : 'badge-danger'}">${r.is_active ? 'فعال' : 'غیرفعال'}</span>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-outline btn-sm" onclick="toggleRuleActive('${escapeHtml(r.id)}')">
              ${r.is_active ? '⏸ غیرفعال' : '▶️ فعال'}
            </button>
            <button class="btn btn-outline btn-sm" onclick="openEditRuleModal('${escapeHtml(r.id)}')">✏️ ویرایش</button>
            <button class="btn btn-outline btn-sm" onclick="resetRuleBackfill('${escapeHtml(r.id)}')">🔄 ریست آرشیو</button>
            ${(Number(r.is_auto_paused) === 1 || Number(r.consecutive_errors) > 0) ? '<button class="btn btn-success btn-sm" onclick="resumeRule(\'' + escapeHtml(r.id) + '\')">▶️ رفع خطا</button>' : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteRule('${escapeHtml(r.id)}')">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
        <div>
          <h3 style="margin:0;">🎯 لیست فیلترهای استخراج و ارسال هوشمند</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0 0 0;">
            پایش همزمان دیوار و شیپور بر اساس بودجه، متراژ، امکانات، محدوده نقشه و حذف خودکار املاک.
          </p>
        </div>
        <button class="btn" onclick="openCreateRuleModal()">➕ تعریف فیلتر دو مرحله‌ای جدید</button>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>نام فیلتر و منابع</th>
              <th>کانال مقصد</th>
              <th>دسته</th>
              <th>بودجه و متراژ</th>
              <th>محدوده و فیلتر مشاور</th>
              <th>فاز و سلامت</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" class="empty-state">هنوز فیلتری تعریف نشده است.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function initRuleMap(initialPoints = []) {
  const container = document.getElementById('rule-map');
  if (!container) return;

  if (!ruleMap) {
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
  dl.innerHTML = (state.channels || []).map(ch =>
    '<option value="' + escapeHtml(ch.chat_id) + '">' + escapeHtml(ch.title || ch.chat_id) + '</option>'
  ).join('');
}

function setCheckboxGroup(name, selectedValues) {
  const set = new Set((Array.isArray(selectedValues) ? selectedValues : []).map(String));
  document.querySelectorAll('input[name="' + name + '"]').forEach(el => {
    el.checked = set.has(String(el.value));
  });
}

function getCheckboxGroupValues(name, asNumbers = false) {
  const vals = [];
  document.querySelectorAll('input[name="' + name + '"]:checked').forEach(el => {
    vals.push(asNumbers ? Number(el.value) : el.value);
  });
  return vals;
}

function firstArrayValue(val) {
  if (Array.isArray(val) && val.length > 0) return String(val[0]);
  if (typeof val === 'string') return val;
  return '';
}

function openCreateRuleModal() {
  updateChannelDatalist();
  document.getElementById('rule-dialog-title').textContent = 'تعریف فیلتر دو مرحله‌ای هوشمند (دیوار و شیپور)';
  document.getElementById('r-edit-id').value = '';
  document.getElementById('r-name').value = '';
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
  document.getElementById('r-min-build-year').value = '';
  document.getElementById('r-min-floor').value = '';
  document.getElementById('r-max-floor').value = '';
  setCheckboxGroup('r-bedrooms', []);
  setCheckboxGroup('r-cabinet', []);
  setCheckboxGroup('r-cooling', []);
  setCheckboxGroup('r-heating', []);
  document.getElementById('r-source-divar').checked = true;
  document.getElementById('r-source-sheypoor').checked = true;
  document.getElementById('r-btn-divar').checked = true;
  document.getElementById('r-btn-map').checked = true;
  document.getElementById('r-btn-score').checked = true;
  document.getElementById('r-btn-contact').checked = true;
  document.getElementById('r-album-followup').checked = false;
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
  document.getElementById('r-channel').value = r.chat_id || r.channel_id || '';

  const selectCat = document.getElementById('r-category');
  const targetVal = (r.divar_category_slug || '') + '|' + (r.deal_type || '') + '|' + (r.property_type || '');
  for (let i = 0; i < selectCat.options.length; i++) {
    if (selectCat.options[i].value === targetVal) selectCat.selectedIndex = i;
  }

  let cityIds = ['823'];
  try { cityIds = JSON.parse(r.city_ids_json || '["823"]'); } catch (_) {}
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
  try { negWords = JSON.parse(r.negative_keywords_json || '[]'); } catch (_) {}
  document.getElementById('r-negative-words').value = negWords.length > 0
    ? negWords.join(', ')
    : 'املاک, مشاور, مشاورین, بنگاه, دپارتمان, دفتر املاک, همکار, همکاران, کمیسیون, آژانس املاک, کارگزاری';

  let stage2 = {};
  try { stage2 = JSON.parse(r.stage2_filters_json || '{}'); } catch (_) {}
  document.getElementById('r-parking').checked = stage2.parking === true;
  document.getElementById('r-elevator').checked = stage2.elevator === true;
  document.getElementById('r-storage').checked = stage2.storage === true;
  document.getElementById('r-balcony').checked = !!stage2.balcony;
  document.getElementById('r-skeleton').value = firstArrayValue(stage2.skeleton);
  document.getElementById('r-direction').value = firstArrayValue(stage2.direction);
  document.getElementById('r-min-build-year').value = stage2.min_build_year || '';
  if (Array.isArray(stage2.floor_range) && stage2.floor_range.length === 2) {
    document.getElementById('r-min-floor').value = stage2.floor_range[0];
    document.getElementById('r-max-floor').value = stage2.floor_range[1];
  } else {
    document.getElementById('r-min-floor').value = '';
    document.getElementById('r-max-floor').value = '';
  }
  setCheckboxGroup('r-bedrooms', stage2.bedrooms || []);
  setCheckboxGroup('r-cabinet', stage2.cabinet || []);
  setCheckboxGroup('r-cooling', stage2.cooling || []);
  setCheckboxGroup('r-heating', stage2.heating || []);

  document.getElementById('r-source-divar').checked = r.source_divar !== 0;
  document.getElementById('r-source-sheypoor').checked = r.source_sheypoor !== 0;
  document.getElementById('r-btn-divar').checked = r.show_btn_divar !== 0;
  document.getElementById('r-btn-map').checked = r.show_btn_map !== 0;
  document.getElementById('r-btn-score').checked = r.show_btn_score !== 0;
  document.getElementById('r-btn-contact').checked = r.show_btn_contact !== 0;
  document.getElementById('r-album-followup').checked = Number(r.album_followup_buttons) === 1;

  let initialPoints = [];
  try {
    const parsed = JSON.parse(r.geo_polygon_json || '[]');
    if (Array.isArray(parsed)) initialPoints = parsed;
  } catch (_) {}

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

  const minBuildYear = Number(document.getElementById('r-min-build-year').value) || undefined;
  const minFloorRaw = document.getElementById('r-min-floor').value;
  const maxFloorRaw = document.getElementById('r-max-floor').value;
  const floorRange = (minFloorRaw !== '' && maxFloorRaw !== '')
    ? [Number(minFloorRaw), Number(maxFloorRaw)]
    : undefined;
  const skelVal = document.getElementById('r-skeleton').value;
  const dirVal = document.getElementById('r-direction').value;

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
    album_followup_buttons: document.getElementById('r-album-followup').checked ? 1 : 0,
    source_divar: document.getElementById('r-source-divar').checked ? 1 : 0,
    source_sheypoor: document.getElementById('r-source-sheypoor').checked ? 1 : 0,
    stage2_filters: {
      parking: document.getElementById('r-parking').checked,
      elevator: document.getElementById('r-elevator').checked,
      storage: document.getElementById('r-storage').checked,
      balcony: document.getElementById('r-balcony').checked,
      min_build_year: minBuildYear,
      floor_range: floorRange,
      bedrooms: getCheckboxGroupValues('r-bedrooms', true),
      skeleton: skelVal ? [skelVal] : undefined,
      direction: dirVal ? [dirVal] : undefined,
      cabinet: getCheckboxGroupValues('r-cabinet'),
      cooling: getCheckboxGroupValues('r-cooling'),
      heating: getCheckboxGroupValues('r-heating')
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

async function resumeRule(ruleId) {
  try {
    await apiCall('/api/admin/rules/' + ruleId + '/resume', { method: 'POST' });
    notify('▶️ خطاها پاکسازی و فیلتر مجدداً فعال شد.');
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

// ==================================================
// TAB 3: CHANNELS & BRANDING
// ==================================================
function renderChannelsTab(container) {
  const rows = (state.channels || []).map(ch => {
    const contactSummary = [ch.contact_mobile, ch.contact_phone].filter(Boolean).join(' / ') || 'پیش‌فرض';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(ch.title || ch.chat_id)}</strong>
          <br/><code>${escapeHtml(ch.chat_id)}</code>
        </td>
        <td>${escapeHtml(ch.owner_name || ch.owner_username || ('ID: ' + ch.owner_user_id))}</td>
        <td>
          <div style="font-size:0.8rem;">📞 ${escapeHtml(contactSummary)}</div>
          <div style="font-size:0.74rem; color:var(--text-muted);">${escapeHtml((ch.office_address || '').slice(0, 50))}</div>
        </td>
        <td>${Number(ch.rule_count) || 0} فیلتر</td>
        <td>
          <span class="badge ${ch.bot_is_admin ? 'badge-live' : 'badge-danger'}">
            ${ch.bot_is_admin ? 'ادمین است' : 'نیازمند ادمین'}
          </span>
        </td>
        <td>
          <span class="badge ${ch.is_enabled ? 'badge-live' : 'badge-muted'}">
            ${ch.is_enabled ? 'فعال' : 'غیرفعال'}
          </span>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-outline btn-sm" onclick="openEditChannelModal('${escapeHtml(ch.id)}')">✏️ برندینگ</button>
            <button class="btn btn-outline btn-sm" onclick="toggleChannel('${escapeHtml(ch.id)}')">
              ${ch.is_enabled ? '⏸ غیرفعال' : '▶️ فعال'}
            </button>
            <button class="btn btn-outline btn-sm" onclick="testChannelSend('${escapeHtml(ch.chat_id)}')">
              📨 تست ارسال
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteChannel('${escapeHtml(ch.id)}')">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
        <div>
          <h3 style="margin:0;">📢 کانال‌های متصل تلگرام و تنظیمات برندینگ اختصاصی</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0 0 0;">
            مدیریت کانال‌ها، شماره تماس، آدرس دفتر و هشتگ‌های برند اختصاصی هر کانال.
          </p>
        </div>
        <button class="btn" onclick="openCreateChannelModal()">➕ اتصال کانال جدید</button>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>کانال تلگرام</th>
              <th>مالک کانال</th>
              <th>تماس و برندینگ</th>
              <th>فیلترها</th>
              <th>دسترسی ربات</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" class="empty-state">هنوز هیچ کانالی متصل نشده است.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openCreateChannelModal() {
  document.getElementById('channel-dialog-title').textContent = 'اتصال کانال تلگرام جدید';
  document.getElementById('ch-edit-id').value = '';
  document.getElementById('ch-chat-id').readOnly = false;
  document.getElementById('ch-chat-id').value = '';
  document.getElementById('ch-title').value = '';
  document.getElementById('ch-mobile').value = '';
  document.getElementById('ch-phone').value = '';
  document.getElementById('ch-address').value = '';
  document.getElementById('ch-hashtags').value = '';
  document.getElementById('btn-save-channel').textContent = 'ثبت و اتصال کانال';
  document.getElementById('channel-dialog').showModal();
}

function openEditChannelModal(chId) {
  const ch = (state.channels || []).find(x => x.id === chId);
  if (!ch) return;
  let tags = [];
  try { tags = JSON.parse(ch.brand_hashtags_json || '[]'); } catch (_) {}

  document.getElementById('channel-dialog-title').textContent = 'ویرایش برندینگ کانال: ' + (ch.chat_id || '');
  document.getElementById('ch-edit-id').value = ch.id;
  document.getElementById('ch-chat-id').readOnly = true;
  document.getElementById('ch-chat-id').value = ch.chat_id || '';
  document.getElementById('ch-title').value = ch.title || '';
  document.getElementById('ch-mobile').value = ch.contact_mobile || '';
  document.getElementById('ch-phone').value = ch.contact_phone || '';
  document.getElementById('ch-address').value = ch.office_address || '';
  document.getElementById('ch-hashtags').value = tags.join(', ');
  document.getElementById('btn-save-channel').textContent = '💾 ذخیره برندینگ';
  document.getElementById('channel-dialog').showModal();
}

async function submitChannelForm(e) {
  e.preventDefault();
  const editId = document.getElementById('ch-edit-id').value;
  const hashtags = document.getElementById('ch-hashtags').value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const payload = {
    chat_id: document.getElementById('ch-chat-id').value.trim(),
    title: document.getElementById('ch-title').value.trim(),
    contact_mobile: document.getElementById('ch-mobile').value.trim(),
    contact_phone: document.getElementById('ch-phone').value.trim(),
    office_address: document.getElementById('ch-address').value.trim(),
    brand_hashtags: hashtags
  };

  try {
    if (editId) {
      await apiCall('/api/admin/channels/' + editId, { method: 'PUT', body: JSON.stringify(payload) });
      notify('✅ برندینگ و اطلاعات کانال بروزرسانی شد.');
    } else {
      await apiCall('/api/admin/channels', { method: 'POST', body: JSON.stringify(payload) });
      notify('✅ کانال با موفقیت متصل شد.');
    }
    document.getElementById('channel-dialog').close();
    await fetchCurrentTabData();
  } catch (err) {
    notify('خطا در ذخیره کانال: ' + err.message);
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
  if (!confirm('آیا از حذف این کانال اطمینان دارید؟')) return;
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

// ==================================================
// TAB 4: SUBSCRIPTIONS & USERS
// ==================================================
function renderSubscriptionsTab(container) {
  const rows = (state.users || []).map(u => `
    <tr>
      <td>
        <strong>${escapeHtml(u.full_name || 'کاربر')}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted);">ID: <code>${Number(u.telegram_id)}</code> ${u.username ? '@' + escapeHtml(u.username) : ''}</div>
      </td>
      <td><span class="badge ${u.role === 'SUPERADMIN' ? 'badge-danger' : (u.role === 'ADMIN' ? 'badge-warn' : 'badge-muted')}">${escapeHtml(u.role)}</span></td>
      <td><strong>${escapeHtml(u.plan_name || 'فاقد اشتراک فعال')}</strong></td>
      <td>
        <span class="badge ${u.sub_status === 'ACTIVE' ? 'badge-live' : 'badge-danger'}">
          ${u.sub_status === 'ACTIVE' ? 'فعال' : 'منقضی / نامشخص'}
        </span>
      </td>
      <td>${Number(u.searches_used_today) || 0} / ${Number(u.daily_ad_quota) || 0}</td>
      <td>${u.expires_at ? escapeHtml(new Date(u.expires_at * 1000).toLocaleDateString('fa-IR')) : '-'}</td>
      <td>
        <span class="badge ${u.is_banned ? 'badge-danger' : 'badge-live'}">
          ${u.is_banned ? 'مسدود شده' : 'مجاز'}
        </span>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="openGrantSubModal(${Number(u.telegram_id)}, '${escapeHtml(u.role)}')">💎 اعطای اشتراک</button>
          <button class="btn btn-outline btn-sm" onclick="toggleUserBan(${Number(u.telegram_id)})">
            ${u.is_banned ? '🟢 رفع مسدودیت' : '🔴 مسدود'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
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
            ${rows || '<tr><td colspan="8" class="empty-state">هنوز کاربری ثبت نشده است.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
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

// ==================================================
// TAB 5: SIMULATOR & MAP PIN VISUALIZER
// ==================================================
function renderSimulatorTab(container) {
  const ruleOptions = (state.rules || []).map(r =>
    '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + ' (' + escapeHtml(r.chat_id || '') + ')</option>'
  ).join('');

  container.innerHTML = `
    <div class="card">
      <h3 style="margin:0 0 0.5rem 0;">🧪 شبیه‌ساز زنده ارزیابی آگهی (دیوار و شیپور) و پیش‌نمایش کارت</h3>
      <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 1rem 0;">
        توکن یا لینک کامل آگهی در دیوار یا شیپور را وارد کنید تا امتیاز تطابق، قرارگیری روی نقشه چندضلعی فیلتر و خروجی دقیق تلگرام نمایش داده شود.
      </p>

      <div class="form-grid">
        <div class="form-group">
          <label>توکن یا آدرس آگهی (دیوار یا شیپور):</label>
          <input type="text" id="sim-token" placeholder="مثال: ga8nrg72، sp_467976255 یا لینک کامل..." value="" />
        </div>
        <div class="form-group">
          <label>تست بر اساس فیلتر ذخیره‌شده (اختیاری - اعمال نقشه و برندینگ):</label>
          <select id="sim-rule-id" onchange="syncSimulatorFromRule()">
            <option value="">-- تنظیمات دستی شبیه‌ساز --</option>
            ${ruleOptions}
          </select>
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
          <label>حداکثر سن آگهی (ساعت) / حداقل امتیاز (٪):</label>
          <div style="display:flex; gap:0.35rem;">
            <input type="number" id="sim-max-age" value="24" style="width:50%" title="ساعت" />
            <input type="number" id="sim-min-score" value="65" style="width:50%" title="حداقل امتیاز" />
          </div>
        </div>
      </div>

      <div class="box-danger" style="padding:0.75rem; margin-bottom:0.75rem;">
        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; font-weight:700; cursor:pointer;">
          <input type="checkbox" id="sim-exclude-agency" checked />
          فعال‌سازی فیلتر حذف آگهی‌های املاک، مشاور و دلال
        </label>
      </div>

      <div class="box-info" style="padding:0.75rem; margin-bottom:1rem;">
        <div style="font-size:0.85rem; font-weight:700; color:var(--primary); margin-bottom:0.4rem;">🔘 تست دکمه‌های شیشه‌ای در پیش‌نمایش:</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.5rem;">
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.82rem; cursor:pointer;">
            <input type="checkbox" id="sim-btn-divar" checked /> 🔗 مشاهده در منبع
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

      <button class="btn" style="padding:0.6rem 1.25rem;" onclick="runSimulation()">🔍 آنالیز زنده آگهی و پیش‌نمایش خروجی تلگرام</button>
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

      <div id="sim-map-wrapper" style="display:none; margin-bottom:1.25rem;">
        <h4 style="margin:0 0 0.4rem 0;">🗺 موقعیت ملک نسبت به محدوده نقشه فیلتر:</h4>
        <div id="sim-map"></div>
      </div>

      <h4 style="margin:0 0 0.5rem 0;">📱 پیش‌نمایش دقیق پست ارسالی به کانال تلگرام (Card View):</h4>
      <div id="sim-telegram-card" class="telegram-card-preview"></div>
      <div id="sim-telegram-link" style="margin-top:0.5rem;"></div>
    </div>
  `;
}

function syncSimulatorFromRule() {
  const ruleId = document.getElementById('sim-rule-id')?.value;
  if (!ruleId) return;
  const r = (state.rules || []).find(x => x.id === ruleId);
  if (!r) return;
  document.getElementById('sim-deal-type').value = r.deal_type || 'BUY';
  document.getElementById('sim-max-budget').value = r.max_budget || 0;
  document.getElementById('sim-min-area').value = r.min_area || 0;
  document.getElementById('sim-max-area').value = r.max_area || 250;
  document.getElementById('sim-max-age').value = r.max_post_age_hours || 24;
  document.getElementById('sim-min-score').value = r.min_match_score || 65;
  document.getElementById('sim-exclude-agency').checked = r.exclude_agency !== 0;
}

function parseSimulatorTokenInput(rawInput) {
  let raw = String(rawInput || '').trim();
  if (!raw) return '';
  if (raw.includes('sheypoor.com')) {
    const spMatch = raw.match(/(\d{6,12})(?:\.html)?(?:[?#]|$)/) || raw.match(/\/v\/(\d+)/);
    return spMatch ? 'sp_' + spMatch[1] : raw;
  }
  const divarMatch = raw.match(/\/v\/[^\/]+\/([^\/\?#]+)/) || raw.match(/\/v\/([^\/\?#]+)/);
  if (divarMatch) return divarMatch[1];
  return raw;
}

function renderSimulatorMap(lat, lon, polygonJson) {
  const wrapper = document.getElementById('sim-map-wrapper');
  let poly = [];
  try {
    const parsed = JSON.parse(polygonJson || '[]');
    if (Array.isArray(parsed)) poly = parsed;
  } catch (_) {}

  const hasCoords = typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon);
  if (!hasCoords && poly.length < 3) {
    wrapper.style.display = 'none';
    return;
  }

  wrapper.style.display = 'block';
  if (!simMap) {
    simMap = L.map('sim-map').setView([36.9025, 54.8558], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(simMap);
    simLayerGroup = L.layerGroup().addTo(simMap);
  }
  simLayerGroup.clearLayers();

  const bounds = [];
  if (poly.length >= 3) {
    const polyLayer = L.polygon(poly, { color: '#2563eb', weight: 2.5, fillOpacity: 0.2 }).addTo(simLayerGroup);
    bounds.push(polyLayer.getBounds());
  }
  if (hasCoords) {
    L.marker([lat, lon]).bindPopup('📍 موقعیت آگهی').addTo(simLayerGroup).openPopup();
    bounds.push(L.latLngBounds([[lat, lon], [lat, lon]]));
  }

  setTimeout(() => {
    simMap.invalidateSize();
    if (bounds.length > 0) {
      let combined = bounds[0];
      for (let i = 1; i < bounds.length; i++) combined.extend(bounds[i]);
      simMap.fitBounds(combined, { padding: [30, 30], maxZoom: 15 });
    }
  }, 150);
}

function sanitizeTelegramHtmlPreview(rawHtml) {
  // Escape everything first, then allow only Telegram's safe subset (<b>, <i>, <code>, <a href="https://...">)
  return escapeHtml(rawHtml)
    .replace(/&lt;b&gt;/g, '<b>')
    .replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/&lt;i&gt;/g, '<i>')
    .replace(/&lt;\/i&gt;/g, '</i>')
    .replace(/&lt;code&gt;/g, '<code>')
    .replace(/&lt;\/code&gt;/g, '</code>')
    .replace(/&lt;a href=&quot;(https?:\/\/[^&]+)&quot;&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#38bdf8; text-decoration:underline;">')
    .replace(/&lt;\/a&gt;/g, '</a>')
    .replace(/\n/g, '<br/>');
}

async function runSimulation() {
  const rawToken = parseSimulatorTokenInput(document.getElementById('sim-token').value);
  if (!rawToken) {
    notify('لطفاً توکن یا آدرس یک آگهی در دیوار یا شیپور را وارد کنید.');
    return;
  }

  const ruleId = document.getElementById('sim-rule-id')?.value || undefined;
  const payload = {
    token: rawToken,
    rule_id: ruleId,
    deal_type: document.getElementById('sim-deal-type').value,
    max_budget: Number(document.getElementById('sim-max-budget').value),
    min_area: Number(document.getElementById('sim-min-area').value),
    max_area: Number(document.getElementById('sim-max-area').value),
    tolerance_pct: 0.15,
    min_match_score: Number(document.getElementById('sim-min-score').value),
    max_post_age_hours: Number(document.getElementById('sim-max-age').value) || 24,
    exclude_agency: document.getElementById('sim-exclude-agency').checked ? 1 : 0,
    show_btn_divar: document.getElementById('sim-btn-divar').checked ? 1 : 0,
    show_btn_map: document.getElementById('sim-btn-map').checked ? 1 : 0,
    show_btn_score: document.getElementById('sim-btn-score').checked ? 1 : 0,
    show_btn_contact: document.getElementById('sim-btn-contact').checked ? 1 : 0
  };

  try {
    notify('در حال استخراج اطلاعات آگهی و ارزیابی...');
    const res = await apiCall('/api/admin/test-score', { method: 'POST', body: JSON.stringify(payload) });

    document.getElementById('sim-results').style.display = 'block';
    const match = res.matchResult;
    const scoreBox = document.getElementById('sim-score-box');
    scoreBox.textContent = (Number(match.score) || 0) + '٪';
    scoreBox.className = 'score-box ' + (match.eligible ? 'pass' : 'fail');

    const defaultTitle = res.ad.source === 'sheypoor' ? 'آگهی شیپور' : 'آگهی دیوار';
    document.getElementById('sim-title').textContent = res.ad.title || defaultTitle;
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

    renderSimulatorMap(res.ad?.latitude, res.ad?.longitude, res.rulePolygonJson);

    const cardBody = res.cardPreview?.body || {};
    const textContent = (cardBody.media && cardBody.media[0]?.caption) || cardBody.caption || cardBody.text || '';

    let photoMarkup = '';
    if (cardBody.media && Array.isArray(cardBody.media)) {
      photoMarkup = '<div style="display:flex; gap:6px; overflow-x:auto; margin-bottom:12px; padding-bottom:6px;">' +
        cardBody.media.map(m => '<img src="' + safeExternalUrl(m.media) + '" style="height:150px; border-radius:8px; object-fit:cover; border:1px solid #cbd5e1;" />').join('') +
        '</div>';
    } else if (cardBody.photo) {
      photoMarkup = '<img src="' + safeExternalUrl(cardBody.photo) + '" style="width:100%; max-height:280px; border-radius:8px; object-fit:cover; margin-bottom:12px; border:1px solid #cbd5e1;" />';
    }

    document.getElementById('sim-telegram-card').innerHTML = photoMarkup + sanitizeTelegramHtmlPreview(textContent);

    const keyboard = cardBody.reply_markup?.inline_keyboard || [];
    let buttonsHtml = '';
    if (keyboard.length > 0) {
      buttonsHtml = '<div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">';
      for (const row of keyboard) {
        buttonsHtml += '<div style="display:flex; gap:6px; flex-wrap:wrap;">';
        for (const btn of row) {
          const hrefAttr = btn.url
            ? 'href="' + safeExternalUrl(btn.url) + '" target="_blank" rel="noopener noreferrer"'
            : 'href="javascript:void(0)"';
          buttonsHtml += '<a ' + hrefAttr + ' class="telegram-btn-preview" style="flex:1; min-width:130px; text-align:center;">' + escapeHtml(btn.text) + '</a>';
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

// ==================================================
// TAB 6: SYSTEM LOGS & HEALTH
// ==================================================
function renderLogsTab(container) {
  const errRulesRows = (state.erroredRules || []).map(er => `
    <tr>
      <td><strong>${escapeHtml(er.name)}</strong><br/><code>${escapeHtml(er.chat_id || er.id)}</code></td>
      <td><span class="badge ${er.is_auto_paused ? 'badge-danger' : 'badge-warn'}">${escapeHtml(er.phase)} (${Number(er.consecutive_errors) || 0} خطا)</span></td>
      <td><span class="error-subtext">${escapeHtml(er.last_error_msg || '-')}</span></td>
      <td>${er.next_retry_at ? escapeHtml(new Date(er.next_retry_at * 1000).toLocaleTimeString('fa-IR')) : '-'}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="resumeRule('${escapeHtml(er.id)}')">▶️ رفع خطا و ادامه</button>
      </td>
    </tr>
  `).join('');

  const logRows = (state.logs || []).map(l => {
    const levelClass = l.level === 'ERROR' ? 'badge-danger' : (l.level === 'WARN' ? 'badge-warn' : 'badge-muted');
    return `
      <tr>
        <td><span class="badge ${levelClass}">${escapeHtml(l.level)}</span></td>
        <td><code>${escapeHtml(l.component)}</code></td>
        <td>${escapeHtml(l.rule_name || l.rule_id || '-')}</td>
        <td style="max-width:420px; word-break:break-word;">${escapeHtml(l.message)}</td>
        <td>${l.created_at ? escapeHtml(new Date(l.created_at * 1000).toLocaleString('fa-IR')) : '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
        <div>
          <h3 style="margin:0;">🩺 سلامت فیلترها و خطاهای همگام‌سازی</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0 0 0;">
            فیلترهای دارای خطای متوالی با زمان‌بندی بازگشت تدریجی (Exponential Backoff) محافظت می‌شوند.
          </p>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="retryAllRecentFailed()">🔄 ارسال مجدد آگهی‌های ناموفق</button>
          <button class="btn btn-danger btn-sm" onclick="clearSystemLogs()">🧹 پاکسازی گزارش‌ها</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>فیلتر و کانال</th>
              <th>فاز / تعداد خطا</th>
              <th>آخرین خطا</th>
              <th>تلاش بعدی</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            ${errRulesRows || '<tr><td colspan="5" class="empty-state">✅ تمام فیلترهای سیستم بدون خطا در حال کار هستند.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 1rem 0;">🪵 آخرین گزارش‌های ثبت‌شده سیستم (System Logs)</h3>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>سطح</th>
              <th>بخش</th>
              <th>فیلتر</th>
              <th>پیام</th>
              <th>زمان</th>
            </tr>
          </thead>
          <tbody>
            ${logRows || '<tr><td colspan="5" class="empty-state">هیچ گزارش خطایی ثبت نشده است.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function clearSystemLogs() {
  if (!confirm('آیا تمام لاگ‌های خطا پاک شوند؟')) return;
  try {
    await apiCall('/api/admin/logs/clear', { method: 'POST' });
    notify('🧹 گزارش‌های سیستم پاکسازی شدند.');
    await fetchCurrentTabData();
  } catch (err) {
    notify('خطا: ' + err.message);
  }
}

initTheme();
fetchCurrentTabData();
