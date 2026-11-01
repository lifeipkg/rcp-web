/* 风控运营台：只经 api-gateway 访问后端（红线 RL-002），不做本地判定逻辑。 */

const SAMPLES = {
  content: {
    jobId: 1001,
    city: '杭州',
    trade: '装修',
    title: '招瓦工日结300包吃住',
    body: '工地招瓦工若干名，日结300，包吃住，地址杭州余杭，联系电话13800000000',
    ts: 1762000000000
  },
  message: {
    messageId: 5001,
    senderId: 9001,
    senderRole: 'RECRUITER',
    content: '加我微信 vx：abc123，走私下单给你返点，平台抽成太高了',
    ts: 1762000000000
  },
  account: {
    phone: '17012345678',
    virtualSegment: true,
    sameIpRegister24h: 12,
    sameDeviceAccounts: 6,
    registerHour: 3,
    postCount24h: 40
  },
  fund: {
    userId: 7001,
    grantAmount: 800,
    accountAgeDays: 1,
    sameDeviceAccounts: 7,
    sameBankCardAccounts: 4,
    applyCount24h: 9
  }
};

const DECISION_ZH = {
  PASS: '放行',
  WARN: '提示',
  LIMIT: '限流',
  EXTRA_REVIEW: '加审',
  INTERCEPT: '拦截',
  BAN: '封禁'
};

const state = {
  base: localStorage.getItem('rcp.apiBase') || 'http://localhost:8080',
  history: []
};

const $ = (id) => document.getElementById(id);

function init() {
  $('apiBase').value = state.base;
  const domainSelect = $('domain');
  Object.keys(SAMPLES).forEach((domain) => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    domainSelect.appendChild(option);
  });
  domainSelect.value = 'content';
  fillPayload('content');

  domainSelect.addEventListener('change', () => {
    fillPayload(domainSelect.value);
    $('eventId').value = suggestEventId(domainSelect.value);
  });

  $('saveBase').addEventListener('click', () => {
    state.base = $('apiBase').value.trim().replace(/\/+$/, '');
    localStorage.setItem('rcp.apiBase', state.base);
    setConn('已保存，未探测', '');
  });

  $('loadDomains').addEventListener('click', probeDomains);

  $('dispatchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    dispatch();
  });

  $('replayBtn').addEventListener('click', () => dispatch());

  $('bumpBtn').addEventListener('click', () => {
    $('version').value = Number($('version').value || 1) + 1;
    dispatch();
  });

  $('clearHistory').addEventListener('click', () => {
    state.history = [];
    renderHistory();
  });

  probeDomains();
}

function suggestEventId(domain) {
  switch (domain) {
    case 'content': return 'job:1001';
    case 'message': return 'msg:5001';
    case 'account': return 'acc:17012345678';
    case 'fund': return 'fund:7001';
    default: return 'job:1001';
  }
}

function fillPayload(domain) {
  $('payload').value = JSON.stringify(SAMPLES[domain], null, 2);
}

function setConn(text, kind) {
  const node = $('connState');
  node.textContent = text;
  node.className = `state ${kind || ''}`.trim();
}

