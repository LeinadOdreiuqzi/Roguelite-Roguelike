import { Player } from '../entities/player.js';

class Physics {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;
        this.player = new Player(this.renderer);
        this.keys = { w: false, a: false, s: false, d: false, space: false, c: false, tab: false };
        this.mouse = { x: 0, y: 0 };
        this.collisionsEnabled = true;
        this.initControls();
    }

    initControls() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'w') this.keys.w = true;
            if (event.key === 'a') this.keys.a = true;
            if (event.key === 's') this.keys.s = true;
            if (event.key === 'd') this.keys.d = true;
            if (event.key === ' ') this.keys.space = true;
            if (event.key === 'r') this.player.currentWeapon.reload();
            if (event.key === 'c') {
                this.keys.c = true;
                this.collisionsEnabled = !this.collisionsEnabled;
                console.log("Colisiones:", this.collisionsEnabled ? "Activadas" : "Desactivadas");
            }
            if (event.key === 'Tab') this.keys.tab = true;
            console.log("Tecla presionada:", event.key);
        });
        document.addEventListener('keyup', (event) => {
            if (event.key === 'w') this.keys.w = false;
            if (event.key === 'a') this.keys.a = false;
            if (event.key === 's') this.keys.s = false;
            if (event.key === 'd') this.keys.d = false;
            if (event.key === ' ') this.keys.space = false;
            if (event.key === 'c') this.keys.c = false;
            if (event.key === 'Tab') this.keys.tab = false;
        });

        document.addEventListener('mousemove', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
    }

    update() {
        console.log("Actualizando física");
        let moveX = 0;
        let moveZ = 0;
        if (this.keys.w) moveZ -= 1;
        if (this.keys.s) moveZ += 1;
        if (this.keys.a) moveX -= 1;
        if (this.keys.d) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX = moveX / length;
            moveZ = moveZ / length;

            const newPosition = {
                x: this.player.mesh.position.x + moveX * this.player.speed,
                z: this.player.mesh.position.z + moveZ * this.player.speed
            };

            if (!this.collisionsEnabled || !this.checkCollision(newPosition)) {
                this.player.move({ x: moveX, z: moveZ });
                console.log("Jugador movido a:", this.player.mesh.position);
            } else {
                console.log("Colisión detectada, movimiento bloqueado");
            }
        }

        if (this.keys.space) {
            this.player.shoot(new THREE.Vector2(this.mouse.x, this.mouse.y), this.renderer.camera);
            this.keys.space = false;
            console.log("Disparo realizado");
        }

        this.player.currentWeapon.update();
        this.renderer.updateCamera(this.player.mesh.position);
        if (this.scene) this.scene.update();
    }

    checkCollision(position) {
        if (!this.scene) return false;

        const playerBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(position.x, 0.5, position.z),
            new THREE.Vector3(0.6, 0.8, 0.6) // Tamaño ajustado para pasillos
        );

        for (const room of this.scene.rooms) {
            for (const wall of room.walls) {
                const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                if (playerBox.intersectsBox(wallBox)) {
                    console.log("Colisión con pared en:", wall.mesh.position);
                    return true;
                }
            }
        }

        for (const corridor of this.scene.corridors) {
            if (corridor.walls) {
                for (const wall of corridor.walls) {
                    const wallBox = new THREE.Box3().setFromObject(wall.mesh);
                    if (playerBox.intersectsBox(wallBox)) {
                        console.log("Colisión con pared de pasillo en:", wall.mesh.position);
                        return true;
                    }
                }
            }
        }

        return false;
    }
}

export { Physics };