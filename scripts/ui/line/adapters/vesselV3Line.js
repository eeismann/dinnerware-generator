/**
 * Line frame — Vessel Designer V3: the profile editor and the 3D view sit
 * side by side as two framed plates; their controls stay with the editor.
 */
import { $, bootLineApp, mountLineApp } from '../lineAppShell.js';
import { paperViewer } from './paperViewer.js';

bootLineApp(
    () => window.vesselV3App && $('.profile-controls') && $('#motifInspector'),
    () => {
        const app = window.vesselV3App;
        mountLineApp({
            id: 'vessel-v3',
            title: 'Vessel V3',
            stages: ['#profileEditor', '.viewport-shell'],
            panel: null,
            // The lid inspector moves out of the profile plate into a column
            panelNodes: ['#lidInspector'],
            primary: ['#btnExportSTL', '#btnExportLidSTL'],
            tools: ['#viewMenuContainer'],
            readout: [{ label: 'Status', source: '#statusInfo' }],
            caption: () => '<span>Vessel V3</span>One profile, drawn and revolved, with spout and lid, drawn in one ink.',
            hint: 'Click to add points · drag points and handles · select a segment to give it a motif',
            viewer: paperViewer(() => app.viewport?.getCameraRig?.())
        });
    }
);
