import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, loadTask, saveTask, getSection, setSection, appendLog } from './task.js';
import { controlProfile, isMicroControl } from './control-profile.js';
import type { EvidenceInput, EvidenceManifest, EvidenceRecord, TaskDocument } from './types.js';
import { validateTasteBrief } from './taste.js';
import { qaMissionHash } from './qa.js';
import { qualityPolicy } from './quality.js';
import { operationalPolicy } from './observability.js';
import { listConstitution } from './constitution.js';
import { IMPLEMENTATION_DEPENDENT_EVIDENCE_KINDS, evidenceGenerationMatches } from './implementation-generation.js';
import { activeRevision, revisionRequiredEvidenceKinds } from './revisions.js';
import { hasUserWaiver } from './user-overrides.js';
const VISUAL_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const VISUAL_KINDS = new Set(['frontend-before', 'frontend-proposal', 'frontend-after', 'frontend-mobile-before', 'frontend-mobile-proposal', 'frontend-mobile-after', 'architecture-rendered', 'architecture-final', 'database-rendered', 'database-final']);
const TARGETED_FRONTEND_KINDS = new Set(['frontend-before', 'frontend-proposal', 'frontend-after', 'frontend-mobile-before', 'frontend-mobile-proposal', 'frontend-mobile-after']);
const PROPOSAL_KINDS = new Set(['frontend-proposal', 'frontend-mobile-proposal']);
const AFTER_KINDS = new Set(['frontend-after', 'frontend-mobile-after']);
const FRONTEND_RUNTIME_KINDS = new Set(['frontend-before', 'frontend-mobile-before', 'frontend-after', 'frontend-mobile-after']);
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
    'operational-log':['running-application','executed-command'], 'operational-trace':['running-application','executed-command'], 'operational-metrics':['running-application','executed-command'],
    'revision-validation-report':['running-application','executed-command','browser-capture','qa-validation']
};
function manifestPath(root: string, id: string): string { return path.join(path.resolve(root), '.ai/evidence', id, 'evidence.json'); }
function evidenceLocationError(root:string,id:string,file:string):string|null {
    try {
        const projectReal=realpathSync(path.resolve(root));
        const expectedRoot=path.join(projectReal,'.ai','evidence',id);
        const lexical=path.resolve(file);
        if(lstatSync(lexical).isSymbolicLink()) return 'Evidence files must be regular project-owned files, not symbolic links';
        const real=realpathSync(lexical);
        if(real===expectedRoot||!real.startsWith(`${expectedRoot}${path.sep}`)) return `Evidence real path must stay under .ai/evidence/${id}/`;
        return null;
    } catch { return 'Evidence real path could not be resolved safely'; }
}
function readManifest(root: string, id: string): EvidenceManifest { const file = manifestPath(root, id); if (!existsSync(file))
    return { taskId: id, evidence: [] }; return JSON.parse(readFileSync(file, 'utf8')) as EvidenceManifest; }
