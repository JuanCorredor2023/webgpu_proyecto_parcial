import type { Vec3 } from "./math";
import { vec3 } from "./math";

export type MeshBounds = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  radius: number;
};

export type MeshData = {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  normals: Float32Array;
  uvs: Float32Array;
  bounds: MeshBounds;
};

function assertValidMesh(mesh: MeshData) {
  if (mesh.positions.length % 3 !== 0) {
    throw new Error("Mesh positions length must be a multiple of 3");
  }

  if (mesh.indices.length % 3 !== 0) {
    throw new Error("Mesh indices length must be a multiple of 3");
  }
}

function getVertexCount(mesh: MeshData) {
  return mesh.positions.length / 3;
}

function readPosition(positions: Float32Array, vertexIndex: number): Vec3 {
  const base = vertexIndex * 3;
  return [positions[base], positions[base + 1], positions[base + 2]];
}

function readNormal(normals: Float32Array, vertexIndex: number): Vec3 {
  const base = vertexIndex * 3;
  if (base + 2 >= normals.length) return [0, 1, 0];
  return [normals[base], normals[base + 1], normals[base + 2]];
}

function writeNormal(normals: Float32Array, vertexIndex: number, normal: Vec3) {
  const base = vertexIndex * 3;
  normals[base] = normal[0];
  normals[base + 1] = normal[1];
  normals[base + 2] = normal[2];
}

function addToNormal(normals: Float32Array, vertexIndex: number, normal: Vec3) {
  const base = vertexIndex * 3;
  normals[base] += normal[0];
  normals[base + 1] += normal[1];
  normals[base + 2] += normal[2];
}

function getSafeUv(uvs: Float32Array, vertexIndex: number): [number, number] {
  const base = vertexIndex * 2;
  if (base + 1 >= uvs.length) return [0, 0];
  return [uvs[base], uvs[base + 1]];
}

function computeSphericalUv(position: Vec3, center: Vec3): [number, number] {
  const px = position[0] - center[0];
  const py = position[1] - center[1];
  const pz = position[2] - center[2];
  const length = Math.hypot(px, py, pz);

  if (length === 0) return [0.5, 0.5];

  const nx = px / length;
  const ny = py / length;
  const nz = pz / length;

  const u = 0.5 + Math.atan2(nz, nx) / (Math.PI * 2);
  const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;

  return [u, v];
}

export function generateSphericalUvMesh(mesh: MeshData): MeshData {
  assertValidMesh(mesh);

  const bounds = computeBounds(mesh);
  const vertexCount = getVertexCount(mesh);
  const normals =
    mesh.normals.length === vertexCount * 3 ? mesh.normals : computeVertexNormals(mesh);
  const baseUvs = new Float32Array(vertexCount * 2);

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const position = readPosition(mesh.positions, vertexIndex);
    const [u, v] = computeSphericalUv(position, bounds.center);
    const uvBase = vertexIndex * 2;
    baseUvs[uvBase] = u;
    baseUvs[uvBase + 1] = v;
  }

  const positions: number[] = [];
  const outNormals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  function getOrCreateVertex(vertexIndex: number, wrapU: boolean) {
    const key = `${vertexIndex}:${wrapU ? 1 : 0}`;
    const cached = vertexMap.get(key);
    if (cached !== undefined) return cached;

    const position = readPosition(mesh.positions, vertexIndex);
    const normal = readNormal(normals, vertexIndex);
    const uvBase = vertexIndex * 2;
    const u = baseUvs[uvBase] + (wrapU ? 1 : 0);
    const v = baseUvs[uvBase + 1];

    positions.push(position[0], position[1], position[2]);
    outNormals.push(normal[0], normal[1], normal[2]);
    uvs.push(u, v);

    const newIndex = positions.length / 3 - 1;
    vertexMap.set(key, newIndex);
    return newIndex;
  }

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    const triUs = triangle.map(vertexIndex => baseUvs[vertexIndex * 2]);
    const maxU = Math.max(...triUs);
    const minU = Math.min(...triUs);
    const crossesSeam = maxU - minU > 0.5;

    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = triangle[corner];
      const wrapU = crossesSeam && baseUvs[vertexIndex * 2] < 0.5;
      indices.push(getOrCreateVertex(vertexIndex, wrapU));
    }
  }

  const sphericalMesh: MeshData = {
    positions: new Float32Array(positions),
    indices: positions.length / 3 > 0xffff ? new Uint32Array(indices) : new Uint16Array(indices),
    normals: new Float32Array(outNormals),
    uvs: new Float32Array(uvs),
    bounds: {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 0,
    },
  };

  sphericalMesh.bounds = computeBounds(sphericalMesh);
  return sphericalMesh;
}

