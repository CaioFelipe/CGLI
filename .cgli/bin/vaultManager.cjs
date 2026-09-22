/**
 * VaultManager - Gerenciador de Memória Compartilhada do CGLI com Obsidian
 * Suporta arquitetura dual: Vault Local do Projeto e Vault Global do Usuário.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

function getGlobalVaultPath() {
  return path.join(os.homedir(), '.cgli', 'vault');
}

function getLocalVaultPath(workspacePath) {
  const root = workspacePath || process.env.CGLI_WORKSPACE_PATH || process.cwd();
  return path.join(root, '.cgli', 'vault');
}

function getVaultPath(scope = 'project', workspacePath) {
  if (scope === 'global') {
    return getGlobalVaultPath();
  }
  return getLocalVaultPath(workspacePath);
}

// Alfabeto Crockford Base32 para ULID canônico
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastUlidTime = 0;
let lastUlidRandom = Buffer.alloc(10);

function encodeTime(timeMs, len = 10) {
  let str = '';
  let time = timeMs;
  for (let i = len - 1; i >= 0; i--) {
    const mod = time % 32;
    str = CROCKFORD_BASE32.charAt(mod) + str;
    time = Math.floor(time / 32);
  }
  return str;
}

function encodeRandom(buf) {
  let str = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < buf.length; i++) {
    buffer = (buffer << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      str += CROCKFORD_BASE32.charAt((buffer >>> bits) & 31);
    }
  }
  if (bits > 0) {
    str += CROCKFORD_BASE32.charAt((buffer << (5 - bits)) & 31);
  }
  return str.substring(0, 16);
}

function incrementRandom(buf) {
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i] < 255) {
      buf[i]++;
      return;
    }
    buf[i] = 0;
  }
}

/**
 * Gera ULID monotônico de 26 caracteres (48 bits de tempo + 80 bits criptográficos)
 * Ordenação lexicográfica estritamente crescente dentro do mesmo milissegundo.
 */
function generateId() {
  const now = Date.now();
  if (now === lastUlidTime) {
    incrementRandom(lastUlidRandom);
  } else {
    lastUlidTime = now;
    lastUlidRandom = crypto.randomBytes(10);
  }
  return encodeTime(now, 10) + encodeRandom(lastUlidRandom);
}

/**
 * Calcula etag determinístico baseado no hash SHA-256 do corpo markdown
 */
function calculateEtag(bodyText) {
  const cleanBody = (bodyText || '').trim();
  return crypto.createHash('sha256').update(cleanBody, 'utf8').digest('hex').substring(0, 16);
}

function slugify(text) {
  return (text || 'nota')
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 45);
}

function getISOTimestamp() {
  return new Date().toISOString();
}

function getDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SECRET_PATTERNS = [
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_\-]{20,}/g },
  { name: 'OpenAI API Key', regex: /sk-(?:proj-|live-|test-)?[a-zA-Z0-9]{20,}/g },
  { name: 'Google AI / Gemini Key', regex: /AIzaSy[a-zA-Z0-9_\-]{33}/g },
  { name: 'GitHub Token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}/g },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+/g },
  { name: 'Private Key', regex: /-----BEGIN (?:[A-Z0-9 ]+)?PRIVATE KEY-----[\s\S]+?-----END (?:[A-Z0-9 ]+)?PRIVATE KEY-----/g },
  { name: 'Database URI with Password', regex: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s:]+:[^\s@]+@[^\s/]+/g }
];

/**
 * Varre e sanitiza potenciais segredos ou credenciais em textos antes de persistir
 */
function scanAndSanitizeSecrets(text, strict = false) {
  if (!text || typeof text !== 'string') return { text: text || '', redactedCount: 0, hasSecrets: false, detected: [] };
  let sanitized = text;
  let redactedCount = 0;
  const detected = [];

  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    const matches = sanitized.match(regex);
    if (matches && matches.length > 0) {
      if (strict) {
        throw new Error(`[SECURITY ALERT] Tentativa de persistência de segredo bloqueada: padrão '${name}' detectado.`);
      }
      detected.push(name);
      redactedCount += matches.length;
      sanitized = sanitized.replace(regex, '[REDACTED_SECRET]');
    }
  }

  return {
    text: sanitized,
    redactedCount,
    hasSecrets: redactedCount > 0,
    detected
  };
}

function ensureVaultStructure(scope = 'project', workspacePath) {
  const vaultPath = getVaultPath(scope, workspacePath);
  const isGlobal = scope === 'global';

  const commonFolders = ['00-meta', '.tmp', '90-journal'];
  const localFolders = [
    '00-inbox',
    '10-sessions',
    '20-agents',
    '30-artifacts',
    '40-decisions',
    '50-knowledge',
    '60-tasks',
    '70-entities'
  ];
  const globalFolders = [
    '20-agents',
    '30-preferences',
    '50-learnings'
  ];

  const targetFolders = isGlobal
    ? [...commonFolders, ...globalFolders]
    : [...commonFolders, ...localFolders];

  for (const folder of targetFolders) {
    const dir = path.join(vaultPath, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Criação do README do Vault caso não exista
  const readmePath = path.join(vaultPath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    const title = isGlobal
      ? '# CGLI Global Vault (Memória Global do Usuário)'
      : '# CGLI Project Vault (Memória do Projeto)';

    const description = isGlobal
      ? 'Este Vault armazena aprendizados transversais dos agentes, preferências arquiteturais do desenvolvedor e convenções reutilizáveis entre múltiplos projetos.'
      : 'Este Vault armazena decisões arquiteturais (ADRs), especificações, entidades mapeadas, tarefas e o journal de execução dos agentes deste projeto.';

    const readmeContent = `${title}\n\n${description}\n\n> Gerenciado automaticamente pelo **CGLI Canvas Orchestrator**.\n`;
    fs.writeFileSync(readmePath, readmeContent, 'utf8');
  }

  return vaultPath;
}

/**
 * Gravação atômica em disco: escreve em .tmp e depois renomeia para o destino final.
 * Garante choke point de segurança para qualquer documento e fsync físico.
 */
function atomicWriteFile(targetPath, content) {
  // Choke point global: valida e sanitiza todo o documento antes de tocar em disco
  const scan = scanAndSanitizeSecrets(content);
  const safeContent = scan.text;

  const dir = path.dirname(targetPath);
  const vaultDir = targetPath.includes('.cgli')
    ? targetPath.substring(0, targetPath.indexOf('.cgli') + 11) // aponta para .cgli/vault
    : dir;
  const tmpDir = path.join(vaultDir, '.tmp');

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const tmpFile = path.join(tmpDir, `${generateId()}.part`);

  // Escrita síncrona com fsync físico antes do rename para durabilidade real
  const fd = fs.openSync(tmpFile, 'w');
  fs.writeSync(fd, safeContent, 0, 'utf8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  // Troca atômica via rename com backoff exponencial e jitter para contornar travas do Windows
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.renameSync(tmpFile, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EEXIST') {
        const waitMs = Math.floor(20 * Math.pow(2, attempt - 1) + Math.random() * 15);
        const end = Date.now() + waitMs;
        while (Date.now() < end) {}
      } else {
        break;
      }
    }
  }

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
  throw lastErr || new Error(`Falha ao renomear arquivo temporário para ${targetPath}`);
}

/**
 * Gerencia ledger de idempotência para evitar operações duplicadas por retries
 */
function checkAndRecordIdemKey(vaultPath, idemKey, responseData = null) {
  if (!idemKey || typeof idemKey !== 'string') return null;
  const metaDir = path.join(vaultPath, '00-meta');
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  const ledgerPath = path.join(metaDir, '.idem-ledger.ndjson');

  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (fs.existsSync(ledgerPath)) {
    try {
      const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        const entry = JSON.parse(line);
        if (entry.key === idemKey) {
          if (now - entry.ts < ONE_DAY_MS) {
            return entry.response;
          }
          break;
        }
      }
    } catch (_) {}
  }

  if (responseData) {
    try {
      const record = JSON.stringify({ key: idemKey, ts: now, response: responseData }) + '\n';
      fs.appendFileSync(ledgerPath, record, 'utf8');
    } catch (_) {}
  }

  return null;
}

