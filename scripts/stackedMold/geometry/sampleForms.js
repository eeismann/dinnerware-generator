/**
 * Stacked Cylinder Mold - sample forms
 *
 * The six concept forms from stacked-cylinder-mold/concept.html (`FORMS`):
 * outer profiles at mold size as [z, r] control points (mm). They double as
 * the slicer gate's regression fixtures and as built-in sources in the app.
 */

export const SAMPLE_FORMS = [
    {
        id: 'tapered-tumbler', name: 'Tapered tumbler',
        note: 'Monotonic, flares upward. Taller than one ring unit, so it gets an even height cut.',
        pts: [[0, 31], [4, 33], [110, 40]]
    },
    {
        id: 'open-bowl', name: 'Open bowl',
        note: 'Wide flare. Shallow, but the footprint is driven by the rim radius.',
        pts: [[0, 30], [8, 40], [30, 60], [55, 74], [75, 80]]
    },
    {
        id: 'belly-jar', name: 'Belly jar',
        note: 'Cut at the belly. The body below slides down; the shoulder and neck lift up.',
        pts: [[0, 40], [18, 56], [55, 70], [95, 54], [118, 36], [150, 32]]
    },
    {
        id: 'bottle-flared-lip', name: 'Bottle, flared lip',
        note: 'The lip is wider than the neck, so the shoulder ring is trapped and becomes a split.',
        pts: [[0, 36], [22, 54], [60, 62], [110, 42], [140, 20], [158, 22], [172, 33]]
    },
    {
        id: 'hourglass-vase', name: 'Hourglass vase',
        note: 'Belly below the waist, flare above it. Both upper bands are trapped and merge into one split.',
        pts: [[0, 34], [22, 54], [48, 60], [95, 30], [150, 58]]
    },
    {
        id: 'straight-cylinder', name: 'Straight cylinder',
        note: '0° draft: no ring can release, so it becomes a split. Alternatively add 1.5° taper.',
        pts: [[0, 37], [4, 40], [100, 40]]
    }
];

export function getSampleForm(id) {
    return SAMPLE_FORMS.find(form => form.id === id) || null;
}
