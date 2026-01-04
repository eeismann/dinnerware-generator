/**
 * Cast Form Generator - Mold Generator
 * Generates 4-part mold geometry from vessel input
 * 
 * Uses outside-in raycasting for accurate profile sampling.
 */

import * as THREE from 'three';
import { PART_COLORS, BASE_MOLD_HEIGHT } from '../state/castFormDefaults.js';

export class MoldGenerator {
    constructor() {
        this.radialSegments = 64;
        // High sampling resolution for accurate profile capture
        this.heightSamples = 256;
        this.angleSamples = 256;
        // Clearance between mold interior and vessel surface (mm)
        this.vesselClearance = 0.1;
        // Fixed base mold height (mm) - creates interlocking cavity
        this.baseMoldHeight = BASE_MOLD_HEIGHT;
    }

    /**
     * Generate complete 4-part mold from input geometry as HOLLOW SHELLS
     * All mold parts are generated with the specified shell wall thickness
     * for efficient 3D printing with PLA
     * 
     * @param {THREE.BufferGeometry} inputGeometry - Scaled vessel geometry
     * @param {Object} params - Mold parameters including shell.wallThickness
     * @returns {{foot: THREE.BufferGeometry, walls: THREE.BufferGeometry[]}}
     */
    generate(inputGeometry, params) {
        const { mold, natches, shell } = params;
        
        // Get shell wall thickness (default 1.5mm if not specified)
        const shellWallThickness = shell?.wallThickness || 1.5;
        
        // Compute input bounds
        inputGeometry.computeBoundingBox();
        const bounds = inputGeometry.boundingBox;
        const height = bounds.max.y - bounds.min.y;
        
        // Sample the actual vessel profile using outside-in raycasting
        const vesselProfile = this.sampleVesselProfile(inputGeometry, bounds);
        
        // Calculate mold dimensions
        // Wall molds extend from (vessel bottom - baseMoldHeight) to (vessel top + spareHeight)
        const moldWallOffset = mold.plasterWallThickness;
        const wallHeight = height + mold.spareHeight + this.baseMoldHeight;
        
        // Generate base mold as hollow shell (fixed height, vertical sides, vessel bottom impressed on top)
        const baseMold = this.generateBaseMold(
            vesselProfile,
            bounds,
            moldWallOffset,
            inputGeometry,
            shellWallThickness  // Pass shell thickness for hollow shell generation
        );
        
        // Generate 3 wall mold shells with 15mm downward extension as hollow shells
        const wallShells = this.generateWallShellsFromProfile(
            vesselProfile,
            bounds,
            wallHeight,
            moldWallOffset,
            mold,
            natches,
            shell  // Contains wallThickness for hollow shell generation
        );
        
        return {
            foot: baseMold,
            walls: wallShells
        };
    }

    /**
     * Sample the vessel profile at multiple heights and angles using raycasting
     * Casts rays from OUTSIDE INWARD to correctly capture undercuts and foot rings
     * @param {THREE.BufferGeometry} geometry 
     * @param {THREE.Box3} bounds 
     * @returns {{radii: number[][], heights: number[]}}
     */
    sampleVesselProfile(geometry, bounds) {
        const height = bounds.max.y - bounds.min.y;
        
        // Create a temporary mesh for raycasting
        const tempMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const tempMesh = new THREE.Mesh(geometry, tempMaterial);
        const raycaster = new THREE.Raycaster();
        
        const heights = [];
        const radii = [];
        
        // Maximum possible radius - rays will start from outside this
        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 2.0;
        
        // Sample using raycasting - cast rays from OUTSIDE INWARD at each height/angle
        // This correctly captures undercuts, foot rings, and complex profiles
        for (let h = 0; h < this.heightSamples; h++) {
            const y = bounds.min.y + (height * h / (this.heightSamples - 1));
            heights.push(y);
            
            const angleRadii = [];
            
            for (let a = 0; a < this.angleSamples; a++) {
                const angle = (a / this.angleSamples) * Math.PI * 2;
                
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                
                // Ray origin far outside the vessel at this height/angle
                const origin = new THREE.Vector3(
                    maxRadius * cos,
                    y,
                    maxRadius * sin
                );
                
                // Ray direction pointing INWARD toward center
                const direction = new THREE.Vector3(-cos, 0, -sin).normalize();
                
                raycaster.set(origin, direction);
                raycaster.far = maxRadius * 2;
                
                const intersections = raycaster.intersectObject(tempMesh);
                
                if (intersections.length > 0) {
                    // First intersection from outside = outermost surface (what mold touches)
                    const point = intersections[0].point;
                    const radius = Math.sqrt(point.x * point.x + point.z * point.z);
                    angleRadii.push(radius);
                } else {
                    // No intersection - mark for interpolation
                    angleRadii.push(0);
                }
            }
            
            radii.push(angleRadii);
        }
        
        // Fill any gaps from missed rays (rare, but handles edge cases)
        this.fillProfileGaps(radii);
        
        // Cleanup
        tempMaterial.dispose();
        
        return { radii, heights };
    }
    
    /**
     * Fill gaps in the sampled profile (for rare cases where rays miss)
     * Uses simple neighbor interpolation
     * @param {number[][]} radii - 2D array of radii to fill in-place
     */
    fillProfileGaps(radii) {
        // First pass: fill angular gaps within each height band
        for (let h = 0; h < radii.length; h++) {
            const row = radii[h];
            const hasValues = row.some(r => r > 0);
            
            if (hasValues) {
                for (let a = 0; a < row.length; a++) {
                    if (row[a] === 0) {
                        // Find nearest non-zero values in both directions
                        let leftR = 0, rightR = 0;
                        let leftDist = 0, rightDist = 0;
                        
                        for (let d = 1; d < row.length / 2; d++) {
                            const leftIdx = (a - d + row.length) % row.length;
                            const rightIdx = (a + d) % row.length;
                            
                            if (leftR === 0 && row[leftIdx] > 0) {
                                leftR = row[leftIdx];
                                leftDist = d;
                            }
                            if (rightR === 0 && row[rightIdx] > 0) {
                                rightR = row[rightIdx];
                                rightDist = d;
                            }
                            if (leftR > 0 && rightR > 0) break;
                        }
                        
                        // Weighted interpolation based on distance
                        if (leftR > 0 && rightR > 0) {
                            const totalDist = leftDist + rightDist;
                            row[a] = (leftR * rightDist + rightR * leftDist) / totalDist;
                        } else {
                            row[a] = leftR || rightR;
                        }
                    }
                }
            }
        }
        
        // Second pass: fill empty height bands from neighbors
        for (let h = 0; h < radii.length; h++) {
            const isEmpty = radii[h].every(r => r === 0);
            
            if (isEmpty) {
                let aboveH = -1, belowH = -1;
                
                for (let d = 1; d < radii.length; d++) {
                    if (aboveH < 0 && h + d < radii.length && !radii[h + d].every(r => r === 0)) {
                        aboveH = h + d;
                    }
                    if (belowH < 0 && h - d >= 0 && !radii[h - d].every(r => r === 0)) {
                        belowH = h - d;
                    }
                    if (aboveH >= 0 && belowH >= 0) break;
                }
                
                if (aboveH >= 0 && belowH >= 0) {
                    const t = (h - belowH) / (aboveH - belowH);
                    for (let a = 0; a < this.angleSamples; a++) {
                        radii[h][a] = radii[belowH][a] * (1 - t) + radii[aboveH][a] * t;
                    }
                } else if (aboveH >= 0) {
                    radii[h] = [...radii[aboveH]];
                } else if (belowH >= 0) {
                    radii[h] = [...radii[belowH]];
                }
            }
        }
    }

