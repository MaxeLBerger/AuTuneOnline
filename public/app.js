// public/app.js

let audioContext;
let analyser;
let dataArray;
let bufferLength;

// File/UI Elements
const fileInput         = document.getElementById('fileInput');
const fileNameLabel     = document.getElementById('fileNameLabel');
const dropZone          = document.getElementById('dropZone');
const audioPlayer       = document.getElementById('audioPlayer');
const timelineRange     = document.getElementById('timelineRange');
const currentTimeLabel  = document.getElementById('currentTimeLabel');
const durationLabel     = document.getElementById('durationLabel');
const togglePlayBtn     = document.getElementById('togglePlayBtn');

// Settings
const bpmDisplay        = document.getElementById('bpmDisplay');
const animationSelect   = document.getElementById('animationSelect');
const colorSelect       = document.getElementById('colorSelect');
const sensitivityRange  = document.getElementById('sensitivityRange');
const sizeRange         = document.getElementById('sizeRange');

// Canvas
const canvas            = document.getElementById('visualizerCanvas');
const canvasCtx         = canvas.getContext('2d');

// State
let currentAnimation = 'bars';
let currentColorMode = 'rainbow';
let sensitivity      = 2;   // [1..5]
let animationSize    = 1;   // [0.5..4]
let animationId;
let isSeeking        = false;
let songLoaded       = false;
let isPlaying        = false; // Für den Toggle-Button
let timeUpdateBound  = false; // verhindert doppelte Listener

// Performance- / Qualitätssteuerung
let frameCounter = 0;
let lastFpsStamp = performance.now();
let currentFps = 0;
const TARGET_FPS = 55;
const quality = { skipFactor: 1, particleRate: 1 };

// Farb-Cache für Basisfarben je Modus
let colorCache = {};
function buildColorCache(total) {
  const modes = ['rainbow','warm','cool','happy','dark'];
  for (const m of modes) {
    if (!colorCache[m] || colorCache[m].length !== total) {
      colorCache[m] = new Array(total);
      for (let i = 0; i < total; i++) {
        colorCache[m][i] = computeColor(m, i, 0, total);
      }
    }
  }
}

// ========== DRAG & DROP ==========
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// ========== FILE INPUT ==========
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    handleFile(e.target.files[0]);
  }
});

// ========== TIMELINE ==========
timelineRange.addEventListener('mousedown', () => {
  isSeeking = true;
});
timelineRange.addEventListener('mouseup', () => {
  isSeeking = false;
  const newTime = parseFloat(timelineRange.value);
  audioPlayer.currentTime = newTime;
});
timelineRange.addEventListener('input', () => {
  if (isSeeking) {
    let newTime = parseFloat(timelineRange.value);
    currentTimeLabel.textContent = formatTime(newTime);
  }
});

// ========== PLAY / PAUSE BUTTON ==========
togglePlayBtn.addEventListener('click', () => {
  if (!songLoaded) {
    console.warn('Kein Song geladen, kann nicht abspielen/pausieren.');
    return;
  }
  if (audioPlayer.paused) {
    audioPlayer.play().then(() => {
      isPlaying = true;
      togglePlayBtn.textContent = 'Pause';
      console.log('Manuell Play geklickt');
    }).catch(err => {
      console.error('Play fehlgeschlagen:', err);
    });
  } else {
    // Pause
    audioPlayer.pause();
    isPlaying = false;
    togglePlayBtn.textContent = 'Play';
    console.log('Manuell Pause geklickt');
  }
});

// ========== SETTINGS ==========
animationSelect.addEventListener('change', (e) => {
  currentAnimation = e.target.value;
});
colorSelect.addEventListener('change', (e) => {
  currentColorMode = e.target.value;
  if (bufferLength) buildColorCache(bufferLength);
});
sensitivityRange.addEventListener('input', (e) => {
  sensitivity = parseFloat(e.target.value);
});
sizeRange.addEventListener('input', (e) => {
  animationSize = parseFloat(e.target.value);
});

