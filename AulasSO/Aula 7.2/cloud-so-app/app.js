const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { monitorEventLoopDelay, performance } = require('perf_hooks');
const dns = require('dns');
const v8 = require('v8');

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const startedAt = Date.now();

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

const httpStats = {
  requests: 0,
  responses2xx: 0,
  responses4xx: 0,
  responses5xx: 0,
  bytesSent: 0
};

app.use((req, res, next) => {
  httpStats.requests += 1;
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) httpStats.responses2xx += 1;
    if (res.statusCode >= 400 && res.statusCode < 500) httpStats.responses4xx += 1;
    if (res.statusCode >= 500) httpStats.responses5xx += 1;
    const contentLength = Number(res.getHeader('content-length')) || 0;
    httpStats.bytesSent += contentLength;
  });
  next();
});

const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
eventLoopHistogram.enable();

let previousCpuSnapshot = readCpuSnapshot();
let previousNetworkSnapshot = { timestamp: Date.now(), counters: {} };
let previousProcessCpu = process.cpuUsage();
let previousProcessCpuTime = process.hrtime.bigint();
const cache = new Map();

function bytesToObject(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  if (value === 0) return { bytes: 0, formatted: '0 B' };
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const decimals = index >= 3 ? 2 : 1;
  return {
    bytes: value,
    formatted: `${(value / (1024 ** index)).toFixed(decimals)} ${units[index]}`
  };
}

