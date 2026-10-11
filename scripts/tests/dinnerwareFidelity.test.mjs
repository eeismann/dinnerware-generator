import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ITEM_TYPES, StateManager, parameterResolver, stateManager } from '../state/projectState.js';
import {
    buildItemCrossSection,
    calculateGeometryValues,
    generateItemExportMesh,
    generateItemMesh
} from '../geometry/meshGenerator.js';
import { measureOverhangs, PROFILE_TOLERANCE } from '../geometry/profileBuilder.js';
import { validateGeometryForPrint } from '../geometry/meshQuality.js';
import { warningSystem } from '../utils/validation.js';
import { exportToBinarySTL } from '../geometry/stlExporter.js';
import { geometryToASCIISTLString } from '../geometry/stlCore.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

function withParameters(parameters, callback) {
    const original = stateManager.state;
    try {
        stateManager.state = stateManager.getInitialState();
        Object.assign(stateManager.state.globalParameters, parameters);
        return callback();
    } finally {
        stateManager.state = original;
    }
}

function sectionFor(item) {
    const params = parameterResolver.getAllParameters(item);
    const geoVals = calculateGeometryValues(params);
    return { params, geoVals, section: buildItemCrossSection(params, geoVals) };
}

function signedVolume(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let volume = 0;
    for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i));
        b.fromBufferAttribute(position, index.getX(i + 1));
        c.fromBufferAttribute(position, index.getX(i + 2));
        volume += a.dot(b.clone().cross(c)) / 6;
    }
    return volume;
}

function distanceToPolyline(p, points) {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const d = points[i + 1].clone().sub(a);
        const s = THREE.MathUtils.clamp(p.clone().sub(a).dot(d) / Math.max(d.lengthSq(), 1e-18), 0, 1);
        best = Math.min(best, a.clone().add(d.multiplyScalar(s)).distanceTo(p));
    }
    return best;
}

function innerSurface(section) {
    return section.chains.filter(chain => chain.id.startsWith('inner-')).flatMap(chain => chain.points);
}

function outerBody(section) {
    return section.chains
        .filter(chain => chain.id === 'outer-wall' || chain.id === 'outer-fillet')
        .flatMap(chain => chain.points);
}

// Variants exercising every branch of the cross-section builder
const VARIANTS = [
    ['defaults', {}],
    ['curved wall + fillet', { wallCurveAmount: 12, bottomCornerRadius: 10 }],
    ['concave wall + small fillet', { wallCurveAmount: -15, bottomCornerRadius: 2 }],
    ['no footring', { footringOriginHeight: 0 }],
    ['no footring + fillet', { footringOriginHeight: 0, bottomCornerRadius: 10 }],
    ['solid base', { footCavityDepth: 0 }],
    ['half cavity', { footCavityDepth: 50 }],
    ['stepped inset', { wallInsetEnabled: true }],
    ['deep inset + fillet', { wallInsetEnabled: true, wallInsetDepth: 20, bottomCornerRadius: 8 }],
    ['inward wall', { wallAngle: -20 }],
    ['steep rim-anchored wall', { wallAngle: 40, positiveWallAngleAnchor: 'rim' }],
    ['rounded rim', { rimStyle: 'rounded' }],
    ['tapered rim', { rimStyle: 'tapered', wallCurveAmount: 8 }],
    ['thick wall', { wallThickness: 6, bottomCornerRadius: 4 }],
    ['knurl on inset', { wallPatternType: 'knurl', wallInsetEnabled: true, wallPatternInsetRegion: 'upper' }],
    ['recessed vertical + footring pattern', {
        wallPatternType: 'vertical', wallPatternRelief: 'recessed',
        footringPatternType: 'diagonal', bottomCornerRadius: 5
    }]
];

for (const [name, parameters] of VARIANTS) {
    test(`${name}: every item is closed, consistently wound and faces outward`, () => {
        withParameters(parameters, () => {
            for (const item of ITEM_TYPES) {
                const geometry = generateItemMesh(item);
                try {
                    const result = validateGeometryForPrint(geometry, { enforceOrientationConsistency: true });
                    assert.equal(result.valid, true, `${item}: ${result.errors.join('; ')}`);
                    assert.equal(result.orientationConflictEdges, 0, `${item} orientation conflicts`);
                    assert.ok(signedVolume(geometry) > 0, `${item} must enclose positive volume (outward normals)`);

                    geometry.computeBoundingBox();
                    assert.ok(Math.abs(geometry.boundingBox.min.y) < 1e-4,
                        `${item} must rest at y=0, lowest point is ${geometry.boundingBox.min.y}`);
                } finally {
                    geometry.dispose();
                }
            }
        });
    });
}

