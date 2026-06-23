import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { createAlphaReceipt } from './receipts.js';

type ArtifactStatus = 'created' | 'edited';

interface ArtifactBaseInput {
  projectId: string;
  title: string;
  type: string;
  path: string;
  createdBy?: string;
  sourceRequest: string;
  receiptId?: string;
}

interface CreateArtifactInput extends ArtifactBaseInput {
  content: string;
}

interface EditArtifactInput extends ArtifactBaseInput {
  content: string;
  expectedSha256?: string;
}

function artifactRoot() {
  return path.resolve(runtimeConfig.alphaArtifactRoot || path.join(runtimeConfig.dataDir, 'alpha-artifacts'));
}

function assertRelativeArtifactPath(relativePath: string) {
  if (!relativePath?.trim()) throw new Error('path is required');
  if (path.isAbsolute(relativePath)) throw new Error('Absolute artifact paths are not allowed; use a root-relative path.');
  if (relativePath.split(/[\\/]/u).includes('..')) throw new Error('Parent path traversal is not allowed for Alpha artifacts.');
}

function assertInsideRoot(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(`Artifact path escapes Alpha artifact root: ${root}`);
}

async function resolveArtifactPath(relativePath: string) {
  assertRelativeArtifactPath(relativePath);
  const root = artifactRoot();
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, relativePath);
  assertInsideRoot(realRoot, target);
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const realParent = await fs.realpath(parent);
  assertInsideRoot(realRoot, realParent);
  return { root: realRoot, target, relativePath: path.relative(realRoot, target) };
}

function sha256(content: string | Buffer) {
  return createHash('sha256').update(content).digest('hex');
}

function sanitizeMetadataPath(relativePath: string) {
  return `${relativePath}.alpha.json`;
}

function baseMetadata(input: ArtifactBaseInput, relativePath: string, receiptId: string, status: ArtifactStatus) {
  return {
    project_id: input.projectId,
    title: input.title,
    type: input.type,
    path: relativePath,
    created_by: input.createdBy || 'alpha',
    source_request: input.sourceRequest,
    receipt_id: receiptId,
    status,
    updated_at: new Date().toISOString(),
  };
}

export async function alphaCreateArtifact(input: CreateArtifactInput) {
  const { root, target, relativePath } = await resolveArtifactPath(input.path);
  const receiptId = input.receiptId || randomUUID();
  const content = input.content ?? '';
  await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  const metadata = {
    ...baseMetadata(input, relativePath, receiptId, 'created'),
    sha256: sha256(content),
    bytes: Buffer.byteLength(content),
  };
  const metadataPath = sanitizeMetadataPath(relativePath);
  await fs.writeFile(path.join(root, metadataPath), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const receipt = createAlphaReceipt({
    receipt_id: receiptId,
    actor: metadata.created_by,
    requested_by: metadata.created_by,
    action: 'act/report:create_alpha_artifact',
    reason: input.sourceRequest,
    memory_used: [],
    authority_basis: 'ordinary internal artifact creation; no approval gate required',
    tools_used: ['alpha.create_artifact', 'code.create_file'],
    outcome: `Created Alpha artifact ${relativePath}`,
    artifact_paths: [relativePath, metadataPath],
    reversal_path: `Delete ${relativePath} and ${metadataPath} from ${root}.`,
    memory_candidates: [],
  });
  return { ok: true, status: 'created', workspaceRoot: root, path: relativePath, metadataPath, metadata, receipt };
}

export async function alphaEditArtifact(input: EditArtifactInput) {
  const { root, target, relativePath } = await resolveArtifactPath(input.path);
  const receiptId = input.receiptId || randomUUID();
  const previousContent = await fs.readFile(target, 'utf8');
  const previousSha256 = sha256(previousContent);
  if (input.expectedSha256 && input.expectedSha256 !== previousSha256) {
    return { ok: false, status: 'sha256_mismatch', path: relativePath, expectedSha256: input.expectedSha256, actualSha256: previousSha256 };
  }
  const nextContent = input.content ?? '';
  await fs.writeFile(target, nextContent, 'utf8');
  const afterSha256 = sha256(nextContent);
  const metadata = {
    ...baseMetadata(input, relativePath, receiptId, 'edited'),
    before: { sha256: previousSha256, bytes: Buffer.byteLength(previousContent) },
    after: { sha256: afterSha256, bytes: Buffer.byteLength(nextContent) },
    rollback: { instruction: `Overwrite ${relativePath} with before_content from this receipt, then verify sha256 ${previousSha256}.`, before_content: previousContent },
  };
  const metadataPath = sanitizeMetadataPath(relativePath);
  await fs.writeFile(path.join(root, metadataPath), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const receipt = createAlphaReceipt({
    receipt_id: receiptId,
    actor: metadata.created_by,
    requested_by: metadata.created_by,
    action: 'act/report:edit_alpha_artifact',
    reason: input.sourceRequest,
    memory_used: [],
    authority_basis: 'ordinary internal artifact edit; no approval gate required',
    tools_used: ['alpha.edit_artifact', 'code.edit'],
    outcome: `Edited Alpha artifact ${relativePath}`,
    artifact_paths: [relativePath, metadataPath],
    reversal_path: metadata.rollback.instruction,
    memory_candidates: [],
  });
  return { ok: true, status: 'edited', workspaceRoot: root, path: relativePath, metadataPath, previousSha256, sha256: afterSha256, metadata, receipt };
}
