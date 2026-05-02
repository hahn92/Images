const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resultsSection = document.getElementById('resultsSection');
const previewImage = document.getElementById('previewImage');
const fileNameEl = document.getElementById('fileName');
const basicInfoEl = document.getElementById('basicInfo');
const metadataReportEl = document.getElementById('metadataReport');
const alertsContainerEl = document.getElementById('alertsContainer');
const errorMsgEl = document.getElementById('errorMsg');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');

let lastMetadata = null;
let lastFileName = '';

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
    });
});

dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
});

resetBtn.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    errorMsgEl.classList.add('hidden');
    fileInput.value = '';
    lastMetadata = null;
});

exportBtn.addEventListener('click', () => {
    if (!lastMetadata) return;
    const blob = new Blob([JSON.stringify(lastMetadata, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lastFileName.replace(/\.[^.]+$/, '')}_metadata.json`;
    a.click();
    URL.revokeObjectURL(url);
});

async function handleFile(file) {
    errorMsgEl.classList.add('hidden');
    alertsContainerEl.innerHTML = '';

    if (!file.type.startsWith('image/')) {
        showError('El archivo seleccionado no es una imagen válida.');
        return;
    }

    lastFileName = file.name;
    previewImage.src = URL.createObjectURL(file);
    fileNameEl.textContent = file.name;

    const [dimensions, hashes, magic, exifrData, thumbBlob, pixelStats] = await Promise.all([
        getImageDimensions(file),
        computeHashes(file),
        detectFormat(file),
        parseExif(file),
        getEmbeddedThumbnail(file),
        getPixelStats(file)
    ]);

    const formatMismatch = checkFormatMismatch(file, magic);

    const fileInfo = {
        'Nombre del archivo': file.name,
        'Tipo MIME (declarado)': file.type || 'desconocido',
        'Formato detectado (magic bytes)': magic.format || 'desconocido',
        'Tamaño': formatBytes(file.size),
        'Tamaño en bytes': file.size.toLocaleString(),
        'Última modificación': file.lastModified ? new Date(file.lastModified).toLocaleString() : 'N/A',
        'Ancho (px)': dimensions.width ?? 'N/A',
        'Alto (px)': dimensions.height ?? 'N/A',
        'Resolución (MP)': dimensions.width && dimensions.height
            ? ((dimensions.width * dimensions.height) / 1000000).toFixed(2)
            : 'N/A',
        'Relación de aspecto': dimensions.width && dimensions.height
            ? simplifyRatio(dimensions.width, dimensions.height)
            : 'N/A',
        'SHA-256': hashes.sha256,
        'SHA-1': hashes.sha1
    };

    renderBasicInfo(fileInfo);
    renderAlerts(file, exifrData, formatMismatch, dimensions);

    lastMetadata = {
        archivo: fileInfo,
        validacion: { formatMismatch },
        pixeles: pixelStats,
        ...exifrData
    };

    renderMetadataReport(fileInfo, exifrData, pixelStats, thumbBlob);

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function parseExif(file) {
    try {
        return await exifr.parse(file, {
            tiff: true,
            xmp: true,
            icc: true,
            iptc: true,
            jfif: true,
            ihdr: true,
            gps: true,
            interop: true,
            exif: true,
            makerNote: true,
            userComment: true,
            translateKeys: true,
            translateValues: true,
            reviveValues: true,
            sanitize: true,
            mergeOutput: false,
            silentErrors: true
        }) || {};
    } catch (err) {
        console.warn('exifr error:', err);
        return {};
    }
}

async function getEmbeddedThumbnail(file) {
    try {
        const buf = await exifr.thumbnail(file);
        if (!buf) return null;
        return new Blob([buf], { type: 'image/jpeg' });
    } catch (err) {
        return null;
    }
}

async function computeHashes(file) {
    if (!crypto?.subtle) return { sha256: 'no soportado', sha1: 'no soportado' };
    try {
        const buf = await file.arrayBuffer();
        const [sha256Buf, sha1Buf] = await Promise.all([
            crypto.subtle.digest('SHA-256', buf),
            crypto.subtle.digest('SHA-1', buf)
        ]);
        return {
            sha256: bufferToHex(sha256Buf),
            sha1: bufferToHex(sha1Buf)
        };
    } catch (err) {
        return { sha256: 'error', sha1: 'error' };
    }
}

function bufferToHex(buf) {
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

const MAGIC_SIGNATURES = [
    { format: 'JPEG', mime: 'image/jpeg', ext: ['jpg', 'jpeg'], test: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
    { format: 'PNG', mime: 'image/png', ext: ['png'], test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
    { format: 'GIF', mime: 'image/gif', ext: ['gif'], test: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
    { format: 'WEBP', mime: 'image/webp', ext: ['webp'], test: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
    { format: 'TIFF (LE)', mime: 'image/tiff', ext: ['tif', 'tiff'], test: b => b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00 },
    { format: 'TIFF (BE)', mime: 'image/tiff', ext: ['tif', 'tiff'], test: b => b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A },
    { format: 'HEIC/HEIF', mime: 'image/heic', ext: ['heic', 'heif'], test: b => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
    { format: 'BMP', mime: 'image/bmp', ext: ['bmp'], test: b => b[0] === 0x42 && b[1] === 0x4D },
    { format: 'AVIF', mime: 'image/avif', ext: ['avif'], test: b => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66 },
    { format: 'ICO', mime: 'image/x-icon', ext: ['ico'], test: b => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00 }
];

async function detectFormat(file) {
    try {
        const slice = await file.slice(0, 16).arrayBuffer();
        const bytes = new Uint8Array(slice);
        for (const sig of MAGIC_SIGNATURES) {
            if (sig.test(bytes)) {
                return { format: sig.format, mime: sig.mime, ext: sig.ext };
            }
        }
        return { format: null, mime: null, ext: null };
    } catch {
        return { format: null, mime: null, ext: null };
    }
}

function checkFormatMismatch(file, magic) {
    if (!magic.format) return { ok: false, reason: 'No se reconoció la firma binaria del archivo' };
    const declaredExt = (file.name.split('.').pop() || '').toLowerCase();
    const declaredMime = (file.type || '').toLowerCase();
    const extOk = magic.ext.includes(declaredExt);
    const mimeOk = !declaredMime || declaredMime === magic.mime || (magic.mime === 'image/jpeg' && declaredMime === 'image/jpg');
    return {
        ok: extOk && mimeOk,
        extOk,
        mimeOk,
        declaredExt,
        declaredMime,
        realFormat: magic.format,
        realMime: magic.mime
    };
}

function getImageDimensions(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            resolve({ width: null, height: null });
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });
}

async function getPixelStats(file) {
    try {
        const bitmap = await createImageBitmap(file);
        const MAX = 256;
        const scale = Math.min(MAX / bitmap.width, MAX / bitmap.height, 1);
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();
        const { data } = ctx.getImageData(0, 0, w, h);

        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, lumSum = 0;
        let hasAlpha = false;
        const histR = new Array(16).fill(0);
        const histG = new Array(16).fill(0);
        const histB = new Array(16).fill(0);
        const buckets = new Map();
        const pixelCount = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            rSum += r; gSum += g; bSum += b; aSum += a;
            if (a < 255) hasAlpha = true;
            lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
            histR[r >> 4]++;
            histG[g >> 4]++;
            histB[b >> 4]++;
            const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
            buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        let bestKey = 0, bestCount = 0;
        for (const [k, v] of buckets) {
            if (v > bestCount) { bestCount = v; bestKey = k; }
        }
        const dr = ((bestKey >> 8) & 0xF) * 16 + 8;
        const dg = ((bestKey >> 4) & 0xF) * 16 + 8;
        const db = (bestKey & 0xF) * 16 + 8;
        const dominantHex = '#' + [dr, dg, db].map(v => v.toString(16).padStart(2, '0')).join('');

        return {
            'Color promedio (RGB)': `rgb(${Math.round(rSum / pixelCount)}, ${Math.round(gSum / pixelCount)}, ${Math.round(bSum / pixelCount)})`,
            'Color dominante': dominantHex,
            'Brillo medio (luminancia)': (lumSum / pixelCount).toFixed(1) + ' / 255',
            'Alpha promedio': (aSum / pixelCount).toFixed(1) + ' / 255',
            'Tiene transparencia real': hasAlpha ? 'Sí' : 'No',
            'Píxeles muestreados': pixelCount.toLocaleString() + ` (${w}×${h})`,
            __histR: histR,
            __histG: histG,
            __histB: histB,
            __dominantHex: dominantHex
        };
    } catch (err) {
        console.warn('pixel stats error:', err);
        return null;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function simplifyRatio(w, h) {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const d = gcd(w, h);
    return `${w / d}:${h / d}`;
}

function renderBasicInfo(info) {
    basicInfoEl.innerHTML = '';
    const fieldsToShow = ['Tipo MIME (declarado)', 'Formato detectado (magic bytes)', 'Tamaño', 'Ancho (px)', 'Alto (px)', 'Resolución (MP)'];
    fieldsToShow.forEach(key => {
        const div = document.createElement('div');
        div.className = 'basic-info-item';
        div.innerHTML = `<span class="label">${escapeHtml(key)}</span><span class="value">${escapeHtml(String(info[key] ?? 'N/A'))}</span>`;
        basicInfoEl.appendChild(div);
    });
}

function renderAlerts(file, exifrData, formatMismatch, dimensions) {
    alertsContainerEl.innerHTML = '';
    const alerts = [];

    if (!dimensions.width || !dimensions.height) {
        alerts.push({ level: 'error', icon: '⚠️', text: 'No se pudieron leer las dimensiones de la imagen. El archivo puede estar dañado o usar un formato no compatible con el navegador.' });
    }

    if (formatMismatch && !formatMismatch.ok) {
        if (formatMismatch.reason) {
            alerts.push({ level: 'warn', icon: '🔍', text: formatMismatch.reason + '.' });
        } else if (!formatMismatch.extOk) {
            alerts.push({
                level: 'warn', icon: '🪪',
                text: `La extensión <code>.${escapeHtml(formatMismatch.declaredExt)}</code> no coincide con el formato real (<strong>${escapeHtml(formatMismatch.realFormat)}</strong>). El archivo podría estar mal nombrado.`
            });
        } else if (!formatMismatch.mimeOk) {
            alerts.push({
                level: 'warn', icon: '🪪',
                text: `El MIME declarado (<code>${escapeHtml(formatMismatch.declaredMime)}</code>) no coincide con el formato real (<code>${escapeHtml(formatMismatch.realMime)}</code>).`
            });
        }
    }

    const privacyHits = [];
    if (exifrData.gps && exifrData.gps.latitude != null && exifrData.gps.longitude != null) {
        const lat = exifrData.gps.latitude, lon = exifrData.gps.longitude;
        const plausible = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
        if (plausible) privacyHits.push(`coordenadas GPS (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`);
        else alerts.push({ level: 'info', icon: 'ℹ️', text: `La imagen tiene coordenadas GPS pero parecen inválidas (${lat}, ${lon}).` });
    }
    const exif = exifrData.exif || {};
    const ifd0 = exifrData.ifd0 || {};
    if (exif.SerialNumber || exif.BodySerialNumber) privacyHits.push('número de serie del cuerpo de cámara');
    if (exif.LensSerialNumber) privacyHits.push('número de serie del lente');
    if (ifd0.Artist || ifd0.Copyright || (exifrData.xmp && (exifrData.xmp.creator || exifrData.xmp.rights))) privacyHits.push('autor / copyright');

    if (privacyHits.length > 0) {
        alerts.push({
            level: 'warn', icon: '🔒',
            text: `Esta imagen contiene datos personales identificables: <strong>${privacyHits.map(escapeHtml).join(', ')}</strong>. Considera eliminarlos antes de compartirla públicamente.`
        });
    }

    const captured = exif.DateTimeOriginal || exif.CreateDate;
    const modified = ifd0.ModifyDate || exif.ModifyDate;
    if (captured instanceof Date && modified instanceof Date && modified.getTime() - captured.getTime() > 60 * 1000) {
        const software = ifd0.Software || exif.Software;
        alerts.push({
            level: 'info', icon: '🛠️',
            text: `La fecha de modificación es posterior a la captura${software ? ` y aparece <strong>${escapeHtml(String(software))}</strong> como software` : ''}. La imagen probablemente fue editada.`
        });
    }

    alerts.forEach(a => {
        const div = document.createElement('div');
        div.className = `alert alert-${a.level}`;
        div.innerHTML = `<span class="alert-icon">${a.icon}</span><span class="alert-text">${a.text}</span>`;
        alertsContainerEl.appendChild(div);
    });
}

const groupConfig = {
    file:       { title: 'Archivo',                 icon: '📁' },
    pixeles:    { title: 'Análisis de píxeles',     icon: '🎨' },
    ifd0:       { title: 'IFD0 (TIFF principal)',   icon: '🏷️' },
    exif:       { title: 'EXIF',                    icon: '📷' },
    gps:        { title: 'GPS / Geolocalización',   icon: '📍' },
    interop:    { title: 'Interoperabilidad',       icon: '🔗' },
    thumbnail:  { title: 'Miniatura (IFD1)',        icon: '🖼️' },
    ifd1:       { title: 'IFD1',                    icon: '🖼️' },
    iptc:       { title: 'IPTC',                    icon: '📰' },
    xmp:        { title: 'XMP',                     icon: '🧬' },
    icc:        { title: 'Perfil ICC (color)',      icon: '🎨' },
    jfif:       { title: 'JFIF',                    icon: '📐' },
    ihdr:       { title: 'PNG (IHDR)',              icon: '🖼️' },
    makerNote:  { title: 'MakerNote',               icon: '🔧' },
    userComment:{ title: 'Comentarios de usuario',  icon: '💬' }
};

function renderMetadataReport(fileInfo, exifrData, pixelStats, thumbBlob) {
    metadataReportEl.innerHTML = '';

    addGroup('file', fileInfo);

    if (pixelStats) {
        const visible = { ...pixelStats };
        delete visible.__histR; delete visible.__histG; delete visible.__histB; delete visible.__dominantHex;
        addPixelGroup(visible, pixelStats);
    }

    if (thumbBlob) addThumbnailGroup(thumbBlob);

    const knownGroups = ['ifd0', 'exif', 'gps', 'interop', 'thumbnail', 'ifd1', 'iptc', 'xmp', 'icc', 'jfif', 'ihdr', 'makerNote', 'userComment'];
    knownGroups.forEach(key => {
        if (exifrData[key] && Object.keys(exifrData[key]).length > 0) {
            addGroup(key, exifrData[key]);
        }
    });

    Object.keys(exifrData).forEach(key => {
        if (!knownGroups.includes(key) && exifrData[key] && typeof exifrData[key] === 'object' && !Array.isArray(exifrData[key]) && !(exifrData[key] instanceof Uint8Array)) {
            if (Object.keys(exifrData[key]).length > 0) {
                addGroup(key, exifrData[key], { title: capitalize(key), icon: '🏷️' });
            }
        }
    });

    if (metadataReportEl.children.length <= 1) {
        const note = document.createElement('div');
        note.className = 'metadata-group';
        note.innerHTML = `
            <div class="metadata-group-header">
                <h3><span class="tag-icon">ℹ️</span> Sin metadatos extendidos</h3>
            </div>
            <div class="empty-msg">
                Esta imagen no contiene metadatos EXIF, IPTC, XMP ni otros datos extendidos.
                Solo se muestra la información básica del archivo.
            </div>
        `;
        metadataReportEl.appendChild(note);
    }
}

function addGroup(key, data, customConfig) {
    const config = customConfig || groupConfig[key] || { title: key, icon: '📋' };
    const entries = flattenEntries(data);

    if (entries.length === 0) return;

    const group = document.createElement('div');
    group.className = 'metadata-group';

    const header = document.createElement('div');
    header.className = 'metadata-group-header';
    header.innerHTML = `
        <h3>
            <span class="tag-icon">${config.icon}</span>
            ${escapeHtml(config.title)}
            <span class="count">(${entries.length})</span>
        </h3>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    `;
    header.addEventListener('click', () => group.classList.toggle('collapsed'));

    const table = document.createElement('table');
    table.className = 'metadata-table';
    const tbody = document.createElement('tbody');

    entries.forEach(([k, v]) => {
        const tr = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.textContent = k;
        const tdVal = document.createElement('td');
        tdVal.innerHTML = formatValue(k, v, data);
        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    group.appendChild(header);
    group.appendChild(table);

    if (key === 'gps' && data.latitude != null && data.longitude != null) {
        const mapsRow = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.textContent = 'Ver en mapa';
        const tdVal = document.createElement('td');
        const url = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
        tdVal.innerHTML = `<a class="gps-link" href="${escapeAttr(url)}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>`;
        mapsRow.appendChild(tdKey);
        mapsRow.appendChild(tdVal);
        tbody.appendChild(mapsRow);
    }

    metadataReportEl.appendChild(group);
}

function addPixelGroup(visible, full) {
    const config = groupConfig.pixeles;
    const group = document.createElement('div');
    group.className = 'metadata-group';

    const entryCount = Object.keys(visible).length;

    const header = document.createElement('div');
    header.className = 'metadata-group-header';
    header.innerHTML = `
        <h3>
            <span class="tag-icon">${config.icon}</span>
            ${config.title}
            <span class="count">(${entryCount})</span>
        </h3>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    `;
    header.addEventListener('click', () => group.classList.toggle('collapsed'));

    const table = document.createElement('table');
    table.className = 'metadata-table';
    const tbody = document.createElement('tbody');

    Object.entries(visible).forEach(([k, v]) => {
        const tr = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.textContent = k;
        const tdVal = document.createElement('td');
        if (k === 'Color dominante' || k === 'Color promedio (RGB)') {
            const swatch = k === 'Color dominante' ? full.__dominantHex : v;
            tdVal.innerHTML = `<span class="color-swatch" style="background:${escapeAttr(swatch)}"></span> ${escapeHtml(v)}`;
        } else {
            tdVal.textContent = v;
        }
        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    group.appendChild(header);
    group.appendChild(table);

    const histWrap = document.createElement('div');
    histWrap.className = 'histogram-wrap';
    histWrap.appendChild(buildHistogram('R', full.__histR, '#ef4444'));
    histWrap.appendChild(buildHistogram('G', full.__histG, '#10b981'));
    histWrap.appendChild(buildHistogram('B', full.__histB, '#3b82f6'));
    group.appendChild(histWrap);

    metadataReportEl.appendChild(group);
}

function buildHistogram(label, hist, color) {
    const max = Math.max(...hist);
    const wrap = document.createElement('div');
    wrap.className = 'histogram';
    const lbl = document.createElement('div');
    lbl.className = 'histogram-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
    const bars = document.createElement('div');
    bars.className = 'histogram-bars';
    hist.forEach(v => {
        const bar = document.createElement('div');
        bar.className = 'histogram-bar';
        bar.style.height = `${max > 0 ? (v / max) * 100 : 0}%`;
        bar.style.background = color;
        bars.appendChild(bar);
    });
    wrap.appendChild(bars);
    return wrap;
}

function addThumbnailGroup(blob) {
    const group = document.createElement('div');
    group.className = 'metadata-group';

    const header = document.createElement('div');
    header.className = 'metadata-group-header';
    header.innerHTML = `
        <h3>
            <span class="tag-icon">🖼️</span>
            Thumbnail EXIF embebido
            <span class="count">(${formatBytes(blob.size)})</span>
        </h3>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    `;
    header.addEventListener('click', () => group.classList.toggle('collapsed'));

    const body = document.createElement('div');
    body.className = 'thumbnail-body';
    const img = document.createElement('img');
    img.className = 'embedded-thumbnail';
    img.alt = 'Miniatura embebida en EXIF';
    img.src = URL.createObjectURL(blob);
    body.appendChild(img);

    group.appendChild(header);
    group.appendChild(body);
    metadataReportEl.appendChild(group);
}

function flattenEntries(obj, prefix = '') {
    const entries = [];
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v === null || v === undefined) continue;
        if (v instanceof Date) {
            entries.push([key, v]);
        } else if (v instanceof Uint8Array || ArrayBuffer.isView(v)) {
            entries.push([key, `<binario, ${v.byteLength} bytes>`]);
        } else if (Array.isArray(v)) {
            entries.push([key, v]);
        } else if (typeof v === 'object') {
            const nested = flattenEntries(v, key);
            if (nested.length > 0) entries.push(...nested);
            else entries.push([key, JSON.stringify(v)]);
        } else {
            entries.push([key, v]);
        }
    }
    return entries;
}

function formatValue(key, value, fullData) {
    if (value instanceof Date) {
        return escapeHtml(value.toLocaleString());
    }

    if (Array.isArray(value)) {
        if (value.length <= 8 && value.every(x => typeof x === 'number' || typeof x === 'string')) {
            return escapeHtml(value.join(', '));
        }
        return escapeHtml(JSON.stringify(value));
    }

    if (typeof value === 'number') {
        if (key.toLowerCase().includes('latitude') || key.toLowerCase().includes('longitude')) {
            return escapeHtml(value.toFixed(6) + '°');
        }
        if (Number.isInteger(value)) return value.toString();
        return value.toFixed(6).replace(/\.?0+$/, '');
    }

    if (typeof value === 'string') {
        if (/^https?:\/\//i.test(value)) {
            return `<a class="gps-link" href="${escapeAttr(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`;
        }
        return escapeHtml(value);
    }

    if (typeof value === 'boolean') return value ? 'Sí' : 'No';

    return escapeHtml(String(value));
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return escapeHtml(s);
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function showError(msg) {
    errorMsgEl.textContent = msg;
    errorMsgEl.classList.remove('hidden');
    resultsSection.classList.add('hidden');
}
