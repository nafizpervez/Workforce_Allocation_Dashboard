/**
 * Small compatibility wrapper around Node's built-in synchronous SQLite API.
 *
 * The project intentionally uses node:sqlite instead of better-sqlite3 so a
 * platform-specific native addon does not need to be downloaded or compiled.
 * Node.js 22.13 or newer is required.
 */

let DatabaseSync;

try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (cause) {
  const error = new Error(
    'This application requires Node.js 22.13 or newer because it uses the ' +
    'built-in node:sqlite module. Upgrade Node.js, then run npm install again.'
  );
  error.cause = cause;
  throw error;
}

class Database extends DatabaseSync {
  /** Execute a PRAGMA statement using the former database-driver API. */
  pragma(source) {
    if (typeof source !== 'string' || !source.trim()) {
      throw new TypeError('pragma() requires a non-empty SQL pragma string');
    }
    this.exec(`PRAGMA ${source}`);
  }

  /**
   * Return a function that executes its callback inside a synchronous
   * transaction and preserves the original callback error on rollback.
   */
  transaction(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('transaction() requires a function');
    }

    return (...args) => {
      this.exec('BEGIN IMMEDIATE');

      try {
        const result = callback(...args);
        this.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.exec('ROLLBACK');
        } catch (_) {
          // Keep the error that caused the transaction to fail.
        }
        throw error;
      }
    };
  }
}

module.exports = Database;
