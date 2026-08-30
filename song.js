/*
 * Special Script Bot — YouTube audio downloader (lib/song.js)
 *
 * Ported from Pain Bot's song.js/play.js. This replaces the old
 * youtube-dl-exec (yt-dlp) implementation entirely, because yt-dlp keeps
 * breaking against YouTube's signature ("nsig") changes and needed
 * constant binary updates / a JS runtime just to keep working.
 *
 * Approach: search with yt-search, then hit a chain of third-party
 * YouTube-to-MP3 APIs until one returns a working audio file. If one API
 * is down or blocked, the next is tried automatically.
 */
const axios = require('axios');
const yts = require('yt-search');

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

// ---- Download source APIs (tried in this order) ----

async function getEliteProTech(youtubeUrl) {
  const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
  const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
  if (res?.data?.success && res?.data?.downloadURL) {
    return { download: res.data.downloadURL, title: res.data.title };
  }
  throw new Error('EliteProTech returned no download');
}

async function getYupra(youtubeUrl) {
  const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
  const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
  if (res?.data?.success && res?.data?.data?.download_url) {
    return { download: res.data.data.download_url, title: res.data.data.title };
  }
  throw new Error('Yupra returned no download');
}

async function getOkatsu(youtubeUrl) {
  const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
  const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
  if (res?.data?.dl) {
    return { download: res.data.dl, title: res.data.title };
  }
  throw new Error('Okatsu returned no download');
}

const API_CHAIN = [
  { name: 'EliteProTech', method: getEliteProTech },
  { name: 'Yupra', method: getYupra },
  { name: 'Okatsu', method: getOkatsu }
];

// ---- Search ----

async function searchYoutube(query) {
  if (/youtube\.com|youtu\.be/.test(query)) return { url: query, title: query };
  const search = await yts(query);
  if (!search?.videos?.length) return null;
  const v = search.videos[0];
  return { url: v.url, title: v.title, duration: v.timestamp, thumbnail: v.thumbnail };
}

// ---- Format detection (APIs don't always say what they gave us) ----

function detectAudioFormat(buffer) {
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
    return { ext: 'mp3', mimetype: 'audio/mpeg' };
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { ext: 'm4a', mimetype: 'audio/mp4' };
  }
  if (buffer.toString('ascii', 0, 4) === 'OggS') {
    return { ext: 'ogg', mimetype: 'audio/ogg; codecs=opus' };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF') {
    return { ext: 'wav', mimetype: 'audio/wav' };
  }
  return { ext: 'm4a', mimetype: 'audio/mp4' };
}

// ---- Download the actual audio bytes, falling back across APIs ----

async function downloadAudioBuffer(youtubeUrl) {
  let lastErr;
  for (const api of API_CHAIN) {
    try {
      const data = await api.method(youtubeUrl);
      const audioUrl = data.download;
      if (!audioUrl) { console.log(`[song] ${api.name} gave no download URL, trying next...`); continue; }

      try {
        const resp = await axios.get(audioUrl, {
          responseType: 'arraybuffer',
          timeout: 90000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          validateStatus: s => s >= 200 && s < 400,
          headers: { 'User-Agent': AXIOS_DEFAULTS.headers['User-Agent'], 'Accept': '*/*' }
        });
        const buffer = Buffer.from(resp.data);
        if (buffer?.length) return { buffer, title: data.title, source: api.name };
      } catch (dlErr) {
        console.log(`[song] ${api.name} file fetch failed: ${dlErr.message}`);
        lastErr = dlErr;
        continue;
      }
    } catch (apiErr) {
      console.log(`[song] ${api.name} API failed: ${apiErr.message}`);
      lastErr = apiErr;
      continue;
    }
  }
  throw lastErr || new Error('All song download sources failed');
}

/**
 * Search + download in one call.
 * @param {string} query song name or YouTube URL
 * @returns {Promise<{buffer: Buffer, title: string, ext: string, mimetype: string, source: string}|null>}
 */
async function fetchSong(query) {
  const video = await searchYoutube(query);
  if (!video) return null;
  const result = await downloadAudioBuffer(video.url);
  const format = detectAudioFormat(result.buffer);
  return {
    buffer: result.buffer,
    title: result.title || video.title,
    ext: format.ext,
    mimetype: format.mimetype,
    source: result.source
  };
}

module.exports = { fetchSong, searchYoutube };
