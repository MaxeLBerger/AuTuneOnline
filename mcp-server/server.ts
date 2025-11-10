import 'dotenv/config';
import express from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
// Neue Imports für zusätzliche Tools
// Dynamische Imports für optionale Tools (vermeidet Typs-Probleme vor Installation)
// Wir verwenden type-only Deklarationen um Node Builtins zuzulassen.
// Lighthouse & audio-decode werden später per dynamic import geladen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dynamicModules: Record<string, any> = {};
async function ensureDynamic(name: string) {
  if (!dynamicModules[name]) {
    dynamicModules[name] = await import(name);
  }
  return dynamicModules[name];
}
import fg from 'fast-glob';
import { promises as fsp } from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';

// Basic configuration
// Projektwurzel: Verwende Arbeitsverzeichnis, da Skript über npm aus dem Repo-Root gestartet wird
const PROJECT_ROOT = process.cwd();
const VISUALIZER_FILE = path.join(PROJECT_ROOT, 'public', 'app.js');
const README_FILE = path.join(PROJECT_ROOT, 'README.md');

// Initialise MCP server
const server = new McpServer({
  name: 'autune-mcp-server',
  version: '1.0.0'
});

// Helper: run shell command and return output
function runCommand(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    exec(cmd, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
      resolve({ stdout, stderr: err ? (stderr || err.message) : stderr, code: err?.code ?? 0 });
    });
  });
}

// Tool: list files by glob pattern
server.registerTool(
  'list_files',
  {
    title: 'Dateien auflisten',
    description: 'Listet Projektdateien anhand eines Glob-Patterns auf.',
    inputSchema: { pattern: z.string().default('**/*') },
    outputSchema: {
      count: z.number(),
      files: z.array(z.object({ relative: z.string(), absolute: z.string() }))
    }
  },
  async ({ pattern }) => {
    const entries = await fg(pattern, { cwd: PROJECT_ROOT, dot: true, ignore: ['node_modules/**', '.git/**'] });
    const files = entries.map(e => ({ relative: e, absolute: path.join(PROJECT_ROOT, e) }));
    const output = { count: files.length, files };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output
    };
  }
);