    /**
     * Sample the vessel's bottom surface by casting rays UPWARD from below
     * This captures the actual 3D contour of the vessel bottom for the base mold
     * @param {THREE.BufferGeometry} geometry - Vessel geometry
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @returns {{heights: number[], radii: number[]}} - Y-heights and radii at each angle
     */
    sampleVesselBottomSurface(geometry, bounds) {
        const tempMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const tempMesh = new THREE.Mesh(geometry, tempMaterial);
        const raycaster = new THREE.Raycaster();
        
        const bottomHeights = [];  // Y-position of bottom surface at each angle
        const bottomRadii = [];    // Radius at each angle
        
        // Get the maximum radius from the vessel profile at the bottom
        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 1.5;
        
        // Start rays well below the vessel
        const rayStartY = bounds.min.y - 50;
        
        // Sample at multiple radial distances for each angle to capture the full bottom surface
        const radialSamples = 32;  // Number of radial samples per angle
        
        for (let a = 0; a < this.angleSamples; a++) {
            const angle = (a / this.angleSamples) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            let maxHitRadius = 0;
            let heightAtMaxRadius = bounds.min.y;
            
            // Sample at different radii along this angle
            for (let r = 0; r < radialSamples; r++) {
                const sampleRadius = (r / (radialSamples - 1)) * maxRadius;
                
                // Ray origin below the vessel at this radial position
                const origin = new THREE.Vector3(
                    sampleRadius * cos,
                    rayStartY,
                    sampleRadius * sin
                );
                
                // Ray direction pointing UPWARD
                const direction = new THREE.Vector3(0, 1, 0);
                
                raycaster.set(origin, direction);
                raycaster.far = bounds.max.y - rayStartY + 10;
                
                const intersections = raycaster.intersectObject(tempMesh);
                
                if (intersections.length > 0) {
                    // First intersection from below = bottom surface of vessel
                    const point = intersections[0].point;
                    const hitRadius = Math.sqrt(point.x * point.x + point.z * point.z);
                    
                    // Track the outermost hit for this angle
                    if (hitRadius > maxHitRadius) {
                        maxHitRadius = hitRadius;
                        heightAtMaxRadius = point.y;
                    }
                }
            }
            
            bottomRadii.push(maxHitRadius > 0 ? maxHitRadius : 0);
            bottomHeights.push(maxHitRadius > 0 ? heightAtMaxRadius : bounds.min.y);
        }
        
        // Cleanup
        tempMaterial.dispose();
        
        return { heights: bottomHeights, radii: bottomRadii };
    }

    /**
     * Sample a grid of the vessel's bottom surface for the base mold top
     * This version uses a specified maxRadius for consistent vertex placement
     * @param {THREE.BufferGeometry} geometry - Vessel geometry
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @param {number} maxRadius - Maximum radius for sampling (should match vertex placement)
     * @returns {number[][]} - 2D array of Y-heights [angleIndex][radiusIndex]
     */
    sampleVesselBottomGridWithRadius(geometry, bounds, maxRadius) {
        const tempMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const tempMesh = new THREE.Mesh(geometry, tempMaterial);
        const raycaster = new THREE.Raycaster();
        
        const rayStartY = bounds.min.y - 50;
        const radialSteps = 48;  // Higher resolution for better accuracy
        const angleSteps = this.angleSamples;
        
        // First pass: collect raw samples
        const rawHeights = [];
        
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            const radialHeights = [];
            
            for (let r = 0; r < radialSteps; r++) {
                const radiusFraction = r / (radialSteps - 1);
                const sampleRadius = radiusFraction * maxRadius;
                
                const origin = new THREE.Vector3(
                    sampleRadius * cos,
                    rayStartY,
                    sampleRadius * sin
                );
                
                const direction = new THREE.Vector3(0, 1, 0);
                raycaster.set(origin, direction);
                raycaster.far = bounds.max.y - rayStartY + 10;
                
                const intersections = raycaster.intersectObject(tempMesh);
                
                if (intersections.length > 0) {
                    radialHeights.push(intersections[0].point.y);
                } else {
                    radialHeights.push(null);
                }
            }
            
            rawHeights.push(radialHeights);
        }
        
        // Second pass: fill gaps using median of valid neighbors (more robust than mean)
        const filledHeights = this.fillHeightGridGaps(rawHeights, bounds.min.y, radialSteps, angleSteps);
        
        // Third pass: detect and remove spikes using median filter
        const despikedHeights = this.removeSpikesByMedian(filledHeights, radialSteps, angleSteps);
        
        // Fourth pass: apply Gaussian-like smoothing multiple times
        let smoothedGrid = despikedHeights;
        for (let pass = 0; pass < 3; pass++) {
            smoothedGrid = this.smoothHeightGridGaussian(smoothedGrid, radialSteps, angleSteps);
        }
        
        // Cleanup
        tempMaterial.dispose();
        
