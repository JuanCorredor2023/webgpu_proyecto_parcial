// Shared GUI state (read by the render loop in main.ts)
export type DisplayMode = "shaded" | "wireframe";

export const gui = {
  modelId: 0,
  displayMode: "shaded" as DisplayMode,
  ambient: 0.12,
  diffuse: 0.75,
  specular: 0.6,
  shininess: 32,
  lightX: 3.0,
  lightY: 4.0,
  lightZ: 3.0,
  autoRotLight: true,
  objectColor: "#4a9eff",
  lightColor: "#ffffff",
};

export type Shape = "cube" | "sphere";
export type TransformKey = "tx" | "ty" | "tz" | "rx" | "ry" | "rz" | "sx" | "sy" | "sz";
type GUIObjectType = Shape | "obj";

type GUITransform = Record<TransformKey, number>;

type GUIObject = {
  id: number;
  name: string;
  type: GUIObjectType;
  transform: GUITransform;
};

type GUITextureState = {
  hasTexture: boolean;
  useTexture: boolean;
  textureName: string | null;
};

type GUIBindings = {
  onAddObject: (shape: Shape) => void;
  onAddObj: (file: File) => Promise<void> | void;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  onUploadTexture: (file: File) => Promise<void> | void;
  onToggleTexture: (enabled: boolean) => void;
  onSelectObject: (id: number) => void;
  getObjects: () => GUIObject[];
  getSelectedObject: () => GUIObject | null | undefined;
  getSelectedObjectTextureState: () => GUITextureState | null | undefined;
  onUpdateTransform: (key: TransformKey, value: number) => void;
};

const numericControlIds = [
  "ambient",
  "diffuse",
  "specular",
  "shininess",
  "lightX",
  "lightY",
  "lightZ",
] as const;

// Colour utility
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const MODEL_DESCS: Record<number, string> = {
  0: "Flat shading active. Face normal is derived per triangle.",
  1: "Gouraud shading active. Lighting is computed per vertex and interpolated.",
  2: "Phong shading active. Lighting is computed per fragment using interpolated normals.",
  3: "Blinn-Phong shading active. Specular uses the half-vector H = normalize(L + V).",
};

const FUTURE_MODE_LABELS = [
  "Normals",
  "Depth",
  "Texture",
  "UV Coords",
];

const TRANSFORM_CONTROLS: Array<{ id: string; key: TransformKey }> = [
  { id: "tr-tx", key: "tx" },
  { id: "tr-ty", key: "ty" },
  { id: "tr-tz", key: "tz" },
  { id: "tr-rx", key: "rx" },
  { id: "tr-ry", key: "ry" },
  { id: "tr-rz", key: "rz" },
  { id: "tr-sx", key: "sx" },
  { id: "tr-sy", key: "sy" },
  { id: "tr-sz", key: "sz" },
];

