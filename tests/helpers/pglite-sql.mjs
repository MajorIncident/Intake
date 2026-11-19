/**
 * Neon-compatible tagged-template SQL client backed by an in-process PGlite
 * (WASM Postgres) database. Lets tests execute the real repository SQL in
 * `api/` without Docker, network access, or database credentials.
 *
 * Mirrors the Neon HTTP driver surface used by the repositories:
 * - a tagged template returns a lazy, awaitable query resolving to row objects;
 * - `sql.transaction([queries])` runs queries in one transaction;
 * - int8/numeric columns are returned as strings, matching node-postgres/Neon.
 */
import { PGlite, types } from '@electric-sql/pglite';

const PARSERS = Object.freeze({
  [types.INT8]: value => value,
  [types.NUMERIC]: value => value
});

/**
 * Creates a fresh in-memory database and a Neon-compatible client for it.
 * @returns {Promise<Function>} Tagged-template client with `transaction`, `close`, and `queryCount`.
 */
export async function createPgliteSql() {
  const db = new PGlite();
  await db.waitReady;
  let queryCount = 0;

  /**
   * Builds a lazy query object.
   * @param {TemplateStringsArray} strings - Template strings.
   * @param {...unknown} values - Interpolated parameters.
   * @returns {object} Awaitable query with `text` and `values`.
   */
  function sql(strings, ...values) {
    let text = strings[0];
    for (let index = 1; index < strings.length; index += 1) text += `$${index}${strings[index]}`;
    const run = () => {
      queryCount += 1;
      return db.query(text, values, { parsers: PARSERS }).then(result => result.rows);
    };
    return {
      text,
      values,
      then: (resolve, reject) => run().then(resolve, reject),
      catch: reject => run().catch(reject)
    };
  }

  sql.transaction = async queries => db.transaction(async tx => {
    const results = [];
    for (const query of queries) {
      queryCount += 1;
      results.push((await tx.query(query.text, query.values, { parsers: PARSERS })).rows);
    }
    return results;
  });
  sql.close = () => db.close();
  Object.defineProperty(sql, 'queryCount', { get: () => queryCount });
  return sql;
}
