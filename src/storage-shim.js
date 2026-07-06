/*
 * Local shim for the artifact persistent-storage API (`window.storage`).
 * The app code was written against the artifact runtime, where window.storage
 * is async and returns { key, value } records. Locally we back it with
 * localStorage under a namespaced prefix so the same code runs unchanged.
 */
const PREFIX = "cmu-opportunity-hub:";

if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(PREFIX + key);
      return value == null ? null : { key, value };
    },
    async set(key, value) {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    },
  };
}
