import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, loadTask, saveTask, getSection, setSection, appendLog } from './task.js';
import type { EvidenceInput, EvidenceManifest, EvidenceRecord, TaskDocument } from './types.js';
import { validateTasteBrief } from './taste.js';
import { qaMissionHash } from './qa.js';
import { qualityPolicy } from './quality.js';
import { operationalPolicy } from './observability.js';
import { listConstitution } from './constitution.js';
const VISUAL_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const VISUAL_KINDS = new Set(['frontend-before', 'frontend-proposal', 'frontend-after', 'frontend-mobile-before', 'frontend-mobile-proposal', 'frontend-mobile-after', 'architecture-rendered', 'architecture-final', 'database-rendered', 'database-final']);
const TARGETED_FRONTEND_KINDS = new Set(['frontend-before', 'frontend-proposal', 'frontend-after', 'frontend-mobile-before', 'frontend-mobile-proposal', 'frontend-mobile-after']);
const PROPOSAL_KINDS = new Set(['frontend-proposal', 'frontend-mobile-proposal']);
const AFTER_KINDS = new Set(['frontend-after', 'frontend-mobile-after']);
const LAYOUT_REPORT_KINDS = new Set(['ui-after-validation']);
const DESIGN_BRIEF_KINDS = new Set(['ui-design-brief']);
const PROPOSAL_REVIEW_KINDS = new Set(['ui-proposal-review']);
const VISUAL_EVALUATOR_KINDS = new Set(['visual-proposal-evaluator-report','visual-final-evaluator-report']);
const CAPTURE_SCOPES = new Set(['focused-section', 'focused-element']);
const EXPECTED_SOURCES: Record<string,string[]> = {
    'frontend-before': ['running-application', 'browser-capture'], 'frontend-mobile-before': ['running-application', 'browser-capture'],
    'frontend-after': ['running-application', 'browser-capture'], 'frontend-mobile-after': ['running-application', 'browser-capture'],
    'frontend-proposal': ['image-gen-proposal'], 'frontend-mobile-proposal': ['image-gen-proposal'],
    'ui-design-brief': ['ui-design-brief'], 'ui-proposal-review': ['visual-proposal-review'], 'ui-after-validation': ['browser-layout-validation'],
    'backend-demo': ['executed-command', 'running-application'], 'test-log': ['executed-command'], 'migration-log': ['executed-command'], 'database-final': ['executed-command', 'schema-introspection'],
    'technical-review-report': ['technical-review'], 'qa-report': ['qa-validation', 'running-application', 'executed-command'], 'customer-report': ['customer-validation'],
    'visual-proposal-evaluator-report':['technical-review'], 'visual-final-evaluator-report':['technical-review'],
    'property-test-report':['executed-command'], 'mutation-test-report':['executed-command'], 'constitution-report':['executed-command','deterministic-check'],
    'operational-log':['running-application','executed-command'], 'operational-trace':['running-application','executed-command'], 'operational-metrics':['running-application','executed-command']
};
function manifestPath(root: string, id: string): string { return path.join(path.resolve(root), '.ai/evidence', id, 'evidence.json'); }
function readManifest(root: string, id: string): EvidenceManifest { const file = manifestPath(root, id); if (!existsSync(file))
    return { taskId: id, evidence: [] }; return JSON.parse(readFileSync(file, 'utf8')) as EvidenceManifest; }
