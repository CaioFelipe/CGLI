#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const port = process.env.CGLI_BRIDGE_PORT || 41732;
const nodeId = process.env.CGLI_NODE_ID || '';
const workspacePath = process.env.CGLI_WORKSPACE_PATH || process.cwd();

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(argsList) {
  const flags = {};
  for (let i = 0; i < argsList.length; i++) {
    const item = argsList[i];
    if (/^--[a-zA-Z][\w-]*=/.test(item)) {
      const idx = item.indexOf('=');
      flags[item.slice(2, idx)] = item.slice(idx + 1);
    } else if (/^--[a-zA-Z][\w-]*$/.test(item)) {
      const key = item.slice(2);
      const next = argsList[i + 1];
      if (next !== undefined && !/^--[a-zA-Z][\w-]*(=|$)/.test(next)) {
        flags[key] = argsList[++i];
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => resolve(data));
  });
}

function post(endpoint, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: Number(port),
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          resolve({ raw: body });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const flags = parseArgs(args.slice(1));

  switch (command) {
    case 'spawn-subagent': {
      const childType = flags.type || 'agy';
      const role = flags.role || (childType === 'claude' ? 'planner' : 'executor');
      const task = flags.task || '';
      try {
        await post('/api/spawn-subagent', {
          parent_node_id: nodeId,
          child_type: childType,
          role,
          task
        });
        console.log(`[CGLI] Subagente ${childType.toUpperCase()} invocado com sucesso no canvas.`);
      } catch (err) {
        console.error(`[CGLI Erro] Falha ao invocar subagente:`, err.message);
        process.exit(1);
      }
      break;
    }

    case 'create-artifact': {
      const title = flags.title || 'Documento de Artefato';
      let content = flags.content || '';
      if (flags.stdin) {
        content = await readStdin();
      } else if (flags.file) {
        const filePath = path.resolve(workspacePath, String(flags.file));
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf8');
        } else {
          console.error(`[CGLI Erro] Arquivo '${flags.file}' não foi encontrado no workspace.`);
          process.exit(1);
        }
      }
      try {
        await post('/api/create-artifact', {
          parent_node_id: nodeId,
          title,
          content
        });
        console.log(`[CGLI] Nó de artefato '${title}' criado com sucesso no canvas.`);
      } catch (err) {
        console.error(`[CGLI Erro] Falha ao criar artefato:`, err.message);
        process.exit(1);
      }
      break;
    }

    case 'create-preview': {
      const title = flags.title || 'Preview Web';
      let html = flags.html || '';
      if (flags.file) {
        const filePath = path.resolve(workspacePath, String(flags.file));
        if (fs.existsSync(filePath)) {
          html = fs.readFileSync(filePath, 'utf8');
        }
      }
      try {
        await post('/api/create-preview', {
          parent_node_id: nodeId,
          title,
          html
        });
        console.log(`[CGLI] Nó de preview '${title}' criado no canvas.`);
      } catch (err) {
        console.error(`[CGLI Erro] Falha ao criar preview:`, err.message);
      }
      break;
    }

    case 'create-diff': {
      const title = flags.title || 'Alterações de Código';
      const filename = flags.file || '';
      let diffContent = flags.content || '';
      if (!diffContent) {
        try {
          const target = filename ? `"${filename}"` : '';
          diffContent = execSync(`git diff ${target}`, { cwd: workspacePath, encoding: 'utf8' });
          if (!diffContent.trim() && filename) {
            diffContent = execSync(`git diff HEAD ${target}`, { cwd: workspacePath, encoding: 'utf8' });
          }
        } catch (_) {}
      }
      try {
        await post('/api/create-diff', {
          parent_node_id: nodeId,
          title,
          filename: filename || 'diff.patch',
          content: diffContent
        });
        console.log(`[CGLI] Nó de diff '${title}' criado no canvas.`);
      } catch (err) {
        console.error(`[CGLI Erro] Falha ao criar diff:`, err.message);
      }
      break;
    }

    case 'list-folders':
    case 'folders': {
      try {
        const info = await get('/api/workspace-info');
        console.log(`=== CGLI Workspace Info ===`);
        console.log(`Projeto: ${info.projectName || info.project_name || 'Projeto Atual'}`);
        console.log(`Diretório deste Nó: ${workspacePath}`);
        if (info.folders && Array.isArray(info.folders) && info.folders.length > 0) {
          console.log(`Pastas do Projeto (${info.folders.length}):`);
          info.folders.forEach(f => {
            console.log(`  • ${f.name}: ${f.path}`);
          });
        } else {
          console.log(`Pastas do Projeto: ${workspacePath}`);
        }
      } catch (err) {
        console.log(`Diretório deste Nó: ${workspacePath}`);
      }
      break;
    }

    case 'status': {
      try {
        const st = await get('/api/status');
        console.log(`[CGLI Status] Bridge ativa na porta ${st.port || port}`);
      } catch (err) {
        console.error(`[CGLI Erro] Ponte indisponível:`, err.message);
      }
      break;
    }

    default: {
      console.log(`CGLI Canvas CLI Helper
Uso:
  cgli spawn-subagent --type [claude|agy] --task "Descricao" [--role planner|executor]
  cgli create-artifact --title "Titulo" [--content "Markdown" | --file doc.md]
  cgli create-preview --title "Titulo" [--html "HTML" | --file page.html]
  cgli create-diff --title "Titulo" [--file src/arquivo.ts]
  cgli list-folders
  cgli status`);
      break;
    }
  }
}

run();
