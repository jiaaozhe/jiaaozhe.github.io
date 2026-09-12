import '../../tool-apps/pdf-page-manager/compat.js';
import { WorkerMessageHandler } from '../../tool-apps/pdf-page-manager/vendor/pdfjs/pdf.worker.min.mjs';

const ports = new Map();
self.addEventListener('message', function(event) {
    const message = event.data;
    if (message.type === 'connect' && message.port) {
        ports.set(message.id, message.port);
        WorkerMessageHandler.initializeFromPort(message.port);
        message.port.start();
    } else if (message.type === 'release') {
        const port = ports.get(message.id);
        if (port) port.close();
        ports.delete(message.id);
    }
});
