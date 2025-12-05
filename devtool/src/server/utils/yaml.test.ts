import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  readYamlFile,
  writeYamlFile,
  listYamlFiles,
  listDirectories,
  fileExists,
} from './yaml.js';

describe('yaml utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaml-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('readYamlFile', () => {
    it('should parse a simple YAML file', async () => {
      const filePath = path.join(tempDir, 'test.yaml');
      await fs.writeFile(filePath, 'name: test\nvalue: 42');

      const result = await readYamlFile<{ name: string; value: number }>(filePath);

      expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('should parse nested YAML structures', async () => {
      const filePath = path.join(tempDir, 'nested.yaml');
      const content = `
parent:
  child:
    value: nested
items:
  - one
  - two
  - three
`;
      await fs.writeFile(filePath, content);

      const result = await readYamlFile<{
        parent: { child: { value: string } };
        items: string[];
      }>(filePath);

      expect(result.parent.child.value).toBe('nested');
      expect(result.items).toEqual(['one', 'two', 'three']);
    });

    it('should throw on non-existent file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.yaml');

      await expect(readYamlFile(filePath)).rejects.toThrow();
    });
  });

  describe('writeYamlFile', () => {
    it('should write a simple object to YAML', async () => {
      const filePath = path.join(tempDir, 'output.yaml');
      const data = { name: 'test', value: 42 };

      await writeYamlFile(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('name: test');
      expect(content).toContain('value: 42');
    });

    it('should write nested objects correctly', async () => {
      const filePath = path.join(tempDir, 'nested-output.yaml');
      const data = {
        parent: {
          child: { value: 'nested' },
        },
        items: ['one', 'two'],
      };

      await writeYamlFile(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('parent:');
      expect(content).toContain('child:');
      expect(content).toContain('value: nested');
    });

    it('should be able to round-trip data', async () => {
      const filePath = path.join(tempDir, 'roundtrip.yaml');
      const original = {
        name: 'roundtrip test',
        count: 100,
        enabled: true,
        items: ['a', 'b', 'c'],
      };

      await writeYamlFile(filePath, original);
      const result = await readYamlFile(filePath);

      expect(result).toEqual(original);
    });
  });

  describe('listYamlFiles', () => {
    it('should list only .yaml and .yml files', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.yaml'), 'test: 1');
      await fs.writeFile(path.join(tempDir, 'file2.yml'), 'test: 2');
      await fs.writeFile(path.join(tempDir, 'file3.txt'), 'test');
      await fs.writeFile(path.join(tempDir, 'file4.json'), '{}');

      const files = await listYamlFiles(tempDir);

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.endsWith('file1.yaml'))).toBe(true);
      expect(files.some((f) => f.endsWith('file2.yml'))).toBe(true);
    });

    it('should return full paths', async () => {
      await fs.writeFile(path.join(tempDir, 'test.yaml'), 'test: 1');

      const files = await listYamlFiles(tempDir);

      expect(files[0]).toBe(path.join(tempDir, 'test.yaml'));
    });

    it('should return empty array for empty directory', async () => {
      const files = await listYamlFiles(tempDir);
      expect(files).toEqual([]);
    });

    it('should ignore directories with .yaml extension', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir.yaml'));
      await fs.writeFile(path.join(tempDir, 'file.yaml'), 'test: 1');

      const files = await listYamlFiles(tempDir);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('file.yaml');
    });
  });

  describe('listDirectories', () => {
    it('should list only directories', async () => {
      await fs.mkdir(path.join(tempDir, 'dir1'));
      await fs.mkdir(path.join(tempDir, 'dir2'));
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'test');

      const dirs = await listDirectories(tempDir);

      expect(dirs).toHaveLength(2);
      expect(dirs).toContain('dir1');
      expect(dirs).toContain('dir2');
    });

    it('should return empty array for empty directory', async () => {
      const dirs = await listDirectories(tempDir);
      expect(dirs).toEqual([]);
    });

    it('should return only directory names, not paths', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'));

      const dirs = await listDirectories(tempDir);

      expect(dirs).toEqual(['subdir']);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(tempDir, 'exists.txt');
      await fs.writeFile(filePath, 'test');

      const exists = await fileExists(filePath);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      const exists = await fileExists(filePath);

      expect(exists).toBe(false);
    });

    it('should return true for existing directory', async () => {
      const dirPath = path.join(tempDir, 'subdir');
      await fs.mkdir(dirPath);

      const exists = await fileExists(dirPath);

      expect(exists).toBe(true);
    });
  });
});
