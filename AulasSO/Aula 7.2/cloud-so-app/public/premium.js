/* =============================================================================
   CLOUD SO APP V5 — PREMIUM INTERACTION LAYER
   Vanilla JavaScript only. No charting framework and no client dependency.
   It extends app.js and intentionally keeps the original dashboard functional.
   ============================================================================= */

const premiumState = {
  startedAt: Date.now(),
  diagnostics: null,
  diagnosticsFetchedAt: 0,
  diagnosticsTimer: null,
  eventSource: null,
  connectionMode: 'polling',
  chartRangeSeconds: 300,
  samples: [],
  coreHistory: [],
  maxSamples: 1000,
  events: [],
  unreadEvents: 0,
  lastSystemData: null,
  lastHttp: null,
  lastThresholdState: {},
  lastPeaks: {
    cpu: 0,
    memory: 0,
    event: 0,
    network: 0
  },
  explorerPath: null,
  explorerDataset: 'system',
  commandSelection: 0,
  commandMatches: [],
  hoverTargets: new WeakSet(),
  browserMetrics: null,
  storageEstimate: null,
  settings: {
    accent: '#78a9ff',
    density: 'comfortable',
    radius: 16,
    glass: true,
    animations: true,
    gridlines: true,
    connectionMode: 'polling',
    retention: 1000,
    sessionAlerts: true,
    thresholds: {
      cpuWarn: 75,
      cpuCritical: 90,
      ramWarn: 80,
      ramCritical: 92,
      diskWarn: 85,
      eventWarn: 30
    }
  }
};

const PREMIUM_STORAGE_KEY = 'cloud-so-premium-settings-v5';
const PREMIUM_PANEL_STATE_KEY = 'cloud-so-premium-panels-v5';

function p$(id) {
  return document.getElementById(id);
}

function pClamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function pEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function pNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function pInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return Math.round(number).toLocaleString('pt-BR');
}

function pBytes(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '--';
  if (number === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(number) / Math.log(1024)), units.length - 1);
  const precision = index >= 3 ? Math.max(digits, 2) : digits;
  return `${(number / (1024 ** index)).toFixed(precision)} ${units[index]}`;
}

function pRate(value) {
  return `${pBytes(Number(value) || 0)}/s`;
}

function pDuration(milliseconds) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function pDateTime(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('pt-BR');
}

function pTime(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function pCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function pSetText(id, value, fallback = '--') {
  const element = p$(id);
  if (element) element.textContent = value ?? fallback;
}

function pSetWidth(id, value) {
  const element = p$(id);
  if (element) element.style.width = `${pClamp(value)}%`;
}

function pSafeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function pMean(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function pMin(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? Math.min(...numbers) : 0;
}

function pMax(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : 0;
}

function pStdDev(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length < 2) return 0;
  const mean = pMean(numbers);
  const variance = pMean(numbers.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function pPercentile(values, percentile) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return 0;
  const index = (numbers.length - 1) * pClamp(percentile, 0, 100) / 100;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return numbers[lower];
  const weight = index - lower;
  return numbers[lower] * (1 - weight) + numbers[upper] * weight;
}

function pTrend(values, tolerance = 1) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length < 4) return { label: 'Coletando', direction: 'flat', delta: 0 };
  const windowSize = Math.min(5, Math.floor(numbers.length / 2));
  const previous = pMean(numbers.slice(-(windowSize * 2), -windowSize));
  const current = pMean(numbers.slice(-windowSize));
  const delta = current - previous;
  if (delta > tolerance) return { label: `Subindo +${pNumber(delta, 1)}`, direction: 'up', delta };
  if (delta < -tolerance) return { label: `Caindo ${pNumber(delta, 1)}`, direction: 'down', delta };
  return { label: 'Estável', direction: 'flat', delta };
}

function pVisibleSamples() {
  if (!premiumState.samples.length) return [];
  if (!premiumState.chartRangeSeconds) return premiumState.samples;
  const start = Date.now() - premiumState.chartRangeSeconds * 1000;
  const filtered = premiumState.samples.filter(sample => sample.time >= start);
  return filtered.length ? filtered : premiumState.samples.slice(-2);
}

function pDownload(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function pCopy(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = String(text);
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    textarea.remove();
    return result;
  }
}

function pToast(message) {
  if (typeof showToast === 'function') {
    showToast(message);
    return;
  }
  console.log(message);
}

/* =============================================================================
   SETTINGS
   ============================================================================= */

function premiumLoadSettings() {
  const stored = pSafeJsonParse(localStorage.getItem(PREMIUM_STORAGE_KEY), {});
  const thresholds = {
    ...premiumState.settings.thresholds,
    ...(stored?.thresholds || {})
  };
  premiumState.settings = {
    ...premiumState.settings,
    ...(stored || {}),
    thresholds
  };
  premiumState.connectionMode = premiumState.settings.connectionMode || 'polling';
  premiumState.maxSamples = Number(premiumState.settings.retention) || 1000;
}

function premiumSaveSettings() {
  localStorage.setItem(PREMIUM_STORAGE_KEY, JSON.stringify(premiumState.settings));
}

function premiumApplySettings() {
  const settings = premiumState.settings;
  document.documentElement.dataset.density = settings.density || 'comfortable';
  document.documentElement.dataset.glass = settings.glass === false ? 'off' : 'on';
  document.documentElement.dataset.effects = settings.animations === false ? 'off' : 'on';
  document.documentElement.dataset.gridlines = settings.gridlines === false ? 'off' : 'on';
  document.documentElement.style.setProperty('--premium-accent', settings.accent || '#78a9ff');
  document.documentElement.style.setProperty('--premium-radius', `${Number(settings.radius) || 16}px`);

  if (settings.accent) {
    document.documentElement.style.setProperty('--accent', settings.accent);
  }

  const controls = {
    accentColorInput: settings.accent,
    densitySelect: settings.density,
    radiusRange: settings.radius,
    glassToggle: settings.glass,
    animationToggle: settings.animations,
    gridToggle: settings.gridlines,
    connectionModeSelect: settings.connectionMode,
    retentionSelect: String(settings.retention),
    sessionAlertsToggle: settings.sessionAlerts,
    cpuWarnThreshold: settings.thresholds.cpuWarn,
    cpuCriticalThreshold: settings.thresholds.cpuCritical,
    ramWarnThreshold: settings.thresholds.ramWarn,
    ramCriticalThreshold: settings.thresholds.ramCritical,
    diskWarnThreshold: settings.thresholds.diskWarn,
    eventWarnThreshold: settings.thresholds.eventWarn
  };

  for (const [id, value] of Object.entries(controls)) {
    const element = p$(id);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = value ?? '';
  }

  pSetText('radiusOutput', `${Number(settings.radius) || 16} px`);

  try {
    if (typeof history !== 'undefined' && history && Number(settings.retention)) {
      history.maxPoints = Number(settings.retention);
    }
  } catch {
    // The original history store is optional from this extension's perspective.
  }
}

