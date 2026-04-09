import type { Mat4, Vec3 } from "./math";
import { mat4, vec3 } from "./math";

export class Camera {
  target: Vec3 = [0, 0, 0];
  distance = 6.0;
  minDistance = 0.25;
  maxDistance = 500.0;
  position: Vec3 = [0, 0.8, 6.0];
  yaw = -Math.PI / 2;
  pitch = 0;

  moveSpeed = 3.5;
  turnSpeed = 1.9;

  private clampPitch() {
    const lim = Math.PI / 2 - 0.01;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }
  
  private syncOrbitFromPosition() {
    const toTarget = vec3.sub(this.target, this.position);
    const rawDistance = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
    const safeDistance = Math.max(rawDistance, this.minDistance);

    this.distance = Math.min(this.maxDistance, safeDistance);
    this.yaw = Math.atan2(toTarget[2], toTarget[0]);

    const y = Math.max(-1, Math.min(1, toTarget[1] / this.distance));
    this.pitch = Math.asin(y);
    this.clampPitch();
  }

  private getFitDistance(radius: number, fovYRad: number, aspect: number, padding = 1.15) {
    const safeRadius = Math.max(radius, 0.0001);
    const halfFovY = fovYRad * 0.5;
    const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
    const halfFov = Math.max(0.01, Math.min(halfFovY, halfFovX));
    const fitDistance = (safeRadius / Math.sin(halfFov)) * padding;
    return Math.min(this.maxDistance, Math.max(this.minDistance, fitDistance));
  }

  getPosition(): Vec3 {
    const forward = this.getForward();
    return vec3.sub(this.target, vec3.scale(forward, this.distance));
  }

  setPose(position: Vec3, target: Vec3) {
    this.position = [position[0], position[1], position[2]];
    this.target = [target[0], target[1], target[2]];
    this.syncOrbitFromPosition();
  }

  lookAt(target: Vec3) {
    this.target = [target[0], target[1], target[2]];
    this.syncOrbitFromPosition();
  }

  setTarget(target: Vec3) {
    this.target = [target[0], target[1], target[2]];
    this.position = this.getPosition();
  }

  orbit(deltaYaw: number, deltaPitch: number) {
    this.yaw += deltaYaw;
    this.pitch += deltaPitch;
    this.clampPitch();
    this.position = this.getPosition();
  }

  zoom(delta: number) {
    const nextDistance = this.distance + delta;
    this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, nextDistance));
    this.position = this.getPosition();
  }
  
  getForward(): Vec3 {
    const cp = Math.cos(this.pitch);
    return vec3.normalize([
      Math.cos(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.sin(this.yaw) * cp,
    ]);
  }

  frameSphere(center: Vec3, radius: number, fovYRad: number, aspect: number, padding = 1.15) {
    this.target = [center[0], center[1], center[2]];
    this.distance = this.getFitDistance(radius, fovYRad, aspect, padding);
    this.position = this.getPosition();
  }

  ensureSphereFits(center: Vec3, radius: number, fovYRad: number, aspect: number, padding = 1.15) {
    this.setTarget(center);
    const fitDistance = this.getFitDistance(radius, fovYRad, aspect, padding);
    if (this.distance < fitDistance) {
      this.distance = fitDistance;
    }
    this.position = this.getPosition();
  }

  getViewMatrix(): Mat4 {
    const eye = this.getPosition();
    this.position = eye;
    return mat4.lookAt(eye, this.target, [0, 1, 0]);
  }

  update(keys: Set<string>, dt: number) {
    const orbitStep = this.turnSpeed * dt;
    const zoomStep = this.moveSpeed * dt;

    if (keys.has("ArrowLeft")) this.orbit(-orbitStep, 0);
    if (keys.has("ArrowRight")) this.orbit(orbitStep, 0);
    if (keys.has("ArrowUp")) this.orbit(0, orbitStep);
    if (keys.has("ArrowDown")) this.orbit(0, -orbitStep);

    if (keys.has("w")) this.zoom(-zoomStep);
    if (keys.has("s")) this.zoom(zoomStep);
  }

}
