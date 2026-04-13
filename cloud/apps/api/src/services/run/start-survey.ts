import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';

export type SurveyQuestion = {
  id: string;
  text: string;
  order: number;
};

export type SurveyResponseOption = {
  id: string;
  label: string;
  order: number;
  value: number;
};

export type SurveyPlan = {
  kind?: string;
  definitionId?: string;
  instructions?: string;
  questions?: SurveyQuestion[];
  responseOptions?: SurveyResponseOption[];
  responseScale?: {
    min: number;
    max: number;
    minLabel?: string | null;
    maxLabel?: string | null;
  };
};

function buildSingleQuestionSurveyPrompt(
  questionText: string,
  responseOptions: SurveyResponseOption[],
  instructions?: string
): string {
  const sections: string[] = [];
  const trimmedInstructions = typeof instructions === 'string' ? instructions.trim() : '';
  if (trimmedInstructions !== '') {
    sections.push(trimmedInstructions);
  }
  sections.push(questionText.trim());
  const optionLines = responseOptions
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((option) => option.label.trim())
    .filter((label) => label !== '');
  if (optionLines.length > 0) {
    sections.push(optionLines.join('\n'));
  }
  return sections.join('\n\n');
}

function parseSurveyResponseOptions(plan: SurveyPlan): SurveyResponseOption[] {
  if (Array.isArray(plan.responseOptions) && plan.responseOptions.length > 0) {
    const normalized = plan.responseOptions
      .map((option, index) => ({
        id: typeof option.id === 'string' && option.id.trim() !== '' ? option.id : `r${index + 1}`,
        label: typeof option.label === 'string' ? option.label.trim() : '',
        order: typeof option.order === 'number' && Number.isInteger(option.order) ? option.order : index + 1,
        value: typeof option.value === 'number' && Number.isInteger(option.value) ? option.value : index + 1,
      }))
      .filter((option) => option.label !== '')
      .sort((left, right) => left.order - right.order);
    if (normalized.length >= 2) {
      return normalized;
    }
  }

  if (
    plan.responseScale &&
    typeof plan.responseScale.min === 'number' &&
    typeof plan.responseScale.max === 'number' &&
    Number.isInteger(plan.responseScale.min) &&
    Number.isInteger(plan.responseScale.max) &&
    plan.responseScale.min < plan.responseScale.max
  ) {
    const options: SurveyResponseOption[] = [];
    for (let value = plan.responseScale.min; value <= plan.responseScale.max; value += 1) {
      let label = String(value);
      if (value === plan.responseScale.min && typeof plan.responseScale.minLabel === 'string' && plan.responseScale.minLabel.trim() !== '') {
        label = plan.responseScale.minLabel.trim();
      } else if (value === plan.responseScale.max && typeof plan.responseScale.maxLabel === 'string' && plan.responseScale.maxLabel.trim() !== '') {
        label = plan.responseScale.maxLabel.trim();
      }
      options.push({
        id: `r${options.length + 1}`,
        label,
        order: options.length + 1,
        value: options.length + 1,
      });
    }
    return options;
  }

  throw new ValidationError('Survey has invalid response options');
}

function parseSurveyQuestions(plan: SurveyPlan): SurveyQuestion[] {
  if (!Array.isArray(plan.questions) || plan.questions.length === 0) {
    throw new ValidationError('Survey has no questions');
  }
  const normalized = plan.questions
    .map((question, index) => ({
      id: typeof question.id === 'string' && question.id.trim() !== '' ? question.id : `q${index + 1}`,
      text: typeof question.text === 'string' ? question.text.trim() : '',
      order: typeof question.order === 'number' && Number.isInteger(question.order) ? question.order : index + 1,
    }))
    .filter((question) => question.text !== '')
    .sort((left, right) => left.order - right.order);

  if (normalized.length === 0) {
    throw new ValidationError('Survey has no valid questions');
  }

  return normalized;
}

export async function syncSurveyScenariosFromPlan(definitionId: string, plan: SurveyPlan): Promise<void> {
  const questions = parseSurveyQuestions(plan);
  const responseOptions = parseSurveyResponseOptions(plan);
  const instructions = typeof plan.instructions === 'string' ? plan.instructions : '';

  await db.$transaction(async (tx) => {
    await tx.scenario.updateMany({
      where: {
        definitionId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await tx.scenario.createMany({
      data: questions.map((question) => ({
        definitionId,
        name: `Q${question.order}`,
        content: {
          prompt: buildSingleQuestionSurveyPrompt(question.text, responseOptions, instructions),
          dimensions: {
            questionNumber: question.order,
            questionText: question.text,
          },
        },
      })),
    });
  });
}
