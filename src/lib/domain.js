import { seedCards } from './fixtures.js';
import { fail } from './security.js';
export const schema = 'drift_demo';
export const seed = seedCards;
export const fields = {"status":["backlog","active","review","done"],"assignee":["Mara","Theo","Inez","No owner"]};
export function validatePatch(body) {
  const allowed = [...Object.keys(fields), 'expectedVersion'];
  if (Object.keys(body).some(key => !allowed.includes(key))) fail(422, 'INVALID_PATCH', 'Unknown mutation field.');
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || body.expectedVersion > 501) fail(422, 'INVALID_VERSION', 'expectedVersion must be an integer from 1 to 501.');
  const patch = {};
  for (const [key, choices] of Object.entries(fields)) {
    if (key in body) {
      if (!choices.includes(body[key])) fail(422, 'INVALID_PATCH', 'Invalid ' + key + '.');
      patch[key] = body[key];
    }
  }
  if (!Object.keys(patch).length) fail(422, 'INVALID_PATCH', 'Choose at least one field to change.');
  return { patch, expectedVersion: body.expectedVersion };
}
