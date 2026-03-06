#!/usr/bin/env tsx
/**
 * Backfill script for 2x2 order-effect isolation.
 *
 * This script creates two new variant types for the 5 locked sentinel vignettes:
 * 1. 'scale_flipped': baseline narrative (Order A), but flipped scale (1=B, 5=A)
 * 2. 'presentation_flipped': flipped narrative (Order B), but baseline scale (1=A, 5=B)
 *
 * It derives these from existing 'fully_flipped' pairs (which flip both simultaneously).
 *
 * Usage:
 *   npx tsx cloud/scripts/backfill-2x2-order-effect-pairs.ts [--dry-run]
 */

import { db } from '@valuerank/db';

const LOCKED_VIGNETTE_IDS = [
  'cmlsmyn9l0j3rxeiricruouia', // Jobs (Self Direction Action vs Power Dominance)
  'cmlsn0pnr0jg1xeir147758pr', // Jobs (Security Personal vs Conformity Interpersonal)
  'cmlsn216u0jpfxeirpdbrm9so', // Jobs (Tradition vs Stimulation)
  'cmlsn2tca0jvxxeir5r0i5civ', // Jobs (Benevolence Dependability vs Universalism Nature)
  'cmlsn384i0jzjxeir9or2w35z', // Jobs (Achievement vs Hedonism)
];

const ASSUMPTION_KEY = 'order_invariance';

interface ScenarioContent {
  schema_version: number;
  prompt: string;
  dimension_values: Record<string, string>;
  expected_values?: string[];
  [key: string]: any;
}

function extractScaleLine(prompt: string, num: number): string | null {
  const regex = new RegExp(`^${num}\\s*=\\s*.*$`, 'm');
  const match = prompt.match(regex);
  return match ? match[0] : null;
}

function replaceScaleLine(prompt: string, num: number, newLine: string): string {
  const regex = new RegExp(`^${num}\\s*=\\s*.*$`, 'm');
  return prompt.replace(regex, newLine);
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  if (isDryRun) {
    console.log('🌵 DRY RUN - No changes will be persisted to the database.
');
  }

  console.log(`Starting backfill for ${LOCKED_VIGNETTE_IDS.length} locked vignettes...`);

  // 1. Find all existing fully_flipped pairs for the locked vignettes
  const existingPairs = await db.assumptionScenarioPair.findMany({
    where: {
      assumptionKey: ASSUMPTION_KEY,
      variantType: 'fully_flipped',
      sourceScenario: {
        definitionId: { in: LOCKED_VIGNETTE_IDS },
        deletedAt: null,
      },
    },
    include: {
      sourceScenario: true,
      variantScenario: true,
    },
  });

  console.log(`Found ${existingPairs.length} existing 'fully_flipped' pairs.`);

  let createdScenarios = 0;
  let createdPairs = 0;
  let skippedPairs = 0;

  for (const pair of existingPairs) {
    const { sourceScenario, variantScenario: fullyFlippedScenario } = pair;
    const vignetteId = sourceScenario.definitionId;

    console.log(`
Processing vignette ${vignetteId}: "${sourceScenario.name}"`);

    const sourceContent = sourceScenario.content as unknown as ScenarioContent;
    const fullyFlippedContent = fullyFlippedScenario.content as unknown as ScenarioContent;

    // Extract scale lines from both
    const sourceScale1 = extractScaleLine(sourceContent.prompt, 1);
    const sourceScale5 = extractScaleLine(sourceContent.prompt, 5);
    const flippedScale1 = extractScaleLine(fullyFlippedContent.prompt, 1);
    const flippedScale5 = extractScaleLine(fullyFlippedContent.prompt, 5);

    if (!sourceScale1 || !sourceScale5 || !flippedScale1 || !flippedScale5) {
      console.error(`❌ Failed to extract scale lines for pair ${pair.id}. Skipping.`);
      continue;
    }

    // Define new variants to create
    const variantsToCreate = [
      {
        type: 'scale_flipped',
        name: `${sourceScenario.name} (Scale Flipped)`,
        orientationFlipped: true,
        // Narrative from source (Order A), Scale from fully_flipped (S_B)
        deriveContent: () => ({
          ...sourceContent,
          prompt: replaceScaleLine(replaceScaleLine(sourceContent.prompt, 1, flippedScale1), 5, flippedScale5),
        }),
      },
      {
        type: 'presentation_flipped',
        name: `${sourceScenario.name} (Presentation Flipped)`,
        orientationFlipped: false,
        // Narrative from fully_flipped (Order B), Scale from source (S_A)
        deriveContent: () => ({
          ...fullyFlippedContent,
          prompt: replaceScaleLine(replaceScaleLine(fullyFlippedContent.prompt, 1, sourceScale1), 5, sourceScale5),
        }),
      },
    ];

    for (const variantDef of variantsToCreate) {
      // Check if pair already exists
      const existingNewPair = await db.assumptionScenarioPair.findFirst({
        where: {
          assumptionKey: ASSUMPTION_KEY,
          sourceScenarioId: sourceScenario.id,
          variantType: variantDef.type,
        },
      });

      if (existingNewPair) {
        console.log(`  - Variant '${variantDef.type}' already exists. Skipping.`);
        skippedPairs++;
        continue;
      }

      console.log(`  - Creating variant '${variantDef.type}'...`);

      if (!isDryRun) {
        await db.$transaction(async (tx) => {
          // Create new Scenario
          const newScenario = await tx.scenario.create({
            data: {
              definitionId: vignetteId,
              name: variantDef.name,
              content: variantDef.deriveContent() as any,
              orientationFlipped: variantDef.orientationFlipped,
            },
          });
          createdScenarios++;

          // Create new AssumptionScenarioPair
          await tx.assumptionScenarioPair.create({
            data: {
              assumptionKey: ASSUMPTION_KEY,
              sourceScenarioId: sourceScenario.id,
              variantScenarioId: newScenario.id,
              variantType: variantDef.type,
              // Initial status is null/pending
            },
          });
          createdPairs++;
        });
      } else {
        console.log(`    [DRY RUN] Would create scenario "${variantDef.name}" and link to source.`);
        createdScenarios++;
        createdPairs++;
      }
    }
  }

  console.log(`
Finished!`);
  console.log(`Scenarios created: ${createdScenarios}`);
  console.log(`Pairs created: ${createdPairs}`);
  console.log(`Pairs skipped: ${skippedPairs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