/**
 * Escreve observação no journal diário do agente (append-only com sharding)
 */
function writeObservation({
  scope = 'project',
  workspacePath,
  agentId = 'agent',
  agentType = 'claude',
  content,
  kind = 'finding',
  tags = [],
  refs = [],
  source = null,
  confidence = 0.8,
  idemKey = null
}) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);

  if (idemKey) {
    const cached = checkAndRecordIdemKey(vaultPath, idemKey);
    if (cached) return cached;
  }

  const dateStr = getDateString();
  const journalDir = path.join(vaultPath, '90-journal', dateStr);

  if (!fs.existsSync(journalDir)) {
    fs.mkdirSync(journalDir, { recursive: true });
  }

  const safeAgentId = slugify(scanAndSanitizeSecrets(agentId).text);
  const journalFile = path.join(journalDir, `${safeAgentId}.md`);
  const ulid = generateId();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  let header = '';
  if (!fs.existsSync(journalFile)) {
    header = `---\ncgli_schema: journal/v1\ndate: "${dateStr}"\nagent_id: "${agentId}"\nagent_type: "${agentType}"\nscope: "${scope}"\n---\n\n# Journal do Agente: ${agentId} (${dateStr})\n\n`;
  }

  const tagsArr = (Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []))
    .map(t => scanAndSanitizeSecrets(t).text);
  const refsArr = (Array.isArray(refs) ? refs : (typeof refs === 'string' ? refs.split(',').map(r => r.trim()) : []))
    .map(r => scanAndSanitizeSecrets(r).text);

  const safeKind = scanAndSanitizeSecrets(kind).text;
  const safeSource = source ? scanAndSanitizeSecrets(source).text : null;
  const metaParts = [`**tipo:** ${safeKind}`, `**confiança:** ${confidence}`];
  if (safeSource) metaParts.push(`**fonte:** \`${safeSource}\``);
  if (tagsArr.length > 0) metaParts.push(`**tags:** ${tagsArr.map(t => `#${t}`).join(' ')}`);

  const secretScan = scanAndSanitizeSecrets(content);
  const safeContent = secretScan.text;

  let entry = `## ${timeStr} · ${safeKind} · ${ulid}\n^${ulid}\n${metaParts.join(' · ')}\n\n${safeContent.trim()}\n`;

  if (refsArr.length > 0) {
    entry += `\n**refs:** ${refsArr.join(' · ')}\n`;
  }

  entry += `\n---\n\n`;

  fs.appendFileSync(journalFile, header + entry, 'utf8');

  const result = {
    success: true,
    id: ulid,
    scope,
    file: journalFile,
    relativePath: path.relative(vaultPath, journalFile)
  };

  if (idemKey) checkAndRecordIdemKey(vaultPath, idemKey, result);
  return result;
}

/**
 * Cria uma nota formal de primeira classe (decisão, regra, conhecimento, aprendizado)
 */
function createNote({
  scope = 'project',
  workspacePath,
  type = 'decision', // decision | knowledge | learning | rule | task | entity
  title,
  content,
  author = 'claude',
  tags = [],
  links = {},
  nodeId = null,
  confidence = 0.85,
  idemKey = null
}) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);

  if (idemKey) {
    const cached = checkAndRecordIdemKey(vaultPath, idemKey);
    if (cached) return cached;
  }

  const ulid = generateId();

  // Sanitiza título e tags antes de montar filename ou frontmatter para evitar vazamento em metadados
  const sanitizedTitle = scanAndSanitizeSecrets(title || 'Sem título').text;
  const slug = slugify(sanitizedTitle);
  const filename = `${ulid}--${type}--${slug}.md`;

  let subfolder = '40-decisions';
  if (type === 'knowledge') subfolder = '50-knowledge';
  else if (type === 'learning') subfolder = '50-learnings';
  else if (type === 'rule' || type === 'preference') subfolder = '30-preferences';
  else if (type === 'task') subfolder = '60-tasks';
  else if (type === 'entity') subfolder = '70-entities';
  else if (scope === 'global' && type === 'decision') subfolder = '50-learnings';

  const targetDir = path.join(vaultPath, subfolder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = path.join(targetDir, filename);
  const now = getISOTimestamp();
  const tagsArr = (Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []))
    .map(t => scanAndSanitizeSecrets(t).text);

  const safeTitle = sanitizedTitle.replace(/"/g, '\\"');

  const secretScan = scanAndSanitizeSecrets(content);
  const safeContent = secretScan.text;

  let noteBody = `# ${sanitizedTitle}\n\n${safeContent.trim()}\n\n---\n*Criado pelo agente ${author} no CGLI (${scope})*\n`;
  const etag = calculateEtag(noteBody);

  let frontmatter = `---\ncgli_schema: ${type}/v1\nid: "${ulid}"\nrev: 1\netag: "${etag}"\ntitle: "${safeTitle}"\ncreated: "${now}"\nupdated: "${now}"\nscope: "${scope}"\nconfidence: ${confidence}\nauthor:\n  agent_id: "${author}"\nstatus: "active"\ntags: [${tagsArr.map(t => `"${t}"`).join(', ')}]\n`;

  if (nodeId) {
    frontmatter += `canvas:\n  node_id: "${nodeId}"\n`;
  }

  if (links && typeof links === 'object' && Object.keys(links).length > 0) {
    frontmatter += `links:\n`;
    for (const [rel, targets] of Object.entries(links)) {
      const arr = Array.isArray(targets) ? targets : [targets];
      frontmatter += `  ${rel}: [${arr.map(t => `"${t}"`).join(', ')}]\n`;
    }
  } else {
    frontmatter += `links: {}\n`;
  }

  frontmatter += `---\n\n`;

  atomicWriteFile(targetFile, frontmatter + noteBody);

  const result = {
    success: true,
    id: ulid,
    title,
    type,
    rev: 1,
    etag,
    scope,
    file: targetFile,
    relativePath: path.relative(vaultPath, targetFile)
  };

  if (idemKey) checkAndRecordIdemKey(vaultPath, idemKey, result);
  return result;
}