function premiumReadSettingsForm() {
  const numberValue = (id, fallback) => {
    const value = Number(p$(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  };

  premiumState.settings = {
    ...premiumState.settings,
    accent: p$('accentColorInput')?.value || premiumState.settings.accent,
    density: p$('densitySelect')?.value || 'comfortable',
    radius: numberValue('radiusRange', 16),
    glass: Boolean(p$('glassToggle')?.checked),
    animations: Boolean(p$('animationToggle')?.checked),
    gridlines: Boolean(p$('gridToggle')?.checked),
    connectionMode: p$('connectionModeSelect')?.value || 'polling',
    retention: numberValue('retentionSelect', 1000),
    sessionAlerts: Boolean(p$('sessionAlertsToggle')?.checked),
    thresholds: {
      cpuWarn: numberValue('cpuWarnThreshold', 75),
      cpuCritical: numberValue('cpuCriticalThreshold', 90),
      ramWarn: numberValue('ramWarnThreshold', 80),
      ramCritical: numberValue('ramCriticalThreshold', 92),
      diskWarn: numberValue('diskWarnThreshold', 85),
      eventWarn: numberValue('eventWarnThreshold', 30)
    }
  };

  premiumState.maxSamples = premiumState.settings.retention;
  premiumSaveSettings();
  premiumApplySettings();
  premiumSetConnectionMode(premiumState.settings.connectionMode, false);
  premiumDrawAll();
}

function premiumResetSettings() {
  localStorage.removeItem(PREMIUM_STORAGE_KEY);
  premiumState.settings = {
    accent: '#78a9ff',
    density: 'comfortable',
    radius: 16,
    glass: true,
    animations: true,
    gridlines: true,
    connectionMode: 'polling',
    retention: 1000,
    sessionAlerts: true,
    thresholds: {
      cpuWarn: 75,
      cpuCritical: 90,
      ramWarn: 80,
      ramCritical: 92,
      diskWarn: 85,
      eventWarn: 30
    }
  };
  premiumApplySettings();
  premiumSaveSettings();
  premiumSetConnectionMode('polling', false);
  pToast('Configurações premium restauradas.');
}

/* =============================================================================
   DRAWERS
   ============================================================================= */

function premiumOpenSettings() {
  premiumCloseNotifications();
  p$('settingsDrawer')?.classList.add('open');
  p$('settingsDrawer')?.setAttribute('aria-hidden', 'false');
  p$('settingsOverlay')?.classList.add('open');
  p$('settingsOverlay')?.setAttribute('aria-hidden', 'false');
}

function premiumCloseSettings() {
  p$('settingsDrawer')?.classList.remove('open');
  p$('settingsDrawer')?.setAttribute('aria-hidden', 'true');
  p$('settingsOverlay')?.classList.remove('open');
  p$('settingsOverlay')?.setAttribute('aria-hidden', 'true');
}

function premiumOpenNotifications() {
  premiumCloseSettings();
  premiumState.unreadEvents = 0;
  premiumUpdateNotificationBadge();
  p$('notificationsDrawer')?.classList.add('open');
  p$('notificationsDrawer')?.setAttribute('aria-hidden', 'false');
  p$('notificationsOverlay')?.classList.add('open');
  p$('notificationsOverlay')?.setAttribute('aria-hidden', 'false');
  premiumRenderNotifications();
}

function premiumCloseNotifications() {
  p$('notificationsDrawer')?.classList.remove('open');
  p$('notificationsDrawer')?.setAttribute('aria-hidden', 'true');
  p$('notificationsOverlay')?.classList.remove('open');
  p$('notificationsOverlay')?.setAttribute('aria-hidden', 'true');
}

/* =============================================================================
   COMMAND PALETTE
   ============================================================================= */

function premiumCommandCatalog() {
  return [
    { group: 'Navegação', icon: '▦', title: 'Visão geral', subtitle: 'CPU, RAM, disco e uptime', keywords: 'overview início cpu ram disco', action: () => premiumNavigate('#overview') },
    { group: 'Navegação', icon: '◇', title: 'Cockpit', subtitle: 'Gauges e resumo estatístico', keywords: 'cockpit gauges sessão estatística', action: () => premiumNavigate('#cockpit') },
    { group: 'Navegação', icon: '⌁', title: 'Deep Analytics', subtitle: 'Gráficos e heatmap', keywords: 'analytics gráfico heatmap', action: () => premiumNavigate('#deep-analytics') },
    { group: 'Navegação', icon: '✦', title: 'Diagnóstico', subtitle: 'Insights, V8, DNS e PSI', keywords: 'diagnóstico insights v8 dns linux psi', action: () => premiumNavigate('#diagnostics') },
    { group: 'Navegação', icon: '◫', title: 'Hardware', subtitle: 'CPU, memória, GPU e sensores', keywords: 'hardware cpu memória gpu sensores', action: () => premiumNavigate('#hardware') },
    { group: 'Navegação', icon: '▤', title: 'Armazenamento', subtitle: 'Discos físicos e volumes', keywords: 'disco storage volume armazenamento', action: () => premiumNavigate('#storage') },
    { group: 'Navegação', icon: '⌁', title: 'Rede', subtitle: 'Interfaces e tráfego', keywords: 'rede network interface download upload', action: () => premiumNavigate('#network') },
    { group: 'Navegação', icon: '≋', title: 'Processos', subtitle: 'Top processos por CPU', keywords: 'processo cpu memória pid', action: () => premiumNavigate('#processes') },
    { group: 'Navegação', icon: '◉', title: 'Seu dispositivo', subtitle: 'Informações coletadas no navegador', keywords: 'cliente navegador browser dispositivo', action: () => premiumNavigate('#client') },
    { group: 'Navegação', icon: '⌘', title: 'Runtime Node.js', subtitle: 'Heap, event loop e HTTP', keywords: 'runtime node v8 event loop http', action: () => premiumNavigate('#runtime') },
    { group: 'Navegação', icon: '⌕', title: 'Data Explorer', subtitle: 'Snapshot JSON bruto', keywords: 'explorer json api dados raw', action: () => premiumNavigate('#explorer') },

    { group: 'Ações', icon: '↻', title: 'Atualizar agora', subtitle: 'Executar nova coleta imediatamente', keywords: 'refresh atualizar coleta', action: () => loadSystemData(true) },
    { group: 'Ações', icon: 'Ⅱ', title: 'Pausar / retomar', subtitle: 'Alternar monitoramento da sessão', keywords: 'pause pausar retomar monitoramento', action: () => p$('pauseButton')?.click() },
    { group: 'Ações', icon: '⛶', title: 'Tela cheia', subtitle: 'Alternar modo de apresentação', keywords: 'fullscreen tela cheia apresentação', action: () => toggleFullscreen() },
    { group: 'Ações', icon: '⚙', title: 'Abrir configurações', subtitle: 'Aparência, alertas e conexão', keywords: 'configuração settings aparência', action: premiumOpenSettings },
    { group: 'Ações', icon: '◌', title: 'Central de eventos', subtitle: 'Alertas registrados na sessão', keywords: 'notificação evento alerta', action: premiumOpenNotifications },
    { group: 'Ações', icon: '▣', title: 'Copiar resumo', subtitle: 'Copiar diagnóstico em texto', keywords: 'copiar resumo clipboard', action: premiumCopySummary },
    { group: 'Ações', icon: '{ }', title: 'Exportar JSON', subtitle: 'Baixar snapshot completo', keywords: 'export json baixar snapshot', action: premiumExportJson },
    { group: 'Ações', icon: '≡', title: 'Exportar CSV', subtitle: 'Baixar histórico da sessão', keywords: 'export csv histórico', action: premiumExportCsv },
    { group: 'Ações', icon: '▤', title: 'Imprimir relatório', subtitle: 'Abrir impressão do navegador', keywords: 'print imprimir relatório pdf', action: () => window.print() },

    { group: 'Visualização', icon: '□', title: 'Modo padrão', subtitle: 'Layout completo e equilibrado', keywords: 'modo padrão standard', action: () => premiumSetBaseView('standard') },
    { group: 'Visualização', icon: '▥', title: 'Modo compacto', subtitle: 'Mais informação na tela', keywords: 'modo compacto compact', action: () => premiumSetBaseView('compact') },
    { group: 'Visualização', icon: '⚡', title: 'Modo performance', subtitle: 'Prioriza dados de desempenho', keywords: 'modo performance desempenho', action: () => premiumSetBaseView('performance') },
    { group: 'Visualização', icon: '▦', title: 'Modo wallboard', subtitle: 'Painel para segundo monitor', keywords: 'modo wallboard monitor apresentação', action: () => premiumSetBaseView('wallboard') },
    { group: 'Visualização', icon: '☾', title: 'Tema Dark', subtitle: 'Tema escuro padrão', keywords: 'tema dark escuro', action: () => setTheme('dark') },
    { group: 'Visualização', icon: '☀', title: 'Tema Light', subtitle: 'Tema claro', keywords: 'tema light claro', action: () => setTheme('light') },
    { group: 'Visualização', icon: '✦', title: 'Tema Aurora', subtitle: 'Visual com destaque de cor', keywords: 'tema aurora', action: () => setTheme('aurora') },
    { group: 'Visualização', icon: '◐', title: 'Alto contraste', subtitle: 'Maior diferenciação visual', keywords: 'tema contraste accessibility', action: () => setTheme('contrast') }
  ];
}

function premiumSetBaseView(view) {
  if (typeof setViewMode === 'function') setViewMode(view);
  premiumCloseCommand();
}

function premiumNavigate(selector) {
  premiumCloseCommand();
  const element = document.querySelector(selector);
  if (!element) return;
  element.scrollIntoView({ behavior: premiumState.settings.animations ? 'smooth' : 'auto', block: 'start' });
}

function premiumOpenCommand(initialQuery = '') {
  premiumCloseSettings();
  premiumCloseNotifications();
  const palette = p$('commandPalette');
  const input = p$('commandSearchInput');
  if (!palette || !input) return;
  palette.classList.add('open');
  palette.setAttribute('aria-hidden', 'false');
  input.value = initialQuery;
  premiumState.commandSelection = 0;
  premiumRenderCommands(initialQuery);
  setTimeout(() => input.focus(), 20);
}

function premiumCloseCommand() {
  const palette = p$('commandPalette');
  if (!palette) return;
  palette.classList.remove('open');
  palette.setAttribute('aria-hidden', 'true');
}

function premiumRenderCommands(query = '') {
  const container = p$('commandResults');
  if (!container) return;
  const normalized = String(query).trim().toLowerCase();
  const catalog = premiumCommandCatalog();
  const matches = normalized
    ? catalog.filter(command => `${command.title} ${command.subtitle} ${command.keywords} ${command.group}`.toLowerCase().includes(normalized))
    : catalog;

  premiumState.commandMatches = matches;
  premiumState.commandSelection = pClamp(premiumState.commandSelection, 0, Math.max(0, matches.length - 1));

  if (!matches.length) {
    container.innerHTML = '<div class="empty-state">Nenhum comando ou seção encontrado.</div>';
    return;
  }

  let lastGroup = '';
  const html = [];
  matches.forEach((command, index) => {
    if (command.group !== lastGroup) {
      html.push(`<div class="command-group-label">${pEscape(command.group)}</div>`);
      lastGroup = command.group;
    }
    html.push(`
      <button class="command-item ${index === premiumState.commandSelection ? 'selected' : ''}" type="button" data-command-index="${index}">
        <span class="command-item-icon">${pEscape(command.icon)}</span>
        <span><strong>${pEscape(command.title)}</strong><small>${pEscape(command.subtitle)}</small></span>
        <em>Enter</em>
      </button>`);
  });
  container.innerHTML = html.join('');

  container.querySelectorAll('[data-command-index]').forEach(button => {
    button.addEventListener('click', () => premiumExecuteCommand(Number(button.dataset.commandIndex)));
  });

  container.querySelector('.command-item.selected')?.scrollIntoView({ block: 'nearest' });
}

function premiumExecuteCommand(index = premiumState.commandSelection) {
  const command = premiumState.commandMatches[index];
  if (!command) return;
  premiumCloseCommand();
  command.action();
}

/* =============================================================================
   CONNECTION MODES
   ============================================================================= */

function premiumSetConnectionBadge(mode, detail = '') {
  const badge = p$('premiumConnectionState');
  if (!badge) return;
  badge.classList.remove('is-live', 'is-polling', 'is-connecting', 'is-error');
  if (mode === 'sse') {
    badge.classList.add('is-live');
    badge.innerHTML = `<i></i> Live stream${detail ? ` · ${pEscape(detail)}` : ''}`;
  } else if (mode === 'polling') {
    badge.classList.add('is-polling');
    badge.innerHTML = `<i></i> Polling${detail ? ` · ${pEscape(detail)}` : ''}`;
  } else if (mode === 'error') {
    badge.classList.add('is-error');
    badge.innerHTML = `<i></i> Reconectando${detail ? ` · ${pEscape(detail)}` : ''}`;
  } else {
    badge.classList.add('is-connecting');
    badge.innerHTML = '<i></i> Conectando';
  }
}

function premiumCloseSse() {
  if (premiumState.eventSource) {
    premiumState.eventSource.close();
    premiumState.eventSource = null;
  }
}

function premiumStartSse() {
  premiumCloseSse();
  if (!('EventSource' in window)) {
    premiumState.connectionMode = 'polling';
    premiumState.settings.connectionMode = 'polling';
    premiumSaveSettings();
    premiumSetConnectionBadge('polling', 'SSE indisponível');
    scheduleRefresh();
    return;
  }

  try {
    clearInterval(refreshTimer);
  } catch {
    // Base timer may not be exposed in a future build.
  }

  premiumSetConnectionBadge('connecting');
  const source = new EventSource('/api/live');
  premiumState.eventSource = source;

  source.addEventListener('open', () => {
    premiumSetConnectionBadge('sse');
    premiumAddEvent('success', 'Live stream conectado', 'O dashboard está recebendo snapshots por Server-Sent Events.', false);
  });

  source.addEventListener('system', event => {
    if (isPaused) return;
    try {
      const data = JSON.parse(event.data);
      updateDashboard(data);
    } catch (error) {
      console.error('Falha ao interpretar SSE', error);
    }
  });

  source.addEventListener('warning', () => {
    premiumSetConnectionBadge('error');
  });

  source.addEventListener('error', () => {
    premiumSetConnectionBadge('error');
  });
}

function premiumSetConnectionMode(mode, notify = true) {
  const next = mode === 'sse' ? 'sse' : 'polling';
  premiumState.connectionMode = next;
  premiumState.settings.connectionMode = next;
  premiumSaveSettings();
  if (p$('connectionModeSelect')) p$('connectionModeSelect').value = next;

  if (next === 'sse') {
    premiumStartSse();
  } else {
    premiumCloseSse();
    premiumSetConnectionBadge('polling');
    if (!isPaused) scheduleRefresh();
  }

  if (notify) pToast(next === 'sse' ? 'Live stream SSE ativado.' : 'Polling ativado.');
}

/* =============================================================================
   DIAGNOSTICS FETCHING
   ============================================================================= */

async function premiumFetchDiagnostics(force = false) {
  const now = Date.now();
  if (!force && premiumState.diagnostics && now - premiumState.diagnosticsFetchedAt < 12000) {
    return premiumState.diagnostics;
  }

  try {
    const response = await fetch('/api/diagnostics', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const diagnostics = await response.json();
    premiumState.diagnostics = diagnostics;
    premiumState.diagnosticsFetchedAt = Date.now();
    premiumUpdateDiagnosticsUi(diagnostics);
    premiumRenderExplorer();
    return diagnostics;
  } catch (error) {
    console.error('Diagnostics:', error);
    premiumAddEvent('warn', 'Diagnóstico indisponível', 'A API /api/diagnostics não respondeu nesta coleta.', false);
    return null;
  }
}

function premiumScheduleDiagnostics() {
  clearInterval(premiumState.diagnosticsTimer);
  premiumState.diagnosticsTimer = setInterval(() => {
    if (document.visibilityState === 'visible') premiumFetchDiagnostics(false);
  }, 15000);
}

/* =============================================================================
   SAMPLE COLLECTION
   ============================================================================= */

function premiumNetworkTotals(data) {
  return (data?.network?.traffic || []).reduce((totals, item) => {
    totals.download += Number(item.receiveRate?.bytes || 0);
    totals.upload += Number(item.sendRate?.bytes || 0);
    totals.errors += Number(item.errors || 0);
    totals.dropped += Number(item.dropped || 0);
    return totals;
  }, { download: 0, upload: 0, errors: 0, dropped: 0 });
}

function premiumCurrentLoad() {
  return Number(premiumState.diagnostics?.scheduler?.loadAverage?.normalizedOneMinutePercent || 0);
}

function premiumPushSample(data) {
  const now = Date.now();
  const network = premiumNetworkTotals(data);
  const requests = Number(data?.runtime?.http?.requests || 0);
  let requestRate = 0;

  if (premiumState.lastHttp) {
    const elapsed = Math.max(.001, (now - premiumState.lastHttp.time) / 1000);
    requestRate = Math.max(0, (requests - premiumState.lastHttp.requests) / elapsed);
  }
  premiumState.lastHttp = { time: now, requests };

  const sample = {
    time: now,
    cpu: Number(data?.cpu?.usagePercent || 0),
    memory: Number(data?.memory?.usedPercent || 0),
    disk: data?.storage?.root?.available ? Number(data.storage.root.usedPercent || 0) : null,
    eventP95: Number(data?.runtime?.eventLoop?.p95Ms || 0),
    eventP99: Number(data?.runtime?.eventLoop?.p99Ms || 0),
    nodeCpu: Number(data?.runtime?.cpu?.totalPercent || 0),
    load: premiumCurrentLoad(),
    download: network.download,
    upload: network.upload,
    networkErrors: network.errors,
    networkDropped: network.dropped,
    requests,
    requestRate,
    responses2xx: Number(data?.runtime?.http?.responses2xx || 0),
    responses4xx: Number(data?.runtime?.http?.responses4xx || 0),
    responses5xx: Number(data?.runtime?.http?.responses5xx || 0),
    processCount: Number(data?.processes?.totalCount || 0),
    heapUsed: Number(data?.runtime?.memory?.heapUsed?.bytes || 0),
    rss: Number(data?.runtime?.memory?.rss?.bytes || 0)
  };

  premiumState.samples.push(sample);
  if (premiumState.samples.length > premiumState.maxSamples) {
    premiumState.samples.splice(0, premiumState.samples.length - premiumState.maxSamples);
  }

  premiumState.coreHistory.push({
    time: now,
    values: (data?.cpu?.perCore || []).map(core => Number(core.usagePercent || 0))
  });
  const heatmapLimit = Math.min(180, premiumState.maxSamples);
  if (premiumState.coreHistory.length > heatmapLimit) {
    premiumState.coreHistory.splice(0, premiumState.coreHistory.length - heatmapLimit);
  }

  pSetText('premiumSampleRate', `${premiumState.samples.length} amostras`);
  premiumEvaluateSessionEvents(data, sample);
}

/* =============================================================================
   EVENT TIMELINE AND NOTIFICATIONS
   ============================================================================= */

function premiumAddEvent(severity, title, message, unread = true) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    severity: severity || 'info',
    title: String(title || 'Evento'),
    message: String(message || ''),
    time: Date.now()
  };
  premiumState.events.unshift(event);
  if (premiumState.events.length > 100) premiumState.events.length = 100;
  if (unread) premiumState.unreadEvents += 1;
  premiumUpdateNotificationBadge();
  premiumRenderTimeline();
  premiumRenderNotifications();
}

function premiumUpdateNotificationBadge() {
  const badge = p$('notificationBadge');
  if (!badge) return;
  badge.textContent = premiumState.unreadEvents > 99 ? '99+' : String(premiumState.unreadEvents);
  badge.classList.toggle('show', premiumState.unreadEvents > 0);
}

function premiumRenderTimeline() {
  const container = p$('liveTimeline');
  if (!container) return;
  const items = premiumState.events.slice(0, 12);
  if (!items.length) {
    container.innerHTML = '<div class="timeline-empty">Aguardando eventos relevantes da sessão.</div>';
    return;
  }
  container.innerHTML = items.map(event => `
    <div class="timeline-event ${pEscape(event.severity)}">
      <span class="timeline-event-dot"></span>
      <div><strong>${pEscape(event.title)}</strong><p>${pEscape(event.message)}</p></div>
      <time>${pEscape(pTime(event.time))}</time>
    </div>`).join('');
}

function premiumRenderNotifications() {
  const container = p$('notificationList');
  if (!container) return;
  const items = premiumState.events;
  pSetText('notificationSummary', items.length ? `${items.length} evento(s) nesta sessão` : 'Nenhum evento');
  if (!items.length) {
    container.innerHTML = '<div class="notification-empty">Os eventos da sessão aparecerão aqui.</div>';
    return;
  }
  container.innerHTML = items.map(event => `
    <div class="notification-item ${pEscape(event.severity)}">
      <i></i>
      <div>
        <strong>${pEscape(event.title)}</strong>
        <p>${pEscape(event.message)}</p>
        <time>${pEscape(pDateTime(event.time))}</time>
      </div>
    </div>`).join('');
}

function premiumThresholdTransition(key, active, severity, title, message) {
  const previous = Boolean(premiumState.lastThresholdState[key]);
  premiumState.lastThresholdState[key] = active;
  if (!premiumState.settings.sessionAlerts) return;
  if (active && !previous) premiumAddEvent(severity, title, message, true);
  if (!active && previous) premiumAddEvent('success', `${title} normalizada`, 'A métrica retornou para uma faixa abaixo do limite configurado.', true);
}

function premiumEvaluateSessionEvents(data, sample) {
  const thresholds = premiumState.settings.thresholds;
  premiumThresholdTransition(
    'cpuWarn',
    sample.cpu >= thresholds.cpuWarn,
    sample.cpu >= thresholds.cpuCritical ? 'danger' : 'warn',
    'CPU elevada',
    `Uso atual em ${pNumber(sample.cpu, 1)}%. Limite de atenção: ${thresholds.cpuWarn}%.`
  );
  premiumThresholdTransition(
    'ramWarn',
    sample.memory >= thresholds.ramWarn,
    sample.memory >= thresholds.ramCritical ? 'danger' : 'warn',
    'Memória elevada',
    `RAM em ${pNumber(sample.memory, 1)}%. Limite de atenção: ${thresholds.ramWarn}%.`
  );
  if (sample.disk != null) {
    premiumThresholdTransition(
      'diskWarn',
      sample.disk >= thresholds.diskWarn,
      'warn',
      'Armazenamento elevado',
      `Volume principal está ${pNumber(sample.disk, 1)}% ocupado.`
    );
  }
  premiumThresholdTransition(
    'eventWarn',
    sample.eventP95 >= thresholds.eventWarn,
    sample.eventP95 >= thresholds.eventWarn * 2.5 ? 'danger' : 'warn',
    'Event loop elevado',
    `P95 atual em ${pNumber(sample.eventP95, 1)} ms.`
  );

  const throughput = sample.download + sample.upload;
  if (sample.cpu > premiumState.lastPeaks.cpu + 8 && sample.cpu >= 70) {
    premiumState.lastPeaks.cpu = sample.cpu;
    if (premiumState.settings.sessionAlerts) premiumAddEvent('info', 'Novo pico de CPU', `${pNumber(sample.cpu, 1)}% nesta sessão.`, false);
  } else {
    premiumState.lastPeaks.cpu = Math.max(premiumState.lastPeaks.cpu, sample.cpu);
  }

  if (sample.memory > premiumState.lastPeaks.memory + 5 && sample.memory >= 70) {
    premiumState.lastPeaks.memory = sample.memory;
    if (premiumState.settings.sessionAlerts) premiumAddEvent('info', 'Novo pico de RAM', `${pNumber(sample.memory, 1)}% nesta sessão.`, false);
  } else {
    premiumState.lastPeaks.memory = Math.max(premiumState.lastPeaks.memory, sample.memory);
  }

  if (sample.eventP95 > premiumState.lastPeaks.event + 10 && sample.eventP95 >= 25) {
    premiumState.lastPeaks.event = sample.eventP95;
  } else {
    premiumState.lastPeaks.event = Math.max(premiumState.lastPeaks.event, sample.eventP95);
  }

  if (throughput > premiumState.lastPeaks.network * 1.6 && throughput > 1024 * 128) {
    premiumState.lastPeaks.network = throughput;
  } else {
    premiumState.lastPeaks.network = Math.max(premiumState.lastPeaks.network, throughput);
  }

  if (!premiumState.events.length) {
    premiumAddEvent('success', 'Monitoramento iniciado', `Host ${data?.system?.hostname || 'desconhecido'} conectado ao dashboard premium.`, false);
  }
}

/* =============================================================================
   COCKPIT
   ============================================================================= */

function premiumSetGauge(id, value, label, max = 100) {
  const element = p$(id);
  if (!element) return;
  const normalized = pClamp((Number(value) / Math.max(1, Number(max))) * 100);
  element.style.setProperty('--gauge-value', normalized.toFixed(1));
  if (normalized >= 90) element.style.setProperty('--gauge-color', 'var(--danger)');
  else if (normalized >= 75) element.style.setProperty('--gauge-color', 'var(--warning)');
  else element.style.removeProperty('--gauge-color');
  if (label != null) {
    const valueElement = element.querySelector('.gauge-center strong');
    if (valueElement) valueElement.textContent = label;
  }
}

function premiumMetricStats(key) {
  const samples = pVisibleSamples();
  const values = samples.map(sample => sample[key]).filter(Number.isFinite);
  return {
    now: values.at(-1) ?? 0,
    mean: pMean(values),
    min: pMin(values),
    max: pMax(values),
    p95: pPercentile(values, 95),
    stdDev: pStdDev(values),
    trend: pTrend(values, key === 'download' ? 1024 * 20 : key === 'eventP95' ? 2 : 1)
  };
}

function premiumUpdateCockpit(data) {
  const network = premiumNetworkTotals(data);
  const cpu = Number(data?.cpu?.usagePercent || 0);
  const ram = Number(data?.memory?.usedPercent || 0);
  const disk = data?.storage?.root?.available ? Number(data.storage.root.usedPercent || 0) : 0;
  const eventP95 = Number(data?.runtime?.eventLoop?.p95Ms || 0);
  const throughput = network.download + network.upload;
  const networkPeak = Math.max(1024 * 1024, ...premiumState.samples.map(sample => sample.download + sample.upload));

  premiumSetGauge('premiumCpuGauge', cpu, `${pNumber(cpu, 0)}%`);
  premiumSetGauge('premiumRamGauge', ram, `${pNumber(ram, 0)}%`);
  premiumSetGauge('premiumDiskGauge', disk, data?.storage?.root?.available ? `${pNumber(disk, 0)}%` : 'N/D');
  premiumSetGauge('premiumEventGauge', eventP95, pNumber(eventP95, 0), Math.max(100, premiumState.settings.thresholds.eventWarn * 3));
  premiumSetGauge('premiumNetworkGauge', throughput, pBytes(throughput), networkPeak);

  const cpuStats = premiumMetricStats('cpu');
  const ramStats = premiumMetricStats('memory');
  const downStats = premiumMetricStats('download');
  const eventStats = premiumMetricStats('eventP95');

  pSetText('premiumCpuTrend', cpuStats.trend.label);
  pSetText('premiumCpuAverage', `Média ${pNumber(cpuStats.mean, 1)}% · P95 ${pNumber(cpuStats.p95, 1)}%`);
  pSetText('premiumRamTrend', ramStats.trend.label);
  pSetText('premiumRamAverage', `Média ${pNumber(ramStats.mean, 1)}% · desvio ${pNumber(ramStats.stdDev, 1)}`);
  pSetText('premiumDiskTrend', disk >= premiumState.settings.thresholds.diskWarn ? 'Espaço baixo' : 'Capacidade normal');
  pSetText('premiumDiskFree', `Livre ${data?.storage?.root?.free?.formatted || '--'}`);
  pSetText('premiumEventTrend', eventStats.trend.label);
  pSetText('premiumEventAverage', `Média ${pNumber(eventStats.mean, 1)} ms · P95 sessão ${pNumber(eventStats.p95, 1)} ms`);
  pSetText('premiumNetworkTrend', pRate(throughput));
  pSetText('premiumNetworkAverage', `↓ ${pRate(network.download)} · ↑ ${pRate(network.upload)}`);

  pSetText('premiumSessionDuration', pDuration(Date.now() - premiumState.startedAt));

  pSetText('statCpuNow', `${pNumber(cpuStats.now, 1)}%`);
  pSetText('statCpuAvg', `${pNumber(cpuStats.mean, 1)}%`);
  pSetText('statCpuMin', `${pNumber(cpuStats.min, 1)}%`);
  pSetText('statCpuMax', `${pNumber(cpuStats.max, 1)}%`);

  pSetText('statRamNow', `${pNumber(ramStats.now, 1)}%`);
  pSetText('statRamAvg', `${pNumber(ramStats.mean, 1)}%`);
  pSetText('statRamMin', `${pNumber(ramStats.min, 1)}%`);
  pSetText('statRamMax', `${pNumber(ramStats.max, 1)}%`);

  pSetText('statDownNow', pRate(downStats.now));
  pSetText('statDownAvg', pRate(downStats.mean));
  pSetText('statDownMin', pRate(downStats.min));
  pSetText('statDownMax', pRate(downStats.max));

  pSetText('statEventNow', `${pNumber(eventStats.now, 1)} ms`);
  pSetText('statEventAvg', `${pNumber(eventStats.mean, 1)} ms`);
  pSetText('statEventMin', `${pNumber(eventStats.min, 1)} ms`);
  pSetText('statEventMax', `${pNumber(eventStats.max, 1)} ms`);
}

/* =============================================================================
   CANVAS CORE
   ============================================================================= */

function premiumPrepareCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width || canvas.parentElement?.clientWidth || 300);
  const height = Math.max(1, rect.height || Number(canvas.getAttribute('height')) || 250);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height, dpr };
}

