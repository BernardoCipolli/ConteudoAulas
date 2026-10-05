const $ = id => document.getElementById(id);
const history = {
  samples: [],
  maxPoints: 1000
};
const sessionPeaks = {
  cpu: 0,
  memory: 0,
  download: 0,
  upload: 0,
  eventLoop: 0,
  gpuTemp: null
};
let refreshTimer = null;
let isFetching = false;
let batteryManager = null;
let isPaused = false;
let latestData = null;
let focusedPanel = null;
let chartWindowSeconds = 300;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function setText(id, value, fallback = '--') {
  const element = $(id);
  if (element) element.textContent = value ?? fallback;
}

function setBar(id, value) {
  const element = $(id);
  if (element) element.style.width = `${clamp(value)}%`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function formatPlatform(value) {
  const map = { win32: 'Windows', linux: 'Linux', darwin: 'macOS', freebsd: 'FreeBSD', aix: 'AIX' };
  return map[value] || value || '--';
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR');
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return Number(value).toLocaleString('pt-BR');
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '--';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index >= 3 ? 2 : 1)} ${units[index]}`;
}

function valueOrDash(value, suffix = '') {
  return value == null || value === '' ? '--' : `${value}${suffix}`;
}

function updateCoreGrid(values = []) {
  const container = $('coreGrid');
  if (!container) return;
  if (!values.length) {
    container.innerHTML = '<div class="empty-state">Dados por núcleo indisponíveis.</div>';
    return;
  }
  container.innerHTML = values.map((item, index) => {
    const usage = typeof item === 'number' ? item : item.usagePercent;
    const speed = typeof item === 'object' && item.speedMHz ? `${item.speedMHz} MHz` : '';
    return `
      <div class="core-card">
        <div><span>CPU ${index + 1}${speed ? ` · ${escapeHtml(speed)}` : ''}</span><strong>${Number(usage || 0).toFixed(1)}%</strong></div>
        <div class="mini-bar"><i style="width:${clamp(usage)}%"></i></div>
      </div>`;
  }).join('');
}

function updateNetworkTable(items = []) {
  const tbody = $('networkTable');
  setText('networkCount', items.length);
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhuma interface externa encontrada.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(String(item.family))}</td>
      <td>${escapeHtml(item.address)}</td>
      <td>${escapeHtml(item.cidr || '--')}</td>
      <td>${escapeHtml(item.netmask)}</td>
      <td>${escapeHtml(item.mac)}</td>
    </tr>`).join('');
}

function updateNetworkTraffic(items = []) {
  const tbody = $('networkTrafficTable');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7">Contadores de tráfego não disponíveis neste sistema.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.received?.formatted || '--')}</td>
      <td>${escapeHtml(item.sent?.formatted || '--')}</td>
      <td>${escapeHtml(item.receiveRate?.formatted || '--')}/s</td>
      <td>${escapeHtml(item.sendRate?.formatted || '--')}/s</td>
      <td>${formatNumber(item.receivedPackets)} / ${formatNumber(item.sentPackets)}</td>
      <td>${formatNumber(item.errors)} / ${formatNumber(item.dropped)}</td>
    </tr>`).join('');
}

function updateGpuTable(items = []) {
  const tbody = $('gpuTable');
  setText('gpuCount', `${items.length} GPU(s)`);
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">GPU não detectada ou dados indisponíveis neste ambiente.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => {
    const memory = item.memoryTotal?.formatted || item.adapterMemory?.formatted || '--';
    const used = item.memoryUsed?.formatted ? `${item.memoryUsed.formatted} / ${memory}` : memory;
    const clock = item.graphicsClockMHz ? `${item.graphicsClockMHz} MHz` : '--';
    return `
      <tr>
        <td>${escapeHtml(item.name || 'GPU')}</td>
        <td>${item.usagePercent != null ? `${Number(item.usagePercent).toFixed(1)}%` : '--'}</td>
        <td>${item.temperatureC != null ? `${Number(item.temperatureC).toFixed(1)} °C` : '--'}</td>
        <td>${escapeHtml(used)}</td>
        <td>${escapeHtml(clock)}</td>
        <td>${escapeHtml(item.driverVersion || '--')}</td>
      </tr>`;
  }).join('');
}

function updateRamModules(items = []) {
  const tbody = $('ramModulesTable');
  setText('ramModuleCount', `${items.length} módulo(s)`);
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Detalhes dos módulos não disponíveis neste sistema/container.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.slot || '--')}</td>
      <td>${escapeHtml(item.manufacturer || '--')}</td>
      <td>${escapeHtml(item.capacity?.formatted || '--')}</td>
      <td>${valueOrDash(item.speedMHz, ' MHz')}</td>
      <td>${valueOrDash(item.configuredClockMHz, ' MHz')}</td>
      <td>${escapeHtml(item.partNumber || '--')}</td>
    </tr>`).join('');
}

function updateVolumes(items = []) {
  const tbody = $('volumesTable');
  setText('volumeCount', `${items.length} volume(s)`);
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhum volume adicional disponível.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.mount || '--')}</td>
      <td>${escapeHtml(item.label || item.filesystem || '--')}</td>
      <td>${escapeHtml(item.total?.formatted || '--')}</td>
      <td>${escapeHtml(item.used?.formatted || '--')}</td>
      <td>${escapeHtml(item.free?.formatted || '--')}</td>
      <td>${Number(item.usedPercent || 0).toFixed(1)}%</td>
    </tr>`).join('');
}

function updatePhysicalDisks(items = []) {
  const tbody = $('physicalDisksTable');
  setText('physicalDiskCount', `${items.length} disco(s)`);
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Informações do dispositivo físico não disponíveis neste ambiente.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.model || '--')}</td>
      <td>${escapeHtml(item.mediaType || '--')}</td>
      <td>${escapeHtml(item.interfaceType || '--')}</td>
      <td>${escapeHtml(item.size?.formatted || '--')}</td>
      <td>${formatNumber(item.partitions)}</td>
      <td>${escapeHtml(item.status || '--')}</td>
    </tr>`).join('');
}

