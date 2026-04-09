import "./style.css";
import shaderCode from "./shader.wgsl?raw";
import { Camera } from "./camera";
import { mat4 } from "./math";
import { gui, hexToRgb, initGUI, updateLightDisplay } from "./gui";
import { computeBounds, computeVertexNormals, buildInterleavedVertexData, generateSphericalUvMesh } from "./mesh";
import type { MeshData } from "./mesh";


//WebGPU init
if (!navigator.gpu) throw new Error("WebGPU not supported");

const canvas = document.querySelector("#gfx-main") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gfx-main not found");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No GPU adapter found");

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu")!;
const format  = navigator.gpu.getPreferredCanvasFormat();

let depthTexture: GPUTexture | null = null;
let gNormalTexture: GPUTexture | null = null;
let gNormalTextureView: GPUTextureView | null = null;
let normalTextureBindGroup: GPUBindGroup | null = null;
let normalTextureBindGroupLayout: GPUBindGroupLayout | null = null;

function resize() {
  canvas.width  = Math.max(1, Math.floor(window.innerWidth  * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * devicePixelRatio));
  context.configure({ device, format, alphaMode: "premultiplied" });
  depthTexture?.destroy();
  gNormalTexture?.destroy();
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  gNormalTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  gNormalTextureView = gNormalTexture.createView();
  normalTextureBindGroup = normalTextureBindGroupLayout
    ? device.createBindGroup({
        layout: normalTextureBindGroupLayout,
        entries: [{ binding: 0, resource: gNormalTextureView }],
      })
    : null;
}

function createTextureFromBitmap(bitmap: ImageBitmap) {
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    [bitmap.width, bitmap.height],
  );
  bitmap.close();

  return texture;
}

