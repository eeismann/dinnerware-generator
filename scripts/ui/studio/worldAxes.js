// Shared world-axis helper for rotatable Three.js scenes.
// Callers pass their existing THREE namespace so the Studio Shell does not
// pull a second copy of Three.js into its lazy-loaded UI bundle.

const AXES = [
    { key: 'x', color: '#E35D54', vector: [1, 0, 0] },
    { key: 'y', color: '#4DB576', vector: [0, 0, 1] },
    { key: 'z', color: '#4D8DFF', vector: [0, 1, 0] }
];

export function createWorldAxes(THREE, scene, size = 600) {
    if (!THREE || !scene) return null;

    const existing = scene.getObjectByName('studio-world-axes');
    if (existing) return { group: existing, owned: false, dispose() {} };

    const group = new THREE.Group();
    group.name = 'studio-world-axes';
    group.renderOrder = -100;

    const extent = Math.max(80, size / 2);
    const origin = new THREE.Vector3(0, 0, 0);
    const gridExtent = extent * 1.35;
    const gridStep = Math.max(20, Math.round((gridExtent / 8) / 10) * 10);

    function material(color, opacity) {
        return new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
            depthTest: true,
            toneMapped: false
        });
    }

    function addLine(name, points, lineMaterial) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        line.name = name;
        line.renderOrder = -100;
        group.add(line);
        return line;
    }

    function addGrid() {
        const minorPoints = [];
        const majorPoints = [];
        const max = Math.ceil(gridExtent / gridStep) * gridStep;

        for (let v = -max; v <= max; v += gridStep) {
            const bucket = Math.abs(v) < 0.001 || Math.round(Math.abs(v / gridStep)) % 4 === 0
                ? majorPoints
                : minorPoints;
            bucket.push(
                new THREE.Vector3(-max, 0, v),
                new THREE.Vector3(max, 0, v),
                new THREE.Vector3(v, 0, -max),
                new THREE.Vector3(v, 0, max)
            );
        }

        const minorGeometry = new THREE.BufferGeometry().setFromPoints(minorPoints);
        const majorGeometry = new THREE.BufferGeometry().setFromPoints(majorPoints);
        const minor = new THREE.LineSegments(minorGeometry, material('#AEB4BE', 0.12));
        const major = new THREE.LineSegments(majorGeometry, material('#9BA2AD', 0.2));
        minor.name = 'studio-world-axes-grid-minor';
        major.name = 'studio-world-axes-grid-major';
        minor.renderOrder = -120;
        major.renderOrder = -119;
        group.add(minor, major);
    }

    addGrid();

    AXES.forEach((axis) => {
        const direction = new THREE.Vector3(...axis.vector);
        const glowMaterial = material(axis.color, axis.key === 'z' ? 0.18 : 0.12);
        const positiveMaterial = material(axis.color, axis.key === 'z' ? 0.72 : 0.58);
        const negativeMaterial = material(axis.color, 0.22);

        const positiveEnd = direction.clone().multiplyScalar(extent);
        const negativeEnd = direction.clone().multiplyScalar(-extent);
        const glowStart = direction.clone().multiplyScalar(-extent * 0.12);
        const glowEnd = direction.clone().multiplyScalar(extent * 1.08);

        addLine(`studio-world-axes-${axis.key}-glow`, [glowStart, glowEnd], glowMaterial);
        addLine(`studio-world-axes-${axis.key}-positive`, [origin, positiveEnd], positiveMaterial);
        addLine(`studio-world-axes-${axis.key}-negative`, [origin, negativeEnd], negativeMaterial);
    });

    scene.add(group);

    return {
        group,
        owned: true,
        dispose() {
            scene.remove(group);
            group.traverse((child) => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
        }
    };
}
