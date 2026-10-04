import { Sandbox } from '@vercel/sandbox';
import type { SkillFile } from '$lib/skill-md';

// Skill の scripts/*.py|*.js を Vercel Sandbox（使い捨ての microVM）で実行する。
// 信頼できないコードを想定し、外部通信なし・短いタイムアウト・1 vCPU・非永続で起動する。
const SANDBOX_TIMEOUT_MS = 30_000;
const OUTPUT_MAX = 20_000;
const ARGS_MAX = 20;
const ARG_LENGTH_MAX = 1_000;

export interface SkillScriptResult {
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    error?: string;
}

function interpreterFor(path: string): string | null {
    if (path.endsWith('.py')) return 'python3';
    if (path.endsWith('.js')) return 'node';
    return null;
}

function clip(text: string): string {
    return text.length > OUTPUT_MAX ? `${text.slice(0, OUTPUT_MAX)}\n…(truncated)` : text;
}

export async function runSkillScript(files: SkillFile[], scriptPath: string, args: string[] = []): Promise<SkillScriptResult> {
    const interpreter = interpreterFor(scriptPath);
    if (!interpreter || !scriptPath.startsWith('scripts/') || !files.some(file => file.path === scriptPath)) {
        return { success: false, exitCode: null, stdout: '', stderr: '', error: 'Only existing scripts/*.py or scripts/*.js files can be run.' };
    }
    const safeArgs = args.slice(0, ARGS_MAX).map(arg => String(arg).slice(0, ARG_LENGTH_MAX));

    let sandbox: Sandbox | null = null;
    const startedAt = Date.now();
    try {
        sandbox = await Sandbox.create({
            resources: { vcpus: 1 },
            timeout: SANDBOX_TIMEOUT_MS,
            networkPolicy: 'deny-all',
            persistent: false
        });
        await sandbox.writeFiles(files.map(file => ({ path: file.path, content: Buffer.from(file.content, 'utf8') })));

        // writeFiles と runCommand は同じ既定の作業ディレクトリを基準にするので、相対パスで揃える
        const result = await sandbox.runCommand(interpreter, [scriptPath, ...safeArgs]);
        const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
        const timedOut = result.exitCode !== 0 && Date.now() - startedAt >= SANDBOX_TIMEOUT_MS;
        return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: clip(stdout),
            stderr: clip(stderr),
            ...(timedOut ? { error: `The script was stopped after the ${SANDBOX_TIMEOUT_MS / 1000}-second time limit.` } : {})
        };
    } catch (err: any) {
        return { success: false, exitCode: null, stdout: '', stderr: '', error: err?.message || 'Sandbox execution failed.' };
    } finally {
        await sandbox?.stop().catch(() => {});
    }
}
