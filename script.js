const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resultsSection = document.getElementById('resultsSection');
const previewImage = document.getElementById('previewImage');
const fileNameEl = document.getElementById('fileName');
const basicInfoEl = document.getElementById('basicInfo');
const metadataReportEl = document.getElementById('metadataReport');
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

    if (!file.type.startsWith('image/')) {
        showError('El archivo seleccionado no es una imagen válida.');
        return;
    }

    lastFileName = file.name;
    previewImage.src = URL.createObjectURL(file);
    fileNameEl.textContent = file.name;

    const dimensions = await getImageDimensions(file);

    let exifrData = {};
    try {
        exifrData = await exifr.parse(file, {
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
    }

    const fileInfo = {
        'Nombre del archivo': file.name,
        'Tipo MIME': file.type || 'desconocido',
        'Tamaño': formatBytes(file.size),
        'Tamaño en bytes': file.size.toLocaleString(),
        'Última modificación': file.lastModified ? new Date(file.lastModified).toLocaleString() : 'N/A',
        'Ancho (px)': dimensions.width,
        'Alto (px)': dimensions.height,
        'Resolución (MP)': dimensions.width && dimensions.height
            ? ((dimensions.width * dimensions.height) / 1000000).toFixed(2)
            : 'N/A',
        'Relación de aspecto': dimensions.width && dimensions.height
            ? simplifyRatio(dimensions.width, dimensions.height)
            : 'N/A'
    };

    renderBasicInfo(fileInfo);

    lastMetadata = {
        archivo: fileInfo,
        ...exifrData
    };

    renderMetadataReport(fileInfo, exifrData);

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const fieldsToShow = ['Tipo MIME', 'Tamaño', 'Ancho (px)', 'Alto (px)', 'Resolución (MP)'];
    fieldsToShow.forEach(key => {
        const div = document.createElement('div');
        div.className = 'basic-info-item';
        div.innerHTML = `<span class="label">${key}</span><span class="value">${info[key] ?? 'N/A'}</span>`;
        basicInfoEl.appendChild(div);
    });
}

const groupConfig = {
    file:       { title: 'Archivo',                 icon: '📁' },
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

function renderMetadataReport(fileInfo, exifrData) {
    metadataReportEl.innerHTML = '';

    addGroup('file', fileInfo);

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
            ${config.title}
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