// ========== HANDLE FILE ==========
async function handleFile(file) {
  if (!file) return;

  // Zeige Dateiname
  fileNameLabel.textContent = `Aktuelle Datei: ${file.name}`;

  // Falls noch ein AudioContext offen, schließen
  if (audioContext) {
    audioContext.close();
  }
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Alte Animation stoppen
  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  // ArrayBuffer einlesen
  const arrayBuffer = await file.arrayBuffer();

  // BPM ermitteln (Fehler abfangen)
  let bpm = 0;
  try {
    const audioBufferForBPM = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    bpm = getBPMFromAudioBuffer(audioBufferForBPM, audioContext.sampleRate);
    bpmDisplay.textContent = `BPM: ${bpm.toFixed(1)}`;
  } catch (err) {
    console.warn('BPM-Analyse fehlgeschlagen:', err);
    bpm = 0;
    bpmDisplay.textContent = `BPM: 0`;
  }

  // Blob-URL für <audio>
  const blob = new Blob([arrayBuffer], { type: file.type });
  const url = URL.createObjectURL(blob);
  audioPlayer.src = url;
  audioPlayer.load();

  // Analyser
  const sourceNode = audioContext.createMediaElementSource(audioPlayer);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  // Stabilere Darstellung & weniger Flackern
  analyser.smoothingTimeConstant = 0.8;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;

  sourceNode.connect(analyser);
  analyser.connect(audioContext.destination);

  bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  buildColorCache(bufferLength);

  songLoaded = true;

  // Sobald Metadaten geladen -> Duration, Zeitupdates
  audioPlayer.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });

  // Sync UI mit Audio-Element
  audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    togglePlayBtn.textContent = 'Pause';
  });
  audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    togglePlayBtn.textContent = 'Play';
  });
  audioPlayer.addEventListener('ended', () => {
    isPlaying = false;
    togglePlayBtn.textContent = 'Play';
    timelineRange.value = '0';
    currentTimeLabel.textContent = formatTime(0);
  }, { once: true });

  // Autostart versuchen
  audioPlayer.play().then(() => {
    isPlaying = true;
    togglePlayBtn.textContent = 'Pause';
    console.log('Autoplay ok');
  }).catch(err => {
    console.warn('Autoplay blockiert oder fehlgeschlagen:', err);
    togglePlayBtn.textContent = 'Play';
  });

  // Animation starten
  animate(bpm);
}

function onLoadedMetadata() {
  if (audioPlayer.duration && audioPlayer.duration !== Infinity) {
    timelineRange.max = Math.floor(audioPlayer.duration);
    durationLabel.textContent = formatTime(audioPlayer.duration);
  } else {
    console.warn('Audio-Dauer konnte nicht ermittelt werden.');
  }
  if (timeUpdateBound) {
    audioPlayer.removeEventListener('timeupdate', onTimeUpdate);
  }
  audioPlayer.addEventListener('timeupdate', onTimeUpdate);
  timeUpdateBound = true;
}

function onTimeUpdate() {
  if (!isSeeking) {
    let current = audioPlayer.currentTime;
    timelineRange.value = Math.floor(current);
    currentTimeLabel.textContent = formatTime(current);
  }
}

// ========== BPM ==========
function getBPMFromAudioBuffer(audioBuffer, sampleRate) {
  const channelData = audioBuffer.getChannelData(0);
  return calcBPM(channelData, sampleRate);
}

function calcBPM(channelData, sampleRate) {
  const segmentSize = 1024;
  let energyArray = [];
  let offset = 0;

  while (offset < channelData.length) {
    let sum = 0;
    for (let i = 0; i < segmentSize && offset + i < channelData.length; i++) {
      sum += channelData[offset + i] ** 2;
    }
    let avg = Math.sqrt(sum / segmentSize);
    energyArray.push(avg);
    offset += segmentSize;
  }

  // Onsets
  let onsets = [];
  let localWindowSize = 43;
  for (let i = 0; i < energyArray.length; i++) {
    let start = Math.max(0, i - localWindowSize);
    let slice = energyArray.slice(start, i);
    let mean = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
    let threshold = mean * 1.5;
    if (energyArray[i] > threshold) {
      let timeInSec = (i * segmentSize) / sampleRate;
      onsets.push(timeInSec);
    }
  }

  if (onsets.length < 2) {
    return 0;
  }
  const intervals = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return 60 / avgInterval;
}

// ========== ANIMATION LOOP ==========
function animate(bpm) {
  animationId = requestAnimationFrame(() => animate(bpm));

  if (!analyser) return; 

  analyser.getByteFrequencyData(dataArray);
  // FPS-Messung & dynamische Qualitätsanpassung
  frameCounter++;
  const now = performance.now();
  if (now - lastFpsStamp >= 1000) {
    currentFps = (frameCounter * 1000) / (now - lastFpsStamp);
    frameCounter = 0;
    lastFpsStamp = now;
    if (currentFps < TARGET_FPS - 8 && quality.skipFactor < 4) {
      quality.skipFactor++;
      quality.particleRate = Math.max(0.5, quality.particleRate - 0.15);
    } else if (currentFps > TARGET_FPS + 5 && quality.skipFactor > 1) {
      quality.skipFactor--;
      quality.particleRate = Math.min(1.5, quality.particleRate + 0.15);
    }
  }
  resizeCanvasToDisplaySize(canvas);
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  switch (currentAnimation) {
    case 'particles':
      drawParticlesScene(dataArray, bpm);
      break;
    case 'circles':
      drawCirclesScene(dataArray, bpm);
      break;
    case 'wave':
      drawWaveScene(dataArray, bpm);
      break;
    case 'spiral':
      drawSpiralScene(dataArray, bpm);
      break;
    case 'grid':
      drawGridScene(dataArray, bpm);
      break;
    case 'radialLines':
      drawRadialLinesScene(dataArray, bpm);
      break;
    case 'bars':
    default:
      drawBarsScene(dataArray, bpm);
      break;
  }
}

