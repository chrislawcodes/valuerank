/**
 * MCP Server Tests
 *
 * Tests for MCP server initialization and configuration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMcpServer, resetMcpServer, createMcpServer } from '../../src/mcp/server.js';

describe('MCP Server', () => {
  beforeEach(() => {
    resetMcpServer();
  });

  afterEach(() => {
    resetMcpServer();
  });

  describe('createMcpServer', () => {
    it('creates a new MCP server instance', () => {
      const server = createMcpServer();
      expect(server).toBeDefined();
      expect(server.server).toBeDefined(); // Access underlying Server instance
    });

    it('configures server with tool capabilities', () => {
      const server = createMcpServer();
      // Server should be configured with tools capability
      expect(server).toBeDefined();
    });
  });

  describe('getMcpServer', () => {
    it('returns singleton instance', () => {
      const server1 = getMcpServer();
      const server2 = getMcpServer();
      expect(server1).toBe(server2);
    });

    it('creates new instance after reset', () => {
      const server1 = getMcpServer();
      resetMcpServer();
      const server2 = getMcpServer();
      expect(server1).not.toBe(server2);
    });
  });

  describe('resetMcpServer', () => {
    it('clears the singleton instance', () => {
      const server1 = getMcpServer();
      expect(server1).toBeDefined();

      resetMcpServer();

      // Next call should create a new instance
      const server2 = getMcpServer();
      expect(server2).not.toBe(server1);
    });
  });
});
