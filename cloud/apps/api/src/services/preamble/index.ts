import { db } from '@valuerank/db';

/**
 * Generate a version label based on Pacific Time.
 */
function generateVersionLabel(): string {
    // Use Intl.DateTimeFormat for reliable timezone handling
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short',
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());

    // Format: YYYY-MM-DD HH:mm PST/PDT
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    const tz = parts.find(p => p.type === 'timeZoneName')?.value;

    return `${year}-${month}-${day} ${hour}:${minute} ${tz}`;
}

export type PreambleDto = {
    id: string;
    name: string;
    latestVersion: {
        id: string;
        version: string;
        content: string;
        createdAt: Date;
    } | null;
    createdAt: Date;
    updatedAt: Date;
};

/**
 * List all preambles with their LATEST version.
 */
export async function listPreambles(): Promise<PreambleDto[]> {
    const preambles = await db.preamble.findMany({
        include: {
            versions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
        },
        orderBy: { updatedAt: 'desc' },
    });

    return preambles.map(p => ({
        id: p.id,
        name: p.name,
        latestVersion: p.versions[0] ? {
            id: p.versions[0].id,
            version: p.versions[0].version,
            content: p.versions[0].content,
            createdAt: p.versions[0].createdAt,
        } : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
    }));
}

/**
 * Create a new preamble with initial version.
 */
export async function createPreamble(name: string, content: string) {
    return await db.$transaction(async (tx) => {
        const preamble = await tx.preamble.create({
            data: { name },
        });

        const version = await tx.preambleVersion.create({
            data: {
                preambleId: preamble.id,
                version: 'Initial',
                content,
            },
        });

        return {
            ...preamble,
            latestVersion: version,
        };
    });
}

/**
 * Update a preamble by creating a NEW version.
 */
export async function updatePreamble(id: string, content: string) {
    const versionLabel = generateVersionLabel();

    return await db.$transaction(async (tx) => {
        // 1. Create new version
        const version = await tx.preambleVersion.create({
            data: {
                preambleId: id,
                version: versionLabel,
                content,
            },
        });

        // 2. Touch parent to update updatedAt
        const preamble = await tx.preamble.update({
            where: { id },
            data: { updatedAt: new Date() },
        });

        return {
            ...preamble,
            latestVersion: version,
        };
    });
}

/**
 * Get a specific version of a preamble.
 */
export async function getPreambleVersion(versionId: string) {
    return await db.preambleVersion.findUnique({
        where: { id: versionId },
        include: { preamble: true },
    });
}

export async function deletePreamble(id: string) {
    // Safety check: is it in use?
    const usageCount = await db.definition.count({
        where: {
            // Check if any definition uses ANY version of this preamble
            preambleVersion: {
                preambleId: id
            },
            // Only count active definitions
            deletedAt: null
        }
    });

    if (usageCount > 0) {
        throw new Error(`Cannot delete preamble: used by ${usageCount} active definition(s). Please unassign it first.`);
    }

    return await db.preamble.delete({
        where: { id },
    });
}
