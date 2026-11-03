/**
 * The rotary phone under the fluorescent tube. Rings (shakes) when the Producer calls.
 */
import * as THREE from 'three';
import { psxMaterial } from '../psxMaterial';
import { pickable } from './util';

export class PhoneView {
  readonly group = new THREE.Group();
  private handset = new THREE.Group();
  private dial: THREE.Mesh;
  ringing = false;
  offHook = 0;

  constructor() {
    const g = this.group;
    g.position.set(-1.65, 0.81, 1.95);
    g.rotation.y = Math.PI / 2 - 0.4;
    const black = psxMaterial({ color: 0x1a1414, wrap: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.1, 8), black);
    body.position.y = 0.05;
    body.scale.z = 0.8;
    pickable(body, 'phone');
    g.add(body);
    this.dial = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.012, 10), psxMaterial({ color: 0xd8d0b8 }));
    this.dial.position.set(0, 0.095, 0.07);
    this.dial.rotation.x = 0.6;
    g.add(this.dial);
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), black);
    cradle.position.set(0, 0.11, -0.02);
    g.add(cradle);
    // Handset: two ear cups + bar, merged by hand into one group.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.045), black);
    const cupA = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 6), black);
    cupA.position.set(-0.12, -0.025, 0);
    const cupB = cupA.clone();
    cupB.position.x = 0.12;
    this.handset.add(bar, cupA, cupB);
    this.handset.position.set(0, 0.16, -0.02);
    pickable(bar, 'phone');
    g.add(this.handset);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 3, 10, Math.PI * 1.4), black);
    cord.position.set(-0.15, 0.08, 0.02);
    cord.rotation.y = 1.2;
    g.add(cord);
  }

  update(dt: number, time: number): void {
    if (this.ringing) {
      const burst = Math.sin(time * Math.PI * 1.25) > 0 ? 1 : 0;
      this.handset.position.y = 0.16 + burst * Math.abs(Math.sin(time * 70)) * 0.012;
      this.handset.rotation.z = burst * Math.sin(time * 90) * 0.04;
      this.group.position.x = -1.65 + burst * Math.sin(time * 110) * 0.003;
    } else {
      this.handset.rotation.z *= 0.8;
      this.group.position.x = -1.65;
    }
    // Off the hook: the handset lifts toward the player.
    const t = this.offHook;
    this.handset.position.y = this.ringing ? this.handset.position.y : 0.16 + t * 0.25;
    this.handset.rotation.x = -t * 0.6;
    void dt;
    void this.dial;
  }
}
