/*
 * Special Script Bot — YouTube audio downloader
 *
 * Searches YouTube, obtains an audio URL from a small fallback chain, then
 * NORMALIZES the returned media to MP3 before it is handed to Baileys.
 *
 * Normalization is intentional: some downloader APIs return WebM/AAC/M4A,
 * mislabeled MP3, or occasionally an HTML/JSON error page. Sending those raw
 * bytes with a guessed mimetype makes WhatsApp accept the message but later
 * show: "This audio is not available because something is wrong with the
 * audio file."  Converting the actual bytes to MP3 gives WhatsApp a
 * consistent, playable format — sent as audio/mpeg with ptt:false, it also
 * renders as a normal music-file message instead of a voice-note bubble
 * (that round waveform UI is tied to the audio/ogg;codecs=opus codec, not
 * the ptt flag).
 *
 * IMPORTANT: download + conversion are attempted together, per source, inside
 * the same fallback loop. Previously conversion happened once, after the
 * loop, using only the first source's bytes — if that specific file was
 * corrupt/incompatible, FFmpeg would stall on it and the whole request
 * failed with a timeout instead of moving on to the next source.
 *
 * IMPORTANT: FFmpeg reads from a temp file, not stdin. Piping unseekable,
 * possibly-partial data into "-i pipe:0" makes FFmpeg auto-probe a live
 * stream, which can stall indefinitely on borderline data from free
 * third-party APIs. A real file lets FFmpeg seek and fail fast instead.
 */
const axios = require('axios');
const yts = require('yt-search');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

let ffmpegStatic = null;
try { ffmpegStatic = require('ffmpeg-static'); } catch (_) {}

const AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

async function tryRequest(getter, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await getter(); }
    catch (err) {
      lastError = err;
      if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError;
}

async function getEliteProTech(youtubeUrl) {
  const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
  const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
  if (res?.data?.success && res?.data?.downloadURL) return { download: res.data.downloadURL, title: res.data.title };
  throw new Error('EliteProTech returned no download');
}

async function getYupra(youtubeUrl) {
  const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
  const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
  if (res?.data?.success && res?.data?.data?.download_url) return { download: res.data.data.download_url, title: res.data.data.title };
  throw new Error('Yupra returned no download');
}

async function getOkatsu(youtubeUrl) {
  const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
  const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
  if (res?.data?.dl) return { download: res.data.dl, title: res.data.title };
  throw new Error('Okatsu returned no download');
}

const API_CHAIN = [
  { name: 'EliteProTech', method: getEliteProTech },
  { name: 'Yupra', method: getYupra },
  { name: 'Okatsu', method: getOkatsu }
];

async function searchYoutube(query) {
  if (/youtube\.com|youtu\.be/i.test(query)) return { url: query, title: query };
  const search = await yts(query);
  if (!search?.videos?.length) return null;
  const v = search.videos[0];
  return { url: v.url, title: v.title, duration: v.timestamp, thumbnail: v.thumbnail };
}

function looksLikeAudio(buffer) {
  if (!buffer || buffer.length < 16) return false;
  const ascii = buffer.toString('ascii', 0, Math.min(buffer.length, 64)).toLowerCase();
  if (ascii.startsWith('<!doctype') || ascii.startsWith('<html') || ascii.startsWith('{"error') || ascii.startsWith('{"message')) return false;
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return true;
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') return true;
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return true;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return true;
  // MPEG audio frame sync. Covers MP3 files without an ID3 tag.
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  // WebM/Matroska EBML header.
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;
  return false;
}

function findFfmpeg() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    // On some hosts (fresh npm install on Linux, some VPS panels like
    // Katabump) the bundled binary can lose its executable bit. FFmpeg
    // would then either fail to spawn or, in some environments, hang
    // instead of erroring cleanly. Force the bit so spawn behaves.
    try { fs.chmodSync(ffmpegStatic, 0o755); } catch (_) {}
    return ffmpegStatic;
  }
  return 'ffmpeg';
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `song_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`);
}
function safeUnlink(p) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {} }

