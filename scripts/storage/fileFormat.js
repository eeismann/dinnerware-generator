/**
 * ProjectFileFormat - Handles enhanced JSON file format for Playground Ceramics projects
 *
 * Format Structure:
 * {
 *   fileFormat: { type, version, appType, created, modified },
 *   project: { id, name, description, tags },
 *   state: { ... app-specific state ... },
 *   metadata: { itemCount, thumbnailDataUrl, ... }
 * }
 */

export class ProjectFileFormat {
    static VERSION = '1.0.0';
    static TYPE = 'playground-ceramics-project';
    static MIME_TYPE = 'application/json';

    /**
     * Serialize project data to enhanced JSON format
     * @param {Object} project - Project data from localStorage
     * @param {string} appType - 'dinnerware', 'handle', 'vessel', or 'castform'
     * @returns {Object} Enhanced JSON structure
     */
    static serialize(project, appType) {
        const now = new Date().toISOString();

        return {
            fileFormat: {
                type: this.TYPE,
                version: this.VERSION,
                appType: appType,
                created: project.dateCreated || project.project?.dateCreated || now,
                modified: now
            },
            project: {
                id: project.id || project.project?.id,
                name: project.projectName || project.project?.name || 'Untitled Project',
                description: project.description || '',
                tags: project.tags || []
            },
            state: project.state || project,
            metadata: {
                itemCount: this._getItemCount(project, appType),
                thumbnailDataUrl: project.thumbnail || null
            }
        };
    }

    /**
     * Deserialize JSON file content to project data
     * @param {string|Object} fileContent - JSON string or parsed object
     * @returns {Object} Project data ready for use
     */
    static deserialize(fileContent) {
        const data = typeof fileContent === 'string'
            ? JSON.parse(fileContent)
            : fileContent;

        // Validate
        const errors = this.validate(data);
        if (errors.length > 0) {
            throw new Error(`Invalid file format: ${errors.join(', ')}`);
        }

        return {
            fileFormat: data.fileFormat,
            project: data.project,
            state: data.state,
            metadata: data.metadata
        };
    }

    /**
     * Migrate legacy JSON format to enhanced format
     * @param {Object} legacyData - Old format project data
     * @returns {Object} Enhanced format project data
     */
    static migrateFromLegacy(legacyData) {
        // Detect app type from data structure
        const appType = this._detectAppType(legacyData);

        // Create enhanced structure
        const now = new Date().toISOString();

        return {
            fileFormat: {
                type: this.TYPE,
                version: this.VERSION,
                appType: appType,
                created: legacyData.dateCreated || legacyData.project?.dateCreated || now,
                modified: now
            },
            project: {
                id: legacyData.id || legacyData.project?.id,
                name: legacyData.projectName || legacyData.project?.name || 'Imported Project',
                description: '',
                tags: []
            },
            state: legacyData.state || legacyData,
            metadata: {
                itemCount: this._getItemCount(legacyData, appType),
                thumbnailDataUrl: legacyData.thumbnail || null
            }
        };
    }

    /**
     * Generate descriptive filename for project
     * @param {string} projectName - Name of the project
     * @param {string} appType - Type of app
     * @param {Date|string} timestamp - Optional timestamp (defaults to now)
     * @returns {string} Filename like "Project-Name_dinnerware_2026-01-04.json"
     */
    static generateFilename(projectName, appType, timestamp = new Date()) {
        // Sanitize project name
        const sanitized = projectName
            .trim()
            .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
            .replace(/\s+/g, '-')             // Spaces to hyphens
            .substring(0, 50);                // Limit length

        // Format timestamp
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

        return `${sanitized}_${appType}_${dateStr}.json`;
    }

    /**
     * Validate project file format
     * @param {Object} data - Parsed JSON data
     * @returns {Array<string>} Array of error messages (empty if valid)
     */
    static validate(data) {
        const errors = [];

        // Check for enhanced format
        if (data.fileFormat?.type === this.TYPE) {
            // Enhanced format validation
            if (!data.fileFormat.version) {
                errors.push('Missing fileFormat.version');
            }
            if (!data.fileFormat.appType) {
                errors.push('Missing fileFormat.appType');
            }
            if (!data.project) {
                errors.push('Missing project object');
            }
            if (!data.state) {
                errors.push('Missing state object');
            }
        } else {
            // Legacy format validation
            // Must have at least a state or project structure
            if (!data.state && !data.globalParameters && !data.version && !data.project) {
                errors.push('Unrecognized file format');
            }
        }

        return errors;
    }

    /**
     * Detect if file is enhanced format or legacy
     * @param {Object} data - Parsed JSON data
     * @returns {string} 'enhanced' or 'legacy'
     */
    static detectFormat(data) {
        if (data.fileFormat?.type === this.TYPE) {
            return 'enhanced';
        }
        return 'legacy';
    }

    /**
     * Detect app type from project data structure
     * @private
     */
    static _detectAppType(data) {
        // Enhanced format has explicit appType
        if (data.fileFormat?.appType) {
            return data.fileFormat.appType;
        }

        // Detect from state structure
        const state = data.state || data;

        // Dinnerware: has globalParameters, itemRatios, itemMultipliers
        if (state.globalParameters && state.itemRatios && state.itemMultipliers) {
            return 'dinnerware';
        }

        // Vessel: has sections array and version
        if (state.sections && Array.isArray(state.sections) && state.version) {
            return 'vessel';
        }

        // Handle: has handleParams or mugData
        if (state.handleParams || state.mugData) {
            return 'handle';
        }

        // Cast form: has params with shrinkage or mold settings
        if (state.params?.shrinkage || state.params?.mold) {
            return 'castform';
        }

        // Default fallback
        return 'dinnerware';
    }

    /**
     * Get item count from project data
     * @private
     */
    static _getItemCount(data, appType) {
        const state = data.state || data;

        if (appType === 'dinnerware') {
            if (state.ui?.visibleItems) {
                return state.ui.visibleItems.length;
            }
            // Count from itemRatios if available
            if (state.itemRatios) {
                return Object.keys(state.itemRatios).length;
            }
        }

        if (appType === 'vessel') {
            if (state.sections) {
                return state.sections.length;
            }
        }

        return 0;
    }
}

// Export for use in modules
export default ProjectFileFormat;
