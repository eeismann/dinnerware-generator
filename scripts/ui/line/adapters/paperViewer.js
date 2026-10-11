/**
 * Shaded viewer on paper: keep each app's original lighting and materials,
 * swapping only the canvas background for the Line paper colour.
 */
import * as THREE from 'three';

export function paperViewer(getRig) {
    return (colors) => {
        const rig = getRig();
        if (!rig?.scene) return;
        rig.scene.background = new THREE.Color(colors.paper);
        // Hairline grid in the ink colour
        rig.scene.traverse(object => {
            if (object.type !== 'GridHelper') return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(material => {
                material.color?.set(colors.ink);
                material.vertexColors = false;
                material.transparent = true;
                material.opacity = 0.14;
                material.needsUpdate = true;
            });
        });
        rig.requestRender?.();
    };
}