function sha256(file: any) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function evidenceArtifactContext(root:string,id:string,item:EvidenceRecord):{route?:string|null;target?:string|null;viewport?:string|null;captureScope?:string|null}|null {
    if(TARGETED_FRONTEND_KINDS.has(item.kind)) return item;
    const file=path.resolve(path.dirname(manifestPath(root,id)),item.path);
    const data=existsSync(file)?readJson(file):null;
    if(!data) return null;
    if(item.kind==='ui-design-brief') return {route:data.context?.route??null,target:data.context?.target??null,viewport:data.context?.viewport??null};
    if(item.kind==='ui-proposal-review') return {route:data.route??null,target:data.target??null,viewport:data.viewport??null};
    if(item.kind==='ui-after-validation') return {route:data.route??null,target:data.target??null,viewport:Number.isFinite(Number(data.viewport?.width))&&Number.isFinite(Number(data.viewport?.height))?`${Number(data.viewport.width)}x${Number(data.viewport.height)}`:null,captureScope:data.capture?.scope??null};
    return null;
}
export function visualEvidenceDigest(root:string,id:string,stage:'proposal'|'final'='proposal'):string {
    const task=loadTask(findTask(root,id)),items=readManifest(root,id).evidence,contexts=expectedVisualContexts(task);
    const frontendKinds=stage==='proposal'?new Set(['frontend-before','frontend-mobile-before','frontend-proposal','frontend-mobile-proposal']):new Set(['frontend-before','frontend-mobile-before','frontend-proposal','frontend-mobile-proposal','frontend-after','frontend-mobile-after']);
    const supportingKinds=stage==='proposal'?new Set(['ui-design-brief','ui-proposal-review']):new Set(['ui-design-brief','ui-proposal-review','ui-after-validation']);
    const frontend=canonicalFrontendVisualItems(task,items.filter(item=>frontendKinds.has(item.kind)));
    const supportingSelected=new Map<string,EvidenceRecord>();
    for(const item of items.filter(item=>supportingKinds.has(item.kind))){
        const context=evidenceArtifactContext(root,id,item);
        if(contexts.length&&(!context||!contexts.some(expected=>sameVisualContext(context,expected)&&(!canonicalCaptureScope(context.captureScope)||canonicalCaptureScope(context.captureScope)===expected.captureScope))))continue;
        const key=`${item.kind}|${exactContextValue(context?.route)}|${exactContextValue(context?.target)}|${canonicalViewport(context?.viewport)}|${canonicalCaptureScope(context?.captureScope)}`;
        supportingSelected.set(key,item);
    }
    const canonical=[...frontend,...supportingSelected.values()].map(item=>({kind:item.kind,sha256:item.sha256,route:item.route,viewport:item.viewport,target:item.target,captureScope:item.captureScope||null,runtimeUrl:item.runtimeUrl||null})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.sha256.localeCompare(b.sha256));
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
function relativeFromTask(taskPath: any, file: any) { return path.relative(path.dirname(taskPath), file).split(path.sep).join('/'); }
function normalize(value: any) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function exactContextValue(value: unknown): string { return String(value ?? '').trim(); }
function viewportDimensions(value: any) { const match = String(value || '').match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i); return match ? { width: Number(match[1]), height: Number(match[2]) } : null; }
function canonicalViewport(value: unknown): string { const dims=viewportDimensions(value); return dims ? `${dims.width}x${dims.height}` : exactContextValue(value); }
function canonicalCaptureScope(value: unknown): string { const normalized=String(value??'').trim().toLowerCase().replace(/[\s_]+/g,'-'); return normalized==='focused-section'||normalized==='focused-element'?normalized:''; }
function sameVisualContext(a: any,b: any): boolean { return exactContextValue(a?.route)===exactContextValue(b?.route)&&canonicalViewport(a?.viewport)===canonicalViewport(b?.viewport)&&exactContextValue(a?.target)===exactContextValue(b?.target); }
function sameVisualFrame(a:any,b:any):boolean { return sameVisualContext(a,b)&&canonicalCaptureScope(a?.captureScope)===canonicalCaptureScope(b?.captureScope); }
function frontendVisualRole(kind:string):'before'|'proposal'|'after'|null { if(['frontend-before','frontend-mobile-before'].includes(kind))return'before';if(['frontend-proposal','frontend-mobile-proposal'].includes(kind))return'proposal';if(['frontend-after','frontend-mobile-after'].includes(kind))return'after';return null; }
function canonicalFrontendVisualItems(task:TaskDocument,items:EvidenceRecord[]):EvidenceRecord[] {
    const selected=new Map<string,EvidenceRecord>();
    for(const item of items){
        const role=frontendVisualRole(item.kind);if(!role)continue;
        if(!matchesAnyExpectedVisualContext(task,item))continue;
        selected.set(`${role}|${exactContextValue(item.route)}|${exactContextValue(item.target)}|${canonicalViewport(item.viewport)}|${canonicalCaptureScope(item.captureScope)}`,item);
    }
    return [...selected.values()];
}
function visualContextLabel(item:any): string { const capture=canonicalCaptureScope(item?.captureScope); return `${String(item?.route||'unknown route')} · ${String(item?.target||'unknown target')} · ${String(item?.viewport||'unknown viewport')}${capture?` · ${capture}`:''}`; }
export interface ExpectedVisualContext { route:string; target:string; viewport:string; captureScope:string; }
export interface UiTargetContextParse { contexts: ExpectedVisualContext[]; errors: string[]; }
function cleanUiTargetValue(value:string):string { const cleaned=value.trim().replace(/^[-*+\s]+/,'').trim(); return cleaned.startsWith('`')&&cleaned.endsWith('`')&&cleaned.length>=2?cleaned.slice(1,-1).trim():cleaned; }
export function parseUiTargetContexts(text:string):UiTargetContextParse {
    if(!text.trim()) return {contexts:[],errors:[]};
    let route='',target='',captureScope='',currentHasViewport=false,currentContextStart=0;
    const contexts:ExpectedVisualContext[]=[],errors:string[]=[];
    const finishCurrent=()=>{
        if(route&&!target) errors.push(`UI Target route ${route} must define a Target/Objetivo before another route or the end of the block`);
        else if(route&&target&&!currentHasViewport) errors.push(`UI Target context ${route} · ${target} must define at least one exact pixel viewport after its Target line`);
        else if(route&&target&&currentHasViewport&&!captureScope) errors.push(`UI Target context ${route} · ${target} must define Capture/Captura as focused-section or focused-element`);
    };
    for(const rawLine of text.split(/\r?\n/)){
        const line=rawLine.trim(); if(!line) continue;
        const viewportMatches=[...line.matchAll(/(\d{2,5})\s*[x×]\s*(\d{2,5})/gi)];
        const explicitViewportLabel=/(?:viewport|viewports|desktop|mobile|m[oó]vil|escritorio)\s*:/i.test(line);
        const dimensionalPantalla=/(?:pantalla|pantallas)\s*:/i.test(line)&&viewportMatches.length>0;
        if(explicitViewportLabel||dimensionalPantalla){
            if(!route) errors.push(`UI Target viewport must follow a Route/Ruta line: ${line}`);
            else if(!target) errors.push(`UI Target viewport for ${route} must follow a Target/Objetivo line: ${line}`);
            else if(!viewportMatches.length) errors.push(`UI Target context ${route} · ${target} must use exact pixel viewport dimensions such as 1440x1000`);
            else { for(const match of viewportMatches) contexts.push({route,target,viewport:`${Number(match[1])}x${Number(match[2])}`,captureScope}); currentHasViewport=true; }
            continue;
        }
        const captureMatch=line.match(/(?:capture|captura)\s*:\s*(.+)$/i);
        if(captureMatch){
            if(!route) errors.push(`UI Target capture scope must follow a Route/Ruta line: ${line}`);
            else if(!target) errors.push(`UI Target capture scope for ${route} must follow a Target/Objetivo line: ${line}`);
            else {
                const parsed=canonicalCaptureScope(cleanUiTargetValue(captureMatch[1]!));
                if(!parsed) errors.push(`UI Target capture scope for ${route} · ${target} must be focused-section or focused-element`);
                else if(captureScope&&captureScope!==parsed) errors.push(`UI Target context ${route} · ${target} declares conflicting Capture/Captura values: ${captureScope} and ${parsed}`);
                else { captureScope=parsed; for(let index=currentContextStart;index<contexts.length;index++) contexts[index]!.captureScope=parsed; }
            }
            continue;
        }
        const routeMatch=line.match(/(?:route|ruta|screen|pantalla)\s*:\s*(.+)$/i);
        if(routeMatch){ finishCurrent(); route=cleanUiTargetValue(routeMatch[1]!); target=''; captureScope=''; currentHasViewport=false; currentContextStart=contexts.length; continue; }
        const targetMatch=line.match(/(?:target|selector|objetivo|anchor|ancla|section|componente)\s*:\s*(.+)$/i);
        if(targetMatch){ if(target||currentHasViewport) finishCurrent(); if(!route) errors.push(`UI Target target must follow a Route/Ruta line: ${line}`); target=cleanUiTargetValue(targetMatch[1]!); captureScope=''; currentHasViewport=false; currentContextStart=contexts.length; continue; }
    }
    finishCurrent();
    const unique=new Map<string,ExpectedVisualContext>();
    for(const context of contexts) unique.set(`${context.route}|${context.target}|${context.viewport}|${context.captureScope}`,context);
    return {contexts:[...unique.values()],errors:[...new Set(errors)]};
}
export function expectedVisualContexts(task:TaskDocument):ExpectedVisualContext[] { return parseUiTargetContexts(getSection(task.body,'UI Target')).contexts; }
export function uiTargetContextIssues(task:TaskDocument):string[] { return parseUiTargetContexts(getSection(task.body,'UI Target')).errors; }
export function matchesExpectedVisualContext(item:{route?:string|null;target?:string|null;viewport?:string|null;captureScope?:string|null},context:ExpectedVisualContext):boolean { return sameVisualContext(item,context)&&(!context.captureScope||canonicalCaptureScope(item.captureScope)===context.captureScope); }
export function matchesAnyExpectedVisualContext(task:TaskDocument,item:{route?:string|null;target?:string|null;viewport?:string|null;captureScope?:string|null}):boolean { const contexts=expectedVisualContexts(task);return !contexts.length||contexts.some(context=>matchesExpectedVisualContext(item,context)); }
function validRuntimeUrl(value: any): boolean {
    try {
        const url = new URL(String(value || '').trim());
        return ['http:', 'https:'].includes(url.protocol);
    } catch { return false; }
}
function evidenceLine(item: any, relative: any) {
    const detail = [`- Kind: \`${item.kind}\``, `- Source: \`${item.source}\``, `- Tool: ${item.tool || 'not recorded'}`, item.route ? `- Route: \`${item.route}\`` : '', item.viewport ? `- Viewport: \`${item.viewport}\`` : '', item.target ? `- Target: \`${item.target}\`` : '', item.captureScope ? `- Capture: \`${item.captureScope}\`` : '', item.runtimeUrl ? `- Runtime URL: \`${item.runtimeUrl}\`` : '', `- SHA-256: \`${item.sha256}\``].filter(Boolean).join('\n');
    if (VISUAL_KINDS.has(item.kind) || VISUAL_EXTENSIONS.has(path.extname(item.path).toLowerCase()))
        return `### ${item.label}\n\n[Open canonical visual evidence](${relative})\n\n${detail}\n- Presentation: use Cockpit/attachments/$visualize; do not rely on this repository-local link as an inline image`;
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
        if (FRONTEND_RUNTIME_KINDS.has(item.kind)) {
            const legacyPersistedRecord = Boolean(item.id && item.createdAt);
            if (!String(item.runtimeUrl || '').trim()) {
                if (!legacyPersistedRecord) errors.push(`${item.kind} must record the served runtime URL used for the capture`);
            } else if (!validRuntimeUrl(item.runtimeUrl)) {
                errors.push(`${item.kind} runtime URL must use http:// or https://; file:// and raw index.html previews are invalid`);
            }
        }
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
    const locationError=evidenceLocationError(root,id,absolute);
    if(locationError) throw new Error(locationError);
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
    const bindsToImplementation = IMPLEMENTATION_DEPENDENT_EVIDENCE_KINDS.has(input.kind) && Boolean(task.meta.implementation_generation_id);
    const implementationGeneration = input.implementationGeneration || (bindsToImplementation ? String(task.meta.implementation_generation_id) : null);
    const implementationDigest = input.implementationDigest || (bindsToImplementation ? String(task.meta.implementation_digest || '') || null : null);
    const revisionId = input.revisionId || (bindsToImplementation ? String(task.meta.active_revision_id || '') || null : null);
    if (input.implementationGeneration && task.meta.implementation_generation_id && input.implementationGeneration !== task.meta.implementation_generation_id) throw new Error('Evidence implementation generation does not match the current implementation');
    const item: EvidenceRecord = { id: `EV-${String(manifest.evidence.length + 1).padStart(3, '0')}`, kind: input.kind, path: relativeToEvidence, source: input.source, label: input.label || input.kind, tool: input.tool || null, command: input.command || null, exitCode: input.exitCode === undefined || input.exitCode === null ? null : Number(input.exitCode), route: input.route || null, viewport: input.viewport || null, target: input.target || null, captureScope: input.captureScope || null, runtimeUrl: input.runtimeUrl || null, missionHash, implementationGeneration, implementationDigest, revisionId, attributes: input.attributes || {}, createdAt: new Date().toISOString(), sha256: hash, size: statSync(absolute).size };
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
    const route = task.meta.route, surfaces = task.meta.surfaces, required: string[] = [], controls=controlProfile(task), micro=controls==='micro';
    const root=task.path.slice(0,task.path.indexOf(`${path.sep}.ai${path.sep}`));
    if(stage==='technical-review'&&hasUserWaiver(root,task.meta.id,'technical-review'))return required;
    if(stage==='qa'&&hasUserWaiver(root,task.meta.id,'qa'))return required;
    const frontend = surfaces.includes('frontend') || surfaces.includes('ui') || surfaces.includes('ux'), backend = surfaces.includes('backend') || surfaces.includes('api'), database = surfaces.includes('database') || route.database;
    if (stage === 'pre-approval') {
        if ((frontend || route.design) && !hasUserWaiver(root,task.meta.id,'design')) {
            if (controls === 'light') required.push('frontend-before');
            else if (!micro) {
                required.push('frontend-before', 'ui-design-brief', 'frontend-proposal', 'ui-proposal-review');
                if (['medium','high','critical'].includes(String(task.meta.risk).toLowerCase()) || ['medium','large'].includes(String(task.meta.size).toLowerCase())) required.push('visual-proposal-evaluator-report');
            }
        }
        if (route.architecture && !hasUserWaiver(root,task.meta.id,'technical-architecture')) required.push('architecture-source', 'architecture-rendered');
        if (database && !hasUserWaiver(root,task.meta.id,'technical-architecture')) required.push('database-source', 'database-rendered', 'migration-plan');
    }
    if (stage === 'technical-review' && route.technical_review !== 'none') required.push('technical-review-report');
    if (stage === 'qa') {
        if (frontend && route.implementation) required.push('frontend-after', 'ui-after-validation');
        if (backend && route.implementation) required.push('backend-demo', 'test-log');
        if (database && route.implementation) required.push('database-final', 'migration-log');
        if (route.architecture && route.implementation && !hasUserWaiver(root,task.meta.id,'technical-architecture')) required.push('architecture-final');
        if (route.technical_review !== 'none' && !hasUserWaiver(root,task.meta.id,'technical-review')) required.push('technical-review-report');
        const q=qualityPolicy(task); if(q.propertyTesting==='required') required.push('property-test-report'); if(q.mutationTesting==='required') required.push('mutation-test-report');
        const ops=operationalPolicy(task); required.push(...ops.requiredEvidence);
        if(route.technical_review!=='none' && listConstitution(root).some(item=>item.status==='active')) required.push('constitution-report');
        if (route.qa !== 'none') required.push('qa-report');
    }
    if (stage === 'revision') required.push(...revisionRequiredEvidenceKinds(root, task.meta.id));
    if (stage === 'final') {
        required.push(...requiredKinds(task, 'qa'));
        if (route.final_customer&&!hasUserWaiver(root,task.meta.id,'target-audience')) required.push('customer-report');
        if (!micro && (frontend || route.design) && ['standard','rigorous'].includes(controls) && (['medium','high','critical'].includes(String(task.meta.risk).toLowerCase()) || ['medium','large'].includes(String(task.meta.size).toLowerCase()))) required.push('visual-final-evaluator-report');
    }
    return [...new Set(required)];
}
function browserQaContractErrors(task: TaskDocument, qa: EvidenceRecord | undefined): string[] {
    if (task.meta.route.qa !== 'browser' || !qa) return [];
    const errors: string[] = [];
    const attributes = qa.attributes && typeof qa.attributes === 'object' && !Array.isArray(qa.attributes) ? qa.attributes as Record<string, unknown> : {};
    const verification = attributes.verification && typeof attributes.verification === 'object' && !Array.isArray(attributes.verification) ? attributes.verification as Record<string, unknown> : {};
    const automated = attributes.automatedVisualQA && typeof attributes.automatedVisualQA === 'object' && !Array.isArray(attributes.automatedVisualQA) ? attributes.automatedVisualQA as Record<string, unknown> : {};
    const verificationType = String(verification.type || '').trim();
    const status = String(automated.status || '').trim();
    const hostBrowser = String(automated.hostBrowser || '').trim();
    const surfaceClass = String(automated.surfaceClass || '').trim();
    const attempted = automated.attempted === true;
    const surface = String(automated.surface || '').trim();
    const attemptRef = String(automated.attemptRef || '').trim();
    const targetUrl = String(automated.targetUrl || '').trim();
    const reason = String(automated.reason || '').trim();
    if (!['human', 'automated', 'mixed'].includes(verificationType)) errors.push('browser QA report must record verification.type as human, automated, or mixed');
    if (!['available','unavailable'].includes(hostBrowser)) errors.push('browser QA report must record automatedVisualQA.hostBrowser as available or unavailable');
    if (!['host-browser','host-without-browser'].includes(surfaceClass)) errors.push('browser QA report must record automatedVisualQA.surfaceClass as host-browser or host-without-browser');
    if (!['passed', 'failed', 'unavailable'].includes(status)) {
        errors.push('browser QA report must record automatedVisualQA.status as passed, failed, or unavailable');
        return errors;
    }
    if (hostBrowser === 'unavailable') {
        if (surfaceClass !== 'host-without-browser') errors.push('automatedVisualQA.surfaceClass must be host-without-browser when the current host exposes no Browser capability');
        if (status !== 'unavailable') errors.push('automated visual QA cannot pass/fail when the current host reports no Browser capability');
        if (attempted) errors.push('automatedVisualQA.attempted must be false when the current host has no Browser capability to invoke');
        if (attemptRef) errors.push('automatedVisualQA.attemptRef must be empty when no host Browser attempt was possible');
        if (!surface) errors.push('browser QA report must identify the current host surface when Browser capability is unavailable');
        if (!reason) errors.push('AUTOMATED_VISUAL_QA_UNAVAILABLE must explain why the current host has no Browser capability');
        else errors.push(`AUTOMATED_VISUAL_QA_UNAVAILABLE: ${reason}`);
        return errors;
    }
    if (surfaceClass !== 'host-browser') errors.push('automatedVisualQA.surfaceClass must be host-browser when hostBrowser=available');
    if (!attempted) errors.push('browser QA report must record automatedVisualQA.attempted=true after invoking the available host Browser surface');
    if (!surface) errors.push('browser QA report must identify the attempted host Browser surface; shell/terminal localhost checks are not equivalent to host-browser QA');
    if (/(?:shell|terminal|curl|wget|powershell|cmd(?:\.exe)?)/i.test(surface)) errors.push('browser QA surface cannot be a shell/terminal transport; localhost shell probes are diagnostic only');
    if (!attemptRef) errors.push('browser QA report must record automatedVisualQA.attemptRef for the actual host Browser invocation');
    if (!/^https?:\/\//i.test(targetUrl)) errors.push('browser QA report must record automatedVisualQA.targetUrl as the served HTTP(S) URL opened by the host Browser');
    if (['passed','failed','unavailable'].includes(status) && !['automated','mixed'].includes(verificationType)) errors.push(`verification.type=${verificationType || 'missing'} is inconsistent with an attempted automated Browser QA result; use automated or mixed`);
    if (status === 'unavailable') {
        if (!reason) errors.push('AUTOMATED_VISUAL_QA_UNAVAILABLE must include a concrete host-browser failure reason');
        else errors.push(`AUTOMATED_VISUAL_QA_UNAVAILABLE: ${reason}`);
    }
    if (status === 'failed') errors.push(`AUTOMATED_VISUAL_QA_FAILED${reason ? `: ${reason}` : ''}`);
    return errors;
}

function reportMatchesScreenshot(report: any, screenshot: any) {
    const dims = viewportDimensions(screenshot.viewport);
    return report && report.screenshotKind === screenshot.kind && exactContextValue(report.route) === exactContextValue(screenshot.route) && exactContextValue(report.target) === exactContextValue(screenshot.target) && report.capture?.scope === screenshot.captureScope && dims && Number(report.viewport?.width) === dims.width && Number(report.viewport?.height) === dims.height;
}
export function validateEvidence(root: string, id: string, stage = 'all') {
    const task = loadTask(findTask(root, id)), items = listEvidence(root, id), revision=activeRevision(root,id), revisionKinds=new Set(revision?.revalidateEvidenceKinds||[]), required = stage === 'all' ? [...requiredKinds(task, 'pre-approval'), ...requiredKinds(task, 'final')] : requiredKinds(task, stage);
    const kindAvailable=(kind:string)=>items.some(item=>item.kind===kind&&(!revision||!revisionKinds.has(kind)||evidenceGenerationMatches(task,item)));
    const missing = [...new Set(required)].filter((kind: any) => !kindAvailable(kind)), errors = [], layoutReports = new Map(), designBriefs = new Map(), proposalReviews = new Map();
    for (const item of items) {
        const file = path.resolve(path.dirname(manifestPath(root, id)), item.path);
        if (!existsSync(file))
            errors.push(`Missing file for ${item.id}`);
        else {
            const locationError=evidenceLocationError(root,id,file);
            if(locationError){ errors.push(`${item.id}: ${locationError}`); continue; }
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
    const beforeItems = items.filter((x: any) => ['frontend-before', 'frontend-mobile-before'].includes(x.kind)), proposalItems = items.filter((x: any) => PROPOSAL_KINDS.has(x.kind)), afterItems = items.filter((x: any) => AFTER_KINDS.has(x.kind) && (!revision || !revisionKinds.has(x.kind) || evidenceGenerationMatches(task,x)));
    const expectedContexts=expectedVisualContexts(task);
    const canonicalFrontend=canonicalFrontendVisualItems(task,[...beforeItems,...proposalItems,...afterItems]);
    const activeBeforeItems=canonicalFrontend.filter(item=>['frontend-before','frontend-mobile-before'].includes(item.kind));
    const activeProposalItems=canonicalFrontend.filter(item=>PROPOSAL_KINDS.has(item.kind));
    const activeAfterItems=canonicalFrontend.filter(item=>AFTER_KINDS.has(item.kind));
    const itemIndex=new Map(items.map((item,index)=>[item.id,index] as const));
    const controls=controlProfile(task),micro=controls==='micro';
    const requiresBeforeVisuals=['pre-approval','qa','final','all'].includes(stage)&&controls!=='micro';
    const requiresProposalVisuals=['pre-approval','qa','final','all'].includes(stage)&&['standard','rigorous'].includes(controls);
    const requiresAfterVisuals=['qa','final','all'].includes(stage)&&task.meta.route.implementation;
    for(const context of expectedContexts){
        if(requiresBeforeVisuals&&!activeBeforeItems.some((item:any)=>matchesExpectedVisualContext(item,context))) errors.push(`UI Target context ${visualContextLabel(context)} is missing canonical Before evidence`);
        if(requiresProposalVisuals&&!activeProposalItems.some((item:any)=>matchesExpectedVisualContext(item,context))) errors.push(`UI Target context ${visualContextLabel(context)} is missing canonical Proposal evidence`);
        if(requiresAfterVisuals&&!activeAfterItems.some((item:any)=>matchesExpectedVisualContext(item,context))) errors.push(`UI Target context ${visualContextLabel(context)} is missing canonical After evidence`);
    }
    for (const proposal of activeProposalItems) {
        const matchingBefore = activeBeforeItems.find((before: any) => sameVisualFrame(before, proposal));
        if (!matchingBefore)
            errors.push(`${proposal.id}: no matching focused before capture for exact route, target, and viewport (${visualContextLabel(proposal)})`);
        const proposalIndex=itemIndex.get(proposal.id) ?? -1;
        const brief = [...designBriefs.entries()].filter(([evidenceId,value]: any) => sameVisualContext({route:value.context?.route,target:value.context?.target,viewport:value.context?.viewport}, proposal)&&(itemIndex.get(evidenceId)??-1)<proposalIndex).sort(([left]:any,[right]:any)=>(itemIndex.get(right)??-1)-(itemIndex.get(left)??-1))[0]?.[1];
        if (!brief)
            errors.push(`${proposal.id}: no matching ui-design-brief registered before this proposal for target, route, and viewport`);
        const review = [...proposalReviews.entries()].filter(([evidenceId,value]: any) => value.screenshotKind === proposal.kind && sameVisualContext({route:value.route,target:value.target,viewport:value.viewport}, proposal)&&(itemIndex.get(evidenceId)??-1)>proposalIndex).sort(([left]:any,[right]:any)=>(itemIndex.get(left)??-1)-(itemIndex.get(right)??-1))[0]?.[1];
        if (!review)
            errors.push(`${proposal.id}: no matching ui-proposal-review registered after this proposal for target, route, and viewport`);
    }
    for (const after of activeAfterItems) {
        const baseline = [...activeProposalItems, ...activeBeforeItems].find((item: any) => sameVisualFrame(item, after));
        if (!baseline && !micro)
            errors.push(`${after.id}: no matching before/proposal evidence for exact route, target, and viewport (${visualContextLabel(after)})`);
        const afterIndex=itemIndex.get(after.id) ?? -1;
        const report = [...layoutReports.entries()].filter(([evidenceId,value]: any) => reportMatchesScreenshot(value, after)&&(itemIndex.get(evidenceId)??-1)>afterIndex).sort(([left]:any,[right]:any)=>(itemIndex.get(left)??-1)-(itemIndex.get(right)??-1))[0]?.[1];
        if (!report)
            errors.push(`${after.id}: no matching ui-after-validation registered after this After for target, route, viewport, and capture scope`);
    }
    const visualContexts = new Map<string, any[]>();
    for (const item of [...activeBeforeItems, ...activeProposalItems, ...activeAfterItems]) {
        const key = `${exactContextValue(item.route)}|${exactContextValue(item.target)}|${canonicalViewport(item.viewport)}|${canonicalCaptureScope(item.captureScope)}`;
        const bucket = visualContexts.get(key) || []; bucket.push(item); visualContexts.set(key, bucket);
    }
    for (const group of visualContexts.values()) {
        for (let left = 0; left < group.length; left++) for (let right = left + 1; right < group.length; right++) {
            const a=group[left],b=group[right];
            if(a.kind===b.kind) continue;
            if(a.sha256===b.sha256) errors.push(`${a.id}/${b.id}: canonical visual roles must be distinct for ${visualContextLabel(a)}`);
        }
    }
    const qa=items.find((x:any)=>x.kind==='qa-report'); if(qa && task.meta.qa_mission_hash && qa.missionHash!==task.meta.qa_mission_hash) errors.push('QA mission hash does not match the approved immutable QA Mission');
    errors.push(...browserQaContractErrors(task, qa));
    return { valid: missing.length === 0 && errors.length === 0, missing, errors, required };
}