async function createSolidColorTexture(rgba: [number, number, number, number]) {
  const imageData = new ImageData(new Uint8ClampedArray(rgba), 1, 1);
  const bitmap = await createImageBitmap(imageData);
  return createTextureFromBitmap(bitmap);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertex format: [x, y, z,  nx, ny, nz,  u, v]
//                 position    normal       uv
// stride = 8 floats = 32 bytes
// ─────────────────────────────────────────────────────────────────────────────

// ── Cube geometry ───────────────────────────────────────────────
// Each face is 2 triangles
// Normals are constant per face so flat and smooth shading look identical on a cube.


function generateCube(): MeshData {
  const positions = new Float32Array([
    // Front (+Z)
    -1, -1,  1,
     1, -1,  1,
     1,  1,  1,
    -1,  1,  1,

    // Back (-Z)
     1, -1, -1,
    -1, -1, -1,
    -1,  1, -1,
     1,  1, -1,

    // Left (-X)
    -1, -1, -1,
    -1, -1,  1,
    -1,  1,  1,
    -1,  1, -1,

    // Right (+X)
     1, -1,  1,
     1, -1, -1,
     1,  1, -1,
     1,  1,  1,

    // Top (+Y)
    -1,  1,  1,
     1,  1,  1,
     1,  1, -1,
    -1,  1, -1,

    // Bottom (-Y)
    -1, -1, -1,
     1, -1, -1,
     1, -1,  1,
    -1, -1,  1,
  ]);

  const indices = new Uint16Array([
    0, 1, 2,   0, 2, 3,       // Front
    4, 5, 6,   4, 6, 7,       // Back
    8, 9, 10,  8, 10, 11,     // Left
    12, 13, 14, 12, 14, 15,   // Right
    16, 17, 18, 16, 18, 19,   // Top
    20, 21, 22, 20, 22, 23,   // Bottom
  ]);

  const uvs = new Float32Array([
    // Front
    0, 0,  1, 0,  1, 1,  0, 1,
    // Back
    0, 0,  1, 0,  1, 1,  0, 1,
    // Left
    0, 0,  1, 0,  1, 1,  0, 1,
    // Right
    0, 0,  1, 0,  1, 1,  0, 1,
    // Top
    0, 0,  1, 0,  1, 1,  0, 1,
    // Bottom
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);

  const mesh: MeshData = {
    positions,
    indices,
    normals: new Float32Array((positions.length / 3) * 3),
    uvs,
    bounds: {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 0,
    },
  };

  mesh.bounds = computeBounds(mesh);
  computeVertexNormals(mesh);

  return mesh;
}

function generateSphere(stacks: number, slices: number): MeshData {
  if (stacks < 2) throw new Error("Sphere must have at least 2 stacks");
  if (slices < 3) throw new Error("Sphere must have at least 3 slices");

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const phi = v * Math.PI;

    const y = Math.cos(phi);
    const ringRadius = Math.sin(phi);

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const theta = u * Math.PI * 2;

      const x = ringRadius * Math.cos(theta);
      const z = ringRadius * Math.sin(theta);

      positions.push(x, y, z);
      normals.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const vertsPerRow = slices + 1;

  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * vertsPerRow + j;
      const b = a + 1;
      const c = (i + 1) * vertsPerRow + j;
      const d = c + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const mesh: MeshData = {
    positions: new Float32Array(positions),
    indices: positions.length / 3 > 0xffff ? new Uint32Array(indices) : new Uint16Array(indices),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    bounds: {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 0,
    },
  };

  mesh.bounds = computeBounds(mesh);
  return mesh;
}
// estructuras
type Transform = {
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
};

function createDefaultTransform(): Transform {
  return {
    tx: 0,
    ty: 0,
    tz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
  };
}

type GPUMesh = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  indexFormat: GPUIndexFormat;
};

type SceneObjectType = "cube" | "sphere" | "obj";

type SceneObject = {
  id: number;
  name: string;
  type: SceneObjectType;
  meshData: MeshData;
  gpuMesh: GPUMesh;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  useTexture: boolean;
  hasTexture: boolean;
  textureName: string | null;
  textureGpu: GPUTexture | null;
  textureView: GPUTextureView | null;
  textureBindGroup: GPUBindGroup;
  transform: Transform;
  selected: boolean;
};

function parseOBJ(text: string): MeshData {
  const rawPositions: number[] = [];
  const rawUvs: number[] = [];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertexMap = new Map<string, number>();

  const lines = text.split(/\r?\n/);

  function getOrCreateVertex(token: string): number {
    if (vertexMap.has(token)) {
      return vertexMap.get(token)!;
    }

    const parts = token.split("/");
    const vIndex = parts[0] ? parseInt(parts[0], 10) - 1 : -1;
    const vtIndex = parts[1] ? parseInt(parts[1], 10) - 1 : -1;

    if (vIndex < 0) {
      throw new Error(`Invalid OBJ face token: ${token}`);
    }

    positions.push(
      rawPositions[vIndex * 3],
      rawPositions[vIndex * 3 + 1],
      rawPositions[vIndex * 3 + 2],
    );

    if (vtIndex >= 0) {
      uvs.push(
        rawUvs[vtIndex * 2],
        rawUvs[vtIndex * 2 + 1],
      );
    } else {
      uvs.push(0, 0);
    }

    // Always recompute normals
    normals.push(0, 0, 0);

    const newIndex = positions.length / 3 - 1;
    vertexMap.set(token, newIndex);
    return newIndex;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const prefix = parts[0];

    if (prefix === "v") {
      rawPositions.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      );
    } else if (prefix === "vt") {
      rawUvs.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
      );
    } else if (prefix === "vn") {
      // Normals from the OBJ are intentionally ignored; they are recomputed from triangle faces.
      continue;
    } else if (prefix === "f") {
      const faceTokens = parts.slice(1);

      // triangulation by fan:
      // f a b c d  =>  (a,b,c) and (a,c,d)
      for (let i = 1; i < faceTokens.length - 1; i++) {
        const i0 = getOrCreateVertex(faceTokens[0]);
        const i1 = getOrCreateVertex(faceTokens[i]);
        const i2 = getOrCreateVertex(faceTokens[i + 1]);

        indices.push(i0, i1, i2);
      }
    }
  }

  const mesh: MeshData = {
    positions: new Float32Array(positions),
    indices: positions.length / 3 > 0xffff ? new Uint32Array(indices) : new Uint16Array(indices),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    bounds: {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 0,
    },
  };

  mesh.bounds = computeBounds(mesh);
  computeVertexNormals(mesh);

  return mesh;
}

