/**
 * Stacked Cylinder Mold - sources
 *
 * Every source becomes the same stored record: the ware's outer profile and
 * base underside at ware size (profileExtractor.js), never a mesh.
 *   sample      the concept forms (control points)
 *   dinnerware  a Dinnerware item rebuilt from its saved state, sampled radially
 *   vessel-v2/3 the project's own sampled profile (analytic, axis → base → lip)
 *   file        STL / OBJ, sampled radially
 */

import { SAMPLE_FORMS, getSampleForm } from '../geometry/sampleForms.js';
import { controlFormProfile, extractMeshProfile, splitVesselProfile } from '../geometry/profileExtractor.js';

const DINNERWARE_KEY = 'playground_ceramics_projects';
const VESSEL_KEYS = {
    'vessel-v2': 'playground_ceramics_vessel_v2_projects',
    'vessel-v3': 'playground_ceramics_vessel_v3_projects'
};
export const ITEM_LABELS = {
    plate: 'Plate', soup_bowl: 'Soup Bowl', pasta_bowl: 'Pasta Bowl', mug: 'Mug',
    tumbler: 'Tumbler', saucer: 'Saucer', serving_bowl: 'Serving Bowl'
};

const describe = (profile) => `H ${profile.H.toFixed(0)} · Ø${(2 * profile.maxRadius).toFixed(0)} mm`;

function readList(key) {
    try {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

/* ---------- listings ---------- */

export function listSamples() {
    return SAMPLE_FORMS.map(f => ({ id: f.id, name: f.name, meta: f.note }));
}

export function listDinnerware() {
    return readList(DINNERWARE_KEY)
        .filter(p => p?.state)
        .map(p => ({
            id: p.id,
            name: p.projectName || p.name || 'Untitled',
            modified: p.lastModified,
            items: (p.state.ui?.visibleItems?.length ? p.state.ui.visibleItems : Object.keys(ITEM_LABELS))
                .filter(item => ITEM_LABELS[item])
        }))
        .sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}

export function listVessels(type) {
    return readList(VESSEL_KEYS[type])
        .filter(p => Array.isArray(p?.profile?.points) && p.profile.points.length > 1)
        .map(p => ({
            id: p.id || p.project?.id,
            name: p.project?.name || p.name || 'Untitled vessel',
            modified: p.project?.lastModified || p.lastModified,
            note: [p.spout?.enabled ? 'spout ignored' : '', p.profile.points.some(pt => pt?.motif && pt.motif.type && pt.motif.type !== 'none') ? 'motifs ignored' : '']
                .filter(Boolean).join(' · ')
        }))
        .sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}

/* ---------- loaders ---------- */

export function loadSample(id) {
    const form = getSampleForm(id);
    if (!form) throw new Error('Unknown sample form.');
    const profile = controlFormProfile(form.pts);
    return { type: 'sample', label: form.name, meta: `Concept form · ${describe(profile)}`, ref: { formId: id }, profile };
}

function meshProfile(geometry) {
    const pos = geometry.getAttribute('position').array;
    const index = geometry.getIndex()?.array || null;
    return extractMeshProfile(pos, { index });
}

export async function loadDinnerware(projectId, item) {
    const project = readList(DINNERWARE_KEY).find(p => p.id === projectId);
    if (!project?.state) throw new Error('That Dinnerware project is no longer saved.');
    const { buildDinnerwareItemForCastForm } = await import('../../castForm/geometry/dinnerwareImport.js');
    const built = buildDinnerwareItemForCastForm(project.state, item);
    if (!built.geometry) throw new Error(built.errors?.[0] || 'Could not rebuild that item.');
    const profile = meshProfile(built.geometry);
    built.geometry.dispose();
    const name = project.projectName || project.name || 'Dinnerware';
    return {
        type: 'dinnerware', label: `${name} · ${ITEM_LABELS[item] || item}`,
        meta: `Dinnerware item · ${describe(profile)}`, ref: { projectId, item }, profile
    };
}

export async function loadVessel(type, projectId) {
    const project = readList(VESSEL_KEYS[type]).find(p => (p.id || p.project?.id) === projectId);
    if (!project) throw new Error('That vessel project is no longer saved.');
    const [{ VesselMeshGenerator }, sampler] = await Promise.all([
        import('../../vessel/geometry/vesselMeshGenerator.js'),
        type === 'vessel-v3' ? import('../../vesselV3/geometry/profileSampler.js') : import('../../vesselV2/geometry/profileSampler.js')
    ]);
    const sample = type === 'vessel-v3' ? sampler.sampleVesselV3Profile : sampler.sampleVesselV2Profile;
    const result = sample(project);
    if (!result.validation.valid) throw new Error(`Fix the vessel profile first: ${result.validation.errors.join(' ')}`);
    const samples = VesselMeshGenerator.prototype.sanitizeProfile(result.profile);
    const profile = splitVesselProfile(samples);
    const name = project.project?.name || project.name || 'Vessel';
    const ignored = [project.spout?.enabled ? 'spout' : '', project.profile.points.some(pt => pt?.motif?.type && pt.motif.type !== 'none') ? 'motifs' : '']
        .filter(Boolean);
    return {
        type, label: name,
        meta: `${type === 'vessel-v3' ? 'Vessel V3' : 'Bezier Vessel'} · ${describe(profile)}${ignored.length ? ` · ${ignored.join(', ')} ignored` : ''}`,
        ref: { projectId }, profile
    };
}

export async function loadFile(file) {
    const { InputProcessor } = await import('../../castForm/geometry/inputProcessor.js');
    const { geometry, errors } = await InputProcessor.loadFromFile(file);
    if (!geometry) throw new Error(errors?.[0] || 'Could not read that file.');
    const profile = meshProfile(geometry);
    geometry.dispose();
    return {
        type: 'file', label: file.name.replace(/\.(stl|obj)$/i, ''),
        meta: `${file.name.split('.').pop().toUpperCase()} file · ${describe(profile)}${profile.asymmetry > 0.75 ? ` · ${profile.asymmetry.toFixed(1)} mm out of round` : ''}`,
        ref: { fileName: file.name }, profile
    };
}
