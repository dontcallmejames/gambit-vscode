export type LocalModelMode = 'disabled' | 'informational';
type NormalizedLocalModelMode = LocalModelMode | 'invalid';

export type LocalModelConfigurationInput = {
  mode?: unknown;
  provider?: unknown;
  endpoint?: unknown;
  model?: unknown;
};

export type LocalModelConfiguration = {
  mode: NormalizedLocalModelMode;
  provider: string;
  endpoint: string;
  model: string;
};

export type LocalModelDiagnosticStatus = 'disabled' | 'informational' | 'misconfigured';

export type LocalModelDiagnostic = {
  status: LocalModelDiagnosticStatus;
  active: false;
  provider: string;
  endpoint: string;
  model: string;
  notes: string[];
};

const ROUTING_GUARDRAIL = 'Claude/Codex/Gemini routing unchanged.';
const LOCAL_RUNTIME_GUARDRAIL = 'Veyra does not download models, launch servers, or probe endpoints.';

export function normalizeLocalModelConfiguration(
  input: LocalModelConfigurationInput = {},
): LocalModelConfiguration {
  const rawMode = normalizeString(input.mode);
  const mode = normalizeMode(rawMode);

  return {
    mode,
    provider: normalizeString(input.provider),
    endpoint: normalizeString(input.endpoint),
    model: normalizeString(input.model),
  };
}

export function collectLocalModelDiagnostics(
  input: LocalModelConfigurationInput = {},
): LocalModelDiagnostic {
  const config = normalizeLocalModelConfiguration(input);
  const validationNotes = validateLocalModelConfiguration(config);
  const endpoint = displayEndpoint(config.endpoint);
  const base = {
    active: false as const,
    provider: config.provider || 'not configured',
    endpoint: endpoint || 'not configured',
    model: config.model || 'not configured',
  };

  if (config.mode === 'disabled') {
    return {
      ...base,
      status: 'disabled',
      notes: [
        `Local Model Support v0.1 is disabled; ${ROUTING_GUARDRAIL}`,
        LOCAL_RUNTIME_GUARDRAIL,
      ],
    };
  }

  if (validationNotes.length > 0) {
    return {
      ...base,
      status: 'misconfigured',
      notes: [
        ...validationNotes,
        'Local-model support remains inactive until settings are corrected.',
        ROUTING_GUARDRAIL,
        LOCAL_RUNTIME_GUARDRAIL,
      ],
    };
  }

  return {
    ...base,
    status: 'informational',
    notes: [
      'Local Model Support v0.1 is informational only.',
      'Configured target is not used for Claude/Codex/Gemini routing.',
      LOCAL_RUNTIME_GUARDRAIL,
    ],
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMode(mode: string): NormalizedLocalModelMode {
  if (!mode) return 'disabled';
  if (mode === 'disabled' || mode === 'informational') return mode;
  return 'invalid';
}

function validateLocalModelConfiguration(config: LocalModelConfiguration): string[] {
  const notes: string[] = [];
  if (config.mode === 'invalid') {
    notes.push('Local-model mode must be disabled or informational.');
  }
  if (config.mode !== 'informational' && config.mode !== 'invalid') return notes;

  if (!config.endpoint && config.mode === 'informational') {
    notes.push('Local-model endpoint is required when mode is informational.');
  } else if (config.endpoint) {
    notes.push(...validateEndpoint(config.endpoint));
  }

  if (!config.model && config.mode === 'informational') {
    notes.push('Local-model model is required when mode is informational.');
  }

  return notes;
}

function validateEndpoint(endpoint: string): string[] {
  const notes: string[] = [];
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      notes.push('Local-model endpoint must use http:// or https://.');
    }
    if (parsed.username || parsed.password) {
      notes.push('Local-model endpoint must not include username or password.');
    }
    if (parsed.search || parsed.hash) {
      notes.push('Local-model endpoint should not include query strings or fragments.');
    }
  } catch {
    notes.push('Local-model endpoint must use http:// or https://.');
  }
  return notes;
}

function displayEndpoint(endpoint: string): string {
  if (!endpoint) return '';
  try {
    const parsed = new URL(endpoint);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/u, parsed.pathname === '/' ? '/' : '');
  } catch {
    return endpoint.replace(/(https?:\/\/)[^/@\s]+@/iu, '$1');
  }
}
