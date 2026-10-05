const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const startedAt = Date.now();

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

let previousCpuSnapshot = readCpuSnapshot();

function bytesToObject(bytes) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (value === 0) return { bytes: 0, formatted: '0 B' };
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return {
    bytes: value,
    formatted: `${(value / (1024 ** index)).toFixed(index >= 3 ? 2 : 1)} ${units[index]}`
  };
}

function secondsToParts(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return {
    seconds,
    formatted: `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
  };
}

function readCpuSnapshot() {
  return os.cpus().map(cpu => {
    const times = cpu.times;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;
    return { idle: times.idle, total };
  });
}

function calculateCpuUsage() {
  const current = readCpuSnapshot();
  const perCore = current.map((cpu, index) => {
    const previous = previousCpuSnapshot[index] || cpu;
    const totalDiff = cpu.total - previous.total;
    const idleDiff = cpu.idle - previous.idle;
    if (totalDiff <= 0) return 0;
    return Math.max(0, Math.min(100, Number(((1 - idleDiff / totalDiff) * 100).toFixed(1))));
  });
  previousCpuSnapshot = current;
  const total = perCore.length
    ? Number((perCore.reduce((sum, value) => sum + value, 0) / perCore.length).toFixed(1))
    : 0;
  return { total, perCore };
}

function getDiskInfo() {
  try {
    const root = path.parse(process.cwd()).root || '/';
    if (typeof fs.statfsSync !== 'function') {
      return { available: false, mount: root, message: 'statfs não suportado nesta versão do Node.js.' };
    }
    const stats = fs.statfsSync(root);
    const blockSize = Number(stats.bsize);
    const total = Number(stats.blocks) * blockSize;
    const free = Number(stats.bavail) * blockSize;
    const used = Math.max(0, total - free);
    const usedPercent = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;
    return {
      available: true,
      mount: root,
      total: bytesToObject(total),
      used: bytesToObject(used),
      free: bytesToObject(free),
      usedPercent
    };
  } catch (error) {
    return { available: false, message: error.message };
  }
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (address.internal) continue;
      result.push({
        name,
        family: address.family,
        address: address.address,
        netmask: address.netmask,
        mac: address.mac,
        cidr: address.cidr || null
      });
    }
  }

  return result;
}

function getStaticCpuInfo() {
  const cpus = os.cpus();
  if (!cpus.length) return { model: 'Não disponível', cores: 0, averageSpeedMHz: 0 };
  const averageSpeedMHz = Math.round(cpus.reduce((sum, cpu) => sum + cpu.speed, 0) / cpus.length);
  return {
    model: cpus[0].model.trim(),
    cores: cpus.length,
    averageSpeedMHz
  };
}

function getSystemData() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(0, totalMemory - freeMemory);
  const memoryUsedPercent = totalMemory > 0 ? Number(((usedMemory / totalMemory) * 100).toFixed(1)) : 0;
  const processMemory = process.memoryUsage();
  const cpuUsage = calculateCpuUsage();
  const cpuInfo = getStaticCpuInfo();
  const user = (() => {
    try {
      const data = os.userInfo();
      return { username: data.username, homedir: data.homedir };
    } catch {
      return { username: 'Não disponível', homedir: os.homedir() };
    }
  })();

  return {
    generatedAt: new Date().toISOString(),
    status: 'online',
    system: {
      hostname: os.hostname(),
      type: os.type(),
      platform: os.platform(),
      release: os.release(),
      version: typeof os.version === 'function' ? os.version() : 'Não disponível',
      architecture: os.arch(),
      machine: typeof os.machine === 'function' ? os.machine() : os.arch(),
      uptime: secondsToParts(os.uptime()),
      tempDirectory: os.tmpdir(),
      endianness: os.endianness(),
      user
    },
    cpu: {
      ...cpuInfo,
      usagePercent: cpuUsage.total,
      perCore: cpuUsage.perCore,
      loadAverage: os.loadavg().map(value => Number(value.toFixed(2)))
    },
    memory: {
      total: bytesToObject(totalMemory),
      used: bytesToObject(usedMemory),
      free: bytesToObject(freeMemory),
      usedPercent: memoryUsedPercent
    },
    disk: getDiskInfo(),
    network: getNetworkInfo(),
    runtime: {
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      expressVersion: (() => {
        try { return require('express/package.json').version; } catch { return 'Não disponível'; }
      })(),
      pid: process.pid,
      cwd: process.cwd(),
      appUptime: secondsToParts(process.uptime()),
      startedAt: new Date(startedAt).toISOString(),
      memory: {
        rss: bytesToObject(processMemory.rss),
        heapTotal: bytesToObject(processMemory.heapTotal),
        heapUsed: bytesToObject(processMemory.heapUsed),
        external: bytesToObject(processMemory.external)
      }
    }
  };
}

app.get('/api/system', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getSystemData());
});

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    service: 'cloud-so-app',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada', path: req.originalUrl });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Cloud SO App rodando em http://localhost:${PORT}`);
  console.log(`API do sistema: http://localhost:${PORT}/api/system`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
