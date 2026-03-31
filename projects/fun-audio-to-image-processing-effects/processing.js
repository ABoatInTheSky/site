const audioFileInput = document.getElementById("audio-file");
const imageFileInput = document.getElementById("image-file");
const yResSelect = document.getElementById("y-res-select");

const startRecordButton = document.getElementById("start-record-button");
const stopRecordButton = document.getElementById("stop-record-button");
const convertToImageButton = document.getElementById("convert-to-image-button");
const updatePreviewButton = document.getElementById("update-preview-button");
const buildAudioButton = document.getElementById("build-audio-button");
const downloadPngButton = document.getElementById("download-png-button");
const downloadAudioButton = document.getElementById("download-audio-button");

const recordingStatus = document.getElementById("recording-status");
const inputStatus = document.getElementById("input-status");
const effectsStatus = document.getElementById("effects-status");
const outputStatus = document.getElementById("output-status");

const spectrogramCanvas = document.getElementById("spectrogram-canvas");
const spectrogramContext = spectrogramCanvas.getContext("2d", { willReadFrequently: true });

const imageWidthLabel = document.getElementById("image-width");
const imageHeightLabel = document.getElementById("image-height");
const audioDurationLabel = document.getElementById("audio-duration");
const sampleRateLabel = document.getElementById("sample-rate");
const outputAudioPlayer = document.getElementById("output-audio-player");

const effectNoiseEnabled = document.getElementById("effect-noise-enabled");
const effectNoiseAmount = document.getElementById("effect-noise-amount");
const effectNoiseValue = document.getElementById("effect-noise-value");

const effectPitchEnabled = document.getElementById("effect-pitch-enabled");
const effectPitchAmount = document.getElementById("effect-pitch-amount");
const effectPitchValue = document.getElementById("effect-pitch-value");

const effectBrightnessEnabled = document.getElementById("effect-brightness-enabled");
const effectBrightnessAmount = document.getElementById("effect-brightness-amount");
const effectBrightnessValue = document.getElementById("effect-brightness-value");

const effectBlurEnabled = document.getElementById("effect-blur-enabled");
const effectBlurAmount = document.getElementById("effect-blur-amount");
const effectBlurValue = document.getElementById("effect-blur-value");

const effectClampEnabled = document.getElementById("effect-clamp-enabled");
const effectClampAmount = document.getElementById("effect-clamp-amount");
const effectClampValue = document.getElementById("effect-clamp-value");

const effectInvertEnabled = document.getElementById("effect-invert-enabled");
const effectInvertValue = document.getElementById("effect-invert-value");

const outputGainAmount = document.getElementById("output-gain-amount");
const outputGainValue = document.getElementById("output-gain-value");
const outputLimitAmount = document.getElementById("output-limit-amount");
const outputLimitValue = document.getElementById("output-limit-value");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const TARGET_OUTPUT_RMS = 0.55;
const WINDOW_RMS_SIZE = 1024;
const WINDOW_RMS_HOP = 256;
const WINDOW_GATE_RATIO = 0.35;
const PRE_MANUAL_HEADROOM_PEAK = 0.72;

const state = {
  selectedAudioBlob: null,
  selectedAudioBuffer: null,
  baseImage: null,
  processedImage: null,
  importedImageInUse: false,
  lastOutputBlob: null,
  lastOutputUrl: null,
  mediaRecorder: null,
  mediaStream: null,
  recordedChunks: [],
  fftSize: 4096,
  hopSize: 512,
  binCount: 2048,
  imageWidth: 0,
  imageHeight: 0
};

function setInputStatus(message) {
  inputStatus.textContent = message;
}

function setEffectsStatus(message) {
  effectsStatus.textContent = message;
}

function setOutputStatus(message) {
  outputStatus.textContent = message;
}