function updateProcesses(data = {}) {
  const items = data.items || [];
  const tbody = $('processTable');
  setText('processCount', data.totalCount ?? '--');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">Lista de processos indisponível neste ambiente.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${formatNumber(item.pid)}</td>
      <td>${escapeHtml(item.name || '--')}</td>
      <td>${item.cpuPercent != null ? `${Number(item.cpuPercent).toFixed(1)}%` : '--'}</td>
      <td>${escapeHtml(item.memory?.formatted || '--')}</td>
      <td>${item.memoryPercent != null ? `${Number(item.memoryPercent).toFixed(1)}%` : '--'}</td>
      <td>${escapeHtml(item.elapsed || '--')}</td>
    </tr>`).join('');
}

function updateThermals(items = []) {
  const container = $('thermalGrid');
  if (!container) return;
  if (!items.length) {
    setText('thermalSummary', 'Não disponível');
    container.innerHTML = '';
    return;
  }
  const max = Math.max(...items.map(item => Number(item.celsius) || 0));
  setText('thermalSummary', `${items.length} sensor(es) · máx. ${max.toFixed(1)} °C`);
  container.innerHTML = items.slice(0, 8).map(item => `
    <div class="core-card">
      <div><span>${escapeHtml(item.name)}</span><strong>${Number(item.celsius).toFixed(1)} °C</strong></div>
      <div class="mini-bar"><i style="width:${clamp((Number(item.celsius) / 100) * 100)}%"></i></div>
    </div>`).join('');
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatRate(bytesPerSecond) {
  const value = Number(bytesPerSecond) || 0;
  return `${formatBytes(value)}/s`;
}

function getVisibleSamples() {
  const minTime = Date.now() - chartWindowSeconds * 1000;
  const filtered = history.samples.filter(sample => sample.time >= minTime);
  return filtered.length ? filtered : history.samples.slice(-2);
}

function niceMax(value) {
  const n = Math.max(1, Number(value) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const normalized = n / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function sampleNetwork(data) {
  return (data.network?.traffic || []).reduce((acc, item) => {
    acc.download += Number(item.receiveRate?.bytes || 0);
    acc.upload += Number(item.sendRate?.bytes || 0);
    return acc;
  }, { download: 0, upload: 0 });
}

function sampleGpuTemperature(data) {
  const temperatures = (data.graphics?.gpus || [])
    .map(item => Number(item.temperatureC))
    .filter(Number.isFinite);
  if (!temperatures.length) return null;
  return Math.max(...temperatures);
}

function pushHistory(data) {
  const network = sampleNetwork(data);
  const gpuTemp = sampleGpuTemperature(data);
  const sample = {
    time: Date.now(),
    cpu: clamp(data.cpu?.usagePercent),
    memory: clamp(data.memory?.usedPercent),
    disk: data.storage?.root?.available ? clamp(data.storage.root.usedPercent) : null,
    download: network.download,
    upload: network.upload,
    eventP95: Number(data.runtime?.eventLoop?.p95Ms || 0),
    eventP99: Number(data.runtime?.eventLoop?.p99Ms || 0),
    nodeCpu: Number(data.runtime?.cpu?.totalPercent || 0),
    gpuTemp
  };

  history.samples.push(sample);
  if (history.samples.length > history.maxPoints) history.samples.splice(0, history.samples.length - history.maxPoints);

  sessionPeaks.cpu = Math.max(sessionPeaks.cpu, sample.cpu);
  sessionPeaks.memory = Math.max(sessionPeaks.memory, sample.memory);
  sessionPeaks.download = Math.max(sessionPeaks.download, sample.download);
  sessionPeaks.upload = Math.max(sessionPeaks.upload, sample.upload);
  sessionPeaks.eventLoop = Math.max(sessionPeaks.eventLoop, sample.eventP99);
  if (sample.gpuTemp != null) sessionPeaks.gpuTemp = Math.max(sessionPeaks.gpuTemp ?? sample.gpuTemp, sample.gpuTemp);

  updatePeakLabels();
  drawAllCharts();
}

function updatePeakLabels() {
  setText('peakCpu', `${sessionPeaks.cpu.toFixed(1)}%`);
  setText('peakMemory', `${sessionPeaks.memory.toFixed(1)}%`);
  setText('peakDownload', formatRate(sessionPeaks.download));
  setText('peakUpload', formatRate(sessionPeaks.upload));
  setText('peakEventLoop', `${sessionPeaks.eventLoop.toFixed(2)} ms`);
  setText('peakGpuTemp', sessionPeaks.gpuTemp == null ? 'N/D' : `${sessionPeaks.gpuTemp.toFixed(1)} °C`);
  setText('historySamples', history.samples.length);
  setText('resourcePeak', `CPU ${sessionPeaks.cpu.toFixed(0)}% · RAM ${sessionPeaks.memory.toFixed(0)}%`);
  setText('networkPeak', `↓ ${formatRate(sessionPeaks.download)}`);
  setText('eventPeak', `P99 ${sessionPeaks.eventLoop.toFixed(1)} ms`);
}

function drawTimelineChart(canvasId, series, options = {}) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const samples = getVisibleSamples();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = Number(options.height || rect.height || 260);
  const width = Math.max(1, rect.width);
  const height = Math.max(140, cssHeight);

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = 45, right = 12, top = 12, bottom = 28;
  const graphW = Math.max(1, width - left - right);
  const graphH = Math.max(1, height - top - bottom);
  const border = cssVar('--border');
  const muted = cssVar('--muted');

  const allValues = series.flatMap(item => samples.map(sample => Number(sample[item.key]) || 0));
  const rawMax = options.fixedMax ?? Math.max(1, ...allValues);
  const maxY = options.fixedMax ?? niceMax(rawMax * 1.12);
  const formatter = options.formatter || (value => String(Math.round(value)));

  ctx.font = '10px system-ui';
  ctx.lineWidth = 1;
  ctx.strokeStyle = border;
  ctx.fillStyle = muted;

  for (let i = 0; i <= 4; i += 1) {
    const value = (maxY / 4) * i;
    const y = top + graphH - (i / 4) * graphH;
    ctx.globalAlpha = i === 0 ? 0.8 : 0.55;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(formatter(value), 2, y + 3);
  }

  const timeStart = samples[0]?.time;
  const timeEnd = samples.at(-1)?.time;
  if (timeStart && timeEnd) {
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText(new Date(timeStart).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }), left, height - 8);
    ctx.textAlign = 'center';
    ctx.fillText(new Date((timeStart + timeEnd) / 2).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }), left + graphW / 2, height - 8);
    ctx.textAlign = 'right';
    ctx.fillText(new Date(timeEnd).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }), width - right, height - 8);
    ctx.textAlign = 'left';
  }

  series.forEach(item => {
    const color = item.color || cssVar(item.colorVar || '--accent');
    const points = samples.map((sample, index) => {
      const x = left + (samples.length === 1 ? graphW : (index / Math.max(samples.length - 1, 1)) * graphW);
      const value = Math.max(0, Number(sample[item.key]) || 0);
      const y = top + graphH - (value / maxY) * graphH;
      return { x, y, value };
    });

    if (!points.length) return;

    if (item.fill !== false && points.length > 1) {
      const gradient = ctx.createLinearGradient(0, top, 0, top + graphH);
      gradient.addColorStop(0, `${color}28`);
      gradient.addColorStop(1, `${color}00`);
      ctx.beginPath();
      ctx.moveTo(points[0].x, top + graphH);
      points.forEach((point, index) => index === 0 ? ctx.lineTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.lineTo(points.at(-1).x, top + graphH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = item.lineWidth || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.stroke();
  });

  canvas._chartMeta = { samples, series, left, right, top, bottom, graphW, graphH, width, height, maxY, formatter };
  enableChartTooltip(canvas);
}

function enableChartTooltip(canvas) {
  if (canvas.dataset.tooltipReady === '1') return;
  canvas.dataset.tooltipReady = '1';

  canvas.addEventListener('mousemove', event => {
    const meta = canvas._chartMeta;
    const tooltip = $('chartTooltip');
    if (!meta || !tooltip || !meta.samples.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = clamp((x - meta.left) / Math.max(1, meta.graphW), 0, 1);
    const index = Math.round(ratio * Math.max(0, meta.samples.length - 1));
    const sample = meta.samples[index];
    if (!sample) return;

    const rows = meta.series.map(item => {
      const value = Number(sample[item.key]) || 0;
      const label = item.label || item.key;
      const rendered = item.tooltipFormatter ? item.tooltipFormatter(value) : meta.formatter(value);
      return `<div class="tip-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(rendered)}</strong></div>`;
    }).join('');

    tooltip.innerHTML = `<span class="tip-time">${new Date(sample.time).toLocaleTimeString('pt-BR')}</span>${rows}`;
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
    tooltip.classList.add('show');
    tooltip.setAttribute('aria-hidden', 'false');
  });

  canvas.addEventListener('mouseleave', () => {
    const tooltip = $('chartTooltip');
    tooltip?.classList.remove('show');
    tooltip?.setAttribute('aria-hidden', 'true');
  });
}