function premiumNiceMax(value) {
  const number = Math.max(1, Number(value) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(number));
  const normalized = number / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function premiumDrawGrid(context, bounds, maxY, formatter) {
  if (premiumState.settings.gridlines === false) return;
  const { left, top, width, height } = bounds;
  const border = pCss('--border') || '#334155';
  const muted = pCss('--muted') || '#94a3b8';
  context.save();
  context.font = '9px system-ui';
  context.fillStyle = muted;
  context.strokeStyle = border;
  context.lineWidth = 1;
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = top + height - ratio * height;
    const value = maxY * ratio;
    context.globalAlpha = .5;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(left + width, y);
    context.stroke();
    context.globalAlpha = 1;
    context.fillText(formatter(value), 3, y + 3);
  }
  context.restore();
}

function premiumDrawLineChart(canvasId, series, options = {}) {
  const canvas = p$(canvasId);
  const prepared = premiumPrepareCanvas(canvas);
  if (!prepared) return;
  const { context: ctx, width, height } = prepared;
  const samples = options.samples || pVisibleSamples();
  const left = 44;
  const right = 12;
  const top = 12;
  const bottom = 27;
  const graphWidth = Math.max(1, width - left - right);
  const graphHeight = Math.max(1, height - top - bottom);
  const values = series.flatMap(item => samples.map(sample => Number(sample[item.key]) || 0));
  const maxY = options.maxY || premiumNiceMax(Math.max(1, ...values) * 1.12);
  const formatter = options.formatter || (value => pNumber(value, 0));

  premiumDrawGrid(ctx, { left, top, width: graphWidth, height: graphHeight }, maxY, formatter);

  if (!samples.length) {
    ctx.fillStyle = pCss('--muted') || '#94a3b8';
    ctx.font = '11px system-ui';
    ctx.fillText('Aguardando amostras...', left, top + 18);
    return;
  }

  const start = samples[0].time;
  const end = samples.at(-1).time;
  ctx.fillStyle = pCss('--muted') || '#94a3b8';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(pTime(start), left, height - 7);
  ctx.textAlign = 'right';
  ctx.fillText(pTime(end), width - right, height - 7);
  ctx.textAlign = 'left';

  const pointSets = [];

  series.forEach((item, seriesIndex) => {
    const color = item.color || pCss(item.colorVar || '--premium-accent') || '#78a9ff';
    const points = samples.map((sample, index) => {
      const x = left + (samples.length === 1 ? graphWidth / 2 : (index / Math.max(1, samples.length - 1)) * graphWidth);
      const value = Math.max(0, Number(sample[item.key]) || 0);
      const y = top + graphHeight - (value / maxY) * graphHeight;
      return { x, y, value, sample };
    });
    pointSets.push({ item, points, color });

    if (item.fill !== false && points.length > 1) {
      const gradient = ctx.createLinearGradient(0, top, 0, top + graphHeight);
      gradient.addColorStop(0, `${color}2b`);
      gradient.addColorStop(1, `${color}00`);
      ctx.beginPath();
      ctx.moveTo(points[0].x, top + graphHeight);
      points.forEach(point => ctx.lineTo(point.x, point.y));
      ctx.lineTo(points.at(-1).x, top + graphHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = item.lineWidth || (seriesIndex === 0 ? 2 : 1.7);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
  });

  canvas._premiumMeta = {
    type: 'line',
    samples,
    series,
    pointSets,
    left,
    right,
    top,
    bottom,
    graphWidth,
    graphHeight,
    maxY,
    formatter
  };
  premiumEnableCanvasTooltip(canvas);
}

function premiumEnableCanvasTooltip(canvas) {
  if (!canvas || premiumState.hoverTargets.has(canvas)) return;
  premiumState.hoverTargets.add(canvas);

  canvas.addEventListener('mousemove', event => {
    const meta = canvas._premiumMeta;
    const tooltip = p$('premiumHoverTooltip');
    if (!meta || !tooltip) return;
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (meta.type === 'line') {
      const ratio = pClamp((localX - meta.left) / Math.max(1, meta.graphWidth), 0, 1);
      const index = Math.round(ratio * Math.max(0, meta.samples.length - 1));
      const sample = meta.samples[index];
      if (!sample) return;
      const rows = meta.series.map(series => {
        const value = Number(sample[series.key]) || 0;
        const text = series.tooltip ? series.tooltip(value) : meta.formatter(value);
        return `<div class="tooltip-row"><span>${pEscape(series.label || series.key)}</span><b>${pEscape(text)}</b></div>`;
      }).join('');
      tooltip.innerHTML = `<strong>${pEscape(pTime(sample.time))}</strong>${rows}`;
    } else if (meta.type === 'scatter') {
      let nearest = null;
      let distance = Infinity;
      for (const point of meta.points || []) {
        const current = Math.hypot(point.x - localX, point.y - localY);
        if (current < distance) {
          distance = current;
          nearest = point;
        }
      }
      if (!nearest || distance > 28) {
        tooltip.classList.remove('show');
        return;
      }
      tooltip.innerHTML = `
        <strong>${pEscape(nearest.item.name || 'Processo')}</strong>
        <div class="tooltip-row"><span>PID</span><b>${pEscape(nearest.item.pid)}</b></div>
        <div class="tooltip-row"><span>CPU</span><b>${pNumber(nearest.item.cpuPercent,1)}%</b></div>
        <div class="tooltip-row"><span>Memória</span><b>${pEscape(nearest.item.memory?.formatted || '--')}</b></div>`;
    } else if (meta.type === 'heatmap') {
      const column = Math.floor((localX - meta.left) / meta.cellWidth);
      const row = Math.floor((localY - meta.top) / meta.cellHeight);
      if (column < 0 || row < 0 || column >= meta.columns || row >= meta.rows) {
        tooltip.classList.remove('show');
        return;
      }
      const historyIndex = Math.max(0, meta.history.length - meta.columns) + column;
      const sample = meta.history[historyIndex];
      const value = sample?.values?.[row];
      tooltip.innerHTML = `
        <strong>CPU ${row + 1}</strong>
        <div class="tooltip-row"><span>Uso</span><b>${pNumber(value,1)}%</b></div>
        <div class="tooltip-row"><span>Horário</span><b>${pEscape(pTime(sample?.time))}</b></div>`;
    }

    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
    tooltip.classList.add('show');
    tooltip.setAttribute('aria-hidden', 'false');
  });

  canvas.addEventListener('mouseleave', () => {
    const tooltip = p$('premiumHoverTooltip');
    tooltip?.classList.remove('show');
    tooltip?.setAttribute('aria-hidden', 'true');
  });
}

/* =============================================================================
   PREMIUM CHARTS
   ============================================================================= */

function premiumDrawLoadChart() {
  const samples = pVisibleSamples();
  premiumDrawLineChart('loadChart', [
    { key: 'load', label: 'Load normalizado', colorVar: '--premium-accent', tooltip: value => `${pNumber(value,1)}%` },
    { key: 'nodeCpu', label: 'CPU Node', colorVar: '--warning', tooltip: value => `${pNumber(value,1)}%`, fill: false }
  ], {
    samples,
    maxY: 100,
    formatter: value => `${pNumber(value,0)}%`
  });
  const loadValues = samples.map(sample => sample.load);
  const nodeValues = samples.map(sample => sample.nodeCpu);
  pSetText('loadChartSummary', `Load ${pNumber(loadValues.at(-1) || 0,1)}% · Node ${pNumber(nodeValues.at(-1) || 0,1)}%`);
  pSetText('loadChartPeak', `Pico ${pNumber(Math.max(pMax(loadValues),pMax(nodeValues)),1)}%`);
}

function premiumDrawMemoryDonut(data) {
  const canvas = p$('memoryDonutChart');
  const prepared = premiumPrepareCanvas(canvas);
  if (!prepared) return;
  const { context: ctx, width, height } = prepared;
  const total = Number(data?.memory?.total?.bytes || 0);
  const used = Number(data?.memory?.used?.bytes || 0);
  const free = Number(data?.memory?.free?.bytes || 0);
  const details = data?.memory?.details || {};
  const cache = Number(details.cached?.bytes || 0);
  const buffers = Number(details.buffers?.bytes || 0);
  const categories = [
    { name: 'Usada', value: Math.max(0, used - cache - buffers), color: pCss('--premium-accent') || '#78a9ff' },
    { name: 'Cache', value: cache, color: pCss('--accent-2') || '#a78bfa' },
    { name: 'Buffers', value: buffers, color: pCss('--warning') || '#f59e0b' },
    { name: 'Livre', value: free, color: pCss('--success') || '#22c55e' }
  ].filter(item => item.value > 0);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width,height) * .37;
  const lineWidth = Math.max(18, radius * .24);
  let angle = -Math.PI / 2;

  ctx.lineCap = 'butt';
  categories.forEach(item => {
    const fraction = total > 0 ? item.value / total : 0;
    const next = angle + fraction * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = lineWidth;
    ctx.arc(cx,cy,radius,angle,next);
    ctx.stroke();
    angle = next;
  });

  if (!categories.length) {
    ctx.beginPath();
    ctx.strokeStyle = pCss('--border') || '#334155';
    ctx.lineWidth = lineWidth;
    ctx.arc(cx,cy,radius,0,Math.PI*2);
    ctx.stroke();
  }

  const percent = Number(data?.memory?.usedPercent || 0);
  pSetText('memoryDonutCenter', `${pNumber(percent,0)}%`);
  pSetText('memoryCompositionLabel', total ? data.memory.total.formatted : '--');

  const legend = p$('memoryLegend');
  if (legend) {
    legend.innerHTML = categories.map(item => `
      <div class="premium-legend-item">
        <span><i style="--item-color:${pEscape(item.color)}"></i>${pEscape(item.name)}</span>
        <strong>${pEscape(pBytes(item.value))}</strong>
      </div>`).join('');
  }
}

function premiumHeatColor(value) {
  const percentage = pClamp(value);
  const styles = getComputedStyle(document.documentElement);
  const success = styles.getPropertyValue('--success').trim() || '#22c55e';
  const accent = styles.getPropertyValue('--premium-accent').trim() || '#78a9ff';
  const warning = styles.getPropertyValue('--warning').trim() || '#f59e0b';
  const danger = styles.getPropertyValue('--danger').trim() || '#ef4444';
  if (percentage < 30) return success;
  if (percentage < 65) return accent;
  if (percentage < 85) return warning;
  return danger;
}

function premiumDrawCpuHeatmap() {
  const canvas = p$('cpuHeatmapChart');
  const prepared = premiumPrepareCanvas(canvas);
  if (!prepared) return;
  const { context: ctx, width, height } = prepared;
  const historyData = premiumState.coreHistory;
  const rows = Math.max(1, ...historyData.map(item => item.values.length));
  const maxColumns = Math.max(1, Math.floor((width - 45) / 8));
  const columns = Math.min(maxColumns, historyData.length || 1);
  const left = 35;
  const top = 10;
  const graphWidth = Math.max(1, width - left - 6);
  const graphHeight = Math.max(1, height - top - 19);
  const cellWidth = graphWidth / columns;
  const cellHeight = graphHeight / rows;
  const visible = historyData.slice(-columns);

  ctx.font = '8px system-ui';
  ctx.fillStyle = pCss('--muted') || '#94a3b8';
  visible.forEach((sample, columnIndex) => {
    sample.values.forEach((value, rowIndex) => {
      ctx.globalAlpha = .28 + pClamp(value) / 100 * .72;
      ctx.fillStyle = premiumHeatColor(value);
      ctx.fillRect(
        left + columnIndex * cellWidth + .5,
        top + rowIndex * cellHeight + .5,
        Math.max(1, cellWidth - 1),
        Math.max(1, cellHeight - 1)
      );
    });
  });
  ctx.globalAlpha = 1;

  const labelStep = rows > 16 ? Math.ceil(rows / 8) : rows > 8 ? 2 : 1;
  for (let row = 0; row < rows; row += labelStep) {
    ctx.fillStyle = pCss('--muted') || '#94a3b8';
    ctx.fillText(String(row + 1), 3, top + row * cellHeight + Math.min(cellHeight - 1, 9));
  }

  if (!historyData.length) {
    ctx.fillStyle = pCss('--muted') || '#94a3b8';
    ctx.fillText('Aguardando histórico dos núcleos...', left, top + 15);
  }

  pSetText('heatmapCoreCount', `${rows} núcleo(s)`);
  canvas._premiumMeta = {
    type: 'heatmap',
    history: visible,
    rows,
    columns,
    left,
    top,
    cellWidth,
    cellHeight
  };
  premiumEnableCanvasTooltip(canvas);
}

function premiumRenderStorageBars(data) {
  const container = p$('storageCapacityBars');
  if (!container) return;
  let volumes = [...(data?.storage?.volumes || [])];
  if (!volumes.length && data?.storage?.root?.available) volumes = [data.storage.root];
  pSetText('storageCapacityCount', `${volumes.length} volume(s)`);
  if (!volumes.length) {
    container.innerHTML = '<div class="empty-state">Informações de volume indisponíveis.</div>';
    return;
  }
  container.innerHTML = volumes.slice(0, 12).map((volume, index) => {
    const usedPercent = Number(volume.usedPercent || 0);
    const label = volume.label || volume.mount || volume.filesystem || `Volume ${index + 1}`;
    const subtitle = [volume.mount, volume.filesystem].filter(Boolean).join(' · ');
    return `
      <div class="capacity-row">
        <div class="capacity-label"><strong>${pEscape(label)}</strong><span>${pEscape(subtitle || 'Sistema de arquivos')}</span></div>
        <div class="capacity-track"><i class="${usedPercent >= 85 ? 'warn' : ''}" style="width:${pClamp(usedPercent)}%"></i></div>
        <div class="capacity-values"><strong>${pNumber(usedPercent,1)}%</strong><span>${pEscape(volume.used?.formatted || '--')} / ${pEscape(volume.total?.formatted || '--')}</span></div>
      </div>`;
  }).join('');
}

function premiumDrawHttpRate() {
  const samples = pVisibleSamples();
  premiumDrawLineChart('httpRateChart', [
    { key: 'requestRate', label: 'Requests/s', colorVar: '--premium-accent', tooltip: value => `${pNumber(value,2)} req/s` }
  ], {
    samples,
    formatter: value => pNumber(value,1)
  });
  const current = samples.at(-1)?.requestRate || 0;
  pSetText('httpRateLabel', `${pNumber(current,2)} req/s`);
  const last = samples.at(-1) || {};
  pSetText('premiumHttp2xx', pInteger(last.responses2xx));
  pSetText('premiumHttp4xx', pInteger(last.responses4xx));
  pSetText('premiumHttp5xx', pInteger(last.responses5xx));
}

function premiumDrawProcessScatter(data) {
  const canvas = p$('processScatterChart');
  const prepared = premiumPrepareCanvas(canvas);
  if (!prepared) return;
  const { context: ctx, width, height } = prepared;
  const items = (data?.processes?.items || []).slice(0, 30);
  pSetText('processScatterCount', `${items.length} processo(s)`);

  const left = 39;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const graphWidth = Math.max(1,width-left-right);
  const graphHeight = Math.max(1,height-top-bottom);
  const maxMemory = Math.max(1,...items.map(item => Number(item.memory?.bytes || 0)));
  const maxCpu = Math.max(10,...items.map(item => Number(item.cpuPercent || 0)));

  premiumDrawGrid(ctx,{left,top,width:graphWidth,height:graphHeight},premiumNiceMax(maxCpu),value=>`${pNumber(value,0)}%`);
  ctx.fillStyle = pCss('--muted') || '#94a3b8';
  ctx.font = '8px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('0 B',left,height-7);
  ctx.textAlign = 'right';
  ctx.fillText(pBytes(maxMemory),width-right,height-7);
  ctx.textAlign = 'left';

  const color = pCss('--premium-accent') || '#78a9ff';
  const points = items.map(item => {
    const memory = Number(item.memory?.bytes || 0);
    const cpu = Number(item.cpuPercent || 0);
    const x = left + (memory / maxMemory) * graphWidth;
    const y = top + graphHeight - (cpu / premiumNiceMax(maxCpu)) * graphHeight;
    const radius = 3.5 + Math.min(5,Math.sqrt(Math.max(0,Number(item.memoryPercent || 0))));
    ctx.beginPath();
    ctx.fillStyle = `${color}cc`;
    ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fill();
    return { x,y,item };
  });

  if (!items.length) {
    ctx.fillStyle = pCss('--muted') || '#94a3b8';
    ctx.fillText('Lista de processos indisponível.',left,top+18);
  }

  canvas._premiumMeta = { type:'scatter', points };
  premiumEnableCanvasTooltip(canvas);
}

/* =============================================================================
   BROWSER PERFORMANCE
   ============================================================================= */

async function premiumCollectBrowserMetrics() {
  const navigation = performance.getEntriesByType?.('navigation')?.[0] || null;
  const paints = performance.getEntriesByType?.('paint') || [];
  const paintMap = Object.fromEntries(paints.map(entry => [entry.name,entry.startTime]));
  const metrics = [];

  if (navigation) {
    metrics.push(
      { name:'DNS', value: Math.max(0,navigation.domainLookupEnd-navigation.domainLookupStart), target:50 },
      { name:'Conexão TCP', value: Math.max(0,navigation.connectEnd-navigation.connectStart), target:100 },
      { name:'TTFB', value: Math.max(0,navigation.responseStart-navigation.requestStart), target:200 },
      { name:'Download HTML', value: Math.max(0,navigation.responseEnd-navigation.responseStart), target:300 },
      { name:'DOM interativo', value: Math.max(0,navigation.domInteractive-navigation.startTime), target:1000 },
      { name:'DOMContentLoaded', value: Math.max(0,navigation.domContentLoadedEventEnd-navigation.startTime), target:1500 },
      { name:'Load completo', value: Math.max(0,navigation.loadEventEnd-navigation.startTime), target:2500 }
    );
  }
  if (paintMap['first-paint'] != null) metrics.push({ name:'First Paint', value:paintMap['first-paint'], target:1000 });
  if (paintMap['first-contentful-paint'] != null) metrics.push({ name:'FCP', value:paintMap['first-contentful-paint'], target:1800 });

  premiumState.browserMetrics = metrics;

  if (navigator.storage?.estimate) {
    try {
      premiumState.storageEstimate = await navigator.storage.estimate();
    } catch {
      premiumState.storageEstimate = null;
    }
  }
  premiumRenderBrowserPerformance();
}

function premiumRenderBrowserPerformance() {
  const container = p$('browserPerformanceBars');
  if (!container) return;
  const metrics = premiumState.browserMetrics || [];
  if (!metrics.length) {
    container.innerHTML = '<div class="empty-state">Navigation Timing não está disponível neste navegador.</div>';
    pSetText('browserPerfScore','N/D');
    return;
  }

  const scores = metrics.map(metric => pClamp(100 - Math.max(0,(metric.value-metric.target)/Math.max(1,metric.target))*60,0,100));
  const overall = Math.round(pMean(scores));
  pSetText('browserPerfScore',`${overall}/100`);

  container.innerHTML = metrics.slice(0,9).map(metric => {
    const ratio = pClamp((metric.value / Math.max(metric.target * 2,1))*100);
    return `
      <div class="browser-perf-row">
        <div class="browser-perf-head"><span>${pEscape(metric.name)}</span><strong>${pNumber(metric.value,1)} ms</strong></div>
        <div class="browser-perf-track"><i class="${metric.value > metric.target ? 'warn' : ''}" style="width:${ratio}%"></i></div>
      </div>`;
  }).join('');
}

/* =============================================================================
   DIAGNOSTIC UI
   ============================================================================= */

function premiumHostingLabel(hosting = {}) {
  if (hosting.render) return 'Render';
  if (hosting.vercel) return 'Vercel';
  if (hosting.railway) return 'Railway';
  if (hosting.heroku) return 'Heroku';
  if (hosting.githubActions) return 'GitHub Actions';
  if (hosting.containerHint) return 'Container';
  return 'Host local / genérico';
}

function premiumSetScoreCard(id, score, label) {
  const strong = p$(id);
  if (!strong) return;
  strong.textContent = `${Math.round(pClamp(score))}`;
  const card = strong.closest('.diagnostic-score-card');
  card?.classList.remove('good','warn','danger');
  card?.classList.add(score >= 80 ? 'good' : score >= 55 ? 'warn' : 'danger');
  const textId = id.replace('Score','Text');
  pSetText(textId,label || (score >= 80 ? 'Muito bom' : score >= 55 ? 'Atenção' : 'Crítico'));
}

function premiumDiagnosticScores(data) {
  const samples = pVisibleSamples();
  const cpuStd = pStdDev(samples.map(sample=>sample.cpu));
  const ramStd = pStdDev(samples.map(sample=>sample.memory));
  const eventP95 = Number(data?.runtime?.eventLoop?.p95Ms || 0);
  const eventP99 = Number(data?.runtime?.eventLoop?.p99Ms || 0);
  const nodeCpu = Number(data?.runtime?.cpu?.totalPercent || 0);
  const disk = data?.storage?.root?.available ? Number(data.storage.root.usedPercent || 0) : 50;
  const ram = Number(data?.memory?.usedPercent || 0);
  const cpu = Number(data?.cpu?.usagePercent || 0);
  const network = premiumNetworkTotals(data);

  const stability = pClamp(100 - cpuStd*2.2 - ramStd*1.4 - Math.max(0,eventP99-20)*.35);
  const capacity = pClamp(100 - Math.max(0,cpu-70)*.9 - Math.max(0,ram-75)*1.2 - Math.max(0,disk-80)*1.5);
  const runtime = pClamp(100 - Math.max(0,eventP95-10)*.8 - Math.max(0,nodeCpu-65)*.5);
  const networkScore = pClamp(100 - Math.min(50,network.errors*2) - Math.min(35,network.dropped));
  const overall = pMean([stability,capacity,runtime,networkScore]);

  return { stability,capacity,runtime,network:networkScore,overall };
}

function premiumRecommendations(data, diagnostics) {
  const recommendations = [];
  const t = premiumState.settings.thresholds;
  const cpu = Number(data?.cpu?.usagePercent || 0);
  const ram = Number(data?.memory?.usedPercent || 0);
  const disk = data?.storage?.root?.available ? Number(data.storage.root.usedPercent || 0) : null;
  const eventP95 = Number(data?.runtime?.eventLoop?.p95Ms || 0);
  const nodeCpu = Number(data?.runtime?.cpu?.totalPercent || 0);
  const heapUsed = Number(data?.runtime?.memory?.heapUsed?.bytes || 0);
  const heapTotal = Number(data?.runtime?.memory?.heapTotal?.bytes || 0);
  const network = premiumNetworkTotals(data);
  const processItems = data?.processes?.items || [];
  const topProcess = processItems[0];

  if (cpu >= t.cpuCritical) {
    recommendations.push({ severity:'danger', icon:'!', title:'CPU em faixa crítica', text:`A CPU está em ${pNumber(cpu,1)}%. Verifique os processos no topo da lista e compare com o heatmap por núcleo.` });
  } else if (cpu >= t.cpuWarn) {
    recommendations.push({ severity:'warn', icon:'↑', title:'CPU elevada', text:`Uso em ${pNumber(cpu,1)}%. Se persistir, observe a estabilidade por alguns minutos antes de concluir que existe gargalo.` });
  }

  if (ram >= t.ramCritical) {
    recommendations.push({ severity:'danger', icon:'!', title:'Pressão de memória', text:`RAM em ${pNumber(ram,1)}%. Em sistemas com swap, esse nível pode aumentar latência e I/O.` });
  } else if (ram >= t.ramWarn) {
    recommendations.push({ severity:'warn', icon:'◇', title:'Memória acima do limite', text:`RAM em ${pNumber(ram,1)}%. Confira cache, swap e os processos com maior consumo.` });
  }

  if (disk != null && disk >= t.diskWarn) {
    recommendations.push({ severity:disk >= 95 ? 'danger':'warn', icon:'▤', title:'Pouco espaço no volume principal', text:`Ocupação em ${pNumber(disk,1)}%. Manter margem livre ajuda atualizações, caches e arquivos temporários.` });
  }

  if (eventP95 >= t.eventWarn) {
    recommendations.push({ severity:eventP95 >= t.eventWarn*2.5 ? 'danger':'warn', icon:'⌘', title:'Event loop com latência', text:`P95 em ${pNumber(eventP95,1)} ms. Código síncrono pesado ou operações bloqueantes podem afetar respostas HTTP.` });
  }

  if (nodeCpu >= 70) {
    recommendations.push({ severity:'warn', icon:'N', title:'Processo Node usando muita CPU', text:`O próprio processo Node está em ${pNumber(nodeCpu,1)}% de CPU na coleta atual.` });
  }

  if (heapTotal > 0 && heapUsed / heapTotal > .85) {
    recommendations.push({ severity:'warn', icon:'V8', title:'Heap do Node muito ocupado', text:`O heap está em ${pNumber((heapUsed/heapTotal)*100,1)}% do tamanho atualmente alocado.` });
  }

  if (network.errors > 0 || network.dropped > 0) {
    recommendations.push({ severity:'warn', icon:'⌁', title:'Erros ou descartes de rede', text:`Contadores atuais: ${pInteger(network.errors)} erro(s) e ${pInteger(network.dropped)} descarte(s).` });
  }

  if (topProcess && Number(topProcess.cpuPercent || 0) >= 50) {
    recommendations.push({ severity:'info', icon:'≋', title:'Processo dominante', text:`${topProcess.name || 'Processo'} está no topo com ${pNumber(topProcess.cpuPercent,1)}% de CPU.` });
  }

  const psi = diagnostics?.linux?.pressure;
  const memoryPsi = Number(psi?.memory?.some?.avg10 || 0);
  const ioPsi = Number(psi?.io?.some?.avg10 || 0);
  if (memoryPsi >= 5) {
    recommendations.push({ severity:'warn', icon:'PSI', title:'Linux PSI indica pressão de memória', text:`memory some avg10 em ${pNumber(memoryPsi,2)}%. Isso indica tarefas aguardando recursos de memória.` });
  }
  if (ioPsi >= 8) {
    recommendations.push({ severity:'warn', icon:'I/O', title:'Linux PSI indica pressão de I/O', text:`io some avg10 em ${pNumber(ioPsi,2)}%. Operações de armazenamento podem estar causando espera.` });
  }

  if (!recommendations.length) {
    recommendations.push({ severity:'success', icon:'✓', title:'Nenhum gargalo evidente', text:'As métricas principais estão dentro das faixas configuradas nesta amostra. Continue observando tendências e picos.' });
  }
  return recommendations;
}

function premiumUpdateDiagnosticsUi(diagnostics) {
  if (!diagnostics) return;
  const scheduler = diagnostics.scheduler || {};
  const load = scheduler.loadAverage || {};
  const linux = diagnostics.linux || {};
  const v8Data = diagnostics.v8 || {};
  const heap = v8Data.heap || {};
  const hosting = diagnostics.hosting || {};
  const capabilities = diagnostics.capabilities || {};

  pSetText('diagParallelism', `${scheduler.availableParallelism ?? '--'} de ${scheduler.logicalCpus ?? '--'} CPU(s)`);
  pSetText('diagLoad1', pNumber(load.oneMinute,3));
  pSetText('diagLoad5', pNumber(load.fiveMinutes,3));
  pSetText('diagLoad15', pNumber(load.fifteenMinutes,3));
  pSetText('diagLoadNormalized', `${pNumber(load.normalizedOneMinutePercent,1)}%`);
  const linuxLoad = linux.load;
  pSetText('diagLinuxTasks', linuxLoad?.totalTasks ? `${linuxLoad.runnableTasks || 0} executando / ${linuxLoad.totalTasks} total` : 'N/D');

  pSetText('diagDnsServers', diagnostics.dns?.servers?.join(', ') || 'N/D');
  pSetText('diagDnsOrder', diagnostics.dns?.defaultResultOrder || 'N/D');
  pSetText('diagInterfaceCount', premiumState.lastSystemData?.network?.interfaces?.length ?? '--');
  pSetText('diagTrafficInterfaces', premiumState.lastSystemData?.network?.traffic?.length ?? '--');

  pSetText('diagV8HeapUsed', heap.usedHeapSize?.formatted || '--');
  pSetText('diagV8HeapTotal', heap.totalHeapSize?.formatted || '--');
  pSetText('diagV8HeapLimit', heap.heapSizeLimit?.formatted || '--');
  pSetText('diagV8Available', heap.totalAvailableSize?.formatted || '--');
  pSetText('diagV8Malloc', heap.mallocedMemory?.formatted || '--');
  pSetText('diagV8Contexts', pInteger(heap.nativeContexts));

  pSetText('diagHosting', premiumHostingLabel(hosting));
  pSetText('diagContainer', hosting.containerHint ? 'Sim' : 'Não detectado');
  pSetText('diagNodeEnv', hosting.nodeEnv || '--');
  pSetText('diagCi', hosting.genericCi ? 'Sim' : 'Não');

  premiumRenderV8Spaces(v8Data.spaces || []);
  premiumRenderCapabilities(capabilities);
  premiumRenderPsi(linux.pressure || null);

  if (premiumState.lastSystemData) premiumRefreshDiagnosticAssessment(premiumState.lastSystemData);
}

function premiumRenderV8Spaces(spaces) {
  const tbody = p$('v8SpacesTable');
  pSetText('v8SpaceCount', `${spaces.length} espaço(s)`);
  if (!tbody) return;
  if (!spaces.length) {
    tbody.innerHTML = '<tr><td colspan="6">Dados do V8 indisponíveis.</td></tr>';
    return;
  }
  tbody.innerHTML = spaces.map(space => `
    <tr>
      <td>${pEscape(space.name)}</td>
      <td>${pEscape(space.size?.formatted || '--')}</td>
      <td>${pEscape(space.used?.formatted || '--')}</td>
      <td>${pEscape(space.available?.formatted || '--')}</td>
      <td>${pEscape(space.physical?.formatted || '--')}</td>
      <td>${pNumber(space.usedPercent,1)}%</td>
    </tr>`).join('');
}

function premiumRenderCapabilities(capabilities) {
  const container = p$('capabilityGrid');
  if (!container) return;
  const items = Object.entries(capabilities || {});
  const enabled = items.filter(([,value])=>Boolean(value)).length;
  pSetText('capabilityScore', `${enabled}/${items.length}`);
  container.innerHTML = items.map(([name,value]) => `
    <div class="capability-item ${value ? 'ok':''}"><i></i><span>${pEscape(name)}</span></div>`).join('');
}

function premiumPsiValue(pressure, kind = 'some') {
  return Number(pressure?.[kind]?.avg10 || 0);
}

function premiumRenderPsi(pressure) {
  const available = Boolean(pressure?.cpu || pressure?.memory || pressure?.io);
  pSetText('psiAvailability', available ? 'Disponível' : 'N/D');
  const cpu = premiumPsiValue(pressure?.cpu,'some');
  const memory = premiumPsiValue(pressure?.memory,'some');
  const io = premiumPsiValue(pressure?.io,'some');
  const ioFull = premiumPsiValue(pressure?.io,'full');
  pSetText('psiCpuSome', available ? `${pNumber(cpu,2)}%` : 'N/D');
  pSetText('psiMemorySome', available ? `${pNumber(memory,2)}%` : 'N/D');
  pSetText('psiIoSome', available ? `${pNumber(io,2)}%` : 'N/D');
  pSetText('psiIoFull', available ? `${pNumber(ioFull,2)}%` : 'N/D');
  pSetWidth('psiCpuMeter',cpu*5);
  pSetWidth('psiMemoryMeter',memory*5);
  pSetWidth('psiIoMeter',io*5);
  pSetWidth('psiIoFullMeter',ioFull*5);
}

function premiumRefreshDiagnosticAssessment(data) {
  const scores = premiumDiagnosticScores(data);
  premiumSetScoreCard('diagStabilityScore',scores.stability);
  premiumSetScoreCard('diagCapacityScore',scores.capacity);
  premiumSetScoreCard('diagRuntimeScore',scores.runtime);
  premiumSetScoreCard('diagNetworkScore',scores.network);
  premiumSetScoreCard('diagOverallScore',scores.overall,scores.overall>=85?'Excelente':scores.overall>=70?'Saudável':scores.overall>=50?'Atenção':'Crítico');

  const recommendations = premiumRecommendations(data,premiumState.diagnostics);
  pSetText('recommendationCount',String(recommendations.length));
  const container = p$('recommendationList');
  if (container) {
    container.innerHTML = recommendations.map(item => `
      <div class="recommendation-card ${pEscape(item.severity)}">
        <span class="recommendation-icon">${pEscape(item.icon)}</span>
        <div><strong>${pEscape(item.title)}</strong><p>${pEscape(item.text)}</p></div>
      </div>`).join('');
  }
}

/* =============================================================================
   DATA EXPLORER
   ============================================================================= */

function premiumExplorerSource() {
  if (premiumState.explorerDataset === 'diagnostics') return premiumState.diagnostics || {};
  if (premiumState.explorerDataset === 'combined') {
    return {
      system: premiumState.lastSystemData || {},
      diagnostics: premiumState.diagnostics || {}
    };
  }
  return premiumState.lastSystemData || {};
}

function premiumGetByPath(object, path) {
  if (!path) return object;
  return String(path).split('.').reduce((current,key)=>current?.[key],object);
}

function premiumSyntaxHighlight(value) {
  const json = pEscape(JSON.stringify(value,null,2) ?? 'null');
  return json.replace(/(&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\&])*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g, match => {
    if (/^&quot;/.test(match)) {
      if (/\s*:$/.test(match)) return `<span class="json-key">${match}</span>`;
      return `<span class="json-string">${match}</span>`;
    }
    if (match === 'true' || match === 'false') return `<span class="json-boolean">${match}</span>`;
    if (match === 'null') return `<span class="json-null">${match}</span>`;
    return `<span class="json-number">${match}</span>`;
  });
}