function formatSeconds(seconds) {
  return `${seconds.toFixed(2)}s`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getManualGainMultiplier() {
  const value = Number(outputGainAmount.value);
  return 1 + (value / 100);
}

function getLimiterSettings() {
  const amount = Number(outputLimitAmount.value) / 100;

  const spikeThreshold = lerp(0.18, 0.05, amount);
  const preClipDrive = lerp(1.4, 3.6, amount);
  const postClipDrive = lerp(1.2, 4.5, amount);

  return {
    amount,
    spikeThreshold,
    preClipDrive,
    postClipDrive
  };
}

function updateSliderLabels() {
  effectNoiseValue.textContent = `${effectNoiseAmount.value}%`;
  effectPitchValue.textContent = `${effectPitchAmount.value}%`;
  effectBrightnessValue.textContent = `${effectBrightnessAmount.value}%`;
  effectBlurValue.textContent = `${effectBlurAmount.value}%`;
  effectClampValue.textContent = `${effectClampAmount.value}%`;
  effectInvertValue.textContent = effectInvertEnabled.checked ? "On" : "Off";

  outputGainValue.textContent = `${outputGainAmount.value}%`;
  outputLimitValue.textContent = `${outputLimitAmount.value}%`;
}

function updateButtonStates() {
  const hasAudio = !!state.selectedAudioBuffer;
  const hasBaseImage = !!state.baseImage;
  const hasProcessedImage = !!state.processedImage;
  const hasOutputAudio = !!state.lastOutputBlob;
  const isRecording = !!state.mediaRecorder && state.mediaRecorder.state === "recording";

  convertToImageButton.disabled = !hasAudio || isRecording;
  imageFileInput.disabled = !hasBaseImage;
  updatePreviewButton.disabled = !hasBaseImage;
  downloadPngButton.disabled = !hasProcessedImage;
  buildAudioButton.disabled = !hasBaseImage;
  downloadAudioButton.disabled = !hasOutputAudio;

  startRecordButton.disabled = isRecording;
  stopRecordButton.disabled = !isRecording;
}

function create2DArray(width, height, fillValue = 0) {
  const array = new Array(height);
  for (let y = 0; y < height; y += 1) {
    array[y] = new Float32Array(width);
    if (fillValue !== 0) {
      array[y].fill(fillValue);
    }
  }
  return array;
}

function clone2D(channel) {
  return channel.map((row) => Float32Array.from(row));
}

function createRgbImage(width, height) {
  return {
    r: create2DArray(width, height),
    g: create2DArray(width, height),
    b: create2DArray(width, height)
  };
}

function cloneRgbImage(image) {
  return {
    r: clone2D(image.r),
    g: clone2D(image.g),
    b: clone2D(image.b)
  };
}

function getImageWidth(image) {
  return image.r[0].length;
}

function getImageHeight(image) {
  return image.r.length;
}

function createHannWindow(size) {
  const windowValues = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    windowValues[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return windowValues;
}

function reverseBits(value, bits) {
  let reversed = 0;
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }
  return reversed;
}

function fftComplex(real, imag, inverse = false) {
  const n = real.length;
  const levels = Math.log2(n);

  if (!Number.isInteger(levels)) {
    throw new Error("FFT size must be a power of 2.");
  }

  for (let i = 0; i < n; i += 1) {
    const j = reverseBits(i, levels);
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const angleStep = (inverse ? 2 : -2) * Math.PI / size;

    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < halfSize; j += 1) {
        const angle = j * angleStep;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const evenIndex = start + j;
        const oddIndex = evenIndex + halfSize;

        const treal = real[oddIndex] * cos - imag[oddIndex] * sin;
        const timag = real[oddIndex] * sin + imag[oddIndex] * cos;

        real[oddIndex] = real[evenIndex] - treal;
        imag[oddIndex] = imag[evenIndex] - timag;
        real[evenIndex] += treal;
        imag[evenIndex] += timag;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

function getMonoChannelData(audioBuffer) {
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  const channels = audioBuffer.numberOfChannels;

  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
      mono[sampleIndex] += channelData[sampleIndex];
    }
  }

  for (let sampleIndex = 0; sampleIndex < length; sampleIndex += 1) {
    mono[sampleIndex] /= channels;
  }

  return mono;
}

function configureResolutionSettings() {
  state.binCount = Number(yResSelect.value);
  state.fftSize = state.binCount * 2;
  state.hopSize = Math.max(64, state.fftSize >> 3);
}

function buildRgbSpectrogramFromAudio(audioBuffer) {
  const samples = getMonoChannelData(audioBuffer);
  const fftSize = state.fftSize;
  const hopSize = state.hopSize;
  const binCount = state.binCount;

  const window = createHannWindow(fftSize);
  const frameCount = Math.max(1, Math.floor((samples.length - fftSize) / hopSize) + 1);

  const realBins = create2DArray(frameCount, binCount);
  const imagBins = create2DArray(frameCount, binCount);

  let maxAbsComplex = 1e-8;
  let maxMagnitude = 1e-8;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * hopSize;
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let i = 0; i < fftSize; i += 1) {
      real[i] = (samples[start + i] || 0) * window[i];
    }

    fftComplex(real, imag, false);

    for (let binIndex = 0; binIndex < binCount; binIndex += 1) {
      const displayRow = binCount - 1 - binIndex;
      const r = real[binIndex];
      const g = imag[binIndex];
      const mag = Math.sqrt(r * r + g * g);

      realBins[displayRow][frameIndex] = r;
      imagBins[displayRow][frameIndex] = g;

      maxAbsComplex = Math.max(maxAbsComplex, Math.abs(r), Math.abs(g));
      maxMagnitude = Math.max(maxMagnitude, mag);
    }
  }

  const image = createRgbImage(frameCount, binCount);

  for (let y = 0; y < binCount; y += 1) {
    for (let x = 0; x < frameCount; x += 1) {
      const r = realBins[y][x] / maxAbsComplex;
      const g = imagBins[y][x] / maxAbsComplex;
      const mag = Math.sqrt(realBins[y][x] * realBins[y][x] + imagBins[y][x] * imagBins[y][x]) / maxMagnitude;

      image.r[y][x] = clamp(r * 0.5 + 0.5, 0, 1);
      image.g[y][x] = clamp(g * 0.5 + 0.5, 0, 1);
      image.b[y][x] = clamp(Math.pow(mag, 0.5), 0, 1);
    }
  }

  return image;
}

