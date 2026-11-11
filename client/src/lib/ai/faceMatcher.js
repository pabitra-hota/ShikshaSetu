import { loadFaceApiModels } from "./modelLoader.js";
// Calculate Euclidean distance between two 128-dimensional float arrays
export function euclideanDistance(arr1, arr2) {
    if (arr1.length !== arr2.length)
        return 1.0;
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
        const diff = arr1[i] - arr2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
// Convert Euclidean distance to confidence percentage (0 to 1)
export function distanceToConfidence(distance) {
    // Euclidean distance for normalized face descriptors usually ranges from 0.0 to 1.2
    // 0.3 or less = ~95-100% confidence
    // 0.5 = ~75% confidence
    // 0.6 = ~60% confidence
    // > 0.7 = low/uncertain
    const conf = Math.max(0, Math.min(1, 1 - distance * 0.8));
    return Math.round(conf * 100) / 100;
}
export async function detectAndRecognizeFacesInImage(imageSource, authorizedStudents, options = {
    scoreThreshold: 0.45,
    matchThreshold: 0.58,
    uncertainThreshold: 0.72,
}) {
    const modelsLoaded = await loadFaceApiModels();
    if (!modelsLoaded) {
        throw new Error("Face recognition models could not be loaded");
    }
    const faceapi = await import("@vladmandic/face-api");
    // Detect all faces with landmarks and 128-d recognition descriptors
    const detections = await faceapi
        .detectAllFaces(imageSource, new faceapi.TinyFaceDetectorOptions({
        inputSize: 512,
        scoreThreshold: options.scoreThreshold,
    }))
        .withFaceLandmarks(true)
        .withFaceDescriptors();
    // Parse authorized student descriptors
    const parsedStudents = authorizedStudents
        .map((s) => {
        let descArray = null;
        if (typeof s.descriptor === "string") {
            try {
                descArray = JSON.parse(s.descriptor);
            }
            catch {
                descArray = null;
            }
        }
        else if (Array.isArray(s.descriptor)) {
            descArray = s.descriptor;
        }
        return {
            id: s.id,
            name: s.name,
            rollNumber: s.rollNumber,
            descriptor: descArray,
        };
    })
        .filter((s) => s.descriptor && s.descriptor.length === 128);
    const matchedFaces = [];
    const assignedStudentCounts = {};
    for (let i = 0; i < detections.length; i++) {
        const detection = detections[i];
        const detectedDescriptor = Array.from(detection.descriptor);
        const box = {
            x: Math.round(detection.detection.box.x),
            y: Math.round(detection.detection.box.y),
            width: Math.round(detection.detection.box.width),
            height: Math.round(detection.detection.box.height),
        };
        let bestMatchStudent = null;
        let minDistance = Infinity;
        // Compare with all authorized student descriptors in this class
        for (const student of parsedStudents) {
            if (!student.descriptor)
                continue;
            const distance = euclideanDistance(detectedDescriptor, student.descriptor);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatchStudent = student;
            }
        }
        const confidence = distanceToConfidence(minDistance);
        let matchStatus = "UNKNOWN";
        if (bestMatchStudent && minDistance < options.matchThreshold) {
            matchStatus = "CONFIRMED";
            assignedStudentCounts[bestMatchStudent.id] = (assignedStudentCounts[bestMatchStudent.id] || 0) + 1;
        }
        else if (bestMatchStudent && minDistance < options.uncertainThreshold) {
            matchStatus = "UNCERTAIN";
            assignedStudentCounts[bestMatchStudent.id] = (assignedStudentCounts[bestMatchStudent.id] || 0) + 1;
        }
        else {
            matchStatus = "UNKNOWN";
        }
        matchedFaces.push({
            faceIndex: i + 1,
            box,
            descriptor: detectedDescriptor,
            suggestedStudentId: matchStatus !== "UNKNOWN" ? bestMatchStudent?.id : undefined,
            suggestedStudentName: matchStatus !== "UNKNOWN" ? bestMatchStudent?.name : undefined,
            suggestedRollNumber: matchStatus !== "UNKNOWN" ? bestMatchStudent?.rollNumber : undefined,
            confidence: matchStatus !== "UNKNOWN" ? confidence : Math.round(detection.detection.score * 100) / 100,
            matchStatus,
        });
    }
    // Check for duplicates: if more than 1 face matched the same student ID, flag as DUPLICATE
    for (const face of matchedFaces) {
        if (face.suggestedStudentId && assignedStudentCounts[face.suggestedStudentId] > 1) {
            face.matchStatus = "DUPLICATE";
        }
    }
    return matchedFaces;
}
// Extract a face thumbnail data URL from a canvas/image given bounding box
export function cropFaceFromImage(sourceImage, box, padding = 0.2) {
    if (typeof document === "undefined")
        return "";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return "";
    const padX = box.width * padding;
    const padY = box.height * padding;
    const sx = Math.max(0, box.x - padX);
    const sy = Math.max(0, box.y - padY);
    const sWidth = Math.min(sourceImage.width - sx, box.width + padX * 2);
    const sHeight = Math.min(sourceImage.height - sy, box.height + padY * 2);
    canvas.width = 120;
    canvas.height = 120;
    ctx.drawImage(sourceImage, sx, sy, sWidth, sHeight, 0, 0, 120, 120);
    return canvas.toDataURL("image/jpeg", 0.85);
}
