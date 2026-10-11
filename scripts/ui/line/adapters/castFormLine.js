/**
 * Line frame — Cast Form Generator (header/main/footer sit directly in body).
 */
import { $, el, bootLineApp, mountLineApp } from '../lineAppShell.js';
import { paperViewer } from './paperViewer.js';

bootLineApp(
    () => window.castFormApp?.viewport && $('#parameterPanel'),
    () => {
        const vp = window.castFormApp.viewport;
        mountLineApp({
            id: 'castform',
            title: 'Cast Form',
            root: 'body',
            dashboardHref: '../dashboard.html',
            back: '.app-header .header-left a',
            stages: ['.app-main .viewport-container'],
            panel: '#parameterPanel',
            project: ['#newBtn', '#loadBtn', '#saveBtn'],
            primary: ['#exportBtn'],
            tools: (container) => {
                const presets = el('div', 'ln-group');
                presets.append(...Array.from(document.querySelectorAll('.camera-presets .preset-btn')));
                presets.querySelectorAll('button').forEach(button => button.classList.add('ln-toggle'));
                const view = el('div', 'ln-group');
                view.append(...['.app-footer .view-menu', '#debugModeBtn'].map(s => $(s)).filter(Boolean));
                view.querySelectorAll('#viewMenuBtn, #debugModeBtn').forEach(button => button.classList.add('ln-toggle'));
                container.append(presets, view);
            },
            readout: [{ label: 'Status', source: '#statusText', wide: true }],
            caption: () => '<span>Cast Form</span>A slip-casting mold, split into a foot and wall sections.',
            hint: 'Import an STL or open a project from the dashboard · drag to orbit',
            viewer: paperViewer(() => vp.getCameraRig?.())
        });
    }
);
