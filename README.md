# Audio Visualizer Pro

Ein professionelles Audio-Visualisierungs-Tool, das:

- MP3-Upload (per Drag & Drop oder File-Dialog)
- Frequenzanalyse via Web Audio API
- BPM-Erkennung
- Visuelle Effekte (Bars + Partikel)

## Quick Start

# Installieren
npm install

# Starten
npm start

# Im Browser öffnen
http://localhost:3000

# Features
1. BPM Detection – erkennt das ungefähre Tempo eines Songs.
2. Frequenz-Bars – Live-Audio-Spektrum wird animiert dargestellt.
3. Partikel-Effekt – reagiert auf Bass und BPM.

# ToDos / Erweiterungen
- Verschiedene Themes/Layouts
- Komplexere BPM-Algorithmen oder Integration von externen Services
- Speichern hochgeladener Files auf dem Server
- Benutzerverwaltung, Playlists, etc.

# Lizenz
MIT

---

## Schlusswort

Damit hast du eine **vollständige**, **professionell strukturierte** Webanwendung, die du nach Belieben erweitern kannst – das Grundgerüst ist bereits „marktfähig“ in dem Sinne, dass  
1. Das **UI** modern und klar strukturiert ist,  
2. **Drag & Drop** und BPM-Erkennung ein wirklich **cooles** Feature-Set bieten,  
3. Du jederzeit **Skalieren** kannst (z.B. Datenbank, Cloud-Deploy, erweiterte Visuals etc.).  

> **Tipp**: In einem **echten Produktions-Setup** würde man die BPM-Erkennung wahrscheinlich ins Backend (Node.js) legen, da es im Browser teils performancekritisch ist. Man könnte die PCM-Daten (via `ArrayBuffer`) an einen `/analyze`-Endpoint senden, dort `music-tempo` anwenden, das Ergebnis (BPM) zurücksenden und es für die Visualisierung verwenden.  

Viel Erfolg beim **Finalisieren** – du hast jetzt eine **umfangreiche** Codebasis, die deinen Usern schon echt was hermacht!