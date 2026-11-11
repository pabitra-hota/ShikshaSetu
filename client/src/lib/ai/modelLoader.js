/**
 * AI Model Loader for ShikshaSetu
 * Loads Face Detection, Landmark, and Recognition neural network weights from /models
 */
let modelsLoaded = false;
let loadingPromise = null;
export async function loadFaceApiModels(modelsPath = "/models") {
    if (typeof window === "undefined")
        return false;
    if (modelsLoaded)
        return true;
    if (loadingPromise)
        return loadingPromise;
    loadingPromise = (async () => {
        try {
            const faceapi = await import("@vladmandic/face-api");
            // The face-api bundle can register WASM as its preferred backend before the
            // WASM runtime has been initialized. The CPU backend is bundled and avoids
            // that race, while remaining reliable on school devices without WebGL.
            const backendReady = await faceapi.tf.setBackend("cpu");
            if (!backendReady) throw new Error("TensorFlow.js CPU backend is unavailable");
            await faceapi.tf.ready();
            // Load Tiny Face Detector (lightweight, runs fast on low-end rural mobile devices)
            await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
            // Load Landmark 68 tiny model for facial alignment
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelsPath);
            // Load Face Recognition Net (128-dimensional embedding extractor)
            await faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath);
            modelsLoaded = true;
            console.log("✓ Face-api models loaded successfully from", modelsPath);
            return true;
        }
        catch (error) {
            console.error("Failed to load face-api models:", error);
            modelsLoaded = false;
            return false;
        }
        finally {
            loadingPromise = null;
        }
    })();
    return loadingPromise;
}
export function areModelsLoaded() {
    return modelsLoaded;
}
