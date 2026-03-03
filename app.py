from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from flask import Flask, after_this_request, jsonify, render_template, request, send_file
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_AUDIO_OUTPUTS = ["mp3", "m4a", "opus", "wav", "flac"]
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)
TEMP_FORMAT_PATTERN = re.compile(r"\.f\d+$")


def create_app() -> Flask:
    app = Flask(__name__)

    @app.route("/")
    def index() -> str:
        return render_template("index.html")

    @app.post("/api/formats")
    def get_formats() -> Any:
        payload = request.get_json(silent=True) or {}
        url = (payload.get("url") or "").strip()

        if not url or not URL_PATTERN.match(url):
            return jsonify({"error": "Inserisci un URL valido (http/https)."}), 400

        try:
            details = extract_media_details(url)
            return jsonify(details)
        except DownloadError as exc:
            return jsonify({"error": f"Impossibile leggere l'URL: {exc}"}), 400
        except Exception:
            return jsonify({"error": "Errore interno durante l'analisi del link."}), 500

    @app.post("/api/download")
    def download_media() -> Any:
        payload = request.get_json(silent=True) or {}
        url = (payload.get("url") or "").strip()
        mode = (payload.get("mode") or "video").strip().lower()
        format_id = str(payload.get("format_id") or "").strip()
        audio_ext = str(payload.get("audio_ext") or "mp3").strip().lower()

        if not url or not URL_PATTERN.match(url):
            return jsonify({"error": "URL non valido."}), 400

        if mode not in {"video", "audio"}:
            return jsonify({"error": "Modalita non supportata."}), 400

        if mode == "audio" and audio_ext not in SUPPORTED_AUDIO_OUTPUTS:
            return jsonify({"error": "Formato audio non supportato."}), 400

        if mode == "video" and not format_id:
            return jsonify({"error": "Seleziona un formato video."}), 400

        token = uuid.uuid4().hex[:10]
        output_template = str(DOWNLOAD_DIR / f"%(title).160B-{token}.%(ext)s")

        ydl_opts: dict[str, Any] = {
            "noplaylist": True,
            "quiet": True,
            "outtmpl": output_template,
        }

        if mode == "video":
            selected_format = fetch_video_format_info(url, format_id)
            has_audio = selected_format["acodec"] != "none"
            selected_ext = selected_format["ext"]

            if has_audio:
                ydl_opts["format"] = format_id
                if selected_ext != "mp4":
                    ydl_opts["postprocessors"] = [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}]
            else:
                ydl_opts["format"] = (
                    f"{format_id}+bestaudio[ext=m4a]/"
                    f"{format_id}+bestaudio[acodec^=mp4a]/"
                    f"{format_id}+bestaudio[acodec^=aac]"
                )
                ydl_opts["merge_output_format"] = "mp4"
        else:
            ydl_opts["format"] = "bestaudio/best"
            ydl_opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": audio_ext,
                    "preferredquality": "192",
                }
            ]

        try:
            with YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(url, download=True)
        except DownloadError as exc:
            message = str(exc)
            if "ffmpeg is not installed" in message.lower():
                message = (
                    "FFmpeg non trovato. Per MP4 con audio e conversioni audio installa ffmpeg e "
                    "verifica che sia nel PATH."
                )
            if "requested format is not available" in message.lower():
                message = "Formato non disponibile con audio compatibile MP4. Prova un altro formato video."
            return jsonify({"error": f"Download fallito: {message}"}), 400
        except Exception:
            return jsonify({"error": "Errore interno durante il download."}), 500

        downloaded_file = resolve_downloaded_file(token, mode, audio_ext)
        if not downloaded_file:
            return jsonify({"error": "Nessun file finale valido trovato dopo il download."}), 500

        @after_this_request
        def cleanup(response: Any) -> Any:
            try:
                downloaded_file.unlink(missing_ok=True)
            except OSError:
                pass
            return response

        return send_file(downloaded_file, as_attachment=True, download_name=downloaded_file.name)

    return app