function drawSparkline(canvasId, key, colorVar = '--accent') {
  const canvas = $(canvasId);
  if (!canvas) return;
  const samples = getVisibleSamples().slice(-60);
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = 38;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!samples.length) return;

  const color = cssVar(colorVar);
  ctx.beginPath();
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = color;
  samples.forEach((sample, index) => {
    const x = (index / Math.max(1, samples.length - 1)) * width;
    const y = height - 3 - (clamp(sample[key]) / 100) * (height - 6);
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawAllCharts() {
  drawTimelineChart('resourceChart', [
    { key:'cpu', label:'CPU', colorVar:'--accent', tooltipFormatter:value => `${value.toFixed(1)}%` },
    { key:'memory', label:'RAM', colorVar:'--accent-2', tooltipFormatter:value => `${value.toFixed(1)}%` }
  ], { fixedMax:100, formatter:value => `${Math.round(value)}%`, height:285 });

  drawTimelineChart('networkChart', [
    { key:'download', label:'Download', colorVar:'--success', tooltipFormatter:formatRate },
    { key:'upload', label:'Upload', colorVar:'--warning', tooltipFormatter:formatRate }
  ], { formatter:value => formatBytes(value), height:220 });

  drawTimelineChart('eventLoopChart', [
    { key:'eventP95', label:'P95', colorVar:'--accent', tooltipFormatter:value => `${value.toFixed(2)} ms` },
    { key:'eventP99', label:'P99', colorVar:'--danger', tooltipFormatter:value => `${value.toFixed(2)} ms` }
  ], { formatter:value => `${Number(value).toFixed(value < 10 ? 1 : 0)} ms`, height:220 });

  drawSparkline('cpuSparkline', 'cpu', '--accent');
  drawSparkline('memorySparkline', 'memory', '--accent-2');

  const visible = getVisibleSamples();
  const last = visible.at(-1);
  if (last) {
    const avgCpu = visible.reduce((sum, sample) => sum + sample.cpu, 0) / visible.length;
    const avgRam = visible.reduce((sum, sample) => sum + sample.memory, 0) / visible.length;
    setText('resourceChartSummary', `Agora ${last.cpu.toFixed(1)}% CPU · ${last.memory.toFixed(1)}% RAM · média ${avgCpu.toFixed(1)}% / ${avgRam.toFixed(1)}%`);
    setText('networkChartSummary', `↓ ${formatRate(last.download)} · ↑ ${formatRate(last.upload)}`);
    setText('eventChartSummary', `P95 ${last.eventP95.toFixed(2)} ms · P99 ${last.eventP99.toFixed(2)} ms`);
  }
}

function severityFor(value, warning, danger) {
  const n = Number(value) || 0;
  if (n >= danger) return 'danger';
  if (n >= warning) return 'warn';
  return 'ok';
}

function setStatusKpi(id, value, severity = 'ok') {
  const element = $(id);
  if (!element) return;
  element.classList.remove('ok', 'warn', 'danger');
  element.classList.add(severity);
  const strong = element.querySelector('strong');
  if (strong) strong.textContent = value;
}

function setMetricSeverity(id, severity) {
  const card = $(id)?.closest('.metric-card');
  if (!card) return;
  card.classList.remove('level-warn', 'level-danger');
  if (severity === 'warn') card.classList.add('level-warn');
  if (severity === 'danger') card.classList.add('level-danger');
}

function updateHealth(data) {
  const cpu = clamp(data.cpu?.usagePercent);
  const memory = clamp(data.memory?.usedPercent);
  const disk = data.storage?.root?.available ? clamp(data.storage.root.usedPercent) : 0;
  const eventP95 = Number(data.runtime?.eventLoop?.p95Ms || 0);
  const network = sampleNetwork(data);
  const processCount = data.processes?.totalCount;
  const gpuTemp = sampleGpuTemperature(data);

  const cpuSeverity = severityFor(cpu, 75, 90);
  const memorySeverity = severityFor(memory, 80, 92);
  const diskSeverity = severityFor(disk, 85, 95);
  const eventSeverity = severityFor(eventP95, 30, 80);
  const gpuSeverity = gpuTemp == null ? 'ok' : severityFor(gpuTemp, 78, 88);

  let score = 100;
  score -= Math.max(0, cpu - 65) * 0.55;
  score -= Math.max(0, memory - 70) * 0.55;
  score -= Math.max(0, disk - 80) * 0.65;
  score -= Math.min(18, Math.max(0, eventP95 - 20) * 0.22);
  if (gpuTemp != null) score -= Math.min(18, Math.max(0, gpuTemp - 70) * 0.65);
  score = Math.round(clamp(score, 0, 100));

  let label = 'Saudável';
  let color = 'var(--success)';
  if (score < 70) { label = 'Atenção'; color = 'var(--warning)'; }
  if (score < 45) { label = 'Crítico'; color = 'var(--danger)'; }

  setText('healthScore', score);
  setText('healthLabel', label);
  setText('healthMessage', score >= 85 ? 'Recursos operando dentro de faixas confortáveis.' : score >= 60 ? 'Há métricas elevadas que merecem acompanhamento.' : 'Uma ou mais métricas estão em faixa crítica.');
  $('healthRing')?.style.setProperty('--score', score);
  $('healthRing')?.style.setProperty('--score-color', color);

  setStatusKpi('statusCpu', `${cpu.toFixed(1)}%`, cpuSeverity);
  setStatusKpi('statusMemory', `${memory.toFixed(1)}%`, memorySeverity);
  setStatusKpi('statusDisk', data.storage?.root?.available ? `${disk.toFixed(1)}%` : 'N/D', diskSeverity);
  setStatusKpi('statusNetwork', `↓ ${formatRate(network.download)} · ↑ ${formatRate(network.upload)}`, 'ok');
  setStatusKpi('statusEventLoop', `${eventP95.toFixed(1)} ms`, eventSeverity);
  setStatusKpi('statusProcesses', processCount == null ? 'N/D' : formatNumber(processCount), 'ok');

  setMetricSeverity('cpuUsage', cpuSeverity);
  setMetricSeverity('memoryUsage', memorySeverity);
  setMetricSeverity('diskUsage', diskSeverity);
  setText('diskHealthText', diskSeverity === 'danger' ? 'Crítico' : diskSeverity === 'warn' ? 'Atenção' : 'Normal');

  const alerts = [];
  if (cpuSeverity !== 'ok') alerts.push({ severity:cpuSeverity, text:`CPU em ${cpu.toFixed(1)}% de uso.` });
  if (memorySeverity !== 'ok') alerts.push({ severity:memorySeverity, text:`Memória RAM em ${memory.toFixed(1)}% de uso.` });
  if (data.storage?.root?.available && diskSeverity !== 'ok') alerts.push({ severity:diskSeverity, text:`Disco principal com ${disk.toFixed(1)}% ocupado.` });
  if (eventSeverity !== 'ok') alerts.push({ severity:eventSeverity, text:`Event loop P95 em ${eventP95.toFixed(1)} ms.` });
  if (gpuTemp != null && gpuSeverity !== 'ok') alerts.push({ severity:gpuSeverity, text:`GPU atingiu ${gpuTemp.toFixed(1)} °C.` });

  setText('alertCount', alerts.length);
  const list = $('alertList');
  if (list) {
    list.innerHTML = alerts.length
      ? alerts.map(alert => `<div class="alert-item ${alert.severity}">${escapeHtml(alert.text)}</div>`).join('')
      : '<div class="alert-item ok">Nenhum alerta relevante. Sistema dentro das faixas configuradas.</div>';
  }
}

function updateProcessBars(processes = {}) {
  const items = (processes.items || []).slice(0, 6);
  const container = $('processBars');
  setText('processBarsCount', `${items.length} exibidos`);
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Processos indisponíveis neste ambiente.</div>';
    return;
  }
  const maxCpu = Math.max(1, ...items.map(item => Number(item.cpuPercent) || 0));
  container.innerHTML = items.map(item => {
    const cpu = Number(item.cpuPercent) || 0;
    const width = clamp((cpu / maxCpu) * 100);
    return `<div class="process-bar">
      <div class="process-bar-head"><span>${escapeHtml(item.name || 'processo')} · PID ${formatNumber(item.pid)}</span><strong>${cpu.toFixed(1)}%</strong></div>
      <div class="process-bar-track"><i style="width:${width}%"></i></div>
    </div>`;
  }).join('');
}

function updateDynamicUi(data) {
  updateHealth(data);
  updateProcessBars(data.processes || {});
  const generated = new Date(data.generatedAt || Date.now()).getTime();
  setText('sampleAge', Number.isFinite(generated) ? `${Math.max(0, Math.round((Date.now() - generated) / 1000))} s` : '--');
  setText('historyWindowLabel', $('chartWindow')?.selectedOptions?.[0]?.text || `${Math.round(chartWindowSeconds / 60)} min`);
  setText('refreshLabel', $('refreshRate')?.selectedOptions?.[0]?.text || '--');
  setText('monitorState', isPaused ? 'Pausado' : 'Ao vivo');
  setText('displayModeLabel', $('viewMode')?.selectedOptions?.[0]?.text || 'Padrão');
  setText('themeLabel', $('themeSelect')?.selectedOptions?.[0]?.text || 'Dark');
}

function drawChart() {
  drawAllCharts();
}

function updateDashboard(data) {
  const rootDisk = data.storage?.root || {};
  const memoryDetails = data.memory?.details || {};
  const runtime = data.runtime || {};
  const computer = data.system?.computer || {};
  const board = data.system?.motherboard || {};
  const bios = data.system?.bios || {};

  setText('scopeNote', data.scope?.note || 'Métricas coletadas pelo host Node.js.');

  setText('cpuUsage', Number(data.cpu?.usagePercent || 0).toFixed(1));
  setText('cpuCores', `${data.cpu?.logicalCores ?? '--'} threads`);
  setText('cpuModel', data.cpu?.model);
  setText('cpuSpeed', `${data.cpu?.averageSpeedMHz ?? '--'} MHz médios`);
  setBar('cpuBar', data.cpu?.usagePercent);

  setText('memoryUsage', Number(data.memory?.usedPercent || 0).toFixed(1));
  setText('memoryTotal', data.memory?.total?.formatted);
  setText('memoryUsed', data.memory?.used?.formatted);
  setText('memoryFree', data.memory?.free?.formatted);
  setBar('memoryBar', data.memory?.usedPercent);

  if (rootDisk.available) {
    setText('diskUsage', Number(rootDisk.usedPercent).toFixed(1));
    setText('diskMount', rootDisk.mount);
    setText('diskUsed', rootDisk.used?.formatted);
    setText('diskFree', rootDisk.free?.formatted);
    setText('diskTotal', rootDisk.total?.formatted);
    setText('diskFreeDetail', rootDisk.free?.formatted);
    setText('diskDonutValue', `${Number(rootDisk.usedPercent).toFixed(1)}%`);
    setBar('diskBar', rootDisk.usedPercent);
    $('diskDonut')?.style.setProperty('--p', clamp(rootDisk.usedPercent));
  } else {
    ['diskUsage', 'diskUsed', 'diskFree', 'diskTotal', 'diskFreeDetail'].forEach(id => setText(id, 'N/D'));
    setText('diskDonutValue', 'N/D');
  }

  setText('systemUptime', data.system?.uptime?.formatted);
  setText('appUptime', runtime.appUptime?.formatted);
  setText('lastUpdate', formatDate(data.generatedAt));

  setText('hostname', data.system?.hostname);
  setText('osType', `${data.system?.type || ''} ${data.system?.release || ''}`.trim());
  setText('osVersion', data.system?.version);
  setText('platform', formatPlatform(data.system?.platform));
  setText('architecture', data.system?.architecture);
  setText('release', data.system?.release);
  setText('machine', data.system?.machine);
  setText('bootTime', formatDate(data.system?.bootTime));
  setText('serverTimezone', data.system?.timezone);
  setText('username', data.system?.user?.username);
  setText('homedir', data.system?.user?.homedir);
  setText('shell', data.system?.user?.shell || 'N/D');
  setText('tempDirectory', data.system?.tempDirectory);
  setText('endianness', data.system?.endianness);

  setText('cpuUser', `${Number(data.cpu?.breakdown?.userPercent || 0).toFixed(1)}%`);
  setText('cpuSystem', `${Number(data.cpu?.breakdown?.systemPercent || 0).toFixed(1)}%`);
  setText('cpuIdle', `${Number(data.cpu?.breakdown?.idlePercent || 0).toFixed(1)}%`);
  setText('cpuIrq', `${Number(data.cpu?.breakdown?.irqPercent || 0).toFixed(1)}%`);
  setText('loadAverage', (data.cpu?.loadAverage || []).join(' / ') || '--');

  setText('memoryAvailable', memoryDetails.available?.formatted || data.memory?.free?.formatted || '--');
  setText('memoryCached', memoryDetails.cached?.formatted || 'N/D');
  setText('memoryBuffers', memoryDetails.buffers?.formatted || 'N/D');
  setText('swapUsed', memoryDetails.swapUsed?.formatted || 'N/D');
  setText('swapTotal', memoryDetails.swapTotal?.formatted || 'N/D');

  setText('cpuManufacturer', data.cpu?.manufacturer || 'N/D');
  setText('physicalCores', data.cpu?.physicalCores ?? 'N/D');
  setText('logicalCores', data.cpu?.logicalCores ?? 'N/D');
  setText('cpuCurrentClock', valueOrDash(data.cpu?.currentClockMHz, ' MHz'));
  setText('cpuMaxClock', valueOrDash(data.cpu?.maxClockMHz, ' MHz'));
  setText('cpuL2', data.cpu?.l2Cache?.formatted && data.cpu.l2Cache.bytes > 0 ? data.cpu.l2Cache.formatted : 'N/D');
  setText('cpuL3', data.cpu?.l3Cache?.formatted && data.cpu.l3Cache.bytes > 0 ? data.cpu.l3Cache.formatted : 'N/D');

  setText('computerManufacturer', computer.manufacturer || 'N/D');
  setText('computerModel', computer.model || 'N/D');
  setText('motherboard', [board.manufacturer, board.product].filter(Boolean).join(' · ') || 'N/D');
  setText('biosVersion', bios.version || 'N/D');
  setText('biosManufacturer', bios.manufacturer || 'N/D');
  setText('biosDate', formatDate(bios.releaseDate));

  const battery = data.battery;
  setText('batteryPercent', battery?.percent != null ? `${battery.percent}%` : 'N/D');
  setText('batteryStatus', battery?.status || 'N/D');
  setText('batteryTime', battery?.estimatedMinutes != null ? `${Math.floor(battery.estimatedMinutes / 60)}h ${battery.estimatedMinutes % 60}min` : 'N/D');

  setText('nodeVersion', runtime.nodeVersion);
  setText('expressVersion', runtime.expressVersion);
  setText('v8Version', runtime.v8Version);
  setText('uvVersion', runtime.uvVersion);
  setText('opensslVersion', runtime.opensslVersion);
  setText('pid', `${runtime.pid ?? '--'} / ${runtime.ppid ?? '--'}`);
  setText('cwd', runtime.cwd);
  setText('execPath', runtime.execPath);
  setText('startedAt', formatDate(runtime.startedAt));

  setText('nodeCpu', `${Number(runtime.cpu?.totalPercent || 0).toFixed(2)}%`);
  setText('rss', runtime.memory?.rss?.formatted);
  setText('heapUsed', runtime.memory?.heapUsed?.formatted);
  setText('heapTotal', runtime.memory?.heapTotal?.formatted);
  setText('externalMemory', runtime.memory?.external?.formatted);
  setText('arrayBuffers', runtime.memory?.arrayBuffers?.formatted);
  setText('nodeAvailableMemory', runtime.memory?.availableMemory?.formatted || 'N/D');

  setText('eventLoopMean', `${Number(runtime.eventLoop?.meanMs || 0).toFixed(2)} ms`);
  setText('eventLoopP50', `${Number(runtime.eventLoop?.p50Ms || 0).toFixed(2)} ms`);
  setText('eventLoopP95', `${Number(runtime.eventLoop?.p95Ms || 0).toFixed(2)} ms`);
  setText('eventLoopP99', `${Number(runtime.eventLoop?.p99Ms || 0).toFixed(2)} ms`);
  setText('eventLoopMax', `${Number(runtime.eventLoop?.maxMs || 0).toFixed(2)} ms`);
  setText('activeHandles', runtime.handles?.activeHandles ?? 'N/D');
  setText('activeRequests', runtime.handles?.activeRequests ?? 'N/D');

  setText('resourceUserCpu', `${formatNumber(runtime.resources?.userCpuMs)} ms`);
  setText('resourceSystemCpu', `${formatNumber(runtime.resources?.systemCpuMs)} ms`);
  setText('minorPageFault', formatNumber(runtime.resources?.minorPageFault));
  setText('majorPageFault', formatNumber(runtime.resources?.majorPageFault));
  setText('fsOperations', `${formatNumber(runtime.resources?.fsRead)} / ${formatNumber(runtime.resources?.fsWrite)}`);
  setText('contextSwitches', `${formatNumber(runtime.resources?.voluntaryContextSwitches)} / ${formatNumber(runtime.resources?.involuntaryContextSwitches)}`);

  setText('httpRequests', formatNumber(runtime.http?.requests));
  setText('http2xx', formatNumber(runtime.http?.responses2xx));
  setText('http4xx', formatNumber(runtime.http?.responses4xx));
  setText('http5xx', formatNumber(runtime.http?.responses5xx));
  setText('httpBytesSent', runtime.http?.bytesSent?.formatted);

  updateCoreGrid(data.cpu?.perCore || []);
  updateNetworkTable(data.network?.interfaces || []);
  updateNetworkTraffic(data.network?.traffic || []);
  updateGpuTable(data.graphics?.gpus || []);
  updateRamModules(data.memory?.modules || []);
  updateThermals(data.graphics?.thermals || []);
  updateVolumes(data.storage?.volumes || []);
  updatePhysicalDisks(data.storage?.physicalDisks || []);
  updateProcesses(data.processes || {});
  latestData = data;
  pushHistory(data);
  updateDynamicUi(data);
}

async function loadSystemData(showFeedback = false) {
  if (isFetching) return;
  isFetching = true;
  if ($('refreshButton')) $('refreshButton').textContent = '⟳';
  try {
    const response = await fetch('/api/system', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    updateDashboard(data);
    if (showFeedback) showToast('Dados atualizados.');
  } catch (error) {
    console.error(error);
    showToast('Falha ao atualizar o dashboard.');
  } finally {
    if ($('refreshButton')) $('refreshButton').textContent = '↻';
    isFetching = false;
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (isPaused) return;
  refreshTimer = setInterval(() => {
    if (!isPaused && document.visibilityState !== 'hidden') loadSystemData(false);
  }, Number($('refreshRate')?.value || 2000));
}

function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function updateClock() {
  setText('clock', new Date().toLocaleString('pt-BR'));
  if (latestData?.generatedAt) {
    const generated = new Date(latestData.generatedAt).getTime();
    if (Number.isFinite(generated)) setText('sampleAge', `${Math.max(0, Math.round((Date.now() - generated) / 1000))} s`);
  }
}

function applySavedPreferences() {
  const allowedThemes = ['dark', 'light', 'aurora', 'contrast'];
  const allowedViews = ['standard', 'compact', 'performance', 'wallboard'];
  const theme = localStorage.getItem('cloud-so-theme');
  const view = localStorage.getItem('cloud-so-view');
  const sidebar = localStorage.getItem('cloud-so-sidebar');

  if (allowedThemes.includes(theme)) document.documentElement.dataset.theme = theme;
  if (allowedViews.includes(view)) document.documentElement.dataset.view = view;
  if (sidebar === 'collapsed' || sidebar === 'expanded') document.documentElement.dataset.sidebar = sidebar;

  if ($('themeSelect')) $('themeSelect').value = document.documentElement.dataset.theme || 'dark';
  if ($('viewMode')) $('viewMode').value = document.documentElement.dataset.view || 'standard';
  if ($('chartWindow')) chartWindowSeconds = Number($('chartWindow').value || 300);
}

function getWebGlRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'WebGL indisponível';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || gl.getParameter(gl.RENDERER);
    return gl.getParameter(gl.RENDERER) || 'Não identificado';
  } catch {
    return 'Não disponível';
  }
}

function updateClientConnection() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  setText('clientOnline', navigator.onLine ? 'Online' : 'Offline');
  setText('clientConnectionType', connection?.effectiveType || connection?.type || 'N/D');
  setText('clientDownlink', connection?.downlink != null ? `${connection.downlink} Mbps` : 'N/D');
  setText('clientRtt', connection?.rtt != null ? `${connection.rtt} ms` : 'N/D');
  setText('clientSaveData', connection?.saveData == null ? 'N/D' : connection.saveData ? 'Ativada' : 'Desativada');
}

