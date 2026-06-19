import { describe, it, expect } from 'vitest';

/**
 * Test Firebase Admin SDK service account configuration.
 * Validates that the service account JSON is properly formatted and can be parsed.
 */
describe('Firebase Admin Service Account', () => {
  it('should have valid FIREBASE_SERVICE_ACCOUNT environment variable', () => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    expect(serviceAccountJson).toBeDefined();
    expect(serviceAccountJson).toBeTruthy();
  });

  it('should parse service account JSON correctly', () => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    
    // Validate required fields
    expect(serviceAccount.type).toBe('service_account');
    expect(serviceAccount.project_id).toBe('hy3n26');
    expect(serviceAccount.private_key_id).toBeDefined();
    expect(serviceAccount.private_key).toBeDefined();
    expect(serviceAccount.client_email).toBeDefined();
    expect(serviceAccount.client_id).toBeDefined();
    expect(serviceAccount.token_uri).toBe('https://oauth2.googleapis.com/token');
  });

  it('should have valid private key format', () => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const privateKey = serviceAccount.private_key;

    expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    expect(privateKey).toContain('-----END PRIVATE KEY-----');
    expect(privateKey.length).toBeGreaterThan(1000);
  });

  it('should have valid client email format', () => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const clientEmail = serviceAccount.client_email;

    expect(clientEmail).toMatch(/^firebase-adminsdk-.*@hy3n26\.iam\.gserviceaccount\.com$/);
  });
});
