"use client";
import { useEffect, useRef } from "react";
import type { Mesh as PCMesh } from "@/lib/types";

interface Props {
  mesh: PCMesh | null;
  className?: string;
  onScreenshot?: (dataUrl: string) => void;
}

export default function Preview3D({ mesh, className, onScreenshot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<any>({});

  useEffect(() => {
    if (!mesh || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (cancelled || !containerRef.current) return;

      // 清理舊內容
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }

      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x02133e);

      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(window.devicePixelRatio);
      containerRef.current.appendChild(renderer.domElement);

      // 建立 geometry
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(mesh.faces.length * 9);
      for (let i = 0; i < mesh.faces.length; i++) {
        const f = mesh.faces[i];
        for (let j = 0; j < 3; j++) {
          const v = mesh.vertices[f[j]];
          positions[i * 9 + j * 3] = v.x;
          positions[i * 9 + j * 3 + 1] = v.y;
          positions[i * 9 + j * 3 + 2] = v.z;
        }
      }
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();

      // 自動置中 + 縮放
      geo.computeBoundingSphere();
      const sphere = geo.boundingSphere!;
      geo.translate(-sphere.center.x, -sphere.center.y, -sphere.center.z);
      const scale = 2 / sphere.radius;
      geo.scale(scale, scale, scale);

      const mat = new THREE.MeshPhongMaterial({
        color: 0xf4b740,
        flatShading: true,
        side: THREE.DoubleSide,
      });
      const mesh3 = new THREE.Mesh(geo, mat);
      scene.add(mesh3);

      // Wireframe overlay
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.15, transparent: true })
      );
      scene.add(wire);

      // 光照
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dl = new THREE.DirectionalLight(0xffffff, 0.8);
      dl.position.set(5, 10, 7);
      scene.add(dl);
      const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
      dl2.position.set(-5, -5, -5);
      scene.add(dl2);

      camera.position.set(3, 2, 3);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      stateRef.current = { renderer, scene, camera, controls, geo, mat, mesh3, wire };

      const onResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      let frameId = 0;
      const animate = () => {
        frameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // 拍 screenshot
      if (onScreenshot) {
        setTimeout(() => {
          try {
            const dataUrl = renderer.domElement.toDataURL("image/png");
            onScreenshot(dataUrl);
          } catch {}
        }, 500);
      }

      stateRef.current.cleanup = () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener("resize", onResize);
        controls.dispose();
        renderer.dispose();
        geo.dispose();
        mat.dispose();
      };
    })();

    return () => {
      cancelled = true;
      if (stateRef.current.cleanup) stateRef.current.cleanup();
    };
  }, [mesh, onScreenshot]);

  return (
    <div
      ref={containerRef}
      className={className ?? "w-full h-[400px] rounded-lg overflow-hidden"}
      style={{ background: "#02133e" }}
    />
  );
}
