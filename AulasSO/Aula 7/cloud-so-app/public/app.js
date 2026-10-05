const $ = id => document.getElementById(id);
const history = { cpu: [], memory: [], maxPoints: 45 };
let refreshTimer = null;
let isFetching = false;

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

function formatPlatform(value) {
  const map = { win32: 'Windows', linux: 'Linux', darwin: 'macOS', freebsd: 'FreeBSD', aix: 'AIX' };
  return map[value] || value;
}

function updateCoreGrid(values = []) {
  const container = $('coreGrid');
  if (!container) return;
  container.innerHTML = values.map((value, index) => `
    <div class="core-card">
      <div><span>CPU ${index + 1}</span><strong>${Number(value).toFixed(1)}%</strong></div>
      <div class="mini-bar"><i style="width:${clamp(value)}%"></i></div>
    </div>
  `).join('');
}

function updateNetworkTable(items = []) {
  const tbody = $('networkTable');
  setText('networkCount', items.length);
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhuma interface externa encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(String(item.family))}</td>
      <td>${escapeHtml(item.address)}</td>
      <td>${escapeHtml(item.netmask)}</td>
      <td>${escapeHtml(item.mac)}</td>
    </tr>
  `).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function pushHistory(cpu, memory) {
  history.cpu.push(clamp(cpu));
  history.memory.push(clamp(memory));
  if (history.cpu.length > history.maxPoints) history.cpu.shift();
  if (history.memory.length > history.maxPoints) history.memory.shift();
  drawChart();
}

function drawChart() {
  const canvas = $('resourceChart');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(260 * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const left = 34, right = 10, top = 10, bottom = 24;
  const graphW = width - left - right;
  const graphH = height - top - bottom;
  const styles = getComputedStyle(document.documentElement);
  const border = styles.getPropertyValue('--border').trim();
  const muted = styles.getPropertyValue('--muted').trim();
  const accent = styles.getPropertyValue('--accent').trim();
  const accent2 = styles.getPropertyValue('--accent-2').trim();

  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px system-ui';
  ctx.fillStyle = muted;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;

  [0,25,50,75,100].forEach(value => {
    const y = top + graphH - (value / 100) * graphH;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width-right, y); ctx.stroke();
    ctx.fillText(`${value}%`, 2, y + 3);
  });

  const drawLine = (points, color) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((value, index) => {
      const x = left + (points.length === 1 ? graphW : (index / (Math.max(points.length - 1, 1))) * graphW);
      const y = top + graphH - (value / 100) * graphH;
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  drawLine(history.cpu, accent);
  drawLine(history.memory, accent2);
}

function updateDashboard(data) {
  setText('cpuUsage', Number(data.cpu.usagePercent).toFixed(1));
  setText('cpuCores', `${data.cpu.cores} núcleos`);
  setText('cpuModel', data.cpu.model);
  setText('cpuSpeed', `${data.cpu.averageSpeedMHz} MHz médios`);
  setBar('cpuBar', data.cpu.usagePercent);

  setText('memoryUsage', Number(data.memory.usedPercent).toFixed(1));
  setText('memoryTotal', data.memory.total.formatted);
  setText('memoryUsed', data.memory.used.formatted);
  setText('memoryFree', data.memory.free.formatted);
  setBar('memoryBar', data.memory.usedPercent);

  if (data.disk.available) {
    setText('diskUsage', Number(data.disk.usedPercent).toFixed(1));
    setText('diskMount', data.disk.mount);
    setText('diskUsed', data.disk.used.formatted);
    setText('diskFree', data.disk.free.formatted);
    setText('diskTotal', data.disk.total.formatted);
    setText('diskFreeDetail', data.disk.free.formatted);
    setText('diskDonutValue', `${Number(data.disk.usedPercent).toFixed(1)}%`);
    setBar('diskBar', data.disk.usedPercent);
    $('diskDonut').style.setProperty('--p', clamp(data.disk.usedPercent));
  } else {
    ['diskUsage','diskUsed','diskFree','diskTotal','diskFreeDetail'].forEach(id => setText(id, 'N/D'));
    setText('diskDonutValue', 'N/D');
  }

  setText('systemUptime', data.system.uptime.formatted);
  setText('appUptime', data.runtime.appUptime.formatted);
  setText('lastUpdate', new Date(data.generatedAt).toLocaleTimeString('pt-BR'));

  setText('hostname', data.system.hostname);
  setText('osType', `${data.system.type} ${data.system.release}`);
  setText('platform', formatPlatform(data.system.platform));
  setText('architecture', data.system.architecture);
  setText('release', data.system.release);
  setText('username', data.system.user.username);
  setText('homedir', data.system.user.homedir);
  setText('tempDirectory', data.system.tempDirectory);
  setText('endianness', data.system.endianness);
  setText('machine', data.system.machine);

  setText('nodeVersion', data.runtime.nodeVersion);
  setText('expressVersion', data.runtime.expressVersion);
  setText('v8Version', data.runtime.v8Version);
  setText('pid', data.runtime.pid);
  setText('cwd', data.runtime.cwd);
  setText('rss', data.runtime.memory.rss.formatted);
  setText('heapUsed', data.runtime.memory.heapUsed.formatted);
  setText('heapTotal', data.runtime.memory.heapTotal.formatted);
  setText('externalMemory', data.runtime.memory.external.formatted);

  updateCoreGrid(data.cpu.perCore);
  updateNetworkTable(data.network);
  pushHistory(data.cpu.usagePercent, data.memory.usedPercent);
}

async function loadSystemData(showFeedback = false) {
  if (isFetching) return;
  isFetching = true;
  $('refreshButton').textContent = '⟳';
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
    $('refreshButton').textContent = '↻';
    isFetching = false;
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadSystemData(false), Number($('refreshRate').value));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function updateClock() {
  setText('clock', new Date().toLocaleString('pt-BR'));
}

function applySavedTheme() {
  const saved = localStorage.getItem('cloud-so-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}

$('refreshButton').addEventListener('click', () => loadSystemData(true));
$('refreshRate').addEventListener('change', () => { scheduleRefresh(); showToast(`Atualização automática: ${$('refreshRate').selectedOptions[0].text}`); });
$('themeButton').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('cloud-so-theme', next);
  drawChart();
});
window.addEventListener('resize', drawChart);

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(link => link.classList.remove('active'));
  item.classList.add('active');
}));

applySavedTheme();
loadSystemData();
scheduleRefresh();
updateClock();
setInterval(updateClock, 1000);