function uploadMesh(mesh: MeshData): GPUMesh {
  const vertexData = buildInterleavedVertexData(mesh);

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  const indexBuffer = device.createBuffer({
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: mesh.indices.length,
    indexFormat: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
  };
}


type Scene = {
  objects: SceneObject[];
  selectedObjectId: number;
};

function createScene(): Scene {
  return {
    objects: [],
    selectedObjectId: -1,
  };
}

let nextSceneObjectId = 0;
const FOV_Y_RAD = (60 * Math.PI) / 180;

function buildModelMatrix(transform: Transform) {
  const translation = mat4.translation(transform.tx, transform.ty, transform.tz);
  const rotationX = mat4.rotationX(transform.rx);
  const rotationY = mat4.rotationY(transform.ry);
  const rotationZ = mat4.rotationZ(transform.rz);
  const scaling = mat4.scaling(transform.sx, transform.sy, transform.sz);
  const rotation = mat4.multiply(rotationZ, mat4.multiply(rotationY, rotationX));

  return mat4.multiply(translation, mat4.multiply(rotation, scaling));
}

function transformPoint(m: Float32Array, point: [number, number, number]): [number, number, number] {
  const [x, y, z] = point;

  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function getObjectWorldBounds(object: SceneObject) {
  const model = buildModelMatrix(object.transform);
  const worldCenter = transformPoint(model, object.meshData.bounds.center);
  const maxScale = Math.max(
    Math.abs(object.transform.sx),
    Math.abs(object.transform.sy),
    Math.abs(object.transform.sz),
  );

  return {
    center: worldCenter,
    radius: object.meshData.bounds.radius * maxScale,
  };
}

function ensureObjectFits(camera: Camera, object: SceneObject) {
  const aspect = canvas.width / canvas.height;
  const { center, radius } = getObjectWorldBounds(object);
  camera.ensureSphereFits(center, radius, FOV_Y_RAD, aspect);
}

function ensureSelectedObjectFits(scene: Scene, camera: Camera) {
  const selected = getSelectedObject(scene);
  if (!selected) return;
  ensureObjectFits(camera, selected);
}

function addSceneObject(scene: Scene, obj: SceneObject) {
  const index = scene.objects.length;
  if (index > 0) {
    const offsetStep = Math.ceil(index / 2) * 2.5;
    obj.transform.tx = index % 2 === 1 ? offsetStep : -offsetStep;
  }
  scene.objects.push(obj);
  return obj;
}

function addObjectToScene(scene: Scene, type: "cube" | "sphere") {
  const obj = createSceneObject(type);
  return addSceneObject(scene, obj);
}

function selectObject(scene: Scene, id: number) {
  scene.selectedObjectId = id;
  for (const obj of scene.objects) {
    obj.selected = (obj.id === id);
  }
  console.log(`Selected object: ${scene.objects.find(o => o.id === id)?.name ?? "None"}`);
}

function getSceneObjects(scene: Scene) {
  return scene.objects;
}

function getSelectedObject(scene: Scene) {
  return scene.objects.find(object => object.id === scene.selectedObjectId) ?? null;
}

function updateObjectTextureBindGroup(object: SceneObject) {
  const textureView = object.useTexture && object.textureView
    ? object.textureView
    : fallbackWhiteTextureView;

  object.textureBindGroup = createMaterialTextureBindGroup(textureView);
}

async function uploadTextureToObject(object: SceneObject, file: File) {
  const bitmap = await createImageBitmap(file);
  const texture = createTextureFromBitmap(bitmap);

  object.textureGpu?.destroy();
  object.textureGpu = texture;
  object.textureView = texture.createView();
  object.textureName = file.name;
  object.hasTexture = true;
  object.useTexture = true;
  updateObjectTextureBindGroup(object);
}

function setObjectTextureEnabled(object: SceneObject, enabled: boolean) {
  object.useTexture = enabled && object.hasTexture && object.textureView !== null;
  updateObjectTextureBindGroup(object);
}

function updateSelectedTransform(scene: Scene, key: keyof Transform, value: number) {
  const selected = getSelectedObject(scene);
  if (!selected) return;
  selected.transform[key] = value;
}

function shouldEnsureFitOnTransformChange(key: keyof Transform) {
  return key === "tx" || key === "ty" || key === "tz" || key === "sx" || key === "sy" || key === "sz";
}

function normalizeCameraKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key;
}

function shouldIgnoreKeyboardCameraInput(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.closest("#gui") !== null || target.isContentEditable);
}


