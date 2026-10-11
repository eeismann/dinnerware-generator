/**
 * Line frame — Vessel Designer.
 */
import { $, bootLineApp, mountLineApp } from '../lineAppShell.js';
import { paperViewer } from './paperViewer.js';

bootLineApp(
    () => window.vesselApp?.viewport && $('#parameterPanel .panel-content'),
    () => {
        const vp = window.vesselApp.viewport;
        const ctx = mountLineApp({
            id: 'vessel',
            title: 'Vessel',
            stages: ['.viewport-container'],
            panel: '#parameterPanel',
            panelBody: '.panel-content',
            primary: ['#btnExportSTL'],
            tools: ['#viewMenuContainer', '.footer-center'],
            readout: [{ label: 'Status', source: '#statusInfo' }],
            checks: '#warningsMenuContainer',
            caption: () => '<span>Vessel</span>Six sections, stacked and revolved, drawn in one ink.',
            hint: 'Drag to orbit · switch a section on or off to add or remove it · drag a label to scrub',
            viewer: paperViewer(() => vp.getCameraRig?.())
        });
        // The legend is a row of section names, not buttons
        $('.footer-center')?.classList.add('ln-legend');
        return ctx;
    }
);