function drawRgbImageToCanvas(image) {
  const width = getImageWidth(image);
  const height = getImageHeight(image);

  spectrogramCanvas.width = width;
  spectrogramCanvas.height = height;

  const imageData = spectrogramContext.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = Math.round(clamp(image.r[y][x], 0, 1) * 255);
      data[index + 1] = Math.round(clamp(image.g[y][x], 0, 1) * 255);
      data[index + 2] = Math.round(clamp(image.b[y][x], 0, 1) * 255);
      data[index + 3] = 255;
    }
  }

  spectrogramContext.putImageData(imageData, 0, 0);
}

function rgbToMagnitudePhase(image) {
  const height = getImageHeight(image);
  const width = getImageWidth(image);

  const magnitude = create2DArray(width, height);
  const phase = create2DArray(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const real = (image.r[y][x] - 0.5) * 2;
      const imag = (image.g[y][x] - 0.5) * 2;

      magnitude[y][x] = clamp(Math.sqrt(real * real + imag * imag), 0, 1);
      phase[y][x] = Math.atan2(imag, real);
    }
  }

  return { magnitude, phase };
}

function magnitudePhaseToRgb(magnitude, phase) {
  const height = magnitude.length;
  const width = magnitude[0].length;

  const image = createRgbImage(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mag = clamp(magnitude[y][x], 0, 1);
      const ph = phase[y][x];

      const real = Math.cos(ph) * mag;
      const imag = Math.sin(ph) * mag;

      image.r[y][x] = clamp(real * 0.5 + 0.5, 0, 1);
      image.g[y][x] = clamp(imag * 0.5 + 0.5, 0, 1);
      image.b[y][x] = clamp(mag, 0, 1);
    }
  }

  return image;
}

function canonicalizeRgbImage(image) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);
  return magnitudePhaseToRgb(magnitude, phase);
}

function blurChannel(channel, radius) {
  const height = channel.length;
  const width = channel[0].length;

  if (radius <= 0) {
    return clone2D(channel);
  }

  const temp = create2DArray(width, height);
  const output = create2DArray(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;
        if (sampleX >= 0 && sampleX < width) {
          total += channel[y][sampleX];
          count += 1;
        }
      }

      temp[y][x] = total / count;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;
        if (sampleY >= 0 && sampleY < height) {
          total += temp[sampleY][x];
          count += 1;
        }
      }

      output[y][x] = total / count;
    }
  }

  return output;
}

function applyNoise(image, amountPercent) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);
  const outputMagnitude = clone2D(magnitude);

  const amount = amountPercent / 100;
  const height = outputMagnitude.length;
  const width = outputMagnitude[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const structuredAmount = amount * (0.35 + outputMagnitude[y][x] * 0.65);
      const delta = (Math.random() * 2 - 1) * structuredAmount;
      outputMagnitude[y][x] = clamp(outputMagnitude[y][x] + delta, 0, 1);
    }
  }

  return magnitudePhaseToRgb(outputMagnitude, phase);
}

