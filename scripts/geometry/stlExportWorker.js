/**
 * STL Export Worker
 * Builds, validates and serializes dinnerware export meshes off the main
 * thread so the page stays responsive while dense patterned sets export.
 */

import { stateManager } from '../state/projectState.js';
import { buildItemSTL, measureItemSTL } from './stlExporter.js';

self.onmessage = ({ data }) => {
    const { id, type, state, itemType, filename, upAxis } = data;
    try {
        // Seed the resolver with the page's state; no setState, so no autosave
        stateManager.state = state;
        if (type === 'measure') {
            self.postMessage({ id, result: measureItemSTL(itemType) });
            return;
        }
        const buffer = buildItemSTL(itemType, filename, { upAxis });
        self.postMessage({ id, result: buffer }, [buffer]);
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
