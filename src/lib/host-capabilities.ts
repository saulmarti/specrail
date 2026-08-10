import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface HostCapabilityRecord {
  schemaVersion: 1;
  sessionId: string;
  host: string;
  subagentSpawn: boolean;
  parallelSubagents: boolean;
  attestation: string;
  recordedAt: string;
  recordDigest: string;
}

export interface HostCapabilityStatus {
  valid: boolean;
  sessionId: string | null;
  parallelVerified: boolean;
  record: HostCapabilityRecord | null;
  detail: string;
}

function safeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('Host capability requires a non-empty stable session ID');
  return normalized.slice(0, 180);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function payload(record: Omit<HostCapabilityRecord, 'recordDigest'> | HostCapabilityRecord) {
  const { recordDigest: _ignored, ...rest } = record as HostCapabilityRecord;
  return rest;
}
function fileFor(root: string, sessionId: string): string {
  return path.join(path.resolve(root), '.ai', 'runtime', 'host-capabilities', `${safeSegment(sessionId)}.json`);
}
function atomicJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
function validate(record: HostCapabilityRecord, expectedSession: string): void {
  if (record.schemaVersion !== 1) throw new Error('Unsupported host capability schema');
  if (record.sessionId !== expectedSession) throw new Error('Host capability session identity mismatch');
  if (!record.host.trim()) throw new Error('Host capability requires a host name');
  if (!record.attestation.trim() || record.attestation.trim().length < 12) throw new Error('Host capability requires a concrete host attestation');
  if (record.parallelSubagents && !record.subagentSpawn) throw new Error('Parallel subagents require subagent spawning support');
  if (digest(payload(record)) !== record.recordDigest) throw new Error(`Host capability integrity check failed for session ${expectedSession}`);
}

export function getHostCapabilityStatus(root: string, sessionId?: string | null): HostCapabilityStatus {
  const id = String(sessionId || '').trim();
  if (!id) return { valid: false, sessionId: null, parallelVerified: false, record: null, detail: 'No host session capability attestation was supplied.' };
  const canonical = safeSegment(id);
  const file = fileFor(root, canonical);
  if (!existsSync(file)) return { valid: false, sessionId: canonical, parallelVerified: false, record: null, detail: `Host session ${canonical} has not attested subagent capabilities.` };
  try {
    const record = JSON.parse(readFileSync(file, 'utf8')) as HostCapabilityRecord;
    validate(record, canonical);
    return {
      valid: true,
      sessionId: canonical,
      parallelVerified: record.subagentSpawn && record.parallelSubagents,
      record,
      detail: record.subagentSpawn && record.parallelSubagents
        ? `Host ${record.host} attests parallel subagent spawning for this session.`
        : `Host ${record.host} does not attest parallel subagent spawning for this session.`
    };
  } catch (error) {
    return { valid: false, sessionId: canonical, parallelVerified: false, record: null, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function recordHostCapabilities(root: string, input: {
  sessionId: string;
  host: string;
  subagentSpawn: boolean;
  parallelSubagents: boolean;
  attestation: string;
}): HostCapabilityRecord {
  const sessionId = safeSegment(input.sessionId);
  const host = String(input.host || '').trim();
  const attestation = String(input.attestation || '').trim();
  const nextBase: Omit<HostCapabilityRecord, 'recordDigest'> = {
    schemaVersion: 1,
    sessionId,
    host,
    subagentSpawn: input.subagentSpawn === true,
    parallelSubagents: input.parallelSubagents === true,
    attestation,
    recordedAt: new Date().toISOString()
  };
  const candidate: HostCapabilityRecord = { ...nextBase, recordDigest: digest(nextBase) };
  validate(candidate, sessionId);
  const existing = getHostCapabilityStatus(root, sessionId);
  if (existing.record) {
    const same = existing.record.host === candidate.host &&
      existing.record.subagentSpawn === candidate.subagentSpawn &&
      existing.record.parallelSubagents === candidate.parallelSubagents &&
      existing.record.attestation === candidate.attestation;
    if (!same) throw new Error(`Host capability session ${sessionId} is immutable; use a new stable session ID when host capabilities change`);
    return existing.record;
  }
  if (existsSync(fileFor(root, sessionId)) && !existing.valid) throw new Error(`Host capability session ${sessionId} is corrupt; remove it through explicit administrative recovery before reusing this session ID`);
  atomicJson(fileFor(root, sessionId), candidate);
  return candidate;
}


export function resetHostCapabilities(root: string, sessionId: string, options: { force?: boolean } = {}): { sessionId: string; reset: true } {
  if (!options.force) throw new Error('Host capability reset is administrative recovery and requires force=true');
  const canonical = safeSegment(sessionId);
  // Recovery must work even if the record is corrupt, so never parse it here.
  rmSync(fileFor(root, canonical), { force: true });
  return { sessionId: canonical, reset: true };
}