function premiumRenderExplorerNav(source) {
  const nav = p$('jsonTreeNav');
  if (!nav) return;
  const entries = source && typeof source === 'object' ? Object.keys(source) : [];
  const buttons = [
    `<button type="button" data-json-path="" class="${premiumState.explorerPath ? '' : 'active'}"><span>◇</span><span>Raiz</span></button>`,
    ...entries.map(key => `<button type="button" data-json-path="${pEscape(key)}" class="${premiumState.explorerPath===key?'active':''}"><span>›</span><span>${pEscape(key)}</span></button>`)
  ];
  nav.innerHTML = buttons.join('');
  nav.querySelectorAll('[data-json-path]').forEach(button => {
    button.addEventListener('click',()=>{
      premiumState.explorerPath = button.dataset.jsonPath || null;
      premiumRenderExplorer();
    });
  });
}

function premiumRenderExplorer() {
  const viewer = p$('jsonViewer');
  if (!viewer) return;
  const source = premiumExplorerSource();
  const selected = premiumGetByPath(source,premiumState.explorerPath);
  const query = String(p$('jsonSearchInput')?.value || '').trim().toLowerCase();
  premiumRenderExplorerNav(source);

  if (!query) {
    viewer.innerHTML = premiumSyntaxHighlight(selected);
    pSetText('explorerMatchCount',premiumState.explorerPath ? `/${premiumState.explorerPath}` : 'Raiz');
    return;
  }

  const raw = JSON.stringify(selected,null,2) ?? 'null';
  const lines = raw.split('\n');
  const matches = lines.filter(line=>line.toLowerCase().includes(query));
  pSetText('explorerMatchCount',`${matches.length} linha(s)`);
  if (!matches.length) {
    viewer.textContent = 'Nenhuma correspondência nesta seleção.';
    return;
  }
  viewer.textContent = matches.join('\n');
}

