# RaspDownloader

Web app (frontend + backend Python) per scaricare contenuti da piattaforme supportate da `yt-dlp` (YouTube, Instagram, TikTok, Facebook, Reddit, ecc.).

## Requisiti

- Python 3.11+
- `ffmpeg` installato e disponibile nel `PATH` (necessario per conversione audio)

## Installazione

```bash
python -m venv .venv
. .venv/bin/activate  # Linux/macOS
# oppure su Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

## Avvio

```bash
python app.py
```

L'app sara disponibile su:

- `http://localhost:8000`
- in LAN (utile su Raspberry): `http://<ip-raspberry>:8000`

## Flusso utente

1. Inserisci URL del contenuto.
2. Premi `Analizza` per vedere i formati disponibili.
3. Scegli `Video` o `Audio`.
4. Scarica il file nel formato selezionato.

## Note Raspberry Pi Zero

- Per prestazioni migliori usa Raspberry Pi OS Lite.
- Su contenuti lunghi, conversioni audio (es. `wav`, `flac`) possono richiedere tempo.
- Verifica spazio libero su disco e connettivita stabile.

## Avvertenza legale

Usa questo tool solo per contenuti che hai diritto a scaricare, rispettando termini di servizio e copyright della piattaforma.