/**
 * Atualização com concorrência otimista (rev + etag).
 * Caso detecte divergência, não sobrescreve: gera .conflict-<ulid>.md e retorna status 409.
 */
function updateNote({
  id,
  expectRev,
  expectEtag,
  content,
  file,
  author = 'agent',
  scope = 'project',
  workspacePath,
  idemKey = null
}) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);

  if (idemKey) {
    const cached = checkAndRecordIdemKey(vaultPath, idemKey);
    if (cached) return cached;
  }

  const all = listNotes({ scope, workspacePath });
  const noteInfo = all.find(n => n.id === id || n.relativePath === id || (file && n.relativePath.includes(file)));
  if (!noteInfo) {
    return { success: false, error: `Nota com ID '${id}' não encontrada no Vault ${scope}` };
  }

  const notePath = noteInfo.fullPath;
  const rawContent = fs.readFileSync(notePath, 'utf8');

  let frontmatterText = '';
  let bodyText = rawContent;
  let currentRev = 1;
  let currentEtag = '';

  if (rawContent.startsWith('---')) {
    const endFm = rawContent.indexOf('\n---', 3);
    if (endFm !== -1) {
      frontmatterText = rawContent.substring(3, endFm);
      bodyText = rawContent.substring(endFm + 4).trim();
      const revMatch = frontmatterText.match(/rev:\s*(\d+)/);
      if (revMatch) currentRev = parseInt(revMatch[1], 10);
      const etagMatch = frontmatterText.match(/etag:\s*"([^"]+)"/);
      if (etagMatch) currentEtag = etagMatch[1];
    }
  }

  const calculatedCurrentEtag = calculateEtag(bodyText);
  if (!currentEtag) currentEtag = calculatedCurrentEtag;

  const revMismatch = expectRev !== undefined && expectRev !== null && Number(expectRev) !== currentRev;
  const etagMismatch = expectEtag && expectEtag !== currentEtag;

  if (revMismatch || etagMismatch) {
    const conflictUlid = generateId();
    const conflictFilename = `${noteInfo.id}--conflict-${conflictUlid}.md`;
    const conflictDir = path.dirname(notePath);
    const conflictPath = path.join(conflictDir, conflictFilename);

    const now = getISOTimestamp();
    const safeContent = scanAndSanitizeSecrets(content || '').text;
    const conflictFm = `---\ncgli_schema: conflict/v1\nid: "${conflictUlid}"\nconflicts_with: "${noteInfo.id}"\nbase_rev: ${expectRev || currentRev}\nactual_rev: ${currentRev}\nbase_etag: "${expectEtag || ''}"\nactual_etag: "${currentEtag}"\ncreated: "${now}"\nauthor:\n  agent_id: "${author}"\nstatus: "conflict"\n---\n\n# Conflito de Modificação em [[${noteInfo.title}]]\n\n> ⚠️ Detectada divergência de revisão (esperada: ${expectRev || 'N/A'}, atual em disco: ${currentRev}).\n\n### Conteúdo Conflitante Submetido:\n\n${safeContent}\n`;

    atomicWriteFile(conflictPath, conflictFm);

    const result = {
      success: false,
      conflict: true,
      statusCode: 409,
      id: noteInfo.id,
      conflictId: conflictUlid,
      conflictFile: path.relative(vaultPath, conflictPath),
      expectedRev: expectRev,
      actualRev: currentRev,
      expectedEtag: expectEtag,
      actualEtag: currentEtag,
      message: `Conflito de revisão detectado para a nota '${noteInfo.title}'. O conteúdo concorrente foi preservado em '${path.basename(conflictPath)}' sem perda de dados.`
    };

    if (idemKey) checkAndRecordIdemKey(vaultPath, idemKey, result);
    return result;
  }

  const newRev = currentRev + 1;
  const now = getISOTimestamp();
  const safeContent = scanAndSanitizeSecrets(content || '').text;
  const newEtag = calculateEtag(safeContent);

  let updatedFm = frontmatterText;
  if (/rev:\s*\d+/.test(updatedFm)) {
    updatedFm = updatedFm.replace(/rev:\s*\d+/, `rev: ${newRev}`);
  } else {
    updatedFm += `\nrev: ${newRev}`;
  }

  if (/updated:\s*"[^"]*"/.test(updatedFm)) {
    updatedFm = updatedFm.replace(/updated:\s*"[^"]*"/, `updated: "${now}"`);
  } else {
    updatedFm += `\nupdated: "${now}"`;
  }

  if (/etag:\s*"[^"]*"/.test(updatedFm)) {
    updatedFm = updatedFm.replace(/etag:\s*"[^"]*"/, `etag: "${newEtag}"`);
  } else {
    updatedFm += `\netag: "${newEtag}"`;
  }

  const newDoc = `---${updatedFm.trim()}\n---\n\n${safeContent}\n`;
  atomicWriteFile(notePath, newDoc);

  const result = {
    success: true,
    id: noteInfo.id,
    title: noteInfo.title,
    rev: newRev,
    etag: newEtag,
    file: notePath,
    relativePath: path.relative(vaultPath, notePath)
  };

  if (idemKey) checkAndRecordIdemKey(vaultPath, idemKey, result);
  return result;
}

/**
 * Anexa uma seção no final de uma nota e incrementa rev
 */
function appendToNote({
  id,
  sectionTitle,
  content,
  author = 'agent',
  scope = 'project',
  workspacePath,
  idemKey = null
}) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);

  if (idemKey) {
    const cached = checkAndRecordIdemKey(vaultPath, idemKey);
    if (cached) return cached;
  }

  const all = listNotes({ scope, workspacePath });
  const noteInfo = all.find(n => n.id === id || n.relativePath === id);
  if (!noteInfo) {
    return { success: false, error: `Nota com ID '${id}' não encontrada no Vault ${scope}` };
  }

  const notePath = noteInfo.fullPath;
  const rawContent = fs.readFileSync(notePath, 'utf8');

  let frontmatterText = '';
  let bodyText = rawContent;
  let currentRev = 1;

  if (rawContent.startsWith('---')) {
    const endFm = rawContent.indexOf('\n---', 3);
    if (endFm !== -1) {
      frontmatterText = rawContent.substring(3, endFm);
      bodyText = rawContent.substring(endFm + 4).trim();
      const revMatch = frontmatterText.match(/rev:\s*(\d+)/);
      if (revMatch) currentRev = parseInt(revMatch[1], 10);
    }
  }

  const newRev = currentRev + 1;
  const now = getISOTimestamp();
  const safeSection = scanAndSanitizeSecrets(sectionTitle || 'Nova Seção').text;
  const safeContent = scanAndSanitizeSecrets(content || '').text;

  const appendedBody = `${bodyText}\n\n## ${safeSection}\n*Adicionado por ${author} em ${now}*\n\n${safeContent}\n`;
  const newEtag = calculateEtag(appendedBody);

  let updatedFm = frontmatterText;
  if (/rev:\s*\d+/.test(updatedFm)) {
    updatedFm = updatedFm.replace(/rev:\s*\d+/, `rev: ${newRev}`);
  } else {
    updatedFm += `\nrev: ${newRev}`;
  }

  if (/updated:\s*"[^"]*"/.test(updatedFm)) {
    updatedFm = updatedFm.replace(/updated:\s*"[^"]*"/, `updated: "${now}"`);
  } else {
    updatedFm += `\nupdated: "${now}"`;
  }

  if (/etag:\s*"[^"]*"/.test(updatedFm)) {
    updatedFm = updatedFm.replace(/etag:\s*"[^"]*"/, `etag: "${newEtag}"`);
  } else {
    updatedFm += `\netag: "${newEtag}"`;
  }

  const newDoc = `---${updatedFm.trim()}\n---\n\n${appendedBody.trim()}\n`;
  atomicWriteFile(notePath, newDoc);

  const result = {
    success: true,
    id: noteInfo.id,
    title: noteInfo.title,
    rev: newRev,
    etag: newEtag,
    file: notePath,
    relativePath: path.relative(vaultPath, notePath)
  };

  if (idemKey) checkAndRecordIdemKey(vaultPath, idemKey, result);
  return result;
}