/* =============================================================================
   EXPORTS
   ============================================================================= */

function premiumSummaryText() {
  const data = premiumState.lastSystemData;
  if (!data) return 'Cloud SO App — ainda sem dados coletados.';
  const network = premiumNetworkTotals(data);
  const diagnostics = premiumState.diagnostics;
  const load = diagnostics?.scheduler?.loadAverage?.normalizedOneMinutePercent;
  const topProcess = data.processes?.items?.[0];
  return [
    'Cloud SO App — Resumo do Sistema',
    `Gerado em: ${pDateTime()}`,
    '',
    `Host: ${data.system?.hostname || '--'}`,
    `Sistema: ${data.system?.type || '--'} ${data.system?.release || ''}`.trim(),
    `Arquitetura: ${data.system?.architecture || '--'}`,
    `Uptime: ${data.system?.uptime?.formatted || '--'}`,
    '',
    `CPU: ${pNumber(data.cpu?.usagePercent,1)}% · ${data.cpu?.logicalCores ?? '--'} threads · ${data.cpu?.model || '--'}`,
    `RAM: ${pNumber(data.memory?.usedPercent,1)}% · ${data.memory?.used?.formatted || '--'} / ${data.memory?.total?.formatted || '--'}`,
    `Disco principal: ${data.storage?.root?.available ? `${pNumber(data.storage.root.usedPercent,1)}% · livre ${data.storage.root.free?.formatted || '--'}` : 'N/D'}`,
    `Rede: ↓ ${pRate(network.download)} · ↑ ${pRate(network.upload)}`,
    `Load normalizado: ${load == null ? 'N/D' : `${pNumber(load,1)}%`}`,
    `Event loop P95: ${pNumber(data.runtime?.eventLoop?.p95Ms,2)} ms`,
    `Processos: ${data.processes?.totalCount ?? '--'}`,
    topProcess ? `Top processo: ${topProcess.name} · ${pNumber(topProcess.cpuPercent,1)}% CPU · ${topProcess.memory?.formatted || '--'}` : '',
    '',
    `Node.js: ${data.runtime?.nodeVersion || '--'} · Express ${data.runtime?.expressVersion || '--'}`,
    `Aplicação: ${data.runtime?.appUptime?.formatted || '--'} de uptime`,
    `Modo de conexão: ${premiumState.connectionMode === 'sse' ? 'SSE live stream' : 'polling'}`
  ].filter(Boolean).join('\n');
}

