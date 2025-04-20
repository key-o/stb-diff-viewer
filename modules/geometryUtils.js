// This file provides utility functions for geometric calculations, such as distance measurements and transformations.

export function calculateDistance(pointA, pointB) {
    const dx = pointB.x - pointA.x;
    const dy = pointB.y - pointA.y;
    const dz = pointB.z - pointA.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function translatePoint(point, translationVector) {
    return {
        x: point.x + translationVector.x,
        y: point.y + translationVector.y,
        z: point.z + translationVector.z
    };
}

export function scalePoint(point, scaleFactor) {
    return {
        x: point.x * scaleFactor,
        y: point.y * scaleFactor,
        z: point.z * scaleFactor
    };
}

export function rotatePoint(point, angle, axis) {
    const radians = angle * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    let rotatedPoint = { ...point };

    if (axis === 'x') {
        rotatedPoint.y = point.y * cos - point.z * sin;
        rotatedPoint.z = point.y * sin + point.z * cos;
    } else if (axis === 'y') {
        rotatedPoint.x = point.x * cos + point.z * sin;
        rotatedPoint.z = -point.x * sin + point.z * cos;
    } else if (axis === 'z') {
        rotatedPoint.x = point.x * cos - point.y * sin;
        rotatedPoint.y = point.x * sin + point.y * cos;
    }

    return rotatedPoint;
}