function applyBrightness(image, amountPercent) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);
  const outputMagnitude = clone2D(magnitude);

  const amount = amountPercent / 100;
  const height = outputMagnitude.length;
  const width = outputMagnitude[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (amount >= 0) {
        const multiplier = 1 + amount * 2.5;
        outputMagnitude[y][x] = clamp(outputMagnitude[y][x] * multiplier, 0, 1);
      } else {
        const multiplier = Math.max(0, 1 + amount);
        outputMagnitude[y][x] = clamp(outputMagnitude[y][x] * multiplier, 0, 1);
      }
    }
  }

  return magnitudePhaseToRgb(outputMagnitude, phase);
}

function applyPitchShift(image, amountPercent) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);

  const height = magnitude.length;
  const width = magnitude[0].length;
  const shift = Math.round((amountPercent / 100) * (height * 0.22));

  const shiftedMagnitude = create2DArray(width, height);
  const shiftedPhase = create2DArray(width, height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = y - shift;

    for (let x = 0; x < width; x += 1) {
      if (sourceY >= 0 && sourceY < height) {
        const edgeFade = 1 - Math.min(1, Math.abs(shift) / Math.max(1, height * 0.5));
        shiftedMagnitude[y][x] = magnitude[sourceY][x] * Math.max(0.35, edgeFade);
        shiftedPhase[y][x] = phase[sourceY][x];
      } else {
        shiftedMagnitude[y][x] = 0;
        shiftedPhase[y][x] = 0;
      }
    }
  }

  return magnitudePhaseToRgb(shiftedMagnitude, shiftedPhase);
}

function applyBlur(image, amountPercent) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);
  const radius = Math.max(0, Math.round((amountPercent / 100) * 18));

  if (radius <= 0) {
    return magnitudePhaseToRgb(magnitude, phase);
  }

  const blurredMagnitude = blurChannel(magnitude, radius);
  const mix = amountPercent / 100;
  const mixedMagnitude = create2DArray(magnitude[0].length, magnitude.length);

  for (let y = 0; y < magnitude.length; y += 1) {
    for (let x = 0; x < magnitude[0].length; x += 1) {
      mixedMagnitude[y][x] = clamp(lerp(magnitude[y][x], blurredMagnitude[y][x], mix), 0, 1);
    }
  }

  return magnitudePhaseToRgb(mixedMagnitude, phase);
}

function applyClampEffect(image, amountPercent) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);
  const outputMagnitude = clone2D(magnitude);

  const threshold = amountPercent / 100;
  const height = outputMagnitude.length;
  const width = outputMagnitude[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      outputMagnitude[y][x] = outputMagnitude[y][x] <= threshold ? 0 : outputMagnitude[y][x];
    }
  }

  return magnitudePhaseToRgb(outputMagnitude, phase);
}

function applyInvert(image) {
  const { magnitude, phase } = rgbToMagnitudePhase(image);
  const outputMagnitude = clone2D(magnitude);

  const height = outputMagnitude.length;
  const width = outputMagnitude[0].length;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      outputMagnitude[y][x] = 1 - outputMagnitude[y][x];
    }
  }

  return magnitudePhaseToRgb(outputMagnitude, phase);
}

function applyAllEffectsToImage(baseImage) {
  let working = cloneRgbImage(baseImage);

  if (effectNoiseEnabled.checked && Number(effectNoiseAmount.value) > 0) {
    working = applyNoise(working, Number(effectNoiseAmount.value));
  }

  if (effectPitchEnabled.checked && Number(effectPitchAmount.value) !== 0) {
    working = applyPitchShift(working, Number(effectPitchAmount.value));
  }

  if (effectBrightnessEnabled.checked && Number(effectBrightnessAmount.value) !== 0) {
    working = applyBrightness(working, -Number(effectBrightnessAmount.value));
  }

  if (effectBlurEnabled.checked && Number(effectBlurAmount.value) > 0) {
    working = applyBlur(working, Number(effectBlurAmount.value));
  }

  if (effectClampEnabled.checked && Number(effectClampAmount.value) > 0) {
    working = applyClampEffect(working, Number(effectClampAmount.value));
  }

  if (effectInvertEnabled.checked) {
    working = applyInvert(working);
  }

  return working;
}

function applyAllEffects() {
  if (!state.baseImage) {
    return;
  }

  state.processedImage = applyAllEffectsToImage(state.baseImage);
  drawRgbImageToCanvas(state.processedImage);
}