def extract_media_details(url: str) -> dict[str, Any]:
    opts = {
        "noplaylist": True,
        "skip_download": True,
        "quiet": True,
    }

    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not info:
        raise DownloadError("Nessuna informazione disponibile per questo URL.")

    if "entries" in info and info["entries"]:
        info = info["entries"][0]

    formats = info.get("formats") or []
    video_formats: list[dict[str, Any]] = []
    audio_formats: list[dict[str, Any]] = []

    for fmt in formats:
        format_id = fmt.get("format_id")
        if not format_id:
            continue

        filesize = fmt.get("filesize") or fmt.get("filesize_approx")
        filesize_mb = round(filesize / (1024 * 1024), 1) if filesize else None

        vcodec = fmt.get("vcodec") or "none"
        acodec = fmt.get("acodec") or "none"

        if vcodec != "none":
            height = fmt.get("height")
            width = fmt.get("width")
            resolution = f"{width}x{height}" if width and height else (fmt.get("resolution") or "N/D")
            fps = fmt.get("fps")

            video_formats.append(
                {
                    "format_id": str(format_id),
                    "ext": fmt.get("ext") or "n/a",
                    "resolution": resolution,
                    "height": height or 0,
                    "fps": fps,
                    "filesize_mb": filesize_mb,
                    "note": fmt.get("format_note") or "",
                    "vcodec": vcodec,
                    "acodec": acodec,
                    "has_audio": acodec != "none",
                    "tbr": fmt.get("tbr") or 0,
                }
            )

        if acodec != "none":
            audio_formats.append(
                {
                    "format_id": str(format_id),
                    "ext": fmt.get("ext") or "n/a",
                    "abr": fmt.get("abr") or 0,
                    "asr": fmt.get("asr") or 0,
                    "filesize_mb": filesize_mb,
                    "note": fmt.get("format_note") or "",
                    "acodec": acodec,
                    "tbr": fmt.get("tbr") or 0,
                }
            )

    video_formats.sort(key=lambda item: (item["has_audio"], item["height"], item["tbr"]), reverse=True)
    audio_formats.sort(key=lambda item: (item["abr"], item["tbr"]), reverse=True)

    title = info.get("title") or "Titolo sconosciuto"

    return {
        "title": title,
        "duration": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel") or "Sconosciuto",
        "thumbnail": info.get("thumbnail"),
        "platform": info.get("extractor_key") or info.get("extractor") or "N/D",
        "video_formats": dedupe_by_key(video_formats, "format_id"),
        "audio_formats": dedupe_by_key(audio_formats, "format_id"),
    }


def dedupe_by_key(items: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    seen = set()
    unique: list[dict[str, Any]] = []

    for item in items:
        key_value = item.get(key)
        if key_value in seen:
            continue
        seen.add(key_value)
        unique.append(item)

    return unique


def fetch_video_format_info(url: str, format_id: str) -> dict[str, str]:
    opts = {
        "noplaylist": True,
        "skip_download": True,
        "quiet": True,
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if "entries" in info and info["entries"]:
        info = info["entries"][0]

    for fmt in info.get("formats") or []:
        if str(fmt.get("format_id")) != format_id:
            continue
        vcodec = (fmt.get("vcodec") or "none").strip()
        if vcodec == "none":
            continue
        return {
            "ext": str(fmt.get("ext") or "").lower(),
            "acodec": str(fmt.get("acodec") or "none").lower(),
        }

    raise DownloadError("Formato video selezionato non trovato.")


def resolve_downloaded_file(token: str, mode: str, audio_ext: str) -> Path | None:
    candidates = sorted(
        DOWNLOAD_DIR.glob(f"*-{token}.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        return None

    valid_candidates = [
        path
        for path in candidates
        if not path.name.endswith(".part") and not path.name.endswith(".ytdl")
    ]
    if not valid_candidates:
        return None

    if mode == "video":
        preferred_video = [
            path
            for path in valid_candidates
            if path.suffix.lower() == ".mp4" and not TEMP_FORMAT_PATTERN.search(path.stem)
        ]
        if preferred_video:
            return preferred_video[0]

    if mode == "audio":
        expected_suffix = f".{audio_ext.lower()}"
        preferred_audio = [
            path
            for path in valid_candidates
            if path.suffix.lower() == expected_suffix and not TEMP_FORMAT_PATTERN.search(path.stem)
        ]
        if preferred_audio:
            return preferred_audio[0]

    clean_fallback = [path for path in valid_candidates if not TEMP_FORMAT_PATTERN.search(path.stem)]
    return clean_fallback[0] if clean_fallback else valid_candidates[0]


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
