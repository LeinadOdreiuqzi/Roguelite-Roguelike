class Weapon {
    constructor(type, renderer) {
        this.renderer = renderer;
        this.type = type;
        this.lastShot = 0; // Timestamp del último disparo
        this.bullets = []; // Lista de balas activas

        // Configuración por tipo de arma
        this.config = {
            pistol: { fireRate: 500, damage: 10, speed: 0.5, effect: 'standard', magazine: 6, ammo: 6 },
            shotgun: { fireRate: 1000, damage: 20, speed: 0.4, effect: 'spread', magazine: 4, ammo: 4 },
            explosive: { fireRate: 1500, damage: 50, speed: 0.3, effect: 'explosive', magazine: 2, ammo: 2 }
        }[type] || this.config.pistol; // Default a pistola
    }

    shoot(position, mousePosition, camera) {
        const now = Date.now();
        if (now - this.lastShot < this.config.fireRate || this.config.ammo <= 0) return;

        const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.copy(position);

        // Dirección del disparo
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePosition, camera);
        const intersects = raycaster.intersectObject(this.renderer.scene.children.find(obj => obj.geometry instanceof THREE.PlaneGeometry));
        let direction = new THREE.Vector3(0, 0, -1); // Fallback
        if (intersects.length > 0) {
            direction = new THREE.Vector3().subVectors(intersects[0].point, position).normalize();
        }

        bullet.velocity = direction.multiplyScalar(this.config.speed);
        bullet.damage = this.config.damage;
        bullet.effect = this.config.effect;

        this.renderer.addToScene(bullet);
        this.bullets.push(bullet);
        this.lastShot = now;
        this.config.ammo--;
    }

    reload() {
        this.config.ammo = this.config.magazine;
    }

    update() {
        this.bullets.forEach((bullet, index) => {
            bullet.position.add(bullet.velocity);
            if (bullet.position.distanceTo(this.renderer.player.mesh.position) > 50) {
                this.renderer.removeFromScene(bullet);
                this.bullets.splice(index, 1);
            }
        });
    }
}

export { Weapon };