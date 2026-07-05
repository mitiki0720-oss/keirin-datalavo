export const LEGACY_REVIEW_SNAPSHOT_STORAGE_KEY =
  "kurari-data-labo-review-race-result-snapshots";

const LEGACY_REVIEW_SNAPSHOT_GUARD_MARKER =
  Symbol.for("kurari.legacyReviewSnapshotStorageGuard");

type GuardedSetItem = Storage["setItem"] & {
  [LEGACY_REVIEW_SNAPSHOT_GUARD_MARKER]?: boolean;
};

export function cleanupLegacyReviewSnapshotStorage() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LEGACY_REVIEW_SNAPSHOT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function installLegacyReviewSnapshotStorageGuard() {
  if (typeof window === "undefined") return;

  cleanupLegacyReviewSnapshotStorage();

  try {
    const storagePrototype = Object.getPrototypeOf(window.localStorage) as Storage;
    const currentSetItem = storagePrototype.setItem as GuardedSetItem;
    if (currentSetItem[LEGACY_REVIEW_SNAPSHOT_GUARD_MARKER]) return;

    const guardedSetItem: GuardedSetItem = function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (
        this === window.localStorage &&
        key === LEGACY_REVIEW_SNAPSHOT_STORAGE_KEY
      ) {
        console.warn("blocked legacy review snapshot persistence");
        return;
      }

      return currentSetItem.call(this, key, value);
    };
    guardedSetItem[LEGACY_REVIEW_SNAPSHOT_GUARD_MARKER] = true;

    Object.defineProperty(storagePrototype, "setItem", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: guardedSetItem,
    });
  } catch {
    // Keep app startup non-fatal when Storage.prototype cannot be patched.
  }
}
