import 'dotenv/config';
import express from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';

// Basic configuration
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..'));
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
    const raw = await readFile(target, 'utf8');
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
    try { code = await readFile(VISUALIZER_FILE, 'utf8'); } catch { /* ignore */ }
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
    const text = await readFile(target, 'utf8');
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
