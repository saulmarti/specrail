export type PonytailMode = 'off' | 'lite' | 'full' | 'ultra';

export const PONYTAIL_PROVIDER = '@dietrichgebert/ponytail';
export const PONYTAIL_MIN_VERSION = '4.8.4';
export const PONYTAIL_DEFAULT_MODE: PonytailMode = 'full';

const MUTATION_ROLES = new Set([
  'builder',
  'revision-builder',
  'implementer',
  'remediation-writer',
  'direct',
  'direct-verify'
]);

export interface PonytailCapability {
  available: boolean;
  provider?: string | null;
  version?: string | null;
  mode?: PonytailMode | null;
  attestation?: string | null;
}

export interface MinimalismRequirement {
  required: boolean;
  provider: typeof PONYTAIL_PROVIDER;
  mode: PonytailMode;
  role: string;
  satisfied: boolean;
  reason: string;
}

export function ponytailRequiredForRole(role: string): boolean {
  return MUTATION_ROLES.has(String(role ?? '').trim().toLowerCase());
}

function versionTuple(value: string): number[] {
  return String(value ?? '')
    .replace(/^v/i, '')
    .split('.')
    .slice(0, 3)
    .map((part) => Number(part.replace(/[^0-9].*$/, '')) || 0);
}

export function versionAtLeast(actual: string, minimum = PONYTAIL_MIN_VERSION): boolean {
  const a = versionTuple(actual);
  const b = versionTuple(minimum);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return true;
}

export function minimalismRequirement(
  role: string,
  capability: PonytailCapability = { available: false }
): MinimalismRequirement {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  const required = ponytailRequiredForRole(normalizedRole);
  if (!required) {
    return {
      required: false,
      provider: PONYTAIL_PROVIDER,
      mode: PONYTAIL_DEFAULT_MODE,
      role: normalizedRole,
      satisfied: true,
      reason: 'Role does not mutate production code.'
    };
  }

  const provider = String(capability.provider ?? '').trim();
  const version = String(capability.version ?? '').trim();
  const mode = capability.mode ?? PONYTAIL_DEFAULT_MODE;
  const providerOk = capability.available === true && (provider === PONYTAIL_PROVIDER || provider === 'ponytail');
  const versionOk = providerOk && versionAtLeast(version);
  const modeOk = mode === 'full';
  const satisfied = providerOk && versionOk && modeOk;

  return {
    required: true,
    provider: PONYTAIL_PROVIDER,
    mode: PONYTAIL_DEFAULT_MODE,
    role: normalizedRole,
    satisfied,
    reason: satisfied
      ? `Ponytail ${version} is attested in ${mode} mode.`
      : `Code mutation requires ${PONYTAIL_PROVIDER} >= ${PONYTAIL_MIN_VERSION} in full mode; no qualifying host capability is attested.`
  };
}

export function assertPonytailForMutation(role: string, capability: PonytailCapability): void {
  const requirement = minimalismRequirement(role, capability);
  if (!requirement.satisfied) throw new Error(`PONYTAIL_REQUIRED: ${requirement.reason}`);
}
