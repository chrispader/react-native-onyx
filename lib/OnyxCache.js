import _ from 'underscore';
import {deepEqual} from 'fast-equals';
import fastMerge from './fastMerge';

const isDefined = _.negate(_.isUndefined);

/**
 * In memory cache providing data by reference
 * Encapsulates Onyx cache related functionality
 */
class OnyxCache {
    constructor() {
        /**
         * @private
         * Cache of all the storage keys available in persistent storage
         * @type {Set<string>}
         */
        this.storageKeys = new Set();

        /**
         * @private
         * Unique list of keys maintained in access order (most recent at the end)
         * @type {Set<string>}
         */
        this.recentKeys = new Set();

        /**
         * @private
         * A map of cached values
         * @type {Record<string, *>}
         */
        this.storageMap = {};

        /**
         * @private
         * Captured pending tasks for already running storage methods
         * @type {Record<string, Promise>}
         */
        this.pendingPromises = {};

        // bind all public methods to prevent problems with `this`
        _.bindAll(
            this,
            'getAllKeys', 'getValue', 'hasCacheForKey', 'addKey', 'set', 'drop', 'merge',
            'hasPendingTask', 'getTaskPromise', 'captureTask', 'removeLeastRecentlyUsedKeys',
            'setRecentKeysLimit',
        );
    }

    /**
     * Get all the storage keys
     * @returns {string[]}
     */
    getAllKeys() {
        return Array.from(this.storageKeys);
    }

    /**
     * Get a cached value from storage
     * @param {string} key
     * @returns {*}
     */
    getValue(key) {
        this.addToAccessedKeys(key);
        return this.storageMap[key];
    }

    /**
     * Check whether cache has data for the given key
     * @param {string} key
     * @returns {boolean}
     */
    hasCacheForKey(key) {
        return isDefined(this.storageMap[key]);
    }

    /**
     * Saves a key in the storage keys list
     * Serves to keep the result of `getAllKeys` up to date
     * @param {string} key
     */
    addKey(key) {
        this.storageKeys.add(key);
    }

    /**
     * Set's a key value in cache
     * Adds the key to the storage keys list as well
     * @param {string} key
     * @param {*} value
     * @returns {*} value - returns the cache value
     */
    set(key, value) {
        this.addKey(key);
        this.addToAccessedKeys(key);
        this.storageMap[key] = value;

        return value;
    }

    /**
     * Forget the cached value for the given key
     * @param {string} key
     */
    drop(key) {
        delete this.storageMap[key];
    }

    /**
     * Deep merge data to cache, any non existing keys will be created
     * @param {Record<string, *>} data - a map of (cache) key - values
     */
    merge(data) {
        if (!_.isObject(data) || _.isArray(data)) {
            throw new Error('data passed to cache.merge() must be an Object of onyx key/value pairs');
        }

        // lodash adds a small overhead so we don't use it here
        // eslint-disable-next-line prefer-object-spread, rulesdir/prefer-underscore-method
        this.storageMap = Object.assign({}, fastMerge(this.storageMap, data));

        const storageKeys = this.getAllKeys();
        const mergedKeys = _.keys(data);
        this.storageKeys = new Set([...storageKeys, ...mergedKeys]);
        _.each(mergedKeys, key => this.addToAccessedKeys(key));
    }

    /**
     * Check whether the given task is already running
     * @param {string} taskName - unique name given for the task
     * @returns {*}
     */
    hasPendingTask(taskName) {
        return isDefined(this.pendingPromises[taskName]);
    }

    /**
     * Use this method to prevent concurrent calls for the same thing
     * Instead of calling the same task again use the existing promise
     * provided from this function
     * @template T
     * @param {string} taskName - unique name given for the task
     * @returns {Promise<T>}
     */
    getTaskPromise(taskName) {
        return this.pendingPromises[taskName];
    }

    /**
     * Capture a promise for a given task so other caller can
     * hook up to the promise if it's still pending
     * @template T
     * @param {string} taskName - unique name for the task
     * @param {Promise<T>} promise
     * @returns {Promise<T>}
     */
    captureTask(taskName, promise) {
        this.pendingPromises[taskName] = promise.finally(() => {
            delete this.pendingPromises[taskName];
        });

        return this.pendingPromises[taskName];
    }

    /**
     * @private
     * Adds a key to the top of the recently accessed keys
     * @param {string} key
     */
    addToAccessedKeys(key) {
        // Removing and re-adding a key ensures it's at the end of the list
        this.recentKeys.delete(key);
        this.recentKeys.add(key);
    }

    /**
     * Remove keys that don't fall into the range of recently used keys
     */
    removeLeastRecentlyUsedKeys() {
        if (this.recentKeys.size <= this.maxRecentKeysSize) {
            return;
        }

        // Get the last N keys by doing a negative slice
        const recentlyAccessed = [...this.recentKeys].slice(-this.maxRecentKeysSize);
        const storageKeys = _.keys(this.storageMap);
        const keysToRemove = _.difference(storageKeys, recentlyAccessed);

        _.each(keysToRemove, this.drop);
    }

    /**
     * Set the recent keys list size
     * @param {number} limit
     */
    setRecentKeysLimit(limit) {
        this.maxRecentKeysSize = limit;
    }

    /**
     * @param {String} key
     * @param {*} value
     * @returns {Boolean}
     */
    hasValueChanged(key, value) {
        return !deepEqual(this.storageMap[key], value);
    }
}

const instance = new OnyxCache();

export default instance;
