import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ExperimentRef } from '../types/refs.js';
import { ValidationError, NotFoundError } from '@valuerank/shared';
import { randomUUID } from 'node:crypto';

type SurveyQuestion = {
  id: string;
  text: string;
  order: number;
};

type SurveyResponseOption = {
  id: string;
  label: string;
  order: number;
  value: number;
};

type SurveyPlan = {
  kind: 'survey';
  version: number;
  surveyKey: string;
  definitionId: string;
  description?: string;
  instructions?: string;
  responseOptions: SurveyResponseOption[];
  // Legacy support for pre-option surveys
  responseScale?: {
    min: number;
    max: number;
    minLabel?: string | null;
    maxLabel?: string | null;
  };
  questions: SurveyQuestion[];
};

type ParsedSurvey = {
  experimentId: string;
  name: string;
  description: string;
  surveyKey: string;
  definitionId: string;
  version: number;
  instructions: string;
  responseOptions: SurveyResponseOption[];
  questions: SurveyQuestion[];
};

function parseSurvey(experiment: { id: string; name: string; hypothesis: string | null; analysisPlan: unknown }): ParsedSurvey {
  const plan = experiment.analysisPlan as Partial<SurveyPlan> | null | undefined;
  if (!plan || plan.kind !== 'survey' || typeof plan.definitionId !== 'string') {
    throw new ValidationError(`Experiment ${experiment.id} is not a survey`);
  }
  if (!Array.isArray(plan.questions) || plan.questions.length === 0) {
    throw new ValidationError(`Survey ${experiment.id} has no questions`);
  }

  let responseOptions: SurveyResponseOption[] = [];
  if (Array.isArray(plan.responseOptions) && plan.responseOptions.length > 0) {
    responseOptions = plan.responseOptions
      .map((option, index) => ({
        id: typeof option.id === 'string' && option.id.trim() !== '' ? option.id : `r${index + 1}`,
        label: typeof option.label === 'string' ? option.label.trim() : '',
        order: typeof option.order === 'number' && Number.isInteger(option.order) ? option.order : index + 1,
        value: typeof option.value === 'number' && Number.isInteger(option.value) ? option.value : index + 1,
      }))
      .filter((option) => option.label !== '')
      .sort((left, right) => left.order - right.order);
  } else if (
    plan.responseScale &&
    typeof plan.responseScale.min === 'number' &&
    typeof plan.responseScale.max === 'number' &&
    Number.isInteger(plan.responseScale.min) &&
    Number.isInteger(plan.responseScale.max) &&
    plan.responseScale.min < plan.responseScale.max
  ) {
    // Legacy conversion for old range-based surveys
    const min = plan.responseScale.min;
    const max = plan.responseScale.max;
    for (let value = min; value <= max; value += 1) {
      let label = String(value);
      if (value === min && typeof plan.responseScale.minLabel === 'string' && plan.responseScale.minLabel.trim() !== '') {
        label = plan.responseScale.minLabel.trim();
      } else if (value === max && typeof plan.responseScale.maxLabel === 'string' && plan.responseScale.maxLabel.trim() !== '') {
        label = plan.responseScale.maxLabel.trim();
      }
      responseOptions.push({
        id: `r${responseOptions.length + 1}`,
        label,
        order: responseOptions.length + 1,
        value: responseOptions.length + 1,
      });
    }
  }

  if (responseOptions.length === 0) {
    throw new ValidationError(`Survey ${experiment.id} has invalid response options`);
  }

  return {
    experimentId: experiment.id,
    name: experiment.name,
    description: experiment.hypothesis ?? '',
    surveyKey: typeof plan.surveyKey === 'string' && plan.surveyKey.trim() !== '' ? plan.surveyKey : experiment.id,
    definitionId: plan.definitionId,
    version: typeof plan.version === 'number' && Number.isInteger(plan.version) && plan.version > 0 ? plan.version : 1,
    instructions: typeof plan.instructions === 'string' ? plan.instructions : '',
    responseOptions,
    questions: plan.questions,
  };
}

function normalizeQuestions(questions: Array<{ text: string }>): SurveyQuestion[] {
  const normalized = questions.map((question, index) => ({
    id: `q${index + 1}`,
    text: question.text.trim(),
    order: index + 1,
  }));

  if (normalized.length === 0) {
    throw new ValidationError('At least one survey question is required');
  }

  for (const question of normalized) {
    if (!question.text) {
      throw new ValidationError('Survey questions cannot be empty');
    }
  }

  return normalized;
}

function normalizeResponseOptions(options: Array<{ label: string }>): SurveyResponseOption[] {
  const normalized = options
    .map((option) => option.label.trim())
    .filter((label) => label !== '')
    .map((label, index) => ({
      id: `r${index + 1}`,
      label,
      order: index + 1,
      value: index + 1,
    }));

  if (normalized.length < 2) {
    throw new ValidationError('At least two response options are required');
  }

  return normalized;
}