export function computeBounds(mesh: MeshData): MeshBounds {
  assertValidMesh(mesh);

  if (mesh.positions.length === 0) {
    const emptyBounds: MeshBounds = {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 0,
    };
    mesh.bounds = emptyBounds;
    return emptyBounds;
  }

  let minX = mesh.positions[0];
  let minY = mesh.positions[1];
  let minZ = mesh.positions[2];
  let maxX = mesh.positions[0];
  let maxY = mesh.positions[1];
  let maxZ = mesh.positions[2];

  for (let i = 3; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    const z = mesh.positions[i + 2];

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const center: Vec3 = [
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  ];

  let radius = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const dx = mesh.positions[i] - center[0];
    const dy = mesh.positions[i + 1] - center[1];
    const dz = mesh.positions[i + 2] - center[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance > radius) radius = distance;
  }

  const bounds: MeshBounds = {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center,
    radius,
  };

  mesh.bounds = bounds;
  return bounds;
}

export function computeFaceNormals(mesh: MeshData): Float32Array {
  assertValidMesh(mesh);

  const faceNormals = new Float32Array(mesh.indices.length);

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i];
    const ib = mesh.indices[i + 1];
    const ic = mesh.indices[i + 2];

    const a = readPosition(mesh.positions, ia);
    const b = readPosition(mesh.positions, ib);
    const c = readPosition(mesh.positions, ic);

    const ab = vec3.sub(b, a);
    const ac = vec3.sub(c, a);
    const normal = vec3.normalize(vec3.cross(ab, ac));

    faceNormals[i] = normal[0];
    faceNormals[i + 1] = normal[1];
    faceNormals[i + 2] = normal[2];
  }

  return faceNormals;
}

export function computeVertexNormals(mesh: MeshData): Float32Array {
  assertValidMesh(mesh);

  const vertexCount = getVertexCount(mesh);
  const normals = new Float32Array(vertexCount * 3);
  const faceNormals = computeFaceNormals(mesh);

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i];
    const ib = mesh.indices[i + 1];
    const ic = mesh.indices[i + 2];

    const faceNormal: Vec3 = [
      faceNormals[i],
      faceNormals[i + 1],
      faceNormals[i + 2],
    ];

    addToNormal(normals, ia, faceNormal);
    addToNormal(normals, ib, faceNormal);
    addToNormal(normals, ic, faceNormal);
  }

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const base = vertexIndex * 3;
    const accumulated: Vec3 = [normals[base], normals[base + 1], normals[base + 2]];
    const normalized = vec3.normalize(accumulated);
    writeNormal(normals, vertexIndex, normalized);
  }

  mesh.normals = normals;
  return normals;
}

export function buildWireframeEdgeIndices(mesh: MeshData): Uint16Array | Uint32Array {
  assertValidMesh(mesh);

  const edges = new Set<string>();
  const lineIndices: number[] = [];

  function registerEdge(a: number, b: number) {
    if (a === b) return;

    const minIndex = Math.min(a, b);
    const maxIndex = Math.max(a, b);
    const key = `${minIndex}:${maxIndex}`;

    if (edges.has(key)) return;

    edges.add(key);
    lineIndices.push(minIndex, maxIndex);
  }

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];

    registerEdge(a, b);
    registerEdge(b, c);
    registerEdge(c, a);
  }

  return getVertexCount(mesh) > 0xffff
    ? new Uint32Array(lineIndices)
    : new Uint16Array(lineIndices);
}

export function buildPointIndices(mesh: MeshData): Uint16Array | Uint32Array {
  assertValidMesh(mesh);

  const vertexCount = getVertexCount(mesh);
  const pointIndices = new Array<number>(vertexCount);

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    pointIndices[vertexIndex] = vertexIndex;
  }

  return vertexCount > 0xffff
    ? new Uint32Array(pointIndices)
    : new Uint16Array(pointIndices);
}

export function buildInterleavedVertexData(mesh: MeshData): Float32Array {
  assertValidMesh(mesh);

  const vertexCount = getVertexCount(mesh);
  const normals =
    mesh.normals.length === vertexCount * 3 ? mesh.normals : computeVertexNormals(mesh);
  const uvs = mesh.uvs;

  const interleaved = new Float32Array(vertexCount * 8);

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const posBase = vertexIndex * 3;
    const normalBase = vertexIndex * 3;
    const outBase = vertexIndex * 8;
    const [u, v] = getSafeUv(uvs, vertexIndex);

    interleaved[outBase] = mesh.positions[posBase];
    interleaved[outBase + 1] = mesh.positions[posBase + 1];
    interleaved[outBase + 2] = mesh.positions[posBase + 2];
    interleaved[outBase + 3] = normals[normalBase];
    interleaved[outBase + 4] = normals[normalBase + 1];
    interleaved[outBase + 5] = normals[normalBase + 2];
    interleaved[outBase + 6] = u;
    interleaved[outBase + 7] = v;
  }

  return interleaved;
}