// Uniform buffer  structure
//
// Layout (byte offsets):
//   0   mvp        mat4   64 B
//   64  model      mat4   64 B
//   128 normalMat  mat4   64 B
//   192 lightPos   vec3   12 B  + 4 pad
//   208 lightColor vec3   12 B  + 4 pad
//   224 ambient    f32     4 B
//   228 diffuse    f32     4 B
//   232 specular   f32     4 B
//   236 shininess  f32     4 B
//   240 camPos     vec3   12 B
//   252 model_id   u32     4 B  ← packed with camPos pad
//   256 objectColor vec3  12 B
//   268 time       f32     4 B
//   272 useTexture u32     4 B
// ─────────────────────────────────────────────────────────────────────────────
const UNIFORM_SIZE = 288;

const uArrayBuf = new ArrayBuffer(UNIFORM_SIZE);
const uData     = new Float32Array(uArrayBuf);
const uData32   = new Uint32Array(uArrayBuf);

// Pipeline
const shader = device.createShaderModule({ label: "Scene Shader", code: shaderCode });
const vertexBuffers = [{
  arrayStride: 8 * 4,
  attributes: [
    { shaderLocation: 0, offset: 0,     format: "float32x3" }, // position
    { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // normal
    { shaderLocation: 2, offset: 6 * 4, format: "float32x2" }, // uv
  ],
}];

const uniformBindGroupLayout = device.createBindGroupLayout({
  label: "Object Uniforms Layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: {},
  }],
});

normalTextureBindGroupLayout = device.createBindGroupLayout({
  label: "Normal Texture Layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.FRAGMENT,
    texture: {},
  }],
});

const materialTextureBindGroupLayout = device.createBindGroupLayout({
  label: "Material Texture Layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: {},
    },
  ],
});

const normalPipelineLayout = device.createPipelineLayout({
  label: "Normal Pipeline Layout",
  bindGroupLayouts: [uniformBindGroupLayout],
});

const lightingPipelineLayout = device.createPipelineLayout({
  label: "Lighting Pipeline Layout",
  bindGroupLayouts: [uniformBindGroupLayout, normalTextureBindGroupLayout, materialTextureBindGroupLayout],
});

const baseTextureSampler = device.createSampler({
  addressModeU: "repeat",
  addressModeV: "repeat",
  magFilter: "linear",
  minFilter: "linear",
  mipmapFilter: "linear",
});

const fallbackWhiteTexture = await createSolidColorTexture([255, 255, 255, 255]);
const fallbackWhiteTextureView = fallbackWhiteTexture.createView();

function createMaterialTextureBindGroup(textureView: GPUTextureView) {
  return device.createBindGroup({
    layout: materialTextureBindGroupLayout,
    entries: [
      { binding: 0, resource: baseTextureSampler },
      { binding: 1, resource: textureView },
    ],
  });
}

const normalPipeline = device.createRenderPipeline({
  label: "Normal Pipeline",
  layout: normalPipelineLayout,
  vertex: {
    module: shader,
    entryPoint: "scene_vs",
    buffers: vertexBuffers,
  },
  fragment: {
    module: shader,
    entryPoint: "normal_fs",
    targets: [{ format: "rgba16float" }],
  },
  primitive: { topology: "triangle-list", cullMode: "back" },
  depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
});

const lightingPipeline = device.createRenderPipeline({
  label: "Lighting Pipeline",
  layout: lightingPipelineLayout,
  vertex: {
    module: shader,
    entryPoint: "scene_vs",
    buffers: vertexBuffers,
  },
  fragment: {
    module: shader,
    entryPoint: "lighting_fs",
    targets: [{ format }],
  },
  primitive: { topology: "triangle-list", cullMode: "back" },
  depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
});

resize();
window.addEventListener("resize", resize);

