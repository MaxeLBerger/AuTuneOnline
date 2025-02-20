// src/bpmDetector.js

const MusicTempo = require('music-tempo');

/**
 * Primitive Peak-Detection:
 * 1. Wir ziehen ein vereinfachtes Energie-Level-Array aus dem Audiosignal
 * 2. Threshold-basiert erkennen wir Onsets
 * 3. Onsets -> music-tempo => BPM
 *
 * @param {Float32Array} channelData Float32 PCM-Samples einer Spur.
 * @param {number} sampleRate Abtastrate (z.B. 44100)
 * @returns {number} BPM
 */
function detectBPM(channelData, sampleRate) {
  // 1) Parameter
  const segmentSize = 1024; // sample-block
  let energyArray = [];
  let offset = 0;

  // 2) Energie pro Segment berechnen
  while (offset < channelData.length) {
    let sum = 0;
    for (let i = 0; i < segmentSize && offset + i < channelData.length; i++) {
      sum += channelData[offset + i] ** 2;
    }
    let avg = Math.sqrt(sum / segmentSize);
    energyArray.push(avg);
    offset += segmentSize;
  }

  // 3) Onset-Detection: Wir vergleichen Energie mit einem dynamischen Mittelwert.
  let onsets = [];
  let localWindowSize = 43; // ~ 43 segments ~ 1 Sek. (abh. von segmentSize & sampleRate)
  for (let i = 0; i < energyArray.length; i++) {
    let start = Math.max(0, i - localWindowSize);
    let end = i;
    let windowSlice = energyArray.slice(start, end);
    let mean = windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length || 0;
    let threshold = mean * 1.5; // Schwellwert festlegen
    if (energyArray[i] > threshold) {
      // Zeit berechnen (Sekunden)
      let timeInSec = (i * segmentSize) / sampleRate;
      onsets.push(timeInSec);
    }
  }

  // 4) MusicTempo drüber laufen lassen
  if (onsets.length < 2) {
    // Wenige Onsets => schwer BPM zu ermitteln
    return 0;
  }
  let mt = new MusicTempo(onsets);
  return mt.tempo; // gerundete BPM
}

module.exports = { detectBPM };