test('export meshes are consistently wound at 512 sides', () => {
    withParameters({ bottomCornerRadius: 6, wallInsetEnabled: true, rimStyle: 'rounded' }, () => {
        for (const item of ITEM_TYPES) {
            const geometry = generateItemExportMesh(item);
            const result = validateGeometryForPrint(geometry, { enforceOrientationConsistency: true });
            assert.equal(result.valid, true, `${item}: ${result.errors.join('; ')}`);
            assert.ok(signedVolume(geometry) > 0);
            geometry.dispose();
        }
    });
});

test('pieces rest on the foot ring, and the default cavity leaves a floor one wall thick', () => {
    withParameters({}, () => {
        for (const item of ITEM_TYPES) {
            const { geoVals, section } = sectionFor(item);
            const ceiling = section.chains.find(chain => chain.id === 'cavity-ceiling');
            assert.ok(ceiling, `${item} has a foot cavity`);
            const floorY = innerSurface(section).at(-1).y;
            assert.ok(Math.abs(floorY - ceiling.points[0].y - geoVals.thickness) < 1e-9,
                `${item} floor thickness ${floorY - ceiling.points[0].y}`);
            // Nothing but the contact ring touches the bed
            const contact = section.chains.find(chain => chain.id === 'contact-ring');
            for (const chain of section.chains) {
                for (const p of chain.points) {
                    assert.ok(p.y >= -1e-12, `${item} ${chain.id} dips below the bed`);
                    if (p.y < 1e-9) {
                        assert.ok(p.x >= contact.points[0].x - 1e-9, `${item} ${chain.id} touches the bed inside the ring`);
                    }
                }
            }
        }
    });
});

test('a 0% cavity gives a flat solid underside and 50% halves the cavity', () => {
    withParameters({ footCavityDepth: 0 }, () => {
        const { section } = sectionFor('plate');
        assert.equal(section.cavityDepth, 0);
        assert.equal(section.chains.find(chain => chain.id === 'cavity-ceiling'), undefined);
    });
    withParameters({ footCavityDepth: 50 }, () => {
        const { geoVals, section } = sectionFor('plate');
        assert.ok(Math.abs(section.cavityDepth - geoVals.footringHeight / 2) < 1e-9);
    });
});

test('hollowing the foot removes the solid slab under the floor', () => {
    const volumeOf = (parameters) => withParameters(parameters, () => {
        const geometry = generateItemMesh('plate');
        const volume = signedVolume(geometry);
        geometry.dispose();
        return volume;
    });
    const solid = volumeOf({ footCavityDepth: 0 });
    const hollow = volumeOf({});
    // 8mm of a ~250mm disc is far more than a third of the plate's material
    assert.ok(hollow < solid * 0.6, `hollow ${hollow.toFixed(0)} vs solid ${solid.toFixed(0)} mm³`);
});

for (const [name, parameters] of [
    ['straight 15° wall', {}],
    ['steep 40° wall', { wallAngle: 40, positiveWallAngleAnchor: 'rim' }],
    ['curved wall with fillet', { wallCurveAmount: 25, bottomCornerRadius: 12 }],
    ['concave wall', { wallCurveAmount: -8 }],
    ['inward wall', { wallAngle: -25 }],
    ['inset step', { wallInsetEnabled: true, wallInsetDepth: 15 }],
    ['inset with fillet', { wallInsetEnabled: true, wallInsetDepth: 20, bottomCornerRadius: 8 }]
]) {
    test(`${name}: wall thickness is measured perpendicular to the surface`, () => {
        withParameters(parameters, () => {
            for (const item of ITEM_TYPES) {
                const { geoVals, section } = sectionFor(item);
                const inner = innerSurface(section);
                const t = geoVals.thickness;
                const distances = [];
                const body = outerBody(section);
                for (let i = 0; i < body.length - 1; i++) {
                    const steps = Math.ceil(body[i].distanceTo(body[i + 1]) / 0.25);
                    for (let k = 0; k < steps; k++) {
                        const p = body[i].clone().lerp(body[i + 1], k / steps);
                        if (p.y > geoVals.h - t) continue; // rim corner
                        distances.push(distanceToPolyline(p, inner));
                    }
                }
                distances.sort((a, b) => a - b);
                const thinnest = distances[0];
                const median = distances[distances.length >> 1];
                assert.ok(thinnest > t * 0.97, `${item}: thinnest wall ${thinnest.toFixed(3)}mm for ${t}mm`);
                assert.ok(Math.abs(median - t) < t * 0.03, `${item}: typical wall ${median.toFixed(3)}mm should be ~${t}mm`);
            }
        });
    });
}

