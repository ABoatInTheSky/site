const audioFileInput = document.getElementById("audio-file");
const imageFileInput = document.getElementById("image-file");
const startRecordButton = document.getElementById("start-record-button");
const stopRecordButton = document.getElementById("stop-record-button");
const convertToImageButton = document.getElementById("convert-to-image-button");
const updatePreviewButton = document.getElementById("update-preview-button");
const continueButton = document.getElementById("continue-button");
const buildAudioButton = document.getElementById("build-audio-button");
const downloadPngButton = document.getElementById("download-png-button");
const downloadAudioButton = document.getElementById("download-audio-button");

const recordingStatus = document.getElementById("recording-status");
const inputStatus = document.getElementById("input-status");
const effectsStatus = document.getElementById("effects-status");
const outputStatus = document.getElementById("output-status");

const spectrogramCanvas = document.getElementById("spectrogram-canvas");
const spectrogramContext = spectrogramCanvas.getContext("2d");

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

const effectRampEnabled = document.getElementById("effect-ramp-enabled");
const effectRampAmount = document.getElementById("effect-ramp-amount");
const effectRampValue = document.getElementById("effect-ramp-value");

const effectClampEnabled = document.getElementById("effect-clamp-enabled");
const effectClampAmount = document.getElementById("effect-clamp-amount");
const effectClampValue = document.getElementById("effect-clamp-value");

const effectInvertEnabled = document.getElementById("effect-invert-enabled");
const effectInvertValue = document.getElementById("effect-invert-value");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const state = {
  selectedAudioBlob: null,
  selectedAudioBuffer: null,
  baseMatrix: null,
  processedMatrix: null,
  lockedMatrix: null,
  importedImageInUse: false,
  lastOutputBlob: null,
  lastOutputUrl: null,
  mediaRecorder: null,
  mediaStream: null,
  recordedChunks: [],
  stftWindowSize: 1024,
  stftHopSize: 256,
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

function updateSliderLabels() {
  effectNoiseValue.textContent = `${effectNoiseAmount.value}%`;
  effectPitchValue.textContent = `${effectPitchAmount.value}%`;
  effectBrightnessValue.textContent = `${effectBrightnessAmount.value}%`;
  effectBlurValue.textContent = `${effectBlurAmount.value}%`;
  effectRampValue.textContent = `${effectRampAmount.value}%`;
  effectClampValue.textContent = `${effectClampAmount.value}%`;
  effectInvertValue.textContent = effectInvertEnabled.checked ? "On" : "Off";
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

function cloneMatrix(matrix) {
  return matrix.map((row) => Float32Array.from(row));
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

function createHannWindow(size) {
  const windowValues = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    windowValues[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return windowValues;
}

function computeMagnitudeSpectrum(frame, binCount) {
  const magnitudes = new Float32Array(binCount);

  for (let k = 0; k < binCount; k += 1) {
    let real = 0;
    let imag = 0;
    const angularFactor = (-2 * Math.PI * k) / frame.length;

    for (let n = 0; n < frame.length; n += 1) {
      const angle = angularFactor * n;
      real += frame[n] * Math.cos(angle);
      imag += frame[n] * Math.sin(angle);
    }

    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }

  return magnitudes;
}

function audioBufferToSpectrogramMatrix(audioBuffer) {
  const samples = getMonoChannelData(audioBuffer);
  const windowSize = state.stftWindowSize;
  const hopSize = state.stftHopSize;
  const binCount = windowSize / 2;
  const hannWindow = createHannWindow(windowSize);

  const frameCount = Math.max(1, Math.floor((samples.length - windowSize) / hopSize) + 1);
  const matrix = create2DArray(frameCount, binCount);

  let globalMax = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * hopSize;
    const frame = new Float32Array(windowSize);

    for (let i = 0; i < windowSize; i += 1) {
      const sample = samples[start + i] || 0;
      frame[i] = sample * hannWindow[i];
    }

    const magnitudes = computeMagnitudeSpectrum(frame, binCount);

    for (let binIndex = 0; binIndex < binCount; binIndex += 1) {
      const value = magnitudes[binIndex];
      if (value > globalMax) {
        globalMax = value;
      }
      matrix[binCount - 1 - binIndex][frameIndex] = value;
    }
  }

  if (globalMax <= 0) {
    globalMax = 1;
  }

  for (let y = 0; y < binCount; y += 1) {
    for (let x = 0; x < frameCount; x += 1) {
      const normalized = matrix[y][x] / globalMax;
      const shaped = Math.pow(normalized, 0.45);
      matrix[y][x] = clamp(shaped, 0, 1);
    }
  }

  return matrix;
}

function matrixToCanvas(matrix) {
  const height = matrix.length;
  const width = matrix[0].length;

  spectrogramCanvas.width = width;
  spectrogramCanvas.height = height;

  const imageData = spectrogramContext.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const brightness = Math.round(clamp(matrix[y][x], 0, 1) * 255);
      const index = (y * width + x) * 4;
      data[index] = brightness;
      data[index + 1] = brightness;
      data[index + 2] = brightness;
      data[index + 3] = 255;
    }
  }

  spectrogramContext.putImageData(imageData, 0, 0);
}

function applyNoise(matrix, amountPercent) {
  const amount = amountPercent / 100;
  const output = cloneMatrix(matrix);

  for (let y = 0; y < output.length; y += 1) {
    for (let x = 0; x < output[0].length; x += 1) {
      const noise = (Math.random() * 2 - 1) * amount;
      output[y][x] = clamp(output[y][x] + noise, 0, 1);
    }
  }

  return output;
}

function applyBrightness(matrix, amountPercent) {
  const multiplier = 1 + amountPercent / 100;
  const output = cloneMatrix(matrix);

  for (let y = 0; y < output.length; y += 1) {
    for (let x = 0; x < output[0].length; x += 1) {
      output[y][x] = clamp(output[y][x] * multiplier, 0, 1);
    }
  }

  return output;
}

function applyPitchShift(matrix, amountPercent) {
  const height = matrix.length;
  const width = matrix[0].length;
  const output = create2DArray(width, height);
  const shift = Math.round((amountPercent / 100) * (height * 0.35));

  for (let y = 0; y < height; y += 1) {
    const sourceY = y - shift;
    for (let x = 0; x < width; x += 1) {
      if (sourceY >= 0 && sourceY < height) {
        output[y][x] = matrix[sourceY][x];
      } else {
        output[y][x] = 0;
      }
    }
  }

  return output;
}

function applyBlur(matrix, amountPercent) {
  const passes = Math.max(0, Math.round((amountPercent / 100) * 6));
  if (passes <= 0) {
    return cloneMatrix(matrix);
  }

  let current = cloneMatrix(matrix);
  const height = current.length;
  const width = current[0].length;

  for (let pass = 0; pass < passes; pass += 1) {
    const next = create2DArray(width, height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleY = y + offsetY;
            const sampleX = x + offsetX;

            if (sampleY >= 0 && sampleY < height && sampleX >= 0 && sampleX < width) {
              total += current[sampleY][sampleX];
              count += 1;
            }
          }
        }

        next[y][x] = total / count;
      }
    }

    current = next;
  }

  return current;
}