/**
 * Lista notas de um Vault com metadados básicos e integridade
 */
function listNotes({ scope = 'project', workspacePath, type = null }) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);
  const results = [];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== '00-inbox') {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const relPath = path.relative(vaultPath, fullPath);

          let id = '';
          let title = entry.name.replace(/\.md$/, '');
          let noteType = 'note';
          let created = '';
          let updated = '';
          let rev = 1;
          let etag = '';
          let confidence = 0.85;
          let status = 'active';
          let tags = [];

          // Parse de frontmatter
          if (content.startsWith('---')) {
            const endIdx = content.indexOf('\n---', 3);
            if (endIdx !== -1) {
              const fm = content.substring(3, endIdx);
              const idMatch = fm.match(/id:\s*"([^"]+)"/);
              const titleMatch = fm.match(/title:\s*"([^"]+)"/);
              const schemaMatch = fm.match(/cgli_schema:\s*([^/\s\n]+)/);
              const createdMatch = fm.match(/created:\s*"([^"]+)"/);
              const updatedMatch = fm.match(/updated:\s*"([^"]+)"/);
              const revMatch = fm.match(/rev:\s*(\d+)/);
              const etagMatch = fm.match(/etag:\s*"([^"]+)"/);
              const confMatch = fm.match(/confidence:\s*([0-9.]+)/);
              const statusMatch = fm.match(/status:\s*"([^"]+)"/);
              const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);

              if (idMatch) id = idMatch[1];
              if (titleMatch) title = titleMatch[1];
              if (schemaMatch) noteType = schemaMatch[1];
              if (createdMatch) created = createdMatch[1];
              if (updatedMatch) updated = updatedMatch[1];
              if (revMatch) rev = parseInt(revMatch[1], 10);
              if (etagMatch) etag = etagMatch[1];
              if (confMatch) confidence = parseFloat(confMatch[1]);
              if (statusMatch) status = statusMatch[1];
              if (tagsMatch) {
                tags = tagsMatch[1]
                  .split(',')
                  .map(t => t.replace(/["'\s]/g, '').trim())
                  .filter(Boolean);
              }
            }
          }

          if (!type || noteType === type) {
            results.push({
              id,
              title,
              type: noteType,
              scope,
              created,
              updated: updated || created,
              rev,
              etag,
              confidence,
              status,
              tags,
              relativePath: relPath,
              fullPath
            });
          }
        } catch (_) {}
      }
    }
  }

  scanDir(vaultPath);
  return results;
}

/**
 * Obtém conteúdo e metadados de uma nota pelo ID ou caminho
 */
function getNote({ scope = 'project', workspacePath, idOrPath }) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);
  let targetPath = null;

  if (fs.existsSync(idOrPath)) {
    targetPath = idOrPath;
  } else {
    // Procura por ID ou nome com precedência para correspondência exata
    const all = listNotes({ scope, workspacePath });
    const match = all.find(n => n.id === idOrPath)
      || all.find(n => n.relativePath === idOrPath)
      || all.find(n => n.relativePath.includes(idOrPath));
    if (match) {
      targetPath = match.fullPath;
    }
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    return { success: false, error: `Nota '${idOrPath}' não encontrada no Vault ${scope}` };
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  return {
    success: true,
    file: targetPath,
    relativePath: path.relative(vaultPath, targetPath),
    content
  };
}

/**
 * Abre o Vault ou uma nota específica no Obsidian através de URI ou comando do sistema
 */
function openInObsidian({ scope = 'project', workspacePath, file = '' }) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);
  const normalizedVaultPath = vaultPath.replace(/\\/g, '/');

  let uri;
  if (file) {
    const targetFile = path.isAbsolute(file) ? file : path.join(vaultPath, file);
    const normalizedTarget = targetFile.replace(/\\/g, '/');
    uri = `obsidian://open?path=${encodeURIComponent(normalizedTarget)}`;
  } else {
    uri = `obsidian://open?path=${encodeURIComponent(normalizedVaultPath)}`;
  }

  const isWindows = process.platform === 'win32';
  const openCmd = isWindows ? `start "" "${uri}"` : `open "${uri}"`;

  exec(openCmd, (err) => {
    if (err) {
      // Fallback: abre a pasta no explorer do sistema operacional
      const revealCmd = isWindows ? `explorer "${vaultPath}"` : `open "${vaultPath}"`;
      exec(revealCmd);
    }
  });

  return { success: true, uri, vaultPath };
}

/**
 * Busca notas nos vaults especificados (project, global ou all) com ranking aprimorado
 */