async function probeDomains() {
  state.base = ($('apiBase').value || state.base).trim().replace(/\/+$/, '');
  try {
    const response = await fetch(`${state.base}/api/v1/patrol/domains`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json();
    const lines = body.patrolLines || [];
    syncDomainOptions(lines);
    setConn(`已连接 · ${lines.length} 条巡查线`, 'ok');
  } catch (error) {
    setConn(`连接失败：${error.message}`, 'bad');
  }
}

function syncDomainOptions(lines) {
  if (!lines.length) {
    return;
  }
  const select = $('domain');
  const current = select.value;
  select.innerHTML = '';
  lines.forEach((line) => {
    const option = document.createElement('option');
    option.value = line;
    option.textContent = line;
    select.appendChild(option);
  });
  select.value = lines.includes(current) ? current : lines[0];
}

async function dispatch() {
  let payload;
  try {
    payload = JSON.parse($('payload').value);
  } catch (error) {
    renderError(`payload 不是合法 JSON：${error.message}`);
    return;
  }

  const request = {
    eventId: $('eventId').value.trim(),
    domain: $('domain').value,
    version: Number($('version').value || 1),
    payload
  };

  const started = performance.now();
  try {
    const response = await fetch(`${state.base}/api/v1/patrol/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) {
      const text = await response.text();
      renderError(`HTTP ${response.status} · ${text || '请求被拒绝'}`);
      return;
    }
    const body = await response.json();
    renderVerdict(request, body, elapsed);
    pushHistory(request, body);
  } catch (error) {
    renderError(`请求失败：${error.message}（网关是否已启动？）`);
  }
}

function renderVerdict(request, body, elapsed) {
  const verdict = body.verdict || {};
  const decision = verdict.decision || 'PASS';
  const score = Number(verdict.score ?? 0);
  const detail = verdict.detail || {};

  $('elapsed').textContent = `${elapsed} ms`;
  const flags = [];
  if (body.accepted === false) {
    flags.push(`<span class="flag bad">未受理：${escapeHtml(body.rejectReason || '')}</span>`);
  }
  if (body.stateRollbackProtected) {
    flags.push('<span class="flag warn">状态机拦截了一次状态回跳</span>');
  }
  if (detail.matchedJobId) {
    flags.push(`<span class="flag">命中岗位 ${escapeHtml(String(detail.matchedJobId))}</span>`);
  }
  if (detail.hammingDistance !== undefined && detail.hammingDistance >= 0) {
    flags.push(`<span class="flag">汉明距离 ${escapeHtml(String(detail.hammingDistance))}</span>`);
  }
  if (Array.isArray(detail.hitWords) && detail.hitWords.length) {
    flags.push(`<span class="flag">命中词 ${escapeHtml(detail.hitWords.join('、'))}</span>`);
  }

  $('result').className = 'result';
  $('result').innerHTML = `
    <div class="verdict">
      <div class="verdict-top">
        <span class="badge ${escapeHtml(decision)}">${escapeHtml(DECISION_ZH[decision] || decision)}</span>
        <div class="score-wrap">
          <div class="score-bar"><div class="score-fill" style="width:${Math.min(100, Math.max(0, score))}%"></div></div>
          <div class="score-text">风险分 ${score} / 100</div>
        </div>
      </div>
      <div class="flags">${flags.join('') || '<span class="flag">无附加标记</span>'}</div>
      <dl class="kv">
        <dt>事件</dt><dd class="mono">${escapeHtml(request.eventId)}</dd>
        <dt>巡查线</dt><dd>${escapeHtml(request.domain)} · v${request.version}</dd>
        <dt>原因</dt><dd class="mono">${escapeHtml(verdict.reason || '—')}</dd>
        <dt>处置</dt><dd>${escapeHtml(describeDisposition(body.disposition))}</dd>
      </dl>
      <pre class="detail">${escapeHtml(JSON.stringify({
        accepted: body.accepted,
        rejectReason: body.rejectReason,
        verdict,
        disposition: body.disposition,
        stateRollbackProtected: body.stateRollbackProtected
      }, null, 2))}</pre>
    </div>`;
}

function describeDisposition(disposition) {
  if (!disposition || typeof disposition !== 'object') {
    return '—';
  }
  const action = disposition.action || disposition.disposition || disposition.status;
  const reason = disposition.reason;
  if (action && reason) {
    return `${action}（${reason}）`;
  }
  if (action) {
    return String(action);
  }
  return Object.entries(disposition).map(([key, value]) => `${key}=${value}`).join('，');
}

function renderError(message) {
  $('result').className = 'result';
  $('result').innerHTML = `<div class="verdict"><p style="color:var(--intercept);margin:0">${escapeHtml(message)}</p></div>`;
}

function pushHistory(request, body) {
  const verdict = body.verdict || {};
  state.history.unshift({
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    eventId: request.eventId,
    domain: request.domain,
    version: request.version,
    decision: body.accepted === false ? '拒绝' : (verdict.decision || '—'),
    score: verdict.score ?? '—',
    reason: body.accepted === false ? (body.rejectReason || '') : (verdict.reason || '')
  });
  renderHistory();
}

function renderHistory() {
  const body = $('historyBody');
  if (!state.history.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted">暂无记录</td></tr>';
    return;
  }
  body.innerHTML = state.history.map((row) => `
    <tr>
      <td class="mono">${escapeHtml(row.time)}</td>
      <td class="mono">${escapeHtml(row.eventId)}</td>
      <td>${escapeHtml(row.domain)}</td>
      <td class="mono">${escapeHtml(String(row.version))}</td>
      <td>${escapeHtml(row.decision)}</td>
      <td class="mono">${escapeHtml(String(row.score))}</td>
      <td class="mono">${escapeHtml(String(row.reason))}</td>
    </tr>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();