function remapRamp(value, amountPercent) {
  const pivot = amountPercent / 100;

  if (value <= pivot) {
    return pivot === 0 ? 0 : (value / pivot) * 0.5;
  }

  return pivot === 1 ? 1 : 0.5 + ((value - pivot) / (1 - pivot)) * 0.5;
}

function applyRamp(matrix, amountPercent) {
  const output = cloneMatrix(matrix);

  for (let y = 0; y < output.length; y += 1) {
    for (let x = 0; x < output[0].length; x += 1) {
      output[y][x] = clamp(remapRamp(output[y][x], amountPercent), 0, 1);
    }
  }

  return output;
}

function applyClampEffect(matrix, amountPercent) {
  const floorAmount = amountPercent / 100;
  const output = cloneMatrix(matrix);

  for (let y = 0; y < output.length; y += 1) {
    for (let x = 0; x < output[0].length; x += 1) {
      const value = output[y][x];
      output[y][x] = value < floorAmount ? 0 : value;
    }
  }

  return output;
}

function applyInvert(matrix) {
  const output = cloneMatrix(matrix);

  for (let y = 0; y < output.length; y += 1) {
    for (let x = 0; x < output[0].length; x += 1) {
      output[y][x] = 1 - output[y][x];
    }
  }

  return output;
}

function applyAllEffects() {
  if (!state.baseMatrix) {
    return;
  }

  let working = cloneMatrix(state.baseMatrix);

  if (effectNoiseEnabled.checked) {
    working = applyNoise(working, Number(effectNoiseAmount.value));
  }

  if (effectPitchEnabled.checked) {
    working = applyPitchShift(working, Number(effectPitchAmount.value));
  }

  if (effectBrightnessEnabled.checked) {
    working = applyBrightness(working, Number(effectBrightnessAmount.value));
  }

  if (effectBlurEnabled.checked) {
    working = applyBlur(working, Number(effectBlurAmount.value));
  }

  if (effectRampEnabled.checked) {
    working = applyRamp(working, Number(effectRampAmount.value));
  }

  if (effectClampEnabled.checked) {
    working = applyClampEffect(working, Number(effectClampAmount.value));
  }

  if (effectInvertEnabled.checked) {
    working = applyInvert(working);
  }

  state.processedMatrix = working;
  matrixToCanvas(state.processedMatrix);
}

