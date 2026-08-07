import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
function git(cwd: any, args: any, options: any = {}) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim(); }
function slug(value: any) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
export function createWorktree(projectRoot: any, taskId: any, title: any = 'task') {
    const root = git(projectRoot, ['rev-parse', '--show-toplevel']);
    const base = git(root, ['branch', '--show-current']) || 'HEAD';
    const branch = `ai-flow/${taskId.toLowerCase()}-${slug(title).slice(0, 40)}`;
    const worktreePath = path.join(root, '.ai-flow-worktrees', taskId);
    mkdirSync(path.dirname(worktreePath), { recursive: true });
    if (!existsSync(worktreePath)) {
        let branchExists = true;
        try {
            git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
        }
        catch {
            branchExists = false;
        }
        git(root, branchExists ? ['worktree', 'add', worktreePath, branch] : ['worktree', 'add', '-b', branch, worktreePath, base]);
    }
    return { path: worktreePath, branch, baseBranch: base, projectRoot: root };
}
export function checkpointWorktree(worktreePath: any, message: any) {
    git(worktreePath, ['add', '-A']);
    let changed = true;
    try {
        git(worktreePath, ['diff', '--cached', '--quiet']);
        changed = false;
    }
    catch { }
    if (!changed)
        return { changed: false, commit: git(worktreePath, ['rev-parse', '--short', 'HEAD']) };
    git(worktreePath, ['-c', 'user.name=AI Flow', '-c', 'user.email=ai-flow@local', 'commit', '-m', message]);
    return { changed: true, commit: git(worktreePath, ['rev-parse', '--short', 'HEAD']) };
}
export function removeWorktree(projectRoot: any, worktreePath: any, branch: any) {
    const root = git(projectRoot, ['rev-parse', '--show-toplevel']);
    if (existsSync(worktreePath))
        git(root, ['worktree', 'remove', '--force', worktreePath]);
    try {
        git(root, ['branch', '-D', branch]);
    }
    catch { }
    try {
        git(root, ['worktree', 'prune']);
    }
    catch { }
    return { removed: true };
}
export function mergeWorktree(projectRoot: any, worktreePath: any, branch: any, baseBranch: any) {
    const root = git(projectRoot, ['rev-parse', '--show-toplevel']);
    if (!worktreePath || !branch || !baseBranch || baseBranch === 'HEAD')
        throw new Error('A named base branch and task worktree are required for local merge');
    if (!existsSync(worktreePath))
        throw new Error(`Task worktree does not exist: ${worktreePath}`);
    checkpointWorktree(worktreePath, `${branch} final checkpoint`);
    const dirty = git(root, ['status', '--porcelain']).split(/\r?\n/).filter(Boolean);
    const blocking = dirty.filter((line: any) => { const file = line.slice(3).replace(/^"|"$/g, ''); return !file.startsWith('.ai/') && !file.startsWith('.codegraph/') && !file.startsWith('.ai-flow-worktrees/'); });
    if (blocking.length)
        throw new Error(`Base working tree has unrelated uncommitted changes: ${blocking.join(', ')}`);
    const current = git(root, ['branch', '--show-current']);
    if (current !== baseBranch)
        git(root, ['checkout', baseBranch]);
    try {
        git(root, ['merge', '--no-ff', '--no-edit', branch]);
    }
    catch (error: unknown) {
        try {
            git(root, ['merge', '--abort']);
        }
        catch { }
        const detail=error instanceof Error?error.message:String(error);
        throw new Error(`Local merge failed: ${detail}`);
    }
    removeWorktree(root, worktreePath, branch);
    return { status: 'completed', action: 'merge-local', branch, baseBranch, commit: git(root, ['rev-parse', '--short', 'HEAD']) };
}