async function decodeBlobToAudioBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer.slice(0));
}

function updateInfoLabels() {
  if (!state.selectedAudioBuffer || !state.baseImage) {
    imageWidthLabel.textContent = "-";
    imageHeightLabel.textContent = "-";
    audioDurationLabel.textContent = "-";
    sampleRateLabel.textContent = "-";
    return;
  }

  imageWidthLabel.textContent = `${getImageWidth(state.baseImage)}px`;
  imageHeightLabel.textContent = `${getImageHeight(state.baseImage)}px`;
  audioDurationLabel.textContent = formatSeconds(state.selectedAudioBuffer.duration);
  sampleRateLabel.textContent = `${state.selectedAudioBuffer.sampleRate} Hz`;
}

function clearOutputAudio() {
  outputAudioPlayer.pause();

  if (state.lastOutputUrl) {
    URL.revokeObjectURL(state.lastOutputUrl);
    state.lastOutputUrl = null;
  }

  outputAudioPlayer.removeAttribute("src");
  outputAudioPlayer.load();
  outputAudioPlayer.classList.add("hidden");
  state.lastOutputBlob = null;
  setOutputStatus("");
  updateButtonStates();
}

function resetImageStateForNewAudio() {
  state.baseImage = null;
  state.processedImage = null;
  state.importedImageInUse = false;
  imageFileInput.value = "";
  clearOutputAudio();
  updateInfoLabels();
  updateButtonStates();
}

function validatePowerOfTwoResolution() {
  const value = Number(yResSelect.value);
  if ((value & (value - 1)) !== 0) {
    throw new Error("Y resolution must be a power of 2.");
  }
}

audioFileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  try {
    setInputStatus("Loading audio file...");
    resetImageStateForNewAudio();
    state.selectedAudioBlob = file;
    state.selectedAudioBuffer = await decodeBlobToAudioBuffer(file);
    setInputStatus(`Loaded: ${file.name}`);
    updateInfoLabels();
    updateButtonStates();
  } catch (error) {
    console.error(error);
    setInputStatus("Could not read that audio file.");
  }
});

yResSelect.addEventListener("change", () => {
  if (state.baseImage) {
    setInputStatus("Y resolution changed. Re-convert the audio to use the new resolution.");
    state.baseImage = null;
    state.processedImage = null;
    state.importedImageInUse = false;
    imageFileInput.value = "";
    clearOutputAudio();
    updateInfoLabels();
    updateButtonStates();
  }
});

startRecordButton.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      recordingStatus.textContent = "Recording not supported here.";
      return;
    }

    resetImageStateForNewAudio();

    state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(state.mediaStream);

    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    };

    state.mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(state.recordedChunks, { type: state.mediaRecorder.mimeType || "audio/webm" });
        state.selectedAudioBlob = blob;
        state.selectedAudioBuffer = await decodeBlobToAudioBuffer(blob);
        setInputStatus("Recording ready.");
        updateInfoLabels();
      } catch (error) {
        console.error(error);
        setInputStatus("Could not decode recorded audio.");
      }

      if (state.mediaStream) {
        for (const track of state.mediaStream.getTracks()) {
          track.stop();
        }
      }

      state.mediaStream = null;
      state.mediaRecorder = null;
      recordingStatus.textContent = "Not recording";
      updateButtonStates();
    };

    state.mediaRecorder.start();
    recordingStatus.textContent = "Recording...";
    setInputStatus("Recording microphone audio...");
    updateButtonStates();
  } catch (error) {
    console.error(error);
    setInputStatus("Microphone access failed.");
  }
});

stopRecordButton.addEventListener("click", () => {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
});

convertToImageButton.addEventListener("click", async () => {
  if (!state.selectedAudioBuffer) {
    setInputStatus("Load or record audio first.");
    return;
  }

  try {
    validatePowerOfTwoResolution();
    configureResolutionSettings();

    setInputStatus(`Converting audio to RGB image at ${state.binCount} Y resolution...`);
    clearOutputAudio();

    const generatedImage = buildRgbSpectrogramFromAudio(state.selectedAudioBuffer);
    state.baseImage = canonicalizeRgbImage(generatedImage);
    state.processedImage = cloneRgbImage(state.baseImage);
    state.importedImageInUse = false;

    state.imageWidth = getImageWidth(state.baseImage);
    state.imageHeight = getImageHeight(state.baseImage);

    drawRgbImageToCanvas(state.processedImage);
    updateInfoLabels();

    setInputStatus("Audio converted to RGB image.");
    setEffectsStatus("Ready for effects. Update Preview is optional.");
    updateButtonStates();
  } catch (error) {
    console.error(error);
    setInputStatus("Failed to convert audio to image.");
  }
});