// ========== ANIMATIONS ==========
function drawBarsScene(data, bpm) {
  const barWidth = (canvas.width / bufferLength) * 2.0;
  let posX = 0;
  for (let i = 0; i < bufferLength; i += quality.skipFactor) {
    // Sensitivity * animationSize
    const barHeight = data[i] * animationSize * sensitivity;
    const [r, g, b] = getColor(i, barHeight, bufferLength);
    canvasCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    canvasCtx.fillRect(posX, canvas.height - barHeight, barWidth, barHeight);
    posX += barWidth + 1;
  }
}

// Partikel Pool (Object Pooling)
const MAX_POOL = 1200;
const particlePool = Array.from({ length: MAX_POOL }, () => ({ x:0,y:0,size:0,velocity:0,alpha:0,active:false,index:0 }));
function spawnParticle(x,y,size,velocity) {
  for (let i=0;i<particlePool.length;i++) {
    const p = particlePool[i];
    if (!p.active) { p.x=x; p.y=y; p.size=size; p.velocity=velocity; p.alpha=1; p.active=true; p.index=i; return p; }
  }
  return null;
}

function drawParticlesScene(data, bpm) {
  let bassValue = getBassValue(data);
  // CreationChance -> vergrößert mit Sensitivity
  let creationChance = (0.025 * sensitivity + bpm / 5000) * quality.particleRate;
  if (Math.random() < creationChance) {
    let x = Math.random() * canvas.width;
    let y = canvas.height - 10;
    let size = (Math.random() * 8 + 4) * animationSize * sensitivity * 0.5;
    let velocity = (1 + bassValue / 50) * sensitivity;
    spawnParticle(x, y, size, velocity);
  }
  for (const p of particlePool) {
    if (!p.active) continue;
    p.y -= p.velocity;
    p.alpha -= 0.01;
    const [r, g, b] = getColor(p.index, p.y, 1000);
    canvasCtx.save();
    canvasCtx.globalAlpha = p.alpha;
    canvasCtx.fillStyle = `rgb(${r},${g},${b})`;
    canvasCtx.beginPath();
    canvasCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    canvasCtx.fill();
    canvasCtx.restore();
    if (p.alpha <= 0 || p.y < -50) p.active = false;
  }
}

function drawCirclesScene(data, bpm) {
  let centerX = canvas.width / 2;
  let centerY = canvas.height / 2;
  for (let i = 0; i < bufferLength; i += 8 * quality.skipFactor) {
    let value = data[i] * animationSize * sensitivity;
    let [r, g, b] = getColor(i, value, bufferLength);
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, value, 0, 2 * Math.PI);
    canvasCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
  }
}

function drawWaveScene(data, bpm) {
  canvasCtx.beginPath();
  for (let i = 0; i < bufferLength; i += quality.skipFactor) {
    let x = (i / (bufferLength - 1)) * canvas.width;
    let y = canvas.height / 2 - data[i] * 0.8 * animationSize * sensitivity;
    if (i === 0) canvasCtx.moveTo(x, y);
    else canvasCtx.lineTo(x, y);
  }
  canvasCtx.strokeStyle = 'rgb(255, 255, 255)';
  canvasCtx.lineWidth = 2;
  canvasCtx.stroke();
}

function drawSpiralScene(data, bpm) {
  let centerX = canvas.width / 2;
  let centerY = canvas.height / 2;

  // Bisschen aufteilen für mehr Dynamik
  let angleStep = (2 * Math.PI) / bufferLength;
  let maxRadius = Math.min(centerX, centerY);
  // Normaler Radius pro Index
  let baseRadiusStep = (maxRadius / bufferLength) * animationSize;

  canvasCtx.beginPath();

  for (let i = 0; i < bufferLength; i += quality.skipFactor) {
    let freqVal = data[i] * 0.5 * sensitivity;
    // Spiral-Radius + Frequenz-Effekt
    let radius = i * baseRadiusStep + freqVal * 0.3;

    // BPM-Einfluss auf die Rotation
    let angle = i * angleStep + (bpm / 180) * i * 0.01;
    let x = centerX + radius * Math.cos(angle);
    let y = centerY + radius * Math.sin(angle);

    if (i === 0) {
      canvasCtx.moveTo(x, y);
    } else {
      canvasCtx.lineTo(x, y);
    }
    let [r, g, b] = getColor(i, freqVal, bufferLength);
    canvasCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    canvasCtx.lineWidth = 2;
  }
  canvasCtx.stroke();
}