async function premiumCopySummary() {
  const ok = await pCopy(premiumSummaryText());
  pToast(ok ? 'Resumo copiado.' : 'Não foi possível copiar o resumo.');
}

async function premiumExportJson() {
  let payload;
  try {
    const response = await fetch('/api/export',{cache:'no-store'});
    if (response.ok) payload = await response.json();
  } catch {
    // Fall back to the client-side snapshot below.
  }
  if (!payload) {
    payload = {
      application:{name:'cloud-so-app',version:'5.0.0',exportedAt:new Date().toISOString()},
      system:premiumState.lastSystemData,
      diagnostics:premiumState.diagnostics
    };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  pDownload(`cloud-so-snapshot-${stamp}.json`,JSON.stringify(payload,null,2),'application/json');
  pToast('Snapshot JSON exportado.');
}

function premiumCsvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
}

function premiumExportCsv() {
  const rows = [
    ['timestamp','cpu_percent','memory_percent','disk_percent','download_Bps','upload_Bps','event_p95_ms','event_p99_ms','node_cpu_percent','load_percent','requests_per_second','process_count'],
    ...premiumState.samples.map(sample=>[
      new Date(sample.time).toISOString(),
      sample.cpu,
      sample.memory,
      sample.disk ?? '',
      sample.download,
      sample.upload,
      sample.eventP95,
      sample.eventP99,
      sample.nodeCpu,
      sample.load,
      sample.requestRate,
      sample.processCount
    ])
  ];
  const csv = rows.map(row=>row.map(premiumCsvEscape).join(',')).join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  pDownload(`cloud-so-history-${stamp}.csv`,csv,'text/csv;charset=utf-8');
  pToast('Histórico CSV exportado.');
}