function searchNotes({ query = '', scope = 'all', type = null, workspacePath, limit = 20 }) {
  const scopes = scope === 'all' ? ['project', 'global'] : [scope];
  const allNotes = [];

  for (const s of scopes) {
    const list = listNotes({ scope: s, workspacePath, type });
    for (const item of list) {
      allNotes.push({ ...item, scope: s });
    }
  }

  const queryTerms = (query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 1);

  if (queryTerms.length === 0) {
    return allNotes.slice(0, limit);
  }

  const scored = [];
  for (const note of allNotes) {
    try {
      const content = fs.readFileSync(note.fullPath, 'utf8').toLowerCase();
      const title = (note.title || '').toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        if (title.includes(term)) {
          score += 15;
        }
        if (note.relativePath.toLowerCase().includes(term)) {
          score += 8;
        }
        const occurrences = (content.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (occurrences > 0) {
          score += Math.min(occurrences, 10) * 2;
        }
      }

      if (score > 0) {
        // Boost por tipo de nota
        if (note.type === 'rule' || note.type === 'preference') score += 10;
        else if (note.type === 'decision') score += 8;
        else if (note.type === 'knowledge' || note.type === 'learning') score += 5;
        else if (note.type === 'task' || note.type === 'entity') score += 2;

        // Boost por recência temporal
        if (note.updated || note.created) {
          const noteTime = new Date(note.updated || note.created).getTime();
          if (!isNaN(noteTime)) {
            const ageHours = (Date.now() - noteTime) / (1000 * 60 * 60);
            if (ageHours <= 24) score += 10;
            else if (ageHours <= 24 * 7) score += 5;
            else if (ageHours <= 24 * 30) score += 2;
          }
        }

        // Multiplicador de confiança (padrão 0.85)
        const conf = typeof note.confidence === 'number' ? note.confidence : 0.85;
        score = Math.round(score * conf * 10) / 10;

        const rawContent = fs.readFileSync(note.fullPath, 'utf8');
        let snippet = '';
        const lowerRaw = rawContent.toLowerCase();
        const firstIdx = lowerRaw.indexOf(queryTerms[0]);
        if (firstIdx !== -1) {
          const start = Math.max(0, firstIdx - 60);
          const end = Math.min(rawContent.length, firstIdx + 140);
          snippet = (start > 0 ? '...' : '') + rawContent.substring(start, end).replace(/\n+/g, ' ').trim() + (end < rawContent.length ? '...' : '');
        } else {
          snippet = rawContent.substring(0, 150).replace(/\n+/g, ' ').trim() + '...';
        }

        scored.push({
          ...note,
          score,
          snippet
        });
      }
    } catch (_) {}
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Constrói um bloco de contexto formatado com limites de tokens para injeção em prompts.
 * Suporta priorização de notas anexadas (pinned) via drag-and-drop no Canvas.
 */
function buildContextPack({
  query = '',
  budgetTokens = 3000,
  scope = 'all',
  workspacePath,
  includeJournals = false,
  attachedMemoryIds = []
}) {
  const attachedHits = [];
  const attachedSet = new Set(attachedMemoryIds || []);

  if (attachedSet.size > 0) {
    const scopes = scope === 'all' ? ['project', 'global'] : [scope];
    for (const s of scopes) {
      const all = listNotes({ scope: s, workspacePath });
      for (const note of all) {
        if (attachedSet.has(note.id) || attachedSet.has(note.relativePath) || attachedSet.has(path.basename(note.relativePath))) {
          attachedHits.push({ ...note, scope: s, isPinned: true });
        }
      }
    }
  }

  const hits = searchNotes({ query, scope, workspacePath, limit: 10 });
  const relevantHits = includeJournals ? hits : hits.filter(h => h.type !== 'journal');

  // Combina notas fixadas no topo com as notas encontradas por busca (sem duplicar)
  const combinedHits = [...attachedHits];
  const seenIds = new Set(attachedHits.map(h => h.id));
  for (const h of relevantHits) {
    if (!seenIds.has(h.id)) {
      seenIds.add(h.id);
      combinedHits.push(h);
    }
  }

  if (combinedHits.length === 0) {
    return {
      success: true,
      query,
      notesCount: 0,
      estimatedTokens: 0,
      markdown: `<!-- CGLI:MEMORY_CONTEXT (Nenhum registro prévio encontrado para "${query}") -->`
    };
  }

  const budgetChars = budgetTokens * 4;
  let markdown = `<!-- CGLI:MEMORY_CONTEXT -->\n# Memória Contextual Relevante do CGLI (${combinedHits.length} notas encontradas)\n> Consulta: "${query}"\n\n`;

  let includedCount = 0;
  for (const hit of combinedHits) {
    try {
      const raw = fs.readFileSync(hit.fullPath, 'utf8');
      let noteBody = raw.trim();

      // Remove frontmatter YAML para economizar tokens de contexto do LLM
      if (noteBody.startsWith('---')) {
        const endFm = noteBody.indexOf('\n---', 3);
        if (endFm !== -1) {
          noteBody = noteBody.substring(endFm + 4).trim();
        }
      }

      const pinnedBadge = hit.isPinned ? ' 📌 [ANEXADO PELO OPERADOR]' : '';
      const noteBlock = `### [[${hit.title}]] (${hit.type} · ${hit.scope})${pinnedBadge}\n${noteBody}\n\n---\n`;
      if (markdown.length + noteBlock.length > budgetChars) {
        const snippetBlock = `### [[${hit.title}]] (${hit.type} · ${hit.scope})${pinnedBadge}\n> ${hit.snippet || noteBody.substring(0, 150)}...\n\n`;
        if (markdown.length + snippetBlock.length <= budgetChars) {
          markdown += snippetBlock;
          includedCount++;
        }
        break;
      } else {
        markdown += noteBlock;
        includedCount++;
      }
    } catch (_) {}
  }

  markdown += `<!-- /CGLI:MEMORY_CONTEXT -->\n`;

  return {
    success: true,
    query,
    notesCount: includedCount,
    estimatedTokens: Math.ceil(markdown.length / 4),
    markdown
  };
}

/**
 * Compila o context pack e salva em arquivo em .cgli/context/<childId>.md
 * Retorna o caminho do arquivo para injeção segura de linha única no prompt do PTY.
 */
function generateContextFile({
  query = '',
  nodeId = null,
  budgetTokens = 3000,
  scope = 'all',
  workspacePath,
  includeJournals = false,
  attachedMemoryIds = []
}) {
  const ws = workspacePath || process.cwd();
  const contextPack = buildContextPack({
    query,
    budgetTokens,
    scope,
    workspacePath: ws,
    includeJournals,
    attachedMemoryIds
  });

  if (!contextPack || contextPack.notesCount === 0) {
    return {
      success: true,
      hasContext: false,
      contextFilePath: null,
      notesCount: 0,
      estimatedTokens: 0,
      message: 'Nenhum contexto relevante para salvar.'
    };
  }

  const contextDir = path.join(ws, '.cgli', 'context');
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  const fileId = nodeId ? nodeId.replace(/[^a-zA-Z0-9_-]/g, '_') : generateId();
  const contextFile = path.join(contextDir, `${fileId}.md`);

  const now = getISOTimestamp();
  const fileHeader = `<!-- CGLI_AGENT_CONTEXT: ${fileId} | Gerado em: ${now} -->\n`;
  fs.writeFileSync(contextFile, fileHeader + contextPack.markdown, 'utf8');

  return {
    success: true,
    hasContext: true,
    contextFilePath: contextFile,
    relativeContextPath: path.relative(ws, contextFile),
    notesCount: contextPack.notesCount,
    estimatedTokens: contextPack.estimatedTokens,
    query
  };
}

/**
 * Gera ou atualiza o Map of Content (00-meta/MOC.md) do Vault
 */
function generateMOC({ scope = 'project', workspacePath }) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);
  const notes = listNotes({ scope, workspacePath });
  const isGlobal = scope === 'global';

  const decisions = [];
  const learnings = [];
  const knowledge = [];
  const rules = [];
  const tasks = [];
  const entities = [];
  const journals = [];
  const tagCounts = {};

  for (const n of notes) {
    if (n.tags && Array.isArray(n.tags)) {
      for (const t of n.tags) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }

    if (n.type === 'decision') decisions.push(n);
    else if (n.type === 'learning') learnings.push(n);
    else if (n.type === 'knowledge') knowledge.push(n);
    else if (n.type === 'rule' || n.type === 'preference') rules.push(n);
    else if (n.type === 'task') tasks.push(n);
    else if (n.type === 'entity') entities.push(n);
    else if (n.type === 'journal') journals.push(n);
  }

  const now = getISOTimestamp();
  const title = isGlobal
    ? 'Map of Content (MOC) - Memória Global do Usuário'
    : 'Map of Content (MOC) - Memória do Projeto';

  let doc = `---\ncgli_schema: moc/v1\ntitle: "${title}"\nscope: "${scope}"\nupdated: "${now}"\ntags: ["moc", "index", "cgli"]\n---\n\n`;
  doc += `# 🗺️ ${title}\n\n`;
  doc += `> **Última atualização:** ${now} · **Total de notas:** ${notes.length}\n\n`;

  doc += `### 📊 Resumo do Cofre\n`;
  doc += `- **Decisões de Arquitetura (ADRs):** ${decisions.length}\n`;
  doc += `- **Conhecimento & Aprendizados:** ${knowledge.length + learnings.length}\n`;
  doc += `- **Regras & Preferências:** ${rules.length}\n`;
  doc += `- **Tarefas & Entidades:** ${tasks.length + entities.length}\n`;
  doc += `- **Registros de Journal Diário:** ${journals.length}\n\n`;

  if (decisions.length > 0) {
    doc += `## 🏛️ Decisões de Arquitetura (ADRs)\n`;
    for (const d of decisions) {
      const tagStr = d.tags && d.tags.length ? ` \`${d.tags.map(t => `#${t}`).join(' ')}\`` : '';
      doc += `- [[${d.title}]] — *${d.created ? d.created.split('T')[0] : ''}*${tagStr}\n`;
    }
    doc += `\n`;
  }

  if (knowledge.length > 0 || learnings.length > 0) {
    doc += `## 🧠 Base de Conhecimento & Aprendizados\n`;
    for (const k of [...knowledge, ...learnings]) {
      const tagStr = k.tags && k.tags.length ? ` \`${k.tags.map(t => `#${t}`).join(' ')}\`` : '';
      doc += `- [[${k.title}]]${tagStr}\n`;
    }
    doc += `\n`;
  }

  if (rules.length > 0) {
    doc += `## ⚙️ Regras & Convenções de Desenvolvimento\n`;
    for (const r of rules) {
      doc += `- [[${r.title}]]\n`;
    }
    doc += `\n`;
  }

  if (tasks.length > 0 || entities.length > 0) {
    doc += `## 📋 Tarefas & Entidades do Sistema\n`;
    for (const item of [...tasks, ...entities]) {
      doc += `- [[${item.title}]] (${item.type})\n`;
    }
    doc += `\n`;
  }

  if (Object.keys(tagCounts).length > 0) {
    doc += `## 🏷️ Nuvem de Tópicos e Tags\n`;
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    doc += sortedTags.map(([tag, count]) => `\`#${tag}\` (${count})`).join(' · ') + `\n\n`;
  }

  if (journals.length > 0) {
    doc += `## 📅 Registros Diários Recentes (Journal)\n`;
    for (const j of journals.slice(0, 10)) {
      doc += `- [[${j.title}]] (\`${j.relativePath}\`)\n`;
    }
    doc += `\n`;
  }

  doc += `---\n*Gerado automaticamente pelo CGLI Memory Engine*\n`;

  const metaDir = path.join(vaultPath, '00-meta');
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  const mocPath = path.join(metaDir, 'MOC.md');
  atomicWriteFile(mocPath, doc);

  return {
    success: true,
    scope,
    file: mocPath,
    relativePath: path.relative(vaultPath, mocPath),
    totalNotes: notes.length,
    content: doc
  };
}

