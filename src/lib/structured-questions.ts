import type { NativeInteraction, NativeQuestion, QuestionOption } from './types.js';

export interface StructuredQuestionOptionInput {
  label: string;
  description: string;
  recommended?: boolean;
  preview?: string;
}

export interface StructuredQuestionInput {
  id: string;
  header: string;
  question: string;
  options: StructuredQuestionOptionInput[];
  isOther?: boolean;
  multiSelect?: boolean;
}

function text(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

export function structuredQuestion(input: StructuredQuestionInput): NativeQuestion {
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
    throw new Error('Structured questions require between 2 and 4 choices');
  }
  const recommended = input.options.filter(option => option.recommended === true);
  if (recommended.length > 1) throw new Error('Structured questions allow at most one recommended choice');
  const labels = input.options.map(option => text(option.label, 'Option label'));
  if (new Set(labels).size !== labels.length) throw new Error('Structured question choice labels must be unique');
  const options: QuestionOption[] = input.options.map(option => ({
    label: text(option.label, 'Option label'),
    description: text(option.description, 'Option description'),
    ...(option.recommended === true ? { recommended: true } : {}),
    ...(option.preview ? { preview: String(option.preview) } : {})
  }));
  return {
    id: text(input.id, 'Question id'),
    header: text(input.header, 'Question header').slice(0, 30),
    question: text(input.question, 'Question'),
    options,
    isOther: input.isOther !== false,
    ...(input.multiSelect === true ? { multiSelect: true } : {})
  };
}

export function structuredQuestionInteraction(inputs: StructuredQuestionInput[]): NativeInteraction {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 4) {
    throw new Error('Structured question batches require between 1 and 4 questions');
  }
  return { tool: 'request_user_input', questions: inputs.map(structuredQuestion) };
}

export function recommendedDescription(description: string, recommended: boolean): string {
  const value = text(description, 'Option description');
  return recommended ? `Recommended — ${value}` : value;
}