        return smoothedGrid;
    }
    
    /**
     * Fill gaps in the height grid using median of valid neighbors
     */
    fillHeightGridGaps(rawHeights, defaultY, radialSteps, angleSteps) {
        const filled = [];
        
        for (let a = 0; a < angleSteps; a++) {
            const radialHeights = [...rawHeights[a]];
            
            // Find valid range for this angle
            let firstValid = -1, lastValid = -1;
            for (let r = 0; r < radialSteps; r++) {
                if (radialHeights[r] !== null) {
                    if (firstValid < 0) firstValid = r;
                    lastValid = r;
                }
            }
            
            // Fill each null value
            for (let r = 0; r < radialSteps; r++) {
                if (radialHeights[r] === null) {
                    // Collect valid neighbors from multiple directions
                    const neighbors = [];
                    
                    // Check radial neighbors
                    for (let dr = -3; dr <= 3; dr++) {
                        if (dr === 0) continue;
                        const ri = r + dr;
                        if (ri >= 0 && ri < radialSteps && rawHeights[a][ri] !== null) {
                            neighbors.push(rawHeights[a][ri]);
                        }
                    }
                    
                    // Check angular neighbors at same radius
                    for (let da = -3; da <= 3; da++) {
                        if (da === 0) continue;
                        const ai = (a + da + angleSteps) % angleSteps;
                        if (rawHeights[ai][r] !== null) {
                            neighbors.push(rawHeights[ai][r]);
                        }
                    }
                    
                    if (neighbors.length > 0) {
                        // Use median for robustness
                        neighbors.sort((x, y) => x - y);
                        const mid = Math.floor(neighbors.length / 2);
                        radialHeights[r] = neighbors.length % 2 === 0
                            ? (neighbors[mid - 1] + neighbors[mid]) / 2
                            : neighbors[mid];
                    } else if (r > lastValid && lastValid >= 0) {
                        // Beyond vessel - use last valid
                        radialHeights[r] = rawHeights[a][lastValid];
                    } else if (r < firstValid && firstValid >= 0) {
                        // Before vessel center - use first valid
                        radialHeights[r] = rawHeights[a][firstValid];
                    } else {
                        radialHeights[r] = defaultY;
                    }
                }
            }
            
            filled.push(radialHeights);
        }
        
        return filled;
    }
    
    /**
     * Remove spikes by comparing each point to median of its neighbors
     * Points that deviate significantly from the local median are replaced
     */
    removeSpikesByMedian(heights, radialSteps, angleSteps) {
        const result = [];
        const spikeThreshold = 2.0; // mm - points deviating more than this are considered spikes
        
        for (let a = 0; a < angleSteps; a++) {
            const radialHeights = [];
            
            for (let r = 0; r < radialSteps; r++) {
                const currentValue = heights[a][r];
                
                // Collect neighborhood values (5x5 neighborhood)
                const neighbors = [];
                for (let da = -2; da <= 2; da++) {
                    const ai = (a + da + angleSteps) % angleSteps;
                    for (let dr = -2; dr <= 2; dr++) {
                        if (da === 0 && dr === 0) continue; // Skip self
                        const ri = r + dr;
                        if (ri >= 0 && ri < radialSteps) {
                            neighbors.push(heights[ai][ri]);
                        }
                    }
                }
                
                if (neighbors.length >= 4) {
                    // Calculate median of neighbors
                    neighbors.sort((x, y) => x - y);
                    const mid = Math.floor(neighbors.length / 2);
                    const neighborMedian = neighbors.length % 2 === 0
                        ? (neighbors[mid - 1] + neighbors[mid]) / 2
                        : neighbors[mid];
                    
                    // If current value deviates significantly, replace with median
                    if (Math.abs(currentValue - neighborMedian) > spikeThreshold) {
                        radialHeights.push(neighborMedian);
                    } else {
                        radialHeights.push(currentValue);
                    }
                } else {
                    radialHeights.push(currentValue);
                }
            }
            
            result.push(radialHeights);
        }
        
        return result;
    }
    
    /**
     * Apply Gaussian-like smoothing to the height grid
     * Uses weighted average of neighbors
     */
    smoothHeightGridGaussian(heights, radialSteps, angleSteps) {
        const smoothed = [];
        
        // Gaussian-like weights for 3x3 kernel
        const weights = [
            [0.0625, 0.125, 0.0625],
            [0.125,  0.25,  0.125],
            [0.0625, 0.125, 0.0625]
        ];
        
        for (let a = 0; a < angleSteps; a++) {
            const smoothedRadial = [];
            
            for (let r = 0; r < radialSteps; r++) {
                // Center point gets special handling
                if (r === 0) {
                    // Average all center values across angles
                    let sum = 0;
                    for (let ai = 0; ai < angleSteps; ai++) {
                        sum += heights[ai][0];
                    }
                    smoothedRadial.push(sum / angleSteps);
                    continue;
                }
                
                // Apply Gaussian kernel
                let weightedSum = 0;
                let totalWeight = 0;
                
                for (let da = -1; da <= 1; da++) {
                    const ai = (a + da + angleSteps) % angleSteps;
                    for (let dr = -1; dr <= 1; dr++) {
                        const ri = r + dr;
                        if (ri >= 0 && ri < radialSteps) {
                            const weight = weights[da + 1][dr + 1];
                            weightedSum += heights[ai][ri] * weight;
                            totalWeight += weight;
                        }
                    }
                }
                
                smoothedRadial.push(weightedSum / totalWeight);
            }
            
            smoothed.push(smoothedRadial);
        }
        
        return smoothed;
    }

    /**
     * Sample a grid of the vessel's bottom surface for the base mold top
     * Returns Y-heights at a grid of (radius, angle) positions
     * @param {THREE.BufferGeometry} geometry - Vessel geometry
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @returns {number[][]} - 2D array of Y-heights [angleIndex][radiusIndex]
     */
    sampleVesselBottomGrid(geometry, bounds) {
        const tempMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const tempMesh = new THREE.Mesh(geometry, tempMaterial);
        const raycaster = new THREE.Raycaster();
        
        const maxRadius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        ) * 1.1;  // Slight expansion to ensure coverage
        
        const rayStartY = bounds.min.y - 50;
        const radialSteps = 32;  // Increased resolution for smoother sampling
        
        const heightGrid = [];
        
        // First pass: collect raw samples with hit/miss tracking
        const rawHeights = [];
        const hitMask = [];
        
        for (let a = 0; a < this.angleSamples; a++) {
            const angle = (a / this.angleSamples) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            const radialHeights = [];
            const radialHits = [];
            
            for (let r = 0; r < radialSteps; r++) {
                // Use r < radialSteps (not <=) and divide by (radialSteps - 1) for proper 0 to 1 range
                const radiusFraction = r / (radialSteps - 1);
                const sampleRadius = radiusFraction * maxRadius;
                
                const origin = new THREE.Vector3(
                    sampleRadius * cos,
                    rayStartY,
                    sampleRadius * sin
                );
                
                const direction = new THREE.Vector3(0, 1, 0);
                raycaster.set(origin, direction);
                raycaster.far = bounds.max.y - rayStartY + 10;
                
                const intersections = raycaster.intersectObject(tempMesh);
                
                if (intersections.length > 0) {
                    radialHeights.push(intersections[0].point.y);
                    radialHits.push(true);
                } else {
                    // Mark as miss - will be interpolated later
                    radialHeights.push(null);
                    radialHits.push(false);
                }
            }
            
            rawHeights.push(radialHeights);
            hitMask.push(radialHits);
        }
        
        // Second pass: fill gaps and smooth the height grid
        for (let a = 0; a < this.angleSamples; a++) {
            const radialHeights = rawHeights[a];
            const radialHits = hitMask[a];
            
            // Find the last valid hit along this radial (outermost vessel edge)
            let lastHitIndex = -1;
            let lastHitY = bounds.min.y;
            for (let r = radialSteps - 1; r >= 0; r--) {
                if (radialHits[r]) {
                    lastHitIndex = r;
                    lastHitY = radialHeights[r];
                    break;
                }
            }
            
            // Fill in missing values
            for (let r = 0; r < radialSteps; r++) {
                if (radialHeights[r] === null) {
                    if (r > lastHitIndex && lastHitIndex >= 0) {
                        // Beyond vessel edge - use the outermost hit value (flat extension)
                        radialHeights[r] = lastHitY;
                    } else {
                        // Inside vessel but missed (e.g., at center) - interpolate from neighbors
                        let prevHit = null, nextHit = null;
                        let prevDist = 0, nextDist = 0;
                        
                        for (let d = 1; d < radialSteps; d++) {
                            if (prevHit === null && r - d >= 0 && radialHits[r - d]) {
                                prevHit = radialHeights[r - d];
                                prevDist = d;
                            }
                            if (nextHit === null && r + d < radialSteps && radialHits[r + d]) {
                                nextHit = radialHeights[r + d];
                                nextDist = d;
                            }
                            if (prevHit !== null && nextHit !== null) break;
                        }
                        
                        if (prevHit !== null && nextHit !== null) {
                            // Linear interpolation between neighbors
                            const t = prevDist / (prevDist + nextDist);
                            radialHeights[r] = prevHit * (1 - t) + nextHit * t;
                        } else if (prevHit !== null) {
                            radialHeights[r] = prevHit;
                        } else if (nextHit !== null) {
                            radialHeights[r] = nextHit;
                        } else {
                            // No hits at all on this radial - use bounds.min.y
                            radialHeights[r] = bounds.min.y;
                        }
                    }
                }
            }
            
            heightGrid.push(radialHeights);
        }
        
        // Third pass: smooth the center region to eliminate center spike
        // Average the center values across all angles
        let centerSum = 0;
        let centerCount = 0;
        for (let a = 0; a < this.angleSamples; a++) {
            if (heightGrid[a][0] !== null) {
                centerSum += heightGrid[a][0];
                centerCount++;
            }
        }
        if (centerCount > 0) {
            const centerAvg = centerSum / centerCount;
            for (let a = 0; a < this.angleSamples; a++) {
                heightGrid[a][0] = centerAvg;
            }
        }
        
        // Fourth pass: apply gentle smoothing to reduce remaining spikes
        const smoothedGrid = this.smoothHeightGrid(heightGrid, radialSteps);
        
        // Cleanup
        tempMaterial.dispose();
        
        return smoothedGrid;
    }
    
    /**
     * Apply smoothing to reduce spikes in the height grid (legacy method)
     * @param {number[][]} heightGrid - Raw height grid
     * @param {number} radialSteps - Number of radial samples
     * @returns {number[][]} - Smoothed height grid
     */
    smoothHeightGrid(heightGrid, radialSteps) {
        // Delegate to the new Gaussian smoothing
        return this.smoothHeightGridGaussian(heightGrid, radialSteps, heightGrid.length);
    }

    /**
     * Generate base mold as a HOLLOW SHELL that inserts into the wall mold cavity
     * - Fixed height: baseMoldHeight (15mm)
     * - Position: from (bounds.min.y - baseMoldHeight) to bounds.min.y
     * - Outer surface: vertical walls following vessel base outline
     * - Top surface: contoured to match vessel bottom (sampled via raycasting)
     * - Bottom surface: flat
     * 
     * HOLLOW SHELL STRUCTURE:
     * - Outer surfaces (plaster-facing and exterior) as before
     * - Inner surfaces offset by shellWallThickness
     * - Connected at edges to form a hollow shell for 3D printing
     * 
     * @param {Object} profile - Vessel profile data
     * @param {THREE.Box3} bounds - Vessel bounding box
     * @param {number} moldWallOffset - Offset for mold walls
     * @param {THREE.BufferGeometry} inputGeometry - Input vessel geometry
     * @param {number} shellWallThickness - Shell wall thickness in mm (default 1.5)
     */
    generateBaseMold(profile, bounds, moldWallOffset, inputGeometry, shellWallThickness = 1.5) {
        const group = new THREE.Group();
        
        const vertices = [];
        const indices = [];
        
        // Base mold dimensions
        const bottomY = bounds.min.y - this.baseMoldHeight;
        const innerBottomY = bottomY + shellWallThickness;  // Inner bottom surface
        const angleSteps = this.angleSamples;
        
        // Get vessel bottom profile (height index 0) for outer wall radius
        const bottomProfile = profile.radii[0];
        
        // Small clearance so base mold fits into wall mold cavity
        const fitClearance = 0.2;  // 0.2mm clearance per side
        
        // Calculate max radius - use same calculation for both sampling and vertex placement
        // This is the consistent outer radius of the base mold
        const maxRadius = Math.max(...bottomProfile) + this.vesselClearance - fitClearance;
        const innerRadius = maxRadius - shellWallThickness;  // Inner shell radius
        
        // Sample the actual vessel bottom surface for the contoured top
        // Pass maxRadius to ensure sampling grid matches vertex placement
        const bottomSurfaceGrid = this.sampleVesselBottomGridWithRadius(inputGeometry, bounds, maxRadius);
        const radialSteps = bottomSurfaceGrid[0].length;  // Number of radial rings in the grid
        
        // ===== Generate vertices for HOLLOW SHELL =====
        // 
        // Structure:
        // Section 1: Bottom outer ring (at bottomY with maxRadius) - exterior bottom edge
        // Section 2: Bottom inner ring (at bottomY with innerRadius) - interior bottom edge
        // Section 3: Inner bottom ring (at innerBottomY with innerRadius) - shell interior bottom
        // Section 4: Top outer surface grid (follows vessel contour at maxRadius)
        // Section 5: Top inner surface grid (offset down by shellWallThickness)
        
        // Section 1: Bottom outer ring (at bottomY) - exterior edge
        // Vertex indices: 0 to angleSteps-1
        const bottomOuterStart = 0;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            vertices.push(maxRadius * cos, bottomY, maxRadius * sin);
        }
        
        // Section 2: Bottom inner ring (at bottomY with innerRadius) - for bottom hollow cap
        // Vertex indices: angleSteps to 2*angleSteps-1
        const bottomInnerStart = angleSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            vertices.push(innerRadius * cos, bottomY, innerRadius * sin);
        }
        
        // Section 3: Inner shell bottom ring (at innerBottomY with innerRadius) - shell interior
        // Vertex indices: 2*angleSteps to 3*angleSteps-1
        const innerBottomStart = 2 * angleSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            vertices.push(innerRadius * cos, innerBottomY, innerRadius * sin);
        }
        
        // Section 4: Top outer surface grid (contoured to match vessel bottom)
        // Vertex indices: 3*angleSteps to 3*angleSteps + angleSteps*radialSteps - 1
        const topOuterGridStart = 3 * angleSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            for (let r = 0; r < radialSteps; r++) {
                const radiusFraction = r / (radialSteps - 1);
                const radius = radiusFraction * maxRadius;
                const y = bottomSurfaceGrid[a][r];  // Sampled height from vessel bottom
                
                vertices.push(radius * cos, y, radius * sin);
            }
        }
        
        // Section 5: Top inner surface grid (offset down by shellWallThickness)
        // Vertex indices: 3*angleSteps + angleSteps*radialSteps to 3*angleSteps + 2*angleSteps*radialSteps - 1
        const topInnerGridStart = topOuterGridStart + angleSteps * radialSteps;
        for (let a = 0; a < angleSteps; a++) {
            const angle = (a / angleSteps) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            for (let r = 0; r < radialSteps; r++) {
                const radiusFraction = r / (radialSteps - 1);
                // Inner surface is offset inward radially (except at center)
                const outerR = radiusFraction * maxRadius;
                const innerR = Math.max(0, radiusFraction * innerRadius);
                const y = bottomSurfaceGrid[a][r] - shellWallThickness;  // Offset down
                
                // At center (r=0), use a single point
                const radius = r === 0 ? 0 : innerR;
                
                vertices.push(radius * cos, y, radius * sin);
            }
        }
        
        // ===== Generate faces for HOLLOW SHELL =====
        
        // Outer walls (vertical sides) - connect bottom outer ring to top outer surface outer ring
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const bottomOuter1 = bottomOuterStart + a;
            const bottomOuter2 = bottomOuterStart + nextA;
            // Outermost grid vertices (r = radialSteps - 1)
            const topOuter1 = topOuterGridStart + a * radialSteps + (radialSteps - 1);
            const topOuter2 = topOuterGridStart + nextA * radialSteps + (radialSteps - 1);
            
            indices.push(bottomOuter1, bottomOuter2, topOuter2);
            indices.push(bottomOuter1, topOuter2, topOuter1);
        }
        
        // Inner walls (shell interior vertical sides) - connect inner bottom to inner top surface outer ring
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const innerBottom1 = innerBottomStart + a;
            const innerBottom2 = innerBottomStart + nextA;
            // Outermost ring of inner top surface (r = radialSteps - 1)
            const topInner1 = topInnerGridStart + a * radialSteps + (radialSteps - 1);
            const topInner2 = topInnerGridStart + nextA * radialSteps + (radialSteps - 1);
            
            // Reversed winding for interior faces
            indices.push(innerBottom1, topInner1, topInner2);
            indices.push(innerBottom1, topInner2, innerBottom2);
        }
        
        // Top outer surface (plaster-facing) - connect outer grid vertices in radial bands
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            
            for (let r = 0; r < radialSteps - 1; r++) {
                const curr1 = topOuterGridStart + a * radialSteps + r;
                const curr2 = topOuterGridStart + a * radialSteps + r + 1;
                const next1 = topOuterGridStart + nextA * radialSteps + r;
                const next2 = topOuterGridStart + nextA * radialSteps + r + 1;
                
                // Two triangles for this quad
                indices.push(curr1, next1, next2);
                indices.push(curr1, next2, curr2);
            }
        }
        
        // Top inner surface (shell interior) - reversed winding
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            
            for (let r = 0; r < radialSteps - 1; r++) {
                const curr1 = topInnerGridStart + a * radialSteps + r;
                const curr2 = topInnerGridStart + a * radialSteps + r + 1;
                const next1 = topInnerGridStart + nextA * radialSteps + r;
                const next2 = topInnerGridStart + nextA * radialSteps + r + 1;
                
                // Reversed winding for interior
                indices.push(curr1, next2, next1);
                indices.push(curr1, curr2, next2);
            }
        }
        
        // Top edge ring - connects outer top surface outer ring to inner top surface outer ring
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const topOuter1 = topOuterGridStart + a * radialSteps + (radialSteps - 1);
            const topOuter2 = topOuterGridStart + nextA * radialSteps + (radialSteps - 1);
            const topInner1 = topInnerGridStart + a * radialSteps + (radialSteps - 1);
            const topInner2 = topInnerGridStart + nextA * radialSteps + (radialSteps - 1);
            
            indices.push(topOuter1, topOuter2, topInner2);
            indices.push(topOuter1, topInner2, topInner1);
        }
        
        // Bottom cap (hollow ring) - connects outer bottom ring to inner bottom ring
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const outer1 = bottomOuterStart + a;
            const outer2 = bottomOuterStart + nextA;
            const inner1 = bottomInnerStart + a;
            const inner2 = bottomInnerStart + nextA;
            
            // Bottom face triangles (normals point down)
            indices.push(outer1, inner1, inner2);
            indices.push(outer1, inner2, outer2);
        }
        
        // Inner bottom cap (shell interior bottom) - connects inner bottom ring to inner shell bottom
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const bottomInner1 = bottomInnerStart + a;
            const bottomInner2 = bottomInnerStart + nextA;
            const innerBottom1 = innerBottomStart + a;
            const innerBottom2 = innerBottomStart + nextA;
            
            // Connect with proper winding
            indices.push(bottomInner1, innerBottom2, innerBottom1);
            indices.push(bottomInner1, bottomInner2, innerBottom2);
        }
        
        // Inner shell bottom surface (shell interior floor) - flat surface at innerBottomY
        // Create center point for inner bottom
        const innerBottomCenterIdx = vertices.length / 3;
        vertices.push(0, innerBottomY, 0);  // Center point
        
        for (let a = 0; a < angleSteps; a++) {
            const nextA = (a + 1) % angleSteps;
            const inner1 = innerBottomStart + a;
            const inner2 = innerBottomStart + nextA;
            
            // Interior bottom cap (normals point up into shell)
            indices.push(innerBottomCenterIdx, inner1, inner2);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
            color: PART_COLORS.foot,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        
        group.name = 'base';
        return this.groupToGeometry(group);
    }

    /**
     * Generate 3 wall mold shells with flat outer walls as HOLLOW SHELLS
     * Wall molds extend from (vessel bottom - baseMoldHeight) to (vessel top + spareHeight)
     * The 15mm extension below vessel base creates a cavity for the base mold to insert into
     * Inner surface is vertical in this extension region
     * Outer walls are registered at the widest diameter point
     * Corner triangles are removed via vertical cut planes based on cornerCutWidth
     * 
     * Shell wall thickness is controlled by shellParams.wallThickness for 3D printing
     */
    generateWallShellsFromProfile(profile, bounds, wallHeight, moldWallOffset, moldParams, natchParams, shellParams) {
        const walls = [];
        const { cornerCutWidth = 0 } = moldParams;
        const { wallThickness = 1.5 } = shellParams || {};
        
        // Find the maximum vessel radius (widest diameter point) - this is our register point
        const maxVesselRadius = Math.max(...profile.radii.flat());
        
        // Wall molds start 15mm below vessel bottom to create cavity for base mold
        const baseY = bounds.min.y - this.baseMoldHeight;
        
        for (let i = 0; i < 3; i++) {
            const startAngle = (i * 120 * Math.PI) / 180;
            const endAngle = ((i + 1) * 120 * Math.PI) / 180;
            
            const wallGeometry = this.generateWallSegmentWithFlatOuter(
                profile,
                bounds,
                baseY,  // Start 15mm below vessel bottom
                wallHeight,  // Full height including extension
                moldWallOffset,
                maxVesselRadius,
                startAngle,
                endAngle,
                i,
                natchParams,
                cornerCutWidth,
                wallThickness  // Shell wall thickness for hollow shell
            );
            
            walls.push(wallGeometry);
        }
        
        return walls;
    }

    /**
     * Generate single wall segment (120°) as a HOLLOW SHELL for 3D printing
     * The outer walls are registered at the widest diameter point (maxVesselRadius)
     * Wall thickness adjustments are made from that register point
     * 
     * IMPORTANT: Outer walls are clipped to vertical cut planes at corners.
     * The cornerCutWidth parameter controls how much of each corner triangle is removed.
     * 
     * Wall molds extend from baseY (15mm below vessel) to baseY + wallHeight
     * The 15mm extension below vessel base has vertical inner walls at the vessel's bottom profile radius
     * 
     * HOLLOW SHELL STRUCTURE:
     * For each position, we create 4 vertices:
     * - A (innerOuter): cavity-facing surface (plaster touches this)
     * - A' (innerInner): interior side of cavity wall (shell hollow)
     * - B' (outerInner): interior side of exterior wall (shell hollow)
     * - B (outerOuter): exterior flat wall surface
     */
    generateWallSegmentWithFlatOuter(profile, bounds, baseY, wallHeight, moldWallOffset, maxVesselRadius, startAngle, endAngle, wallIndex, natchParams, cornerCutWidth = 0, shellWallThickness = 1.5) {
        const group = new THREE.Group();
        const vesselHeight = bounds.max.y - bounds.min.y;
        
        const vertices = [];
        const indices = [];
        
        // Calculate angle indices - use high resolution for crisp walls
        const angleSteps = Math.max(64, Math.floor(this.angleSamples / 2));
        
        // Height steps for the full wall height
        const heightSteps = Math.max(profile.heights.length, 16);
        
        // Calculate vessel wall height (just the vessel portion, excluding spare and base extension)
        const vesselWallHeight = vesselHeight;
        
        // The outer wall is flat and registered at maxVesselRadius + moldWallOffset
        // This is the key register point where wall thickness adjustments are made
        const outerWallDistance = maxVesselRadius + moldWallOffset;
        
        // Calculate the mid-angle of this segment (where the flat wall is tangent)
        const midAngle = (startAngle + endAngle) / 2;
        
        // For a single flat wall per segment:
        // The wall normal points outward at the midAngle
        // The wall is positioned at outerWallDistance from center
        const wallNormal = { x: Math.cos(midAngle), z: Math.sin(midAngle) };
        
        // Calculate the original corner points (before cut)
        const originalStartCorner = this.getWallCornerPoint(outerWallDistance, midAngle, startAngle);
        const originalEndCorner = this.getWallCornerPoint(outerWallDistance, midAngle, endAngle);
        
        // Calculate corner distances from center
        const startCornerDist = Math.sqrt(originalStartCorner.x ** 2 + originalStartCorner.z ** 2);
        const endCornerDist = Math.sqrt(originalEndCorner.x ** 2 + originalEndCorner.z ** 2);
        
        // Calculate cut plane distances (corner distance minus cut width)
        const startCutDist = Math.max(outerWallDistance, startCornerDist - cornerCutWidth);
        const endCutDist = Math.max(outerWallDistance, endCornerDist - cornerCutWidth);
        
        // Calculate B-line endpoints (where flat wall meets vertical cut planes)
        // These are the new effective corners after the cut
        const startCorner = cornerCutWidth > 0 
            ? this.getWallCutIntersection(midAngle, startAngle, outerWallDistance, startCutDist) || originalStartCorner
            : originalStartCorner;
        const endCorner = cornerCutWidth > 0 
            ? this.getWallCutIntersection(midAngle, endAngle, outerWallDistance, endCutDist) || originalEndCorner
            : originalEndCorner;
        
        // Store cut plane info for vertex clipping
        const startCutPlane = { angle: startAngle, distance: startCutDist };
        const endCutPlane = { angle: endAngle, distance: endCutDist };
        
        // Inner shell offset distance (flat wall moved toward center)
        const innerOuterWallDistance = outerWallDistance - shellWallThickness;
        
        // Calculate inner shell corner points
        const innerStartCorner = cornerCutWidth > 0 
            ? this.getWallCutIntersection(midAngle, startAngle, innerOuterWallDistance, startCutDist - shellWallThickness) || this.getWallCornerPoint(innerOuterWallDistance, midAngle, startAngle)
            : this.getWallCornerPoint(innerOuterWallDistance, midAngle, startAngle);
        const innerEndCorner = cornerCutWidth > 0 
            ? this.getWallCutIntersection(midAngle, endAngle, innerOuterWallDistance, endCutDist - shellWallThickness) || this.getWallCornerPoint(innerOuterWallDistance, midAngle, endAngle)
            : this.getWallCornerPoint(innerOuterWallDistance, midAngle, endAngle);
        
        // Generate vertices for hollow shell
        // Per (h, a) position, we create 4 vertices:
        // [0] A = innerOuter (cavity-facing, plaster surface)
        // [1] A' = innerInner (interior of cavity wall)
        // [2] B' = outerInner (interior of exterior wall)
        // [3] B = outerOuter (exterior flat wall)
        for (let h = 0; h <= heightSteps; h++) {
            const t = h / heightSteps;
            const y = baseY + t * wallHeight;
            
            // Determine which region we're in:
            // 1. Extension region (y < bounds.min.y): vertical walls at bottom profile radius
            // 2. Vessel region (bounds.min.y <= y <= bounds.max.y): follows vessel profile
            // 3. Spare region (y > bounds.max.y): uses rim profile + offset
            
            const isInExtension = y < bounds.min.y;
            const isInSpare = y > bounds.max.y;
            
            // Calculate profile height index
            let profileH;
            if (isInExtension) {
                // Use bottom of vessel profile (index 0)
                profileH = 0;
            } else if (isInSpare) {
                // Use top of vessel profile
                profileH = profile.heights.length - 1;
            } else {
                // Map y to vessel profile
                const vesselT = (y - bounds.min.y) / vesselWallHeight;
                profileH = Math.min(
                    Math.floor(vesselT * (profile.heights.length - 1)),
                    profile.heights.length - 1
                );
            }
            
            // Spare region has wider radius to allow pour clearance
            const spareRadiusOffset = isInSpare ? 15 : 0;
            
            for (let a = 0; a <= angleSteps; a++) {
                const angleT = a / angleSteps;
                const angle = startAngle + angleT * (endAngle - startAngle);
                const angleIdx = Math.floor((angle / (Math.PI * 2)) * this.angleSamples) % this.angleSamples;
                
                // Get vessel radius at this position (for inner surface)
                const vesselRadius = profile.radii[profileH]?.[angleIdx] || 0;
                
                // Inner radius (vessel surface, with offset for spare region)
                // In extension region, this creates vertical walls at the bottom profile radius
                const innerRadius = vesselRadius + this.vesselClearance + spareRadiusOffset;
                
                // Inner shell radius (offset inward from cavity surface by shell thickness)
                const innerShellRadius = innerRadius + shellWallThickness;
                
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                
                // [0] A = Inner outer vertex (cavity-facing, follows vessel profile)
                vertices.push(innerRadius * cos, y, innerRadius * sin);
                
                // [1] A' = Inner inner vertex (shell interior, offset from cavity surface)
                vertices.push(innerShellRadius * cos, y, innerShellRadius * sin);
                
                // Calculate outer vertices (B' and B) using flat wall projection
                let outerX, outerZ, outerInnerX, outerInnerZ;
                
                // Find intersection of ray from origin at 'angle' with the flat wall
                const dot = cos * wallNormal.x + sin * wallNormal.z;
                
                if (Math.abs(dot) > 0.001) {
                    const projDist = outerWallDistance / dot;
                    const projX = projDist * cos;
                    const projZ = projDist * sin;
                    
                    const innerProjDist = innerOuterWallDistance / dot;
                    const innerProjX = innerProjDist * cos;
                    const innerProjZ = innerProjDist * sin;
                    
                    // CLIP to vertical cut planes instead of corner points
                    // Check against start cut plane (perpendicular to startAngle direction)
                    const startCutNormal = { x: Math.cos(startCutPlane.angle), z: Math.sin(startCutPlane.angle) };
                    const startCutCheck = projX * startCutNormal.x + projZ * startCutNormal.z;
                    
                    // Check against end cut plane (perpendicular to endAngle direction)
                    const endCutNormal = { x: Math.cos(endCutPlane.angle), z: Math.sin(endCutPlane.angle) };
                    const endCutCheck = projX * endCutNormal.x + projZ * endCutNormal.z;
                    
                    // Also check if we're past the radial boundaries (for angles outside segment)
                    const startBoundaryNormal = { x: -Math.sin(startAngle), z: Math.cos(startAngle) };
                    const startBoundaryDist = projX * startBoundaryNormal.x + projZ * startBoundaryNormal.z;
                    
                    const endBoundaryNormal = { x: Math.sin(endAngle), z: -Math.cos(endAngle) };
                    const endBoundaryDist = projX * endBoundaryNormal.x + projZ * endBoundaryNormal.z;
                    
                    // Determine clipping behavior
                    if (startBoundaryDist < 0 || startCutCheck > startCutPlane.distance) {
                        // Point is past start boundary or cut plane - clip to cut plane
                        const cutPlaneDot = cos * startCutNormal.x + sin * startCutNormal.z;
                        if (Math.abs(cutPlaneDot) > 0.001) {
                            const cutProjDist = startCutPlane.distance / cutPlaneDot;
                            outerX = cutProjDist * cos;
                            outerZ = cutProjDist * sin;
                            // Inner shell follows the same cut plane but offset
                            const innerCutProjDist = (startCutPlane.distance - shellWallThickness) / cutPlaneDot;
                            outerInnerX = innerCutProjDist * cos;
                            outerInnerZ = innerCutProjDist * sin;
                        } else {
                            outerX = startCorner.x;
                            outerZ = startCorner.z;
                            outerInnerX = innerStartCorner.x;
                            outerInnerZ = innerStartCorner.z;
                        }
                    } else if (endBoundaryDist < 0 || endCutCheck > endCutPlane.distance) {
                        // Point is past end boundary or cut plane - clip to cut plane
                        const cutPlaneDot = cos * endCutNormal.x + sin * endCutNormal.z;
                        if (Math.abs(cutPlaneDot) > 0.001) {
                            const cutProjDist = endCutPlane.distance / cutPlaneDot;
                            outerX = cutProjDist * cos;
                            outerZ = cutProjDist * sin;
                            const innerCutProjDist = (endCutPlane.distance - shellWallThickness) / cutPlaneDot;
                            outerInnerX = innerCutProjDist * cos;
                            outerInnerZ = innerCutProjDist * sin;
                        } else {
                            outerX = endCorner.x;
                            outerZ = endCorner.z;
                            outerInnerX = innerEndCorner.x;
                            outerInnerZ = innerEndCorner.z;
                        }
                    } else {
                        // Point is within bounds - use the projected point on flat wall
                        outerX = projX;
                        outerZ = projZ;
                        outerInnerX = innerProjX;
                        outerInnerZ = innerProjZ;
                    }
                } else {
                    // Ray is parallel to wall - use corner points based on which half we're in
                    if (angleT < 0.5) {
                        outerX = startCorner.x;
                        outerZ = startCorner.z;
                        outerInnerX = innerStartCorner.x;
                        outerInnerZ = innerStartCorner.z;
                    } else {
                        outerX = endCorner.x;
                        outerZ = endCorner.z;
                        outerInnerX = innerEndCorner.x;
                        outerInnerZ = innerEndCorner.z;
                    }
                }
                
                // [2] B' = Outer inner vertex (shell interior, inside of exterior wall)
                vertices.push(outerInnerX, y, outerInnerZ);
                
                // [3] B = Outer outer vertex (exterior flat wall)
                vertices.push(outerX, y, outerZ);
            }
        }
        
        // Generate faces for hollow shell
        // Each row now has 4 vertices per angle position: A, A', B', B
        const vertsPerRow = (angleSteps + 1) * 4;
        
        for (let h = 0; h < heightSteps; h++) {
            for (let a = 0; a < angleSteps; a++) {
                // Current row vertex indices
                const baseA = h * vertsPerRow + a * 4;       // A (inner outer)
                const baseAp = baseA + 1;                    // A' (inner inner)
                const baseBp = baseA + 2;                    // B' (outer inner)
                const baseB = baseA + 3;                     // B (outer outer)
                
                const nextA = h * vertsPerRow + (a + 1) * 4;
                const nextAp = nextA + 1;
                const nextBp = nextA + 2;
                const nextB = nextA + 3;
                
                // Next row (height) vertex indices
                const topBaseA = (h + 1) * vertsPerRow + a * 4;
                const topBaseAp = topBaseA + 1;
                const topBaseBp = topBaseA + 2;
                const topBaseB = topBaseA + 3;
                
                const topNextA = (h + 1) * vertsPerRow + (a + 1) * 4;
                const topNextAp = topNextA + 1;
                const topNextBp = topNextA + 2;
                const topNextB = topNextA + 3;
                
                // Face A: Inner cavity surface (plaster-facing, normals point inward)
                indices.push(baseA, topNextA, topBaseA);
                indices.push(baseA, nextA, topNextA);
                
                // Face A': Inner shell surface (shell interior, normals point outward)
                indices.push(baseAp, topBaseAp, topNextAp);
                indices.push(baseAp, topNextAp, nextAp);
                
                // Face B': Outer shell surface (shell interior, normals point inward)
                indices.push(baseBp, topNextBp, topBaseBp);
                indices.push(baseBp, nextBp, topNextBp);
                
                // Face B: Exterior surface (outside-facing, normals point outward)
                indices.push(baseB, topBaseB, topNextB);
                indices.push(baseB, topNextB, nextB);
            }
        }
        
        // Bottom cap (hollow ring) - connects A to A' and B' to B at bottom
        for (let a = 0; a < angleSteps; a++) {
            const A1 = a * 4;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;
            
            const A2 = (a + 1) * 4;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;
            
            // Connect A to A' (cavity wall bottom)
            indices.push(A1, Ap2, Ap1);
            indices.push(A1, A2, Ap2);
            
            // Connect B' to B (exterior wall bottom)
            indices.push(Bp1, B2, B1);
            indices.push(Bp1, Bp2, B2);
            
            // Connect A' to B' (shell interior bottom - closes the hollow)
            indices.push(Ap1, Bp2, Bp1);
            indices.push(Ap1, Ap2, Bp2);
        }
        
        // Top cap (hollow ring) - connects A to A' and B' to B at top
        const topRowStart = heightSteps * vertsPerRow;
        for (let a = 0; a < angleSteps; a++) {
            const A1 = topRowStart + a * 4;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;
            
            const A2 = topRowStart + (a + 1) * 4;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;
            
            // Connect A to A' (cavity wall top)
            indices.push(A1, Ap1, Ap2);
            indices.push(A1, Ap2, A2);
            
            // Connect B' to B (exterior wall top)
            indices.push(Bp1, B1, B2);
            indices.push(Bp1, B2, Bp2);
            
            // Connect A' to B' (shell interior top - closes the hollow)
            indices.push(Ap1, Bp1, Bp2);
            indices.push(Ap1, Bp2, Ap2);
        }
        
        // Side caps (at start and end angles) - hollow shell sides
        // Start angle side cap (hollow)
        for (let h = 0; h < heightSteps; h++) {
            const A1 = h * vertsPerRow;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;
            
            const A2 = (h + 1) * vertsPerRow;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;
            
            // Connect A to A' (cavity wall side)
            indices.push(A1, A2, Ap2);
            indices.push(A1, Ap2, Ap1);
            
            // Connect B' to B (exterior wall side)
            indices.push(Bp1, Bp2, B2);
            indices.push(Bp1, B2, B1);
            
            // Connect A' to B' (shell interior side)
            indices.push(Ap1, Ap2, Bp2);
            indices.push(Ap1, Bp2, Bp1);
        }
        
        // End angle side cap (hollow)
        const endAngleOffset = angleSteps * 4;
        for (let h = 0; h < heightSteps; h++) {
            const A1 = h * vertsPerRow + endAngleOffset;
            const Ap1 = A1 + 1;
            const Bp1 = A1 + 2;
            const B1 = A1 + 3;
            
            const A2 = (h + 1) * vertsPerRow + endAngleOffset;
            const Ap2 = A2 + 1;
            const Bp2 = A2 + 2;
            const B2 = A2 + 3;
            
            // Connect A to A' (cavity wall side) - reversed winding
            indices.push(A1, Ap1, Ap2);
            indices.push(A1, Ap2, A2);
            
            // Connect B' to B (exterior wall side) - reversed winding
            indices.push(Bp1, B1, B2);
            indices.push(Bp1, B2, Bp2);
            
            // Connect A' to B' (shell interior side) - reversed winding
            indices.push(Ap1, Bp1, Bp2);
            indices.push(Ap1, Bp2, Ap2);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const colors = [PART_COLORS.wall1, PART_COLORS.wall2, PART_COLORS.wall3];
        const material = new THREE.MeshStandardMaterial({
            color: colors[wallIndex],
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        
        group.name = `wall${wallIndex + 1}`;
        return this.groupToGeometry(group);
    }

    /**
     * Calculate the corner point where a flat wall intersects a radial boundary line
     * @param {number} wallDistance - Distance from center to the flat wall (perpendicular distance)
     * @param {number} wallNormalAngle - Angle of the wall's outward normal (midpoint angle of segment)
     * @param {number} radialAngle - Angle of the radial boundary line
     * @returns {{x: number, z: number}} - Corner point coordinates
     */
    getWallCornerPoint(wallDistance, wallNormalAngle, radialAngle) {
        // The flat wall is defined by: x*cos(wallNormalAngle) + z*sin(wallNormalAngle) = wallDistance
        // The radial line is defined by: points of form (t*cos(radialAngle), t*sin(radialAngle)) for t >= 0
        
        // Substituting the radial line into the wall equation:
        // t*cos(radialAngle)*cos(wallNormalAngle) + t*sin(radialAngle)*sin(wallNormalAngle) = wallDistance
        // t * cos(radialAngle - wallNormalAngle) = wallDistance
        // t = wallDistance / cos(radialAngle - wallNormalAngle)
        
        const angleDiff = radialAngle - wallNormalAngle;
        const cosDiff = Math.cos(angleDiff);
        
        // Avoid division by zero (shouldn't happen for 120° segments with midpoint normal)
        if (Math.abs(cosDiff) < 0.001) {
            // Fallback: place corner at wallDistance along the radial
            return {
                x: wallDistance * Math.cos(radialAngle),
                z: wallDistance * Math.sin(radialAngle)
            };
        }
        
        const t = wallDistance / cosDiff;
        
        return {
            x: t * Math.cos(radialAngle),
            z: t * Math.sin(radialAngle)
        };
    }

    /**
     * Calculate vertical cut plane position for corner elimination
     * Instead of chamfered corners, this creates a flat vertical cut at a fixed distance from center
     * @param {number} cutDistance - Distance from center to the cut plane
     * @param {number} cornerAngle - Angle of the corner (radial direction)
     * @returns {Object} Cut plane data with normal, distance, and angle
     */
    getVerticalCutPlane(cutDistance, cornerAngle) {
        return {
            angle: cornerAngle,
            normal: { x: Math.cos(cornerAngle), z: Math.sin(cornerAngle) },
            distance: cutDistance
        };
    }

    /**
     * Calculate intersection point of a flat wall with a vertical cut plane (B-line endpoint)
     * @param {number} wallNormalAngle - Normal angle of the flat wall
     * @param {number} cutAngle - Angle of the vertical cut plane
     * @param {number} wallDistance - Distance from center to the flat wall
     * @param {number} cutDistance - Distance from center to the cut plane
     * @returns {Object|null} Intersection point {x, z} or null if parallel
     */
    getWallCutIntersection(wallNormalAngle, cutAngle, wallDistance, cutDistance) {
        // Wall plane: x*cos(wallNormalAngle) + z*sin(wallNormalAngle) = wallDistance
        // Cut plane: x*cos(cutAngle) + z*sin(cutAngle) = cutDistance

        const nx1 = Math.cos(wallNormalAngle);
        const nz1 = Math.sin(wallNormalAngle);
        const nx2 = Math.cos(cutAngle);
        const nz2 = Math.sin(cutAngle);

        // Solve 2x2 system using Cramer's rule
        const det = nx1 * nz2 - nz1 * nx2;

        if (Math.abs(det) < 0.001) {
            // Planes are parallel - shouldn't happen in normal operation
            return null;
        }

        const x = (wallDistance * nz2 - cutDistance * nz1) / det;
        const z = (nx1 * cutDistance - nx2 * wallDistance) / det;

        return { x, z };
    }

    /**
     * Project a point at given angle onto a vertical cut plane
     * @param {number} angle - Angle to project
     * @param {Object} cutPlane - Cut plane object with distance and normal
     * @returns {Object} Projected point {x, z}
     */
    projectToVerticalCut(angle, cutPlane) {
        // Simply place point at cut plane distance in the radial direction
        return {
            x: cutPlane.distance * Math.cos(cutPlane.angle),
            z: cutPlane.distance * Math.sin(cutPlane.angle)
        };
    }

    /**
     * Create registration key geometry
     */
    createRegistrationKey(radius, angleDegrees, height, diameter, depth, isMale) {
        const angle = (angleDegrees * Math.PI) / 180;
        
        // Create hemisphere
        const sphereRadius = diameter / 2;
        const geometry = new THREE.SphereGeometry(
            sphereRadius,
            16,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        );
        
        // Position
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        
        geometry.rotateX(Math.PI / 2);
        geometry.translate(x, height, z);
        
        return geometry;
    }

    /**
     * Create natches (registration keys) for wall segment
     */
    createNatchesForWall(outerRadius, baseHeight, wallHeight, startAngle, endAngle, wallIndex, params) {
        const geometries = [];
        const { diameter, depth, countPerSeam } = params;
        
        // Position natches at height fractions
        const heightFractions = countPerSeam === 1 
            ? [0.5]
            : countPerSeam === 2 
                ? [0.25, 0.75]
                : countPerSeam === 3
                    ? [0.2, 0.5, 0.8]
                    : [0.2, 0.4, 0.6, 0.8];
        
        heightFractions.forEach(fraction => {
            const y = baseHeight + wallHeight * fraction;
            
            // Male natch on trailing edge (endAngle)
            const maleGeo = this.createRegistrationKey(
                outerRadius + 5,
                (endAngle * 180) / Math.PI,
                y,
                diameter,
                depth,
                true
            );
            geometries.push(maleGeo);
        });
        
        return geometries;
    }

    /**
     * Convert group of meshes to single geometry
     */
    groupToGeometry(group) {
        const geometries = [];
        
        group.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry.clone();
                child.updateMatrixWorld(true);
                geo.applyMatrix4(child.matrixWorld);
                geometries.push(geo);
            }
        });
        
        if (geometries.length === 0) {
            return new THREE.BufferGeometry();
        }
        
        if (geometries.length === 1) {
            return geometries[0];
        }
        
        // Simple merge for visualization
        return geometries[0];  // Return first for now, full merge would combine all
    }
}

export default MoldGenerator;