/**
 * Diagnóstico de integridade dos Vaults (Doctor)
 */
function runDoctor({ scope = 'all', workspacePath }) {
  const scopes = scope === 'all' ? ['project', 'global'] : [scope];
  const issues = [];
  const stats = {
    totalNotes: 0,
    totalJournals: 0,
    totalEstimatedTokens: 0,
    storageBytes: 0
  };

  const knownTitlesAndFilenames = new Set();
  const allNotesByPath = [];

  for (const s of scopes) {
    ensureVaultStructure(s, workspacePath);
    const notes = listNotes({ scope: s, workspacePath });
    for (const n of notes) {
      stats.totalNotes++;
      if (n.type === 'journal') stats.totalJournals++;
      allNotesByPath.push({ ...n, scope: s });

      knownTitlesAndFilenames.add((n.title || '').toLowerCase());
      const baseName = path.basename(n.fullPath, '.md').toLowerCase();
      knownTitlesAndFilenames.add(baseName);
      knownTitlesAndFilenames.add(slugify(n.title));
    }
  }

  for (const note of allNotesByPath) {
    try {
      const statsFile = fs.statSync(note.fullPath);
      stats.storageBytes += statsFile.size;

      const raw = fs.readFileSync(note.fullPath, 'utf8');
      stats.totalEstimatedTokens += Math.ceil(raw.length / 4);

      // 1. Checa frontmatter
      if (!raw.startsWith('---')) {
        issues.push({
          severity: 'warning',
          scope: note.scope,
          file: note.relativePath,
          message: 'Nota sem cabeçalho YAML Frontmatter',
          suggestion: 'Adicione metadata padronizado cgli_schema.'
        });
      } else {
        const endFm = raw.indexOf('\n---', 3);
        if (endFm === -1) {
          issues.push({
            severity: 'error',
            scope: note.scope,
            file: note.relativePath,
            message: 'YAML Frontmatter corrompido (delimitador de fechamento ausente)',
            suggestion: 'Corrija a formatação do delimitador ---'
          });
        }
      }

      // 2. Checa segredos residuais
      const secretCheck = scanAndSanitizeSecrets(raw, false);
      if (secretCheck.hasSecrets) {
        issues.push({
          severity: 'error',
          scope: note.scope,
          file: note.relativePath,
          message: `Segredo residual detectado: ${secretCheck.detected.join(', ')}`,
          suggestion: 'Sanitize a nota executando compactação ou editando para [REDACTED_SECRET].'
        });
      }

      // 3. Checa wikilinks quebrados
      const wikilinkRegex = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
      let match;
      while ((match = wikilinkRegex.exec(raw)) !== null) {
        const target = (match[1] || '').trim().toLowerCase();
        if (target && !knownTitlesAndFilenames.has(target) && !knownTitlesAndFilenames.has(slugify(target))) {
          if (target !== 'moc' && target !== 'map of content' && target !== note.title?.toLowerCase()) {
            issues.push({
              severity: 'info',
              scope: note.scope,
              file: note.relativePath,
              message: `Wikilink potencialmente órfão para [[${match[1]}]]`,
              suggestion: `Crie a nota correspondente para [[${match[1]}]] ou remova o link.`
            });
          }
        }
      }
      // 4. Checa arquivos de conflito de concorrência não resolvidos
      if (note.fullPath.includes('--conflict-') || note.type === 'conflict' || (note.title && note.title.includes('Conflito de Modificação'))) {
        issues.push({
          severity: 'warning',
          scope: note.scope,
          file: note.relativePath,
          message: `Conflito de concorrência pendente: ${note.relativePath}`,
          suggestion: 'Analise o arquivo de conflito e mescle as alterações com a nota original, removendo o arquivo de conflito após resolução.'
        });
      }
    } catch (err) {
      issues.push({
        severity: 'error',
        scope: note.scope,
        file: note.relativePath,
        message: `Falha ao ler arquivo: ${err.message}`,
        suggestion: 'Verifique permissões de leitura.'
      });
    }
  }

  // 5. Checa arquivos temporários na pasta .tmp
  for (const s of scopes) {
    const vaultPath = getVaultPath(s, workspacePath);
    const tmpDir = path.join(vaultPath, '.tmp');
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      if (files.length > 0) {
        issues.push({
          severity: 'info',
          scope: s,
          file: '.tmp',
          message: `${files.length} arquivos residuais na pasta de staging temporário .tmp`,
          suggestion: 'Arquivos temporários podem ser limpos com segurança.'
        });
      }
    }
  }

  // 6. Checa fila de spool outbox (.outbox) para requisições pendentes
  const projectVault = getVaultPath('project', workspacePath);
  const outboxDir = path.join(projectVault, '00-inbox', '.outbox');
  if (fs.existsSync(outboxDir)) {
    try {
      const outboxFiles = fs.readdirSync(outboxDir).filter(f => f.endsWith('.json'));
      if (outboxFiles.length > 0) {
        issues.push({
          severity: 'warning',
          scope: 'project',
          file: '00-inbox/.outbox',
          message: `${outboxFiles.length} requisições pendentes na fila outbox (falha de comunicação com o servidor)`,
          suggestion: 'Execute cgli memory drain-outbox ou restabeleça a conexão com o servidor ativo.'
        });
      }
    } catch (_) {}
  }

  const passed = issues.filter(i => i.severity === 'error').length === 0;

  return {
    passed,
    scannedScopes: scopes,
    stats,
    issues,
    summary: {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      infos: issues.filter(i => i.severity === 'info').length
    }
  };
}