function drawGridScene(data, bpm) {
  // Wir machen das Grid etwas feiner
  // Bisher: sqrt(bufferLength) => 16 bei 256 => 16x16 Raster
  // => Wir erhöhen es, z.B. * sensitivity
  let baseCells = Math.floor(Math.sqrt(bufferLength));
  let cellsPerRow = baseCells + Math.floor(sensitivity * 4); // je höher sensitivity, desto mehr Zellen

  let cellWidth = canvas.width / cellsPerRow;
  let cellHeight = canvas.height / cellsPerRow;

  let index = 0;
  for (let row = 0; row < cellsPerRow; row++) {
    for (let col = 0; col < cellsPerRow; col++) {
      if (index >= data.length) index = 0; 
      // Wir loopen durch data (kann man anpassen)

      let val = data[index] * animationSize * sensitivity;
      let [r, g, b] = getColor(index, val, bufferLength);
      let alpha = Math.min(1, val / 255 + 0.1);

      canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      canvasCtx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);

      index++;
    }
  }
}

function drawRadialLinesScene(data, bpm) {
  let centerX = canvas.width / 2;
  let centerY = canvas.height / 2;
  let angleStep = (2 * Math.PI) / bufferLength;

  for (let i = 0; i < bufferLength; i += 2 * quality.skipFactor) {
    let val = data[i] * animationSize * sensitivity;
    let angle = i * angleStep;

    let [r, g, b] = getColor(i, val, bufferLength);
    canvasCtx.beginPath();
    canvasCtx.moveTo(centerX, centerY);
    let length = val * 1.5;
    let x2 = centerX + length * Math.cos(angle);
    let y2 = centerY + length * Math.sin(angle);
    canvasCtx.lineTo(x2, y2);
    canvasCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
  }
}

// ========== HELPER ==========
function resizeCanvasToDisplaySize(canvas) {
  const width = canvas.clientWidth | 0;
  const height = canvas.clientHeight | 0;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const displayWidth = Math.floor(width * dpr);
  const displayHeight = Math.floor(height * dpr);
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function getBassValue(data) {
  let bassValue = 0;
  for (let i = 0; i < 5 && i < data.length; i++) {
    bassValue += data[i];
  }
  return bassValue / 5;
}

function getColor(index, amplitude, total) {
  if (!colorCache[currentColorMode] || colorCache[currentColorMode].length !== total) {
    buildColorCache(total);
  }
  const base = colorCache[currentColorMode][index];
  const brighten = Math.min(40, amplitude / 6);
  return [
    Math.min(255, base[0] + brighten),
    Math.min(255, base[1] + brighten / 2),
    Math.min(255, base[2] + brighten / 3)
  ];
}

function computeColor(mode, i, val, total) {
  switch (mode) {
    case 'warm': return warmColor(i, val, total);
    case 'cool': return coolColor(i, val, total);
    case 'happy': return happyColor(i, val, total);
    case 'dark': return darkColor(i, val, total);
    case 'rainbow':
    default: return rainbowColor(i, val, total);
  }
}

// Farbmodi ...
function rainbowColor(i, val, total) {
  let hue = (360 * i) / total;
  return hslToRgb(hue, 100, 50 + val / 5);
}
function warmColor(i, val, total) {
  let hue = 30 + (30 * i) / total;
  return hslToRgb(hue, 100, 50 + val / 10);
}
function coolColor(i, val, total) {
  let hue = 180 + (60 * i) / total;
  return hslToRgb(hue, 80, 40 + val / 12);
}
function happyColor(i, val, total) {
  let hue = (i * 15) % 360;
  return hslToRgb(hue, 80, 60 + (val / 255) * 10);
}
function darkColor(i, val, total) {
  let hue = (i * 5 + val) % 360;
  return hslToRgb(hue, 60, 20);
}

// HSL->RGB ...
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2*l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ];
}

// Responsives Canvas & Touch Unterstützung
window.addEventListener('resize', () => {
  if (canvas) resizeCanvasToDisplaySize(canvas);
});

timelineRange.addEventListener('touchstart', () => { isSeeking = true; }, { passive: true });
timelineRange.addEventListener('touchend', () => {
  isSeeking = false;
  const newTime = parseFloat(timelineRange.value);
  audioPlayer.currentTime = newTime;
}, { passive: true });

function formatTime(seconds) {
  seconds = Math.floor(seconds);
  let hrs = Math.floor(seconds / 3600);
  let mins = Math.floor((seconds % 3600) / 60);
  let secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
}