function sha256(file: any) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
export function visualEvidenceDigest(root:string,id:string,stage:'proposal'|'final'='proposal'):string { const items=readManifest(root,id).evidence; const kinds=stage==='proposal'?['frontend-before','frontend-mobile-before','ui-design-brief','frontend-proposal','frontend-mobile-proposal','ui-proposal-review']:['frontend-before','frontend-mobile-before','ui-design-brief','frontend-proposal','frontend-mobile-proposal','ui-proposal-review','frontend-after','frontend-mobile-after','ui-after-validation']; const canonical=items.filter(item=>kinds.includes(item.kind)).map(item=>({kind:item.kind,sha256:item.sha256,route:item.route,viewport:item.viewport,target:item.target})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.sha256.localeCompare(b.sha256)); return createHash('sha256').update(JSON.stringify(canonical)).digest('hex'); }
function relativeFromTask(taskPath: any, file: any) { return path.relative(path.dirname(taskPath), file).split(path.sep).join('/'); }
function normalize(value: any) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function viewportDimensions(value: any) { const match = String(value || '').match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i); return match ? { width: Number(match[1]), height: Number(match[2]) } : null; }
function evidenceLine(item: any, relative: any) {
    const detail = [`- Kind: \`${item.kind}\``, `- Source: \`${item.source}\``, `- Tool: ${item.tool || 'not recorded'}`, item.route ? `- Route: \`${item.route}\`` : '', item.viewport ? `- Viewport: \`${item.viewport}\`` : '', item.target ? `- Target: \`${item.target}\`` : '', item.captureScope ? `- Capture: \`${item.captureScope}\`` : '', `- SHA-256: \`${item.sha256}\``].filter(Boolean).join('\n');
    if (VISUAL_KINDS.has(item.kind) || VISUAL_EXTENSIONS.has(path.extname(item.path).toLowerCase()))
        return `### ${item.label}\n\n![${item.label}](${relative})\n\n${detail}`;
    return `### ${item.label}\n\n[Open evidence](${relative})\n\n${detail}\n- Command: ${item.command ? `\`${item.command}\`` : 'not recorded'}\n- Exit code: ${item.exitCode ?? 'not recorded'}`;
}
function validateVisualFile(file: any) {
    const ext = path.extname(file).toLowerCase(), data = readFileSync(file);
    if (ext === '.png') {
        if (data.length < 24 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            return 'Invalid PNG signature or truncated file';
        if (data.subarray(12, 16).toString() !== 'IHDR' || data.readUInt32BE(16) === 0 || data.readUInt32BE(20) === 0)
            return 'Invalid PNG IHDR dimensions';
    }
    if (['.jpg', '.jpeg'].includes(ext) && !(data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9))
        return 'Invalid or truncated JPEG';
    if (ext === '.webp' && !(data.length >= 16 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'))
        return 'Invalid or truncated WebP';
    if (ext === '.gif' && !(data.length >= 10 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString()) && data.readUInt16LE(6) > 0 && data.readUInt16LE(8) > 0))
        return 'Invalid or truncated GIF';
    if (ext === '.svg' && !/<svg[\s>]/i.test(data.toString('utf8')))
        return 'Invalid SVG content';
    return null;
}
function readJson(file: any) { try {
    return JSON.parse(readFileSync(file, 'utf8'));
}
catch {
    return null;
} }
function validateDesignBrief(file: any) {
    const brief = readJson(file);
    if (!brief) return ['UI design brief must be valid JSON'];
    return validateTasteBrief(brief);
}
function validateVisualEvaluator(file:any,item:any,expectedDigest?:string){
 const report=readJson(file),errors:string[]=[];if(!report)return['visual evaluator report must be valid JSON'];
 if(report.schemaVersion!==1)errors.push('visual evaluator report schemaVersion must be 1');
 if(report.reviewerRole!=='technical-reviewer')errors.push('visual evaluator must use Technical Reviewer');
 if(report.freshContext!==true)errors.push('visual evaluator must use fresh context');
 if(!String(report.sourceDigest||'').match(/^[a-f0-9]{64}$/))errors.push('visual evaluator must bind a sourceDigest');
 if(expectedDigest&&report.sourceDigest!==expectedDigest)errors.push('visual evaluator sourceDigest must match the canonical visual evidence');
 if(report.verdict!=='pass')errors.push('visual evaluator verdict must be pass');
 if(Number(report.score)<85)errors.push('visual evaluator score must be at least 85');
 for(const key of ['sourceFaithful','mobileReadable','noOverflow','noClipping','scopePreserved'])if(report.checks?.[key]!==true)errors.push(`visual evaluator check failed: ${key}`);
 if(item.attributes?.sessionId&&report.producerSessionId&&item.attributes.sessionId===report.producerSessionId)errors.push('visual evaluator session must differ from proposal producer session');
 return errors;
}
function validateProposalReview(file: any) {
    const review = readJson(file), errors = [];
    if (!review)
        return ['UI proposal review must be valid JSON'];
    if (review.schemaVersion !== 1)
        errors.push('UI proposal review schemaVersion must be 1');
    if (!['frontend-proposal', 'frontend-mobile-proposal'].includes(review.screenshotKind))
        errors.push('UI proposal review must identify a frontend proposal');
    for (const field of ['route', 'target', 'viewport'])
        if (!String(review[field] || '').trim())
            errors.push(`UI proposal review must record ${field}`);
    if (review.tasteSkillApplied !== true)
        errors.push('UI proposal review must apply Taste Skill');
    const checks = review.checks || {};
    const requiredChecks = { targetMatch: 'proposal does not match the requested target', scopePreserved: 'proposal changes areas outside the approved scope', noVisibleOverflow: 'visible overflow detected', noTextClipping: 'clipped text detected', noOverlappingElements: 'overlapping elements detected', readableText: 'unreadable text detected', designSystemConsistency: 'proposal is inconsistent with the project visual language' };
    for (const [key, message] of Object.entries(requiredChecks))
        if (checks[key] !== true)
            errors.push(message);
    if (review.verdict !== 'pass')
        errors.push('UI proposal review verdict must be pass');
    return errors;
}
function readLayoutReport(file: any) { return readJson(file); }
function validateLayoutReport(file: any, item: any) {
    const report = readLayoutReport(file), errors = [];
    if (!report)
        return ['layout validation must be valid JSON'];
    if (report.schemaVersion !== 1)
        errors.push('layout validation schemaVersion must be 1');
    const expectedKind = ['frontend-after', 'frontend-mobile-after'];
    if (!expectedKind.includes(report.screenshotKind))
        errors.push(`${item.kind} screenshotKind must be one of: ${expectedKind.join(', ')}`);
    if (!String(report.route || '').trim())
        errors.push('layout validation must record the real route');
    if (!String(report.target || '').trim())
        errors.push('layout validation must record the exact target selector or visible anchor');
    if (!Number.isFinite(Number(report.viewport?.width)) || Number(report.viewport.width) <= 0 || !Number.isFinite(Number(report.viewport?.height)) || Number(report.viewport.height) <= 0)
        errors.push('layout validation must record numeric viewport width and height');
    if (!CAPTURE_SCOPES.has(report.capture?.scope))
        errors.push('layout validation capture scope must be focused-section or focused-element');
    if (report.capture?.targetFound !== true)
        errors.push('layout validation target was not found');
    if (report.capture?.targetVisible !== true)
        errors.push('layout validation target was not visible');
    if (!Number.isFinite(Number(report.capture?.targetCoverage)) || Number(report.capture.targetCoverage) < 0.35)
        errors.push('focused screenshot must devote at least 35% of the frame to the requested target');
    if (report.checks?.horizontalOverflow !== false)
        errors.push('horizontal overflow detected');
    if (report.checks?.textClipping !== false)
        errors.push('text clipping detected');
    if (report.checks?.overlappingElements !== false)
        errors.push('overlapping elements detected');
    if (report.checks?.unreadableText !== false)
        errors.push('unreadable text detected');
    if (!Array.isArray(report.measurements) || report.measurements.length === 0)
        errors.push('layout validation must include measured target elements');
    else
        for (const [index, measurement] of report.measurements.entries()) {
            const clientWidth = Number(measurement.clientWidth), scrollWidth = Number(measurement.scrollWidth), clientHeight = Number(measurement.clientHeight), scrollHeight = Number(measurement.scrollHeight);
            if (!String(measurement.selector || '').trim())
                errors.push(`measurement ${index + 1} must identify its selector`);
            if (!Number.isFinite(clientWidth) || clientWidth <= 0 || !Number.isFinite(scrollWidth) || scrollWidth <= 0)
                errors.push(`measurement ${index + 1} must contain positive widths`);
            else if (scrollWidth > clientWidth + 1)
                errors.push(`measurement ${index + 1} has horizontal overflow`);
            if (!Number.isFinite(clientHeight) || clientHeight <= 0 || !Number.isFinite(scrollHeight) || scrollHeight <= 0)
                errors.push(`measurement ${index + 1} must contain positive heights`);
        }
    return errors;
}
function validateMetadata(item: any) {
    const errors = [], allowed = EXPECTED_SOURCES[item.kind];
    if (allowed && !allowed.includes(item.source))
        errors.push(`${item.kind} source must be one of: ${allowed.join(', ')}`);
    if (item.source === 'executed-command') {
        if (!String(item.command || '').trim())
            errors.push(`${item.kind} must record the executed command`);
        if (item.exitCode === null || item.exitCode === undefined || !Number.isInteger(Number(item.exitCode)))
            errors.push(`${item.kind} must record a numeric exit code`);
    }
    if (TARGETED_FRONTEND_KINDS.has(item.kind)) {
        if (!String(item.route || '').trim())
            errors.push(`${item.kind} must record the real route or screen`);
        if (!String(item.viewport || '').trim() || !viewportDimensions(item.viewport))
            errors.push(`${item.kind} must record an exact pixel viewport such as 1440x1000`);
        if (!String(item.target || '').trim())
            errors.push(`${item.kind} must record the exact target selector or visible anchor`);
        if (!CAPTURE_SCOPES.has(item.captureScope))
            errors.push(`${item.kind} capture scope must be focused-section or focused-element`);
    }
    if (item.kind === 'backend-demo' && item.source === 'running-application' && !String(item.route || '').trim())
        errors.push('backend-demo must record the real endpoint or public operation');
    const attributes=item.attributes&&typeof item.attributes==='object'?item.attributes:{};
    if(item.kind==='property-test-report'){
        if(!Number.isInteger(Number(attributes.generatedCases))||Number(attributes.generatedCases)<=0)errors.push('property-test-report must record a positive generatedCases count');
        if(!String(attributes.framework||'').trim())errors.push('property-test-report must record the property testing framework');
    }
    if(item.kind==='mutation-test-report'){
        const score=Number(attributes.score),threshold=Number(attributes.threshold),total=Number(attributes.totalMutants);
        if(!Number.isFinite(score)||score<0||score>100)errors.push('mutation-test-report must record score from 0 to 100');
        if(!Number.isFinite(threshold)||threshold<0||threshold>100)errors.push('mutation-test-report must record threshold from 0 to 100');
        if(Number.isFinite(score)&&Number.isFinite(threshold)&&score<threshold)errors.push('mutation-test-report score is below the approved threshold');
        if(!Number.isInteger(total)||total<=0)errors.push('mutation-test-report must record a positive totalMutants count');
    }
    if(['operational-log','operational-trace','operational-metrics'].includes(item.kind)){
        if(!String(attributes.environment||'').trim())errors.push(`${item.kind} must identify the execution environment`);
        if(!String(attributes.scenario||'').trim())errors.push(`${item.kind} must identify the exercised scenario`);
    }
    if(item.kind==='operational-trace'&&!String(attributes.traceId||attributes.correlationId||'').trim())errors.push('operational-trace must record traceId or correlationId');
    if(item.kind==='operational-metrics'){
        if(!Array.isArray(attributes.metrics)||attributes.metrics.length===0)errors.push('operational-metrics must name the captured metrics');
        if(!String(attributes.sampleWindow||'').trim())errors.push('operational-metrics must record the sample window');
    }
    return errors;
}
export function addEvidence(root: string, id: string, input: EvidenceInput): EvidenceRecord {
    const projectRoot = path.resolve(root), task = loadTask(findTask(root, id)), absolute = path.resolve(input.path), allowedRoot = path.join(projectRoot, '.ai/evidence', id) + path.sep;
    if (!absolute.startsWith(allowedRoot))
        throw new Error(`Evidence must be stored under .ai/evidence/${id}/`);
    if (!existsSync(absolute) || !statSync(absolute).isFile() || statSync(absolute).size === 0)
        throw new Error('Evidence file must exist and be non-empty');
    if (VISUAL_KINDS.has(input.kind) || VISUAL_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
        const error = validateVisualFile(absolute);
        if (error)
            throw new Error(error);
    }
    const metadataErrors = validateMetadata(input);
    if (metadataErrors.length)
        throw new Error(metadataErrors.join('; '));
    if (LAYOUT_REPORT_KINDS.has(input.kind)) {
        const errors = validateLayoutReport(absolute, input);
        if (errors.length)
            throw new Error(errors.join('; '));
    }
    if (DESIGN_BRIEF_KINDS.has(input.kind)) {
        const errors = validateDesignBrief(absolute);
        if (errors.length)
            throw new Error(errors.join('; '));
    }
    if (PROPOSAL_REVIEW_KINDS.has(input.kind)) {
        const errors = validateProposalReview(absolute);
        if (errors.length)
            throw new Error(errors.join('; '));
    }
    if (VISUAL_EVALUATOR_KINDS.has(input.kind)) {
        const stage=input.kind==='visual-final-evaluator-report'?'final':'proposal';const errors = validateVisualEvaluator(absolute,input,visualEvidenceDigest(root,id,stage));
        if (errors.length) throw new Error(errors.join('; '));
    }
    const manifest = readManifest(root, id), hash = sha256(absolute), relativeToEvidence = path.relative(path.dirname(manifestPath(root, id)), absolute).split(path.sep).join('/');
    if (manifest.evidence.some((item: any) => item.kind === input.kind && item.sha256 === hash))
        throw new Error('This evidence is already registered');
    const missionHash=input.kind==='qa-report' ? (input.missionHash || task.meta.qa_mission_hash || null) : (input.missionHash || null);
    const item: EvidenceRecord = { id: `EV-${String(manifest.evidence.length + 1).padStart(3, '0')}`, kind: input.kind, path: relativeToEvidence, source: input.source, label: input.label || input.kind, tool: input.tool || null, command: input.command || null, exitCode: input.exitCode === undefined || input.exitCode === null ? null : Number(input.exitCode), route: input.route || null, viewport: input.viewport || null, target: input.target || null, captureScope: input.captureScope || null, missionHash, attributes: input.attributes || {}, createdAt: new Date().toISOString(), sha256: hash, size: statSync(absolute).size };
    manifest.evidence.push(item);
    mkdirSync(path.dirname(manifestPath(root, id)), { recursive: true });
    writeFileSync(manifestPath(root, id), `${JSON.stringify(manifest, null, 2)}\n`);
    const current = getSection(task.body, 'Evidence'), rel = relativeFromTask(task.path, absolute);
    task.body = setSection(task.body, 'Evidence', `${current}\n\n${evidenceLine(item, rel)}`.trim());
    appendLog(task, `Evidence ${item.id} registered: ${item.kind}.`);
    saveTask(task);
    return item;
}
export function listEvidence(root: string, id: string): EvidenceRecord[] { return readManifest(root, id).evidence; }
function requiredKinds(task: TaskDocument, stage: string): string[] {
    const route = task.meta.route, surfaces = task.meta.surfaces, required: string[] = [];
    const frontend = surfaces.includes('frontend') || surfaces.includes('ui') || surfaces.includes('ux'), backend = surfaces.includes('backend') || surfaces.includes('api'), database = surfaces.includes('database') || route.database;
    if (stage === 'pre-approval') {
        if (frontend || route.design) {
            required.push('frontend-before', 'ui-design-brief', 'frontend-proposal', 'ui-proposal-review');
            if (['medium','high','critical'].includes(String(task.meta.risk).toLowerCase()) || ['medium','large'].includes(String(task.meta.size).toLowerCase())) required.push('visual-proposal-evaluator-report');
        }
        if (route.architecture)
            required.push('architecture-source', 'architecture-rendered');
        if (database)
            required.push('database-source', 'database-rendered', 'migration-plan');
    }
    if (stage === 'technical-review' && route.technical_review !== 'none')
        required.push('technical-review-report');
    if (stage === 'qa') {
        if (frontend && route.implementation)
            required.push('frontend-after', 'ui-after-validation');
        if (backend && route.implementation)
            required.push('backend-demo', 'test-log');
        if (database && route.implementation)
            required.push('database-final', 'migration-log');
        if (route.architecture && route.implementation)
            required.push('architecture-final');
        if (route.technical_review !== 'none') required.push('technical-review-report');
        const q=qualityPolicy(task); if(q.propertyTesting==='required') required.push('property-test-report'); if(q.mutationTesting==='required') required.push('mutation-test-report');
        const ops=operationalPolicy(task); required.push(...ops.requiredEvidence);
        if(route.technical_review!=='none' && listConstitution(task.path.slice(0,task.path.indexOf(`${path.sep}.ai${path.sep}`))).some(item=>item.status==='active')) required.push('constitution-report');
        if (route.qa !== 'none')
            required.push('qa-report');
    }
    if (stage === 'final') {
        required.push(...requiredKinds(task, 'qa'));
        if (route.final_customer) required.push('customer-report');
        if ((frontend || route.design) && (['medium','high','critical'].includes(String(task.meta.risk).toLowerCase()) || ['medium','large'].includes(String(task.meta.size).toLowerCase()))) required.push('visual-final-evaluator-report');
    }
    return [...new Set(required)];
}
function reportMatchesScreenshot(report: any, screenshot: any) {
    const dims = viewportDimensions(screenshot.viewport);
    return report && report.screenshotKind === screenshot.kind && normalize(report.route) === normalize(screenshot.route) && normalize(report.target) === normalize(screenshot.target) && report.capture?.scope === screenshot.captureScope && dims && Number(report.viewport?.width) === dims.width && Number(report.viewport?.height) === dims.height;
}
export function validateEvidence(root: string, id: string, stage = 'all') {
    const task = loadTask(findTask(root, id)), items = listEvidence(root, id), kinds = new Set(items.map((item: any) => item.kind)), required = stage === 'all' ? [...requiredKinds(task, 'pre-approval'), ...requiredKinds(task, 'final')] : requiredKinds(task, stage);
    const missing = [...new Set(required)].filter((kind: any) => !kinds.has(kind)), errors = [], layoutReports = new Map(), designBriefs = new Map(), proposalReviews = new Map();
    for (const item of items) {
        const file = path.resolve(path.dirname(manifestPath(root, id)), item.path);
        if (!existsSync(file))
            errors.push(`Missing file for ${item.id}`);
        else {
            if (sha256(file) !== item.sha256)
                errors.push(`Hash changed for ${item.id}`);
            if (VISUAL_KINDS.has(item.kind) || VISUAL_EXTENSIONS.has(path.extname(file).toLowerCase())) {
                const visual = validateVisualFile(file);
                if (visual)
                    errors.push(`${item.id}: ${visual}`);
            }
            if (LAYOUT_REPORT_KINDS.has(item.kind)) {
                const layoutErrors = validateLayoutReport(file, item);
                if (layoutErrors.length)
                    errors.push(...layoutErrors.map((error: any) => `${item.id}: ${error}`));
                else
                    layoutReports.set(item.id, readLayoutReport(file));
            }
            if (DESIGN_BRIEF_KINDS.has(item.kind)) {
                const briefErrors = validateDesignBrief(file);
                if (briefErrors.length)
                    errors.push(...briefErrors.map((error: any) => `${item.id}: ${error}`));
                else
                    designBriefs.set(item.id, readJson(file));
            }
            if (PROPOSAL_REVIEW_KINDS.has(item.kind)) {
                const reviewErrors = validateProposalReview(file);
                if (reviewErrors.length)
                    errors.push(...reviewErrors.map((error: any) => `${item.id}: ${error}`));
                else
                    proposalReviews.set(item.id, readJson(file));
            }
            if (VISUAL_EVALUATOR_KINDS.has(item.kind)) {
                const stage=item.kind==='visual-final-evaluator-report'?'final':'proposal';const evaluatorErrors=validateVisualEvaluator(file,item,visualEvidenceDigest(root,id,stage));
                if(evaluatorErrors.length) errors.push(...evaluatorErrors.map((error:any)=>`${item.id}: ${error}`));
            }
        }
        errors.push(...validateMetadata(item).map((error: any) => `${item.id}: ${error}`));
        const markdown = readFileSync(task.path, 'utf8'), rel = relativeFromTask(task.path, file);
        if (!markdown.includes(`(${rel})`))
            errors.push(`Markdown does not reference ${item.id}`);
    }
    const beforeItems = items.filter((x: any) => ['frontend-before', 'frontend-mobile-before'].includes(x.kind)), proposalItems = items.filter((x: any) => PROPOSAL_KINDS.has(x.kind)), afterItems = items.filter((x: any) => AFTER_KINDS.has(x.kind));
    for (const proposal of proposalItems) {
        const matchingBefore = beforeItems.find((before: any) => normalize(before.route) === normalize(proposal.route) && normalize(before.viewport) === normalize(proposal.viewport));
        if (!matchingBefore)
            errors.push(`${proposal.id}: no matching focused before capture for route and viewport`);
        else if (normalize(matchingBefore.target) !== normalize(proposal.target))
            errors.push(`${proposal.id}: proposal target must match the before capture target`);
        const brief = [...designBriefs.values()].find((value: any) => normalize(value.context?.route) === normalize(proposal.route) && normalize(value.context?.target) === normalize(proposal.target) && normalize(value.context?.viewport) === normalize(proposal.viewport));
        if (!brief)
            errors.push(`${proposal.id}: no matching ui-design-brief for target, route, and viewport`);
        const review = [...proposalReviews.values()].find((value: any) => value.screenshotKind === proposal.kind && normalize(value.route) === normalize(proposal.route) && normalize(value.target) === normalize(proposal.target) && normalize(value.viewport) === normalize(proposal.viewport));
        if (!review)
            errors.push(`${proposal.id}: no matching ui-proposal-review for target, route, and viewport`);
    }
    for (const after of afterItems) {
        const baseline = [...proposalItems, ...beforeItems].find((item: any) => normalize(item.route) === normalize(after.route) && normalize(item.viewport) === normalize(after.viewport));
        if (!baseline)
            errors.push(`${after.id}: no matching before/proposal evidence for route and viewport`);
        else if (normalize(baseline.target) !== normalize(after.target))
            errors.push(`${after.id}: after target must match the approved target`);
        const report = [...layoutReports.values()].find((value: any) => reportMatchesScreenshot(value, after));
        if (!report)
            errors.push(`${after.id}: no matching ui-after-validation for target, route, viewport, and capture scope`);
    }
    const before = items.find((x: any) => x.kind === 'frontend-before'), proposal = items.find((x: any) => x.kind === 'frontend-proposal'), after = items.find((x: any) => x.kind === 'frontend-after');
    if (before && proposal && before.sha256 === proposal.sha256)
        errors.push('Frontend before and proposal evidence must be distinct');
    if (proposal && after && proposal.sha256 === after.sha256)
        errors.push('Frontend proposal and after evidence must be distinct');
    if (before && after && before.sha256 === after.sha256)
        errors.push('Frontend before and after evidence must be distinct');
    const qa=items.find((x:any)=>x.kind==='qa-report'); if(qa && task.meta.qa_mission_hash && qa.missionHash!==task.meta.qa_mission_hash) errors.push('QA mission hash does not match the approved immutable QA Mission');
    return { valid: missing.length === 0 && errors.length === 0, missing, errors, required };
}
