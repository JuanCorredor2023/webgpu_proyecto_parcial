# 2nd Midterm Requirements

This file collects the requirements provided for the 2nd Midterm assignment.

Note:
- The original list skips item 7. It is preserved here as provided.

## Progress Status

Legend:
- `[x]` Completed
- `[~]` Partial
- `[ ]` Not started

## Current Gaps

- Pending: tasks 5 and 11.
- Partial: task 9, because zoom is implemented but custom triangle clipping is still missing.
- Task 7 does not appear in the original requirement list.

## Tasks

1. Load the mesh into an indexed mesh data structure that allows easy iteration through triangles. The input format is OBJ. You may write your own importer or use an existing library. (10%)

   Status: `[x]`
   Notes:
   - There is now a `MeshData` indexed mesh structure with `positions`, `indices`, `normals`, `uvs`, and `bounds`.
   - The project parses OBJ files, uploads them as indexed geometry, and renders them with `drawIndexed`.
   - Cube, sphere, and imported OBJ now share the same mesh/upload/render path.

2. Some meshes are provided in `data.zip`.

   The beacon is bounded by a sphere with:
- center `C = [125, 125, 125]`
- radius `r = 125`

   The teapot is bounded by a bounding box with:
- center `C = [0.217, 1.575, 0]`
- minimum `[-3, 0, -2]`
- maximum `[3.434, 3.15, 2.0]`

   Set the view-model transformation so that the entire objects fit into the camera viewing frustum. (10%)

   Status: `[x]`
   Notes:
   - The project now computes world-space object bounds from mesh bounds and transform, and includes bounds-based camera fit helpers.
   - Selecting or creating/loading an object updates the camera target to that object and preserves the current zoom whenever the object already fits.
   - If the current zoom is too close, the camera only increases distance as much as needed so the full object fits in the viewing frustum.
   - While an object is selected, translate changes keep the camera target locked to the object's center, and scale changes only push the camera back when the object stops fitting.

3. For each triangle, calculate a per-face normal as a normalized cross product of the three vertex coordinates, and calculate a vertex normal for each vertex from the face normals. (10%)

   Status: `[x]`
   Notes:
   - The project now has general `computeFaceNormals(...)` and `computeVertexNormals(...)` utilities for indexed meshes.
   - Imported OBJ meshes now recompute vertex normals from triangle face normals instead of relying on normals from the file.
   - Built-in indexed meshes also have the required face-normal / vertex-normal workflow available.

4. Implement Arcball controls either by transforming the camera or the model relative to the object's bounding sphere around the center of the object so that you can see the entire object from all viewpoints. Therefore, no clipping should be needed to implement this part.

   Reference:
- http://courses.cms.caltech.edu/cs171/assignments/hw3/hw3-notes/notes-hw3.html

   (35%)

   Status: `[x]`
   Notes:
   - The camera now uses an orbital setup based on `target`, `distance`, `yaw`, and `pitch`, with the selected object's center as the orbit target.
   - Arcball interaction is wired to the canvas: left click + drag orbits around the selected object, and mouse wheel / Mac trackpad wheel events zoom in and out.
   - The target remains centered on the selected object during orbit, and pitch stays clamped to avoid flipping.
   - Object selection, creation, and OBJ loading all reuse the bounds-based framing logic so the object is kept visible without requiring clipping for this part.

5. Perform triangle rasterization using barycentric coordinate interpolation for each triangle fragment. (5%)

   Status: `[ ]`
   Notes:
   - Rendering currently relies on the normal WebGPU pipeline rasterizer.
   - There is no explicit barycentric rasterization implementation in your own pipeline/code.

6. Create and store a normal buffer, where RGB represents XYZ of a normal vector, and store there the normal transformed into the space in which shading is performed.

   Hint:
- https://learnopengl.com/Advanced-Lighting/Deferred-Shading

   (10%)

   Status: `[x]`
   Notes:
   - The renderer now performs an offscreen normal pass into an `rgba16float` normal buffer in world space.
   - The normal buffer is recreated on resize and reused by the lighting pass as a texture input.

8. Perform Gouraud shading and Phong shading with one light source placed somewhere above the camera, using the normal stored in the normal buffer, and store the shading result into the color buffer displayed on the screen. (10%)

   Status: `[x]`
   Notes:
   - The final color is rendered to the swapchain in the second pass.
   - Phong shading uses the stored normal buffer, and Blinn-Phong reuses the same buffer-driven path as an extra mode.
   - Gouraud remains authentic per-vertex shading in the forward path; it is intentionally not driven by the normal buffer because that would change it into per-fragment shading.
   - The scene keeps a single configurable light source with the current behavior used by the shading modes in this delivery.

9. Implement zooming functionality and the necessary triangle clipping. (5%)

   Status: `[~]`
   Notes:
   - There is now explicit zoom functionality through camera distance changes, available from both keyboard fallback (`W`/`S`) and canvas wheel/trackpad input.
   - There is still no custom triangle clipping stage implemented.

10. Perform texture parameterization with spherical coordinates and map a texture onto the object. (15%)

   Status: `[x]`
   Notes:
   - All meshes now receive spherical UV parameterization before upload, including seam correction for triangles that cross `u = 0/1`.
   - The inspector now supports per-object texture upload and a `Use texture` toggle for the selected object.
   - The renderer samples uploaded textures in all shading modes and modulates them with `objectColor`.
   - A WebGPU regression introduced during this task was fixed by aligning the shader uniform layout with the CPU uniform buffer and by creating uploaded textures with the required usage flags.

11. Create wireframe model rendering with hidden surface removal. (10%)

   Status: `[ ]`
   Notes:
   - There is no wireframe rendering mode implemented yet.