function createObjectUniformBuffer() {
  return device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

function createSceneObjectFromMesh(type: SceneObjectType, meshData: MeshData): SceneObject {
  const texturedMeshData = generateSphericalUvMesh(meshData);
  const gpuMesh = uploadMesh(texturedMeshData);

  const uniformBuffer = createObjectUniformBuffer();
  const bindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const id = nextSceneObjectId++;
  const baseName =
    type === "cube" ? "Cube" :
    type === "sphere" ? "Sphere" :
    "OBJ";

  return {
    id,
    name: `${baseName} ${id + 1}`,
    type,
    meshData: texturedMeshData,
    gpuMesh,
    uniformBuffer,
    bindGroup,
    useTexture: false,
    hasTexture: false,
    textureName: null,
    textureGpu: null,
    textureView: null,
    textureBindGroup: createMaterialTextureBindGroup(fallbackWhiteTextureView),
    transform: createDefaultTransform(),
    selected: false,
  };
}


function createSceneObject(type: SceneObjectType): SceneObject {
  let meshData: MeshData;

  if (type === "cube") {
    meshData = generateCube();
  } else if (type === "sphere") {
    meshData = generateSphere(64, 64);
  } else {
    throw new Error("OBJ scene objects should be created from a loaded mesh");
  }

  return createSceneObjectFromMesh(type, meshData);
}


const scene = createScene();
const initialObject = addObjectToScene(scene, "cube");
selectObject(scene, initialObject.id);

// GUI
initGUI({
  
  onAddObject: shape => {
    const object = addObjectToScene(scene, shape);
    selectObject(scene, object.id);
    ensureSelectedObjectFits(scene, camera);
  },
  onSelectObject: id => {
    selectObject(scene, id);
    ensureSelectedObjectFits(scene, camera);
  },
  getObjects: () => getSceneObjects(scene),
  getSelectedObject: () => getSelectedObject(scene),
  getSelectedObjectTextureState: () => {
    const object = getSelectedObject(scene);
    if (!object) return null;

    return {
      hasTexture: object.hasTexture,
      useTexture: object.useTexture,
      textureName: object.textureName,
    };
  },
  onUpdateTransform: (key, value) => {
    updateSelectedTransform(scene, key, value);
    if (shouldEnsureFitOnTransformChange(key)) {
      ensureSelectedObjectFits(scene, camera);
    }
  },
  onAddObj: async (file: File) => {
    const text = await file.text();
    const meshData = parseOBJ(text);
    const object = createSceneObjectFromMesh("obj", meshData);
    addSceneObject(scene, object);
    selectObject(scene, object.id);
    ensureSelectedObjectFits(scene, camera);
  },
  onUploadTexture: async (file: File) => {
    const selected = getSelectedObject(scene);
    if (!selected) return;
    await uploadTextureToObject(selected, file);
  },
  onToggleTexture: enabled => {
    const selected = getSelectedObject(scene);
    if (!selected) return;
    setObjectTextureEnabled(selected, enabled);
  },
});

// Camera
const camera = new Camera();
camera.setPose([0, 0, 5], [0, 0, 0]);
ensureSelectedObjectFits(scene, camera);

const keys = new Set<string>();
window.addEventListener("keydown", event => {
  if (shouldIgnoreKeyboardCameraInput(event.target)) return;
  keys.add(normalizeCameraKey(event.key));
});
window.addEventListener("keyup", event => {
  keys.delete(normalizeCameraKey(event.key));
});
window.addEventListener("blur", () => {
  keys.clear();
  endOrbit();
});
window.addEventListener("resize", () => ensureSelectedObjectFits(scene, camera));

const ORBIT_SENSITIVITY_X = 0.01;
const ORBIT_SENSITIVITY_Y = 0.01;
const WHEEL_ZOOM_SENSITIVITY = 0.01;

let isOrbiting = false;
let orbitPointerId: number | null = null;
let lastPointerX = 0;
let lastPointerY = 0;

function setOrbitingCursorState(nextIsOrbiting: boolean) {
  isOrbiting = nextIsOrbiting;
  canvas.classList.toggle("is-orbiting", nextIsOrbiting);
}

function endOrbit(pointerId?: number) {
  if (pointerId !== undefined && orbitPointerId !== pointerId) return;

  if (orbitPointerId !== null && canvas.hasPointerCapture(orbitPointerId)) {
    canvas.releasePointerCapture(orbitPointerId);
  }

  orbitPointerId = null;
  setOrbitingCursorState(false);
}

function getWheelDeltaPixels(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * canvas.clientHeight;
  }

  return event.deltaY;
}

canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;

  orbitPointerId = event.pointerId;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  setOrbitingCursorState(true);
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener("pointermove", event => {
  if (!isOrbiting || orbitPointerId !== event.pointerId) return;

  const deltaX = event.clientX - lastPointerX;
  const deltaY = event.clientY - lastPointerY;

  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  if (deltaX === 0 && deltaY === 0) return;

  camera.orbit(-deltaX * ORBIT_SENSITIVITY_X, deltaY * ORBIT_SENSITIVITY_Y);
  event.preventDefault();
});