function updateClientDisplay() {
  setText('clientResolution', `${screen.width} × ${screen.height}`);
  setText('clientAvailableResolution', `${screen.availWidth} × ${screen.availHeight}`);
  setText('clientViewport', `${window.innerWidth} × ${window.innerHeight}`);
  setText('clientDpr', window.devicePixelRatio?.toFixed(2) || '1.00');
  setText('clientColorDepth', `${screen.colorDepth} bits`);
}

function updateClientMemory() {
  const memory = performance.memory;
  if (!memory) {
    setText('clientHeapUsed', 'N/D');
    setText('clientHeapTotal', 'N/D');
    setText('clientHeapLimit', 'N/D');
    return;
  }
  setText('clientHeapUsed', formatBytes(memory.usedJSHeapSize));
  setText('clientHeapTotal', formatBytes(memory.totalJSHeapSize));
  setText('clientHeapLimit', formatBytes(memory.jsHeapSizeLimit));
}

function updateClientBattery() {
  if (!batteryManager) {
    setText('clientBattery', 'API não suportada');
    return;
  }
  const pct = `${Math.round(batteryManager.level * 100)}%`;
  const state = batteryManager.charging ? 'carregando' : 'na bateria';
  let time = '';
  const seconds = batteryManager.charging ? batteryManager.chargingTime : batteryManager.dischargingTime;
  if (Number.isFinite(seconds) && seconds > 0) {
    const minutes = Math.round(seconds / 60);
    time = ` · ${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  }
  setText('clientBattery', `${pct} · ${state}${time}`);
}

async function initClientInfo() {
  setText('clientUserAgent', navigator.userAgent);
  setText('clientLanguage', navigator.languages?.join(', ') || navigator.language || '--');
  setText('clientTimezone', Intl.DateTimeFormat().resolvedOptions().timeZone || '--');
  setText('clientCores', navigator.hardwareConcurrency || 'N/D');
  setText('clientMemory', navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'N/D');
  setText('clientGpu', getWebGlRenderer());
  setText('clientVisibility', document.visibilityState);

  let platformLabel = navigator.userAgentData?.platform || navigator.platform || 'Não identificado';
  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      const info = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'wow64']);
      const extras = [info.architecture, info.bitness ? `${info.bitness}-bit` : null, info.model].filter(Boolean);
      platformLabel += extras.length ? ` · ${extras.join(' · ')}` : '';
    }
  } catch { /* Alguns navegadores bloqueiam os dados de alta entropia. */ }
  setText('clientPlatform', platformLabel);

  updateClientDisplay();
  updateClientConnection();
  updateClientMemory();

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  connection?.addEventListener?.('change', updateClientConnection);
  window.addEventListener('online', updateClientConnection);
  window.addEventListener('offline', updateClientConnection);

  if (navigator.getBattery) {
    try {
      batteryManager = await navigator.getBattery();
      updateClientBattery();
      ['chargingchange', 'levelchange', 'chargingtimechange', 'dischargingtimechange'].forEach(event => {
        batteryManager.addEventListener(event, updateClientBattery);
      });
    } catch {
      setText('clientBattery', 'N/D');
    }
  } else {
    setText('clientBattery', 'API não suportada');
  }
}

function startFpsMonitor() {
  let frames = 0;
  let last = performance.now();
  const loop = now => {
    frames += 1;
    const elapsed = now - last;
    if (elapsed >= 1000) {
      const fps = Math.round((frames * 1000) / elapsed);
      setText('clientFps', `${fps} FPS`);
      frames = 0;
      last = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function setTheme(theme, notify = true) {
  const allowed = ['dark', 'light', 'aurora', 'contrast'];
  if (!allowed.includes(theme)) return;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('cloud-so-theme', theme);
  if ($('themeSelect')) $('themeSelect').value = theme;
  if (latestData) updateDynamicUi(latestData);
  setTimeout(drawAllCharts, 30);
  if (notify) showToast(`Tema: ${$('themeSelect')?.selectedOptions?.[0]?.text || theme}`);
}

function setViewMode(view, notify = true) {
  const allowed = ['standard', 'compact', 'performance', 'wallboard'];
  if (!allowed.includes(view)) return;
  document.documentElement.dataset.view = view;
  localStorage.setItem('cloud-so-view', view);
  if ($('viewMode')) $('viewMode').value = view;
  if (latestData) updateDynamicUi(latestData);
  setTimeout(drawAllCharts, 80);
  if (notify) showToast(`Modo: ${$('viewMode')?.selectedOptions?.[0]?.text || view}`);
}

function togglePause() {
  isPaused = !isPaused;
  document.documentElement.dataset.paused = String(isPaused);
  const button = $('pauseButton');
  if (button) {
    button.textContent = isPaused ? '▶' : 'Ⅱ';
    button.title = isPaused ? 'Retomar monitoramento' : 'Pausar monitoramento';
    button.classList.toggle('is-active', isPaused);
  }
  setText('monitorState', isPaused ? 'Pausado' : 'Ao vivo');
  if (isPaused) {
    clearInterval(refreshTimer);
    showToast('Monitoramento pausado. O histórico foi preservado.');
  } else {
    loadSystemData(false);
    scheduleRefresh();
    showToast('Monitoramento retomado.');
  }
}

function toggleSidebar() {
  const next = document.documentElement.dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed';
  document.documentElement.dataset.sidebar = next;
  localStorage.setItem('cloud-so-sidebar', next);
  setTimeout(drawAllCharts, 120);
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  } catch {
    showToast('Tela cheia não disponível neste navegador.');
  }
}

function closeFocusedPanel() {
  if (!focusedPanel) return;
  focusedPanel.classList.remove('is-focused');
  focusedPanel = null;
  document.body.classList.remove('has-focus');
  $('focusBackdrop')?.classList.remove('show');
  $('focusBackdrop')?.setAttribute('aria-hidden', 'true');
  setTimeout(drawAllCharts, 80);
}

function focusPanel(panel) {
  if (!panel) return;
  if (focusedPanel === panel) {
    closeFocusedPanel();
    return;
  }
  closeFocusedPanel();
  focusedPanel = panel;
  panel.classList.add('is-focused');
  document.body.classList.add('has-focus');
  $('focusBackdrop')?.classList.add('show');
  $('focusBackdrop')?.setAttribute('aria-hidden', 'false');
  setTimeout(drawAllCharts, 100);
}

function setupPanelFocus() {
  document.querySelectorAll('.panel').forEach(panel => {
    const header = panel.querySelector(':scope > .panel-header');
    if (!header || header.querySelector('.panel-focus-button')) return;
    const button = document.createElement('button');
    button.className = 'panel-focus-button';
    button.type = 'button';
    button.title = 'Abrir painel em modo foco';
    button.setAttribute('aria-label', 'Abrir painel em modo foco');
    button.textContent = '⛶';
    button.addEventListener('click', event => {
      event.stopPropagation();
      focusPanel(panel);
    });
    header.appendChild(button);
  });

  $('focusBackdrop')?.addEventListener('click', closeFocusedPanel);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focusedPanel) closeFocusedPanel();
  });
}

function setupScrollSpy() {
  const links = [...document.querySelectorAll('.nav-item[href^="#"]')];
  const targets = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if (!('IntersectionObserver' in window) || !targets.length) return;

  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin:'-20% 0px -65% 0px', threshold:[0.05, 0.2, 0.5] });

  targets.forEach(target => observer.observe(target));
}

$('refreshButton')?.addEventListener('click', () => loadSystemData(true));

$('refreshRate')?.addEventListener('change', () => {
  scheduleRefresh();
  setText('refreshLabel', $('refreshRate').selectedOptions[0].text);
  showToast(`Atualização automática: ${$('refreshRate').selectedOptions[0].text}`);
});

$('chartWindow')?.addEventListener('change', () => {
  chartWindowSeconds = Number($('chartWindow').value || 300);
  setText('historyWindowLabel', $('chartWindow').selectedOptions[0].text);
  drawAllCharts();
  showToast(`Histórico exibido: ${$('chartWindow').selectedOptions[0].text}`);
});

$('themeSelect')?.addEventListener('change', () => setTheme($('themeSelect').value));
$('viewMode')?.addEventListener('change', () => setViewMode($('viewMode').value));
$('pauseButton')?.addEventListener('click', togglePause);
$('sidebarButton')?.addEventListener('click', toggleSidebar);
$('fullscreenButton')?.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', () => {
  const button = $('fullscreenButton');
  if (button) {
    button.textContent = document.fullscreenElement ? '⤢' : '⛶';
    button.classList.toggle('is-active', Boolean(document.fullscreenElement));
  }
  setTimeout(drawAllCharts, 80);
});

window.addEventListener('resize', () => {
  drawAllCharts();
  updateClientDisplay();
});

document.addEventListener('visibilitychange', () => {
  setText('clientVisibility', document.visibilityState);
  if (document.visibilityState === 'visible' && !isPaused) loadSystemData(false);
});

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(link => link.classList.remove('active'));
  item.classList.add('active');
}));

applySavedPreferences();
setupPanelFocus();
setupScrollSpy();
initClientInfo();
startFpsMonitor();
loadSystemData();
scheduleRefresh();
updateClock();
setInterval(updateClock, 1000);
setInterval(updateClientMemory, 2000);