async function loadImageFromFile(file) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = imageUrl;

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    return image;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function validateAndConvertImportedImage(image) {
  if (!state.baseImage) {
    throw new Error("Convert audio to image first so the required image format is known.");
  }

  const requiredWidth = getImageWidth(state.baseImage);
  const requiredHeight = getImageHeight(state.baseImage);

  if (image.width !== requiredWidth || image.height !== requiredHeight) {
    throw new Error(
      `Wrong image size.\nExpected ${requiredWidth}x${requiredHeight}, got ${image.width}x${image.height}.`
    );
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = image.width;
  tempCanvas.height = image.height;
  const tempContext = tempCanvas.getContext("2d", { willReadFrequently: true });

  tempContext.drawImage(image, 0, 0);
  const imageData = tempContext.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  const rgbImage = createRgbImage(image.width, image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (a !== 255) {
        throw new Error("Image must not use transparency.");
      }

      rgbImage.r[y][x] = r / 255;
      rgbImage.g[y][x] = g / 255;
      rgbImage.b[y][x] = b / 255;
    }
  }

  return canonicalizeRgbImage(rgbImage);
}

imageFileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  try {
    setEffectsStatus("Importing image...");
    clearOutputAudio();

    const image = await loadImageFromFile(file);
    const importedImage = validateAndConvertImportedImage(image);

    state.baseImage = importedImage;
    state.processedImage = cloneRgbImage(importedImage);
    state.importedImageInUse = true;

    drawRgbImageToCanvas(state.processedImage);
    setEffectsStatus("Imported image accepted and loaded.");
    updateButtonStates();
  } catch (error) {
    console.error(error);
    imageFileInput.value = "";
    setEffectsStatus(`Image import failed:\n${error.message}`);
  }
});

function hookEffectControl(inputElement, checkboxElement) {
  inputElement.addEventListener("input", () => {
    updateSliderLabels();
    if (state.baseImage) {
      setEffectsStatus("Settings changed.");
    }
  });

  inputElement.addEventListener("change", () => {
    updateSliderLabels();
    if (state.baseImage) {
      setEffectsStatus("Settings changed.");
    }
  });

  checkboxElement.addEventListener("change", () => {
    updateSliderLabels();
    if (state.baseImage) {
      setEffectsStatus("Settings changed.");
    }
  });
}

function hookOutputControl(inputElement) {
  inputElement.addEventListener("input", () => {
    updateSliderLabels();
    if (state.baseImage) {
      setOutputStatus("Output settings changed.");
    }
  });

  inputElement.addEventListener("change", () => {
    updateSliderLabels();
    if (state.baseImage) {
      setOutputStatus("Output settings changed.");
    }
  });
}

hookEffectControl(effectNoiseAmount, effectNoiseEnabled);
hookEffectControl(effectPitchAmount, effectPitchEnabled);
hookEffectControl(effectBrightnessAmount, effectBrightnessEnabled);
hookEffectControl(effectBlurAmount, effectBlurEnabled);
hookEffectControl(effectClampAmount, effectClampEnabled);

effectInvertEnabled.addEventListener("change", () => {
  updateSliderLabels();
  if (state.baseImage) {
    setEffectsStatus("Settings changed.");
  }
});

hookOutputControl(outputGainAmount);
hookOutputControl(outputLimitAmount);

updatePreviewButton.addEventListener("click", () => {
  if (!state.baseImage) {
    setEffectsStatus("Convert audio to image first.");
    return;
  }

  clearOutputAudio();
  applyAllEffects();
  setEffectsStatus("Preview updated.");
  updateButtonStates();
});

downloadPngButton.addEventListener("click", () => {
  if (!state.processedImage) {
    setEffectsStatus("No image to download yet.");
    return;
  }

  const link = document.createElement("a");
  link.href = spectrogramCanvas.toDataURL("image/png");
  link.download = "audio-image-processing-rgb.png";
  link.click();
  setEffectsStatus("PNG downloaded.");
});

