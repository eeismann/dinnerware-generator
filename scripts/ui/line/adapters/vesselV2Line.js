/**
 * Line frame — Vessel Designer V2: the profile editor and the 3D view sit
 * side by side as two framed plates; their controls stay with the editor.
 */
import { $, bootLineApp, mountLineApp } from '../lineAppShell.js';
import { paperViewer } from './paperViewer.js';

bootLineApp(
    () => window.vesselV2App && $('.profile-controls') && $('#motifInspector'),
    () => {
        const app = window.vesselV2App;
        mountLineApp({
            id: 'vessel-v2',
            title: 'Vessel V2',
            stages: ['#profileEditor', '.viewport-shell'],
            panel: null,
            primary: ['#btnExportSTL'],
            tools: ['#viewMenuContainer'],
            readout: [{ label: 'Status', source: '#statusInfo' }],
            caption: () => '<span>Vessel V2</span>One profile, drawn and revolved, drawn in one ink.',
            hint: 'Click to add points · drag points and handles · select a segment to give it a motif',
            viewer: paperViewer(() => app.viewport?.getCameraRig?.())
        });
    }
);
