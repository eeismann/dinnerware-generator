// Each saved project owns its draft. The legacy current-project slot remains
// readable for older app versions, but is never the only copy of saved work.
export const CURRENT_DRAFT_KEY = 'dinnerware_current_project';
export const EDITING_PROJECT_KEY = 'dinnerware_editing_project_id';
const DRAFT_PREFIX = 'dinnerware_draft:';
const draftKey = id => `${DRAFT_PREFIX}${id || 'unsaved'}`;
const timestamp = value => Date.parse(value || '') || 0;
export const newDinnerwareDraftId = () => `draft_${crypto.randomUUID()}`;

function readDraft(key, storage) {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.state || typeof draft.state !== 'object') {
        throw new Error('The saved draft is unreadable. Export a backup before replacing it.');
    }
    return draft;
}

export function preserveLegacyDraft(storage = localStorage) {
    const legacy = readDraft(CURRENT_DRAFT_KEY, storage);
    if (!legacy) return;
    // Older drafts had no identity; migrate before changing the editing ID.
    const id = Object.hasOwn(legacy, 'projectId')
        ? legacy.projectId
        : legacy.state.project?.id ?? storage.getItem(EDITING_PROJECT_KEY);
    const existing = readDraft(draftKey(id), storage);
    if (!existing || timestamp(legacy.timestamp) > timestamp(existing.timestamp)) {
        storage.setItem(draftKey(id), JSON.stringify({ ...legacy, projectId: id || null }));
    }
}

export function selectDinnerwareState(savedProject, projectId, storage = localStorage) {
    preserveLegacyDraft(storage);
    const draft = readDraft(draftKey(projectId), storage);
    const savedTime = timestamp(savedProject?.lastModified || savedProject?.state?.project?.lastModified);
    if (draft && (!savedProject || timestamp(draft.timestamp) >= savedTime)) {
        return draft.state;
    }
    return savedProject?.state || null;
}

export function saveDinnerwareDraft(state, storage = localStorage) {
    const id = state.project && Object.hasOwn(state.project, 'id')
        ? state.project.id : storage.getItem(EDITING_PROJECT_KEY) || null;
    const draft = JSON.stringify({ projectId: id, state, timestamp: new Date().toISOString() });
    storage.setItem(draftKey(id), draft);
    storage.setItem(CURRENT_DRAFT_KEY, draft);
}

export function startDinnerwareProject(projectId, storage = localStorage) {
    preserveLegacyDraft(storage);
    // Give legacy anonymous work a recoverable identity before replacing it.
    const anonymous = readDraft(draftKey(null), storage);
    if (anonymous) {
        const id = newDinnerwareDraftId();
        anonymous.projectId = id;
        anonymous.state.project = { ...anonymous.state.project, id };
        storage.setItem(draftKey(id), JSON.stringify(anonymous));
        storage.removeItem(draftKey(null));
    }
    storage.removeItem(CURRENT_DRAFT_KEY);
    const id = projectId || newDinnerwareDraftId();
    storage.setItem(EDITING_PROJECT_KEY, id);
    return id;
}

export function getDinnerwareDraftProjects(storage = localStorage) {
    const drafts = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(DRAFT_PREFIX) || key === draftKey(null)) continue;
        try {
            const draft = readDraft(key, storage);
            if (!draft?.projectId) continue;
            drafts.push({ id: draft.projectId, projectName: draft.state.project?.name || 'Untitled',
                state: draft.state, dateCreated: draft.state.project?.dateCreated || draft.timestamp,
                lastModified: draft.timestamp, thumbnail: null, draftOnly: true });
        } catch (error) {
            console.warn('Could not read a recoverable draft:', error);
        }
    }
    return drafts;
}

export function removeDinnerwareDraft(projectId, storage = localStorage) {
    storage.removeItem(draftKey(projectId));
    if ((storage.getItem(EDITING_PROJECT_KEY) || null) === projectId) {
        storage.removeItem(CURRENT_DRAFT_KEY);
        storage.removeItem(EDITING_PROJECT_KEY);
    }
}

export function clearDinnerwareDrafts(storage = localStorage) {
    for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith(DRAFT_PREFIX)) storage.removeItem(key);
    }
    storage.removeItem(CURRENT_DRAFT_KEY);
    storage.removeItem(EDITING_PROJECT_KEY);
}