// Converts a raw downloaded audio buffer to MP3 using real files on disk
// (input and output), never stdin/stdout pipes. This lets FFmpeg seek the
// input and detect the container instantly instead of auto-probing a live
// stream, which is what caused earlier multi-second-to-90s stalls.
//
// Output is MP3 (audio/mpeg), not OGG/Opus. WhatsApp renders ANY
// audio/ogg;codecs=opus message with the round "voice note" waveform UI
// regardless of the `ptt` flag — that UI is tied to the codec, not just the
// ptt bit. Sending MP3 with ptt:false is what makes WhatsApp show a normal
// playable audio-file bubble (with title/filename) instead of a voice note.
function transcodeToMp3(inputBuffer) {
  return new Promise((resolve, reject) => {
    const inputPath = tmpFile('src');
    const outputPath = tmpFile('mp3');
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      safeUnlink(inputPath);
      safeUnlink(outputPath);
      fn(arg);
    };

    try {
      fs.writeFileSync(inputPath, inputBuffer);
    } catch (e) {
      reject(new Error(`Could not write temp audio file: ${e.message}`));
      return;
    }

    const ffmpeg = spawn(findFfmpeg(), [
      '-y',
      '-nostdin',
      '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-vn',
      '-map_metadata', '-1',
      '-ac', '2',
      '-ar', '44100',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      outputPath
    ], { windowsHide: true });

    const errors = [];
    // Real file-based conversion of a short audio track normally finishes
    // in a few seconds. 45s is a generous ceiling that still leaves room to
    // fall back to the next download source within a reasonable total wait.
    const timeout = setTimeout(() => {
      try { ffmpeg.kill('SIGKILL'); } catch (_) {}
      finish(reject, new Error('Audio conversion timed out after 45 seconds'));
    }, 45000);

    ffmpeg.stderr.on('data', chunk => errors.push(chunk));
    ffmpeg.on('error', err => {
      finish(reject, new Error(`FFmpeg could not start: ${err.message}`));
    });
    ffmpeg.on('close', code => {
      if (settled) return;
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString().trim().replace(/\s+/g, ' ').slice(0, 500);
        finish(reject, new Error(`FFmpeg conversion failed${detail ? `: ${detail}` : ` (exit ${code})`}`));
        return;
      }
      let result;
      try { result = fs.readFileSync(outputPath); }
      catch (e) { finish(reject, new Error(`Could not read converted audio: ${e.message}`)); return; }
      if (!result || result.length < 32) { finish(reject, new Error('FFmpeg produced an empty output file')); return; }
      finish(resolve, result);
    });
  });
}

// Tries each download source in order. For each source, both the raw
// download AND the FFmpeg conversion must succeed before it counts as a
// success — if either step fails for that source, we move on to the next
// one instead of giving up entirely.
async function downloadAndConvert(youtubeUrl) {
  let lastErr;
  for (const api of API_CHAIN) {
    try {
      const data = await api.method(youtubeUrl);
      if (!data?.download) throw new Error(`${api.name} returned no download URL`);

      const resp = await axios.get(data.download, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: s => s >= 200 && s < 400,
        headers: { 'User-Agent': AXIOS_DEFAULTS.headers['User-Agent'], 'Accept': '*/*' }
      });
      const buffer = Buffer.from(resp.data);
      if (!looksLikeAudio(buffer)) throw new Error('Downloader returned non-audio data');

      const normalized = await transcodeToMp3(buffer);
      return { buffer: normalized, title: data.title, source: api.name };
    } catch (err) {
      console.log(`[song] ${api.name} failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error('All song download/conversion sources failed');
}

async function fetchSong(query) {
  const video = await searchYoutube(query);
  if (!video) return null;
  const result = await downloadAndConvert(video.url);
  return {
    buffer: result.buffer,
    title: result.title || video.title,
    ext: 'mp3',
    mimetype: 'audio/mpeg',
    source: result.source
  };
}

// Same as fetchSong, but takes an already-resolved video (from
// searchYoutube) so callers can show a "Searching <title>" status using the
// real resolved title before kicking off the download/convert step.
async function downloadSong(video) {
  const result = await downloadAndConvert(video.url);
  return {
    buffer: result.buffer,
    title: result.title || video.title,
    ext: 'mp3',
    mimetype: 'audio/mpeg',
    source: result.source
  };
}

module.exports = { fetchSong, searchYoutube, downloadSong };
