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

## MCP Server (Model Context Protocol)

Dieser Workspace enthält einen MCP-Server, der dem Agent (z. B. VS Code Copilot, Claude Code, MCP Inspector) Tools bereitstellt, um den Visualizer zu verbessern und Aufgaben auf GitHub zu automatisieren.

### Starten

- .env ausfüllen (GITHUB_TOKEN, optional MCP_PORT):
	- `GITHUB_TOKEN` mit Repo-Berechtigungen: Issues: write, Contents: write
- Server starten:
	- `npm run mcp`
	- Standard-URL: `http://localhost:3333/mcp`

### Verfügbare Tools

- `list_files(pattern)`: Listet Dateien per Glob.
- `read_file(path)`: Liest Dateiinhalt (ggf. gekürzt).
- `suggest_visualizer_improvements()`: Heuristische Verbesserungsvorschläge zu `public/app.js`.
- `create_github_issue(owner, repo, title, body?, labels?)`: Erstellt ein Issue per GitHub REST API.
- `commit_and_push(message?, addPattern?)`: Führt `git add`, `commit`, `push` aus (setzt konfigurierten Origin & Auth voraus).

### Verbindung in VS Code (MCP-kompatibel)

Wenn Ihre VS Code Version MCP-Server unterstützt, können Sie den Server via HTTP registrieren. Beispiel über die VS Code CLI:

```
code --add-mcp "{\"name\":\"autune\",\"type\":\"http\",\"url\":\"http://localhost:3333/mcp\"}"
```

Alternativen:
- MCP Inspector: `npx @modelcontextprotocol/inspector` und dann die URL `http://localhost:3333/mcp` verbinden.
- Claude Code / Cursor: Entsprechende UI nutzen, HTTP-MCP Endpoint hinzufügen.

# Features
1. BPM Detection – erkennt das ungefähre Tempo eines Songs.
2. Frequenz-Bars – Live-Audio-Spektrum wird animiert dargestellt.
3. Partikel-Effekt – reagiert auf Bass und BPM.

# ToDos / Erweiterungen
- Verschiedene Themes/Layouts
- Komplexere BPM-Algorithmen oder Integration von externen Services
- Speichern hochgeladener Files auf dem Server
- Benutzerverwaltung, Playlists, etc.
 - MCP-Tool: Pull Requests erstellen (Branching + Octokit PR API)
 - MCP-Tool: Prettier/Lint Fix ausführen
 - MCP-Tool: Lighthouse Audit der Seite

# Lizenz
MIT

---

## Schlusswort

Damit hast du eine **vollständige**, **professionell strukturierte** Webanwendung, die du nach Belieben erweitern kannst – das Grundgerüst ist bereits „marktfähig“ in dem Sinne, dass  
1. Das **UI** modern und klar strukturiert ist,  
2. **Drag & Drop** und BPM-Erkennung ein wirklich **cooles** Feature-Set bieten,  
3. Du jederzeit **Skalieren** kannst (z.B. Datenbank, Cloud-Deploy, erweiterte Visuals etc.).  

> **Tipp**: In einem **echten Produktions-Setup** würde man die BPM-Erkennung wahrscheinlich ins Backend (Node.js) legen, da es im Browser teils performancekritisch ist. Man könnte die PCM-Daten (via `ArrayBuffer`) an einen `/analyze`-Endpoint senden, dort `music-tempo` anwenden, das Ergebnis (BPM) zurücksenden und es für die Visualisierung verwenden.  

Viel Erfolg beim **Finalisieren** – du hast jetzt eine **umfangreiche** Codebasis, die deinen Usern schon echt was hermacht!Test auto-update after workflow fix