function secondsToParts(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return {
    seconds,
    days,
    hours,
    minutes,
    secs,
    formatted: `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
  };
}

function parseJsonMaybe(value, fallback = null) {
  try {
    if (!value || !String(value).trim()) return fallback;
    return JSON.parse(String(value).trim());
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function safeReadFile(filePath, fallback = null) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return fallback;
  }
}

async function safeExecFile(command, args = [], timeout = 2500) {
  try {
    const { stdout = '', stderr = '' } = await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });
    return { ok: true, stdout: String(stdout).trim(), stderr: String(stderr).trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || error.message || '').trim()
    };
  }
}

async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry?.value !== undefined && now - entry.updatedAt < ttlMs) return entry.value;
  if (entry?.promise) return entry.promise;

  const promise = Promise.resolve()
    .then(loader)
    .then(value => {
      cache.set(key, { value, updatedAt: Date.now() });
      return value;
    })
    .catch(error => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { ...(entry || {}), promise, updatedAt: entry?.updatedAt || 0 });
  return promise;
}

function readCpuSnapshot() {
  return os.cpus().map(cpu => {
    const times = { ...cpu.times };
    const total = Object.values(times).reduce((sum, value) => sum + value, 0);
    return { times, total };
  });
}

function calculateCpuUsage() {
  const current = readCpuSnapshot();
  const aggregateDiff = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0, total: 0 };

  const perCore = current.map((cpu, index) => {
    const previous = previousCpuSnapshot[index] || cpu;
    const totalDiff = cpu.total - previous.total;
    const diff = {};
    for (const key of ['user', 'nice', 'sys', 'idle', 'irq']) {
      diff[key] = (cpu.times[key] || 0) - (previous.times[key] || 0);
      aggregateDiff[key] += Math.max(0, diff[key]);
    }
    aggregateDiff.total += Math.max(0, totalDiff);

    if (totalDiff <= 0) {
      return { index, usagePercent: 0, speedMHz: os.cpus()[index]?.speed || 0 };
    }

    const idleDiff = Math.max(0, diff.idle || 0);
    return {
      index,
      usagePercent: Math.max(0, Math.min(100, Number(((1 - idleDiff / totalDiff) * 100).toFixed(1)))),
      speedMHz: os.cpus()[index]?.speed || 0
    };
  });

  previousCpuSnapshot = current;
  const total = perCore.length
    ? Number((perCore.reduce((sum, item) => sum + item.usagePercent, 0) / perCore.length).toFixed(1))
    : 0;

  const pct = key => aggregateDiff.total > 0
    ? Number(((aggregateDiff[key] / aggregateDiff.total) * 100).toFixed(1))
    : 0;

  return {
    total,
    perCore,
    breakdown: {
      userPercent: pct('user'),
      systemPercent: pct('sys'),
      nicePercent: pct('nice'),
      idlePercent: pct('idle'),
      irqPercent: pct('irq')
    }
  };
}

function getStaticCpuInfo() {
  const cpus = os.cpus();
  if (!cpus.length) {
    return { model: 'Não disponível', logicalCores: 0, averageSpeedMHz: 0, minSpeedMHz: 0, maxSpeedMHz: 0 };
  }
  const speeds = cpus.map(cpu => Number(cpu.speed) || 0);
  return {
    model: cpus[0].model.trim(),
    logicalCores: cpus.length,
    averageSpeedMHz: Math.round(speeds.reduce((sum, value) => sum + value, 0) / speeds.length),
    minSpeedMHz: Math.min(...speeds),
    maxSpeedMHz: Math.max(...speeds)
  };
}

function getRootDiskInfo() {
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

function getNetworkInterfaces() {
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
        cidr: address.cidr || null,
        scopeid: address.scopeid || null
      });
    }
  }

  return result;
}

function getLinuxMemoryDetails() {
  if (process.platform !== 'linux') return null;
  const raw = safeReadFile('/proc/meminfo');
  if (!raw) return null;

  const values = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([^:]+):\s+(\d+)\s+kB/i);
    if (match) values[match[1]] = Number(match[2]) * 1024;
  }

  const cached = (values.Cached || 0) + (values.SReclaimable || 0);
  return {
    available: bytesToObject(values.MemAvailable || 0),
    buffers: bytesToObject(values.Buffers || 0),
    cached: bytesToObject(cached),
    active: bytesToObject(values.Active || 0),
    inactive: bytesToObject(values.Inactive || 0),
    swapTotal: bytesToObject(values.SwapTotal || 0),
    swapFree: bytesToObject(values.SwapFree || 0),
    swapUsed: bytesToObject(Math.max(0, (values.SwapTotal || 0) - (values.SwapFree || 0)))
  };
}


async function getMemoryDetails() {
  if (process.platform === 'linux') return getLinuxMemoryDetails();

  if (process.platform === 'win32') {
    return cached('memoryDetails', 3000, async () => {
      const script = `Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue | Select-Object AvailableBytes,CacheBytes,CommittedBytes,CommitLimit,PoolPagedBytes,PoolNonpagedBytes | ConvertTo-Json -Compress`;
      const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 3500);
      if (!result.ok) return null;
      const item = parseJsonMaybe(result.stdout, null);
      if (!item) return null;
      const commitLimit = Number(item.CommitLimit) || 0;
      const committed = Number(item.CommittedBytes) || 0;
      return {
        available: bytesToObject(item.AvailableBytes || 0),
        buffers: bytesToObject((Number(item.PoolPagedBytes) || 0) + (Number(item.PoolNonpagedBytes) || 0)),
        cached: bytesToObject(item.CacheBytes || 0),
        active: bytesToObject(committed),
        inactive: bytesToObject(0),
        swapTotal: bytesToObject(commitLimit),
        swapFree: bytesToObject(Math.max(0, commitLimit - committed)),
        swapUsed: bytesToObject(committed)
      };
    });
  }

  if (process.platform === 'darwin') {
    return cached('memoryDetails', 3000, async () => {
      const result = await safeExecFile('vm_stat', [], 1800);
      if (!result.ok) return null;
      const pageSizeMatch = result.stdout.match(/page size of (\d+) bytes/i);
      const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
      const values = {};
      for (const line of result.stdout.split('\n')) {
        const m = line.match(/^([^:]+):\s+(\d+)\.?$/);
        if (m) values[m[1].trim()] = Number(m[2]) * pageSize;
      }
      return {
        available: bytesToObject((values['Pages free'] || 0) + (values['Pages inactive'] || 0)),
        buffers: bytesToObject(0),
        cached: bytesToObject(values['Pages purgeable'] || 0),
        active: bytesToObject(values['Pages active'] || 0),
        inactive: bytesToObject(values['Pages inactive'] || 0),
        swapTotal: bytesToObject(0),
        swapFree: bytesToObject(0),
        swapUsed: bytesToObject(0)
      };
    });
  }

  return null;
}

function getLinuxThermals() {
  if (process.platform !== 'linux') return [];
  const base = '/sys/class/thermal';
  try {
    return fs.readdirSync(base)
      .filter(name => name.startsWith('thermal_zone'))
      .map(name => {
        const dir = path.join(base, name);
        const rawTemp = Number(safeReadFile(path.join(dir, 'temp'), 'NaN'));
        const type = safeReadFile(path.join(dir, 'type'), name);
        if (!Number.isFinite(rawTemp)) return null;
        const celsius = rawTemp > 1000 ? rawTemp / 1000 : rawTemp;
        return { name: type || name, celsius: Number(celsius.toFixed(1)) };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getVolumes() {
  return cached('volumes', 8000, async () => {
    if (process.platform === 'win32') {
      const script = `Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,VolumeName,FileSystem,@{N='Size';E={[double]$_.Size}},@{N='FreeSpace';E={[double]$_.FreeSpace}} | ConvertTo-Json -Compress`;
      const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 4500);
      if (!result.ok) return [];
      return asArray(parseJsonMaybe(result.stdout, [])).map(item => {
        const total = Number(item.Size) || 0;
        const free = Number(item.FreeSpace) || 0;
        const used = Math.max(0, total - free);
        return {
          mount: item.DeviceID || '',
          label: item.VolumeName || '',
          filesystem: item.FileSystem || '',
          total: bytesToObject(total),
          used: bytesToObject(used),
          free: bytesToObject(free),
          usedPercent: total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0
        };
      });
    }

    if (process.platform === 'linux' || process.platform === 'darwin') {
      const args = process.platform === 'linux'
        ? ['-kP', '-x', 'tmpfs', '-x', 'devtmpfs']
        : ['-kP'];
      const result = await safeExecFile('df', args, 2500);
      if (!result.ok) return [];
      const lines = result.stdout.split('\n').slice(1).filter(Boolean);
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) return null;
        const filesystem = parts[0];
        const total = Number(parts[1]) * 1024;
        const used = Number(parts[2]) * 1024;
        const free = Number(parts[3]) * 1024;
        const mount = parts.slice(5).join(' ');
        return {
          mount,
          label: filesystem,
          filesystem,
          total: bytesToObject(total),
          used: bytesToObject(used),
          free: bytesToObject(free),
          usedPercent: total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0
        };
      }).filter(Boolean).slice(0, 20);
    }

    return [];
  });
}

async function getAdvancedHardware() {
  return cached('advancedHardware', 60_000, async () => {
    const fallback = {
      computer: {}, motherboard: {}, bios: {}, cpu: {}, gpus: [], memoryModules: [], physicalDisks: []
    };

    if (process.platform === 'win32') {
      const script = `
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { [pscustomobject]@{ Name=$_.Name; DriverVersion=$_.DriverVersion; AdapterRAM=[double]$_.AdapterRAM; VideoModeDescription=$_.VideoModeDescription; CurrentHorizontalResolution=$_.CurrentHorizontalResolution; CurrentVerticalResolution=$_.CurrentVerticalResolution; CurrentRefreshRate=$_.CurrentRefreshRate } })
$ram = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { [pscustomobject]@{ Manufacturer=$_.Manufacturer; PartNumber=($_.PartNumber -as [string]).Trim(); Capacity=[double]$_.Capacity; Speed=$_.Speed; ConfiguredClockSpeed=$_.ConfiguredClockSpeed; DeviceLocator=$_.DeviceLocator; FormFactor=$_.FormFactor } })
$disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object { [pscustomobject]@{ Model=$_.Model; InterfaceType=$_.InterfaceType; MediaType=$_.MediaType; Size=[double]$_.Size; Partitions=$_.Partitions; Status=$_.Status } })
[pscustomobject]@{
  Computer=[pscustomobject]@{ Manufacturer=$cs.Manufacturer; Model=$cs.Model; Domain=$cs.Domain; TotalPhysicalMemory=[double]$cs.TotalPhysicalMemory }
  Cpu=[pscustomobject]@{ Name=$cpu.Name; Manufacturer=$cpu.Manufacturer; NumberOfCores=$cpu.NumberOfCores; NumberOfLogicalProcessors=$cpu.NumberOfLogicalProcessors; MaxClockSpeed=$cpu.MaxClockSpeed; CurrentClockSpeed=$cpu.CurrentClockSpeed; L2CacheSize=$cpu.L2CacheSize; L3CacheSize=$cpu.L3CacheSize }
  Motherboard=[pscustomobject]@{ Manufacturer=$board.Manufacturer; Product=$board.Product; Version=$board.Version }
  Bios=[pscustomobject]@{ Manufacturer=$bios.Manufacturer; SMBIOSBIOSVersion=$bios.SMBIOSBIOSVersion; ReleaseDate=$bios.ReleaseDate }
  Gpus=$gpus
  MemoryModules=$ram
  PhysicalDisks=$disks
} | ConvertTo-Json -Depth 6 -Compress`;
      const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 7000);
      if (!result.ok) return fallback;
      const data = parseJsonMaybe(result.stdout, null);
      if (!data) return fallback;
      return {
        computer: {
          manufacturer: data.Computer?.Manufacturer || null,
          model: data.Computer?.Model || null,
          domain: data.Computer?.Domain || null,
          totalPhysicalMemory: bytesToObject(data.Computer?.TotalPhysicalMemory || 0)
        },
        cpu: {
          name: data.Cpu?.Name || null,
          manufacturer: data.Cpu?.Manufacturer || null,
          physicalCores: Number(data.Cpu?.NumberOfCores) || null,
          logicalProcessors: Number(data.Cpu?.NumberOfLogicalProcessors) || null,
          maxClockMHz: Number(data.Cpu?.MaxClockSpeed) || null,
          currentClockMHz: Number(data.Cpu?.CurrentClockSpeed) || null,
          l2Cache: bytesToObject((Number(data.Cpu?.L2CacheSize) || 0) * 1024),
          l3Cache: bytesToObject((Number(data.Cpu?.L3CacheSize) || 0) * 1024)
        },
        motherboard: {
          manufacturer: data.Motherboard?.Manufacturer || null,
          product: data.Motherboard?.Product || null,
          version: data.Motherboard?.Version || null
        },
        bios: {
          manufacturer: data.Bios?.Manufacturer || null,
          version: data.Bios?.SMBIOSBIOSVersion || null,
          releaseDate: data.Bios?.ReleaseDate || null
        },
        gpus: asArray(data.Gpus).map(item => ({
          name: item.Name || 'GPU',
          driverVersion: item.DriverVersion || null,
          adapterMemory: bytesToObject(item.AdapterRAM || 0),
          videoMode: item.VideoModeDescription || null,
          resolution: item.CurrentHorizontalResolution && item.CurrentVerticalResolution
            ? `${item.CurrentHorizontalResolution}x${item.CurrentVerticalResolution}`
            : null,
          refreshRateHz: Number(item.CurrentRefreshRate) || null
        })),
        memoryModules: asArray(data.MemoryModules).map((item, index) => ({
          slot: item.DeviceLocator || `Módulo ${index + 1}`,
          manufacturer: item.Manufacturer || null,
          partNumber: item.PartNumber || null,
          capacity: bytesToObject(item.Capacity || 0),
          speedMHz: Number(item.Speed) || null,
          configuredClockMHz: Number(item.ConfiguredClockSpeed) || null,
          formFactor: Number(item.FormFactor) || null
        })),
        physicalDisks: asArray(data.PhysicalDisks).map(item => ({
          model: item.Model || null,
          interfaceType: item.InterfaceType || null,
          mediaType: item.MediaType || null,
          size: bytesToObject(item.Size || 0),
          partitions: Number(item.Partitions) || 0,
          status: item.Status || null
        }))
      };
    }

    if (process.platform === 'linux') {
      const cpuInfoRaw = safeReadFile('/proc/cpuinfo', '');
      const physicalPairs = new Set();
      let currentPhysical = null;
      let currentCore = null;
      for (const line of cpuInfoRaw.split('\n')) {
        const physical = line.match(/^physical id\s*:\s*(.+)$/);
        const core = line.match(/^core id\s*:\s*(.+)$/);
        if (physical) currentPhysical = physical[1].trim();
        if (core) currentCore = core[1].trim();
        if (!line.trim() && currentPhysical != null && currentCore != null) {
          physicalPairs.add(`${currentPhysical}:${currentCore}`);
          currentPhysical = null;
          currentCore = null;
        }
      }

      const lsblk = await safeExecFile('lsblk', ['-J', '-b', '-o', 'NAME,MODEL,SIZE,TYPE,ROTA,TRAN,MOUNTPOINTS'], 2500);
      const block = lsblk.ok ? parseJsonMaybe(lsblk.stdout, {}) : {};
      const disks = asArray(block.blockdevices)
        .filter(item => item.type === 'disk')
        .map(item => ({
          model: item.model || item.name,
          interfaceType: item.tran || null,
          mediaType: item.rota === false || item.rota === 0 ? 'SSD' : item.rota === true || item.rota === 1 ? 'HDD' : null,
          size: bytesToObject(item.size || 0),
          partitions: asArray(item.children).length,
          status: 'Online'
        }));

      const lspci = await safeExecFile('lspci', [], 1800);
      const gpus = lspci.ok
        ? lspci.stdout.split('\n').filter(line => /VGA compatible controller|3D controller|Display controller/i.test(line)).map(line => ({ name: line.replace(/^.*?:\s*/, '').trim() }))
        : [];

      return {
        computer: {
          manufacturer: safeReadFile('/sys/devices/virtual/dmi/id/sys_vendor'),
          model: safeReadFile('/sys/devices/virtual/dmi/id/product_name'),
          domain: null,
          totalPhysicalMemory: bytesToObject(os.totalmem())
        },
        cpu: {
          name: os.cpus()[0]?.model || null,
          manufacturer: null,
          physicalCores: physicalPairs.size || null,
          logicalProcessors: os.cpus().length,
          maxClockMHz: null,
          currentClockMHz: null,
          l2Cache: bytesToObject(0),
          l3Cache: bytesToObject(0)
        },
        motherboard: {
          manufacturer: safeReadFile('/sys/devices/virtual/dmi/id/board_vendor'),
          product: safeReadFile('/sys/devices/virtual/dmi/id/board_name'),
          version: safeReadFile('/sys/devices/virtual/dmi/id/board_version')
        },
        bios: {
          manufacturer: safeReadFile('/sys/devices/virtual/dmi/id/bios_vendor'),
          version: safeReadFile('/sys/devices/virtual/dmi/id/bios_version'),
          releaseDate: safeReadFile('/sys/devices/virtual/dmi/id/bios_date')
        },
        gpus,
        memoryModules: [],
        physicalDisks: disks
      };
    }

    if (process.platform === 'darwin') {
      const result = await safeExecFile('system_profiler', ['SPHardwareDataType', 'SPDisplaysDataType', '-json'], 6500);
      const data = result.ok ? parseJsonMaybe(result.stdout, {}) : {};
      const hw = asArray(data.SPHardwareDataType)[0] || {};
      const displays = asArray(data.SPDisplaysDataType);
      return {
        computer: {
          manufacturer: 'Apple',
          model: hw.machine_name || hw.machine_model || null,
          domain: null,
          totalPhysicalMemory: bytesToObject(os.totalmem())
        },
        cpu: {
          name: os.cpus()[0]?.model || hw.chip_type || null,
          manufacturer: 'Apple',
          physicalCores: null,
          logicalProcessors: os.cpus().length,
          maxClockMHz: null,
          currentClockMHz: null,
          l2Cache: bytesToObject(0),
          l3Cache: bytesToObject(0)
        },
        motherboard: {},
        bios: {},
        gpus: displays.map(item => ({
          name: item.sppci_model || item._name || 'GPU',
          driverVersion: item.spdisplays_metal || null,
          adapterMemory: bytesToObject(0)
        })),
        memoryModules: [],
        physicalDisks: []
      };
    }

    return fallback;
  });
}

async function getGpuLive() {
  return cached('gpuLive', 1800, async () => {
    const query = 'name,driver_version,temperature.gpu,utilization.gpu,memory.total,memory.used,memory.free,fan.speed,power.draw,clocks.gr,clocks.mem';
    const result = await safeExecFile('nvidia-smi', [`--query-gpu=${query}`, '--format=csv,noheader,nounits'], 2000);
    if (!result.ok || !result.stdout) return [];

    return result.stdout.split('\n').filter(Boolean).map(line => {
      const parts = line.split(',').map(value => value.trim());
      const mibToBytes = value => Number(value) * 1024 * 1024;
      return {
        name: parts[0] || 'NVIDIA GPU',
        driverVersion: parts[1] || null,
        temperatureC: Number(parts[2]) || null,
        usagePercent: Number(parts[3]) || 0,
        memoryTotal: bytesToObject(mibToBytes(parts[4]) || 0),
        memoryUsed: bytesToObject(mibToBytes(parts[5]) || 0),
        memoryFree: bytesToObject(mibToBytes(parts[6]) || 0),
        memoryUsedPercent: Number(parts[4]) > 0 ? Number(((Number(parts[5]) / Number(parts[4])) * 100).toFixed(1)) : 0,
        fanPercent: Number(parts[7]) || null,
        powerWatts: Number(parts[8]) || null,
        graphicsClockMHz: Number(parts[9]) || null,
        memoryClockMHz: Number(parts[10]) || null
      };
    });
  });
}

async function getBatteryInfo() {
  return cached('battery', 5000, async () => {
    if (process.platform === 'win32') {
      const script = `Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object Name,BatteryStatus,EstimatedChargeRemaining,EstimatedRunTime,DesignVoltage | ConvertTo-Json -Compress`;
      const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 3500);
      if (!result.ok) return null;
      const item = asArray(parseJsonMaybe(result.stdout, []))[0];
      if (!item) return null;
      const statusMap = {
        1: 'Descarregando', 2: 'Conectado à energia', 3: 'Totalmente carregada', 4: 'Baixa', 5: 'Crítica',
        6: 'Carregando', 7: 'Carregando (alta)', 8: 'Carregando (baixa)', 9: 'Carregando (crítica)',
        10: 'Indefinido', 11: 'Parcialmente carregada'
      };
      return {
        present: true,
        name: item.Name || 'Bateria',
        percent: Number(item.EstimatedChargeRemaining),
        statusCode: Number(item.BatteryStatus),
        status: statusMap[Number(item.BatteryStatus)] || 'Desconhecido',
        estimatedMinutes: Number(item.EstimatedRunTime) < 71582788 ? Number(item.EstimatedRunTime) : null,
        designVoltageMv: Number(item.DesignVoltage) || null
      };
    }

    if (process.platform === 'linux') {
      const base = '/sys/class/power_supply';
      try {
        const batteryName = fs.readdirSync(base).find(name => /^BAT/i.test(name));
        if (!batteryName) return null;
        const dir = path.join(base, batteryName);
        const capacity = Number(safeReadFile(path.join(dir, 'capacity'), 'NaN'));
        const status = safeReadFile(path.join(dir, 'status'), 'Unknown');
        const manufacturer = safeReadFile(path.join(dir, 'manufacturer'));
        const model = safeReadFile(path.join(dir, 'model_name'));
        return {
          present: true,
          name: [manufacturer, model].filter(Boolean).join(' ') || batteryName,
          percent: Number.isFinite(capacity) ? capacity : null,
          status,
          estimatedMinutes: null,
          designVoltageMv: null
        };
      } catch {
        return null;
      }
    }

    if (process.platform === 'darwin') {
      const result = await safeExecFile('pmset', ['-g', 'batt'], 1500);
      if (!result.ok) return null;
      const match = result.stdout.match(/(\d+)%.*?;\s*([^;]+);(?:\s*(\d+):(\d+) remaining)?/i);
      if (!match) return null;
      return {
        present: true,
        name: 'Bateria',
        percent: Number(match[1]),
        status: match[2]?.trim() || null,
        estimatedMinutes: match[3] ? Number(match[3]) * 60 + Number(match[4]) : null,
        designVoltageMv: null
      };
    }

    return null;
  });
}

async function getThermalInfo() {
  return cached('thermals', 3000, async () => {
    const zones = getLinuxThermals();
    if (zones.length) return zones;

    if (process.platform === 'win32') {
      const script = `Get-CimInstance -Namespace root/wmi MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object InstanceName,CurrentTemperature | ConvertTo-Json -Compress`;
      const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 3000);
      if (!result.ok) return [];
      return asArray(parseJsonMaybe(result.stdout, [])).map((item, index) => {
        const kelvinTenths = Number(item.CurrentTemperature) || 0;
        const celsius = kelvinTenths > 0 ? (kelvinTenths / 10) - 273.15 : null;
        return celsius == null ? null : {
          name: item.InstanceName || `Zona térmica ${index + 1}`,
          celsius: Number(celsius.toFixed(1))
        };
      }).filter(Boolean);
    }

    return [];
  });
}

async function readNetworkCounters() {
  if (process.platform === 'linux') {
    const raw = safeReadFile('/proc/net/dev', '');
    const counters = {};
    for (const line of raw.split('\n').slice(2)) {
      if (!line.includes(':')) continue;
      const [namePart, valuesPart] = line.split(':');
      const name = namePart.trim();
      if (!name || name === 'lo') continue;
      const values = valuesPart.trim().split(/\s+/).map(Number);
      counters[name] = {
        receivedBytes: values[0] || 0,
        receivedPackets: values[1] || 0,
        receivedErrors: values[2] || 0,
        receivedDropped: values[3] || 0,
        sentBytes: values[8] || 0,
        sentPackets: values[9] || 0,
        sentErrors: values[10] || 0,
        sentDropped: values[11] || 0
      };
    }
    return counters;
  }

  if (process.platform === 'win32') {
    const script = `Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name,ReceivedBytes,SentBytes,ReceivedUnicastPackets,SentUnicastPackets,ReceivedPacketErrors,OutboundPacketErrors,ReceivedDiscardedPackets,OutboundDiscardedPackets | ConvertTo-Json -Compress`;
    const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 3500);
    if (!result.ok) return {};
    const counters = {};
    for (const item of asArray(parseJsonMaybe(result.stdout, []))) {
      if (!item?.Name) continue;
      counters[item.Name] = {
        receivedBytes: Number(item.ReceivedBytes) || 0,
        sentBytes: Number(item.SentBytes) || 0,
        receivedPackets: Number(item.ReceivedUnicastPackets) || 0,
        sentPackets: Number(item.SentUnicastPackets) || 0,
        receivedErrors: Number(item.ReceivedPacketErrors) || 0,
        sentErrors: Number(item.OutboundPacketErrors) || 0,
        receivedDropped: Number(item.ReceivedDiscardedPackets) || 0,
        sentDropped: Number(item.OutboundDiscardedPackets) || 0
      };
    }
    return counters;
  }

  return {};
}

async function getNetworkTraffic() {
  const now = Date.now();
  const counters = await cached('networkRawCounters', 1200, readNetworkCounters);
  const elapsedSeconds = Math.max(0.001, (now - previousNetworkSnapshot.timestamp) / 1000);
  const result = [];

  for (const [name, current] of Object.entries(counters)) {
    const previous = previousNetworkSnapshot.counters[name] || current;
    const receiveRate = Math.max(0, (current.receivedBytes - previous.receivedBytes) / elapsedSeconds);
    const sendRate = Math.max(0, (current.sentBytes - previous.sentBytes) / elapsedSeconds);
    result.push({
      name,
      received: bytesToObject(current.receivedBytes),
      sent: bytesToObject(current.sentBytes),
      receiveRate: bytesToObject(receiveRate),
      sendRate: bytesToObject(sendRate),
      receivedPackets: current.receivedPackets,
      sentPackets: current.sentPackets,
      errors: (current.receivedErrors || 0) + (current.sentErrors || 0),
      dropped: (current.receivedDropped || 0) + (current.sentDropped || 0)
    });
  }

  previousNetworkSnapshot = { timestamp: now, counters };
  return result.sort((a, b) => (b.received.bytes + b.sent.bytes) - (a.received.bytes + a.sent.bytes));
}

async function getProcesses() {
  return cached('processes', 2200, async () => {
    const logicalCores = Math.max(1, os.cpus().length);

    if (process.platform === 'win32') {
      const script = `
