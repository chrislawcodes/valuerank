
import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

// Load env from cloud/.env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('Updating invalid Gemini models...');

    const googleProvider = await prisma.llmProvider.findUnique({ where: { name: 'google' } });
    if (!googleProvider) {
        console.log('Google provider not found');
        return;
    }

    const models = await prisma.llmModel.findMany({ where: { providerId: googleProvider.id } });
    let updated = 0;

    for (const model of models) {
        if (model.modelId === 'gemini-2.5-pro-preview-06-05') {
            console.log(`Updating ${model.displayName} (${model.id}) to Gemini 1.5 Pro`);
            await prisma.llmModel.update({
                where: { id: model.id },
                data: {
                    modelId: 'gemini-1.5-pro',
                    displayName: 'Gemini 1.5 Pro'
                }
            });
            updated++;
        }
        else if (model.modelId === 'gemini-2.5-flash-preview-05-20') {
            console.log(`Updating ${model.displayName} (${model.id}) to Gemini 1.5 Flash`);
            await prisma.llmModel.update({
                where: { id: model.id },
                data: {
                    modelId: 'gemini-1.5-flash',
                    displayName: 'Gemini 1.5 Flash'
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
