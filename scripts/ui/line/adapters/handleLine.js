/**
 * Line frame — Handle Designer.
 */
import { $, bootLineApp, mountLineApp } from '../lineAppShell.js';
import { getHandleViewport } from '../../../handle/ui/handleViewport.js';
import { paperViewer } from './paperViewer.js';

bootLineApp(
    () => getHandleViewport() && $('#parameterPanel .panel-content'),
    () => {
        const vp = getHandleViewport();
        mountLineApp({
            id: 'handle',
            title: 'Handle',
            stages: ['.viewport-container'],
            panel: '#parameterPanel',
            panelBody: '.panel-content',
            primary: ['#btnExportSTL', '#btnExportMoldKit'],
            tools: ['.footer-left .view-menu-container'],
            readout: [{ label: 'Handle', source: '#handleDimensionsSummary', wide: true }],
            checks: '#warningsMenuContainer',
            caption: () => '<span>Handle</span>A swept cross-section, fitted to a mug or vessel wall.',
            hint: 'Drag to orbit · import a mug or vessel to fit the handle · drag a label to scrub',
            hide: ['#btnTogglePanel'],
            viewer: paperViewer(() => vp.getCameraRig?.())
        });
    }
);
