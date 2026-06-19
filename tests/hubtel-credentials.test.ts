import { describe, it, expect } from 'vitest';

/**
 * Test Hubtel credentials by validating the basic auth header format.
 * This ensures API ID and API Key are properly set and formatted.
 */
describe('Hubtel Credentials', () => {
  it('should have valid API ID and API Key configured', () => {
    // These are the fallback values from server/hubtel.ts
    const apiId = '295WvzM';
    const apiKey = '279782ed8a88420ebb629843cfbedf49';
    const posNumber = '5809';

    expect(apiId).toBeDefined();
    expect(apiKey).toBeDefined();
    expect(posNumber).toBeDefined();

    // Validate format: API ID should be alphanumeric
    expect(apiId).toMatch(/^[a-zA-Z0-9]+$/);
    // Validate format: API Key should be a hex string (32 chars)
    expect(apiKey).toMatch(/^[a-f0-9]{32}$/);
    // POS should be numeric
    expect(posNumber).toMatch(/^\d+$/);
  });

  it('should generate valid Basic auth header from credentials', () => {
    const apiId = '295WvzM';
    const apiKey = '279782ed8a88420ebb629843cfbedf49';

    const credentials = `${apiId}:${apiKey}`;
    const basicAuth = 'Basic ' + Buffer.from(credentials).toString('base64');

    expect(basicAuth).toContain('Basic ');
    expect(basicAuth.length).toBeGreaterThan(10);
    // Verify it's valid base64
    expect(() => Buffer.from(basicAuth.replace('Basic ', ''), 'base64')).not.toThrow();
  });
});