// Tool: read a file (truncated if large)
server.registerTool(
  'read_file',
  {
    title: 'Datei lesen',
    description: 'Liest den Inhalt einer Datei (ggf. gekürzt ab 50KB).',
    inputSchema: { path: z.string() },
    outputSchema: { path: z.string(), truncated: z.boolean(), content: z.string() }
  },
  async ({ path: rel }) => {
    const target = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
  const raw = await fsp.readFile(target, 'utf8');
    const truncated = raw.length > 50_000;
    const content = truncated ? raw.slice(0, 50_000) + '\n<!-- TRUNCATED -->' : raw;
    const output = { path: target, truncated, content };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

// Tool: create GitHub issue
server.registerTool(
  'create_github_issue',
  {
    title: 'GitHub Issue erstellen',
    description: 'Erstellt ein Issue im angegebenen Repository (benötigt GITHUB_TOKEN).',
    inputSchema: {
      owner: z.string(),
      repo: z.string(),
      title: z.string(),
      body: z.string().default(''),
      labels: z.array(z.string()).optional()
    },
    outputSchema: {
      url: z.string(),
      number: z.number(),
      repository: z.string()
    }
  },
  async ({ owner, repo, title, body, labels }) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      const msg = 'Fehlender GITHUB_TOKEN in .env – kann kein Issue erstellen.';
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
    const octokit = new Octokit({ auth: token });
    const issue = await octokit.rest.issues.create({ owner, repo, title, body, labels });
    const output = { url: issue.data.html_url, number: issue.data.number, repository: `${owner}/${repo}` };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// Tool: commit & push changes
server.registerTool(
  'commit_and_push',
  {
    title: 'Git Commit & Push',
    description: 'Fügt Änderungen hinzu, commitet und pusht auf den aktuellen Branch.',
    inputSchema: {
      message: z.string().default('Automated MCP commit'),
      addPattern: z.string().default('.')
    },
    outputSchema: {
      steps: z.array(z.object({ command: z.string(), exitCode: z.number(), stderr: z.string(), stdout: z.string() }))
    }
  },
  async ({ message, addPattern }) => {
    const results: { command: string; exitCode: number; stdout: string; stderr: string }[] = [];
    for (const cmd of [
      `git add ${addPattern}`,
      `git commit -m "${message.replace(/"/g, '"')}" || echo \"No changes to commit\"`,
      'git push'
    ]) {
      const r = await runCommand(cmd);
      results.push({ command: cmd, exitCode: r.code, stdout: r.stdout, stderr: r.stderr });
    }
    const output = { steps: results };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// Tool: suggest improvements for visualizer
server.registerTool(
  'suggest_visualizer_improvements',
  {
    title: 'Verbesserungsvorschläge Visualizer',
    description: 'Analysiert public/app.js und schlägt Performance/Code-Verbesserungen vor.',
    inputSchema: {},
    outputSchema: {
      suggestions: z.array(z.string())
    }
  },
  async () => {
    let code = '';
  try { code = await fsp.readFile(VISUALIZER_FILE, 'utf8'); } catch { /* ignore */ }
    const suggestions: string[] = [];
    if (!code) suggestions.push('Datei public/app.js konnte nicht gelesen werden.');
    // Heuristic checks
    if (code.includes('requestAnimationFrame')) {
      suggestions.push('Nutze OffscreenCanvas oder WebWorker für rechenintensive Zeichenlogik, um Hauptthread zu entlasten.');
    }
    if (code.includes('Particle')) {
      suggestions.push('Partikel-Array könnte durch Recycling (Object Pool) Speicherallocs reduzieren.');
    }
    if (!code.includes('resizeCanvasToDisplaySize')) {
      suggestions.push('Canvas-Größenanpassung fehlt – stelle sicher, dass Auflösung dynamisch ist.');
    } else {
      suggestions.push('Ergänze devicePixelRatio-Unterstützung für schärfere Darstellung auf High-DPI Displays.');
    }
    suggestions.push('Überlege Frequency-Smoothing (analyser.smoothingTimeConstant) zur Reduktion von Flackern.');
    suggestions.push('BPM: Erwäge robustere Erkennung (z.B. MusicTempo oder WebAudio Beat Tracking) statt einfache Mittelwerte.');
    suggestions.push('Farbschemata: Cache berechnete Farbwerte pro Frame, statt HSL->RGB jedes Mal neu zu berechnen.');
    suggestions.push('Nutze FFT-Größenanpassung dynamisch je nach Performance (256/512/1024).');
    suggestions.push('Füge Tooltips/Hilfetexte für UI-Controls hinzu, um UX zu verbessern.');
    const output = { suggestions };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// ========== FORMAT CODE (Prettier) ==========
server.registerTool(
  'format_code',
  {
    title: 'Code formatieren',
    description: 'Formatiert eine Datei mit Prettier (benötigt Prettier in den Dependencies).',
    inputSchema: { path: z.string() },
    outputSchema: { formatted: z.boolean(), message: z.string() }
  },
  async ({ path: rel }) => {
    const target = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
  const prettier = await ensureDynamic('prettier');
  const content = await fsp.readFile(target, 'utf8');
    const config = await prettier.resolveConfig(target);
    const formatted = await prettier.format(content, { ...(config || {}), filepath: target });
    if (formatted !== content) {
  await fsp.writeFile(target, formatted, 'utf8');
      const output = { formatted: true, message: 'Datei formatiert.' };
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
    }
    const output = { formatted: false, message: 'Keine Änderungen nötig.' };
    return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
  }
);

// ========== LIGHTHOUSE AUDIT ==========
server.registerTool(
  'lighthouse_audit',
  {
    title: 'Lighthouse Audit',
    description: 'Führt einen Lighthouse Audit gegen eine URL aus (headless Chrome erforderlich).',
    inputSchema: { url: z.string().url(), categories: z.array(z.enum(['performance','accessibility','best-practices','seo'])).optional() },
    outputSchema: { scores: z.record(z.number()), warnings: z.array(z.string()).optional() }
  },
  async ({ url, categories }) => {
  const { launch } = await ensureDynamic('chrome-launcher');
  const lighthouse = await ensureDynamic('lighthouse');
  const chrome = await launch({ chromeFlags: ['--headless'] });
    try {
  const result = await lighthouse.default(url, { port: chrome.port, onlyCategories: categories });
      const scores: Record<string, number> = {};
      for (const cat of Object.values(result.lhr.categories) as any[]) {
        if (cat && cat.id) scores[cat.id] = cat.score;
      }
      const output = { scores, warnings: result.lhr.runWarnings };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    } finally {
      await chrome.kill();
    }
  }
);

// ========== ANALYZE BPM ==========
server.registerTool(
  'analyze_bpm',
  {
    title: 'BPM analysieren',
    description: 'Analysiert BPM einer Audiodatei mittels einfacher Onset-Erkennung & MusicTempo.',
    inputSchema: { path: z.string() },
    outputSchema: { bpm: z.number(), confidence: z.number(), onsets: z.array(z.number()) }
  },
  async ({ path: rel }) => {
    const target = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
  const buffer = await fsp.readFile(target);
  const audioDecode = await ensureDynamic('audio-decode');
  const audioBuffer = await audioDecode.default(buffer);
    const channelData = audioBuffer.getChannelData(0);
    const frameSize = 1024;
    const hop = 512;
    const energies: number[] = [];
    for (let i = 0; i < channelData.length - frameSize; i += hop) {
      let sum = 0;
      for (let j = i; j < i + frameSize; j++) sum += channelData[j] * channelData[j];
      energies.push(sum / frameSize);
    }
    const window = 43;
    const avg: number[] = [];
    for (let i = 0; i < energies.length; i++) {
      let s = 0; let c = 0;
      for (let w = Math.max(0, i - window); w < Math.min(energies.length, i + window); w++) { s += energies[w]; c++; }
      avg.push(s / c);
    }
    const onsets: number[] = [];
    for (let i = 1; i < energies.length; i++) {
      if (energies[i] > avg[i] * 1.3 && energies[i] > energies[i - 1]) {
        const time = (i * hop) / audioBuffer.sampleRate;
        onsets.push(time);
      }
    }
    const MusicTempo = (await import('music-tempo')).default;
    const mt = new MusicTempo(onsets);
    const output = { bpm: mt.tempo || 0, confidence: (mt.candidates?.[0]?.score || 0), onsets };
    return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
  }
);

// ========== OPEN PULL REQUEST ==========
server.registerTool(
  'open_pull_request',
  {
    title: 'Pull Request öffnen',
    description: 'Erstellt einen Pull Request zwischen Branches (benötigt GITHUB_TOKEN & GITHUB_REPO).',
    inputSchema: { title: z.string(), body: z.string().optional(), base: z.string().default('main'), head: z.string().default('main') },
    outputSchema: { url: z.string() }
  },
  async ({ title, body, base, head }) => {
    const token = process.env.GITHUB_TOKEN;
    const repoFull = process.env.GITHUB_REPO;
    if (!token || !repoFull) {
      const msg = 'Fehlende Umgebungsvariablen GITHUB_TOKEN oder GITHUB_REPO.';
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
    const [owner, repo] = repoFull.split('/');
    const octokit = new Octokit({ auth: token });
  const pr = await octokit.rest.pulls.create({ owner, repo, title, body, base, head });
    const output = { url: pr.data.html_url };
    return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
  }
);

// Resource: visualizer code
server.registerResource(
  'visualizer_code',
  new ResourceTemplate('file://visualizer/{name}', { list: undefined }),
  {
    title: 'Visualizer Source',
    description: 'Quelltext des Visualizers'
  },
  async (_uri, { name }) => {
    const target = name === 'app' ? VISUALIZER_FILE : README_FILE;
  const text = await fsp.readFile(target, 'utf8');
    return { contents: [{ uri: `file://visualizer/${name}`, text }] };
  }
);

// Prompt: review visualizer
server.registerPrompt(
  'review-visualizer',
  {
    title: 'Code Review Visualizer',
    description: 'Erstellt eine Review-Nachricht basierend auf app.js',
    argsSchema: {}
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: 'Bitte analysiere den Audio-Visualizer Code (app.js) und schlage konkrete Performance- und Qualitätsverbesserungen vor.' }
      }
    ]
  })
);

// Express + HTTP transport
const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP Fehler:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

const PORT = parseInt(process.env.MCP_PORT || '3333');
app.listen(PORT, () => {
  console.log(`AuTune MCP Server läuft auf http://localhost:${PORT}/mcp`);
});