/* =============================================================================
   PANEL ENHANCEMENTS
   ============================================================================= */

function premiumPanelState() {
  return pSafeJsonParse(localStorage.getItem(PREMIUM_PANEL_STATE_KEY),{}) || {};
}

function premiumSavePanelState(state) {
  localStorage.setItem(PREMIUM_PANEL_STATE_KEY,JSON.stringify(state));
}

function premiumApplyPanelState() {
  const state = premiumPanelState();
  document.querySelectorAll('.panel[data-panel-id]').forEach(panel=>{
    const id = panel.dataset.panelId;
    panel.classList.toggle('premium-pinned',Boolean(state[id]?.pinned));
    panel.classList.toggle('premium-collapsed',Boolean(state[id]?.collapsed));
  });
}

function premiumTogglePanel(panel,key) {
  if (!panel?.dataset.panelId) return;
  const state = premiumPanelState();
  const id = panel.dataset.panelId;
  state[id] = state[id] || {};
  state[id][key] = !state[id][key];
  premiumSavePanelState(state);
  premiumApplyPanelState();
  if (key === 'collapsed') setTimeout(premiumDrawAll,50);
}

function premiumEnhancePanels() {
  document.querySelectorAll('.panel[data-panel-id]').forEach(panel=>{
    const header = panel.querySelector(':scope > .panel-header');
    if (!header) return;

    if (!header.querySelector('.panel-pin-button')) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'panel-pin-button';
      pin.title = 'Fixar destaque do painel';
      pin.textContent = '◇';
      pin.addEventListener('click',event=>{
        event.stopPropagation();
        premiumTogglePanel(panel,'pinned');
      });
      header.appendChild(pin);
    }

    if (!header.querySelector('.panel-collapse-button')) {
      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'panel-collapse-button';
      collapse.title = 'Recolher / expandir painel';
      collapse.textContent = '—';
      collapse.addEventListener('click',event=>{
        event.stopPropagation();
        premiumTogglePanel(panel,'collapsed');
      });
      header.appendChild(collapse);
    }
  });
  premiumApplyPanelState();
}

