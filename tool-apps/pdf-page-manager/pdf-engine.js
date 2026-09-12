(function(root) {
    'use strict';

    const activeRenders = new WeakMap();
    const renderVersions = new WeakMap();

    function pdfjs() {
        if (!root.pdfjsLib) throw new Error('PDF.js 未加载。');
        return root.pdfjsLib;
    }

    function pdfLib() {
        if (!root.PDFLib) throw new Error('pdf-lib 未加载。');
        return root.PDFLib;
    }

    function assetUrl(path) {
        if (!root.location) return path;
        return new URL(path, root.location.href).href;
    }

    function encryptedError() {
        const error = new Error('暂不支持加密或密码保护的 PDF。');
        error.name = 'EncryptedPdfError';
        return error;
    }

    async function openDocument(file, onProgress) {
        const library = pdfjs();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const lease = root.toolHost && root.toolHost.openPdfWorker ? await root.toolHost.openPdfWorker() : null;
        let worker;
        let task;
        let rejectPassword;
        const passwordPromise = new Promise(function(resolve, reject) {
            rejectPassword = reject;
        });
        try {
            worker = lease ? library.PDFWorker.create({ port: lease.port }) : null;
            if (lease) lease.port.start();
            task = library.getDocument({
            ...(worker ? { worker: worker } : {}),
            data: bytes,
            cMapUrl: assetUrl('vendor/pdfjs/cmaps/'),
            cMapPacked: true,
            iccUrl: assetUrl('vendor/pdfjs/iccs/'),
            standardFontDataUrl: assetUrl('vendor/pdfjs/standard_fonts/'),
            wasmUrl: assetUrl('vendor/pdfjs/wasm/'),
            useWorkerFetch: false,
            useWasm: true,
            isEvalSupported: false,
            enableXfa: false,
            disableAutoFetch: true,
            stopAtErrors: false,
            verbosity: library.VerbosityLevel.ERRORS
            });
        } catch (error) {
            if (worker) worker.destroy();
            if (lease) {
                lease.port.close();
                root.toolHost.releasePdfWorker(lease.id);
            }
            throw error;
        }
        let workerFailure;
        let workerDead = false;
        const failurePromise = new Promise(function(resolve, reject) { workerFailure = reject; });
        const unsubscribe = lease ? root.toolHost.onPdfError(function(error) { workerDead = true; workerFailure(error); }) : function() {};
        const timeout = setTimeout(function() { workerFailure(new Error('PDF 解析超时，请缩小文件后重试。')); }, 60000);

        task.onProgress = function(progress) {
            if (onProgress) onProgress(progress.loaded || 0, progress.total || file.size || 0);
        };
        task.onPassword = function() {
            rejectPassword(encryptedError());
            task.destroy().catch(function() {});
        };

        try {
            const documentProxy = await Promise.race([task.promise, passwordPromise, failurePromise]);
            return { task: task, document: documentProxy, worker: worker, lease: lease, unsubscribe: unsubscribe, isWorkerDead: function() { return workerDead; } };
        } catch (error) {
            unsubscribe();
            if (lease) {
                worker.destroy();
                lease.port.close();
                root.toolHost.releasePdfWorker(lease.id);
            }
            task.destroy().catch(function() {});
            if (error && (error.name === 'PasswordException' || error.name === 'EncryptedPDFError')) {
                throw encryptedError();
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    function cancelRender(canvas) {
        renderVersions.set(canvas, (renderVersions.get(canvas) || 0) + 1);
        const render = activeRenders.get(canvas);
        if (!render) return;
        try {
            render.cancel();
        } catch (error) {
            // A completed PDF.js render task cannot be cancelled again.
        }
        activeRenders.delete(canvas);
    }

    function releaseCanvas(canvas) {
        cancelRender(canvas);
        canvas.width = 0;
        canvas.height = 0;
    }

    async function renderPage(source, pageIndex, rotation, canvas, options) {
        const config = options || {};
        cancelRender(canvas);
        const version = renderVersions.get(canvas);
        const page = await source.pdf.document.getPage(pageIndex + 1);
        if (renderVersions.get(canvas) !== version) {
            const error = new Error('页面渲染已取消。');
            error.name = 'RenderingCancelledException';
            throw error;
        }
        const totalRotation = root.PDFPageCore.normalizeRotation(page.rotate + rotation);
        const baseViewport = page.getViewport({ scale: 1, rotation: totalRotation });
        const targetWidth = Math.max(80, Number(config.width) || 180);
        const cssScale = targetWidth / Math.max(1, baseViewport.width);
        const cssViewport = page.getViewport({ scale: cssScale, rotation: totalRotation });
        const deviceScale = Math.min(Number(config.pixelRatio) || root.devicePixelRatio || 1, 2);
        const maxArea = Math.max(500000, Number(config.maxArea) || 4000000);
        const areaScale = Math.min(1, Math.sqrt(maxArea / Math.max(1, cssViewport.width * cssViewport.height * deviceScale * deviceScale)));
        const outputScale = Math.min(deviceScale * areaScale, 16384 / cssViewport.width, 16384 / cssViewport.height);

        canvas.width = Math.max(1, Math.floor(cssViewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(cssViewport.height * outputScale));
        canvas.style.width = cssViewport.width + 'px';
        canvas.style.height = cssViewport.height + 'px';
        canvas.style.aspectRatio = cssViewport.width + ' / ' + cssViewport.height;

        const context = canvas.getContext('2d', { alpha: false });
        context.save();
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();

        const task = page.render({
            canvas: canvas,
            canvasContext: context,
            viewport: cssViewport,
            transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
            annotationMode: pdfjs().AnnotationMode.ENABLE
        });
        activeRenders.set(canvas, task);
        try {
            await task.promise;
        } finally {
            if (activeRenders.get(canvas) === task) activeRenders.delete(canvas);
        }

        return {
            width: cssViewport.width,
            height: cssViewport.height,
            originalRotation: page.rotate,
            totalRotation: totalRotation
        };
    }

    async function destroySource(source) {
        if (!source || !source.pdf) return;
        if (source.pdf.unsubscribe) source.pdf.unsubscribe();
        const destroyed = source.pdf.task.destroy().catch(function() {});
        if (!source.pdf.isWorkerDead || !source.pdf.isWorkerDead()) await destroyed;
        if (source.pdf.lease) {
            source.pdf.worker.destroy();
            source.pdf.lease.port.close();
            root.toolHost.releasePdfWorker(source.pdf.lease.id);
        }
    }

    function nextFrame() {
        return new Promise(function(resolve) {
            if (typeof root.requestAnimationFrame === 'function') {
                root.requestAnimationFrame(function() { resolve(); });
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    async function loadEditableSources(pages, sources, onProgress) {
        const library = pdfLib();
        const sourceIds = [];
        pages.forEach(function(page) {
            if (!sourceIds.includes(page.sourceId)) sourceIds.push(page.sourceId);
        });
        const documents = new Map();

        for (let index = 0; index < sourceIds.length; index += 1) {
            const source = sources.get(sourceIds[index]);
            if (!source) throw new Error('找不到页面来源文件。');
            if (onProgress) onProgress({ phase: 'read', current: index, total: sourceIds.length, label: '读取 ' + source.name });
            try {
                const bytes = await source.file.arrayBuffer();
                const document = await library.PDFDocument.load(bytes, { updateMetadata: false });
                if (document.isEncrypted) throw encryptedError();
                documents.set(source.id, document);
            } catch (error) {
                if (error && (error.name === 'EncryptedPDFError' || /encrypted/i.test(error.message || ''))) {
                    throw encryptedError();
                }
                throw new Error('无法导出“' + source.name + '”：' + (error.message || String(error)));
            }
            await nextFrame();
        }
        return documents;
    }

    async function exportDocument(pages, sources, onProgress) {
        if (!pages.length) throw new Error('没有可导出的页面。');
        const library = pdfLib();
        const inputDocuments = await loadEditableSources(pages, sources, onProgress);
        const output = await library.PDFDocument.create();
        const copiedById = new Map();
        const sourceIds = Array.from(inputDocuments.keys());

        for (let sourceIndex = 0; sourceIndex < sourceIds.length; sourceIndex += 1) {
            const sourceId = sourceIds[sourceIndex];
            const sourcePages = pages.filter(function(page) { return page.sourceId === sourceId; });
            const indices = sourcePages.map(function(page) { return page.sourcePageIndex; });
            if (onProgress) onProgress({ phase: 'copy', current: sourceIndex, total: sourceIds.length, label: '复制页面内容' });
            const copied = await output.copyPages(inputDocuments.get(sourceId), indices);
            copied.forEach(function(page, index) {
                copiedById.set(sourcePages[index].id, page);
            });
            await nextFrame();
        }

        pages.forEach(function(descriptor) {
            const page = copiedById.get(descriptor.id);
            const originalRotation = page.getRotation().angle;
            page.setRotation(library.degrees(root.PDFPageCore.normalizeRotation(originalRotation + descriptor.rotation)));
            output.addPage(page);
        });

        if (onProgress) onProgress({ phase: 'save', current: 0, total: 1, label: '生成 PDF' });
        return output.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 40 });
    }

    async function exportSplitDocuments(pages, sources, onProgress, onDocument) {
        if (!pages.length) throw new Error('没有可拆分的页面。');
        const library = pdfLib();
        const inputDocuments = await loadEditableSources(pages, sources, onProgress);
        const output = [];

        for (let index = 0; index < pages.length; index += 1) {
            const descriptor = pages[index];
            const document = await library.PDFDocument.create();
            const copied = await document.copyPages(inputDocuments.get(descriptor.sourceId), [descriptor.sourcePageIndex]);
            const page = copied[0];
            const originalRotation = page.getRotation().angle;
            page.setRotation(library.degrees(root.PDFPageCore.normalizeRotation(originalRotation + descriptor.rotation)));
            document.addPage(page);
            const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 40 });
            if (onDocument) await onDocument(bytes, descriptor, index);
            else output.push(bytes);
            if (onProgress) onProgress({ phase: 'split', current: index + 1, total: pages.length, label: '生成第 ' + (index + 1) + ' 页' });
            if ((index + 1) % 4 === 0) await nextFrame();
        }

        return output;
    }

    root.PDFPageEngine = Object.freeze({
        openDocument: openDocument,
        renderPage: renderPage,
        cancelRender: cancelRender,
        releaseCanvas: releaseCanvas,
        destroySource: destroySource,
        exportDocument: exportDocument,
        exportSplitDocuments: exportSplitDocuments
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