test('the stepped inset joins the walls through a printable 45° chamfer', () => {
    withParameters({ wallInsetEnabled: true }, () => {
        for (const item of ITEM_TYPES) {
            const { section } = sectionFor(item);
            const inset = section.inset;
            assert.ok(inset, `${item} has an inset`);
            const steep = measureOverhangs(section).filter(o => o.chain === 'outer-wall' && o.angleDeg > 45.5);
            if (item === 'plate' || item === 'saucer') {
                // A wide, shallow item's step (8% of a 140mm radius) is
                // taller than its short wall allows at 45°; the chamfer
                // steepens only as much as needed and is flagged.
                assert.ok(inset.chamferAngleDeg > 45 && inset.chamferAngleDeg < 52);
                warningSystem.includeSupportWarnings = true;
                assert.ok(warningSystem.validate().some(w => w.itemType === item && w.type === 'overhang'
                    && w.parameter === 'wallInsetDepth'), `${item} inset overhang is flagged`);
                warningSystem.includeSupportWarnings = false;
                continue;
            }
            assert.ok(Math.abs(inset.chamferAngleDeg - 45) < 0.5, `${item} chamfer ${inset.chamferAngleDeg}`);
            assert.deepEqual(steep, [], `${item} inset overhang`);
        }
    });
});

test('inner and outer bottom fillets are concentric and tangent to the wall', () => {
    withParameters({ bottomCornerRadius: 10, wallThickness: 2.5 }, () => {
        for (const item of ['plate', 'soup_bowl', 'mug']) {
            const { geoVals, section } = sectionFor(item);
            const fillet = geoVals.fillet;
            assert.ok(fillet, `${item} fillet`);
            // Outer fillet ends exactly where the wall begins, along the same tangent
            const outer = section.chains.find(chain => chain.id === 'outer-fillet').points;
            const wall = section.chains.find(chain => chain.id === 'outer-wall').points;
            const radial = outer.at(-1).clone().sub(fillet.center);
            const filletTangent = new THREE.Vector2(-radial.y, radial.x).normalize();
            const wallTangent = wall[1].clone().sub(wall[0]).normalize();
            assert.ok(filletTangent.dot(wallTangent) > Math.cos(THREE.MathUtils.degToRad(2)),
                `${item}: crease between fillet and wall`);

            // Every inner point near the corner lies on the concentric arc
            const innerArc = innerSurface(section).filter(p =>
                p.y > geoVals.footringHeight + geoVals.thickness + 0.2
                && p.y < fillet.center.y - 0.2 && p.x < fillet.center.x + fillet.radius);
            assert.ok(innerArc.length >= 4, `${item}: inner fillet samples`);
            for (const p of innerArc) {
                const r = p.distanceTo(fillet.center);
                assert.ok(Math.abs(r - (fillet.radius - geoVals.thickness)) < 0.02,
                    `${item}: inner fillet radius ${r} should be ${fillet.radius - geoVals.thickness}`);
            }
        }
    });
});

test('curved walls are sampled to the chord tolerance', () => {
    withParameters({ wallCurveAmount: 30, wallCurvePosition: 0.3 }, () => {
        const { geoVals } = sectionFor('serving_bowl');
        const pts = geoVals.wallPoints;
        const p0 = pts[0];
        const p2 = pts.at(-1);
        const control = new THREE.Vector2(
            p0.x + (p2.x - p0.x) * 0.3 + 30,
            p0.y + (p2.y - p0.y) * 0.3
        );
        const exact = [];
        for (let i = 0; i <= 20000; i++) {
            const t = i / 20000;
            const u = 1 - t;
            exact.push(new THREE.Vector2(
                u * u * p0.x + 2 * u * t * control.x + t * t * p2.x,
                u * u * p0.y + 2 * u * t * control.y + t * t * p2.y
            ));
        }
        let worst = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const mid = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
            worst = Math.max(worst, distanceToPolyline(mid, exact));
        }
        assert.ok(worst <= PROFILE_TOLERANCE * 1.2, `worst chord deviation ${worst}`);
    });
});

test('rounded rims crown at the authored height with a full bullnose', () => {
    withParameters({ rimStyle: 'rounded' }, () => {
        for (const item of ITEM_TYPES) {
            const { geoVals, section } = sectionFor(item);
            const rim = section.chains.find(chain => chain.id === 'rim').points;
            const top = Math.max(...rim.map(p => p.y));
            assert.ok(Math.abs(top - geoVals.h) < 0.05, `${item} crown ${top} vs ${geoVals.h}`);
            assert.ok(rim.length > 8, `${item} rim is curved`);
        }
    });
});

test('tapered rims thin the lip and keep full thickness lower down', () => {
    withParameters({ rimStyle: 'tapered' }, () => {
        const { geoVals, section } = sectionFor('mug');
        const inner = innerSurface(section);
        const wall = section.chains.find(chain => chain.id === 'outer-wall').points;
        const nearTop = wall.at(-1);
        const y = geoVals.footringHeight + 20;
        const i = wall.findIndex(p => p.y > y);
        const lower = wall[i - 1].clone().lerp(wall[i], (y - wall[i - 1].y) / (wall[i].y - wall[i - 1].y));
        assert.ok(distanceToPolyline(nearTop, inner) < geoVals.thickness * 0.75);
        assert.ok(Math.abs(distanceToPolyline(lower, inner) - geoVals.thickness) < 0.05);
    });
});