function buildSurveyPrompt(
  targetQuestion: SurveyQuestion,
  responseOptions: SurveyResponseOption[],
  instructions?: string
): string {
  const questionText = targetQuestion.text.trim();
  const optionLines = responseOptions.map((option) => option.label.trim()).filter((label) => label !== '');

  const sections: string[] = [];
  if (instructions && instructions.trim() !== '') {
    sections.push(instructions.trim());
  }
  sections.push(questionText);
  if (optionLines.length > 0) {
    sections.push(optionLines.join('\n'));
  }

  return sections.join('\n\n');
}

function buildSurveyPlan(
  surveyKey: string,
  definitionId: string,
  questions: SurveyQuestion[],
  responseOptions: SurveyResponseOption[],
  version: number,
  instructions?: string,
  description?: string
): SurveyPlan {
  return {
    kind: 'survey',
    version,
    surveyKey,
    definitionId,
    ...(description && description.trim() !== '' ? { description: description.trim() } : {}),
    ...(instructions && instructions.trim() !== '' ? { instructions: instructions.trim() } : {}),
    responseOptions,
    questions,
  };
}

const SurveyQuestionInput = builder.inputType('SurveyQuestionInput', {
  fields: (t) => ({
    text: t.string({
      required: true,
      validate: {
        minLength: [1, { message: 'Question text is required' }],
        maxLength: [2000, { message: 'Question text must be 2000 characters or less' }],
      },
    }),
  }),
});

const SurveyResponseOptionInput = builder.inputType('SurveyResponseOptionInput', {
  fields: (t) => ({
    label: t.string({
      required: true,
      validate: {
        minLength: [1, { message: 'Response option label is required' }],
        maxLength: [200, { message: 'Response option label must be 200 characters or less' }],
      },
    }),
  }),
});

const CreateSurveyInput = builder.inputType('CreateSurveyInput', {
  fields: (t) => ({
    name: t.string({
      required: true,
      validate: {
        minLength: [1, { message: 'Survey name is required' }],
        maxLength: [255, { message: 'Survey name must be 255 characters or less' }],
      },
    }),
    description: t.string({ required: false }),
    instructions: t.string({ required: false }),
    questions: t.field({ type: [SurveyQuestionInput], required: true }),
    responseOptions: t.field({ type: [SurveyResponseOptionInput], required: true }),
  }),
});

const UpdateSurveyInput = builder.inputType('UpdateSurveyInput', {
  fields: (t) => ({
    name: t.string({
      required: false,
      validate: {
        minLength: [1, { message: 'Survey name cannot be empty' }],
        maxLength: [255, { message: 'Survey name must be 255 characters or less' }],
      },
    }),
    description: t.string({ required: false }),
    instructions: t.string({ required: false }),
    questions: t.field({ type: [SurveyQuestionInput], required: false }),
    responseOptions: t.field({ type: [SurveyResponseOptionInput], required: false }),
  }),
});

