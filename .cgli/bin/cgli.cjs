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

let resolvedPort = null;

let resolvedHost = 'localhost';

async function getPort() {
  if (resolvedPort) return resolvedPort;
  const candidatePorts = [
    process.env.CGLI_BRIDGE_PORT ? Number(process.env.CGLI_BRIDGE_PORT) : null,
    41732,
    5173
  ].filter(Boolean);

  const candidateHosts = ['localhost', '127.0.0.1'];

  for (const h of candidateHosts) {
    for (const p of candidatePorts) {
      try {
        const isUp = await new Promise((resolve) => {
          const req = http.get(`http://${h}:${p}/api/status`, { timeout: 350 }, (res) => {
            resolve(res.statusCode === 200);
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (isUp) {
          resolvedHost = h;
          resolvedPort = p;
          return resolvedPort;
        }
      } catch (_) {}
    }
  }
  resolvedPort = Number(process.env.CGLI_BRIDGE_PORT || 41732);
  return resolvedPort;
}

class HttpError extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

async function post(endpoint, data) {
  const targetPort = await getPort();
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: resolvedHost,
      port: Number(targetPort),
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
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          parsed = { raw: body };
        }

        if (res.statusCode && res.statusCode >= 400) {
          return reject(new HttpError(
            parsed.error || parsed.message || `HTTP ${res.statusCode}`,
            res.statusCode,
            parsed
          ));
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function get(endpoint) {
  const targetPort = await getPort();
  return new Promise((resolve, reject) => {
    http.get(`http://${resolvedHost}:${targetPort}${endpoint}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          parsed = { raw: body };
        }

        if (res.statusCode && res.statusCode >= 400) {
          return reject(new HttpError(
            parsed.error || parsed.message || `HTTP ${res.statusCode}`,
            res.statusCode,
            parsed
          ));
        }
        resolve(parsed);
      });
    }).on('error', reject);
  });
}

/**
 * Spooler da fila outbox (.cgli/vault/00-inbox/.outbox) com política Fail-Loud
 * Ao invés de gravar diretamente no cofre (quebrando a garantia de Single-Writer),
 * enfileira a requisição para processamento seguro e encerra com código 1.
 */
function spoolOutbox(endpoint, payload) {
  try {
    const vaultManager = require('./vaultManager.cjs');
    const vaultPath = vaultManager.getVaultPath(payload.scope || 'project', payload.workspacePath || workspacePath);
    const outboxDir = path.join(vaultPath, '00-inbox', '.outbox');
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }

    const ulid = typeof vaultManager.generateId === 'function'
      ? vaultManager.generateId()
      : `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const outboxFile = path.join(outboxDir, `${ulid}.json`);

    const entry = {
      ulid,
      timestamp: new Date().toISOString(),
      endpoint,
      body: payload
    };

    fs.writeFileSync(outboxFile, JSON.stringify(entry, null, 2), 'utf8');
    console.error(`[CGLI-FAIL-LOUD] Servidor bridge CGLI inacessível. Operação enfileirada com segurança na outbox (.cgli/vault/00-inbox/.outbox/${ulid}.json). Saindo com código 1.`);
  } catch (err) {
    console.error(`[CGLI-FAIL-LOUD] Servidor bridge CGLI inacessível e falha ao spoolar outbox: ${err.message}`);
  }
  process.exit(1);
}

/**
 * Executor padronizado para operações de escrita de memória
 * Faz dispatch para a bridge HTTP, gerencia 409 Conflict, e aciona o outbox spooler em caso de desconexão.
 */
async function executeMemoryWrite(endpoint, payload, successCallback) {
  try {
    const res = await post(endpoint, payload);
    if (res && res.conflict) {
      console.error(`[CGLI CONFLITO] Conflito de concorrência detectado: ${res.message || 'Divergência de revisão'}`);
      if (res.conflictFile) {
        console.error(`[CGLI CONFLITO] Cópia concorrente preservada em: ${res.conflictFile}`);
      }
      process.exit(1);
    }
    if (successCallback) successCallback(res);
    return res;
  } catch (err) {
    if (err.statusCode === 409) {
      const resp = err.body || {};
      console.error(`[CGLI CONFLITO] Conflito de concorrência detectado (409): ${resp.message || err.message}`);
      if (resp.conflictFile) {
        console.error(`[CGLI CONFLITO] Cópia concorrente preservada em: ${resp.conflictFile}`);
      }
      process.exit(1);
    }

    if (err.code === 'ECONNREFUSED' || !err.statusCode) {
      spoolOutbox(endpoint, payload);
    } else {
      console.error(`[CGLI Erro HTTP ${err.statusCode || 'Bridge'}] ${err.message}`);
      process.exit(1);
    }
  }
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

    case 'memory': {
      const sub = args[1];
      const memoryFlags = parseArgs(args.slice(2));
      const scope = memoryFlags.scope || 'project';
      const vaultManager = require('./vaultManager.cjs');

      switch (sub) {
        case 'write': {
          let text = memoryFlags.text || memoryFlags.content || '';
          if (memoryFlags.stdin) {
            text = await readStdin();
          }
          if (!text) {
            console.error('[CGLI Erro] O parâmetro --text ou --stdin é obrigatório para registrar uma observação.');
            process.exit(1);
          }

          const payload = {
            scope,
            workspacePath,
            agentId: nodeId || process.env.USERNAME || 'agent',
            content: text,
            kind: memoryFlags.type || memoryFlags.kind || 'finding',
            tags: memoryFlags.tags || [],
            refs: memoryFlags.refs || [],
            source: memoryFlags.source || null,
            confidence: Number(memoryFlags.confidence || 0.8),
            idemKey: memoryFlags['idem-key'] || memoryFlags.idemKey || null
          };

          await executeMemoryWrite(
            '/api/memory/write',
            payload,
            (res) => console.log(`[CGLI Memory] Observação registrada no Vault (${scope}): ${res.id || 'OK'}`)
          );
          break;
        }

        case 'note': {
          const noteType = memoryFlags.type || 'decision';
          const title = memoryFlags.title || 'Nova Decisão';
          let noteContent = memoryFlags.content || '';

          if (memoryFlags.stdin) {
            noteContent = await readStdin();
          } else if (memoryFlags.file) {
            const filePath = path.resolve(workspacePath, String(memoryFlags.file));
            if (fs.existsSync(filePath)) {
              noteContent = fs.readFileSync(filePath, 'utf8');
            } else {
              console.error(`[CGLI Erro] Arquivo '${memoryFlags.file}' não encontrado.`);
              process.exit(1);
            }
          }

          if (!noteContent) {
            console.error('[CGLI Erro] Forneça o conteúdo da nota via --content, --file ou --stdin.');
            process.exit(1);
          }

          const payload = {
            scope,
            workspacePath,
            type: noteType,
            title,
            content: noteContent,
            author: nodeId || process.env.USERNAME || 'agent',
            tags: memoryFlags.tags || [],
            confidence: Number(memoryFlags.confidence || 0.85),
            nodeId,
            idemKey: memoryFlags['idem-key'] || memoryFlags.idemKey || null
          };

          await executeMemoryWrite(
            '/api/memory/note',
            payload,
            (res) => console.log(`[CGLI Memory] Nota '${title}' criada no Vault (${scope}): ${res.relativePath || res.id}`)
          );
          break;
        }

        case 'update': {
          const id = memoryFlags.id || args[2];
          if (!id) {
            console.error('[CGLI Erro] Especifique o ID da nota para atualizar: cgli memory update <id> [--content "..." | --file doc.md | --stdin]');
            process.exit(1);
          }

          let noteContent = memoryFlags.content || '';
          if (memoryFlags.stdin) {
            noteContent = await readStdin();
          } else if (memoryFlags.file) {
            const filePath = path.resolve(workspacePath, String(memoryFlags.file));
            if (fs.existsSync(filePath)) {
              noteContent = fs.readFileSync(filePath, 'utf8');
            } else {
              console.error(`[CGLI Erro] Arquivo '${memoryFlags.file}' não encontrado.`);
              process.exit(1);
            }
          }

          if (!noteContent) {
            console.error('[CGLI Erro] Forneça o novo conteúdo da nota via --content, --file ou --stdin.');
            process.exit(1);
          }

          const expectRev = memoryFlags['expect-rev'] !== undefined ? Number(memoryFlags['expect-rev']) : (memoryFlags.rev !== undefined ? Number(memoryFlags.rev) : null);
          const expectEtag = memoryFlags['expect-etag'] || memoryFlags.etag || null;

          const payload = {
            id,
            content: noteContent,
            expectRev,
            expectEtag,
            author: nodeId || process.env.USERNAME || 'agent',
            scope,
            workspacePath,
            idemKey: memoryFlags['idem-key'] || memoryFlags.idemKey || null
          };

          await executeMemoryWrite(
            '/api/memory/update',
            payload,
            (res) => console.log(`[CGLI Memory] Nota '${res.title || id}' atualizada com sucesso (rev ${res.rev}, etag ${res.etag ? res.etag.substring(0, 10) + '...' : '-'}): ${res.relativePath || res.id}`)
          );
          break;
        }

        case 'append': {
          const id = memoryFlags.id || args[2];
          if (!id) {
            console.error('[CGLI Erro] Especifique o ID da nota: cgli memory append <id> --section "Título da Seção" [--content "..." | --file doc.md | --stdin]');
            process.exit(1);
          }

          const sectionTitle = memoryFlags.section || memoryFlags.title || 'Atualização';
          let appendContent = memoryFlags.content || '';
          if (memoryFlags.stdin) {
            appendContent = await readStdin();
          } else if (memoryFlags.file) {
            const filePath = path.resolve(workspacePath, String(memoryFlags.file));
            if (fs.existsSync(filePath)) {
              appendContent = fs.readFileSync(filePath, 'utf8');
            } else {
              console.error(`[CGLI Erro] Arquivo '${memoryFlags.file}' não encontrado.`);
              process.exit(1);
            }
          }

          if (!appendContent) {
            console.error('[CGLI Erro] Forneça o conteúdo a anexar via --content, --file ou --stdin.');
            process.exit(1);
          }

          const payload = {
            id,
            sectionTitle,
            content: appendContent,
            author: nodeId || process.env.USERNAME || 'agent',
            scope,
            workspacePath,
            idemKey: memoryFlags['idem-key'] || memoryFlags.idemKey || null
          };

          await executeMemoryWrite(
            '/api/memory/append',
            payload,
            (res) => console.log(`[CGLI Memory] Seção '${sectionTitle}' anexada à nota '${res.title || id}' (rev ${res.rev}): ${res.relativePath || res.id}`)
          );
          break;
        }

        case 'drain-outbox': {
          console.log(`[CGLI Outbox] Processando fila de outbox (.cgli/vault/00-inbox/.outbox)...`);
          let res;
          try {
            res = await post('/api/memory/drain-outbox', { workspacePath });
          } catch (_) {
            res = vaultManager.drainOutbox(workspacePath);
          }
          console.log(`[CGLI Outbox] Concluído: ${res.processed} operações executadas, ${res.failed} falhas.`);
          if (res.messages && res.messages.length > 0) {
            res.messages.forEach(m => console.log(`  • ${m}`));
          }
          break;
        }

        case 'list': {
          const noteType = memoryFlags.type || null;
          try {
            const res = await get(`/api/memory/list?scope=${scope}${noteType ? `&type=${noteType}` : ''}`);
            const notes = res.notes || [];
            console.log(`=== Notas no Vault (${scope}) [Total: ${notes.length}] ===`);
            notes.forEach(n => {
              console.log(`  • [${n.type || 'nota'}] ${n.title} (ID: ${n.id || '-'}) -> ${n.relativePath}`);
            });
          } catch (_) {
            const notes = vaultManager.listNotes({ scope, workspacePath, type: noteType });
            console.log(`=== Notas no Vault (${scope}) [Total: ${notes.length}] ===`);
            notes.forEach(n => {
              console.log(`  • [${n.type || 'nota'}] ${n.title} (ID: ${n.id || '-'}) -> ${n.relativePath}`);
            });
          }
          break;
        }

        case 'get': {
          const idOrPath = memoryFlags.id || memoryFlags.file || args[2];
          if (!idOrPath) {
            console.error('[CGLI Erro] Especifique o ID ou caminho da nota: cgli memory get <id>');
            process.exit(1);
          }

          try {
            const res = await get(`/api/memory/get?scope=${scope}&id=${encodeURIComponent(idOrPath)}`);
            if (res.success && res.content) {
              console.log(res.content);
            } else {
              throw new Error(res.error || 'Nota não encontrada');
            }
          } catch (_) {
            const res = vaultManager.getNote({ scope, workspacePath, idOrPath });
            if (res.success) {
              console.log(res.content);
            } else {
              console.error(`[CGLI Erro] ${res.error}`);
            }
          }
          break;
        }

        case 'open': {
          const file = memoryFlags.file || args[2] || '';
          try {
            await post('/api/memory/open', { scope, workspacePath, file });
            console.log(`[CGLI Memory] Abrindo Vault (${scope}) no aplicativo Obsidian...`);
          } catch (_) {
            vaultManager.openInObsidian({ scope, workspacePath, file });
            console.log(`[CGLI Memory] Abrindo Vault (${scope}) no aplicativo Obsidian...`);
          }
          break;
        }

        case 'search': {
          const query = memoryFlags.query || memoryFlags.q || args[2] || '';
          const searchScope = memoryFlags.scope || 'all';
          const limit = Number(memoryFlags.limit || 15);
          if (!query) {
            console.error('[CGLI Erro] Especifique o termo de busca: cgli memory search <termo>');
            process.exit(1);
          }

          try {
            const res = await get(`/api/memory/search?q=${encodeURIComponent(query)}&scope=${searchScope}&limit=${limit}`);
            const hits = res.results || [];
            console.log(`=== Resultados da Busca ("${query}") [${hits.length} encontrados] ===`);
            hits.forEach(h => {
              console.log(`  • [${h.scope}] [${h.type}] ${h.title} (ID: ${h.id || '-'})`);
              if (h.snippet) console.log(`    > ${h.snippet}`);
            });
          } catch (_) {
            const hits = vaultManager.searchNotes({ query, scope: searchScope, workspacePath, limit });
            console.log(`=== Resultados da Busca ("${query}") [${hits.length} encontrados] ===`);
            hits.forEach(h => {
              console.log(`  • [${h.scope}] [${h.type}] ${h.title} (ID: ${h.id || '-'})`);
              if (h.snippet) console.log(`    > ${h.snippet}`);
            });
          }
          break;
        }

        case 'context': {
          const taskQuery = memoryFlags.for || memoryFlags.task || memoryFlags.query || args.slice(2).join(' ');
          const contextScope = memoryFlags.scope || 'all';
          const budgetTokens = Number(memoryFlags.budget || memoryFlags['budget-tokens'] || 3000);
          if (!taskQuery) {
            console.error('[CGLI Erro] Especifique a tarefa para recall de contexto: cgli memory context --for "tarefa"');
            process.exit(1);
          }

          try {
            const res = await post('/api/memory/context', {
              query: taskQuery,
              scope: contextScope,
              budgetTokens,
              workspacePath
            });
            console.log(res.markdown);
          } catch (_) {
            const pack = vaultManager.buildContextPack({
              query: taskQuery,
              budgetTokens,
              scope: contextScope,
              workspacePath
            });
            console.log(pack.markdown);
          }
          break;
        }

        case 'doctor': {
          const doctorScope = memoryFlags.scope || 'all';
          console.log(`[CGLI Doctor] Analisando integridade do Vault (${doctorScope})...`);
          let report;
          try {
            report = await get(`/api/memory/doctor?scope=${doctorScope}`);
          } catch (_) {
            report = vaultManager.runDoctor({ scope: doctorScope, workspacePath });
          }

          console.log(`\n=== Relatório de Saúde da Memória (CGLI Doctor) ===`);
          console.log(`Status Geral: ${report.passed ? '✅ SAUDÁVEL' : '⚠️ ATENÇÃO NECESSÁRIA'}`);
          console.log(`Estatísticas:`);
          console.log(`  • Total de Notas: ${report.stats.totalNotes}`);
          console.log(`  • Arquivos de Journal: ${report.stats.totalJournals}`);
          console.log(`  • Armazenamento: ${(report.stats.storageBytes / 1024).toFixed(1)} KB`);
          console.log(`  • Tokens Estimados: ~${report.stats.totalEstimatedTokens}`);

          if (report.issues.length === 0) {
            console.log(`\nNenhum problema encontrado. Todos os schemas e links estão íntegros!`);
          } else {
            console.log(`\nApontamentos detectados (${report.issues.length}):`);
            report.issues.forEach((issue) => {
              const icon = issue.severity === 'error' ? '❌' : (issue.severity === 'warning' ? '⚠️' : 'ℹ️');
              console.log(`  ${icon} [${issue.severity.toUpperCase()}] [${issue.scope}] ${issue.file}: ${issue.message}`);
              if (issue.suggestion) {
                console.log(`     Sugestão: ${issue.suggestion}`);
              }
            });
          }
          break;
        }

        case 'compact': {
          const compactScope = memoryFlags.scope || 'project';
          const dryRun = Boolean(memoryFlags['dry-run'] || memoryFlags.dryrun || memoryFlags.simulate);
          const olderThanDays = memoryFlags['older-than'] !== undefined
            ? Number(memoryFlags['older-than'])
            : (memoryFlags.days !== undefined ? Number(memoryFlags.days) : 7);

          console.log(`[CGLI Curator] Executando compactação de journals (${compactScope}) [olderThan: ${olderThanDays}d, dryRun: ${dryRun}]...`);
          let res;
          try {
            res = await post('/api/memory/compact', { scope: compactScope, dryRun, olderThanDays, workspacePath });
          } catch (_) {
            res = vaultManager.compactJournals({ scope: compactScope, dryRun, olderThanDays, workspacePath });
          }
          console.log(`\n=== Resultado da Compactação de Journals ===`);
          console.log(res.message);
          if (res.createdNotes && res.createdNotes.length > 0) {
            res.createdNotes.forEach(n => {
              console.log(`  • Nova nota gerada: ${n.title} -> ${n.relativePath}`);
            });
          }
          break;
        }

        case 'moc': {
          const mocScope = memoryFlags.scope || 'project';
          const update = Boolean(memoryFlags.update || memoryFlags.generate);
          console.log(`[CGLI MOC] Processando Map of Content (${mocScope})...`);
          let res;
          try {
            if (update) {
              res = await post('/api/memory/moc', { scope: mocScope, workspacePath });
            } else {
              res = await get(`/api/memory/moc?scope=${mocScope}`);
            }
          } catch (_) {
            res = vaultManager.generateMOC({ scope: mocScope, workspacePath });
          }
          console.log(res.content);
          console.log(`\n[Arquivo gerado em: ${res.relativePath}]`);
          break;
        }

        default: {
          console.log(`CGLI Memory Subcomandos:
  cgli memory write [--scope project|global] --text "Texto" [--tags t1,t2] [--refs "[[link]]"] [--idem-key <key>]
  cgli memory note [--scope project|global] --type [decision|knowledge|learning|rule] --title "Titulo" [--content "..." | --file doc.md] [--idem-key <key>]
  cgli memory update <id> [--content "..." | --file doc.md] [--expect-rev <n>] [--expect-etag <etag>] [--idem-key <key>]
  cgli memory append <id> --section "Titulo" [--content "..." | --file doc.md] [--idem-key <key>]
  cgli memory search <termo> [--scope project|global|all] [--limit 10]
  cgli memory context --for "tarefa" [--budget-tokens 3000] [--scope all|project|global] [--include-journals]
  cgli memory doctor [--scope all|project|global]
  cgli memory compact [--scope project|global] [--older-than 7] [--dry-run]
  cgli memory moc [--scope project|global] [--update]
  cgli memory list [--scope project|global] [--type decision]
  cgli memory get <id_ou_caminho> [--scope project|global]
  cgli memory open [--scope project|global] [--file caminho]
  cgli memory drain-outbox`);
          break;
        }
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
  cgli memory write [--scope project|global] --text "Observacao"
  cgli memory note [--scope project|global] --type decision --title "ADR..." --file doc.md
  cgli memory update <id> --content "Novo conteudo" [--expect-rev 1]
  cgli memory append <id> --section "Nova Secao" --content "Texto"
  cgli memory list [--scope project|global]
  cgli memory open [--scope project|global]
  cgli memory drain-outbox
  cgli list-folders
  cgli status`);
      break;
    }
  }
}

run();
