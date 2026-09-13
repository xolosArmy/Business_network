/**
 * @file validate-registry.mjs
 * Schema validator and automated verification test suite for xolosArmy Apps Registry (DIR-XA1).
 *
 * Verifies:
 * 1. JSON parsing and structure of /apps/registry.schema.json and /apps/registry.json.
 * 2. Strict Draft 2020-12 schema conformance (types, enums, required properties, additionalProperties: false).
 * 3. Standard Ajv2020 + ajv-formats validation against canonical schema.
 * 4. Security invariant: NO capability may be declared as "production" without verified production evidence.
 * 5. Xolos Ramírez registered as first app with accurate non-production status (webMcpStatus: testing, x402Status: planned).
 * 6. Fail-closed test suite rejecting malformed, injected, or unevidenced production payloads.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const schemaPath = resolve(ROOT_DIR, 'apps/registry.schema.json');
const registryPath = resolve(ROOT_DIR, 'apps/registry.json');

const rawSchema = readFileSync(schemaPath, 'utf8');
const rawRegistry = readFileSync(registryPath, 'utf8');

const schema = JSON.parse(rawSchema);
const registry = JSON.parse(rawRegistry);

// Initialize Draft 2020-12 validator in strict mode
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compiledValidator = ajv.compile(schema);

/**
 * Validates a registry object against both Draft 2020-12 schema and domain invariants.
 * @param {Object} data 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRegistry(data) {
  const errors = [];

  // 1. Standard Draft 2020-12 schema validation
  const isSchemaValid = compiledValidator(data);
  if (!isSchemaValid && compiledValidator.errors) {
    for (const err of compiledValidator.errors) {
      errors.push(`[Schema ${err.keyword}] ${err.instancePath || 'root'}: ${err.message}`);
    }
  }

  // 2. Comprehensive domain and invariant checks
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Root must be an object', ...errors] };
  }

  // Registry policy constraints
  if (data.registryPolicy && typeof data.registryPolicy === 'object') {
    const allowedPolicyKeys = new Set(['productionEvidenceRequired', 'allowedWebMcpStatuses', 'allowedX402Statuses']);
    for (const k of Object.keys(data.registryPolicy)) {
      if (!allowedPolicyKeys.has(k)) {
        errors.push(`registryPolicy has disallowed property: "${k}"`);
      }
    }
    if (!Array.isArray(data.registryPolicy.allowedWebMcpStatuses)) {
      errors.push('registryPolicy.allowedWebMcpStatuses must be an array');
    }
    if (!Array.isArray(data.registryPolicy.allowedX402Statuses)) {
      errors.push('registryPolicy.allowedX402Statuses must be an array');
    }
  }

  // Application entries invariant checks
  if (Array.isArray(data.applications)) {
    for (let i = 0; i < data.applications.length; i++) {
      const app = data.applications[i];
      const prefix = `applications[${i}]`;

      if (typeof app !== 'object' || app === null) continue;

      if (app.capabilities && typeof app.capabilities === 'object') {
        if (data.registryPolicy && Array.isArray(data.registryPolicy.allowedWebMcpStatuses)) {
          if (!data.registryPolicy.allowedWebMcpStatuses.includes(app.capabilities.webMcpStatus)) {
            errors.push(`${prefix}.capabilities.webMcpStatus "${app.capabilities.webMcpStatus}" is not permitted by registryPolicy.allowedWebMcpStatuses`);
          }
        }
        if (data.registryPolicy && Array.isArray(data.registryPolicy.allowedX402Statuses)) {
          if (!data.registryPolicy.allowedX402Statuses.includes(app.capabilities.x402Status)) {
            errors.push(`${prefix}.capabilities.x402Status "${app.capabilities.x402Status}" is not permitted by registryPolicy.allowedX402Statuses`);
          }
        }

        const isProduction =
          app.capabilities.webMcpStatus === 'production' ||
          app.capabilities.x402Status === 'production';

        if (isProduction) {
          if (app.securityStatus !== 'verified') {
            errors.push(`${prefix} declares "production" capability without verified security status!`);
          }
          if (!app.evidence || !app.evidence.gitCommitSha || !app.evidence.specificationDocument) {
            errors.push(`${prefix} declares "production" capability without complete audit evidence!`);
          }
        }
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
  assert.ok(schema.properties.$schema, 'Schema must declare $schema property for instances');
  assert.ok(schema.properties.applications);
  assert.ok(schema.properties.schemaVersion);
  assert.ok(schema.properties.registryPolicy);
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
    if (app.capabilities.webMcpStatus === 'production' || app.capabilities.x402Status === 'production') {
      assert.equal(app.securityStatus, 'verified', `App ${app.id} in production must have verified securityStatus`);
      assert.ok(app.evidence && app.evidence.gitCommitSha, `App ${app.id} in production must have audit evidence`);
    }
  }
  // Scoped specifically to Xolos Ramírez launch-state assertions
  const xolos = registry.applications.find((a) => a.id === 'xolosramirez');
  assert.ok(xolos, 'xolosramirez must be registered');
  assert.equal(xolos.capabilities.webMcpStatus, 'testing');
  assert.equal(xolos.capabilities.x402Status, 'planned');
  assert.equal(xolos.securityStatus, 'in-review');
});

test('DIR-XA1: Fail-closed validation on invalid fixtures', () => {
  // Case 1: missing required field in application
  const missingField = JSON.parse(JSON.stringify(registry));
  delete missingField.applications[0].url;
  const res1 = validateRegistry(missingField);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes('url')));

  // Case 2: illegal enum in capability
  const badEnum = JSON.parse(JSON.stringify(registry));
  badEnum.applications[0].capabilities.webMcpStatus = 'super-ready';
  const res2 = validateRegistry(badEnum);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes('enum') || e.includes('invalid')));

  // Case 3: unauthorized extra property in root (additionalProperties: false)
  const extraPropRoot = JSON.parse(JSON.stringify(registry));
  extraPropRoot.unauthorizedRootField = 'injected';
  const res3 = validateRegistry(extraPropRoot);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes('additional properties') || e.includes('unauthorizedRootField')));

  // Case 4: illicit production declaration without verified status (rejected by Draft 2020-12 allOf)
  const illicitProd = JSON.parse(JSON.stringify(registry));
  illicitProd.applications[0].capabilities.webMcpStatus = 'production';
  illicitProd.applications[0].securityStatus = 'in-review';
  const res4 = validateRegistry(illicitProd);
  assert.equal(res4.valid, false);
  assert.ok(res4.errors.some((e) => e.includes('then') || e.includes('without verified security status')));

  // Case 5: omitted allowedWebMcpStatuses in registryPolicy
  const missingPolicy = JSON.parse(JSON.stringify(registry));
  delete missingPolicy.registryPolicy.allowedWebMcpStatuses;
  const res5 = validateRegistry(missingPolicy);
  assert.equal(res5.valid, false);
  assert.ok(res5.errors.some((e) => e.includes('allowedWebMcpStatuses')));

  // Case 6: extra property in registryPolicy
  const extraPolicy = JSON.parse(JSON.stringify(registry));
  extraPolicy.registryPolicy.extraProp = 'disallowed';
  const res6 = validateRegistry(extraPolicy);
  assert.equal(res6.valid, false);
  assert.ok(res6.errors.some((e) => e.includes('additional properties') || e.includes('extraProp')));

  // Case 7: malformed timestamp in updatedAt
  const badTimestamp = JSON.parse(JSON.stringify(registry));
  badTimestamp.updatedAt = 'not-a-date';
  const res7 = validateRegistry(badTimestamp);
  assert.equal(res7.valid, false);
  assert.ok(res7.errors.some((e) => e.includes('date-time') || e.includes('format')));

  // Case 8: empty specificationDocument in evidence (rejected by minLength and pattern)
  const emptySpec = JSON.parse(JSON.stringify(registry));
  emptySpec.applications[0].evidence.specificationDocument = '';
  const res8 = validateRegistry(emptySpec);
  assert.equal(res8.valid, false);
  assert.ok(res8.errors.some((e) => e.includes('specificationDocument') || e.includes('minLength') || e.includes('pattern')));

  // Case 9: production capability with empty specificationDocument (rejected by conditional allOf)
  const prodEmptySpec = JSON.parse(JSON.stringify(registry));
  prodEmptySpec.applications[0].capabilities.webMcpStatus = 'production';
  prodEmptySpec.applications[0].securityStatus = 'verified';
  prodEmptySpec.applications[0].evidence.specificationDocument = '';
  const res9 = validateRegistry(prodEmptySpec);
  assert.equal(res9.valid, false);
  assert.ok(res9.errors.some((e) => e.includes('specificationDocument') || e.includes('then') || e.includes('complete audit evidence')));

  // Case 10: arbitrary string in allowedWebMcpStatuses policy array (rejected by schema enum)
  const badPolicyWebMcp = JSON.parse(JSON.stringify(registry));
  badPolicyWebMcp.registryPolicy.allowedWebMcpStatuses = ['arbitrary_status'];
  const res10 = validateRegistry(badPolicyWebMcp);
  assert.equal(res10.valid, false);
  assert.ok(res10.errors.some((e) => e.includes('enum') || e.includes('allowedWebMcpStatuses')));

  // Case 11: arbitrary string in allowedX402Statuses policy array (rejected by schema enum)
  const badPolicyX402 = JSON.parse(JSON.stringify(registry));
  badPolicyX402.registryPolicy.allowedX402Statuses = ['custom_status'];
  const res11 = validateRegistry(badPolicyX402);
  assert.equal(res11.valid, false);
  assert.ok(res11.errors.some((e) => e.includes('enum') || e.includes('allowedX402Statuses')));

  // Case 12: application capability status not in registryPolicy allowed list (rejected by invariant)
  const restrictedPolicy = JSON.parse(JSON.stringify(registry));
  restrictedPolicy.registryPolicy.allowedWebMcpStatuses = ['planned']; // testing is omitted
  const res12 = validateRegistry(restrictedPolicy);
  assert.equal(res12.valid, false);
  assert.ok(res12.errors.some((e) => e.includes('not permitted by registryPolicy')));
});