function rgbImageToComplexFrames(image) {
  const width = getImageWidth(image);
  const height = getImageHeight(image);
  const framesReal = new Array(width);
  const framesImag = new Array(width);

  for (let x = 0; x < width; x += 1) {
    const real = new Float32Array(state.fftSize);
    const imag = new Float32Array(state.fftSize);

    for (let displayRow = 0; displayRow < height; displayRow += 1) {
      const binIndex = height - 1 - displayRow;

      const realValue = (image.r[displayRow][x] - 0.5) * 2;
      const imagValue = (image.g[displayRow][x] - 0.5) * 2;

      real[binIndex] = realValue;
      imag[binIndex] = imagValue;

      if (binIndex > 0 && binIndex < state.fftSize / 2) {
        real[state.fftSize - binIndex] = realValue;
        imag[state.fftSize - binIndex] = -imagValue;
      }
    }

    framesReal[x] = real;
    framesImag[x] = imag;
  }

  return { framesReal, framesImag };
}

function istftFromRgbImage(image) {
  const width = getImageWidth(image);
  const fftSize = state.fftSize;
  const hopSize = state.hopSize;
  const window = createHannWindow(fftSize);

  const outputLength = (width - 1) * hopSize + fftSize;
  const output = new Float32Array(outputLength);
  const normalization = new Float32Array(outputLength);

  const { framesReal, framesImag } = rgbImageToComplexFrames(image);

  for (let frameIndex = 0; frameIndex < width; frameIndex += 1) {
    const real = framesReal[frameIndex];
    const imag = framesImag[frameIndex];

    fftComplex(real, imag, true);

    const start = frameIndex * hopSize;
    for (let i = 0; i < fftSize; i += 1) {
      const windowed = real[i] * window[i];
      output[start + i] += windowed;
      normalization[start + i] += window[i] * window[i];
    }
  }

  for (let i = 0; i < output.length; i += 1) {
    if (normalization[i] > 1e-8) {
      output[i] /= normalization[i];
    }
  }

  return output;
}

function getSignalPeak(signal) {
  let maxAmplitude = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const absoluteValue = Math.abs(signal[i]);
    if (absoluteValue > maxAmplitude) {
      maxAmplitude = absoluteValue;
    }
  }
  return maxAmplitude;
}

function removeDcOffset(signal) {
  if (signal.length === 0) {
    return signal;
  }

  let mean = 0;
  for (let i = 0; i < signal.length; i += 1) {
    mean += signal[i];
  }
  mean /= signal.length;

  for (let i = 0; i < signal.length; i += 1) {
    signal[i] -= mean;
  }

  return signal;
}

function normalizeSignal(signal, targetPeak = 0.98) {
  const peak = getSignalPeak(signal);
  if (peak > 0) {
    const multiplier = targetPeak / peak;
    for (let i = 0; i < signal.length; i += 1) {
      signal[i] *= multiplier;
    }
  }
  return signal;
}

function softClipSignal(signal, drive = 1.0) {
  for (let i = 0; i < signal.length; i += 1) {
    signal[i] = Math.tanh(signal[i] * drive);
  }
  return signal;
}

function hardLimitTransientSpikes(signal, threshold = 0.12) {
  for (let i = 0; i < signal.length; i += 1) {
    if (signal[i] > threshold) {
      signal[i] = threshold;
    } else if (signal[i] < -threshold) {
      signal[i] = -threshold;
    }
  }
  return signal;
}