const EMPTY_TRANSFORM: GUITransform = {
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

function formatSliderValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function slider(
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  disabled = false,
) {
  const disabledAttr = disabled ? "disabled" : "";
  const disabledClass = disabled ? " is-disabled" : "";

  return `
  <div class="slider-row${disabledClass}">
    <span class="slider-label">${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" ${disabledAttr}>
    <span class="slider-val" id="${id}-val">${formatSliderValue(value)}</span>
  </div>`;
}

function fileInput(id: string, label: string, accept = "", disabled = false) {
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? "disabled" : "";
  const acceptAttr = accept ? `accept="${accept}"` : "";

  return `
  <label class="file-input${disabledClass}">
    <input type="file" id="${id}" ${acceptAttr} ${disabledAttr}>
    <span>${label}</span>
  </label>`;
}

function renderFutureModeButtons() {
  return FUTURE_MODE_LABELS.map(label => `<button class="placeholder-btn" type="button" disabled>${label}</button>`).join("");
}

function getDisplayModeDescription() {
  return gui.displayMode === "wireframe"
    ? "Wireframe active. Hidden surfaces are removed with a depth prepass."
    : "Wireframe inactive. The selected shading model remains ready for the main render path.";
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Update the auto-rotating light display
export function updateLightDisplay(lx: number, lz: number) {
  const lightX = document.getElementById("lightX") as HTMLInputElement | null;
  const lightXVal = document.getElementById("lightX-val");
  const lightZ = document.getElementById("lightZ") as HTMLInputElement | null;
  const lightZVal = document.getElementById("lightZ-val");

  if (lightX) lightX.value = lx.toFixed(1);
  if (lightXVal) lightXVal.textContent = lx.toFixed(1);
  if (lightZ) lightZ.value = lz.toFixed(1);
  if (lightZVal) lightZVal.textContent = lz.toFixed(1);
}

function updateModeDescription() {
  setText("model-desc", MODEL_DESCS[gui.modelId]);
}

function updateDisplayModeUi() {
  const button = document.getElementById("wireframe-mode") as HTMLButtonElement | null;
  if (button) {
    button.classList.toggle("active", gui.displayMode === "wireframe");
  }

  setText("midterm-mode-desc", getDisplayModeDescription());
}

function setSliderState(id: string, value: number, disabled: boolean) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const valueLabel = document.getElementById(`${id}-val`);
  const row = input?.closest(".slider-row");

  if (!input || !valueLabel || !row) return;

  input.value = String(value);
  input.disabled = disabled;
  valueLabel.textContent = formatSliderValue(value);
  row.classList.toggle("is-disabled", disabled);
}

function setFileInputState(id: string, disabled: boolean) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const row = input?.closest(".file-input");
  if (!input || !row) return;

  input.disabled = disabled;
  row.classList.toggle("is-disabled", disabled);
}

function setCheckboxState(id: string, checked: boolean, disabled: boolean) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const row = input?.closest(".checkbox-row");
  if (!input || !row) return;

  input.checked = checked;
  input.disabled = disabled;
  row.classList.toggle("is-disabled", disabled);
}

function renderObjectList(bindings: GUIBindings) {
  const objectList = document.getElementById("object-list");
  if (!objectList) return;

  const objects = bindings.getObjects();
  const selected = bindings.getSelectedObject();

  objectList.innerHTML = "";

  if (objects.length === 0) {
    const emptyState = document.createElement("button");
    emptyState.className = "obj-list-btn";
    emptyState.type = "button";
    emptyState.disabled = true;
    emptyState.textContent = "No objects in scene";
    objectList.appendChild(emptyState);
    return;
  }

  objects.forEach((object, index) => {
    const button = document.createElement("button");
    const isSelected = object.id === selected?.id;

    button.className = `obj-list-btn${isSelected ? " active" : ""}`;
    button.type = "button";
    button.textContent = `${index + 1}. ${object.name}${isSelected ? " (selected)" : ""}`;

    button.addEventListener("click", () => {
      bindings.onSelectObject(object.id);
      renderObjectList(bindings);
      renderInspector(bindings);
    });

    objectList.appendChild(button);
  });
}

function renderInspector(bindings: GUIBindings) {
  const selected = bindings.getSelectedObject();
  const textureState = bindings.getSelectedObjectTextureState();
  const transform = selected?.transform ?? EMPTY_TRANSFORM;
  const disabled = !selected;

  setText("inspector-title", selected ? `${selected.name} selected` : "No selection");
  setText(
    "transform-note",
    selected
      ? `Editing transform for ${selected.name}.`
      : "Select an object from the list to edit its transform.",
  );

  TRANSFORM_CONTROLS.forEach(({ id, key }) => {
    setSliderState(id, transform[key], disabled);
  });

  setFileInputState("tex-upload", disabled);
  setCheckboxState(
    "use-texture",
    textureState?.useTexture ?? false,
    disabled || !textureState?.hasTexture,
  );
  setText(
    "texture-status",
    selected
      ? (textureState?.hasTexture
          ? `Loaded: ${textureState.textureName ?? "Unnamed texture"}${textureState.useTexture ? "" : " (disabled)"}`
          : "No texture uploaded")
      : "Select an object from the list to upload a texture.",
  );
}

