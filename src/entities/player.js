import { Weapon } from './weapons.js';

class Player {
    constructor(renderer) {
        this.renderer = renderer;
        this.mesh = null;
        this.speed = 0.1;
        this.health = 100;
        this.currentWeapon = new Weapon('pistol', this.renderer);
        this.init();
    }

    init() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(10, 0.5, 10); // Nueva posición inicial fuera del centro
        this.renderer.addToScene(this.mesh);
        console.log("Jugador inicializado en:", this.mesh.position);
    }

    move(direction) {
        this.mesh.position.x += direction.x * this.speed;
        this.mesh.position.z += direction.z * this.speed;
    }

    shoot(mousePosition, camera) {
        this.currentWeapon.shoot(this.mesh.position, mousePosition, camera);
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            window.game.emit('playerDeath');
        }
    }
}

export { Player };