async function decodeBlobToAudioBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer.slice(0));
}

function updateInfoLabels() {
  if (!state.selectedAudioBuffer || !state.baseMatrix) {
    imageWidthLabel.textContent = "-";
    imageHeightLabel.textContent = "-";
    audioDurationLabel.textContent = "-";
    sampleRateLabel.textContent = "-";
    return;
  }

  imageWidthLabel.textContent = `${state.baseMatrix[0].length}px`;
  imageHeightLabel.textContent = `${state.baseMatrix.length}px`;
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
  downloadAudioButton.disabled = true;
  state.lastOutputBlob = null;
}

function resetImageStateForNewAudio() {
  state.baseMatrix = null;
  state.processedMatrix = null;
  state.lockedMatrix = null;
  state.importedImageInUse = false;
  imageFileInput.value = "";
  clearOutputAudio();
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
    convertToImageButton.disabled = false;
    setInputStatus(`Loaded: ${file.name}`);
    updateInfoLabels();
  } catch (error) {
    console.error(error);
    setInputStatus("Could not read that audio file.");
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
        convertToImageButton.disabled = false;
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
      startRecordButton.disabled = false;
      stopRecordButton.disabled = true;
      recordingStatus.textContent = "Not recording";
    };

    state.mediaRecorder.start();
    startRecordButton.disabled = true;
    stopRecordButton.disabled = false;
    recordingStatus.textContent = "Recording...";
    setInputStatus("Recording microphone audio...");
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
    setInputStatus("Converting audio to image...");
    clearOutputAudio();

    state.baseMatrix = audioBufferToSpectrogramMatrix(state.selectedAudioBuffer);
    state.processedMatrix = cloneMatrix(state.baseMatrix);
    state.lockedMatrix = null;
    state.importedImageInUse = false;

    state.imageWidth = state.baseMatrix[0].length;
    state.imageHeight = state.baseMatrix.length;

    matrixToCanvas(state.processedMatrix);
    updateInfoLabels();

    updatePreviewButton.disabled = false;
    continueButton.disabled = false;
    downloadPngButton.disabled = false;
    buildAudioButton.disabled = false;

    setInputStatus("Audio converted to image.");
    setEffectsStatus("Ready for effects. Press Update Preview after changing settings.");
    setOutputStatus("");
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
  if (!state.baseMatrix) {
    throw new Error("Convert audio to image first so the required image format is known.");
  }

  const requiredWidth = state.baseMatrix[0].length;
  const requiredHeight = state.baseMatrix.length;

  if (image.width !== requiredWidth || image.height !== requiredHeight) {
    throw new Error(
      `Wrong image size.\nExpected ${requiredWidth}x${requiredHeight}, got ${image.width}x${image.height}.`
    );
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = image.width;
  tempCanvas.height = image.height;
  const tempContext = tempCanvas.getContext("2d");

  tempContext.drawImage(image, 0, 0);
  const imageData = tempContext.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  const matrix = create2DArray(image.width, image.height);

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

      if (!(r === g && g === b)) {
        throw new Error("Image must be grayscale only. RGB values must match for every pixel.");
      }

      matrix[y][x] = r / 255;
    }
  }

  return matrix;
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
    const importedMatrix = validateAndConvertImportedImage(image);

    state.baseMatrix = importedMatrix;
    state.processedMatrix = cloneMatrix(importedMatrix);
    state.lockedMatrix = null;
    state.importedImageInUse = true;

    matrixToCanvas(state.processedMatrix);
    setEffectsStatus("Imported image accepted and loaded.");
    setOutputStatus("");
  } catch (error) {
    console.error(error);
    imageFileInput.value = "";
    setEffectsStatus(`Image import failed:\n${error.message}`);
  }
});

function hookEffectControl(inputElement, checkboxElement) {
  inputElement.addEventListener("input", () => {
    updateSliderLabels();
    if (state.baseMatrix) {
      setEffectsStatus("Settings changed. Press Update Preview.");
    }
  });

  checkboxElement.addEventListener("change", () => {
    updateSliderLabels();
    if (state.baseMatrix) {
      setEffectsStatus("Settings changed. Press Update Preview.");
    }
  });
}

hookEffectControl(effectNoiseAmount, effectNoiseEnabled);
hookEffectControl(effectPitchAmount, effectPitchEnabled);
hookEffectControl(effectBrightnessAmount, effectBrightnessEnabled);
hookEffectControl(effectBlurAmount, effectBlurEnabled);
hookEffectControl(effectRampAmount, effectRampEnabled);
hookEffectControl(effectClampAmount, effectClampEnabled);

