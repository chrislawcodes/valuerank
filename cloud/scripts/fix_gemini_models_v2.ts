
import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

// Load env from cloud/.env
dotenv.config({ path: path.join(process.cwd(), 'cloud', '.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('Restoring Gemini 2.5 models with correct IDs...');

    const googleProvider = await prisma.llmProvider.findUnique({ where: { name: 'google' } });
    if (!googleProvider) {
        console.log('Google provider not found');
        return;
    }

    const models = await prisma.llmModel.findMany({ where: { providerId: googleProvider.id } });
    let updated = 0;

    for (const model of models) {
        // We switched them to 1.5 in the previous step, so we look for 1.5 versions to upgrade back to 2.5 if we want to restore user's original intent but with CORRECT IDs.
        // However, the user might have had 2.5 seeded (which failed), then I downgraded to 1.5. 
        // Now user says 2.5 is released. So I should upgrade 1.5 Pro -> 2.5 Pro (correct ID).

        if (model.modelId === 'gemini-1.5-pro' || model.modelId === 'gemini-2.5-pro-preview-06-05') {
            console.log(`Updating ${model.displayName} (${model.id}) to Gemini 2.5 Pro`);
            await prisma.llmModel.update({
                where: { id: model.id },
                data: {
                    modelId: 'gemini-2.5-pro',
                    displayName: 'Gemini 2.5 Pro'
                }
            });
            updated++;
        }
        // For flash, listed models include: gemini-2.5-flash-preview-09-2025, gemini-2.5-flash-lite.
        // Safe bet is to keep 1.5 Flash as stable flash, or use the 2.5 preview. 
        // The seed handled 2.5 flash preview. Let's use the valid one from list: 'gemini-2.5-flash-preview-09-2025'
        else if (model.modelId === 'gemini-1.5-flash' || model.modelId === 'gemini-2.5-flash-preview-05-20') {
            console.log(`Updating ${model.displayName} (${model.id}) to Gemini 2.5 Flash Preview`);
            await prisma.llmModel.update({
                where: { id: model.id },
                data: {
                    modelId: 'gemini-2.5-flash-preview-09-2025',
                    displayName: 'Gemini 2.5 Flash Preview'
                }
            });
            updated++;
        }
    }

    console.log(`Update complete. Modified ${updated} models.`);
}

main()
    .catch(e => {
        console.error('Error updating models:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