function getWindowRmsValues(signal, windowSize, hopSize) {
  const values = [];
  for (let start = 0; start < signal.length; start += hopSize) {
    const end = Math.min(signal.length, start + windowSize);
    let sum = 0;
    let count = 0;

    for (let i = start; i < end; i += 1) {
      sum += signal[i] * signal[i];
      count += 1;
    }

    if (count > 0) {
      values.push(Math.sqrt(sum / count));
    }
  }
  return values;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function applyWindowedLoudnessNormalization(signal, gateRatio, targetRms) {
  const windowRmsValues = getWindowRmsValues(signal, WINDOW_RMS_SIZE, WINDOW_RMS_HOP);
  const referenceRms = percentile(windowRmsValues, 0.95);

  if (referenceRms <= 1e-8) {
    return signal;
  }

  const gateThreshold = referenceRms * gateRatio;

  let sum = 0;
  let count = 0;

  for (let start = 0; start < signal.length; start += WINDOW_RMS_HOP) {
    const end = Math.min(signal.length, start + WINDOW_RMS_SIZE);

    let windowSum = 0;
    let windowCount = 0;
    for (let i = start; i < end; i += 1) {
      windowSum += signal[i] * signal[i];
      windowCount += 1;
    }

    if (windowCount === 0) {
      continue;
    }

    const rms = Math.sqrt(windowSum / windowCount);
    if (rms >= gateThreshold) {
      sum += windowSum;
      count += windowCount;
    }
  }

  if (count === 0) {
    return signal;
  }

  const gatedRms = Math.sqrt(sum / count);
  if (gatedRms <= 1e-8) {
    return signal;
  }

  const gain = targetRms / gatedRms;

  for (let i = 0; i < signal.length; i += 1) {
    signal[i] *= gain;
  }

  return signal;
}

function applyManualGain(signal, multiplier) {
  if (multiplier === 1) {
    return signal;
  }

  for (let i = 0; i < signal.length; i += 1) {
    signal[i] *= multiplier;
  }

  return signal;
}

function rgbImageToAudioBuffer(image, sampleRate) {
  let signal = istftFromRgbImage(image);

  const limiter = getLimiterSettings();
  const manualGain = getManualGainMultiplier();

  signal = removeDcOffset(signal);
  signal = hardLimitTransientSpikes(signal, limiter.spikeThreshold);
  signal = softClipSignal(signal, limiter.preClipDrive);
  signal = applyWindowedLoudnessNormalization(signal, WINDOW_GATE_RATIO, TARGET_OUTPUT_RMS);

  // Leave headroom before manual gain so the gain slider can actually do something.
  signal = normalizeSignal(signal, PRE_MANUAL_HEADROOM_PEAK);

  // Manual gain happens after the pre-normalize, so it is not cancelled out.
  signal = applyManualGain(signal, manualGain);

  // Final safety shaping based on Limit.
  signal = softClipSignal(signal, limiter.postClipDrive);

  const audioBuffer = audioContext.createBuffer(1, signal.length, sampleRate);
  audioBuffer.copyToChannel(signal, 0);
  return audioBuffer;
}

function audioBufferToWavBlob(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = channelData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i += 1) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < channelData.length; i += 1) {
    const sample = clamp(channelData[i], -1, 1);
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

buildAudioButton.addEventListener("click", async () => {
  if (!state.selectedAudioBuffer) {
    setOutputStatus("You need audio loaded first.");
    return;
  }

  if (!state.baseImage) {
    setOutputStatus("Convert audio to image first.");
    return;
  }

  try {
    setOutputStatus("Building audio from current settings...");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const imageToBuild = applyAllEffectsToImage(state.baseImage);
    state.processedImage = cloneRgbImage(imageToBuild);
    drawRgbImageToCanvas(state.processedImage);

    const rebuiltBuffer = rgbImageToAudioBuffer(
      imageToBuild,
      state.selectedAudioBuffer.sampleRate
    );

    const wavBlob = audioBufferToWavBlob(rebuiltBuffer);
    state.lastOutputBlob = wavBlob;

    if (state.lastOutputUrl) {
      URL.revokeObjectURL(state.lastOutputUrl);
    }

    state.lastOutputUrl = URL.createObjectURL(wavBlob);
    outputAudioPlayer.src = state.lastOutputUrl;
    outputAudioPlayer.classList.remove("hidden");

    setOutputStatus("Audio built. Preview it or download the WAV.");
    updateButtonStates();
  } catch (error) {
    console.error(error);
    setOutputStatus("Could not build audio from image.");
  }
});

downloadAudioButton.addEventListener("click", () => {
  if (!state.lastOutputBlob) {
    setOutputStatus("No output audio yet.");
    return;
  }

  const link = document.createElement("a");
  const tempUrl = URL.createObjectURL(state.lastOutputBlob);
  link.href = tempUrl;
  link.download = "audio-image-processing-output.wav";
  link.click();
  URL.revokeObjectURL(tempUrl);
  setOutputStatus("WAV downloaded.");
});

updateSliderLabels();
updateButtonStates();

spectrogramContext.fillStyle = "#000000";
spectrogramContext.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
spectrogramContext.fillStyle = "#94a3b8";
spectrogramContext.font = "28px Arial";
spectrogramContext.textAlign = "center";
spectrogramContext.textBaseline = "middle";
spectrogramContext.fillText("Your RGB audio image will appear here", spectrogramCanvas.width / 2, spectrogramCanvas.height / 2);