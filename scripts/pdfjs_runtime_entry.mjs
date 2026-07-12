import * as pdfjsLib from '../tool-apps/pdf-page-manager/vendor/pdfjs/pdf.min.mjs';
import { WorkerMessageHandler } from '../tool-apps/pdf-page-manager/vendor/pdfjs/pdf.worker.min.mjs';

globalThis.pdfjsLib = Object.freeze(pdfjsLib);
globalThis.pdfjsWorker = Object.freeze({ WorkerMessageHandler });
