declare global {
  type GPUBufferSource = ArrayBufferLike | ArrayBufferView<ArrayBufferLike>;

  interface Navigator {
    gpu: {
      requestAdapter(): Promise<GPUAdapter | null>;
      getPreferredCanvasFormat(): GPUTextureFormat;
    };
  }

  interface HTMLCanvasElement {
    getContext(contextId: "webgpu"): GPUCanvasContext | null;
  }

  type GPUAdapter = {
    requestDevice(): Promise<GPUDevice>;
  };

  type GPUDevice = {
    queue: {
      writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: GPUBufferSource): void;
      copyExternalImageToTexture(source: unknown, destination: unknown, copySize: unknown): void;
      submit(commandBuffers: GPUCommandBuffer[]): void;
    };
    createTexture(descriptor: unknown): GPUTexture;
    createBuffer(descriptor: unknown): GPUBuffer;
    createSampler(descriptor: unknown): GPUSampler;
    createShaderModule(descriptor: unknown): GPUShaderModule;
    createRenderPipeline(descriptor: unknown): GPURenderPipeline;
    createBindGroup(descriptor: unknown): GPUBindGroup;
    createBindGroupLayout(descriptor: unknown): GPUBindGroupLayout;
    createPipelineLayout(descriptor: unknown): GPUPipelineLayout;
    createCommandEncoder(): GPUCommandEncoder;
  };

  type GPUCanvasContext = {
    configure(descriptor: unknown): void;
    getCurrentTexture(): GPUTexture;
  };

  type GPUTexture = {
    createView(): GPUTextureView;
    destroy(): void;
  };

  type GPUTextureView = unknown;
  type GPUBuffer = {
    destroy(): void;
  };
  type GPUSampler = unknown;
  type GPUBindGroup = unknown;
  type GPUBindGroupLayout = unknown;
  type GPUPipelineLayout = unknown;
  type GPUShaderModule = unknown;
  type GPURenderPipeline = {
    getBindGroupLayout(index: number): unknown;
  };
  type GPUCommandBuffer = unknown;
  type GPURenderPassEncoder = {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    setVertexBuffer(slot: number, buffer: GPUBuffer): void;
    setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat): void;
    drawIndexed(indexCount: number): void;
    end(): void;
  };
  type GPUCommandEncoder = {
    beginRenderPass(descriptor: unknown): GPURenderPassEncoder;
    finish(): GPUCommandBuffer;
  };

  type GPUTextureFormat = string;
  type GPUIndexFormat = "uint16" | "uint32";

  const GPUTextureUsage: {
    RENDER_ATTACHMENT: number;
    TEXTURE_BINDING: number;
    COPY_DST: number;
  };

  const GPUBufferUsage: {
    COPY_DST: number;
    INDEX: number;
    UNIFORM: number;
    VERTEX: number;
  };

  const GPUShaderStage: {
    VERTEX: number;
    FRAGMENT: number;
  };
}

export {};