/**
 * Compacta observações de journals em notas de conhecimento estruturadas
 * Utiliza ledger lateral em 00-meta/.compacted_ledger.json para garantir que os
 * arquivos de journal ativos permaneçam estritamente append-only sem risco de lost-update.
 */
function compactJournals({ scope = 'project', dryRun = false, olderThanDays = 7, workspacePath }) {
  const vaultPath = ensureVaultStructure(scope, workspacePath);
  const journalDir = path.join(vaultPath, '90-journal');
  if (!fs.existsSync(journalDir)) {
    return {
      success: true,
      scope,
      dryRun,
      entriesFound: 0,
      notesCreated: 0,
      message: 'Nenhum journal encontrado para compactar.'
    };
  }

  const ledgerDir = path.join(vaultPath, '00-meta');
  if (!fs.existsSync(ledgerDir)) fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, '.compacted_ledger.json');
  let ledger = { version: 1, compacted: {} };
  if (fs.existsSync(ledgerPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      if (parsed && typeof parsed.compacted === 'object') ledger = parsed;
    } catch (_) {}
  }

  const dateDirs = fs.readdirSync(journalDir).filter(d => {
    try {
      return fs.statSync(path.join(journalDir, d)).isDirectory();
    } catch (_) { return false; }
  });

  const nowTime = Date.now();
  const uncompactedEntries = [];

  for (const d of dateDirs) {
    // Filtro de idade: ignora datas recentes se olderThanDays > 0
    if (olderThanDays > 0) {
      const dateParts = d.split('-').map(Number);
      if (dateParts.length === 3) {
        const folderDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).getTime();
        const diffDays = Math.floor((nowTime - folderDate) / (1000 * 60 * 60 * 24));
        if (diffDays < olderThanDays) {
          continue; // Ainda não atingiu o TTL mínimo de idade para consolidação
        }
      }
    }

    const fullDateDir = path.join(journalDir, d);
    const files = fs.readdirSync(fullDateDir).filter(f => f.endsWith('.md'));

    for (const f of files) {
      const filePath = path.join(fullDateDir, f);
      const raw = fs.readFileSync(filePath, 'utf8');
      const sections = raw.split(/(?=^## \d{2}:\d{2}:\d{2})/m);

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        if (sec.startsWith('## ')) {
          const headerMatch = sec.match(/^## (\d{2}:\d{2}:\d{2}) · ([^·\n]+) · ([a-zA-Z0-9]+)/m);
          const time = headerMatch ? headerMatch[1] : '';
          const kind = headerMatch ? headerMatch[2].trim() : 'finding';
          const ulid = headerMatch ? headerMatch[3].trim() : '';

          // Verifica se já foi compactado pelo ledger ou marcador legado
          if (ulid && ledger.compacted[ulid]) continue;
          if (sec.includes('<!-- cgli:compacted -->')) continue;

          const tagsMatch = sec.match(/\*\*tags:\*\*([^\n]+)/);
          const tags = tagsMatch ? (tagsMatch[1].match(/#([a-zA-Z0-9_-]+)/g)?.map(t => t.slice(1)) || []) : [];

          const lines = sec.split('\n').filter(l => !l.startsWith('## ') && !l.startsWith('^') && !l.startsWith('**') && !l.startsWith('---') && l.trim().length > 0);
          const bodyText = lines.join('\n').trim();

          if (bodyText && ulid) {
            uncompactedEntries.push({
              date: d,
              time,
              kind,
              ulid,
              tags,
              text: bodyText,
              file: filePath,
              agent: path.basename(f, '.md')
            });
          }
        }
      }
    }
  }

  if (uncompactedEntries.length === 0) {
    return {
      success: true,
      scope,
      dryRun,
      olderThanDays,
      entriesFound: 0,
      notesCreated: 0,
      message: `Nenhum journal elegível para compactação (filtro de idade: >= ${olderThanDays} dias).`
    };
  }

  let createdNotesCount = 0;
  const createdNotes = [];

  if (!dryRun) {
    const groupedByDate = {};
    for (const e of uncompactedEntries) {
      if (!groupedByDate[e.date]) groupedByDate[e.date] = [];
      groupedByDate[e.date].push(e);
    }

    for (const [entryDate, entries] of Object.entries(groupedByDate)) {
      const allTags = Array.from(new Set(entries.flatMap(e => e.tags)));
      if (!allTags.includes('compacted')) allTags.push('compacted');

      let body = `Esta nota foi gerada pela consolidação automática de ${entries.length} observações do journal diário.\n\n### Observações Consolidadas:\n\n`;
      for (const e of entries) {
        body += `- **[${e.kind}]** (${e.time}, agente \`${e.agent}\`): ${e.text} (ref: [[${e.agent}#^${e.ulid}]])\n`;
      }

      const noteRes = createNote({
        scope,
        workspacePath,
        type: scope === 'global' ? 'learning' : 'knowledge',
        title: `Consolidado de Aprendizados (${entryDate})`,
        content: body,
        author: 'cgli-curator',
        tags: allTags
      });

      createdNotesCount++;
      createdNotes.push(noteRes);

      // Registra no ledger sem tocar nos arquivos de journal (preserva append-only)
      for (const e of entries) {
        ledger.compacted[e.ulid] = {
          date: e.date,
          compactedAt: getISOTimestamp(),
          consolidatedNoteId: noteRes.id,
          agent: e.agent,
          kind: e.kind
        };
      }
    }

    atomicWriteFile(ledgerPath, JSON.stringify(ledger, null, 2));
    generateMOC({ scope, workspacePath });
  }

  return {
    success: true,
    scope,
    dryRun,
    olderThanDays,
    entriesFound: uncompactedEntries.length,
    notesCreated: dryRun ? 0 : createdNotesCount,
    createdNotes,
    message: dryRun
      ? `Simulação concluída: ${uncompactedEntries.length} entradas elegíveis para consolidação (>= ${olderThanDays} dias).`
      : `Compactação concluída: ${uncompactedEntries.length} entradas consolidadas em ${createdNotesCount} notas de conhecimento permanente.`
  };
}

/**
 * Processa a fila outbox (.cgli/vault/00-inbox/.outbox) com operações pendentes
 * enfileiradas quando o servidor bridge ou app estava inacessível.
 */
function drainOutbox(workspacePath) {
  const ws = workspacePath || process.cwd();
  const vaultPath = getVaultPath('project', ws);
  const outboxDir = path.join(vaultPath, '00-inbox', '.outbox');

  if (!fs.existsSync(outboxDir)) {
    return { success: true, processed: 0, failed: 0, messages: [] };
  }

  const files = fs.readdirSync(outboxDir).filter(f => f.endsWith('.json'));
  let processed = 0;
  let failed = 0;
  const messages = [];

  for (const file of files) {
    const filePath = path.join(outboxDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const { endpoint, body } = data;
      let res;

      if (endpoint === '/api/memory/write') {
        res = writeObservation({ ...body, workspacePath: ws });
      } else if (endpoint === '/api/memory/note') {
        res = createNote({ ...body, workspacePath: ws });
      } else if (endpoint === '/api/memory/update') {
        res = updateNote({ ...body, workspacePath: ws });
      } else if (endpoint === '/api/memory/append') {
        res = appendToNote({ ...body, workspacePath: ws });
      }

      if (res && (res.success || res.id)) {
        fs.unlinkSync(filePath);
        processed++;
        messages.push(`Processado com sucesso: ${file} (${endpoint})`);
      } else {
        failed++;
        messages.push(`Erro ao processar ${file}: ${res ? res.error || res.message : 'Falha desconhecida'}`);
      }
    } catch (err) {
      failed++;
      messages.push(`Exceção ao processar ${file}: ${err.message}`);
    }
  }

  return { success: true, processed, failed, messages };
}

module.exports = {
  generateId,
  calculateEtag,
  getVaultPath,
  getGlobalVaultPath,
  getLocalVaultPath,
  ensureVaultStructure,
  scanAndSanitizeSecrets,
  writeObservation,
  createNote,
  updateNote,
  appendToNote,
  listNotes,
  getNote,
  openInObsidian,
  searchNotes,
  buildContextPack,
  generateContextFile,
  generateMOC,
  runDoctor,
  compactJournals,
  drainOutbox
};

// Dispatcher RPC para integração com Rust Bridge ou CLI direta
if (require.main === module) {
  const rpcArgs = process.argv.slice(2);
  const action = rpcArgs[0];

  async function handleRpc() {
    if (action === 'rpc') {
      const method = (rpcArgs[1] || 'GET').toUpperCase();
      const endpoint = rpcArgs[2] || '';
      let bodyRaw = rpcArgs[3] || '';

      if (!bodyRaw && (method === 'POST' || method === 'PUT')) {
        bodyRaw = await new Promise((resolve) => {
          let buf = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('readable', () => {
            let chunk;
            while ((chunk = process.stdin.read()) !== null) buf += chunk;
          });
          process.stdin.on('end', () => resolve(buf));
        });
      }

      let body = {};
      try { if (bodyRaw) body = JSON.parse(bodyRaw); } catch (_) {}

      const parsedUrl = new URL(endpoint.startsWith('http') ? endpoint : `http://127.0.0.1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);
      const pathname = parsedUrl.pathname;
      const params = parsedUrl.searchParams;

      const scope = body.scope || params.get('scope') || 'project';
      const workspacePath = body.workspacePath || params.get('workspacePath') || process.cwd();

      try {
        let result;
        if (pathname.includes('/api/memory/write')) {
          result = writeObservation({ ...body, scope, workspacePath });
        } else if (pathname.includes('/api/memory/note')) {
          result = createNote({ ...body, scope, workspacePath });
        } else if (pathname.includes('/api/memory/update')) {
          result = updateNote({ ...body, scope, workspacePath });
        } else if (pathname.includes('/api/memory/append')) {
          result = appendToNote({ ...body, scope, workspacePath });
        } else if (pathname.includes('/api/memory/list')) {
          const type = params.get('type') || body.type || null;
          const notes = listNotes({ scope, workspacePath, type });
          result = { success: true, scope, notes };
        } else if (pathname.includes('/api/memory/get')) {
          const id = params.get('id') || body.id || '';
          result = getNote({ scope, workspacePath, idOrPath: id });
        } else if (pathname.includes('/api/memory/open')) {
          result = openInObsidian({ scope, workspacePath, file: body.file || '' });
        } else if (pathname.includes('/api/memory/search')) {
          const query = params.get('q') || body.query || '';
          const searchScope = params.get('scope') || body.scope || 'all';
          const limit = Number(params.get('limit') || body.limit || 20);
          const hits = searchNotes({ query, scope: searchScope, limit, workspacePath });
          result = { success: true, query, results: hits };
        } else if (pathname.includes('/api/memory/context-file')) {
          result = generateContextFile({
            query: body.query || body.for || params.get('for') || '',
            nodeId: body.nodeId || params.get('nodeId') || null,
            budgetTokens: Number(body.budgetTokens || 3000),
            scope: body.scope || params.get('scope') || 'all',
            workspacePath,
            includeJournals: Boolean(body.includeJournals),
            attachedMemoryIds: body.attachedMemoryIds || []
          });
        } else if (pathname.includes('/api/memory/context')) {
          result = buildContextPack({
            query: body.query || body.for || params.get('for') || '',
            budgetTokens: Number(body.budgetTokens || 3000),
            scope: body.scope || params.get('scope') || 'all',
            workspacePath,
            includeJournals: Boolean(body.includeJournals),
            attachedMemoryIds: body.attachedMemoryIds || []
          });
        } else if (pathname.includes('/api/memory/drain-outbox')) {
          result = drainOutbox(workspacePath);
        } else if (pathname.includes('/api/memory/doctor')) {
          result = runDoctor({ scope: params.get('scope') || body.scope || 'all', workspacePath });
        } else if (pathname.includes('/api/memory/compact')) {
          result = compactJournals({
            scope,
            dryRun: Boolean(body.dryRun),
            olderThanDays: body.olderThanDays !== undefined ? Number(body.olderThanDays) : (body.days !== undefined ? Number(body.days) : 7),
            workspacePath
          });
        } else if (pathname.includes('/api/memory/moc')) {
          result = generateMOC({ scope, workspacePath });
        } else {
          result = { error: `Endpoint de memória desconhecido: ${pathname}` };
        }

        process.stdout.write(JSON.stringify(result));
      } catch (err) {
        process.stdout.write(JSON.stringify({ success: false, error: err.message }));
      }
    }
  }

  handleRpc();
}


