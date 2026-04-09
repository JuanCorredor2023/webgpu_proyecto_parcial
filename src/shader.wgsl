// shader.wgsl
// model_id values:
//   0 = Flat
//   1 = Gouraud
//   2 = Phong
//   3 = Blinn-Phong

struct Uniforms {
  mvp         : mat4x4<f32>,
  model       : mat4x4<f32>,
  normalMat   : mat4x4<f32>,

  lightPos    : vec3<f32>,
  _p0         : f32,

  lightColor  : vec3<f32>,
  _p1         : f32,

  ambient     : f32,
  diffuse     : f32,
  specular    : f32,
  shininess   : f32,

  camPos      : vec3<f32>,
  model_id    : u32,

  objectColor : vec3<f32>,
  time        : f32,
  useTexture  : u32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(1) @binding(0) var gNormalTexture : texture_2d<f32>;
@group(2) @binding(0) var baseSampler : sampler;
@group(2) @binding(1) var baseTexture : texture_2d<f32>;

const DEBUG_NORMAL_BUFFER = false;

struct VSIn {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
};

struct VSOut {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) worldPos      : vec3<f32>,
  @location(1) worldNormal   : vec3<f32>,
  @location(2) uv            : vec2<f32>,
  @location(3) gouraudColor  : vec3<f32>,
};

struct WireframeVSOut {
  @builtin(position) clipPos : vec4<f32>,
};

fn flatLighting(fragWorldPos: vec3<f32>) -> vec3<f32> {
  let dx = dpdx(fragWorldPos);
  let dy = dpdy(fragWorldPos);
  let faceN = normalize(cross(dx, dy));

  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL = max(dot(faceN, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, faceN);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return ambientC + diffuseC + specularC;
}

fn gouraudLighting(N: vec3<f32>, vertWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - vertWorldPos);
  let V = normalize(u.camPos - vertWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, N);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return ambientC + diffuseC + specularC;
}

fn phongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, N);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return ambientC + diffuseC + specularC;
}

fn blinnPhongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;
  let NdotL = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    specularC = u.specular * pow(NdotH, u.shininess) * u.lightColor;
  }

  return ambientC + diffuseC + specularC;
}

fn loadNormalFromBuffer(fragCoord: vec4<f32>) -> vec3<f32> {
  let pixelCoord = vec2<i32>(fragCoord.xy);
  let storedNormal = textureLoad(gNormalTexture, pixelCoord, 0).xyz;
  return normalize(storedNormal);
}

fn sampleAlbedo(uv: vec2<f32>) -> vec3<f32> {
  if u.useTexture == 0u {
    return u.objectColor;
  }

  let dimensions = vec2<f32>(textureDimensions(baseTexture));
  let wrappedUv = fract(uv);
  let texelPos = min(wrappedUv * dimensions, dimensions - vec2<f32>(1.0));
  let texelCoord = vec2<i32>(texelPos);
  let texel = textureLoad(baseTexture, texelCoord, 0).rgb;
  return texel * u.objectColor;
}

@vertex
fn scene_vs(input: VSIn) -> VSOut {
  var out: VSOut;

  let worldPos4 = u.model * vec4<f32>(input.position, 1.0);
  let worldNormal4 = u.normalMat * vec4<f32>(input.normal, 0.0);

  out.clipPos = u.mvp * vec4<f32>(input.position, 1.0);
  out.worldPos = worldPos4.xyz;
  out.worldNormal = normalize(worldNormal4.xyz);
  out.uv = input.uv;

  if u.model_id == 1u {
    out.gouraudColor = gouraudLighting(out.worldNormal, out.worldPos);
  } else {
    out.gouraudColor = vec3<f32>(0.0);
  }

  return out;
}

@fragment
fn normal_fs(input: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(normalize(input.worldNormal), 1.0);
}

@fragment
fn normals_debug_fs(input: VSOut) -> @location(0) vec4<f32> {
  let remappedNormal = normalize(input.worldNormal) * 0.5 + vec3<f32>(0.5);
  return vec4<f32>(remappedNormal, 1.0);
}

@fragment
fn uv_debug_fs(input: VSOut) -> @location(0) vec4<f32> {
  let wrappedUv = fract(input.uv);
  return vec4<f32>(vec3<f32>(wrappedUv, 0.0), 1.0);
}

@fragment
fn lighting_fs(input: VSOut) -> @location(0) vec4<f32> {
  if DEBUG_NORMAL_BUFFER {
    let debugNormal = loadNormalFromBuffer(input.clipPos);
    return vec4<f32>(debugNormal * 0.5 + vec3<f32>(0.5), 1.0);
  }

  let albedo = sampleAlbedo(input.uv);
  var lighting: vec3<f32>;

  switch u.model_id {
    case 0u: {
      lighting = flatLighting(input.worldPos);
    }
    case 1u: {
      lighting = input.gouraudColor;
    }
    case 2u: {
      let N = loadNormalFromBuffer(input.clipPos);
      lighting = phongLighting(N, input.worldPos);
    }
    default: {
      let N = loadNormalFromBuffer(input.clipPos);
      lighting = blinnPhongLighting(N, input.worldPos);
    }
  }

  return vec4<f32>(lighting * albedo, 1.0);
}

@vertex
fn wireframe_vs(input: VSIn) -> WireframeVSOut {
  var out: WireframeVSOut;
  out.clipPos = u.mvp * vec4<f32>(input.position, 1.0);
  return out;
}

@fragment
fn wireframe_fs() -> @location(0) vec4<f32> {
  return vec4<f32>(u.objectColor, 1.0);
}

@fragment
fn vertex_point_fs() -> @location(0) vec4<f32> {
  let pointColor = min(u.objectColor + vec3<f32>(0.45), vec3<f32>(1.0));
  return vec4<f32>(pointColor, 1.0);
}
