import { normalizeCosmosTransaction } from './cosmos-normalizer.js';

/**
 * Creates an integration adapter between the GL1X HTTP client and the Cosmos
 * transaction normalizer.
 *
 * Calls gl1xApi.getCosmosTransaction(hash), normalizes the raw transaction,
 * and preserves exact raw and meta references without modification or fallback.
 */
export function createCosmosDataApi({ gl1xApi } = {}) {
  if (
    typeof gl1xApi !== 'object' ||
    gl1xApi === null ||
    typeof gl1xApi.getCosmosTransaction !== 'function'
  ) {
    throw new TypeError('gl1xApi.getCosmosTransaction is required.');
  }

  async function getNormalizedCosmosTransaction(hash) {
    const response = await gl1xApi.getCosmosTransaction(hash);
    const raw = response.data;
    const meta = response.meta;
    const normalized = normalizeCosmosTransaction(raw);

    return {
      raw,
      normalized,
      meta,
    };
  }

  return Object.freeze({
    getNormalizedCosmosTransaction,
  });
}
