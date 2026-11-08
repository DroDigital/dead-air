/** A close-up revolver, built from low-poly geometry to match the studio's handmade props.
 * The group is attached to the camera, so its muzzle always points at the contestant.
 */
import gsap from 'gsap';
import * as THREE from 'three';

export class RevolverView {
  readonly group = new THREE.Group();
  private readonly weapon = new THREE.Group();
  private readonly trigger = new THREE.Group();
  private readonly hammer = new THREE.Group();
  private readonly cylinder = new THREE.Group();
  private readonly muzzleFlash: THREE.Group;

  constructor() {
    const iron = new THREE.MeshBasicMaterial({ color: 0x939087 });
    const edge = new THREE.MeshBasicMaterial({ color: 0xc2b8a5 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x211e1c });
    const wood = new THREE.MeshBasicMaterial({ color: 0x5a3024 });
    const screw = new THREE.MeshBasicMaterial({ color: 0xc6b493 });
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      this.weapon.add(mesh);
      return mesh;
    };
    const cylinder = (r: number, length: number, material: THREE.Material, z: number) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 12), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = z;
      return mesh;
    };
    // Barrel points in +Z, toward the camera. The dark face makes its opening read at a glance.
    this.weapon.add(cylinder(0.115, 0.66, iron, 0.22));
    this.weapon.add(cylinder(0.12, 0.045, edge, 0.55));
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.073, 16), dark);
    bore.position.z = 0.575;
    this.weapon.add(bore);
    box(0.055, 0.045, 0.38, edge, 0, 0.13, 0.24);
    box(0.05, 0.055, 0.06, dark, 0, 0.17, 0.48);
    // Cylinder and its six chambers, visibly separate from the barrel.
    this.cylinder.add(cylinder(0.2, 0.30, iron, -0.24));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.193, 12), edge);
    face.position.z = -0.084;
    this.cylinder.add(face);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), dark);
      hole.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, -0.08);
      this.cylinder.add(hole);
    }
    this.weapon.add(this.cylinder);
    box(0.31, 0.13, 0.6, iron, 0, 0.2, -0.27);
    box(0.31, 0.14, 0.55, iron, 0, -0.2, -0.28);
    box(0.30, 0.40, 0.12, iron, 0, 0, -0.52);
    const grip = box(0.28, 0.55, 0.23, wood, 0, -0.43, -0.48);
    grip.rotation.x = -0.22;
    const cap = box(0.30, 0.06, 0.24, dark, 0, -0.70, -0.54);
    cap.rotation.x = -0.22;
    const pin = new THREE.Mesh(new THREE.CircleGeometry(0.023, 8), screw);
    pin.position.set(0, -0.43, -0.35);
    this.weapon.add(pin);
    // Guard and independently hinged trigger, both visible below the cylinder.
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 14, Math.PI), edge);
    guard.rotation.z = Math.PI;
    guard.position.set(0, -0.24, -0.05);
    this.weapon.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.17, 0.04), dark);
    blade.position.y = -0.07;
    blade.rotation.z = -0.28;
    this.trigger.add(blade);
    this.trigger.position.set(0, -0.23, -0.045);
    this.weapon.add(this.trigger);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.09), edge);
    hammer.position.y = 0.07;
    this.hammer.add(hammer);
    this.hammer.position.set(0, 0.19, -0.56);
    this.weapon.add(this.hammer);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd884, side: THREE.DoubleSide });
    this.muzzleFlash = new THREE.Group();
    for (const a of [0, Math.PI / 4]) {
      const star = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.1), flashMat);
      star.rotation.z = a;
      this.muzzleFlash.add(star);
    }
    this.muzzleFlash.position.z = 0.6;
    this.muzzleFlash.visible = false;
    this.weapon.add(this.muzzleFlash);
    // A slight side view keeps the grip and cylinder readable while the muzzle faces the lens.
    this.weapon.rotation.set(0.05, -0.32, -0.13);
    this.group.add(this.weapon);
    this.group.position.set(0.12, -0.85, -2.0);
    this.group.visible = false;
    // Never pickable: raycasts ignore visibility, so a hidden revolver would block clicks behind it.
    this.group.traverse((o) => { o.raycast = () => {}; });
  }

  raise(duration: number): void {
    gsap.killTweensOf(this.group.position);
    this.group.visible = true;
    this.group.position.set(0.12, -0.85, -2.0);
    this.trigger.rotation.z = 0;
    this.hammer.rotation.x = 0;
    this.muzzleFlash.visible = false;
    gsap.to(this.group.position, { y: 0.14, duration, ease: 'power2.out' });
    gsap.to(this.cylinder.rotation, { z: this.cylinder.rotation.z + Math.PI / 3, duration: duration * 0.7, ease: 'power2.out' });
    gsap.to(this.hammer.rotation, { x: -0.5, duration, ease: 'power2.out' });
  }

  fire(hit: boolean, reducedFlashing: boolean): void {
    gsap.to(this.trigger.rotation, { z: 0.38, duration: 0.12 });
    gsap.to(this.hammer.rotation, { x: 0.3, duration: 0.08 });
    if (hit) {
      if (!reducedFlashing) {
        this.muzzleFlash.visible = true;
        gsap.delayedCall(0.08, () => { this.muzzleFlash.visible = false; });
      }
      gsap.to(this.weapon.rotation, { x: -0.18, duration: 0.07, yoyo: true, repeat: 1 });
    }
  }

  lower(duration: number): void {
    gsap.to(this.group.position, { y: -0.85, duration, ease: 'power2.in', onComplete: () => { this.group.visible = false; } });
  }

  reset(): void {
    gsap.killTweensOf(this.group.position);
    this.group.visible = false;
    this.muzzleFlash.visible = false;
  }
}