function refreshScenePanel(bindings: GUIBindings) {
  renderObjectList(bindings);
  renderInspector(bindings);
}

// initGUI — build the overlay and wire up all active events
export function initGUI(bindings: GUIBindings) {
  document.getElementById("gui")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "gui";
  overlay.innerHTML = `
<div class="gui-panel" id="panel-left">
  <div class="gui-title">Pipeline</div>

  <div class="gui-section">
    <div class="gui-label">Add Object</div>
    <div class="btn-row">
      <button class="shape-btn" data-shape="cube">Cube</button>
      <button class="shape-btn" data-shape="sphere">Sphere</button>
    </div>
    <div class="gui-label gui-label-spaced">Add OBJ Model</div>
    ${fileInput("obj-upload", "Upload OBJ", ".obj")}
  </div>

  <div class="gui-section">
    <div class="gui-label">Render Mode (Current)</div>
    <div class="btn-row">
      <button class="model-btn active" data-id="0">Flat</button>
      <button class="model-btn" data-id="1">Gouraud</button>
    </div>
    <div class="btn-row">
      <button class="model-btn" data-id="2">Phong</button>
      <button class="model-btn" data-id="3">Blinn-Phong</button>
    </div>
    <div class="mode-desc" id="model-desc"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Midterm Modes</div>
    <div class="btn-row">
      <button class="midterm-mode-btn${gui.displayMode === "wireframe" ? " active" : ""}" id="wireframe-mode" type="button">Wireframe</button>
      ${renderFutureModeButtons()}
    </div>
    <div class="mode-desc" id="midterm-mode-desc">${getDisplayModeDescription()}</div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Global Light</div>
    <div class="color-row">
      <span>Light Color</span>
      <input type="color" id="lightColor" value="${gui.lightColor}">
    </div>
    ${slider("lightX", "Light X", -8, 8, 0.1, gui.lightX)}
    ${slider("lightY", "Light Y", -8, 8, 0.1, gui.lightY)}
    ${slider("lightZ", "Light Z", -8, 8, 0.1, gui.lightZ)}
    <label class="checkbox-row">
      <input type="checkbox" id="autoRotLight" ${gui.autoRotLight ? "checked" : ""}>
      <span>Auto-rotate light</span>
    </label>
  </div>

  <div class="gui-hint">
    Canvas: drag orbits camera, wheel zooms<br>
    Keyboard fallback: arrows orbit, W/S zoom
  </div>
</div>

<div class="gui-panel" id="panel-right">
  <div class="gui-title">Scene</div>
  <div id="object-list"></div>

  <div class="btn-row gui-actions">
    <button class="placeholder-btn" type="button" disabled>Deselect</button>
    <button class="placeholder-btn" type="button" disabled>Remove</button>
  </div>

  <div id="inspector">
    <div class="inspector-sub-label" id="inspector-title">No selection</div>

    <div class="inspector-sub-label">Transform</div>
    ${slider("tr-tx", "Translate X", -12, 12, 0.05, 0, true)}
    ${slider("tr-ty", "Translate Y", -12, 12, 0.05, 0, true)}
    ${slider("tr-tz", "Translate Z", -12, 12, 0.05, 0, true)}
    ${slider("tr-rx", "Rotate X", -3.15, 3.15, 0.01, 0, true)}
    ${slider("tr-ry", "Rotate Y", -3.15, 3.15, 0.01, 0, true)}
    ${slider("tr-rz", "Rotate Z", -3.15, 3.15, 0.01, 0, true)}
    ${slider("tr-sx", "Scale X", 0.05, 6, 0.05, 1, true)}
    ${slider("tr-sy", "Scale Y", 0.05, 6, 0.05, 1, true)}
    ${slider("tr-sz", "Scale Z", 0.05, 6, 0.05, 1, true)}
    <div class="placeholder-note" id="transform-note">Select an object from the list to edit its transform.</div>

    <div class="inspector-sub-label">Material</div>
    ${slider("ambient", "Ambient (Ka)", 0, 1, 0.01, gui.ambient)}
    ${slider("diffuse", "Diffuse (Kd)", 0, 1, 0.01, gui.diffuse)}
    ${slider("specular", "Specular (Ks)", 0, 1, 0.01, gui.specular)}
    ${slider("shininess", "Shininess (n)", 1, 256, 1, gui.shininess)}
    <div class="color-row">
      <span>Object Color</span>
      <input type="color" id="objectColor" value="${gui.objectColor}">
    </div>

    <div class="inspector-sub-label">Texture (spherical UV)</div>
    ${fileInput("tex-upload", "Upload Texture", ".png,.jpg,.jpeg,.webp", true)}
    <label class="checkbox-row is-disabled">
      <input type="checkbox" id="use-texture" disabled>
      <span>Use texture</span>
    </label>
    <div class="placeholder-note" id="texture-status">Select an object from the list to upload a texture.</div>
  </div>
</div>`;

  document.body.appendChild(overlay);

  updateModeDescription();
  updateDisplayModeUi();
  refreshScenePanel(bindings);

  document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      gui.modelId = Number(btn.dataset.id);
      document.querySelectorAll(".model-btn").forEach(button => button.classList.remove("active"));
      btn.classList.add("active");
      updateModeDescription();
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".shape-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const shape = btn.dataset.shape as Shape;
      bindings.onAddObject(shape);
      refreshScenePanel(bindings);
    });
  });

  (document.getElementById("wireframe-mode") as HTMLButtonElement | null)?.addEventListener("click", () => {
    gui.displayMode = gui.displayMode === "wireframe" ? "shaded" : "wireframe";
    bindings.onChangeDisplayMode(gui.displayMode);
    updateDisplayModeUi();
  });

  (document.getElementById("obj-upload") as HTMLInputElement | null)?.addEventListener("change", async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    try {
      await bindings.onAddObj(file);
      refreshScenePanel(bindings);
    } catch (error) {
      console.error("OBJ upload failed:", error);
    } finally {
      input.value = "";
    }
  });

  (document.getElementById("tex-upload") as HTMLInputElement | null)?.addEventListener("change", async event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    try {
      await bindings.onUploadTexture(file);
      refreshScenePanel(bindings);
    } catch (error) {
      console.error("Texture upload failed:", error);
    } finally {
      input.value = "";
    }
  });

  TRANSFORM_CONTROLS.forEach(({ id, key }) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    const value = document.getElementById(`${id}-val`);

    if (!input || !value) return;

    input.addEventListener("input", () => {
      const nextValue = parseFloat(input.value);
      bindings.onUpdateTransform(key, nextValue);
      value.textContent = formatSliderValue(nextValue);
      renderInspector(bindings);
    });
  });

  numericControlIds.forEach(id => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    const value = document.getElementById(`${id}-val`);

    if (!input || !value) return;

    input.addEventListener("input", () => {
      const nextValue = parseFloat(input.value);
      gui[id] = nextValue;
      value.textContent = input.value;
    });
  });

  (document.getElementById("autoRotLight") as HTMLInputElement | null)?.addEventListener("change", event => {
    gui.autoRotLight = (event.target as HTMLInputElement).checked;
  });

  (document.getElementById("objectColor") as HTMLInputElement | null)?.addEventListener("input", event => {
    gui.objectColor = (event.target as HTMLInputElement).value;
  });

  (document.getElementById("lightColor") as HTMLInputElement | null)?.addEventListener("input", event => {
    gui.lightColor = (event.target as HTMLInputElement).value;
  });

  (document.getElementById("use-texture") as HTMLInputElement | null)?.addEventListener("change", event => {
    bindings.onToggleTexture((event.target as HTMLInputElement).checked);
    renderInspector(bindings);
  });
}