$all = @(Get-Process -ErrorAction SilentlyContinue)
$perf = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } | Sort-Object PercentProcessorTime -Descending | Select-Object -First 30 IDProcess,Name,PercentProcessorTime,WorkingSetPrivate)
[pscustomobject]@{ TotalCount=$all.Count; Items=$perf } | ConvertTo-Json -Depth 4 -Compress`;
      const result = await safeExecFile('powershell.exe', ['-NoProfile', '-Command', script], 5000);
      if (!result.ok) return { totalCount: null, items: [] };
      const data = parseJsonMaybe(result.stdout, {});
      return {
        totalCount: Number(data.TotalCount) || 0,
        items: asArray(data.Items).map(item => ({
          pid: Number(item.IDProcess) || 0,
          name: item.Name || 'processo',
          cpuPercent: Math.min(100, Number(((Number(item.PercentProcessorTime) || 0) / logicalCores).toFixed(1))),
          memory: bytesToObject(item.WorkingSetPrivate || 0),
          memoryPercent: os.totalmem() > 0 ? Number((((Number(item.WorkingSetPrivate) || 0) / os.totalmem()) * 100).toFixed(1)) : 0
        }))
      };
    }

    if (process.platform === 'linux' || process.platform === 'darwin') {
      const args = ['-eo', 'pid=,comm=,%cpu=,%mem=,rss=,etime=', '--sort=-%cpu'];
      const result = process.platform === 'darwin'
        ? await safeExecFile('ps', ['-Ao', 'pid=,comm=,%cpu=,%mem=,rss=,etime=', '-r'], 2500)
        : await safeExecFile('ps', args, 2500);
      if (!result.ok) return { totalCount: null, items: [] };
      const lines = result.stdout.split('\n').filter(Boolean);
      const items = lines.slice(0, 30).map(line => {
        const match = line.trim().match(/^(\d+)\s+(.*?)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        return {
          pid: Number(match[1]),
          name: match[2],
          cpuPercent: Number(match[3]),
          memoryPercent: Number(match[4]),
          memory: bytesToObject(Number(match[5]) * 1024),
          elapsed: match[6]
        };
      }).filter(Boolean);

      const countResult = await safeExecFile('sh', ['-lc', 'ps -e --no-headers 2>/dev/null | wc -l'], 1200);
      const totalCount = countResult.ok ? Number(countResult.stdout) || lines.length : lines.length;
      return { totalCount, items };
    }

    return { totalCount: null, items: [] };
  });
}

function getProcessCpuPercent() {
  const nowCpu = process.cpuUsage();
  const nowTime = process.hrtime.bigint();
  const userDiff = nowCpu.user - previousProcessCpu.user;
  const systemDiff = nowCpu.system - previousProcessCpu.system;
  const elapsedMicros = Number(nowTime - previousProcessCpuTime) / 1000;
  previousProcessCpu = nowCpu;
  previousProcessCpuTime = nowTime;

  if (elapsedMicros <= 0) return { totalPercent: 0, userPercent: 0, systemPercent: 0 };
  return {
    totalPercent: Number((((userDiff + systemDiff) / elapsedMicros) * 100).toFixed(2)),
    userPercent: Number(((userDiff / elapsedMicros) * 100).toFixed(2)),
    systemPercent: Number(((systemDiff / elapsedMicros) * 100).toFixed(2))
  };
}

function getEventLoopStats() {
  const nsToMs = value => Number.isFinite(value) ? Number((value / 1e6).toFixed(2)) : 0;
  return {
    minMs: nsToMs(eventLoopHistogram.min),
    maxMs: nsToMs(eventLoopHistogram.max),
    meanMs: nsToMs(eventLoopHistogram.mean),
    p50Ms: nsToMs(eventLoopHistogram.percentile(50)),
    p95Ms: nsToMs(eventLoopHistogram.percentile(95)),
    p99Ms: nsToMs(eventLoopHistogram.percentile(99))
  };
}

function getRuntimeInfo() {
  const processMemory = process.memoryUsage();
  const resourceUsage = process.resourceUsage();
  const processCpu = getProcessCpuPercent();

  return {
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    uvVersion: process.versions.uv,
    opensslVersion: process.versions.openssl,
    expressVersion: (() => {
      try { return require('express/package.json').version; } catch { return 'Não disponível'; }
    })(),
    pid: process.pid,
    ppid: process.ppid,
    title: process.title,
    execPath: process.execPath,
    cwd: process.cwd(),
    appUptime: secondsToParts(process.uptime()),
    startedAt: new Date(startedAt).toISOString(),
    cpu: processCpu,
    memory: {
      rss: bytesToObject(processMemory.rss),
      heapTotal: bytesToObject(processMemory.heapTotal),
      heapUsed: bytesToObject(processMemory.heapUsed),
      external: bytesToObject(processMemory.external),
      arrayBuffers: bytesToObject(processMemory.arrayBuffers || 0),
      availableMemory: typeof process.availableMemory === 'function' ? bytesToObject(process.availableMemory()) : null
    },
    resources: {
      userCpuMs: Number((resourceUsage.userCPUTime / 1000).toFixed(1)),
      systemCpuMs: Number((resourceUsage.systemCPUTime / 1000).toFixed(1)),
      maxRss: bytesToObject((resourceUsage.maxRSS || 0) * 1024),
      minorPageFault: resourceUsage.minorPageFault,
      majorPageFault: resourceUsage.majorPageFault,
      fsRead: resourceUsage.fsRead,
      fsWrite: resourceUsage.fsWrite,
      voluntaryContextSwitches: resourceUsage.voluntaryContextSwitches,
      involuntaryContextSwitches: resourceUsage.involuntaryContextSwitches
    },
    eventLoop: getEventLoopStats(),
    handles: {
      activeHandles: typeof process._getActiveHandles === 'function' ? process._getActiveHandles().length : null,
      activeRequests: typeof process._getActiveRequests === 'function' ? process._getActiveRequests().length : null
    },
    http: {
      ...httpStats,
      bytesSent: bytesToObject(httpStats.bytesSent)
    }
  };
}

async function getSystemData() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(0, totalMemory - freeMemory);
  const memoryUsedPercent = totalMemory > 0 ? Number(((usedMemory / totalMemory) * 100).toFixed(1)) : 0;
  const cpuUsage = calculateCpuUsage();
  const cpuInfo = getStaticCpuInfo();
  const user = (() => {
    try {
      const data = os.userInfo();
      return { username: data.username, homedir: data.homedir, shell: data.shell || null, uid: data.uid, gid: data.gid };
    } catch {
      return { username: 'Não disponível', homedir: os.homedir(), shell: null, uid: null, gid: null };
    }
  })();

  const [advancedHardware, volumes, gpuLive, battery, thermalZones, networkTraffic, processes, memoryDetails] = await Promise.all([
    getAdvancedHardware(),
    getVolumes(),
    getGpuLive(),
    getBatteryInfo(),
    getThermalInfo(),
    getNetworkTraffic(),
    getProcesses(),
    getMemoryDetails()
  ]);

  const gpuStaticByName = new Map((advancedHardware.gpus || []).map(item => [String(item.name || '').toLowerCase(), item]));
  const gpus = gpuLive.length
    ? gpuLive.map(item => ({ ...gpuStaticByName.get(String(item.name || '').toLowerCase()), ...item }))
    : advancedHardware.gpus || [];

  const loadAverage = os.loadavg().map(value => Number(value.toFixed(2)));
  const uptimeSeconds = os.uptime();

  return {
    generatedAt: new Date().toISOString(),
    status: 'online',
    scope: {
      note: 'As métricas de hardware do backend pertencem à máquina onde o Node.js está executando. No Render, elas representam o servidor/container do Render.',
      platform: process.platform
    },
    system: {
      hostname: os.hostname(),
      type: os.type(),
      platform: os.platform(),
      release: os.release(),
      version: typeof os.version === 'function' ? os.version() : 'Não disponível',
      architecture: os.arch(),
      machine: typeof os.machine === 'function' ? os.machine() : os.arch(),
      uptime: secondsToParts(uptimeSeconds),
      bootTime: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
      tempDirectory: os.tmpdir(),
      endianness: os.endianness(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      user,
      computer: advancedHardware.computer,
      motherboard: advancedHardware.motherboard,
      bios: advancedHardware.bios
    },
    cpu: {
      ...cpuInfo,
      physicalCores: advancedHardware.cpu?.physicalCores || null,
      manufacturer: advancedHardware.cpu?.manufacturer || null,
      maxClockMHz: advancedHardware.cpu?.maxClockMHz || cpuInfo.maxSpeedMHz || null,
      currentClockMHz: advancedHardware.cpu?.currentClockMHz || cpuInfo.averageSpeedMHz || null,
      l2Cache: advancedHardware.cpu?.l2Cache || bytesToObject(0),
      l3Cache: advancedHardware.cpu?.l3Cache || bytesToObject(0),
      usagePercent: cpuUsage.total,
      perCore: cpuUsage.perCore,
      breakdown: cpuUsage.breakdown,
      loadAverage
    },
    memory: {
      total: bytesToObject(totalMemory),
      used: bytesToObject(usedMemory),
      free: bytesToObject(freeMemory),
      usedPercent: memoryUsedPercent,
      details: memoryDetails,
      modules: advancedHardware.memoryModules || []
    },
    storage: {
      root: getRootDiskInfo(),
      volumes,
      physicalDisks: advancedHardware.physicalDisks || []
    },
    graphics: {
      gpus,
      thermals: thermalZones
    },
    battery,
    network: {
      interfaces: getNetworkInterfaces(),
      traffic: networkTraffic
    },
    processes,
    runtime: getRuntimeInfo()
  };
}

app.get('/api/system', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getSystemData());
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    service: 'cloud-so-app',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    node: process.version,
    platform: process.platform
  });
});


// -----------------------------------------------------------------------------
// Premium diagnostics API
// -----------------------------------------------------------------------------
// These helpers intentionally expose only operational/system information. They
// do not return environment variable values, tokens, credentials or secrets.

function readLinuxKeyValueFile(filePath) {
  const raw = safeReadFile(filePath);
  if (!raw) return null;
  const output = {};
  for (const line of raw.split('\n')) {
    let index = line.indexOf(':');
    let separatorLength = 1;
    if (index <= 0) {
      index = line.indexOf('=');
      separatorLength = 1;
    }
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + separatorLength).trim().replace(/^\"|\"$/g, '');
    output[key] = value;
  }
  return output;
}

function parsePressureStall(raw) {
  if (!raw) return null;
  const result = {};
  for (const line of String(raw).split('\n')) {
    const [kind, ...tokens] = line.trim().split(/\s+/);
    if (!kind) continue;
    const values = {};
    for (const token of tokens) {
      const [key, value] = token.split('=');
      if (!key || value == null) continue;
      const numeric = Number(value);
      values[key] = Number.isFinite(numeric) ? numeric : value;
    }
    result[kind] = values;
  }
  return Object.keys(result).length ? result : null;
}

function getLinuxPressure() {
  if (process.platform !== 'linux') return null;
  return {
    cpu: parsePressureStall(safeReadFile('/proc/pressure/cpu')),
    memory: parsePressureStall(safeReadFile('/proc/pressure/memory')),
    io: parsePressureStall(safeReadFile('/proc/pressure/io'))
  };
}

function getLinuxKernelLimits() {
  if (process.platform !== 'linux') return null;
  const numberOrNull = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  return {
    pidMax: numberOrNull(safeReadFile('/proc/sys/kernel/pid_max')),
    threadsMax: numberOrNull(safeReadFile('/proc/sys/kernel/threads-max')),
    fileMax: numberOrNull(safeReadFile('/proc/sys/fs/file-max')),
    somaxconn: numberOrNull(safeReadFile('/proc/sys/net/core/somaxconn')),
    swappiness: numberOrNull(safeReadFile('/proc/sys/vm/swappiness')),
    overcommitMemory: numberOrNull(safeReadFile('/proc/sys/vm/overcommit_memory')),
    hostname: safeReadFile('/proc/sys/kernel/hostname'),
    kernelVersion: safeReadFile('/proc/version')
  };
}

function getLinuxLoadDetails() {
  if (process.platform !== 'linux') return null;
  const raw = safeReadFile('/proc/loadavg');
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const running = (parts[3] || '').split('/');
  return {
    load1: Number(parts[0]) || 0,
    load5: Number(parts[1]) || 0,
    load15: Number(parts[2]) || 0,
    runnableTasks: Number(running[0]) || null,
    totalTasks: Number(running[1]) || null,
    lastPid: Number(parts[4]) || null
  };
}

function getV8Diagnostics() {
  const heap = v8.getHeapStatistics();
  const spaces = v8.getHeapSpaceStatistics().map(space => ({
    name: space.space_name,
    size: bytesToObject(space.space_size),
    used: bytesToObject(space.space_used_size),
    available: bytesToObject(space.space_available_size),
    physical: bytesToObject(space.physical_space_size),
    usedPercent: space.space_size > 0
      ? Number(((space.space_used_size / space.space_size) * 100).toFixed(1))
      : 0
  }));

  return {
    heap: {
      totalHeapSize: bytesToObject(heap.total_heap_size),
      totalHeapSizeExecutable: bytesToObject(heap.total_heap_size_executable),
      totalPhysicalSize: bytesToObject(heap.total_physical_size),
      totalAvailableSize: bytesToObject(heap.total_available_size),
      usedHeapSize: bytesToObject(heap.used_heap_size),
      heapSizeLimit: bytesToObject(heap.heap_size_limit),
      mallocedMemory: bytesToObject(heap.malloced_memory),
      peakMallocedMemory: bytesToObject(heap.peak_malloced_memory),
      externalMemory: bytesToObject(heap.external_memory),
      nativeContexts: heap.number_of_native_contexts,
      detachedContexts: heap.number_of_detached_contexts
    },
    spaces
  };
}

function getNodeDiagnostics() {
  const elu = typeof performance.eventLoopUtilization === 'function'
    ? performance.eventLoopUtilization()
    : null;

  return {
    release: process.release,
    versions: process.versions,
    features: process.features || {},
    architecture: process.arch,
    platform: process.platform,
    execArgv: process.execArgv,
    argv0: process.argv0,
    debugPort: process.debugPort,
    eventLoopUtilization: elu ? {
      idleMs: Number(elu.idle.toFixed(3)),
      activeMs: Number(elu.active.toFixed(3)),
      utilizationPercent: Number((elu.utilization * 100).toFixed(2))
    } : null,
    allowedNodeEnvironmentFlagsCount: process.allowedNodeEnvironmentFlags?.size || 0
  };
}

function getDnsDiagnostics() {
  let servers = [];
  try { servers = dns.getServers(); } catch { /* unavailable */ }
  let defaultResultOrder = null;
  try {
    defaultResultOrder = typeof dns.getDefaultResultOrder === 'function'
      ? dns.getDefaultResultOrder()
      : null;
  } catch { /* unavailable */ }
  return { servers, defaultResultOrder };
}

function detectHostingEnvironment() {
  // Boolean markers only; never expose environment variable values.
  return {
    render: Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID),
    vercel: Boolean(process.env.VERCEL),
    railway: Boolean(process.env.RAILWAY_ENVIRONMENT),
    heroku: Boolean(process.env.DYNO),
    githubActions: Boolean(process.env.GITHUB_ACTIONS),
    genericCi: Boolean(process.env.CI),
    nodeEnv: process.env.NODE_ENV || 'não definido',
    containerHint: fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')
  };
}

function getCapabilities() {
  return {
    statfs: typeof fs.statfsSync === 'function',
    availableParallelism: typeof os.availableParallelism === 'function',
    machine: typeof os.machine === 'function',
    osVersion: typeof os.version === 'function',
    processAvailableMemory: typeof process.availableMemory === 'function',
    eventLoopUtilization: typeof performance.eventLoopUtilization === 'function',
    resourceUsage: typeof process.resourceUsage === 'function',
    activeHandlesInspection: typeof process._getActiveHandles === 'function',
    activeRequestsInspection: typeof process._getActiveRequests === 'function'
  };
}

async function getPremiumDiagnostics() {
  const logical = Math.max(1, os.cpus().length);
  const load = os.loadavg();
  const parallelism = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : logical;

  return {
    generatedAt: new Date().toISOString(),
    dns: getDnsDiagnostics(),
    v8: getV8Diagnostics(),
    node: getNodeDiagnostics(),
    hosting: detectHostingEnvironment(),
    capabilities: getCapabilities(),
    scheduler: {
      logicalCpus: logical,
      availableParallelism: parallelism,
      loadAverage: {
        oneMinute: Number((load[0] || 0).toFixed(3)),
        fiveMinutes: Number((load[1] || 0).toFixed(3)),
        fifteenMinutes: Number((load[2] || 0).toFixed(3)),
        normalizedOneMinutePercent: Number((((load[0] || 0) / logical) * 100).toFixed(1)),
        normalizedFiveMinutesPercent: Number((((load[1] || 0) / logical) * 100).toFixed(1)),
        normalizedFifteenMinutesPercent: Number((((load[2] || 0) / logical) * 100).toFixed(1))
      }
    },
    linux: process.platform === 'linux' ? {
      pressure: getLinuxPressure(),
      limits: getLinuxKernelLimits(),
      load: getLinuxLoadDetails(),
      osRelease: readLinuxKeyValueFile('/etc/os-release')
    } : null
  };
}

app.get('/api/diagnostics', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getPremiumDiagnostics());
  } catch (error) {
    next(error);
  }
});

app.get('/api/export', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const [system, diagnostics] = await Promise.all([
      getSystemData(),
      getPremiumDiagnostics()
    ]);
    res.json({
      application: {
        name: 'cloud-so-app',
        version: '5.0.0',
        exportedAt: new Date().toISOString()
      },
      system,
      diagnostics
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/live', (req, res) => {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  let closed = false;
  let sending = false;
  let sequence = 0;

  const sendSystem = async () => {
    if (closed || sending) return;
    sending = true;
    try {
      const payload = await getSystemData();
      sequence += 1;
      res.write(`id: ${sequence}\n`);
      res.write('event: system\n');
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      res.write('event: warning\n');
      res.write(`data: ${JSON.stringify({ message: 'Falha temporária ao coletar métricas.' })}\n\n`);
    } finally {
      sending = false;
    }
  };

  const heartbeat = setInterval(() => {
    if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15000);

  const timer = setInterval(sendSystem, 2500);
  sendSystem();

  req.on('close', () => {
    closed = true;
    clearInterval(timer);
    clearInterval(heartbeat);
    res.end();
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada', path: req.originalUrl });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor', message: process.env.NODE_ENV === 'development' ? error.message : undefined });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Cloud SO App rodando em http://${HOST}:${PORT}`);
    console.log(`API do sistema: http://${HOST}:${PORT}/api/system`);
    console.log(`Health check: http://${HOST}:${PORT}/api/health`);
  });
}

module.exports = { app, getSystemData, getPremiumDiagnostics };