builder.mutationField('createSurvey', (t) =>
  t.field({
    type: ExperimentRef,
    description: 'Create a survey with a backing definition and one scenario per question.',
    args: {
      input: t.arg({ type: CreateSurveyInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const name = args.input.name.trim();
      const description = args.input.description?.trim() || '';
      const instructions = args.input.instructions?.trim() || '';
      const questions = normalizeQuestions(args.input.questions);
      const responseOptions = normalizeResponseOptions(args.input.responseOptions);

      const survey = await db.$transaction(async (tx) => {
        const surveyKey = randomUUID();
        const definition = await tx.definition.create({
          data: {
            name: `[Survey] ${name}`,
            content: {
              schema_version: 2,
              preamble: '',
              template: 'Survey question prompt',
              dimensions: [],
            },
            createdByUserId: ctx.user?.id ?? null,
          },
        });

        await tx.scenario.createMany({
          data: questions.map((question) => ({
            definitionId: definition.id,
            name: `Q${question.order}`,
            content: {
              prompt: buildSurveyPrompt(question, responseOptions, instructions),
              dimensions: {
                questionNumber: question.order,
                questionText: question.text,
              },
            },
          })),
        });

        return tx.experiment.create({
          data: {
            name,
            hypothesis: description || null,
            analysisPlan: buildSurveyPlan(surveyKey, definition.id, questions, responseOptions, 1, instructions, description),
          },
        });
      });

      ctx.log.info({ surveyId: survey.id, definitionId: (survey.analysisPlan as SurveyPlan).definitionId }, 'Survey created');
      return survey;
    },
  })
);

builder.mutationField('updateSurvey', (t) =>
  t.field({
    type: ExperimentRef,
    description: 'Create a new survey version from an existing survey.',
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateSurveyInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const surveyId = String(args.id);
      const existing = await db.experiment.findUnique({ where: { id: surveyId } });
      if (!existing) {
        throw new NotFoundError('Survey', surveyId);
      }

      const parsed = parseSurvey({
        id: existing.id,
        name: existing.name,
        hypothesis: existing.hypothesis,
        analysisPlan: existing.analysisPlan,
      });

      const nextName = args.input.name?.trim() || parsed.name;
      const nextDescription = args.input.description !== undefined
        ? (args.input.description?.trim() || '')
        : parsed.description;
      const nextInstructions = args.input.instructions !== undefined
        ? (args.input.instructions?.trim() || '')
        : parsed.instructions;
      const nextQuestions = args.input.questions
        ? normalizeQuestions(args.input.questions)
        : parsed.questions;
      const nextResponseOptions = args.input.responseOptions
        ? normalizeResponseOptions(args.input.responseOptions)
        : parsed.responseOptions;

      const isRenamed = nextName !== parsed.name;
      const nextSurveyKey = isRenamed ? randomUUID() : parsed.surveyKey;
      const nextVersion = isRenamed ? 1 : parsed.version + 1;

      const createdVersion = await db.$transaction(async (tx) => {
        const definition = await tx.definition.create({
          data: {
            name: `[Survey] ${nextName}`,
            content: {
              schema_version: 2,
              preamble: '',
              template: 'Survey question prompt',
              dimensions: [],
            },
            createdByUserId: ctx.user?.id ?? null,
          },
        });

        await tx.scenario.createMany({
          data: nextQuestions.map((question) => ({
            definitionId: definition.id,
            name: `Q${question.order}`,
            content: {
              prompt: buildSurveyPrompt(question, nextResponseOptions, nextInstructions),
              dimensions: {
                questionNumber: question.order,
                questionText: question.text,
              },
            },
          })),
        });

        return tx.experiment.create({
          data: {
            name: nextName,
            hypothesis: nextDescription || null,
            analysisPlan: buildSurveyPlan(
              nextSurveyKey,
              definition.id,
              nextQuestions,
              nextResponseOptions,
              nextVersion,
              nextInstructions,
              nextDescription
            ),
          },
        });
      });

      ctx.log.info(
        { sourceSurveyId: surveyId, newSurveyId: createdVersion.id, version: nextVersion, renamed: isRenamed },
        'Survey version created'
      );
      return createdVersion;
    },
  })
);

builder.mutationField('duplicateSurvey', (t) =>
  t.field({
    type: ExperimentRef,
    description: 'Duplicate a survey into a new survey family at version 1.',
    args: {
      id: t.arg.id({ required: true }),
      name: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const surveyId = String(args.id);
      const existing = await db.experiment.findUnique({ where: { id: surveyId } });
      if (!existing) {
        throw new NotFoundError('Survey', surveyId);
      }

      const parsed = parseSurvey({
        id: existing.id,
        name: existing.name,
        hypothesis: existing.hypothesis,
        analysisPlan: existing.analysisPlan,
      });

      const duplicateName = args.name?.trim() || `${parsed.name} (Copy)`;
      const surveyKey = randomUUID();

      const duplicated = await db.$transaction(async (tx) => {
        const definition = await tx.definition.create({
          data: {
            name: `[Survey] ${duplicateName}`,
            content: {
              schema_version: 2,
              preamble: '',
              template: 'Survey question prompt',
              dimensions: [],
            },
            createdByUserId: ctx.user?.id ?? null,
          },
        });

        await tx.scenario.createMany({
          data: parsed.questions.map((question) => ({
            definitionId: definition.id,
            name: `Q${question.order}`,
            content: {
              prompt: buildSurveyPrompt(question, parsed.responseOptions, parsed.instructions),
              dimensions: {
                questionNumber: question.order,
                questionText: question.text,
              },
            },
          })),
        });

        return tx.experiment.create({
          data: {
            name: duplicateName,
            hypothesis: parsed.description || null,
            analysisPlan: buildSurveyPlan(
              surveyKey,
              definition.id,
              parsed.questions,
              parsed.responseOptions,
              1,
              parsed.instructions,
              parsed.description
            ),
          },
        });
      });

      ctx.log.info({ sourceSurveyId: surveyId, duplicatedSurveyId: duplicated.id }, 'Survey duplicated');
      return duplicated;
    },
  })
);

builder.mutationField('deleteSurvey', (t) =>
  t.field({
    type: 'Boolean',
    description: 'Delete a survey and detach runs from it.',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const surveyId = String(args.id);
      const existing = await db.experiment.findUnique({ where: { id: surveyId } });
      if (!existing) {
        ctx.log.warn({ surveyId }, 'deleteSurvey called for missing survey; treating as already deleted');
        return true;
      }

      const parsed = parseSurvey({
        id: existing.id,
        name: existing.name,
        hypothesis: existing.hypothesis,
        analysisPlan: existing.analysisPlan,
      });

      await db.$transaction(async (tx) => {
        await tx.run.updateMany({
          where: { experimentId: surveyId },
          data: { experimentId: null },
        });

        await tx.experiment.delete({
          where: { id: surveyId },
        });

        await tx.scenario.updateMany({
          where: { definitionId: parsed.definitionId, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        await tx.definition.update({
          where: { id: parsed.definitionId },
          data: {
            deletedAt: new Date(),
            deletedByUserId: ctx.user?.id ?? null,
          },
        });
      });

      ctx.log.info({ surveyId, definitionId: parsed.definitionId }, 'Survey deleted');
      return true;
    },
  })
);
