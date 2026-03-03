# RaspDownloader

Web app (frontend + backend Python) per scaricare contenuti da piattaforme supportate da `yt-dlp` (YouTube, Instagram, TikTok, Facebook, Reddit, ecc.).

## Requisiti

- Python 3.11+
- `ffmpeg` installato e disponibile nel `PATH` (serve per merge video+audio e conversioni audio)

## Avvio rapido (sviluppo)

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows
# .venv\\Scripts\\activate
pip install -r requirements.txt
python app.py
```

App disponibile su:

- `http://localhost:8000`
- `http://<ip-dispositivo>:8000`

## Installazione su Raspberry Pi (consigliata)

### 1. Pacchetti di sistema

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip ffmpeg
```

### 2. Clone del repository

```bash
cd /home/pi
git clone https://github.com/ptr-cln/RaspDownloader.git
cd RaspDownloader
```

### 3. Ambiente Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Verifica FFmpeg e PATH

```bash
which ffmpeg
ffmpeg -version
```

Con installazione da `apt`, di solito `ffmpeg` e gia in `/usr/bin` ed e gia nel `PATH`.

Se non viene trovato, aggiungi il PATH nella shell:

```bash
echo 'export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Esecuzione continua e auto-avvio al riavvio (systemd)

Nel repository e presente il file di servizio:

- `deploy/raspdownloader.service`

### 1. Adatta utente e path (se non usi `pi`)

Apri il file e modifica:

- `User=`
- `Group=`
- `WorkingDirectory=`
- `Environment="PATH=..."`
- `ExecStart=`

### 2. Installa il servizio

```bash
sudo cp deploy/raspdownloader.service /etc/systemd/system/raspdownloader.service
sudo systemctl daemon-reload
sudo systemctl enable raspdownloader
sudo systemctl start raspdownloader
```

### 3. Controllo stato/log

```bash
sudo systemctl status raspdownloader
sudo journalctl -u raspdownloader -f
```

Dopo il riavvio del Raspberry, il servizio parte automaticamente.

## Accesso da altri dispositivi in rete

Trova l'IP del Raspberry:

```bash
hostname -I
```

Poi apri da PC/telefono:

- `http://<ip-raspberry>:8000`

## Avvertenza legale

Usa il tool solo per contenuti che hai diritto a scaricare, rispettando termini di servizio e copyright delle piattaforme.
