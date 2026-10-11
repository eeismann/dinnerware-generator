export const HANDLE_MOLD_DEFAULTS = {
    clearance: 0.2,
    insert: {
        minBackStock: 20,
        backStockScale: 1,
        minEndStock: 12,
        endStockScale: 0.48,
        minSideStock: 1.5,
        sideStockScale: 0.09,
        belowDatum: 2,
        topStock: 1.5
    },
    outer: {
        minEndStock: 32,
        endStockScale: 0.9,
        minAttachmentStock: 32,
        attachmentStockScale: 0.9,
        minBackStock: 12,
        backStockScale: 0.34
    },
    base: {
        thickness: 6,
        belowDatum: 4,
        wallOverlap: 2
    },
    walls: {
        minThickness: 12,
        thicknessScale: 0.34,
        minTopStock: 11.5,
        topStockScale: 0.35
    },
    registration: {
        footerHeight: 2,
        webThickness: 2,
        receiverHoleDiameter: 7.2,
        keyClearance: 0.25,
        sideHoleInset: 5,
        endHoleInset: 5,
        innerHoleInset: 10,
        minimumHoleWebClearance: 1.2
    },
    plaster: {
        dryPlasterKgPerLiter: 1,
        waterLiterPerKg: 0.7,
        dryPlasterRoundKg: 0.1,
        waterRoundLiter: 0.05
    }
};

export const HANDLE_MOLD_PART_NAMES = {
    proof: 'Proof',
    handleMold: 'Handle_Mold',
    wallA: 'WallA',
    wallB: 'WallB',
    bottom: 'Bottom'
};

export function mergeHandleMoldOptions(options = {}) {
    return {
        ...HANDLE_MOLD_DEFAULTS,
        ...options,
        insert: {
            ...HANDLE_MOLD_DEFAULTS.insert,
            ...(options.insert || {})
        },
        outer: {
            ...HANDLE_MOLD_DEFAULTS.outer,
            ...(options.outer || {})
        },
        base: {
            ...HANDLE_MOLD_DEFAULTS.base,
            ...(options.base || {})
        },
        walls: {
            ...HANDLE_MOLD_DEFAULTS.walls,
            ...(options.walls || {})
        },
        registration: {
            ...HANDLE_MOLD_DEFAULTS.registration,
            ...(options.registration || {})
        },
        plaster: {
            ...HANDLE_MOLD_DEFAULTS.plaster,
            ...(options.plaster || {})
        }
    };
}
