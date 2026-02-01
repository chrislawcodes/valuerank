
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { db } from '@valuerank/db'; // This is mocked

// Mock deps
vi.mock('@valuerank/db', () => ({
    db: {
        apiKey: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
        run: { findUnique: vi.fn() },
        transcript: { findMany: vi.fn() },
        analysisResult: { findFirst: vi.fn() },
    },
    resolveDefinitionContent: vi.fn(),
}));

vi.mock('../../src/auth/services.js', () => ({
    verifyToken: vi.fn(),
    extractBearerToken: vi.fn(),
}));

vi.mock('../../src/auth/api-keys.js', () => ({
    hashApiKey: vi.fn().mockReturnValue('hashed-key'),
    isValidApiKeyFormat: vi.fn().mockReturnValue(true),
}));

vi.mock('@valuerank/shared', async () => {
    const actual = await vi.importActual('@valuerank/shared');
    return {
        ...actual,
        createLogger: () => ({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            child: vi.fn().mockReturnThis(),
        }),
    };
});

describe('CSV Export Router', () => {
    let app: any;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createServer();
    });

    const mockRun = {
        id: 'run-123',
        status: 'COMPLETED',
    };

    const mockTranscripts = [
        {
            id: 't1',
            runId: 'run-123',
            modelId: 'openai:gpt-4',
            sampleIndex: 0,
            decisionCode: 'UPHOLD',
            decisionText: 'Explanation',
            scenario: {
                content: {
                    dimensions: { 'Dim A': 1, 'Dim B': 2 }
                }
            },
            content: { turns: [{ targetResponse: 'Yes' }] },
        }
    ];

    it('should authenticate via query param', async () => {
        // Setup API key mock
        vi.mocked(db.apiKey.findUnique).mockResolvedValue({
            id: 'key-123',
            userId: 'u1',
            keyHash: 'hashed-key',
            expiresAt: null,
            lastUsed: new Date(),
            user: { id: 'u1', email: 'test@example.com' }
        } as any);

        // Setup data mocks
        vi.mocked(db.run.findUnique).mockResolvedValue(mockRun as any);
        vi.mocked(db.transcript.findMany).mockResolvedValue(mockTranscripts as any);

        const res = await request(app)
            .get('/api/csv/runs/run-123?apiKey=vr_testkey123')
            .expect(200);

        expect(res.text).toContain('Dim A');
        expect(res.text).toContain('gpt-4');
        expect(res.headers['content-type']).toContain('text/csv');
    });

    it('should authenticate via header', async () => {
        // Setup API key mock
        vi.mocked(db.apiKey.findUnique).mockResolvedValue({
            id: 'key-123',
            userId: 'u1',
            keyHash: 'hashed-key',
            expiresAt: null,
            lastUsed: new Date(),
            user: { id: 'u1', email: 'test@example.com' }
        } as any);

        vi.mocked(db.run.findUnique).mockResolvedValue(mockRun as any);
        vi.mocked(db.transcript.findMany).mockResolvedValue(mockTranscripts as any);

        await request(app)
            .get('/api/csv/runs/run-123')
            .set('X-API-Key', 'vr_testkey123')
            .expect(200);
    });

    it('should allow anonymous access (public feed)', async () => {
        // Setup data mocks for anonymous request too
        vi.mocked(db.run.findUnique).mockResolvedValue(mockRun as any);
        vi.mocked(db.transcript.findMany).mockResolvedValue(mockTranscripts as any);

        const res = await request(app)
            .get('/api/csv/runs/run-123')
            .expect(200);

        expect(res.text).toContain('Dim A');
        expect(res.headers['content-type']).toContain('text/csv');
    });
});