effectInvertEnabled.addEventListener("change", () => {
  updateSliderLabels();
  if (state.baseMatrix) {
    setEffectsStatus("Settings changed. Press Update Preview.");
  }
});

updatePreviewButton.addEventListener("click", () => {
  if (!state.baseMatrix) {
    setEffectsStatus("Convert audio to image first.");
    return;
  }

  clearOutputAudio();
  state.lockedMatrix = null;
  applyAllEffects();
  setEffectsStatus("Preview updated.");
  setOutputStatus("");
});

continueButton.addEventListener("click", () => {
  if (!state.processedMatrix) {
    setEffectsStatus("Update the preview first.");
    return;
  }

  state.lockedMatrix = cloneMatrix(state.processedMatrix);
  setEffectsStatus("Processed image locked in. You can now build audio.");
});

downloadPngButton.addEventListener("click", () => {
  if (!state.processedMatrix) {
    setEffectsStatus("No image to download yet.");
    return;
  }

  const link = document.createElement("a");
  link.href = spectrogramCanvas.toDataURL("image/png");
  link.download = "audio-image-processing.png";
  link.click();
  setEffectsStatus("PNG downloaded.");
});

function buildFrequencyMap(binCount, sampleRate) {
  const frequencies = new Float32Array(binCount);
  const maxFrequency = sampleRate / 2;
  const minFrequency = 30;

  for (let i = 0; i < binCount; i += 1) {
    const ratio = i / Math.max(1, binCount - 1);
    frequencies[i] = lerp(maxFrequency, minFrequency, ratio);
  }

  return frequencies;
}

function matrixToAudioBuffer(matrix, sampleRate, hopSize) {
  const height = matrix.length;
  const width = matrix[0].length;
  const outputLength = width * hopSize + sampleRate;
  const output = new Float32Array(outputLength);

  const frequencies = buildFrequencyMap(height, sampleRate);
  const phases = new Float32Array(height);

  for (let x = 0; x < width; x += 1) {
    const frameStart = x * hopSize;

    for (let i = 0; i < hopSize; i += 1) {
      let sampleValue = 0;
      const globalIndex = frameStart + i;

      for (let y = 0; y < height; y += 1) {
        const amplitude = Math.pow(matrix[y][x], 1.7) * 0.02;
        if (amplitude <= 0.00005) {
          continue;
        }

        const phaseStep = (2 * Math.PI * frequencies[y]) / sampleRate;
        phases[y] += phaseStep;
        sampleValue += Math.sin(phases[y]) * amplitude;
      }

      output[globalIndex] += sampleValue;
    }
  }

  let maxAmplitude = 0;
  for (let i = 0; i < output.length; i += 1) {
    const absoluteValue = Math.abs(output[i]);
    if (absoluteValue > maxAmplitude) {
      maxAmplitude = absoluteValue;
    }
  }

  if (maxAmplitude > 0) {
    const normalizeMultiplier = 0.92 / maxAmplitude;
    for (let i = 0; i < output.length; i += 1) {
      output[i] *= normalizeMultiplier;
    }
  }

  const audioBuffer = audioContext.createBuffer(1, output.length, sampleRate);
  audioBuffer.copyToChannel(output, 0);
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

  const matrixToUse = state.lockedMatrix || state.processedMatrix;

  if (!matrixToUse) {
    setOutputStatus("You need an image first.");
    return;
  }

  try {
    setOutputStatus("Building audio from image...");
    const rebuiltBuffer = matrixToAudioBuffer(
      matrixToUse,
      state.selectedAudioBuffer.sampleRate,
      state.stftHopSize
    );

    const wavBlob = audioBufferToWavBlob(rebuiltBuffer);
    state.lastOutputBlob = wavBlob;

    if (state.lastOutputUrl) {
      URL.revokeObjectURL(state.lastOutputUrl);
    }

    state.lastOutputUrl = URL.createObjectURL(wavBlob);
    outputAudioPlayer.src = state.lastOutputUrl;
    outputAudioPlayer.classList.remove("hidden");
    downloadAudioButton.disabled = false;

    setOutputStatus("Audio built. Preview it or download the WAV.");
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

spectrogramContext.fillStyle = "#000000";
spectrogramContext.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
spectrogramContext.fillStyle = "#94a3b8";
spectrogramContext.font = "28px Arial";
spectrogramContext.textAlign = "center";
spectrogramContext.textBaseline = "middle";
spectrogramContext.fillText("Your audio image will appear here", spectrogramCanvas.width / 2, spectrogramCanvas.height / 2);