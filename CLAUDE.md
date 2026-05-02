# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page static web app (Spanish UI) that reads EXIF/IPTC/XMP/ICC/etc. metadata from an image entirely in the browser — nothing is uploaded to a server. The README describes it as: "Sitio web que imprime la metadata de una imagen".

## Running

No build, no package manager, no tests. Open `index.html` directly, or serve the directory:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

The `exifr` library is loaded from a CDN (`cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js`) — an internet connection is required for parsing to work.

## Architecture

Three flat files, no modules, no bundler:

- `index.html` — markup, CDN script tag for `exifr`, then `script.js`
- `styles.css` — dark theme, CSS custom properties on `:root`
- `script.js` — all behavior in plain DOM globals (no classes, no modules)

### Data flow in `script.js`

1. `handleFile(file)` is the single entry point for both drop and file-input events.
2. It calls `getImageDimensions()` (uses an `Image` element + `URL.createObjectURL`) in parallel-ish with `exifr.parse(file, {...})`. The exifr options enable every segment type (`tiff`, `xmp`, `icc`, `iptc`, `jfif`, `ihdr`, `gps`, `interop`, `exif`, `makerNote`, `userComment`) and crucially set `mergeOutput: false` so groups stay separated by segment.
3. `renderMetadataReport()` iterates a fixed `knownGroups` order first (so the report has consistent section order), then falls through to any unknown object-typed groups exifr returned.
4. `addGroup()` builds a collapsible table per group via `flattenEntries()`, which recursively flattens nested objects into dotted keys and stringifies binary blobs (`Uint8Array` / `ArrayBuffer` views) as `<binario, N bytes>`.
5. The GPS group gets a special-cased "Open in Google Maps" row appended after the table when `latitude` and `longitude` are present.
6. `lastMetadata` holds the merged `{ archivo, ...exifrData }` object for the JSON export button.

### Conventions worth preserving

- All user-visible strings are Spanish — keep new UI text in Spanish.
- `formatValue()` does the type-aware rendering (Date → locale string, lat/long → 6 decimals + °, http(s) strings → anchor tag, etc.). Add new value-type handling here, not in `addGroup`.
- `escapeHtml` / `escapeAttr` are used everywhere user/EXIF-derived strings hit `innerHTML`. Any new code that injects metadata into the DOM should go through them too.
- Group titles and icons live in the `groupConfig` object near the top of the rendering section — add a new entry there when supporting a new exifr segment, and append the key to `knownGroups` in `renderMetadataReport()` to control its position.