test('overhang measurement reports the true profile angle', () => {
    withParameters({ wallAngle: -30 }, () => {
        const { section } = sectionFor('tumbler');
        const worst = Math.max(...measureOverhangs(section).map(o => o.angleDeg));
        assert.ok(Math.abs(worst - 30) < 0.5, `inward wall overhang ${worst}`);
    });
});

test('legacy base recess values migrate to foot cavity percentages', () => {
    const state = new StateManager();
    state.scheduleAutoSave = () => {};
    const legacy = state.exportState();
    delete legacy.globalParameters.footCavityDepth;
    legacy.globalParameters.baseRecessDepth = 1;
    legacy.itemOverrides = {
        mug: { baseRecessDepth: -4 },
        plate: { baseRecessDepth: 0 },
        tumbler: { baseRecessDepth: -2, footringOriginHeight: 4 }
    };
    state.importState(JSON.parse(JSON.stringify(legacy)));
    assert.equal(state.state.globalParameters.footCavityDepth, 100);
    assert.equal('baseRecessDepth' in state.state.globalParameters, false);
    assert.deepEqual(state.state.itemOverrides.mug, { footCavityDepth: 50 });
    assert.deepEqual(state.state.itemOverrides.plate, { footCavityDepth: 0 });
    assert.deepEqual(state.state.itemOverrides.tumbler, { footCavityDepth: 50, footringOriginHeight: 4 });

    legacy.globalParameters.baseRecessDepth = -2;
    state.importState(JSON.parse(JSON.stringify(legacy)));
    assert.equal(state.state.globalParameters.footCavityDepth, 25);
});

test('Z-up STL exports stand upright for slicers and Cast Form restores Y-up', () => {
    withParameters({}, () => {
        const geometry = generateItemMesh('mug');
        geometry.computeBoundingBox();
        const source = geometry.boundingBox.clone();

        const zUp = exportToBinarySTL(geometry, 'mug', { upAxis: 'z' });
        const parsed = new STLLoader().parse(zUp);
        parsed.computeBoundingBox();
        assert.ok(Math.abs(parsed.boundingBox.min.z - source.min.y) < 1e-4);
        assert.ok(Math.abs(parsed.boundingBox.max.z - source.max.y) < 1e-4);
        assert.ok(Math.abs(parsed.boundingBox.max.y - source.max.z) < 1e-4);
        assert.ok(signedVolume(parsed.index ? parsed : indexed(parsed)) > 0, 'rotation keeps outward winding');

        assert.equal(InputProcessor.isTaggedZUp(zUp), true);
        assert.equal(InputProcessor.isTaggedZUp(exportToBinarySTL(geometry, 'mug')), false);
        const ascii = new TextEncoder().encode(geometryToASCIISTLString(geometry, { upAxis: 'z', solidName: 'mug' })).buffer;
        assert.equal(InputProcessor.isTaggedZUp(ascii), true);

        parsed.rotateX(-Math.PI / 2);
        parsed.computeBoundingBox();
        for (const axis of ['x', 'y', 'z']) {
            assert.ok(Math.abs(parsed.boundingBox.min[axis] - source.min[axis]) < 1e-4, axis);
            assert.ok(Math.abs(parsed.boundingBox.max[axis] - source.max[axis]) < 1e-4, axis);
        }
        geometry.dispose();
    });
});

function indexed(geometry) {
    const count = geometry.getAttribute('position').count;
    geometry.setIndex(Array.from({ length: count }, (_, i) => i));
    return geometry;
}

test('support warnings are off by default and never mention supports', () => {
    withParameters({ bottomCornerRadius: 12, wallInsetEnabled: true, wallAngle: 40 }, () => {
        const messages = warningSystem.validate().map(w => w.message);
        assert.deepEqual(messages.filter(m => /support/i.test(m)), []);
    });
});

test('fillet overhangs above the footring are flagged only when the ledge is wide', () => {
    const filletWarnings = (radius) => withParameters({ bottomCornerRadius: radius }, () => {
        warningSystem.includeSupportWarnings = true;
        try {
            return warningSystem.validate().filter(w => w.type === 'overhang' && w.parameter === 'bottomCornerRadius');
        } finally {
            warningSystem.includeSupportWarnings = false;
        }
    });
    assert.equal(filletWarnings(3).length, 0, 'a 3mm fillet ledge prints unsupported');
    const wide = filletWarnings(12);
    assert.equal(wide.length, 7, 'a 12mm fillet ledge is flagged on every item');
    assert.ok(wide.every(w => w.value > 80));
});
