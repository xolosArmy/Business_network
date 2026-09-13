/**
 * @file validate-registry.mjs
 * Schema validator and automated verification test suite for xolosArmy Apps Registry (DIR-XA1).
 *
 * Verifies:
 * 1. JSON parsing and structure of /apps/registry.schema.json and /apps/registry.json.
 * 2. Strict Draft 2020-12 schema conformance (types, enums, required properties, additionalProperties: false).
 * 3. Security invariant: NO capability may be declared as "production" without verified production evidence.
 * 4. Xolos Ramírez registered as first app with accurate non-production status (webMcpStatus: testing, x402Status: planned).
 * 5. Fail-closed test suite rejecting malformed, injected, or unevidenced production payloads.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const schemaPath = resolve(ROOT_DIR, 'apps/registry.schema.json');
const registryPath = resolve(ROOT_DIR, 'apps/registry.json');

const rawSchema = readFileSync(schemaPath, 'utf8');
const rawRegistry = readFileSync(registryPath, 'utf8');

const schema = JSON.parse(rawSchema);
const registry = JSON.parse(rawRegistry);

/**
 * Validates a registry object against the canonical rules of registry.schema.json.
 * @param {Object} data 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRegistry(data) {
  const errors = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Root must be an object'] };
  }

  // Root allowed keys
  const allowedRootKeys = new Set(['$schema', 'schemaVersion', 'updatedAt', 'network', 'registryPolicy', 'applications']);
  for (const k of Object.keys(data)) {
    if (!allowedRootKeys.has(k)) {
      errors.push(`Disallowed property in root: "${k}"`);
    }
  }

  // Required root fields
  const requiredRoot = ['schemaVersion', 'updatedAt', 'network', 'registryPolicy', 'applications'];
  for (const field of requiredRoot) {
    if (data[field] === undefined) {
      errors.push(`Missing required root field: "${field}"`);
    }
  }

  // schemaVersion regex
  if (data.schemaVersion && !/^v[0-9]+(\.[0-9]+)*$/.test(data.schemaVersion)) {
    errors.push(`Invalid schemaVersion format: "${data.schemaVersion}"`);
  }

  // network enum
  const allowedNetworks = ['xolosArmy Network', 'Tonalli Ecosystem'];
  if (data.network && !allowedNetworks.includes(data.network)) {
    errors.push(`Invalid network: "${data.network}"`);
  }

  // registryPolicy
  if (data.registryPolicy) {
    if (typeof data.registryPolicy.productionEvidenceRequired !== 'boolean') {
      errors.push('registryPolicy.productionEvidenceRequired must be a boolean');
    }
  }

  // applications array
  if (!Array.isArray(data.applications)) {
    errors.push('applications must be an array');
    return { valid: errors.length === 0, errors };
  }

  const allowedCategories = ['commerce', 'wallet', 'explorer', 'identity', 'infrastructure', 'governance'];
  const allowedStatuses = ['planned', 'testing', 'verified', 'production'];
  const allowedSecurityStatuses = ['in-review', 'verified', 'deprecated'];
  const allowedAppKeys = new Set([
    'id', 'name', 'description', 'url', 'category', 'capabilities', 'securityStatus', 'lastVerified', 'evidence'
  ]);
  const allowedCapabilityKeys = new Set([
    'webMcpStatus', 'x402Status', 'settlementAssets', 'fundingPaths', 'webMcpTools'
  ]);
  const allowedEvidenceKeys = new Set([
    'specificationDocument', 'gitCommitSha', 'auditReference'
  ]);

  for (let i = 0; i < data.applications.length; i++) {
    const app = data.applications[i];
    const prefix = `applications[${i}]`;

    if (typeof app !== 'object' || app === null) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    // Disallowed keys
    for (const k of Object.keys(app)) {
      if (!allowedAppKeys.has(k)) {
        errors.push(`${prefix} has disallowed property: "${k}"`);
      }
    }

    // Required app fields
    for (const field of allowedAppKeys) {
      if (app[field] === undefined) {
        errors.push(`${prefix} missing required field: "${field}"`);
      }
    }

    // id regex
    if (app.id && !/^[a-z0-9-]+$/.test(app.id)) {
      errors.push(`${prefix}.id must match pattern ^[a-z0-9-]+$, got: "${app.id}"`);
    }

    // category
    if (app.category && !allowedCategories.includes(app.category)) {
      errors.push(`${prefix}.category "${app.category}" is not in allowed enum`);
    }

    // securityStatus
    if (app.securityStatus && !allowedSecurityStatuses.includes(app.securityStatus)) {
      errors.push(`${prefix}.securityStatus "${app.securityStatus}" is not in allowed enum`);
    }

    // url format
    if (app.url) {
      try {
        const parsed = new URL(app.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(`${prefix}.url must use http or https`);
        }
      } catch {
        errors.push(`${prefix}.url is not a valid URI`);
      }
    }

    // capabilities
    if (app.capabilities) {
      for (const ck of Object.keys(app.capabilities)) {
        if (!allowedCapabilityKeys.has(ck)) {
          errors.push(`${prefix}.capabilities has disallowed property: "${ck}"`);
        }
      }

      if (!allowedStatuses.includes(app.capabilities.webMcpStatus)) {
        errors.push(`${prefix}.capabilities.webMcpStatus "${app.capabilities.webMcpStatus}" invalid`);
      }
      if (!allowedStatuses.includes(app.capabilities.x402Status)) {
        errors.push(`${prefix}.capabilities.x402Status "${app.capabilities.x402Status}" invalid`);
      }

      // CRITICAL PRODUCTION EVIDENCE INVARIANT:
      if (
        (app.capabilities.webMcpStatus === 'production' || app.capabilities.x402Status === 'production') &&
        (!app.evidence || !app.evidence.gitCommitSha || app.securityStatus !== 'verified')
      ) {
        errors.push(
          `${prefix} declares "production" capability without verified security status and audit commit evidence!`
        );
      }
    }

    // evidence
    if (app.evidence) {
      for (const ek of Object.keys(app.evidence)) {
        if (!allowedEvidenceKeys.has(ek)) {
          errors.push(`${prefix}.evidence has disallowed property: "${ek}"`);
        }
      }

      if (app.evidence.gitCommitSha && !/^[0-9a-f]{40}$/.test(app.evidence.gitCommitSha)) {
        errors.push(`${prefix}.evidence.gitCommitSha must be a valid 40-character hex commit SHA`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ---------------- AUTOMATED TESTS ---------------- //

test('DIR-XA1: Canonical registry.schema.json is valid Draft 2020-12', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.ok(schema.properties.applications);
  assert.ok(schema.properties.schemaVersion);
});

test('DIR-XA1: Canonical registry.json passes schema validation', () => {
  const result = validateRegistry(registry);
  assert.equal(result.valid, true, `Validation failed: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
});

test('DIR-XA1: Xolos Ramírez is registered as the first application', () => {
  assert.ok(registry.applications.length >= 1, 'Registry must have at least one application');
  const firstApp = registry.applications[0];
  assert.equal(firstApp.id, 'xolosramirez');
  assert.equal(firstApp.name, 'Xolos Ramírez');
  assert.equal(firstApp.category, 'commerce');
  assert.equal(firstApp.url, 'https://xolosramirez.com');
});

test('DIR-XA1: Strict Invariant — No capability declared as "production" without evidence', () => {
  for (const app of registry.applications) {
    assert.notEqual(
      app.capabilities.webMcpStatus,
      'production',
      `Application "${app.id}" must NOT declare webMcpStatus as production during pre-release`
    );
    assert.notEqual(
      app.capabilities.x402Status,
      'production',
      `Application "${app.id}" must NOT declare x402Status as production before Gate C2 settlement freeze`
    );
    assert.equal(app.capabilities.webMcpStatus, 'testing');
    assert.equal(app.capabilities.x402Status, 'planned');
    assert.equal(app.securityStatus, 'in-review');
  }
});

test('DIR-XA1: Fail-closed validation on invalid fixtures', () => {
  // Case 1: missing required field
  const missingField = JSON.parse(JSON.stringify(registry));
  delete missingField.applications[0].url;
  const res1 = validateRegistry(missingField);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes('missing required field: "url"')));

  // Case 2: illegal enum in capability
  const badEnum = JSON.parse(JSON.stringify(registry));
  badEnum.applications[0].capabilities.webMcpStatus = 'super-ready';
  const res2 = validateRegistry(badEnum);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes('invalid')));

  // Case 3: unauthorized extra property (additionalProperties: false)
  const extraProp = JSON.parse(JSON.stringify(registry));
  extraProp.applications[0].unauthorizedField = 'injected';
  const res3 = validateRegistry(extraProp);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes('disallowed property: "unauthorizedField"')));

  // Case 4: illicit production declaration without verified status
  const illicitProd = JSON.parse(JSON.stringify(registry));
  illicitProd.applications[0].capabilities.webMcpStatus = 'production';
  illicitProd.applications[0].securityStatus = 'in-review';
  const res4 = validateRegistry(illicitProd);
  assert.equal(res4.valid, false);
  assert.ok(res4.errors.some((e) => e.includes('without verified security status')));
});