canvas.addEventListener("pointerup", event => {
  endOrbit(event.pointerId);
});

canvas.addEventListener("pointercancel", event => {
  endOrbit(event.pointerId);
});

canvas.addEventListener("lostpointercapture", event => {
  if (orbitPointerId === event.pointerId) {
    orbitPointerId = null;
    setOrbitingCursorState(false);
  }
});

canvas.addEventListener(
  "wheel",
  event => {
    event.preventDefault();
    camera.zoom(getWheelDeltaPixels(event) * WHEEL_ZOOM_SENSITIVITY);
  },
  { passive: false },
);

function updateObjectUniforms(
  object: SceneObject,
  proj: Float32Array,
  view: Float32Array,
  cameraPos: [number, number, number],
  lightPos: [number, number, number],
  lightColor: [number, number, number],
  objectColor: [number, number, number],
  time: number,
) {
  const model = buildModelMatrix(object.transform);
  const normM = mat4.normalMatrix(model);
  const mvp = mat4.multiply(mat4.multiply(proj, view), model);

  uData.set(mvp, 0);
  uData.set(model, 16);
  uData.set(normM, 32);
  uData[48] = lightPos[0];   uData[49] = lightPos[1];   uData[50] = lightPos[2];   uData[51] = 0;
  uData[52] = lightColor[0]; uData[53] = lightColor[1]; uData[54] = lightColor[2]; uData[55] = 0;
  uData[56] = gui.ambient;   uData[57] = gui.diffuse;   uData[58] = gui.specular;   uData[59] = gui.shininess;
  uData[60] = cameraPos[0];  uData[61] = cameraPos[1];  uData[62] = cameraPos[2];
  uData32[63] = gui.modelId;
  uData[64] = objectColor[0]; uData[65] = objectColor[1]; uData[66] = objectColor[2];
  uData[67] = time;
  uData32[68] = object.useTexture && object.hasTexture ? 1 : 0;

  device.queue.writeBuffer(object.uniformBuffer, 0, uArrayBuf);
}

function drawSceneObjects(pass: GPURenderPassEncoder, includeMaterial = false) {
  for (const object of scene.objects) {
    pass.setBindGroup(0, object.bindGroup);
    if (includeMaterial) {
      pass.setBindGroup(2, object.textureBindGroup);
    }
    pass.setVertexBuffer(0, object.gpuMesh.vertexBuffer);
    pass.setIndexBuffer(object.gpuMesh.indexBuffer, object.gpuMesh.indexFormat);
    pass.drawIndexed(object.gpuMesh.indexCount);
  }
}


// Render loop
let lastTime    = performance.now();
const startTime = performance.now();

function frame(now: number) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  const t  = (now - startTime) / 1000;

  camera.update(keys, dt);

  const aspect = canvas.width / canvas.height;
  const proj   = mat4.perspective(FOV_Y_RAD, aspect, 0.1, 500);
  const view   = camera.getViewMatrix();

  let lx = gui.lightX, ly = gui.lightY, lz = gui.lightZ;
  if (gui.autoRotLight) {
    lx = Math.cos(t * 0.8) * 4.5;
    lz = Math.sin(t * 0.8) * 4.5;
    updateLightDisplay(lx, lz);
  }

  const [or, og, ob] = hexToRgb(gui.objectColor);
  const [lr, lg, lb] = hexToRgb(gui.lightColor);
  const cameraPos = camera.getPosition();
  for (const object of scene.objects) {
    updateObjectUniforms(
      object,
      proj,
      view,
      cameraPos,
      [lx, ly, lz],
      [lr, lg, lb],
      [or, og, ob],
      t,
    );
  }

  if (!depthTexture || !gNormalTextureView || !normalTextureBindGroup) {
    requestAnimationFrame(frame);
    return;
  }

  const encoder = device.createCommandEncoder();
  const normalPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: gNormalTextureView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store",
    },
  });
  normalPass.setPipeline(normalPipeline);
  drawSceneObjects(normalPass);
  normalPass.end();

  const lightingPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.08, g: 0.08, b: 0.12, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store",
    },
  });
  lightingPass.setPipeline(lightingPipeline);
  lightingPass.setBindGroup(1, normalTextureBindGroup);
  drawSceneObjects(lightingPass, true);
  lightingPass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