function premiumResetPanelState() {
  localStorage.removeItem(PREMIUM_PANEL_STATE_KEY);
  premiumApplyPanelState();
  pToast('Estado dos painéis restaurado.');
}

/* =============================================================================
   DRAW ALL / RESIZE
   ============================================================================= */

function premiumDrawAll() {
  if (!premiumState.lastSystemData) return;
  premiumDrawLoadChart();
  premiumDrawMemoryDonut(premiumState.lastSystemData);
  premiumDrawCpuHeatmap();
  premiumRenderStorageBars(premiumState.lastSystemData);
  premiumDrawHttpRate();
  premiumDrawProcessScatter(premiumState.lastSystemData);
}

let premiumResizeTimer = null;
function premiumScheduleRedraw() {
  clearTimeout(premiumResizeTimer);
  premiumResizeTimer = setTimeout(premiumDrawAll,90);
}

/* =============================================================================
   SYSTEM UPDATE HOOK
   ============================================================================= */

function premiumUpdateSystem(data) {
  premiumState.lastSystemData = data;
  premiumPushSample(data);
  premiumUpdateCockpit(data);
  premiumRefreshDiagnosticAssessment(data);
  premiumDrawAll();
  premiumRenderExplorer();
  premiumUpdateDiagnosticsUi(premiumState.diagnostics);

  if (Date.now() - premiumState.diagnosticsFetchedAt > 12000) {
    premiumFetchDiagnostics(false);
  }
}

/* =============================================================================
   QUICK ACTIONS
   ============================================================================= */

function premiumRunQuickCommand(command) {
  if (command === 'refresh') return loadSystemData(true);
  if (command === 'copy-summary') return premiumCopySummary();
  if (command === 'export-json') return premiumExportJson();
  if (command === 'export-csv') return premiumExportCsv();
  if (command === 'print') return window.print();
  if (command === 'fullscreen') return toggleFullscreen();
}

/* =============================================================================
   DOM EVENTS
   ============================================================================= */

function premiumBindSettingsEvents() {
  p$('settingsButton')?.addEventListener('click',premiumOpenSettings);
  p$('closeSettingsButton')?.addEventListener('click',premiumCloseSettings);
  p$('settingsOverlay')?.addEventListener('click',premiumCloseSettings);

  const settingsIds = [
    'accentColorInput','densitySelect','radiusRange','glassToggle','animationToggle','gridToggle',
    'connectionModeSelect','retentionSelect','sessionAlertsToggle','cpuWarnThreshold','cpuCriticalThreshold',
    'ramWarnThreshold','ramCriticalThreshold','diskWarnThreshold','eventWarnThreshold'
  ];
  settingsIds.forEach(id=>{
    const element = p$(id);
    if (!element) return;
    const eventName = element.type === 'range' || element.type === 'color' ? 'input' : 'change';
    element.addEventListener(eventName,premiumReadSettingsForm);
  });

  p$('resetPremiumSettingsButton')?.addEventListener('click',premiumResetSettings);
  p$('resetPanelOrderButton')?.addEventListener('click',premiumResetPanelState);
}

function premiumBindNotificationEvents() {
  p$('notificationsButton')?.addEventListener('click',premiumOpenNotifications);
  p$('closeNotificationsButton')?.addEventListener('click',premiumCloseNotifications);
  p$('notificationsOverlay')?.addEventListener('click',premiumCloseNotifications);
  p$('clearNotificationsButton')?.addEventListener('click',()=>{
    premiumState.events=[];
    premiumState.unreadEvents=0;
    premiumUpdateNotificationBadge();
    premiumRenderTimeline();
    premiumRenderNotifications();
  });
  p$('clearTimelineButton')?.addEventListener('click',()=>{
    premiumState.events=[];
    premiumState.unreadEvents=0;
    premiumUpdateNotificationBadge();
    premiumRenderTimeline();
    premiumRenderNotifications();
  });
}

function premiumBindCommandEvents() {
  p$('commandButton')?.addEventListener('click',()=>premiumOpenCommand());
  document.querySelector('[data-close-command]')?.addEventListener('click',premiumCloseCommand);
  p$('commandSearchInput')?.addEventListener('input',event=>{
    premiumState.commandSelection=0;
    premiumRenderCommands(event.target.value);
  });
  p$('commandSearchInput')?.addEventListener('keydown',event=>{
    if (event.key==='ArrowDown') {
      event.preventDefault();
      premiumState.commandSelection=Math.min(premiumState.commandSelection+1,premiumState.commandMatches.length-1);
      premiumRenderCommands(event.currentTarget.value);
    }
    if (event.key==='ArrowUp') {
      event.preventDefault();
      premiumState.commandSelection=Math.max(0,premiumState.commandSelection-1);
      premiumRenderCommands(event.currentTarget.value);
    }
    if (event.key==='Enter') {
      event.preventDefault();
      premiumExecuteCommand();
    }
    if (event.key==='Escape') premiumCloseCommand();
  });

  document.addEventListener('keydown',event=>{
    const isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') {
      event.preventDefault();
      premiumOpenCommand();
      return;
    }
    if (event.key==='Escape') {
      premiumCloseCommand();
      premiumCloseSettings();
      premiumCloseNotifications();
    }
    if (!isTyping && event.key==='/') {
      event.preventDefault();
      premiumOpenCommand();
    }
  });
}

function premiumBindQuickActions() {
  document.querySelectorAll('[data-premium-command]').forEach(button=>{
    button.addEventListener('click',()=>premiumRunQuickCommand(button.dataset.premiumCommand));
  });
  p$('exportButton')?.addEventListener('click',premiumExportJson);
  p$('rerunDiagnosticsButton')?.addEventListener('click',async()=>{
    p$('rerunDiagnosticsButton').disabled=true;
    await premiumFetchDiagnostics(true);
    p$('rerunDiagnosticsButton').disabled=false;
    pToast('Diagnóstico atualizado.');
  });
}

function premiumBindAnalyticsControls() {
  p$('premiumChartRange')?.querySelectorAll('[data-range]').forEach(button=>{
    button.addEventListener('click',()=>{
      p$('premiumChartRange').querySelectorAll('[data-range]').forEach(item=>item.classList.remove('active'));
      button.classList.add('active');
      premiumState.chartRangeSeconds=Number(button.dataset.range || 0);
      premiumDrawAll();
      premiumUpdateCockpit(premiumState.lastSystemData || {});
    });
  });
}

function premiumBindExplorerEvents() {
  p$('explorerDataset')?.addEventListener('change',event=>{
    premiumState.explorerDataset=event.target.value;
    premiumState.explorerPath=null;
    premiumRenderExplorer();
  });
  p$('jsonSearchInput')?.addEventListener('input',premiumRenderExplorer);
  p$('copyJsonButton')?.addEventListener('click',async()=>{
    const source=premiumGetByPath(premiumExplorerSource(),premiumState.explorerPath);
    const ok=await pCopy(JSON.stringify(source,null,2));
    pToast(ok?'JSON copiado.':'Não foi possível copiar.');
  });
  p$('downloadJsonButton')?.addEventListener('click',()=>{
    const source=premiumGetByPath(premiumExplorerSource(),premiumState.explorerPath);
    pDownload('cloud-so-explorer.json',JSON.stringify(source,null,2),'application/json');
  });
}

function premiumBindBaseControlCompatibility() {
  p$('refreshRate')?.addEventListener('change',()=>{
    if (premiumState.connectionMode==='sse') {
      try { clearInterval(refreshTimer); } catch { /* optional */ }
    }
  });
  p$('pauseButton')?.addEventListener('click',()=>{
    if (premiumState.connectionMode==='sse') {
      try { clearInterval(refreshTimer); } catch { /* optional */ }
      if (!isPaused && !premiumState.eventSource) premiumStartSse();
    }
  });
  p$('themeSelect')?.addEventListener('change',premiumScheduleRedraw);
  p$('viewMode')?.addEventListener('change',premiumScheduleRedraw);
  p$('sidebarButton')?.addEventListener('click',premiumScheduleRedraw);
  p$('fullscreenButton')?.addEventListener('click',premiumScheduleRedraw);
}

/* =============================================================================
   INITIALIZATION
   ============================================================================= */

function premiumWrapBaseUpdate() {
  if (typeof updateDashboard !== 'function') return;
  const baseUpdate = updateDashboard;
  updateDashboard = function premiumWrappedUpdateDashboard(data) {
    baseUpdate(data);
    premiumUpdateSystem(data);
  };
}

function premiumRestoreExistingSnapshot() {
  try {
    if (typeof latestData !== 'undefined' && latestData) premiumUpdateSystem(latestData);
  } catch {
    // No base snapshot yet. The next fetch will call the wrapper.
  }
}

function premiumInit() {
  premiumLoadSettings();
  premiumApplySettings();
  premiumWrapBaseUpdate();
  premiumEnhancePanels();
  premiumBindSettingsEvents();
  premiumBindNotificationEvents();
  premiumBindCommandEvents();
  premiumBindQuickActions();
  premiumBindAnalyticsControls();
  premiumBindExplorerEvents();
  premiumBindBaseControlCompatibility();

  premiumCollectBrowserMetrics();
  premiumFetchDiagnostics(true);
  premiumScheduleDiagnostics();
  premiumRestoreExistingSnapshot();
  premiumSetConnectionMode(premiumState.settings.connectionMode,false);

  premiumAddEvent('success','Interface premium carregada','Cockpit, analytics, diagnóstico e Data Explorer estão ativos.',false);

  window.addEventListener('resize',premiumScheduleRedraw);
  document.addEventListener('fullscreenchange',premiumScheduleRedraw);
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState==='visible') {
      premiumScheduleRedraw();
      premiumFetchDiagnostics(false);
    }
  });

  setInterval(()=>{
    pSetText('premiumSessionDuration',pDuration(Date.now()-premiumState.startedAt));
  },1000);
}

premiumInit();
